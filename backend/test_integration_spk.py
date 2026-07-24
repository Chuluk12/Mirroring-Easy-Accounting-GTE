import os
import unittest
from unittest.mock import patch

from flask import Flask

import integration_api
import server


class SpkIntegrationTest(unittest.TestCase):
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
