import hmac
import hashlib
import os
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta

from flask import Blueprint, g, jsonify, request
from flask_jwt_extended import create_access_token


API_PREFIX = "/api/integration/v1"
COMMON_PARAMS = {"offset", "limit"}
ALLOWED_PARAMS = {
    "spk": {"search", "date_from", "date_to", "status"},
    "spk-simple": {"search", "date_from", "date_to", "status"},
    "monitoring-formula": {"wodet_id", "qty_only", "skip_count"},
    "stock": {
        "search", "itemno", "description", "description2", "quantity",
        "minimum_qty", "stock_note", "code_product", "cost_description",
        "unit", "category", "sort_field", "sort_order",
    },
    "biaya-produksi": {"search", "account", "status"},
    "standarisasi-harga": {"search", "status", "date_from", "date_to"},
}
_RATE_BUCKETS = defaultdict(deque)
_RATE_LOCK = threading.Lock()


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
        offset = max(int(request.args.get("offset", 0)), 0)
        limit = min(max(int(request.args.get("limit", 100)), 1), 500)
        return offset, limit, None
    except (TypeError, ValueError):
        return 0, 100, (
            jsonify({
                "success": False,
                "api_version": "v1",
                "error": {
                    "code": "invalid_pagination",
                    "message": "offset dan limit harus berupa angka",
                },
            }),
            400,
        )


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


def _query_params(resource, offset, limit):
    params = []
    for key in sorted(ALLOWED_PARAMS[resource]):
        for value in request.args.getlist(key):
            params.append((key, value))
    params.extend([("offset", offset), ("limit", limit)])
    if resource == "stock":
        params.append(("include_total", "1"))
    return params


def _error_response(resource, status_code, upstream):
    if status_code == 404:
        message = upstream.get("message") or "Data tidak ditemukan"
        code = "not_found"
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
        rows = upstream
        total = len(rows)
        extra = {}
    else:
        rows = upstream.get("data", [])
        total = int(upstream.get("total", len(rows)) or 0)
        extra = {
            key: value
            for key, value in upstream.items()
            if key not in {"data", "total", "error"}
        }

    return jsonify({
        "success": True,
        "api_version": "v1",
        "resource": resource,
        "generated_at": datetime.now().astimezone().isoformat(),
        "data": rows,
        "meta": {
            "offset": offset,
            "limit": limit,
            "count": len(rows),
            "total": total,
            "has_more": offset + len(rows) < total,
            **extra,
        },
    })


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

        status_code, upstream = _internal_get(
            app,
            internal_path,
            _query_params(resource, offset, limit),
        )
        if status_code >= 400 or upstream.get("error"):
            return _error_response(resource, status_code, upstream)
        return _success_response(resource, upstream, offset, limit)

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

    @blueprint.get("/spk/detail/<int:wodet_id>")
    def spk_detail(wodet_id):
        auth_error = _auth_error()
        if auth_error:
            return auth_error
            
        status_code, upstream = _internal_get(
            app,
            "/api/monitoring-formula",
            [("wodet_id", wodet_id), ("offset", 0), ("limit", 1), ("skip_count", 1)]
        )
        if status_code >= 400 or upstream.get("error"):
            return _error_response("spk_detail", status_code, upstream)
            
        rows = upstream.get("data", [])
        data = rows[0] if rows else {}
        return jsonify({
            "success": True,
            "api_version": "v1",
            "resource": "spk_detail",
            "generated_at": datetime.now().astimezone().isoformat(),
            "data": data
        })

    @blueprint.get("/spk-simple")
    def spk_simple():
        return list_resource("spk-simple", "/api/spk-simple")

    @blueprint.get("/monitoring-formula")
    def monitoring_formula():
        return list_resource("monitoring-formula", "/api/monitoring-formula")

    @blueprint.get("/stock")
    def stock():
        return list_resource("stock", "/api/stock")

    @blueprint.get("/biaya-produksi")
    def biaya_produksi():
        return list_resource("biaya-produksi", "/api/biaya-produksi")

    @blueprint.get("/standarisasi-harga")
    def standarisasi_harga():
        return list_resource("standarisasi-harga", "/api/standarisasi-harga")

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

    app.register_blueprint(blueprint, url_prefix=API_PREFIX)
