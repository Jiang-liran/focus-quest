"""A practical action journal is separate from study time and game rewards."""
import importlib.util
import json
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("compass_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
TZ = timezone(timedelta(hours=8))
NOW = datetime(2026, 9, 25, 18, 0, 0, 123456, tzinfo=TZ)


def rid():
    return str(uuid.uuid4())


class CompassTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.source = Path(self.temp.name) / "absent.json"
        self.store = server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, name, minutes, day=None, identity=None, deleted=False, future=False):
        identity = identity or rid()
        end = NOW + timedelta(minutes=10) if future else NOW - timedelta(hours=1)
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)",
                (identity, identity, name, minutes, int(end.timestamp() * 1000 - minutes * 60000),
                 int(end.timestamp() * 1000), day or NOW.date().isoformat(), "tomatodo"))
            if deleted:
                self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)",
                    (identity, NOW.isoformat(), "manual", "delete"))
        return identity

    def start(self, card="math-practice", request=None):
        return self.store.start_action(card, request or rid(), NOW)["active"]

    def state(self):
        return self.store.actions_state(NOW)

    def test_empty_today_has_four_distinct_practical_cards_and_fixed_templates(self):
        state = self.state()
        self.assertEqual(state["now"], NOW.isoformat(timespec="microseconds"))
        self.assertEqual(state["today"], "2026-09-25")
        self.assertIsNone(state["active"])
        self.assertEqual(state["history"], [])
        self.assertEqual(len(server.ACTION_TEMPLATES), 8)
        self.assertEqual({c["subject"] for c in state["recommendations"]}, server.SUBJECT_IDS)
        for card in state["recommendations"]:
            self.assertEqual(len(card["steps"]), 3)
            self.assertTrue(all(isinstance(step, str) and step for step in card["steps"]))
            self.assertTrue(card["why"] and card["prompt"])
            self.assertGreater(card["estimatedMinutes"], 0)

    def test_lecture_heavy_subject_moves_up_and_recommends_independent_practice(self):
        self.add("复习数学", 60)
        first = self.state()["recommendations"][0]
        self.assertEqual(first["id"], "math-practice")
        self.assertIn("听课 60 分钟", first["why"])
        self.assertIn("做题 0 分钟", first["why"])

    def test_completed_subject_moves_below_subjects_with_remaining_goals(self):
        self.add("数学", 180)
        cards = self.state()["recommendations"]
        self.assertEqual(cards[-1]["subject"], "math")
        self.assertEqual(cards[0]["subject"], "cs")

    def test_practice_moves_to_recall_instead_of_repeating_more_time(self):
        self.add("数学做题", 80)
        card = next(c for c in self.state()["recommendations"] if c["subject"] == "math")
        self.assertEqual(card["id"], "math-recall")
        self.assertIn("主动回忆", card["why"])

    def test_today_uses_every_record_not_the_recent_hundred(self):
        for _ in range(121):
            self.add("复习数学", 1)
        card = next(c for c in self.state()["recommendations"] if c["subject"] == "math")
        self.assertIn("听课 121 分钟", card["why"])

    def test_deleted_future_and_other_days_do_not_change_recommendations(self):
        before = self.state()["recommendations"]
        self.add("复习数学", 180, deleted=True)
        self.add("复习政治", 60, future=True)
        self.add("复习英语", 60, day="2026-09-24")
        self.assertEqual(self.state()["recommendations"], before)

    def test_custom_subject_and_activity_mapping_are_respected(self):
        self.store.update_settings({"mapping": {"自定义": "english"}, "activityMapping": {"自定义": "lecture"}})
        self.add("自定义", 30)
        card = next(c for c in self.state()["recommendations"] if c["subject"] == "english")
        self.assertEqual(card["id"], "english-practice")
        self.assertIn("听课 30 分钟", card["why"])

    def test_viewing_history_does_not_change_action_today(self):
        self.add("复习数学", 60)
        expected = self.state()
        actual = self.store.state("2026-01-01", NOW)
        self.assertEqual(actual["date"], "2026-01-01")
        self.assertEqual(actual["actions"], expected)

    def test_start_is_idempotent_and_only_one_can_be_active(self):
        request = rid()
        first = self.start(request=request)
        repeated = self.start(request=request)
        self.assertEqual(repeated, first)
        self.assertEqual(first["checked"], [False] * 3)
        self.assertEqual(first["version"], 1)
        self.assertEqual(first["cardId"], "math-practice")
        self.assertNotEqual(first["id"], request)
        for card, req in (("cs-practice", request), ("cs-practice", rid()), ("math-practice", rid())):
            with self.assertRaises(ValueError):
                self.store.start_action(card, req, NOW)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM study_actions").fetchone()[0], 1)

    def test_template_snapshot_survives_recommendation_changes(self):
        action = self.start()
        self.add("数学做题", 80)
        state = self.state()
        self.assertEqual(state["active"], action)
        self.assertEqual(next(c for c in state["recommendations"] if c["subject"] == "math")["id"], "math-recall")

    def test_update_persists_raw_note_checked_steps_and_version_across_restart(self):
        action = self.start()
        note = "<img src=x onerror=alert(1)>\n我还没弄懂边界条件。"
        updated = self.store.update_action(action["id"], 1, [True, False, True], note, NOW)["active"]
        self.assertEqual(updated["version"], 2)
        self.assertEqual(updated["note"], note)
        self.assertEqual(updated["checked"], [True, False, True])
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)
        self.assertEqual(self.state()["active"], updated)

    def test_stale_update_complete_and_park_cannot_erase_newer_work(self):
        action = self.start()
        updated = self.store.update_action(action["id"], 1, [True] * 3, "新的心得", NOW)["active"]
        with self.assertRaises(ValueError):
            self.store.update_action(action["id"], 1, [False] * 3, "旧的心得", NOW)
        for finish in (self.store.complete_action, self.store.park_action):
            with self.assertRaises(ValueError):
                finish(action["id"], 1, NOW)
        self.assertEqual(self.state()["active"], updated)

    def test_completion_requires_all_three_manual_checks(self):
        action = self.start()
        with self.assertRaises(ValueError):
            self.store.complete_action(action["id"], 1, NOW + timedelta(days=20))
        self.assertEqual(self.state()["active"]["version"], 1)
        self.store.update_action(action["id"], 1, [True] * 3, "条件检查通过", NOW)
        result = self.store.complete_action(action["id"], 2, NOW)
        self.assertIsNone(result["active"])
        item = result["history"][0]
        self.assertEqual(item["status"], "completed")
        self.assertEqual(item["version"], 3)
        self.assertEqual(item["note"], "条件检查通过")
        self.assertEqual(item["completedAt"], NOW.isoformat(timespec="microseconds"))
        self.assertEqual(self.store.complete_action(action["id"], 2, NOW), result)
        with self.assertRaises(ValueError):
            self.store.park_action(action["id"], 3, NOW)

    def test_park_preserves_saved_work_and_retry_does_not_reactivate(self):
        request = rid()
        action = self.start(request=request)
        self.store.update_action(action["id"], 1, [True, False, False], "待下次核对", NOW)
        result = self.store.park_action(action["id"], 2, NOW)
        self.assertIsNone(result["active"])
        self.assertEqual(result["history"][0]["note"], "待下次核对")
        self.assertEqual(result["history"][0]["status"], "parked")
        self.assertIsNone(result["history"][0]["completedAt"])
        self.assertEqual(self.store.park_action(action["id"], 2, NOW), result)
        self.assertEqual(self.store.start_action("math-practice", request, NOW), result)
        self.assertIsNotNone(self.start("cs-practice"))

    def test_action_completion_writes_no_study_or_financial_tables(self):
        before = {row[0]: self.store.db.execute('SELECT * FROM "' + row[0] + '"').fetchall()
                  for row in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name!='study_actions'").fetchall()}
        action = self.start()
        self.store.update_action(action["id"], 1, [True] * 3, "", NOW)
        self.store.complete_action(action["id"], 2, NOW)
        for table, rows in before.items():
            self.assertEqual(self.store.db.execute('SELECT * FROM "' + table + '"').fetchall(), rows, table)

    def test_recent_twenty_history_entries_are_returned_without_deleting_older_entries(self):
        for index in range(23):
            now = NOW + timedelta(seconds=index)
            action = self.store.start_action("math-practice", rid(), now)["active"]
            self.store.park_action(action["id"], 1, now)
        state = self.store.actions_state(NOW + timedelta(minutes=1))
        self.assertEqual(len(state["history"]), 20)
        self.assertEqual(state["history"][0]["updatedAt"], (NOW + timedelta(seconds=22)).isoformat(timespec="microseconds"))
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM study_actions").fetchone()[0], 23)

    def test_competing_connections_cannot_start_two_actions(self):
        other = server.FocusStore(self.data, self.source)
        barrier = threading.Barrier(2)
        def start(store):
            barrier.wait()
            try:
                return store.start_action("math-practice", rid(), NOW)["active"]["id"]
            except ValueError:
                return None
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(start, store) for store in (self.store, other)]
                self.assertEqual(sum(future.result() is not None for future in futures), 1)
        finally:
            other.close()

    def test_direct_parameter_validation_rejects_bad_ids_versions_steps_and_notes(self):
        for card in (None, [], "fake"):
            with self.assertRaises(ValueError):
                self.store.start_action(card, rid(), NOW)
        for request in (None, 123, "bad", ""):
            with self.assertRaises(ValueError):
                self.store.start_action("math-practice", request, NOW)
        action = self.start()
        for version in (0, -1, True, 1.0, "1", None, 2 ** 53):
            with self.assertRaises(ValueError):
                self.store.update_action(action["id"], version, [True] * 3, "", NOW)
        for checked in (None, [], [True], [True] * 4, [1, True, True], ["true"] * 3, (True, True, True)):
            with self.assertRaises(ValueError):
                self.store.update_action(action["id"], 1, checked, "", NOW)
        for note in (None, 123, [], "字" * 1001):
            with self.assertRaises(ValueError):
                self.store.update_action(action["id"], 1, [True] * 3, note, NOW)
        self.assertEqual(self.store.update_action(action["id"], 1, [True] * 3, "字" * 1000, NOW)["active"]["version"], 2)

    def test_http_requires_exact_fields_local_origin_and_no_date_override(self):
        http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        def request(path, body=None, headers=None):
            conn = HTTPConnection("127.0.0.1", http.server_address[1], timeout=3)
            conn.request("GET" if body is None else "POST", path, None if body is None else json.dumps(body),
                         {"Content-Type": "application/json", **(headers or {})})
            response = conn.getresponse()
            result = response.status, json.loads(response.read())
            conn.close()
            return result
        try:
            with patch.object(server, "quest_clock", return_value=NOW):
                self.assertEqual(request("/api/actions")[0], 200)
                self.assertEqual(request("/api/actions?date=2020-01-01")[0], 400)
                payload = {"cardId": "math-practice", "requestId": rid()}
                self.assertEqual(request("/api/actions/start", payload, {"Origin": "https://untrusted.example"})[0], 403)
                for body in ({}, {**payload, "minutes": 100}, {**payload, "now": NOW.isoformat()}, {"cardId": "math-practice"}):
                    self.assertEqual(request("/api/actions/start", body)[0], 400)
                self.assertEqual(request("/api/actions/start?date=2020-01-01", payload)[0], 400)
                status, started = request("/api/actions/start", payload)
                self.assertEqual(status, 200)
                action = started["active"]
                saved = {"id": action["id"], "version": 1, "checked": [True] * 3, "note": "核对完成"}
                self.assertEqual(request("/api/actions/update", {**saved, "coins": 5})[0], 400)
                self.assertEqual(request("/api/actions/update", saved)[0], 200)
                self.assertEqual(request("/api/actions/complete", {"id": action["id"], "version": 1})[0], 400)
                status, completed = request("/api/actions/complete", {"id": action["id"], "version": 2})
                self.assertEqual(status, 200)
                self.assertEqual(completed["history"][0]["status"], "completed")
                self.assertEqual(request("/api/actions/park", {"id": action["id"], "version": 3})[0], 400)
        finally:
            http.shutdown()
            http.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
