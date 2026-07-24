"""
Bulk delete formula Easy Accounting.

PERINGATAN:
    - Script ini menghapus master formula dari BOM dan detailnya.
    - Detail yang dihapus: BOMMATDET, BOMDLABORDET, BOMMOHDET.
    - Formula yang masih direferensikan PORDER akan di-skip.
    - Tutup Easy Accounting dan buat backup database sebelum MODE = "delete".
    - Jalankan MODE = "preview" dulu untuk cek formula yang akan dihapus.

Cara pakai:
    1. Isi FORMULA_YANG_DIHAPUS dengan no formula yang ingin dihapus.
    2. Jalankan MODE = "preview".
    3. Kalau sudah benar, ubah MODE = "delete".
    4. Jalankan lagi dan ketik HAPUS FORMULA saat diminta konfirmasi.

Opsional CSV:
    Isi CSV_FILE dengan path file CSV jika ingin baca daftar dari file.
    Header yang didukung: no_formula, formula, bomno.

Opsional Excel:
    Isi EXCEL_FILE dengan path file Excel jika ingin baca daftar dari file .xlsx.
    Kolom pertama dibaca sebagai no formula, baris pertama dianggap header.
    Set EXCEL_SPLIT_COMMA = True jika satu sel berisi beberapa formula dipisah koma
    dan semuanya ingin dibaca sebagai formula terpisah. Jika False, hanya formula
    sebelum koma pertama yang dibaca.
"""

import csv
import os
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import fdb

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

fdb.load_api("C:/Program Files/Firebird/Firebird_3_0/fbclient.dll")

ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = Path(__file__).with_name(".env")


def muat_env(file_path):
    """Muat konfigurasi sederhana dari .env tanpa menimpa environment aktif."""
    if not file_path.exists():
        return

    for baris in file_path.read_text(encoding="utf-8").splitlines():
        baris = baris.strip()
        if not baris or baris.startswith("#") or "=" not in baris:
            continue
        nama, nilai = baris.split("=", 1)
        os.environ.setdefault(nama.strip(), nilai.strip())


muat_env(ENV_FILE)

