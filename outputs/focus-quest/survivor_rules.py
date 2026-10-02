"""Deterministic authoritative simulation for the short-form 星辉守夜 arena.

Only elapsed time measured by the server enters tick actions. The engine owns
combat, drops, choices and the final result; clients only supply movement.
"""
from copy import deepcopy
import hashlib
import math

MAX_STEPS = 100000
DURATION = 180.0
WORLD = {"width": 1600, "height": 1000}
WEAPONS = {
    "bolt": {"name": "追星箭", "description": "自动追击最近敌人；升级增加连发、穿透与伤害。", "color": "#c2a1ff", "pair": "haste", "evolution": "万星齐射"},
    "orbit": {"name": "护身辉环", "description": "环绕飞刃拦截近身敌人；升级增加飞刃与轨道范围。", "color": "#e8cf86", "pair": "armor", "evolution": "日冕圣轮"},
    "aura": {"name": "星潮领域", "description": "周期震荡身旁的敌人；升级扩大领域并增强震退。", "color": "#87c8d2", "pair": "area", "evolution": "引力奇点"},
    "lightning": {"name": "连锁雷鸣", "description": "雷电直接击中附近敌人；升级增加连锁数量。", "color": "#a7c9ff", "pair": "might", "evolution": "苍穹审判"},
    "frost": {"name": "霜晶散射", "description": "向四周发射冰晶，减速敌群；升级增加数量和穿透。", "color": "#a0e5dc", "pair": "magnet", "evolution": "永夜冰冠"},
    "meteor": {"name": "陨火召来", "description": "在密集敌群处落下陨星；升级扩大爆炸并增加落点。", "color": "#eea47f", "pair": "vitality", "evolution": "赤曜星雨"},
}
PASSIVES = {
    "might": {"name": "辉光棱镜", "description": "每级使全部武器伤害提高18%。", "color": "#eda28f"},
    "haste": {"name": "迅捷沙漏", "description": "每级使攻击冷却缩短10%，移动速度提高5%。", "color": "#c6b2e6"},
    "magnet": {"name": "引星磁石", "description": "每级扩大拾取范围35，并增加8%经验。", "color": "#96d9c8"},
    "armor": {"name": "月岩甲片", "description": "每级减少2点所受伤害；至少受到1点伤害。", "color": "#c9be9b"},
    "vitality": {"name": "不息之心", "description": "每级增加25生命上限，立即回复30生命并缓慢再生。", "color": "#e9a4b4"},
    "area": {"name": "广域星图", "description": "每级使范围与投射物尺寸增加16%。", "color": "#99c2e0"},
}
HEROES = {
    "ranger": {"name": "追星游侠", "description": "追星箭起步 · 移动更快，远程伤害提高15%。", "weapon": "bolt", "color": "#bca0ef", "hp": 100, "speed": 235},
    "warden": {"name": "辉环守卫", "description": "护身辉环起步 · 130生命，天生减伤2点。", "weapon": "orbit", "color": "#e0c589", "hp": 130, "speed": 210},
    "oracle": {"name": "星潮术士", "description": "星潮领域起步 · 领域更广，经验获取提高12%。", "weapon": "aura", "color": "#8eced0", "hp": 105, "speed": 220},
}
ARENAS = {
    "glade": {"name": "萤火林地", "description": "开阔林地，萤火泉每隔一段时间留下治疗果实。适合初次出发。", "color": "#81b8a3"},
    "ruins": {"name": "月蚀遗迹", "description": "古代石柱改变走位路线。更多疾行敌人，精英携带额外经验。", "color": "#aa9dcc"},
    "rift": {"name": "陨星裂隙", "description": "注意地面的落星预警。敌人更密集，经验也更丰厚。", "color": "#cb8c96"},
}
ENEMIES = {
    "shade": {"hp": 14, "speed": 69, "r": 13, "damage": 8, "xp": 3},
    "sprinter": {"hp": 11, "speed": 128, "r": 10, "damage": 7, "xp": 3},
    "tank": {"hp": 48, "speed": 48, "r": 21, "damage": 13, "xp": 7},
    "spitter": {"hp": 27, "speed": 56, "r": 15, "damage": 8, "xp": 5},
    "charger": {"hp": 35, "speed": 76, "r": 16, "damage": 11, "xp": 6},
    "elite": {"hp": 300, "speed": 74, "r": 29, "damage": 17, "xp": 50},
    "boss": {"hp": 6500, "speed": 52, "r": 43, "damage": 23, "xp": 150},
}


