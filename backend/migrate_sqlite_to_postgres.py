import argparse
import os
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_PATH = BASE_DIR / "users.db"
TABLES = {
    "users": ["id", "username", "password", "name", "role"],
    "roles": ["id", "role", "module"],
    "role_column_permissions": ["id", "role", "module", "column_key"],
    "audit_logs": [
        "id", "username", "name", "role", "action", "module", "description",
        "metadata", "ip_address", "user_agent", "created_at",
    ],
    "barang_baru_log": [
        "id", "itemid", "itemno", "description", "description2", "unit",
        "type", "created_by", "created_at",
    ],
}

PLACEHOLDER_VALUES = {"user", "username", "password", "pass", "host", "dbname", "database"}


def load_env_file(path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def validate_database_url(database_url):
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgresql", "postgres"}:
        return "DASHBOARD_DATABASE_URL harus diawali postgresql:// atau postgres://"
    if not parsed.hostname:
        return "DASHBOARD_DATABASE_URL belum punya host PostgreSQL."
    if not parsed.username:
        return "DASHBOARD_DATABASE_URL belum punya username PostgreSQL."
    if not parsed.path or parsed.path == "/":
        return "DASHBOARD_DATABASE_URL belum punya nama database."

    database_name = parsed.path.lstrip("/")
    placeholder_parts = {
        parsed.username,
        parsed.password or "",
        parsed.hostname,
        database_name,
    }
    if any(part.lower() in PLACEHOLDER_VALUES for part in placeholder_parts):
        return (
            "DASHBOARD_DATABASE_URL masih berisi placeholder. Ganti user, password, "
            "host, dan dbname dengan data PostgreSQL yang asli."
        )
    return ""


def app_db_enabled():
    return os.getenv("APP_DB_ENGINE", "").strip().lower() == "postgres"


def validate_app_db_config():
    required = ["APP_DB_HOST", "APP_DB_PORT", "APP_DB_NAME", "APP_DB_USER"]
    missing = [name for name in required if not os.getenv(name, "").strip()]
    if missing:
        return f"Konfigurasi PostgreSQL belum lengkap: {', '.join(missing)}"
    return ""


def connect_postgres(psycopg2, database_url):
    if database_url:
        return psycopg2.connect(database_url)
    return psycopg2.connect(
        host=os.getenv("APP_DB_HOST", "127.0.0.1"),
        port=int(os.getenv("APP_DB_PORT", "5432")),
        dbname=os.getenv("APP_DB_NAME", "easy_dashboard_gte"),
        user=os.getenv("APP_DB_USER", "postgres"),
        password=os.getenv("APP_DB_PASSWORD", ""),
    )


def sqlite_table_columns(con, table_name):
    rows = con.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def fetch_rows(sqlite_con, table_name, columns):
    existing_columns = sqlite_table_columns(sqlite_con, table_name)
    if not existing_columns:
        return []
    selected_columns = [column for column in columns if column in existing_columns]
    sql = f"SELECT {', '.join(selected_columns)} FROM {table_name} ORDER BY id"
    rows = sqlite_con.execute(sql).fetchall()
    return [dict(zip(selected_columns, row)) for row in rows]


def reset_target(pg_con):
    with pg_con.cursor() as cur:
        cur.execute("""
            TRUNCATE TABLE
                role_column_permissions,
                roles,
                audit_logs,
                barang_baru_log,
                users
            RESTART IDENTITY
        """)


def insert_rows(pg_con, table_name, columns, rows):
    if not rows:
        return 0

    placeholders = ", ".join(["%s"] * len(columns))
    sql = f"""
        INSERT INTO {table_name} ({', '.join(columns)})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING
    """
    values = [
        [row.get(column) for column in columns]
        for row in rows
    ]
    with pg_con.cursor() as cur:
        cur.executemany(sql, values)
    return len(values)


def reset_sequences(pg_con):
    with pg_con.cursor() as cur:
        for table_name in TABLES:
            cur.execute(
                """
                SELECT setval(
                    pg_get_serial_sequence(%s, 'id'),
                    COALESCE((SELECT MAX(id) FROM {table_name}), 0) + 1,
                    false
                )
                """.format(table_name=table_name),
                (table_name,),
            )


def main():
    parser = argparse.ArgumentParser(
        description="Migrasi database dashboard dari SQLite users.db ke PostgreSQL."
    )
    parser.add_argument(
        "--sqlite",
        default=str(DEFAULT_SQLITE_PATH),
        help="Path SQLite users.db sumber. Default: backend/users.db",
    )
    parser.add_argument(
        "--database-url",
        default="",
        help="PostgreSQL URL target. Jika kosong, pakai DASHBOARD_DATABASE_URL.",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Jangan truncate target; insert data yang belum ada saja.",
    )
    args = parser.parse_args()

    load_env_file(BASE_DIR / ".env")
    database_url = args.database_url or os.getenv("DASHBOARD_DATABASE_URL", "").strip()
    sqlite_path = Path(args.sqlite)

    if not database_url and not app_db_enabled():
        print(
            "Set DASHBOARD_DATABASE_URL atau gunakan APP_DB_ENGINE=postgres "
            "dengan APP_DB_HOST/APP_DB_PORT/APP_DB_NAME/APP_DB_USER/APP_DB_PASSWORD.",
            file=sys.stderr,
        )
        return 2
    validation_error = validate_database_url(database_url) if database_url else validate_app_db_config()
    if validation_error:
        print(validation_error, file=sys.stderr)
        if database_url:
            print(
                "Contoh: postgresql://dashboard_user:password_aman@127.0.0.1:5432/easy_dashboard",
                file=sys.stderr,
            )
            print(
                "Jika password berisi karakter khusus seperti @ atau #, encode dulu. "
                "Contoh @ menjadi %40.",
                file=sys.stderr,
            )
        return 2
    if not sqlite_path.exists():
        print(f"SQLite source tidak ditemukan: {sqlite_path}", file=sys.stderr)
        return 2

    if database_url:
        os.environ["DASHBOARD_DATABASE_URL"] = database_url

    try:
        import psycopg2
    except ImportError:
        print("Install dependency dulu: pip install -r requirements.txt", file=sys.stderr)
        return 2

    from auth import init_db

    init_db()
    sqlite_con = sqlite3.connect(sqlite_path)
    pg_con = connect_postgres(psycopg2, database_url)

    try:
        if not args.merge:
            reset_target(pg_con)

        totals = {}
        for table_name, columns in TABLES.items():
            rows = fetch_rows(sqlite_con, table_name, columns)
            totals[table_name] = insert_rows(pg_con, table_name, columns, rows)

        reset_sequences(pg_con)
        pg_con.commit()
    except Exception:
        pg_con.rollback()
        raise
    finally:
        sqlite_con.close()
        pg_con.close()

    for table_name, total in totals.items():
        print(f"{table_name}: {total} row diproses")
    print("Migrasi dashboard SQLite ke PostgreSQL selesai.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
