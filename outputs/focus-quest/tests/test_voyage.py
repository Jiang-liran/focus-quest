"""Rules tests and reproducible balance checks using only the visible board."""
import copy
import json
import random
import statistics
import unittest

import voyage_rules as game


def sensible_action(public):
    """One-turn planning with visible cards; never reads seed, future draws or intents."""
    phase = public["phase"]
    if phase == "captain":
        return {"captain": "ember"}
    if phase == "route":
        return {"route": "safe"}
    if phase == "camp":
        return {"camp": "rest" if public["maxHealth"]-public["health"] >= 10 else "upgrade"}
    if phase == "event":
        return {"event": "salvage" if public["health"] >= 25 else "leave"}
    if phase == "reward":
        options = public["options"]
        relic = next(x for x in options if x["kind"] == "relic")
        if relic["relic"]["id"] in ("lens", "crown", "compass", "heart", "medkit"):
            return {"reward": "relic"}
        card = next(x for x in options if x["kind"] == "card")
        if card["card"]["id"] in ("meteor", "echo", "overload", "focus", "battery", "sunder"):
            return {"reward": "card"}
        return {"reward": options[0]["id"]}
    hand = public["hand"]
    enemy = public["enemy"]
    relics = {r["id"] for r in public["relics"]}
    threat = enemy["intent"]["amount"] if enemy["intent"]["type"] == "attack" else 0
    best = (-float("inf"), None)
    # Enumerate card ordering on the known hand. Draws get a conservative value,
    # and the next action is replanned once the server reveals the actual card.
    def visit(indices, energy, health, shield, enemy_hp, enemy_shield, combo, weak, vulnerable, first_guard, draw_value, first):
        nonlocal best
        expected_threat = threat*3//4 if weak and not enemy["weak"] else threat
        defense = min(shield, expected_threat)
        dealt = enemy["health"]-enemy_hp
        score = dealt*1.12 + defense*1.22 + (health-public["health"])*1.2 + draw_value
        if enemy_hp <= 0:
            score += 1000 + health*2 + energy
        if health-max(0, expected_threat-shield) <= 0 and enemy_hp > 0:
            score -= 1000
        if first is not None and score > best[0]:
            best = (score, first)
        if enemy_hp <= 0:
            return
        for i in indices:
            c = hand[i]
            if c["cost"] > energy:
                continue
            dmg = c.get("attack", 0)
            ehp, es = enemy_hp, enemy_shield
            if dmg:
                dmg += ("lens" in relics) + c.get("combo", 0)*combo
                if public["captain"]["id"] == "ember" and combo == 0:
                    dmg += 2
                if vulnerable:
                    dmg = dmg*3//2
                for _ in range(c.get("hits", 1)):
                    stopped = 0 if c.get("pierce") else min(dmg, es)
                    es -= stopped
                    ehp -= dmg-stopped
            block = c.get("block", 0)
            if block:
                block += 2*("shell" in relics)
                if public["captain"]["id"] == "tide" and first_guard:
                    block += 3
            visit([j for j in indices if i != j], energy-c["cost"]+c.get("energy", 0),
                  min(public["maxHealth"], health+c.get("heal", 0)), shield+block,
                  max(0, ehp), es, combo+bool(c.get("attack")), weak or bool(c.get("weak")),
                  vulnerable or bool(c.get("vulnerable")), first_guard and not bool(block),
                  draw_value+c.get("draw", 0)*1.5, i if first is None else first)
    visit(list(range(len(hand))), public["energy"], public["health"], public["block"], enemy["health"], enemy["block"], public["combo"], bool(enemy["weak"]), bool(enemy["vulnerable"]), True, 0, None)
    if best[1] is None:
        return {"endTurn": True}
    c = hand[best[1]]
    # Stop instead of spending cards that add no current value.
    if not c.get("attack") and not c.get("draw") and not c.get("energy") and not c.get("weak") and (not c.get("heal") or public["health"] == public["maxHealth"]) and (not c.get("block") or public["block"] >= threat):
        return {"endTurn": True}
    return {"play": c["uid"]}


def run(seed, captain="ember", policy=sensible_action, elite=False):
    state, maximum = game.create(seed)
    state, steps, result = game.move(state, 0, maximum, {"captain": captain})
    rng = random.Random(seed)
    while result is None:
        public = game.public_state(state)
        if policy is None:
            action = rng.choice(public["actions"])["action"]
        else:
            action = policy(public)
        if elite and public["phase"] == "route":
            action = {"route": "elite"}
        state, steps, result = game.move(state, steps, maximum, action)
    return result, steps, state


