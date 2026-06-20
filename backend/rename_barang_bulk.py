"""
Bulk rename kode barang Easy Accounting.

PERINGATAN:
    - Script ini langsung mengubah database Easy Accounting saat MODE = "rename".
    - Tutup Easy Accounting dan buat backup database sebelum rename.
    - Jalankan MODE = "preview" dulu untuk melihat tabel mana saja yang kena.
    - Rename hanya mengubah master ITEM.ITEMNO.
    - Jika database Easy punya ON UPDATE CASCADE, transaksi ikut berubah otomatis.
    - Jika tidak ada cascade, database akan menolak rename dan script rollback per barang.

Cara pakai cepat:
    1. Isi ITEM_UPDATES atau RENAME_MAP.
    2. Pastikan MODE = "preview", lalu jalankan script.
    3. Kalau hasil preview sudah benar, ubah MODE = "rename".
    4. Jalankan lagi dan ketik RENAME saat diminta konfirmasi.

Contoh edit master barang:
    ITEM_UPDATES = [
        {
            "old_itemno": "GTE2700-X",
            "new_itemno": "GTE2700-NEW",  # optional, kosongkan kalau tidak rename kode
            "ITEMDESCRIPTION": "Deskripsi 1 baru",
            "ITEMDESCRIPTION2": "Deskripsi 2 baru",
            "ITEMRESERVED1": "Kolom tambahan",
        },
    ]

Opsional:
    - Bisa pakai CSV_FILE dengan format:
        old_itemno,new_itemno,ITEMDESCRIPTION,ITEMDESCRIPTION2,ITEMRESERVED1
        ABCD,DCBA,Deskripsi baru,Deskripsi 2 baru,Kolom tambahan
"""

import csv
import fdb


fdb.load_api("C:/Program Files/Firebird/Firebird_3_0/fbclient.dll")

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 3999,
    "database": "D:/EASY/GTE.EASY6",
    "user": "SYSDBA",
    "password": "NewPassword123",
}


# "preview" = hanya cek, tidak mengubah database.
# "rename"  = benar-benar update master ITEM.
MODE = "preview"

# Format lama tetap bisa dipakai kalau hanya rename kode barang.
RENAME_MAP = [
    # ("ABCD", "DCBA"),
]

# Format baru: bisa rename kode barang dan/atau update field master ITEM lain.
# Kolom yang boleh diupdate adalah kolom yang benar-benar ada di tabel ITEM,
# kecuali kolom protected seperti ITEMID.
ITEM_UPDATES = [
    # {
    #     "old_itemno": "ABCD",
    #     "new_itemno": "DCBA",
    #     "ITEMDESCRIPTION": "Deskripsi 1 baru",
    #     "ITEMDESCRIPTION2": "Deskripsi 2 baru",
    # },
]

# Kalau ingin baca dari CSV, isi nama file. Kosongkan kalau pakai RENAME_MAP.
CSV_FILE = ""

# Kolom yang dianggap menyimpan kode barang untuk kebutuhan preview saja.
ITEM_CODE_COLUMNS = {
    "ITEMNO",
    "RITEMNO",
    "MATERIALNO",
}

# Kolom ini tidak boleh diupdate manual lewat script.
PROTECTED_ITEM_COLUMNS = {
    "ITEMID",
}

# Tabel sistem Firebird dan tabel audit aplikasi tidak perlu disentuh.
SKIP_TABLES = {
    "RDB$DATABASE",
    "MON$ATTACHMENTS",
    "MON$CALL_STACK",
    "MON$CONTEXT_VARIABLES",
    "MON$DATABASE",
    "MON$IO_STATS",
    "MON$MEMORY_USAGE",
    "MON$RECORD_STATS",
    "MON$STATEMENTS",
    "MON$TABLE_STATS",
    "MON$TRANSACTIONS",
}


def qname(name):
    return '"' + str(name).replace('"', '""') + '"'


