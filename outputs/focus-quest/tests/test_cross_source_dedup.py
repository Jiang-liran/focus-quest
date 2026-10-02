"""Regression cases for one focus session mirrored through desktop and iCloud.

Every case owns a temporary archive and source files; no personal data is read.
"""
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "cross_source_focus_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class CrossSourceDedupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "tomatodo.json"
        self.store = server.FocusStore(self.root / "data", self.source)
        self.now = datetime(2026, 9, 23, 22, tzinfo=timezone(timedelta(hours=8)))
        # Reproduce Tomato's integer minute versus Calendar's 76-second span.
        self.start = datetime(2026, 9, 23, 21, 38, 40, tzinfo=self.now.tzinfo)
        self.event = {
            "calendarID": "selected-calendar", "calendarItemIdentifier": "local-one",
            "externalIdentifier": "external-one", "eventIdentifier": "event-one",
            "title": "复习英语", "start": self.start.isoformat(),
            "end": (self.start + timedelta(seconds=76)).isoformat(), "isAllDay": False,
        }
        self.desktop = {
            "id": 1, "isComplete": 1, "name": "复习英语", "time": 1,
            "startDate": int(self.start.timestamp() * 1000) + 644,
            "createDate": int((self.start + timedelta(seconds=76)).timestamp() * 1000) + 3,
        }
        self.store.calendar_config.write_text(json.dumps({
            "schemaVersion": 1, "enabled": True, "calendarID": "selected-calendar",
            "allowedTitles": ["复习英语", "英语做题", "复习数学"], "lookbackDays": 90,
        }), encoding="utf-8")
        self.write_desktop([])

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def write_desktop(self, records):
        self.source.write_text(json.dumps({"PCRecord": records, "PCToDo": []}), encoding="utf-8")

    def write_snapshot(self, events):
        self.store.calendar_snapshot.write_text(json.dumps({
            "schemaVersion": 1, "kind": "focus_calendar_snapshot", "status": "ok",
            "generatedAt": self.now.isoformat(),
            "calendar": {"calendarID": "selected-calendar", "title": "工作", "sourceTitle": "iCloud"},
            "requestedStart": (self.now - timedelta(days=90)).isoformat(),
            "requestedEnd": self.now.isoformat(), "events": events,
        }), encoding="utf-8")

    def state(self):
        return self.store.state(self.now.date().isoformat(), now=self.now)

    def import_calendar(self, events=None):
        if events is not None:
            self.write_snapshot(events)
        return self.store.import_calendar(now=self.now)

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)

    def advance_calendar(self, events):
        self.now += timedelta(seconds=30)
        self.import_calendar(events)

    def assert_canonical_session(self, original_id):
        state = self.state()
        self.assertEqual(state["allTime"], {"minutes": 1, "records": 1, "activeDays": 1})
        self.assertEqual(state["totals"]["xp"], 1)
        self.assertEqual(state["weekly"]["minutes"], 1)
        self.assertEqual(state["trash"]["count"], 0)
        self.assertEqual(state["records"][0], {
            "id": original_id, "name": "复习英语", "subject": "english", "activity": "lecture",
            "minutes": 1, "start": server.iso_ms(self.desktop["startDate"]),
            "end": server.iso_ms(self.desktop["createDate"]),
            "day": self.now.date().isoformat(), "source": "tomatodo",
        })
        aliases = self.store.db.execute("SELECT source,record_id FROM record_aliases").fetchall()
        self.assertEqual({row["source"] for row in aliases}, {"calendar", "tomatodo"})
        self.assertEqual({row["record_id"] for row in aliases}, {original_id})

    def exercise_real_sample(self, calendar_first):
        if calendar_first:
            self.import_calendar([self.event])
            original_id = self.state()["records"][0]["id"]
            self.write_desktop([self.desktop])
            self.store.import_source()
        else:
            self.write_desktop([self.desktop])
            self.store.import_source()
            original_id = self.state()["records"][0]["id"]
            original_revision = self.state()["revision"]
            self.assertEqual(self.import_calendar([self.event]), 0)
            self.assertEqual(self.state()["revision"], original_revision)
        self.assert_canonical_session(original_id)
        stable_revision = self.state()["revision"]
        for _ in range(3):
            self.assertEqual(self.store.import_source(), 0)
            self.assertEqual(self.import_calendar(), 0)
            self.assertEqual(self.state()["revision"], stable_revision)
        self.restart()
        self.store.import_source()
        self.import_calendar()
        self.assert_canonical_session(original_id)
        self.assertEqual(len(self.store.export_csv().decode("utf-8-sig").splitlines()), 2)

    def test_real_second_precision_mirror_desktop_first_survives_restart(self):
        self.exercise_real_sample(calendar_first=False)

    def test_real_second_precision_mirror_calendar_first_survives_restart(self):
        self.exercise_real_sample(calendar_first=True)

    def test_calendar_only_session_keeps_seconds(self):
        self.import_calendar([self.event])
        self.assertAlmostEqual(self.state()["records"][0]["minutes"], 76 / 60, places=7)
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.restart()
        self.import_calendar()
        self.assertAlmostEqual(self.state()["records"][0]["minutes"], 76 / 60, places=7)

    def test_paused_session_uses_desktop_focus_minutes_instead_of_elapsed_span(self):
        end = self.start + timedelta(minutes=15)
        self.desktop.update(time=3, createDate=int(end.timestamp() * 1000) + 3)
        self.event["end"] = end.isoformat()
        self.import_calendar([self.event])
        first_id = self.state()["records"][0]["id"]
        self.write_desktop([self.desktop])
        self.store.import_source()
        state = self.state()
        self.assertEqual(state["allTime"]["records"], 1)
        self.assertEqual(state["allTime"]["minutes"], 3)
        self.assertEqual(state["totals"]["xp"], 3)
        self.assertEqual(state["records"][0]["id"], first_id)

    def test_midnight_session_preserves_desktop_archive_day_and_actual_end(self):
        start = self.now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(seconds=20)
        end = start + timedelta(seconds=76, milliseconds=3)
        archive_time = self.now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(milliseconds=1)
        self.event.update(start=start.isoformat(), end=end.replace(microsecond=0).isoformat())
        self.desktop.update(startDate=int(start.timestamp() * 1000) + 644,
                            createDate=int(archive_time.timestamp() * 1000), i6=1, s4=end.timestamp())
        self.import_calendar([self.event])
        first_id = self.state()["records"][0]["id"]
        self.write_desktop([self.desktop])
        self.store.import_source()
        state = self.state()
        self.assertEqual(state["allTime"]["records"], 1)
        self.assertEqual(state["allTime"]["minutes"], 1)
        self.assertEqual(state["totals"]["minutes"], 0)
        record = state["latestRecords"][0]
        self.assertEqual(record["id"], first_id)
        self.assertEqual(record["day"], archive_time.date().isoformat())
        self.assertEqual(record["start"], server.iso_ms(self.desktop["startDate"]))
        self.assertEqual(record["end"], server.iso_ms(int(end.timestamp() * 1000)))

    def test_adjacent_tiny_intervals_do_not_merge_without_positive_overlap(self):
        self.desktop.update(startDate=int(self.start.timestamp() * 1000),
                            createDate=int((self.start + timedelta(seconds=2)).timestamp() * 1000))
        self.event.update(start=(self.start + timedelta(seconds=2)).isoformat(),
                          end=(self.start + timedelta(seconds=4)).isoformat())
        self.write_desktop([self.desktop])
        self.store.import_source()
        self.import_calendar([self.event])
        self.assertEqual(self.state()["allTime"]["records"], 2)

    def test_same_subject_with_different_task_name_is_not_a_mirror(self):
        self.event["title"] = "英语做题"
        self.write_desktop([self.desktop])
        self.store.import_source()
        self.import_calendar([self.event])
        self.assertEqual(self.state()["allTime"]["records"], 2)

    def test_start_or_end_outside_tolerance_is_not_a_mirror(self):
        self.event["end"] = (self.start + timedelta(seconds=83)).isoformat()
        self.write_desktop([self.desktop])
        self.store.import_source()
        self.import_calendar([self.event])
        self.assertEqual(self.state()["allTime"]["records"], 2)

    def test_two_desktop_candidates_and_one_calendar_are_not_arbitrarily_paired(self):
        self.write_desktop([self.desktop, dict(self.desktop, id=2)])
        self.store.import_source()
        self.import_calendar([self.event])
        self.assertEqual(self.state()["allTime"]["records"], 3)
        self.restart()
        self.assertEqual(self.state()["allTime"]["records"], 3)

    def test_one_desktop_and_two_calendar_candidates_in_same_batch_are_preserved(self):
        self.write_desktop([self.desktop])
        self.store.import_source()
        second = dict(self.event, externalIdentifier="external-two", calendarItemIdentifier="local-two")
        self.import_calendar([self.event, second])
        self.assertEqual(self.state()["allTime"]["records"], 3)
        self.import_calendar()
        self.assertEqual(self.state()["allTime"]["records"], 3)

    def test_calendar_first_then_two_desktop_candidates_in_same_batch_are_preserved(self):
        self.import_calendar([self.event])
        self.write_desktop([self.desktop, dict(self.desktop, id=2)])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 3)

    def seed_old_duplicates(self, calendar_first=False, manual_actions=None):
        """Represent a pre-fix database without running the new import matcher."""
        desktop = server.normalize_record(self.desktop)
        calendar = server.normalize_calendar_record(
            self.event, "selected-calendar", {self.event["title"]}, int(self.now.timestamp() * 1000),
            int((self.now - timedelta(days=90)).timestamp() * 1000), int(self.now.timestamp() * 1000))
        ordered = [calendar, desktop] if calendar_first else [desktop, calendar]
        with self.store.db:
            for record in ordered:
                self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", record)
                key = record[1] if record[7] == "calendar" else record[0]
                self.store.db.execute("INSERT INTO record_aliases VALUES (?,?,?)", (record[7], key, record[0]))
                self.store.db.execute("INSERT INTO source_presence(source,source_key) VALUES (?,?)", (record[7], key))
                action = (manual_actions or {}).get(record[7])
                if action:
                    self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (
                        record[0], self.now.isoformat() if action == "delete" else None,
                        "manual" if action == "delete" else None, action))
        return ordered[0][0]

    def test_upgrade_merges_existing_duplicates_preserving_first_desktop_identity(self):
        first_id = self.seed_old_duplicates()
        self.restart()
        self.assert_canonical_session(first_id)
        self.restart()
        self.assert_canonical_session(first_id)

    def test_upgrade_merges_existing_duplicates_preserving_first_calendar_identity(self):
        first_id = self.seed_old_duplicates(calendar_first=True)
        self.restart()
        self.assert_canonical_session(first_id)

    def test_migrated_aliases_require_both_sources_to_confirm_deletion(self):
        first_id = self.seed_old_duplicates(calendar_first=True)
        self.restart()
        self.assert_canonical_session(first_id)
        self.import_calendar([self.event])
        self.write_desktop([])
        self.store.import_source()
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.advance_calendar([])
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.advance_calendar([])
        state = self.state()
        self.assertEqual(state["allTime"]["records"], 0)
        self.assertEqual(state["totals"]["xp"], 0)
        self.assertEqual(state["trash"]["count"], 1)
        self.assertEqual(state["trash"]["records"][0]["id"], first_id)

    def test_manual_delete_is_preserved_when_calendar_mirror_arrives_later(self):
        self.write_desktop([self.desktop])
        self.store.import_source()
        first_id = self.state()["records"][0]["id"]
        self.store.move_record(first_id)
        self.import_calendar([self.event])
        state = self.state()
        self.assertEqual(state["allTime"]["records"], 0)
        self.assertEqual(state["totals"]["xp"], 0)
        self.assertEqual(state["trash"]["count"], 1)
        self.assertEqual(state["trash"]["records"][0]["id"], first_id)
        self.assertTrue(state["trash"]["records"][0]["manualDeleted"])

    def test_manual_delete_is_preserved_when_desktop_mirror_arrives_later(self):
        self.import_calendar([self.event])
        first_id = self.state()["records"][0]["id"]
        self.store.move_record(first_id)
        self.write_desktop([self.desktop])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.assertEqual(self.state()["trash"]["count"], 1)
        self.assertEqual(self.state()["trash"]["records"][0]["id"], first_id)
        self.assertEqual(self.state()["trash"]["records"][0]["minutes"], 1)

    def test_first_calendar_echo_restores_auto_trash_and_emits_changed_revision(self):
        self.write_desktop([self.desktop])
        self.store.import_source()
        first_id = self.state()["records"][0]["id"]
        self.write_desktop([])
        self.store.import_source()
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.assertEqual(self.state()["trash"]["count"], 1)
        trashed_revision = self.state()["revision"]
        self.assertEqual(self.import_calendar([self.event]), 1)
        self.assertGreater(self.state()["revision"], trashed_revision)
        self.assert_canonical_session(first_id)
        restored_revision = self.state()["revision"]
        self.assertEqual(self.import_calendar(), 0)
        self.assertEqual(self.state()["revision"], restored_revision)

    def test_upgrade_retains_manual_delete_from_duplicate_that_loses_identity(self):
        first_id = self.seed_old_duplicates(calendar_first=True, manual_actions={"tomatodo": "delete"})
        self.restart()
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.assertEqual(self.state()["trash"]["count"], 1)
        self.assertEqual(self.state()["trash"]["records"][0]["id"], first_id)
        self.assertTrue(self.state()["trash"]["records"][0]["manualDeleted"])
        self.write_desktop([self.desktop])
        self.store.import_source()
        self.import_calendar([self.event])
        self.assertEqual(self.state()["allTime"]["records"], 0)

    def test_upgrade_retains_explicit_restore_after_both_source_records_disappear(self):
        first_id = self.seed_old_duplicates(manual_actions={"calendar": "keep"})
        self.restart()
        self.assert_canonical_session(first_id)
        self.store.import_source()
        self.store.import_source()
        self.advance_calendar([])
        self.advance_calendar([])
        self.restart()
        self.assert_canonical_session(first_id)

    def test_upgrade_preserves_prior_source_absence_observation(self):
        first_id = self.seed_old_duplicates(calendar_first=True)
        with self.store.db:
            self.store.db.execute("UPDATE source_presence SET active=0,missing_count=2 WHERE source='tomatodo'")
            self.store.db.execute("UPDATE source_presence SET missing_count=1,last_snapshot=? WHERE source='calendar'",
                                  (str(int(self.now.timestamp() * 1000)),))
        self.restart()
        self.assert_canonical_session(first_id)
        self.advance_calendar([])
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.assertEqual(self.state()["trash"]["count"], 1)
        self.assertEqual(self.state()["trash"]["records"][0]["id"], first_id)

    def test_opposing_manual_delete_and_keep_are_not_silently_merged(self):
        self.seed_old_duplicates(manual_actions={"calendar": "keep", "tomatodo": "delete"})
        self.restart()
        state = self.state()
        self.assertEqual(state["allTime"]["records"], 1)
        self.assertEqual(state["trash"]["count"], 1)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM records").fetchone()[0], 2)
        self.assertTrue(state["trash"]["records"][0]["manualDeleted"])


if __name__ == "__main__":
    unittest.main()
