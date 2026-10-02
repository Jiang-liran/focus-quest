"""New progress-bar scenes are purchases, while existing bar owners keep upgrades."""
import importlib.util
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("progress_bar_shop_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 28, 15, tzinfo=timezone(timedelta(hours=8)))
LEGACY = (("bar-default", "初旅刻度", 0, 0), ("bar-mint", "薄荷新芽", 120, 0),
          ("bar-aurora", "极光流转", 240, 0), ("bar-comet", "彗星轨迹", 360, 0),
          ("bar-tide", "潮汐回响", 480, 0), ("bar-prism", "棱镜虹光", 0, 12))
NEW = (("bar-koi", "荷塘涟漪", 0, 16), ("bar-fox", "狐伴花径", 0, 18),
       ("bar-whale", "潮间水母", 0, 20), ("bar-dragon", "纸鸢长风", 0, 24))
NEW_IDS = {item[0] for item in NEW}


class ProgressBarShopTests(unittest.TestCase):
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

    def fund(self, coins=0, diamonds=0):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,0)", ("fixture:"+str(uuid.uuid4()), coins, diamonds))

    def snapshot(self):
        return {row[0]: [tuple(item) for item in self.store.db.execute(f"SELECT * FROM {row[0]} ORDER BY rowid")]
                for row in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

    def test_exact_legacy_prices_and_four_new_diamond_only_scenes(self):
        state = self.store.quest_state(NOW)
        bars = [item for item in state["catalog"] if item["slot"] == "bar"]
        legacy_ids = {item[0] for item in LEGACY+NEW}
        self.assertEqual([(item["id"], item["name"], item["coins"], item["diamonds"]) for item in bars if item["id"] in legacy_ids], list(LEGACY + NEW))
        self.assertEqual(len(state["catalog"]), 104+len(server.shop_expansion.SHOP_CATALOG_EXTRA))
        self.assertEqual(state["equipped"]["bar"], "bar-default")
        self.assertEqual([item["id"] for item in bars if item["owned"]], ["bar-default"])
        self.assertTrue(all(item["currency"] == "diamonds" for item in bars if item["id"] in NEW_IDS))
        self.assertIn("RGB", next(item["description"] for item in bars if item["id"] == "bar-prism"))
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_new_scenes_require_diamonds_and_cannot_bypass_ownership_through_outfits(self):
        self.fund(coins=100000)
        before = self.snapshot()
        for item_id in NEW_IDS:
            with self.subTest(item=item_id):
                with self.assertRaises(ValueError):
                    self.store.buy_item(item_id, NOW)
                with self.assertRaises(ValueError):
                    self.store.equip_item(item_id, NOW)
                with self.assertRaises(ValueError):
                    self.store.city_life_outfit({"name": "还未拥有", "equipped": {"bar": item_id}, "requestId": str(uuid.uuid4())}, NOW)
                self.assertEqual(self.snapshot(), before)

    def test_legacy_prism_owner_gets_rgb_description_without_any_save_or_wallet_migration(self):
        legacy_items = {key: dict(item) for key, item in server.SHOP_ITEMS.items() if key not in NEW_IDS}
        legacy_items["bar-prism"]["description"] = "把积累折射成缤纷的光带"
        self.store.close()
        with patch.dict(server.SHOP_ITEMS, legacy_items, clear=True):
            self.store = self.make_store()
            self.fund(3210, 54)
            for item_id in ("bar-prism", "bar-tide", "bar-mint"):
                self.store.buy_item(item_id, NOW)
            self.store.equip_item("bar-prism", NOW)
            saved_outfit = self.store.city_life_outfit({"name": "棱镜旧收藏", "equipped": {"bar": "bar-prism"}, "requestId": str(uuid.uuid4())}, NOW)
            before = self.snapshot()
            old_wallet = self.store._wallet()
        for _ in range(2):
            self.restart()
            state = self.store.quest_state(NOW)
            prism = next(item for item in state["catalog"] if item["id"] == "bar-prism")
            self.assertTrue(prism["owned"])
            self.assertTrue(prism["equipped"])
            self.assertIn("RGB", prism["description"])
            self.assertEqual(prism["diamonds"], 12)
            self.assertEqual(state["wallet"], old_wallet)
            self.assertTrue(all(not item["owned"] for item in state["catalog"] if item["id"] in NEW_IDS))
            self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.store.city_life_state()["outfits"][0]["id"], saved_outfit["receipt"]["id"])

    def test_every_new_scene_purchases_once_and_survives_equip_outfit_and_restart(self):
        self.fund(777, 100)
        other_equipment = {key: value for key, value in self.store.quest_state(NOW)["equipped"].items() if key != "bar"}
        diamonds = 100
        for item_id, name, _, price in NEW:
            with self.subTest(item=item_id):
                bought = self.store.buy_item(item_id, NOW)
                diamonds -= price
                self.assertEqual(bought["wallet"], {"coins": 777, "diamonds": diamonds})
                self.assertTrue(self.store.buy_item(item_id, NOW)["receipt"]["alreadyOwned"])
                outfit = self.store.city_life_outfit({"name": name, "equipped": {"bar": item_id}, "requestId": str(uuid.uuid4())}, NOW)
                result = self.store.city_life_outfit_apply({"outfitId": outfit["receipt"]["id"], "requestId": str(uuid.uuid4())}, NOW)
                self.assertEqual(result["quests"]["equipped"], {**other_equipment, "bar": item_id})
                self.assertEqual(result["quests"]["wallet"], {"coins": 777, "diamonds": diamonds})
                self.restart()
                self.assertEqual(self.store.quest_state(NOW)["equipped"]["bar"], item_id)
                self.assertEqual(self.store._wallet(), {"coins": 777, "diamonds": diamonds})
        self.assertEqual(diamonds, 22)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM shop_purchases").fetchone()[0], 4)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger WHERE reference LIKE 'purchase:bar-%'").fetchone()[0], 4)
        self.store.equip_item("bar-default", NOW)
        self.assertEqual(self.store._wallet(), {"coins": 777, "diamonds": 22})


if __name__ == "__main__":
    unittest.main()
