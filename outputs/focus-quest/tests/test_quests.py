"""Continuous NPC commissions, immutable rewards, and cosmetic purchases."""
import importlib.util
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "server.py"
spec = importlib.util.spec_from_file_location("quest_server", MODULE)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
TZ = timezone(timedelta(hours=8))


def at(hour, minute=0, second=0, *, day=23, microsecond=0):
    return datetime(2026, 9, day, hour, minute, second, microsecond, tzinfo=TZ)


def ms(value):
    return int(value.timestamp() * 1000)


def record(rid, name, start, end, minutes=None):
    return {"id": rid, "name": name, "time": (end - start).total_seconds() / 60 if minutes is None else minutes,
            "startDate": ms(start), "createDate": ms(end), "isComplete": 1, "i6": 0, "s4": ""}


class QuestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source.json"
        self.data = self.root / "data"
        self.store = server.FocusStore(self.data, self.source)
        self.records = []

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, *records):
        self.records.extend(records)
        self.source.write_text(json.dumps({"PCRecord": self.records}), encoding="utf-8")
        self.store.import_source()

    def quest(self, subject, now):
        return next(item for item in self.store.quest_state(now)["quests"] if item["subject"] == subject)

    def earn_math(self, minutes=240):
        self.store.accept_quest("math", at(8))
        self.add(record(1, "数学", at(8), at(8) + timedelta(minutes=minutes)))
        return self.store.submit_quest("math", at(8) + timedelta(minutes=minutes))

    def test_schedule_accept_boundaries_and_defaults(self):
        early = self.store.quest_state(at(0))
        self.assertEqual(early["wallet"], {"coins": 0, "diamonds": 0})
        self.assertEqual(len(early["catalog"]), 130+len(server.shop_expansion.SHOP_CATALOG_EXTRA))
        self.assertEqual(sum(item["owned"] for item in early["catalog"]), 28)
        self.assertEqual(sum(item["equipped"] for item in early["catalog"]), 24)
        self.assertEqual(self.quest("math", at(0))["status"], "available")
        self.assertEqual(self.quest("cs", at(11, 59, 59))["status"], "available")
        self.store.accept_quest("math", at(11, 59, 59, microsecond=999000))
        self.assertEqual(self.quest("math", at(12))["status"], "active")
        self.store.accept_quest("politics", at(12))
        self.store.accept_quest("cs", at(11, 59, 59))
        self.store.accept_quest("cs", at(12))
        self.store.accept_quest("english", at(23, 59, 59))
        self.assertEqual(self.quest("english", at(23, 59, 59))["status"], "active")
        self.assertTrue(all(q["continuous"] for q in self.store.quest_state(at(23, 59, 59))["quests"]))

    def test_only_after_acceptance_and_no_auto_money(self):
        self.add(record(1, "数学", at(7), at(8)))
        before = self.store.quest_state(at(9))
        self.assertEqual(before["wallet"]["coins"], 0)
        self.assertEqual(self.quest("math", at(9))["minutes"], 0)
        self.store.accept_quest("math", at(9))
        self.add(record(2, "数学", at(8, 30), at(9, 30)))
        self.assertEqual(self.quest("math", at(9, 30))["minutes"], 30)
        with self.assertRaises(ValueError):
            self.store.submit_quest("math", at(9, 30))
        accepted_at = self.quest("math", at(9, 30))["acceptedAt"]
        self.store.accept_quest("math", at(9, 40))
        self.assertEqual(self.quest("math", at(9, 40))["acceptedAt"], accepted_at)
        self.assertEqual(self.store.quest_state(at(9, 40))["wallet"], {"coins": 0, "diamonds": 0})

    def test_proportional_pause_span_cap_future_and_zero_span(self):
        self.store.accept_quest("math", at(10))
        self.add(record(1, "数学", at(9), at(11), 60),
                 record(2, "数学", at(11), at(11, 30), 300),
                 record(3, "数学", at(11, 30), at(13), 90),
                 record(4, "数学", at(11), at(11), 20))
        # First record: 60 effective minutes * half-span = 30, second caps at 30.
        self.assertEqual(self.quest("math", at(11, 30))["minutes"], 60)
        # A future end is never partially credited, even once the deadline passes.
        self.assertEqual(self.quest("math", at(12, 20))["minutes"], 60)
        # The entire completed post-acceptance span counts, regardless of noon.
        self.assertEqual(self.quest("math", at(13))["minutes"], 150)
        self.assertEqual(self.quest("math", at(13))["status"], "ready")

    def test_learning_and_submission_continue_after_old_deadlines(self):
        self.store.accept_quest("math", at(10))
        self.add(record(1, "数学", at(11), at(12, 15)))
        self.assertEqual(self.quest("math", at(12, 14, 59))["minutes"], 0)
        self.assertEqual(self.quest("math", at(12, 15))["minutes"], 75)
        claimed = self.store.submit_quest("math", at(12, 30))
        self.assertEqual(claimed["wallet"], {"coins": 150, "diamonds": 2})
        self.store.accept_quest("politics", at(11))
        self.add(record(2, "政治", at(11), at(11, 30)))
        self.store.submit_quest("politics", at(12, 30, microsecond=1000))
        self.assertEqual(self.quest("politics", at(12, 30, 1))["status"], "active")
        self.assertEqual(self.store.quest_state(at(12, 31))["wallet"], {"coins": 210, "diamonds": 4})

    def test_overachievement_linear_rewards_frozen_receipt(self):
        result = self.earn_math(240)
        self.assertEqual(result["wallet"], {"coins": 480, "diamonds": 8})
        self.assertEqual(result["receipt"]["minutes"], 240)
        revision = self.store.revision
        again = self.store.submit_quest("math", at(12, 25))
        self.assertTrue(again["receipt"]["alreadyClaimed"])
        self.assertEqual(again["wallet"], result["wallet"])
        self.assertEqual(self.store.revision, revision)
        # Changing or deleting the source after settlement cannot rewrite money.
        self.records[0]["time"] = 1
        self.add()
        self.store.move_record(f"1:{self.records[0]['startDate']}")
        frozen = self.quest("math", at(12, 30))
        self.assertEqual(frozen["minutes"], 0)
        self.assertEqual(frozen["settledMinutes"], 240)
        self.assertEqual(frozen["reward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger").fetchone()[0], 1)

    def test_extra_learning_before_submission_and_floor_rewards(self):
        self.store.accept_quest("politics", at(8))
        self.add(record(1, "政治", at(8), at(8, 30)))
        self.assertEqual(self.quest("politics", at(8, 30))["status"], "ready")
        self.add(record(2, "政治", at(9), at(9, 15, 29)))
        result = self.store.submit_quest("politics", at(10))
        self.assertEqual(result["wallet"], {"coins": 90, "diamonds": 2})
        self.add(record(3, "政治", at(10), at(11)))
        self.assertEqual(self.quest("politics", at(11))["minutes"], 60)
        self.assertAlmostEqual(self.quest("politics", at(11))["settledMinutes"], 45 + 29 / 60, places=4)
        self.assertEqual(self.store.quest_state(at(11))["wallet"], {"coins": 90, "diamonds": 2})

    def test_dedup_and_deleted_records_excluded_before_submission(self):
        self.store.accept_quest("math", at(8))
        item = record(1, "数学", at(8), at(9))
        self.add(item, dict(item))
        self.assertEqual(self.quest("math", at(9))["minutes"], 60)
        self.store.move_record(f"1:{item['startDate']}")
        self.assertEqual(self.quest("math", at(9))["minutes"], 0)
        with self.assertRaises(ValueError):
            self.store.submit_quest("math", at(9))
        self.store.move_record(f"1:{item['startDate']}", restore=True)
        self.assertEqual(self.quest("math", at(9))["minutes"], 60)

    def test_settled_slices_not_reused_after_mapping_change(self):
        self.store.accept_quest("math", at(8))
        self.store.accept_quest("politics", at(8))
        self.add(record(1, "数学", at(8), at(9)))
        self.store.submit_quest("math", at(9))
        self.store.update_settings({"mapping": {"数学": "politics"}})
        self.assertEqual(self.quest("politics", at(9))["minutes"], 0)

    def test_cross_source_mirror_is_counted_once(self):
        self.store.accept_quest("math", at(8))
        self.add(record(1, "数学", at(8), at(9)))
        calendar_record = ("calendar:test-mirror", "test-calendar-key", "数学", 60.0,
                           ms(at(8)), ms(at(9)), "2026-09-23", "calendar")
        with self.store.lock, self.store.db:
            self.store._upsert_records([calendar_record])
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM records").fetchone()[0], 1)
        self.assertEqual(self.quest("math", at(9))["minutes"], 60)
        self.assertEqual(self.store.submit_quest("math", at(9))["wallet"], {"coins": 120, "diamonds": 2})

    def test_confirmed_source_deletion_excluded_before_settlement(self):
        self.store.accept_quest("math", at(8))
        self.add(record(1, "数学", at(8), at(9)))
        self.source.write_text('{"PCRecord": []}')
        self.store.import_source()
        self.store.import_source()
        self.assertEqual(self.quest("math", at(9))["minutes"], 0)
        with self.assertRaises(ValueError):
            self.store.submit_quest("math", at(9))
        self.assertEqual(self.store.quest_state(at(9))["wallet"], {"coins": 0, "diamonds": 0})

    def test_different_acceptance_times_use_disjoint_slices(self):
        self.store.accept_quest("politics", at(12))
        self.store.accept_quest("english", at(11))
        self.add(record(1, "跨时段学习", at(11, 30), at(12, 30)))
        self.store.update_settings({"mapping": {"跨时段学习": "politics"}})
        morning = self.store.submit_quest("politics", at(12, 30))
        self.assertEqual(morning["receipt"]["minutes"], 30)
        self.store.update_settings({"mapping": {"跨时段学习": "english"}})
        afternoon = self.store.submit_quest("english", at(12, 30))
        self.assertEqual(afternoon["receipt"]["minutes"], 30)
        self.assertEqual(afternoon["wallet"], {"coins": 120, "diamonds": 4})

    def test_new_day_keeps_quest_acceptance_wallet_and_history(self):
        self.earn_math()
        next_day = self.store.quest_state(at(0, day=24))
        self.assertEqual(next_day["wallet"], {"coins": 480, "diamonds": 8})
        self.assertEqual(next_day["quests"][0]["status"], "active")
        self.assertIsNotNone(next_day["quests"][0]["acceptedAt"])
        self.assertEqual(next_day["quests"][0]["settledMinutes"], 240)
        self.assertEqual(len(next_day["history"]), 1)
        self.store.accept_quest("math", at(0, day=24))
        self.assertEqual(self.quest("math", at(1, day=24))["minutes"], 0)

    def test_shop_purchase_equip_restart_and_errors(self):
        for action, item in ((self.store.buy_item, "nope"), (self.store.equip_item, "npc-scholar"),
                             (self.store.buy_item, "avatar-star"), (self.store.buy_item, [])):
            with self.assertRaises(ValueError):
                action(item, at(9))
        self.earn_math()
        bought = self.store.buy_item("bar-aurora", at(12))
        self.assertEqual(bought["wallet"], {"coins": 240, "diamonds": 8})
        self.assertEqual(bought["equipped"]["bar"], "bar-default")
        self.assertTrue(self.store.buy_item("bar-aurora", at(12))["receipt"]["alreadyOwned"])
        self.assertEqual(self.store.equip_item("bar-aurora", at(12))["equipped"]["bar"], "bar-aurora")
        self.assertEqual(self.store.equip_item("bar-default", at(12))["equipped"]["bar"], "bar-default")
        self.store.equip_item("bar-aurora", at(12))
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)
        restored = self.store.quest_state(at(12))
        self.assertEqual(restored["wallet"], {"coins": 240, "diamonds": 8})
        self.assertEqual(restored["equipped"]["bar"], "bar-aurora")
        self.assertEqual(restored["quests"][0]["status"], "active")
        self.assertEqual(self.store.buy_item("bar-default", at(12))["wallet"], restored["wallet"])

    def test_cross_connection_double_claim_and_double_spend(self):
        self.store.accept_quest("math", at(8))
        self.add(record(1, "数学", at(8), at(12)))
        second = server.FocusStore(self.data, self.source)
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def submit(store):
            barrier.wait()
            return store.submit_quest("math", at(12))
        with ThreadPoolExecutor(max_workers=2) as executor:
            outputs = list(executor.map(submit, (self.store, second)))
        self.assertEqual(sorted(output["receipt"]["alreadyClaimed"] for output in outputs), [False, True])
        self.assertEqual(self.store.quest_state(at(12))["wallet"], {"coins": 480, "diamonds": 8})
        barrier = threading.Barrier(2)
        def buy(pair):
            store, item = pair
            barrier.wait()
            try:
                store.buy_item(item, at(12))
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(buy, ((self.store, "bar-comet"), (second, "fx-snow"))))
        self.assertEqual(sorted(results), [False, True])
        self.assertIn(self.store.quest_state(at(12))["wallet"]["coins"], (60, 120))
        self.assertEqual(self.store.quest_state(at(12))["wallet"]["diamonds"], 8)

    def test_subject_time_validation_and_state_real_today(self):
        for subject in (None, [], "other", "constructor"):
            with self.assertRaises(ValueError):
                self.store.accept_quest(subject, at(9))
        with self.assertRaises(ValueError):
            self.store.quest_state(datetime(2026, 9, 23, 9))
        current_day = datetime.now().astimezone().date().isoformat()
        self.assertEqual(self.store.state("2020-01-01")["quests"]["day"], current_day)


class QuestHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.FocusStore(Path(self.temp.name) / "data", Path(self.temp.name) / "source.json")
        self.http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        self.port = self.http.server_address[1]
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.store.close()
        self.temp.cleanup()

    def request(self, method, path, payload=None, origin=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin
        connection.request(method, path, body=None if payload is None else json.dumps(payload), headers=headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_quest_routes_clock_injection_origin_and_payload_validation(self):
        self.assertEqual(self.request("GET", "/api/quests")[0], 200)
        self.assertEqual(self.request("GET", "/api/quests?now=2026-09-23")[0], 400)
        self.assertEqual(self.request("POST", "/api/shop/buy", {"itemId": "bar-default"})[0], 200)
        self.assertEqual(self.request("POST", "/api/shop/equip", {"itemId": "bar-default"})[0], 200)
        for path, payload in (("/api/quests/accept", {"subject": "math", "now": "2026-09-23T08:00:00+08:00"}),
                              ("/api/quests/submit", {"subject": "math", "minutes": 60}),
                              ("/api/quests/accept?date=2026-09-23", {"subject": "math"}),
                              ("/api/shop/buy", {"itemId": "bar-aurora", "coins": 0}),
                              ("/api/shop/equip", {"itemId": "bar-default", "slot": "avatar"}),
                              ("/api/quests/accept", {"subject": []}),
                              ("/api/shop/buy", {"itemId": []})):
            self.assertEqual(self.request("POST", path, payload)[0], 400)
        self.assertEqual(self.request("POST", "/api/shop/buy", {"itemId": "bar-default"}, "https://evil.example")[0], 403)


if __name__ == "__main__":
    unittest.main()
