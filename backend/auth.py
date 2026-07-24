import bcrypt
import os
import json
import re
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")
DASHBOARD_DB_KIND = "postgres"


def _postgres_placeholders(sql):
    return str(sql).replace("?", "%s")


class _PostgresCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, sql, params=None):
        self._cursor.execute(_postgres_placeholders(sql), params or ())
        return self

    def executemany(self, sql, params):
        self._cursor.executemany(_postgres_placeholders(sql), params)
        return self

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class _PostgresConnection:
    def __init__(self, connection):
        self._connection = connection

    def cursor(self):
        return _PostgresCursor(self._connection.cursor())

    def __getattr__(self, name):
        return getattr(self._connection, name)


def connect_dashboard_db():
    try:
        import psycopg2
    except ImportError as exc:
        raise RuntimeError(
            "Driver PostgreSQL belum terpasang; jalankan pip install -r requirements.txt"
        ) from exc

    database_url = os.getenv("DASHBOARD_DATABASE_URL", "").strip()
    if database_url:
        connection = psycopg2.connect(database_url)
    else:
        required = ("APP_DB_HOST", "APP_DB_NAME", "APP_DB_USER")
        missing = [key for key in required if not os.getenv(key, "").strip()]
        if missing:
            raise RuntimeError(
                "Konfigurasi PostgreSQL dashboard belum lengkap: " + ", ".join(missing)
            )
        connection = psycopg2.connect(
            host=os.environ["APP_DB_HOST"],
            port=int(os.getenv("APP_DB_PORT", "5432")),
            dbname=os.environ["APP_DB_NAME"],
            user=os.environ["APP_DB_USER"],
            password=os.getenv("APP_DB_PASSWORD", ""),
            connect_timeout=int(os.getenv("APP_DB_CONNECT_TIMEOUT", "5")),
        )
    return _PostgresConnection(connection)


def _load_env_file():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()
DASHBOARD_DATABASE_URL = os.getenv("DASHBOARD_DATABASE_URL", "").strip()
APP_DB_ENGINE = os.getenv("APP_DB_ENGINE", "").strip().lower()
DASHBOARD_DB_KIND = "postgres" if DASHBOARD_DATABASE_URL or APP_DB_ENGINE == "postgres" else "sqlite"


def _require_psycopg2():
    try:
        import psycopg2
    except ImportError as exc:
        raise RuntimeError(
            "DASHBOARD_DATABASE_URL sudah diset, tapi dependency psycopg2-binary belum terinstall."
        ) from exc
    return psycopg2


