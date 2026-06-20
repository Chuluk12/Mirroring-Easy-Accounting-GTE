"""
Bulk rename No Formula Easy Accounting.

PERINGATAN:
    - Script ini hanya mengubah master formula: BOM.BOMNO.
    - Detail bahan baku/biaya formula umumnya terhubung lewat BOMID, jadi tidak perlu
      update tabel detail satu per satu.
    - Tutup Easy Accounting dan buat backup database sebelum MODE = "rename".
    - Jalankan MODE = "preview" dulu untuk cek kode lama/baru.

Cara pakai:
    1. Isi RENAME_MAP dengan pasangan ("NO_FORMULA_LAMA", "NO_FORMULA_BARU").
    2. Jalankan MODE = "preview".
    3. Kalau sudah benar, ubah MODE = "rename".
    4. Jalankan lagi dan ketik RENAME saat diminta konfirmasi.
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
# "rename"  = benar-benar rename BOM.BOMNO.
MODE = "rename"

RENAME_MAP = [
    ("F-GTE2700", "F-GTE2700-X")
]

# Kalau ingin baca dari CSV, isi nama file. Kosongkan kalau pakai RENAME_MAP.
# Format CSV:
# old_formula,new_formula
# F-GTE2700,F-GTE2700-X
CSV_FILE = ""


def load_mapping():
    if CSV_FILE.strip():
        with open(CSV_FILE, newline="", encoding="utf-8-sig") as csv_file:
            reader = csv.DictReader(csv_file)
            rows = []
            for row in reader:
                old_formula = (row.get("old_formula") or "").strip()
                new_formula = (row.get("new_formula") or "").strip()
                if old_formula or new_formula:
                    rows.append((old_formula, new_formula))
            return rows
    return [(old.strip(), new.strip()) for old, new in RENAME_MAP]


def validate_mapping(mapping):
    errors = []
    cleaned = []
    seen_old = set()
    seen_new = set()

    for index, (old_formula, new_formula) in enumerate(mapping, 1):
        if not old_formula or not new_formula:
            errors.append(f"Baris {index}: no formula lama dan baru wajib diisi.")
            continue
        if old_formula == new_formula:
            errors.append(f"Baris {index}: no formula lama dan baru sama ({old_formula}).")
            continue
        if old_formula in seen_old:
            errors.append(f"Baris {index}: no formula lama duplikat ({old_formula}).")
            continue
        if new_formula in seen_new:
            errors.append(f"Baris {index}: no formula baru duplikat ({new_formula}).")
            continue
        seen_old.add(old_formula)
        seen_new.add(new_formula)
        cleaned.append((old_formula, new_formula))

    old_codes = {old for old, _ in cleaned}
    for _, new_formula in cleaned:
        if new_formula in old_codes:
            errors.append(
                f"No formula baru {new_formula} juga dipakai sebagai no formula lama. "
                "Rename chain seperti ini sebaiknya dipisah batch."
            )

    return cleaned, errors


def formula_row(cur, formula_no):
    cur.execute("""
        SELECT FIRST 1
            b.BOMID,
            b.BOMNO,
            b.DESCRIPTION,
            b.ITEMNO,
            b.QTYBUILD,
            b.UNIT,
            (SELECT COUNT(*) FROM BOMMATDET m WHERE m.BOMID = b.BOMID) AS MATERIAL_COUNT
        FROM BOM b
        WHERE b.BOMNO = ?
    """, (formula_no,))
    row = cur.fetchone()
    if not row:
        return None
    return {
        "bomid": int(row[0] or 0),
        "bomno": str(row[1] or "").strip(),
        "description": str(row[2] or "").strip(),
        "itemno": str(row[3] or "").strip(),
        "qtybuild": float(row[4] or 0),
        "unit": str(row[5] or "").strip(),
        "material_count": int(row[6] or 0),
    }


def formula_exists(cur, formula_no):
    return formula_row(cur, formula_no) is not None


def print_preview(cur, mapping):
    print("\n" + "=" * 90)
    print("MODE PREVIEW - tidak ada data yang diubah")
    print("=" * 90)

    can_rename = []
    blocked = []

    for old_formula, new_formula in mapping:
        old_row = formula_row(cur, old_formula)
        new_exists = formula_exists(cur, new_formula)

        print("\n" + "-" * 90)
        print(f"{old_formula} -> {new_formula}")
        if old_row:
            print(f"Status       : lama=ADA | baru={'SUDAH ADA' if new_exists else 'belum ada'}")
            print(f"Produk       : {old_row['itemno'] or '-'}")
            print(f"Deskripsi    : {old_row['description'] or '-'}")
            print(f"Jumlah       : {old_row['qtybuild']} {old_row['unit']}")
            print(f"Material     : {old_row['material_count']} baris")
        else:
            print(f"Status       : lama=TIDAK ADA | baru={'SUDAH ADA' if new_exists else 'belum ada'}")

        if old_row and not new_exists:
            can_rename.append((old_formula, new_formula))
        else:
            blocked.append((old_formula, new_formula))

    print("\n" + "=" * 90)
    print(f"Total mapping: {len(mapping)} | Siap rename: {len(can_rename)} | Blocked: {len(blocked)}")
    if blocked:
        print("Blocked biasanya karena no formula lama tidak ada atau no formula baru sudah ada.")
    print("Kalau sudah benar, ubah MODE = 'rename', lalu jalankan ulang.")
    return can_rename


def rename_one(con, old_formula, new_formula):
    cur = con.cursor()
    try:
        if not formula_exists(cur, old_formula):
            raise RuntimeError(f"no formula lama tidak ditemukan: {old_formula}")
        if formula_exists(cur, new_formula):
            raise RuntimeError(f"no formula baru sudah ada: {new_formula}")

        cur.execute(
            "UPDATE BOM SET BOMNO = ? WHERE BOMNO = ?",
            (new_formula, old_formula),
        )
        rowcount = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        con.commit()
        return True, rowcount, ""
    except Exception as exc:
        con.rollback()
        return False, 0, str(exc)


def run_rename(con, mapping):
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

    for old_formula, new_formula in mapping:
        print("\n" + "-" * 90)
        print(f"Rename {old_formula} -> {new_formula}")
        ok, rowcount, error = rename_one(con, old_formula, new_formula)
        if ok:
            print(f"  OK BOM.BOMNO: {rowcount}")
            print("  Berhasil commit.")
            success.append((old_formula, new_formula))
        else:
            print(f"  GAGAL rollback: {error}")
            failed.append((old_formula, new_formula, error))

    print("\n" + "=" * 90)
    print(f"Berhasil: {len(success)} | Gagal: {len(failed)}")
    if failed:
        print("Mapping gagal:")
        for old_formula, new_formula, error in failed:
            print(f"  - {old_formula} -> {new_formula}: {error}")


def main():
    mapping, errors = validate_mapping(load_mapping())
    if errors:
        print("Mapping belum valid:")
        for error in errors:
            print(f"  - {error}")
        return
    if not mapping:
        print("Mapping kosong. Isi RENAME_MAP dulu, contoh: ('F-GTE2700', 'F-GTE2700-X').")
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
        if MODE == "preview":
            print_preview(cur, mapping)
        elif MODE == "rename":
            print_preview(cur, mapping)
            run_rename(con, mapping)
        else:
            print(f"MODE tidak valid: {MODE}. Gunakan 'preview' atau 'rename'.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
