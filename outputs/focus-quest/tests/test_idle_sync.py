"""Background polling stays cheap without weakening source reconciliation."""
import importlib.util
import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('idle_sync_server', Path(__file__).resolve().parents[1] / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class IdleSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'source.json'
        self.store = server.FocusStore(self.root / 'data', self.source)
        self.now = datetime.now(timezone.utc)
        self.record = {'id': 1, 'name': '复习数学', 'time': 30, 'isComplete': 1,
                       'startDate': int((self.now - timedelta(minutes=40)).timestamp() * 1000),
                       'createDate': int((self.now - timedelta(minutes=10)).timestamp() * 1000)}
        self.write([self.record])

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def write(self, rows):
        self.source.write_text(json.dumps({'PCRecord': rows}), encoding='utf-8')

    def poll(self):
        return self.store.import_sources(only_if_changed=True)

    def calendar(self, age=0, pending=False):
        self.store.calendar_config.write_text(json.dumps({'schemaVersion': 1, 'enabled': True,
            'calendarID': 'calendar', 'allowedTitles': ['复习数学']}), encoding='utf-8')
        event = {'calendarID': 'calendar', 'calendarItemIdentifier': 'session',
                 'externalIdentifier': 'external', 'eventIdentifier': 'event', 'title': '复习数学',
                 'start': (self.now - timedelta(minutes=5)).isoformat(),
                 'end': (self.now + timedelta(minutes=5) if pending else self.now - timedelta(minutes=1)).isoformat(),
                 'isAllDay': False}
        self.store.calendar_snapshot.write_text(json.dumps({'schemaVersion': 1, 'kind': 'focus_calendar_snapshot',
            'status': 'ok', 'generatedAt': (self.now - timedelta(seconds=age)).isoformat(),
            'calendar': {'calendarID': 'calendar', 'title': 'Focus'},
            'requestedStart': (self.now - timedelta(days=90)).isoformat(),
            'requestedEnd': (self.now + timedelta(days=1)).isoformat(),
            'events': [] if pending else [event], 'pendingEvents': [event] if pending else []}), encoding='utf-8')

    def test_idle_polls_do_not_reread_or_write_database(self):
        self.poll()
        writes = self.store.db.total_changes
        with patch.object(self.store, 'import_source', wraps=self.store.import_source) as desktop, \
                patch.object(self.store, 'import_calendar', wraps=self.store.import_calendar) as calendar:
            for _ in range(300):
                self.assertEqual(self.poll(), 0)
            self.assertEqual(desktop.call_count, 0)
            self.assertEqual(calendar.call_count, 0)
        self.assertEqual(self.store.db.total_changes, writes)
        self.assertEqual(self.store.state()['allTime']['records'], 1)

    def test_second_absence_still_confirms_deletion_without_file_change(self):
        self.poll()
        self.write([])
        self.assertEqual(self.poll(), 0)
        self.assertEqual(self.store.state()['allTime']['records'], 1)
        self.assertEqual(self.poll(), 1)
        self.assertEqual(self.store.state()['allTime']['records'], 0)
        self.assertEqual(self.poll(), 0)
        self.write([self.record])
        self.assertEqual(self.poll(), 1)
        self.assertEqual(self.store.state()['allTime']['records'], 1)

    def test_changes_same_size_and_mtime_still_detected(self):
        self.poll()
        original = self.source.stat()
        self.record['time'] = 45
        self.write([self.record])
        os.utime(self.source, ns=(original.st_atime_ns, original.st_mtime_ns))
        self.assertEqual(self.source.stat().st_size, original.st_size)
        self.assertEqual(self.poll(), 1)
        self.assertEqual(self.store.state()['allTime']['minutes'], 45)

    def test_manual_refresh_always_performs_full_scan(self):
        self.poll()
        with patch.object(self.store, 'import_source', wraps=self.store.import_source) as importer:
            self.store.import_sources()
            self.assertEqual(importer.call_count, 1)

    def test_forced_periodic_verification_and_backward_clock(self):
        for elapsed in (30.1, -1):
            self.store.import_sources()
            signature, checked = self.store._source_poll_cache
            with patch.object(server.time, 'monotonic', return_value=checked + elapsed), \
                    patch.object(self.store, 'import_source', wraps=self.store.import_source) as importer:
                self.poll()
                self.assertEqual(importer.call_count, 1)

    def test_local_and_external_database_writes_invalidate(self):
        self.poll()
        with self.store.db:
            self.store.db.execute("UPDATE records SET minutes=7")
        self.poll()
        self.assertEqual(self.store.state()['allTime']['minutes'], 30)
        with sqlite3.connect(self.store.data_dir / 'focus-quest.sqlite3') as other:
            other.execute('UPDATE records SET minutes=9')
        self.poll()
        self.assertEqual(self.store.state()['allTime']['minutes'], 30)

    def test_error_retries_do_not_cache_unhealthy_source(self):
        self.poll()
        self.source.write_text('{invalid')
        self.poll()
        self.assertIsNone(self.store._source_poll_cache)
        with patch.object(self.store, 'import_source', wraps=self.store.import_source) as importer:
            self.poll()
            self.assertEqual(importer.call_count, 1)
        self.assertEqual(self.store.state()['allTime']['records'], 1)

    def test_calendar_snapshot_change_is_imported_immediately(self):
        self.calendar()
        self.poll()
        self.assertTrue(self.store.calendar_sync['connected'])
        self.assertEqual(self.store.state()['allTime']['records'], 2)
        with patch.object(self.store, 'import_calendar', wraps=self.store.import_calendar) as importer:
            self.poll()
            self.assertEqual(importer.call_count, 0)
        self.calendar(age=1)
        with patch.object(self.store, 'import_calendar', wraps=self.store.import_calendar) as importer:
            self.poll()
            self.assertEqual(importer.call_count, 1)

    def test_calendar_freshness_crossing_is_not_hidden_by_cache(self):
        self.calendar()
        self.poll()
        future = self.now + timedelta(seconds=server.CALENDAR_STALE_SECONDS + 1)
        class FutureDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return cls.fromtimestamp(future.timestamp(), tz)

        # Preserve datetime's type and constructors for quest_clock validation.
        with patch.object(server, 'datetime', FutureDateTime):
            self.poll()
        self.assertFalse(self.store.calendar_sync['connected'])
        self.assertIsNone(self.store._source_poll_cache)

    def test_pending_calendar_records_keep_being_evaluated(self):
        self.calendar(pending=True)
        self.poll()
        self.assertEqual(self.store.calendar_sync['pendingCount'], 1)
        self.assertIsNone(self.store._source_poll_cache)
        with patch.object(self.store, 'import_calendar', wraps=self.store.import_calendar) as importer:
            self.poll()
            self.assertEqual(importer.call_count, 1)


if __name__ == '__main__':
    unittest.main()
