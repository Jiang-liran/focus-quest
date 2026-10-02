"""Daily goal gifts are precise, date-bound and atomic across connections."""
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

spec = importlib.util.spec_from_file_location("island_rewards_server", Path(__file__).resolve().parents[1]/"server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 28, 18, tzinfo=timezone(timedelta(hours=8)))
DAY = NOW.date().isoformat()
TARGETS = {"math": 180, "cs": 180, "politics": 60, "english": 60}
NAMES = dict((sid, name) for sid, name, _ in server.SUBJECTS)


class IslandRewardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data, self.source = Path(self.temp.name)/"data", Path(self.temp.name)/"unused.json"
        self.store = self.make_store()

    def make_store(self):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW):
            return server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, subject, minutes, end=None, identity=None):
        end = end or NOW
        identity = identity or str(uuid.uuid4())
        start = end-timedelta(minutes=minutes)
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", (
                identity, identity, NAMES.get(subject, subject), minutes,
                int(start.timestamp()*1000), int(end.timestamp()*1000), end.date().isoformat(), "tomatodo"))
        return identity

    def complete_all(self, current=NOW):
        for subject, minutes in TARGETS.items():
            self.add(subject, minutes, current)

    def claim(self, island, now=NOW):
        return self.store.claim_island_reward(now.date().isoformat(), island, now)

    def gift(self, island="math", now=NOW, day=None):
        state = self.store.island_rewards_state(day, now)
        return state["main"] if island == "main" else next(item for item in state["subjects"] if item["id"] == island)

    def rows(self, table):
        return [tuple(row) for row in self.store.db.execute(f"SELECT * FROM {table} ORDER BY rowid")]

    def snapshot(self):
        return {row[0]: self.rows(row[0]) for row in self.store.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

    def test_each_subject_uses_its_own_goal_and_fixed_gift(self):
        for subject, target in TARGETS.items():
            self.add(subject, target-1)
            self.assertFalse(self.gift(subject)["available"])
            with self.assertRaises(ValueError):
                self.claim(subject)
            self.add(subject, 1)
            self.assertTrue(self.gift(subject)["available"])
            result = self.claim(subject)
            self.assertEqual(result["reward"], {"coins": 30, "diamonds": 1})
            self.assertFalse(result["alreadyClaimed"])
            self.assertTrue(self.gift(subject)["claimed"])
            self.assertFalse(self.gift(subject)["available"])
        self.assertEqual(self.store._wallet(), {"coins": 120, "diamonds": 4})

    def test_main_needs_all_subjects_even_after_total_reached(self):
        self.add("math", 480)
        self.assertFalse(self.gift("main")["eligible"])
        with self.assertRaises(ValueError):
            self.claim("main")
        for subject in ("cs", "politics", "english"):
            self.add(subject, TARGETS[subject])
        # Main can be opened before any subject gift; it does not consume them.
        result = self.claim("main")
        self.assertEqual(result["reward"], {"coins": 100, "diamonds": 4})
        self.assertEqual(result["islandRewards"]["availableCount"], 4)
        self.assertTrue(all(item["available"] for item in result["islandRewards"]["subjects"]))

    def test_main_coin_ticket_failure_rolls_back_diamond_ticket_and_currency_reward(self):
        self.complete_all()
        self.store.arcade_state(NOW)
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_main_coin BEFORE INSERT ON lottery_ticket_ledger
                WHEN NEW.reference LIKE 'island:%:main:coin' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.claim("main")
        self.assertEqual(self.snapshot(), before)
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_main_coin")
        self.assertEqual(self.claim("main")["lotteryTickets"], {"coinTickets": 1, "diamondTickets": 1})

    def test_main_parallel_claims_across_connections_issue_exactly_one_of_each_ticket(self):
        self.complete_all()
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def claim(store):
            barrier.wait()
            return store.claim_island_reward(DAY, "main", NOW)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, (self.store, second)))
        self.assertEqual(sorted(result["alreadyClaimed"] for result in results), [False, True])
        self.assertEqual(sum(result["lotteryTickets"]["coinTickets"] for result in results), 1)
        self.assertEqual(sum(result["lotteryTickets"]["diamondTickets"] for result in results), 1)
        self.assertEqual(self.store._wallet(), {"coins": 100, "diamonds": 4})

    def test_five_gifts_total_220_coins_8_diamonds_without_study_allocation(self):
        self.complete_all()
        # Synchronize the independently earned study tickets before measuring
        # island gifts. Claiming a gift must not allocate study or reissue them.
        self.assertEqual(self.store.arcade_state(NOW)["available"], 8)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})
        revision = self.store.revision
        before = self.snapshot()
        for island in (*TARGETS, "main"):
            self.claim(island)
        self.assertEqual(self.store._wallet(), {"coins": 220, "diamonds": 8})
        self.assertEqual(self.store.island_rewards_state(now=NOW)["availableCount"], 0)
        after = self.snapshot()
        for table in before.keys()-{"wallet_ledger", "island_reward_claims", "meta", "lottery_ticket_ledger"}:
            self.assertEqual(after[table], before[table], table)
        self.assertEqual(self.store.lottery_state(NOW)["tickets"], {"coin": 5, "diamond": 1})
        self.assertEqual(int(self.store._meta("revision")), revision+5)

    def test_duplicates_and_restart_do_not_award_again(self):
        self.add("math", 180)
        self.assertEqual(self.store.arcade_state(NOW)["available"], 6)
        revision = self.store.revision
        first = self.claim("math")
        for _ in range(3):
            duplicate = self.claim("math")
            self.assertTrue(duplicate["alreadyClaimed"])
            self.assertEqual(duplicate["reward"], {"coins": 0, "diamonds": 0})
            self.assertEqual(duplicate["wallet"], first["wallet"])
        self.store.close()
        self.store = self.make_store()
        self.assertTrue(self.claim("math")["alreadyClaimed"])
        self.assertEqual(len(self.rows("island_reward_claims")), 1)
        self.assertEqual(len(self.rows("wallet_ledger")), 1)
        self.assertEqual(int(self.store._meta("revision")), revision+1)
        self.assertEqual(self.store.arcade_state(NOW)["available"], 6)

    def test_precise_threshold_never_uses_rounded_minutes_or_percentage(self):
        identity = self.add("math", 179.99999)
        self.assertEqual(self.gift()["minutes"], 180)
        self.assertFalse(self.gift()["eligible"])
        with self.assertRaises(ValueError):
            self.claim("math")
        with self.store.db:
            self.store.db.execute("UPDATE records SET minutes=? WHERE id=?", (180, identity))
        self.assertTrue(self.gift()["available"])
        self.claim("math")

    def test_seconds_accumulate_without_flooring_each_record(self):
        self.add("math", 179+59/60)
        self.assertFalse(self.gift()["available"])
        self.add("math", 1/60)
        self.assertTrue(self.gift()["available"])
        self.claim("math")

    def test_future_end_and_deleted_records_do_not_unlock(self):
        self.add("math", 180, NOW+timedelta(seconds=1))
        identity = self.add("cs", 180)
        with self.store.db:
            self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (identity, NOW.isoformat(), "test", "trash"))
        self.assertFalse(self.gift("math")["eligible"])
        self.assertFalse(self.gift("cs")["eligible"])
        with self.assertRaises(ValueError):
            self.claim("math")
        self.assertTrue(self.gift("math", NOW+timedelta(seconds=1))["eligible"])
        with self.store.db:
            self.store.db.execute("UPDATE record_lifecycle SET deleted_at=NULL WHERE record_id=?", (identity,))
        self.assertTrue(self.gift("cs")["eligible"])

    def test_earned_gift_survives_deleted_and_restored_study(self):
        identity = self.add("math", 180)
        self.claim("math")
        with self.store.db:
            self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (identity, NOW.isoformat(), "test", "trash"))
        self.assertFalse(self.gift()["eligible"])
        self.assertTrue(self.gift()["claimed"])
        self.assertTrue(self.claim("math")["alreadyClaimed"])
        with self.store.db:
            self.store.db.execute("DELETE FROM record_lifecycle WHERE record_id=?", (identity,))
        self.assertTrue(self.gift()["eligible"])
        self.assertFalse(self.gift()["available"])
        self.assertEqual(self.store._wallet(), {"coins": 30, "diamonds": 1})

    def test_npc_goal_snapshot_controls_unlock_but_changes_never_reset_claim(self):
        self.add("math", 170)
        self.assertFalse(self.gift()["available"])
        self.store.set_daily_goal(dict(TARGETS, math=160), DAY, str(uuid.uuid4()), NOW)
        self.assertEqual(self.gift()["target"], 160)
        self.assertTrue(self.gift()["available"])
        self.claim("math")
        self.store.set_daily_goal(dict(TARGETS, math=200), DAY, str(uuid.uuid4()), NOW)
        self.assertFalse(self.gift()["eligible"])
        self.assertTrue(self.claim("math")["alreadyClaimed"])
        self.add("math", 30)
        self.assertTrue(self.gift()["eligible"])
        self.assertFalse(self.gift()["available"])
        self.assertEqual(self.store._wallet(), {"coins": 30, "diamonds": 1})

    def test_history_is_read_only_and_midnight_rejects_stale_click(self):
        self.complete_all()
        self.claim("math")
        tomorrow = NOW.replace(hour=0, minute=0)+timedelta(days=1)
        historical = self.store.island_rewards_state(DAY, tomorrow)
        self.assertFalse(historical["isToday"])
        self.assertEqual(historical["availableCount"], 0)
        self.assertTrue(historical["main"]["eligible"])
        self.assertTrue(historical["subjects"][0]["claimed"])
        # Test both an unclaimed old gift and the already-claimed old gift.
        for island in ("math", "cs", "main"):
            with self.assertRaisesRegex(ValueError, "日期已变化"):
                self.store.claim_island_reward(DAY, island, tomorrow)
        self.assertEqual(self.store.island_rewards_state(now=tomorrow)["availableCount"], 0)
        self.complete_all(tomorrow+timedelta(hours=18))
        self.claim("math", tomorrow+timedelta(hours=18))
        self.assertEqual(self.store._wallet(), {"coins": 60, "diamonds": 2})

    def test_local_midnight_not_utc_midnight_defines_claim_day(self):
        before_midnight = NOW.replace(hour=23, minute=59, second=59)
        self.add("math", 180)
        self.claim("math", before_midnight)
        after_midnight = before_midnight+timedelta(seconds=1)
        self.assertEqual(before_midnight.astimezone(timezone.utc).date(), after_midnight.astimezone(timezone.utc).date())
        with self.assertRaisesRegex(ValueError, "日期已变化"):
            self.store.claim_island_reward(DAY, "math", after_midnight)

    def test_unmapped_study_and_quest_progress_cannot_substitute_for_subjects(self):
        self.add("绘画", 600)
        self.store.accept_quest("math", NOW)
        self.assertEqual(self.store.island_rewards_state(now=NOW)["availableCount"], 0)
        with self.assertRaises(ValueError):
            self.claim("main")
        self.store.update_settings({"mapping": {"绘画": "math"}})
        self.assertTrue(self.gift()["available"])
        self.assertFalse(self.gift("main")["available"])

    def test_state_and_polling_never_write_gift_or_ledger_records(self):
        self.complete_all()
        # Existing startup/day maintenance has completed before measuring.
        self.store.state(now=NOW)
        before, changes = self.snapshot(), self.store.db.total_changes
        for _ in range(12):
            current = self.store.state(now=NOW)
            self.assertEqual(current["islandRewards"]["availableCount"], 5)
        self.assertEqual(self.store.db.total_changes, changes)
        self.assertEqual(self.snapshot(), before)

    def test_invalid_keys_and_days_are_rejected_without_writes(self):
        self.complete_all()
        before = self.snapshot()
        for day in (None, [], True, "20260928", "2026-9-28", "2026-09-29", "2026-09-27"):
            with self.subTest(day=day), self.assertRaises(ValueError):
                self.store.claim_island_reward(day, "math", NOW)
        for island in (None, [], {}, True, "", "Math", "all", "other"):
            with self.subTest(island=island), self.assertRaises(ValueError):
                self.store.claim_island_reward(DAY, island, NOW)
        self.assertEqual(self.snapshot(), before)

    def test_failed_ledger_write_rolls_back_claim_and_revision(self):
        self.complete_all()
        with self.store.db:
            self.store.db.execute("""CREATE TRIGGER reject_gift BEFORE INSERT ON wallet_ledger
                WHEN NEW.reference LIKE 'island-gift:%' BEGIN SELECT RAISE(ABORT,'fixture failure'); END""")
        before = self.snapshot()
        with self.assertRaises(sqlite3.IntegrityError):
            self.claim("main")
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(self.gift("main")["available"])
        with self.store.db:
            self.store.db.execute("DROP TRIGGER reject_gift")
        self.assertFalse(self.claim("main")["alreadyClaimed"])

    def test_concurrent_connections_only_credit_one_claim(self):
        self.complete_all()
        self.assertEqual(self.store.arcade_state(NOW)["available"], 8)
        revision = self.store.revision
        second = self.make_store()
        self.addCleanup(second.close)
        barrier = threading.Barrier(2)
        def claim(store):
            barrier.wait()
            return store.claim_island_reward(DAY, "main", NOW)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, (self.store, second)))
        self.assertEqual(sorted(result["alreadyClaimed"] for result in results), [False, True])
        self.assertEqual(sum(result["reward"]["coins"] for result in results), 100)
        self.assertEqual(self.store._wallet(), {"coins": 100, "diamonds": 4})
        self.assertEqual(len(self.rows("island_reward_claims")), 1)
        self.assertEqual(int(self.store._meta("revision")), revision+1)
        self.assertEqual(self.store.arcade_state(NOW)["available"], 8)

    def test_day_is_checked_after_waiting_for_transaction(self):
        self.add("math", 180)
        after_midnight = (NOW+timedelta(days=1)).replace(hour=0)
        # Production resolves quest_clock inside the write transaction, not
        # from the stale day or browser-provided timestamp in the request.
        def clock(value=None):
            self.assertTrue(self.store.db.in_transaction)
            return value or after_midnight
        with patch.object(server, "quest_clock", side_effect=clock), self.assertRaisesRegex(ValueError, "日期已变化"):
            self.store.claim_island_reward(DAY, "math")
        self.assertEqual(self.rows("island_reward_claims"), [])


class IslandRewardHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.clock = patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW)
        self.clock.start()
        self.store = server.FocusStore(Path(self.temp.name)/"data", Path(self.temp.name)/"unused.json")
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES ('math','math','数学',180,?,?,?,'tomatodo')",
                (int((NOW-timedelta(hours=3)).timestamp()*1000), int(NOW.timestamp()*1000), DAY))
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

    def request(self, payload, path="/api/island-rewards/claim", origin=None):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.request("POST", path, json.dumps(payload), headers={"Content-Type": "application/json",
            "Origin": origin or f"http://127.0.0.1:{self.port}"})
        response = conn.getresponse()
        result = response.status, json.loads(response.read())
        conn.close()
        return result

    def test_claim_contract_and_idempotent_response(self):
        status, first = self.request({"day": DAY, "island": "math"})
        self.assertEqual(status, 200)
        self.assertEqual(first["reward"], {"coins": 30, "diamonds": 1})
        self.assertEqual((first["day"], first["island"]), (DAY, "math"))
        self.assertFalse(first["alreadyClaimed"])
        status, retry = self.request({"day": DAY, "island": "math"})
        self.assertEqual(status, 200)
        self.assertEqual(retry["reward"], {"coins": 0, "diamonds": 0})
        self.assertTrue(retry["alreadyClaimed"])
        self.assertEqual(retry["wallet"], first["wallet"])

    def test_strict_payload_ignores_no_reward_or_clock_injections(self):
        valid = {"day": DAY, "island": "math"}
        for payload in ({}, [], None, {"day": DAY}, {"island": "math"},
                        dict(valid, coins=300), dict(valid, diamonds=10), dict(valid, now=NOW.isoformat()),
                        dict(valid, requestId=str(uuid.uuid4())), dict(valid, island=[]), dict(valid, day=False)):
            with self.subTest(payload=payload):
                self.assertEqual(self.request(payload)[0], 400)
        self.assertEqual(self.request(valid, "/api/island-rewards/claim?coins=300")[0], 400)
        self.assertEqual(self.request(valid, origin="https://untrusted.example")[0], 403)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_unavailable_or_stale_request_returns_error_without_wallet_change(self):
        self.assertEqual(self.request({"day": DAY, "island": "main"})[0], 400)
        self.assertEqual(self.request({"day": "2026-09-27", "island": "math"})[0], 400)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})


if __name__ == "__main__":
    unittest.main()
