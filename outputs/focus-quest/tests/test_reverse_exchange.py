"""One diamond converts to 75 coins, at most five atomic purchases per day."""
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

spec = importlib.util.spec_from_file_location("reverse_exchange_server", Path(__file__).resolve().parents[1]/"server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 28, 15, tzinfo=timezone(timedelta(hours=8)))
uid = lambda: str(uuid.uuid4())


class ReverseExchangeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)/"data"
        self.source = Path(self.temp.name)/"source.json"
        self.store = server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def fund(self, coins=0, diamonds=10):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,0)", ("fixture:"+uid(), coins, diamonds))

    def test_fixed_price_five_per_day_retry_restart_and_midnight_reset(self):
        self.fund()
        requests = []
        for used in range(1, 6):
            request = uid()
            requests.append(request)
            result = self.store.exchange_coins(request, NOW)
            self.assertEqual(result["wallet"], {"coins": used*75, "diamonds": 10-used})
            self.assertEqual(result["exchange"]["reverse"], {"limit": 5, "used": used, "remaining": 5-used,
                "coinsPerDiamond": 75, "maxDiamonds": 5-used})
            self.assertFalse(result["receipt"]["alreadyExchanged"])
            self.assertEqual(result["receipt"]["direction"], "diamonds-to-coins")
        with self.assertRaises(ValueError):
            self.store.exchange_coins(uid(), NOW)
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)
        self.assertTrue(self.store.exchange_coins(requests[0].upper(), NOW)["receipt"]["alreadyExchanged"])
        tomorrow = NOW+timedelta(days=1)
        self.assertEqual(self.store.exchange_coins(requests[0], tomorrow)["exchange"]["reverse"]["used"], 0)
        self.assertEqual(self.store.exchange_coins(uid(), tomorrow)["wallet"], {"coins": 450, "diamonds": 4})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM shop_reverse_exchanges").fetchone()[0], 6)

    def test_empty_wallet_and_invalid_id_have_no_effect(self):
        for request in (None, "", [], "bad", 3):
            with self.assertRaises(ValueError):
                self.store.exchange_coins(request, NOW)
        with self.assertRaises(ValueError):
            self.store.exchange_coins(uid(), NOW)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM shop_reverse_exchanges").fetchone()[0], 0)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_round_trip_never_creates_currency_and_direction_cannot_reuse_key(self):
        self.fund(150, 0)
        forward = uid()
        self.store.exchange_diamonds(2, forward, NOW)
        with self.assertRaises(ValueError):
            self.store.exchange_coins(forward, NOW)
        reverse = uid()
        self.store.exchange_coins(reverse, NOW)
        with self.assertRaises(ValueError):
            self.store.exchange_diamonds(1, reverse, NOW)
        self.store.exchange_coins(uid(), NOW)
        self.assertEqual(self.store._wallet(), {"coins": 150, "diamonds": 0})
        history = self.store.quest_state(NOW)["exchange"]["history"]
        self.assertEqual(len(history), 3)
        self.assertEqual({row["direction"] for row in history}, {"coins-to-diamonds", "diamonds-to-coins"})

    def test_failed_ledger_insert_rolls_back_quota_and_receipt(self):
        self.fund()
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_reverse BEFORE INSERT ON wallet_ledger
                WHEN NEW.reference LIKE 'exchange-reverse:%' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        request = uid()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.exchange_coins(request, NOW)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM shop_reverse_exchanges").fetchone()[0], 0)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 10})
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_reverse")
        self.assertFalse(self.store.exchange_coins(request, NOW)["receipt"]["alreadyExchanged"])

    def race(self, actions):
        second = server.FocusStore(self.data, self.source)
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def perform(pair):
            store, action = pair
            barrier.wait()
            try:
                return action(store)
            except ValueError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(perform, zip((self.store, second), actions)))

    def test_cross_connection_duplicate_request_is_exactly_once(self):
        self.fund()
        request = uid()
        result = self.race([lambda store: store.exchange_coins(request, NOW)]*2)
        self.assertEqual(sorted(row["receipt"]["alreadyExchanged"] for row in result), [False, True])
        self.assertEqual(self.store._wallet(), {"coins": 75, "diamonds": 9})

    def test_cross_connection_fifth_exchange_cannot_race_past_quota(self):
        self.fund()
        for _ in range(4):
            self.store.exchange_coins(uid(), NOW)
        result = self.race([lambda store: store.exchange_coins(uid(), NOW)]*2)
        self.assertEqual(sum(row is not None for row in result), 1)
        self.assertEqual(self.store._wallet(), {"coins": 375, "diamonds": 5})

    def test_cross_connection_single_diamond_cannot_be_spent_twice(self):
        self.fund(diamonds=1)
        result = self.race([lambda store: store.exchange_coins(uid(), NOW)]*2)
        self.assertEqual(sum(row is not None for row in result), 1)
        self.assertEqual(self.store._wallet(), {"coins": 75, "diamonds": 0})


class GoalAndExchangeHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.FocusStore(Path(self.temp.name)/"data", Path(self.temp.name)/"unused.json")
        self.http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        self.port = self.http.server_address[1]
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.store.close()
        self.temp.cleanup()

    def request(self, method, path, payload=None):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.request(method, path, body=None if payload is None else json.dumps(payload),
            headers={"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.port}"})
        response = conn.getresponse()
        result = response.status, json.loads(response.read())
        conn.close()
        return result

    def test_goals_endpoints_and_settings_bypass_rejection(self):
        status, goals = self.request("GET", "/api/goals")
        self.assertEqual(status, 200)
        self.assertTrue(goals["weeklyRequired"])
        for payload in ({"targets": {"math": 1}}, {"weeklyTarget": 1}, {"targets": {}, "motion": False}):
            self.assertEqual(self.request("POST", "/api/settings", payload)[0], 400)
        self.assertTrue(self.store.settings["motion"])
        targets = dict(goals["daily"]["targets"], math=200)
        payload = {"targets": targets, "day": goals["today"], "requestId": uid()}
        status, result = self.request("POST", "/api/goals/daily", payload)
        self.assertEqual(status, 200)
        self.assertEqual(result["daily"]["changesUsed"], 1)
        self.assertEqual(self.request("POST", "/api/goals/daily", dict(payload, now="yesterday"))[0], 400)
        self.assertEqual(self.request("GET", "/api/goals?day=2020-01-01")[0], 400)
        status, result = self.request("POST", "/api/goals/weekly", {"target": 2400, "weekStart": goals["weekly"]["weekStart"], "requestId": uid()})
        self.assertEqual(status, 200)
        self.assertTrue(result["weekly"]["locked"])

    def test_heatmap_query_contract_and_invalid_parameters(self):
        status, result = self.request("GET", "/api/heatmap?period=year&anchor=2024-02-29")
        self.assertEqual(status, 200)
        self.assertEqual(len(result["days"]), 366)
        for suffix in ("period=bogus", "anchor=bogus", "period=week&period=year", "period=week&targets=100", "period="):
            self.assertEqual(self.request("GET", "/api/heatmap?"+suffix)[0], 400)

    def test_reverse_endpoint_cannot_override_amount_date_or_price(self):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES ('fixture-http',0,1,0)")
        request = uid()
        for extra in ({"diamonds": 5}, {"coins": 750}, {"day": "2000-01-01"}):
            self.assertEqual(self.request("POST", "/api/shop/exchange-coins", dict(extra, requestId=request))[0], 400)
        self.assertEqual(self.request("POST", "/api/shop/exchange-coins?day=2000-01-01", {"requestId": request})[0], 400)
        status, result = self.request("POST", "/api/shop/exchange-coins", {"requestId": request})
        self.assertEqual(status, 200)
        self.assertEqual(result["wallet"], {"coins": 75, "diamonds": 0})


if __name__ == "__main__":
    unittest.main()
