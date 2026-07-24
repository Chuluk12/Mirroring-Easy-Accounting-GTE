"""
Hapus barang yang sudah lolos preview check_delete_barang.py.

Script ini hanya menghapus item dengan status runtime ADA_BISA_HAPUS.
Setiap item dicek ulang tepat sebelum delete. Jika masih ada blocker, item di-skip.
"""

from __future__ import annotations

import sys
import zipfile
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

import fdb

from check_delete_barang import (
    CLEANUP_TABLES,
    analyze_items,
    db_config,
    item_reference_columns,
    read_item_codes,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

fdb.load_api("C:/Program Files/Firebird/Firebird_3_0/fbclient.dll")

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = Path(r"C:\Users\HUSNUL\Downloads\code gpp.xlsx")
OUTPUT_FILE = ROOT_DIR / "Laporan Hapus Barang Final.xlsx"


def delete_cleanup_refs(cur, itemno: str) -> dict[str, int]:
    deleted = {}
    for table, column in item_reference_columns(cur):
        if table not in CLEANUP_TABLES:
            continue
        cur.execute(f'DELETE FROM "{table}" WHERE "{column}" = ?', (itemno,))
        deleted[f"{table}.{column}"] = max(int(cur.rowcount or 0), 0)
    return deleted


def delete_one(con, itemno: str) -> tuple[str, str, dict[str, int]]:
    cur = con.cursor()
    status_rows = analyze_items(con, [itemno])
    status = status_rows[0] if status_rows else {}
    if status.get("status") == "SUDAH_TIDAK_ADA":
        return "SUDAH_TIDAK_ADA", str(status.get("reason") or ""), {}
    if status.get("status") != "ADA_BISA_HAPUS":
        return "SKIP_BLOCKER", str(status.get("blocking_refs") or status.get("reason") or ""), {}

    try:
        deleted = delete_cleanup_refs(cur, itemno)
        cur.execute("DELETE FROM ITEM WHERE ITEMNO = ?", (itemno,))
        item_deleted = max(int(cur.rowcount or 0), 0)
        if item_deleted != 1:
            con.rollback()
            return "GAGAL", f"DELETE ITEM affected {item_deleted} rows", deleted
        con.commit()
        deleted["ITEM.ITEMNO"] = item_deleted
        return "BERHASIL_HAPUS", "", deleted
    except Exception as exc:
        con.rollback()
        return "GAGAL", str(exc), {}


def write_report(rows: list[dict[str, object]], output_path: Path) -> Path:
    headers = ["itemno", "description", "result", "message", "deleted_refs"]
    sheet_rows = [headers] + [[row.get(header, "") for header in headers] for row in rows]
    summary = {}
    for row in rows:
        result = str(row.get("result") or "")
        summary[result] = summary.get(result, 0) + 1
    summary_rows = [["Result", "Jumlah"], *[[key, value] for key, value in sorted(summary.items())]]

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
        "xl/worksheets/sheet2.xml": sheet_xml(sheet_rows),
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
    confirm = "--confirm=HAPUS_BARANG" in sys.argv
    if not confirm:
        print("Tambahkan --confirm=HAPUS_BARANG untuk benar-benar menghapus.")
        return 2

    codes, _headers, _item_col = read_item_codes(input_file)
    con = fdb.connect(**db_config())
    results = []
    try:
        current_rows = analyze_items(con, codes)
        safe_rows = [row for row in current_rows if row.get("status") == "ADA_BISA_HAPUS"]
        print(f"Kode unik input: {len(codes)}")
        print(f"Barang yang akan dihapus: {len(safe_rows)}")
        for index, row in enumerate(safe_rows, 1):
            itemno = str(row.get("itemno") or "")
            result, message, deleted = delete_one(con, itemno)
            deleted_text = "; ".join(f"{key}={value}" for key, value in deleted.items() if value)
            print(f"{index:>3}. {itemno} - {result}")
            results.append({
                "itemno": itemno,
                "description": row.get("description") or "",
                "result": result,
                "message": message,
                "deleted_refs": deleted_text,
            })
    finally:
        con.close()

    output_path = write_report(results, OUTPUT_FILE)
    success = sum(1 for row in results if row.get("result") == "BERHASIL_HAPUS")
    skipped = len(results) - success
    print(f"Berhasil hapus: {success}")
    print(f"Gagal/skip: {skipped}")
    print(f"Laporan: {output_path}")
    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
