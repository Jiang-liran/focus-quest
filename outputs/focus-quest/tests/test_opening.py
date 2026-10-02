"""Daily greeting claims use isolated storage and never consume study rewards."""
import importlib.util
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "opening_focus_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class DailyOpeningTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "tomatodo.json"
        self.source.write_text(json.dumps({"PCRecord": [], "PCToDo": []}), encoding="utf-8")
        self.store = server.FocusStore(self.root / "data", self.source)
        self.now = datetime(2026, 9, 23, 8, 15, tzinfo=timezone(timedelta(hours=8)))

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)

    def state(self):
        return self.store.state(self.now.date().isoformat(), now=self.now)

    @contextmanager
    def http_server(self):
        service = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=service.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        thread.start()
        try:
            yield service.server_address[1]
        finally:
            service.shutdown()
            service.server_close()
            thread.join(timeout=5)

    @staticmethod
    def request(port, method, path, body=None, headers=None):
        connection = HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_preview_returns_context_and_does_not_consume_first_opening(self):
        expected = {"day": "2026-09-23", "now": self.now.isoformat(), "minutes": 0,
                    "target": 480, "seen": False}
        for _ in range(3):
            self.assertEqual(self.store.opening(now=self.now), expected)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM daily_openings").fetchone()[0], 0)
        claimed = self.store.claim_opening(now=self.now)
        self.assertEqual(claimed, dict(expected, seen=True, show=True))
        self.assertEqual(self.store.opening(now=self.now), dict(expected, seen=True))

    def test_claim_is_once_per_day_and_persists_across_restart(self):
        self.assertTrue(self.store.claim_opening(now=self.now)["show"])
        for hour in (9, 12, 23):
            self.assertFalse(self.store.claim_opening(now=self.now.replace(hour=hour))["show"])
        self.restart()
        self.assertTrue(self.store.opening(now=self.now)["seen"])
        self.assertFalse(self.store.claim_opening(now=self.now)["show"])
        saved = self.store.db.execute("SELECT day,shown_at FROM daily_openings").fetchall()
        self.assertEqual([tuple(row) for row in saved], [(self.now.date().isoformat(), self.now.isoformat())])

    def test_crossing_local_midnight_allows_a_new_opening(self):
        before = self.now.replace(hour=23, minute=59, second=59)
        after = before + timedelta(seconds=1)
        self.assertTrue(self.store.claim_opening(now=before)["show"])
        self.assertFalse(self.store.opening(now=after)["seen"])
        result = self.store.claim_opening(now=after)
        self.assertEqual(result["day"], "2026-09-24")
        self.assertTrue(result["show"])
        self.assertFalse(self.store.claim_opening(now=after + timedelta(hours=8))["show"])
        self.assertFalse(self.store.claim_opening(now=before)["show"])
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM daily_openings").fetchone()[0], 2)

    def test_concurrent_claims_on_same_store_show_exactly_once(self):
        barrier = threading.Barrier(12)

        def claim(_):
            barrier.wait(timeout=5)
            return self.store.claim_opening(now=self.now)

        with ThreadPoolExecutor(max_workers=12) as executor:
            results = list(executor.map(claim, range(12)))
        self.assertEqual(sum(result["show"] for result in results), 1)
        self.assertTrue(all(result["seen"] for result in results))

    def test_concurrent_separate_database_connections_show_exactly_once(self):
        stores = [server.FocusStore(self.root / "data", self.source) for _ in range(4)]
        barrier = threading.Barrier(len(stores))

        def claim(store):
            barrier.wait(timeout=5)
            return store.claim_opening(now=self.now)

        try:
            with ThreadPoolExecutor(max_workers=len(stores)) as executor:
                results = list(executor.map(claim, stores))
            self.assertEqual(sum(result["show"] for result in results), 1)
            self.assertTrue(all(result["seen"] for result in results))
        finally:
            for store in stores:
                store.close()

    def test_minutes_exclude_trash_and_other_days_without_changing_study_data(self):
        def record(identifier, minutes, end):
            return {"id": identifier, "name": "复习数学", "isComplete": 1, "time": minutes,
                    "startDate": int((end - timedelta(minutes=minutes)).timestamp() * 1000),
                    "createDate": int(end.timestamp() * 1000)}

        self.source.write_text(json.dumps({"PCRecord": [
            record(1, 12.5, self.now - timedelta(minutes=45)),
            record(2, 20, self.now - timedelta(minutes=10)),
            record(3, 30, self.now - timedelta(days=1)),
        ]}), encoding="utf-8")
        self.store.import_source()
        removed_id = next(row["id"] for row in self.state()["records"] if row["minutes"] == 20)
        self.store.move_record(removed_id)
        with patch.object(server, "quest_clock", return_value=self.now):
            self.store.update_settings({"targets": {"math": 240}})
        before = self.state()
        before_export = self.store.export_csv()
        before_meta = [tuple(row) for row in self.store.db.execute("SELECT * FROM meta ORDER BY key")]
        preview = self.store.opening(now=self.now)
        self.assertEqual(preview["minutes"], 12.5)
        self.assertEqual(preview["target"], 540)
        self.assertFalse(preview["seen"])
        self.assertTrue(self.store.claim_opening(now=self.now)["show"])
        self.assertFalse(self.store.claim_opening(now=self.now)["show"])
        self.assertEqual(self.state(), before)
        self.assertEqual(self.store.export_csv(), before_export)
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM meta ORDER BY key")], before_meta)

    def test_background_imports_and_state_reads_do_not_claim_opening(self):
        for _ in range(3):
            self.store.import_source()
            self.store.import_calendar(now=self.now)
            self.state()
        self.assertFalse(self.store.opening(now=self.now)["seen"])
        self.assertTrue(self.store.claim_opening(now=self.now)["show"])

    def test_default_clock_returns_timezone_and_naive_injected_clock_is_rejected(self):
        preview = self.store.opening()
        timestamp = datetime.fromisoformat(preview["now"])
        self.assertIsNotNone(timestamp.utcoffset())
        self.assertEqual(preview["day"], timestamp.date().isoformat())
        with self.assertRaises(ValueError):
            self.store.opening(now=self.now.replace(tzinfo=None))
        with self.assertRaises(ValueError):
            self.store.claim_opening(now=self.now.replace(tzinfo=None))
        self.assertFalse(self.store.opening()["seen"])

    def test_http_preview_and_claim_use_server_clock_and_return_contract(self):
        with self.http_server() as port:
            for _ in range(2):
                status, preview = self.request(port, "GET", "/api/opening")
                self.assertEqual(status, 200)
                self.assertEqual(set(preview), {"day", "now", "minutes", "target", "seen"})
                self.assertFalse(preview["seen"])
                self.assertEqual(preview["day"], datetime.fromisoformat(preview["now"]).date().isoformat())
                self.assertIsNotNone(datetime.fromisoformat(preview["now"]).utcoffset())
            status, first = self.request(port, "POST", "/api/opening/claim", "{}", {"Content-Type": "application/json"})
            self.assertEqual(status, 200)
            self.assertEqual(set(first), {"day", "now", "minutes", "target", "seen", "show"})
            self.assertTrue(first["seen"])
            self.assertTrue(first["show"])
            status, again = self.request(port, "POST", "/api/opening/claim", "{}", {"Content-Type": "application/json"})
            self.assertEqual(status, 200)
            self.assertFalse(again["show"])

    def test_http_concurrent_claims_show_exactly_once(self):
        with self.http_server() as port:
            def claim(_):
                return self.request(port, "POST", "/api/opening/claim", "{}", {"Content-Type": "application/json"})

            with ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(claim, range(8)))
            self.assertTrue(all(status == 200 for status, _ in results))
            self.assertEqual(sum(payload["show"] for _, payload in results), 1)

    def test_http_rejects_nonempty_or_invalid_payload_and_client_clock(self):
        with self.http_server() as port:
            invalid = ["", " ", "null", "[]", '""', "0", "{", '{"day":"2000-01-01"}',
                       '{"now":"2000-01-01T00:00:00+08:00"}', '{"preview":true}', '{"x":NaN}']
            for body in invalid:
                with self.subTest(body=body):
                    status, _ = self.request(port, "POST", "/api/opening/claim", body, {"Content-Type": "application/json"})
                    self.assertEqual(status, 400)
            for query in ("date=2000-01-01", "now=2000-01-01T00:00:00Z", "day=2000-01-01"):
                self.assertEqual(self.request(port, "GET", "/api/opening?" + query)[0], 400)
                self.assertEqual(self.request(port, "POST", "/api/opening/claim?" + query, "{}",
                                              {"Content-Type": "application/json"})[0], 400)
            self.assertEqual(self.request(port, "POST", "/api/opening/claim", "{}",
                                          {"Content-Type": "text/plain"})[0], 415)
        self.assertFalse(self.store.opening()["seen"])

    def test_http_host_and_origin_restrictions_protect_claim(self):
        with self.http_server() as port:
            self.assertEqual(self.request(port, "GET", "/api/opening", headers={"Host": "attacker.example"})[0], 403)
            for extra in ({"Host": "attacker.example"}, {"Origin": "https://attacker.example"},
                          {"Sec-Fetch-Site": "cross-site"}):
                headers = dict({"Content-Type": "application/json"}, **extra)
                self.assertEqual(self.request(port, "POST", "/api/opening/claim", "{}", headers)[0], 403)
            self.assertFalse(self.store.opening()["seen"])
            status, result = self.request(port, "POST", "/api/opening/claim", "{}", {
                "Content-Type": "application/json", "Origin": f"http://127.0.0.1:{port}"})
            self.assertEqual(status, 200)
            self.assertTrue(result["show"])


if __name__ == "__main__":
    unittest.main()
