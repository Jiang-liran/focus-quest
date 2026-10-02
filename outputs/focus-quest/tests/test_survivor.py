import importlib.util
import json
import math
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("survivor_rules", Path(__file__).resolve().parents[1] / "survivor_rules.py")
rules = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rules)


class SurvivorRulesTest(unittest.TestCase):
    def make(self, hero="ranger", arena="glade", seed="test"):
        state, cap = rules.create(seed)
        state, steps, result = rules.move(state, 0, cap, {"kind": "deploy", "hero": hero, "arena": arena})
        self.assertIsNone(result)
        return state

    def act(self, state, action):
        return rules.move(state, 1, rules.MAX_STEPS, action)

    def tick(self, state, elapsed=.1, **kwargs):
        return self.act(state, {"kind": "tick", "elapsed": elapsed, **kwargs})[0]

    def empty(self, state):
        state["enemies"] = []
        state["_spawnClock"] = 900
        state["_nextElite"] = 900
        return state

    def test_prepare_catalog_and_private_state(self):
        state, cap = rules.create("hello")
        public = rules.public_state(state)
        self.assertEqual(public["phase"], "prepare")
        self.assertEqual(len(public["heroes"]), 3)
        self.assertEqual(len(public["arenas"]), 3)
        self.assertEqual(len(public["catalog"]["weapons"]), 6)
        self.assertEqual(len(public["catalog"]["passives"]), 6)
        self.assertNotIn("_rng", json.dumps(public))
        self.assertEqual(cap, 100000)
        public["player"]["hp"] = 0
        self.assertEqual(state["player"]["hp"], 100)

    def test_seeded_runs_match_and_inputs_not_mutated(self):
        a, b = self.make(seed="same"), self.make(seed="same")
        before = json.dumps(a, sort_keys=True)
        action = {"kind": "tick", "elapsed": .5, "dx": .3, "dy": .7, "speed": 2}
        next_a = self.act(a, action)[0]
        self.assertEqual(before, json.dumps(a, sort_keys=True))
        self.assertEqual(next_a, self.act(b, action)[0])
        self.assertNotEqual(self.make(seed="other")["enemies"], a["enemies"])

    def test_deploy_heroes_and_map_geometry(self):
        for hero in rules.HEROES:
            s = self.make(hero, "ruins")
            self.assertEqual(s["player"]["hp"], rules.HEROES[hero]["hp"])
            self.assertEqual(s["weapons"], {rules.HEROES[hero]["weapon"]: 1})
            self.assertEqual(len(s["obstacles"]), 6)

    def test_double_speed_scales_entire_simulation(self):
        s = self.empty(self.make())
        normal = self.tick(s, .4, dx=1, speed=1)
        double = self.tick(s, .4, dx=1, speed=2)
        self.assertAlmostEqual(normal["time"], .4)
        self.assertAlmostEqual(double["time"], .8)
        self.assertAlmostEqual(double["player"]["x"] - 800, 2 * (normal["player"]["x"] - 800))

    def test_diagonal_speed_is_normalized(self):
        s = self.empty(self.make())
        t = self.tick(s, .3, dx=1, dy=1)
        self.assertAlmostEqual(math.hypot(t["player"]["x"] - 800, t["player"]["y"] - 500), rules.HEROES["ranger"]["speed"] * .3)

    def test_pause_and_upgrade_freeze_simulated_time(self):
        s = self.make()
        s = self.act(s, {"kind": "pause", "paused": True})[0]
        self.assertEqual(self.tick(s, .5, dx=1, speed=2)["time"], 0)
        s = self.act(s, {"kind": "pause", "paused": False})[0]
        s["xp"] = 100
        s = self.tick(s)
        self.assertEqual(s["phase"], "upgrade")
        paused = self.tick(s, .5, speed=2)
        self.assertEqual(paused["time"], s["time"])
        self.assertEqual(paused["player"], s["player"])

    def test_invalid_client_actions_cannot_inject_combat(self):
        s = self.make()
        invalid = [{"kind": []}, {"kind": "tick", "elapsed": 99}, {"kind": "tick", "elapsed": float("nan")},
                   {"kind": "tick", "elapsed": .1, "dx": float("inf")}, {"kind": "tick", "elapsed": .1, "dy": True},
                   {"kind": "tick", "elapsed": .1, "speed": 3}, {"kind": "tick", "elapsed": .1, "speed": True},
                   {"kind": "tick", "elapsed": .1, "kills": 1000}, {"kind": "upgrade", "id": "weapon:meteor"},
                   {"kind": "pause", "paused": 1}, {"kind": "deploy", "hero": [], "arena": "glade"}]
        for action in invalid:
            with self.subTest(action=action), self.assertRaises(ValueError):
                self.act(s, action)

    def test_dash_has_invulnerability_cooldown_and_real_movement(self):
        s = self.empty(self.make())
        dash = self.act(s, {"kind": "dash", "dx": 1, "dy": 0})[0]
        self.assertEqual(dash["player"]["dashCd"], 4)
        self.assertGreater(dash["player"]["invulnerable"], 0)
        rules._hurt(dash, 900)
        self.assertEqual(dash["player"]["hp"], 100)
        moved = self.tick(dash, .1)
        self.assertGreater(moved["player"]["x"] - s["player"]["x"], 60)
        again = self.act(moved, {"kind": "dash", "dx": -1})[0]
        self.assertEqual(again["stats"]["dodges"], 1)
        self.assertEqual(again["_dashX"], 1)

    def test_circle_world_and_ruins_collisions(self):
        s = self.empty(self.make(arena="ruins"))
        s["player"]["x"], s["player"]["y"] = 450, 320
        moved = self.tick(s, .5, dx=1)
        self.assertGreaterEqual(rules._distance(moved["player"], s["obstacles"][0]), 48 - 1e-6)
        s["player"]["x"], s["player"]["y"] = 1580, 990
        moved = self.tick(s, .5, dx=1, dy=1)
        self.assertLessEqual(moved["player"]["x"], 1586)
        self.assertLessEqual(moved["player"]["y"], 986)

    def test_experience_pickup_opens_three_valid_choices(self):
        s = self.empty(self.make())
        rules._gem(s, 800, 500, 10)
        s = self.tick(s)
        self.assertEqual(s["phase"], "upgrade")
        self.assertEqual(s["level"], 2)
        self.assertEqual(len({c["id"] for c in s["choices"]}), 3)
        selected = s["choices"][0]
        improved = self.act(s, {"kind": "upgrade", "id": selected["id"]})[0]
        self.assertEqual(improved["phase"], "playing")
        bucket = "weapons" if selected["kind"] == "weapon" else "passives"
        self.assertEqual(improved[bucket][selected["key"]], selected["level"])

    def test_large_pickup_chains_choices_without_losing_xp(self):
        s = self.empty(self.make())
        s["xp"] = 100
        s = self.tick(s)
        levels = 0
        while s["phase"] == "upgrade":
            s = self.act(s, {"kind": "upgrade", "id": s["choices"][0]["id"]})[0]
            levels += 1
        self.assertEqual(levels, 3)
        self.assertEqual(s["level"], 4)
        self.assertAlmostEqual(s["xp"], 37)

    def test_evolution_requires_matching_pair_and_is_presented(self):
        for weapon, meta in rules.WEAPONS.items():
            s = self.make()
            s["weapons"] = {weapon: 4}
            s["passives"] = {meta["pair"]: 2}
            rules._choices(s)
            choice = next(c for c in s["choices"] if c["kind"] == "evolution")
            self.assertEqual(choice["key"], weapon)
            s["phase"] = "upgrade"
            evolved = self.act(s, {"kind": "upgrade", "id": choice["id"]})[0]
            self.assertIn(weapon, evolved["evolved"])
            self.assertEqual(evolved["stats"]["evolutions"], 1)
            pub = rules.public_state(evolved)
            self.assertEqual(pub["weapons"][0]["name"], meta["evolution"])
            self.assertTrue(pub["weapons"][0]["evolved"])
            s["passives"][meta["pair"]] = 1
            rules._choices(s)
            self.assertFalse(any(c["kind"] == "evolution" for c in s["choices"]))

    def test_full_build_does_not_offer_new_slots_or_duplicates(self):
        s = self.make()
        s["weapons"] = {key: 5 for key in list(rules.WEAPONS)[:4]}
        s["passives"] = {key: 4 for key in list(rules.PASSIVES)[:4]}
        s["evolved"] = list(s["weapons"])
        rules._choices(s)
        self.assertTrue(all(c["kind"] == "supply" for c in s["choices"]))

    def test_all_six_weapons_can_damage_enemies(self):
        for weapon in rules.WEAPONS:
            s = self.empty(self.make())
            s["weapons"] = {weapon: 4}
            rules._spawn(s, "tank")
            e = s["enemies"][0]
            e.update(x=875, y=500, hp=1000, maxHp=1000)
            for _ in range(10):
                s = self.tick(s, .1)
            self.assertGreater(s["stats"]["damage"], 0, weapon)

    def test_projectiles_and_pickups_are_authoritative(self):
        s = self.empty(self.make())
        rules._spawn(s, "shade")
        e = s["enemies"][0]
        e.update(x=850, y=500, hp=1)
        s = self.tick(s, .2)
        self.assertEqual(s["kills"], 1)
        self.assertEqual(s["stats"]["kills"], 1)
        self.assertTrue(s["gems"] or s["xp"])
        s["player"]["hp"] = 40
        rules._pickup(s, s["player"]["x"], s["player"]["y"], "heal")
        s = self.tick(s)
        self.assertEqual(s["player"]["hp"], 67)
        rules._pickup(s, s["player"]["x"], s["player"]["y"], "magnet")
        rules._gem(s, 1200, 900, 1)
        s = self.tick(s)
        self.assertGreater(s["_magnetTime"], 0)
        self.assertTrue(s["gems"][0]["_attracted"])

    def test_armor_and_contact_invulnerability_prevent_stacked_damage(self):
        s = self.make("warden")
        s["passives"]["armor"] = 2
        rules._hurt(s, 10)
        self.assertEqual(s["player"]["hp"], 126)
        rules._hurt(s, 10)
        self.assertEqual(s["player"]["hp"], 126)

    def test_enemy_telegraph_precedes_attack(self):
        s = self.empty(self.make())
        s["weapons"] = {}
        rules._spawn(s, "spitter")
        e = s["enemies"][0]
        e.update(x=1030, y=500, _attackCd=0)
        s = self.tick(s, .1)
        self.assertGreater(s["enemies"][0]["telegraph"], 0)
        self.assertFalse(any(shot["enemy"] for shot in s["shots"]))
        s = self.tick(s, .5)
        s = self.tick(s, .1)
        self.assertTrue(any(shot["enemy"] for shot in s["shots"]))

    def test_boss_arrives_once_and_victory_has_trusted_performance(self):
        s = self.empty(self.make())
        s["time"] = 149.9
        s = self.tick(s, .2)
        boss = next(e for e in s["enemies"] if e["type"] == "boss")
        self.assertTrue(s["_bossSpawned"])
        self.assertEqual(rules.public_state(s)["boss"]["name"], "黯星领主")
        rules._damage(s, boss, 99999)
        result = s["_result"]
        self.assertTrue(result["won"])
        self.assertTrue(result["bossKilled"])
        self.assertEqual(result["bossesKilled"], 1)
        self.assertEqual(result["kills"], s["kills"])
        self.assertEqual(result["level"], s["level"])
        self.assertEqual(result["hpRatio"], 1)
        self.assertEqual(s["phase"], "ended")
        self.assertNotIn("coins", result)

    def test_survival_deadline_and_death_are_final(self):
        s = self.empty(self.make())
        s["time"], s["_bossSpawned"] = 179.9, True
        s, steps, result = self.act(s, {"kind": "tick", "elapsed": .5})
        self.assertTrue(result["won"])
        self.assertEqual(result["time"], 180)
        self.assertFalse(result["bossKilled"])
        with self.assertRaises(ValueError):
            self.tick(s)
        s = self.make()
        rules._hurt(s, 1000)
        self.assertFalse(s["_result"]["won"])
        self.assertEqual(s["_result"]["hpRatio"], 0)

    def test_scene_bounds_and_snapshot_size_are_capped(self):
        s = self.make()
        for _ in range(200):
            rules._spawn(s, "shade")
            rules._gem(s, 600, 400, 1)
            rules._effect(s, "shatter", 600, 400, 20)
            rules._pickup(s, 600, 400, "heal")
        self.assertLessEqual(len(s["enemies"]), 105)
        self.assertLessEqual(len(s["gems"]), 140)
        self.assertLessEqual(len(s["effects"]), 80)
        self.assertLessEqual(len(s["pickups"]), 16)
        self.assertEqual(sum(g["value"] for g in s["gems"]), 200)
        self.assertLess(len(json.dumps(rules.public_state(s))), 90000)


if __name__ == "__main__":
    unittest.main()
