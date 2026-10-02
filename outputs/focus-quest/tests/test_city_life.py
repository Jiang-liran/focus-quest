"""Personal city notes and outfit collections must remain separate from study rewards."""
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

spec = importlib.util.spec_from_file_location("city_life_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 29, 23, 58, tzinfo=timezone(timedelta(hours=8)))
uid = lambda: str(uuid.uuid4())
CITY_TABLES = {"city_notes", "city_outfits", "city_life_requests"}


class CityLifeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = self.make_store()

    def make_store(self):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW):
            return server.FocusStore(self.root / "data", self.root / "source.json")

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def restart(self):
        self.store.close()
        self.store = self.make_store()

    def note(self, kind="note", text="窗外下着小雨", **extra):
        return self.store.city_life_note(dict(type=kind, text=text, requestId=uid(), **extra), NOW)

    def outfit(self, name="雨夜", equipped=None):
        return self.store.city_life_outfit({"name": name, "equipped": equipped or {"avatar": "avatar-default"}, "requestId": uid()}, NOW)

    def rows(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def snapshot(self, exclude=()):
        return {row[0]: self.rows(row[0]) for row in self.store.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") if row[0] not in exclude}

    def unlock(self, item_id):
        with self.store.db:
            self.store.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (item_id, int(NOW.timestamp()*1000)))

    def seed_notes(self, count, archived=False):
        stamp = int(NOW.timestamp()*1000)
        with self.store.db:
            self.store.db.executemany("INSERT INTO city_notes VALUES (?,'note','a',NULL,0,?,?,?)",
                                     [(uid(), int(archived), stamp, stamp) for _ in range(count)])

    def seed_outfits(self, count, archived=False):
        stamp = int(NOW.timestamp()*1000)
        with self.store.db:
            self.store.db.executemany("INSERT INTO city_outfits VALUES (?,'a',?, ?,?,?)",
                [(uid(), json.dumps({"avatar": "avatar-default"}), int(archived), stamp, stamp) for _ in range(count)])

    def test_notes_preserve_plain_text_without_touching_learning_or_wallet(self):
        before = self.snapshot(CITY_TABLES)
        text = '<img src=x onerror="alert(1)">\n晚安 & 再见'
        result = self.note(text=text)
        note = result["cityLife"]["notes"][0]
        self.assertEqual(note["text"], text)
        self.assertEqual(note["type"], "note")
        self.assertIsNone(note["day"])
        self.assertFalse(note["done"])
        self.assertFalse(note["archived"])
        self.assertEqual(result["cityLife"]["revision"], 1)
        self.assertEqual(before, self.snapshot(CITY_TABLES))
        self.assertNotIn("cityLife", self.store.state(now=NOW))

    def test_plan_defaults_to_tomorrow_and_keeps_original_date_on_late_retry(self):
        payload = {"type": "plan", "text": "先整理桌面", "requestId": uid()}
        first = self.store.city_life_note(payload, NOW)
        retry = self.store.city_life_note(dict(payload, requestId=payload["requestId"].upper()), NOW+timedelta(days=1))
        self.assertEqual(first["cityLife"]["notes"][0]["day"], "2026-09-30")
        self.assertEqual(retry["cityLife"], first["cityLife"])
        self.assertTrue(retry["receipt"]["alreadyApplied"])
        explicit = self.note("plan", day="2026-10-01")
        self.assertEqual(explicit["cityLife"]["notes"][0]["day"], "2026-10-01")

    def test_edit_done_archive_and_restore_survive_restart(self):
        item_id = self.note()["receipt"]["id"]
        payload = {"noteId": item_id, "type": "question", "text": "  明天再想一想  ", "done": True, "requestId": uid()}
        edited = self.store.city_life_note_update(payload, NOW+timedelta(minutes=1))
        self.assertEqual(edited["cityLife"]["notes"][0]["text"], "明天再想一想")
        self.assertTrue(edited["cityLife"]["notes"][0]["done"])
        archived = self.store.city_life_note_update({"noteId": item_id, "archived": True, "requestId": uid()}, NOW)
        self.assertEqual(len(archived["cityLife"]["notes"]), 1)
        self.assertTrue(archived["cityLife"]["notes"][0]["archived"])
        self.restart()
        self.assertEqual(self.store.city_life_state(), archived["cityLife"])
        restored = self.store.city_life_note_update({"noteId": item_id, "archived": False, "done": False, "requestId": uid()}, NOW)
        self.assertFalse(restored["cityLife"]["notes"][0]["archived"])
        self.assertFalse(restored["cityLife"]["notes"][0]["done"])
        self.assertEqual(restored["cityLife"]["notes"][0]["type"], "question")

    def test_edit_to_plan_supplies_date_and_other_notes_allow_optional_date(self):
        item_id = self.note(day="2026-09-25")["receipt"]["id"]
        result = self.store.city_life_note_update({"noteId": item_id, "type": "plan", "day": None, "requestId": uid()}, NOW)
        self.assertEqual(result["cityLife"]["notes"][0]["day"], "2026-09-30")

    def test_note_validators_reject_unknown_fields_bad_types_dates_and_controls(self):
        original = {"type": "note", "text": "abc", "requestId": uid()}
        invalid = [dict(original, type=value) for value in (None, True, [], "html", 1)]
        invalid += [dict(original, text=value) for value in (None, True, {}, "", "  ", "x"*1001, "x\0y", "\ud800")]
        invalid += [dict(original, day=value) for value in ("2026-02-30", "2026-9-01", "yesterday", True, {})]
        invalid += [dict(original, requestId=value) for value in (True, "abc", "{123}", None)]
        invalid += [dict(original, coins=100), dict(original, archived=True), {}, [], None]
        before = self.snapshot()
        for payload in invalid:
            with self.subTest(payload=repr(payload)), self.assertRaises(ValueError):
                self.store.city_life_note(payload, NOW)
        self.assertEqual(before, self.snapshot())
        result = self.note(text="雨"*1000)
        self.assertEqual(len(result["cityLife"]["notes"][0]["text"]), 1000)

    def test_note_update_validates_ids_boolean_and_nonempty_patch(self):
        item_id = self.note()["receipt"]["id"]
        original = {"noteId": item_id, "requestId": uid()}
        for payload in (original, dict(original, noteId=[]), dict(original, noteId=uid(), done=True),
                        dict(original, done=1), dict(original, archived="false"), dict(original, minute=5),
                        dict(original, text=""), dict(original, day=3)):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.store.city_life_note_update(payload, NOW)

    def test_all_mutations_use_idempotency_and_cannot_reuse_id_with_changed_payload(self):
        payload = {"type": "quote", "text": "仍有灯火", "requestId": uid()}
        first = self.store.city_life_note(payload, NOW)
        self.restart()
        self.assertTrue(self.store.city_life_note(payload, NOW)["receipt"]["alreadyApplied"])
        with self.assertRaises(ValueError):
            self.store.city_life_note(dict(payload, text="另一句"), NOW)
        with self.assertRaises(ValueError):
            self.store.city_life_note_update({"noteId": first["receipt"]["id"], "done": True, "requestId": payload["requestId"]}, NOW)
        update = {"noteId": first["receipt"]["id"], "done": True, "requestId": uid()}
        self.store.city_life_note_update(update, NOW)
        self.assertTrue(self.store.city_life_note_update(update, NOW)["receipt"]["alreadyApplied"])
        self.assertEqual(len(self.rows("city_life_requests")), 2)

    def test_note_capacity_archiving_frees_active_slot_and_reopen_honors_limit(self):
        self.seed_notes(200)
        with self.assertRaisesRegex(ValueError, "200"):
            self.note()
        item_id = self.rows("city_notes")[0][0]
        self.store.city_life_note_update({"noteId": item_id, "archived": True, "requestId": uid()}, NOW)
        self.note()
        with self.assertRaisesRegex(ValueError, "200"):
            self.store.city_life_note_update({"noteId": item_id, "archived": False, "requestId": uid()}, NOW)
        self.assertEqual(len(self.store.city_life_state()["notes"]), 201)

    def test_stored_note_limit_preserves_archive_and_allows_existing_edits(self):
        self.seed_notes(1000, archived=True)
        with self.assertRaisesRegex(ValueError, "1000"):
            self.note()
        item_id = self.rows("city_notes")[0][0]
        result = self.store.city_life_note_update({"noteId": item_id, "text": "仍可编辑", "archived": False, "requestId": uid()}, NOW)
        self.assertEqual(len(result["cityLife"]["notes"]), 1000)
        self.assertTrue(any(note["text"] == "仍可编辑" and not note["archived"] for note in result["cityLife"]["notes"]))

    def test_note_write_error_rolls_back_note_and_request_and_retry_can_succeed(self):
        self.store.db.execute("CREATE TRIGGER fail_city_request BEFORE INSERT ON city_life_requests BEGIN SELECT RAISE(ABORT,'test'); END")
        payload = {"type": "note", "text": "保存", "requestId": uid()}
        with self.assertRaises(sqlite3.Error):
            self.store.city_life_note(payload, NOW)
        self.assertEqual(self.rows("city_notes"), [])
        self.assertEqual(self.rows("city_life_requests"), [])
        self.store.db.execute("DROP TRIGGER fail_city_request")
        self.assertFalse(self.store.city_life_note(payload, NOW)["receipt"]["alreadyApplied"])

    def test_concurrent_note_retry_creates_only_one_record_across_connections(self):
        other = self.make_store()
        payload = {"type": "note", "text": "只留一份", "requestId": uid()}
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda store: store.city_life_note(payload, NOW), [self.store, other]))
            self.assertEqual(len(self.rows("city_notes")), 1)
            self.assertEqual(sorted(result["receipt"]["alreadyApplied"] for result in results), [False, True])
        finally:
            other.close()

    def test_outfit_can_save_every_owned_slot_and_apply_atomically_without_currency(self):
        equipped = {row[0]: row[1] for row in self.store.db.execute("SELECT slot,item_id FROM shop_equipment")}
        self.unlock("bar-mint")
        self.unlock("avatar-ranger")
        equipped.update(bar="bar-mint", avatar="avatar-ranger")
        # Complete lazy play-ticket initialization before checking side effects.
        self.store.lottery_state(NOW)
        before = self.snapshot(CITY_TABLES | {"shop_equipment"})
        result = self.outfit(equipped=equipped)
        item_id = result["receipt"]["id"]
        self.assertEqual(result["cityLife"]["outfits"][0]["equipped"], equipped)
        payload = {"outfitId": item_id, "requestId": uid()}
        applied = self.store.city_life_outfit_apply(payload, NOW)
        self.assertEqual(applied["quests"]["equipped"], equipped)
        self.assertEqual(self.snapshot(CITY_TABLES | {"shop_equipment"}), before)
        self.assertEqual(applied["quests"]["wallet"], {"coins": 0, "diamonds": 0})
        self.restart()
        self.assertTrue(self.store.city_life_outfit_apply(payload, NOW)["receipt"]["alreadyApplied"])

    def test_outfit_partial_collection_keeps_unspecified_slots_and_retry_does_not_revert(self):
        self.unlock("bar-mint")
        item_id = self.outfit(equipped={"bar": "bar-mint"})["receipt"]["id"]
        payload = {"outfitId": item_id, "requestId": uid()}
        first = self.store.city_life_outfit_apply(payload, NOW)
        self.assertEqual(first["quests"]["equipped"]["avatar"], "avatar-default")
        self.store.equip_item("bar-default", NOW)
        retry = self.store.city_life_outfit_apply(payload, NOW)
        self.assertEqual(retry["quests"]["equipped"]["bar"], "bar-default")
        self.assertTrue(retry["receipt"]["alreadyApplied"])

    def test_outfit_validates_names_slots_ids_and_ownership_without_side_effects(self):
        before = self.snapshot()
        for equipped in ({}, [], None, {"npc": "npc-default"}, {"bar": "avatar-default"},
                         {"avatar": "avatar-ranger"}, {"avatar": []}, {"bar": "not-real"},
                         {"wallet": "bar-default"}):
            with self.subTest(equipped=equipped), self.assertRaises(ValueError):
                self.store.city_life_outfit({"name": "雨夜", "equipped": equipped, "requestId": uid()}, NOW)
        for name in (None, True, [], "", "   ", "a"*31, "a\0"):
            with self.subTest(name=repr(name)), self.assertRaises(ValueError):
                self.outfit(name=name)
        self.assertEqual(before, self.snapshot())

    def test_apply_rechecks_ownership_after_save_and_never_partially_equips(self):
        self.unlock("bar-mint")
        self.unlock("avatar-ranger")
        item_id = self.outfit(equipped={"bar": "bar-mint", "avatar": "avatar-ranger"})["receipt"]["id"]
        with self.store.db:
            self.store.db.execute("DELETE FROM shop_purchases WHERE item_id='avatar-ranger'")
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "拥有"):
            self.store.city_life_outfit_apply({"outfitId": item_id, "requestId": uid()}, NOW)
        self.assertEqual(before, self.snapshot())

    def test_outfit_capacity_archive_reopen_and_soft_preservation(self):
        self.seed_outfits(8)
        with self.assertRaisesRegex(ValueError, "8"):
            self.outfit()
        item_id = self.rows("city_outfits")[0][0]
        archived = self.store.city_life_outfit_archive({"outfitId": item_id, "archived": True, "requestId": uid()}, NOW)
        self.assertEqual(len(archived["cityLife"]["outfits"]), 8)
        with self.assertRaises(ValueError):
            self.store.city_life_outfit_apply({"outfitId": item_id, "requestId": uid()}, NOW)
        self.outfit()
        with self.assertRaisesRegex(ValueError, "8"):
            self.store.city_life_outfit_archive({"outfitId": item_id, "archived": False, "requestId": uid()}, NOW)

    def test_outfit_stored_limit_and_archive_idempotency(self):
        self.seed_outfits(64, archived=True)
        with self.assertRaisesRegex(ValueError, "64"):
            self.outfit()
        item_id = self.rows("city_outfits")[0][0]
        payload = {"outfitId": item_id, "archived": False, "requestId": uid()}
        self.store.city_life_outfit_archive(payload, NOW)
        self.assertTrue(self.store.city_life_outfit_archive(payload, NOW)["receipt"]["alreadyApplied"])
        self.assertEqual(len(self.store.city_life_state()["outfits"]), 64)

    def test_outfit_request_failure_rolls_back_all_equipment_and_request(self):
        self.unlock("bar-mint")
        self.unlock("avatar-ranger")
        item_id = self.outfit(equipped={"bar": "bar-mint", "avatar": "avatar-ranger"})["receipt"]["id"]
        self.store.db.execute("CREATE TRIGGER fail_city_request BEFORE INSERT ON city_life_requests BEGIN SELECT RAISE(ABORT,'test'); END")
        before = self.snapshot()
        with self.assertRaises(sqlite3.Error):
            self.store.city_life_outfit_apply({"outfitId": item_id, "requestId": uid()}, NOW)
        self.assertEqual(before, self.snapshot())

    def test_upgrade_creates_only_empty_city_tables_and_does_not_change_existing_data(self):
        before = self.snapshot(CITY_TABLES)
        with self.store.db:
            for table in CITY_TABLES:
                self.store.db.execute(f"DROP TABLE {table}")
        self.restart()
        self.assertEqual(before, self.snapshot(CITY_TABLES))
        self.assertEqual(self.store.city_life_state()["notes"], [])
        self.assertEqual(self.store.city_life_state()["outfits"], [])


class CityLifeAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.FocusStore(Path(self.temp.name)/"data", Path(self.temp.name)/"source")
        self.http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.store.close()
        self.temp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.http.server_address[1], timeout=3)
        body = None if payload is None else json.dumps(payload)
        connection.request(method, path, body=body, headers=headers or {"Content-Type": "application/json"})
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_city_endpoints_follow_schema_and_reject_queries_extra_fields_and_cross_origin(self):
        status, body = self.request("GET", "/api/city-life")
        self.assertEqual(status, 200)
        self.assertEqual(body["limits"]["outfits"], 8)
        note_payload = {"type": "plan", "text": "准备明天的书", "requestId": uid()}
        status, result = self.request("POST", "/api/city-life/note", note_payload)
        self.assertEqual(status, 200)
        item_id = result["receipt"]["id"]
        status, result = self.request("POST", "/api/city-life/note-update", {"noteId": item_id, "done": True, "requestId": uid()})
        self.assertEqual(status, 200)
        self.assertTrue(result["cityLife"]["notes"][0]["done"])
        self.assertEqual(self.request("GET", "/api/city-life?limit=2")[0], 400)
        self.assertEqual(self.request("POST", "/api/city-life/note?x=1", note_payload)[0], 400)
        self.assertEqual(self.request("POST", "/api/city-life/note", dict(note_payload, coins=100))[0], 400)
        self.assertEqual(self.request("POST", "/api/city-life/note", note_payload,
            {"Content-Type": "application/json", "Origin": "https://elsewhere.invalid"})[0], 403)
        self.assertEqual(self.request("POST", "/api/city-life/note", note_payload, {"Content-Type": "text/plain"})[0], 415)

    def test_outfit_routes_preserve_wallet_and_handle_missing_id(self):
        payload = {"name": "夜色", "equipped": {"avatar": "avatar-default"}, "requestId": uid()}
        status, result = self.request("POST", "/api/city-life/outfit", payload)
        self.assertEqual(status, 200)
        item_id = result["receipt"]["id"]
        status, result = self.request("POST", "/api/city-life/outfit-apply", {"outfitId": item_id, "requestId": uid()})
        self.assertEqual(status, 200)
        self.assertEqual(result["quests"]["wallet"], {"coins": 0, "diamonds": 0})
        status, result = self.request("POST", "/api/city-life/outfit-archive", {"outfitId": item_id, "archived": True, "requestId": uid()})
        self.assertEqual(status, 200)
        self.assertTrue(result["cityLife"]["outfits"][0]["archived"])
        self.assertEqual(self.request("POST", "/api/city-life/outfit-apply", {"outfitId": uid(), "requestId": uid()})[0], 400)
        self.assertEqual(self.request("POST", "/api/city-life/outfit-archive", {"outfitId": item_id, "archived": 1, "requestId": uid()})[0], 400)


if __name__ == "__main__":
    unittest.main()
