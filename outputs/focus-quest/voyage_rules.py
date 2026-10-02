"""A short, deterministic, server-authoritative card expedition.

Only public_state may cross the server boundary. Randomness, draw order and
future encounters stay inside the persisted state; move never mutates its input.
"""
from copy import deepcopy
from collections import Counter
import random

CARDS = {
    "strike": {"name": "星火弹", "cost": 1, "attack": 6, "upAttack": 3, "description": "造成6伤害。"},
    "guard": {"name": "护盾阵", "cost": 1, "block": 6, "upBlock": 3, "description": "获得6格挡。"},
    "surge": {"name": "追光", "cost": 1, "attack": 4, "upAttack": 3, "draw": 1, "description": "造成4伤害，抽1张牌。"},
    "overload": {"name": "超载炮", "cost": 2, "attack": 15, "upAttack": 5, "description": "造成15伤害。"},
    "brace": {"name": "撞角", "cost": 1, "attack": 4, "block": 4, "upAttack": 2, "upBlock": 2, "description": "造成4伤害，获得4格挡。"},
    "pulse": {"name": "星图检索", "cost": 0, "draw": 2, "exhaust": True, "upDraw": 1, "description": "抽2张牌。本场移除。"},
    "focus": {"name": "应急电芯", "cost": 0, "energy": 1, "exhaust": True, "upDraw": 1, "description": "获得1能量。本场移除。"},
    "meteor": {"name": "双子流星", "cost": 2, "attack": 8, "hits": 2, "upAttack": 2, "description": "连续造成2次8伤害；攻击加成对每次生效。"},
    "pierce": {"name": "相位矛", "cost": 1, "attack": 7, "upAttack": 3, "pierce": True, "description": "造成7伤害，无视敌人格挡。"},
    "echo": {"name": "共振连击", "cost": 1, "attack": 3, "upAttack": 3, "combo": 4, "description": "造成3伤害，本回合此前每打出1张攻击牌，再加4伤害。"},
    "repair": {"name": "修复无人机", "cost": 1, "heal": 5, "upHeal": 3, "exhaust": True, "description": "回复5生命。本场移除。"},
    "jam": {"name": "干扰脉冲", "cost": 1, "block": 3, "upBlock": 3, "weak": 2, "description": "获得3格挡，使敌人虚弱2回合：攻击伤害降低25%。"},
    "sunder": {"name": "破甲标记", "cost": 1, "attack": 4, "upAttack": 3, "vulnerable": 2, "description": "先造成4伤害，再使敌人易伤2回合：所受攻击伤害增加50%。"},
    "bulwark": {"name": "陨铁壁垒", "cost": 2, "block": 15, "upBlock": 5, "description": "获得15格挡。"},
    "battery": {"name": "回收屏障", "cost": 1, "block": 5, "upBlock": 3, "energy": 1, "exhaust": True, "description": "获得5格挡和1能量。本场移除。"},
}
RELICS = {
    "lens": {"name": "聚星透镜", "description": "每次攻击额外造成1伤害。"},
    "shell": {"name": "潮纹外壳", "description": "每张提供格挡的卡牌额外提供2格挡。"},
    "compass": {"name": "跃迁罗盘", "description": "每场战斗首回合额外获得1能量。"},
    "medkit": {"name": "苔光药匣", "description": "每场战斗胜利后回复5生命。"},
    "heart": {"name": "恒星核心", "description": "立即增加8点生命上限，并回复8生命。"},
    "crown": {"name": "晨曦冠", "description": "每场战斗打出的第一张攻击牌每次命中额外造成6伤害。"},
    "coil": {"name": "回响线圈", "description": "每回合打出第3张牌后抽1张牌。"},
    "anchor": {"name": "月岩锚", "description": "每场战斗首回合获得8格挡。"},
}
CAPTAINS = {
    "ember": {"name": "烬羽", "description": "强攻：每回合第一张攻击牌，每次命中额外造成2伤害。", "maxHealth": 46,
              "deckDescription": "星火弹×3、护盾阵×3、共振连击、破甲标记、应急电芯、超载炮", "deck": ["strike"]*3+["guard"]*3+["echo", "sunder", "focus", "overload"]},
    "tide": {"name": "澜歌", "description": "潮盾：每回合第一张提供格挡的牌，额外提供3格挡。", "maxHealth": 52,
             "deckDescription": "星火弹×2、护盾阵×2、撞角×2、干扰脉冲、追光、修复无人机、超载炮", "deck": ["strike"]*2+["guard"]*2+["brace"]*2+["jam", "surge", "repair", "overload"]},
    "gear": {"name": "齿轮", "description": "先机：每场战斗首回合额外获得1能量。", "maxHealth": 46,
             "deckDescription": "星火弹×2、护盾阵×2、追光、相位矛、星图检索、回收屏障、超载炮、共振连击", "deck": ["strike"]*2+["guard"]*2+["surge", "pierce", "pulse", "battery", "overload", "echo"]},
}
ENEMIES = {
    "moth": {"name": "蚀光飞蛾", "health": 25, "pattern": [("attack", 7), ("attack", 10), ("guard", 6)]},
    "sentinel": {"name": "废墟哨兵", "health": 28, "pattern": [("guard", 7), ("attack", 12), ("attack", 8)]},
    "raider": {"name": "星盗快艇", "health": 26, "pattern": [("attack", 9), ("charge", 3), ("attack", 13)]},
    "wisp": {"name": "磁暴幽灵", "health": 34, "pattern": [("attack", 11), ("attack", 9), ("guard", 9)]},
    "crab": {"name": "陨甲巨蟹", "health": 37, "pattern": [("guard", 10), ("attack", 15), ("attack", 10)]},
    "boss": {"name": "黯星守望者", "health": 58, "pattern": [("attack", 12), ("guard", 10), ("attack", 19), ("attack", 13)]},
}
MAX_STEPS = 110


