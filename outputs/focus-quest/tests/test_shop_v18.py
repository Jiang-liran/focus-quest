"""Expanded catalog, idempotent currency exchange, and legacy price migration."""
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

MODULE = Path(__file__).resolve().parents[1] / "server.py"
spec = importlib.util.spec_from_file_location("shop_v18_server", MODULE)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 23, 15, tzinfo=timezone(timedelta(hours=8)))


class ShopV18Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source.json"
        self.store = server.FocusStore(self.root / "data", self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def fund(self, coins=0, diamonds=0):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                  ("fixture:" + str(uuid.uuid4()), coins, diamonds, int(NOW.timestamp() * 1000)))

    def restart(self):
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)

    def test_retained_42_prices_and_currency_partition(self):
        expected = {
            "bar": [("default", 0, 0), ("mint", 120, 0), ("aurora", 240, 0), ("comet", 360, 0), ("tide", 480, 0), ("prism", 0, 12)],
            "fx": [("default", 0, 0), ("fireflies", 180, 0), ("petals", 300, 0), ("snow", 420, 0), ("meteor", 0, 12), ("nebula", 0, 18)],
            "avatar": [("default", 0, 0), ("ranger", 180, 0), ("voyager", 300, 0), ("alchemist", 420, 0), ("star", 0, 12), ("royal", 0, 18)],
            "banner": [("default", 0, 0), ("leaf", 120, 0), ("parchment", 240, 0), ("obsidian", 360, 0), ("celestial", 0, 10), ("sovereign", 0, 16)],
            "theme": [("default", 0, 0), ("forest", 0, 24), ("ocean", 0, 36), ("sakura", 0, 48), ("aurora", 0, 60)],
            "companion": [("default", 0, 0), ("fox", 0, 16), ("owl", 0, 24), ("whale", 0, 36), ("dragon", 0, 48)],
            "relic": [("default", 0, 0), ("lotus", 0, 20), ("orrery", 0, 32), ("hourglass", 0, 44)],
            "portal": [("default", 0, 0), ("moon", 0, 24), ("archive", 0, 36), ("cosmos", 0, 48)],
        }
        state = self.store.quest_state(NOW)
        retained_ids = {slot + "-" + name for slot, values in expected.items() for name, _, _ in values}
        catalog = {item["id"]: item for item in state["catalog"] if item["id"] in retained_ids}
        self.assertEqual(len(catalog), 42)
        self.assertTrue(set(expected).issubset(state["equipped"]))
        for slot, values in expected.items():
            self.assertEqual(state["equipped"][slot], slot + "-default")
            for name, coins, diamonds in values:
                item = catalog[slot + "-" + name]
                self.assertEqual((item["slot"], item["coins"], item["diamonds"]), (slot, coins, diamonds))
                self.assertEqual(item["currency"], "coins" if coins else "diamonds" if diamonds else "free")
                self.assertFalse(coins and diamonds)
                self.assertEqual(item["owned"], name == "default")
                self.assertEqual(item["equipped"], name == "default")
                self.assertTrue(item["name"] and item["description"] and item["category"])
        self.assertEqual(state["exchange"], {"coinsPerDiamond": 75, "maxDiamonds": 0, "maxPerExchange": 1000, "history": [],
            "reverse": {"limit": 5, "used": 0, "remaining": 5, "coinsPerDiamond": 75, "maxDiamonds": 0}})

    def test_exchange_atomic_exact_price_retry_and_restart(self):
        self.fund(300, 2)
        # First observation initializes the persistent play-ticket archive.
        # Measure exchange idempotency after that independent maintenance.
        self.store.quest_state(NOW)
        revision = self.store.revision
        request_id = str(uuid.uuid4())
        result = self.store.exchange_diamonds(3, request_id, NOW)
        self.assertEqual(result["wallet"], {"coins": 75, "diamonds": 5})
        self.assertEqual(result["exchange"]["maxDiamonds"], 1)
        self.assertEqual(result["receipt"]["coins"], 225)
        self.assertFalse(result["receipt"]["alreadyExchanged"])
        again = self.store.exchange_diamonds(3, request_id.upper(), NOW + timedelta(seconds=1))
        self.assertTrue(again["receipt"]["alreadyExchanged"])
        self.assertEqual(again["receipt"]["createdAt"], result["receipt"]["createdAt"])
        self.assertEqual(again["wallet"], result["wallet"])
        self.restart()
        restored = self.store.exchange_diamonds(3, request_id, NOW + timedelta(minutes=5))
        self.assertEqual(restored["wallet"], result["wallet"])
        self.assertTrue(restored["receipt"]["alreadyExchanged"])
        self.assertEqual(len(restored["exchange"]["history"]), 1)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger WHERE reference LIKE 'exchange:%'").fetchone()[0], 1)
        self.assertEqual(self.store.revision, revision)

    def test_amount_request_id_and_insufficient_balance_validation(self):
        self.fund(74)
        for amount in (0, -1, 1001, True, False, 1.0, 1.5, "1", None, [], {}, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                self.store.exchange_diamonds(amount, str(uuid.uuid4()), NOW)
        for request_id in (None, [], {}, 1, "", "not-uuid", "a" * 36, uuid.uuid4().hex, "{" + str(uuid.uuid4()) + "}"):
            with self.assertRaises(ValueError):
                self.store.exchange_diamonds(1, request_id, NOW)
        with self.assertRaises(ValueError):
            self.store.exchange_diamonds(1, str(uuid.uuid4()), NOW)
        self.assertEqual(self.store.quest_state(NOW)["wallet"], {"coins": 74, "diamonds": 0})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM shop_exchanges").fetchone()[0], 0)

    def test_idempotency_key_cannot_change_amount(self):
        self.fund(300)
        request_id = str(uuid.uuid4())
        self.store.exchange_diamonds(1, request_id, NOW)
        with self.assertRaises(ValueError):
            self.store.exchange_diamonds(2, request_id, NOW)
        self.assertEqual(self.store.quest_state(NOW)["wallet"], {"coins": 225, "diamonds": 1})

    def test_maximum_amount_and_recent_ten_history(self):
        self.fund(75_000)
        result = self.store.exchange_diamonds(1000, str(uuid.uuid4()), NOW)
        self.assertEqual(result["wallet"], {"coins": 0, "diamonds": 1000})
        self.fund(900)
        for index in range(11):
            self.store.exchange_diamonds(1, str(uuid.uuid4()), NOW + timedelta(seconds=index + 1))
        history = self.store.quest_state(NOW)["exchange"]["history"]
        self.assertEqual(len(history), 10)
        self.assertEqual(history[0]["createdAt"], server.iso_ms(int((NOW + timedelta(seconds=11)).timestamp() * 1000)))
        self.assertTrue(all(item["coins"] == 75 and item["diamonds"] == 1 for item in history))

    def test_exchange_rollback_if_ledger_write_fails(self):
        self.fund(150)
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_exchange BEFORE INSERT ON wallet_ledger
                WHEN NEW.reference LIKE 'exchange:%' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        request_id = str(uuid.uuid4())
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.exchange_diamonds(2, request_id, NOW)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM shop_exchanges").fetchone()[0], 0)
        self.assertEqual(self.store.quest_state(NOW)["wallet"], {"coins": 150, "diamonds": 0})
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_exchange")
        self.assertFalse(self.store.exchange_diamonds(2, request_id, NOW)["receipt"]["alreadyExchanged"])

    def test_cross_connection_duplicate_exchange_exactly_once(self):
        self.fund(150)
        second = server.FocusStore(self.root / "data", self.source)
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        request_id = str(uuid.uuid4())
        def exchange(store):
            barrier.wait()
            return store.exchange_diamonds(2, request_id, NOW)
        with ThreadPoolExecutor(max_workers=2) as executor:
            outputs = list(executor.map(exchange, (self.store, second)))
        self.assertEqual(sorted(item["receipt"]["alreadyExchanged"] for item in outputs), [False, True])
        self.assertEqual(self.store.quest_state(NOW)["wallet"], {"coins": 0, "diamonds": 2})

    def test_cross_connection_distinct_exchange_double_spend(self):
        self.fund(150)
        second = server.FocusStore(self.root / "data", self.source)
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def exchange(store):
            barrier.wait()
            try:
                store.exchange_diamonds(2, str(uuid.uuid4()), NOW)
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=2) as executor:
            outputs = list(executor.map(exchange, (self.store, second)))
        self.assertEqual(sorted(outputs), [False, True])
        self.assertEqual(self.store.quest_state(NOW)["wallet"], {"coins": 0, "diamonds": 2})

    def test_exchange_competes_atomically_with_purchase(self):
        self.fund(300)
        second = server.FocusStore(self.root / "data", self.source)
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def act(is_exchange):
            barrier.wait()
            try:
                if is_exchange:
                    self.store.exchange_diamonds(4, str(uuid.uuid4()), NOW)
                else:
                    second.buy_item("bar-aurora", NOW)
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(act, (True, False)))
        self.assertEqual(sorted(outcomes), [False, True])
        self.assertIn(self.store.quest_state(NOW)["wallet"], ({"coins": 0, "diamonds": 4}, {"coins": 60, "diamonds": 0}))

    def test_new_slots_diamond_only_purchase_and_equipment(self):
        self.fund(120, 100)
        self.store.buy_item("banner-leaf", NOW)
        self.store.equip_item("banner-leaf", NOW)
        self.store.buy_item("theme-forest", NOW)
        self.store.equip_item("theme-forest", NOW)
        self.store.buy_item("companion-fox", NOW)
        self.store.equip_item("companion-fox", NOW)
        self.store.buy_item("relic-lotus", NOW)
        self.store.equip_item("relic-lotus", NOW)
        self.store.buy_item("portal-moon", NOW)
        self.store.equip_item("portal-moon", NOW)
        self.assertEqual(self.store.quest_state(NOW)["wallet"], {"coins": 0, "diamonds": 16})
        before = self.store.quest_state(NOW)["equipped"]
        self.restart()
        self.assertEqual(self.store.quest_state(NOW)["equipped"], before)
        self.store.equip_item("portal-default", NOW)
        self.assertEqual(self.store.quest_state(NOW)["equipped"]["theme"], "theme-forest")

    def test_every_paid_item_purchase_equip_restart_and_all_free_defaults(self):
        catalog = self.store.quest_state(NOW)["catalog"]
        paid = [item for item in catalog if item["currency"] != "free" and not item.get("lotteryOnly", False)]
        defaults = [item for item in catalog if item["currency"] == "free"]
        self.assertEqual(len(paid), 102+len(server.shop_expansion.SHOP_CATALOG_EXTRA)-len(server.shop_expansion.SHOP_LOTTERY_ONLY_IDS))
        self.assertEqual(len(defaults), 28)
        total_coins = sum(item["coins"] for item in paid)
        total_diamonds = sum(item["diamonds"] for item in paid)
        # Leave a recognizable remainder so every exact debit can be checked.
        self.fund(total_coins + 17, total_diamonds + 3)
        expected_wallet = {"coins": total_coins + 17, "diamonds": total_diamonds + 3}
        expected_equipped = dict(self.store.quest_state(NOW)["equipped"])
        for item in paid:
            with self.subTest(item=item["id"]):
                purchased = self.store.buy_item(item["id"], NOW)
                expected_wallet["coins"] -= item["coins"]
                expected_wallet["diamonds"] -= item["diamonds"]
                self.assertEqual(purchased["wallet"], expected_wallet)
                self.assertFalse(purchased["receipt"]["alreadyOwned"])
                self.assertEqual(purchased["equipped"], expected_equipped, "buying must not equip automatically")
                equipped = self.store.equip_item(item["id"], NOW)
                expected_equipped[item["slot"]] = item["id"]
                self.assertEqual(equipped["equipped"], expected_equipped)
                self.assertEqual(equipped["wallet"], expected_wallet, "equipping must never debit currency")
                self.assertTrue(next(entry for entry in equipped["catalog"] if entry["id"] == item["id"])["owned"])

        self.assertEqual(expected_wallet, {"coins": 17, "diamonds": 3})
        expenses = self.store.db.execute("""SELECT COUNT(*),-SUM(coins),-SUM(diamonds)
            FROM wallet_ledger WHERE reference LIKE 'purchase:%'""").fetchone()
        self.assertEqual(tuple(expenses), (len(paid), total_coins, total_diamonds))
        self.restart()
        restored = self.store.quest_state(NOW)
        self.assertEqual(restored["wallet"], expected_wallet)
        self.assertEqual(restored["equipped"], expected_equipped)
        self.assertTrue(all(item["owned"] for item in restored["catalog"] if not item.get("lotteryOnly", False)))
        self.assertTrue(all(not item["owned"] for item in restored["catalog"] if item.get("lotteryOnly", False)))

        ledger_before = [tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger ORDER BY reference")]
        for item in defaults:
            with self.subTest(default=item["id"]):
                self.assertTrue(self.store.buy_item(item["id"], NOW)["receipt"]["alreadyOwned"])
                result = self.store.equip_item(item["id"], NOW)
                expected_equipped[item["slot"]] = item["id"]
                self.assertEqual(result["equipped"], expected_equipped)
                self.assertEqual(result["wallet"], expected_wallet)
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger ORDER BY reference")], ledger_before)
        self.restart()
        final = self.store.quest_state(NOW)
        self.assertEqual(final["equipped"], {item["slot"]: item["id"] for item in defaults})
        self.assertEqual(final["wallet"], expected_wallet)
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger ORDER BY reference")], ledger_before)

    def prepare_legacy(self, prices, coins=100, diamonds=3):
        self.fund(coins + sum(item[0] for item in prices.values()), diamonds + sum(item[1] for item in prices.values()))
        with self.store.db:
            for item_id, (cost_coins, cost_diamonds) in prices.items():
                self.store.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (item_id, int(NOW.timestamp() * 1000)))
                self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                      ("purchase:" + item_id, -cost_coins, -cost_diamonds, int(NOW.timestamp() * 1000)))
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.SHOP_PRICING_MIGRATION,))
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.SHOP_NPC_REMOVAL_MIGRATION,))
            self.store.db.execute("DELETE FROM shop_equipment WHERE slot IN ('banner','theme','companion','relic','portal')")

    def test_legacy_mixed_price_refunds_preserve_owned_equipment_once(self):
        self.prepare_legacy({"bar-aurora": (300, 0), "bar-comet": (700, 4), "fx-fireflies": (400, 0),
                             "fx-meteor": (900, 6), "npc-scholar": (250, 0), "npc-astral": (700, 6),
                             "avatar-ranger": (300, 0), "avatar-star": (800, 8)})
        self.store.equip_item("bar-comet", NOW)
        self.store.equip_item("fx-meteor", NOW)
        self.restart()
        state = self.store.quest_state(NOW)
        self.assertEqual(state["wallet"], {"coins": 3490, "diamonds": 13})
        self.assertEqual(state["equipped"]["bar"], "bar-comet")
        self.assertEqual(state["equipped"]["fx"], "fx-meteor")
        self.assertEqual(len(state["equipped"]), 24)
        self.assertTrue(all(item["owned"] for item in state["catalog"] if item["id"] in server.LEGACY_SHOP_ITEM_IDS))
        refunds = [tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger WHERE reference LIKE 'pricing:v18:%' ORDER BY reference")]
        self.assertEqual(len(refunds), 8)
        self.restart()
        self.assertEqual(self.store.quest_state(NOW)["wallet"], state["wallet"])
        self.assertEqual([tuple(row) for row in self.store.db.execute("SELECT * FROM wallet_ledger WHERE reference LIKE 'pricing:v18:%' ORDER BY reference")], refunds)

    def test_migration_uses_actual_spend_and_never_charges_more(self):
        self.prepare_legacy({"bar-comet": (200, 1), "fx-meteor": (75, 20)}, coins=0, diamonds=0)
        self.restart()
        # Comet becomes more expensive in coins, but keeps ownership with no
        # extra charge. Meteor refunds its actual 75 coins and 8 excess diamonds.
        self.assertEqual(self.store.quest_state(NOW)["wallet"], {"coins": 75, "diamonds": 9})

    def test_empty_upgrade_marks_complete_and_new_prices_never_refund(self):
        self.assertIsNotNone(self.store._meta(server.SHOP_PRICING_MIGRATION))
        self.fund(1000, 20)
        self.store.buy_item("bar-aurora", NOW)
        self.store.buy_item("fx-meteor", NOW)
        self.restart()
        self.assertEqual(self.store.quest_state(NOW)["wallet"], {"coins": 760, "diamonds": 8})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger WHERE reference LIKE 'pricing:v18:%'").fetchone()[0], 0)

    def test_mutation_clocks_are_sampled_inside_transaction(self):
        self.fund(75)
        def checked_clock(now=None):
            self.assertTrue(self.store.db.in_transaction)
            return NOW
        with patch.object(server, "quest_clock", side_effect=checked_clock):
            self.store.buy_item("bar-default")
            self.store.equip_item("bar-default")
            self.store.exchange_diamonds(1, str(uuid.uuid4()))


class ShopV18HTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.FocusStore(Path(self.temp.name) / "data", Path(self.temp.name) / "source.json")
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES ('fixture',150,0,0)")
        self.http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.store.close()
        self.temp.cleanup()

    def request(self, payload, path="/api/shop/exchange", origin=None):
        connection = HTTPConnection("127.0.0.1", self.http.server_address[1], timeout=3)
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin
        connection.request("POST", path, body=json.dumps(payload), headers=headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_http_exchange_contract_retry_and_strict_input(self):
        payload = {"diamonds": 2, "requestId": str(uuid.uuid4())}
        status, result = self.request(payload)
        self.assertEqual(status, 200)
        self.assertEqual(result["wallet"], {"coins": 0, "diamonds": 2})
        self.assertTrue({"day", "now", "wallet", "quests", "catalog", "equipped", "history", "exchange", "receipt"} <= set(result))
        self.assertTrue(self.request(payload)[1]["receipt"]["alreadyExchanged"])
        for invalid in ({}, {"diamonds": 1}, dict(payload, now="2026-09-23"), dict(payload, coins=0),
                        dict(payload, diamonds=True), dict(payload, diamonds=1.0), dict(payload, diamonds=0),
                        dict(payload, diamonds=1001), dict(payload, requestId="invalid")):
            self.assertEqual(self.request(invalid)[0], 400)
        self.assertEqual(self.request(payload, path="/api/shop/exchange?now=2026-09-23")[0], 400)
        self.assertEqual(self.request(payload, origin="https://evil.example")[0], 403)


if __name__ == "__main__":
    unittest.main()
