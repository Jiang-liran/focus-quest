"""Rules, persistence, and visible-information play for the rune dice encounter."""
import importlib.util
import json
import random
import unittest
from collections import Counter
from copy import deepcopy
from pathlib import Path

spec = importlib.util.spec_from_file_location("dice_rules", Path(__file__).resolve().parents[1] / "dice_rules.py")
dice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dice)


def _visible_value(public, preview):
    """Spend a technique when this hand beats its usual quality; save shields."""
    if preview["attack"] >= public["boss"]["health"]:
        return 1000 + preview["attack"]
    normal_attack = {"surge": 24, "pairs": 24, "triple": 28, "straight": 28, "chorus": 19, "ward": 9}
    normal_shield = {"surge": 0, "pairs": 5, "triple": 0, "straight": 0, "chorus": 6, "ward": 13}
    remaining_attacks = [i["attack"] for i in public["boss"]["intents"][public["turn"]-1:]]
    reserve = min(normal_shield[preview["id"]], max(remaining_attacks))
    blocked = min(public["intent"]["attack"], preview["shield"])
    survival = 100 if public["health"] + preview["heal"] > public["intent"]["attack"]-blocked else -100
    return (preview["attack"] - normal_attack[preview["id"]]
            + .75*(blocked-reserve) + .5*preview["heal"] + survival)


def visible_policy(public):
    """A modest policy that only receives the exact state available in the UI.

    Relic selection considers remaining moves. Rerolls use 12 independent
    hypothetical samples of known dice faces, never the persisted game RNG.
    """
    if public["phase"] == "draft":
        unused = {t["id"] for t in public["techniques"] if not t["used"]}
        weight = {"ember": 6, "tide": 3, "moss": 2, "prism": 7,
                  "echo": 4, "anvil": 4*len(unused & {"pairs", "triple"}),
                  "compass": 4*len(unused & {"straight", "chorus"}) + ("ward" in unused), "thorn": 1}
        return {"relic": max(public["relicChoices"], key=lambda r: weight[r["id"]])["id"]}
    unused = [t for t in public["techniques"] if not t["used"]]
    best = max(unused, key=lambda t: _visible_value(public, t))
    best_value = _visible_value(public, best)
    if not public["rerollsLeft"] or best["attack"] >= public["boss"]["health"]:
        return {"technique": best["id"]}
    hand = public["dice"]
    values = [d["value"] for d in hand]
    counts = Counter(values)
    candidates = {()}
    for technique in unused:
        ident = technique["id"]
        if ident == "surge":
            locked = [i for i, v in enumerate(values) if v >= 4]
        elif ident == "pairs":
            locked = [i for i, v in enumerate(values) if counts[v] >= 2]
            if not locked:
                locked = [values.index(max(values))]
        elif ident == "triple":
            value = max(counts, key=lambda v: (counts[v], v))
            locked = [i for i, v in enumerate(values) if v == value]
        elif ident == "straight":
            possibilities = [[values.index(v) for v in sorted(counts) if start <= v <= start+4] for start in (1, 2)]
            locked = max(possibilities, key=len)
        elif ident == "chorus":
            elements = Counter(d["element"] for d in hand)
            color = max(elements, key=elements.get)
            locked = [i for i, d in enumerate(hand) if d["element"] == color]
        else:
            locked = [i for i, v in enumerate(values) if v % 2 == 0]
        if len(locked) < 5:
            candidates.add(tuple(locked))
    selected, expected = None, best_value + 1.5
    for locked in sorted(candidates):
        # This fixed independent RNG is public strategy sampling, not game state.
        rng = random.Random(1009)
        samples = []
        for _ in range(12):
            trial = {**public, "dice": [d if i in locked else {"value": rng.randint(1, 6), "element": rng.choice(dice.ELEMENTS)}
                                       for i, d in enumerate(hand)],
                     "rerollsLeft": public["rerollsLeft"]-1,
                     "usedTechniques": [t["id"] for t in public["techniques"] if t["used"]]}
            # Preview only depends on this public hypothetical hand.
            previews = [dice._preview(trial, t) for t in dice.TECHNIQUES if t["id"] not in trial["usedTechniques"]]
            samples.append(max(_visible_value(public, p) for p in previews))
        value = sum(samples)/len(samples)
        if value > expected:
            selected, expected = locked, value
    return {"reroll": True, "locked": list(selected)} if selected is not None else {"technique": best["id"]}