def _require(value, message="这一步无效，请选择当前可用的操作"):
    if not value:
        raise ValueError(message)


def _rng(state):
    state["_randomIndex"] += 1
    return random.Random(f'{state["_seed"]}:{state["_randomIndex"]}')


def _new_card(state, card_id):
    state["_cardCounter"] += 1
    return {"uid": f'c{state["_cardCounter"]}', "id": card_id, "upgraded": False}


def _card(card):
    meta = CARDS[card["id"]]
    out = {"id": card["id"], "name": meta["name"] + ("+" if card["upgraded"] else ""),
           "cost": meta["cost"], "description": meta["description"], "upgraded": card["upgraded"]}
    for key in ("attack", "block", "draw", "energy", "heal", "weak", "vulnerable", "combo", "hits", "pierce", "exhaust"):
        value = meta.get(key, 0)
        if card["upgraded"]:
            value += meta.get("up"+key[0].upper()+key[1:], 0)
        if value:
            out[key] = value
    if card["upgraded"]:
        gains = []
        for key, name in (("Attack", "基础伤害"), ("Block", "格挡"), ("Draw", "抽牌"), ("Heal", "回复")):
            if meta.get("up"+key):
                gains.append(f'{name}+{meta["up"+key]}')
        out["description"] += " 升级：" + "、".join(gains) + "。"
    return out


def _relic(relic_id):
    return {"id": relic_id, **RELICS[relic_id]}


def _log(state, message):
    state["message"] = message
    state["log"] = (state["log"] + [message])[-5:]


def create(seed):
    return {"phase": "captain", "captain": None, "health": 0, "maxHealth": 0, "stage": 1,
            "battlesWon": 0, "score": 0, "relics": [], "deck": [], "log": [],
            "message": "选一位船长，穿过三场短战斗，抵达黯星核心。每回合3能量；敌人的下一步始终可见。",
            "_seed": str(seed), "_randomIndex": 0, "_cardCounter": 0, "_routeEnemies": {},
            "_eliteWins": 0, "_result": None}, MAX_STEPS


