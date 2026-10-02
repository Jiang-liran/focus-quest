"""Daily time-window bonuses supplement continuous rewards in temporary stores."""
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("timed_bonus_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
TZ = timezone(timedelta(hours=8))


def at(day=24, hour=8, minute=0, second=0):
    return datetime(2026, 9, day, hour, minute, second, tzinfo=TZ)


def ms(value):
    return int(value.timestamp() * 1000)


def record(identity, start, end, name="数学", minutes=None):
    return {"id": identity, "name": name, "time": (end-start).total_seconds()/60 if minutes is None else minutes,
            "startDate": ms(start), "createDate": ms(end), "isComplete": 1}


class TimedBonusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.source = Path(self.temp.name) / "source.json"
        with patch.object(server, "quest_clock", return_value=at(hour=15)):
            self.store = server.FocusStore(self.data, self.source)
        self.records = []

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)

    def add(self, *rows):
        self.records.extend(rows)
        self.source.write_text(json.dumps({"PCRecord": self.records}), encoding="utf-8")
        self.store.import_source()

    def quest(self, subject="math", now=None):
        return next(q for q in self.store.quest_state(now or at(hour=20))["quests"] if q["subject"] == subject)

    def submit(self, subject="math", now=None, request=None):
        return self.store.submit_quest(subject, now or at(hour=20), request_id=request or str(uuid.uuid4()))

    def seed_first_round(self, subject="math", name="数学"):
        self.store.accept_quest(subject, at(day=23, hour=20))
        self.add(record("previous", at(day=23, hour=20), at(day=23, hour=21), name))
        self.submit(subject, at(day=23, hour=21))

    def test_feature_starts_at_upgrade_day_midnight_and_never_moves_on_restart(self):
        expected = ms(at(hour=0))
        self.assertEqual(int(self.store._meta(server.TIMED_BONUS_START_META)), expected)
        self.store._initialize_timed_bonus(at(day=26, hour=22))
        self.restart()
        self.assertEqual(int(self.store._meta(server.TIMED_BONUS_START_META)), expected)
        self.assertEqual(self.quest()["bonus"]["featureStartMs"], expected)

    def test_today_existing_39_minutes_carry_forward_but_previous_days_do_not(self):
        self.store.accept_quest("math", at(day=23, hour=0))
        self.add(record("old", at(day=23), at(day=23, hour=10)),
                 record("today", at(hour=9), at(hour=9, minute=39)))
        q = self.quest(now=at(hour=10))
        self.assertEqual(q["bonus"]["minutes"], 39)
        self.assertEqual(q["bonus"]["pendingCount"], 0)
        self.add(record("rest", at(hour=10), at(hour=10, minute=21)))
        q = self.quest(now=at(hour=11))
        self.assertEqual(q["bonus"]["pendingCount"], 1)
        self.assertEqual(q["bonus"]["pending"][0]["day"], "2026-09-24")

    def test_all_four_targets_get_exact_extra_half_coins_and_one_diamond(self):
        for subject, name, start_hour, target in (("math", "数学", 9, 60), ("politics", "政治", 10, 30),
                                                  ("cs", "408", 13, 60), ("english", "英语", 15, 30)):
            with self.subTest(subject=subject):
                start = at(hour=start_hour)
                self.store.accept_quest(subject, start)
                self.add(record(subject, start, start+timedelta(minutes=target), name))
                q = self.quest(subject)
                self.assertEqual(q["bonus"]["status"], "ready")
                self.assertEqual(q["rewardBreakdown"], {"base": {"coins": target*2, "diamonds": 2}, "bonus": {"coins": target, "diamonds": 1}})
                receipt = self.submit(subject)["receipt"]
                self.assertEqual((receipt["coins"], receipt["diamonds"]), (target*3, 3))
                self.assertEqual(receipt["baseReward"], {"coins": target*2, "diamonds": 2})
                self.assertEqual(receipt["bonusReward"], {"coins": target, "diamonds": 1})
                self.assertEqual(len(receipt["bonuses"]), 1)
                self.assertEqual(self.quest(subject)["bonus"]["status"], "claimed")

    def test_off_window_base_rewards_remain_exactly_unchanged(self):
        self.store.accept_quest("math", at(hour=18))
        self.add(record(1, at(hour=18), at(hour=19)))
        q = self.quest()
        self.assertEqual(q["bonus"]["minutes"], 0)
        self.assertEqual(q["bonus"]["status"], "ended")
        self.assertEqual(q["reward"], {"coins": 120, "diamonds": 2})
        self.assertEqual(self.submit()["wallet"], {"coins": 120, "diamonds": 2})

    def test_window_boundaries_midnight_noon_and_eighteen_are_sliced_exactly(self):
        self.store.accept_quest("math", at(day=23, hour=23, minute=30))
        self.add(record(1, at(day=23, hour=23, minute=30), at(hour=0, minute=30)),
                 record(2, at(hour=11, minute=30), at(hour=12, minute=30)))
        q = self.quest(now=at(hour=12, minute=30))
        self.assertEqual(q["minutes"], 120)
        self.assertEqual(q["bonus"]["minutes"], 60)
        self.store.accept_quest("cs", at(hour=0))
        self.add(record(3, at(hour=11, minute=30), at(hour=12, minute=30), "408"),
                 record(4, at(hour=17, minute=30), at(hour=18, minute=30), "408"),
                 record(5, at(hour=18, minute=30), at(hour=19, minute=30), "408"))
        self.assertEqual(self.quest("cs")["bonus"]["minutes"], 60)
        self.assertEqual(self.quest("cs")["minutes"], 180)

    def test_finished_exactly_at_deadline_qualifies_but_future_record_waits(self):
        self.store.accept_quest("math", at(hour=0))
        self.add(record(1, at(hour=11), at(hour=12)))
        self.assertEqual(self.quest(now=at(hour=11, minute=59, second=59))["bonus"]["minutes"], 0)
        self.assertEqual(self.quest(now=at(hour=12))["bonus"]["status"], "ready")
        self.assertEqual(self.submit(now=at(day=25))["receipt"]["bonusReward"], {"coins": 60, "diamonds": 1})

    def test_record_finishing_after_window_credits_only_completed_in_window_portion(self):
        self.store.accept_quest("math", at(hour=8))
        self.add(record(1, at(hour=11), at(hour=13)))
        self.assertEqual(self.quest(now=at(hour=12))["bonus"]["minutes"], 0)
        self.assertEqual(self.quest(now=at(hour=13))["bonus"]["minutes"], 60)
        self.assertEqual(self.quest(now=at(hour=13))["bonus"]["status"], "ready")

    def test_acceptance_pause_ratio_span_cap_and_near_target_are_respected(self):
        self.store.accept_quest("math", at(hour=10))
        self.add(record(1, at(hour=9), at(hour=11), minutes=60),
                 record(2, at(hour=11), at(hour=11, minute=20), minutes=300),
                 record(3, at(hour=11, minute=20), at(hour=11, minute=30), minutes=9.994))
        q = self.quest(now=at(hour=11, minute=30))
        self.assertAlmostEqual(q["bonus"]["minutes"], 59.994)
        self.assertEqual(q["bonus"]["pendingCount"], 0)
        self.assertNotEqual(q["bonus"]["status"], "ready")
        self.add(record(4, at(hour=11, minute=30), at(hour=11, minute=31), minutes=.006))
        self.assertEqual(self.quest(now=at(hour=11, minute=31))["bonus"]["status"], "ready")

    def test_settled_half_round_plus_new_half_round_still_qualifies(self):
        self.seed_first_round()
        self.add(record(1, at(), at(hour=8, minute=30)))
        first = self.submit(now=at(hour=8, minute=30))
        self.assertEqual(first["receipt"]["bonusReward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(first["receipt"]["baseReward"], {"coins": 60, "diamonds": 0})
        self.add(record(2, at(hour=9), at(hour=9, minute=30)))
        q = self.quest(now=at(hour=10))
        self.assertEqual(q["minutes"], 30)
        self.assertEqual(q["bonus"]["minutes"], 60)
        second = self.submit(now=at(hour=10))
        self.assertEqual(second["receipt"]["baseReward"], {"coins": 60, "diamonds": 2})
        self.assertEqual(second["receipt"]["bonusReward"], {"coins": 60, "diamonds": 1})

    def test_bonus_never_offsets_future_base_gold_or_diamond_remainders(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        self.assertEqual(self.submit(now=at(hour=9))["wallet"], {"coins": 180, "diamonds": 3})
        track = self.store.db.execute("SELECT * FROM quest_tracks WHERE subject='math'").fetchone()
        self.assertEqual((track["paid_coins"], track["paid_diamonds"]), (120, 2))
        self.add(record(2, at(hour=10), at(hour=10, minute=30)))
        self.assertEqual(self.submit(now=at(hour=11))["receipt"]["baseReward"], {"coins": 60, "diamonds": 0})
        self.add(record(3, at(hour=11), at(hour=11, minute=30)))
        third = self.submit(now=at(hour=12))
        self.assertEqual(third["receipt"]["baseReward"], {"coins": 60, "diamonds": 2})
        self.assertEqual(third["receipt"]["bonusReward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(third["wallet"], {"coins": 300, "diamonds": 5})

    def test_late_records_can_claim_multiple_prior_days_in_one_delivery(self):
        self.store.accept_quest("math", at(hour=0))
        self.add(record(1, at(), at(hour=9)), record(2, at(day=25), at(day=25, hour=9)))
        q = self.quest(now=at(day=26, hour=20))
        self.assertEqual(q["bonus"]["status"], "ended")
        self.assertEqual(q["bonus"]["minutes"], 0)
        self.assertEqual(q["bonus"]["pendingCount"], 2)
        self.assertEqual([item["day"] for item in q["bonus"]["pending"]], ["2026-09-24", "2026-09-25"])
        result = self.submit(now=at(day=26, hour=20))
        self.assertEqual(result["wallet"], {"coins": 360, "diamonds": 6})
        self.assertEqual(result["receipt"]["bonusReward"], {"coins": 120, "diamonds": 2})
        self.assertEqual(result["history"][0]["bonuses"], result["receipt"]["bonuses"])

    def test_bonus_only_claim_keeps_settled_base_totals_unchanged(self):
        # Model base rewards settled by the old version earlier on upgrade day.
        with self.store.db:
            self.store._set_meta(server.TIMED_BONUS_START_META, ms(at(day=25, hour=0)))
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        self.submit(now=at(hour=9))
        with self.store.db:
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.TIMED_BONUS_START_META,))
        self.store._initialize_timed_bonus(at(hour=15))
        before = tuple(self.store.db.execute("SELECT * FROM quest_tracks").fetchone())
        q = self.quest(now=at(hour=15))
        self.assertEqual((q["minutes"], q["status"], q["baseReady"]), (0, "ready", False))
        self.assertEqual(q["reward"], {"coins": 60, "diamonds": 1})
        result = self.submit(now=at(hour=15))
        self.assertEqual(result["receipt"]["minutes"], 0)
        self.assertEqual(result["receipt"]["baseReward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(result["wallet"], {"coins": 180, "diamonds": 3})
        self.assertEqual(tuple(self.store.db.execute("SELECT * FROM quest_tracks").fetchone()), before)

    def test_source_duplicates_deleted_before_claim_and_mapping_changes_do_not_double_qualify(self):
        self.store.accept_quest("math", at(hour=0))
        self.store.accept_quest("politics", at(hour=0))
        row = record(1, at(), at(hour=9))
        self.add(row, dict(row))
        self.store.move_record(f"1:{row['startDate']}")
        self.assertEqual(self.quest()["bonus"]["minutes"], 0)
        self.store.move_record(f"1:{row['startDate']}", restore=True)
        self.assertEqual(self.quest()["bonus"]["minutes"], 60)
        self.submit()
        self.store.update_settings({"mapping": {"数学": "politics"}})
        self.assertEqual(self.quest("politics")["bonus"]["minutes"], 0)
        self.store.move_record(f"1:{row['startDate']}")
        self.store.move_record(f"1:{row['startDate']}", restore=True)
        self.add()
        self.assertEqual(self.quest()["bonus"]["status"], "claimed")
        self.assertEqual(self.quest()["bonus"]["pendingCount"], 0)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM quest_bonus_receipts").fetchone()[0], 1)

    def test_settled_evidence_survives_canonical_alias_merge_and_keeps_subject_ownership(self):
        self.seed_first_round()
        self.store.accept_quest("politics", at(hour=0))
        self.add(record(1, at(), at(hour=8, minute=30)))
        self.submit(now=at(hour=8, minute=30))
        original_id = f"1:{ms(at())}"
        with self.store.db:
            # Reproduce a source identity being redirected after it was paid.
            self.store.db.execute("UPDATE records SET id='canonical' WHERE id=?", (original_id,))
            self.store.db.execute("UPDATE record_aliases SET record_id='canonical' WHERE record_id=?", (original_id,))
            self.store.db.execute("INSERT INTO record_merges VALUES (?,'canonical','now','{}')", (original_id,))
        self.store.update_settings({"mapping": {"数学": "politics"}})
        self.assertEqual(self.quest("politics")["bonus"]["minutes"], 0)
        self.assertEqual(self.quest()["bonus"]["minutes"], 30)
        with self.store.db:
            self.store.db.execute("INSERT INTO quest_allocations VALUES (?,?,?,?,?,?)",
                                  ("2026-09-24", "politics", "canonical", ms(at()), ms(at(hour=8, minute=30)), 30))
        self.assertEqual(self.quest("politics")["bonus"]["minutes"], 0)

    def test_uuid_retry_after_late_new_day_does_not_claim_additional_bonus(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        request = str(uuid.uuid4())
        original = self.submit(now=at(hour=9), request=request)
        self.add(record(2, at(day=25), at(day=25, hour=9)))
        self.restart()
        retry = self.submit(now=at(day=25, hour=10), request=request)
        self.assertTrue(retry["receipt"]["alreadyClaimed"])
        self.assertEqual(retry["receipt"]["bonuses"], original["receipt"]["bonuses"])
        self.assertEqual(retry["wallet"], original["wallet"])
        self.assertEqual(self.quest(now=at(day=25, hour=10))["bonus"]["pendingCount"], 1)
        self.assertEqual(self.submit(now=at(day=25, hour=10))["wallet"], {"coins": 360, "diamonds": 6})

    def test_concurrent_claim_and_bonus_ledger_failure_are_atomic(self):
        self.store.accept_quest("math", at())
        self.add(record(1, at(), at(hour=9)))
        request = str(uuid.uuid4())
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_bonus BEFORE INSERT ON wallet_ledger
                WHEN NEW.reference LIKE 'quest-bonus:%' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END""")
        with self.assertRaises(sqlite3.IntegrityError):
            self.submit(request=request)
        for table in ("quest_allocations", "quest_deliveries", "quest_bonus_receipts", "wallet_ledger"):
            self.assertEqual(self.store.db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0, table)
        self.assertEqual(self.quest()["settledMinutes"], 0)
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_bonus")
        other = server.FocusStore(self.data, self.source)
        self.addCleanup(other.close)
        barrier = threading.Barrier(2)
        def submit(store):
            barrier.wait(timeout=3)
            return store.submit_quest("math", at(hour=20), request_id=request)
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(submit, (self.store, other)))
        self.assertEqual(sorted(result["receipt"]["alreadyClaimed"] for result in results), [False, True])
        self.assertEqual(self.store._wallet(), {"coins": 180, "diamonds": 3})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM quest_bonus_receipts").fetchone()[0], 1)

    def test_empty_historical_range_does_not_walk_every_calendar_day(self):
        for definition in server.QUEST_DEFINITIONS:
            self.store.accept_quest(definition["subject"], datetime(2025, 1, 1, tzinfo=TZ))
        with patch.object(self.store, "_bonus_window", wraps=self.store._bonus_window) as windows:
            state = self.store.quest_state(at(hour=20))
        self.assertEqual(windows.call_count, 4)
        self.assertTrue(all(q["bonus"]["pendingCount"] == 0 for q in state["quests"]))


if __name__ == "__main__":
    unittest.main()
