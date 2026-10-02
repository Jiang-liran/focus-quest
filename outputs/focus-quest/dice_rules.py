"""A finite, server-authoritative dice encounter. No wagers or wallet state.

Only public_state may be sent to clients: the persisted Random state is private.
Every decision has a deterministic preview; randomness only rolls actual dice
or offers relics, never decides whether a completed encounter was won.
"""
from collections import Counter
from copy import deepcopy
import random


MAX_STEPS = 20  # Two drafts + six techniques + up to twelve rerolls.
ELEMENTS = ("fire", "tide", "moss")
TECHNIQUES = (
    {"id": "surge", "name": "星火齐射", "description": "五骰点数之和 + 2 点攻击。没有护盾，适合高点数或抢下最后一击。"},
    {"id": "pairs", "name": "双星连击", "description": "每对相同点数提供点数之和 + 7 攻击、4 护盾；四同算两对。无对子则为 4 攻击、2 护盾。"},
    {"id": "triple", "name": "共鸣重锤", "description": "最多的同点骰：3 颗起为点数之和 + 16 攻击；2 颗为点数之和 + 5，散骰仅 5。"},
    {"id": "straight", "name": "流星阶梯", "description": "最长连续点数每颗提供 5 攻击，另加 3；四连再 + 5，五连再 + 6。重复点数只计一次。"},
    {"id": "chorus", "name": "元素合唱", "description": "最多的同色骰每颗提供 4 攻击、2 护盾，另加 4 攻击。颜色与点数独立。"},
    {"id": "ward", "name": "月石壁垒", "description": "每颗偶数骰提供 2 攻击、3 护盾，另加 3 攻击、5 护盾。留给重击轮更有效。"},
)
RELICS = (
    {"id": "ember", "name": "余烬指环", "description": "每颗火骰额外 + 2 攻击。"},
    {"id": "tide", "name": "潮汐贝壳", "description": "每颗潮骰额外 + 2 护盾。护盾只抵挡本轮攻击。"},
    {"id": "moss", "name": "苔心吊坠", "description": "至少两颗苔骰时，出招前恢复 4 体力。"},
    {"id": "prism", "name": "三棱晶灯", "description": "五骰集齐火、潮、苔三色时，额外 + 5 攻击、2 护盾。"},
    {"id": "echo", "name": "静默怀表", "description": "本轮未重掷就出招时，额外 + 8 攻击、2 护盾。"},
    {"id": "anvil", "name": "锻星铁砧", "description": "双星连击、共鸣重锤额外 + 9 攻击、3 护盾。"},
    {"id": "thorn", "name": "荆棘护符", "description": "本轮护盾每可抵挡 2 点敌人伤害，额外 + 1 攻击，最多 + 6。"},
    {"id": "compass", "name": "虹光罗盘", "description": "流星阶梯、元素合唱额外 + 9 攻击；月石壁垒额外 + 3 攻击。"},
)
RELIC_BY_ID = {r["id"]: r for r in RELICS}
BOSSES = (
    {"id": "iron", "name": "熔铁守卫", "description": "交替架盾。高攻击招式留给没有护甲的轮次，壁垒挡住重锤。",
     "maxHealth": 160, "intents": [
         {"name": "试探斩", "attack": 9, "armor": 0},
         {"name": "架盾冲撞", "attack": 12, "armor": 3},
         {"name": "炉心散热", "attack": 8, "armor": 0},
         {"name": "重锤蓄击", "attack": 16, "armor": 5},
         {"name": "护甲裂隙", "attack": 10, "armor": 0},
         {"name": "最后重锤", "attack": 18, "armor": 3}]},
    {"id": "storm", "name": "雷羽巨隼", "description": "没有护甲，但俯冲一轮比一轮猛烈。对子与同色可以边攻边守。",
     "maxHealth": 163, "intents": [
         {"name": "掠翼", "attack": 7, "armor": 0},
         {"name": "雷霆俯冲", "attack": 15, "armor": 0},
         {"name": "盘旋", "attack": 8, "armor": 0},
         {"name": "暴风俯冲", "attack": 18, "armor": 0},
         {"name": "低空掠过", "attack": 9, "armor": 0},
         {"name": "终焉雷暴", "attack": 22, "armor": 0}]},
    {"id": "briar", "name": "古苔树王", "description": "每轮都有 2 护甲，攻击逐轮增强。集中打出大组合，避免零碎伤害。",
     "maxHealth": 154, "intents": [
         {"name": "枝条轻扫", "attack": 8, "armor": 2},
         {"name": "缠根", "attack": 9, "armor": 2},
         {"name": "巨枝横扫", "attack": 12, "armor": 2},
         {"name": "落叶卷风", "attack": 11, "armor": 2},
         {"name": "树根震击", "attack": 14, "armor": 2},
         {"name": "古木倾压", "attack": 17, "armor": 2}]},
)


def _require(condition, message="这一步无效，请按骰局规则操作"):
    if not condition:
        raise ValueError(message)


