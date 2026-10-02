"""Homepage-only purchases preserve legacy equipment and never decorate for free."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("island_shop_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


PRICES = (
    ("island-default", 0, 0), ("island-lanterns", 240, 0),
    ("island-garden", 420, 0), ("island-pavilion", 0, 10),
    ("island-supplies", 160, 0), ("island-banners", 640, 0),
    ("island-fountain", 0, 14), ("island-library", 0, 20),
    ("island-observatory", 0, 28), ("island-arcade", 0, 38),
    ("island-palace", 0, 52),
)
NEW_IDS = {item[0] for item in PRICES[4:]}


class IslandShopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = server.FocusStore(self.root / "data", self.root / "unused.json")

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.root / "unused.json")

    def fund(self, coins, diamonds):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES ('island-fixture',?,?,0)", (coins, diamonds))

    def test_catalog_prices_empty_default_and_no_free_unlocks(self):
        state = self.store.quest_state()
        self.assertEqual((len(state["catalog"]), len(state["equipped"])), (104+len(server.shop_expansion.SHOP_CATALOG_EXTRA), 18))
        items = [item for item in state["catalog"] if item["slot"] == "island"]
        legacy_ids = {item[0] for item in PRICES}
        self.assertEqual([(item["id"], item["coins"], item["diamonds"]) for item in items if item["id"] in legacy_ids], list(PRICES))
        self.assertEqual(sum(item["currency"] != "free" for item in state["catalog"]), len(state["catalog"])-18)
        self.assertTrue(all(item["category"] == "主岛布置" for item in items))
        self.assertTrue(all(not (item["coins"] and item["diamonds"]) for item in items))
        self.assertEqual(state["equipped"]["island"], "island-default")
        self.assertEqual([item["id"] for item in items if item["owned"]], ["island-default"])
        self.assertEqual(state["wallet"], {"coins": 0, "diamonds": 0})
        for item in items[1:]:
            with self.assertRaises(ValueError):
                self.store.buy_item(item["id"])
            with self.assertRaises(ValueError):
                self.store.equip_item(item["id"])
        self.assertEqual(self.store.quest_state()["wallet"], state["wallet"])

    def test_save_missing_island_slot_gains_only_free_default_and_preserves_everything(self):
        self.fund(540, 12)
        self.store.buy_item("bar-mint")
        self.store.equip_item("bar-mint")
        self.store.accept_quest("math")
        with self.store.db:
            self.store.db.execute("DELETE FROM shop_equipment WHERE slot='island'")
        before = self.store.quest_state()
        ledger = [tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger ORDER BY rowid")]
        tracks = [tuple(row) for row in self.store.db.execute("SELECT * FROM quest_tracks")]
        self.restart()
        after = self.store.quest_state()
        self.assertEqual(after["equipped"], dict(before["equipped"], island="island-default"))
        self.assertEqual(after["wallet"], before["wallet"])
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger ORDER BY rowid")], ledger)
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM quest_tracks")], tracks)
        self.restart()
        self.assertEqual(self.store.quest_state()["wallet"], before["wallet"])

    def test_all_ten_sets_purchase_once_replace_the_slot_and_restore_free_default(self):
        total_coins = sum(item[1] for item in PRICES)
        total_diamonds = sum(item[2] for item in PRICES)
        self.fund(total_coins + 17, total_diamonds + 3)
        untouched = {slot: value for slot, value in self.store.quest_state()["equipped"].items() if slot != "island"}
        wallet = {"coins": total_coins + 17, "diamonds": total_diamonds + 3}
        previous = "island-default"
        for item_id, coins, diamonds in PRICES[1:]:
            with self.subTest(item=item_id):
                purchased = self.store.buy_item(item_id)
                wallet["coins"] -= coins
                wallet["diamonds"] -= diamonds
                self.assertEqual(purchased["wallet"], wallet)
                self.assertEqual(purchased["equipped"]["island"], previous)
                repeated = self.store.buy_item(item_id)
                self.assertTrue(repeated["receipt"]["alreadyOwned"])
                self.assertEqual(repeated["wallet"], wallet)
                equipped = self.store.equip_item(item_id)
                self.assertEqual(equipped["equipped"], {**untouched, "island": item_id})
                self.assertEqual(equipped["wallet"], wallet)
                self.restart()
                self.assertEqual(self.store.quest_state()["equipped"], equipped["equipped"])
                self.assertEqual(self.store.quest_state()["wallet"], wallet)
                previous = item_id
        self.assertEqual(wallet, {"coins": 17, "diamonds": 3})
        ledger = [tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger ORDER BY reference")]
        self.assertTrue(self.store.buy_item("island-default")["receipt"]["alreadyOwned"])
        self.store.equip_item("island-default")
        self.restart()
        final = self.store.quest_state()
        self.assertEqual(final["equipped"], {**untouched, "island": "island-default"})
        self.assertEqual(final["wallet"], wallet)
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger ORDER BY reference")], ledger)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger WHERE reference LIKE 'purchase:island-%'").fetchone()[0], 10)
        self.assertTrue(all(item["owned"] for item in final["catalog"] if item["id"] in {item[0] for item in PRICES}))
        self.assertTrue(all(not item["owned"] for item in final["catalog"] if item["slot"] == "island" and item["id"] not in {item[0] for item in PRICES}))

    def test_save_before_island_expansion_keeps_all_three_owned_sets_without_auto_unlock_or_new_charge(self):
        legacy_catalog = {key: value for key, value in server.SHOP_ITEMS.items() if key not in NEW_IDS}
        self.assertEqual(len(legacy_catalog), len(server.SHOP_ITEMS) - len(NEW_IDS))
        self.store.close()
        with patch.dict(server.SHOP_ITEMS, legacy_catalog, clear=True):
            self.store = server.FocusStore(self.root / "data", self.root / "unused.json")
            self.fund(3000, 200)
            for product in ("island-lanterns", "island-garden", "island-pavilion", "camp-lake"):
                self.store.buy_item(product)
                self.store.equip_item(product)
            self.store.accept_quest("math")
            self.store.update_settings({"targets": {"math": 200}})
            with self.assertRaises(ValueError):
                self.store.buy_item("island-palace")
            before = self.store.quest_state()
        tables = ("wallet_ledger", "shop_purchases", "shop_equipment", "records", "quest_tracks", "quest_deliveries", "quest_allocations", "meta")
        saved = {table: [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")] for table in tables}
        for _ in range(2):
            self.restart()
            after = self.store.quest_state()
            self.assertEqual(after["equipped"], before["equipped"])
            self.assertEqual(after["wallet"], before["wallet"])
            self.assertEqual(len(after["catalog"]), 104+len(server.shop_expansion.SHOP_CATALOG_EXTRA))
            self.assertTrue(all(not item["owned"] for item in after["catalog"] if item["id"] in NEW_IDS))
            self.assertTrue(all(item["owned"] for item in after["catalog"] if item["id"] in {row[0] for row in PRICES[:4]}))
            self.assertEqual(self.store.settings["targets"]["math"], 200)
            for table, rows in saved.items():
                self.assertEqual([tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")], rows, table)
        self.store.equip_item("island-lanterns")
        self.assertEqual(self.store.quest_state()["equipped"]["island"], "island-lanterns")
        self.assertEqual(self.store.quest_state()["wallet"], before["wallet"])


if __name__ == "__main__":
    unittest.main()
