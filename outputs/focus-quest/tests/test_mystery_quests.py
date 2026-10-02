"""Double-rate post-achievement study has exclusive, durable time ownership."""
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
from http.client import HTTPConnection
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("mystery_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
TZ = timezone(timedelta(hours=8))
NAMES = {"math": "数学", "cs": "408", "politics": "政治", "english": "英语"}


def at(day=25, hour=8, minute=0, second=0):
    return datetime(2026, 9, day, hour, minute, second, tzinfo=TZ)


def ms(value):
    return int(value.timestamp() * 1000)


def rid():
    return str(uuid.uuid4())


class MysteryQuestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.source = Path(self.temp.name) / "source.json"
        self.store = server.FocusStore(self.data, self.source)
        self.start = at(hour=0)
        self.set_start(self.start)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def set_start(self, current):
        with self.store.db:
            self.store._set_meta(server.MYSTERY_START_META, ms(current))
            self.store.db.execute("DELETE FROM mystery_goal_epochs")
            self.store._save_mystery_epoch(self.store.settings, ms(current))

    def add(self, identity, start, end, subject="math", minutes=None, source="tomatodo"):
        value = (end-start).total_seconds() / 60 if minutes is None else minutes
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)",
                (identity, identity, NAMES.get(subject, subject), value, ms(start), ms(end), start.date().isoformat(), source))

    def qualifying(self, day=25, offset=0):
        """480 minutes at 16:00; each subject is strictly past half its goal."""
        for subject, hour, minutes in (("math", 8, 180), ("cs", 11, 180), ("politics", 14, 60), ("english", 15, 60)):
            start = at(day=day, hour=hour) + timedelta(minutes=offset)
            self.add(f"{day}-{subject}", start, start + timedelta(minutes=minutes), subject)

    def qualified_source_records(self):
        # Source-ingestion tests use actual aliases/presence instead of the
        # direct-record fixture; a healthy sync correctly archives orphan rows.
        records = []
        for subject, hour, minutes in (("math", 8, 180), ("cs", 11, 180),
                                       ("politics", 14, 60), ("english", 15, 60)):
            start = at(hour=hour)
            records.append({"id": f"qualified-{subject}", "name": NAMES[subject],
                            "isComplete": 1, "time": minutes, "startDate": ms(start),
                            "createDate": ms(start + timedelta(minutes=minutes))})
        return records

    def mystery(self, now=None):
        return self.store.quest_state(now or at(hour=23))["mystery"]

    def accept_all(self):
        for subject in NAMES:
            self.store.accept_quest(subject, self.start)

    def submit(self, now=None, request=None):
        return self.store.submit_mystery(request or rid(), now or at(hour=23))

    def test_threshold_is_at_least_eight_hours_and_every_subject_strictly_past_half(self):
        self.qualifying()
        self.assertTrue(self.mystery()["unlocked"])
        with self.store.db:
            self.store.db.execute("UPDATE records SET minutes=30 WHERE id='25-english'")
            self.store.db.execute("UPDATE records SET minutes=210,end_ms=end_ms+1800000 WHERE id='25-math'")
        state = self.mystery()
        self.assertEqual(state["minutes"], 480)
        self.assertFalse(state["unlocked"])
        self.assertEqual(state["status"], "locked")
        self.assertFalse(next(row for row in state["subjects"] if row["id"] == "english")["eligible"])
        with patch.object(server, "quest_clock", return_value=at(hour=17)):
            self.store.update_settings({"targets": {"math": 179}})
        self.assertFalse(self.mystery()["enabled"])

    def test_total_under_target_and_zero_subject_target_are_locked(self):
        self.qualifying()
        with self.store.db:
            self.store.db.execute("UPDATE records SET minutes=59 WHERE id='25-english'")
        self.assertEqual(self.mystery()["minutes"], 479)
        self.assertFalse(self.mystery()["unlocked"])
        with self.assertRaises(ValueError):
            self.store.update_settings({"targets": {"math": 240, "english": 0}})

    def test_strict_half_plateau_waits_for_the_next_positive_study_segment(self):
        self.add("math", at(hour=8), at(hour=11), "math")
        self.add("cs", at(hour=11), at(hour=14), "cs")
        self.add("politics", at(hour=14), at(hour=15), "politics")
        self.add("half", at(hour=15), at(hour=15, minute=30), "english")
        self.add("early-extra", at(hour=15, minute=30), at(hour=17), "math")
        self.add("last-needed", at(hour=18), at(hour=18, minute=1), "english")
        state = self.mystery()
        self.assertEqual(state["unlockedAt"], at(hour=18).isoformat(timespec="seconds"))
        self.assertEqual(state["pendingMinutes"], 1)
        self.assertEqual(state["pendingGifts"], [])

    def test_millisecond_before_box_threshold_does_not_advance_next_gift(self):
        self.qualifying()
        self.add("millisecond", at(hour=16), at(hour=16, minute=30) - timedelta(milliseconds=1))
        state = self.mystery()
        self.assertEqual(state["pendingGifts"], [])
        self.assertEqual(state["nextGift"]["index"], 1)

    def test_crossing_record_is_split_and_exclusive_from_ordinary_both_orders(self):
        self.accept_all()
        self.qualifying()
        with self.store.db:
            self.store.db.execute("DELETE FROM records WHERE id='25-english'")
        self.add("english-long", at(hour=15), at(hour=17), "english")
        state = self.store.quest_state(at(hour=17))
        self.assertEqual(state["mystery"]["pendingMinutes"], 60)
        english = next(row for row in state["quests"] if row["subject"] == "english")
        self.assertEqual(english["minutes"], 60)
        self.store.submit_quest("english", at(hour=17), rid())
        reward = self.submit(at(hour=17))["receipt"]
        self.assertEqual(reward["minutes"], 60)
        self.assertEqual(reward["baseReward"], {"coins": 240, "diamonds": 4})
        self.assertEqual(reward["giftReward"], {"coins": 60, "diamonds": 3})
        self.assertEqual(self.mystery()["pendingMinutes"], 0)
        self.assertEqual(next(row for row in self.store.quest_state(at(hour=17))["quests"] if row["subject"] == "english")["minutes"], 0)
        self.add("after", at(hour=17), at(hour=18), "math")
        self.submit(at(hour=18))
        normal = self.store.submit_quest("math", at(hour=18), rid())["receipt"]
        self.assertEqual(normal["minutes"], 180)

    def test_paused_record_preserves_density_on_unlock_slice(self):
        self.qualifying()
        with self.store.db:
            self.store.db.execute("DELETE FROM records WHERE id='25-english'")
        # The first 60 effective minutes complete the daily target at 17:00.
        self.add("paused", at(hour=15), at(hour=18), "english", 90)
        state = self.mystery(at(hour=18))
        self.assertEqual(state["pendingMinutes"], 30)
        self.assertEqual(state["unlockedAt"], at(hour=17).isoformat(timespec="seconds"))
        self.assertEqual(state["reward"], {"coins": 140, "diamonds": 3})

    def test_feature_start_and_history_import_do_not_mint_retroactive_rewards(self):
        self.qualifying()
        self.add("before-install", at(hour=16), at(hour=17))
        self.set_start(at(hour=16, minute=45))
        self.assertEqual(self.mystery()["pendingMinutes"], 15)
        self.add("history", at(hour=17), at(hour=18), source=server.HISTORY_SOURCE)
        self.assertEqual(self.mystery()["pendingMinutes"], 15)
        self.assertEqual(self.mystery()["pendingGifts"], [])

    def test_unfinished_future_record_is_not_eligible(self):
        self.qualifying()
        self.add("future", at(hour=16), at(hour=18))
        self.assertEqual(self.mystery(at(hour=17))["pendingMinutes"], 0)
        self.assertEqual(self.mystery(at(hour=18))["pendingMinutes"], 120)

    def test_vocabulary_other_activity_still_earns_english_afterglow_and_star_gift(self):
        with patch.object(server, "quest_clock", return_value=self.start):
            self.store.update_settings({"mapping": {"背单词": "english"},
                                        "activityMapping": {"背单词": "other"}})
        self.qualifying()
        self.add("vocabulary", at(hour=16), at(hour=16, minute=30), "背单词")
        self.assertEqual(server.classify_activity("背单词", self.store.settings["activityMapping"]), "other")
        state = self.mystery(at(hour=17))
        english = next(row for row in state["subjects"] if row["id"] == "english")
        self.assertEqual(english["minutes"], 90)
        self.assertEqual(english["pendingMinutes"], 30)
        self.assertEqual(state["todayMinutes"], 30)
        self.assertEqual(state["baseReward"], {"coins": 120, "diamonds": 2})
        self.assertEqual([(gift["index"], gift["lotteryTickets"]) for gift in state["pendingGifts"]],
                         [(1, {"coinTickets": 1, "diamondTickets": 0})])
        receipt = self.submit(at(hour=17))["receipt"]
        self.assertEqual(receipt["minutes"], 30)
        self.assertEqual(receipt["coins"], 140)
        self.assertEqual(receipt["diamonds"], 3)
        self.assertEqual(self.mystery(at(hour=17))["todayMinutes"], 30)
        self.assertEqual(self.mystery(at(hour=17))["pendingMinutes"], 0)

    def test_unfinished_vocabulary_source_record_and_future_end_do_not_earn_afterglow(self):
        base = self.qualified_source_records()
        self.source.write_text(json.dumps({"PCRecord": base, "PCToDo": []}), encoding="utf-8")
        self.assertEqual(self.store.import_source(), 4)
        record = {"id": "vocabulary", "name": "背单词", "isComplete": 0, "time": 60,
                  "startDate": ms(at(hour=16)), "createDate": ms(at(hour=17))}
        self.source.write_text(json.dumps({"PCRecord": base + [record], "PCToDo": []}), encoding="utf-8")
        self.assertEqual(self.store.import_source(), 0)
        self.assertEqual(self.mystery(at(hour=18))["todayMinutes"], 0)
        self.assertEqual(self.mystery(at(hour=18))["pendingGifts"], [])
        record["isComplete"] = 1
        self.source.write_text(json.dumps({"PCRecord": base + [record], "PCToDo": []}), encoding="utf-8")
        self.assertEqual(self.store.import_source(), 1)
        self.assertEqual(self.mystery(at(hour=16, minute=30))["todayMinutes"], 0)
        state = self.mystery(at(hour=17))
        self.assertEqual(state["todayMinutes"], 60)
        self.assertEqual(next(row for row in state["subjects"] if row["id"] == "english")["pendingMinutes"], 60)
        self.assertEqual([gift["index"] for gift in state["pendingGifts"]], [1, 2])

    def test_phone_vocabulary_calendar_sync_counts_once_after_end_and_cannot_repay(self):
        self.source.write_text(json.dumps({"PCRecord": self.qualified_source_records(), "PCToDo": []}), encoding="utf-8")
        self.assertEqual(self.store.import_source(), 4)
        self.store.calendar_config.write_text(json.dumps({"schemaVersion": 1, "enabled": True,
            "calendarID": "phone-study", "allowedTitles": ["背单词"], "lookbackDays": 90}), encoding="utf-8")
        event = {"calendarID": "phone-study", "calendarItemIdentifier": "vocabulary-local-id",
                 "externalIdentifier": "vocabulary-icloud-id", "title": "背单词", "isAllDay": False,
                 "start": at(hour=16).isoformat(), "end": at(hour=16, minute=30).isoformat()}

        def snapshot(now, finished):
            self.store.calendar_snapshot.write_text(json.dumps({"schemaVersion": 1,
                "kind": "focus_calendar_snapshot", "status": "ok", "generatedAt": now.isoformat(),
                "calendar": {"calendarID": "phone-study", "title": "工作"},
                "requestedStart": self.start.isoformat(), "requestedEnd": now.isoformat(),
                "events": [event] if finished else [], "pendingEvents": [] if finished else [event]}), encoding="utf-8")

        snapshot(at(hour=16, minute=15), False)
        self.assertEqual(self.store.import_calendar(now=at(hour=16, minute=15)), 0)
        self.assertEqual(self.store.calendar_sync["pendingCount"], 1)
        self.assertEqual(self.mystery(at(hour=16, minute=15))["todayMinutes"], 0)
        snapshot(at(hour=17), True)
        self.assertEqual(self.store.import_calendar(now=at(hour=17)), 1)
        state = self.mystery(at(hour=17))
        self.assertEqual(state["todayMinutes"], 30)
        self.assertEqual(next(row for row in state["subjects"] if row["id"] == "english")["pendingMinutes"], 30)
        self.assertEqual([gift["index"] for gift in state["pendingGifts"]], [1])
        request = rid()
        first = self.submit(at(hour=17), request=request)
        wallet = dict(first["wallet"])
        for minute in (1, 2, 3):
            snapshot(at(hour=17, minute=minute), True)
            self.assertEqual(self.store.import_calendar(now=at(hour=17, minute=minute)), 0)
            self.assertEqual(self.mystery(at(hour=17, minute=minute))["pendingMinutes"], 0)
            self.assertEqual(self.mystery(at(hour=17, minute=minute))["todayMinutes"], 30)
            self.assertEqual(self.store._wallet(), wallet)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM records WHERE name='背单词'").fetchone()[0], 1)
        replay = self.submit(at(hour=17, minute=3), request=request)
        self.assertTrue(replay["receipt"]["alreadyClaimed"])
        self.assertEqual(replay["wallet"], wallet)
        with self.assertRaises(ValueError):
            self.submit(at(hour=17, minute=3))
        self.assertEqual(self.store.db.execute("SELECT SUM(minutes) FROM mystery_allocations").fetchone()[0], 30)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM mystery_gifts").fetchone()[0], 1)

    def test_boxes_2999_boundary_and_independence_from_delivery_batching(self):
        self.qualifying()
        self.add("partial", at(hour=16), at(hour=16, minute=29, second=59))
        self.assertEqual(self.mystery()["pendingGifts"], [])
        self.add("second", at(hour=16, minute=29, second=59), at(hour=16, minute=30))
        self.assertEqual([g["index"] for g in self.mystery()["pendingGifts"]], [1])
        first = self.submit()["receipt"]
        self.add("second-half", at(hour=16, minute=30), at(hour=17))
        second = self.submit()["receipt"]
        self.add("third-half", at(hour=17), at(hour=17, minute=30))
        third = self.submit()["receipt"]
        self.assertEqual([r["gifts"][0]["index"] for r in (first, second, third)], [1, 2, 3])
        self.assertEqual(sum(r["coins"] for r in (first, second, third)), 480)
        self.assertEqual(sum(r["diamonds"] for r in (first, second, third)), 12)
        self.assertEqual(self.mystery()["nextGift"], {"index": 4, "progressMinutes": 0, "target": 30, "coins": 80, "diamonds": 4,
                                                    "lotteryTickets": {"coinTickets": 2, "diamondTickets": 2}})

    def test_six_gift_cap_at_exact_three_hours_does_not_cap_study_or_base_rewards(self):
        self.qualifying()
        self.add("before-six", at(hour=16), at(hour=19)-timedelta(milliseconds=1))
        state = self.mystery()
        self.assertEqual([g["index"] for g in state["pendingGifts"]], [1, 2, 3, 4, 5])
        self.assertEqual(state["todayGiftCount"], 5)
        self.assertFalse(state["todayGiftLimitReached"])
        self.assertEqual(state["nextGift"]["index"], 6)
        self.add("boundary", at(hour=19)-timedelta(milliseconds=1), at(hour=19))
        state = self.mystery()
        self.assertEqual([g["index"] for g in state["pendingGifts"]], [1, 2, 3, 4, 5, 6])
        self.assertEqual(state["giftLimit"], 6)
        self.assertEqual(state["todayGiftCount"], 6)
        self.assertTrue(state["todayGiftLimitReached"])
        self.assertIsNone(state["nextGift"])
        self.add("beyond-six", at(hour=19), at(hour=20))
        state = self.mystery()
        self.assertEqual(state["todayMinutes"], 240)
        self.assertEqual(state["baseReward"], {"coins": 960, "diamonds": 16})
        self.assertEqual(state["giftReward"], {"coins": 420, "diamonds": 21})
        receipt = self.submit()["receipt"]
        self.assertEqual(receipt["minutes"], 240)
        self.assertEqual([g["index"] for g in receipt["gifts"]], [1, 2, 3, 4, 5, 6])
        self.assertEqual(receipt["gifts"][-1]["lotteryTickets"], {"coinTickets": 2, "diamondTickets": 2})
        self.assertAlmostEqual(self.store.db.execute("SELECT SUM(minutes) FROM mystery_allocations").fetchone()[0], 240)
        self.assertEqual(self.mystery()["minutes"], 720)
        self.assertEqual(self.mystery()["status"], "active")
        self.add("still-studying", at(hour=20), at(hour=20, minute=30))
        after = self.submit()["receipt"]
        self.assertEqual(after["baseReward"], {"coins": 120, "diamonds": 2})
        self.assertEqual(after["gifts"], [])
        self.assertEqual(after["giftReward"], {"coins": 0, "diamonds": 0})
        self.assertIsNone(self.mystery()["nextGift"])

    def test_six_gift_allowance_is_per_study_day_and_resets_without_losing_old_pending(self):
        self.qualifying()
        self.add("yesterday-extra", at(hour=16), at(hour=20))
        self.qualifying(day=26)
        self.add("today-extra", at(day=26, hour=16), at(day=26, hour=16, minute=30), "english")
        state = self.mystery(at(day=26, hour=18))
        self.assertEqual(state["todayGiftCount"], 1)
        self.assertFalse(state["todayGiftLimitReached"])
        self.assertEqual(state["nextGift"]["index"], 2)
        self.assertEqual([(row["day"], row["giftCount"], row["giftLimitReached"]) for row in state["days"]],
                         [("2026-09-25", 6, True), ("2026-09-26", 1, False)])
        receipt = self.submit(at(day=26, hour=18))["receipt"]
        self.assertEqual(len(receipt["gifts"]), 7)
        self.assertEqual(sum(g["day"] == "2026-09-25" for g in receipt["gifts"]), 6)
        self.assertEqual(receipt["minutes"], 270)
        self.assertEqual(receipt["baseReward"], {"coins": 1080, "diamonds": 18})

    def test_legacy_seventh_gift_currency_and_receipt_survive_without_new_gifts_or_ticket_reward(self):
        self.qualifying()
        self.add("old-seven", at(hour=16), at(hour=19, minute=30))
        request = rid()
        receipt = self.submit(request=request)["receipt"]
        # Reconstruct a real previous-version settlement, including its
        # already-paid seventh currency gift. An upgrade must not erase it.
        legacy = json.loads(json.dumps(receipt))
        legacy["gifts"].append({"day": "2026-09-25", "index": 7, "coins": 140, "diamonds": 7})
        legacy["giftReward"]["coins"] += 140
        legacy["giftReward"]["diamonds"] += 7
        legacy["coins"] += 140
        legacy["diamonds"] += 7
        with self.store.db:
            self.store.db.execute("INSERT INTO mystery_gifts VALUES (?,?,?,?,?)", ("2026-09-25", 7, request, 140, 7))
            self.store.db.execute("UPDATE mystery_deliveries SET receipt=? WHERE request_id=?", (json.dumps(legacy), request))
            self.store.db.execute("UPDATE wallet_ledger SET coins=coins+140,diamonds=diamonds+7 WHERE reference=?",
                                  (f"quest-mystery:{request}",))
        old_gifts = [tuple(row) for row in self.store.db.execute("SELECT * FROM mystery_gifts")]
        old_wallet = self.store._wallet()
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)
        state = self.mystery()
        self.assertEqual(state["todayGiftCount"], 6)
        self.assertTrue(state["todayGiftLimitReached"])
        self.assertIsNone(state["nextGift"])
        self.assertEqual(state["pendingGifts"], [])
        self.assertEqual(state["giftReward"], {"coins": 0, "diamonds": 0})
        replay = self.submit(request=request)
        self.assertEqual(replay["receipt"], dict(legacy, alreadyClaimed=True))
        self.assertEqual(self.store._wallet(), old_wallet)
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM mystery_gifts")], old_gifts)
        with self.assertRaises(ValueError):
            self.store.open_lottery_star_gift("2026-09-25", 7, rid(), at(hour=23))

    def test_multi_subject_box_aggregation_and_diamond_carry_across_days(self):
        self.qualifying()
        for index, subject in enumerate(NAMES):
            start = at(hour=16) + timedelta(minutes=15 * index)
            self.add(f"extra-{subject}", start, start + timedelta(minutes=15), subject)
        first = self.submit()["receipt"]
        self.assertEqual(first["baseReward"], {"coins": 240, "diamonds": 4})
        self.assertEqual(len(first["gifts"]), 2)
        self.qualifying(day=26)
        self.add("nextday", at(day=26, hour=16), at(day=26, hour=16, minute=15), "english")
        second = self.submit(at(day=26, hour=17))["receipt"]
        self.assertEqual(second["baseReward"], {"coins": 60, "diamonds": 1})
        self.assertEqual(second["gifts"], [])
        self.assertEqual(self.mystery(at(day=26, hour=17))["nextGift"]["index"], 1)

    def test_each_subject_pays_one_diamond_at_15_minutes_and_two_at_30(self):
        self.qualifying()
        for index, subject in enumerate(NAMES):
            start = at(hour=16) + timedelta(minutes=30 * index)
            self.add(f"edge-{subject}", start, start + timedelta(minutes=14, seconds=59), subject)
        rows = {row["id"]: row for row in self.mystery()["subjects"]}
        for subject in NAMES:
            with self.subTest(subject=subject, boundary="14:59"):
                self.assertEqual(rows[subject]["blockMinutes"], 15)
                self.assertEqual(rows[subject]["reward"]["diamonds"], 0)
                self.assertAlmostEqual(rows[subject]["carryMinutes"], 14 + 59 / 60, places=4)
        for index, subject in enumerate(NAMES):
            start = at(hour=16) + timedelta(minutes=30 * index)
            self.add(f"last-second-{subject}", start + timedelta(minutes=14, seconds=59),
                     start + timedelta(minutes=15), subject)
        rows = {row["id"]: row for row in self.mystery()["subjects"]}
        for subject in NAMES:
            with self.subTest(subject=subject, boundary="15:00"):
                self.assertEqual(rows[subject]["reward"]["diamonds"], 1)
                self.assertEqual(rows[subject]["carryMinutes"], 0)
        for index, subject in enumerate(NAMES):
            start = at(hour=16) + timedelta(minutes=30 * index + 15)
            self.add(f"next-quarter-{subject}", start, start + timedelta(minutes=15), subject)
        rows = {row["id"]: row for row in self.mystery()["subjects"]}
        for subject in NAMES:
            with self.subTest(subject=subject, boundary="30:00"):
                self.assertEqual(rows[subject]["reward"], {"coins": 120, "diamonds": 2})
                self.assertEqual(rows[subject]["carryMinutes"], 0)

    def test_all_subjects_keep_fractional_diamond_carry_across_deliveries_days_and_restart(self):
        self.qualifying()
        for index, subject in enumerate(NAMES):
            start = at(hour=16) + timedelta(minutes=15 * index)
            self.add(f"seven-{subject}", start, start + timedelta(minutes=7), subject)
        first = self.submit()["receipt"]
        self.assertEqual(first["baseReward"], {"coins": 112, "diamonds": 0})
        self.assertEqual(first["gifts"], [])
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)
        self.qualifying(day=26)
        for index, subject in enumerate(NAMES):
            start = at(day=26, hour=16) + timedelta(minutes=15 * index)
            self.add(f"eight-{subject}", start, start + timedelta(minutes=8), subject)
        second = self.submit(at(day=26, hour=18))["receipt"]
        self.assertEqual(second["baseReward"], {"coins": 128, "diamonds": 4})
        self.assertEqual([row["reward"]["diamonds"] for row in second["subjects"]], [1, 1, 1, 1])
        self.assertEqual([gift["index"] for gift in second["gifts"]], [1])
        self.assertEqual(self.mystery(at(day=26, hour=18))["baseReward"], {"coins": 0, "diamonds": 0})
        with self.assertRaises(ValueError):
            self.submit(at(day=26, hour=18))

    def test_legacy_paid_diamonds_and_remainders_migrate_without_debt_or_double_claim(self):
        self.qualifying()
        for index, subject in enumerate(NAMES):
            start = at(hour=16) + timedelta(minutes=45 * index)
            minutes = 30 if subject in ("math", "cs") else 45
            self.add(f"legacy-{subject}", start, start + timedelta(minutes=minutes), subject)
        original_request = rid()
        original = self.submit(request=original_request)["receipt"]
        # Recreate exactly the old 4-diamonds-per-60/30-minute settlement.
        # Coins, allocations and already-issued gift boxes stay untouched.
        old_receipt = json.loads(json.dumps(original))
        old_base = 0
        with self.store.db:
            for row in old_receipt["subjects"]:
                old_block = 60 if row["id"] in ("math", "cs") else 30
                old_paid = int(row["minutes"] // old_block) * 4
                old_base += old_paid
                row["reward"]["diamonds"] = old_paid
                self.store.db.execute("UPDATE mystery_tracks SET paid_diamonds=?,diamond_offset=0 WHERE subject=?",
                                      (old_paid, row["id"]))
            difference = old_base - old_receipt["baseReward"]["diamonds"]
            old_receipt["baseReward"]["diamonds"] = old_base
            old_receipt["diamonds"] += difference
            self.store.db.execute("UPDATE mystery_deliveries SET receipt=? WHERE request_id=?",
                                  (json.dumps(old_receipt, ensure_ascii=False), original_request))
            self.store.db.execute("UPDATE wallet_ledger SET diamonds=diamonds+? WHERE reference=?",
                                  (difference, f"quest-mystery:{original_request}"))
            self.store.db.execute("DELETE FROM meta WHERE key='questMystery:diamondCadence15m:v1'")
        before_wallet = self.store._wallet()
        before_allocations = [tuple(row) for row in self.store.db.execute("SELECT * FROM mystery_allocations")]
        before_gifts = [tuple(row) for row in self.store.db.execute("SELECT * FROM mystery_gifts")]
        # A real pre-upgrade archive has only the original four columns.
        with self.store.db:
            self.store.db.execute("ALTER TABLE mystery_tracks RENAME TO mystery_tracks_old")
            self.store.db.execute("""CREATE TABLE mystery_tracks (
                subject TEXT PRIMARY KEY, settled_minutes REAL NOT NULL DEFAULT 0,
                paid_coins INTEGER NOT NULL DEFAULT 0, paid_diamonds INTEGER NOT NULL DEFAULT 0)""")
            self.store.db.execute("""INSERT INTO mystery_tracks SELECT
                subject,settled_minutes,paid_coins,paid_diamonds FROM mystery_tracks_old""")
            self.store.db.execute("DROP TABLE mystery_tracks_old")
        self.store._migrate_mystery_diamond_cadence()
        self.assertEqual(self.store._wallet(), before_wallet)
        offsets = {row["subject"]: row["diamond_offset"] for row in self.store.db.execute("SELECT * FROM mystery_tracks")}
        self.assertEqual(offsets, {"math": 0, "cs": 0, "politics": -2, "english": -2})
        state = self.mystery()
        self.assertEqual(state["pendingMinutes"], 0)
        self.assertEqual(state["giftReward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(state["baseReward"], {"coins": 0, "diamonds": 6})
        by_subject = {row["id"]: row["reward"]["diamonds"] for row in state["subjects"]}
        self.assertEqual(by_subject, {"math": 2, "cs": 2, "politics": 1, "english": 1})
        old_retry = self.submit(request=original_request)
        self.assertTrue(old_retry["receipt"]["alreadyClaimed"])
        self.assertEqual(old_retry["receipt"]["baseReward"], old_receipt["baseReward"])
        self.assertEqual(old_retry["wallet"], before_wallet)
        claim_request = rid()
        claimed = self.submit(request=claim_request)
        self.assertEqual(claimed["receipt"]["minutes"], 0)
        self.assertEqual(claimed["receipt"]["baseReward"], {"coins": 0, "diamonds": 6})
        self.assertEqual({row["id"]: row["reward"]["diamonds"] for row in claimed["receipt"]["subjects"]}, by_subject)
        self.assertEqual(claimed["receipt"]["gifts"], [])
        self.assertEqual(claimed["wallet"], {"coins": before_wallet["coins"], "diamonds": before_wallet["diamonds"] + 6})
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM mystery_allocations")], before_allocations)
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM mystery_gifts")], before_gifts)
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)
        repeated = self.submit(request=claim_request)
        self.assertTrue(repeated["receipt"]["alreadyClaimed"])
        self.assertEqual(repeated["wallet"], claimed["wallet"])
        self.assertEqual(self.mystery()["baseReward"], {"coins": 0, "diamonds": 0})
        self.assertEqual({row["subject"]: row["diamond_offset"] for row in self.store.db.execute("SELECT * FROM mystery_tracks")}, offsets)
        with self.assertRaises(ValueError):
            self.submit()
        # The fixed migration offset cannot consume newly-earned quarters.
        self.add("new-politics-quarter", at(hour=20), at(hour=20, minute=15), "politics")
        self.add("new-english-quarter", at(hour=20, minute=15), at(hour=20, minute=30), "english")
        new_study = self.submit()["receipt"]
        self.assertEqual(new_study["baseReward"], {"coins": 120, "diamonds": 2})

    def test_midnight_splits_eligibility_and_late_sync_keeps_old_pending(self):
        self.qualifying()
        self.add("midnight", at(hour=23, minute=30), at(day=26, hour=0, minute=30))
        state = self.mystery(at(day=26, hour=1))
        self.assertFalse(state["unlocked"])
        self.assertEqual(state["pendingMinutes"], 30)
        self.assertEqual(state["todayMinutes"], 0)
        self.assertEqual(state["pendingGifts"][0]["day"], "2026-09-25")
        receipt = self.submit(at(day=26, hour=1))["receipt"]
        self.assertEqual(receipt["minutes"], 30)
        self.assertEqual(self.mystery(at(day=26, hour=1))["todaySettledMinutes"], 30)
        # Late phone sync contributes to its original day and next gift there.
        self.add("late", at(hour=20), at(hour=20, minute=30), "english")
        delayed = self.submit(at(day=26, hour=2))["receipt"]
        self.assertEqual(delayed["gifts"][0]["index"], 2)
        self.assertEqual(delayed["gifts"][0]["day"], "2026-09-25")

    def test_target_epochs_only_apply_forward_and_previous_pending_survives(self):
        self.qualifying()
        self.add("long", at(hour=16), at(hour=18))
        with patch.object(server, "quest_clock", return_value=at(hour=16, minute=30)):
            self.store.update_settings({"targets": {"math": 179}})
        with patch.object(server, "quest_clock", return_value=at(hour=17, minute=30)):
            self.store.update_settings({"targets": {"math": 180}})
        state = self.mystery(at(hour=18))
        self.assertEqual(state["pendingMinutes"], 60)
        self.assertEqual(len(state["pendingGifts"]), 2)
        with patch.object(server, "quest_clock", return_value=at(hour=18, minute=30)):
            self.store.update_settings({"targets": {"math": 179}})
        state = self.mystery(at(hour=19))
        self.assertFalse(state["enabled"])
        self.assertEqual(state["status"], "ready")
        self.assertEqual(self.submit(at(hour=19))["receipt"]["minutes"], 60)

    def test_uuid_retry_restart_delete_restore_and_mapping_do_not_pay_twice(self):
        self.qualifying()
        self.add("extra", at(hour=16), at(hour=17))
        request = rid()
        first = self.submit(request=request)
        with patch.object(server, "quest_clock", return_value=at(hour=17, minute=30)):
            self.store.update_settings({"mapping": {"数学": "cs"}})
        self.store.move_record("extra")
        self.store.move_record("extra", restore=True)
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)
        repeated = self.submit(request=request)
        self.assertTrue(repeated["receipt"]["alreadyClaimed"])
        self.assertEqual(repeated["wallet"], first["wallet"])
        self.assertEqual(repeated["mystery"]["pendingMinutes"], 0)
        with self.assertRaises(ValueError):
            self.submit()
        for bad in (None, "abc", 1, "0" * 36):
            with self.assertRaises(ValueError):
                self.store.submit_mystery(bad, at(hour=23))

    def test_canonical_merge_masks_allocation_and_history_rewrite_is_blocked(self):
        self.qualifying()
        self.add("extra", at(hour=16), at(hour=17))
        self.submit()
        self.add("canonical", at(hour=16), at(hour=17))
        with self.store.db:
            self.store.db.execute("INSERT INTO record_merges VALUES (?,?,?,?)", ("extra", "canonical", "now", "[]"))
            self.store.db.execute("DELETE FROM records WHERE id='extra'")
        self.assertEqual(self.mystery()["pendingMinutes"], 0)
        self.assertTrue(self.store._history_has_allocations({"canonical"}))
        self.add("another", at(hour=16), at(hour=17))
        with self.assertRaises(ValueError):
            self.store._merge_history_records(["canonical", "another"])

    def test_ordinary_preexisting_allocations_have_priority(self):
        self.qualifying()
        self.add("extra", at(hour=16), at(hour=17))
        with self.store.db:
            self.store.db.execute("INSERT INTO quest_allocations VALUES (?,?,?,?,?,?)",
                ("2026-09-25", "math", "extra", ms(at(hour=16)), ms(at(hour=16, minute=20)), 20))
        self.assertEqual(self.mystery()["pendingMinutes"], 40)
        self.assertEqual(self.submit()["receipt"]["minutes"], 40)

    def test_concurrent_connections_pay_once_and_transaction_failure_rolls_back(self):
        self.qualifying()
        self.add("extra", at(hour=16), at(hour=17))
        other = server.FocusStore(self.data, self.source)
        barrier = threading.Barrier(2)
        request = rid()
        def run(store):
            barrier.wait()
            return store.submit_mystery(request, at(hour=23))
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                answers = list(pool.map(run, (self.store, other)))
            self.assertEqual(sorted(answer["receipt"]["alreadyClaimed"] for answer in answers), [False, True])
            self.assertEqual(answers[0]["wallet"], answers[1]["wallet"])
            self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM mystery_deliveries").fetchone()[0], 1)
        finally:
            other.close()
        self.add("extra2", at(hour=17), at(hour=18))
        before = self.store._wallet()
        with self.store.db:
            self.store.db.execute("CREATE TRIGGER reject_mystery BEFORE INSERT ON wallet_ledger BEGIN SELECT RAISE(ABORT,'test'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.submit()
        self.assertEqual(self.store._wallet(), before)
        self.assertEqual(self.mystery()["pendingMinutes"], 60)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM mystery_deliveries").fetchone()[0], 1)

    def test_actual_calendar_desktop_merge_clock_drift_cannot_create_new_currency(self):
        self.accept_all()
        self.qualifying()
        with self.store.db:
            self.store._upsert_records([("calendar-first", "event", "数学", 60, ms(at(hour=16)), ms(at(hour=17)), "2026-09-25", "calendar")])
        first = self.submit()
        desktop_start = at(hour=16) + timedelta(seconds=4)
        desktop_end = at(hour=17) + timedelta(seconds=4)
        with self.store.db:
            self.store._upsert_records([("desktop-second", "desktop", "数学", 60, ms(desktop_start), ms(desktop_end), "2026-09-25", "tomatodo")])
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM record_merges").fetchone()[0], 1)
        state = self.store.quest_state(at(hour=23))
        self.assertEqual(state["mystery"]["pendingMinutes"], 0)
        self.assertEqual(next(row for row in state["quests"] if row["subject"] == "math")["minutes"], 180)
        self.assertEqual(state["wallet"], first["wallet"])

    def test_one_batch_equals_three_deliveries_for_all_rewards(self):
        self.qualifying()
        self.add("ninety", at(hour=16), at(hour=17, minute=30))
        receipt = self.submit()["receipt"]
        self.assertEqual((receipt["coins"], receipt["diamonds"]), (480, 12))
        self.assertEqual([gift["index"] for gift in receipt["gifts"]], [1, 2, 3])
        self.assertEqual(receipt["baseReward"], {"coins": 360, "diamonds": 6})
        self.assertEqual(receipt["giftReward"], {"coins": 120, "diamonds": 6})

    def test_ordinary_and_mystery_simultaneous_delivery_share_no_minutes(self):
        self.accept_all()
        self.qualifying()
        self.add("extra", at(hour=16), at(hour=17))
        other = server.FocusStore(self.data, self.source)
        barrier = threading.Barrier(2)
        def ordinary():
            barrier.wait()
            return self.store.submit_quest("math", at(hour=23), rid())["receipt"]
        def mystery():
            barrier.wait()
            return other.submit_mystery(rid(), at(hour=23))["receipt"]
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                normal_future = pool.submit(ordinary)
                special_future = pool.submit(mystery)
                normal, special = normal_future.result(), special_future.result()
            self.assertEqual(normal["minutes"], 180)
            self.assertEqual(special["minutes"], 60)
            self.assertEqual(self.mystery()["pendingMinutes"], 0)
        finally:
            other.close()

    def test_http_only_accepts_uuid_and_retries_exact_original_receipt(self):
        self.qualifying()
        self.add("extra", at(hour=16), at(hour=17))
        http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        def post(body, suffix=""):
            conn = HTTPConnection("127.0.0.1", http.server_address[1], timeout=3)
            conn.request("POST", "/api/quests/mystery/submit" + suffix, json.dumps(body), {"Content-Type": "application/json"})
            response = conn.getresponse()
            result = response.status, json.loads(response.read())
            conn.close()
            return result
        try:
            request = rid()
            for body in ({}, {"requestId": None}, {"requestId": "bad"},
                         {"requestId": request, "subject": "math"}, {"requestId": request, "coins": 1000},
                         {"requestId": request, "now": at().isoformat()}):
                self.assertEqual(post(body)[0], 400)
            self.assertEqual(post({"requestId": request}, "?day=2026-09-25")[0], 400)
            with patch.object(server, "quest_clock", return_value=at(hour=23)):
                status, first = post({"requestId": request})
                self.assertEqual(status, 200)
                self.assertEqual(first["receipt"]["type"], "mystery")
                status, second = post({"requestId": request})
                self.assertEqual(status, 200)
                self.assertTrue(second["receipt"]["alreadyClaimed"])
                self.assertEqual(second["wallet"], first["wallet"])
        finally:
            http.shutdown()
            http.server_close()
            thread.join()

    def test_mystery_slices_do_not_count_for_normal_timed_bonus(self):
        self.accept_all()
        # Synthetic overlap puts achievement early enough to inspect a morning bonus.
        for subject in NAMES:
            self.add(f"seed-{subject}", at(hour=0), at(hour=2), subject)
        self.add("morning-extra", at(hour=2), at(hour=3))
        self.submit(at(hour=3))
        with self.store.db:
            self.store._set_meta(server.TIMED_BONUS_START_META, ms(at(hour=2)))
        state = self.store.quest_state(at(hour=3))
        math = next(row for row in state["quests"] if row["subject"] == "math")
        self.assertEqual(math["minutes"], 120)
        self.assertEqual(math["bonus"]["minutes"], 0)
        self.assertEqual(math["bonus"]["pendingCount"], 0)


if __name__ == "__main__":
    unittest.main()
