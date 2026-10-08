"""Campfire cosmetics extend the existing shop without changing saved progress."""
import importlib.util
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("campfire_shop_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 24, 18, tzinfo=timezone(timedelta(hours=8)))
EXPECTED = {
    "camp": [("default", 0, 0), ("pine", 0, 18), ("lake", 0, 28), ("snow", 0, 40), ("aurora", 0, 54)],
    "fire": [("default", 0, 0), ("copper", 180, 0), ("lantern", 300, 0), ("blue", 0, 12), ("star", 0, 18)],
    "tent": [("default", 0, 0), ("patchwork", 180, 0), ("ranger", 300, 0), ("canopy", 420, 0), ("observatory", 0, 16)],
    "campgear": [("default", 0, 0), ("tea", 120, 0), ("books", 240, 0), ("picnic", 360, 0), ("music", 0, 12)],
    "campglow": [("default", 0, 0), ("fireflies", 180, 0), ("petals", 300, 0), ("snow", 0, 12), ("stardust", 0, 18)],
    "chatframe": [("default", 0, 0), ("linen", 120, 0), ("wood", 240, 0), ("parchment", 360, 0), ("constellation", 0, 12)],
    "camptrail": [("default", 0, 0), ("stone", 240, 0), ("stars", 0, 10)],
    "campmark": [("default", 0, 0), ("chimes", 360, 0), ("moon", 0, 18)],
}
CATEGORIES = {"camp": "营地地貌", "fire": "篝火样式", "tent": "歇脚帐篷", "campgear": "营地陈设",
              "campglow": "营地氛围", "chatframe": "对话外观", "camptrail": "营地小径", "campmark": "营地地标"}


def sku(slot, variant):
    return f"{'trail' if slot == 'camptrail' else slot}-{variant}"


class CampfireShopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.source = Path(self.temp.name) / "unused-source.json"
        self.store = server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)

    def fund(self, coins=0, diamonds=0):
        with self.store.db:
            count = self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger").fetchone()[0]
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                  (f"fixture:{count}", coins, diamonds, int(NOW.timestamp() * 1000)))

    def snapshot(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def test_expanded_catalog_has_unique_ids_and_preserves_legacy_camp_prices(self):
        state = self.store.quest_state(NOW)
        count = 130+len(server.shop_expansion.SHOP_CATALOG_EXTRA)
        self.assertEqual(len(server.SHOP_CATALOG), count)
        self.assertEqual(len(server.SHOP_ITEMS), count)
        self.assertEqual(len(state["catalog"]), count)
        self.assertEqual(len(state["equipped"]), 24)
        self.assertEqual(sum(item["currency"] == "free" for item in state["catalog"]), 28)
        self.assertEqual(sum(item["currency"] != "free" for item in state["catalog"]), count-28)
        self.assertEqual(len({item["id"] for item in state["catalog"]}), count)
        expected_ids = {sku(slot, variant) for slot, variants in EXPECTED.items() for variant, _, _ in variants}
        new_catalog = {item["id"]: item for item in state["catalog"] if item["id"] in expected_ids}
        self.assertEqual(set(new_catalog), expected_ids)
        for item in state["catalog"]:
            self.assertFalse(item["coins"] > 0 and item["diamonds"] > 0)
            self.assertEqual(item["currency"], "coins" if item["coins"] else "diamonds" if item["diamonds"] else "free")
        for slot, variants in EXPECTED.items():
            self.assertEqual(state["equipped"][slot], sku(slot, "default"))
            for variant, coins, diamonds in variants:
                with self.subTest(slot=slot, variant=variant):
                    item = new_catalog[sku(slot, variant)]
                    self.assertEqual((item["coins"], item["diamonds"]), (coins, diamonds))
                    self.assertEqual(item["category"], CATEGORIES[slot])
                    self.assertTrue(item["name"] and item["description"])
                    self.assertEqual(item["owned"], variant == "default")
                    self.assertEqual(item["equipped"], variant == "default")
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})
        self.assertEqual(self.snapshot("shop_purchases"), [])
        self.assertEqual(self.snapshot("wallet_ledger"), [])

    def test_all_28_paid_items_debit_once_equip_independently_and_survive_restart(self):
        legacy_ids = {sku(slot, variant) for slot, variants in EXPECTED.items() for variant, _, _ in variants}
        items = [item for item in self.store.quest_state(NOW)["catalog"] if item["id"] in legacy_ids and item["currency"] != "free"]
        self.assertEqual(len(items), 28)
        total_coins = sum(item["coins"] for item in items)
        total_diamonds = sum(item["diamonds"] for item in items)
        self.fund(total_coins + 19, total_diamonds + 5)
        wallet = {"coins": total_coins + 19, "diamonds": total_diamonds + 5}
        equipped = dict(self.store.quest_state(NOW)["equipped"])
        for item in items:
            with self.subTest(item=item["id"]):
                result = self.store.buy_item(item["id"], NOW)
                wallet["coins"] -= item["coins"]
                wallet["diamonds"] -= item["diamonds"]
                self.assertEqual(result["wallet"], wallet)
                self.assertEqual(result["equipped"], equipped)
                self.assertFalse(result["receipt"]["alreadyOwned"])
                again = self.store.buy_item(item["id"], NOW)
                self.assertTrue(again["receipt"]["alreadyOwned"])
                self.assertEqual((again["receipt"]["coins"], again["receipt"]["diamonds"]), (0, 0))
                self.assertEqual(again["wallet"], wallet)
                equipped[item["slot"]] = item["id"]
                result = self.store.equip_item(item["id"], NOW)
                self.assertEqual(result["equipped"], equipped)
                self.assertEqual(result["wallet"], wallet)
        self.assertEqual(wallet, {"coins": 19, "diamonds": 5})
        self.assertEqual(len(self.snapshot("shop_purchases")), 28)
        self.assertEqual(tuple(self.store.db.execute("""SELECT COUNT(*),-SUM(coins),-SUM(diamonds)
            FROM wallet_ledger WHERE reference LIKE 'purchase:%'""").fetchone()), (28, total_coins, total_diamonds))
        self.restart()
        result = self.store.quest_state(NOW)
        self.assertEqual(result["wallet"], wallet)
        self.assertEqual(result["equipped"], equipped)
        self.assertTrue(all(item["owned"] for item in result["catalog"] if item["id"] in legacy_ids))

    def test_free_defaults_restore_each_slot_without_spending(self):
        self.fund(5000, 500)
        for slot, variants in EXPECTED.items():
            product_id = sku(slot, variants[-1][0])
            self.store.buy_item(product_id, NOW)
            self.store.equip_item(product_id, NOW)
        ledger, wallet = self.snapshot("wallet_ledger"), self.store._wallet()
        equipped = dict(self.store.quest_state(NOW)["equipped"])
        for slot in EXPECTED:
            product_id = sku(slot, "default")
            self.assertTrue(self.store.buy_item(product_id, NOW)["receipt"]["alreadyOwned"])
            equipped[slot] = product_id
            result = self.store.equip_item(product_id, NOW)
            self.assertEqual(result["equipped"], equipped)
            self.assertEqual(result["wallet"], wallet)
        self.restart()
        self.assertEqual(self.snapshot("wallet_ledger"), ledger)
        self.assertEqual(self.store.quest_state(NOW)["equipped"], equipped)

    def test_insufficient_funds_and_unowned_equipment_never_mutate(self):
        initial = self.store.quest_state(NOW)["equipped"]
        for item in self.store.quest_state(NOW)["catalog"]:
            if item["slot"] not in EXPECTED or item["currency"] == "free":
                continue
            with self.subTest(item=item["id"]):
                with self.assertRaises(ValueError):
                    self.store.buy_item(item["id"], NOW)
                with self.assertRaises(ValueError):
                    self.store.equip_item(item["id"], NOW)
        self.assertEqual(self.snapshot("wallet_ledger"), [])
        self.assertEqual(self.snapshot("shop_purchases"), [])
        self.assertEqual(self.store.quest_state(NOW)["equipped"], initial)
        self.fund(diamonds=500)
        with self.assertRaises(ValueError):
            self.store.buy_item("fire-copper", NOW)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 500})

    def test_upgrade_adds_eight_defaults_without_changing_legacy_equipment_or_progress(self):
        self.fund(1000, 100)
        self.store.buy_item("bar-aurora", NOW)
        self.store.equip_item("bar-aurora", NOW)
        self.store.buy_item("theme-forest", NOW)
        self.store.equip_item("theme-forest", NOW)
        self.store.accept_quest("math", NOW)
        self.store.update_settings({"targets": {"math": 200}, "sound": False})
        with self.store.db:
            for slot in EXPECTED:
                self.store.db.execute("DELETE FROM shop_equipment WHERE slot=?", (slot,))
        self.assertEqual(len(self.snapshot("shop_equipment")), 16)
        tables = ("wallet_ledger", "shop_purchases", "quest_tracks", "quest_deliveries", "quest_allocations", "records", "meta")
        before = {table: self.snapshot(table) for table in tables}
        legacy_equipment = dict(self.store.quest_state(NOW)["equipped"])
        self.restart()
        result = self.store.quest_state(NOW)
        self.assertEqual(len(result["equipped"]), 24)
        for slot, item_id in legacy_equipment.items():
            self.assertEqual(result["equipped"][slot], item_id)
        for slot in EXPECTED:
            self.assertEqual(result["equipped"][slot], sku(slot, "default"))
        for table in tables:
            self.assertEqual(self.snapshot(table), before[table], table)
        self.restart()
        self.assertEqual(self.store.quest_state(NOW)["equipped"], result["equipped"])
        self.assertEqual(self.store._wallet(), {"coins": 760, "diamonds": 76})
        self.assertEqual(self.store.settings["targets"]["math"], 200)

    def test_upgrade_adds_only_two_new_defaults_and_preserves_existing_camp_loadout(self):
        self.fund(1000, 100)
        for product in ("camp-lake", "fire-copper", "island-garden"):
            self.store.buy_item(product, NOW)
            self.store.equip_item(product, NOW)
        with self.store.db:
            self.store.db.execute("DELETE FROM shop_equipment WHERE slot IN ('camptrail','campmark')")
        before_equipment = self.store.quest_state(NOW)["equipped"]
        before = {table: self.snapshot(table) for table in ("wallet_ledger", "shop_purchases", "records", "quest_tracks", "meta")}
        self.restart()
        expected = {**before_equipment, "camptrail": "trail-default", "campmark": "campmark-default"}
        self.assertEqual(self.store.quest_state(NOW)["equipped"], expected)
        for table, rows in before.items():
            self.assertEqual(self.snapshot(table), rows, table)
        self.restart()
        self.assertEqual(self.store.quest_state(NOW)["equipped"], expected)
        self.assertEqual(self.store._wallet(), {"coins": 400, "diamonds": 72})

    def test_camp_items_do_not_reenter_legacy_price_refund_migration(self):
        self.fund(300, 30)
        self.store.buy_item("fire-lantern", NOW)
        self.store.buy_item("camp-lake", NOW)
        before = self.snapshot("wallet_ledger")
        self.restart()
        self.restart()
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 2})
        self.assertEqual(self.snapshot("wallet_ledger"), before)

    def test_concurrent_repeat_purchase_debits_one_receipt(self):
        self.fund(180)
        other = server.FocusStore(self.data, self.source)
        self.addCleanup(other.close)
        barrier = threading.Barrier(2)
        def buy(store):
            barrier.wait(timeout=3)
            return store.buy_item("fire-copper", NOW)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(buy, (self.store, other)))
        self.assertEqual(sorted(item["receipt"]["alreadyOwned"] for item in results), [False, True])
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})
        self.assertEqual(len(self.snapshot("shop_purchases")), 1)
        self.assertEqual(self.store.quest_state(NOW)["equipped"]["fire"], "fire-default")

    def test_music_item_is_described_as_silent_scenery(self):
        item = server.SHOP_ITEMS["campgear-music"]
        self.assertIn("陈设", item["description"])
        self.assertNotRegex(item["description"], "播放|音效|伴奏|背景音乐|奏响")


if __name__ == "__main__":
    unittest.main()
