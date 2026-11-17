import argparse
import asyncio
import json
import os
import uuid

import fdb
import nats

import server


SAMPLE_ROW = {
    "wodet_id": 999999,
    "no_perintah_kerja": "GTE-SPK-2026110",
    "no_pesanan": "GTE-SO-TEST",
    "no_po": "GTE-PO-TEST",
    "tanggal": "2026-11-17",
    "estimasi_selesai": "2026-11-20",
    "tgl_selesai_produksi": "",
    "deskripsi_pekerjaan": "NATS test item",
    "no_barang": "GTE-EJF-20255",
    "nama_barang": "NATS test production item",
    "qty": 100.0,
    "uom": "PCS",
    "qty_hasil_produksi": 40.0,
    "production_status": "In Progress",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Publish one SPK summary test snapshot to NATS."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--sample",
        action="store_true",
        help="Publish sample GTE-SPK-2026110 / GTE-EJF-20255 payload.",
    )
    source.add_argument(
        "--firebird",
        action="store_true",
        help="Read one production item from Firebird.",
    )
    parser.add_argument("--no-spk", help="Exact SPK number for --firebird.")
    parser.add_argument("--itemno", help="Exact production item for --firebird.")
    parser.add_argument(
        "--subject",
        default=os.getenv(
            "NATS_PRODUCTION_SUBJECT", "production.spk.summary"
        ) + ".replace",
    )
    return parser.parse_args()


def read_one_firebird_row(no_spk=None, itemno=None):
    conditions = []
    params = []
    if no_spk:
        conditions.append("w.WONO = ?")
        params.append(no_spk)
    if itemno:
        conditions.append("det.ITEMNO = ?")
        params.append(itemno)

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    con = fdb.connect(**server.DB_CONFIG)
    try:
        cur = con.cursor()
        cur.execute(f"""
            SELECT FIRST 1
                det.ID AS WODET_ID,
                w.WONO,
                w.WODATE,
                w.EXPECTEDDATE,
                w.DESCRIPTION,
                det.ITEMNO,
                det.JOBDESCRIPTION,
                det.QUANTITY,
                det.UNIT,
                det.STATUS,
                i.ITEMDESCRIPTION,
                i.TIPEPERSEDIAAN,
                so.SONO,
                so.PONO,
                (SELECT MAX(pr.RESULTDATE)
                 FROM PRODRESULTDET prd
                 JOIN PRODRESULT pr ON pr.ID = prd.PRODRESULTID
                 WHERE prd.WODETID = det.ID),
                (SELECT SUM(COALESCE(prd.QUANTITY, 0))
                 FROM PRODRESULTDET prd
                 WHERE prd.WODETID = det.ID)
            FROM WO w
            LEFT JOIN WODET det ON det.WOID = w.ID
            LEFT JOIN SO so ON so.SOID = det.SOID
            LEFT JOIN ITEM i ON i.ITEMNO = det.ITEMNO
            {where_sql}
            ORDER BY w.WODATE DESC, w.WONO, det.NOJOB, det.ID
        """, params)
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Tidak ada production item yang cocok di Firebird")
        return server._spk_summary_row(row)
    finally:
        con.close()


async def publish(row, subject):
    snapshot_id = f"spk-test-{uuid.uuid4().hex[:8]}"
    payload = {
        "schema_version": 1,
        "event_type": "spk.summary.snapshot",
        "action": "replace",
        "snapshot_id": snapshot_id,
        "generated_at": "2026-11-17T00:00:00Z",
        "chunk_index": 0,
        "chunk_total": 1,
        "total_rows": 1,
        "data": [row],
    }

    options = {
        "servers": os.getenv("NATS_URL", "nats://localhost:4222"),
        "name": "easy-accounting-spk-test-publisher",
    }
    user = os.getenv("NATS_USER", "").strip()
    if user:
        options["user"] = user
        options["password"] = os.getenv("NATS_PASSWORD", "")

    nc = await nats.connect(**options)
    try:
        await nc.publish(subject, json.dumps(payload, default=str).encode("utf-8"))
        await nc.flush()
        print(json.dumps({"subject": subject, "payload": payload}, indent=2))
    finally:
        await nc.close()


def main():
    args = parse_args()
    row = SAMPLE_ROW
    if args.firebird:
        row = read_one_firebird_row(args.no_spk, args.itemno)
    elif not args.sample:
        print("Default: sample payload. Use --firebird to read Firebird.")

    asyncio.run(publish(row, args.subject))


if __name__ == "__main__":
    main()
