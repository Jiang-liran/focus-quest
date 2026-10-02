"""Daily study-method gifts observe canonical study and credit exactly once."""
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

spec = importlib.util.spec_from_file_location("method_rewards_server", Path(__file__).resolve().parents[1]/"server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 28, 18, tzinfo=timezone(timedelta(hours=8)))
DAY = NOW.date().isoformat()
NAMES = {sid: name for sid, name, _ in server.SUBJECTS}


class MethodRewardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data, self.source = Path(self.temp.name)/"data", Path(self.temp.name)/"source.json"
        self.store = self.make_store()

    def make_store(self):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW):
            return server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, subject="math", activity="practice", minutes=20, end=None, name=None):
        end = end or NOW
        identity = str(uuid.uuid4())
        title = name or NAMES.get(subject, subject)+{"lecture": "听课", "practice": "做题", "other": "整理笔记"}[activity]
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", (
                identity, identity, title, minutes, int((end-timedelta(minutes=minutes)).timestamp()*1000),
                int(end.timestamp()*1000), end.date().isoformat(), "tomatodo"))
        return identity

    def state(self, day=DAY, now=NOW):
        return self.store.method_rewards_state(day, now)

    def subject(self, subject="math", day=DAY, now=NOW):
        return next(row for row in self.state(day, now)["subjects"] if row["id"] == subject)

    def gift(self, subject="math", tier="practice", day=DAY, now=NOW):
        return next(row for row in self.subject(subject, day, now)["rewards"] if row["id"] == tier)

    def claim(self, subject="math", tier="practice", day=DAY, now=NOW):
        return self.store.claim_method_reward(day, subject, tier, now)

    def rows(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def snapshot(self):
        return {row[0]: self.rows(row[0]) for row in self.store.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

    def complete_all(self):
        for subject in NAMES:
            self.add(subject, "practice", 60)

    def test_practice_gift_is_per_subject_at_twenty_minutes(self):
        for subject in NAMES:
            self.add(subject, "practice", 19)
            self.assertFalse(self.gift(subject)["available"])
            with self.assertRaises(ValueError):
                self.claim(subject)
            self.add(subject, "practice", 1)
            self.assertTrue(self.gift(subject)["available"])
            result = self.claim(subject)
            self.assertEqual(result["reward"], {"coins": 20, "diamonds": 0})
            self.assertEqual((result["day"], result["subject"], result["tier"]), (DAY, subject, "practice"))
            self.assertEqual(result["now"], NOW.isoformat())
        self.assertEqual(self.store._wallet(), {"coins": 80, "diamonds": 0})

    def test_mastery_uses_twenty_lecture_plus_thirty_practice_or_sixty_practice(self):
        self.add("math", "lecture", 20)
        self.add("math", "practice", 29)
        self.assertFalse(self.gift("math", "mastery")["eligible"])
        self.add("math", "practice", 1)
        self.assertTrue(self.gift("math", "mastery")["available"])
        self.add("cs", "practice", 59)
        self.assertFalse(self.gift("cs", "mastery")["eligible"])
        self.add("cs", "practice", 1)
        self.assertTrue(self.gift("cs", "mastery")["available"])
        for subject in ("math", "cs"):
            self.assertEqual(self.claim(subject, "mastery")["reward"], {"coins": 40, "diamonds": 1})

    def test_mastery_is_independent_of_first_gift_and_needs_no_accepted_quest(self):
        self.add(minutes=60)
        second = self.claim(tier="mastery")
        self.assertEqual(second["methodRewards"]["availableCount"], 1)
        self.assertEqual(self.rows("quest_acceptances"), [])
        self.assertEqual(self.claim()["reward"], {"coins": 20, "diamonds": 0})
        self.assertEqual(self.store._wallet(), {"coins": 60, "diamonds": 1})

    def test_lecture_and_other_time_never_substitute_for_practice(self):
        self.add("math", "lecture", 300)
        self.add("math", "other", 300)
        self.add("other", "practice", 300)
        self.assertEqual(self.state()["availableCount"], 0)
        self.assertEqual(self.subject()["lecture"], 300)
        self.assertEqual(self.subject()["other"], 300)
        self.assertEqual(self.subject()["practice"], 0)

    def test_confirmed_four_revision_tasks_still_mean_lecture(self):
        for subject, name in NAMES.items():
            self.add(subject, "other", 20, name="复习"+name)
            self.add(subject, "practice", 30)
            self.assertEqual(self.subject(subject)["lecture"], 20)
            self.assertTrue(self.gift(subject, "mastery")["available"])
        self.assertEqual(self.state()["availableCount"], 9)

    def test_all_eight_gifts_stop_at_240_coins_4_diamonds_without_allocations(self):
        self.complete_all()
        before = self.snapshot()
        for subject in NAMES:
            for tier in ("mastery", "practice"):
                self.claim(subject, tier)
        self.assertEqual(self.store._wallet(), {"coins": 240, "diamonds": 4})
        state = self.state()
        self.assertEqual(state["subjectDailyCap"], {"coins": 240, "diamonds": 4})
        self.assertEqual(state["dailyCap"], {"coins": 440, "diamonds": 8})
        self.assertEqual(state["claimedTotals"], state["subjectDailyCap"])
        self.assertEqual(state["claimedCount"], 8)
        self.assertEqual(state["availableCount"], 1)
        after = self.snapshot()
        for table in before.keys()-{"wallet_ledger", "method_reward_claims", "meta", "method_round_ticket_receipts", "lottery_ticket_ledger"}:
            self.assertEqual(after[table], before[table], table)
        self.assertEqual(int(self.store._meta("revision")), 8)

    def test_unrounded_thresholds_reject_almost_20_30_and_60_minutes(self):
        first = self.add("math", "practice", 19.99999)
        self.add("cs", "lecture", 20)
        second = self.add("cs", "practice", 29.99999)
        third = self.add("politics", "practice", 59.99999)
        fourth = self.add("english", "lecture", 19.99999)
        self.add("english", "practice", 30)
        self.assertEqual(self.subject()["practice"], 20)
        for subject, tier in (("math", "practice"), ("cs", "mastery"), ("politics", "mastery"), ("english", "mastery")):
            with self.subTest(subject=subject):
                self.assertFalse(self.gift(subject, tier)["eligible"])
                with self.assertRaises(ValueError):
                    self.claim(subject, tier)
        with self.store.db:
            for identity, minutes in ((first, 20), (second, 30), (third, 60), (fourth, 20)):
                self.store.db.execute("UPDATE records SET minutes=? WHERE id=?", (minutes, identity))
        for subject, tier in (("math", "practice"), ("cs", "mastery"), ("politics", "mastery"), ("english", "mastery")):
            self.assertTrue(self.gift(subject, tier)["available"])

    def test_seconds_accumulate_without_per_record_rounding(self):
        self.add(minutes=19+59/60)
        self.assertFalse(self.gift()["available"])
        self.add(minutes=1/60)
        self.assertTrue(self.gift()["available"])
        self.add("math", "lecture", 19+59/60)
        self.add(minutes=10)
        self.assertFalse(self.gift(tier="mastery")["available"])
        self.add("math", "lecture", 1/60)
        self.assertTrue(self.gift(tier="mastery")["available"])

    def test_future_uncompleted_and_deleted_records_do_not_qualify(self):
        self.add(end=NOW+timedelta(seconds=1))
        deleted = self.add("cs")
        self.store.move_record(deleted)
        self.assertFalse(self.gift()["eligible"])
        self.assertFalse(self.gift("cs")["eligible"])
        self.assertEqual(self.store.state(DAY, NOW)["methodRewards"]["availableCount"], 0)
        self.assertTrue(self.gift(now=NOW+timedelta(seconds=1))["eligible"])
        self.store.move_record(deleted, restore=True)
        self.assertTrue(self.gift("cs")["eligible"])

    def test_deleted_then_restored_records_never_reclaim_or_claw_back(self):
        identity = self.add(minutes=60)
        self.claim(tier="mastery")
        self.store.move_record(identity)
        self.assertFalse(self.gift(tier="mastery")["eligible"])
        self.assertTrue(self.gift(tier="mastery")["claimed"])
        self.assertTrue(self.claim(tier="mastery")["alreadyClaimed"])
        self.assertEqual(self.store._wallet(), {"coins": 40, "diamonds": 1})
        self.store.move_record(identity, restore=True)
        self.assertFalse(self.gift(tier="mastery")["available"])
        self.claim()
        self.assertEqual(self.store._wallet(), {"coins": 60, "diamonds": 1})

    def test_mapping_and_activity_corrections_recompute_unclaimed_eligibility(self):
        self.add(minutes=60, name="无名练习块")
        self.assertEqual(self.state()["availableCount"], 0)
        self.store.update_settings({"mapping": {"无名练习块": "math"}, "activityMapping": {"无名练习块": "lecture"}})
        self.assertEqual(self.subject()["lecture"], 60)
        self.assertEqual(self.state()["availableCount"], 0)
        self.store.update_settings({"activityMapping": {"无名练习块": "practice"}})
        self.assertEqual(self.state()["availableCount"], 2)
        self.claim()
        self.store.update_settings({"activityMapping": {"无名练习块": "other"}})
        self.assertFalse(self.gift()["eligible"])
        self.assertTrue(self.claim()["alreadyClaimed"])
        self.assertEqual(self.store._wallet(), {"coins": 20, "diamonds": 0})

    def test_daily_goal_edits_cannot_change_fixed_method_thresholds(self):
        self.add(minutes=20)
        before = self.state()
        self.store.set_daily_goal({"math": 300, "cs": 180, "politics": 60, "english": 60}, DAY, str(uuid.uuid4()), NOW)
        self.assertEqual(self.state(), before)

    def test_duplicates_and_restart_award_once_and_return_zero_delta(self):
        self.add()
        first = self.claim()
        for _ in range(3):
            retry = self.claim()
            self.assertTrue(retry["alreadyClaimed"])
            self.assertEqual(retry["reward"], {"coins": 0, "diamonds": 0})
            self.assertEqual(retry["wallet"], first["wallet"])
        self.store.close()
        self.store = self.make_store()
        self.assertTrue(self.claim()["alreadyClaimed"])
        self.assertEqual(len(self.rows("method_reward_claims")), 1)
        self.assertEqual(len(self.rows("wallet_ledger")), 1)
        self.assertEqual(int(self.store._meta("revision")), 1)

    def test_history_future_and_midnight_cannot_claim_another_day(self):
        self.add(minutes=60)
        self.claim()
        tomorrow = NOW+timedelta(days=1)
        historic = self.state(DAY, tomorrow)
        self.assertFalse(historic["isToday"])
        self.assertEqual(historic["availableCount"], 0)
        self.assertTrue(self.gift(day=DAY, now=tomorrow)["claimed"])
        self.assertTrue(self.gift(tier="mastery", day=DAY, now=tomorrow)["eligible"])
        for tier in ("practice", "mastery"):
            with self.assertRaisesRegex(ValueError, "日期已变化"):
                self.claim(tier=tier, now=tomorrow)
        future_day = tomorrow.date().isoformat()
        self.add(minutes=60, end=tomorrow)
        self.assertEqual(self.state(future_day, NOW)["availableCount"], 0)
        self.assertFalse(self.gift(day=future_day)["eligible"])
        with self.assertRaisesRegex(ValueError, "日期已变化"):
            self.claim(day=future_day)
        self.assertFalse(self.claim(day=future_day, now=tomorrow)["alreadyClaimed"])

    def test_local_day_changes_are_checked_inside_transaction(self):
        self.add()
        last = NOW.replace(hour=23, minute=59, second=59)
        self.claim(now=last)
        after = last+timedelta(seconds=1)
        self.assertEqual(last.astimezone(timezone.utc).date(), after.astimezone(timezone.utc).date())
        def clock(value=None):
            self.assertTrue(self.store.db.in_transaction)
            return value or after
        with patch.object(server, "quest_clock", side_effect=clock), self.assertRaisesRegex(ValueError, "日期已变化"):
            self.store.claim_method_reward(DAY, "math", "practice")
        self.assertEqual(len(self.rows("method_reward_claims")), 1)

    def test_state_polling_never_writes_reward_or_allocation_rows(self):
        self.complete_all()
        self.store.state(DAY, NOW)
        before, changes = self.snapshot(), self.store.db.total_changes
        for _ in range(12):
            self.assertEqual(self.store.state(DAY, NOW)["methodRewards"]["availableCount"], 9)
            self.assertEqual(self.state()["availableCount"], 9)
        self.assertEqual(self.store.db.total_changes, changes)
        self.assertEqual(self.snapshot(), before)

    def test_invalid_subject_tier_day_and_client_fields_never_write(self):
        self.complete_all()
        before = self.snapshot()
        for value in (None, [], {}, True, "", "Math", "main", "other"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.claim(subject=value)
        for value in (None, [], {}, True, "", "lecture", "second", "mastery:fake"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.claim(tier=value)
        for value in (None, [], {}, True, "", "20260928", "2026-9-28", "2026-09-27", "2026-09-29"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.claim(day=value)
        self.assertEqual(self.snapshot(), before)

    def test_failed_ledger_credit_rolls_back_receipt_and_revision(self):
        self.add()
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_method BEFORE INSERT ON wallet_ledger
                WHEN NEW.reference LIKE 'method-gift:%' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.claim()
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(self.gift()["available"])
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_method")
        self.assertFalse(self.claim()["alreadyClaimed"])

    def test_concurrent_connections_credit_exactly_once(self):
        self.add(minutes=60)
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def claim(store):
            barrier.wait()
            return store.claim_method_reward(DAY, "math", "mastery", NOW)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, (self.store, second)))
        self.assertEqual(sorted(result["alreadyClaimed"] for result in results), [False, True])
        self.assertEqual(sum(result["reward"]["coins"] for result in results), 40)
        self.assertEqual(self.store._wallet(), {"coins": 40, "diamonds": 1})
        self.assertEqual(len(self.rows("method_reward_claims")), 1)

    def test_desktop_and_calendar_echo_count_one_completed_practice(self):
        start = NOW-timedelta(minutes=10)
        desktop = {"id": 1, "isComplete": 1, "name": "数学做题", "time": 10,
                   "startDate": int(start.timestamp()*1000), "createDate": int(NOW.timestamp()*1000)}
        self.source.write_text(json.dumps({"PCRecord": [desktop], "PCToDo": []}), encoding="utf-8")
        self.store.import_source()
        self.store.calendar_config.write_text(json.dumps({"schemaVersion": 1, "enabled": True,
            "calendarID": "selected", "allowedTitles": ["数学做题"], "lookbackDays": 90}), encoding="utf-8")
        self.store.calendar_snapshot.write_text(json.dumps({"schemaVersion": 1, "kind": "focus_calendar_snapshot", "status": "ok",
            "generatedAt": NOW.isoformat(), "calendar": {"calendarID": "selected", "title": "专注", "sourceTitle": "iCloud"},
            "requestedStart": (NOW-timedelta(days=90)).isoformat(), "requestedEnd": NOW.isoformat(),
            "events": [{"calendarID": "selected", "calendarItemIdentifier": "local", "externalIdentifier": "external", "eventIdentifier": "event",
                        "title": "数学做题", "start": start.isoformat(), "end": NOW.isoformat(), "isAllDay": False}]}), encoding="utf-8")
        self.store.import_calendar(now=NOW)
        self.assertEqual(self.subject()["practice"], 10)
        self.assertFalse(self.gift()["eligible"])
        self.assertEqual(len(self.rows("records")), 1)
        self.assertEqual(len(self.rows("record_aliases")), 2)

    def test_existing_island_and_continuous_quest_progress_remain_unchanged(self):
        self.store.accept_quest("math", NOW-timedelta(hours=4))
        self.add(minutes=180)
        before_islands = self.store.island_rewards_state(DAY, NOW)
        before_quests = self.store.quest_state(NOW)
        before_allocations = {name: self.rows(name) for name in ("quest_tracks", "quest_allocations", "mystery_tracks", "mystery_allocations", "mystery_gifts")}
        self.claim()
        self.claim(tier="mastery")
        self.assertEqual(self.store.island_rewards_state(DAY, NOW), before_islands)
        after_quests = self.store.quest_state(NOW)
        for key in ("quests", "mystery"):
            self.assertEqual(after_quests.get(key), before_quests.get(key), key)
        for name, rows in before_allocations.items():
            self.assertEqual(self.rows(name), rows, name)
        gift = self.store.claim_island_reward(DAY, "math", NOW)
        self.assertEqual(gift["reward"], {"coins": 30, "diamonds": 1})
        self.assertEqual(self.store._wallet(), {"coins": 90, "diamonds": 2})


    def test_completion_needs_all_eight_real_tasks_and_not_prior_claims(self):
        for subject in ("math", "cs", "politics"):
            self.add(subject, "lecture", 20)
            self.add(subject, "practice", 30)
        self.add("english", "practice", 59+59/60)
        bonus = self.state()["completionBonus"]
        self.assertEqual(bonus["completedCount"], 7)
        self.assertFalse(bonus["eligible"])
        with self.assertRaises(ValueError):
            self.store.claim_method_completion(DAY, NOW)
        self.add("english", "practice", 1/60)
        self.assertTrue(self.state()["completionBonus"]["available"])
        self.assertEqual(self.rows("method_reward_claims"), [])
        result = self.store.claim_method_completion(DAY, NOW)
        self.assertEqual(result["reward"], {"coins": 200, "diamonds": 4})
        self.assertEqual(result["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        self.assertEqual(result["methodRewards"]["completionBonus"]["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        self.assertEqual((result["subject"], result["tier"]), ("all", "completion"))
        self.assertEqual(result["methodRewards"]["availableCount"], 8)
        self.assertEqual(self.rows("method_reward_claims"), [])

    def test_completion_cannot_use_only_lectures_other_or_unfinished_study(self):
        for subject in ("math", "cs", "politics"):
            self.add(subject, "practice", 60)
        self.add("english", "lecture", 600)
        self.add("english", "other", 600)
        self.add("other", "practice", 600)
        self.add("english", "practice", 60, end=NOW+timedelta(minutes=1))
        self.assertEqual(self.state()["completionBonus"]["completedCount"], 6)
        with self.assertRaises(ValueError):
            self.store.claim_method_completion(DAY, NOW)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_completion_and_eight_gifts_reach_440_coins_8_diamonds_without_allocating_study(self):
        self.complete_all()
        self.store.lottery_state(NOW)
        before = self.snapshot()
        self.store.claim_method_completion(DAY, NOW)
        for subject in NAMES:
            for tier in ("practice", "mastery"):
                self.claim(subject, tier)
        state = self.state()
        self.assertEqual(self.store._wallet(), {"coins": 440, "diamonds": 8})
        self.assertEqual(state["claimedTotals"], state["dailyCap"])
        self.assertEqual(state["claimedCount"], 9)
        self.assertEqual(state["availableCount"], 0)
        after = self.snapshot()
        for table in before.keys()-{"wallet_ledger", "method_reward_claims", "method_completion_claims", "meta", "lottery_ticket_ledger", "method_round_ticket_receipts"}:
            self.assertEqual(after[table], before[table], table)
        self.assertEqual(self.store.lottery_state(NOW)["tickets"], {"coin": 5, "diamond": 2})

    def test_completion_restart_and_record_corrections_never_pay_twice_or_claw_back(self):
        self.complete_all()
        first = self.store.claim_method_completion(DAY, NOW)
        identity = self.store.db.execute("SELECT id FROM records WHERE name='英语做题'").fetchone()[0]
        self.store.move_record(identity)
        self.assertFalse(self.state()["completionBonus"]["eligible"])
        self.assertTrue(self.state()["completionBonus"]["claimed"])
        self.store.close()
        self.store = self.make_store()
        retry = self.store.claim_method_completion(DAY, NOW)
        self.assertTrue(retry["alreadyClaimed"])
        self.assertEqual(retry["reward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(retry["wallet"], first["wallet"])
        self.store.move_record(identity, restore=True)
        self.assertFalse(self.state()["completionBonus"]["available"])
        self.assertEqual(len(self.rows("method_completion_claims")), 1)
        self.assertEqual(len(self.rows("wallet_ledger")), 1)

    def test_completion_ticket_preview_matches_feature_epoch_and_actual_claimed_ledger(self):
        self.complete_all()
        self.assertEqual(self.state()["completionBonus"]["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        self.assertEqual(self.state(now=NOW-timedelta(milliseconds=1))["completionBonus"]["lotteryTickets"],
                         {"coinTickets": 0, "diamondTickets": 0})
        claim = self.store.claim_method_completion(DAY, NOW)
        self.assertEqual({g["machine"]: g["count"] for g in claim["ticketGrants"]}, {"coin": 1, "diamond": 1})
        self.assertEqual({row[0] for row in self.rows("lottery_ticket_ledger")},
                         {f"method:{DAY}:completion", f"method:{DAY}:completion:coin"})
        with self.store.db:
            for machine in ("coin", "diamond"):
                self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?, ?,?,?)",
                    ("spent-method-"+machine, machine, -1, int(NOW.timestamp()*1000), "draw", "已使用"))
        self.assertEqual(self.store.lottery_state(NOW)["tickets"], {"coin": 0, "diamond": 0})
        self.assertEqual(self.state()["completionBonus"]["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        retry = self.store.claim_method_completion(DAY, NOW)
        self.assertEqual(retry["ticketGrants"], [])
        self.assertEqual(retry["lotteryTickets"], {"coinTickets": 0, "diamondTickets": 0})

    def test_old_completion_claims_never_backfill_coin_or_diamond_tickets_on_restart_or_retry(self):
        for old_ticket in (0, 1):
            with self.subTest(old_ticket=old_ticket):
                if old_ticket:
                    self.store.close()
                    self.temp.cleanup()
                    self.setUp()
                stamp = int(NOW.timestamp()*1000)
                with self.store.db:
                    self.store.db.execute("INSERT INTO method_completion_claims VALUES (?,?,?,?)", (DAY, 200, 4, stamp))
                    self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)", (f"method-completion:{DAY}", 200, 4, stamp))
                    if old_ticket:
                        self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,1,?,?,?)",
                            (f"method:{DAY}:completion", "diamond", stamp, "method-completion", "融会贯通奖赏"))
                        self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?, ?,?,?)",
                            ("spent-old-method", "diamond", -1, stamp, "draw", "已使用"))
                old_claims = self.rows("method_completion_claims")
                old_wallet = self.rows("wallet_ledger")
                old_tickets = self.rows("lottery_ticket_ledger")
                self.store.close()
                self.store = self.make_store()
                expected = {"coinTickets": 0, "diamondTickets": old_ticket}
                self.assertEqual(self.state()["completionBonus"]["lotteryTickets"], expected)
                self.complete_all()
                replay = self.store.claim_method_completion(DAY, NOW)
                self.assertTrue(replay["alreadyClaimed"])
                self.assertEqual(replay["reward"], {"coins": 0, "diamonds": 0})
                self.assertEqual(replay["lotteryTickets"], {"coinTickets": 0, "diamondTickets": 0})
                self.assertEqual(replay["ticketGrants"], [])
                self.assertEqual(self.rows("method_completion_claims"), old_claims)
                self.assertEqual(self.rows("wallet_ledger"), old_wallet)
                self.assertEqual(self.rows("lottery_ticket_ledger"), old_tickets)

    def test_completion_history_is_read_only_and_each_day_requires_its_own_study(self):
        self.complete_all()
        self.store.claim_method_completion(DAY, NOW)
        tomorrow = NOW+timedelta(days=1)
        next_day = tomorrow.date().isoformat()
        self.assertFalse(self.state(DAY, tomorrow)["completionBonus"]["available"])
        self.assertTrue(self.state(DAY, tomorrow)["completionBonus"]["claimed"])
        self.assertFalse(self.state(next_day, tomorrow)["completionBonus"]["eligible"])
        with self.assertRaisesRegex(ValueError, "日期已变化"):
            self.store.claim_method_completion(DAY, tomorrow)
        for subject in NAMES:
            self.add(subject, "practice", 60, end=tomorrow)
        self.assertFalse(self.state(next_day, NOW)["completionBonus"]["eligible"])
        with self.assertRaisesRegex(ValueError, "日期已变化"):
            self.store.claim_method_completion(next_day, NOW)
        self.store.claim_method_completion(next_day, tomorrow)
        self.assertEqual(self.store._wallet(), {"coins": 400, "diamonds": 8})

    def test_completion_checks_midnight_after_acquiring_transaction(self):
        self.complete_all()
        after = NOW.replace(hour=23, minute=59, second=59)+timedelta(seconds=1)
        def clock(value=None):
            self.assertTrue(self.store.db.in_transaction)
            return value or after
        with patch.object(server, "quest_clock", side_effect=clock), self.assertRaisesRegex(ValueError, "日期已变化"):
            self.store.claim_method_completion(DAY)
        self.assertEqual(self.rows("method_completion_claims"), [])

    def test_completion_failed_wallet_credit_rolls_back_receipt(self):
        self.complete_all()
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_completion BEFORE INSERT ON wallet_ledger
                WHEN NEW.reference LIKE 'method-completion:%' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.claim_method_completion(DAY, NOW)
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(self.state()["completionBonus"]["available"])

    def test_completion_secondary_coin_ticket_failure_rolls_back_original_diamond_and_currency_reward(self):
        self.complete_all()
        with self.store.db:
            self.store.db.execute("CREATE TRIGGER reject_method_coin BEFORE INSERT ON lottery_ticket_ledger WHEN NEW.reference LIKE 'method:%:completion:coin' BEGIN SELECT RAISE(ABORT,'fixture failure'); END")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.claim_method_completion(DAY, NOW)
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(self.state()["completionBonus"]["available"])
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_method_coin")
        first = self.store.claim_method_completion(DAY, NOW)
        self.assertEqual(first["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        self.assertEqual(self.store._wallet(), {"coins": 200, "diamonds": 4})

    def test_concurrent_completion_claims_credit_exactly_once(self):
        self.complete_all()
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def claim(store):
            barrier.wait()
            return store.claim_method_completion(DAY, NOW)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, (self.store, second)))
        self.assertEqual(sorted(result["alreadyClaimed"] for result in results), [False, True])
        self.assertEqual(sum(result["reward"]["coins"] for result in results), 200)
        self.assertEqual(self.store._wallet(), {"coins": 200, "diamonds": 4})
        self.assertEqual(len(self.rows("method_completion_claims")), 1)
        self.assertEqual(sum(g["count"] for result in results for g in result["ticketGrants"] if g["machine"] == "coin"), 1)
        self.assertEqual(sum(g["count"] for result in results for g in result["ticketGrants"] if g["machine"] == "diamond"), 1)
        self.assertEqual(self.store.lottery_state(NOW)["tickets"], {"coin": 1, "diamond": 1})

    def test_upgrade_preserves_existing_receipts_and_does_not_automatically_pay_bonus(self):
        self.complete_all()
        for subject in NAMES:
            for tier in ("practice", "mastery"):
                self.claim(subject, tier)
        existing = self.rows("method_reward_claims")
        with self.store.db:
            self.store.db.execute("DROP TABLE method_completion_claims")
        self.store.close()
        self.store = self.make_store()
        self.assertEqual(self.rows("method_reward_claims"), existing)
        self.assertEqual(self.store._wallet(), {"coins": 240, "diamonds": 4})
        self.assertEqual(self.rows("method_completion_claims"), [])
        self.assertTrue(self.state()["completionBonus"]["available"])

    def test_completion_mapping_correction_recomputes_unclaimed_eligibility(self):
        self.complete_all()
        self.store.update_settings({"activityMapping": {"英语做题": "other"}})
        self.assertFalse(self.state()["completionBonus"]["eligible"])
        with self.assertRaises(ValueError):
            self.store.claim_method_completion(DAY, NOW)
        self.store.update_settings({"activityMapping": {"英语做题": "practice"}})
        self.assertTrue(self.state()["completionBonus"]["available"])


class MethodRewardHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.clock = patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW)
        self.clock.start()
        self.store = server.FocusStore(Path(self.temp.name)/"data", Path(self.temp.name)/"unused.json")
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES ('math','math','数学做题',60,?,?,?,'tomatodo')",
                (int((NOW-timedelta(hours=1)).timestamp()*1000), int(NOW.timestamp()*1000), DAY))
        self.http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        self.port = self.http.server_address[1]
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.store.close()
        self.clock.stop()
        self.temp.cleanup()

    def request(self, payload, path="/api/method-rewards/claim", origin=None):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.request("POST", path, json.dumps(payload), headers={"Content-Type": "application/json",
            "Origin": origin or f"http://127.0.0.1:{self.port}"})
        response = conn.getresponse()
        result = response.status, json.loads(response.read())
        conn.close()
        return result

    def test_contract_includes_authoritative_wallet_time_and_zero_retry(self):
        payload = {"day": DAY, "subject": "math", "tier": "mastery"}
        status, first = self.request(payload)
        self.assertEqual(status, 200)
        self.assertEqual(first["reward"], {"coins": 40, "diamonds": 1})
        self.assertEqual(first["now"], NOW.isoformat())
        self.assertEqual(first["methodRewards"]["availableCount"], 1)
        status, retry = self.request(payload)
        self.assertEqual(status, 200)
        self.assertTrue(retry["alreadyClaimed"])
        self.assertEqual(retry["reward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(retry["wallet"], first["wallet"])

    def test_payload_is_strict_and_cross_origin_cannot_claim(self):
        valid = {"day": DAY, "subject": "math", "tier": "practice"}
        for payload in ({}, [], None, {"day": DAY}, {"subject": "math", "tier": "practice"},
                        dict(valid, coins=300), dict(valid, diamonds=10), dict(valid, now=NOW.isoformat()),
                        dict(valid, requestId=str(uuid.uuid4())), dict(valid, subject=[]), dict(valid, tier=False), dict(valid, day=False)):
            with self.subTest(payload=payload):
                self.assertEqual(self.request(payload)[0], 400)
        self.assertEqual(self.request(valid, "/api/method-rewards/claim?coins=300")[0], 400)
        self.assertEqual(self.request(valid, origin="https://untrusted.example")[0], 403)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_unready_historic_and_future_requests_cannot_pay(self):
        for payload in ({"day": DAY, "subject": "english", "tier": "practice"},
                        {"day": "2026-09-27", "subject": "math", "tier": "mastery"},
                        {"day": "2026-09-29", "subject": "math", "tier": "practice"}):
            self.assertEqual(self.request(payload)[0], 400)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_completion_payload_and_origin_are_strict_and_unready_requests_do_not_pay(self):
        path = "/api/method-rewards/completion"
        for payload in ({}, [], None, {"day": DAY, "coins": 150}, {"day": DAY, "subject": "all"},
                        {"day": DAY, "diamonds": 5}, {"day": DAY, "now": NOW.isoformat()}, {"day": False},
                        {"day": "2026-09-27"}, {"day": "2026-09-29"}, {"day": DAY}):
            with self.subTest(payload=payload):
                self.assertEqual(self.request(payload, path)[0], 400)
        self.assertEqual(self.request({"day": DAY}, path+"?coins=150")[0], 400)
        self.assertEqual(self.request({"day": DAY}, path, "https://untrusted.example")[0], 403)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_completion_contract_credits_authoritative_amount_and_retry_returns_zero(self):
        with self.store.db:
            for subject in ("cs", "politics", "english"):
                self.store.db.execute("INSERT INTO records VALUES (?,?,?,60,?,?,?,'tomatodo')",
                    (subject, subject, NAMES[subject]+"做题", int((NOW-timedelta(hours=1)).timestamp()*1000), int(NOW.timestamp()*1000), DAY))
        path = "/api/method-rewards/completion"
        status, first = self.request({"day": DAY}, path)
        self.assertEqual(status, 200)
        self.assertEqual(first["reward"], {"coins": 200, "diamonds": 4})
        self.assertEqual(first["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        self.assertTrue(first["methodRewards"]["completionBonus"]["claimed"])
        self.assertEqual(first["now"], NOW.isoformat())
        status, retry = self.request({"day": DAY}, path)
        self.assertEqual(status, 200)
        self.assertTrue(retry["alreadyClaimed"])
        self.assertEqual(retry["reward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(retry["wallet"], first["wallet"])
        self.assertEqual(retry["lotteryTickets"], {"coinTickets": 0, "diamondTickets": 0})
        self.assertEqual(retry["methodRewards"]["completionBonus"]["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})


if __name__ == "__main__":
    unittest.main()
