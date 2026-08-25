import hmac
import hashlib
import json
import os
import re
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta

from flask import Blueprint, g, jsonify, request
from flask_jwt_extended import create_access_token

try:
    from server import redis_client
except ImportError:
    redis_client = None


API_PREFIX = "/api/integration/v1"
COMMON_PARAMS = {
    "offset", "limit", "page", "search", "columns", "sort_by", "sort_order",
    "sortby", "sort",
    "date_from", "date_to", "created_from", "created_to",
}
ALLOWED_PARAMS = {
    "spk": {"search", "date_from", "date_to", "status", "skip_count"},
    "spk-simple": {"search", "date_from", "date_to", "status"},
    "monitoring-formula": {"wodet_id", "qty_only", "skip_count", "no_spk"},
    "standarisasi-material": {"search", "description", "limit", "offset"},
    "stock": {
        "search", "itemno", "description", "description2", "quantity",
        "minimum_qty", "stock_note", "code_product", "cost_description",
        "unit", "category", "sort_field", "sort_order", "date_from", "date_to",
    },
    "stock-item-material": {
        "search", "itemno", "description", "description2", "quantity",
        "minimum_qty", "stock_note", "code_product", "cost_description",
        "unit", "category", "sort_field", "sort_order", "date_from", "date_to", "aggregate",
    },
    "biaya-produksi": {"search", "account", "status"},
    "standarisasi-harga": {"search", "status", "date_from", "date_to"},
    "fifo": {"search", "columns", "date_from", "date_to"},
    "pembelian": {"search", "date_from", "date_to"},
    "saved-reports": {"user"},
    "gl-accounts": {"accounttype", "parentaccount", "suspended"},
}
_RATE_BUCKETS = defaultdict(deque)
_RATE_LOCK = threading.Lock()
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class InvalidReportParameters(ValueError):
    def __init__(self, missing):
        self.missing = missing
        super().__init__(f"Parameter report wajib: {', '.join(missing)}")


def _configured_keys():
    value = os.getenv("EASY_INTEGRATION_API_KEYS", "")
    return [
        key.strip()
        for key in value.split(",")
        if len(key.strip()) >= 32
    ]


def _request_key():
    key = request.headers.get("X-API-Key", "").strip()
    if key:
        return key

    authorization = request.headers.get("Authorization", "").strip()
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return ""


def _key_id(value=None):
    value = value if value is not None else _request_key()
    if not value:
        return "anonymous"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def _rate_identity():
    candidate = _request_key()
    if candidate and any(
        hmac.compare_digest(candidate, key) for key in _configured_keys()
    ):
        return _key_id(candidate)
    return "anonymous"


def _client_ip():
    return request.remote_addr or "unknown"


def _rate_limit():
    try:
        max_requests = max(
            int(os.getenv("EASY_INTEGRATION_RATE_LIMIT_PER_MINUTE", "120")),
            1,
        )
    except ValueError:
        max_requests = 120

    now = time.monotonic()
    window_start = now - 60
    bucket_key = f"{_client_ip()}:{_rate_identity()}"
    with _RATE_LOCK:
        bucket = _RATE_BUCKETS[bucket_key]
        while bucket and bucket[0] <= window_start:
            bucket.popleft()
        if len(bucket) >= max_requests:
            retry_after = max(1, int(60 - (now - bucket[0])))
            return jsonify({
                "success": False,
                "api_version": "v1",
                "error": {
                    "code": "rate_limit_exceeded",
                    "message": "Terlalu banyak request. Silakan coba kembali.",
                },
            }), 429, {"Retry-After": str(retry_after)}
        bucket.append(now)
    return None


def _auth_error():
    configured = _configured_keys()
    if not configured:
        return jsonify({
            "success": False,
            "api_version": "v1",
            "error": {
                "code": "integration_not_configured",
                "message": "Integration API belum dikonfigurasi",
            },
        }), 503

    candidate = _request_key()
    if not candidate or not any(
        hmac.compare_digest(candidate, key) for key in configured
    ):
        return jsonify({
            "success": False,
            "api_version": "v1",
            "error": {
                "code": "invalid_api_key",
                "message": "API key tidak valid",
            },
        }), 401
    return None


def _unknown_params(resource):
    allowed = ALLOWED_PARAMS[resource] | COMMON_PARAMS
    unknown = sorted(set(request.args) - allowed)
    if not unknown:
        return None
    return jsonify({
        "success": False,
        "api_version": "v1",
        "resource": resource,
        "error": {
            "code": "unsupported_parameters",
            "message": f"Parameter tidak didukung: {', '.join(unknown)}",
        },
    }), 400