def load_mapping():
    ignored_csv_columns = {"old_itemno", "new_itemno"}
    if CSV_FILE.strip():
        with open(CSV_FILE, newline="", encoding="utf-8-sig") as csv_file:
            reader = csv.DictReader(csv_file)
            rows = []
            for row in reader:
                old_itemno = (row.get("old_itemno") or "").strip()
                new_itemno = (row.get("new_itemno") or "").strip()
                updates = {
                    str(key or "").strip().upper(): str(value).strip()
                    for key, value in row.items()
                    if key and key.strip() not in ignored_csv_columns and str(value or "").strip() != ""
                }
                if old_itemno or new_itemno or updates:
                    rows.append({
                        "old_itemno": old_itemno,
                        "new_itemno": new_itemno,
                        "updates": updates,
                    })
            return rows

    rows = []
    for entry in ITEM_UPDATES:
        old_itemno = str(entry.get("old_itemno") or entry.get("itemno") or "").strip()
        new_itemno = str(entry.get("new_itemno") or "").strip()
        updates = {
            str(key).strip().upper(): str(value).strip()
            for key, value in entry.items()
            if key not in {"old_itemno", "itemno", "new_itemno"} and str(value or "").strip() != ""
        }
        rows.append({"old_itemno": old_itemno, "new_itemno": new_itemno, "updates": updates})

    for entry in RENAME_MAP:
        if isinstance(entry, dict):
            old_itemno = str(entry.get("old_itemno") or entry.get("itemno") or "").strip()
            new_itemno = str(entry.get("new_itemno") or "").strip()
            updates = {
                str(key).strip().upper(): str(value).strip()
                for key, value in entry.items()
                if key not in {"old_itemno", "itemno", "new_itemno"} and str(value or "").strip() != ""
            }
        else:
            old_itemno = str(entry[0] if len(entry) > 0 else "").strip()
            new_itemno = str(entry[1] if len(entry) > 1 else "").strip()
            updates = dict(entry[2]) if len(entry) > 2 and isinstance(entry[2], dict) else {}
            updates = {str(key).strip().upper(): str(value).strip() for key, value in updates.items() if str(value or "").strip() != ""}
        rows.append({"old_itemno": old_itemno, "new_itemno": new_itemno, "updates": updates})

    return rows


def get_item_code_columns(cur):
    placeholders = ",".join("?" for _ in ITEM_CODE_COLUMNS)
    cur.execute(f"""
        SELECT
            TRIM(rf.RDB$RELATION_NAME) AS TABLE_NAME,
            TRIM(rf.RDB$FIELD_NAME) AS COLUMN_NAME
        FROM RDB$RELATION_FIELDS rf
        JOIN RDB$RELATIONS r ON r.RDB$RELATION_NAME = rf.RDB$RELATION_NAME
        WHERE COALESCE(r.RDB$SYSTEM_FLAG, 0) = 0
          AND TRIM(rf.RDB$FIELD_NAME) IN ({placeholders})
        ORDER BY
            CASE WHEN TRIM(rf.RDB$RELATION_NAME) = 'ITEM' THEN 1 ELSE 0 END,
            TRIM(rf.RDB$RELATION_NAME),
            TRIM(rf.RDB$FIELD_NAME)
    """, list(ITEM_CODE_COLUMNS))
    return [
        (str(table or "").strip(), str(column or "").strip())
        for table, column in cur.fetchall()
        if str(table or "").strip() not in SKIP_TABLES
    ]


def item_exists(cur, itemno):
    cur.execute("SELECT COUNT(*) FROM ITEM WHERE ITEMNO = ?", (itemno,))
    return int(cur.fetchone()[0] or 0) > 0


def get_item_description(cur, itemno):
    cur.execute("SELECT ITEMDESCRIPTION FROM ITEM WHERE ITEMNO = ?", (itemno,))
    row = cur.fetchone()
    return str(row[0] or "").strip() if row else ""


def get_table_columns(cur, table):
    cur.execute("""
        SELECT TRIM(RDB$FIELD_NAME)
        FROM RDB$RELATION_FIELDS
        WHERE TRIM(RDB$RELATION_NAME) = ?
        ORDER BY RDB$FIELD_POSITION
    """, (table,))
    return [str(row[0] or "").strip() for row in cur.fetchall()]


def next_item_id(cur):
    cur.execute("SELECT COALESCE(MAX(ITEMID), 0) + 1 FROM ITEM")
    return int(cur.fetchone()[0] or 1)


def clone_item_master(cur, old_itemno, new_itemno):
    columns = get_table_columns(cur, "ITEM")
    if "ITEMNO" not in columns:
        raise RuntimeError("kolom ITEM.ITEMNO tidak ditemukan")

    select_sql = ", ".join(qname(column) for column in columns)
    cur.execute(f"SELECT {select_sql} FROM ITEM WHERE ITEMNO = ?", (old_itemno,))
    row = cur.fetchone()
    if not row:
        raise RuntimeError(f"kode lama tidak ditemukan di ITEM: {old_itemno}")

    values = list(row)
    for index, column in enumerate(columns):
        if column == "ITEMNO":
            values[index] = new_itemno
        elif column == "ITEMID":
            values[index] = next_item_id(cur)

    placeholders = ", ".join("?" for _ in columns)
    insert_sql = f"""
        INSERT INTO ITEM ({select_sql})
        VALUES ({placeholders})
    """
    cur.execute(insert_sql, values)


