"""Weekly goals and learning-method statistics use isolated temporary archives."""
import csv
import io
import json
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from test_server import record, server


class UpgradeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="focus-quest-upgrade-")
        self.root = Path(self.temp.name)
        self.source = self.root / "source.json"
        self.store = server.FocusStore(self.root / "archive", self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def import_records(self, records):
        self.source.write_text(json.dumps({"PCRecord": records}, ensure_ascii=False), encoding="utf-8")
        original = self.source.read_bytes()
        self.store.import_source()
        self.assertEqual(self.source.read_bytes(), original)

    def state(self, day="2026-09-23", hour=15):
        return self.store.state(day, now=datetime(2026, 9, 23, hour))

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.root / "archive", self.source)

    def test_weekly_default_update_and_restart(self):
        self.assertEqual(self.state()["settings"]["weeklyTarget"], 3000)
        self.assertEqual(self.state()["weekly"]["target"], 3000)
        self.assertEqual(self.state()["weekly"]["percent"], 0)
        self.assertEqual(self.state()["weekly"]["activeDays"], 0)
        self.restart()
        self.assertEqual(self.state()["weekly"]["target"], 3000)
        self.store.set_weekly_goal(3600, "2026-09-21", str(uuid.uuid4()), datetime(2026, 9, 23, 15).astimezone())
        self.restart()
        self.assertEqual(self.state()["settings"]["weeklyTarget"], 3600)
        self.assertEqual(self.state()["weekly"]["target"], 3600)

    def test_old_archive_settings_migrate_and_preserve_records(self):
        self.import_records([record(1, minutes=45)])
        # Materialize lazy play-ticket credits before snapshotting migration.
        self.state()
        old_settings = {"targets": {"math": 240, "cs": 180, "politics": 60, "english": 60},
                        "mapping": {"自定义": "math"}, "motion": False, "sound": True}
        with self.store.db:
            self.store._set_meta("settings", json.dumps(old_settings))
        revision = self.store.revision
        self.restart()
        state = self.state()
        self.assertEqual(state["settings"]["weeklyTarget"], 3000)
        self.assertEqual(state["settings"]["activityMapping"], {})
        for field, value in old_settings.items():
            self.assertEqual(self.store.settings[field], value)
            if field != "targets":
                self.assertEqual(state["settings"][field], value)
        # An undated global preference stays intact in storage, but cannot
        # replace the user's chosen fixed rule for unarchived historical days.
        self.assertEqual(state["settings"]["targets"], server.DEFAULT_SETTINGS["targets"])
        self.assertEqual(state["selectedGoal"]["targetSource"], "historical-default")
        self.assertEqual(state["allTime"]["minutes"], 45)
        self.assertEqual(state["revision"], revision)
        self.assertEqual(json.loads(self.store._meta("settings")), self.store.settings)
        self.restart()
        self.assertEqual(self.state()["settings"], state["settings"])

    def test_weekly_validation_is_atomic(self):
        for value in (0, -1, 10081, 10**400, 3000.5, True, None, "3000", float("nan"), float("inf")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.store.update_settings({"weeklyTarget": value, "sound": True})
        self.assertEqual(self.state()["settings"]["weeklyTarget"], 3000)
        self.assertFalse(self.state()["settings"]["sound"])
        for value in (1, 10080):
            self.store.update_settings({"weeklyTarget": value})
            self.assertEqual(self.store.settings["weeklyTarget"], value)
            self.assertEqual(self.state()["settings"]["weeklyTarget"], 3000, "internal legacy settings do not rewrite a dated goal")

    def test_full_calendar_week_year_boundary_and_overachievement(self):
        monday = datetime(2025, 12, 29, 20)
        amounts = [300, 400, 500, 600, 700, 800, 300]
        records = [record(index + 1, minutes=amount, end=monday + timedelta(days=index))
                   for index, amount in enumerate(amounts)]
        records += [record(20, minutes=900, end=monday - timedelta(days=1)),
                    record(21, minutes=1000, end=monday + timedelta(days=7))]
        self.import_records(records)
        expected_days = [(monday + timedelta(days=i)).date().isoformat() for i in range(7)]
        for selected in expected_days:
            with self.subTest(selected=selected):
                weekly = self.state(selected)["weekly"]
                self.assertEqual(weekly["date"], selected)
                self.assertEqual(weekly["start"], "2025-12-29")
                self.assertEqual(weekly["end"], "2026-01-04")
                self.assertEqual([item["date"] for item in weekly["days"]], expected_days)
                self.assertEqual([item["minutes"] for item in weekly["days"]], amounts)
                self.assertTrue(all(item["target"] == 480 for item in weekly["days"]))
                self.assertEqual(weekly["minutes"], 3600)
                self.assertEqual(weekly["percent"], 120)
                self.assertEqual(weekly["activeDays"], 7)
        previous = self.state("2025-12-28")["weekly"]
        self.assertEqual((previous["start"], previous["end"], previous["minutes"]),
                         ("2025-12-22", "2025-12-28", 900))
        following = self.state("2026-01-05")["weekly"]
        self.assertEqual((following["start"], following["end"], following["minutes"]),
                         ("2026-01-05", "2026-01-11", 1000))
        # The original rolling chart still ends on the selected day.
        rolling = self.state("2026-01-01")["week"]
        self.assertEqual((rolling[0]["date"], rolling[-1]["date"]), ("2025-12-26", "2026-01-01"))

    def test_explicit_and_user_confirmed_activity_names(self):
        for name in ("数学听课", "听讲", "408网课", "政治课程", "英语看课", "数学看视频",
                     "复习数学", "复习408", "复习政治", "复习英语"):
            with self.subTest(name=name):
                self.assertEqual(server.classify_activity(name, {}), "lecture")
        for name in ("数学做题", "刷题408", "政治练题", "英语练习", "数学习题", "英语真题"):
            with self.subTest(name=name):
                self.assertEqual(server.classify_activity(name, {}), "practice")
        for name in ("复习", "数学复习", "背单词", "复习数学错题", "数学", "听课与做题", "习题课程", "杂项"):
            with self.subTest(name=name):
                self.assertEqual(server.classify_activity(name, {}), "other")

    def test_activity_override_validation_clear_and_persistence(self):
        self.import_records([record(1, name="数学复习"), record(2, name="复习数学")])
        self.store.update_settings({"activityMapping": {"数学复习": "practice", "复习数学": "other"}})
        self.restart()
        self.assertEqual(self.state()["taskActivities"], {"数学复习": "practice", "复习数学": "other"})
        for mapping in ([], {"a": []}, {"a": "invalid"}, {"a": 1}, {"": "lecture"}, {"a" * 501: "lecture"}):
            with self.subTest(mapping=mapping), self.assertRaises(ValueError):
                self.store.update_settings({"activityMapping": mapping})
        self.store.update_settings({"activityMapping": {"数学复习": None, "复习数学": None}})
        self.assertEqual(self.state()["settings"]["activityMapping"], {})
        self.assertEqual(self.state()["taskActivities"], {"数学复习": "other", "复习数学": "lecture"})

    def test_activity_totals_subjects_records_and_csv_are_consistent(self):
        self.import_records([
            record(1, name="复习数学", minutes=90), record(2, name="数学做题", minutes=30),
            record(3, name="数学复习", minutes=10), record(4, name="408听课做题", minutes=20),
            record(5, name="背单词", minutes=25), record(6, name="自定义听课", minutes=15),
            record(7, name="政治练习", minutes=10, end=datetime(2026, 9, 22, 10)),
        ])
        state = self.state()
        summary = state["activities"]
        self.assertEqual(summary["totals"], {"lecture": 105, "practice": 30, "other": 55})
        self.assertEqual(sum(summary["totals"].values()), state["totals"]["minutes"])
        subjects = {item["id"]: item for item in summary["subjects"]}
        self.assertEqual(set(subjects), {"math", "cs", "politics", "english", "other"})
        self.assertEqual(subjects["math"]["minutes"], 130)
        self.assertEqual(subjects["math"]["practiceShare"], 25)
        self.assertIsNone(subjects["cs"]["practiceShare"])
        self.assertEqual(subjects["other"]["lecture"], 15)
        for subject in subjects.values():
            self.assertEqual(subject["lecture"] + subject["practice"] + subject["other"], subject["minutes"])
        self.assertEqual(sum(item["minutes"] for item in subjects.values()), state["totals"]["minutes"])
        self.assertEqual(state["activityTypes"], [{"id": "lecture", "name": "听课"},
                                                {"id": "practice", "name": "做题"},
                                                {"id": "other", "name": "复习 / 其他"}])
        self.assertTrue(all(item["activity"] == state["taskActivities"][item["name"]]
                            for item in state["records"] + state["latestRecords"]))
        exported = list(csv.DictReader(io.StringIO(self.store.export_csv().decode("utf-8-sig"))))
        csv_names = {item["任务"]: item["学习方式"] for item in exported}
        self.assertEqual(csv_names["复习数学"], "听课")
        self.assertEqual(csv_names["数学做题"], "做题")
        self.assertEqual(csv_names["408听课做题"], "复习 / 其他")
        historical = self.state("2026-09-22")["activities"]
        self.assertEqual(historical["totals"], {"lecture": 0, "practice": 10, "other": 0})
        self.assertEqual(len(historical["subjects"]), 4)
        self.store.update_settings({"mapping": {"自定义听课": "cs"}})
        self.assertEqual(len(self.state()["activities"]["subjects"]), 4)

    def test_activity_advice_thresholds_and_no_assumed_lecture_deficit(self):
        self.import_records([record(1, name="数学听课", minutes=60), record(2, name="数学做题", minutes=29)])
        advice = self.state()["activities"]["subjects"][0]["advice"]
        self.assertEqual(advice["id"], "lecture-heavy")
        self.assertIn("25 分钟做题", advice["text"])
        self.import_records([record(3, name="数学做题", minutes=1)])
        self.assertEqual(self.state()["activities"]["subjects"][0]["advice"]["id"], "steady")
        self.import_records([record(4, name="408做题", minutes=60)])
        practice = self.state()["activities"]["subjects"][1]["advice"]
        self.assertEqual(practice["id"], "practice-focused")
        self.assertIn("无需为了凑比例增加听课", practice["text"])
        self.import_records([record(5, name="政治听课", minutes=59)])
        self.assertEqual(self.state()["activities"]["subjects"][2]["advice"]["id"], "steady")

    def test_activity_advice_respects_night_completed_day_and_history(self):
        self.import_records([record(1, name="数学听课", minutes=120)])
        for hour in (0, 3, 6, 22, 23):
            with self.subTest(hour=hour):
                summary = self.state(hour=hour)["activities"]
                self.assertIn("现在先休息", summary["advice"]["text"])
                self.assertIn("下一天", summary["subjects"][0]["advice"]["text"])
        self.import_records([record(2, name="英语听课", minutes=360)])
        complete = self.state()["activities"]
        self.assertIn("总目标已达成", complete["advice"]["text"])
        self.assertIn("下次学习", complete["subjects"][0]["advice"]["text"])
        self.assertIn("先安心休息", complete["subjects"][0]["advice"]["text"])
        historic = self.store.state("2026-09-23", now=datetime(2026, 9, 24, 15))["activities"]
        self.assertIn("这一天", historic["advice"]["text"])
        self.assertIn("下次学习", historic["advice"]["text"])
        self.assertNotIn("今天的", historic["advice"]["text"])
        self.assertIn("建议仅依据已记录时长", historic["advice"]["text"])

    def test_ambiguous_tasks_prompt_manual_classification(self):
        self.import_records([record(1, name="背单词", minutes=40), record(2, name="数学复习", minutes=80)])
        activities = self.state()["activities"]
        self.assertEqual(activities["advice"]["id"], "unclassified")
        self.assertIn("设置", activities["advice"]["text"])
        self.assertEqual(activities["totals"], {"lecture": 0, "practice": 0, "other": 120})
        self.assertIsNone(activities["subjects"][0]["practiceShare"])

    def test_no_records_do_not_request_manual_classification(self):
        empty = self.state()["activities"]
        self.assertEqual(empty["advice"]["id"], "no-records")
        for subject in empty["subjects"]:
            self.assertEqual(subject["advice"]["id"], "no-records")
            self.assertIn("自动统计", subject["advice"]["text"])
            self.assertNotIn("设置", subject["advice"]["text"])
        self.import_records([record(1, name="数学复习", minutes=80)])
        summary = self.state()["activities"]
        self.assertEqual(summary["subjects"][0]["advice"]["id"], "unclassified")
        self.assertEqual(summary["subjects"][1]["advice"]["id"], "no-records")

    def test_learning_method_advice_follows_rest_signals(self):
        self.import_records([record(1, name="数学听课", minutes=60, end=datetime(2026, 9, 23, 10)),
                             record(2, name="数学听课", minutes=60, end=datetime(2026, 9, 23, 11, 10))])
        recent = self.store.state("2026-09-23", now=datetime(2026, 9, 23, 11, 20))
        self.assertEqual(recent["advice"]["id"], "rest")
        self.assertIn("先休息", recent["activities"]["subjects"][0]["advice"]["text"])
        self.assertIn("之后的学习", recent["activities"]["advice"]["text"])
        self.assertNotIn("下一段", recent["activities"]["advice"]["text"])
        self.import_records([record(3, name="408听课", minutes=180, end=datetime(2026, 9, 23, 12))])
        early = self.state(hour=13)
        self.assertEqual(early["advice"]["id"], "early-progress")
        self.assertIn("先休息", early["activities"]["advice"]["text"])
        for subject in early["activities"]["subjects"][:2]:
            self.assertIn("先休息", subject["advice"]["text"])
            self.assertIn("之后的学习", subject["advice"]["text"])
            self.assertNotIn("时长只作为安排参考", subject["advice"]["text"])
        # The rest signal expires; a later session can carry the ordinary suggestion.
        later = self.state(hour=16)
        self.assertIn("下一段", later["activities"]["subjects"][0]["advice"]["text"])


if __name__ == "__main__":
    unittest.main()