def _require(condition, message="这一步无效，请选择当前可用的操作"):
    if not condition:
        raise ValueError(message)


def _number(value, low, high):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and low <= value <= high


def _rand(s):
    s["_rng"] = (1664525 * s["_rng"] + 1013904223) & 0xffffffff
    return s["_rng"] / 4294967296.0


def _id(s, prefix):
    s["_nextId"] += 1
    return prefix + str(s["_nextId"])


def _clamp(value, low, high):
    return max(low, min(high, value))


def _distance(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def _vector(dx, dy):
    size = math.hypot(dx, dy)
    return (dx / size, dy / size) if size > 0 else (0, 0)


def _level(s, key):
    return s["weapons"].get(key, 0)


def _passive(s, key):
    return s["passives"].get(key, 0)


def _area(s):
    return 1 + .16 * _passive(s, "area") + (.12 if s["hero"] == "oracle" else 0)


def _power(s, weapon):
    return (1 + .18 * _passive(s, "might")) * (1.15 if s["hero"] == "ranger" and weapon in ("bolt", "frost") else 1)


def _effect(s, kind, x, y, radius, ttl=.3, **kwargs):
    s["effects"].append({"id": _id(s, "fx"), "kind": kind, "x": x, "y": y, "r": radius, "ttl": ttl, "duration": ttl, **kwargs})
    if len(s["effects"]) > 80:
        s["effects"] = s["effects"][-80:]


def create(seed):
    number = int.from_bytes(hashlib.sha256(str(seed).encode()).digest()[:4], "big") or 1
    return {"phase": "prepare", "hero": None, "arena": None, "time": 0.0, "duration": DURATION,
            "player": {"x": 800.0, "y": 500.0, "hp": 100.0, "maxHp": 100, "r": 14,
                       "speed": 220, "facingX": 1.0, "facingY": 0.0, "dashCd": 0.0, "invulnerable": 0.0},
            "level": 1, "xp": 0.0, "xpNext": 10, "kills": 0, "score": 0, "speed": 1,
            "weapons": {}, "passives": {}, "evolved": [], "enemies": [], "shots": [], "effects": [],
            "gems": [], "pickups": [], "obstacles": [], "choices": [],
            "message": "选一位守夜人，撑过三分钟的星潮。攻击会自动发动，走位与构筑由你决定。",
            "stats": {"damage": 0, "kills": 0, "eliteKills": 0, "gems": 0, "dodges": 0, "evolutions": 0},
            "_rng": number, "_nextId": 0, "_spawnClock": .5, "_weaponClock": {}, "_nextElite": 42,
            "_bossSpawned": False, "_bossKilled": False, "_hazardClock": 7, "_fruitClock": 20, "_dashTime": 0,
            "_dashX": 1, "_dashY": 0, "_result": None}, MAX_STEPS


def _deploy(s, hero, arena):
    _require(isinstance(hero, str) and isinstance(arena, str) and hero in HEROES and arena in ARENAS, "请选择一位守夜人与一张地图")
    s["hero"], s["arena"], s["phase"] = hero, arena, "playing"
    p, h = s["player"], HEROES[hero]
    p.update(hp=float(h["hp"]), maxHp=h["hp"], speed=h["speed"])
    s["weapons"] = {h["weapon"]: 1}
    if arena == "ruins":
        s["obstacles"] = [{"x": x, "y": y, "r": 34} for x, y in ((500, 320), (1100, 320), (500, 680), (1100, 680), (800, 240), (800, 760))]
    for i in range(8):
        _spawn(s, "shade", angle=i * math.tau / 8)
    s["message"] = "星潮来了。边走边收集星屑，升级时可以从三种强化里挑选一种。"


def _spawn(s, kind, angle=None):
    if len(s["enemies"]) >= 105 and kind not in ("boss", "elite"):
        return
    p, meta = s["player"], ENEMIES[kind]
    angle = _rand(s) * math.tau if angle is None else angle
    distance = 410 + _rand(s) * 120
    x, y = _clamp(p["x"] + math.cos(angle) * distance, 25, 1575), _clamp(p["y"] + math.sin(angle) * distance, 25, 975)
    # A player hugging an edge still gets enough warning before a spawn arrives.
    if math.hypot(x - p["x"], y - p["y"]) < 200:
        x = _clamp(p["x"] - math.cos(angle) * distance, 25, 1575)
        y = _clamp(p["y"] - math.sin(angle) * distance, 25, 975)
    scale = 1 + s["time"] / 230
    hp = meta["hp"] * scale if kind != "boss" else meta["hp"]
    s["enemies"].append({"id": _id(s, "e"), "x": x, "y": y, "hp": hp, "maxHp": hp,
                         "type": kind, "r": meta["r"], "telegraph": 0, "_attackCd": 1.8 + _rand(s) * 2,
                         "_slow": 0, "_hit": 0, "_charge": 0, "_phase": _rand(s) * math.tau})
    if kind in ("elite", "boss"):
        _effect(s, "arrival", x, y, meta["r"] * 2, .8)
        s["message"] = "黯星领主降临！避开红色预警，击破它可以提前凯旋。" if kind == "boss" else "精英现身。击败它会掉落大片经验和补给。"


def _gem(s, x, y, value):
    if len(s["gems"]) >= 140:
        near = min(s["gems"], key=lambda g: (g["x"] - x)**2 + (g["y"] - y)**2)
        near["value"] += value
    else:
        s["gems"].append({"id": _id(s, "g"), "x": x, "y": y, "value": value})


def _pickup(s, x, y, kind):
    if len(s["pickups"]) < 16:
        s["pickups"].append({"id": _id(s, "p"), "x": _clamp(x, 35, 1565), "y": _clamp(y, 35, 965), "kind": kind})


def _damage(s, enemy, amount, slow=0):
    if enemy["hp"] <= 0 or s["_result"] is not None:
        return
    s["stats"]["damage"] += min(enemy["hp"], amount)
    enemy["hp"] -= amount
    enemy["_hit"] = .15
    enemy["_slow"] = max(enemy["_slow"], slow)
    if enemy["hp"] > 0:
        return
    s["kills"] += 1
    s["stats"]["kills"] = s["kills"]
    kind = enemy["type"]
    s["score"] += 100 if kind == "boss" else 25 if kind == "elite" else 2
    xp = ENEMIES[kind]["xp"] * (1.18 if s["arena"] == "rift" else 1)
    if kind == "elite" and s["arena"] == "ruins":
        xp *= 1.3
    _gem(s, enemy["x"], enemy["y"], xp)
    _effect(s, "shatter", enemy["x"], enemy["y"], enemy["r"] * 1.4, .22)
    if kind in ("elite", "boss"):
        s["stats"]["eliteKills"] += 1
        _pickup(s, enemy["x"] + 22, enemy["y"], "heal")
        _pickup(s, enemy["x"] - 22, enemy["y"], "magnet")
    elif s["kills"] % 38 == 0:
        _pickup(s, enemy["x"], enemy["y"], "heal")
    elif s["kills"] % 61 == 0:
        _pickup(s, enemy["x"], enemy["y"], "magnet")
    if kind == "boss":
        s["_bossKilled"] = True
        _finish(s, True, "黯星领主已被击败。你的星光守住了这一夜。")


def _hurt(s, amount, x=None, y=None):
    p = s["player"]
    if p["invulnerable"] > 0 or s["phase"] != "playing":
        return
    armor = 2 * _passive(s, "armor") + (2 if s["hero"] == "warden" else 0)
    p["hp"] = max(0, p["hp"] - max(1, amount - armor))
    p["invulnerable"] = .62
    _effect(s, "hurt", p["x"], p["y"], 32, .22)
    if p["hp"] <= 0:
        _finish(s, False, "星潮暂时占了上风。保留这次构筑的发现，下次换一种搭配。")


def _finish(s, won, reason):
    if s["_result"] is not None:
        return
    score = int(s["score"] + s["time"] * 2 + s["level"] * 15)
    medal = 3 if won and (s["stats"]["eliteKills"] >= 3 or s["stats"]["evolutions"] >= 2) else 2 if won else 1 if s["time"] >= 60 else 0
    s["score"] = score
    s["message"] = reason
    s["phase"] = "ended"
    s["_result"] = {"won": won, "score": score, "medal": medal, "reason": reason,
                    "kills": s["kills"], "eliteKills": s["stats"]["eliteKills"], "level": s["level"],
                    "bossKilled": s.get("_bossKilled", False), "bossesKilled": int(s.get("_bossKilled", False)),
                    "time": round(s["time"], 2), "worldTime": round(s["time"], 2), "arena": s["arena"],
                    "hpRatio": round(s["player"]["hp"] / s["player"]["maxHp"], 4), "evolutions": len(s["evolved"])}


def _choice(s, key, kind):
    meta = WEAPONS[key] if kind in ("weapon", "evolution") else PASSIVES[key]
    level = _level(s, key) if kind in ("weapon", "evolution") else _passive(s, key)
    name = meta["evolution"] if kind == "evolution" else meta["name"]
    description = (f"{WEAPONS[key]['name']}与{PASSIVES[meta['pair']]['name']}产生共鸣，大幅增强武器。" if kind == "evolution" else meta["description"])
    return {"id": kind + ":" + key, "key": key, "kind": kind, "name": name, "description": description,
            "color": meta["color"], "level": level if kind == "evolution" else level + 1,
            "pair": PASSIVES[meta["pair"]]["name"] if kind in ("weapon", "evolution") else next(WEAPONS[w]["name"] for w in WEAPONS if WEAPONS[w]["pair"] == key)}


def _choices(s):
    available, evolutions = [], []
    for key, meta in WEAPONS.items():
        level = _level(s, key)
        if key not in s["evolved"] and level >= 4 and _passive(s, meta["pair"]) >= 2:
            evolutions.append(_choice(s, key, "evolution"))
        if level < 5 and (level or len(s["weapons"]) < 4):
            available.append(_choice(s, key, "weapon"))
    for key in PASSIVES:
        level = _passive(s, key)
        if level < 4 and (level or len(s["passives"]) < 4):
            available.append(_choice(s, key, "passive"))
    # Always surface one ready evolution; remaining cards vary between runs.
    picked = []
    if evolutions:
        picked.append(evolutions[int(_rand(s) * len(evolutions))])
    while available and len(picked) < 3:
        weights = [2.8 if c["kind"] == "weapon" and c["key"] in s["weapons"] else 1.7 if c["kind"] == "passive" and any(WEAPONS[w]["pair"] == c["key"] for w in s["weapons"]) else 1 for c in available]
        roll, index = _rand(s) * sum(weights), 0
        for index, weight in enumerate(weights):
            roll -= weight
            if roll < 0:
                break
        picked.append(available.pop(index))
    for key, name, description in (("heal", "萤光急救", "立即回复35生命。"), ("force", "临时辉光", "本局全部武器伤害再提高8%。"), ("pulse", "星潮扫荡", "清除周围普通敌人，并收集附近星屑。")):
        if len(picked) < 3:
            picked.append({"id": "supply:" + key, "key": key, "kind": "supply", "name": name, "description": description, "color": "#b9c6c9", "level": 1})
    s["choices"] = picked


def _level_up(s):
    if s["xp"] + 1e-9 < s["xpNext"] or s["phase"] != "playing":
        return
    s["xp"] -= s["xpNext"]
    s["level"] += 1
    s["xpNext"] = 10 + (s["level"] - 1) * 11
    s["player"]["hp"] = min(s["player"]["maxHp"], s["player"]["hp"] + 3)
    s["phase"] = "upgrade"
    _choices(s)
    s["message"] = "星屑汇成了新的力量。选一种强化，构筑属于你的守夜方式。"


def _upgrade(s, choice_id):
    choice = next((c for c in s["choices"] if c["id"] == choice_id), None)
    _require(choice is not None, "这张强化卡当前不可选择")
    kind, key = choice["kind"], choice["key"]
    if kind == "weapon":
        s["weapons"][key] = _level(s, key) + 1
    elif kind == "passive":
        s["passives"][key] = _passive(s, key) + 1
        if key == "vitality":
            s["player"]["maxHp"] += 25
            s["player"]["hp"] = min(s["player"]["maxHp"], s["player"]["hp"] + 30)
    elif kind == "evolution":
        s["evolved"].append(key)
        s["stats"]["evolutions"] += 1
        _effect(s, "evolution", s["player"]["x"], s["player"]["y"], 150, 1.2)
    elif key == "heal":
        s["player"]["hp"] = min(s["player"]["maxHp"], s["player"]["hp"] + 35)
    elif key == "force":
        s["_bonusPower"] = s.get("_bonusPower", 0) + .08
    elif key == "pulse":
        for enemy in s["enemies"]:
            if enemy["type"] not in ("boss", "elite") and _distance(enemy, s["player"]) < 240:
                _damage(s, enemy, 9999)
        s["_magnetTime"] = 1.2
    s["phase"], s["choices"] = "playing", []
    s["message"] = ("进化完成 · " if kind == "evolution" else "获得强化 · ") + choice["name"]
    _level_up(s)


def _shot(s, x, y, dx, dy, kind, damage, velocity=510, r=7, pierce=1, enemy=False, ttl=2.4, slow=0):
    if len(s["shots"]) >= 170:
        return
    dx, dy = _vector(dx, dy)
    s["shots"].append({"id": _id(s, "s"), "x": x, "y": y, "vx": dx * velocity, "vy": dy * velocity,
                       "kind": kind, "r": r, "enemy": enemy, "ttl": ttl, "_damage": damage, "_pierce": pierce, "_hits": [], "_slow": slow})


def _weapons(s, dt):
    p, area = s["player"], _area(s)
    live = [e for e in s["enemies"] if e["hp"] > 0]
    if not live:
        return
    nearest = sorted(live, key=lambda e: (e["x"] - p["x"])**2 + (e["y"] - p["y"])**2)
    for kind, level in list(s["weapons"].items()):
        if s["phase"] != "playing":
            break
        s["_weaponClock"][kind] = s["_weaponClock"].get(kind, 0) - dt
        if s["_weaponClock"][kind] > 0:
            continue
        evolved = kind in s["evolved"]
        power = _power(s, kind) * (1 + s.get("_bonusPower", 0))
        cooldown = max(.5, 1 - .1 * _passive(s, "haste"))
        if kind == "bolt":
            count = 1 + level // 2 + (3 if evolved else 0)
            for i in range(count):
                target = nearest[i % min(len(nearest), 4)]
                angle = math.atan2(target["y"] - p["y"], target["x"] - p["x"]) + (i // 4) * .055
                _shot(s, p["x"], p["y"], math.cos(angle), math.sin(angle), "bolt-evolved" if evolved else "bolt", (16 + level * 7) * power, 560, 7 * area, 1 + level // 3 + (2 if evolved else 0))
            delay = .68 if evolved else .88 - level * .04
        elif kind == "orbit":
            count = 2 + level // 2 + (3 if evolved else 0)
            radius = (62 + level * 5) * area
            for i in range(count):
                angle = s["time"] * 2.7 + i * math.tau / count
                x, y = p["x"] + math.cos(angle) * radius, p["y"] + math.sin(angle) * radius
                for enemy in live:
                    if math.hypot(enemy["x"] - x, enemy["y"] - y) < enemy["r"] + (25 if evolved else 21) * area:
                        _damage(s, enemy, (11 + level * 5) * power * (1.8 if evolved else 1))
            delay = .22
        elif kind == "aura":
            radius = (76 + level * 12) * area * (1.3 if evolved else 1)
            _effect(s, "aura-evolved" if evolved else "aura", p["x"], p["y"], radius, .3)
            for enemy in live:
                if _distance(enemy, p) < radius + enemy["r"]:
                    _damage(s, enemy, (10 + level * 6) * power * (1.7 if evolved else 1), .5 if evolved else 0)
                    ux, uy = _vector(enemy["x"] - p["x"], enemy["y"] - p["y"])
                    enemy["x"] += ux * 9
                    enemy["y"] += uy * 9
            delay = .63 if evolved else .88
        elif kind == "lightning":
            targets = nearest[:2 + level + (4 if evolved else 0)]
            from_x, from_y = p["x"], p["y"]
            for target in targets:
                _effect(s, "lightning", target["x"], target["y"], 24, .23, fromX=from_x, fromY=from_y)
                _damage(s, target, (20 + level * 9) * power * (1.6 if evolved else 1))
                from_x, from_y = target["x"], target["y"]
            delay = 1.2 if evolved else 1.65
        elif kind == "frost":
            count = 5 + level + (5 if evolved else 0)
            for i in range(count):
                angle = i * math.tau / count + s["time"] * .35
                _shot(s, p["x"], p["y"], math.cos(angle), math.sin(angle), "frost", (11 + level * 5) * power * (1.8 if evolved else 1), 320, 8 * area, 2 + level // 2, slow=1.8 if evolved else 1)
            delay = 1.1 if evolved else 1.7
        else:
            count = 1 + level // 3 + (2 if evolved else 0)
            for i in range(min(count, len(nearest))):
                target = nearest[(i * 3) % len(nearest)]
                _effect(s, "meteor-warning", target["x"], target["y"], (55 + level * 7) * area, .5,
                        _damage=(40 + level * 16) * power * (1.8 if evolved else 1), _hostile=False)
            delay = 1.55 if evolved else 2.25
        s["_weaponClock"][kind] += delay * cooldown


def _move_circle(body, dx, dy, radius, obstacles):
    body["x"], body["y"] = _clamp(body["x"] + dx, radius, 1600 - radius), _clamp(body["y"] + dy, radius, 1000 - radius)
    for stone in obstacles:
        vx, vy = body["x"] - stone["x"], body["y"] - stone["y"]
        distance, limit = math.hypot(vx, vy), radius + stone["r"]
        if distance < limit:
            ux, uy = _vector(vx, vy)
            if distance == 0:
                ux = 1
            body["x"], body["y"] = stone["x"] + ux * limit, stone["y"] + uy * limit


def _enemy_attack(s, e, dt):
    p, kind = s["player"], e["type"]
    e["_attackCd"] -= dt
    if kind not in ("spitter", "charger", "elite", "boss"):
        return
    if e.get("telegraph", 0) > 0:
        e["telegraph"] -= dt
        if e["telegraph"] <= 0:
            if kind == "charger":
                e["_charge"] = .52
                e["_chargeX"], e["_chargeY"] = _vector(e["attackX"] - e["x"], e["attackY"] - e["y"])
            elif kind == "boss":
                count = 12 if e["hp"] < e["maxHp"] * .5 else 9
                offset = _rand(s) * math.tau
                for i in range(count):
                    a = offset + i * math.tau / count
                    _shot(s, e["x"], e["y"], math.cos(a), math.sin(a), "void", 17, 180, 9, enemy=True, ttl=4)
                _effect(s, "danger", p["x"], p["y"], 83, .85, _damage=22, _hostile=True)
            else:
                _shot(s, e["x"], e["y"], e["attackX"] - e["x"], e["attackY"] - e["y"], "void", 11 if kind == "spitter" else 15, 205, 8, enemy=True, ttl=3)
        return
    if e["_attackCd"] <= 0 and _distance(e, p) < 600:
        e["telegraph"] = .65 if kind != "boss" else .9
        e["attackX"], e["attackY"] = p["x"], p["y"]
        e["_attackCd"] = 2.7 if kind != "boss" else 2.5


def _step(s, dt, dx, dy):
    p = s["player"]
    s["time"] = min(DURATION, s["time"] + dt)
    p["invulnerable"] = max(0, p["invulnerable"] - dt)
    p["dashCd"] = max(0, p["dashCd"] - dt)
    p["hp"] = min(p["maxHp"], p["hp"] + _passive(s, "vitality") * .23 * dt)
    p["speed"] = HEROES[s["hero"]]["speed"] * (1 + .05 * _passive(s, "haste"))
    if dx or dy:
        p["facingX"], p["facingY"] = dx, dy
    s["_dashTime"] = max(0, s["_dashTime"] - dt)
    if s["_dashTime"] > 0:
        mx, my, velocity = s["_dashX"], s["_dashY"], 740
    else:
        mx, my, velocity = dx, dy, p["speed"]
    _move_circle(p, mx * velocity * dt, my * velocity * dt, p["r"], s["obstacles"])
    s["_spawnClock"] -= dt
    if s["_spawnClock"] <= 0:
        count = 1 + int(s["time"] / 45) + (1 if s["arena"] == "rift" else 0)
        for _ in range(count):
            roll = _rand(s)
            if s["time"] < 20:
                kind = "shade" if roll < .8 else "sprinter"
            else:
                choices = ["shade", "shade", "sprinter", "tank", "spitter", "charger"]
                kind = choices[min(len(choices) - 1, int(roll * len(choices)))]
                if s["arena"] == "ruins" and roll < .17:
                    kind = "sprinter"
            _spawn(s, kind)
        s["_spawnClock"] += max(.38, .68 - s["time"] / 800)
    if s["time"] >= s["_nextElite"] and s["_nextElite"] < 140:
        _spawn(s, "elite")
        s["_nextElite"] += 42
    if s["time"] >= 150 and not s["_bossSpawned"]:
        _spawn(s, "boss")
        s["_bossSpawned"] = True
    if s["arena"] == "rift":
        s["_hazardClock"] -= dt
        if s["_hazardClock"] <= 0:
            _effect(s, "danger", _clamp(p["x"] + (_rand(s) - .5) * 200, 80, 1520), _clamp(p["y"] + (_rand(s) - .5) * 200, 80, 920), 68, 1.2, _hostile=True, _damage=15)
            s["_hazardClock"] = 6
    if s["arena"] == "glade":
        s["_fruitClock"] -= dt
        if s["_fruitClock"] <= 0:
            _pickup(s, p["x"] + 130, p["y"] + 80, "heal")
            s["_fruitClock"] = 32
    for e in s["enemies"]:
        if e["hp"] <= 0:
            continue
        e["_slow"], e["_hit"] = max(0, e["_slow"] - dt), max(0, e["_hit"] - dt)
        _enemy_attack(s, e, dt)
        ux, uy = _vector(p["x"] - e["x"], p["y"] - e["y"])
        speed = ENEMIES[e["type"]]["speed"] * (.43 if e["_slow"] else 1)
        if e["type"] == "spitter" and _distance(e, p) < 250:
            speed *= -.35
        if e["telegraph"] > 0:
            speed *= .15
        if e.get("_charge", 0) > 0:
            e["_charge"] -= dt
            ux, uy, speed = e["_chargeX"], e["_chargeY"], 345
        sway = math.sin(s["time"] * 2 + e["_phase"]) * .23
        _move_circle(e, (ux - uy * sway) * speed * dt, (uy + ux * sway) * speed * dt, e["r"], s["obstacles"])
        if _distance(e, p) < e["r"] + p["r"]:
            _hurt(s, ENEMIES[e["type"]]["damage"])
    if s["phase"] != "playing":
        return
    _weapons(s, dt)
    if s["phase"] != "playing":
        return
    for shot in s["shots"]:
        shot["ttl"] -= dt
        shot["x"] += shot["vx"] * dt
        shot["y"] += shot["vy"] * dt
        if shot["enemy"]:
            if _distance(shot, p) < shot["r"] + p["r"]:
                _hurt(s, shot["_damage"])
                shot["ttl"] = 0
        else:
            for enemy in s["enemies"]:
                if shot["ttl"] <= 0:
                    break
                if enemy["hp"] > 0 and enemy["id"] not in shot["_hits"] and _distance(shot, enemy) < shot["r"] + enemy["r"]:
                    _damage(s, enemy, shot["_damage"], shot["_slow"])
                    shot["_hits"].append(enemy["id"])
                    shot["_pierce"] -= 1
                    if shot["_pierce"] <= 0:
                        shot["ttl"] = 0
    s["shots"] = [shot for shot in s["shots"] if shot["ttl"] > 0 and -40 < shot["x"] < 1640 and -40 < shot["y"] < 1040]
    if s["phase"] != "playing":
        return
    impacts = []
    for effect in s["effects"]:
        effect["ttl"] -= dt
        if effect["ttl"] <= 0 and "_damage" in effect:
            impacts.append(effect)
    s["effects"] = [fx for fx in s["effects"] if fx["ttl"] > 0]
    for fx in impacts:
        if s["phase"] != "playing":
            break
        if fx.get("_hostile"):
            if _distance(fx, p) < fx["r"] + p["r"]:
                _hurt(s, fx["_damage"])
            _effect(s, "enemy-impact", fx["x"], fx["y"], fx["r"], .3)
        else:
            for enemy in s["enemies"]:
                if _distance(fx, enemy) < fx["r"] + enemy["r"]:
                    _damage(s, enemy, fx["_damage"])
            _effect(s, "meteor", fx["x"], fx["y"], fx["r"], .4)
    s["enemies"] = [e for e in s["enemies"] if e["hp"] > 0]
    if s["phase"] != "playing":
        return
    s["_magnetTime"] = max(0, s.get("_magnetTime", 0) - dt)
    for pickup in s["pickups"][:]:
        if _distance(pickup, p) < 31:
            if pickup["kind"] == "heal":
                p["hp"] = min(p["maxHp"], p["hp"] + 27)
                _effect(s, "heal", p["x"], p["y"], 40, .45)
            else:
                s["_magnetTime"] = 2.5
                _effect(s, "magnet", p["x"], p["y"], 100, .5)
            s["pickups"].remove(pickup)
    for gem in s["gems"][:]:
        distance = _distance(gem, p)
        if distance < 58 + 35 * _passive(s, "magnet") or s["_magnetTime"] > 0 or gem.get("_attracted"):
            gem["_attracted"] = True
            ux, uy = _vector(p["x"] - gem["x"], p["y"] - gem["y"])
            step = min(distance, (450 + distance * .7) * dt)
            gem["x"] += ux * step
            gem["y"] += uy * step
            if distance - step <= 18:
                s["xp"] += gem["value"] * (1 + .08 * _passive(s, "magnet") + (.12 if s["hero"] == "oracle" else 0))
                s["stats"]["gems"] += 1
                s["gems"].remove(gem)
    if s["phase"] == "playing":
        if s["time"] + 1e-8 >= DURATION:
            _finish(s, True, "晨光抵达。你撑过了整场星潮，守夜成功。")
        else:
            _level_up(s)


def move(state, steps, max_steps, action):
    _require(isinstance(action, dict))
    kind = action.get("kind")
    keys = {"deploy": {"kind", "hero", "arena"}, "tick": {"kind", "dx", "dy", "speed", "elapsed"},
            "upgrade": {"kind", "id"}, "pause": {"kind", "paused"}, "dash": {"kind", "dx", "dy"}}
    _require(isinstance(kind, str) and kind in keys and not (set(action) - keys[kind]), "游戏操作格式不正确")
    _require(state.get("phase") != "ended", "这一局已经结束")
    s = deepcopy(state)
    if kind == "deploy":
        _require(s["phase"] == "prepare", "本局已经出发")
        _deploy(s, action.get("hero"), action.get("arena"))
    elif kind == "tick":
        _require(_number(action.get("elapsed"), 0, .5), "游戏时钟无效")
        _require(_number(action.get("dx", 0), -1, 1) and _number(action.get("dy", 0), -1, 1), "移动方向无效")
        _require(type(action.get("speed", 1)) is int and action.get("speed", 1) in (1, 2), "只能选择一倍或二倍速")
        s["speed"] = action.get("speed", 1)
        if s["phase"] == "playing":
            dx, dy = action.get("dx", 0), action.get("dy", 0)
            if math.hypot(dx, dy) > 1:
                dx, dy = _vector(dx, dy)
            remaining = action["elapsed"] * s["speed"]
            while remaining > 1e-8 and s["phase"] == "playing":
                dt = min(1 / 30, remaining)
                _step(s, dt, dx, dy)
                remaining -= dt
    elif kind == "upgrade":
        _require(s["phase"] == "upgrade", "现在没有待选择的强化")
        _upgrade(s, action.get("id"))
    elif kind == "pause":
        _require(type(action.get("paused")) is bool, "暂停状态无效")
        _require(s["phase"] in ("playing", "paused"), "当前不能暂停或继续")
        s["phase"] = "paused" if action["paused"] else "playing"
    else:
        _require(s["phase"] == "playing", "请先继续战斗")
        _require(_number(action.get("dx", s["player"]["facingX"]), -1, 1) and _number(action.get("dy", s["player"]["facingY"]), -1, 1), "冲刺方向无效")
        if s["player"]["dashCd"] <= 0:
            dx, dy = _vector(action.get("dx", s["player"]["facingX"]), action.get("dy", s["player"]["facingY"]))
            if dx == 0 and dy == 0:
                dx, dy = s["player"]["facingX"], s["player"]["facingY"]
            s["_dashX"], s["_dashY"], s["_dashTime"] = dx, dy, .22
            s["player"]["dashCd"], s["player"]["invulnerable"] = 4, .32
            s["stats"]["dodges"] += 1
            _effect(s, "dash", s["player"]["x"], s["player"]["y"], 30, .25)
    return s, steps + 1, deepcopy(s["_result"])


def _clean(value):
    if isinstance(value, dict):
        return {key: _clean(item) for key, item in value.items() if not key.startswith("_")}
    if isinstance(value, list):
        return [_clean(item) for item in value]
    return value


def public_state(state):
    out = _clean(state)
    out["world"] = dict(WORLD)
    out["heroes"] = [{"id": key, **meta} for key, meta in HEROES.items()]
    out["arenas"] = [{"id": key, **meta} for key, meta in ARENAS.items()]
    out["catalog"] = {"heroes": out["heroes"], "arenas": out["arenas"], "weapons": [{"id": key, **meta} for key, meta in WEAPONS.items()],
                      "passives": [{"id": key, **meta} for key, meta in PASSIVES.items()]}
    out["weapons"] = [{"id": key, **WEAPONS[key], "name": WEAPONS[key]["evolution"] if key in state["evolved"] else WEAPONS[key]["name"],
                       "level": level, "evolved": key in state["evolved"], "evolutionName": WEAPONS[key]["evolution"]} for key, level in state["weapons"].items()]
    out["passives"] = [{"id": key, **PASSIVES[key], "level": level} for key, level in state["passives"].items()]
    for enemy, source in zip(out["enemies"], state["enemies"]):
        enemy["kind"] = enemy["type"]
        enemy["slowed"] = source["_slow"] > 0
        enemy["hit"] = source["_hit"] > 0
    boss = next((e for e in out["enemies"] if e["type"] == "boss"), None)
    out["boss"] = {"name": "黯星领主", "hp": boss["hp"], "maxHp": boss["maxHp"]} if boss else None
    out["wave"] = "领主降临" if state["time"] >= 150 else "星潮汹涌" if state["time"] >= 105 else "暗影围城" if state["time"] >= 60 else "星潮初起" if state["time"] >= 20 else "守夜启程"
    out["stats"]["damage"] = round(out["stats"]["damage"])
    return out