def _tuples(value):
    """Random state survives the server's JSON persistence round trip."""
    return tuple(_tuples(v) for v in value) if isinstance(value, (list, tuple)) else value


def _rng(state):
    rng = random.Random()
    rng.setstate(_tuples(state["_rng"]))
    return rng


def _roll(rng):
    return {"value": rng.randint(1, 6), "element": rng.choice(ELEMENTS)}


def _offer(state, rng):
    owned = {r["id"] for r in state["relics"]}
    state["relicChoices"] = deepcopy(rng.sample([r for r in RELICS if r["id"] not in owned], 3))
    state["phase"] = "draft"


def _start_turn(state, rng):
    state["phase"] = "play"
    state["dice"] = [_roll(rng) for _ in range(5)]
    state["rerollsLeft"] = 2


def create(seed):
    rng = random.Random(seed)
    boss = deepcopy(rng.choice(BOSSES))
    boss["health"] = boss["maxHealth"]
    state = {"phase": "draft", "turn": 1, "maxTurns": 6,
             "health": 48, "maxHealth": 48, "dice": [], "rerollsLeft": 2,
             "boss": boss, "relics": [], "relicChoices": [], "usedTechniques": [],
             "score": 0, "lastTurn": None,
             "message": "先选一件遗物。六轮内击败守卫；每种招式仅能用一次，锁住好骰再重掷。"}
    _offer(state, rng)
    state["_rng"] = rng.getstate()
    return state, MAX_STEPS