def get_dashboard_pg_connect_kwargs():
    if DASHBOARD_DATABASE_URL:
        return {"dsn": DASHBOARD_DATABASE_URL}
    return {
        "host": os.getenv("APP_DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("APP_DB_PORT", "5432")),
        "dbname": os.getenv("APP_DB_NAME", "easy_dashboard_gte"),
        "user": os.getenv("APP_DB_USER", "postgres"),
        "password": os.getenv("APP_DB_PASSWORD", ""),
    }


def _pg_sql(sql):
    sql = sql.replace("?", "%s")
    match = re.match(
        r"^(\s*)INSERT\s+OR\s+IGNORE\s+INTO\s+(.+?)\s+VALUES\s*(\(.+\))\s*$",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if match:
        indent, head, values = match.groups()
        return f"{indent}INSERT INTO {head} VALUES {values} ON CONFLICT DO NOTHING"
    return sql


class DashboardCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def execute(self, sql, params=None):
        if DASHBOARD_DB_KIND == "postgres":
            sql = _pg_sql(sql)
        return self.cursor.execute(sql, params or [])

    def executemany(self, sql, seq_of_params):
        if DASHBOARD_DB_KIND == "postgres":
            sql = _pg_sql(sql)
        return self.cursor.executemany(sql, seq_of_params)

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()


class DashboardConnection:
    def __init__(self, connection):
        self.connection = connection

    def cursor(self):
        return DashboardCursor(self.connection.cursor())

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()


def connect_dashboard_db():
    if DASHBOARD_DB_KIND == "postgres":
        psycopg2 = _require_psycopg2()
        kwargs = get_dashboard_pg_connect_kwargs()
        if "dsn" in kwargs:
            return DashboardConnection(psycopg2.connect(kwargs["dsn"]))
        return DashboardConnection(psycopg2.connect(**kwargs))
    return DashboardConnection(sqlite3.connect(DB_PATH))


def _integrity_error_types():
    errors = [sqlite3.IntegrityError]
    if DASHBOARD_DB_KIND == "postgres":
        errors.append(_require_psycopg2().IntegrityError)
    return tuple(errors)


def _table_columns(cur, table_name):
    if DASHBOARD_DB_KIND == "postgres":
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?
        """, (table_name,))
        return {row[0] for row in cur.fetchall()}
    cur.execute(f"PRAGMA table_info({table_name})")
    return {row[1] for row in cur.fetchall()}


def _create_tables(cur):
    if DASHBOARD_DB_KIND == "postgres":
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'viewer'
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id SERIAL PRIMARY KEY,
                role TEXT NOT NULL,
                module TEXT NOT NULL,
                UNIQUE(role, module)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS role_column_permissions (
                id SERIAL PRIMARY KEY,
                role TEXT NOT NULL,
                module TEXT NOT NULL,
                column_key TEXT NOT NULL,
                UNIQUE(role, module, column_key)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS barang_baru_log (
                id SERIAL PRIMARY KEY,
                itemid INTEGER UNIQUE NOT NULL,
                itemno TEXT NOT NULL,
                description TEXT,
                description2 TEXT,
                unit TEXT,
                type TEXT,
                created_by TEXT,
                created_at TEXT NOT NULL
            )
        """)
        return

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            module TEXT NOT NULL,
            UNIQUE(role, module)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS role_column_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            module TEXT NOT NULL,
            column_key TEXT NOT NULL,
            UNIQUE(role, module, column_key)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS barang_baru_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemid INTEGER UNIQUE NOT NULL,
            itemno TEXT NOT NULL,
            description TEXT,
            description2 TEXT,
            unit TEXT,
            type TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL
        )
    """)

def ensure_audit_table(cur):
    id_type = "SERIAL" if DASHBOARD_DB_KIND == "postgres" else "INTEGER"
    autoincrement = "" if DASHBOARD_DB_KIND == "postgres" else " AUTOINCREMENT"
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id {id_type} PRIMARY KEY{autoincrement},
            username TEXT,
            name TEXT,
            role TEXT,
            action TEXT NOT NULL,
            module TEXT,
            description TEXT,
            metadata TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL
        )
    """)

