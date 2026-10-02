"""History imports use temporary databases and normalized synthetic records only."""
import copy
import importlib.util
import json
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "server.py"
spec = importlib.util.spec_from_file_location("history_import_server", MODULE)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

BASE = int(datetime(2026, 6, 1, 9).timestamp() * 1000)
MINUTE = 60_000


def history(key="row-1", name="数学", minutes=60, offset=0, span=60, **fields):
    return dict(dict(source_key=key, name=name, minutes=minutes,
                     start_ms=BASE + offset * MINUTE,
                     end_ms=BASE + (offset + span) * MINUTE, day="2026-06-01"), **fields)


def native(key="one", source="tomatodo", name="数学", minutes=60, offset=0, span=60,
           precision=0):
    start = BASE + offset * MINUTE + precision
    end = BASE + (offset + span) * MINUTE + precision
    source_id = key if source == "tomatodo" else "calendar-key:" + key
    record_id = f"{source_id}:{start}"
    return (record_id, source_id, name, minutes, start, end, "2026-06-01", source)


class HistoryImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.data = self.root / "data"
        self.source = self.root / "desktop.json"
        self.source.write_text('{"PCRecord":[]}', encoding="utf-8")
        self.store = server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)

    def put(self, *records):
        with self.store.lock, self.store.db:
            return self.store._upsert_records(records)

    def import_rows(self, rows, resolutions=None, batch="batch-1", prefer=True):
        return self.store.import_history(rows, resolutions or {}, batch, "synthetic-history.xlsx", prefer)

    def all_records(self):
        return [dict(row) for row in self.store.db.execute("SELECT * FROM records ORDER BY start_ms,id")]

    def absent(self, source="tomatodo"):
        with self.store.lock, self.store.db:
            self.store._observe_source(source, set(), "100")
            self.store._observe_source(source, set(), "101")

    def test_new_history_survives_absent_sources_and_restart(self):
        revision = self.store.revision
        result = self.import_rows([history()])
        self.assertEqual((result["added"], result["matched"], result["minuteDelta"]), (1, 0, 60))
        self.assertEqual(self.store.revision, revision + 1)
        row = self.all_records()[0]
        alias = tuple(self.store.db.execute("SELECT * FROM record_aliases").fetchone())
        self.assertEqual(alias, ("history_xlsx", row["id"], row["id"]))
        self.absent()
        self.absent("calendar")
        self.assertEqual(self.store._active_count(), 1)
        self.restart()
        self.assertEqual(self.store._active_count(), 1)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM record_aliases").fetchone()[0], 1)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_batch_and_source_key_idempotence(self):
        rows = [history(), history("row-2", offset=120)]
        self.import_rows(rows)
        revision = self.store.revision
        self.assertTrue(self.import_rows(list(reversed(rows)))["alreadyImported"])
        self.assertEqual(self.store.revision, revision)
        changed = copy.deepcopy(rows)
        changed[0]["minutes"] = 59
        with self.assertRaises(ValueError):
            self.import_rows(changed)
        self.restart()
        receipt = self.import_rows(rows, batch="other-export")
        self.assertEqual((receipt["added"], receipt["matched"], receipt["revised"]), (0, 2, 0))
        self.assertEqual(self.store._active_count(), 2)

    def test_corrected_live_fields_survive_replay_without_permanent_presence(self):
        original = native(precision=17_123)
        self.put(original)
        receipt = self.import_rows([history(minutes=59)])
        self.assertEqual((receipt["matched"], receipt["revised"], receipt["minuteDelta"]), (1, 1, -1))
        self.assertEqual(self.all_records()[0]["start_ms"], original[4])
        self.assertEqual(self.all_records()[0]["end_ms"], original[5])
        self.assertEqual(self.put(original), 0)
        self.assertEqual(self.all_records()[0]["minutes"], 59)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM source_presence WHERE source='history_xlsx'").fetchone()[0], 0)
        self.restart()
        self.assertEqual(self.put(original), 0)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM record_aliases").fetchone()[0], 1)
        self.absent()
        self.assertEqual(self.store._active_count(), 0)

    def test_rename_day_and_timestamp_correction_are_authoritative(self):
        original = native(precision=41_000)
        self.put(original)
        corrected = history(name="408 计算机网络", minutes=58, offset=2, span=58, day="2026-05-31")
        receipt = self.import_rows([corrected], {"row-1": [original[0]]})
        self.assertEqual(receipt["revised"], 1)
        for _ in range(2):
            self.assertEqual(self.put(original), 0)
        row = self.all_records()[0]
        self.assertEqual((row["name"], row["minutes"], row["day"]), (corrected["name"], 58, "2026-05-31"))
        self.assertEqual(row["start_ms"], corrected["start_ms"])
        self.assertEqual(row["end_ms"], original[5])
        self.restart()
        self.assertEqual(self.store.db.execute("SELECT source_key FROM record_aliases").fetchone()[0], original[0])

    def test_three_to_one_merge_replays_all_original_aliases_without_rollback(self):
        originals = [native("a", minutes=20, span=20), native("b", minutes=10, offset=20, span=10),
                     native("c", minutes=66, offset=30, span=66)]
        self.put(*originals)
        row = history(minutes=96, span=96)
        resolution = {"row-1": [item[0] for item in originals]}
        receipt = self.import_rows([row], resolution)
        self.assertEqual((receipt["matched"], receipt["revised"], receipt["merged"], receipt["minuteDelta"]), (1, 1, 2, 0))
        self.assertEqual(self.all_records()[0]["id"], originals[0][0])
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM record_merges").fetchone()[0], 2)
        self.assertEqual(self.put(*reversed(originals)), 0)
        self.assertEqual(self.all_records()[0]["minutes"], 96)
        self.restart()
        self.assertEqual(self.put(*originals), 0)
        repeat = self.import_rows([row], resolution, batch="second")
        self.assertEqual((repeat["added"], repeat["merged"], repeat["revised"]), (0, 0, 0))
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_keep_existing_mode_only_links_even_many_to_one(self):
        originals = [native("a", minutes=20, span=20), native("b", minutes=40, offset=20, span=40)]
        self.put(*originals)
        receipt = self.import_rows([history()], {"row-1": [item[0] for item in originals]}, prefer=False)
        self.assertEqual((receipt["matched"], receipt["merged"], receipt["revised"]), (1, 0, 0))
        self.assertEqual(len(self.all_records()), 2)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM history_overrides").fetchone()[0], 0)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM history_links").fetchone()[0], 2)
        self.restart()
        self.assertEqual(len(self.all_records()), 2)

    def test_deleted_records_are_neither_revised_nor_revived(self):
        original = native()
        self.put(original)
        self.store.move_record(original[0])
        receipt = self.import_rows([history(minutes=59)])
        self.assertEqual((receipt["added"], receipt["ignoredDeleted"], receipt["minuteDelta"]), (0, 1, 0))
        self.assertEqual(self.all_records()[0]["minutes"], 60)
        self.assertEqual(self.store._active_count(), 0)
        self.put(original)
        self.restart()
        self.assertEqual(self.store._active_count(), 0)
        self.assertEqual(self.store.trash()["records"][0]["manualDeleted"], True)

    def test_keep_and_automatic_tombstones_remain(self):
        keep, deleted = native("keep"), native("deleted", offset=120)
        self.put(keep, deleted)
        self.store.move_record(keep[0], restore=True)
        self.absent()
        receipt = self.import_rows([history("keep", minutes=59), history("deleted", offset=120, minutes=58)])
        self.assertEqual((receipt["revised"], receipt["ignoredDeleted"]), (1, 1))
        lifecycle = {r["record_id"]: dict(r) for r in self.store.db.execute("SELECT * FROM record_lifecycle")}
        self.assertEqual(lifecycle[keep[0]]["manual_action"], "keep")
        self.assertIsNotNone(lifecycle[deleted[0]]["deleted_at"])
        self.assertEqual(self.store._active_count(), 1)

    def test_merge_with_settled_allocations_rolls_back_entire_batch(self):
        first, second = native("a", minutes=20, span=20), native("b", minutes=40, offset=20, span=40)
        self.put(first, second)
        with self.store.db:
            self.store.db.execute("INSERT INTO quest_allocations VALUES (?,?,?,?,?,?)",
                                  ("2026-06-01", "math", first[0], first[4], first[5], 20))
        before = self.all_records()
        revision = self.store.revision
        with self.assertRaisesRegex(ValueError, "委托"):
            self.import_rows([history("new", offset=180), history()], {"row-1": [first[0], second[0]]})
        self.assertEqual(self.all_records(), before)
        self.assertEqual(self.store.revision, revision)
        for table in ("history_rows", "history_links", "history_overrides", "history_batches", "record_merges"):
            self.assertEqual(self.store.db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0)

    def test_invalid_or_ambiguous_input_never_partially_imports(self):
        bad_values = [float("nan"), 0, True, "60"]
        for value in bad_values:
            with self.subTest(minutes=value), self.assertRaises(ValueError):
                self.import_rows([history(), history("bad", minutes=value)])
        with self.assertRaises(ValueError):
            self.import_rows([history(), history()])
        with self.assertRaises(ValueError):
            self.import_rows([history()], {"row-1": ["nonexistent"]})
        self.assertEqual(self.all_records(), [])
        self.put(native("a"), native("b", precision=100))
        with self.assertRaisesRegex(ValueError, "歧义"):
            self.import_rows([history()])
        self.assertEqual(len(self.all_records()), 2)

    def test_future_native_mirror_is_unique_and_keeps_effective_minutes(self):
        self.import_rows([history(minutes=45)])
        canonical = self.all_records()[0]["id"]
        mirror = native(source="calendar", minutes=60, precision=28_000)
        self.put(mirror)
        self.assertEqual(len(self.all_records()), 1)
        self.assertEqual((self.all_records()[0]["id"], self.all_records()[0]["minutes"]), (canonical, 45))
        self.assertEqual(self.put(mirror), 0)
        desktop = native("desktop", minutes=45, precision=15_000)
        self.put(desktop)
        self.assertEqual(len(self.all_records()), 1)
        self.assertEqual(self.put(mirror, desktop), 0)
        self.restart()
        self.assertEqual((len(self.all_records()), self.all_records()[0]["minutes"]), (1, 45))
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM record_aliases").fetchone()[0], 3)

    def test_wrong_duration_or_ambiguous_future_matches_are_left_separate(self):
        self.import_rows([history(minutes=45)])
        self.put(native(minutes=60, precision=12_000))
        self.assertEqual(len(self.all_records()), 2)
        self.put(native("c1", source="calendar", precision=30_000),
                 native("c2", source="calendar", precision=50_000))
        self.assertEqual(len(self.all_records()), 4)

    def test_new_mirror_with_conflicting_manual_action_is_not_merged(self):
        self.import_rows([history()])
        self.store.move_record(self.all_records()[0]["id"])
        incoming = native(precision=10_000)
        with self.store.db:
            self.store._upsert_record(incoming)
        self.store.move_record(incoming[0], restore=True)
        self.put(incoming)
        self.assertEqual(len(self.all_records()), 2)
        self.assertEqual(self.store._active_count(), 1)

    def test_live_echo_takes_over_history_deletion_tracking(self):
        self.import_rows([history()])
        self.put(native(precision=10_000))
        presence = self.store.db.execute("SELECT active FROM source_presence WHERE source='history_xlsx'").fetchone()[0]
        self.assertEqual(presence, 0)
        self.absent()
        self.assertEqual(self.store._active_count(), 0)
        self.assertEqual(self.store.trash()["records"][0]["deletionReason"], "source_missing")
        self.restart()
        self.assertEqual(self.store._active_count(), 0)
        self.import_rows([history()], batch="reexport")
        self.assertEqual(self.store._active_count(), 0)

    def test_both_live_sources_must_disappear_after_history_echo(self):
        self.import_rows([history()])
        self.put(native(precision=10_000))
        self.put(native("calendar", source="calendar", precision=20_000))
        self.absent()
        self.assertEqual(self.store._active_count(), 1)
        self.absent("calendar")
        self.assertEqual(self.store._active_count(), 0)

    def test_manual_keep_survives_live_deletion_after_history_echo(self):
        self.import_rows([history()])
        canonical = self.all_records()[0]["id"]
        self.store.move_record(canonical, restore=True)
        self.put(native(precision=10_000))
        self.absent()
        self.assertEqual(self.store._active_count(), 1)
        self.assertEqual(self.store.db.execute("SELECT manual_action FROM record_lifecycle").fetchone()[0], "keep")

    def test_desktop_calendar_merge_redirects_history_evidence_and_override(self):
        cal = native("calendar", source="calendar", minutes=60, precision=2_000)
        self.put(cal)
        self.import_rows([history(minutes=45)])
        desktop = native("desktop", minutes=44, precision=3_000)
        self.put(desktop)
        self.assertEqual(len(self.all_records()), 1)
        self.assertEqual(self.all_records()[0]["minutes"], 45)
        self.assertEqual(self.put(cal, desktop), 0)
        self.assertEqual(self.store.db.execute("SELECT record_id FROM history_links").fetchone()[0], cal[0])

    def test_two_connections_import_same_batch_once(self):
        other = server.FocusStore(self.data, self.source)
        barrier, results, errors = threading.Barrier(2), [], []
        def invoke(store):
            try:
                barrier.wait(timeout=5)
                results.append(store.import_history([history()], {}, "same", "same.xlsx", True))
            except BaseException as error:
                errors.append(error)
        threads = [threading.Thread(target=invoke, args=(store,)) for store in (self.store, other)]
        try:
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(10)
            self.assertEqual(errors, [])
            self.assertEqual(sorted(result["alreadyImported"] for result in results), [False, True])
            self.assertEqual(len(self.all_records()), 1)
            self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM history_batches").fetchone()[0], 1)
        finally:
            other.close()


if __name__ == "__main__":
    unittest.main()