def _pagination():
    try:
        limit = min(max(int(request.args.get("limit", 100)), 1), 500)
        page_value = request.args.get("page")
        if page_value not in (None, ""):
            page = max(int(page_value), 1)
            offset = (page - 1) * limit
        else:
            offset = max(int(request.args.get("offset", 0)), 0)
        return offset, limit, None
    except (TypeError, ValueError):
        return 0, 100, (
            jsonify({
                "success": False,
                "api_version": "v1",
                "error": {
                    "code": "invalid_pagination",
                    "message": "offset, limit, dan page harus berupa angka",
                },
            }),
            400,
        )


def _parse_created_date(value):
    value = str(value or "").strip()
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value[:len(fmt)], fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _created_at_filters():
    created_from = _parse_created_date(request.args.get("created_from", ""))
    created_to = _parse_created_date(request.args.get("created_to", ""))
    if created_to and len(request.args.get("created_to", "")) <= 10:
        created_to = created_to.replace(hour=23, minute=59, second=59, microsecond=999999)
    return created_from, created_to


def _filter_created_at_rows(rows):
    created_from, created_to = _created_at_filters()
    if not created_from and not created_to:
        return rows
    filtered = []
    for row in rows:
        created_at = _parse_created_date(row.get("created_at") if isinstance(row, dict) else "")
        if not created_at:
            continue
        if created_from and created_at < created_from:
            continue
        if created_to and created_at > created_to:
            continue
        filtered.append(row)
    return filtered


def _date_filters():
    date_from = _parse_created_date(request.args.get("date_from", ""))
    date_to = _parse_created_date(request.args.get("date_to", ""))
    if date_to and len(request.args.get("date_to", "")) <= 10:
        date_to = date_to.replace(hour=23, minute=59, second=59, microsecond=999999)
    return date_from, date_to


def _row_date_value(row):
    if not isinstance(row, dict):
        return None
    preferred = (
        "tanggal", "tgl", "date", "created_at", "tgl_faktur", "tanggal_gp",
        "tgl_hasil", "tgl_pengiriman", "tgl_pesanan", "tgl_pembelian",
    )
    keys = list(preferred) + [
        key for key in row
        if any(token in str(key).lower() for token in ("date", "tgl", "tanggal"))
    ]
    for key in keys:
        if key in row:
            parsed = _parse_created_date(row.get(key))
            if parsed:
                return parsed
    return None


def _filter_date_rows(rows, resource):
    if "date_from" in ALLOWED_PARAMS[resource] or "date_to" in ALLOWED_PARAMS[resource]:
        return rows
    date_from, date_to = _date_filters()
    if not date_from and not date_to:
        return rows
    filtered = []
    for row in rows:
        row_date = _row_date_value(row)
        if not row_date:
            filtered.append(row)
            continue
        if date_from and row_date < date_from:
            continue
        if date_to and row_date > date_to:
            continue
        filtered.append(row)
    return filtered


def _split_csv_param(name):
    return [
        item.strip()
        for value in request.args.getlist(name)
        for item in str(value or "").split(",")
        if item.strip()
    ]


def _filter_search_rows(rows):
    search = str(request.args.get("search", "") or "").strip().lower()
    if not search:
        return rows
    filtered = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if any(search in str(value or "").lower() for value in row.values()):
            filtered.append(row)
    return filtered


def _sort_rows(rows):
    sort_by = str(
        request.args.get("sort_by", "") or request.args.get("sortby", "") or ""
    ).strip()
    if not sort_by:
        return rows
    reverse = str(
        request.args.get("sort_order", "") or request.args.get("sort", "") or ""
    ).strip().lower() in {"desc", "descend", "descending"}

    def sort_value(row):
        value = row.get(sort_by) if isinstance(row, dict) else ""
        if isinstance(value, (int, float)):
            return (0, value)
        text = str(value or "").strip()
        try:
            return (0, float(text.replace(",", ".")))
        except ValueError:
            return (1, text.lower())

    return sorted(rows, key=sort_value, reverse=reverse)


def _select_columns(rows):
    columns = _split_csv_param("columns")
    if not columns:
        return rows
    return [
        {key: row.get(key) for key in columns if isinstance(row, dict) and key in row}
        for row in rows
    ]


