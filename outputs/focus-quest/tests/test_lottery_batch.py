"""Multi-draw transactions preserve tickets, prizes, pity and retry receipts."""
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch

from test_lottery import LotteryStoreTests as Fixture, LotteryHTTPTests as HTTPFixture
from test_lottery import server, rules, rid, NOW, ms, branch_start


class LotteryBatchTests(unittest.TestCase):
    setUp = Fixture.setUp
    make_store = Fixture.make_store
    tearDown = Fixture.tearDown
    rows = Fixture.rows
    snapshot = Fixture.snapshot
    tickets = Fixture.tickets
    state = Fixture.state
    machine = Fixture.machine

    def test_both_machines_consume_exact_tickets_and_save_each_reward(self):
        for machine in ("coin", "diamond"):
            for count in (5, 10):
                self.tickets(machine, count)
                before = self.store._wallet()
                with patch.object(rules.secrets, "randbelow", return_value=0):
                    receipt = self.store.draw_lottery(machine, rid(), NOW, count=count)
                result = receipt["result"]
                self.assertEqual((result["type"], result["machine"], result["count"]), ("batch", machine, count))
                self.assertEqual(len(result["results"]), count)
                self.assertEqual(receipt["lottery"]["tickets"][machine], 0)
                self.assertEqual(self.store._wallet()["coins"]-before["coins"], sum(row["coins"] for row in result["results"]))
                self.assertEqual(self.store._wallet()["diamonds"]-before["diamonds"], sum(row["diamonds"] for row in result["results"]))
                self.assertEqual(receipt["quests"]["lottery"], receipt["lottery"])

    def test_pity_fires_mid_batch_and_continues_from_reset(self):
        for machine in ("coin", "diamond"):
            self.tickets(machine, 10)
            with self.store.db:
                self.store.db.execute("INSERT OR REPLACE INTO lottery_pity VALUES (?,?)", (machine, rules.PITY_LIMITS[machine]-3))
            with patch.object(rules.secrets, "randbelow", return_value=0):
                receipt = self.store.draw_lottery(machine, rid(), NOW, count=10)
            draws = receipt["result"]["results"]
            self.assertEqual([i+1 for i, row in enumerate(draws) if row["pityTriggered"]], [3])
            self.assertTrue(draws[2]["limited"])
            self.assertEqual(self.machine(machine)["pity"]["count"], 7)
            self.assertEqual(self.machine(machine)["pity"]["remaining"], rules.PITY_LIMITS[machine]-7)

    def test_prizes_are_removed_from_pool_between_draws(self):
        for machine, branch in (("coin", "coinItem"), ("diamond", "diamondItem"), ("coin", "lotteryOnly"), ("diamond", "lotteryOnly")):
            self.tickets(machine, 5)
            calls = 0
            def choose(bound):
                nonlocal calls
                calls += 1
                return branch_start(machine, branch) if calls % 2 == 1 else 0
            with patch.object(rules.secrets, "randbelow", side_effect=choose):
                receipt = self.store.draw_lottery(machine, rid(), NOW, count=5)
            ids = [row["item"]["id"] for row in receipt["result"]["results"]]
            self.assertEqual(len(set(ids)), 5)
            for item_id in ids:
                self.assertIsNotNone(self.store.db.execute("SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone())

    def test_insufficient_tickets_never_partially_draw_or_use_other_machine_tickets(self):
        for machine, count in (("coin", 5), ("diamond", 10)):
            self.tickets(machine, count-1)
            self.tickets("diamond" if machine == "coin" else "coin", 20)
            # Existing fixture tickets can exceed the second case, so remove only that machine's fixtures.
            with self.store.db:
                self.store.db.execute("DELETE FROM lottery_ticket_ledger WHERE machine=?", (machine,))
            self.tickets(machine, count-1)
            before = self.snapshot()
            with patch.object(rules, "draw") as draw, self.assertRaisesRegex(ValueError, "不足"):
                self.store.draw_lottery(machine, rid(), NOW, count=count)
            draw.assert_not_called()
            self.assertEqual(self.snapshot(), before)

    def test_mid_batch_failure_rolls_back_every_table(self):
        self.tickets("coin", 10)
        before = self.snapshot()
        real_draw = rules.draw
        calls = 0
        def draw(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 4:
                raise RuntimeError("fixture interrupted draw")
            return real_draw(*args, **kwargs)
        with patch.object(rules, "draw", side_effect=draw), patch.object(rules.secrets, "randbelow", return_value=0), self.assertRaises(RuntimeError):
            self.store.draw_lottery("coin", rid(), NOW, count=10)
        self.assertEqual(calls, 4)
        self.assertEqual(self.snapshot(), before)

    def test_batch_retry_survives_restart_and_rejects_changed_size_or_operation(self):
        self.tickets("diamond", 10)
        request = rid()
        with patch.object(rules.secrets, "randbelow", return_value=0):
            first = self.store.draw_lottery("diamond", request, NOW, count=10)
        self.store.close()
        self.store = self.make_store()
        before = self.snapshot()
        with patch.object(rules, "draw") as draw:
            second = self.store.draw_lottery("diamond", request, NOW+timedelta(days=1), count=10)
        draw.assert_not_called()
        self.assertTrue(second["alreadyProcessed"])
        self.assertEqual(second["result"], first["result"])
        for count in (1, 5):
            with self.assertRaisesRegex(ValueError, "不能更改"):
                self.store.draw_lottery("diamond", request, NOW, count=count)
        with self.assertRaisesRegex(ValueError, "不能更改"):
            self.store.draw_lottery("coin", request, NOW, count=10)
        with self.assertRaisesRegex(ValueError, "不能更改"):
            self.store.buy_lottery_ticket("diamond", request, NOW)
        self.assertEqual(self.snapshot(), before)

    def test_single_draw_uuid_cannot_be_reused_as_batch(self):
        self.tickets("coin", 10)
        request = rid()
        self.store.draw_lottery("coin", request, NOW)
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "不能更改"):
            self.store.draw_lottery("coin", request, NOW, count=5)
        self.assertEqual(self.snapshot(), before)

    def test_competing_batches_cannot_overdraw_and_duplicate_batch_runs_once(self):
        self.tickets("coin", 15)
        def draw(request):
            try:
                return self.store.draw_lottery("coin", request, NOW, count=10)
            except ValueError:
                return None
        with patch.object(rules.secrets, "randbelow", return_value=0), ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(draw, [rid(), rid()]))
        self.assertEqual(sum(row is not None for row in results), 1)
        self.assertEqual(self.state()["tickets"]["coin"], 5)
        request = rid()
        with patch.object(rules.secrets, "randbelow", return_value=0), ThreadPoolExecutor(max_workers=2) as pool:
            receipts = list(pool.map(lambda _: self.store.draw_lottery("coin", request, NOW, count=5), range(2)))
        self.assertEqual(sorted(row["alreadyProcessed"] for row in receipts), [False, True])
        self.assertEqual(receipts[0]["result"], receipts[1]["result"])
        self.assertEqual(self.state()["tickets"]["coin"], 0)
        self.assertEqual(self.machine("coin")["pity"]["count"], 15)
        self.assertEqual(self.machine("diamond")["pity"]["count"], 0)

    def test_history_counts_individual_draws_keeps_order_and_old_single_shape(self):
        self.tickets("coin", 26)
        with patch.object(rules.secrets, "randbelow", return_value=0):
            single = self.store.draw_lottery("coin", rid(), NOW)
            single_id = single["lottery"]["history"][0]["requestId"]
            self.assertNotIn("batchCount", single["lottery"]["history"][0])
            first = rid()
            self.store.draw_lottery("coin", first, NOW, count=5)
            history = self.state()["history"]
            self.assertEqual([row.get("drawIndex") for row in history], [5,4,3,2,1,None])
            self.assertEqual(history[-1]["requestId"], single_id)
            self.store.draw_lottery("coin", rid(), NOW, count=10)
            last = rid()
            self.store.draw_lottery("coin", last, NOW, count=10)
        history = self.state()["history"]
        self.assertEqual(len(history), 20)
        self.assertEqual([row["drawIndex"] for row in history], list(range(10,0,-1))*2)
        self.assertTrue(all(row["result"]["type"] != "batch" for row in history))
        self.assertTrue(all(row["requestId"] == last for row in history[:10]))

    def test_count_is_a_strict_supported_integer(self):
        self.tickets("coin", 20)
        before = self.snapshot()
        for count in (None, True, False, 0, -1, 2, 20, 5.0, "5", [], {}):
            with self.assertRaisesRegex(ValueError, "单抽"):
                self.store.draw_lottery("coin", rid(), NOW, count=count)
        self.assertEqual(self.snapshot(), before)


class LotteryBatchHTTPTests(unittest.TestCase):
    setUp = HTTPFixture.setUp
    tearDown = HTTPFixture.tearDown
    request = HTTPFixture.request

    def test_batch_contract_and_default_single_are_compatible(self):
        for machine, count in (("coin",5), ("diamond",10), ("coin",1)):
            with self.store.db:
                self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?,?,?,?)", (rid(), machine, count, ms(NOW), "fixture", "Fixture"))
            payload = {"machine":machine, "requestId":rid(), "count":count}
            status, receipt = self.request("/api/lottery/draw", payload, method="POST")
            self.assertEqual(status, 200)
            self.assertEqual(receipt["lottery"]["tickets"][machine], 0)
            if count > 1:
                self.assertEqual(len(receipt["result"]["results"]), count)
            else:
                self.assertNotEqual(receipt["result"]["type"], "batch")
            self.assertTrue(self.request("/api/lottery/draw", payload, method="POST")[1]["alreadyProcessed"])

    def test_invalid_batch_requests_do_not_mutate(self):
        payload = {"machine":"coin", "requestId":rid(), "count":5}
        for count in (True, None, "5", 5.0, 2, 0, 11):
            self.assertEqual(self.request("/api/lottery/draw", dict(payload,count=count), method="POST")[0], 400)
        for path in ("/api/lottery/buy", "/api/lottery/exchange", "/api/lottery/draw?count=5"):
            self.assertEqual(self.request(path, payload, method="POST")[0], 400)
        self.assertEqual(self.request("/api/lottery/draw", dict(payload,seed=1), method="POST")[0], 400)
        self.assertEqual(self.request("/api/lottery/draw", payload, method="POST", origin="https://untrusted.example")[0], 403)
        self.assertEqual(self.request("/api/lottery/draw", payload, method="POST")[0], 400)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM lottery_requests").fetchone()[0], 0)
        self.assertEqual(self.store._wallet()["coins"], 1000)


def load_tests(loader, tests, pattern):
    return unittest.TestSuite(loader.loadTestsFromTestCase(cls) for cls in (LotteryBatchTests, LotteryBatchHTTPTests))


if __name__ == "__main__":
    unittest.main()