def _set_routes(state):
    state["phase"] = "route"
    pool = ["moth", "sentinel", "raider"] if state["stage"] == 1 else ["wisp", "crab", "raider"]
    if state["stage"] == 3:
        state["_routeEnemies"] = {"safe": "boss", "elite": "boss"}
    else:
        state["_routeEnemies"] = {key: _rng(state).choice(pool) for key in ("safe", "elite")}
    _log(state, "选择航线：平稳航道适合保存生命，危险航道的奖励会额外强化。")


def _draw(state, count):
    for _ in range(count):
        if len(state["hand"]) >= 10:
            return
        if not state["_draw"]:
            if not state["_discard"]:
                return
            state["_draw"] = state["_discard"]
            state["_discard"] = []
            _rng(state).shuffle(state["_draw"])
        state["hand"].append(state["_draw"].pop())


def _intent(state):
    enemy = state["enemy"]
    pattern = ENEMIES[enemy["id"]]["pattern"]
    kind, amount = pattern[(state["turn"]-1 + state["_intentOffset"]) % len(pattern)]
    if kind == "attack":
        amount += state["_enemyPower"] + (state["turn"]-1)//3*2
        if enemy["weak"]:
            amount = amount*3//4
        label = f"攻击 {amount}"
    elif kind == "guard":
        label = f"获得 {amount} 格挡"
    else:
        label = f"蓄力：以后攻击 +{amount}"
    return {"type": kind, "amount": amount, "label": label}


def _turn(state):
    state["energy"] = 3
    state["block"] = 0
    state["combo"] = 0
    state["_guardPlayed"] = False
    state["_cardsPlayed"] = 0
    if state["turn"] == 1:
        state["energy"] += (state["captain"] == "gear") + ("compass" in state["relics"])
        state["block"] = 8 if "anchor" in state["relics"] else 0
    _draw(state, 5)


def _battle(state, route):
    state["phase"] = "battle"
    state["_route"] = route
    enemy_id = state["_routeEnemies"][route]
    meta = ENEMIES[enemy_id]
    health = meta["health"] + (8 if route == "elite" else 0) + (6 if state["stage"] == 2 and enemy_id == "raider" else 0)
    state["enemy"] = {"id": enemy_id, "name": meta["name"] + (" · 精英" if route == "elite" else ""),
                      "health": health, "maxHealth": health, "block": 0, "weak": 0, "vulnerable": 0}
    state["_enemyPower"] = 2 if route == "elite" else 0
    state["_intentOffset"] = _rng(state).randrange(len(meta["pattern"]))
    state["_draw"] = [card["uid"] for card in state["deck"]]
    _rng(state).shuffle(state["_draw"])
    state["_discard"], state["_exhaust"], state["hand"] = [], [], []
    state["turn"] = 1
    state["_firstAttack"] = True
    _turn(state)
    _log(state, "先看敌人意图，再安排攻击、格挡与连击顺序。结束回合时敌人才行动，未打出的手牌会弃掉。")


def _add_relic(state, relic_id):
    state["relics"].append(relic_id)
    if relic_id == "heart":
        state["maxHealth"] += 8
        state["health"] = min(state["maxHealth"], state["health"]+8)


