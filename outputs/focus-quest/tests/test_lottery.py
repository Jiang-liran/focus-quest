"""Ticket sources, cryptographic draw economy and durable transaction guards."""
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from fractions import Fraction
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("lottery_server", Path(__file__).resolve().parents[1]/"server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
rules = server.lottery_rules
TZ = timezone(timedelta(hours=8))
START = datetime(2026, 9, 30, tzinfo=TZ)
NOW = START.replace(hour=21)
DAY = START.date().isoformat()
NAMES = dict((sid, name) for sid, name, _ in server.SUBJECTS)


def rid():
    return str(uuid.uuid4())


def ms(current):
    return int(current.timestamp()*1000)


def queued(*values):
    values = list(values)
    def pick(bound):
        value = values.pop(0)
        if not 0 <= value < bound:
            raise AssertionError((value, bound))
        return value
    return pick


def branch_start(machine, kind):
    start = 0
    for candidate, weight in rules.ODDS[machine]:
        if candidate == kind:
            return start
        start += weight
    raise AssertionError((machine, kind))


class LotteryStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)/"data"
        self.source = Path(self.temp.name)/"absent.json"
        self.store = self.make_store()

    def make_store(self):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or START):
            return server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def rows(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def snapshot(self):
        return {row[0]: self.rows(row[0]) for row in self.store.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

    def wallet(self, coins=1000, diamonds=100):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)", ("fixture:"+rid(), coins, diamonds, ms(START)))

    def tickets(self, machine="coin", amount=1):
        with self.store.db:
            self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?,?,?,?)",
                ("fixture:"+rid(), machine, amount, ms(START), "fixture", "Fixture"))

    def state(self, now=NOW):
        return self.store.lottery_state(now)

    def machine(self, machine="coin", now=NOW):
        return next(item for item in self.state(now)["machines"] if item["id"] == machine)

    def add(self, subject, minutes, hour=1, activity="practice", day=START):
        start = day.replace(hour=hour)
        identity = rid()
        name = NAMES[subject]+("做题" if activity == "practice" else "听课")
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)",
                (identity, identity, name, minutes, ms(start), ms(start+timedelta(minutes=minutes)), day.date().isoformat(), "tomatodo"))

    def qualifying(self):
        for subject, hour, minutes in (("math", 8, 180), ("cs", 11, 180), ("politics", 14, 60), ("english", 15, 60)):
            self.add(subject, minutes, hour)

    def bonus(self, subject, hour, minutes, now=NOW):
        start = START.replace(hour=hour)
        self.store.accept_quest(subject, start)
        self.add(subject, minutes, hour)
        return self.store.submit_quest(subject, now, request_id=rid())

    def saved_bonus(self, subject, day=DAY, submitted=NOW):
        definition = self.store._quest_definition(subject)
        with self.store.db:
            self.store.db.execute("INSERT INTO quest_bonus_receipts VALUES (?,?,?,?,?,?,?,?)",
                (day, subject, rid(), definition["target"], definition["target"], 1, ms(submitted), "[]"))

    def old_timed_ticket(self, day, key, machine, amount=1):
        with self.store.db:
            self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?,?,?,?)",
                (f"timed:{day}:{key}", machine, amount, ms(NOW), "timed-"+key, "旧首轮加赠"))

    def upgrade_timed_tickets(self, current=NOW+timedelta(seconds=1)):
        with self.store.db:
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.LOTTERY_TIMED_V2_META,))
        self.store._initialize_lottery(current)

    def test_initialization_and_read_state_never_grant_or_mutate(self):
        self.assertEqual(self.state()["tickets"], {"coin": 0, "diamond": 0})
        self.assertEqual(self.state()["featureStartMs"], ms(START))
        before, changes = self.snapshot(), self.store.db.total_changes
        for _ in range(3):
            self.state()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.store.db.total_changes, changes)

    def test_purchases_have_independent_caps_prices_and_persistent_balances(self):
        self.wallet()
        self.assertEqual(rules.PURCHASE_LIMIT, 10)
        for purchased in range(1, 11):
            for machine in ("coin", "diamond"):
                receipt = self.store.buy_lottery_ticket(machine, rid(), NOW)
                self.assertEqual(receipt["result"]["price"], rules.PRICES[machine])
                item = self.machine(machine)
                self.assertEqual(item["purchaseLimit"], 10)
                self.assertEqual(item["purchasesToday"], purchased)
                self.assertEqual(item["purchasesRemaining"], 10-purchased)
                self.assertEqual(item["canBuy"], purchased < 10)
        self.assertEqual(self.state()["tickets"], {"coin": 10, "diamond": 10})
        self.assertEqual(self.store._wallet(), {"coins": 200, "diamonds": 60})
        before = self.snapshot()
        for machine in ("coin", "diamond"):
            with self.assertRaisesRegex(ValueError, "10 张"):
                self.store.buy_lottery_ticket(machine, rid(), NOW)
        self.assertEqual(self.snapshot(), before)
        tomorrow = NOW+timedelta(days=1)
        for machine in ("coin", "diamond"):
            self.assertEqual(self.machine(machine, tomorrow)["purchasesRemaining"], 10)
            self.store.buy_lottery_ticket(machine, rid(), tomorrow)
            self.assertEqual(self.machine(machine, tomorrow)["purchasesToday"], 1)
            self.assertEqual(self.machine(machine, tomorrow)["purchasesRemaining"], 9)
        self.assertEqual(self.state(tomorrow)["tickets"], {"coin": 11, "diamond": 11})

    def test_old_five_purchases_keep_their_count_after_limit_increase_and_restart(self):
        self.wallet()
        with patch.object(rules, "PURCHASE_LIMIT", 5):
            for machine in ("coin", "diamond"):
                for _ in range(5):
                    self.store.buy_lottery_ticket(machine, rid(), NOW)
                self.assertEqual(self.machine(machine)["purchasesRemaining"], 0)
        self.store.close()
        self.store = self.make_store()
        for machine in ("coin", "diamond"):
            self.assertEqual(self.machine(machine)["purchasesToday"], 5)
            self.assertEqual(self.machine(machine)["purchasesRemaining"], 5)
            for _ in range(5):
                self.store.buy_lottery_ticket(machine, rid(), NOW)
            with self.assertRaisesRegex(ValueError, "10 张"):
                self.store.buy_lottery_ticket(machine, rid(), NOW)
        self.assertEqual(self.state()["tickets"], {"coin": 10, "diamond": 10})
        self.assertEqual(self.store._wallet(), {"coins": 200, "diamonds": 60})

    def test_purchase_retry_at_ten_cap_and_next_day_never_spends_or_counts_twice(self):
        self.wallet()
        purchases = {}
        for machine in ("coin", "diamond"):
            for _ in range(10):
                request = rid()
                first = self.store.buy_lottery_ticket(machine, request, NOW)
            purchases[machine] = (request, first)
        before = self.snapshot()
        for machine, (request, first) in purchases.items():
            retry = self.store.buy_lottery_ticket(machine, request, NOW)
            self.assertTrue(retry["alreadyProcessed"])
            self.assertEqual(retry["result"], first["result"])
        self.assertEqual(self.snapshot(), before)
        self.store.close()
        self.store = self.make_store()
        tomorrow = NOW+timedelta(days=1)
        for machine, (request, first) in purchases.items():
            retry = self.store.buy_lottery_ticket(machine, request, tomorrow)
            self.assertTrue(retry["alreadyProcessed"])
            self.assertEqual(retry["result"], first["result"])
            self.assertEqual(self.machine(machine, tomorrow)["purchasesToday"], 0)
            self.assertEqual(self.machine(machine, tomorrow)["purchasesRemaining"], 10)
        self.assertEqual(self.state(tomorrow)["tickets"], {"coin": 10, "diamond": 10})
        self.assertEqual(self.store._wallet(), {"coins": 200, "diamonds": 60})

    def test_purchase_is_idempotent_across_restart_and_midnight(self):
        self.wallet()
        request = rid()
        first = self.store.buy_lottery_ticket("coin", request, NOW)
        self.store.close()
        self.store = self.make_store()
        retry = self.store.buy_lottery_ticket("coin", request, NOW+timedelta(days=1))
        self.assertTrue(retry["alreadyProcessed"])
        self.assertEqual(first["result"], retry["result"])
        self.assertEqual(self.store._wallet(), {"coins": 920, "diamonds": 100})
        self.assertEqual(self.state()["tickets"]["coin"], 1)

    def test_ticket_type_cannot_be_substituted_and_insufficient_balance_is_noop(self):
        self.tickets("coin")
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "对应"):
            self.store.draw_lottery("diamond", rid(), NOW)
        with self.assertRaisesRegex(ValueError, "不足"):
            self.store.buy_lottery_ticket("coin", rid(), NOW)
        self.assertEqual(self.snapshot(), before)

    def test_invalid_machine_request_id_and_reused_id_cannot_change_operation(self):
        self.wallet()
        for value in ([], None, True, "gold", 1):
            with self.assertRaises(ValueError):
                self.store.buy_lottery_ticket(value, rid(), NOW)
        for value in ([], True, "", "invalid", "0"*36):
            with self.assertRaises(ValueError):
                self.store.draw_lottery("coin", value, NOW)
        request = rid()
        self.store.buy_lottery_ticket("coin", request, NOW)
        for operation, machine in ((self.store.buy_lottery_ticket, "diamond"), (self.store.draw_lottery, "coin")):
            with self.assertRaisesRegex(ValueError, "不能更改"):
                operation(machine, request, NOW)

    def test_draw_credits_currency_once_and_receipt_is_stable_across_restart(self):
        self.tickets(amount=2)
        request = rid()
        with patch.object(rules.secrets, "randbelow", side_effect=queued(0, 0, 10)):
            first = self.store.draw_lottery("coin", request, NOW)
        self.assertEqual(first["result"]["coins"], 12)
        self.store.close()
        self.store = self.make_store()
        with patch.object(rules, "draw", side_effect=AssertionError("retry must not reroll")):
            retry = self.store.draw_lottery("coin", request, NOW+timedelta(days=1))
        self.assertEqual(first["result"], retry["result"])
        self.assertTrue(retry["alreadyProcessed"])
        self.assertEqual(self.store._wallet(), {"coins": 12, "diamonds": 0})
        self.assertEqual(self.state()["tickets"]["coin"], 1)
        self.assertEqual(self.machine()["pity"]["count"], 1)
        self.assertEqual(len(self.state()["history"]), 1)

    def test_diamond_machine_coin_rewards_credit_once_and_survive_restart(self):
        self.tickets("diamond", amount=5)
        receipts = []
        for bucket, offset, amount, rarity in ((0, 25, 75, "ordinary"), (8500, 49, 150, "rare"),
                                               (9900, 100, 400, "rare"), (9990, 200, 800, "jackpot")):
            request = rid()
            with patch.object(rules.secrets, "randbelow", side_effect=queued(branch_start("diamond", "coins"), bucket, offset)):
                first = self.store.draw_lottery("diamond", request, NOW)
            self.assertEqual(first["result"]["type"], "coins")
            self.assertEqual(first["result"]["coins"], amount)
            self.assertEqual(first["result"]["diamonds"], 0)
            self.assertEqual(first["result"]["rarity"], rarity)
            self.assertFalse(first["result"]["fallback"])
            receipts.append((request, first["result"]))
        self.store.close()
        self.store = self.make_store()
        before = self.snapshot()
        with patch.object(rules, "draw", side_effect=AssertionError("retry must not reroll")):
            for request, result in receipts:
                retry = self.store.draw_lottery("diamond", request, NOW+timedelta(days=1))
                self.assertTrue(retry["alreadyProcessed"])
                self.assertEqual(retry["result"], result)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.store._wallet(), {"coins": 1425, "diamonds": 0})
        self.assertEqual(self.state()["tickets"]["diamond"], 1)
        self.assertEqual(self.machine("diamond")["pity"]["count"], 4)
        self.assertEqual(len(self.state()["history"]), 4)

    def test_unowned_item_is_added_to_collection_without_auto_equip_or_currency_charge(self):
        self.tickets(amount=2)
        equipment = self.rows("shop_equipment")
        with patch.object(rules.secrets, "randbelow", side_effect=queued(branch_start("coin", "coinItem"), 0)):
            first = self.store.draw_lottery("coin", rid(), NOW)
        item = first["result"]["item"]
        self.assertTrue(any(row[0] == item["id"] for row in self.rows("shop_purchases")))
        self.assertEqual(self.rows("shop_equipment"), equipment)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})
        with patch.object(rules.secrets, "randbelow", side_effect=queued(branch_start("coin", "coinItem"), 0)):
            second = self.store.draw_lottery("coin", rid(), NOW)
        self.assertNotEqual(item["id"], second["result"]["item"]["id"])
        self.store.equip_item(item["id"], NOW)
        self.assertEqual(dict(self.rows("shop_equipment"))[item["slot"]], item["id"])

    def test_exhausted_common_pool_returns_documented_modest_fallback(self):
        self.tickets(amount=2)
        pools = self.store._lottery_pools()
        with self.store.db:
            for item in pools["coinItem"]+pools["diamondItem"]:
                self.store.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (item["id"], ms(START)))
        with patch.object(rules.secrets, "randbelow", side_effect=queued(branch_start("coin", "coinItem"))):
            coin = self.store.draw_lottery("coin", rid(), NOW)["result"]
        with patch.object(rules.secrets, "randbelow", side_effect=queued(branch_start("coin", "diamondItem"))):
            diamond = self.store.draw_lottery("coin", rid(), NOW)["result"]
        self.assertTrue(coin["fallback"] and diamond["fallback"])
        self.assertEqual((coin["coins"], diamond["diamonds"]), (35, 2))
        self.assertEqual(self.machine()["pool"]["exclusiveItems"], 0)
        self.assertFalse(self.state()["shopExclusiveItemsExcluded"])

    def test_one_ticket_cannot_be_spent_twice_concurrently_across_connections(self):
        self.tickets()
        other = self.make_store()
        self.addCleanup(other.close)
        barrier = threading.Barrier(2)
        def draw(store):
            barrier.wait()
            try:
                return store.draw_lottery("coin", rid(), NOW)
            except ValueError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(draw, (self.store, other)))
        self.assertEqual(sum(result is not None for result in results), 1)
        self.assertEqual(self.state()["tickets"]["coin"], 0)
        self.assertEqual(len(self.rows("lottery_requests")), 1)

    def test_duplicate_concurrent_draw_request_has_one_outcome_one_ticket_debit(self):
        self.tickets(amount=3)
        request = rid()
        other = self.make_store()
        self.addCleanup(other.close)
        barrier = threading.Barrier(2)
        def draw(store):
            barrier.wait()
            return store.draw_lottery("coin", request, NOW)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(draw, (self.store, other)))
        self.assertEqual(results[0]["result"], results[1]["result"])
        self.assertEqual(sorted(result["alreadyProcessed"] for result in results), [False, True])
        self.assertEqual(self.state()["tickets"]["coin"], 2)

    def test_concurrent_purchase_cap_is_checked_under_sqlite_write_lock(self):
        self.wallet()
        other = self.make_store()
        self.addCleanup(other.close)
        barrier = threading.Barrier(12)
        def buy(index):
            barrier.wait()
            try:
                return (self.store if index%2 else other).buy_lottery_ticket("coin", rid(), NOW)
            except ValueError:
                return None
        with ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(buy, range(12)))
        self.assertEqual(sum(result is not None for result in results), 10)
        self.assertEqual(self.state()["tickets"]["coin"], 10)
        self.assertEqual(self.store._wallet()["coins"], 200)

    def test_failed_currency_credit_rolls_back_ticket_counter_and_request(self):
        self.tickets()
        with self.store.db:
            self.store.db.execute("CREATE TRIGGER reject_draw BEFORE INSERT ON wallet_ledger WHEN NEW.reference LIKE 'lottery-draw:%' BEGIN SELECT RAISE(ABORT,'fixture'); END")
        before = self.snapshot()
        with patch.object(rules.secrets, "randbelow", side_effect=queued(0, 0, 0)), self.assertRaises(sqlite3.IntegrityError):
            self.store.draw_lottery("coin", rid(), NOW)
        self.assertEqual(self.snapshot(), before)

    def test_subject_and_main_gifts_grant_correct_tickets_only_on_first_claim(self):
        self.qualifying()
        self.assertEqual(self.state()["tickets"], {"coin": 0, "diamond": 0})
        for subject in NAMES:
            claim = self.store.claim_island_reward(DAY, subject, NOW)
            self.assertEqual(claim["ticketGrants"][0]["machine"], "coin")
            self.assertEqual(self.store.claim_island_reward(DAY, subject, NOW)["ticketGrants"], [])
        main = self.store.claim_island_reward(DAY, "main", NOW)
        self.assertEqual(main["ticketGrants"][0]["machine"], "diamond")
        self.assertEqual(main["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        self.assertEqual(self.state()["tickets"], {"coin": 5, "diamond": 1})
        self.assertEqual(self.store._wallet(), {"coins": 220, "diamonds": 8})

    def test_method_bonus_keeps_both_tickets_in_addition_to_complete_subject_rounds(self):
        for subject in NAMES:
            self.add(subject, 60)
            for tier in ("practice", "mastery"):
                self.store.claim_method_reward(DAY, subject, tier, NOW)
        self.assertEqual(self.state()["tickets"], {"coin": 4, "diamond": 1})
        claim = self.store.claim_method_completion(DAY, NOW)
        self.assertEqual(claim["reward"], {"coins": 200, "diamonds": 4})
        self.assertEqual(claim["ticketGrants"][0]["machine"], "diamond")
        self.assertEqual(claim["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        self.assertEqual(self.state()["tickets"], {"coin": 5, "diamond": 2})
        self.assertEqual(self.store.claim_method_completion(DAY, NOW)["ticketGrants"], [])
        self.assertEqual(self.store._wallet(), {"coins": 440, "diamonds": 8})

    def test_each_claimed_bonus_grants_coin_and_each_completed_period_grants_diamond(self):
        first = self.bonus("math", 8, 60)
        self.assertEqual([(g["machine"], g["source"]) for g in first["ticketGrants"] if g["source"].startswith("timed-")], [("coin", "timed-subject")])
        second = self.bonus("politics", 10, 30)
        self.assertEqual([(g["machine"], g["source"]) for g in second["ticketGrants"] if g["source"].startswith("timed-")], [("coin", "timed-subject"), ("diamond", "timed-morning")])
        self.assertEqual([(g["machine"], g["source"]) for g in self.bonus("cs", 13, 60)["ticketGrants"] if g["source"].startswith("timed-")], [("coin", "timed-subject")])
        last = self.bonus("english", 15, 30)
        self.assertEqual([(g["machine"], g["source"]) for g in last["ticketGrants"] if g["source"].startswith("timed-")], [("coin", "timed-subject"), ("diamond", "timed-afternoon")])
        request = last["receipt"]["requestId"]
        retry = self.store.submit_quest("english", NOW, request_id=request)
        self.assertEqual(retry["ticketGrants"], [])
        self.assertEqual(self.state()["tickets"], {"coin": 8, "diamond": 3})
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 4)

    def test_completed_bonus_without_claim_does_not_grant_period_ticket(self):
        for subject, hour, amount in (("math", 8, 60), ("politics", 10, 30)):
            self.store.accept_quest(subject, START)
            self.add(subject, amount, hour)
        self.assertTrue(all(row["bonus"]["pendingCount"] for row in self.store.quest_state(NOW)["quests"] if row["subject"] in {"math", "politics"}))
        self.assertEqual(self.state()["tickets"], {"coin": 0, "diamond": 0})

    def test_pre_feature_period_bonus_never_backfills_when_last_subject_claims(self):
        self.bonus("math", 8, 60)
        with self.store.db:
            self.store._set_meta(server.LOTTERY_START_META, ms(NOW)+1)
        result = self.bonus("politics", 10, 30, NOW+timedelta(seconds=1))
        self.assertEqual([(g["machine"], g["source"]) for g in result["ticketGrants"] if g["source"].startswith("timed-")], [("coin", "timed-subject")])
        self.assertEqual(self.state()["tickets"], {"coin": 4, "diamond": 0})

    def test_timed_upgrade_single_claim_gets_coin_and_restarts_never_repeat(self):
        self.saved_bonus("math")
        epoch = self.state()["featureStartMs"]
        self.upgrade_timed_tickets()
        self.assertEqual(self.state()["tickets"], {"coin": 1, "diamond": 0})
        policy = self.store._meta(server.LOTTERY_TIMED_V2_META)
        self.store.close(); self.store = self.make_store()
        self.assertEqual(self.store._meta(server.LOTTERY_TIMED_V2_META), policy)
        self.assertEqual(self.state()["featureStartMs"], epoch)
        before = self.snapshot()
        self.store._initialize_lottery(NOW+timedelta(days=1))
        self.assertEqual(self.snapshot(), before)

    def test_timed_upgrade_morning_old_coin_is_counted_toward_two_coins_and_one_diamond(self):
        for subject in ("math", "politics"): self.saved_bonus(subject)
        self.old_timed_ticket(DAY, "morning", "coin")
        previous = self.rows("lottery_ticket_ledger")
        self.upgrade_timed_tickets()
        self.assertEqual(self.state()["tickets"], {"coin": 2, "diamond": 1})
        self.assertEqual(self.rows("lottery_ticket_ledger")[:len(previous)], previous)
        policy = json.loads(self.store._meta(server.LOTTERY_TIMED_V2_META))
        self.assertEqual(policy["legacySubjectCredits"], ["math"])
        self.assertEqual(policy["legacyPairCredits"], [])
        with self.store._quest_transaction():
            self.assertEqual(self.store._timed_lottery_tickets(DAY, NOW+timedelta(seconds=2)), [])

    def test_timed_upgrade_all_old_rewards_even_spent_count_toward_new_daily_total(self):
        for subject in NAMES: self.saved_bonus(subject)
        for key, machine in (("morning", "coin"), ("afternoon", "coin"), ("all", "diamond")):
            self.old_timed_ticket(DAY, key, machine)
        with self.store.db:
            for machine, amount in (("coin", -2), ("diamond", -1)):
                self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?,?,?,?)",
                    ("old-spent:"+machine, machine, amount, ms(NOW), "draw", "已经使用"))
        old = self.rows("lottery_ticket_ledger")
        self.upgrade_timed_tickets()
        self.assertEqual(self.state()["tickets"], {"coin": 2, "diamond": 1})
        self.assertEqual(self.rows("lottery_ticket_ledger")[:len(old)], old)
        gross = {row[0]: row[1] for row in self.store.db.execute("SELECT machine,SUM(amount) FROM lottery_ticket_ledger WHERE amount>0 GROUP BY machine")}
        self.assertEqual(gross, {"coin": 4, "diamond": 2})

    def test_timed_upgrade_does_not_scan_old_settled_days_or_pre_lottery_receipts(self):
        previous = (START-timedelta(days=1)).date().isoformat()
        for subject in NAMES: self.saved_bonus(subject, previous)
        self.old_timed_ticket(previous, "morning", "coin")
        self.old_timed_ticket(previous, "afternoon", "coin")
        self.old_timed_ticket(previous, "all", "diamond")
        self.saved_bonus("math", DAY, START-timedelta(seconds=1))
        before = self.rows("lottery_ticket_ledger")
        self.upgrade_timed_tickets()
        self.assertEqual(self.rows("lottery_ticket_ledger"), before)
        self.assertEqual(self.state()["tickets"], {"coin": 2, "diamond": 1})

    def test_late_old_day_claim_only_rewards_new_subject_and_its_completed_pair(self):
        previous = START-timedelta(days=1)
        with self.store.db:
            self.store._set_meta(server.LOTTERY_START_META, ms(previous-timedelta(days=1)))
            self.store._set_meta(server.TIMED_BONUS_START_META, ms(previous-timedelta(days=1)))
        self.saved_bonus("math", previous.date().isoformat(), previous.replace(hour=9))
        self.store.accept_quest("politics", previous)
        self.add("politics", 30, 10, day=previous)
        row = next(row for row in self.store.quest_state(NOW)["quests"] if row["subject"] == "politics")
        self.assertEqual(row["bonus"]["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        request = rid()
        result = self.store.submit_quest("politics", NOW, request_id=request)
        timed = [grant for grant in result["ticketGrants"] if grant["source"].startswith("timed-")]
        self.assertEqual([(grant["machine"], grant["source"]) for grant in timed], [("coin", "timed-subject"), ("diamond", "timed-morning")])
        self.assertIsNone(self.store.db.execute("SELECT 1 FROM lottery_ticket_ledger WHERE reference=?",
            (f"timed-v2:{previous.date().isoformat()}:subject:math",)).fetchone())
        self.assertEqual(self.store.submit_quest("politics", NOW+timedelta(days=1), request_id=request)["ticketGrants"], [])

    def test_multi_day_pending_preview_matches_actual_new_ticket_grants_without_writes(self):
        first = START-timedelta(days=2)
        with self.store.db:
            self.store._set_meta(server.LOTTERY_START_META, ms(first-timedelta(days=1)))
            self.store._set_meta(server.TIMED_BONUS_START_META, ms(first-timedelta(days=1)))
        self.store.accept_quest("politics", first)
        for day in (first, first+timedelta(days=1)):
            self.saved_bonus("math", day.date().isoformat(), day.replace(hour=9))
            self.add("politics", 30, 10, day=day)
        self.store.quest_state(NOW)
        before = self.snapshot()
        row = next(row for row in self.store.quest_state(NOW)["quests"] if row["subject"] == "politics")
        self.assertEqual(row["bonus"]["lotteryTickets"], {"coinTickets": 2, "diamondTickets": 2})
        self.assertEqual(self.snapshot(), before)
        result = self.store.submit_quest("politics", NOW, request_id=rid())
        counts = {"coinTickets": 0, "diamondTickets": 0}
        for grant in result["ticketGrants"]:
            if grant["source"].startswith("timed-"):
                counts["coinTickets" if grant["machine"] == "coin" else "diamondTickets"] += grant["count"]
        self.assertEqual(counts, row["bonus"]["lotteryTickets"])

    def test_timed_upgrade_ticket_failure_rolls_back_policy_and_all_new_grants(self):
        for subject in ("math", "politics"): self.saved_bonus(subject)
        self.old_timed_ticket(DAY, "morning", "coin")
        with self.store.db:
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.LOTTERY_TIMED_V2_META,))
            self.store.db.execute("CREATE TRIGGER reject_timed_upgrade BEFORE INSERT ON lottery_ticket_ledger WHEN NEW.source='timed-morning' AND NEW.machine='diamond' BEGIN SELECT RAISE(ABORT,'fixture'); END")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError): self.store._initialize_lottery(NOW+timedelta(seconds=1))
        self.assertEqual(self.snapshot(), before)
        with self.store.db: self.store.db.execute("DROP TRIGGER reject_timed_upgrade")
        self.store._initialize_lottery(NOW+timedelta(seconds=1))
        self.assertEqual(self.state()["tickets"], {"coin": 2, "diamond": 1})

    def test_concurrent_store_upgrade_and_pair_claims_cannot_duplicate_tickets(self):
        for subject in ("math", "politics"): self.saved_bonus(subject)
        self.old_timed_ticket(DAY, "morning", "coin")
        with self.store.db: self.store.db.execute("DELETE FROM meta WHERE key=?", (server.LOTTERY_TIMED_V2_META,))
        current, barrier = NOW+timedelta(seconds=1), threading.Barrier(2)
        def upgrade(create):
            barrier.wait()
            if create:
                with patch.object(server, "quest_clock", side_effect=lambda value=None: value or current):
                    other = server.FocusStore(self.data, self.source)
                try: return other.lottery_state(current)["tickets"]
                finally: other.close()
            self.store._initialize_lottery(current)
            return self.store.lottery_state(current)["tickets"]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(upgrade, (False, True)))
        self.assertEqual(results, [{"coin": 2, "diamond": 1}]*2)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM lottery_ticket_ledger").fetchone()[0], 3)

    def test_restart_preserves_feature_epoch_and_never_backfills_old_claims(self):
        self.qualifying()
        self.store.claim_island_reward(DAY, "math", NOW)
        with self.store.db:
            self.store.db.execute("DELETE FROM lottery_ticket_ledger")
        before = self.rows("island_reward_claims")
        self.store.close()
        self.store = self.make_store()
        self.assertEqual(self.state()["featureStartMs"], ms(START))
        self.assertEqual(self.rows("island_reward_claims"), before)
        self.assertEqual(self.state()["tickets"], {"coin": 0, "diamond": 0})
        self.assertEqual(self.store.claim_island_reward(DAY, "math", NOW)["ticketGrants"], [])

    def test_mystery_six_star_gifts_grant_increasing_mixed_tickets_once(self):
        self.qualifying()
        self.add("math", 180, 16)
        first = self.store.submit_mystery(rid(), NOW)
        self.assertEqual([g["index"] for g in first["receipt"]["gifts"]], [1, 2, 3, 4, 5, 6])
        self.assertEqual(first["ticketGrants"], [])
        self.assertEqual(self.state()["tickets"], {"coin": 0, "diamond": 0})
        expected = [(1, 0), (1, 1), (2, 1), (2, 2), (2, 2), (2, 2)]
        self.assertEqual([(g["lotteryTickets"]["coinTickets"], g["lotteryTickets"]["diamondTickets"])
                          for g in self.state()["starGifts"]], expected)
        wallet = self.store._wallet()
        for index, (coins, diamonds) in enumerate(expected, 1):
            request = rid()
            opened = self.store.open_lottery_star_gift(DAY, index, request, NOW+timedelta(days=1))
            self.assertEqual(opened["result"]["lotteryTickets"], {"coinTickets": coins, "diamondTickets": diamonds})
            self.assertEqual({key: sum(g["count"] for g in opened["ticketGrants"] if g["machine"] == key)
                              for key in ("coin", "diamond")}, {"coin": coins, "diamond": diamonds})
            self.assertTrue(self.store.open_lottery_star_gift(DAY, index, request, NOW+timedelta(days=2))["alreadyProcessed"])
            repeated = self.store.open_lottery_star_gift(DAY, index, rid(), NOW+timedelta(days=2))
            self.assertTrue(repeated["alreadyProcessed"])
            self.assertEqual(repeated["ticketGrants"], [])
            self.assertEqual(repeated["result"], opened["result"])
        retry = self.store.submit_mystery(first["receipt"]["requestId"], NOW)
        self.assertTrue(retry["receipt"]["alreadyClaimed"])
        self.assertEqual(self.state()["tickets"], {"coin": 10, "diamond": 8})
        self.assertEqual(self.store._wallet(), wallet)

    def test_star_gift_eligibility_excludes_pre_feature_receipts_and_invalid_index(self):
        self.qualifying()
        self.add("math", 120, 16)
        self.store.submit_mystery(rid(), NOW)
        with self.store.db:
            self.store._set_meta(server.LOTTERY_START_META, ms(NOW)+1)
        self.assertEqual(self.state()["starGifts"], [])
        for day, index in ((DAY, 1), (DAY, 0), (DAY, 7), (DAY, True), ("2026-09-29", 1)):
            with self.assertRaises(ValueError):
                self.store.open_lottery_star_gift(day, index, rid(), NOW+timedelta(days=1))
        self.assertEqual(self.state()["tickets"], {"coin": 0, "diamond": 0})

    def test_star_gift_request_binding_and_concurrent_opening_do_not_duplicate(self):
        self.qualifying()
        self.add("math", 60, 16)
        self.store.submit_mystery(rid(), NOW)
        request = rid()
        self.store.open_lottery_star_gift(DAY, 1, request, NOW)
        with self.assertRaisesRegex(ValueError, "不能更改"):
            self.store.open_lottery_star_gift(DAY, 2, request, NOW)
        other = self.make_store()
        self.addCleanup(other.close)
        barrier = threading.Barrier(2)
        def opening(store):
            barrier.wait()
            return store.open_lottery_star_gift(DAY, 2, rid(), NOW)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(opening, (self.store, other)))
        self.assertEqual(sum(len(result["ticketGrants"]) for result in results), 2)
        self.assertEqual(self.state()["tickets"]["coin"], 2)
        self.assertEqual(self.state()["tickets"]["diamond"], 1)

    def test_old_opened_star_gifts_never_receive_topups_and_old_uuid_receipts_survive_restart(self):
        self.qualifying()
        self.add("math", 180, 16)
        self.store.submit_mystery(rid(), NOW)
        requests, originals = {}, {}
        with self.store.db:
            for index, machine in ((2, "coin"), (3, "diamond")):
                request = requests[index] = rid()
                result = originals[index] = {"type": "starGift", "machine": machine, "day": DAY, "index": index}
                self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,1,?,?,?)",
                    (f"mystery:{DAY}:{index}", machine, ms(NOW), "mystery-gift", "旧星礼"))
                self.store.db.execute("INSERT INTO lottery_requests VALUES (?,?,?,?,?,?)",
                    (request, "starGift", machine, DAY, ms(NOW), json.dumps(result)))
            self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?, ?,?,?)",
                ("spent-old-coin", "coin", -1, ms(NOW), "draw", "已使用"))
            self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?, ?,?,?)",
                ("spent-old-diamond", "diamond", -1, ms(NOW), "draw", "已使用"))
        old_rows = self.rows("lottery_ticket_ledger")
        self.store.close()
        self.store = self.make_store()
        self.assertEqual(self.rows("lottery_ticket_ledger"), old_rows)
        for index, machine in ((2, "coin"), (3, "diamond")):
            replay = self.store.open_lottery_star_gift(DAY, index, requests[index], NOW+timedelta(days=1))
            self.assertEqual(replay["result"], originals[index])
            self.assertTrue(replay["alreadyProcessed"])
            self.assertEqual(replay["ticketGrants"], [])
            another = self.store.open_lottery_star_gift(DAY, index, rid(), NOW+timedelta(days=1))
            expected = {"coinTickets": int(machine == "coin"), "diamondTickets": int(machine == "diamond")}
            self.assertEqual(another["result"]["lotteryTickets"], expected)
            self.assertEqual(another["ticketGrants"], [])
            row = next(g for g in self.state()["starGifts"] if g["index"] == index)
            self.assertEqual(row["lotteryTickets"], expected)
        self.assertEqual(self.rows("lottery_ticket_ledger"), old_rows)
        newly_opened = self.store.open_lottery_star_gift(DAY, 4, rid(), NOW)
        self.assertEqual(newly_opened["result"]["lotteryTickets"], {"coinTickets": 2, "diamondTickets": 2})
        self.assertEqual(self.state()["tickets"], {"coin": 2, "diamond": 2})

    def test_mixed_star_gift_secondary_failure_rolls_back_both_ticket_types_and_request(self):
        self.qualifying()
        self.add("math", 60, 16)
        self.store.submit_mystery(rid(), NOW)
        self.state()
        with self.store.db:
            self.store.db.execute("CREATE TRIGGER reject_secondary BEFORE INSERT ON lottery_ticket_ledger WHEN NEW.reference LIKE '%:diamond' BEGIN SELECT RAISE(ABORT,'fixture'); END")
        before = self.snapshot()
        request = rid()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.open_lottery_star_gift(DAY, 2, request, NOW)
        self.assertEqual(self.snapshot(), before)
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_secondary")
        opened = self.store.open_lottery_star_gift(DAY, 2, request, NOW)
        self.assertFalse(opened["alreadyProcessed"])
        self.assertEqual(self.state()["tickets"], {"coin": 1, "diamond": 1})

    def test_source_ticket_failure_rolls_back_original_gift_wallet_and_receipt(self):
        self.qualifying()
        with self.store.db:
            self.store.db.execute("CREATE TRIGGER reject_ticket BEFORE INSERT ON lottery_ticket_ledger BEGIN SELECT RAISE(ABORT,'fixture'); END")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.claim_island_reward(DAY, "math", NOW)
        self.assertEqual(self.snapshot(), before)

    def test_hard_pity_forces_limited_item_exactly_at_limits_and_separate_counters(self):
        for machine, limit in rules.PITY_LIMITS.items():
            with self.subTest(machine=machine):
                self.tickets(machine, limit)
                with patch.object(rules.secrets, "randbelow", return_value=0):
                    for index in range(limit-1):
                        receipt = self.store.draw_lottery(machine, rid(), NOW)
                        self.assertFalse(receipt["result"]["limited"])
                        self.assertEqual(self.machine(machine)["pity"]["count"], index+1)
                    final = self.store.draw_lottery(machine, rid(), NOW)
                self.assertTrue(final["result"]["limited"])
                self.assertTrue(final["result"]["pityTriggered"])
                self.assertEqual(final["result"]["type"], "item")
                self.assertTrue(final["result"]["item"]["lotteryOnly"])
                self.assertEqual(self.machine(machine)["pity"]["count"], 0)

    def test_early_limited_hit_resets_only_its_counter(self):
        self.tickets("coin", 2)
        self.tickets("diamond", 1)
        with patch.object(rules.secrets, "randbelow", return_value=0):
            self.store.draw_lottery("coin", rid(), NOW)
            self.store.draw_lottery("diamond", rid(), NOW)
        with patch.object(rules.secrets, "randbelow", side_effect=queued(branch_start("coin", "lotteryOnly"), 0)):
            result = self.store.draw_lottery("coin", rid(), NOW)
        self.assertTrue(result["result"]["limited"])
        self.assertFalse(result["result"]["pityTriggered"])
        self.assertEqual(self.machine("coin")["pity"]["count"], 0)
        self.assertEqual(self.machine("diamond")["pity"]["count"], 1)

    def test_pity_survives_midnight_restart_and_duplicate_forced_draw(self):
        self.tickets("diamond", 2)
        with self.store.db:
            self.store.db.execute("INSERT INTO lottery_pity VALUES ('diamond',24)")
        self.store.close()
        self.store = self.make_store()
        request = rid()
        result = self.store.draw_lottery("diamond", request, NOW+timedelta(days=3))
        self.assertTrue(result["result"]["pityTriggered"])
        retry = self.store.draw_lottery("diamond", request, NOW+timedelta(days=4))
        self.assertTrue(retry["alreadyProcessed"])
        self.assertEqual(result["result"], retry["result"])
        self.assertEqual(self.state()["tickets"]["diamond"], 1)
        self.assertEqual(len(self.rows("shop_purchases")), 1)
        self.assertEqual(self.machine("diamond")["pity"]["count"], 0)

    def test_all_limited_items_owned_returns_advertised_fallback_and_cannot_direct_buy(self):
        limited = [item for item in server.SHOP_ITEMS.values() if item.get("lotteryOnly")]
        self.assertEqual(len(limited), 24)
        self.wallet()
        for item in limited:
            with self.assertRaisesRegex(ValueError, "抽奖限定"):
                self.store.buy_item(item["id"], NOW)
        with self.store.db:
            for item in limited:
                self.store.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (item["id"], ms(START)))
        for machine, limit in rules.PITY_LIMITS.items():
            self.tickets(machine)
            with self.store.db:
                self.store.db.execute("INSERT INTO lottery_pity VALUES (?,?)", (machine, limit-1))
            result = self.store.draw_lottery(machine, rid(), NOW)["result"]
            self.assertTrue(result["fallback"] and result["limited"])
            self.assertEqual({key: result[key] for key in ("coins", "diamonds")}, rules.LIMITED_FALLBACK[machine])
            self.assertTrue(self.machine(machine)["pity"]["allCollected"])
            self.assertEqual(self.machine(machine)["pity"]["count"], 0)

    def test_forced_limited_item_failure_rolls_back_ticket_pity_and_receipt(self):
        self.tickets("diamond")
        with self.store.db:
            self.store.db.execute("INSERT INTO lottery_pity VALUES ('diamond',24)")
            self.store.db.execute("CREATE TRIGGER reject_item BEFORE INSERT ON shop_purchases BEGIN SELECT RAISE(ABORT,'fixture'); END")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.draw_lottery("diamond", rid(), NOW)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.machine("diamond")["pity"]["remaining"], 1)

    def test_saved_old_counts_at_or_above_new_limits_survive_restart_and_force_only_their_machine(self):
        self.assertEqual(rules.PITY_LIMITS, {"coin": 40, "diamond": 25})
        for machine, old_count in (("coin", 40), ("coin", 47), ("diamond", 25), ("diamond", 31)):
            with self.subTest(machine=machine, old_count=old_count):
                other_machine = "diamond" if machine == "coin" else "coin"
                self.tickets(machine)
                with self.store.db:
                    self.store.db.execute("INSERT OR REPLACE INTO lottery_pity VALUES (?,?)", (machine, old_count))
                    self.store.db.execute("INSERT OR REPLACE INTO lottery_pity VALUES (?,7)", (other_machine,))
                before = self.rows("lottery_pity")
                self.store.close()
                self.store = self.make_store()
                self.assertEqual(self.rows("lottery_pity"), before, "an upgrade must not erase or clamp accumulated misses")
                self.assertEqual(self.machine(machine)["pity"]["count"], old_count)
                self.assertEqual(self.machine(machine)["pity"]["remaining"], 1)
                self.assertEqual(self.machine(other_machine)["pity"]["count"], 7)
                request = rid()
                with patch.object(rules.secrets, "randbelow", return_value=0):
                    awarded = self.store.draw_lottery(machine, request, NOW+timedelta(days=2))
                self.assertTrue(awarded["result"]["limited"] and awarded["result"]["pityTriggered"])
                self.assertEqual(awarded["result"]["type"], "item")
                self.assertEqual(self.machine(machine)["pity"]["count"], 0)
                self.assertEqual(self.machine(other_machine)["pity"]["count"], 7)
                purchases = self.rows("shop_purchases")
                retry = self.store.draw_lottery(machine, request, NOW+timedelta(days=3))
                self.assertTrue(retry["alreadyProcessed"])
                self.assertEqual(awarded["result"], retry["result"])
                self.assertEqual(self.rows("shop_purchases"), purchases)
                self.assertEqual(self.machine(other_machine)["pity"]["count"], 7)

    def test_saved_previous_limit_progress_is_not_reset_or_forced_early_when_limits_increase(self):
        for machine, saved in (("coin", 30), ("diamond", 20)):
            with self.store.db:
                self.store.db.execute("INSERT OR REPLACE INTO lottery_pity VALUES (?,?)", (machine, saved))
            self.tickets(machine)
        before = self.rows("lottery_pity")
        self.store.close()
        self.store = self.make_store()
        self.assertEqual(self.rows("lottery_pity"), before)
        for machine, saved in (("coin", 30), ("diamond", 20)):
            self.assertEqual(self.machine(machine)["pity"]["remaining"], rules.PITY_LIMITS[machine]-saved)
            with patch.object(rules.secrets, "randbelow", return_value=0):
                result = self.store.draw_lottery(machine, rid(), NOW)
            self.assertFalse(result["result"]["limited"])
            self.assertFalse(result["result"]["pityTriggered"])
            self.assertEqual(self.machine(machine)["pity"]["count"], saved+1)

    def test_all_collected_state_cash_expectation_with_current_pity_stays_below_ticket_price(self):
        self.assertEqual(rules.PITY_LIMITS, {"coin": 40, "diamond": 25})
        with self.store.db:
            for item in server.SHOP_ITEMS.values():
                if item["coins"] or item["diamonds"]:
                    self.store.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (item["id"], ms(START)))
        for machine in ("coin", "diamond"):
            row = self.machine(machine)
            self.assertEqual(row["pool"]["coinItems"], 0)
            self.assertEqual(row["pool"]["diamondItems"], 0)
            self.assertEqual(row["pool"]["coinItemsOwned"], row["pool"]["coinItemsTotal"])
            self.assertEqual(row["pool"]["diamondItemsOwned"], row["pool"]["diamondItemsTotal"])
            self.assertEqual(row["pool"]["lotteryOnlyItems"], 0)
            self.assertTrue(row["pity"]["allCollected"])
            expected = rules.currency_expectation(machine, exhausted=True)
            self.assertEqual(row["fullPoolCurrencyExpected"], expected)
            if machine == "coin":
                self.assertLess(expected["coinEquivalent"], row["price"]["coins"])
            else:
                self.assertGreater(expected["coins"], 0)
                self.assertLess(expected["coinEquivalent"], 75*row["price"]["diamonds"])

    def test_ordinary_pool_owned_totals_match_catalog_and_purchase_or_draw_changes(self):
        coin_items = [item for item in server.SHOP_ITEMS.values()
                      if not item.get("lotteryOnly", False) and item["coins"] > 0 and item["diamonds"] == 0]
        diamond_items = [item for item in server.SHOP_ITEMS.values()
                         if not item.get("lotteryOnly", False) and item["diamonds"] > 0]
        coin_pool, diamond_pool = self.machine("coin")["pool"], self.machine("diamond")["pool"]
        self.assertEqual((coin_pool["coinItemsTotal"], coin_pool["diamondItemsTotal"]),
                         (len(coin_items), len(diamond_items)))
        self.assertEqual((coin_pool["coinItemsOwned"], coin_pool["diamondItemsOwned"]), (0, 0))
        self.assertEqual((diamond_pool["coinItemsTotal"], diamond_pool["coinItemsOwned"]), (0, 0))
        self.assertEqual(diamond_pool["diamondItemsTotal"], len(diamond_items))
        self.wallet(coins=100000, diamonds=10000)
        self.store.buy_item(coin_items[0]["id"], NOW)
        self.store.buy_item(diamond_items[0]["id"], NOW)
        pool = self.machine("coin")["pool"]
        self.assertEqual((pool["coinItemsOwned"], pool["coinItems"]), (1, len(coin_items)-1))
        self.assertEqual((pool["diamondItemsOwned"], pool["diamondItems"]), (1, len(diamond_items)-1))
        self.tickets("diamond")
        with patch.object(rules.secrets, "randbelow", side_effect=queued(branch_start("diamond", "diamondItem"), 0)):
            self.store.draw_lottery("diamond", rid(), NOW)
        pool = self.machine("diamond")["pool"]
        self.assertEqual((pool["diamondItemsOwned"], pool["diamondItems"]), (2, len(diamond_items)-2))
        self.assertEqual(pool["diamondItemsTotal"], len(diamond_items))

    def test_each_full_ordinary_round_grants_coin_and_combined_third_grants_diamond(self):
        for subject, hour, minutes in (("math", 18, 60), ("cs", 19, 60), ("politics", 20, 30)):
            start = START.replace(hour=hour)
            self.store.accept_quest(subject, start)
            self.add(subject, minutes, hour)
            preview = next(row for row in self.store.quest_state(NOW)["quests"] if row["subject"] == subject)["roundTickets"]
            expected = {"rounds": 1, "coinTickets": 1, "diamondTickets": int(subject == "politics")}
            self.assertEqual(preview, expected)
            result = self.store.submit_quest(subject, NOW, request_id=rid())
            self.assertEqual(result["receipt"]["roundTickets"], expected)
        state = self.state()
        self.assertEqual(state["tickets"], {"coin": 3, "diamond": 1})
        self.assertEqual(state["roundTickets"]["totalRounds"], 3)
        self.assertEqual(state["roundTickets"]["diamondTickets"], 1)
        self.assertEqual(state["roundTickets"]["roundsTowardNextDiamond"], 0)
        self.assertEqual(state["roundTickets"]["roundsToNextDiamond"], 3)

    def test_bulk_ordinary_delivery_grants_every_round_and_every_third_across_all_subjects(self):
        self.store.accept_quest("math", START.replace(hour=17))
        self.add("math", 210, 17)
        first = self.store.submit_quest("math", NOW, request_id=rid())
        self.assertEqual(first["receipt"]["roundTickets"], {"rounds": 3, "coinTickets": 3, "diamondTickets": 1})
        self.assertEqual([(g["machine"], g["count"], g["source"]) for g in first["ticketGrants"]],
                         [("coin", 3, "quest-round"), ("diamond", 1, "quest-round-three")])
        math = next(row for row in self.state()["roundTickets"]["subjects"] if row["id"] == "math")
        self.assertEqual((math["completedRounds"], math["carryMinutes"], math["minutesToNextRound"]), (3, 30, 30))
        self.store.accept_quest("english", START.replace(hour=18))
        self.add("english", 90, 18)
        second = self.store.submit_quest("english", NOW, request_id=rid())
        self.assertEqual(second["receipt"]["roundTickets"], {"rounds": 3, "coinTickets": 3, "diamondTickets": 1})
        self.assertEqual(self.state()["tickets"], {"coin": 6, "diamond": 2})
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 6)

    def test_partial_ordinary_round_survives_cross_day_restart_and_split_delivery(self):
        self.store.accept_quest("math", START.replace(hour=18))
        self.add("math", 60, 18)
        self.store.submit_quest("math", NOW, request_id=rid())
        self.add("math", 30, 19)
        half = self.store.submit_quest("math", NOW, request_id=rid())
        self.assertEqual(half["receipt"]["roundTickets"], {"rounds": 0, "coinTickets": 0, "diamondTickets": 0})
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 1)
        self.store.close();self.store = self.make_store()
        tomorrow = START+timedelta(days=1)
        self.add("math", 30, 19, day=tomorrow)
        request = rid()
        second = self.store.submit_quest("math", NOW+timedelta(days=1), request_id=request)
        self.assertEqual(second["receipt"]["roundTickets"], {"rounds": 1, "coinTickets": 1, "diamondTickets": 0})
        self.assertEqual(self.state()["tickets"], {"coin": 2, "diamond": 0})
        self.assertEqual(self.state()["roundTickets"]["roundsToNextDiamond"], 1)
        self.store.close();self.store = self.make_store()
        retry = self.store.submit_quest("math", NOW+timedelta(days=2), request_id=request)
        self.assertTrue(retry["receipt"]["alreadyClaimed"])
        self.assertEqual(retry["receipt"]["roundTickets"], second["receipt"]["roundTickets"])
        self.assertEqual(retry["ticketGrants"], [])
        self.assertEqual(self.state()["tickets"], {"coin": 2, "diamond": 0})

    def test_round_upgrade_never_backfills_completed_history_but_preserves_partial_carry(self):
        self.store.accept_quest("math", START)
        with self.store.db:
            self.store.db.execute("UPDATE quest_tracks SET settled_minutes=135,paid_coins=270,paid_diamonds=4,first_completed=1 WHERE subject='math'")
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.LOTTERY_ROUNDS_META,))
        saved = self.snapshot()
        self.store.close();self.store = self.make_store()
        for table, rows in saved.items():
            if table != "meta":
                self.assertEqual(self.rows(table), rows, table)
        self.assertEqual(self.state()["tickets"], {"coin": 0, "diamond": 0})
        progress = self.state()["roundTickets"]
        self.assertEqual(progress["totalRounds"], 0)
        self.assertEqual(next(row for row in progress["subjects"] if row["id"] == "math")["carryMinutes"], 15)
        self.add("math", 45, 18)
        receipt = self.store.submit_quest("math", NOW, request_id=rid())
        self.assertEqual(receipt["receipt"]["roundTickets"], {"rounds": 1, "coinTickets": 1, "diamondTickets": 0})
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 1)
        self.assertEqual(self.state()["tickets"], {"coin": 1, "diamond": 0})

    def test_pre_upgrade_delivery_retry_cannot_backfill_round_tickets(self):
        request = rid()
        self.store.accept_quest("math", START)
        with self.store.db:
            self.store.db.execute("UPDATE quest_tracks SET settled_minutes=120,paid_coins=240,paid_diamonds=4,first_completed=1 WHERE subject='math'")
            self.store.db.execute("INSERT INTO quest_deliveries VALUES (?,?,?,?,?,?,?,?,?)",
                (request, "math", "旧数学交付", 120, 240, 4, ms(START), 120, "[]"))
        before = self.snapshot()
        receipt = self.store.submit_quest("math", NOW, request_id=request)
        self.assertTrue(receipt["receipt"]["alreadyClaimed"])
        self.assertEqual(receipt["receipt"]["roundTickets"], {"rounds": 0, "coinTickets": 0, "diamondTickets": 0})
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 0)
        self.assertEqual(self.snapshot(), before)

    def test_round_ticket_failure_rolls_back_ordinary_money_time_and_round_counter(self):
        self.store.accept_quest("math", START.replace(hour=18))
        self.add("math", 180, 18)
        with self.store.db:
            self.store.db.execute("CREATE TRIGGER reject_round_diamond BEFORE INSERT ON lottery_ticket_ledger WHEN NEW.source='quest-round-three' BEGIN SELECT RAISE(ABORT,'fixture'); END")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.submit_quest("math", NOW, request_id=rid())
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 0)

    def test_concurrent_subject_rounds_merge_global_third_ticket_without_losing_counters(self):
        for subject, hour, minutes in (("math", 18, 60), ("cs", 19, 60), ("politics", 20, 30)):
            self.store.accept_quest(subject, START.replace(hour=hour))
            self.add(subject, minutes, hour)
        other = self.make_store();self.addCleanup(other.close)
        barrier = threading.Barrier(3)
        def submit(subject):
            barrier.wait()
            store = other if subject == "cs" else self.store
            return store.submit_quest(subject, NOW, request_id=rid())
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(submit, ("math", "cs", "politics")))
        self.assertEqual(sum(result["receipt"]["roundTickets"]["rounds"] for result in results), 3)
        self.assertEqual(sum(result["receipt"]["roundTickets"]["diamondTickets"] for result in results), 1)
        self.assertEqual(self.state()["tickets"], {"coin": 3, "diamond": 1})
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 3)

    def test_mystery_extra_time_never_advances_ordinary_round_ticket_counter(self):
        self.qualifying()
        self.add("math", 120, 16)
        delivered = self.store.submit_mystery(rid(), NOW)
        self.assertEqual(delivered["ticketGrants"], [])
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 0)
        self.assertEqual(self.state()["tickets"], {"coin": 0, "diamond": 0})


