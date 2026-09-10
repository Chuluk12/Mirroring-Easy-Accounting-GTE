import os
import unittest
from unittest.mock import patch

from flask import Flask

import integration_api
import server


class SpkIntegrationTest(unittest.TestCase):
    def test_monitoring_formula_filters_finished_item_product(self):
        where_sql, params = server._monitoring_formula_where_clause(
            no_spk="SPK-001", product="Product O'Reilly",
            product_expr="TRIM(i.ITEMRESERVED6)",
        )
        self.assertIn("TRIM(i.ITEMRESERVED6) = ?", where_sql)
        self.assertNotIn("Product O'Reilly", where_sql)
        self.assertEqual(params, ["SPK-001", "Product O'Reilly"])

    @patch.object(server, "_get_table_columns")
    def test_product_uses_reserve_six_before_product_column(self, columns):
        columns.return_value = ["ITEMRESERVED6", "PRODUCT"]
        self.assertEqual(server._monitoring_formula_product_expr(None), "TRIM(i.ITEMRESERVED6)")
        columns.return_value = ["RESERVED6"]
        self.assertEqual(server._monitoring_formula_product_expr(None), "TRIM(i.RESERVED6)")
        columns.return_value = []
        self.assertEqual(server._monitoring_formula_product_expr(None), "CAST('' AS VARCHAR(255))")

    def test_monitoring_formula_filters_exact_spk(self):
        where_sql, params = server._monitoring_formula_where_clause(
            no_spk="GTE-SPK-261661"
        )

        self.assertIn("w.WONO = ?", where_sql)
        self.assertEqual(params, ["GTE-SPK-261661"])

    @patch.object(integration_api, "_internal_get")
    def test_list_skips_global_count(self, internal_get):
        internal_get.return_value = (200, {
            "data": [{"no_spk": f"SPK-{index}"} for index in range(20)],
            "total": None,
            "has_more": True,
        })
        app = Flask(__name__)
        integration_api.register_integration_api(app)

        with patch.dict(os.environ, {"EASY_INTEGRATION_API_KEYS": "x" * 32}):
            response = app.test_client().get(
                "/api/integration/v1/spk?limit=20",
                headers={"X-API-Key": "x" * 32},
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn(("skip_count", "1"), internal_get.call_args.args[2])
        self.assertEqual(response.get_json()["meta"]["total"], None)
        self.assertTrue(response.get_json()["meta"]["has_more"])


if __name__ == "__main__":
    unittest.main()