DB_CONFIG = {
    "host": os.getenv("EASY_DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("EASY_DB_PORT", "3999")),
    "database": os.getenv("EASY_DB_PATH", "D:/EASY/GTE.EASY6"),
    "user": os.getenv("EASY_DB_USER", "SYSDBA"),
    "password": os.getenv("EASY_DB_PASSWORD", "NewPassword123"),
}


# "preview" = hanya cek, tidak mengubah database.
# "delete"  = benar-benar hapus formula.
MODE = "delete"

FORMULA_YANG_DIHAPUS = [
    # "F-GTE2700",
]

# Kalau ingin baca dari CSV, isi path file. Kosongkan kalau pakai list di atas.
# Format CSV:
# no_formula
# F-GTE2700
CSV_FILE = ""

# Kalau ingin baca dari Excel, isi path file. Kosongkan kalau pakai CSV_FILE/list di atas.
EXCEL_FILE = ROOT_DIR / "Daftar Formula Untuk Dihapus.xlsx"

# False = 1 baris Excel dihitung sebagai 1 formula.
#         Isi sel seperti "F-LAMA, F-BARU" hanya mengambil "F-LAMA".
# True  = isi sel seperti "F-LAMA, F-BARU" dihitung sebagai 2 formula.
EXCEL_SPLIT_COMMA = False

BOMNO_MAX_LENGTH = 20

DETAIL_TABLES = (
    "BOMMATDET",
    "BOMDLABORDET",
    "BOMMOHDET",
)


def load_formula_list():
    if EXCEL_FILE:
        return baca_formula_excel(EXCEL_FILE)

    if CSV_FILE.strip():
        with open(CSV_FILE, newline="", encoding="utf-8-sig") as csv_file:
            reader = csv.DictReader(csv_file)
            rows = []
            for row in reader:
                formula_no = (
                    row.get("no_formula")
                    or row.get("formula")
                    or row.get("bomno")
                    or ""
                ).strip()
                if formula_no:
                    rows.append(formula_no)
            return rows

    return [str(formula_no).strip() for formula_no in FORMULA_YANG_DIHAPUS]


def split_formula_cell(value):
    if value is None:
        return []
    return [
        formula_no.strip()
        for formula_no in str(value).replace(";", ",").split(",")
        if formula_no.strip()
    ]


def xlsx_col_index(cell_ref):
    letters = "".join(ch for ch in str(cell_ref or "") if ch.isalpha()).upper()
    index = 0
    for ch in letters:
        index = index * 26 + (ord(ch) - ord("A") + 1)
    return index - 1


def xlsx_cell_value(cell, shared_strings):
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//x:t", ns)).strip()
    value_node = cell.find("x:v", ns)
    if value_node is None or value_node.text is None:
        return ""
    value = value_node.text
    if cell_type == "s":
        try:
            return str(shared_strings[int(value)] or "").strip()
        except (ValueError, IndexError):
            return ""
    return str(value or "").strip()


def xlsx_shared_strings(zf):
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    values = []
    for item in root.findall("x:si", ns):
        values.append("".join(node.text or "" for node in item.findall(".//x:t", ns)))
    return values


def read_xlsx_sheet_rows(file_path, preferred_sheet="Formula"):
    with zipfile.ZipFile(file_path) as zf:
        shared_strings = xlsx_shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        ns = {
            "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
            "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
            "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
        }
        sheets = workbook.findall(".//x:sheets/x:sheet", ns)
        target_sheet = next((sheet for sheet in sheets if sheet.attrib.get("name") == preferred_sheet), sheets[0] if sheets else None)
        if target_sheet is None:
            return []
        rel_id = target_sheet.attrib.get(f"{{{ns['r']}}}id")
        target = None
        for rel in rels.findall("rel:Relationship", ns):
            if rel.attrib.get("Id") == rel_id:
                target = rel.attrib.get("Target")
                break
        if not target:
            return []
        sheet_path = "xl/" + target.lstrip("/")
        sheet = ET.fromstring(zf.read(sheet_path))

    sheet_ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows = []
    for row in sheet.findall(".//x:sheetData/x:row", sheet_ns):
        values = {}
        for cell in row.findall("x:c", sheet_ns):
            values[xlsx_col_index(cell.attrib.get("r"))] = xlsx_cell_value(cell, shared_strings)
        max_col = max(values.keys(), default=-1)
        rows.append([values.get(index, "") for index in range(max_col + 1)])
    return rows


def baca_formula_excel(file_path):
    rows = read_xlsx_sheet_rows(file_path)
    if not rows:
        return []
    headers = [str(value or "").strip().lower() for value in rows[0]]
    formula_col = 0
    for index, header in enumerate(headers):
        if header in {"bomno", "no_formula", "formula", "no formula"}:
            formula_col = index
            break

    formula_list = []

    for row in rows[1:]:
        if not row:
            continue
        value = row[formula_col] if formula_col < len(row) else ""
        if EXCEL_SPLIT_COMMA:
            formula_list.extend(split_formula_cell(value))
        elif value is not None and str(value).strip():
            formula_list.append(split_formula_cell(value)[0])

    return formula_list


def validate_formula_list(formula_list):
    errors = []
    cleaned = []
    seen = set()

    for index, formula_no in enumerate(formula_list, 1):
        if not formula_no:
            errors.append(f"Baris {index}: no formula kosong.")
            continue
        if len(formula_no) > BOMNO_MAX_LENGTH:
            errors.append(
                f"Baris {index}: no formula terlalu panjang ({len(formula_no)} karakter): "
                f"{formula_no}. Jika berisi koma, set EXCEL_SPLIT_COMMA = True."
            )
            continue
        if formula_no in seen:
            errors.append(f"Baris {index}: no formula duplikat ({formula_no}).")
            continue
        seen.add(formula_no)
        cleaned.append(formula_no)

    return cleaned, errors


def scalar(cur, sql, params):
    cur.execute(sql, params)
    row = cur.fetchone()
    return int(row[0] or 0) if row else 0


def formula_row(cur, formula_no):
    cur.execute("""
        SELECT FIRST 1
            b.BOMID,
            b.BOMNO,
            b.DESCRIPTION,
            b.ITEMNO,
            i.ITEMDESCRIPTION,
            b.QTYBUILD,
            b.UNIT,
            b.SUSPENDED
        FROM BOM b
        LEFT JOIN ITEM i ON i.ITEMNO = b.ITEMNO
        WHERE b.BOMNO = ?
    """, (formula_no,))
    row = cur.fetchone()
    if not row:
        return None

    bomid = int(row[0] or 0)
    detail_counts = {
        table: scalar(cur, f"SELECT COUNT(*) FROM {table} WHERE BOMID = ?", (bomid,))
        for table in DETAIL_TABLES
    }
    porder_count = scalar(cur, "SELECT COUNT(*) FROM PORDER WHERE BOMID = ?", (bomid,))

    return {
        "bomid": bomid,
        "bomno": str(row[1] or "").strip(),
        "description": str(row[2] or "").strip(),
        "itemno": str(row[3] or "").strip(),
        "itemdescription": str(row[4] or "").strip(),
        "qtybuild": float(row[5] or 0),
        "unit": str(row[6] or "").strip(),
        "suspended": int(row[7] or 0),
        "detail_counts": detail_counts,
        "porder_count": porder_count,
    }


def print_preview(cur, formula_list):
    print("\n" + "=" * 100)
    print("MODE PREVIEW - tidak ada data yang dihapus")
    print("=" * 100)

    can_delete = []
    blocked = []

    for formula_no in formula_list:
        row = formula_row(cur, formula_no)

        print("\n" + "-" * 100)
        print(f"No Formula : {formula_no}")

        if not row:
            print("Status     : TIDAK DITEMUKAN - SKIP")
            blocked.append((formula_no, "tidak ditemukan"))
            continue

        total_details = sum(row["detail_counts"].values())
        print(f"BOMID      : {row['bomid']}")
        print(f"Produk     : {row['itemno'] or '-'} - {row['itemdescription'] or '-'}")
        print(f"Deskripsi  : {row['description'] or '-'}")
        print(f"Jumlah     : {row['qtybuild']} {row['unit']}")
        print(f"Status     : {'Tidak Aktif' if row['suspended'] else 'Aktif'}")
        print(
            "Detail     : "
            + ", ".join(f"{table}={count}" for table, count in row["detail_counts"].items())
        )
        print(f"PORDER     : {row['porder_count']} referensi")

        if row["porder_count"] > 0:
            print("Keputusan  : SKIP - masih direferensikan PORDER")
            blocked.append((formula_no, "masih direferensikan PORDER"))
        else:
            print(f"Keputusan  : BISA HAPUS ({total_details} detail + 1 BOM)")
            can_delete.append(row)

    print("\n" + "=" * 100)
    print(f"Total: {len(formula_list)} | Bisa hapus: {len(can_delete)} | Skip: {len(blocked)}")
    if blocked:
        print("Formula skip:")
        for formula_no, reason in blocked:
            print(f"  - {formula_no}: {reason}")
    print("Kalau sudah benar, ubah MODE = 'delete', lalu jalankan ulang.")
    return can_delete


def delete_one(con, formula_no):
    cur = con.cursor()
    try:
        row = formula_row(cur, formula_no)
        if not row:
            raise RuntimeError(f"no formula tidak ditemukan: {formula_no}")
        if row["porder_count"] > 0:
            raise RuntimeError(
                f"formula masih direferensikan PORDER ({row['porder_count']} baris)"
            )

        deleted_counts = {}
        for table in DETAIL_TABLES:
            cur.execute(f"DELETE FROM {table} WHERE BOMID = ?", (row["bomid"],))
            deleted_counts[table] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0

        cur.execute("DELETE FROM BOM WHERE BOMID = ?", (row["bomid"],))
        deleted_counts["BOM"] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0

        con.commit()
        return True, deleted_counts, ""
    except Exception as exc:
        con.rollback()
        return False, {}, str(exc)


def run_delete(con, formula_list):
    print("\n" + "=" * 100)
    print("MODE DELETE - database akan diubah")
    print("=" * 100)
    print("Pastikan Easy Accounting sudah ditutup dan database sudah di-backup.")
    confirm = input("Ketik HAPUS FORMULA untuk melanjutkan, atau Enter untuk batal: ").strip()
    if confirm != "HAPUS FORMULA":
        print("Dibatalkan.")
        return

    success = []
    failed = []

    for formula_no in formula_list:
        print("\n" + "-" * 100)
        print(f"Hapus formula {formula_no}")
        ok, deleted_counts, error = delete_one(con, formula_no)
        if ok:
            print(
                "  OK "
                + ", ".join(f"{table}={count}" for table, count in deleted_counts.items())
            )
            print("  Berhasil commit.")
            success.append(formula_no)
        else:
            print(f"  GAGAL rollback: {error}")
            failed.append((formula_no, error))

    print("\n" + "=" * 100)
    print(f"Berhasil: {len(success)} | Gagal/Skip: {len(failed)}")
    if success:
        print("Formula yang dihapus:")
        for formula_no in success:
            print(f"  - {formula_no}")
    if failed:
        print("Formula gagal/skip:")
        for formula_no, error in failed:
            print(f"  - {formula_no}: {error}")


def main():
    formula_list, errors = validate_formula_list(load_formula_list())
    if errors:
        print("Daftar formula belum valid:")
        for error in errors:
            print(f"  - {error}")
        return
    if not formula_list:
        print("Daftar formula kosong. Isi FORMULA_YANG_DIHAPUS atau CSV_FILE dulu.")
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
            print_preview(cur, formula_list)
        elif MODE == "delete":
            print_preview(cur, formula_list)
            run_delete(con, formula_list)
        else:
            print(f"MODE tidak valid: {MODE}. Gunakan 'preview' atau 'delete'.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
