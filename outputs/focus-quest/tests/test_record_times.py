"""Start/end are source facts, distinct from credited focus duration."""
import csv
import importlib.util
import io
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("record_times_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
TZ = timezone(timedelta(hours=8))
NOW = datetime(2026, 9, 29, 21, tzinfo=TZ)
ms = lambda value: int(value.timestamp()*1000)


class RecordTimeContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root/"source.json"
        self.store = self.make_store()

    def make_store(self):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW):
            return server.FocusStore(self.root/"data", self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def desktop(self, start=None, end=None, minutes=60, **extra):
        start = start or NOW-timedelta(hours=3)
        end = end or NOW-timedelta(hours=1)
        value = dict(id="focus-one", name="数学做题", time=minutes, startDate=ms(start),
                     createDate=ms(end), isComplete=1, **extra)
        self.source.write_text(json.dumps({"PCRecord": [value]}), encoding="utf-8")
        self.store.import_source()
        return value

    def assert_times(self, record, start, end, minutes):
        self.assertEqual(datetime.fromisoformat(record["start"]), start)
        self.assertEqual(datetime.fromisoformat(record["end"]), end)
        self.assertAlmostEqual(record["minutes"], minutes, places=4)

    def test_paused_timer_keeps_actual_start_in_daily_recent_and_storage(self):
        start, end = NOW-timedelta(hours=3), NOW-timedelta(hours=1)
        self.desktop(start, end, 60)
        state = self.store.state(NOW.date().isoformat(), NOW)
        for record in (state["records"][0], state["latestRecords"][0]):
            self.assert_times(record, start, end, 60)
            self.assertNotEqual(datetime.fromisoformat(record["start"]), end-timedelta(minutes=record["minutes"]))
        persisted = self.store.db.execute("SELECT start_ms,end_ms,minutes FROM records").fetchone()
        self.assertEqual(tuple(persisted), (ms(start), ms(end), 60))

    def test_cross_midnight_record_preserves_real_dates_and_source_archive_day(self):
        start = datetime(2026, 9, 28, 23, 47, 12, tzinfo=TZ)
        end = datetime(2026, 9, 29, 0, 18, 32, tzinfo=TZ)
        archive = datetime(2026, 9, 28, 23, 59, 59, tzinfo=TZ)
        self.desktop(start, archive, 25, i6=1, s4=str(end.timestamp()))
        state = self.store.state("2026-09-28", NOW)
        record = state["records"][0]
        self.assert_times(record, start, end, 25)
        self.assertEqual(record["day"], "2026-09-28")
        self.assertEqual(self.store.state("2026-09-29", NOW)["records"], [])

    def test_trash_and_restore_keep_original_start_end_and_duration(self):
        start, end = NOW-timedelta(hours=3), NOW-timedelta(hours=1)
        self.desktop(start, end, 60)
        item_id = self.store.state(now=NOW)["records"][0]["id"]
        self.store.move_record(item_id)
        self.assert_times(self.store.trash()["records"][0], start, end, 60)
        self.assert_times(self.store.state(now=NOW)["trash"]["records"][0], start, end, 60)
        self.store.move_record(item_id, restore=True)
        self.assert_times(self.store.state(now=NOW)["records"][0], start, end, 60)

    def test_csv_has_both_times_even_when_elapsed_time_exceeds_focus_duration(self):
        start, end = NOW-timedelta(hours=3), NOW-timedelta(hours=1)
        self.desktop(start, end, 60)
        rows = list(csv.DictReader(io.StringIO(self.store.export_csv().decode("utf-8-sig"))))
        self.assertEqual(len(rows), 1)
        self.assertEqual(datetime.fromisoformat(rows[0]["开始时间"]), start)
        self.assertEqual(datetime.fromisoformat(rows[0]["完成时间"]), end)
        self.assertEqual(float(rows[0]["分钟"]), 60)

    def test_history_import_and_restart_preserve_record_rows_without_backfill(self):
        start, end = NOW-timedelta(hours=3), NOW-timedelta(hours=1)
        row = {"source_key": "history-start-contract", "name": "英语做题", "minutes": 70,
               "start_ms": ms(start), "end_ms": ms(end), "day": NOW.date().isoformat()}
        self.store.import_history([row], {}, "time-contract", "synthetic.xlsx", True)
        before = [tuple(value) for value in self.store.db.execute("SELECT * FROM records ORDER BY id")]
        self.store.close()
        self.store = self.make_store()
        self.assertEqual(before, [tuple(value) for value in self.store.db.execute("SELECT * FROM records ORDER BY id")])
        self.assert_times(self.store.state(now=NOW)["records"][0], start, end, 70)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_calendar_complete_and_pending_keep_second_precision_start(self):
        start, end = NOW-timedelta(minutes=10, seconds=17), NOW-timedelta(minutes=2, seconds=5)
        pending_start, pending_end = NOW-timedelta(seconds=43), NOW+timedelta(minutes=2, seconds=7)
        def event(identity, first, last):
            return {"calendarID": "study", "calendarItemIdentifier": identity, "externalIdentifier": identity,
                    "title": "复习政治", "start": first.isoformat(), "end": last.isoformat(), "isAllDay": False}
        self.store.calendar_config.write_text(json.dumps({"schemaVersion": 1, "enabled": True,
            "calendarID": "study", "allowedTitles": ["复习政治"]}), encoding="utf-8")
        self.store.calendar_snapshot.write_text(json.dumps({"schemaVersion": 1, "kind": "focus_calendar_snapshot",
            "status": "ok", "generatedAt": NOW.isoformat(), "calendar": {"calendarID": "study", "title": "学习"},
            "requestedStart": (NOW-timedelta(days=30)).isoformat(), "requestedEnd": NOW.isoformat(),
            "events": [event("completed", start, end)], "pendingEvents": [event("pending", pending_start, pending_end)]}), encoding="utf-8")
        self.assertEqual(self.store.import_calendar(NOW), 1)
        state = self.store.state(now=NOW)
        self.assert_times(state["records"][0], start, end, (end-start).total_seconds()/60)
        self.assert_times(state["calendarSync"]["pendingRecords"][0], pending_start, pending_end,
                          (pending_end-pending_start).total_seconds()/60)
        self.assertEqual(state["allTime"]["records"], 1)


if __name__ == "__main__":
    unittest.main()
