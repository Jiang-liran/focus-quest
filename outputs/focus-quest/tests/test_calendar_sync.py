"""Calendar bridge import uses isolated temporary data, never a personal archive."""
import importlib.util
import json
import tempfile
import threading
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path

spec = importlib.util.spec_from_file_location("calendar_focus_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class CalendarSyncTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "tomatodo.json"
        self.store = server.FocusStore(self.root / "data", self.source)
        self.now = datetime(2026, 9, 23, 21, tzinfo=timezone(timedelta(hours=8)))
        self.start = self.now - timedelta(minutes=10)
        self.event = {"calendarID": "selected-calendar", "calendarItemIdentifier": "phone-session-1",
                      "eventIdentifier": "changeable-id", "externalIdentifier": "external-id",
                      "title": "408做题", "start": self.start.isoformat(),
                      "end": (self.start + timedelta(minutes=2)).isoformat(), "isAllDay": False}
        self.config = {"schemaVersion": 1, "enabled": True, "calendarID": "selected-calendar",
                       "allowedTitles": ["408做题", "复习数学"], "lookbackDays": 90}
        self.write_config()
        self.write_desktop([])

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def write_config(self):
        self.store.calendar_config.write_text(json.dumps(self.config), encoding="utf-8")

    def write_snapshot(self, events=None, **changes):
        value = {"schemaVersion": 1, "kind": "focus_calendar_snapshot", "status": "ok",
                 "generatedAt": self.now.isoformat(),
                 "calendar": {"calendarID": "selected-calendar", "title": "工作", "sourceTitle": "iCloud"},
                 "requestedStart": (self.now - timedelta(days=90)).isoformat(), "requestedEnd": self.now.isoformat(),
                 "events": [self.event] if events is None else events}
        value.update(changes)
        self.store.calendar_snapshot.write_text(json.dumps(value), encoding="utf-8")

    def desktop(self, identifier=1, **changes):
        value = {"id": identifier, "isComplete": 1, "name": self.event["title"], "time": 2,
                 "startDate": int(datetime.fromisoformat(self.event["start"]).timestamp() * 1000),
                 "createDate": int(datetime.fromisoformat(self.event["end"]).timestamp() * 1000)}
        value.update(changes)
        return value

    def write_desktop(self, records, templates=None):
        self.source.write_text(json.dumps({"PCRecord": records, "PCToDo": templates or []}), encoding="utf-8")

    def state(self):
        return self.store.state(self.now.date().isoformat(), now=self.now)

    def import_calendar(self):
        return self.store.import_calendar(now=self.now)

    def test_phone_session_repeated_poll_restart_and_removal_keep_single_archive(self):
        self.write_snapshot()
        self.assertEqual(self.import_calendar(), 1)
        state = self.state()
        self.assertEqual(state["allTime"]["minutes"], 2)
        self.assertEqual(state["records"][0]["source"], "calendar")
        self.assertEqual(state["records"][0]["activity"], "practice")
        self.assertEqual(state["calendarSync"]["snapshotAt"], self.now.isoformat())
        self.assertTrue(state["calendarSync"]["connected"])
        self.assertEqual(self.import_calendar(), 0)
        stable_id = state["records"][0]["id"]
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)
        self.assertEqual(self.import_calendar(), 0)
        self.write_snapshot([])
        self.assertEqual(self.import_calendar(), 0)
        self.assertEqual(self.state()["records"][0]["id"], stable_id)
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.assertEqual(self.state()["calendarSync"]["importedCount"], 1)

    def test_phone_event_edits_update_same_row(self):
        self.write_snapshot()
        self.import_calendar()
        stable_id = self.state()["records"][0]["id"]
        self.event.update(title="复习数学", end=(self.start + timedelta(minutes=5)).isoformat(),
                          eventIdentifier="different-system-id", calendarItemIdentifier="new-local-item-id")
        self.write_snapshot()
        self.assertEqual(self.import_calendar(), 1)
        state = self.state()
        self.assertEqual(state["allTime"]["records"], 1)
        self.assertEqual(state["allTime"]["minutes"], 5)
        self.assertEqual(state["records"][0]["activity"], "lecture")
        self.assertEqual(state["records"][0]["id"], stable_id)

    def test_desktop_then_calendar_deduplicates_and_desktop_remains_authoritative(self):
        desktop = self.desktop()
        self.write_desktop([desktop])
        self.store.import_source()
        stable_id = self.state()["records"][0]["id"]
        self.write_snapshot()
        self.assertEqual(self.import_calendar(), 0)
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.assertEqual(self.state()["calendarSync"]["importedCount"], 1)
        desktop["time"] = 3
        self.write_desktop([desktop])
        self.store.import_source()
        self.import_calendar()
        self.assertEqual(self.state()["allTime"]["minutes"], 3)
        self.assertEqual(self.state()["records"][0]["id"], stable_id)

    def test_calendar_then_desktop_deduplicates_and_preserves_reward_identity(self):
        self.write_snapshot()
        self.import_calendar()
        stable_id = self.state()["records"][0]["id"]
        desktop = self.desktop()
        self.write_desktop([desktop])
        self.assertEqual(self.store.import_source(), 1)
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.assertEqual(self.state()["allTime"]["minutes"], 2)
        self.assertEqual(self.state()["records"][0]["source"], "tomatodo")
        self.assertEqual(self.state()["records"][0]["id"], stable_id)
        self.assertEqual(self.store.import_source(), 0)
        self.assertEqual(self.import_calendar(), 0)
        desktop["time"] = 3
        self.write_desktop([desktop])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.assertEqual(self.state()["allTime"]["minutes"], 3)

    def test_separate_consecutive_sessions_and_ambiguous_candidates_are_not_merged(self):
        self.write_desktop([self.desktop()])
        self.store.import_source()
        consecutive = dict(self.event, calendarItemIdentifier="next-phone-session",
                           externalIdentifier="next-external-id",
                           start=(self.start + timedelta(minutes=2)).isoformat(),
                           end=(self.start + timedelta(minutes=4)).isoformat())
        self.write_snapshot([self.event, consecutive])
        self.assertEqual(self.import_calendar(), 1)
        self.assertEqual(self.state()["allTime"]["records"], 2)
        self.assertEqual(self.state()["allTime"]["minutes"], 4)
        # Same-source distinct events are retained, never fuzzy-deduplicated.
        duplicate_time = dict(consecutive, calendarItemIdentifier="other-phone-session", externalIdentifier="other-external-id")
        self.write_snapshot([self.event, consecutive, duplicate_time])
        self.assertEqual(self.import_calendar(), 1)
        self.assertEqual(self.state()["allTime"]["records"], 3)

    def test_local_event_id_change_keeps_icloud_identity_and_missing_external_id_is_supported(self):
        self.write_snapshot()
        self.import_calendar()
        original_id = self.state()["records"][0]["id"]
        self.event["calendarItemIdentifier"] = "regenerated-local-id"
        self.write_snapshot()
        self.assertEqual(self.import_calendar(), 0)
        self.assertEqual(self.state()["records"][0]["id"], original_id)
        local_event = dict(self.event, externalIdentifier=None, calendarItemIdentifier="local-only-id")
        self.write_snapshot([self.event, local_event])
        self.assertEqual(self.import_calendar(), 1)
        self.assertEqual(self.import_calendar(), 0)
        self.assertEqual(self.state()["allTime"]["records"], 2)

    def test_ambiguous_cross_source_match_is_retained(self):
        self.write_desktop([self.desktop(1), self.desktop(2)])
        self.store.import_source()
        self.write_snapshot()
        self.assertEqual(self.import_calendar(), 1)
        self.assertEqual(self.state()["allTime"]["records"], 3)

    def test_invalid_unknown_all_day_future_and_other_calendar_events_rejected(self):
        invalid = [None, {}, dict(self.event, title="私人预约"), dict(self.event, isAllDay=True),
                   dict(self.event, calendarID="other-calendar"), dict(self.event, calendarItemIdentifier=""),
                   dict(self.event, isRecurring=True),
                   dict(self.event, start="2026-09-23T20:00:00"), dict(self.event, end=self.event["start"]),
                   dict(self.event, end=(self.now + timedelta(minutes=1)).isoformat()),
                   dict(self.event, start=(self.now - timedelta(days=3)).isoformat())]
        self.write_snapshot(invalid + [self.event])
        self.assertEqual(self.import_calendar(), 1)
        self.assertEqual(self.state()["calendarSync"]["ignoredCount"], len(invalid))
        self.assertEqual(self.state()["allTime"]["records"], 1)

    def test_config_refreshes_known_names_preserving_selection_and_options(self):
        self.write_desktop([self.desktop(name="政治做题")], [{"name": "英语听课"}, {"name": None}])
        self.store.import_source()
        self.write_snapshot()
        self.import_calendar()
        config = json.loads(self.store.calendar_config.read_text())
        self.assertEqual(set(config["allowedTitles"]), {"408做题", "复习数学", "政治做题", "英语听课"})
        self.assertEqual(config["calendarID"], "selected-calendar")
        self.assertEqual(config["lookbackDays"], 90)
        self.assertEqual(self.store.calendar_config.stat().st_mode & 0o777, 0o600)

    def test_stale_snapshot_and_service_error_preserve_history(self):
        self.write_snapshot(generatedAt=(self.now - timedelta(minutes=4)).isoformat())
        self.assertEqual(self.import_calendar(), 1)
        self.assertFalse(self.state()["calendarSync"]["connected"])
        self.assertIn("暂未更新", self.state()["calendarSync"]["error"])
        self.write_snapshot(status="error", error="日历权限未开启")
        self.assertEqual(self.import_calendar(), 0)
        self.assertIn("权限", self.state()["calendarSync"]["error"])
        self.assertEqual(self.state()["allTime"]["minutes"], 2)
        self.config["enabled"] = False
        self.write_config()
        self.assertEqual(self.import_calendar(), 0)
        self.assertFalse(self.state()["calendarSync"]["enabled"])
        self.assertIsNone(self.state()["calendarSync"]["error"])

    def test_wrong_calendar_diagnostic_format_and_conflicts_cannot_enter_archive(self):
        self.write_snapshot(calendar={"calendarID": "other"})
        self.assertEqual(self.import_calendar(), 0)
        self.write_snapshot(kind="unverified_focus_calendar_sample")
        self.assertEqual(self.import_calendar(), 0)
        self.write_snapshot([self.event, dict(self.event, title="复习数学")])
        self.assertEqual(self.import_calendar(), 0)
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.assertFalse(self.state()["calendarSync"]["connected"])

    def test_missing_configuration_is_optional_and_snapshot_alone_is_insufficient(self):
        self.store.calendar_config.unlink()
        self.write_snapshot()
        self.assertEqual(self.import_calendar(), 0)
        self.assertFalse(self.state()["calendarSync"]["enabled"])
        self.assertIsNone(self.state()["calendarSync"]["error"])
        self.assertEqual(self.state()["allTime"]["records"], 0)

    def test_pending_record_is_status_only_until_a_fresh_completed_snapshot_arrives(self):
        pending = dict(self.event, start=(self.now - timedelta(minutes=1)).isoformat(),
                       end=(self.now + timedelta(minutes=1)).isoformat())
        self.write_snapshot([], pendingEvents=[pending])
        self.assertEqual(self.import_calendar(), 0)
        state = self.state()
        self.assertEqual(state["calendarSync"]["pendingCount"], 1)
        self.assertEqual(state["calendarSync"]["pendingRecords"][0]["name"], "408做题")
        self.assertEqual(state["calendarSync"]["pendingRecords"][0]["minutes"], 2)
        self.assertEqual(state["totals"]["xp"], 0)
        self.assertEqual(state["allTime"]["records"], 0)
        # Merely reaching its end never converts an old pending snapshot into XP.
        self.now += timedelta(minutes=1)
        self.assertEqual(self.import_calendar(), 0)
        self.assertEqual(self.state()["calendarSync"]["pendingCount"], 0)
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.now += timedelta(seconds=1)
        self.write_snapshot([pending], pendingEvents=[])
        self.assertEqual(self.import_calendar(), 1)
        self.assertEqual(self.state()["allTime"]["minutes"], 2)
        self.assertEqual(self.state()["calendarSync"]["pendingCount"], 0)

    def test_pending_validates_boundaries_and_limits_display_without_losing_count(self):
        pending = dict(self.event, start=self.now.isoformat(), end=(self.now + timedelta(minutes=1)).isoformat())
        invalid = [dict(pending, title="私人预约"), dict(pending, calendarID="other-calendar"),
                   dict(pending, isAllDay=True), dict(pending, isRecurring=True),
                   dict(pending, start=(self.now + timedelta(seconds=1)).isoformat()),
                   dict(pending, end=self.now.isoformat()), dict(pending, end=(self.now + timedelta(days=2)).isoformat()),
                   dict(pending, start="2026-09-23T20:00:00"), dict(pending, calendarItemIdentifier="")]
        valid = [dict(pending, externalIdentifier=f"pending-{index}",
                      end=(self.now + timedelta(minutes=index + 1)).isoformat()) for index in range(12)]
        self.write_snapshot([], pendingEvents=invalid + valid + [valid[0]])
        self.assertEqual(self.import_calendar(), 0)
        sync = self.state()["calendarSync"]
        self.assertEqual(sync["pendingCount"], 12)
        self.assertEqual(len(sync["pendingRecords"]), 10)
        self.assertEqual(sync["pendingRecords"][0]["minutes"], 1)
        self.assertEqual(sync["pendingRecords"][-1]["minutes"], 10)
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.config["enabled"] = False
        self.write_config()
        self.import_calendar()
        self.assertEqual(self.state()["calendarSync"]["pendingCount"], 0)

    def test_refresh_request_is_manual_only_private_and_unique(self):
        self.write_snapshot()
        self.store.import_sources()
        self.assertFalse(self.store.calendar_refresh_request.exists())
        result = self.store.request_calendar_refresh()
        request = json.loads(self.store.calendar_refresh_request.read_text())
        self.assertTrue(result["calendarRequested"])
        self.assertEqual(request["schemaVersion"], 1)
        self.assertEqual(result["requestID"], request["requestID"])
        self.assertEqual(str(uuid.UUID(request["requestID"])), request["requestID"])
        self.assertTrue(request["requestedAt"].endswith("Z"))
        server.calendar_timestamp(request["requestedAt"])
        self.assertEqual(self.store.calendar_refresh_request.stat().st_mode & 0o777, 0o600)
        self.assertNotEqual(self.store.request_calendar_refresh()["requestID"], request["requestID"])
        self.config["enabled"] = False
        self.write_config()
        before = self.store.calendar_refresh_request.read_bytes()
        self.assertFalse(self.store.request_calendar_refresh()["calendarRequested"])
        self.assertEqual(self.store.calendar_refresh_request.read_bytes(), before)

    def test_manual_sync_api_returns_request_and_existing_state(self):
        self.write_snapshot([])
        http_server = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http_server.serve_forever, daemon=True)
        thread.start()
        connection = HTTPConnection("127.0.0.1", http_server.server_address[1], timeout=5)
        try:
            connection.request("POST", "/api/sync", body="{}", headers={"Content-Type": "application/json"})
            response = connection.getresponse()
            payload = json.loads(response.read())
            self.assertEqual(response.status, 200)
            self.assertTrue(payload["refreshRequest"]["calendarRequested"])
            self.assertEqual(payload["allTime"]["records"], 0)
            self.assertTrue(self.store.calendar_refresh_request.exists())
        finally:
            connection.close()
            http_server.shutdown()
            http_server.server_close()
            thread.join(timeout=5)

    def advance_snapshot(self, events=None, **changes):
        self.now += timedelta(seconds=30)
        self.write_snapshot([] if events is None else events, **changes)
        return self.import_calendar()

    def test_calendar_delete_needs_two_distinct_fresh_observations_and_recovers(self):
        self.write_snapshot()
        self.import_calendar()
        original_id = self.state()["records"][0]["id"]
        self.advance_snapshot()
        for _ in range(4):
            self.import_calendar()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        # Confirmation survives a service restart, but the cached file isn't new.
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)
        self.import_calendar()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.advance_snapshot()
        state = self.state()
        self.assertEqual(state["allTime"]["records"], 0)
        self.assertEqual(state["totals"]["xp"], 0)
        self.assertEqual(state["weekly"]["minutes"], 0)
        self.assertEqual(state["calendarSync"]["importedCount"], 0)
        self.assertEqual(state["sync"]["importedCount"], 0)
        self.assertEqual(state["trash"]["count"], 1)
        self.assertEqual(state["trash"]["records"][0]["deletionReason"], "source_missing")
        self.assertEqual(len(self.store.export_csv().decode("utf-8-sig").splitlines()), 1)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM records").fetchone()[0], 1)
        self.advance_snapshot([self.event])
        self.assertEqual(self.state()["records"][0]["id"], original_id)
        self.assertEqual(self.state()["trash"]["count"], 0)

    def test_both_sources_must_confirm_absence(self):
        self.write_desktop([self.desktop()])
        self.store.import_source()
        self.write_snapshot()
        self.import_calendar()
        self.write_desktop([])
        self.store.import_source()
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.write_desktop([self.desktop()])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)

    def test_calendar_removed_first_stays_until_desktop_confirms_and_counts_are_current(self):
        self.write_snapshot()
        self.import_calendar()
        self.write_desktop([self.desktop()])
        self.store.import_source()
        self.advance_snapshot()
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.write_desktop([])
        self.store.import_source()
        self.store.import_source()
        state = self.state()
        self.assertEqual(state["allTime"]["records"], 0)
        self.assertEqual(state["calendarSync"]["importedCount"], 0)
        self.assertEqual(state["sync"]["importedCount"], 0)

    def test_errors_stale_and_malformed_calendar_snapshots_cannot_confirm_deletion(self):
        self.write_snapshot()
        self.import_calendar()
        self.advance_snapshot()
        self.advance_snapshot(status="error", error="日历权限未开启")
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.now += timedelta(minutes=5)
        self.write_snapshot([], generatedAt=(self.now - timedelta(minutes=4)).isoformat())
        self.import_calendar()
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.advance_snapshot([{}])
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.store.calendar_snapshot.write_text('{"schemaVersion":1,')
        self.import_calendar()
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 0)

    def test_calendar_switch_short_range_and_removed_allowed_name_are_not_deletions(self):
        self.write_snapshot()
        self.import_calendar()
        for _ in range(2):
            self.advance_snapshot(requestedStart=(self.start + timedelta(minutes=1)).isoformat())
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.config["calendarID"] = "other-calendar"
        self.write_config()
        for _ in range(2):
            self.advance_snapshot(calendar={"calendarID": "other-calendar", "title": "另一个日历"})
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.config["calendarID"] = "selected-calendar"
        self.config["allowedTitles"] = ["复习数学"]
        for _ in range(2):
            self.write_config()
            self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 1)

    def test_pending_same_identity_proves_presence_without_updating_completed_minutes(self):
        self.write_snapshot()
        self.import_calendar()
        pending = dict(self.event, end=(self.now + timedelta(minutes=5)).isoformat())
        for _ in range(2):
            self.advance_snapshot(pendingEvents=[pending])
        self.assertEqual(self.state()["allTime"]["minutes"], 2)
        self.assertEqual(self.state()["trash"]["count"], 0)
        self.assertEqual(self.state()["calendarSync"]["pendingCount"], 1)

    def test_desktop_healthy_missing_twice_but_errors_and_partial_rows_reset_confirmation(self):
        self.write_desktop([self.desktop()])
        self.store.import_source()
        self.write_desktop([])
        self.store.import_source()
        self.source.write_text('{"PCRecord": [')
        self.store.import_source()
        self.write_desktop([])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.write_desktop([{}])
        self.store.import_source()
        self.write_desktop([])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.write_desktop([self.desktop(99, name=[])])
        self.store.import_source()
        self.write_desktop([])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.assertEqual(self.state()["trash"]["count"], 1)

    def test_manual_tombstone_blocks_reimport_and_explicit_restore_stays_local(self):
        self.write_desktop([self.desktop()])
        self.store.import_source()
        self.write_snapshot()
        self.import_calendar()
        record_id = self.state()["records"][0]["id"]
        self.store.move_record(record_id)
        self.store.import_source()
        self.advance_snapshot([self.event])
        self.assertEqual(self.state()["allTime"]["records"], 0)
        self.assertTrue(self.state()["trash"]["records"][0]["manualDeleted"])
        self.assertEqual(self.state()["trash"]["records"][0]["deletionReason"], "manual")
        self.write_desktop([])
        self.store.import_source()
        self.store.import_source()
        self.advance_snapshot()
        self.advance_snapshot()
        self.store.move_record(record_id, restore=True)
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)
        self.store.import_source()
        self.store.import_source()
        self.advance_snapshot()
        self.advance_snapshot()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.assertEqual(self.state()["trash"]["count"], 0)
        self.assertEqual(json.loads(self.source.read_text())["PCRecord"], [])
        self.assertEqual(json.loads(self.store.calendar_snapshot.read_text())["events"], [])

    def test_old_archive_migration_preserves_id_and_supports_safe_removal(self):
        self.write_desktop([self.desktop()])
        self.store.import_source()
        record_id = self.state()["records"][0]["id"]
        with self.store.db:
            self.store.db.execute("DROP TABLE source_presence")
            self.store.db.execute("DROP TABLE record_lifecycle")
            self.store.db.execute("DELETE FROM record_aliases")
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)
        self.assertEqual(self.state()["records"][0]["id"], record_id)
        self.write_desktop([])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.store.import_source()
        self.assertEqual(self.state()["trash"]["records"][0]["id"], record_id)

    def test_trash_restore_api_and_csv_only_expose_active_records(self):
        self.write_desktop([self.desktop()])
        self.store.import_source()
        record_id = self.state()["records"][0]["id"]
        http_server = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http_server.serve_forever, daemon=True)
        thread.start()
        connection = HTTPConnection("127.0.0.1", http_server.server_address[1], timeout=5)
        try:
            for path, count in (("trash", 0), ("restore", 1)):
                connection.request("POST", "/api/records/" + path, body=json.dumps({"id": record_id}),
                                   headers={"Content-Type": "application/json"})
                response = connection.getresponse()
                payload = json.loads(response.read())
                self.assertEqual(response.status, 200)
                self.assertEqual(payload["allTime"]["records"], count)
            connection.request("GET", "/api/trash")
            response = connection.getresponse()
            self.assertEqual(json.loads(response.read())["count"], 0)
            connection.request("POST", "/api/records/trash", body='{"id":"missing"}',
                               headers={"Content-Type": "application/json"})
            response = connection.getresponse()
            response.read()
            self.assertEqual(response.status, 400)
        finally:
            connection.close()
            http_server.shutdown()
            http_server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
