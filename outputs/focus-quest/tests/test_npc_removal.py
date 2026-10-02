"""Retired NPC clothing refunds only actual net spending in temporary archives."""
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path

spec = importlib.util.spec_from_file_location("npc_removal_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 24, 18, tzinfo=timezone(timedelta(hours=8)))


class NpcRemovalTests(unittest.TestCase):
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

    def rows(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def retired_receipts(self):
        return [tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger WHERE reference LIKE 'retired:npc-outfit:%' ORDER BY reference")]

    def seed_purchases(self, prices, *, old=False, prefix="purchase:", base_coins=100, base_diamonds=5):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,0)",
                (f"fixture:{len(self.rows('wallet_ledger'))}", base_coins + sum(p[0] for p in prices.values()),
                 base_diamonds + sum(p[1] for p in prices.values())))
            for item_id, (coins, diamonds) in prices.items():
                self.store.db.execute("INSERT INTO shop_purchases VALUES (?,0)", (item_id,))
                self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,0)", (prefix + item_id, -coins, -diamonds))
            self.store.db.execute("INSERT OR REPLACE INTO shop_equipment VALUES ('npc',?)", (next(iter(prices), "npc-default"),))
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.SHOP_NPC_REMOVAL_MIGRATION,))
            if old:
                self.store.db.execute("DELETE FROM meta WHERE key=?", (server.SHOP_PRICING_MIGRATION,))

    def test_expanded_catalog_keeps_18_slots_and_rejects_all_six_retired_ids(self):
        state = self.store.quest_state(NOW)
        self.assertEqual(len(server.SHOP_CATALOG), 104+len(server.shop_expansion.SHOP_CATALOG_EXTRA))
        self.assertEqual(len(state["catalog"]), len(server.SHOP_CATALOG))
        self.assertEqual(len(state["equipped"]), 18)
        self.assertEqual(sum(item["currency"] == "free" for item in state["catalog"]), 18)
        self.assertNotIn("npc", server.SHOP_CATEGORIES)
        self.assertNotIn("npc", state["equipped"])
        self.assertTrue(all(item["slot"] != "npc" and not item["id"].startswith("npc-") for item in state["catalog"]))
        for item_id in server.RETIRED_NPC_ITEM_IDS:
            for method in (self.store.buy_item, self.store.equip_item):
                with self.subTest(item=item_id, action=method.__name__), self.assertRaisesRegex(ValueError, "不存在"):
                    method(item_id, NOW)
        self.assertEqual(self.rows("wallet_ledger"), [])

    def test_v111_purchases_refund_full_actual_spend_and_keep_audit_rows(self):
        prices = {"npc-scholar": (180, 0), "npc-tea": (300, 0), "npc-copper": (420, 0),
                  "npc-astral": (0, 12), "npc-phoenix": (0, 18)}
        self.seed_purchases(prices)
        original_purchases = self.rows("shop_purchases")
        original_ledger = self.rows("wallet_ledger")
        self.restart()
        self.assertEqual(self.store._wallet(), {"coins": 1000, "diamonds": 35})
        self.assertEqual(self.rows("shop_purchases"), original_purchases)
        self.assertEqual(self.rows("wallet_ledger")[:len(original_ledger)], original_ledger)
        self.assertEqual(len(self.retired_receipts()), 5)
        self.assertIsNone(self.store.db.execute("SELECT 1 FROM shop_equipment WHERE slot='npc'").fetchone())
        self.assertIsNotNone(self.store._meta(server.SHOP_NPC_REMOVAL_MIGRATION))
        before = self.rows("wallet_ledger")
        self.restart()
        self.restart()
        self.assertEqual(self.rows("wallet_ledger"), before)

    def test_pre_v18_mixed_currency_first_gets_difference_then_only_remainder(self):
        self.seed_purchases({"npc-scholar": (250, 0), "npc-astral": (700, 6)}, old=True)
        self.restart()
        ledger = {row[0]: row[1:3] for row in self.rows("wallet_ledger")}
        self.assertEqual(ledger["pricing:v18:npc-scholar"], (70, 0))
        self.assertEqual(ledger["pricing:v18:npc-astral"], (700, 0))
        self.assertEqual(ledger["retired:npc-outfit:npc-scholar"], (180, 0))
        self.assertEqual(ledger["retired:npc-outfit:npc-astral"], (0, 6))
        self.assertEqual(self.store._wallet(), {"coins": 1050, "diamonds": 11})
        before = self.rows("wallet_ledger")
        self.restart()
        self.assertEqual(self.rows("wallet_ledger"), before)

    def test_already_applied_v18_refund_is_not_returned_twice(self):
        self.seed_purchases({"npc-scholar": (250, 0), "npc-astral": (700, 20)}, old=True)
        self.store._migrate_shop_v18()
        self.assertEqual(self.store._wallet(), {"coins": 870, "diamonds": 13})
        original_pricing = [r for r in self.rows("wallet_ledger") if r[0].startswith("pricing:")]
        self.store._migrate_remove_npc_outfits()
        self.assertEqual(self.store._wallet(), {"coins": 1050, "diamonds": 25})
        self.assertEqual([r for r in self.rows("wallet_ledger") if r[0].startswith("pricing:")], original_pricing)
        self.assertEqual(sum(r[1] for r in self.retired_receipts()), 180)
        self.assertEqual(sum(r[2] for r in self.retired_receipts()), 12)

    def test_discounted_and_old_buy_prefix_use_actual_cost_not_catalog_price(self):
        self.seed_purchases({"npc-scholar": (75, 0), "npc-phoenix": (0, 3)}, prefix="buy:", old=True)
        self.restart()
        self.assertEqual(self.store._wallet(), {"coins": 175, "diamonds": 8})
        self.assertEqual({r[0]: r[1:3] for r in self.retired_receipts()},
            {"retired:npc-outfit:npc-scholar": (75, 0), "retired:npc-outfit:npc-phoenix": (0, 3)})

    def test_missing_marker_still_cannot_repeat_per_item_refunds(self):
        self.seed_purchases({"npc-copper": (420, 0), "npc-phoenix": (0, 18)})
        self.store._migrate_remove_npc_outfits()
        before = self.rows("wallet_ledger")
        with self.store.db:
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.SHOP_NPC_REMOVAL_MIGRATION,))
        self.store._migrate_remove_npc_outfits()
        self.assertEqual(self.rows("wallet_ledger"), before)

    def test_no_purchase_or_no_payment_never_invents_a_refund(self):
        self.assertEqual(self.rows("wallet_ledger"), [])
        with self.store.db:
            self.store.db.execute("INSERT INTO shop_equipment VALUES ('npc','npc-default')")
            self.store.db.execute("INSERT INTO shop_purchases VALUES ('npc-tea',0)")
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.SHOP_NPC_REMOVAL_MIGRATION,))
        self.restart()
        self.assertEqual(self.rows("wallet_ledger"), [])
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})
        self.assertNotIn("npc", self.store.quest_state(NOW)["equipped"])

    def test_refund_failure_rolls_back_all_items_equipment_and_marker(self):
        self.seed_purchases({"npc-scholar": (180, 0), "npc-astral": (0, 12)})
        before = self.rows("wallet_ledger")
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_second_refund BEFORE INSERT ON wallet_ledger
                WHEN NEW.reference='retired:npc-outfit:npc-astral'
                BEGIN SELECT RAISE(ABORT,'synthetic failure'); END""")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store._migrate_remove_npc_outfits()
        self.assertEqual(self.rows("wallet_ledger"), before)
        self.assertIsNotNone(self.store.db.execute("SELECT 1 FROM shop_equipment WHERE slot='npc'").fetchone())
        self.assertIsNone(self.store._meta(server.SHOP_NPC_REMOVAL_MIGRATION))
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_second_refund")
        self.store._migrate_remove_npc_outfits()
        self.assertEqual(self.store._wallet(), {"coins": 280, "diamonds": 17})

    def test_two_connections_migrate_without_duplicate_refunds(self):
        other = server.FocusStore(self.data, self.source)
        self.addCleanup(other.close)
        self.seed_purchases({"npc-copper": (420, 0), "npc-phoenix": (0, 18)})
        barrier = threading.Barrier(2)
        def migrate(store):
            barrier.wait(timeout=3)
            store._migrate_remove_npc_outfits()
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(migrate, (self.store, other)))
        self.assertEqual(len(self.retired_receipts()), 2)
        self.assertEqual(self.store._wallet(), {"coins": 520, "diamonds": 23})

    def test_other_equipment_study_settings_and_quests_are_untouched(self):
        self.seed_purchases({"npc-scholar": (180, 0)}, base_coins=1000, base_diamonds=100)
        self.store.buy_item("bar-aurora", NOW)
        self.store.equip_item("bar-aurora", NOW)
        self.store.buy_item("camp-pine", NOW)
        self.store.equip_item("camp-pine", NOW)
        self.store.accept_quest("math", NOW)
        self.store.update_settings({"targets": {"math": 200}})
        with self.store.db:
            self.store._upsert_record(("fixture:study", "fixture", "数学", 60, 1000, 3601000, "1970-01-01", "tomatodo"))
        tracked = ("records", "record_aliases", "source_presence", "quest_tracks", "quest_deliveries", "quest_allocations")
        before = {table: self.rows(table) for table in tracked}
        settings, equipped, revision = self.store.settings, self.store.quest_state(NOW)["equipped"], self.store.revision
        self.restart()
        self.assertEqual(self.store.quest_state(NOW)["equipped"], equipped)
        self.assertEqual(self.store.settings, settings)
        self.assertEqual(self.store.revision, revision)
        for table in tracked:
            self.assertEqual(self.rows(table), before[table], table)
        self.assertEqual(self.store._wallet(), {"coins": 940, "diamonds": 82})

    def test_equipped_api_filters_stale_npc_slot_even_after_migration_marker(self):
        with self.store.db:
            self.store.db.execute("INSERT INTO shop_equipment VALUES ('npc','npc-scholar')")
        self.assertNotIn("npc", self.store.quest_state(NOW)["equipped"])
        self.restart()
        self.assertIsNone(self.store.db.execute("SELECT 1 FROM shop_equipment WHERE slot='npc'").fetchone())

    def test_http_rejects_retired_ids_even_if_owned(self):
        self.seed_purchases({"npc-scholar": (180, 0)})
        self.store._migrate_remove_npc_outfits()
        http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        wallet = self.store._wallet()
        try:
            for item_id in server.RETIRED_NPC_ITEM_IDS:
                for action in ("buy", "equip"):
                    with self.subTest(item=item_id, action=action):
                        conn = HTTPConnection("127.0.0.1", http.server_address[1], timeout=3)
                        conn.request("POST", f"/api/shop/{action}", json.dumps({"itemId": item_id}), {"Content-Type": "application/json"})
                        response = conn.getresponse()
                        self.assertEqual(response.status, 400)
                        self.assertIn("不存在", json.loads(response.read())["error"])
                        conn.close()
            self.assertEqual(self.store._wallet(), wallet)
        finally:
            http.shutdown()
            http.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
