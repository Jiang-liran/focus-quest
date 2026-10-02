"""Persistent, continuous commissions; all fixtures stay in temporary stores."""
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("continuous_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
TZ = timezone(timedelta(hours=8))


def at(day=23, hour=8, minute=0, second=0):
    return datetime(2026, 9, day, hour, minute, second, tzinfo=TZ)


def ms(value):
    return int(value.timestamp() * 1000)


def rid():
    return str(uuid.uuid4())


def record(identity, start, end, name="数学", minutes=None):
    return {"id": identity, "name": name, "time": (end-start).total_seconds()/60 if minutes is None else minutes,
            "startDate": ms(start), "createDate": ms(end), "isComplete": 1}


class ContinuousQuestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.source = Path(self.temp.name) / "source.json"
        self.store = server.FocusStore(self.data, self.source)
        self.records = []

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, *rows):
        self.records.extend(rows)
        self.source.write_text(json.dumps({"PCRecord": self.records}), encoding="utf-8")
        self.store.import_source()

    def quest(self, now, subject="math"):
        return next(q for q in self.store.quest_state(now)["quests"] if q["subject"] == subject)

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)

    def submit(self, now, subject="math", request_id=None):
        return self.store.submit_quest(subject, now, request_id=request_id or rid())

    def test_today_settled_uses_delivery_day_with_midnight_reset_late_study_and_retries(self):
        self.store.accept_quest("math", at(hour=22))
        self.add(record("first", at(hour=22), at(hour=23)))
        self.submit(at(hour=23, minute=59, second=59))
        self.assertEqual(self.quest(at(hour=23, minute=59, second=59))["todaySettledMinutes"], 60)
        midnight = self.quest(at(day=24, hour=0))
        self.assertEqual(midnight["todaySettledMinutes"], 0)
        self.assertEqual((midnight["settledMinutes"], midnight["totalMinutes"]), (60, 60))
        # Yesterday's study arrives and is delivered today, so it counts today.
        self.add(record("late", at(hour=23), at(hour=23, minute=30)))
        request_id = rid()
        late = self.submit(at(day=24, hour=0), request_id=request_id)
        self.assertEqual(late["receipt"]["minutes"], 30)
        self.assertEqual(self.quest(at(day=24, hour=0))["todaySettledMinutes"], 30)
        repeated = self.submit(at(day=24, hour=0, minute=1), request_id=request_id)
        self.assertTrue(repeated["receipt"]["alreadyClaimed"])
        self.assertEqual(repeated["wallet"], late["wallet"])
        self.add(record("next", at(day=24, hour=0), at(day=24, hour=0, minute=15)))
        self.submit(at(day=24, hour=1))
        today = self.quest(at(day=24, hour=23, minute=59, second=59))
        self.assertEqual((today["todaySettledMinutes"], today["settledMinutes"], today["totalMinutes"]), (45, 105, 105))
        tomorrow = self.quest(at(day=25, hour=0))
        self.assertEqual(tomorrow["todaySettledMinutes"], 0)
        for field in ("settledMinutes", "totalMinutes", "progressMinutes", "paidCoins", "paidDiamonds", "reward"):
            self.assertEqual(tomorrow[field], today[field], field)
        self.restart()
        self.assertEqual(self.quest(at(day=24, hour=23))["todaySettledMinutes"], 45)
        self.assertEqual(self.quest(at(day=23, hour=23))["todaySettledMinutes"], 60)

    def test_today_settled_sums_uncapped_history_and_legacy_by_local_submission_time(self):
        start_ms, end_ms = ms(at(day=24, hour=0)), ms(at(day=25, hour=0))
        with self.store.db:
            for i in range(25):
                self.store.db.execute("INSERT INTO quest_deliveries VALUES (?,?,?,?,?,?,?,?,?)",
                    (rid(), "math", "数学", 1.25, 2, 0, start_ms + i * 60000, 1.25 * (i + 1), "[]"))
            for subject, amount, submitted in (("math", 42.5, start_ms - 1), ("math", 100, end_ms), ("cs", 999, start_ms)):
                self.store.db.execute("INSERT INTO quest_deliveries VALUES (?,?,?,?,?,?,?,?,?)",
                    (rid(), subject, subject, amount, 0, 0, submitted, amount, "[]"))
            # The legacy day identifies study, not submission; last millisecond counts.
            self.store.db.execute("INSERT INTO quest_receipts VALUES (?,?,?,?,?,?,?)",
                ("2026-09-22", "math", "数学", 7.5, 15, 0, end_ms - 1))
            # Bonus-only delivery carries no study minutes.
            self.store.db.execute("INSERT INTO quest_deliveries VALUES (?,?,?,?,?,?,?,?,?)",
                (rid(), "math", "数学", 0, 60, 1, start_ms + 300000, 0, "[]"))
        before = [tuple(row) for row in self.store.db.execute("SELECT * FROM quest_receipts")]
        state = self.store.quest_state(at(day=24, hour=23, minute=59, second=59))
        self.assertEqual(len(state["history"]), 20)
        self.assertEqual(next(row for row in state["quests"] if row["subject"] == "math")["todaySettledMinutes"], 38.75)
        self.assertEqual(self.quest(at(day=24, hour=23), "cs")["todaySettledMinutes"], 999)
        self.assertEqual(self.quest(at(day=23, hour=23))["todaySettledMinutes"], 42.5)
        self.assertEqual(self.quest(at(day=25, hour=0))["todaySettledMinutes"], 100)
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM quest_receipts")], before)
        self.restart()
        self.assertEqual(self.quest(at(day=24, hour=23))["todaySettledMinutes"], 38.75)

    def test_empty_deliveries_are_numeric_zero_for_all_subjects(self):
        for quest in self.store.quest_state(at())["quests"]:
            self.assertEqual(quest["todaySettledMinutes"], 0)
            self.assertIsInstance(quest["todaySettledMinutes"], (int, float))
            self.assertEqual(quest["settledMinutes"], 0)
        self.store.accept_quest("math", at())
        self.add(record("unclaimed", at(), at(hour=9)))
        self.assertEqual(self.quest(at(hour=10))["todaySettledMinutes"], 0)
        self.assertEqual(self.quest(at(hour=10))["minutes"], 60)

    def test_all_subjects_are_available_at_night_without_rate_difference(self):
        for subject, name in (("math", "数学"), ("cs", "408"), ("politics", "政治"), ("english", "英语")):
            self.store.accept_quest(subject, at(hour=22))
            self.add(record(subject, at(hour=22), at(hour=23), name))
            q = self.quest(at(hour=23), subject)
            self.assertEqual(q["status"], "ready")
            self.assertEqual(q["reward"]["coins"], 120)
            self.assertEqual(q["reward"]["diamonds"], 2 if subject in ("math", "cs") else 4)
            self.assertEqual(q["period"], "anytime")
            self.assertFalse(q["recommended"]["active"])
            self.assertTrue(q["recommended"]["bonus"])
            self.assertIsNone(q["deadline"])
            self.assertIsNone(q["submitDeadline"])
        self.assertTrue(self.quest(at(hour=6))["recommended"]["active"])
        self.assertFalse(self.quest(at(hour=12))["recommended"]["active"])
        self.assertTrue(self.quest(at(hour=12), "cs")["recommended"]["active"])
        self.assertFalse(self.quest(at(hour=18), "cs")["recommended"]["active"])

    def test_ninety_then_thirty_preserves_diamond_remainder(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9, minute=30)))
        q = self.quest(at(hour=10))
        self.assertEqual((q["minutes"], q["settledMinutes"], q["totalMinutes"], q["progressMinutes"]), (90, 0, 90, 90))
        first = self.submit(at(hour=10))
        self.assertEqual(first["wallet"], {"coins": 180, "diamonds": 2})
        q = self.quest(at(hour=10))
        self.assertEqual((q["minutes"], q["settledMinutes"], q["totalMinutes"], q["progressMinutes"]), (0, 90, 90, 30))
        self.assertTrue(q["firstCompleted"])
        self.add(record(2, at(hour=10), at(hour=10, minute=30)))
        second = self.submit(at(hour=11))
        self.assertEqual((second["receipt"]["coins"], second["receipt"]["diamonds"]), (60, 2))
        self.assertEqual(second["wallet"], {"coins": 240, "diamonds": 4})
        self.assertEqual(self.quest(at(hour=11))["progressMinutes"], 0)

    def test_after_first_target_fifteen_minutes_are_deliverable(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        self.submit(at(hour=9))
        self.add(record(2, at(hour=10), at(hour=10, minute=15)))
        self.assertEqual(self.quest(at(hour=11))["status"], "ready")
        receipt = self.submit(at(hour=11))["receipt"]
        self.assertEqual((receipt["coins"], receipt["diamonds"]), (30, 0))
        self.assertEqual(self.quest(at(hour=11))["progressMinutes"], 15)

    def test_coin_fraction_is_retained_between_deliveries(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9, second=15)))
        self.assertEqual(self.submit(at(hour=10))["wallet"]["coins"], 120)
        self.add(record(2, at(hour=10), at(hour=10, second=15)))
        self.assertEqual(self.quest(at(hour=11))["status"], "ready")
        self.assertEqual(self.submit(at(hour=11))["wallet"]["coins"], 121)
        self.assertEqual(self.quest(at(hour=11))["settledMinutes"], 60.5)

    def test_cross_midnight_and_unfinished_progress_survive_restart(self):
        self.store.accept_quest("math", at(hour=23))
        self.add(record(1, at(hour=22, minute=30), at(hour=23, minute=30)))
        self.assertEqual(self.quest(at(hour=23, minute=30))["minutes"], 30)
        self.restart()
        self.store.accept_quest("math", at(day=24, hour=0))
        self.add(record(2, at(hour=23, minute=45), at(day=24, hour=0, minute=15)))
        q = self.quest(at(day=24, hour=0, minute=15))
        self.assertEqual(q["minutes"], 60)
        self.assertEqual(q["acceptedAt"], at(hour=23).isoformat())
        self.assertEqual(self.submit(at(day=24, hour=1))["wallet"], {"coins": 120, "diamonds": 2})

    def test_late_phone_record_before_previous_delivery_is_still_paid(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(hour=9), at(hour=10)))
        self.submit(at(hour=11))
        self.add(record("late", at(), at(hour=8, minute=30)))
        late = self.quest(at(day=24))
        self.assertEqual(late["minutes"], 30)
        receipt = self.submit(at(day=24))["receipt"]
        self.assertEqual((receipt["minutes"], receipt["coins"]), (30, 60))

    def test_same_request_does_not_consume_new_records_after_response_loss(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        request = rid()
        first = self.submit(at(hour=9), request_id=request)
        self.add(record(2, at(hour=10), at(hour=10, minute=15)))
        self.restart()
        retry = self.submit(at(hour=11), request_id=request)
        self.assertTrue(retry["receipt"]["alreadyClaimed"])
        self.assertEqual(retry["receipt"]["submittedAt"], first["receipt"]["submittedAt"])
        self.assertEqual(retry["wallet"], first["wallet"])
        self.assertEqual(self.quest(at(hour=11))["minutes"], 15)
        self.assertEqual(self.submit(at(hour=11))["wallet"]["coins"], 150)
        with self.assertRaises(ValueError):
            self.submit(at(hour=11), "cs", request)

    def test_invalid_request_ids_are_rejected_without_payment(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        for request in ("", "not-a-uuid", "x" * 36, [], 0, True):
            with self.subTest(request=request), self.assertRaises(ValueError):
                self.store.submit_quest("math", at(hour=9), request_id=request)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_two_connections_same_uuid_is_exactly_once(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        other = server.FocusStore(self.data, self.source)
        self.addCleanup(other.close)
        barrier, request = threading.Barrier(2), rid()
        def invoke(store):
            barrier.wait(timeout=3)
            return store.submit_quest("math", at(hour=9), request_id=request)
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(invoke, (self.store, other)))
        self.assertEqual(sorted(r["receipt"]["alreadyClaimed"] for r in results), [False, True])
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM quest_deliveries").fetchone()[0], 1)
        self.assertEqual(self.store._wallet(), {"coins": 120, "diamonds": 2})

    def test_two_different_uuids_cannot_spend_the_same_minutes(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        other = server.FocusStore(self.data, self.source)
        self.addCleanup(other.close)
        barrier = threading.Barrier(2)
        def invoke(store):
            barrier.wait(timeout=3)
            try:
                store.submit_quest("math", at(hour=9), request_id=rid())
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(invoke, (self.store, other)))
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(self.store._wallet(), {"coins": 120, "diamonds": 2})

    def test_failed_allocation_rolls_back_receipt_wallet_and_track(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        request = rid()
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER fail_allocation BEFORE INSERT ON quest_allocations
                BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END""")
        with self.assertRaises(sqlite3.IntegrityError):
            self.submit(at(hour=9), request_id=request)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM quest_deliveries").fetchone()[0], 0)
        self.assertEqual(self.quest(at(hour=9))["settledMinutes"], 0)
        self.assertEqual(self.quest(at(hour=9))["minutes"], 60)
        with self.store.db:
            self.store.db.execute("DROP TRIGGER fail_allocation")
        self.assertEqual(self.submit(at(hour=9), request_id=request)["wallet"], {"coins": 120, "diamonds": 2})

    def test_cross_subject_mapping_and_canonical_mirror_cannot_repeat(self):
        self.store.accept_quest("math", at())
        self.store.accept_quest("english", at())
        self.add(record(1, at(), at(hour=9)))
        self.submit(at(hour=9))
        mirror = ("calendar:mirror", "mirror", "数学", 60, ms(at()), ms(at(hour=9)), "2026-09-23", "calendar")
        with self.store.db:
            self.store._upsert_records([mirror])
        self.store.update_settings({"mapping": {"数学": "english"}})
        self.assertEqual(self.quest(at(day=24), "english")["minutes"], 0)
        self.assertEqual(self.store._wallet(), {"coins": 120, "diamonds": 2})

    def seed_old_acceptance(self, subject, when):
        with self.store.db:
            self.store.db.execute("INSERT INTO quest_acceptances VALUES (?,?,?,?,?)",
                                  (when.date().isoformat(), subject, ms(when), ms(when), "accepted"))

    def seed_old_receipt(self, subject, start, end, minutes, identity):
        self.seed_old_acceptance(subject, start)
        self.add(record(identity, start, end, minutes=minutes))
        target = 60 if subject in ("math", "cs") else 30
        coins, diamonds = int(minutes * 2), int(minutes // target) * 2
        day = start.date().isoformat()
        with self.store.db:
            self.store.db.execute("INSERT INTO quest_receipts VALUES (?,?,?,?,?,?,?)",
                                  (day, subject, "旧委托", minutes, coins, diamonds, ms(end)))
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)", (f"quest:{day}:{subject}", coins, diamonds, ms(end)))
            self.store.db.execute("INSERT INTO quest_allocations VALUES (?,?,?,?,?,?)",
                                  (day, subject, f"{identity}:{ms(start)}", ms(start), ms(end), minutes))

    def migrate(self, when):
        with self.store.db:
            self.store.db.execute("DELETE FROM meta WHERE key='continuous_quests_v1'")
        self.store._migrate_continuous_quests(when)

    def test_migration_preserves_wallet_old_receipts_and_diamond_remainder(self):
        self.seed_old_receipt("math", at(), at(hour=9, minute=30), 90, 1)
        before = tuple(self.store.db.execute("SELECT * FROM quest_receipts").fetchone())
        self.migrate(at(day=24, hour=20))
        self.assertEqual(self.store._wallet(), {"coins": 180, "diamonds": 2})
        self.assertEqual(self.quest(at(day=24, hour=20))["progressMinutes"], 30)
        self.add(record(2, at(day=24, hour=20), at(day=24, hour=20, minute=30)))
        result = self.submit(at(day=24, hour=21))
        self.assertEqual(result["wallet"], {"coins": 240, "diamonds": 4})
        self.assertEqual(tuple(self.store.db.execute("SELECT * FROM quest_receipts").fetchone()), before)
        self.assertEqual(len(result["history"]), 2)
        self.restart()
        self.assertEqual(self.store._wallet(), result["wallet"])
        self.assertEqual(self.quest(at(day=24, hour=21))["minutes"], 0)

    def test_migration_keeps_old_unpaid_window_and_late_sync_but_not_unaccepted_gaps(self):
        self.seed_old_acceptance("math", at(hour=9))
        self.migrate(at(day=24, hour=20))
        # Arriving after upgrade, the old accepted interval still counts.
        self.add(record(1, at(hour=8), at(hour=9)), record(2, at(hour=9), at(hour=10)),
                 record(3, at(hour=12), at(hour=13)),
                 record(4, at(day=24, hour=18), at(day=24, hour=19)))
        self.assertEqual(self.quest(at(day=24, hour=21))["minutes"], 60)
        self.assertEqual(self.submit(at(day=24, hour=21))["wallet"], {"coins": 120, "diamonds": 2})

    def test_migration_does_not_repay_old_daily_rounding_differences(self):
        self.seed_old_receipt("math", at(day=21), at(day=21, hour=9, minute=59), 119, 1)
        self.seed_old_receipt("math", at(day=22), at(day=22, hour=9, minute=59), 119, 2)
        self.migrate(at(day=24, hour=20))
        q = self.quest(at(day=24, hour=20))
        self.assertEqual(q["reward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(q["progressMinutes"], 58)
        self.assertEqual(self.store._wallet(), {"coins": 476, "diamonds": 4})
        self.add(record(3, at(day=24, hour=20), at(day=24, hour=20, minute=2)))
        self.assertEqual(self.submit(at(day=24, hour=21))["wallet"], {"coins": 480, "diamonds": 6})

    def test_migration_mid_window_does_not_count_shared_boundary_twice(self):
        self.seed_old_acceptance("math", at(hour=8))
        self.migrate(at(hour=10))
        self.add(record(1, at(hour=9), at(hour=11)))
        self.assertEqual(self.quest(at(hour=11))["minutes"], 120)
        self.assertEqual(self.submit(at(hour=11))["wallet"], {"coins": 240, "diamonds": 4})

    def test_http_requires_uuid_and_retries_original_receipt(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        def post(body):
            conn = HTTPConnection("127.0.0.1", http.server_address[1], timeout=3)
            conn.request("POST", "/api/quests/submit", json.dumps(body), {"Content-Type": "application/json"})
            response = conn.getresponse()
            result = response.status, json.loads(response.read())
            conn.close()
            return result
        try:
            request = rid()
            for body in ({"subject": "math"}, {"subject": "math", "requestId": None},
                         {"subject": "math", "requestId": "bad"},
                         {"subject": "math", "requestId": request, "now": at().isoformat()}):
                self.assertEqual(post(body)[0], 400)
            with patch.object(server, "quest_clock", return_value=at(hour=11)):
                status, result = post({"subject": "math", "requestId": request})
                self.assertEqual(status, 200)
                self.assertEqual(result["wallet"], {"coins": 120, "diamonds": 2})
                self.add(record(2, at(hour=10), at(hour=10, minute=15)))
                status, result = post({"subject": "math", "requestId": request})
                self.assertEqual(status, 200)
                self.assertTrue(result["receipt"]["alreadyClaimed"])
                self.assertEqual(result["wallet"]["coins"], 120)
        finally:
            http.shutdown()
            http.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