def play(seed, policy=visible_policy, persistence=False):
    state, limit = dice.create(seed)
    steps, result = 0, None
    while result is None:
        public = dice.public_state(state)
        action = policy(public)
        previous = deepcopy(state)
        moved, steps, result = dice.move(state, steps, limit, action)
        if previous != state:
            raise AssertionError("Move mutated its input")
        if previous == moved:
            raise AssertionError("Move made no state change")
        state = moved
        if persistence:
            state = json.loads(json.dumps(state))
    return state, steps, result


class DiceTests(unittest.TestCase):
    def started(self, seed=1):
        state, limit = dice.create(seed)
        state, steps, result = dice.move(state, 0, limit, {"relic": state["relicChoices"][0]["id"]})
        self.assertIsNone(result)
        return state, steps, limit

    def test_seeded_layout_diversity_and_private_public_state(self):
        bosses, offers = set(), set()
        for seed in range(48):
            state, limit = dice.create(seed)
            original = deepcopy(state)
            public = dice.public_state(state)
            self.assertEqual(limit, 20)
            self.assertEqual(state, original)
            self.assertNotIn("_rng", public)
            self.assertNotIn("seed", public)
            self.assertNotIn("usedTechniques", public)
            self.assertEqual(public["dice"], [])
            self.assertEqual(len(public["relicChoices"]), 3)
            self.assertEqual(len(public["techniques"]), 6)
            bosses.add(public["boss"]["id"])
            offers.add(tuple(r["id"] for r in public["relicChoices"]))
            public["boss"]["health"] = -10
            self.assertEqual(state, original)
        self.assertEqual(len(bosses), 3)
        self.assertGreater(len(offers), 30)

    def test_json_persistence_replays_same_random_stream(self):
        state, steps, limit = self.started()
        original = deepcopy(state)
        action = {"reroll": True, "locked": [0, 3]}
        a = dice.move(state, steps, limit, action)
        b = dice.move(json.loads(json.dumps(state)), steps, limit, action)
        self.assertEqual(a, b)
        self.assertEqual(state, original)
        self.assertEqual(a[0]["dice"][0], state["dice"][0])
        self.assertEqual(a[0]["dice"][3], state["dice"][3])
        self.assertEqual(a[0]["rerollsLeft"], 1)

    def test_strict_action_shapes_and_types_do_not_mutate(self):
        draft, limit = dice.create(3)
        bad_drafts = [None, [], {}, {"relic": []}, {"relic": "missing"},
                      {"relic": draft["relicChoices"][0]["id"], "coins": 100}, {"technique": "surge"}]
        for action in bad_drafts:
            previous = deepcopy(draft)
            with self.assertRaises(ValueError):
                dice.move(draft, 0, limit, action)
            self.assertEqual(draft, previous)
        state, steps, limit = self.started()
        bad_moves = [{}, {"reroll": 1, "locked": []}, {"reroll": True, "locked": [True]},
                     {"reroll": True, "locked": [0, 0]}, {"reroll": True, "locked": [0, 1, 2, 3, 4]},
                     {"reroll": True, "locked": [5]}, {"reroll": True, "locked": [-1]},
                     {"reroll": True, "locked": [1.]}, {"reroll": True, "locked": "0"},
                     {"reroll": True}, {"technique": []}, {"technique": "missing"},
                     {"technique": "surge", "attack": 999}, {"relic": "ember"}]
        for action in bad_moves:
            previous = deepcopy(state)
            with self.assertRaises(ValueError):
                dice.move(state, steps, limit, action)
            self.assertEqual(state, previous)
        for steps, limit in [(True, 20), (-1, 20), (20, 20), (0, True), (0, 21)]:
            with self.assertRaises(ValueError):
                dice.move(state, steps, limit, {"technique": "surge"})

    def test_two_rerolls_and_single_use_techniques(self):
        state, steps, limit = self.started()
        for _ in range(2):
            state, steps, _ = dice.move(state, steps, limit, {"reroll": True, "locked": []})
        with self.assertRaises(ValueError):
            dice.move(state, steps, limit, {"reroll": True, "locked": []})
        state, steps, _ = dice.move(state, steps, limit, {"technique": "ward"})
        self.assertEqual((state["turn"], state["rerollsLeft"]), (2, 2))
        with self.assertRaises(ValueError):
            dice.move(state, steps, limit, {"technique": "ward"})

    def test_preview_exactly_matches_resolution_and_armor(self):
        state, steps, limit = self.started(9)
        state["relics"] = [deepcopy(dice.RELIC_BY_ID["ember"]), deepcopy(dice.RELIC_BY_ID["tide"])]
        state["dice"] = [{"value": v, "element": e} for v, e in zip([2, 2, 4, 4, 6], ["fire", "fire", "tide", "tide", "moss"])]
        state["boss"]["intents"][0] = {"name": "测试重击", "attack": 20, "armor": 3}
        preview = next(t for t in dice.public_state(state)["techniques"] if t["id"] == "pairs")
        self.assertEqual((preview["attack"], preview["shield"]), (27, 12))
        self.assertEqual(preview["indices"], [0, 1, 2, 3])
        moved, _, _ = dice.move(state, steps, limit, {"technique": "pairs"})
        self.assertEqual(moved["boss"]["health"], state["boss"]["health"]-preview["attack"])
        self.assertEqual(moved["health"], state["health"]-8)
        self.assertEqual(moved["score"], preview["score"])
        self.assertEqual(moved["lastTurn"]["damageTaken"], 8)

    def test_midpoint_has_new_draft_rest_and_no_duplicate_relic(self):
        state, steps, limit = self.started()
        for ident in ("ward", "surge", "pairs"):
            state, steps, result = dice.move(state, steps, limit, {"technique": ident})
            self.assertIsNone(result)
        self.assertEqual((state["turn"], state["phase"], state["dice"]), (4, "draft", []))
        self.assertEqual(len(state["relicChoices"]), 3)
        self.assertNotIn(state["relics"][0]["id"], [r["id"] for r in state["relicChoices"]])
        state, _, _ = dice.move(state, steps, limit, {"relic": state["relicChoices"][0]["id"]})
        self.assertEqual((len(state["relics"]), state["phase"], len(state["dice"])), (2, "play", 5))

    def test_lethal_attack_prevents_counterattack_and_terminal_rejects_moves(self):
        state, steps, limit = self.started()
        state["boss"]["health"], state["health"] = 1, 1
        ended, steps, result = dice.move(state, steps, limit, {"technique": "surge"})
        self.assertTrue(result["won"])
        self.assertEqual(ended["health"], 1)
        self.assertEqual(ended["lastTurn"]["damageTaken"], 0)
        self.assertEqual(ended["lastTurn"]["bossAttack"], 0)
        self.assertEqual(result["score"], ended["score"])
        self.assertEqual(set(result), {"won", "score", "medal", "reason"})
        with self.assertRaises(ValueError):
            dice.move(ended, steps, limit, {"technique": "ward"})

    def test_each_relic_changes_its_advertised_build(self):
        state, _, _ = self.started()
        state["health"] = 30
        state["dice"] = [{"value": v, "element": e} for v, e in zip([2, 2, 3, 4, 5], ["fire", "fire", "tide", "moss", "moss"])]
        state["boss"]["intents"][0] = {"name": "重击", "attack": 20, "armor": 0}
        state["relics"] = []
        def previews():
            return {t["id"]: t for t in dice.public_state(state)["techniques"]}
        baseline = previews()
        for relic, technique, field, gain in (
                ("ember", "surge", "attack", 4), ("tide", "surge", "shield", 2),
                ("moss", "surge", "heal", 4), ("prism", "surge", "attack", 5),
                ("echo", "surge", "attack", 8), ("anvil", "pairs", "attack", 9),
                ("thorn", "ward", "attack", 6), ("compass", "straight", "attack", 9)):
            state["relics"] = [deepcopy(dice.RELIC_BY_ID[relic])]
            self.assertEqual(previews()[technique][field], baseline[technique][field]+gain, relic)
        state["relics"] = [deepcopy(dice.RELIC_BY_ID["echo"])]
        state["rerollsLeft"] = 1
        self.assertEqual(previews()["surge"]["attack"], baseline["surge"]["attack"])

    def test_loss_from_health_and_six_turn_deadline(self):
        state, steps, limit = self.started()
        state["health"], state["boss"]["health"] = 1, 999
        state["relics"] = []
        ended, _, result = dice.move(state, steps, limit, {"technique": "surge"})
        self.assertFalse(result["won"])
        self.assertEqual((ended["health"], result["medal"]), (0, 0))
        state, steps, limit = self.started()
        state["health"] = state["maxHealth"] = 999
        state["boss"]["health"] = 999
        for technique in dice.TECHNIQUES:
            if state["phase"] == "draft":
                state, steps, _ = dice.move(state, steps, limit, {"relic": state["relicChoices"][0]["id"]})
            state, steps, result = dice.move(state, steps, limit, {"technique": technique["id"]})
        self.assertFalse(result["won"])
        self.assertEqual((state["turn"], state["phase"], steps), (6, "ended", 8))

    def test_all_optional_actions_fit_twenty_step_budget(self):
        state, steps, limit = self.started()
        state["health"] = state["maxHealth"] = 999
        state["boss"]["health"] = 999
        for technique in dice.TECHNIQUES:
            if state["phase"] == "draft":
                state, steps, _ = dice.move(state, steps, limit, {"relic": state["relicChoices"][0]["id"]})
            for _ in range(2):
                state, steps, result = dice.move(state, steps, limit, {"reroll": True, "locked": [0]})
                self.assertIsNone(result)
            state, steps, result = dice.move(state, steps, limit, {"technique": technique["id"]})
        self.assertEqual(steps, limit)
        self.assertIn("六轮结束", result["reason"])

    def test_visible_strategy_beats_unplanned_play_across_many_seeds(self):
        def careless(public):
            if public["phase"] == "draft":
                return {"relic": public["relicChoices"][0]["id"]}
            return {"technique": next(t["id"] for t in public["techniques"] if not t["used"])}
        seeds = range(48)
        wins, careless_wins, step_counts, boss_wins = 0, 0, [], Counter()
        for seed in seeds:
            state, steps, result = play(seed)
            wins += result["won"]
            boss_wins[state["boss"]["id"]] += result["won"]
            careless_wins += play(seed, careless)[2]["won"]
            step_counts.append(steps)
            self.assertLessEqual(steps, 20)
            self.assertLessEqual(state["turn"], 6)
            self.assertEqual(state["phase"], "ended")
        self.assertGreaterEqual(wins, 24, (wins, careless_wins, boss_wins))
        self.assertLess(wins, 48, "The small visible policy should still have challenging seeds")
        self.assertGreater(wins, careless_wins+12, (wins, careless_wins))
        self.assertTrue(all(boss_wins[b["id"]] > 0 for b in dice.BOSSES))
        self.assertGreater(max(step_counts), 14)


if __name__ == "__main__":
    unittest.main()