class VoyageRulesTests(unittest.TestCase):
    def battle(self, captain="ember"):
        state, maximum = game.create("fixture")
        state, steps, _ = game.move(state, 0, maximum, {"captain": captain})
        state, steps, _ = game.move(state, steps, maximum, {"route": "safe"})
        return state, steps, maximum

    def test_catalogue_and_distinct_captains(self):
        self.assertGreaterEqual(len(game.CARDS), 12)
        self.assertGreaterEqual(len(game.RELICS), 8)
        self.assertGreaterEqual(len(game.ENEMIES), 5)
        decks = []
        for captain in game.CAPTAINS:
            state, _, _ = self.battle(captain)
            decks.append(tuple(c["id"] for c in state["deck"]))
            self.assertEqual(len(state["hand"]), 5)
            self.assertEqual(state["energy"], 4 if captain == "gear" else 3)
        self.assertEqual(len(set(decks)), 3)

    def test_seed_determinism_serialization_and_purity(self):
        a, maximum = game.create("same")
        b = copy.deepcopy(a)
        for steps in range(30):
            if a["phase"] == "finished":
                break
            action = sensible_action(game.public_state(a))
            before = copy.deepcopy(a)
            a2, _, result = game.move(a, steps, maximum, action)
            self.assertEqual(a, before)
            b2, _, _ = game.move(json.loads(json.dumps(b)), steps, maximum, action)
            self.assertEqual(a2, b2)
            a, b = a2, b2
        different, _, _ = self.battle()
        c, cap = game.create("other")
        c, n, _ = game.move(c, 0, cap, {"captain": "ember"})
        c, _, _ = game.move(c, n, cap, {"route": "safe"})
        self.assertNotEqual(c["_draw"], different["_draw"])

    def test_public_state_hides_rng_draw_order_and_future_intents(self):
        state, _, _ = self.battle()
        public = game.public_state(state)
        forbidden = {"_seed", "_draw", "_discard", "_randomIndex", "_routeEnemies", "_intentOffset", "pattern", "deck", "target"}
        def keys(value):
            if isinstance(value, dict):
                return set(value) | set().union(*(keys(v) for v in value.values()), set())
            if isinstance(value, list):
                return set().union(*(keys(v) for v in value), set())
            return set()
        self.assertFalse(keys(public) & forbidden)
        self.assertIn("intent", public["enemy"])
        changed = copy.deepcopy(state)
        changed["_seed"] = "hidden-other-seed"
        changed["_draw"].reverse()
        changed["_discard"].reverse()
        self.assertEqual(public, game.public_state(changed))
        public["enemy"]["health"] = -123
        self.assertGreater(state["enemy"]["health"], 0)

    def test_illegal_actions_do_not_mutate(self):
        state, steps, maximum = self.battle()
        before = copy.deepcopy(state)
        for action in ({}, {"endTurn": 1}, {"endTurn": False}, {"play": "c999"}, {"play": 1}, {"captain": "ember"}, {"route": "safe"}, {"endTurn": True, "play": "c1"}, [], None):
            with self.assertRaises(ValueError):
                game.move(state, steps, maximum, action)
            self.assertEqual(state, before)
        state["energy"] = 0
        card = next(c for c in game.public_state(state)["hand"] if c["cost"] > 0)
        with self.assertRaises(ValueError):
            game.move(state, steps, maximum, {"play": card["uid"]})

    def test_defeat_and_terminal_immutability(self):
        state, steps, maximum = self.battle()
        result = None
        while result is None:
            state, steps, result = game.move(state, steps, maximum, {"endTurn": True})
        self.assertFalse(result["won"])
        self.assertEqual(state["health"], 0)
        self.assertEqual(state["phase"], "finished")
        with self.assertRaises(ValueError):
            game.move(state, steps, maximum, {"endTurn": True})
        state, steps, maximum = self.battle()
        state, _, result = game.move(state, maximum-1, maximum, {"endTurn": True})
        self.assertFalse(result["won"])
        self.assertIn("操作数", result["reason"])

    def test_visible_intent_matches_enemy_action_and_weak(self):
        state, steps, maximum = self.battle()
        state["enemy"]["id"] = "moth"
        state["_intentOffset"] = 0
        state["enemy"]["weak"] = 2
        state["block"] = 2
        intent = game.public_state(state)["enemy"]["intent"]
        health = state["health"]
        new, _, _ = game.move(state, steps, maximum, {"endTurn": True})
        self.assertEqual(new["health"], health-max(0, intent["amount"]-2))
        self.assertEqual(new["enemy"]["weak"], 1)

    def test_combo_order_vulnerability_and_block(self):
        state, steps, maximum = self.battle()
        state["deck"] = [{"uid": "first", "id": "strike", "upgraded": False}, {"uid": "last", "id": "echo", "upgraded": False}]
        state["hand"] = ["first", "last"]
        state["_draw"], state["_discard"] = [], []
        state["enemy"]["health"] = state["enemy"]["maxHealth"] = 100
        a, n, _ = game.move(state, steps, maximum, {"play": "first"})
        a, _, _ = game.move(a, n, maximum, {"play": "last"})
        b, n, _ = game.move(state, steps, maximum, {"play": "last"})
        b, _, _ = game.move(b, n, maximum, {"play": "first"})
        self.assertLess(a["enemy"]["health"], b["enemy"]["health"])
        self.assertEqual(a["combo"], 2)

    def test_rewards_routes_events_and_winning_shape(self):
        result, steps, state = run(3)
        self.assertTrue(result["won"])
        self.assertEqual(state["battlesWon"], 3)
        self.assertGreaterEqual(len(state["relics"]), 1)
        self.assertEqual(set(result), {"won", "score", "medal", "reason"})
        self.assertLess(steps, 65)
        state["phase"] = "event"
        state["_eventRelic"] = "lens"
        state["health"] = 7
        self.assertEqual(game.public_state(state)["actions"], [{"id": "leave", "label": "安全绕行", "action": {"event": "leave"}}])
        with self.assertRaises(ValueError):
            game.move(state, 0, game.MAX_STEPS, {"event": "salvage"})

    def test_strategy_beats_random_for_all_captains(self):
        # Fixed, diverse seeds make balance regressions reproducible. No testing
        # policy can inspect future draws, current RNG state, or hidden enemies.
        strategic, random_wins, lengths = [], 0, []
        for captain in game.CAPTAINS:
            wins = 0
            for seed in range(15):
                result, steps, _ = run(seed, captain)
                wins += result["won"]
                lengths.append(steps)
                random_wins += run(seed, captain, policy=None)[0]["won"]
            strategic.append(wins)
        self.assertTrue(all(wins >= 10 for wins in strategic), strategic)
        self.assertGreater(sum(strategic), random_wins+10)
        self.assertLess(statistics.median(lengths), 55)


if __name__ == "__main__":
    unittest.main()
