"""
Buat daftar formula/BOM yang menahan barang agar belum bisa dihapus.

Input default berasal dari "Laporan Cek Hapus Barang.xlsx" hasil check_delete_barang.py.
Script ini hanya membaca data dan membuat laporan, tidak menghapus database.
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape
from xml.etree import ElementTree as ET

import fdb

from check_delete_barang import db_config, read_xlsx_rows

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

fdb.load_api("C:/Program Files/Firebird/Firebird_3_0/fbclient.dll")

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT_DIR / "Laporan Cek Hapus Barang.xlsx"
OUTPUT_FILE = ROOT_DIR / "Daftar Formula Untuk Dihapus.xlsx"


def read_detail_rows(path: Path) -> list[dict[str, str]]:
    rows = read_xlsx_rows(path)
    # File laporan punya sheet Detail di sheet2; reader default membaca sheet pertama.
    with zipfile.ZipFile(path) as zf:
        root = ET.fromstring(zf.read("xl/worksheets/sheet2.xml"))
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

    def cell_value(cell: ET.Element) -> str:
        text_node = cell.find(".//x:t", ns)
        value_node = cell.find("x:v", ns)
        return (text_node.text if text_node is not None else value_node.text if value_node is not None else "") or ""

    sheet_rows = [
        [cell_value(cell) for cell in row.findall("x:c", ns)]
        for row in root.findall(".//x:sheetData/x:row", ns)
    ]
    if not sheet_rows:
        return []
    headers = sheet_rows[0]
    return [
        {headers[index]: value for index, value in enumerate(row) if index < len(headers)}
        for row in sheet_rows[1:]
    ]


def formula_candidates_from_report(path: Path) -> list[dict[str, str]]:
    rows = read_detail_rows(path)
    itemnos = [
        row["itemno"]
        for row in rows
        if row.get("status") == "ADA_TIDAK_BISA_HAPUS"
        and row.get("blocking_refs", "").startswith("BOM.ITEMNO=")
        and ";" not in row.get("blocking_refs", "")
    ]

    con = fdb.connect(**db_config())
    cur = con.cursor()
    output = []
    try:
        for itemno in itemnos:
            cur.execute("""
                SELECT
                    b.BOMID,
                    b.BOMNO,
                    b.DESCRIPTION,
                    b.ITEMNO,
                    i.ITEMDESCRIPTION,
                    b.QTYBUILD,
                    b.UNIT,
                    b.SUSPENDED,
                    b.UPDATEDATE,
                    (SELECT COUNT(*) FROM BOMMATDET m WHERE m.BOMID = b.BOMID),
                    (SELECT COUNT(*) FROM BOMDLABORDET d WHERE d.BOMID = b.BOMID),
                    (SELECT COUNT(*) FROM BOMMOHDET h WHERE h.BOMID = b.BOMID),
                    (SELECT COUNT(*) FROM PORDER p WHERE p.BOMID = b.BOMID)
                FROM BOM b
                LEFT JOIN ITEM i ON i.ITEMNO = b.ITEMNO
                WHERE b.ITEMNO = ?
                ORDER BY b.BOMNO
            """, (itemno,))
            for row in cur.fetchall():
                output.append({
                    "bomno": str(row[1] or "").strip(),
                    "bomid": str(int(row[0] or 0)),
                    "itemno": str(row[3] or "").strip(),
                    "itemdescription": str(row[4] or "").strip(),
                    "formula_description": str(row[2] or "").strip(),
                    "qtybuild": str(float(row[5] or 0)),
                    "unit": str(row[6] or "").strip(),
                    "suspended": "Ya" if int(row[7] or 0) else "Tidak",
                    "updatedate": str(row[8]) if row[8] else "",
                    "bommatdet_count": str(int(row[9] or 0)),
                    "bomdlabordet_count": str(int(row[10] or 0)),
                    "bommohdet_count": str(int(row[11] or 0)),
                    "porder_count": str(int(row[12] or 0)),
                    "delete_status": "SKIP_PORDER" if int(row[12] or 0) else "BISA_HAPUS_FORMULA",
                })
    finally:
        con.close()
    return output


def write_xlsx(rows: list[dict[str, str]], output_path: Path) -> None:
    headers = [
        "bomno",
        "bomid",
        "itemno",
        "itemdescription",
        "formula_description",
        "qtybuild",
        "unit",
        "suspended",
        "updatedate",
        "bommatdet_count",
        "bomdlabordet_count",
        "bommohdet_count",
        "porder_count",
        "delete_status",
    ]
    sheet_rows = [headers] + [[row.get(header, "") for header in headers] for row in rows]
    summary = {
        "TOTAL_FORMULA": len(rows),
        "BISA_HAPUS_FORMULA": sum(1 for row in rows if row.get("delete_status") == "BISA_HAPUS_FORMULA"),
        "SKIP_PORDER": sum(1 for row in rows if row.get("delete_status") == "SKIP_PORDER"),
        "TOTAL_ITEM": len({row.get("itemno", "") for row in rows}),
    }
    summary_rows = [["Status", "Jumlah"], *[[key, value] for key, value in summary.items()]]

    def col_name(index: int) -> str:
        name = ""
        while index:
            index, remainder = divmod(index - 1, 26)
            name = chr(65 + remainder) + name
        return name

    def sheet_xml(values: list[list[object]]) -> str:
        row_nodes = []
        for row_index, row_values in enumerate(values, 1):
            cells = []
            for col_index, value in enumerate(row_values, 1):
                ref = f"{col_name(col_index)}{row_index}"
                if isinstance(value, (int, float)):
                    cells.append(f'<c r="{ref}"><v>{value}</v></c>')
                else:
                    cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value or ""))}</t></is></c>')
            row_nodes.append(f'<row r="{row_index}">{"".join(cells)}</row>')
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
            '<sheet name="Formula" sheetId="2" r:id="rId2"/>'
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
        "xl/worksheets/sheet2.xml": sheet_xml(sheet_rows),
    }
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for filename, content in files.items():
            zf.writestr(filename, content)


def main() -> int:
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    rows = formula_candidates_from_report(input_path)
    write_xlsx(rows, OUTPUT_FILE)
    can_delete = sum(1 for row in rows if row.get("delete_status") == "BISA_HAPUS_FORMULA")
    blocked = sum(1 for row in rows if row.get("delete_status") == "SKIP_PORDER")
    print(f"Formula ditemukan: {len(rows)}")
    print(f"Bisa hapus formula: {can_delete}")
    print(f"Skip karena PORDER: {blocked}")
    print(f"Laporan: {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