def _preview(state, technique):
    dice = state["dice"]
    if not dice:
        return {**technique, "used": technique["id"] in state["usedTechniques"],
                "attack": 0, "shield": 0, "heal": 0, "score": 0, "combo": "选择遗物后投骰", "indices": []}
    values = [d["value"] for d in dice]
    counts = Counter(values)
    ident = technique["id"]
    shield, heal, indices = 0, 0, list(range(5))
    if ident == "surge":
        attack = sum(values) + 2
        combo = f"总点数 {sum(values)}"
    elif ident == "pairs":
        indices = []
        for value in sorted(counts):
            matches = [i for i, v in enumerate(values) if v == value]
            indices.extend(matches[:len(matches)//2*2])
        pairs = len(indices)//2
        attack = sum(values[i] for i in indices) + 7*pairs if pairs else 4
        shield = 4*pairs if pairs else 2
        combo = f"{pairs} 对" if pairs else "尚无对子"
    elif ident == "triple":
        value = max(counts, key=lambda v: (counts[v], v))
        indices = [i for i, v in enumerate(values) if v == value]
        count = len(indices)
        attack = value*count + (16 if count >= 3 else 5) if count >= 2 else 5
        combo = f"{count} 颗 {value} 点" if count >= 2 else "尚无同点组合"
    elif ident == "straight":
        runs = []
        for start in sorted(counts):
            run = []
            while start in counts:
                run.append(start)
                start += 1
            runs.append(run)
        run = max(runs, key=lambda r: (len(r), sum(r)))
        indices = [values.index(v) for v in run]
        length = len(run)
        attack = 3 + 5*length + (5 if length >= 4 else 0) + (6 if length == 5 else 0)
        combo = f"{length} 连号 · " + "—".join(map(str, run))
    elif ident == "chorus":
        elements = Counter(d["element"] for d in dice)
        element = max(ELEMENTS, key=lambda e: elements[e])
        indices = [i for i, d in enumerate(dice) if d["element"] == element]
        count = len(indices)
        attack, shield = 4 + 4*count, 2*count
        combo = f"{count} 颗" + {"fire": "火", "tide": "潮", "moss": "苔"}[element] + "骰"
    else:  # ward
        indices = [i for i, v in enumerate(values) if v % 2 == 0]
        attack, shield = 3 + 2*len(indices), 5 + 3*len(indices)
        combo = f"{len(indices)} 颗偶数骰"
    relics = {r["id"] for r in state["relics"]}
    elements = Counter(d["element"] for d in dice)
    if "ember" in relics:
        attack += 2*elements["fire"]
    if "tide" in relics:
        shield += 2*elements["tide"]
    if "moss" in relics and elements["moss"] >= 2:
        heal += 4
    if "prism" in relics and len(elements) == 3:
        attack += 5
        shield += 2
    if "echo" in relics and state["rerollsLeft"] == 2:
        attack += 8
        shield += 2
    if "anvil" in relics and ident in ("pairs", "triple"):
        attack += 9
        shield += 3
    if "compass" in relics:
        attack += 9 if ident in ("straight", "chorus") else 3 if ident == "ward" else 0
    intent = state["boss"]["intents"][state["turn"]-1]
    if "thorn" in relics:
        attack += min(6, min(shield, intent["attack"])//2)
    attack = max(0, attack-intent["armor"])
    heal = min(heal, state["maxHealth"]-state["health"])
    damage = min(attack, state["boss"]["health"])
    # Lethal player attacks resolve before the enemy attacks.
    blocked = min(shield, intent["attack"]) if damage < state["boss"]["health"] else 0
    return {**technique, "used": ident in state["usedTechniques"], "attack": attack,
            "shield": shield, "heal": heal, "score": damage*4 + blocked*2 + heal*2,
            "combo": combo, "indices": indices}


def public_state(original):
    # Explicit allowlist prevents future private fields from leaking by accident.
    state = deepcopy({key: original[key] for key in (
        "phase", "turn", "maxTurns", "health", "maxHealth", "dice", "rerollsLeft",
        "boss", "relics", "relicChoices", "score", "lastTurn", "message")})
    state["intent"] = deepcopy(state["boss"]["intents"][state["turn"]-1])
    state["techniques"] = [_preview(original, t) for t in TECHNIQUES]
    return state


def _finish(state, won, reason):
    state["phase"] = "ended"
    state["relicChoices"] = []
    state["score"] += state["health"]*3 + (200 + (6-state["turn"])*25 if won else 0)
    state["message"] = reason
    medal = (3 if state["health"] >= 28 else 2 if state["health"] >= 12 else 1) if won else 0
    return {"won": won, "score": state["score"], "medal": medal, "reason": reason}


def move(original, steps, max_steps, action):
    """Validate exact client fields and return a fresh persisted state."""
    _require(type(action) is dict)
    _require(type(steps) is int and type(max_steps) is int and 0 <= steps < max_steps <= MAX_STEPS)
    _require(original["phase"] != "ended", "这场骰局已经结束")
    state = deepcopy(original)
    rng, result = _rng(state), None
    if state["phase"] == "draft":
        _require(set(action) == {"relic"} and type(action["relic"]) is str, "请先选择一件遗物")
        selected = next((r for r in state["relicChoices"] if r["id"] == action["relic"]), None)
        _require(selected is not None, "只能选择本次给出的遗物")
        state["relics"].append(selected)
        state["relicChoices"] = []
        _start_turn(state, rng)
        state["message"] = f"{selected['name']}已生效。点击骰子锁定，重掷其余骰子，或直接选择招式。"
    elif set(action) == {"reroll", "locked"}:
        _require(action["reroll"] is True and type(action["locked"]) is list)
        locked = action["locked"]
        _require(len(locked) <= 4 and all(type(i) is int and 0 <= i < 5 for i in locked), "至少留一颗骰子重掷")
        _require(len(set(locked)) == len(locked), "锁定骰子不能重复")
        _require(state["rerollsLeft"] > 0, "本轮两次重掷已经用完")
        state["dice"] = [d if i in locked else _roll(rng) for i, d in enumerate(state["dice"])]
        state["rerollsLeft"] -= 1
        state["message"] = f"已重掷 {5-len(locked)} 颗骰子；本轮还可重掷 {state['rerollsLeft']} 次。"
    else:
        _require(set(action) == {"technique"} and type(action["technique"]) is str)
        technique = next((t for t in TECHNIQUES if t["id"] == action["technique"]), None)
        _require(technique is not None, "不存在这个招式")
        _require(technique["id"] not in state["usedTechniques"], "每种招式一局只能使用一次")
        preview = _preview(state, technique)
        state["usedTechniques"].append(technique["id"])
        state["health"] += preview["heal"]
        state["boss"]["health"] = max(0, state["boss"]["health"]-preview["attack"])
        enemy_attack = state["boss"]["intents"][state["turn"]-1]["attack"] if state["boss"]["health"] > 0 else 0
        damage = max(0, enemy_attack-preview["shield"])
        state["health"] = max(0, state["health"]-damage)
        state["score"] += preview["score"]
        state["lastTurn"] = {"turn": state["turn"], "technique": technique["name"],
                             "attack": preview["attack"], "shield": preview["shield"],
                             "heal": preview["heal"], "damageTaken": damage,
                             "bossAttack": enemy_attack, "score": preview["score"], "combo": preview["combo"]}
        if state["boss"]["health"] == 0:
            result = _finish(state, True, f"第 {state['turn']} 轮击败{state['boss']['name']}！遗物与骰组奏出了胜利的共鸣。")
        elif state["health"] == 0:
            result = _finish(state, False, "体力耗尽，守卫赢下了这场切磋。下次把护盾招式留给重击轮。")
        elif state["turn"] == 6:
            result = _finish(state, False, f"六轮结束，守卫还剩 {state['boss']['health']} 体力。试试锁定组合，再用遗物补足伤害。")
        else:
            state["turn"] += 1
            if state["turn"] == 4:
                state["health"] = min(state["maxHealth"], state["health"]+6)
                state["dice"] = []
                _offer(state, rng)
                state["message"] = "中场休息，恢复 6 体力。再选一件遗物，搭配还没用过的招式。"
            else:
                _start_turn(state, rng)
                state["message"] = f"{technique['name']}造成 {preview['attack']} 伤害，承受 {damage} 伤害。下一轮骰子已投出。"
    steps += 1
    if result is None and steps >= max_steps:
        result = _finish(state, False, "本局行动次数已用完。下次带着新的组合再来。")
    state["_rng"] = rng.getstate()
    return state, steps, result
