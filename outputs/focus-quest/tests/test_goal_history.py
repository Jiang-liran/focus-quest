"""Dated goals, atomic limits, historical heatmaps and forward-only rewards."""
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

spec = importlib.util.spec_from_file_location("goal_history_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
TZ = timezone(timedelta(hours=8))
NOW = datetime(2026, 9, 28, 8, tzinfo=TZ)
DEFAULT = {"math": 180, "cs": 180, "politics": 60, "english": 60}
uid = lambda: str(uuid.uuid4())


class GoalHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.data, self.source = self.root/"data", self.root/"source.json"
        self.store = self.make_store()

    def make_store(self, now=NOW):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or now):
            return server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def restart(self, now=NOW):
        self.store.close()
        self.store = self.make_store(now)

    def change(self, math=200, current=NOW, request=None):
        return self.store.set_daily_goal(dict(DEFAULT, math=math), current.date().isoformat(), request or uid(), current)

    def rows(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def snapshot(self):
        return {row[0]: self.rows(row[0]) for row in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

    def add(self, identity, start, minutes, subject="math"):
        name = {"math": "数学", "cs": "408", "politics": "政治", "english": "英语"}.get(subject, subject)
        end = start+timedelta(minutes=minutes)
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", (identity, identity, name, minutes,
                int(start.timestamp()*1000), int(end.timestamp()*1000), start.date().isoformat(), "tomatodo"))

    def test_new_archive_defaults_and_weekly_requires_explicit_confirmation(self):
        state = self.store.goals_state(NOW)
        self.assertEqual(state["daily"]["targets"], DEFAULT)
        self.assertEqual(state["daily"]["total"], 480)
        self.assertEqual(state["daily"]["changesRemaining"], 2)
        self.assertTrue(state["weeklyRequired"])
        self.assertFalse(state["weekly"]["locked"])
        self.assertEqual((state["weekly"]["weekStart"], state["weekly"]["weekEnd"]), ("2026-09-28", "2026-10-04"))
        self.assertEqual(state["weekly"]["target"], 3000)
        self.assertEqual(self.rows("goal_weeks"), [])

    def test_daily_exactly_two_changes_retry_does_not_use_quota_and_restart_preserves(self):
        request = uid()
        first = self.change(request=request)
        self.assertEqual(first["daily"]["changesRemaining"], 1)
        self.assertFalse(first["receipt"]["alreadyApplied"])
        retry = self.change(request=request.upper())
        self.assertTrue(retry["receipt"]["alreadyApplied"])
        self.assertEqual(retry["daily"], first["daily"])
        with self.assertRaises(ValueError):
            self.change(210, request=request)
        self.restart()
        second = self.change(220, NOW+timedelta(minutes=1))
        self.assertEqual(second["daily"]["changesRemaining"], 0)
        with self.assertRaisesRegex(ValueError, "两次"):
            self.change(230, NOW+timedelta(minutes=2))
        self.assertEqual(len(self.rows("goal_requests")), 2)
        self.assertEqual(self.store.state(now=NOW)["totals"]["target"], 520)
        self.assertEqual(self.store.opening(NOW)["target"], 520)

    def test_noop_invalid_fields_and_stale_dates_do_not_consume_quota(self):
        before = self.snapshot()
        for targets in (DEFAULT, {}, {"math": 200}, dict(DEFAULT, math=True), dict(DEFAULT, math=0),
                        dict(DEFAULT, math=1.5), dict(DEFAULT, cs=1440), dict(DEFAULT, bogus=1)):
            with self.subTest(targets=targets), self.assertRaises(ValueError):
                self.store.set_daily_goal(targets, "2026-09-28", uid(), NOW)
        for day in ("2026-09-27", "2026-09-29", "not-a-date", None):
            with self.subTest(day=day), self.assertRaises(ValueError):
                self.store.set_daily_goal(dict(DEFAULT, math=200), day, uid(), NOW)
        self.assertEqual(self.snapshot(), before)

    def test_midnight_restores_defaults_and_freezes_yesterday_in_all_views(self):
        self.change(240)
        tomorrow = NOW+timedelta(days=1)
        self.assertEqual(self.store.goals_state(tomorrow)["daily"]["targets"], DEFAULT)
        self.assertEqual(self.store.goals_state(tomorrow)["daily"]["changesRemaining"], 2)
        yesterday = self.store.state("2026-09-28", tomorrow)
        self.assertEqual(yesterday["subjects"][0]["target"], 240)
        self.assertEqual(yesterday["totals"]["target"], 540)
        self.change(100, tomorrow)
        self.assertEqual(self.store.state("2026-09-28", tomorrow)["totals"]["target"], 540)
        week = self.store.state(now=tomorrow)["weekly"]["days"]
        self.assertEqual([entry["target"] for entry in week[:3]], [540, 400, 480])
        with self.assertRaises(ValueError):
            self.store.set_daily_goal(DEFAULT, "2026-09-28", uid(), tomorrow)

    def test_closed_days_materialize_once_and_future_config_cannot_change_history(self):
        self.change(200)
        later = NOW+timedelta(days=4)
        self.restart(later)
        rows = self.rows("goal_days")
        self.assertEqual(len(rows), 5)
        self.assertEqual([json.loads(row[1])["math"] for row in rows], [200, 180, 180, 180, 180])
        changes = self.store.db.total_changes
        for _ in range(12):
            self.store.goals_state(later)
        self.assertEqual(self.store.db.total_changes, changes)
        with patch.dict(server.DEFAULT_SETTINGS, {"targets": dict(DEFAULT, math=300)}):
            self.assertEqual(self.store.state("2026-09-30", later)["totals"]["target"], 480)
            self.assertEqual(self.store.goals_state(later+timedelta(days=1))["daily"]["targets"], DEFAULT)

    def test_daily_cross_connection_quota_and_same_id_are_atomic(self):
        self.change(200)
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def race(args):
            store, minutes = args
            barrier.wait()
            try:
                return store.set_daily_goal(dict(DEFAULT, math=minutes), "2026-09-28", uid(), NOW+timedelta(minutes=1))
            except ValueError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            result = list(pool.map(race, [(self.store, 210), (second, 220)]))
        self.assertEqual(sum(item is not None for item in result), 1)
        self.assertEqual(self.store.goals_state(NOW)["daily"]["changesUsed"], 2)
        self.assertEqual(len(self.rows("goal_requests")), 2)
        self.assertEqual(int(self.store._meta("revision")), 2)

    def test_daily_duplicate_request_across_connections_is_exactly_once(self):
        second = self.make_store()
        self.addCleanup(second.close)
        barrier, request = threading.Barrier(2), uid()
        def race(store):
            barrier.wait()
            return store.set_daily_goal(dict(DEFAULT, math=200), "2026-09-28", request, NOW)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(race, [self.store, second]))
        self.assertEqual(sorted(r["receipt"]["alreadyApplied"] for r in results), [False, True])
        self.assertEqual(self.store.goals_state(NOW)["daily"]["changesUsed"], 1)

    def test_daily_failed_epoch_write_rolls_back_target_request_quota_and_revision(self):
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_goal_epoch BEFORE INSERT ON mystery_goal_epochs
                BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.change()
        self.assertEqual(self.snapshot(), before)

    def test_weekly_confirmation_locks_including_identical_new_request_and_retries(self):
        request = uid()
        first = self.store.set_weekly_goal(2400, "2026-09-28", request, NOW)
        self.assertFalse(first["weeklyRequired"])
        self.assertTrue(first["weekly"]["locked"])
        self.assertFalse(first["weekly"]["targetEstimated"])
        for target in (2400, 3000):
            with self.assertRaises(ValueError):
                self.store.set_weekly_goal(target, "2026-09-28", uid(), NOW)
        self.restart()
        retry = self.store.set_weekly_goal(2400, "2026-09-28", request, NOW+timedelta(days=7))
        self.assertTrue(retry["receipt"]["alreadyApplied"])
        self.assertTrue(retry["weeklyRequired"])
        self.assertEqual(self.store.state("2026-09-28", NOW+timedelta(days=7))["weekly"]["target"], 2400)
        self.store.set_weekly_goal(3200, "2026-10-05", uid(), NOW+timedelta(days=7))
        self.assertEqual(self.store.state("2026-09-28", NOW+timedelta(days=7))["weekly"]["target"], 2400)

    def test_weekly_cross_connection_only_one_confirmation_wins(self):
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def race(pair):
            store, target = pair
            barrier.wait()
            try:
                return store.set_weekly_goal(target, "2026-09-28", uid(), NOW)
            except ValueError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            result = list(pool.map(race, [(self.store, 2400), (second, 3000)]))
        self.assertEqual(sum(item is not None for item in result), 1)
        self.assertEqual(len(self.rows("goal_weeks")), 1)

    def test_weekly_invalid_limits_old_week_and_non_monday_are_rejected(self):
        before = self.snapshot()
        for target in (0, -1, True, 1.5, 10081, None, "3000"):
            with self.assertRaises(ValueError):
                self.store.set_weekly_goal(target, "2026-09-28", uid(), NOW)
        for start in ("2026-09-21", "2026-10-05", "2026-09-29"):
            with self.assertRaises(ValueError):
                self.store.set_weekly_goal(3000, start, uid(), NOW)
        self.assertEqual(self.snapshot(), before)

    def test_heatmap_uses_saved_daily_goals_excludes_deleted_and_matches_unarchived_history(self):
        self.change(120)
        self.add("a", NOW, 420)
        self.add("old", NOW-timedelta(days=30), 600)
        self.add("deleted", NOW, 100)
        self.store.move_record("deleted")
        state = self.store.heatmap("month", "2026-09-28", NOW+timedelta(hours=10))
        today = next(row for row in state["days"] if row["date"] == "2026-09-28")
        self.assertEqual((today["minutes"], today["target"], today["achieved"]), (420, 420, True))
        self.assertFalse(today["targetEstimated"])
        old = next(row for row in self.store.heatmap("month", "2026-08-28", NOW)["days"] if row["date"] == "2026-08-29")
        self.assertFalse(old["targetEstimated"])
        self.assertEqual(old["targetSource"], "historical-default")
        self.assertEqual(old["targets"], DEFAULT)
        self.assertEqual(old["target"], 480)
        self.assertTrue(old["achieved"])
        self.store.move_record("deleted", restore=True)
        self.assertEqual(next(row for row in self.store.heatmap("week", "2026-09-28", NOW+timedelta(hours=10))["days"] if row["date"] == "2026-09-28")["minutes"], 520)
        self.assertEqual(self.store.goals_state(NOW)["daily"]["total"], 420)

    def test_recorded_legacy_epochs_are_preserved_beside_historical_defaults(self):
        legacy = NOW-timedelta(days=8)
        with self.store.db:
            self.store._save_mystery_epoch(dict(self.store.settings, targets=dict(DEFAULT, math=240)), int(legacy.timestamp()*1000))
        heat = self.store.heatmap("month", "2026-09-01", NOW)
        indexed = {row["date"]: row for row in heat["days"]}
        self.assertEqual(indexed["2026-09-20"]["target"], 540)
        self.assertEqual(indexed["2026-09-20"]["targetSource"], "legacy-recorded")
        self.assertFalse(indexed["2026-09-20"]["targetEstimated"])
        self.assertEqual(indexed["2026-09-19"]["targetSource"], "historical-default")
        self.assertEqual(indexed["2026-09-19"]["target"], 480)
        self.assertFalse(indexed["2026-09-19"]["targetEstimated"])
        self.assertFalse(indexed["2026-09-19"]["achieved"])

    def test_historical_matching_is_read_only_and_consistent_in_all_periods(self):
        day = NOW.replace(day=10, hour=6)
        for subject, offset, minutes in (("math", 0, 180), ("cs", 3, 180), ("politics", 6, 60), ("english", 7, 59.99)):
            self.add(subject, day+timedelta(hours=offset), minutes, subject)
        self.add("earlier", day-timedelta(days=1), 480)
        self.change(240)
        # Populate the normal source aliases for these direct SQL fixtures
        # before checking that subsequent reads/restarts are unchanged.
        self.restart()
        # Complete lazy play-ticket initialization before checking side effects.
        self.store.lottery_state(NOW)
        before = self.snapshot()
        for period in ("week", "month", "year"):
            heat = self.store.heatmap(period, day.date().isoformat(), NOW)
            row = next(item for item in heat["days"] if item["date"] == day.date().isoformat())
            self.assertEqual((row["target"], row["targets"], row["targetSource"]), (480, DEFAULT, "historical-default"))
            self.assertFalse(row["achieved"])
            self.assertEqual([subject["achieved"] for subject in row["subjects"]], [True, True, True, False])
            self.assertEqual(heat["summary"]["estimatedGoalDays"], 0)
            self.assertTrue(all(week["targetEstimated"] and week["achieved"] is None for week in heat["weeks"]))
        state = self.store.state(selected_day=day.date().isoformat(), now=NOW)
        self.assertEqual(state["totals"]["target"], 480)
        self.assertEqual([subject["target"] for subject in state["subjects"]], [180, 180, 60, 60])
        self.assertEqual(self.snapshot(), before)
        self.restart()
        self.assertEqual(self.store._daily_goal(day.date().isoformat(), NOW)["targets"], DEFAULT)
        self.assertEqual(self.snapshot(), before)

    def test_explicit_old_daily_archive_wins_over_historical_preset(self):
        targets = dict(DEFAULT, math=60, cs=60)
        with self.store.db:
            self.store.db.execute("INSERT INTO goal_days VALUES (?,?,1,?,?)", ("2026-09-10", json.dumps(targets), 1, 1))
        self.add("old", NOW.replace(day=10), 240)
        row = next(item for item in self.store.heatmap("month", "2026-09-01", NOW)["days"] if item["date"] == "2026-09-10")
        self.assertEqual((row["target"], row["targets"], row["targetSource"], row["achieved"]), (240, targets, "recorded", True))

    def test_later_imports_match_fixed_defaults_without_retroactive_rewards(self):
        self.store.settings["targets"] = dict(DEFAULT, math=240)
        self.add("import", NOW-timedelta(days=100), 480)
        before = self.snapshot()
        day = (NOW-timedelta(days=100)).date().isoformat()
        row = next(item for item in self.store.heatmap("month", day, NOW)["days"] if item["date"] == day)
        self.assertTrue(row["achieved"])
        self.assertEqual(row["target"], 480)
        rewards = self.store.island_rewards_state(day, NOW)
        self.assertFalse(any(reward["available"] for reward in rewards["subjects"]))
        self.assertEqual(self.snapshot(), before)

    def test_heatmap_boundaries_leap_year_future_and_confirmed_week(self):
        leap = self.store.heatmap("year", "2024-02-29", NOW)
        self.assertEqual(len(leap["days"]), 366)
        self.assertEqual((leap["start"], leap["end"]), ("2024-01-01", "2024-12-31"))
        boundary = self.store.heatmap("week", "2026-01-01", NOW)
        self.assertEqual((boundary["start"], boundary["end"]), ("2025-12-29", "2026-01-04"))
        self.add("future", NOW+timedelta(days=1), 900)
        future = self.store.heatmap("week", "2026-09-28", NOW)
        self.assertIsNone(future["days"][1]["achieved"])
        self.assertEqual(future["summary"]["minutes"], 0)
        self.assertEqual(future["summary"]["activeDays"], 0)
        self.store.set_weekly_goal(600, "2026-09-28", uid(), NOW)
        week = self.store.heatmap("week", "2026-09-28", NOW)["weeks"][0]
        self.assertTrue(week["confirmed"])
        self.assertEqual(week["target"], 600)
        self.assertEqual(week["minutes"], 0)
        self.assertFalse(week["achieved"])
        self.assertEqual(self.store.state(now=NOW)["weekly"]["minutes"], 0)
        self.assertFalse(self.store.state(now=NOW)["weekly"]["achieved"])

    def qualifying(self, day=28):
        for subject, hour, minutes in (("math", 8, 180), ("cs", 11, 180), ("politics", 14, 60), ("english", 15, 60)):
            self.add(f"{day}-{subject}", NOW.replace(day=day, hour=hour), minutes, subject)

    def test_lowering_goal_only_grants_later_study_and_midnight_default_restores_mystery(self):
        self.change(300, NOW)  # 600-minute goal.
        self.qualifying()
        self.add("pre-lower", NOW.replace(hour=16), 30)
        before = self.store.quest_state(NOW.replace(hour=16, minute=30))["mystery"]
        self.assertEqual(before["pendingMinutes"], 0)
        self.change(180, NOW.replace(hour=16, minute=30))
        self.add("post-lower", NOW.replace(hour=16, minute=30), 30)
        result = self.store.quest_state(NOW.replace(hour=17))["mystery"]
        self.assertEqual(result["pendingMinutes"], 30)
        self.assertEqual(result["target"], 480)
        self.qualifying(day=29)
        self.add("next-day", NOW.replace(day=29, hour=16), 30)
        result = self.store.quest_state(NOW.replace(day=29, hour=17))["mystery"]
        self.assertEqual(result["pendingMinutes"], 60)
        self.assertEqual(result["target"], 480)

    def test_midnight_resets_low_goal_and_old_pending_survives_later_changes(self):
        self.qualifying()
        self.add("pending", NOW.replace(hour=16), 30)
        self.change(100, NOW.replace(hour=17))
        self.assertFalse(self.store.quest_state(NOW.replace(hour=17))["mystery"]["enabled"])
        self.assertEqual(self.store.quest_state(NOW.replace(hour=17))["mystery"]["pendingMinutes"], 30)
        self.qualifying(day=29)
        self.add("new-pending", NOW.replace(day=29, hour=16), 30)
        now = NOW.replace(day=29, hour=17)
        result = self.store.quest_state(now)["mystery"]
        self.assertTrue(result["enabled"])
        self.assertEqual(result["pendingMinutes"], 60)
        self.assertEqual(result["target"], 480)

    def test_mapping_edit_keeps_todays_npc_goal_in_reward_epoch(self):
        self.change(240)
        current = NOW+timedelta(hours=1)
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or current):
            self.store.update_settings({"mapping": {"自定义课程": "math"}})
        goals = self.store._goal_mystery_epochs(current)[-1][1]
        self.assertEqual(goals["targets"], dict(DEFAULT, math=240))
        self.assertEqual(goals["mapping"]["自定义课程"], "math")
        self.assertEqual(self.store.goals_state(current)["daily"]["changesUsed"], 1)

    def test_upgrade_lower_default_never_backfills_pre_upgrade_double_rewards(self):
        self.qualifying()
        self.add("before-upgrade", NOW.replace(hour=16), 30)
        old_settings = dict(self.store.settings, targets=dict(DEFAULT, math=300))
        with self.store.db:
            self.store._set_meta("settings", json.dumps(old_settings))
            self.store.db.execute("DELETE FROM meta WHERE key LIKE 'goalHistory:%'")
            self.store.db.execute("DELETE FROM goal_days")
            self.store.db.execute("DELETE FROM mystery_goal_epochs")
            self.store._save_mystery_epoch(old_settings, int(NOW.replace(hour=0).timestamp()*1000))
        self.restart(NOW.replace(hour=17))
        self.assertEqual(self.store.quest_state(NOW.replace(hour=17))["mystery"]["pendingMinutes"], 0)
        self.add("after-upgrade", NOW.replace(hour=17), 30)
        self.assertEqual(self.store.quest_state(NOW.replace(hour=18))["mystery"]["pendingMinutes"], 30)

    def test_upgrade_preserves_all_old_tables_and_does_not_confirm_week_or_credit_currency(self):
        self.add("old-study", NOW-timedelta(days=1), 60)
        self.restart()
        with self.store.db:
            self.store._set_meta("settings", json.dumps(dict(self.store.settings, targets=dict(DEFAULT, math=240), weeklyTarget=2400)))
            for table in ("goal_days", "goal_weeks", "goal_requests"):
                self.store.db.execute(f"DELETE FROM {table}")
            self.store.db.execute("DELETE FROM meta WHERE key LIKE 'goalHistory:%'")
            self.store.db.execute("DELETE FROM mystery_goal_epochs")
            self.store._save_mystery_epoch(dict(self.store.settings, targets=dict(DEFAULT, math=240)), int((NOW-timedelta(days=1)).timestamp()*1000))
        before = self.snapshot()
        self.restart()
        after = self.snapshot()
        for table, rows in before.items():
            if table not in ("meta", "goal_days", "mystery_goal_epochs"):
                self.assertEqual(after[table], rows, table)
        self.assertEqual(self.store.goals_state(NOW)["daily"]["targets"], DEFAULT)
        self.assertEqual(self.store.goals_state(NOW)["weekly"]["target"], 2400)
        self.assertTrue(self.store.goals_state(NOW)["weeklyRequired"])
        self.assertEqual(len(after["mystery_goal_epochs"]), len(before["mystery_goal_epochs"])+1)
        self.assertEqual(after["mystery_goal_epochs"][:1], before["mystery_goal_epochs"])
        self.restart()
        self.assertEqual(self.snapshot(), after)


if __name__ == "__main__":
    unittest.main()