class LotteryRuleTests(unittest.TestCase):
    def test_probabilities_sum_to_one_and_currency_expectations_remain_below_cost(self):
        self.assertEqual(rules.PRICES, {"coin": {"coins": 80, "diamonds": 0}, "diamond": {"coins": 0, "diamonds": 4}})
        for machine in rules.ODDS:
            self.assertAlmostEqual(sum(row["percent"] for row in rules.odds_for(machine)), 100)
            for exhausted in (False, True):
                expected = rules.currency_expectation(machine, exhausted=exhausted)
                if machine == "coin":
                    self.assertLess(expected["coinEquivalent"], 80)
                else:
                    self.assertGreater(expected["coins"], 0)
                    self.assertLess(expected["coinEquivalent"], 75*4)

    def test_ordinary_items_are_twenty_four_percent_limited_one_and_cash_seventy_five(self):
        old = {"coin": {"coins": 7760, "diamonds": 1200, "coinItem": 950, "diamondItem": 50, "lotteryOnly": 40},
               "diamond": {"diamonds": 8440, "diamondItem": 1500, "lotteryOnly": 60}}
        for machine, entries in rules.ODDS.items():
            weights = dict(entries)
            total = sum(weights.values())
            item_kinds = [kind for kind in weights if kind.endswith("Item")]
            cash_kinds = [kind for kind in weights if kind in {"coins", "diamonds"}]
            self.assertEqual(Fraction(sum(weights[kind] for kind in item_kinds), total), Fraction(24, 100))
            self.assertEqual(Fraction(weights["lotteryOnly"], total), Fraction(1, 100))
            self.assertEqual(Fraction(sum(weights[kind] for kind in item_kinds)+weights["lotteryOnly"], total), Fraction(25, 100))
            self.assertEqual(Fraction(sum(weights[kind] for kind in cash_kinds), total), Fraction(75, 100))
            groups = (item_kinds, cash_kinds) if machine == "coin" else (item_kinds,)
            for group in groups:
                for kind in group:
                    self.assertEqual(Fraction(weights[kind], weights[group[0]]), Fraction(old[machine][kind], old[machine][group[0]]))
            displayed = rules.odds_for(machine)
            for row in displayed:
                self.assertAlmostEqual(row["percent"], float(Fraction(weights[row["type"]]*100, total)))
            self.assertAlmostEqual(sum(row["percent"] for row in displayed if row["type"] in item_kinds), 24)
            self.assertEqual(next(row["percent"] for row in displayed if row["type"] == "lotteryOnly"), 1)
            self.assertAlmostEqual(sum(row["percent"] for row in displayed if row["type"] in item_kinds or row["type"] == "lotteryOnly"), 25)
            self.assertAlmostEqual(sum(row["percent"] for row in displayed if row["type"] in cash_kinds), 75)

    def test_cross_currency_chances_match_and_previous_pool_ratios_are_preserved(self):
        coin = {row["type"]: row["percent"] for row in rules.odds_for("coin")}
        diamond = {row["type"]: row["percent"] for row in rules.odds_for("diamond")}
        self.assertEqual(coin, {"coins": float(Fraction(36375, 560)), "diamonds": float(Fraction(5625, 560)),
                               "coinItem": 22.8, "diamondItem": 1.2, "lotteryOnly": 1})
        self.assertEqual(diamond, {"coins": float(Fraction(5625, 560)), "diamonds": float(Fraction(36375, 560)),
                                  "diamondItem": 24, "lotteryOnly": 1})
        self.assertEqual(diamond["coins"], coin["diamonds"])
        for machine, cash in (("coin", ("coins", "diamonds")), ("diamond", ("diamonds", "coins"))):
            weights = dict(rules.ODDS[machine])
            self.assertEqual(Fraction(weights[cash[0]], weights[cash[1]]), Fraction(97, 15))
        self.assertEqual(Fraction(dict(rules.ODDS["coin"])["coinItem"], dict(rules.ODDS["coin"])["diamondItem"]), Fraction(95, 5))

    def test_diamond_coin_amount_buckets_match_disclosed_odds_and_all_boundaries(self):
        self.assertEqual(rules.DIAMOND_COIN_AMOUNTS, ((8500, 50, 100), (1400, 101, 200), (90, 300, 500), (10, 600, 1000)))
        row = next(row for row in rules.odds_for("diamond") if row["type"] == "coins")
        self.assertEqual((row["min"], row["max"], row["percent"]), (50, 1000, float(Fraction(5625, 560))))
        self.assertIn("85% 的金币结果为 50–100", row["typical"])
        self.assertIn("14% 为 101–200", row["typical"])
        self.assertIn("0.9% 为 300–500", row["typical"])
        self.assertIn("0.1% 为 600–1000", row["typical"])
        for bucket, offset, expected in ((0, 0, 50), (8499, 50, 100), (8500, 0, 101), (9899, 99, 200),
                                         (9900, 0, 300), (9989, 200, 500), (9990, 0, 600), (9999, 400, 1000)):
            with self.subTest(bucket=bucket, offset=offset):
                result = rules.draw("diamond", {}, randbelow=queued(branch_start("diamond", "coins"), bucket, offset))
                self.assertEqual(result["coins"], expected)
                self.assertEqual(result["diamonds"], 0)
                self.assertFalse(result["fallback"])
                self.assertFalse(result["limited"])
                self.assertEqual(result["rarity"], "ordinary" if expected < 120 else "rare" if expected < 600 else "jackpot")
        # The new high-value branch does not alter the original machine's ranges.
        coin_row = next(row for row in rules.odds_for("coin") if row["type"] == "coins")
        self.assertEqual(coin_row["min"], 2)
        self.assertIn("0.1%", coin_row["typical"])
        self.assertEqual(rules.draw("coin", {}, randbelow=queued(branch_start("coin", "coins"), 0, 0))["coins"], 2)

    def test_currency_descriptions_disclose_every_conditional_tier(self):
        expected = {
            "coin": {"coins": "85% 的金币结果为 2–45 金币；14% 为 46–80 金币；0.9% 为 120–250 金币；0.1% 为 600–1000 金币",
                     "diamonds": "90% 的钻石结果为 1 钻石；9% 为 2–3 钻石；0.9% 为 4–8 钻石；0.1% 为 25–40 钻石"},
            "diamond": {"coins": "85% 的金币结果为 50–100 金币；14% 为 101–200 金币；0.9% 为 300–500 金币；0.1% 为 600–1000 金币",
                        "diamonds": "75% 的钻石结果为 1–2 钻石；22% 为 3–4 钻石；2.8% 为 6–10 钻石；0.2% 为 30–50 钻石"},
        }
        for machine, currencies in expected.items():
            displayed = {row["type"]: row for row in rules.odds_for(machine)}
            for currency, description in currencies.items():
                with self.subTest(machine=machine, currency=currency):
                    self.assertEqual(displayed[currency]["typical"], description)

    def test_amount_bands_disclose_machine_specific_ranges_and_conditional_percentages(self):
        expected = {
            "coin": {"coins": ((2, 45, 85), (46, 80, 14), (120, 250, 0.9), (600, 1000, 0.1)),
                     "diamonds": ((1, 1, 90), (2, 3, 9), (4, 8, 0.9), (25, 40, 0.1))},
            "diamond": {"coins": ((50, 100, 85), (101, 200, 14), (300, 500, 0.9), (600, 1000, 0.1)),
                        "diamonds": ((1, 2, 75), (3, 4, 22), (6, 10, 2.8), (30, 50, 0.2))},
        }
        for machine, currencies in expected.items():
            rows = {row["type"]: row for row in rules.odds_for(machine)}
            for currency, tiers in currencies.items():
                with self.subTest(machine=machine, currency=currency):
                    bands = rows[currency]["amountBands"]
                    self.assertEqual(bands, [{"min": low, "max": high, "percent": percent} for low, high, percent in tiers])
                    self.assertAlmostEqual(sum(band["percent"] for band in bands), 100)
                    self.assertEqual((min(band["min"] for band in bands), max(band["max"] for band in bands)),
                                     (rows[currency]["min"], rows[currency]["max"]))
                    self.assertIn("typical", rows[currency])
            for kind, row in rows.items():
                if kind not in currencies:
                    self.assertNotIn("amountBands", row)

    def test_amount_bands_derive_from_amount_weights_without_changing_branch_probabilities(self):
        before = {row["type"]: row["percent"] for row in rules.odds_for("diamond")}
        with patch.object(rules, "DIAMOND_COIN_AMOUNTS", ((3, 50, 100), (1, 600, 1000))):
            rows = {row["type"]: row for row in rules.odds_for("diamond")}
            self.assertEqual(rows["coins"]["amountBands"], [{"min": 50, "max": 100, "percent": 75},
                                                           {"min": 600, "max": 1000, "percent": 25}])
            self.assertEqual({kind: row["percent"] for kind, row in rows.items()}, before)

    def test_each_amount_bucket_samples_every_integer_uniformly_and_independently(self):
        for ranges in (rules.COIN_AMOUNTS, rules.COIN_DIAMOND_AMOUNTS, rules.DIAMOND_COIN_AMOUNTS, rules.DIAMOND_AMOUNTS):
            total = sum(weight for weight, _, _ in ranges)
            start = 0
            for weight, low, high in ranges:
                with self.subTest(ranges=ranges, low=low, high=high):
                    outputs = Counter()
                    for offset in range(high-low+1):
                        requested = []
                        values = iter((start, offset))
                        def pick(bound):
                            requested.append(bound)
                            return next(values)
                        outputs[rules._amount(ranges, pick)] += 1
                        self.assertEqual(requested, [total, high-low+1])
                    self.assertEqual(outputs, Counter({amount: 1 for amount in range(low, high+1)}))
                start += weight

    def test_diamond_coin_bucket_chances_and_mean_match_the_four_tier_plan(self):
        results = Counter(rules._amount(rules.DIAMOND_COIN_AMOUNTS, queued(roll, 0)) for roll in range(10000))
        self.assertEqual(results, {50: 8500, 101: 1400, 300: 90, 600: 10})
        amount_mean = sum(Fraction(weight*(low+high), 2) for weight, low, high in rules.DIAMOND_COIN_AMOUNTS)/10000
        self.assertEqual(amount_mean, Fraction(8922, 100))
        p = Fraction(1, 100)
        cycle = sum((1-p)**index for index in range(25))
        expected_coins = (1-1/cycle)*Fraction(5625, 55440)*amount_mean
        for exhausted in (False, True):
            self.assertEqual(rules.currency_expectation("diamond", exhausted=exhausted)["coins"], round(float(expected_coins), 6))

    def test_diamond_machine_empty_item_pools_keep_diamond_fallbacks(self):
        regular = rules.draw("diamond", {}, randbelow=queued(branch_start("diamond", "diamondItem")))
        limited = rules.draw("diamond", {}, force_limited=True)
        self.assertEqual((regular["type"], regular["coins"], regular["diamonds"], regular["fallback"]), ("diamonds", 0, 2, True))
        self.assertEqual((limited["type"], limited["coins"], limited["diamonds"], limited["fallback"]), ("diamonds", 0, 8, True))
        self.assertTrue(limited["pityTriggered"])

    def test_each_weighted_branch_first_and_last_roll_matches_disclosed_kind(self):
        item = {"id": "fixture-item", "name": "Fixture", "coins": 20, "diamonds": 1}
        pools = {kind: [dict(item, id=kind)] for kind in ("coinItem", "diamondItem", "coinLimited", "diamondLimited")}
        for machine, entries in rules.ODDS.items():
            for kind, weight in entries:
                start = branch_start(machine, kind)
                for roll in (start, start+weight-1):
                    with self.subTest(machine=machine, kind=kind, roll=roll):
                        result = rules.draw(machine, pools, randbelow=queued(roll, 0, 0))
                        self.assertEqual(result["limited"], kind == "lotteryOnly")
                        if kind in {"coins", "diamonds"}:
                            self.assertEqual(result["type"], kind)
                        else:
                            self.assertEqual(result["type"], "item")
                            self.assertEqual(result["item"]["id"], machine+"Limited" if kind == "lotteryOnly" else kind)

    def test_currency_means_match_exact_truncated_pity_cycle_with_and_without_full_pools(self):
        def amount_mean(ranges):
            return sum(Fraction(weight*(low+high), 2) for weight, low, high in ranges)/sum(weight for weight, _, _ in ranges)
        for machine, entries in rules.ODDS.items():
            weights = dict(entries)
            total = sum(weights.values())
            p = Fraction(weights["lotteryOnly"], total)
            limit = rules.PITY_LIMITS[machine]
            # Enumerate the chance that each cycle ends naturally before pity,
            # then add the forced final draw to get the expected cycle length.
            cycle = sum(index*(1-p)**(index-1)*p for index in range(1, limit))+limit*(1-p)**(limit-1)
            for exhausted in (False, True):
                cash = {"coins": Fraction(0), "diamonds": Fraction(0)}
                for kind, weight in entries:
                    if kind == "lotteryOnly":
                        if exhausted:
                            for currency in cash:
                                cash[currency] += Fraction(rules.LIMITED_FALLBACK[machine][currency], 1)/cycle
                        continue
                    frequency = (1-1/cycle)*Fraction(weight, total-weights["lotteryOnly"])
                    if kind in cash:
                        ranges = {"coin": {"coins": rules.COIN_AMOUNTS, "diamonds": rules.COIN_DIAMOND_AMOUNTS},
                                  "diamond": {"coins": rules.DIAMOND_COIN_AMOUNTS, "diamonds": rules.DIAMOND_AMOUNTS}}[machine][kind]
                        cash[kind] += frequency*amount_mean(ranges)
                    elif exhausted:
                        for currency in cash:
                            cash[currency] += frequency*rules.FALLBACK[kind][currency]
                expected = rules.currency_expectation(machine, exhausted=exhausted)
                self.assertEqual(expected["coins"], round(float(cash["coins"]), 6))
                self.assertEqual(expected["diamonds"], round(float(cash["diamonds"]), 6))
                self.assertEqual(expected["coinEquivalent"], round(float(cash["coins"]+75*cash["diamonds"]), 6))

    def test_currency_jackpot_is_rare_but_large_and_server_generated(self):
        coin = rules.draw("coin", {}, randbelow=queued(0, 9999, 400))
        diamond = rules.draw("diamond", {}, randbelow=queued(branch_start("diamond", "diamonds"), 9999, 20))
        self.assertEqual((coin["coins"], diamond["diamonds"]), (1000, 50))
        self.assertEqual(coin["rarity"], "jackpot")
        self.assertEqual(diamond["rarity"], "jackpot")
        self.assertEqual(rules.draw("coin", {}, randbelow=queued(branch_start("coin", "diamonds"), 0, 0))["diamonds"], 1)

    def test_common_pool_contains_every_unowned_paid_ordinary_item_in_its_currency_pool(self):
        with tempfile.TemporaryDirectory() as directory:
            store = server.FocusStore(Path(directory), Path(directory)/"unused.json")
            try:
                owned = next(item for item in server.SHOP_ITEMS.values() if item["coins"] and item.get("lotteryEligible", True))
                with store.db:
                    store.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (owned["id"], ms(START)))
                pools = store._lottery_pools()
                self.assertEqual({item["id"] for item in pools["coinItem"]},
                    {item["id"] for item in server.SHOP_ITEMS.values()
                     if item["coins"] and not item.get("lotteryOnly", False) and item["id"] != owned["id"]})
                self.assertEqual({item["id"] for item in pools["diamondItem"]},
                    {item["id"] for item in server.SHOP_ITEMS.values()
                     if item["diamonds"] and not item.get("lotteryOnly", False)})
                self.assertTrue({"island-watermill", "bar-airship", "avatar-astronaut", "theme-violet"} <=
                    {item["id"] for item in pools["coinItem"]+pools["diamondItem"]})
                for item in pools["coinItem"]+pools["diamondItem"]:
                    self.assertTrue(item["coins"] or item["diamonds"])
                    self.assertTrue(item.get("lotteryEligible", True))
                    self.assertFalse(item.get("lotteryOnly", False))
                    self.assertNotEqual(item["id"], owned["id"])
                self.assertEqual(len(pools["coinLimited"]), 12)
                self.assertEqual(len(pools["diamondLimited"]), 12)
                self.assertGreater(rules.item_weight({"coins": 50}, "coinItem"), rules.item_weight({"coins": 2000}, "coinItem"))
            finally:
                store.close()


class LotteryHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.clock = patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW)
        self.clock.start()
        self.store = server.FocusStore(Path(self.temp.name)/"data", Path(self.temp.name)/"unused.json")
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES ('fixture',1000,100,?)", (ms(NOW),))
        self.http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        self.port = self.http.server_address[1]
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.store.close()
        self.clock.stop()
        self.temp.cleanup()

    def request(self, path="/api/lottery", payload=None, *, method="GET", origin=None):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.request(method, path, json.dumps(payload) if method == "POST" else None, headers={
            "Content-Type": "application/json", "Origin": origin or f"http://127.0.0.1:{self.port}"})
        response = conn.getresponse()
        status, result = response.status, json.loads(response.read())
        conn.close()
        return status, result

    def test_state_and_mutation_contract_carries_authoritative_balances_and_catalog(self):
        status, state = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(state["now"], NOW.isoformat())
        for machine in state["machines"]:
            self.assertEqual(machine["odds"], rules.odds_for(machine["id"]))
            for row in machine["odds"]:
                if row["type"] in {"coins", "diamonds"}:
                    self.assertEqual(len(row["amountBands"]), 4)
        payload = {"machine": "coin", "requestId": rid()}
        status, first = self.request("/api/lottery/buy", payload, method="POST")
        self.assertEqual(status, 200)
        self.assertEqual(first["lottery"]["tickets"]["coin"], 1)
        self.assertEqual(first["quests"]["lottery"], first["lottery"])
        self.assertFalse(first["alreadyProcessed"])
        self.assertTrue(self.request("/api/lottery/buy", payload, method="POST")[1]["alreadyProcessed"])
        status, draw = self.request("/api/lottery/draw", {"machine": "coin", "requestId": rid()}, method="POST")
        self.assertEqual(status, 200)
        self.assertEqual(draw["lottery"]["tickets"]["coin"], 0)
        self.assertIn(draw["result"]["type"], {"coins", "diamonds", "item"})

    def test_strict_fields_query_parameters_and_origin_do_not_mutate(self):
        valid = {"machine": "coin", "requestId": rid()}
        before = self.store._wallet()
        for payload in ({}, [], None, {"machine": "coin"}, dict(valid, coins=1000), dict(valid, seed=0),
                        dict(valid, prize="bar-prism"), dict(valid, day=DAY), dict(valid, machine=[]), dict(valid, requestId=True)):
            self.assertEqual(self.request("/api/lottery/buy", payload, method="POST")[0], 400)
        self.assertEqual(self.request("/api/lottery?machine=coin")[0], 400)
        self.assertEqual(self.request("/api/lottery/buy?coins=0", valid, method="POST")[0], 400)
        self.assertEqual(self.request("/api/lottery/buy", valid, method="POST", origin="https://untrusted.example")[0], 403)
        self.assertEqual(self.store._wallet(), before)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM lottery_requests").fetchone()[0], 0)

    def test_star_gift_api_rejects_extra_fields_unearned_gifts_and_cross_origin(self):
        valid = {"day": DAY, "index": 1, "requestId": rid()}
        for payload in ({}, [], None, dict(valid, coins=100), dict(valid, machine="coin"),
                        dict(valid, index=True), dict(valid, index=5), dict(valid, day=False), valid):
            self.assertEqual(self.request("/api/lottery/star-gift", payload, method="POST")[0], 400)
        self.assertEqual(self.request("/api/lottery/star-gift?index=4", valid, method="POST")[0], 400)
        self.assertEqual(self.request("/api/lottery/star-gift", valid, method="POST", origin="https://untrusted.example")[0], 403)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM lottery_requests").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
