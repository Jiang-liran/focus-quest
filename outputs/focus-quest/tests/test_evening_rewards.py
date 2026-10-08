"""Evening study is an extra, atomic reward; never spends ordinary study time."""
import importlib.util
import json
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("evening_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
TZ = timezone(timedelta(hours=8))
DAY = "2026-10-03"
START = datetime(2026, 10, 3, 17, tzinfo=TZ)


def at(hour=0, minute=0, *, days=0):
    return START.replace(hour=hour, minute=minute) + timedelta(days=days)


def ms(value):
    return int(value.timestamp() * 1000)


class EveningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.source = Path(self.temp.name) / "absent.json"
        self.store = self.make_store()

    def make_store(self, now=START):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or now):
            return server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, name="数学听课", start=None, end=None, minutes=None, source="tomatodo"):
        start, end = start or at(18), end or at(18, 45)
        minutes = (end - start).total_seconds() / 60 if minutes is None else minutes
        identity = str(uuid.uuid4())
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", (
                identity, identity, name, minutes, ms(start), ms(end), end.date().isoformat(), source))
        return identity

    def state(self, now=None):
        return self.store.evening_gifts_state(now or at(23, 59))

    def claim(self, index=1, day=DAY, now=None):
        return self.store.claim_evening_gift(day, index, now or at(23, 59))

    def wallet(self):
        return self.store._wallet()

    def test_window_boundaries_and_30_minute_threshold(self):
        self.add(start=at(17), end=at(18))
        self.assertEqual(self.state(at(18))["minutes"], 0)
        self.add(start=at(18), end=at(18, 29))
        self.assertEqual(self.state(at(18, 29))["availableCount"], 0)
        self.add(start=at(18, 29), end=at(18, 30))
        self.assertEqual(self.state(at(18, 30))["availableCount"], 1)
        self.assertEqual(self.state(at(17))["status"], "upcoming")
        self.assertEqual(self.state(at(18))["status"], "active")

    def test_clips_18_and_midnight_and_assigns_to_learning_day(self):
        self.add(start=at(17, 30), end=at(18, 30))
        self.add(start=at(23, 30), end=at(0, 30, days=1))
        state = self.state(at(1, days=1))
        self.assertEqual(state["minutes"], 0)
        self.assertEqual(state["pendingDays"][0]["day"], DAY)
        self.assertEqual(state["pendingDays"][0]["minutes"], 60)
        self.assertEqual(state["pendingDays"][0]["availableCount"], 2)

    def test_pause_prorated_wall_span_cap_and_zero_span(self):
        self.add(start=at(17), end=at(19), minutes=60)
        self.add(start=at(19), end=at(19, 30), minutes=300)
        self.add(start=at(20), end=at(20), minutes=100)
        self.assertEqual(self.state()["minutes"], 60)

    def test_overlap_union_caps_simultaneous_subjects_and_different_densities(self):
        self.add(start=at(18), end=at(19), minutes=30)
        self.add("408做题", start=at(18, 30), end=at(19, 30))
        # First half hour at 50%, then a full hour at 100%.
        self.assertEqual(self.state()["minutes"], 75)

    def test_four_subjects_and_words_count_without_accepting_quests(self):
        for name, minute in (("数学听课", 0), ("408做题", 15), ("政治复习", 30), ("背单词", 45)):
            self.add(name, at(18, minute), at(18, minute) + timedelta(minutes=15))
        self.assertEqual(self.state()["minutes"], 60)
        self.assertFalse(self.store.db.execute("SELECT 1 FROM quest_acceptances").fetchone())

    def test_future_completed_record_not_counted_until_end_even_on_cache_hit(self):
        self.add(start=at(18), end=at(20))
        self.assertEqual(self.state(at(19))["minutes"], 0)
        self.assertEqual(self.state(at(19, 59))["minutes"], 0)
        self.assertEqual(self.state(at(20))["minutes"], 120)

    def test_unclassified_history_and_deleted_records_excluded(self):
        self.add("洗碗", at(18), at(19))
        self.add(start=at(19), end=at(20), source=server.HISTORY_SOURCE)
        identity = self.add(start=at(20), end=at(21))
        self.store.move_record(identity)
        self.assertEqual(self.state()["minutes"], 0)

    def test_read_never_awards_and_five_base_two_optional_stages(self):
        self.add(start=at(17), end=at(1, days=1))
        state = self.state(at(1, days=1))["pendingDays"][0]
        self.assertEqual(state["minutes"], 360)
        self.assertEqual(state["availableCount"], 7)
        self.assertEqual([g["target"] for g in state["gifts"]], [30, 60, 90, 120, 150, 185, 220])
        self.assertEqual(self.wallet(), {"coins": 0, "diamonds": 0})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM lottery_ticket_ledger").fetchone()[0], 0)

    def test_all_rewards_increase_match_receipts_and_retry_once(self):
        self.add(start=at(18), end=at(0, days=1))
        now = at(0, days=1)
        for index, values in enumerate(server.EVENING_GIFTS, 1):
            first = self.claim(index, now=now)
            self.assertFalse(first["alreadyClaimed"])
            self.assertEqual(first["reward"], dict(zip(("coins", "diamonds"), values[:2])))
            self.assertEqual(first["lotteryTickets"], dict(zip(("coinTickets", "diamondTickets"), values[2:])))
            self.assertEqual(sum(g["count"] for g in first["ticketGrants"]), sum(values[2:]))
            again = self.claim(index, now=now)
            self.assertTrue(again["alreadyClaimed"])
            self.assertEqual(again["ticketGrants"], [])
        self.assertEqual(self.wallet(), {"coins": 520, "diamonds": 18})
        self.assertEqual(self.store.lottery_state(now)["tickets"], {"coin": 8, "diamond": 5})
        self.assertEqual(self.state(now)["pendingDays"], [])

    def test_two_and_half_hours_finish_all_base_rewards_with_breaks_optional_extras_separate(self):
        self.add(start=at(18), end=at(19))
        self.add("背单词", start=at(19, 30), end=at(20, 30))
        self.add("408做题", start=at(21), end=at(21, 30))
        state = self.state(at(21, 30))
        self.assertEqual(state["minutes"], 150)
        self.assertEqual((state["baseCount"], state["baseTarget"]), (5, 150))
        self.assertEqual([g["tier"] for g in state["gifts"]], ["base"] * 5 + ["extra"] * 2)
        self.assertEqual(state["availableCount"], 5)
        for index in range(1, 6):
            self.claim(index, now=at(21, 30))
        self.assertEqual(self.wallet(), {"coins": 300, "diamonds": 9})
        self.assertEqual(self.store.lottery_state(at(21, 30))["tickets"], {"coin": 4, "diamond": 2})
        self.add(start=at(21, 30), end=at(22, 15))
        self.assertEqual(self.state(at(22, 15))["gifts"][5]["available"], True)
        self.assertEqual(self.state(at(22, 15))["gifts"][6]["available"], False)

    def test_unearned_invalid_and_future_claims_write_nothing(self):
        for day, index in ((DAY, 1), (DAY, 0), (DAY, 8), (DAY, True), (DAY, "1"), ("2026-10-04", 1), ("2026-10-02", 1), ("broken", 1)):
            with self.assertRaises(ValueError):
                self.claim(index, day)
        self.assertEqual(self.wallet(), {"coins": 0, "diamonds": 0})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM evening_gift_claims").fetchone()[0], 0)

    def test_restart_preserves_epoch_rewards_and_pending_days(self):
        self.add(start=at(18), end=at(19))
        self.claim()
        self.store.close()
        self.store = self.make_store(at(12, days=1))
        state = self.state(at(12, days=1))
        self.assertEqual(state["featureStartMs"], ms(at(0)))
        self.assertEqual(state["pendingDays"][0]["availableCount"], 1)
        self.claim(2, now=at(12, days=1))
        self.assertEqual(self.wallet(), {"coins": 90, "diamonds": 2})

    def test_old_history_not_backfilled_but_installation_day_counts(self):
        self.add(start=at(18, days=-1), end=at(21, days=-1))
        self.add()
        self.assertEqual(self.state()["availableCount"], 1)
        self.assertEqual(self.state()["pendingDays"], [])

    def test_late_sync_pending_receipts_not_expired_and_tails_do_not_carry(self):
        self.add(start=at(18), end=at(18, 25))
        self.add(start=at(18, days=1), end=at(18, 10, days=1))
        self.assertEqual(self.state(at(21, days=1))["availableCount"], 0)
        self.assertEqual(self.state(at(21, days=1))["pendingDays"], [])
        self.add(start=at(18, 25), end=at(18, 30))
        self.assertEqual(self.state(at(21, days=3))["pendingDays"][0]["availableCount"], 1)
        self.claim(now=at(21, days=3))
        self.assertEqual(self.wallet()["coins"], 40)

    def test_frozen_valid_time_survives_source_deletion_without_double_counting(self):
        identity = self.add(start=at(18), end=at(19, 30))
        self.claim()
        self.store.move_record(identity)
        self.assertEqual(self.state()["minutes"], 90)
        self.add("408做题", start=at(19), end=at(20))
        self.assertEqual(self.state()["minutes"], 120)
        self.claim(2)
        self.assertEqual(self.wallet()["coins"], 90)

    def test_unclaimed_changed_or_deleted_time_no_longer_unlocks(self):
        identity = self.add()
        self.assertEqual(self.state()["availableCount"], 1)
        with self.store.db:
            self.store.db.execute("UPDATE records SET name='洗碗' WHERE id=?", (identity,))
        self.assertEqual(self.state()["availableCount"], 0)

    def test_clock_rollback_cannot_unlock_using_future_frozen_evidence(self):
        identity = self.add(start=at(18), end=at(19, 30))
        self.claim(1, now=at(20))
        self.store.move_record(identity)
        with self.assertRaises(ValueError):
            self.claim(2, now=at(19))
        self.claim(2, now=at(20))
        self.assertEqual(self.wallet()["coins"], 90)

    def test_failed_ticket_grant_rolls_back_wallet_claim_and_cache(self):
        self.add(start=at(18), end=at(21))
        revision = self.store.revision
        with patch.object(self.store, "_grant_lottery_ticket", return_value=None):
            with self.assertRaises(ValueError):
                self.claim(4)
        self.assertEqual(self.wallet()["coins"], 0)
        self.assertEqual(self.store.revision, revision)
        self.assertFalse(self.state()["gifts"][3]["claimed"])
        self.claim(4)
        self.assertEqual(self.wallet()["coins"], 70)

    def test_cross_connection_concurrent_claim_grants_exactly_once(self):
        self.add(start=at(18), end=at(21))
        other = self.make_store()
        self.addCleanup(other.close)
        barrier = threading.Barrier(2)
        def opening(store):
            barrier.wait()
            return store.claim_evening_gift(DAY, 4, at(21))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(opening, (self.store, other)))
        self.assertEqual(sum(not result["alreadyClaimed"] for result in results), 1)
        self.assertEqual(self.wallet(), {"coins": 70, "diamonds": 2})
        self.assertEqual(self.store.lottery_state(at(21))["tickets"], {"coin": 1, "diamond": 1})

    def test_ordinary_commissions_continue_and_each_reward_keeps_its_time(self):
        self.store.accept_quest("math", at(18))
        self.add(start=at(18), end=at(19, 30))
        self.claim(2, now=at(19, 30))
        quest = next(q for q in self.store.quest_state(at(19, 30))["quests"] if q["subject"] == "math")
        self.assertEqual(quest["minutes"], 90)
        self.store.submit_quest("math", at(19, 30), request_id=str(uuid.uuid4()))
        self.assertEqual(self.state(at(19, 30))["minutes"], 90)
        self.assertTrue(self.state(at(19, 30))["gifts"][0]["available"])

    def test_cache_skips_record_scan_and_detects_other_connection_edits(self):
        self.add()
        self.state(at(19))
        queries = []
        self.store.db.set_trace_callback(queries.append)
        for _ in range(10):
            self.state(at(19, 1))
        self.assertFalse(any("SELECT r.* FROM records" in query for query in queries))
        other = self.make_store()
        try:
            with other.db:
                other.db.execute("UPDATE records SET minutes=1")
        finally:
            other.close()
        self.assertEqual(self.state(at(19, 2))["minutes"], 1)


class EveningHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.clock = patch.object(server, "quest_clock", side_effect=lambda value=None: value or at(21))
        self.clock.start()
        self.store = server.FocusStore(Path(self.temp.name) / "data", Path(self.temp.name) / "unused.json")
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", ("fixture", "fixture", "背单词", 180, ms(at(18)), ms(at(21)), DAY, "tomatodo"))
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

    def request(self, payload=None, path="/api/quests/evening/claim", method="POST", origin=None):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.request(method, path, json.dumps(payload) if method == "POST" else None, headers={"Content-Type": "application/json", "Origin": origin or f"http://127.0.0.1:{self.port}"})
        response = conn.getresponse()
        status, result = response.status, json.loads(response.read())
        conn.close()
        return status, result

    def test_contract_returns_authoritative_quests_wallet_and_tickets(self):
        status, result = self.request({"day": DAY, "index": 4})
        self.assertEqual(status, 200)
        self.assertEqual(result["quests"]["wallet"], {"coins": 70, "diamonds": 2})
        self.assertEqual(result["quests"]["lottery"]["tickets"], {"coin": 1, "diamond": 1})
        self.assertTrue(result["quests"]["evening"]["gifts"][3]["claimed"])
        self.assertTrue(self.request({"day": DAY, "index": 4})[1]["alreadyClaimed"])

    def test_strict_payload_query_index_and_origin_guards(self):
        for payload in ({"day": DAY}, {"day": DAY, "index": True}, {"day": DAY, "index": 9}, {"day": DAY, "index": "4"}, {"day": DAY, "index": 1, "coins": 999}):
            self.assertEqual(self.request(payload)[0], 400)
        self.assertEqual(self.request({"day": DAY, "index": 1}, path="/api/quests/evening/claim?coins=999")[0], 400)
        self.assertEqual(self.request({"day": DAY, "index": 1}, origin="https://example.com")[0], 403)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM evening_gift_claims").fetchone()[0], 0)

    def test_get_exposes_evening_without_minting(self):
        status, result = self.request(path="/api/quests", method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(result["evening"]["availableCount"], 5)
        self.assertEqual(result["wallet"], {"coins": 0, "diamonds": 0})


if __name__ == "__main__":
    unittest.main()