def _json_value(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if value.__class__.__name__ == "Decimal":
        return float(value)
    return value


def _json_rows(rows):
    return [
        {key: _json_value(value) for key, value in row.items()}
        for row in rows
        if isinstance(row, dict)
    ]


def _filter_column_rows(rows, reserved):
    filters = {
        key: values
        for key in request.args
        if key not in reserved
        for values in [_split_csv_param(key)]
        if values
    }
    if not filters:
        return rows
    filtered = []
    for row in rows:
        if all(
            any(str(value).lower() in str(row.get(key, "")).lower() for value in values)
            for key, values in filters.items()
        ):
            filtered.append(row)
    return filtered


def _filter_report_user_rows(rows):
    user = str(request.args.get("user", "") or "").strip().lower()
    if not user:
        return rows
    filtered = []
    for row in rows:
        if user in str(row.get("username") or row.get("user") or row.get("userid") or "").lower():
            filtered.append(row)
    return filtered


def _user_can_access_report(report):
    user = str(request.args.get("user", "") or "").strip()
    if not user:
        return True
    level = str(report.get("level") or "").upper()
    return not level or user.upper() in level


def _shape_rows(rows, resource, select_columns=True):
    shaped = _filter_created_at_rows(rows)
    shaped = _filter_date_rows(shaped, resource)
    if "search" not in ALLOWED_PARAMS[resource]:
        shaped = _filter_search_rows(shaped)
    shaped = _sort_rows(shaped)
    return _select_columns(shaped) if select_columns else shaped


def _internal_get(app, path, query_params):
    token = create_access_token(
        identity="integration-calculator",
        additional_claims={
            "id": 0,
            "name": "Calculator Integration",
            "role": "admin",
            "permissions": [],
        },
        expires_delta=timedelta(minutes=2),
    )
    response = app.test_client().get(
        path,
        query_string=query_params,
        headers={"Authorization": f"Bearer {token}"},
    )
    return response.status_code, response.get_json(silent=True) or {}


def _fetch_saved_reports(user=""):
    from server import connect_easy_db

    con = connect_easy_db()
    try:
        cur = con.cursor()
        params = []
        user = str(user or "").strip()
        user_filter = ""
        if user:
            user_filter = "AND (level IS NULL OR level = '' OR UPPER(level) CONTAINING UPPER(?))"
            params.append(user)
        cur.execute(f"""
            SELECT *
            FROM REPORTFORMAT
            WHERE report_cat_id = 20 AND type = 1
              {user_filter}
            ORDER BY seq, report_id
        """, params)
        columns = [desc[0].lower() for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]
    finally:
        con.close()


def _fetch_saved_report(report_id):
    rows = [row for row in _fetch_saved_reports() if int(row.get("report_id") or 0) == report_id]
    return rows[0] if rows else None


def _fetch_report_fields(report_id):
    from server import connect_easy_db

    con = connect_easy_db()
    try:
        cur = con.cursor()
        cur.execute(
            "SELECT * FROM MEMORIZEFIELD WHERE report_id = ? ORDER BY ordering, field_id",
            (report_id,),
        )
        columns = [desc[0].lower() for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]
    finally:
        con.close()


def _resolve_glaccount_param(report):
    explicit = str(request.args.get("glaccount", "") or "").strip()
    if explicit:
        return explicit

    title = str(report.get("report_title") or report.get("report_title_ind") or "")
    candidates = [part.strip() for part in title.split("-") if part.strip()]
    candidates.append(str(request.args.get("search", "") or "").strip())

    from server import connect_easy_db

    con = connect_easy_db()
    try:
        cur = con.cursor()
        for candidate in candidates:
            if not candidate:
                continue
            cur.execute("""
                SELECT glaccount
                FROM GLACCNT
                WHERE UPPER(accountname) = UPPER(?) OR UPPER(accountname2) = UPPER(?)
                ROWS 1
            """, (candidate, candidate))
            row = cur.fetchone()
            if row:
                return row[0]
        for candidate in candidates:
            if not candidate:
                continue
            cur.execute("""
                SELECT glaccount
                FROM GLACCNT
                WHERE accountname CONTAINING ? OR accountname2 CONTAINING ?
                ORDER BY CHAR_LENGTH(accountname)
                ROWS 1
            """, (candidate, candidate))
            row = cur.fetchone()
            if row:
                return row[0]
    finally:
        con.close()
    return ""


def _account_names_by_glaccount(accounts):
    accounts = sorted({str(value or "").strip() for value in accounts if str(value or "").strip()})
    if not accounts:
        return {}
    from server import connect_easy_db

    con = connect_easy_db()
    try:
        cur = con.cursor()
        placeholders = ", ".join("?" for _ in accounts)
        cur.execute(f"SELECT glaccount, accountname FROM GLACCNT WHERE glaccount IN ({placeholders})", accounts)
        return {row[0]: row[1] for row in cur.fetchall()}
    finally:
        con.close()


def _enrich_report_rows(report, rows):
    if str(report.get("table") or "").upper() != "LOOKUP_GLDETIL":
        return rows
    names = _account_names_by_glaccount(row.get("glaccount") for row in rows)
    for row in rows:
        row["accountname"] = names.get(row.get("glaccount"), "")
        row["amount"] = (row.get("bdebit") or 0) - (row.get("bcredit") or 0)
    return rows


def _effective_report_dates(report):
    parameter = str(report.get("parameter") or "").upper()
    return (
        request.args.get("date_from", "") or ("1900-01-01" if "PARAMDATE1" in parameter else ""),
        request.args.get("date_to", "") or ("2099-12-31" if "PARAMDATE2" in parameter else ""),
    )


def _execute_saved_report(report, date_from="", date_to=""):
    from server import connect_easy_db

    source = str(report.get("table") or "").strip()
    if not _SAFE_IDENTIFIER.match(source):
        raise ValueError("Invalid report source")

    parameter = str(report.get("parameter") or "").strip()
    tokens = []
    if parameter.startswith("(") and parameter.endswith(")"):
        tokens = [token.strip() for token in parameter[1:-1].split(",") if token.strip()]

    params = []
    missing = []
    for token in tokens:
        normalized = token.lstrip(":").strip().lower()
        if normalized == "paramdate1":
            value = date_from
            name = "date_from"
        elif normalized == "paramdate2":
            value = date_to
            name = "date_to"
        elif normalized == "bahasa":
            value = request.args.get("bahasa", request.args.get("language", "1"))
            name = "bahasa"
        else:
            name = normalized.split(".")[-1]
            value = _resolve_glaccount_param(report) if name == "glaccount" else request.args.get(name, "")
        if name == "date_from" and not value:
            value = "1900-01-01"
        if name == "date_to" and not value:
            value = "2099-12-31"
        if value in (None, ""):
            missing.append(name)
        params.append(value)
    if missing:
        raise InvalidReportParameters(missing)

    if params:
        placeholders = ", ".join("?" for _ in params)
        sql = f"SELECT * FROM {source}({placeholders})"
    else:
        sql = f"SELECT * FROM {source}"

    con = connect_easy_db()
    try:
        cur = con.cursor()
        cur.execute(sql, params)
        columns = [desc[0].lower() for desc in cur.description]
        return _enrich_report_rows(report, [dict(zip(columns, row)) for row in cur.fetchall()])
    finally:
        con.close()


def _fetch_gl_accounts(offset, limit):
    from server import connect_easy_db

    search = str(request.args.get("search", "") or "").strip()
    conditions = []
    params = []
    if search:
        conditions.append("(glaccount CONTAINING ? OR accountname CONTAINING ? OR accountname2 CONTAINING ?)")
        params.extend([search, search, search])
    for key in ("accounttype", "parentaccount", "suspended"):
        value = str(request.args.get(key, "") or "").strip()
        if value:
            conditions.append(f"{key} = ?")
            params.append(value)
    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    con = connect_easy_db()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT COUNT(*) FROM GLACCNT {where_sql}", params)
        total = int(cur.fetchone()[0] or 0)
        cur.execute(f"""
            SELECT glaccount, accountname, accountname2, accounttype,
                   parentaccount, suspended, allusers
            FROM GLACCNT
            {where_sql}
            ORDER BY glaccount
            ROWS ? TO ?
        """, params + [offset + 1, offset + limit])
        columns = [desc[0].lower() for desc in cur.description]
        return total, [dict(zip(columns, row)) for row in cur.fetchall()]
    finally:
        con.close()


def _gl_accounts_response(offset, limit):
    total, rows = _fetch_gl_accounts(offset, limit)
    rows = _shape_rows(_json_rows(rows), "gl-accounts")
    return {
        "success": True,
        "api_version": "v1",
        "resource": "gl-accounts",
        "generated_at": datetime.now().astimezone().isoformat(),
        "data": rows,
        "meta": {
            "offset": offset,
            "page": (offset // limit) + 1 if limit else 1,
            "limit": limit,
            "count": len(rows),
            "total": total,
            "total_page": ((total + limit - 1) // limit) if limit else 1,
            "has_more": offset + len(rows) < total,
            "search": request.args.get("search", ""),
        },
    }, 200


def _saved_reports_response(offset, limit):
    rows = _shape_rows(_fetch_saved_reports(request.args.get("user", "")), "saved-reports")
    total = len(rows)
    data = rows[offset:offset + limit]
    page = (offset // limit) + 1 if limit else 1
    return {
        "success": True,
        "api_version": "v1",
        "resource": "saved-reports",
        "generated_at": datetime.now().astimezone().isoformat(),
        "data": data,
        "meta": {
            "offset": offset,
            "page": page,
            "limit": limit,
            "count": len(data),
            "total": total,
            "total_page": ((total + limit - 1) // limit) if limit else 1,
            "has_more": offset + len(data) < total,
            "user": request.args.get("user", ""),
            "date_from": request.args.get("date_from", ""),
            "date_to": request.args.get("date_to", ""),
        },
    }, 200


def _saved_report_list_response(report_id, offset, limit):
    report = _fetch_saved_report(report_id)
    if not report:
        return jsonify({
            "success": False,
            "api_version": "v1",
            "resource": "saved-report-list",
            "error": {"code": "not_found", "message": "Report tidak ditemukan"},
        }), 404
    if not _user_can_access_report(report):
        return jsonify({
            "success": False,
            "api_version": "v1",
            "resource": "saved-report-list",
            "error": {"code": "access_denied", "message": "User tidak punya akses report"},
        }), 403

    date_from, date_to = _effective_report_dates(report)
    rows = _execute_saved_report(report, date_from, date_to)
    rows = _json_rows(rows)
    rows = _filter_report_user_rows(rows)
    rows = _filter_date_rows(rows, "saved-reports")
    reserved = COMMON_PARAMS | {"user", "bahasa", "language"}
    rows = _filter_column_rows(rows, reserved)
    rows = _select_columns(_sort_rows(rows))
    total = len(rows)
    data = rows[offset:offset + limit]
    return jsonify({
        "success": True,
        "api_version": "v1",
        "resource": "saved-report-list",
        "generated_at": datetime.now().astimezone().isoformat(),
        "report": {
            "report_id": report.get("report_id"),
            "report_name": report.get("report_name"),
            "report_title": report.get("report_title"),
            "report_title_ind": report.get("report_title_ind"),
            "source": report.get("table"),
            "parameter": report.get("parameter"),
            "fields": _json_rows(_fetch_report_fields(report_id)),
        },
        "data": data,
        "meta": {
            "offset": offset,
            "page": (offset // limit) + 1 if limit else 1,
            "limit": limit,
            "count": len(data),
            "total": total,
            "total_page": ((total + limit - 1) // limit) if limit else 1,
            "has_more": offset + len(data) < total,
            "date_from": date_from,
            "date_to": date_to,
        },
    }), 200

def _internal_post(app, path, json_data):
    token = create_access_token(
        identity="integration-calculator",
        additional_claims={
            "id": 0,
            "name": "Calculator Integration",
            "role": "admin",
            "permissions": [],
        },
        expires_delta=timedelta(minutes=2),
    )
    response = app.test_client().post(
        path,
        json=json_data,
        headers={"Authorization": f"Bearer {token}"},
    )
    return response.status_code, response.get_json(silent=True) or {}

def _query_params(resource, offset, limit):
    params = []
    for key in sorted(ALLOWED_PARAMS[resource]):
        if key in COMMON_PARAMS:
            continue
        for value in request.args.getlist(key):
            params.append((key, value))
    if "search" in ALLOWED_PARAMS[resource]:
        for value in request.args.getlist("search"):
            params.append(("search", value))
    for key in ("date_from", "date_to"):
        if key in ALLOWED_PARAMS[resource]:
            for value in request.args.getlist(key):
                params.append((key, value))
    params.extend([("offset", offset), ("limit", limit)])
    if resource == "spk":
        params.append(("skip_count", "1"))
    if resource in {"stock", "stock-item-material"}:
        params.append(("include_total", "1"))
    return params


def _error_response(resource, status_code, upstream):
    if status_code == 404:
        message = upstream.get("message") or "Data tidak ditemukan"
        code = "not_found"
    elif status_code == 400:
        message = upstream.get("error") or upstream.get("message") or "Parameter request tidak valid"
        code = "invalid_parameters"
    elif status_code in {401, 403}:
        message = "Akses ke sumber data ditolak"
        code = "upstream_access_denied"
    else:
        message = "Gagal mengambil data dari sumber internal"
        code = "upstream_error"
    return jsonify({
        "success": False,
        "api_version": "v1",
        "resource": resource,
        "error": {
            "code": code,
            "message": message,
        },
    }), status_code if status_code >= 400 else 500


def _success_response(resource, upstream, offset, limit):
    if isinstance(upstream, list):
        shaped_rows = _shape_rows(upstream, resource, select_columns=False)
        rows = _select_columns(shaped_rows)
        total = len(rows)
        extra = {}
    else:
        original_rows = upstream.get("data", [])
        if resource == "stock-item-material":
            fields = (
                "category", "cost_description", "description", "description2",
                "harga_awal", "harga_terakhir", "harga_baru",
                "itemno", "last_updated_txdate", "minimum_qty",
                "no_stb", "quantity", "unit", "satuan_1", "stok_satuan_1",
                "satuan_2", "stok_satuan_2", "satuan_3", "stok_satuan_3",
                "total_nilai_stock",
            )
            original_rows = [{key: row.get(key) for key in fields} for row in original_rows]
        shaped_rows = _shape_rows(original_rows, resource, select_columns=False)
        rows = _select_columns(shaped_rows)
        filtered_locally = bool(
            request.args.get("created_from")
            or request.args.get("created_to")
            or ((request.args.get("date_from") or request.args.get("date_to")) and "date_from" not in ALLOWED_PARAMS[resource])
            or (request.args.get("search") and "search" not in ALLOWED_PARAMS[resource])
        )
        total = None if upstream.get("total") is None else (
            len(shaped_rows) if filtered_locally else int(upstream.get("total", len(original_rows)) or 0)
        )
        extra = {
            key: value
            for key, value in upstream.items()
            if key not in {"data", "total", "error"}
        }

    page = (offset // limit) + 1 if limit else 1
    total_page = ((total + limit - 1) // limit) if limit and total is not None else None
    has_more = upstream.get("has_more") if isinstance(upstream, dict) else None

    return {
        "success": True,
        "api_version": "v1",
        "resource": resource,
        "generated_at": datetime.now().astimezone().isoformat(),
        "data": rows,
        "meta": {
            "offset": offset,
            "page": page,
            "limit": limit,
            "count": len(rows),
            "total": total,
            "total_page": total_page,
            "has_more": bool(has_more) if has_more is not None else offset + len(rows) < total,
            **extra,
        },
    }, 200


def register_integration_api(app):
    blueprint = Blueprint("integration_api", __name__)

    @blueprint.before_request
    def before_integration_request():
        g.integration_started_at = time.perf_counter()
        supplied_request_id = request.headers.get("X-Request-ID", "").strip()
        g.integration_request_id = (
            supplied_request_id[:100] if supplied_request_id else str(uuid.uuid4())
        )
        if request.method == "OPTIONS":
            return None
        return _rate_limit()

    @blueprint.after_request
    def after_integration_request(response):
        elapsed_ms = (
            time.perf_counter() - getattr(
                g, "integration_started_at", time.perf_counter()
            )
        ) * 1000
        request_id = getattr(g, "integration_request_id", str(uuid.uuid4()))
        response.headers["X-Request-ID"] = request_id
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        app.logger.info(
            "request_id=%s method=%s path=%s status=%s elapsed_ms=%.1f "
            "client_ip=%s key_id=%s",
            request_id,
            request.method,
            request.path,
            response.status_code,
            elapsed_ms,
            _client_ip(),
            _key_id(),
        )
        return response

    def list_resource(resource, internal_path):
        auth_error = _auth_error()
        if auth_error:
            return auth_error

        parameter_error = _unknown_params(resource)
        if parameter_error:
            return parameter_error

        offset, limit, pagination_error = _pagination()
        if pagination_error:
            return pagination_error

        cache_key = None
        if redis_client and request.method == "GET":
            raw_key = f"{resource}|{request.query_string.decode('utf-8', errors='replace')}"
            cache_key = f"integration:v1:{hashlib.sha256(raw_key.encode()).hexdigest()[:32]}"
            try:
                cached = redis_client.get(cache_key)
                if cached:
                    return jsonify(json.loads(cached))
            except Exception:
                pass

        status_code, upstream = _internal_get(
            app,
            internal_path,
            _query_params(resource, offset, limit),
        )
        if status_code >= 400 or upstream.get("error"):
            return _error_response(resource, status_code, upstream)
        response_data, status = _success_response(resource, upstream, offset, limit)

        if cache_key and redis_client:
            try:
                redis_client.setex(
                    cache_key,
                    int(os.getenv("EASY_INTEGRATION_CACHE_TTL_SECONDS", "60")),
                    json.dumps(response_data),
                )
            except Exception:
                pass

        return jsonify(response_data), status

    @blueprint.get("/health")
    def health():
        auth_error = _auth_error()
        if auth_error:
            return auth_error
        return jsonify({
            "success": True,
            "api_version": "v1",
            "service": "easy-dashboard-integration",
            "status": "ready",
            "generated_at": datetime.now().astimezone().isoformat(),
        })

    @blueprint.get("/spk")
    def spk():
        return list_resource("spk", "/api/spk")

    @blueprint.get("/spk/detail/<path:no_spk>")
    def spk_detail(no_spk):
        auth_error = _auth_error()
        if auth_error:
            return auth_error

        offset, limit, pagination_error = _pagination()
        if pagination_error:
            return pagination_error

        columns_param = request.args.get("column", "").strip()
        requested_cols = {c.strip() for c in columns_param.split(",") if c.strip()} if columns_param else None

        params = [("no_spk", no_spk), ("offset", offset), ("limit", limit)]
        for key in ("search", "sort_by", "sort_order"):
            value = request.args.get(key, "").strip()
            if value:
                params.append((key, value))
        
        # If specific columns requested and we don't need heavy computations
        if requested_cols:
            heavy_keys = {
                "materials", "production_details", "wip_reconciliation",
                "formula_material_cost", "formula_production_cost", "formula_total_cost",
                "spk_material_cost", "spk_production_cost", "spk_total_cost",
                "hpp_total_actual", "hpp_per_unit", "hpp_per_unit_spk",
                "material_cost_diff", "production_cost_diff", "total_cost_diff"
            }
            if not requested_cols.intersection(heavy_keys):
                params.append(("qty_only", "1"))
            
        status_code, upstream = _internal_get(
            app,
            "/api/monitoring-formula",
            params
        )
        if status_code >= 400 or upstream.get("error"):
            return _error_response("spk_detail", status_code, upstream)
            
        # Ensure exact match on SPK Number since 'search' uses LIKE / CONTAINING
        rows = upstream.get("data", [])
        data = [r for r in rows if str(r.get("no_spk", "")).strip() == no_spk.strip()]
        total = int(upstream.get("total", len(data)) or 0)
        
        if not data:
            return jsonify({
                "success": False,
                "api_version": "v1",
                "resource": "spk_detail",
                "error": {
                    "code": "not_found",
                    "message": "Data tidak ditemukan"
                }
            }), 404

        if requested_cols:
            data = [
                {k: v for k, v in item.items() if k in requested_cols}
                for item in data
            ]

        return jsonify({
            "success": True,
            "api_version": "v1",
            "resource": "spk_detail",
            "generated_at": datetime.now().astimezone().isoformat(),
            "data": data,
            "meta": {
                "page": (offset // limit) + 1,
                "limit": limit,
                "count": len(data),
                "total": total,
                "total_page": (total + limit - 1) // limit,
                "has_more": offset + len(data) < total,
                "search": request.args.get("search", ""),
                "sort_by": request.args.get("sort_by", ""),
                "sort_order": request.args.get("sort_order", ""),
            }
        })

    @blueprint.get("/spk-simple")
    def spk_simple():
        return list_resource("spk-simple", "/api/spk-simple")

    @blueprint.get("/monitoring-formula")
    def monitoring_formula():
        return list_resource("monitoring-formula", "/api/monitoring-formula")

    @blueprint.get("/stock-item-material")
    def stock_item_material():
        return list_resource("stock-item-material", "/api/stock-item-material")

    @blueprint.get("/stock")
    def stock():
        return list_resource("stock", "/api/stock")

    @blueprint.get("/biaya-produksi")
    def biaya_produksi():
        return list_resource("biaya-produksi", "/api/biaya-produksi")

    @blueprint.get("/standarisasi-harga")
    def standarisasi_harga():
        return list_resource("standarisasi-harga", "/api/standarisasi-harga")

    @blueprint.get("/fifo")
    def fifo():
        return list_resource("fifo", "/api/fifo")

    @blueprint.get("/pembelian")
    def pembelian():
        return list_resource("pembelian", "/api/pembelian")

    @blueprint.get("/saved-reports")
    def saved_reports():
        auth_error = _auth_error()
        if auth_error:
            return auth_error

        parameter_error = _unknown_params("saved-reports")
        if parameter_error:
            return parameter_error

        offset, limit, pagination_error = _pagination()
        if pagination_error:
            return pagination_error

        try:
            response_data, status = _saved_reports_response(offset, limit)
        except Exception:
            app.logger.exception("Failed fetching saved reports")
            return _error_response("saved-reports", 500, {})
        return jsonify(response_data), status

    @blueprint.get("/saved-reports/<int:report_id>/list")
    def saved_report_list(report_id):
        auth_error = _auth_error()
        if auth_error:
            return auth_error

        offset, limit, pagination_error = _pagination()
        if pagination_error:
            return pagination_error

        try:
            return _saved_report_list_response(report_id, offset, limit)
        except InvalidReportParameters as exc:
            return jsonify({
                "success": False,
                "api_version": "v1",
                "resource": "saved-report-list",
                "error": {
                    "code": "missing_report_parameters",
                    "message": str(exc),
                    "missing": exc.missing,
                },
            }), 400
        except Exception:
            app.logger.exception("Failed fetching saved report list")
            return _error_response("saved-report-list", 500, {})

    @blueprint.get("/gl-accounts")
    def gl_accounts():
        auth_error = _auth_error()
        if auth_error:
            return auth_error

        parameter_error = _unknown_params("gl-accounts")
        if parameter_error:
            return parameter_error

        offset, limit, pagination_error = _pagination()
        if pagination_error:
            return pagination_error

        try:
            response_data, status = _gl_accounts_response(offset, limit)
        except Exception:
            app.logger.exception("Failed fetching GL accounts")
            return _error_response("gl-accounts", 500, {})
        return jsonify(response_data), status

    @blueprint.get("/standarisasi-harga/<int:standar_id>/details")
    def standarisasi_harga_details(standar_id):
        auth_error = _auth_error()
        if auth_error:
            return auth_error

        if request.args:
            return jsonify({
                "success": False,
                "api_version": "v1",
                "resource": "standarisasi-harga-details",
                "error": {
                    "code": "unsupported_parameters",
                    "message": (
                        "Endpoint detail tidak menerima query parameter"
                    ),
                },
            }), 400

        status_code, upstream = _internal_get(
            app,
            f"/api/standarisasi-harga/{standar_id}/details",
            [],
        )
        if status_code >= 400 or upstream.get("error"):
            return _error_response(
                "standarisasi-harga-details",
                status_code,
                upstream,
            )

        rows = upstream.get("data", [])
        return jsonify({
            "success": True,
            "api_version": "v1",
            "resource": "standarisasi-harga-details",
            "generated_at": datetime.now().astimezone().isoformat(),
            "data": rows,
            "meta": {
                "standar_id": standar_id,
                "count": len(rows),
                "total": int(upstream.get("total", len(rows)) or 0),
            },
        })

    @blueprint.get("/standarisasi-material")
    def standarisasi_material():
        return list_resource("standarisasi-material", "/api/standarisasi-material")

    @blueprint.post("/material-prices/bulk")
    def material_prices_bulk():
        auth_error = _auth_error()
        if auth_error:
            return auth_error
            
        payload = request.get_json(silent=True) or {}
        part_numbers = payload.get("part_numbers")
        
        if not isinstance(part_numbers, list):
            return jsonify({
                "success": False,
                "api_version": "v1",
                "resource": "material-prices-bulk",
                "error": {
                    "code": "invalid_parameters",
                    "message": "Parameter part_numbers harus berupa array of strings",
                },
            }), 400
            
        status_code, upstream = _internal_post(
            app,
            "/api/standarisasi-material/bulk",
            {"part_numbers": part_numbers}
        )
        
        if status_code >= 400 or upstream.get("error"):
            return _error_response("material-prices-bulk", status_code, upstream)
            
        rows = upstream.get("data", [])
        return jsonify({
            "success": True,
            "api_version": "v1",
            "resource": "material-prices-bulk",
            "generated_at": datetime.now().astimezone().isoformat(),
            "data": rows,
            "meta": {
                "count": len(rows),
                "total": len(rows),
            },
        })

    app.register_blueprint(blueprint, url_prefix=API_PREFIX)
