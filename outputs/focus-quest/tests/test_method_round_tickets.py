"""Two claimed method tiers form an independent durable lottery-ticket round."""
import importlib.util
import sqlite3
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("method_round_ticket_server", Path(__file__).resolve().parents[1]/"server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 10, 1, 20, tzinfo=timezone(timedelta(hours=8)))
DAY = NOW.date().isoformat()
NAMES = {sid: name for sid, name, _ in server.SUBJECTS}


class MethodRoundTicketTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)/"data"
        self.source = Path(self.temp.name)/"absent.json"
        self.store = self.make_store()

    def make_store(self, now=NOW):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or now):
            return server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, subject="math", now=NOW):
        identity = str(uuid.uuid4())
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", (
                identity, identity, NAMES[subject]+"做题", 60,
                int((now-timedelta(hours=1)).timestamp()*1000), int(now.timestamp()*1000),
                now.date().isoformat(), "tomatodo"))
        return identity

    def claim(self, subject="math", tier="practice", now=NOW, store=None):
        return (store or self.store).claim_method_reward(now.date().isoformat(), subject, tier, now)

    def round(self, subject="math", now=NOW):
        self.add(subject, now)
        self.claim(subject, "practice", now)
        return self.claim(subject, "mastery", now)

    def state(self, now=NOW, day=None):
        return self.store.method_rewards_state(day or now.date().isoformat(), now)

    def rows(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def snapshot(self):
        return {row[0]: self.rows(row[0]) for row in self.store.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

    def test_completed_but_unclaimed_two_tiers_do_not_issue_tickets(self):
        for subject in NAMES:
            self.add(subject)
        before = self.snapshot()
        for _ in range(5):
            state = self.state()
            self.assertEqual(state["roundTickets"]["totalRounds"], 0)
            self.assertTrue(all(not row["roundTickets"]["completed"] for row in state["subjects"]))
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.rows("lottery_ticket_ledger"), [])

    def test_each_subject_pair_grants_one_coin_and_the_third_grants_diamond(self):
        for index, subject in enumerate(NAMES, 1):
            self.add(subject)
            first = self.claim(subject, "practice")
            self.assertEqual(first["ticketGrants"], [])
            second = self.claim(subject, "mastery")
            self.assertEqual(second["lotteryTickets"], {"coinTickets": 1, "diamondTickets": int(index == 3)})
            progress = second["methodRewards"]["roundTickets"]
            self.assertEqual(progress["totalRounds"], index)
            self.assertEqual(progress["coinTickets"], index)
            self.assertEqual(progress["diamondTickets"], index//3)
            self.assertEqual(progress["roundsToNextDiamond"], 3-index%3)
            row = next(row for row in second["methodRewards"]["subjects"] if row["id"] == subject)
            self.assertEqual(row["roundTickets"], {"completed": True, "counted": True, "baseline": False,
                                                   "coinTickets": 1, "diamondTickets": int(index == 3)})
        self.assertEqual(self.store.lottery_state(NOW)["tickets"], {"coin": 4, "diamond": 1})
        self.assertEqual(self.store._round_ticket_state()["totalRounds"], 0)
        self.assertEqual(self.store._wallet(), {"coins": 240, "diamonds": 4})

    def test_mastery_then_practice_is_equally_valid_and_retry_returns_no_new_ticket(self):
        self.add()
        self.assertEqual(self.claim(tier="mastery")["ticketGrants"], [])
        second = self.claim()
        self.assertEqual(second["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 0})
        before = self.snapshot()
        for tier in ("practice", "mastery"):
            result = self.claim(tier=tier)
            self.assertTrue(result["alreadyClaimed"])
            self.assertEqual(result["ticketGrants"], [])
            self.assertEqual(result["lotteryTickets"], {"coinTickets": 0, "diamondTickets": 0})
        self.assertEqual(before, self.snapshot())

    def test_same_subject_rounds_accumulate_over_days_and_restart(self):
        for index in range(3):
            now = NOW+timedelta(days=index)
            result = self.round("math", now)
            self.assertEqual(result["lotteryTickets"]["diamondTickets"], int(index == 2))
            self.store.close()
            self.store = self.make_store(now)
            self.assertEqual(self.state(now)["roundTickets"]["totalRounds"], index+1)
        result = self.state(NOW+timedelta(days=2))
        self.assertEqual(result["roundTickets"]["subjects"][0]["completedRounds"], 3)
        self.assertEqual(result["roundTickets"]["roundsToNextDiamond"], 3)
        self.assertEqual(self.store._round_ticket_state()["totalRounds"], 0)

    def test_legacy_pairs_become_baseline_partial_today_pair_can_complete_new_round(self):
        stamp = int(NOW.timestamp()*1000)-1000
        with self.store.db:
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.METHOD_ROUNDS_META,))
            for day, subject, tiers in (("2026-09-01", "math", ("practice", "mastery")),
                                         (DAY, "cs", ("practice", "mastery")),
                                         (DAY, "politics", ("practice",))):
                for tier in tiers:
                    definition = server.METHOD_REWARD_TIERS[tier]
                    self.store.db.execute("INSERT INTO method_reward_claims VALUES (?,?,?,?,?,?)",
                        (day, subject, tier, definition["coins"], definition["diamonds"], stamp))
                    self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                        (f"method-gift:{day}:{subject}:{tier}", definition["coins"], definition["diamonds"], stamp))
        old_claims = self.rows("method_reward_claims")
        old_wallet = self.rows("wallet_ledger")
        self.store.close()
        self.store = self.make_store()
        self.assertEqual(self.rows("method_reward_claims"), old_claims)
        self.assertEqual(self.rows("wallet_ledger"), old_wallet)
        self.assertEqual(self.rows("lottery_ticket_ledger"), [])
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 0)
        cs = next(row for row in self.state()["subjects"] if row["id"] == "cs")
        self.assertEqual(cs["roundTickets"], {"completed": True, "counted": False, "baseline": True,
                                              "coinTickets": 0, "diamondTickets": 0})
        self.assertEqual(self.claim("cs", "mastery")["ticketGrants"], [])
        self.add("politics")
        result = self.claim("politics", "mastery")
        self.assertEqual(result["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 0})
        self.assertEqual(result["methodRewards"]["roundTickets"]["totalRounds"], 1)
        self.store.close()
        self.store = self.make_store()
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 1)
        self.assertEqual(len(self.rows("method_round_ticket_receipts")), 3)

    def test_parallel_tier_orders_count_one_round_across_connections(self):
        self.add()
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def claim(pair):
            store, tier = pair
            barrier.wait()
            return self.claim(tier=tier, store=store)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, ((self.store, "practice"), (second, "mastery"))))
        self.assertEqual(sum(result["lotteryTickets"]["coinTickets"] for result in results), 1)
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 1)
        self.assertEqual(self.store._wallet(), {"coins": 60, "diamonds": 1})
        self.assertEqual(len(self.rows("method_round_ticket_receipts")), 1)

    def test_parallel_retry_of_second_tier_issues_one_ticket(self):
        self.add()
        self.claim()
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def claim(store):
            barrier.wait()
            return self.claim(tier="mastery", store=store)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, (self.store, second)))
        self.assertEqual(sorted(result["alreadyClaimed"] for result in results), [False, True])
        self.assertEqual(sum(result["lotteryTickets"]["coinTickets"] for result in results), 1)
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 1)

    def test_parallel_distinct_subjects_cross_third_round_once(self):
        self.round("math")
        self.round("cs")
        for subject in ("politics", "english"):
            self.add(subject)
            self.claim(subject)
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def claim(pair):
            store, subject = pair
            barrier.wait()
            return self.claim(subject, "mastery", store=store)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, ((self.store, "politics"), (second, "english"))))
        self.assertEqual(sum(result["lotteryTickets"]["coinTickets"] for result in results), 2)
        self.assertEqual(sum(result["lotteryTickets"]["diamondTickets"] for result in results), 1)
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 4)

    def test_coin_grant_failure_rolls_back_tier_wallet_and_round(self):
        self.add()
        self.claim()
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER fail_method_ticket BEFORE INSERT ON lottery_ticket_ledger
                WHEN NEW.source='method-round' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.claim(tier="mastery")
        self.assertEqual(before, self.snapshot())
        with self.store.db:
            self.store.db.execute("DROP TRIGGER fail_method_ticket")
        self.assertEqual(self.claim(tier="mastery")["lotteryTickets"]["coinTickets"], 1)

    def test_diamond_grant_failure_rolls_back_third_round_coin_grant(self):
        self.round("math")
        self.round("cs")
        self.add("politics")
        self.claim("politics")
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER fail_method_diamond BEFORE INSERT ON lottery_ticket_ledger
                WHEN NEW.source='method-round-three' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.claim("politics", "mastery")
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.state()["roundTickets"]["totalRounds"], 2)
        with self.store.db:
            self.store.db.execute("DROP TRIGGER fail_method_diamond")
        result = self.claim("politics", "mastery")
        self.assertEqual(result["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})

    def test_spent_tickets_and_deleted_study_do_not_change_issued_round_receipts(self):
        identity = self.add()
        self.claim()
        self.claim(tier="mastery")
        with self.store.db:
            self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,?, ?,?,?)",
                ("spent-fixture", "coin", -1, int(NOW.timestamp()*1000), "draw", "已使用"))
        self.store.move_record(identity)
        state = self.state()
        row = next(row for row in state["subjects"] if row["id"] == "math")
        self.assertEqual(row["roundTickets"]["coinTickets"], 1)
        self.assertEqual(state["roundTickets"]["totalRounds"], 1)
        self.assertEqual(self.claim(tier="mastery")["ticketGrants"], [])

    def test_main_gift_preview_and_claim_grant_both_tickets_without_changing_currencies(self):
        for sid, minutes in (("math", 180), ("cs", 180), ("politics", 60), ("english", 60)):
            identity = str(uuid.uuid4())
            with self.store.db:
                self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", (
                    identity, identity, NAMES[sid], minutes,
                    int((NOW-timedelta(minutes=minutes)).timestamp()*1000), int(NOW.timestamp()*1000), DAY, "tomatodo"))
        self.assertEqual(self.store.island_rewards_state(DAY, NOW)["main"]["lotteryTickets"],
                         {"coinTickets": 1, "diamondTickets": 1})
        result = self.store.claim_island_reward(DAY, "main", NOW)
        self.assertEqual(result["reward"], {"coins": 100, "diamonds": 4})
        self.assertEqual(result["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})
        before = self.snapshot()
        retry = self.store.claim_island_reward(DAY, "main", NOW)
        self.assertEqual(retry["lotteryTickets"], {"coinTickets": 0, "diamondTickets": 0})
        self.assertEqual(before, self.snapshot())

    def test_legacy_main_claim_reports_only_its_original_ticket_and_does_not_backfill(self):
        stamp = int(NOW.timestamp()*1000)
        with self.store.db:
            self.store.db.execute("INSERT INTO island_reward_claims VALUES (?,?,?,?,?)", (DAY, "main", 100, 4, stamp))
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)", (f"island-gift:{DAY}:main", 100, 4, stamp))
            self.store.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,1,?,?,?)",
                (f"island:{DAY}:main", "diamond", stamp, "island-main", "四科同行礼盒"))
        self.store.close()
        self.store = self.make_store()
        before = self.rows("lottery_ticket_ledger")
        gift = self.store.island_rewards_state(DAY, NOW)["main"]
        self.assertEqual(gift["lotteryTickets"], {"coinTickets": 0, "diamondTickets": 1})
        self.assertEqual(self.store.claim_island_reward(DAY, "main", NOW)["ticketGrants"], [])
        self.assertEqual(before, self.rows("lottery_ticket_ledger"))


if __name__ == "__main__":
    unittest.main()