def validate_mapping(mapping):
    errors = []
    cleaned = []
    seen_old = set()
    seen_new = set()

    for index, record in enumerate(mapping, 1):
        old_itemno = record.get("old_itemno", "")
        new_itemno = record.get("new_itemno", "")
        updates = record.get("updates") or {}

        if not old_itemno:
            errors.append(f"Baris {index}: old_itemno wajib diisi.")
            continue
        if not new_itemno and not updates:
            errors.append(f"Baris {index}: isi new_itemno atau minimal satu field ITEM yang mau diupdate.")
            continue
        if new_itemno and old_itemno == new_itemno and not updates:
            errors.append(f"Baris {index}: kode lama dan kode baru sama ({old_itemno}) tanpa update field lain.")
            continue
        if old_itemno in seen_old:
            errors.append(f"Baris {index}: old_itemno duplikat ({old_itemno}).")
            continue
        if new_itemno and new_itemno in seen_new:
            errors.append(f"Baris {index}: kode baru duplikat ({new_itemno}).")
            continue
        seen_old.add(old_itemno)
        if new_itemno:
            seen_new.add(new_itemno)
        cleaned.append(record)

    old_codes = {record["old_itemno"] for record in cleaned}
    for record in cleaned:
        new_itemno = record.get("new_itemno", "")
        if new_itemno and new_itemno in old_codes:
            errors.append(
                f"Kode baru {new_itemno} juga dipakai sebagai kode lama. "
                "Rename chain seperti ini sebaiknya dipisah batch."
            )

    return cleaned, errors


def collect_references(cur, itemno, code_columns):
    refs = []
    total = 0
    for table, column in code_columns:
        cur.execute(
            f"SELECT COUNT(*) FROM {qname(table)} WHERE {qname(column)} = ?",
            (itemno,),
        )
        count = int(cur.fetchone()[0] or 0)
        if count:
            refs.append((table, column, count))
            total += count
    return refs, total


def get_item_values(cur, itemno, columns):
    if not columns:
        return {}
    select_sql = ", ".join(qname(column) for column in columns)
    cur.execute(f"SELECT {select_sql} FROM ITEM WHERE ITEMNO = ?", (itemno,))
    row = cur.fetchone()
    if not row:
        return {}
    return {
        column: str(row[index] or "").strip()
        for index, column in enumerate(columns)
    }


def valid_update_columns(item_columns, updates):
    item_column_set = set(item_columns)
    valid = {}
    invalid = []
    protected = []
    for column, value in (updates or {}).items():
        column = str(column or "").strip().upper()
        if not column:
            continue
        if column in PROTECTED_ITEM_COLUMNS:
            protected.append(column)
        elif column not in item_column_set:
            invalid.append(column)
        else:
            valid[column] = value
    return valid, invalid, protected


def print_preview(cur, mapping, code_columns, item_columns):
    print("\n" + "=" * 90)
    print("MODE PREVIEW - tidak ada data yang diubah")
    print("=" * 90)
    print(f"Kolom kode barang yang akan dicek: {len(code_columns)} kolom")

    can_rename = []
    blocked = []

    for record in mapping:
        old_itemno = record.get("old_itemno", "")
        new_itemno = record.get("new_itemno", "")
        requested_updates = record.get("updates") or {}
        updates, invalid_columns, protected_columns = valid_update_columns(item_columns, requested_updates)
        old_exists = item_exists(cur, old_itemno)
        new_exists = item_exists(cur, new_itemno) if new_itemno else False
        description = get_item_description(cur, old_itemno)
        refs, total_refs = collect_references(cur, old_itemno, code_columns)

        print("\n" + "-" * 90)
        print(f"{old_itemno} -> {new_itemno or '(kode tetap)'}")
        print(f"Deskripsi lama : {description or '-'}")
        print(f"Status         : lama={'ADA' if old_exists else 'TIDAK ADA'} | baru={'SUDAH ADA' if new_exists else ('belum ada' if new_itemno else '-')}")
        print(f"Referensi      : {total_refs}")
        if updates:
            current_values = get_item_values(cur, old_itemno, sorted(updates))
            print("Update field   :")
            for column, value in updates.items():
                print(f"  - {column}: {current_values.get(column, '') or '-'} -> {value}")
        if invalid_columns:
            print(f"Kolom invalid  : {', '.join(invalid_columns)}")
        if protected_columns:
            print(f"Kolom protected: {', '.join(protected_columns)}")

        if refs:
            for table, column, count in refs:
                print(f"  - {table}.{column}: {count}")
        else:
            print("  - Tidak ada referensi ditemukan.")

        if old_exists and (not new_itemno or not new_exists) and not invalid_columns and not protected_columns:
            can_rename.append(record)
        else:
            blocked.append(record)

    print("\n" + "=" * 90)
    print(f"Total mapping: {len(mapping)} | Siap rename: {len(can_rename)} | Blocked: {len(blocked)}")
    if blocked:
        print("Blocked biasanya karena kode lama tidak ada atau kode baru sudah ada.")
    print("Kalau sudah benar, ubah MODE = 'rename', lalu jalankan ulang.")
    return can_rename