def init_db():
    con = connect_dashboard_db()
    cur = con.cursor()

    _create_tables(cur)
    barang_baru_columns = _table_columns(cur, "barang_baru_log")
    if "created_by" not in barang_baru_columns:
        cur.execute("ALTER TABLE barang_baru_log ADD COLUMN created_by TEXT")

    ensure_audit_table(cur)

    # ── Permission Matrix ──────────────────────────────────────────────────
    # admin     → semua modul
    # inventory → dashboard, stock, barang-baru, riwayat
    # purchasing→ dashboard, stock, pembelian
    # marketing → dashboard, stock, penjualan
    # produksi  → dashboard, stock, spk
    # ppc       → dashboard, stock, spk
    roles = [
        ("admin",      "dashboard"), ("admin",      "stock"), ("admin", "gudang"),
        ("admin",      "barang-baru"), ("admin",    "riwayat"),
        ("admin",      "pembelian"), ("admin",      "pembelian_pemasok"), ("admin", "pembelian_pemasok_edit"),
        ("admin",      "pembelian_permintaan"),
        ("admin",      "pembelian_pembelian"), ("admin", "pembelian_penerimaan"),
        ("admin",      "pembelian_fpb"), ("admin", "penjualan"),
        ("admin",      "penjualan_penjualan"), ("admin", "penjualan_pengiriman"),
        ("admin",      "penjualan_invoice"), ("admin", "users"),
        ("admin",      "spk"), ("admin", "spk_spk"),
        ("admin",      "spk_monitoring"), ("admin", "spk_formula"),
        ("admin",      "spk_monitoring_formula"), ("admin", "spk_spm"),
        ("admin",      "spk_gp"), ("admin", "spk_biaya_produksi"),
        ("admin",      "spk_standarisasi_harga"), ("admin", "spk_fifo"),
        ("admin",      "akuntansi"), ("admin", "audit"),

        # Semua modul operasional; Administrasi (users dan audit) dikecualikan.
        ("akutansi",   "dashboard"), ("akutansi", "stock"), ("akutansi", "gudang"),
        ("akutansi",   "barang-baru"), ("akutansi", "riwayat"),
        ("akutansi",   "siinas"),
        ("akutansi",   "pembelian"), ("akutansi", "pembelian_pemasok"), ("akutansi", "pembelian_permintaan"),
        ("akutansi",   "pembelian_pembelian"), ("akutansi", "pembelian_penerimaan"),
        ("akutansi",   "pembelian_fpb"),
        ("akutansi",   "penjualan"), ("akutansi", "penjualan_penjualan"),
        ("akutansi",   "penjualan_pengiriman"), ("akutansi", "penjualan_invoice"),
        ("akutansi",   "spk"), ("akutansi", "spk_spk"),
        ("akutansi",   "spk_monitoring"), ("akutansi", "spk_formula"),
        ("akutansi",   "spk_monitoring_formula"), ("akutansi", "spk_spm"),
        ("akutansi",   "spk_gp"), ("akutansi", "spk_biaya_produksi"),
        ("akutansi",   "spk_standarisasi_harga"), ("akutansi", "spk_fifo"),
        ("akutansi",   "akuntansi"),

        ("inventory",  "dashboard"), ("inventory",  "stock"), ("inventory", "gudang"),
        ("inventory",  "barang-baru"), ("inventory","riwayat"),
        ("inventory",  "spk"), ("inventory", "spk_spk"),
        ("inventory",  "spk_formula"), ("inventory", "spk_spm"),
        ("inventory",  "spk_gp"), ("inventory", "pembelian"), ("inventory", "pembelian_pemasok"),
        ("inventory",  "pembelian_permintaan"), ("inventory", "pembelian_penerimaan"),
        ("inventory",  "penjualan"), ("inventory", "penjualan_pengiriman"),

        ("purchasing", "dashboard"), ("purchasing", "stock"), ("purchasing", "gudang"),
        ("purchasing", "pembelian"), ("purchasing", "pembelian_pemasok"), ("purchasing", "pembelian_permintaan"),
        ("purchasing", "pembelian_pembelian"), ("purchasing", "pembelian_penerimaan"),
        ("purchasing", "pembelian_fpb"),

        ("marketing",  "dashboard"), ("marketing",  "stock"), ("marketing", "gudang"),
        ("marketing",  "penjualan"), ("marketing", "penjualan_penjualan"),
        ("marketing",  "spk"), ("marketing", "spk_formula"),

        ("produksi",   "dashboard"), ("produksi",   "stock"), ("produksi", "gudang"),
        ("produksi",   "spk"), ("produksi", "spk_spk"),
        ("produksi",   "spk_monitoring"), ("produksi", "spk_formula"),
        ("produksi",   "spk_monitoring_formula"), ("produksi", "spk_spm"),
        ("produksi",   "spk_gp"), ("produksi", "spk_biaya_produksi"),
        ("produksi",   "spk_standarisasi_harga"), ("produksi", "spk_fifo"),

        ("ppc",        "dashboard"), ("ppc",        "stock"), ("ppc", "gudang"),
        ("ppc",        "spk"), ("ppc", "spk_spk"),
        ("ppc",        "spk_monitoring"), ("ppc", "spk_formula"),
        ("ppc",        "spk_monitoring_formula"), ("ppc", "spk_spm"),
        ("ppc",        "spk_gp"), ("ppc", "spk_biaya_produksi"),
        ("ppc",        "spk_standarisasi_harga"), ("ppc", "spk_fifo"),
    ]

    # INSERT OR IGNORE = idempotent, aman dijalankan berulang kali
    cur.executemany("INSERT OR IGNORE INTO roles (role, module) VALUES (?, ?)", roles)

    cur.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'")
    if cur.fetchone()[0] == 0:
        hashed = bcrypt.hashpw("admin123".encode(), bcrypt.gensalt()).decode()
        cur.execute(
            "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
            ("admin", hashed, "Administrator", "admin")
        )

    con.commit()
    con.close()
    print(f"Database user siap! ({DASHBOARD_DB_KIND})")


