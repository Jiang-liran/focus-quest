"""Survivor real-time admission, authoritative time, retirement and ticket economy."""
import importlib.util
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPConnection
from unittest.mock import patch

from tests.test_arcade import solve_mirrors

spec = importlib.util.spec_from_file_location("arcade_expansion_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 25, 18, 0, tzinfo=timezone(timedelta(hours=8)))


def identity():
    return str(uuid.uuid4())


class ArcadeExpansionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)/"data"
        self.source = Path(self.temp.name)/"no-import.json"
        self.store = server.FocusStore(self.data, self.source)
        self.add_study(NOW, 240)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add_study(self, now, minutes):
        ident = identity()
        end = now-timedelta(minutes=1)
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", (ident, ident, "数学", minutes,
                int((end-timedelta(minutes=minutes)).timestamp()*1000), int(end.timestamp()*1000), now.date().isoformat(), "tomatodo"))
        return ident

    def fund(self, coins):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,0,0)", (identity(), coins))

    def reopen(self):
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)

    def start(self, now=NOW, request_id=None):
        return self.store.start_arcade("star-survivor", request_id or identity(), now)["active"]

    def deploy(self, active=None, now=NOW):
        active = active or self.start(now)
        return self.store.pulse_arcade(active["id"], active["version"],
            {"kind": "deploy", "hero": "ranger", "arena": "glade"}, now)["active"]

    @staticmethod
    def tick(speed=1):
        return {"kind": "tick", "dx": 1, "dy": 0, "speed": speed}

    def assert_public_only(self, value):
        def walk(item):
            if isinstance(item, dict):
                self.assertFalse(any(str(key).startswith("_") for key in item), item.keys())
                for child in item.values(): walk(child)
            elif isinstance(item, list):
                for child in item: walk(child)
        walk(value)
        encoded = json.dumps(value, ensure_ascii=False)
        for row in self.store.db.execute("SELECT seed FROM arcade_sessions"):
            self.assertNotIn(row["seed"], encoded)

    def test_survivor_start_retry_and_reload_preserve_deadline_and_private_state(self):
        request_id = identity()
        active = self.start(request_id=request_id)
        self.assertEqual(active, self.start(request_id=request_id))
        self.assertEqual(active["state"]["phase"], "prepare")
        self.reopen()
        restored = self.store.arcade_state(NOW)["active"]
        self.assertEqual(active, restored)
        self.assert_public_only(self.store.arcade_state(NOW))

    def test_removed_games_cannot_start_but_old_history_wallet_and_spent_ticket_survive(self):
        for venue, kind in (("star-voyage", "voyage"), ("rune-table", "dice")):
            with self.assertRaises(ValueError): self.store.start_arcade(venue, identity(), NOW)
            old_rules = getattr(server.arcade_rules, kind+"_rules")
            state, limit = old_rules.create("archive")
            sid = identity()
            with self.store.db:
                self.store.db.execute("""INSERT INTO arcade_sessions
                    (id,request_id,day,venue,game_type,seed,started_at,expires_at,status,game_state,max_steps,result,ended_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", (sid, identity(), NOW.date().isoformat(), venue, kind,
                    "archive", NOW.isoformat(), (NOW+timedelta(seconds=240)).isoformat(), "won", json.dumps(state), limit,
                    json.dumps({"won": True, "score": 100, "medal": 1, "coins": 12, "diamonds": 1}), NOW.isoformat()))
                self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,12,1,0)", ("arcade:"+sid,))
        self.reopen()
        snapshot = self.store.arcade_state(NOW)
        self.assertEqual(snapshot["used"], 2)
        self.assertEqual(snapshot["available"], 6)
        self.assertEqual(snapshot["rewardToday"], {"coins": 24, "diamonds": 2})
        self.assertEqual(snapshot["wallet"], {"coins": 24, "diamonds": 2})
        self.assertEqual(len(snapshot["history"]), 2)
        self.assertFalse({"star-voyage", "rune-table"} & {v["id"] for v in snapshot["venues"]})
        self.assertEqual(snapshot["collection"], {"weapons": [], "evolutions": [], "heroes": []})

    def test_retired_active_round_is_archived_without_rewards_or_ticket_refund(self):
        state, limit = server.arcade_rules.voyage_rules.create(1)
        sid = identity()
        with self.store.db:
            self.store.db.execute("""INSERT INTO arcade_sessions
                (id,request_id,day,venue,game_type,seed,started_at,expires_at,status,game_state,max_steps)
                VALUES (?,?,?,'star-voyage','voyage','old',?,?,'active',?,?)""", (sid, identity(), NOW.date().isoformat(),
                NOW.isoformat(), (NOW+timedelta(seconds=240)).isoformat(), json.dumps(state), limit))
        snapshot = self.store.arcade_state(NOW)
        self.assertIsNone(snapshot["active"])
        self.assertEqual(snapshot["lastResult"]["status"], "abandoned")
        self.assertEqual(snapshot["used"], 1)
        self.assertEqual(snapshot["wallet"], {"coins": 0, "diamonds": 0})
        self.assertEqual(snapshot, self.store.arcade_state(NOW))

    def test_pulse_is_lightweight_and_duplicate_does_not_simulate_again(self):
        active = self.deploy()
        now = NOW+timedelta(seconds=.1)
        reply = self.store.pulse_arcade(active["id"], active["version"], self.tick(), now)
        self.assertEqual(set(reply), {"compact", "today", "now", "active", "revision", "available",
                                     "persistentTickets", "playsRemaining", "canPlay"})
        self.assertEqual(reply, self.store.pulse_arcade(active["id"], active["version"], self.tick(), now))
        with self.assertRaises(ValueError):
            self.store.pulse_arcade(active["id"], active["version"], self.tick(2), now)
        self.assertEqual(reply["active"], self.store.arcade_state(now)["active"])
        self.assert_public_only(reply)

    def test_server_injects_elapsed_and_never_trusts_client_clock_or_rewards(self):
        active = self.deploy()
        before = self.store.arcade_state(NOW)
        for field in ("elapsed", "dt", "time", "score", "coins", "diamonds", "_elapsed"):
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.store.pulse_arcade(active["id"], active["version"], dict(self.tick(), **{field: 999}), NOW+timedelta(seconds=1))
        self.assertEqual(before, self.store.arcade_state(NOW))
        real_move = server.arcade_rules.move
        with patch.object(server.arcade_rules, "move", wraps=real_move) as engine:
            reply = self.store.pulse_arcade(active["id"], active["version"], self.tick(2), NOW+timedelta(seconds=.2))
            self.assertAlmostEqual(engine.call_args.args[-1]["elapsed"], .2, places=5)
            active = reply["active"]
            self.store.pulse_arcade(active["id"], active["version"], self.tick(2), NOW+timedelta(seconds=8))
            self.assertEqual(engine.call_args.args[-1]["elapsed"], .5)

    def test_non_tick_actions_reset_elapsed_and_clock_reversal_never_adds_time(self):
        active = self.deploy(now=NOW+timedelta(seconds=10))
        paused = self.store.pulse_arcade(active["id"], active["version"], {"kind": "pause", "paused": True}, NOW+timedelta(seconds=11))["active"]
        resumed = self.store.pulse_arcade(paused["id"], paused["version"], {"kind": "pause", "paused": False}, NOW+timedelta(seconds=20))["active"]
        real_move = server.arcade_rules.move
        with patch.object(server.arcade_rules, "move", wraps=real_move) as engine:
            reply = self.store.pulse_arcade(resumed["id"], resumed["version"], self.tick(), NOW+timedelta(seconds=19))
            self.assertEqual(engine.call_args.args[-1]["elapsed"], 0)
            active = reply["active"]
            self.store.pulse_arcade(active["id"], active["version"], self.tick(), NOW+timedelta(seconds=20.1))
            self.assertAlmostEqual(engine.call_args.args[-1]["elapsed"], .1, places=5)

    def test_two_times_speed_advances_simulation_twice_without_extending_deadline(self):
        active = self.deploy()
        deadline = active["expiresAt"]
        active = self.store.pulse_arcade(active["id"], active["version"], self.tick(), NOW+timedelta(seconds=.1))["active"]
        self.assertAlmostEqual(active["state"]["time"], .1, places=5)
        active = self.store.pulse_arcade(active["id"], active["version"], self.tick(2), NOW+timedelta(seconds=.2))["active"]
        self.assertAlmostEqual(active["state"]["time"], .3, places=5)
        active = self.store.pulse_arcade(active["id"], active["version"], self.tick(2), NOW+timedelta(seconds=.2))["active"]
        self.assertAlmostEqual(active["state"]["time"], .3, places=5)
        self.assertEqual(active["expiresAt"], deadline)

    def test_completed_survivor_build_enters_collection_only_after_round_ends(self):
        active = self.deploy()
        before = self.store.arcade_state(NOW)
        self.assertEqual(before["collection"], {"weapons": [], "evolutions": [], "heroes": []})
        snapshot = self.store.finish_arcade(active["id"], active["version"], NOW)
        self.assertTrue(snapshot["collection"]["weapons"])
        hero = snapshot["collection"]["heroes"][0]
        self.assertEqual((hero["id"], hero["wins"]), ("ranger", 0))
        self.assertNotEqual(hero["name"], "ranger")
        self.reopen()
        self.assertEqual(snapshot, self.store.arcade_state(NOW))
        self.assert_public_only(snapshot)

    def test_pulse_rejects_old_game_types_and_stale_version(self):
        active = self.store.start_arcade("mist-camp", identity(), NOW)["active"]
        with self.assertRaises(ValueError): self.store.pulse_arcade(active["id"], 1, {"scan": True}, NOW)
        self.store.finish_arcade(active["id"], 1, NOW)
        active = self.deploy()
        with self.assertRaises(ValueError): self.store.pulse_arcade(active["id"], 99, self.tick(), NOW)
        self.assertEqual(active, self.store.arcade_state(NOW)["active"])

    def test_expiry_and_midnight_return_full_snapshot_without_rewards(self):
        for now in (NOW, NOW+timedelta(days=1, hours=5, minutes=59, seconds=30)):
            self.add_study(now, 30)
            active = self.deploy(now=now)
            deadline = datetime.fromisoformat(active["expiresAt"])
            snapshot = self.store.pulse_arcade(active["id"], active["version"], self.tick(2), deadline)
            self.assertNotIn("compact", snapshot)
            self.assertIsNone(snapshot["active"])
            self.assertEqual(snapshot["lastResult"]["status"], "expired")
            self.assertEqual(snapshot["lastResult"]["result"]["coins"], 0)
            self.assertEqual(snapshot["wallet"], {"coins": 0, "diamonds": 0})
            if now.hour == 23:
                self.assertEqual((snapshot["used"], snapshot["available"]), (0, 7))

    def win_survivor_fixture(self, *, kills=800, level=21, boss=True):
        active = self.deploy()
        # Begin immediately before the actual simulation's survival boundary.
        # The real tick still decides the outcome; no client result is accepted.
        state = json.loads(self.store.db.execute("SELECT game_state FROM arcade_sessions WHERE id=?", (active["id"],)).fetchone()[0])
        state.update(time=179.95, kills=kills, level=level, _bossKilled=boss)
        state["stats"]["kills"] = kills
        state["player"]["invulnerable"] = 1
        with self.store.db:
            self.store.db.execute("UPDATE arcade_sessions SET game_state=? WHERE id=?", (json.dumps(state), active["id"]))
        action = self.tick(2)
        now = NOW+timedelta(seconds=.1)
        snapshot = self.store.pulse_arcade(active["id"], active["version"], action, now)
        self.assertIsNone(snapshot["active"])
        self.assertEqual(snapshot["lastResult"]["status"], "won")
        self.assertEqual(snapshot, self.store.pulse_arcade(active["id"], active["version"], action, now))
        self.assertEqual(snapshot, self.store.finish_arcade(active["id"], active["version"], now))
        return snapshot

    def test_survivor_reward_components_thresholds_and_daily_caps(self):
        breakdown, gross = self.store._survivor_reward({"kills": 39, "level": 2, "bossKilled": False}, True)
        self.assertEqual(gross, {"coins": 20, "diamonds": 1})
        self.assertEqual(self.store._survivor_reward({"kills": 40, "level": 3}, True)[1], {"coins": 22, "diamonds": 1})
        self.assertEqual(self.store._survivor_reward({"kills": 800, "level": 20, "bossKilled": False}, True)[1], {"coins": 49, "diamonds": 2})
        self.assertEqual(self.store._survivor_reward({"kills": 99999, "level": 999, "bossKilled": True}, True)[1], {"coins": 60, "diamonds": 3})
        rewards = [self.win_survivor_fixture()["lastResult"]["result"] for _ in range(3)]
        self.assertEqual([(r["coins"], r["diamonds"]) for r in rewards], [(60, 3), (60, 3), (0, 0)])
        for result in rewards:
            self.assertEqual(result["grossReward"], {"coins": 60, "diamonds": 3})
            self.assertEqual(sum(row["coins"] for row in result["rewardBreakdown"]), 60)
            self.assertEqual(sum(row["diamonds"] for row in result["rewardBreakdown"]), 3)
        self.assertEqual(self.store._wallet(), {"coins": 120, "diamonds": 6})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger WHERE reference LIKE 'arcade:%'").fetchone()[0], 3)
        self.assertEqual(self.store.arcade_state(NOW+timedelta(seconds=1))["collection"]["heroes"][0]["wins"], 3)

    def test_old_and_survivor_games_share_caps_with_honest_partial_receipt(self):
        for _ in range(5):
            active = self.store.start_arcade("mirror-gallery", identity(), NOW)["active"]
            solution = solve_mirrors(active["state"])
            rotations = [m["id"] for m in active["state"]["mirrors"] if m["orientation"] != solution[m["id"]]]
            for mirror in rotations:
                snapshot = self.store.move_arcade(active["id"], active["version"], {"mirrorId": mirror}, NOW)
                if not snapshot["active"]: break
                active = snapshot["active"]
        snapshot = self.win_survivor_fixture()
        result = snapshot["lastResult"]["result"]
        self.assertEqual(result["grossReward"], {"coins": 60, "diamonds": 3})
        self.assertEqual((result["coins"], result["diamonds"]), (60, 1))
        self.assertEqual(snapshot["rewardToday"], {"coins": 120, "diamonds": 6})

    def test_survivor_natural_loss_pays_zero_even_with_high_score(self):
        active = self.deploy()
        state = json.loads(self.store.db.execute("SELECT game_state FROM arcade_sessions WHERE id=?", (active["id"],)).fetchone()[0])
        state["player"]["hp"] = 1
        state["player"]["invulnerable"] = 0
        state["score"], state["kills"], state["level"] = 99999, 9999, 50
        server.arcade_rules.survivor_rules._spawn(state, "tank")
        state["enemies"][-1].update(x=state["player"]["x"], y=state["player"]["y"])
        with self.store.db:
            self.store.db.execute("UPDATE arcade_sessions SET game_state=? WHERE id=?", (json.dumps(state), active["id"]))
        snapshot = self.store.pulse_arcade(active["id"], active["version"], {"kind": "tick", "dx": 0, "dy": 0, "speed": 1}, NOW+timedelta(seconds=.1))
        self.assertIsNone(snapshot["active"])
        self.assertEqual(snapshot["lastResult"]["status"], "lost")
        result = snapshot["lastResult"]["result"]
        self.assertEqual(result["grossReward"], {"coins": 0, "diamonds": 0})
        self.assertEqual(result["rewardBreakdown"], [])
        self.assertEqual((result["coins"], result["diamonds"]), (0, 0))
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_purchase_cost_retry_and_persistence_do_not_increase_reward_budget(self):
        self.fund(100)
        request = identity()
        snapshot = self.store.buy_arcade_ticket(request, NOW)
        self.assertEqual((snapshot["purchased"], snapshot["purchaseRemaining"], snapshot["available"]), (1, 2, 9))
        self.assertEqual(snapshot["purchasePrice"], 50)
        self.assertEqual(snapshot["wallet"], {"coins": 50, "diamonds": 0})
        self.assertEqual(snapshot["rewardToday"], {"coins": 0, "diamonds": 0})
        self.assertEqual(snapshot, self.store.buy_arcade_ticket(request, NOW))
        self.reopen()
        self.assertEqual(snapshot, self.store.arcade_state(NOW))
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM arcade_ticket_purchases").fetchone()[0], 1)

    def test_purchase_without_study_is_usable_and_day_boundary_expires_tickets(self):
        self.fund(100)
        tomorrow = NOW+timedelta(days=1)
        request = identity()
        snapshot = self.store.buy_arcade_ticket(request, tomorrow)
        self.assertEqual((snapshot["earned"], snapshot["purchased"], snapshot["available"]), (0, 1, 1))
        active = self.start(now=tomorrow)
        self.store.finish_arcade(active["id"], active["version"], tomorrow)
        snapshot = self.store.arcade_state(tomorrow)
        self.assertEqual((snapshot["available"], snapshot["nextTicketMinutes"]), (0, 30))
        after = self.store.buy_arcade_ticket(request, tomorrow+timedelta(days=1))
        self.assertEqual((after["purchased"], after["purchaseRemaining"], after["available"]), (0, 3, 0))
        self.assertEqual(after["wallet"]["coins"], 50)

    def test_purchase_insufficient_and_daily_max_are_atomic(self):
        before = self.store.arcade_state(NOW)
        with self.assertRaisesRegex(ValueError, "金币不足"): self.store.buy_arcade_ticket(identity(), NOW)
        self.assertEqual(before, self.store.arcade_state(NOW))
        self.fund(1000)
        for _ in range(3): snapshot = self.store.buy_arcade_ticket(identity(), NOW)
        self.assertEqual((snapshot["available"], snapshot["purchaseRemaining"]), (11, 0))
        with self.assertRaisesRegex(ValueError, "3 张"): self.store.buy_arcade_ticket(identity(), NOW)
        self.assertEqual(snapshot, self.store.arcade_state(NOW))
        self.assertEqual(snapshot["wallet"]["coins"], 850)

    def test_competing_purchase_connections_never_overspend_or_exceed_three(self):
        self.fund(1000)
        for _ in range(2): self.store.buy_arcade_ticket(identity(), NOW)
        other = server.FocusStore(self.data, self.source)
        barrier = threading.Barrier(2)
        def buy(store):
            barrier.wait()
            try: return store.buy_arcade_ticket(identity(), NOW)
            except ValueError: return None
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                jobs = [pool.submit(buy, store) for store in (self.store, other)]
                self.assertEqual(sum(job.result() is not None for job in jobs), 1)
            snapshot = self.store.arcade_state(NOW)
            self.assertEqual(snapshot["purchased"], 3)
            self.assertEqual(snapshot["wallet"]["coins"], 850)
        finally: other.close()

    def test_same_purchase_uuid_concurrent_calls_charge_once(self):
        self.fund(50)
        other = server.FocusStore(self.data, self.source)
        barrier, request = threading.Barrier(2), identity()
        def buy(store):
            barrier.wait()
            return store.buy_arcade_ticket(request, NOW)
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                jobs = [pool.submit(buy, store) for store in (self.store, other)]
                states = [job.result() for job in jobs]
            self.assertEqual(states[0], states[1])
            self.assertEqual(states[0]["wallet"]["coins"], 0)
            self.assertEqual(states[0]["purchased"], 1)
        finally: other.close()

    def test_deleted_study_does_not_remint_purchased_or_used_tickets(self):
        self.fund(50)
        self.store.buy_arcade_ticket(identity(), NOW)
        for _ in range(9):
            active = self.start()
            self.store.finish_arcade(active["id"], 1, NOW)
        snapshot = self.store.arcade_state(NOW)
        self.assertEqual((snapshot["used"], snapshot["available"]), (9, 0))
        with self.store.db:
            self.store.db.execute("INSERT INTO record_lifecycle SELECT id,?,'manual','delete' FROM records", (NOW.isoformat(),))
        self.assertEqual(self.store.arcade_state(NOW)["available"], 0)
        with self.store.db: self.store.db.execute("DELETE FROM record_lifecycle")
        self.assertEqual(self.store.arcade_state(NOW)["available"], 0)

    def test_eleven_admissions_still_share_one_daily_reward_cap(self):
        self.fund(150)
        for _ in range(3): self.store.buy_arcade_ticket(identity(), NOW)
        rewards = []
        for _ in range(11):
            active = self.store.start_arcade("mirror-gallery", identity(), NOW)["active"]
            solution = solve_mirrors(active["state"])
            rotations = [m["id"] for m in active["state"]["mirrors"] if m["orientation"] != solution[m["id"]]]
            for mirror in rotations:
                snapshot = self.store.move_arcade(active["id"], active["version"], {"mirrorId": mirror}, NOW)
                if not snapshot["active"]: break
                active = snapshot["active"]
            rewards.append(snapshot["lastResult"]["result"])
        self.assertEqual([r["coins"] for r in rewards], [12]*10+[0])
        self.assertEqual([r["diamonds"] for r in rewards], [1]*6+[0]*5)
        self.assertEqual(snapshot["rewardToday"], {"coins": 120, "diamonds": 6})
        self.assertEqual(snapshot["wallet"], {"coins": 120, "diamonds": 6})
        self.assertEqual((snapshot["used"], snapshot["available"]), (11, 0))
        with self.assertRaisesRegex(ValueError, "明天"): self.start()

    def test_competing_distinct_purchases_cannot_overdraw_wallet(self):
        self.fund(50)
        other = server.FocusStore(self.data, self.source)
        barrier = threading.Barrier(2)
        def buy(store):
            barrier.wait()
            try: return store.buy_arcade_ticket(identity(), NOW)
            except ValueError: return None
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                jobs = [pool.submit(buy, store) for store in (self.store, other)]
                self.assertEqual(sum(job.result() is not None for job in jobs), 1)
            snapshot = self.store.arcade_state(NOW)
            self.assertEqual(snapshot["wallet"]["coins"], 0)
            self.assertEqual(snapshot["purchased"], 1)
        finally: other.close()

    def test_http_purchase_and_pulse_only_accept_exact_authoritative_fields(self):
        self.fund(100)
        http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        def post(path, body):
            conn = HTTPConnection("127.0.0.1", http.server_address[1], timeout=3)
            conn.request("POST", path, json.dumps(body), {"Content-Type": "application/json"})
            response = conn.getresponse()
            result = response.status, json.loads(response.read())
            conn.close()
            return result
        try:
            with patch.object(server, "quest_clock", return_value=NOW):
                request = identity()
                self.assertEqual(post("/api/arcade/tickets/buy", {"requestId": request, "coins": 0})[0], 400)
                self.assertEqual(post("/api/arcade/tickets/buy", {"requestId": request})[0], 200)
                active = self.deploy()
                body = {"id": active["id"], "version": active["version"], "move": self.tick()}
                self.assertEqual(post("/api/arcade/pulse", dict(body, elapsed=2))[0], 400)
                self.assertEqual(post("/api/arcade/pulse", dict(body, move=dict(self.tick(), elapsed=999)))[0], 400)
                self.assertEqual(post("/api/arcade/pulse", body)[0], 200)
        finally:
            http.shutdown(); http.server_close(); thread.join()


if __name__ == "__main__":
    unittest.main()
