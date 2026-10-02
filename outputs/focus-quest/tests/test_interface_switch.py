"""Interface switching never opens the v1.0 database writer or rolls back data."""
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("interface_switch_server", PROJECT / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class InterfaceSwitchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = server.FocusStore(self.root / "data", self.root / "absent-source")
        self.http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.store.close()
        self.temp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.http.server_address[1], timeout=3)
        body = None if payload is None else json.dumps(payload)
        connection.request(method, path, body, headers or {"Content-Type": "application/json"})
        response = connection.getresponse()
        result = response.status, response.read(), response.getheader("Content-Type")
        connection.close()
        return result

    def switch(self, mode):
        status, payload, _ = self.request("POST", "/api/interface", {"mode": mode})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(payload), {"mode": mode, "url": "/"})

    def snapshot(self):
        with self.store.lock:
            return {table: self.store.db.execute('SELECT * FROM "'+table+'" ORDER BY rowid').fetchall()
                    for table, in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    def test_default_stays_modern_and_explicit_pages_remain_accessible(self):
        self.assertEqual(self.store.interface_mode(), "modern")
        for path, mode in [("/", "modern"), ("/index.html", "modern"), ("/classic/", "classic"), ("/classic/index.html", "classic")]:
            status, payload, kind = self.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertIn(('data-interface-mode="'+mode+'"').encode(), payload)
            self.assertIn("text/html", kind)
        self.assertEqual(self.store.interface_mode(), "modern")

    def test_switch_both_directions_and_persist_across_store_restart(self):
        for mode in ["classic", "modern", "classic"]:
            self.switch(mode)
            self.assertIn(('data-interface-mode="'+mode+'"').encode(), self.request("GET", "/")[1])
            self.assertEqual(json.loads(self.request("GET", "/api/interface")[1])["mode"], mode)
        other = server.FocusStore(self.root / "data", self.root / "absent-source")
        try:
            self.assertEqual(other.interface_mode(), "classic")
            other.set_interface_mode("modern")
            self.assertEqual(self.store.interface_mode(), "modern")
        finally:
            other.close()

    def test_switch_only_changes_interface_metadata(self):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES ('switch-test',123,7,1)")
            self.store.db.execute("INSERT INTO records VALUES ('switch-record','switch-record','复习数学',23,1,2,'2026-09-23','tomatodo')")
        before = self.snapshot()
        for _ in range(10):
            self.switch("classic")
            self.switch("modern")
        after = self.snapshot()
        self.assertEqual(set(before), set(after))
        for table in before:
            if table != "meta":
                self.assertEqual(before[table], after[table], table)
        filtered = lambda rows: [tuple(row) for row in rows if row[0] != "interface_mode"]
        self.assertEqual(filtered(before["meta"]), filtered(after["meta"]))
        self.assertEqual(self.store._wallet(), {"coins": 123, "diamonds": 7})

    def test_invalid_values_queries_and_extra_fields_do_not_change_mode(self):
        self.switch("classic")
        for payload in [{}, {"mode": "v1.0"}, {"mode": None}, {"mode": True}, {"mode": []}, {"mode": "modern", "targets": {}}]:
            self.assertEqual(self.request("POST", "/api/interface", payload)[0], 400)
            self.assertEqual(self.store.interface_mode(), "classic")
        self.assertEqual(self.request("POST", "/api/interface?mode=modern", {"mode": "modern"})[0], 400)
        self.assertEqual(self.request("GET", "/api/interface?mode=modern")[0], 400)

    def test_corrupted_saved_preference_falls_back_without_rewriting_data(self):
        with self.store.db:
            self.store._set_meta("interface_mode", "missing-version")
        self.assertEqual(self.store.interface_mode(), "modern")
        self.assertIn(b'data-interface-mode="modern"', self.request("GET", "/")[1])
        self.assertEqual(self.store._meta("interface_mode"), "missing-version")

    def test_cross_origin_and_bad_host_switches_are_rejected(self):
        for headers in [{"Content-Type": "application/json", "Origin": "https://example.com"},
                        {"Content-Type": "application/json", "Sec-Fetch-Site": "cross-site"},
                        {"Content-Type": "application/json", "Host": "example.com"}]:
            self.assertEqual(self.request("POST", "/api/interface", {"mode": "classic"}, headers)[0], 403)
        self.assertEqual(self.store.interface_mode(), "modern")

    def test_classic_assets_and_shared_lifecycle_assets_are_served(self):
        for path in ["/classic/app.js", "/classic/style.css", "/goals.js", "/runtime.js", "/interface-switch.js", "/interface-switch.css"]:
            status, payload, _ = self.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertTrue(payload)
        self.assertEqual(self.request("GET", "/classic/../../server.py")[0], 404)

    def test_legacy_goal_payload_cannot_bypass_current_limits(self):
        self.switch("classic")
        self.assertEqual(self.request("POST", "/api/settings", {"targets": {"math": 1}})[0], 400)
        self.assertEqual(self.request("POST", "/api/settings", {"weeklyTarget": 1})[0], 400)
        state = json.loads(self.request("GET", "/api/state")[1])
        self.assertEqual(state["goals"]["daily"]["changesUsed"], 0)
        self.assertTrue(state["goals"]["weeklyRequired"])

    def test_classic_settings_save_preserves_newer_activity_assignments(self):
        self.store.update_settings({"activityMapping": {"复习数学": "practice"}})
        self.switch("classic")
        status, data, _ = self.request("POST", "/api/settings", {"mapping": {"复习数学": "math"}, "motion": False, "sound": True})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)["settings"]["activityMapping"], {"复习数学": "practice"})

    def test_original_css_is_byte_for_byte_the_recovered_v1_style(self):
        original = PROJECT / "tests/fixtures/initial-v1.0-style.css"
        self.assertEqual((PROJECT / "static/classic/style.css").read_bytes(), original.read_bytes())


if __name__ == "__main__":
    unittest.main()
