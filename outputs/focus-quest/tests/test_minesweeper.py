"""Classic rules and persisted, authoritative unlimited-time arcade rounds."""
import importlib.util
import json
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("mines_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
rules = server.arcade_rules.minesweeper_rules
NOW = datetime(2026, 9, 26, 18, 0, tzinfo=timezone(timedelta(hours=8)))


def uid():
    return str(uuid.uuid4())


def board(mines, width=4, height=4):
    state, _ = rules.create("mines-beginner", "controlled")
    state.update(width=width, height=height, mines=len(mines), phase="playing",
                 _mines=sorted(mines), _cells=["covered"] * (width * height))
    state["_numbers"] = [-1 if i in mines else sum(n in mines for n in rules.neighbors(state, i))
                         for i in range(width * height)]
    return state


def act(state, operation, index=0, steps=0):
    return rules.move(state, steps, 0, {"action": operation, "x": index % state["width"], "y": index // state["width"]})


class ClassicRulesTests(unittest.TestCase):
    def test_classic_dimensions_mines_and_deferred_first_open(self):
        for difficulty, shape in (("beginner", (9, 9, 10)), ("intermediate", (16, 16, 40)), ("expert", (30, 16, 99))):
            for seed in range(12):
                state, limit = rules.create("mines-" + difficulty, seed)
                self.assertEqual((state["width"], state["height"], state["mines"]), shape)
                self.assertEqual(state["_mines"], [])
                state, _, _ = act(state, "reveal", seed)
                self.assertEqual(len(set(state["_mines"])), shape[2])
                self.assertNotIn(seed, state["_mines"])
                self.assertNotEqual(state["phase"], "lost")
                self.assertEqual(limit, 0)

    def test_first_click_is_safe_but_not_forced_zero_or_no_guess(self):
        values = []
        for seed in range(25):
            state, _ = rules.create("mines-expert", seed)
            state, _, _ = act(state, "reveal", 0)
            values.append(state["_numbers"][0])
        self.assertTrue(any(value > 0 for value in values))
        self.assertIn(0, values)

    def test_first_click_generation_deterministic_and_does_not_mutate_input(self):
        state, _ = rules.create("mines-beginner", "same")
        before = deepcopy(state)
        first = act(state, "reveal", 8)
        self.assertEqual(state, before)
        self.assertEqual(first, act(state, "reveal", 8))
        self.assertNotEqual(first[0]["_mines"], act(state, "reveal", 30)[0]["_mines"])

    def test_hidden_public_cells_reveal_no_mines_numbers_seed_or_private_clock(self):
        state, _ = rules.create("mines-beginner", "private-secret")
        self.assertNotIn("private-secret", json.dumps(rules.public_state(state)))
        state, _, _ = act(state, "reveal", 0)
        before = deepcopy(state)
        public = rules.public_state(state)
        self.assertTrue(all(not key.startswith("_") for key in public))
        for row in public["cells"]:
            for cell in row:
                if cell["state"] != "open":
                    self.assertEqual(set(cell), {"state"})
        self.assertEqual(state, before)

    def test_zero_flood_crosses_questions_but_preserves_flags(self):
        state = board({0}, width=5, height=5)
        state["_cells"][24] = "flag"
        state["_cells"][23] = "question"
        state, _, result = act(state, "reveal", 20)
        self.assertIsNone(result)
        self.assertEqual(state["_cells"][24], "flag")
        self.assertEqual(state["_cells"][23], "open")
        self.assertEqual(state["_cells"][0], "covered")
        self.assertEqual(state["_cells"].count("open"), 23)

    def test_mark_cycle_questions_toggle_and_flags_may_exceed_mine_count(self):
        state = board({0})
        for expected in ("flag", "question", "covered"):
            state, _, _ = act(state, "mark", 2)
            self.assertEqual(state["_cells"][2], expected)
        state, _, _ = rules.move(state, 0, 0, {"action": "questions", "enabled": False})
        state, _, _ = act(state, "mark", 2)
        state, _, _ = act(state, "mark", 2)
        self.assertEqual(state["_cells"][2], "covered")
        state, _, _ = act(state, "mark", 0)
        state, _, _ = act(state, "mark", 1)
        self.assertEqual(rules.public_state(state)["remainingMines"], -1)

    def test_flagged_first_click_is_noop_and_does_not_generate_board(self):
        state, _ = rules.create("mines-beginner", 1)
        state, _, _ = act(state, "mark", 5)
        state, _, result = act(state, "reveal", 5)
        self.assertEqual(state["phase"], "ready")
        self.assertEqual(state["_mines"], [])
        self.assertIsNone(result)

    def test_marking_open_cell_is_noop(self):
        state = board({0, 15})
        state, _, _ = act(state, "reveal", 1)
        state, _, result = act(state, "mark", 1)
        self.assertEqual(state["_cells"][1], "open")
        self.assertIsNone(result)

    def test_chord_requires_exact_flags_and_correct_flags_open_safe_neighbors(self):
        state = board({0, 15})
        state, _, _ = act(state, "reveal", 5)
        unchanged, _, _ = act(state, "chord", 5)
        self.assertEqual(unchanged, state)
        state, _, _ = act(state, "mark", 0)
        state, _, _ = act(state, "chord", 5)
        for index in rules.neighbors(state, 5):
            self.assertEqual(state["_cells"][index], "flag" if index == 0 else "open")

    def test_wrong_flag_chord_explodes_and_shows_wrong_flag_and_mines(self):
        state = board({0, 15})
        state, _, _ = act(state, "reveal", 5)
        state, _, _ = act(state, "mark", 1)
        state, _, result = act(state, "chord", 5)
        self.assertFalse(result["won"])
        public = rules.public_state(state)
        self.assertTrue(public["cells"][0][0]["exploded"])
        self.assertTrue(public["cells"][0][1]["wrongFlag"])
        self.assertTrue(public["cells"][3][3]["mine"])

    def test_revealing_mine_loses_and_terminal_rejects_actions(self):
        state = board({0})
        state, _, result = act(state, "reveal", 0)
        self.assertFalse(result["won"])
        self.assertEqual(state["phase"], "lost")
        with self.assertRaises(ValueError):
            act(state, "mark", 1)

    def test_all_safe_cells_win_without_flags_and_automatically_flag_mines(self):
        state = board({0})
        state, _, result = act(state, "reveal", 15, steps=1000000)
        self.assertTrue(result["won"])
        self.assertEqual(state["_cells"][0], "flag")
        self.assertEqual(rules.public_state(state)["remainingMines"], 0)
        self.assertEqual(result["score"], 15)

    def test_flagging_all_mines_alone_does_not_win(self):
        state = board({0})
        state, _, result = act(state, "mark", 0)
        self.assertIsNone(result)
        self.assertEqual(state["phase"], "playing")

    def test_questions_can_be_opened_directly(self):
        state = board({0, 15})
        state["_cells"][5] = "question"
        state, _, _ = act(state, "reveal", 5)
        self.assertEqual(state["_cells"][5], "open")

    def test_actions_validate_exact_shape_and_cannot_inject_result_time_reward(self):
        state, _ = rules.create("mines-beginner", 1)
        invalid = [{}, {"action": []}, {"action": "win"}, {"action": "reveal", "x": True, "y": 0},
                   {"action": "reveal", "x": 0.0, "y": 0}, {"action": "reveal", "x": -1, "y": 0},
                   {"action": "reveal", "x": 9, "y": 0}, {"action": "reveal", "x": 0, "y": 9},
                   {"action": "questions", "enabled": 1}, {"action": "questions", "enabled": False, "coins": 99}]
        for key in ("elapsedSeconds", "score", "coins", "won", "_mines", "_clockStartedAt"):
            invalid.append({"action": "reveal", "x": 0, "y": 0, key: 100})
        for action in invalid:
            with self.subTest(action=action), self.assertRaises(ValueError):
                rules.move(state, 0, 0, action)


class MinesweeperStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        self.store = server.FocusStore(self.path / "data", self.path / "absent.json")
        self.add(600, NOW)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def add(self, minutes, now):
        identity = uid()
        end = now - timedelta(minutes=1)
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)",
                (identity, identity, "数学", minutes, int((end - timedelta(minutes=minutes)).timestamp() * 1000),
                 int(end.timestamp() * 1000), now.date().isoformat(), "tomatodo"))

    def start(self, venue="mines-beginner", now=NOW, request=None):
        return self.store.start_arcade(venue, request or uid(), now)["active"]

    def move(self, active, action, now=NOW):
        return self.store.move_arcade(active["id"], active["version"], action, now)

    def reveal(self, active, x, y, now=NOW):
        return self.move(active, {"action": "reveal", "x": x, "y": y}, now)

    def saved(self, active):
        return json.loads(self.store.db.execute("SELECT game_state FROM arcade_sessions WHERE id=?", (active["id"],)).fetchone()[0])

    def win(self, active, now=NOW):
        if active["state"]["phase"] == "ready":
            response = self.reveal(active, 0, 0, now)
            if response["active"] is None:
                return response
            active = response["active"]
        while True:
            saved = self.saved(active)
            index = next(i for i, value in enumerate(saved["_numbers"]) if value != -1 and saved["_cells"][i] != "open")
            response = self.reveal(active, index % saved["width"], index // saved["width"], now)
            if response["active"] is None:
                return response
            active = response["active"]

    def test_classic_catalog_and_best_times_initially_empty(self):
        state = self.store.arcade_state(NOW)
        venues = [v for v in state["venues"] if v["type"] == "minesweeper"]
        self.assertEqual(len(venues), 3)
        self.assertTrue(all(v["bestSeconds"] is None for v in venues))

    def test_unlimited_clock_ready_until_first_actual_reveal(self):
        active = self.start()
        self.assertIsNone(active["expiresAt"])
        self.assertIsNone(active["maxSteps"])
        later = NOW + timedelta(minutes=30)
        active = self.store.arcade_state(later)["active"]
        self.assertIsNone(active["state"]["clockStartedAt"])
        active = self.move(active, {"action": "mark", "x": 2, "y": 2}, later)["active"]
        active = self.reveal(active, 2, 2, later)["active"]
        self.assertEqual(active["state"]["elapsedSeconds"], 0)
        self.assertIsNone(active["state"]["clockStartedAt"])
        active = self.reveal(active, 0, 0, later)["active"]
        self.assertEqual(datetime.fromisoformat(active["state"]["clockStartedAt"]), later)
        state = self.store.arcade_state(later + timedelta(seconds=1250.125))
        self.assertEqual(state["active"]["state"]["elapsedSeconds"], 1250.125)

    def test_round_and_clock_survive_restart_and_midnight_without_new_ticket(self):
        active = self.start()
        active = self.reveal(active, 0, 0)["active"]
        self.store.close()
        self.store = server.FocusStore(self.path / "data", self.path / "absent.json")
        later = NOW + timedelta(days=1)
        state = self.store.arcade_state(later)
        self.assertEqual(state["active"]["id"], active["id"])
        self.assertEqual(state["active"]["state"]["elapsedSeconds"], 86400)
        self.assertEqual(state["used"], 0)
        self.assertEqual(state["available"], 7)
        with self.assertRaises(ValueError):
            self.start(now=later)

    def test_server_clock_ignores_client_timestamp_and_does_not_go_backward_after_move(self):
        active = self.start()
        active = self.reveal(active, 0, 0)["active"]
        with self.assertRaises(ValueError):
            self.move(active, {"action": "mark", "x": 8, "y": 8, "elapsedSeconds": 0})
        active = self.move(active, {"action": "questions", "enabled": False}, NOW + timedelta(seconds=20))["active"]
        active = self.move(active, {"action": "questions", "enabled": True}, NOW + timedelta(seconds=10))["active"]
        self.assertEqual(active["state"]["elapsedSeconds"], 20)

    def test_best_seconds_and_rewards_by_difficulty(self):
        for difficulty, coins, diamonds in (("beginner", 12, 1), ("intermediate", 24, 2), ("expert", 40, 3)):
            active = self.start("mines-" + difficulty)
            active = self.reveal(active, 0, 0)["active"]
            result = self.win(active, NOW + timedelta(seconds=12.345))
            terminal = result["lastResult"]
            self.assertEqual(terminal["result"]["coins"], coins)
            self.assertEqual(terminal["result"]["diamonds"], diamonds)
            self.assertEqual(terminal["state"]["elapsedSeconds"], 12.345)
            self.assertEqual(terminal["result"]["elapsedSeconds"], 12.345)
            venue = next(v for v in result["venues"] if v["id"] == "mines-" + difficulty)
            self.assertEqual(venue["bestSeconds"], 12.345)
        self.assertEqual(result["rewardToday"], {"coins": 76, "diamonds": 6})
        later = self.store.arcade_state(NOW + timedelta(hours=2))
        self.assertEqual(later["lastResult"]["state"]["elapsedSeconds"], 12.345)

    def test_loss_and_abandon_pay_zero_and_freeze_terminal_clock(self):
        active = self.start()
        active = self.reveal(active, 0, 0)["active"]
        mine = self.saved(active)["_mines"][0]
        state = self.reveal(active, mine % 9, mine // 9, NOW + timedelta(seconds=27))
        self.assertEqual(state["lastResult"]["status"], "lost")
        self.assertEqual(state["rewardToday"], {"coins": 0, "diamonds": 0})
        self.assertEqual(state["lastResult"]["state"]["elapsedSeconds"], 27)
        active = self.start()
        active = self.reveal(active, 0, 0)["active"]
        state = self.store.finish_arcade(active["id"], active["version"], NOW + timedelta(seconds=40))
        self.assertEqual(state["lastResult"]["state"]["phase"], "abandoned")
        self.assertEqual(state["lastResult"]["state"]["elapsedSeconds"], 40)
        self.assertEqual(state["rewardToday"], {"coins": 0, "diamonds": 0})

    def test_best_only_changes_for_faster_successes(self):
        for seconds in (30, 90, 15):
            active = self.start()
            active = self.reveal(active, 0, 0)["active"]
            result = self.win(active, NOW + timedelta(seconds=seconds))
            venue = next(v for v in result["venues"] if v["id"] == "mines-beginner")
            self.assertEqual(venue["bestSeconds"], min(30, seconds))

    def test_shared_daily_reward_cap_includes_other_games(self):
        for i in range(3):
            active = self.start("mines-expert")
            state = self.win(active)
            self.assertEqual(state["rewardToday"]["coins"], (i + 1) * 40)
            self.assertEqual(state["rewardToday"]["diamonds"], min((i + 1) * 3, 6))
        state = self.win(self.start())
        self.assertEqual(state["lastResult"]["result"]["coins"], 0)
        self.assertEqual(state["lastResult"]["result"]["diamonds"], 0)
        active = self.store.start_arcade("mirror-gallery", uid(), NOW)["active"]
        # Settlement is the same shared cap even for a different game's result.
        row = self.store.db.execute("SELECT * FROM arcade_sessions WHERE id=?", (active["id"],)).fetchone()
        with self.store._quest_transaction():
            self.store._arcade_end(row, "won", {"won": True, "score": 100, "medal": 1}, NOW)
        self.assertEqual(self.store.arcade_state(NOW)["rewardToday"], {"coins": 120, "diamonds": 6})

    def test_cross_day_completion_uses_original_day_allowance(self):
        for _ in range(3):
            self.win(self.start("mines-expert"))
        active = self.start()
        active = self.reveal(active, 0, 0)["active"]
        tomorrow = NOW + timedelta(days=1)
        state = self.win(active, tomorrow)
        self.assertEqual(state["lastResult"]["result"]["rewardDay"], NOW.date().isoformat())
        self.assertEqual(state["lastResult"]["result"]["coins"], 0)
        self.assertEqual(state["rewardToday"], {"coins": 0, "diamonds": 0})
        self.add(30, tomorrow)
        self.assertEqual(self.store.arcade_state(tomorrow)["available"], 5)
        result = self.win(self.start(now=tomorrow), tomorrow)
        self.assertEqual(result["rewardToday"], {"coins": 12, "diamonds": 1})

    def test_request_retries_spend_one_ticket_and_moves_are_versioned(self):
        request = uid()
        active = self.start(request=request)
        self.assertEqual(self.start(request=request)["id"], active["id"])
        action = {"action": "mark", "x": 0, "y": 0}
        updated = self.move(active, action)["active"]
        self.assertEqual(self.move(active, action)["active"], updated)
        with self.assertRaises(ValueError):
            self.move(active, {"action": "mark", "x": 1, "y": 0})
        self.assertEqual(self.store.arcade_state(NOW)["used"], 1)

    def test_concurrent_same_start_request_is_single_session(self):
        request = uid()
        with ThreadPoolExecutor(max_workers=6) as executor:
            replies = list(executor.map(lambda _: self.store.start_arcade("mines-beginner", request, NOW), range(6)))
        self.assertEqual(len({reply["active"]["id"] for reply in replies}), 1)
        self.assertEqual(self.store.arcade_state(NOW)["used"], 1)

    def test_winning_move_retry_never_pays_twice(self):
        active = self.start()
        result = self.win(active)
        terminal = result["lastResult"]
        saved = self.store.db.execute("SELECT version,move FROM arcade_moves WHERE session_id=? ORDER BY version DESC LIMIT 1", (active["id"],)).fetchone()
        retry = self.store.move_arcade(active["id"], saved["version"], json.loads(saved["move"]), NOW)
        self.assertEqual(retry["wallet"], result["wallet"])
        self.assertEqual(retry["lastResult"], terminal)
        count = self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger WHERE reference=?", ("arcade:" + active["id"],)).fetchone()[0]
        self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
