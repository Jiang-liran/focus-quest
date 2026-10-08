"""Independent interface themes preserve purchases, scenes and existing archives."""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("interface_shop_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 27, 15, tzinfo=timezone(timedelta(hours=8)))
PRICES = (("interface-default", 0, 0), ("interface-forest", 1200, 0),
          ("interface-tide", 1800, 0), ("interface-amber", 0, 24),
          ("interface-paper", 0, 32), ("interface-rain", 690, 0),
          ("interface-ember", 480, 0), ("interface-ink", 860, 0),
          ("interface-garden", 0, 18), ("interface-observatory", 0, 24),
          ("interface-neon", 0, 36))
NEW_IDS = {item[0] for item in PRICES[5:]}


class InterfaceShopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.data = self.root / "data"
        self.source = self.root / "source.json"
        self.store = server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)

    def fund(self, coins, diamonds):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,0)", ("fixture:" + str(uuid.uuid4()), coins, diamonds))

    def rows(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def snapshot(self):
        tables = [row[0] for row in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        return {table: self.rows(table) for table in tables}

    def test_catalog_separates_interface_from_island_environment_and_currency(self):
        state = self.store.quest_state(NOW)
        themes = [item for item in state["catalog"] if item["slot"] == "interface"]
        self.assertEqual([(item["id"], item["coins"], item["diamonds"]) for item in themes], list(PRICES))
        self.assertEqual(server.SHOP_CATEGORIES["interface"], "界面主题")
        self.assertEqual(server.SHOP_CATEGORIES["theme"], "星岛环境")
        self.assertEqual(state["equipped"]["interface"], "interface-default")
        self.assertEqual(state["equipped"]["theme"], "theme-default")
        self.assertEqual([item["id"] for item in themes if item["owned"]], ["interface-default"])
        self.assertEqual([item["currency"] for item in themes],
                         ["free" if not coins and not diamonds else "coins" if coins else "diamonds"
                          for _, coins, diamonds in PRICES])
        self.assertTrue(all(not (item["coins"] and item["diamonds"]) for item in state["catalog"]))
        self.assertEqual((len(state["catalog"]), len(state["equipped"])), (130+len(server.shop_expansion.SHOP_CATALOG_EXTRA), 24))
        self.assertEqual(self.rows("shop_purchases"), [])
        self.assertEqual(self.rows("wallet_ledger"), [])

    def test_unowned_or_unaffordable_theme_cannot_mutate_archive(self):
        initial = self.snapshot()
        for item_id, _, _ in PRICES[1:]:
            with self.subTest(item=item_id):
                with self.assertRaises(ValueError):
                    self.store.equip_item(item_id, NOW)
                with self.assertRaises(ValueError):
                    self.store.buy_item(item_id, NOW)
                self.assertEqual(self.snapshot(), initial)
        self.fund(10000, 0)
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.store.buy_item("interface-paper", NOW)
        self.assertEqual(self.snapshot(), before)

    def test_each_theme_purchases_once_and_changes_only_its_slot_across_restart(self):
        self.fund(10000, 1000)
        old_loadout = ("bar-comet", "fx-meteor", "avatar-royal", "banner-sovereign",
                       "theme-ocean", "companion-dragon", "relic-hourglass", "portal-cosmos",
                       "island-palace", "trail-stars", "campmark-moon", "camp-lake", "fire-star",
                       "tent-observatory", "campgear-music", "campglow-stardust", "chatframe-constellation")
        for item_id in old_loadout:
            self.store.buy_item(item_id, NOW)
            self.store.equip_item(item_id, NOW)
        previous = self.store.quest_state(NOW)
        untouched = {key: value for key, value in previous["equipped"].items() if key != "interface"}
        wallet = dict(previous["wallet"])
        previous_theme = "interface-default"
        for item_id, coins, diamonds in PRICES[1:]:
            with self.subTest(item=item_id):
                wallet["coins"] -= coins
                wallet["diamonds"] -= diamonds
                purchase = self.store.buy_item(item_id, NOW)
                self.assertFalse(purchase["receipt"]["alreadyOwned"])
                self.assertEqual(purchase["wallet"], wallet)
                self.assertEqual(purchase["equipped"], {**untouched, "interface": previous_theme})
                repeat = self.store.buy_item(item_id, NOW)
                self.assertTrue(repeat["receipt"]["alreadyOwned"])
                self.assertEqual(repeat["wallet"], wallet)
                result = self.store.equip_item(item_id, NOW)
                self.assertEqual(result["equipped"], {**untouched, "interface": item_id})
                self.restart()
                state = self.store.quest_state(NOW)
                self.assertEqual(state["equipped"], result["equipped"])
                self.assertEqual(state["wallet"], wallet)
                self.assertTrue(all(item["owned"] for item in state["catalog"] if item["id"] in old_loadout))
                previous_theme = item_id
        ledger = self.rows("wallet_ledger")
        self.assertTrue(self.store.buy_item("interface-default", NOW)["receipt"]["alreadyOwned"])
        self.assertEqual(self.store.equip_item("interface-default", NOW)["equipped"], {**untouched, "interface": "interface-default"})
        self.restart()
        self.assertEqual(self.rows("wallet_ledger"), ledger)
        self.assertEqual(self.store.quest_state(NOW)["wallet"], wallet)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM shop_purchases WHERE item_id LIKE 'interface-%'").fetchone()[0], len(PRICES)-1)

    def test_catalog_upgrade_preserves_existing_theme_and_decorations_without_granting_new_ones(self):
        previous_items = {key: item for key, item in server.SHOP_ITEMS.items() if key not in NEW_IDS}
        with patch.dict(server.SHOP_ITEMS, previous_items, clear=True):
            self.restart()
            self.fund(5000, 100)
            for item_id in ("interface-paper", "theme-forest", "island-library", "fire-blue", "bar-aurora"):
                self.store.buy_item(item_id, NOW)
                self.store.equip_item(item_id, NOW)
            before = self.snapshot()
            equipment = self.store.quest_state(NOW)["equipped"]
            wallet = self.store._wallet()
        for _ in range(3):
            self.restart()
            state = self.store.quest_state(NOW)
            self.assertEqual(self.snapshot(), before)
            self.assertEqual(state["equipped"], equipment)
            self.assertEqual(state["wallet"], wallet)
            self.assertFalse(any(item["owned"] for item in state["catalog"] if item["id"] in NEW_IDS))

    def test_new_themes_join_correct_unowned_lottery_pools_and_leave_after_purchase(self):
        pools = self.store._lottery_pools()
        for item_id, coins, _ in PRICES[5:]:
            pool = "coinItem" if coins else "diamondItem"
            self.assertIn(item_id, {item["id"] for item in pools[pool]})
        self.fund(10000, 100)
        for item_id in NEW_IDS:
            self.store.buy_item(item_id, NOW)
        owned_pools = self.store._lottery_pools()
        self.assertFalse(NEW_IDS & {item["id"] for item in owned_pools["coinItem"]+owned_pools["diamondItem"]})
        self.assertEqual(self.store.quest_state(NOW)["equipped"]["interface"], "interface-default")

    def test_upgrade_adds_one_free_equipment_row_preserving_every_other_table(self):
        legacy = {key: item for key, item in server.SHOP_ITEMS.items() if item["slot"] != "interface"}
        self.assertEqual(len(legacy), len(server.SHOP_ITEMS) - len(PRICES))
        with self.store.db:
            self.store.db.execute("DELETE FROM shop_equipment WHERE slot='interface'")
        with patch.dict(server.SHOP_ITEMS, legacy, clear=True):
            self.restart()
            self.fund(5000, 100)
            for item_id in ("theme-forest", "island-library", "fire-blue", "bar-aurora"):
                self.store.buy_item(item_id, NOW)
                self.store.equip_item(item_id, NOW)
            self.store.accept_quest("math", NOW - timedelta(hours=2))
            self.source.write_text(json.dumps({"PCRecord": [{"id": 7, "name": "复习数学", "time": 60,
                "startDate": int((NOW-timedelta(hours=1)).timestamp()*1000), "createDate": int(NOW.timestamp()*1000),
                "isComplete": 1, "i6": 0, "s4": ""}]}), encoding="utf-8")
            self.store.import_source()
            self.store.submit_quest("math", NOW)
            self.store.start_arcade("mines-beginner", str(uuid.uuid4()), NOW)
            self.store.update_settings({"targets": {"math": 200}, "sound": False})
            before = self.snapshot()
            wallet = self.store.quest_state(NOW)["wallet"]
        for _ in range(3):
            self.restart()
            after = self.snapshot()
            self.assertEqual(set(before), set(after))
            for table, rows in before.items():
                self.assertEqual(after[table], rows + [("interface", "interface-default")] if table == "shop_equipment" else rows, table)
            state = self.store.quest_state(NOW)
            self.assertEqual(state["wallet"], wallet)
            self.assertEqual([item["id"] for item in state["catalog"] if item["slot"] == "interface" and item["owned"]], ["interface-default"])
            self.assertEqual(self.store.settings["targets"]["math"], 200)

    def test_purchase_is_atomic_when_wallet_ledger_write_fails(self):
        self.fund(5000, 100)
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_interface BEFORE INSERT ON wallet_ledger
                WHEN NEW.reference LIKE 'purchase:interface-%' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        before = self.snapshot()
        for item_id, _, _ in PRICES[1:]:
            with self.subTest(item=item_id), self.assertRaises(sqlite3.IntegrityError):
                self.store.buy_item(item_id, NOW)
            self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
