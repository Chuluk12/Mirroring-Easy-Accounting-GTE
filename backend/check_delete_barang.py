"""
Preview aman untuk rencana hapus barang Easy Accounting.

Script ini TIDAK menghapus data. Output:
- item yang sudah tidak ada di ITEM
- item yang ada dan tampak aman dihapus
- item yang ada tapi masih direferensikan tabel transaksi/dokumen
"""

from __future__ import annotations

import os
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape
from xml.etree import ElementTree as ET

import fdb

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

fdb.load_api("C:/Program Files/Firebird/Firebird_3_0/fbclient.dll")

ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = Path(__file__).with_name(".env")
DEFAULT_INPUT = Path(r"C:\Users\HUSNUL\Downloads\code gpp.xlsx")
OUTPUT_FILE = ROOT_DIR / "Laporan Cek Hapus Barang.xlsx"

CLEANUP_TABLES = {
    "ITEM_BRANCH",
    "WAREITEM",
    "ITEMBALANCE",
    "SN",
    "ITEMORDER",
    "PERSONDATAPRICE",
    "REPLACEITEM",
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def xlsx_col_index(cell_ref: str | None) -> int:
    letters = "".join(ch for ch in str(cell_ref or "") if ch.isalpha()).upper()
    index = 0
    for ch in letters:
        index = index * 26 + (ord(ch) - ord("A") + 1)
    return index - 1


def xlsx_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    values = []
    for item in root.findall("x:si", ns):
        values.append("".join(node.text or "" for node in item.findall(".//x:t", ns)))
    return values


def xlsx_cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
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


def read_xlsx_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as zf:
        shared_strings = xlsx_shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        ns = {
            "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
            "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
            "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
        }
        first_sheet = workbook.find(".//x:sheets/x:sheet", ns)
        if first_sheet is None:
            return []
        rel_id = first_sheet.attrib.get(f"{{{ns['r']}}}id")
        target = None
        for rel in rels.findall("rel:Relationship", ns):
            if rel.attrib.get("Id") == rel_id:
                target = rel.attrib.get("Target")
                break
        if not target:
            return []
        sheet_path = "xl/" + target.lstrip("/")
        sheet = ET.fromstring(zf.read(sheet_path))

    rows: list[list[str]] = []
    sheet_ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    for row in sheet.findall(".//x:sheetData/x:row", sheet_ns):
        values: dict[int, str] = {}
        for cell in row.findall("x:c", sheet_ns):
            values[xlsx_col_index(cell.attrib.get("r"))] = xlsx_cell_value(cell, shared_strings)
        max_col = max(values.keys(), default=-1)
        rows.append([values.get(index, "") for index in range(max_col + 1)])
    return rows


def pick_itemno_column(rows: list[list[str]]) -> int:
    if not rows:
        return 0
    headers = [str(value or "").strip().lower() for value in rows[0]]
    candidates = ("itemno", "item no", "no barang", "kode barang", "kode", "code")
    for index, header in enumerate(headers):
        if header in candidates:
            return index
    for index, header in enumerate(headers):
        if "barang" in header or "item" in header or "kode" in header:
            return index
    return 0


def read_item_codes(path: Path) -> tuple[list[str], list[str], int]:
    rows = read_xlsx_rows(path)
    if not rows:
        return [], [], 0
    item_col = pick_itemno_column(rows)
    headers = rows[0]
    seen = set()
    codes = []
    for row in rows[1:]:
        value = str(row[item_col]).strip() if item_col < len(row) else ""
        if value and value not in seen:
            codes.append(value)
            seen.add(value)
    return codes, headers, item_col


def db_config() -> dict[str, object]:
    load_env_file(ENV_FILE)
    return {
        "host": os.getenv("EASY_DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("EASY_DB_PORT", "3999")),
        "database": os.getenv("EASY_DB_PATH", "D:/EASY/GTE.EASY6"),
        "user": os.getenv("EASY_DB_USER", "SYSDBA"),
        "password": os.getenv("EASY_DB_PASSWORD", "NewPassword123"),
    }


def item_reference_columns(cur) -> list[tuple[str, str]]:
    cur.execute("""
        SELECT TRIM(rf.RDB$RELATION_NAME), TRIM(rf.RDB$FIELD_NAME)
        FROM RDB$RELATION_FIELDS rf
        JOIN RDB$RELATIONS r ON r.RDB$RELATION_NAME = rf.RDB$RELATION_NAME
        WHERE COALESCE(r.RDB$SYSTEM_FLAG, 0) = 0
          AND UPPER(TRIM(rf.RDB$FIELD_NAME)) IN ('ITEMNO', 'RITEMNO')
        ORDER BY 1, 2
    """)
    return [(str(row[0]).strip(), str(row[1]).strip()) for row in cur.fetchall()]


def count_ref(cur, table: str, column: str, itemno: str) -> int:
    cur.execute(f'SELECT COUNT(*) FROM "{table}" WHERE "{column}" = ?', (itemno,))
    return int((cur.fetchone() or [0])[0] or 0)


def analyze_items(con, codes: list[str]) -> list[dict[str, object]]:
    cur = con.cursor()
    ref_columns = item_reference_columns(cur)
    results = []
    for itemno in codes:
        cur.execute("SELECT ITEMNO, ITEMDESCRIPTION, ITEMTYPE, QUANTITY FROM ITEM WHERE ITEMNO = ?", (itemno,))
        item_row = cur.fetchone()
        if not item_row:
            results.append({
                "itemno": itemno,
                "description": "",
                "status": "SUDAH_TIDAK_ADA",
                "reason": "Tidak ditemukan di tabel ITEM",
                "blocking_refs": "",
                "cleanup_refs": "",
            })
            continue

        blocking = []
        cleanup = []
        for table, column in ref_columns:
            if table == "ITEM":
                continue
            try:
                total = count_ref(cur, table, column, itemno)
            except Exception as exc:
                blocking.append(f"{table}.{column}=ERROR {exc}")
                continue
            if not total:
                continue
            ref_text = f"{table}.{column}={total}"
            if table in CLEANUP_TABLES:
                cleanup.append(ref_text)
            else:
                blocking.append(ref_text)

        status = "ADA_TIDAK_BISA_HAPUS" if blocking else "ADA_BISA_HAPUS"
        reason = "Masih dipakai transaksi/dokumen" if blocking else "Hanya ada master/auxiliary yang bisa dibersihkan"
        results.append({
            "itemno": itemno,
            "description": str(item_row[1] or "").strip(),
            "status": status,
            "reason": reason,
            "blocking_refs": "; ".join(blocking),
            "cleanup_refs": "; ".join(cleanup),
        })
    return results


def write_xlsx_report(rows: list[dict[str, object]], output_path: Path) -> None:
    counts = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1

    summary_rows: list[list[object]] = [
        ("Status", "Jumlah"),
        ("SUDAH_TIDAK_ADA", counts.get("SUDAH_TIDAK_ADA", 0)),
        ("ADA_BISA_HAPUS", counts.get("ADA_BISA_HAPUS", 0)),
        ("ADA_TIDAK_BISA_HAPUS", counts.get("ADA_TIDAK_BISA_HAPUS", 0)),
        ("TOTAL", len(rows)),
    ]

    headers = ["itemno", "description", "status", "reason", "blocking_refs", "cleanup_refs"]
    detail_rows: list[list[object]] = [headers]
    for row in rows:
        detail_rows.append([row.get(header, "") for header in headers])

    def col_name(index: int) -> str:
        name = ""
        while index:
            index, remainder = divmod(index - 1, 26)
            name = chr(65 + remainder) + name
        return name

    def sheet_xml(sheet_rows: list[list[object]]) -> str:
        row_nodes = []
        for row_index, row_values in enumerate(sheet_rows, 1):
            cell_nodes = []
            for col_index, value in enumerate(row_values, 1):
                ref = f"{col_name(col_index)}{row_index}"
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    cell_nodes.append(f'<c r="{ref}"><v>{value}</v></c>')
                else:
                    text = escape(str(value or ""))
                    cell_nodes.append(f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>')
            row_nodes.append(f'<row r="{row_index}">{"".join(cell_nodes)}</row>')
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'<sheetData>{"".join(row_nodes)}</sheetData>'
            '</worksheet>'
        )

    files = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '</Types>'
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets>'
            '<sheet name="Ringkasan" sheetId="1" r:id="rId1"/>'
            '<sheet name="Detail" sheetId="2" r:id="rId2"/>'
            '</sheets>'
            '</workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
            '</Relationships>'
        ),
        "xl/worksheets/sheet1.xml": sheet_xml(summary_rows),
        "xl/worksheets/sheet2.xml": sheet_xml(detail_rows),
    }

    try:
        zf = zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED)
    except PermissionError:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        output_path = output_path.with_name(f"{output_path.stem} {timestamp}{output_path.suffix}")
        zf = zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED)

    with zf:
        for filename, content in files.items():
            zf.writestr(filename, content)
    return output_path


def main() -> int:
    input_file = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    if not input_file.exists():
        print(f"File tidak ditemukan: {input_file}")
        return 1

    codes, headers, item_col = read_item_codes(input_file)
    print(f"File: {input_file}")
    print(f"Header: {headers}")
    print(f"Kolom kode terpilih: {item_col + 1}")
    print(f"Jumlah kode unik: {len(codes)}")
    if not codes:
        return 1

    con = fdb.connect(**db_config())
    try:
        rows = analyze_items(con, codes)
    finally:
        con.close()

    output_file = write_xlsx_report(rows, OUTPUT_FILE)
    counts = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1

    print("Ringkasan:")
    print(f"- Sudah tidak ada: {counts.get('SUDAH_TIDAK_ADA', 0)}")
    print(f"- Ada dan bisa hapus: {counts.get('ADA_BISA_HAPUS', 0)}")
    print(f"- Ada tapi tidak bisa hapus: {counts.get('ADA_TIDAK_BISA_HAPUS', 0)}")
    print(f"Laporan: {output_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
