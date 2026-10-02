"""Playable finite rounds, daily admissions and authoritative reward settlement."""
import importlib.util
import itertools
import json
import tempfile
import threading
import unittest
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("arcade_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
rules = server.arcade_rules
NOW = datetime(2026, 9, 25, 18, 0, tzinfo=timezone(timedelta(hours=8)))


def uid():
    return str(uuid.uuid4())


def solve_mirrors(state):
    state = deepcopy(state)
    for mask in range(1 << len(state["mirrors"])):
        for i, mirror in enumerate(state["mirrors"]):
            mirror["orientation"] = "/" if mask & (1 << i) else "\\"
        if rules._trace(state):
            return {m["id"]: m["orientation"] for m in state["mirrors"]}
    raise AssertionError("Unsolvable mirror puzzle")


def trail_path(state):
    board = state["board"]
    gems = {(x, y): i for i, (x, y) in enumerate((x, y) for y in range(7) for x in range(9) if board[y][x] == "gem")}
    start = (0, 3, 0)
    q, visited = deque([(start, [])]), {start}
    while q:
        (x, y, mask), path = q.popleft()
        if (x, y, mask) == (8, 3, 31):
            return path
        for direction, (dx, dy) in rules.DIRS.items():
            nx, ny = x+dx, y+dy
            if not (0 <= nx < 9 and 0 <= ny < 7) or board[ny][nx] in ("wall", "hazard"):
                continue
            nmask = mask | (1 << gems[(nx, ny)] if (nx, ny) in gems else 0)
            node = nx, ny, nmask
            if node not in visited:
                visited.add(node)
                q.append((node, path+[direction]))
    raise AssertionError("No safe all-gem path")


class RuleTests(unittest.TestCase):
    def test_all_eleven_games_generate_varied_playable_states(self):
        self.assertEqual(len(rules.VENUES), 11)
        for venue in rules.CATALOG:
            layouts = {json.dumps(rules.create(venue, seed)[0], sort_keys=True) for seed in range(30)}
            self.assertGreater(len(layouts), 20, venue)

    def test_every_trail_has_safe_all_gem_route_within_budget(self):
        for venue in ("mist-camp", "chime-bridge", "home-beacon"):
            for seed in range(40):
                state, limit = rules.create(venue, seed)
                path = trail_path(state)
                self.assertLessEqual(len(path), limit)
                steps, result = 0, None
                for direction in path:
                    state, steps, result = rules.move("trail", state, steps, limit, {"direction": direction})
                    if result:
                        break
                self.assertTrue(result["won"], (venue, seed))
                self.assertEqual(result["medal"], 3)

    def test_all_mirror_layouts_have_solution_and_do_not_start_solved(self):
        for venue in ("mirror-gallery", "orbit-terrace"):
            layouts = set()
            for seed in range(30):
                state, limit = rules.create(venue, seed)
                layouts.add(tuple((m["x"], m["y"]) for m in state["mirrors"]))
                self.assertFalse(rules._trace(state))
                solution = solve_mirrors(state)
                rotations = [m["id"] for m in state["mirrors"] if m["orientation"] != solution[m["id"]]]
                self.assertLessEqual(len(rotations), limit)
                steps, result = 0, None
                for mirror_id in rotations:
                    state, steps, result = rules.move("mirrors", state, steps, limit, {"mirrorId": mirror_id})
                    if result:
                        break
                self.assertTrue(result["won"])
                self.assertTrue(all(t["lit"] for t in state["targets"]))
                self.assertTrue(state["receiver"]["lit"])
            self.assertGreater(len(layouts), 20)

    def test_garden_strategic_placements_reach_target_with_finite_turns(self):
        for venue in ("glow-shore", "cloud-library"):
            for seed in range(6):
                state, limit = rules.create(venue, seed)
                steps, result = 0, None
                while result is None:
                    choices = [rules.move("garden", state, steps, limit, {"handIndex": i, "x": x, "y": y})
                               for i in range(3) for y in range(5) for x in range(5) if state["cells"][y][x] is None]
                    state, steps, result = max(choices, key=lambda choice: choice[0]["lastGain"])
                self.assertEqual(steps, limit)
                self.assertTrue(result["won"], (venue, seed, result))

    def test_public_state_hides_fog_and_future_cards_without_mutation(self):
        trail, _ = rules.create("mist-camp", 1)
        original = deepcopy(trail)
        public = rules.public_state("trail", trail)
        self.assertNotIn("board", public)
        self.assertNotIn("seen", public)
        self.assertTrue(any(cell is None for row in public["cells"] for cell in row))
        self.assertEqual(trail, original)
        garden, _ = rules.create("glow-shore", 1)
        self.assertNotIn("deck", rules.public_state("garden", garden))

    def test_actions_validate_exact_shape_integer_and_legal_cells(self):
        for venue, actions in {
            "mist-camp": [{}, {"direction": []}, {"direction": "diagonal"}, {"scan": 1}, {"scan": True, "coins": 5}],
            "mirror-gallery": [{"mirrorId": True}, {"mirrorId": 300}, {"mirrorId": "0"}],
            "glow-shore": [{"handIndex": 0, "x": -1, "y": 1}, {"handIndex": True, "x": 0, "y": 1}, {"handIndex": 0, "x": 0., "y": 1}]
        }.items():
            state, limit = rules.create(venue, 1)
            for action in actions:
                with self.assertRaises(ValueError):
                    rules.move(rules.CATALOG[venue]["type"], state, 0, limit, action)

    def test_scan_is_finite_and_uses_a_turn(self):
        state, limit = rules.create("mist-camp", 3)
        for step in range(2):
            state, steps, _ = rules.move("trail", state, step, limit, {"scan": True})
            self.assertEqual(steps, step+1)
        with self.assertRaises(ValueError):
            rules.move("trail", state, 2, limit, {"scan": True})

    def test_garden_distinct_neighbor_and_completed_line_bonus(self):
        state, limit = rules.create("glow-shore", 2)
        state["hand"][0] = "stone"
        state["cells"][0] = ["flower", "water", "grove", "water", None]
        state["cells"][1][4] = "flower"
        state, _, _ = rules.move("garden", state, 0, limit, {"handIndex": 0, "x": 4, "y": 0})
        self.assertEqual(state["lastGain"], 4+10+12)
        with self.assertRaises(ValueError):
            rules.move("garden", state, 1, limit, {"handIndex": 0, "x": 4, "y": 0})


class ArcadeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data, self.source = Path(self.temp.name)/"data", Path(self.temp.name)/"none.json"
        self.store = server.FocusStore(self.data, self.source)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, minutes, day=None, deleted=False, future=False):
        identity = uid()
        end = NOW+timedelta(minutes=10) if future else NOW-timedelta(minutes=5)
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)",
                (identity, identity, "数学", minutes, int((end-timedelta(minutes=minutes)).timestamp()*1000),
                 int(end.timestamp()*1000), day or NOW.date().isoformat(), "tomatodo"))
            if deleted:
                self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (identity, NOW.isoformat(), "manual", "delete"))
        return identity

    def start(self, venue="mirror-gallery", request_id=None, now=NOW):
        return self.store.start_arcade(venue, request_id or uid(), now)["active"]

    def win(self, active):
        target = solve_mirrors(active["state"])
        rotations = [m["id"] for m in active["state"]["mirrors"] if m["orientation"] != target[m["id"]]]
        for index in rotations:
            result = self.store.move_arcade(active["id"], active["version"], {"mirrorId": index}, NOW)
            if not result["active"]:
                return result
            active = result["active"]
        raise AssertionError("Missing terminal result")

    def test_zero_and_boundary_minutes_only_completed_today_are_eligible(self):
        self.add(9000, "2026-09-24")
        self.add(90, deleted=True)
        self.add(90, future=True)
        self.add(29.99)
        before = self.store.arcade_state(NOW)
        self.assertEqual(before["earned"], 0)
        with self.assertRaises(ValueError): self.start()
        self.add(.01)
        after = self.store.arcade_state(NOW)
        self.assertEqual((after["earned"], after["available"]), (1, 1))

    def test_history_import_cannot_grant_more_than_eight_and_date_view_is_irrelevant(self):
        self.add(10000)
        state = self.store.state("2020-01-01", NOW)["arcade"]
        self.assertEqual(state["today"], NOW.date().isoformat())
        self.assertEqual((state["earned"], state["available"], state["nextTicketMinutes"]), (8, 8, 0))

    def test_start_and_completed_request_retries_never_spend_twice(self):
        self.add(270)
        request = uid()
        active = self.start(request_id=request)
        self.assertEqual(self.start(request_id=request)["id"], active["id"])
        with self.assertRaises(ValueError): self.start("glow-shore", request)
        self.store.finish_arcade(active["id"], 1, NOW)
        retry = self.store.start_arcade("mirror-gallery", request, NOW)
        self.assertIsNone(retry["active"])
        self.assertEqual(retry["used"], 1)

    def test_only_one_active_round_and_reload_preserves_board_deadline(self):
        self.add(270)
        active = self.start()
        with self.assertRaises(ValueError): self.start()
        self.store.close()
        self.store = server.FocusStore(self.data, self.source)
        resumed = self.store.arcade_state(NOW+timedelta(seconds=90))["active"]
        self.assertEqual(active, resumed)

    def test_delete_restore_keeps_unspent_tickets_without_reminting(self):
        record = self.add(60)
        active = self.start()
        self.store.finish_arcade(active["id"], 1, NOW)
        with self.store.db:
            self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (record, NOW.isoformat(), "manual", "delete"))
        self.assertEqual(self.store.arcade_state(NOW)["available"], 1)
        with self.store.db: self.store.db.execute("DELETE FROM record_lifecycle WHERE record_id=?", (record,))
        self.assertEqual(self.store.arcade_state(NOW)["available"], 1)
        active = self.start()
        self.store.finish_arcade(active["id"], 1, NOW)
        self.assertEqual(self.store.arcade_state(NOW)["available"], 0)

    def test_moves_are_idempotent_and_stale_different_moves_are_rejected(self):
        self.add(45)
        active = self.start()
        move = {"mirrorId": active["state"]["mirrors"][0]["id"]}
        after = self.store.move_arcade(active["id"], 1, move, NOW)
        self.assertEqual(after, self.store.move_arcade(active["id"], 1, move, NOW))
        with self.assertRaises(ValueError): self.store.move_arcade(active["id"], 1, {"mirrorId": 1}, NOW)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM arcade_moves").fetchone()[0], 1)

    def test_expiry_is_exact_and_does_not_award_or_restore_ticket(self):
        self.add(45)
        active = self.start()
        self.assertIsNotNone(self.store.arcade_state(NOW+timedelta(seconds=239))["active"])
        state = self.store.move_arcade(active["id"], 1, {"mirrorId": 0}, NOW+timedelta(seconds=240))
        self.assertIsNone(state["active"])
        self.assertEqual(state["lastResult"]["status"], "expired")
        self.assertEqual((state["used"], state["available"]), (1, 0))
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_midnight_ends_round_before_new_day_budget(self):
        self.add(45)
        start = NOW.replace(hour=23, minute=59)
        active = self.start(now=start)
        midnight = (start+timedelta(days=1)).replace(hour=0, minute=0)
        self.assertEqual(datetime.fromisoformat(active["expiresAt"]), midnight)
        state = self.store.arcade_state(midnight)
        self.assertEqual((state["earned"], state["used"]), (0, 0))
        self.assertIsNone(state["active"])
        self.assertEqual(state["lastResult"]["status"], "expired")

    def test_eight_wins_share_raised_caps_and_duplicate_end_never_pays(self):
        self.add(500)
        rewards = []
        for _ in range(8):
            active = self.start()
            state = self.win(active)
            rewards.append(state["lastResult"]["result"])
            again = self.store.finish_arcade(active["id"], 1, NOW)
            self.assertEqual(again["rewardToday"], state["rewardToday"])
        self.assertEqual([r["coins"] for r in rewards], [12]*8)
        self.assertEqual([r["diamonds"] for r in rewards], [1]*6+[0]*2)
        self.assertEqual(self.store._wallet(), {"coins": 96, "diamonds": 6})
        with self.assertRaisesRegex(ValueError, "明天"): self.start()
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger WHERE reference LIKE 'arcade:%'").fetchone()[0], 8)

    def test_abandon_never_pays_and_requires_current_version(self):
        self.add(45)
        active = self.start("mist-camp")
        after = self.store.move_arcade(active["id"], 1, {"scan": True}, NOW)
        with self.assertRaises(ValueError): self.store.finish_arcade(active["id"], 1, NOW)
        result = self.store.finish_arcade(active["id"], after["active"]["version"], NOW)
        self.assertEqual(result["lastResult"]["status"], "abandoned")
        self.assertEqual(result["lastResult"]["result"]["coins"], 0)
        self.assertEqual(self.store._wallet(), {"coins": 0, "diamonds": 0})

    def test_loss_is_authoritative_and_pays_only_four_coins(self):
        self.add(45)
        active = self.start()
        # Toggling the same mirror repeatedly cannot solve an already unsolved
        # puzzle if the two orientations are both not winning.
        choice = next(m["id"] for m in active["state"]["mirrors"] if not rules.move("mirrors", active["state"], 0, active["maxSteps"], {"mirrorId": m["id"]})[2])
        for _ in range(active["maxSteps"]):
            state = self.store.move_arcade(active["id"], active["version"], {"mirrorId": choice}, NOW)
            if state["active"]: active = state["active"]
        self.assertIsNone(state["active"])
        self.assertEqual(state["lastResult"]["status"], "lost")
        self.assertEqual(self.store._wallet(), {"coins": 4, "diamonds": 0})

    def test_competing_connections_spend_once(self):
        self.add(45)
        other = server.FocusStore(self.data, self.source)
        barrier = threading.Barrier(2)
        def start(store):
            barrier.wait()
            try: return store.start_arcade("mist-camp", uid(), NOW)["active"]["id"]
            except ValueError: return None
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                jobs = [pool.submit(start, store) for store in (self.store, other)]
                self.assertEqual(sum(j.result() is not None for j in jobs), 1)
            self.assertEqual(self.store.arcade_state(NOW)["used"], 1)
        finally: other.close()

    def test_games_do_not_change_study_records_quests_or_old_balances(self):
        self.add(45)
        with self.store.db: self.store.db.execute("INSERT INTO wallet_ledger VALUES ('existing',37,9,1)")
        self.store.arcade_state(NOW)
        tables = [r[0] for r in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table'") if not r[0].startswith("arcade_") and r[0] != "wallet_ledger"]
        before = {t: self.store.db.execute('SELECT * FROM "'+t+'"').fetchall() for t in tables}
        self.win(self.start())
        for table in tables:
            after = self.store.db.execute('SELECT * FROM "'+table+'"').fetchall()
            if table == "meta":
                self.assertEqual([tuple(row) for row in before[table] if row[0] != "revision"],
                                 [tuple(row) for row in after if row[0] != "revision"], table)
            else:
                self.assertEqual(before[table], after, table)
        self.assertEqual(self.store._wallet(), {"coins": 49, "diamonds": 10})

    def test_seeds_and_future_cards_stay_private(self):
        self.add(45)
        active = self.start("glow-shore")
        stored = self.store.db.execute("SELECT seed FROM arcade_sessions").fetchone()[0]
        self.assertNotEqual(active["seed"], stored)
        self.assertNotIn("deck", active["state"])

    def test_http_only_accepts_server_time_and_exact_game_fields(self):
        self.add(45)
        http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        def request(path, body=None, headers=None):
            conn = HTTPConnection("127.0.0.1", http.server_address[1], timeout=3)
            conn.request("GET" if body is None else "POST", path, None if body is None else json.dumps(body),
                         {"Content-Type": "application/json", **(headers or {})})
            response = conn.getresponse()
            result = response.status, json.loads(response.read())
            conn.close()
            return result
        try:
            with patch.object(server, "quest_clock", return_value=NOW):
                self.assertEqual(request("/api/arcade")[0], 200)
                self.assertEqual(request("/api/arcade?date=2020-01-01")[0], 400)
                payload = {"venue": "mist-camp", "requestId": uid()}
                self.assertEqual(request("/api/arcade/start", payload, {"Origin": "https://untrusted.example"})[0], 403)
                for body in ({}, {**payload, "coins": 100}, {**payload, "now": NOW.isoformat()}):
                    self.assertEqual(request("/api/arcade/start", body)[0], 400)
                status, state = request("/api/arcade/start", payload)
                self.assertEqual(status, 200)
                active = state["active"]
                self.assertEqual(request("/api/arcade/move", {"id": active["id"], "version": 1, "move": {"scan": True}, "win": True})[0], 400)
                self.assertEqual(request("/api/arcade/move", {"id": active["id"], "version": True, "move": {"scan": True}})[0], 400)
                self.assertEqual(request("/api/arcade/finish", {"id": active["id"], "version": 1})[0], 200)
        finally:
            http.shutdown(); http.server_close(); thread.join()


if __name__ == "__main__":
    unittest.main()
