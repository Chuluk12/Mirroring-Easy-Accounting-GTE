import os
import sys
import types
import unittest
from unittest.mock import patch

from flask import Flask

import integration_api


API_KEY = "x" * 32


class SavedReportsIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        integration_api.register_integration_api(self.app)
        self.client = self.app.test_client()
        self.headers = {"X-API-Key": API_KEY}

    def test_saved_reports_metadata_uses_search_and_database_pagination(self):
        rows = [{
            "report_id": 7,
            "report_name": "Petty Cash",
            "report_title": "Petty Cash Transactions",
            "table": "R_BANKBOOK",
        }]

        with patch.dict(os.environ, {"EASY_INTEGRATION_API_KEYS": API_KEY}), \
                patch.object(integration_api, "_fetch_saved_reports", return_value=(rows, 3)) as fetch:
            response = self.client.get(
                "/api/integration/v1/saved-reports?search=petty&page=2&limit=2",
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"], rows)
        self.assertEqual(response.get_json()["meta"]["offset"], 2)
        self.assertFalse(response.get_json()["meta"]["has_more"])
        fetch.assert_called_once_with(search="petty", user="", offset=2, limit=2)

    def test_petty_cash_report_returns_report_fields_and_rows(self):
        report = {
            "report_id": 41,
            "report_name": "Petty Cash",
            "report_title": "Petty Cash Transactions",
            "report_title_ind": "Petty Cash Transactions",
            "table": "R_BANKBOOK",
            "parameter": "(PARAMDATE1, PARAMDATE2)",
            "level": "",
        }
        rows = [{
            "tanggal": "2026-11-01",
            "ref_no": "PC-0001",
            "deskripsi": "Office supplies",
            "amount": 150000,
            "debit": 150000,
            "credit": 0,
            "source": "PETTY_CASH",
            "balance": 850000,
        }]
        fields = [{"field_name": "tanggal"}, {"field_name": "amount"}]

        with patch.dict(os.environ, {"EASY_INTEGRATION_API_KEYS": API_KEY}), \
                patch.object(integration_api, "_fetch_saved_report", return_value=report), \
                patch.object(integration_api, "_fetch_report_fields", return_value=fields), \
                patch.object(integration_api, "_execute_saved_report", return_value=rows):
            response = self.client.get(
                "/api/integration/v1/saved-reports/41/list"
                "?date_from=2026-11-01&date_to=2026-11-30&limit=10",
                headers=self.headers,
            )

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["report"]["source"], "R_BANKBOOK")
        self.assertEqual(payload["report"]["fields"], fields)
        self.assertEqual(payload["data"][0]["source"], "PETTY_CASH")
        self.assertEqual(payload["data"][0]["amount"], 150000)
        self.assertEqual(payload["meta"]["total"], 1)

    def test_saved_report_requires_date_range_when_report_requires_it(self):
        report = {
            "report_id": 41,
            "report_name": "Petty Cash",
            "table": "R_BANKBOOK",
            "parameter": "(PARAMDATE1, PARAMDATE2)",
            "level": "",
        }

        with patch.dict(os.environ, {"EASY_INTEGRATION_API_KEYS": API_KEY}), \
                patch.object(integration_api, "_fetch_saved_report", return_value=report):
            response = self.client.get(
                "/api/integration/v1/saved-reports/41/list",
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "missing_report_parameters")

    def test_petty_cash_source_receives_requested_period(self):
        class Cursor:
            description = [("TXDATE",), ("AMOUNT",)]

            def __init__(self):
                self.sql = ""
                self.params = None

            def execute(self, sql, params=None):
                self.sql = sql
                self.params = params

            def fetchall(self):
                return [("2026-11-01", 150000)]

        class Connection:
            def __init__(self, cursor):
                self.cursor_value = cursor

            def cursor(self):
                return self.cursor_value

            def close(self):
                pass

        cursor = Cursor()
        fake_server = types.SimpleNamespace(
            connect_easy_db=lambda: Connection(cursor),
        )
        report = {
            "table": "R_BANKBOOK",
            "parameter": "(PARAMDATE1, PARAMDATE2)",
        }

        with self.app.test_request_context(
            "/api/integration/v1/saved-reports/41/list"
            "?date_from=2026-11-01&date_to=2026-11-30"
        ), patch.dict(sys.modules, {"server": fake_server}):
            rows = integration_api._execute_saved_report(
                report, "2026-11-01", "2026-11-30"
            )

        self.assertIn("SELECT * FROM R_BANKBOOK(?, ?)", cursor.sql)
        self.assertEqual(cursor.params, ["2026-11-01", "2026-11-30"])
        self.assertEqual(rows, [{"txdate": "2026-11-01", "amount": 150000}])

    def test_petty_cash_accepts_day_month_year_dates_and_matches_aqpa_shape(self):
        report = {
            "report_id": 458,
            "report_name": "JVDet8",
            "report_title": "GA - Deklarasi Petty Cash",
            "table": "GET_JV",
            "parameter": "(:PARAMDATE1, :PARAMDATE2, :BAHASA)",
            "level": "",
        }
        rows = [{
            "jv_id": 1,
            "transdate": "2026-10-05",
            "descr": "GTE-PC-261056",
            "jvnumber": "GTE-JU-2605433",
            "transtype": "Bukti Jurnal",
            "glaccount": "1.01.01.003",
            "accountname": "Kas Kecil Logistics",
            "description": "REFUND GTE-PC-261056",
            "jvamount": 300000,
            "debet": 50000,
            "kredit": 0,
            "rate": 1,
            "primeamount": 50000,
            "seq": 1,
            "currencyname": "IDR",
            "userid": 58,
            "deptid": 8,
            "projectid": 0,
        }]

        with patch.dict(os.environ, {"EASY_INTEGRATION_API_KEYS": API_KEY}), \
                patch.object(integration_api, "_fetch_saved_report", return_value=report), \
                patch.object(integration_api, "_fetch_report_fields", return_value=[]), \
                patch.object(
                    integration_api,
                    "_execute_saved_report",
                    return_value=integration_api._shape_get_jv_rows(rows),
                ):
            response = self.client.get(
                "/api/integration/v1/saved-reports/458/list"
                "?date_from=10-10-2026&date_to=1-11-2026",
                headers=self.headers,
            )

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["meta"]["date_from"], "2026-10-10")
        self.assertEqual(payload["meta"]["date_to"], "2026-11-01")
        self.assertEqual(payload["data"][0]["gl_account"], "1.01.01.003")
        self.assertEqual(payload["data"][0]["account_name"], "Kas Kecil Logistics")
        self.assertEqual(payload["data"][0]["no_jurnal_umum"], "GTE-JU-2605433")

    def test_unknown_report_returns_not_found_without_database_execution(self):
        with patch.dict(os.environ, {"EASY_INTEGRATION_API_KEYS": API_KEY}), \
                patch.object(integration_api, "_fetch_saved_report", return_value=None), \
                patch.object(integration_api, "_execute_saved_report") as execute:
            response = self.client.get(
                "/api/integration/v1/saved-reports/999999/list"
                "?date_from=2026-11-01&date_to=2026-11-30",
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 404)
        execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