def rename_one(con, record, item_columns):
    cur = con.cursor()
    changed = []
    old_itemno = record.get("old_itemno", "")
    new_itemno = record.get("new_itemno", "")
    updates, invalid_columns, protected_columns = valid_update_columns(item_columns, record.get("updates") or {})

    try:
        if invalid_columns:
            raise RuntimeError(f"kolom tidak ditemukan di ITEM: {', '.join(invalid_columns)}")
        if protected_columns:
            raise RuntimeError(f"kolom protected tidak boleh diupdate: {', '.join(protected_columns)}")
        if not item_exists(cur, old_itemno):
            raise RuntimeError(f"kode lama tidak ditemukan: {old_itemno}")
        if new_itemno and item_exists(cur, new_itemno):
            raise RuntimeError(f"kode baru sudah ada: {new_itemno}")

        set_parts = []
        params = []
        if new_itemno:
            set_parts.append("ITEMNO = ?")
            params.append(new_itemno)
        for column, value in updates.items():
            set_parts.append(f"{qname(column)} = ?")
            params.append(value)
        if not set_parts:
            raise RuntimeError("tidak ada perubahan untuk disimpan")

        params.append(old_itemno)
        cur.execute(f"UPDATE ITEM SET {', '.join(set_parts)} WHERE ITEMNO = ?", params)
        if cur.rowcount and cur.rowcount > 0:
            changed_columns = (["ITEMNO"] if new_itemno else []) + list(updates)
            changed.append(("ITEM", ", ".join(changed_columns), cur.rowcount))

        con.commit()
        return True, changed, ""
    except Exception as exc:
        con.rollback()
        return False, changed, str(exc)


def run_rename(con, mapping, item_columns):
    print("\n" + "=" * 90)
    print("MODE RENAME - database akan diubah")
    print("=" * 90)
    print("Pastikan Easy Accounting sudah ditutup dan database sudah di-backup.")
    confirm = input("Ketik RENAME untuk melanjutkan, atau Enter untuk batal: ").strip()
    if confirm != "RENAME":
        print("Dibatalkan.")
        return

    success = []
    failed = []

    for record in mapping:
        old_itemno = record.get("old_itemno", "")
        new_itemno = record.get("new_itemno", "")
        print("\n" + "-" * 90)
        print(f"Update {old_itemno} -> {new_itemno or '(kode tetap)'}")
        ok, changed, error = rename_one(con, record, item_columns)
        if ok:
            for table, column, count in changed:
                print(f"  OK {table}.{column}: {count}")
            print("  Berhasil commit.")
            success.append((old_itemno, new_itemno))
        else:
            print(f"  GAGAL rollback: {error}")
            failed.append((old_itemno, new_itemno, error))

    print("\n" + "=" * 90)
    print(f"Berhasil: {len(success)} | Gagal: {len(failed)}")
    if failed:
        print("Mapping gagal:")
        for old_itemno, new_itemno, error in failed:
            print(f"  - {old_itemno} -> {new_itemno}: {error}")


def main():
    mapping, errors = validate_mapping(load_mapping())
    if errors:
        print("Mapping belum valid:")
        for error in errors:
            print(f"  - {error}")
        return
    if not mapping:
        print("Mapping kosong. Isi RENAME_MAP dulu, contoh: ('ABCD', 'DCBA').")
        return

    print("Menghubungkan ke database Easy Accounting...")
    try:
        con = fdb.connect(**DB_CONFIG)
        print("Koneksi berhasil.")
    except Exception as exc:
        print(f"Gagal konek: {exc}")
        return

    try:
        cur = con.cursor()
        code_columns = get_item_code_columns(cur)
        item_columns = get_table_columns(cur, "ITEM")
        if not code_columns:
            print("Tidak menemukan kolom kode barang di metadata database.")
            return

        if MODE == "preview":
            print_preview(cur, mapping, code_columns, item_columns)
        elif MODE == "rename":
            print_preview(cur, mapping, code_columns, item_columns)
            run_rename(con, mapping, item_columns)
        else:
            print(f"MODE tidak valid: {MODE}. Gunakan 'preview' atau 'rename'.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