def get_user(username):
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("SELECT id, username, password, name, role FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    con.close()
    if row:
        return {"id": row[0], "username": row[1], "password": row[2], "name": row[3], "role": row[4]}
    return None

def get_user_permissions(role):
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("SELECT module FROM roles WHERE role = ?", (role,))
    rows = cur.fetchall()
    con.close()
    return [r[0] for r in rows]

def get_all_users():
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("SELECT id, username, name, role FROM users ORDER BY id")
    rows = cur.fetchall()
    con.close()
    return [{"id": r[0], "username": r[1], "name": r[2], "role": r[3]} for r in rows]

def get_user_by_id(user_id):
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("SELECT id, username, name, role FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    con.close()
    if row:
        return {"id": row[0], "username": row[1], "name": row[2], "role": row[3]}
    return None

def get_all_roles():
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("SELECT DISTINCT role FROM roles ORDER BY role")
    all_roles = [r[0] for r in cur.fetchall()]
    result = {}
    for role in all_roles:
        cur.execute("SELECT module FROM roles WHERE role = ? ORDER BY module", (role,))
        result[role] = [r[0] for r in cur.fetchall()]
    con.close()
    return result

def get_all_column_permissions():
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("""
        SELECT role, module, column_key
        FROM role_column_permissions
        ORDER BY role, module, column_key
    """)
    result = {}
    for role, module, column_key in cur.fetchall():
        result.setdefault(role, {}).setdefault(module, []).append(column_key)
    con.close()
    return result

def get_user_column_permissions(role):
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("""
        SELECT module, column_key
        FROM role_column_permissions
        WHERE role = ?
        ORDER BY module, column_key
    """, (role,))
    result = {}
    for module, column_key in cur.fetchall():
        result.setdefault(module, []).append(column_key)
    con.close()
    return result

def upsert_role(role, modules, column_permissions=None):
    role = (role or "").strip().lower()
    clean_modules = sorted({(m or "").strip() for m in modules or [] if (m or "").strip()})
    module_parents = {
        "pembelian_pemasok": "pembelian",
        "pembelian_pemasok_edit": "pembelian",
        "pembelian_permintaan": "pembelian",
        "pembelian_pembelian": "pembelian",
        "pembelian_penerimaan": "pembelian",
        "pembelian_fpb": "pembelian",
        "penjualan_penjualan": "penjualan",
        "penjualan_pengiriman": "penjualan",
        "penjualan_invoice": "penjualan",
        "spk_spk": "spk",
        "spk_monitoring": "spk",
        "spk_formula": "spk",
        "spk_monitoring_formula": "spk",
        "spk_spm": "spk",
        "spk_gp": "spk",
        "spk_biaya_produksi": "spk",
        "spk_standarisasi_harga": "spk",
        "spk_fifo": "spk",
    }
    clean_modules = sorted(set(clean_modules) | {module_parents[m] for m in clean_modules if m in module_parents})
    if not role:
        return False, "Nama role wajib diisi"

    con = connect_dashboard_db()
    cur = con.cursor()
    try:
        cur.execute("DELETE FROM roles WHERE role = ?", (role,))
        cur.executemany(
            "INSERT OR IGNORE INTO roles (role, module) VALUES (?, ?)",
            [(role, module) for module in clean_modules]
        )
        if column_permissions is not None:
            cur.execute("DELETE FROM role_column_permissions WHERE role = ?", (role,))
            rows = []
            for module, columns in (column_permissions or {}).items():
                if module not in clean_modules:
                    continue
                for column_key in columns or []:
                    column_key = (column_key or "").strip()
                    if column_key:
                        rows.append((role, module, column_key))
            cur.executemany(
                "INSERT OR IGNORE INTO role_column_permissions (role, module, column_key) VALUES (?, ?, ?)",
                rows
            )
        con.commit()
        return True, "Role berhasil disimpan"
    finally:
        con.close()

def delete_role(role):
    role = (role or "").strip().lower()
    if role == "admin":
        return False, "Role admin tidak dapat dihapus"

    con = connect_dashboard_db()
    cur = con.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM users WHERE role = ?", (role,))
        if int(cur.fetchone()[0] or 0) > 0:
            return False, "Role masih dipakai user"

        cur.execute("DELETE FROM roles WHERE role = ?", (role,))
        cur.execute("DELETE FROM role_column_permissions WHERE role = ?", (role,))
        deleted = cur.rowcount
        con.commit()
        return deleted > 0, "Role berhasil dihapus" if deleted else "Role tidak ditemukan"
    finally:
        con.close()

def create_user(username, password, name, role):
    con = connect_dashboard_db()
    cur = con.cursor()
    try:
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cur.execute(
            "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
            (username, hashed, name, role)
        )
        con.commit()
        return True, "User berhasil dibuat"
    except _integrity_error_types():
        con.rollback()
        return False, "Username sudah dipakai"
    finally:
        con.close()

def update_user_password(user_id, password):
    if not password or len(password) < 6:
        return False, "Password minimal 6 karakter"

    con = connect_dashboard_db()
    cur = con.cursor()
    try:
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cur.execute("UPDATE users SET password = ? WHERE id = ?", (hashed, user_id))
        con.commit()
        if cur.rowcount == 0:
            return False, "User tidak ditemukan"
        return True, "Password berhasil diganti"
    finally:
        con.close()

def delete_user(user_id):
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("DELETE FROM users WHERE id = ? AND username != 'admin'", (user_id,))
    deleted = cur.rowcount
    con.commit()
    con.close()
    return deleted > 0

def log_activity(username=None, name=None, role=None, action="", module=None,
                 description=None, metadata=None, ip_address=None, user_agent=None):
    con = connect_dashboard_db()
    cur = con.cursor()
    try:
      ensure_audit_table(cur)
      cur.execute("""
          INSERT INTO audit_logs
          (username, name, role, action, module, description, metadata, ip_address, user_agent, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """, (
          username, name, role, action, module, description,
          json.dumps(metadata or {}, ensure_ascii=False),
          ip_address, user_agent, datetime.now().strftime("%Y-%m-%d %H:%M:%S")
      ))
      con.commit()
    except Exception as e:
      print(f"Error log_activity: {e}")
    finally:
      con.close()

def get_audit_logs(search="", action="", module="", date_from=None, date_to=None, limit=100, offset=0):
    con = connect_dashboard_db()
    cur = con.cursor()
    ensure_audit_table(cur)
    conditions = ["1=1"]
    params = []

    if search:
        conditions.append("""(
            LOWER(username) LIKE LOWER(?)
            OR LOWER(name) LIKE LOWER(?)
            OR LOWER(description) LIKE LOWER(?)
        )""")
        term = f"%{search}%"
        params += [term, term, term]
    if action:
        conditions.append("action = ?")
        params.append(action)
    if module:
        conditions.append("module = ?")
        params.append(module)
    if date_from:
        conditions.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("created_at <= ?")
        params.append(date_to + " 23:59:59")

    where = " AND ".join(conditions)
    cur.execute(f"SELECT COUNT(*) FROM audit_logs WHERE {where}", params)
    total = int(cur.fetchone()[0] or 0)
    cur.execute(f"""
        SELECT id, username, name, role, action, module, description, metadata,
               ip_address, user_agent, created_at
        FROM audit_logs
        WHERE {where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])
    rows = cur.fetchall()
    con.close()
    return {
        "total": total,
        "data": [{
            "id": r[0],
            "username": r[1],
            "name": r[2],
            "role": r[3],
            "action": r[4],
            "module": r[5],
            "description": r[6],
            "metadata": json.loads(r[7] or "{}"),
            "ip_address": r[8],
            "user_agent": r[9],
            "created_at": r[10],
        } for r in rows]
    }

def verify_password(plain, hashed):
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ─── BARANG BARU LOG ─────────────────────────────────────────────────────────

def save_barang_baru(item):
    con = connect_dashboard_db()
    cur = con.cursor()
    try:
        cur.execute("""
            INSERT OR IGNORE INTO barang_baru_log
            (itemid, itemno, description, description2, unit, type, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["itemid"], item["itemno"], item["description"],
            item["description2"], item["unit"], item.get("type", ""),
            item.get("created_by", ""), item["created_at"]
        ))
        if item.get("created_by"):
            cur.execute("""
                UPDATE barang_baru_log
                SET created_by = ?
                WHERE itemid = ?
                  AND (created_by IS NULL OR TRIM(created_by) = '')
            """, (item.get("created_by", ""), item["itemid"]))
        con.commit()
    except Exception as e:
        print(f"Error save_barang_baru: {e}")
    finally:
        con.close()

def get_barang_baru_log(date_from=None, date_to=None):
    con = connect_dashboard_db()
    cur = con.cursor()
    conditions = ["1=1"]
    params = []
    if date_from:
        conditions.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("created_at <= ?")
        params.append(date_to + " 23:59:59")
    where = " AND ".join(conditions)
    cur.execute(f"""
        SELECT itemid, itemno, description, description2, unit, type, created_by, created_at
        FROM barang_baru_log WHERE {where} ORDER BY created_at DESC
    """, params)
    rows = cur.fetchall()
    con.close()
    return [{
        "itemid": r[0], "itemno": r[1], "description": r[2],
        "description2": r[3], "unit": r[4], "type": r[5],
        "created_by": r[6], "created_at": r[7]
    } for r in rows]

def get_max_logged_itemid():
    con = connect_dashboard_db()
    cur = con.cursor()
    cur.execute("SELECT MAX(itemid) FROM barang_baru_log")
    row = cur.fetchone()
    con.close()
    return int(row[0] or 0)
