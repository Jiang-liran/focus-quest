"""Small, server-authoritative games. No study or wallet state lives here."""
from copy import deepcopy
import random
import importlib.util
from pathlib import Path


def _load_rules(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


voyage_rules = _load_rules("voyage_rules")
dice_rules = _load_rules("dice_rules")
survivor_rules = _load_rules("survivor_rules")
minesweeper_rules = _load_rules("minesweeper_rules")

RULES = {"ticketMinutes": 30, "maxTickets": 8, "roundSeconds": 240,
         "dailyCoins": 120, "dailyDiamonds": 6, "winCoins": 12,
         "winDiamonds": 1, "lossCoins": 4, "purchasePrice": 50, "maxPurchasedTickets": 3}
VENUES = [
    {"id": "mines-beginner", "name": "经典扫雷 · 初级", "type": "minesweeper", "family": "logic",
     "subtitle": "9 × 9 · 10 颗雷", "description": "Windows 经典扫雷：从数字判断地雷位置，翻开所有安全格。不限时，首次翻开安全。"},
    {"id": "mines-intermediate", "name": "经典扫雷 · 中级", "type": "minesweeper", "family": "logic",
     "subtitle": "16 × 16 · 40 颗雷", "description": "更大的经典棋盘。左键翻开、右键标记，周围旗数相符时可快速翻开。"},
    {"id": "mines-expert", "name": "经典扫雷 · 高级", "type": "minesweeper", "family": "logic",
     "subtitle": "30 × 16 · 99 颗雷", "description": "经典高级难度，99 颗雷。保留推理与猜测，不设步数或计时失败。"},
    {"id": "star-survivor", "name": "星海幸存者", "type": "survivor", "family": "adventure", "subtitle": "自动战斗生存",
     "description": "在星海兽潮中走位求生，收集星晶、三选一升级，组合武器与被动进化。可随时切换二倍速。"},
    {"id": "mist-camp", "name": "晨雾营地", "type": "trail", "subtitle": "雾野寻宝",
     "description": "在迷雾中找回三枚星石，带着它们抵达出口。留心岔路，也留一点体力返航。"},
    {"id": "glow-shore", "name": "萤石浅滩", "type": "garden", "subtitle": "潮汐造景",
     "description": "把花、水、林、石摆成一座小岛；相邻搭配与完整行列都能带来额外得分。"},
    {"id": "chime-bridge", "name": "风铃木桥", "type": "trail", "subtitle": "险桥探路",
     "description": "更紧凑的步数、更多的星石。用两次探照找出安全的折返路线。"},
    {"id": "mirror-gallery", "name": "镜湖回廊", "type": "mirrors", "subtitle": "折光机关",
     "description": "转动镜片，让一束光经过两颗星标，最终照进灯座。小心把光引向死路的假镜片。"},
    {"id": "cloud-library", "name": "云根花庭", "type": "garden", "subtitle": "林间拼景",
     "description": "更多落子、更高目标。把三张备选地块留给合适的位置，让整片林地一起生长。"},
    {"id": "orbit-terrace", "name": "星轨高台", "type": "mirrors", "subtitle": "星轨折射",
     "description": "换一条更曲折的光路，在有限旋转内点亮全部星标与终点。"},
    {"id": "home-beacon", "name": "归光灯塔", "type": "trail", "subtitle": "灯塔归航",
     "description": "收集四枚星石，为远处灯塔带回光。继续搜寻全部星石，可以赢得金色航记。"},
]
CATALOG = {v["id"]: v for v in VENUES}
DIRS = {"up": (0, -1), "right": (1, 0), "down": (0, 1), "left": (-1, 0)}


def _require(condition, text="这一步无效，请按游戏规则操作"):
    if not condition:
        raise ValueError(text)


def _reveal(state, radius=1):
    p = state["player"]
    for y in range(max(0, p["y"]-radius), min(state["height"], p["y"]+radius+1)):
        for x in range(max(0, p["x"]-radius), min(state["width"], p["x"]+radius+1)):
            state["seen"][y][x] = True


def _trail(rng, venue):
    w, h = 9, 7
    board = [["floor" for _ in range(w)] for _ in range(h)]
    # One safe winding route always reaches every required gem within the budget.
    y1, y2 = rng.randrange(3), rng.randrange(4, 7)
    if rng.randrange(2):
        y1, y2 = y2, y1
    x1, x2, x3 = rng.randrange(1, 3), rng.randrange(3, 6), rng.randrange(6, 8)
    corners = [(0, 3), (x1, 3), (x1, y1), (x2, y1), (x2, y2), (x3, y2), (x3, 3), (8, 3)]
    route = [corners[0]]
    for end in corners[1:]:
        x, y = route[-1]
        while (x, y) != end:
            x += (end[0] > x) - (end[0] < x)
            y += (end[1] > y) - (end[1] < y)
            route.append((x, y))
    safe = set(route)
    for y in range(h):
        for x in range(w):
            if (x, y) not in safe:
                value = rng.random()
                board[y][x] = "wall" if value < .24 else "hazard" if value < .47 else "floor"
    candidates = route[2:-2]
    gem_cells = [rng.choice(candidates[i*len(candidates)//5:(i+1)*len(candidates)//5]) for i in range(5)]
    for x, y in gem_cells:
        board[y][x] = "gem"
    for x, y in rng.sample([p for p in route[1:-1] if p not in gem_cells], 2):
        board[y][x] = "camp"
    board[3][8] = "exit"
    state = {"width": w, "height": h, "board": board,
             "seen": [[False]*w for _ in range(h)], "player": {"x": 0, "y": 3},
             "exit": {"x": 8, "y": 3}, "health": 4, "gems": 0,
             "requiredGems": 4 if venue == "home-beacon" else 3, "totalGems": 5, "scans": 2,
             "message": "用方向键探路。收齐星石后进入右侧出口；探照可以提前看清更远的路。"}
    _reveal(state)
    state["seen"][3][8] = True
    return state, 34 if venue == "chime-bridge" else 42


def _turn_point(point, turns, reflect=False):
    x, y = point
    if reflect:
        x = 6-x
    for _ in range(turns):
        x, y = 6-y, x
    return x, y


def _trace(state):
    mirrors = {(m["x"], m["y"]): m["orientation"] for m in state["mirrors"]}
    walls = {(p["x"], p["y"]) for p in state["walls"]}
    x, y = state["emitter"]["x"], state["emitter"]["y"]
    dx, dy = DIRS[state["emitter"]["direction"]]
    beam, visited = [{"x": x, "y": y}], set()
    for _ in range(200):
        x, y = x+dx, y+dy
        beam.append({"x": x, "y": y})
        if not (0 <= x < 7 and 0 <= y < 7) or (x, y) in walls:
            break
        if (x, y, dx, dy) in visited:
            break
        visited.add((x, y, dx, dy))
        mirror = mirrors.get((x, y))
        if mirror == "/":
            dx, dy = -dy, -dx
        elif mirror == "\\":
            dx, dy = dy, dx
    state["beam"] = beam
    points = {(p["x"], p["y"]) for p in beam}
    for target in state["targets"]:
        target["lit"] = (target["x"], target["y"]) in points
    receiver = state["receiver"]
    receiver["lit"] = (receiver["x"], receiver["y"]) == (beam[-1]["x"], beam[-1]["y"])
    return receiver["lit"] and all(t["lit"] for t in state["targets"])


def _mirrors(rng, venue):
    # Coordinates define a non-self-intersecting solution; orientations are derived
    # then discarded. Only the current scrambled board is persisted and exposed.
    a, b, c = rng.randrange(1, 3), rng.randrange(3, 5), rng.randrange(5, 7)
    top, bottom = rng.randrange(3), rng.randrange(4, 7)
    corners = [(a, 3), (a, bottom), (b, bottom), (b, top), (c, top)]
    start, receiver = (-1, 3), (c, -1)
    if venue == "orbit-terrace":
        a, b, c = rng.randrange(2), rng.randrange(2, 4), rng.randrange(5, 7)
        top, bottom = rng.randrange(2), rng.randrange(5, 7)
        corners = [(a, 3), (a, bottom), (b, bottom), (b, top), (c, top), (c, 4), (4, 4)]
        receiver = (4, 7)
    full = [start] + corners + [receiver]
    turns, reflect = rng.randrange(4), bool(rng.randrange(2))
    full = [_turn_point(p, turns, reflect) for p in full]
    path = []
    for a, b in zip(full, full[1:]):
        x, y = a
        dx, dy = (b[0] > x)-(b[0] < x), (b[1] > y)-(b[1] < y)
        while (x, y) != b:
            x, y = x+dx, y+dy
            if 0 <= x < 7 and 0 <= y < 7:
                path.append((x, y))
    mirrors = []
    for i, (x, y) in enumerate(full[1:-1]):
        mirrors.append({"id": i, "x": x, "y": y, "orientation": rng.choice(["/", "\\"])})
    unused = [(x, y) for x in range(7) for y in range(7) if (x, y) not in path]
    rng.shuffle(unused)
    for x, y in unused[:3]:
        mirrors.append({"id": len(mirrors), "x": x, "y": y, "orientation": rng.choice(["/", "\\"])})
    possible_targets = list(dict.fromkeys(p for p in path if p not in full))
    targets = [possible_targets[len(possible_targets)//3], possible_targets[2*len(possible_targets)//3]]
    dx = (full[1][0] > full[0][0])-(full[1][0] < full[0][0])
    dy = (full[1][1] > full[0][1])-(full[1][1] < full[0][1])
    state = {"width": 7, "height": 7, "mirrors": mirrors,
             "walls": [{"x": x, "y": y} for x, y in unused[3:7]],
             "emitter": {"x": full[0][0], "y": full[0][1], "direction": next(d for d, v in DIRS.items() if v == (dx, dy))},
             "receiver": {"x": full[-1][0], "y": full[-1][1], "lit": False},
             "targets": [{"x": x, "y": y, "lit": False} for x, y in targets],
             "message": "点击镜片旋转。让光经过两枚星标，最后进入边缘灯座。"}
    if _trace(state):
        mirrors[0]["orientation"] = "\\" if mirrors[0]["orientation"] == "/" else "/"
        _trace(state)
    return state, 22 if venue == "orbit-terrace" else 18


def _garden(rng, venue):
    placements = 16 if venue == "cloud-library" else 14
    kinds = ["flower", "water", "grove", "stone"]
    # Balanced shuffled bags avoid long streaks; future draws are private.
    deck = []
    for _ in range(5):
        bag = kinds[:]
        rng.shuffle(bag)
        deck.extend(bag)
    return {"width": 5, "height": 5, "cells": [[None]*5 for _ in range(5)],
            "hand": deck[:3], "deck": deck[3:], "score": 0,
            "targetScore": 105 if venue == "cloud-library" else 90,
            "placements": 0, "maxPlacements": placements, "lastGain": 0,
            "message": "选择一块地形，再点击空位。搭配相邻地形，完成整行或整列。"}, placements


def create(venue, seed):
    _require(venue in CATALOG, "这处游乐地点不存在")
    kind = CATALOG[venue]["type"]
    if kind == "survivor":
        return survivor_rules.create(seed)
    if kind == "minesweeper":
        return minesweeper_rules.create(venue, seed)
    rng = random.Random(seed)
    return {"trail": _trail, "mirrors": _mirrors, "garden": _garden}[CATALOG[venue]["type"]](rng, venue)


def public_state(kind, state, now=None):
    if kind == "minesweeper":
        return minesweeper_rules.public_state(state, now)
    if kind == "survivor":
        return survivor_rules.public_state(state)
    if kind == "voyage":
        return voyage_rules.public_state(state)
    if kind == "dice":
        return dice_rules.public_state(state)
    state = deepcopy(state)
    if kind == "trail":
        board, seen = state.pop("board"), state.pop("seen")
        state["cells"] = [[cell if seen[y][x] else None for x, cell in enumerate(row)] for y, row in enumerate(board)]
    state.pop("deck", None)
    return state


def move(kind, original, steps, max_steps, action):
    """Return (new state, new step count, terminal result or None)."""
    if kind == "survivor":
        return survivor_rules.move(original, steps, max_steps, action)
    if kind == "minesweeper":
        return minesweeper_rules.move(original, steps, max_steps, action)
    if kind in ("voyage", "dice"):
        raise ValueError("这个游戏已下架，历史战绩仍然保留")
    _require(isinstance(action, dict))
    state, result = deepcopy(original), None
    if kind == "trail":
        if set(action) == {"scan"}:
            _require(action["scan"] is True and state["scans"] > 0, "探照已用完")
            state["scans"] -= 1
            _reveal(state, 3)
            state["message"] = "探照划开浓雾，更远处的路线显现了。"
        else:
            _require(set(action) == {"direction"} and isinstance(action["direction"], str) and action["direction"] in DIRS)
            dx, dy = DIRS[action["direction"]]
            x, y = state["player"]["x"]+dx, state["player"]["y"]+dy
            _require(0 <= x < state["width"] and 0 <= y < state["height"], "已到岛屿边缘")
            cell = state["board"][y][x]
            _require(cell != "wall", "前面是岩壁，换一条路吧")
            state["player"] = {"x": x, "y": y}
            state["message"] = "脚下的路逐渐清晰。"
            if cell == "gem":
                state["gems"] += 1
                state["message"] = "收下一枚星石。可以继续寻宝，也可以规划归途。"
            elif cell == "hazard":
                state["health"] -= 1
                state["message"] = "踩中了荆棘，失去一格体力。这片荆棘已被清除。"
            elif cell == "camp":
                state["health"] = min(4, state["health"]+1)
                state["message"] = "路边的营地让你恢复一格体力。"
            if cell in ("gem", "hazard", "camp"):
                state["board"][y][x] = "floor"
            _reveal(state)
            if cell == "exit":
                state["message"] = "星石还不够，回到岛上继续寻找。"
                if state["gems"] >= state["requiredGems"]:
                    result = {"won": True, "medal": 3 if state["gems"] == 5 else 2 if state["health"] >= 3 else 1,
                              "reason": "带着星石平安归航"}
        if state["health"] <= 0:
            result = {"won": False, "medal": 0, "reason": "体力耗尽，营地伙伴接你回家"}
    elif kind == "mirrors":
        _require(set(action) == {"mirrorId"} and type(action["mirrorId"]) is int)
        mirror = next((m for m in state["mirrors"] if m["id"] == action["mirrorId"]), None)
        _require(mirror is not None, "这里没有可以旋转的镜片")
        mirror["orientation"] = "\\" if mirror["orientation"] == "/" else "/"
        won = _trace(state)
        state["message"] = "光路已改变。观察光从哪一块镜片偏离。"
        if won:
            result = {"won": True, "medal": 3 if steps+1 <= 8 else 2 if steps+1 <= 13 else 1,
                      "reason": "星标与灯座全部亮起"}
    elif kind == "garden":
        _require(set(action) == {"handIndex", "x", "y"} and all(type(action[k]) is int for k in action))
        i, x, y = action["handIndex"], action["x"], action["y"]
        _require(0 <= i < 3 and 0 <= x < 5 and 0 <= y < 5)
        _require(state["cells"][y][x] is None, "这块地面已经摆好了景物")
        tile = state["hand"][i]
        neighbors = [state["cells"][ny][nx] for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)) if 0 <= nx < 5 and 0 <= ny < 5]
        weights = {"flower": {"water": 4, "flower": 2}, "grove": {"water": 3, "grove": 3},
                   "water": {"flower": 2, "grove": 2}}
        gain = 4 + (5*len({n for n in neighbors if n and n != "stone"}) if tile == "stone" else sum(weights[tile].get(n, 0) for n in neighbors))
        state["cells"][y][x] = tile
        gain += 12 * (all(state["cells"][y]) + all(state["cells"][r][x] for r in range(5)))
        state["score"] += gain
        state["placements"] += 1
        state["lastGain"] = gain
        state["hand"][i] = state["deck"].pop(0)
        state["message"] = f"这块景物带来 {gain} 分。保留手里的搭配机会。"
        if state["placements"] == state["maxPlacements"]:
            score, target = state["score"], state["targetScore"]
            result = {"won": score >= target, "medal": 3 if score >= target+50 else 2 if score >= target+25 else 1 if score >= target else 0,
                      "reason": "小岛落成，留下这一幅风景"}
    else:
        raise ValueError("游戏类型无效")
    steps += 1
    if result is None and steps >= max_steps:
        result = {"won": False, "medal": 0, "reason": "本轮步数已用完，带着新路线下次再来"}
    if result is not None:
        if kind == "trail":
            result["score"] = state["gems"]*100 + state["health"]*25 + max(0, max_steps-steps)*4
        elif kind == "mirrors":
            result["score"] = (500 + (max_steps-steps)*20) if result["won"] else 100*sum(t["lit"] for t in state["targets"])
        else:
            result["score"] = state["score"]
    return state, steps, result