def _finish(state, won, reason):
    state["phase"] = "finished"
    state["score"] += (state["health"]*3+200) if won else 0
    result = {"won": won, "score": state["score"], "medal": (3 if state["_eliteWins"] >= 2 else 2 if state["health"] >= state["maxHealth"]//2 else 1) if won else 0, "reason": reason}
    state["_result"] = result
    _log(state, reason)
    return result


def _reward(state):
    state["phase"] = "reward"
    rng = _rng(state)
    options = []
    available = [c for c in state["deck"] if not c["upgraded"]]
    if available:
        target = rng.choice(available)
        options.append({"id": "upgrade", "kind": "upgrade", "target": target["uid"], "card": {**target, "upgraded": True}, "title": "精炼 · "+CARDS[target["id"]]["name"], "description": "升级这张牌，整段远征生效。"})
    else:
        options.append({"id": "repair", "kind": "heal", "title": "紧急修复", "description": "回复12生命。"})
    available_relics = [r for r in RELICS if r not in state["relics"]]
    relic = rng.choice(available_relics)
    options.append({"id": "relic", "kind": "relic", "relic": relic, "title": RELICS[relic]["name"], "description": RELICS[relic]["description"]})
    card_id = rng.choice([key for key in CARDS if key not in ("strike", "guard")])
    card = {"id": card_id, "uid": "preview", "upgraded": state["_route"] == "elite"}
    options.append({"id": "card", "kind": "card", "card": card, "title": "加入 · "+_card(card)["name"], "description": "把这张牌加入牌组。"})
    state["_rewardOptions"] = options
    bonus = "精英胜利：已额外回复4生命；新卡直接升级。" if state["_route"] == "elite" else ""
    _log(state, "战后补给三选一。"+bonus)


def _victory(state):
    state["battlesWon"] += 1
    state["score"] += 100 + (70 if state["_route"] == "elite" else 0) + max(0, 7-state["turn"])*10
    if state["_route"] == "elite":
        state["_eliteWins"] += 1
    heal = (5 if "medkit" in state["relics"] else 0)+(4 if state["_route"] == "elite" else 0)
    state["health"] = min(state["maxHealth"], state["health"]+heal)
    if state["stage"] == 3:
        return _finish(state, True, "击败黯星守望者，星船远征成功！")
    _reward(state)
    return None


def _play(state, uid):
    card = next(c for c in state["deck"] if c["uid"] == uid)
    stats = _card(card)
    state["energy"] -= stats["cost"]
    state["hand"].remove(uid)
    (state["_exhaust"] if stats.get("exhaust") else state["_discard"]).append(uid)
    enemy = state["enemy"]
    damage = 0
    if stats.get("attack"):
        amount = stats["attack"] + (1 if "lens" in state["relics"] else 0)
        amount += stats.get("combo", 0)*state["combo"]
        if state["captain"] == "ember" and state["combo"] == 0:
            amount += 2
        if state["_firstAttack"] and "crown" in state["relics"]:
            amount += 6
        if enemy["vulnerable"]:
            amount = amount*3//2
        for _ in range(stats.get("hits", 1)):
            blocked = 0 if stats.get("pierce") else min(enemy["block"], amount)
            enemy["block"] -= blocked
            damage += amount-blocked
        enemy["health"] = max(0, enemy["health"]-damage)
        state["combo"] += 1
        state["_firstAttack"] = False
    if stats.get("block"):
        block = stats["block"] + (2 if "shell" in state["relics"] else 0)
        if state["captain"] == "tide" and not state["_guardPlayed"]:
            block += 3
        state["block"] += block
        state["_guardPlayed"] = True
    state["health"] = min(state["maxHealth"], state["health"]+stats.get("heal", 0))
    state["energy"] += stats.get("energy", 0)
    enemy["weak"] = max(enemy["weak"], stats.get("weak", 0))
    enemy["vulnerable"] = max(enemy["vulnerable"], stats.get("vulnerable", 0))
    _draw(state, stats.get("draw", 0))
    state["_cardsPlayed"] += 1
    if state["_cardsPlayed"] == 3 and "coil" in state["relics"]:
        _draw(state, 1)
    _log(state, "打出"+stats["name"]+(f"，造成{damage}伤害。" if stats.get("attack") else "。"))
    if enemy["health"] == 0:
        return _victory(state)
    return None


def _end_turn(state):
    intent = _intent(state)
    enemy = state["enemy"]
    # Enemy shields protect through the player turn, then expire before acting.
    enemy["block"] = 0
    if intent["type"] == "attack":
        damage = max(0, intent["amount"]-state["block"])
        state["health"] = max(0, state["health"]-damage)
        message = f'敌人攻击{intent["amount"]}，护盾挡住{min(state["block"], intent["amount"])}，失去{damage}生命。'
    elif intent["type"] == "guard":
        enemy["block"] = intent["amount"]
        message = f'敌人获得{intent["amount"]}格挡。'
    else:
        state["_enemyPower"] += intent["amount"]
        message = f'敌人完成蓄力，后续攻击增加{intent["amount"]}。'
    for key in ("weak", "vulnerable"):
        enemy[key] = max(0, enemy[key]-1)
    if state["health"] == 0:
        return _finish(state, False, "星舰耐久耗尽，救援艇已接你返航。")
    state["_discard"].extend(state["hand"])
    state["hand"] = []
    state["turn"] += 1
    _turn(state)
    _log(state, message)
    return None


def _camp_targets(state):
    available = [c for c in state["deck"] if not c["upgraded"]]
    attack = next((c for c in available if CARDS[c["id"]].get("attack")), None)
    defense = next((c for c in available if CARDS[c["id"]].get("block") and c is not attack), None)
    return [c for c in (attack, defense) if c] or available[:1]


def _options(state):
    phase = state["phase"]
    if phase == "captain":
        return [{"id": key, "title": c["name"], "description": c["description"], "maxHealth": c["maxHealth"], "deckDescription": c["deckDescription"]} for key, c in CAPTAINS.items()]
    if phase == "route":
        result = []
        for key, title in (("safe", "平稳航道"), ("elite", "精英航道")):
            enemy = ENEMIES[state["_routeEnemies"][key]]
            final = state["stage"] == 3
            result.append({"id": key, "title": title, "description": enemy["name"]+(" · 最终决战" if final else ""), "risk": "敌人+8生命、攻击+2" if key == "elite" else "标准敌人强度", "reward": ("额外航记分；争取金章" if final else "新卡直接升级，胜利回复4生命") if key == "elite" else ("通关远征" if final else "三选一战利品")})
        return result
    if phase == "reward":
        result = []
        for option in state["_rewardOptions"]:
            item = {k: option[k] for k in ("id", "kind", "title", "description")}
            if "card" in option:
                item["card"] = _card(option["card"])
                item["description"] += " "+item["card"]["description"]
            if "relic" in option:
                item["relic"] = _relic(option["relic"])
            result.append(item)
        return result
    if phase == "camp":
        result = [{"id": "rest", "title": "停泊修复", "description": "回复14生命。"}]
        targets = _camp_targets(state)
        if targets:
            result.append({"id": "upgrade", "title": "锻造卡牌", "description": "升级："+"、".join(CARDS[c["id"]]["name"] for c in targets)+"。"})
        return result
    if phase == "event":
        relic = state["_eventRelic"]
        return [{"id": "salvage", "title": "深入残骸", "description": "失去7生命，获得"+RELICS[relic]["name"]+"："+RELICS[relic]["description"], "disabled": state["health"] <= 7},
                {"id": "leave", "title": "安全绕行", "description": "从外围回收补给，回复4生命。"}]
    return []


def public_state(state):
    """An explicit allowlist; never copy the server's random/draw state."""
    out = {key: deepcopy(state[key]) for key in ("phase", "health", "maxHealth", "stage", "battlesWon", "score", "message", "log")}
    out["captain"] = ({"id": state["captain"], **{k: v for k, v in CAPTAINS[state["captain"]].items() if k != "deck"}} if state["captain"] else None)
    out["captains"] = [{"id": key, **{k: v for k, v in c.items() if k != "deck"}} for key, c in CAPTAINS.items()]
    out["relics"] = [_relic(key) for key in state["relics"]]
    counts = Counter((c["id"], c["upgraded"]) for c in state["deck"])
    out["deckSummary"] = [{**_card({"id": key, "upgraded": upgraded}), "count": count} for (key, upgraded), count in sorted(counts.items())]
    out["options"] = _options(state)
    phase = state["phase"]
    key = {"captain": "captain", "route": "route", "reward": "reward", "camp": "camp", "event": "event"}.get(phase)
    out["actions"] = [{"id": option["id"], "label": option["title"], "action": {key: option["id"]}} for option in out["options"] if not option.get("disabled")] if key else []
    if phase == "battle":
        out.update({key: state[key] for key in ("energy", "block", "turn", "combo")})
        out["maxEnergy"] = 3
        out["enemy"] = {**deepcopy(state["enemy"]), "intent": _intent(state)}
        cards = {c["uid"]: c for c in state["deck"]}
        out["hand"] = [{**_card(cards[uid]), "uid": uid, "playable": CARDS[cards[uid]["id"]]["cost"] <= state["energy"]} for uid in state["hand"]]
        out["drawCount"], out["discardCount"], out["exhaustCount"] = len(state["_draw"]), len(state["_discard"]), len(state["_exhaust"])
        out["actions"] = [{"id": c["uid"], "label": "打出 "+c["name"], "action": {"play": c["uid"]}} for c in out["hand"] if c["playable"]]
        out["actions"].append({"id": "endTurn", "label": "结束回合", "action": {"endTurn": True}})
    return out


def move(original, steps, max_steps, action):
    _require(type(action) is dict and len(action) == 1)
    _require(type(steps) is int and type(max_steps) is int and 0 <= steps < max_steps)
    _require(original["phase"] != "finished", "这次远征已结束")
    # Validate against the precise legal action list before copying or consuming RNG.
    valid = public_state(original)["actions"]
    _require(any(action == entry["action"] and all(type(action[k]) is type(v) for k, v in entry["action"].items()) for entry in valid))
    state = deepcopy(original)
    phase, result = state["phase"], None
    if phase == "captain":
        captain = action["captain"]
        state["captain"] = captain
        state["health"] = state["maxHealth"] = CAPTAINS[captain]["maxHealth"]
        state["deck"] = [_new_card(state, key) for key in CAPTAINS[captain]["deck"]]
        _set_routes(state)
    elif phase == "route":
        _battle(state, action["route"])
    elif phase == "battle":
        result = _play(state, action["play"]) if "play" in action else _end_turn(state)
    elif phase == "reward":
        option = next(o for o in state["_rewardOptions"] if o["id"] == action["reward"])
        if option["kind"] == "upgrade":
            next(c for c in state["deck"] if c["uid"] == option["target"])["upgraded"] = True
        elif option["kind"] == "card":
            card = _new_card(state, option["card"]["id"])
            card["upgraded"] = option["card"]["upgraded"]
            state["deck"].append(card)
        elif option["kind"] == "relic":
            _add_relic(state, option["relic"])
        else:
            state["health"] = min(state["maxHealth"], state["health"]+12)
        state["phase"] = "camp" if state["stage"] == 1 else "event"
        if state["phase"] == "event":
            state["_eventRelic"] = _rng(state).choice([r for r in RELICS if r not in state["relics"]])
        _log(state, "航行间隙：修复生命或强化卡牌。" if state["phase"] == "camp" else "发现漂流残骸。深入回收会损伤船体，但能带走一件遗物。")
    elif phase == "camp":
        if action["camp"] == "rest":
            state["health"] = min(state["maxHealth"], state["health"]+14)
        else:
            for card in _camp_targets(state):
                card["upgraded"] = True
        state["stage"] += 1
        _set_routes(state)
    elif phase == "event":
        if action["event"] == "salvage":
            state["health"] -= 7
            _add_relic(state, state["_eventRelic"])
        else:
            state["health"] = min(state["maxHealth"], state["health"]+4)
        state["stage"] += 1
        _set_routes(state)
    steps += 1
    if result is None and steps >= max_steps:
        result = _finish(state, False, "远征操作数已用完，救援艇带你返回港口。")
    return state, steps, result
