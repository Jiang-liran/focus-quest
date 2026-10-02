"""Classic Minesweeper rules. Board generation and mine positions stay server-side."""
from collections import deque
from copy import deepcopy
from datetime import datetime, timezone
import random

DIFFICULTIES = {
    "beginner": {"width": 9, "height": 9, "mines": 10, "coins": 12, "diamonds": 1},
    "intermediate": {"width": 16, "height": 16, "mines": 40, "coins": 24, "diamonds": 2},
    "expert": {"width": 30, "height": 16, "mines": 99, "coins": 40, "diamonds": 3},
}


def _require(condition, message="这一步无效，请按扫雷规则操作"):
    if not condition:
        raise ValueError(message)


def create(venue, seed):
    difficulty = venue.removeprefix("mines-") if hasattr(venue, "removeprefix") else venue[6:]
    _require(difficulty in DIFFICULTIES, "扫雷难度不存在")
    config = DIFFICULTIES[difficulty]
    size = config["width"] * config["height"]
    return {"difficulty": difficulty, "width": config["width"], "height": config["height"],
            "mines": config["mines"], "phase": "ready", "questions": True,
            "_seed": seed, "_mines": [], "_numbers": [],
            "_cells": ["covered"] * size, "_exploded": None,
            "_clockStartedAt": None, "_elapsedSeconds": 0,
            "message": "左键翻开，右键标记；数字周围旗子数量相符时，可双键或双击快速翻开。"}, 0


def neighbors(state, index):
    width, height = state["width"], state["height"]
    x, y = index % width, index // width
    return [ny * width + nx for ny in range(max(0, y - 1), min(height, y + 2))
            for nx in range(max(0, x - 1), min(width, x + 2)) if (nx, ny) != (x, y)]


def _place(state, safe_index):
    # Classic first-click safety excludes only the clicked square. Adjacent
    # mines and boards requiring a guess remain possible, just as in Windows XP.
    candidates = [i for i in range(len(state["_cells"])) if i != safe_index]
    state["_mines"] = sorted(random.Random(state.pop("_seed")).sample(candidates, state["mines"]))
    mines = set(state["_mines"])
    state["_numbers"] = [-1 if i in mines else sum(n in mines for n in neighbors(state, i))
                         for i in range(len(state["_cells"]))]
    state["phase"] = "playing"


def elapsed_seconds(state, now=None):
    elapsed = max(0, state.get("_elapsedSeconds", 0))
    started = state.get("_clockStartedAt")
    if state["phase"] == "playing" and started is not None and now is not None:
        elapsed = max(elapsed, float(now) - started)
    return round(elapsed, 3)


def public_state(state, now=None):
    terminal = state["phase"] in ("won", "lost", "abandoned")
    mines = set(state["_mines"]) if terminal else set()
    cells = []
    for y in range(state["height"]):
        row = []
        for x in range(state["width"]):
            index = y * state["width"] + x
            visibility = state["_cells"][index]
            cell = {"state": visibility}
            if visibility == "open" and state["_numbers"][index] >= 0:
                cell["number"] = state["_numbers"][index]
            if terminal:
                if index in mines:
                    cell["mine"] = True
                if index == state["_exploded"]:
                    cell["exploded"] = True
                if visibility == "flag" and index not in mines:
                    cell["wrongFlag"] = True
            row.append(cell)
        cells.append(row)
    flags = state["_cells"].count("flag")
    started = state.get("_clockStartedAt")
    return {"difficulty": state["difficulty"], "width": state["width"], "height": state["height"],
            "mines": state["mines"], "phase": state["phase"], "questions": state["questions"],
            "cells": cells, "flags": flags, "remainingMines": state["mines"] - flags,
            "opened": sum(cell == "open" and state["_numbers"][i] >= 0
                          for i, cell in enumerate(state["_cells"])),
            "safeCells": state["width"] * state["height"] - state["mines"],
            "clockStartedAt": datetime.fromtimestamp(started, timezone.utc).isoformat() if started is not None else None,
            "elapsedSeconds": elapsed_seconds(state, now), "message": state["message"]}


def _open(state, indices):
    queue = deque(indices)
    while queue:
        index = queue.popleft()
        if state["_cells"][index] in ("open", "flag"):
            continue
        state["_cells"][index] = "open"
        value = state["_numbers"][index]
        if value == -1:
            state["_exploded"] = index
            state["phase"] = "lost"
            state["message"] = "踩到地雷了。观察棋盘，下次再试。"
            return
        if value == 0:
            queue.extend(neighbors(state, index))


def move(original, steps, max_steps, action):
    _require(isinstance(action, dict))
    operation = action.get("action")
    _require(isinstance(operation, str) and operation in ("reveal", "mark", "chord", "questions"))
    _require(original["phase"] in ("ready", "playing"), "这局扫雷已经结束")
    if operation == "questions":
        _require(set(action) == {"action", "enabled"} and type(action["enabled"]) is bool)
    else:
        _require(set(action) == {"action", "x", "y"} and type(action["x"]) is int and type(action["y"]) is int)
        _require(0 <= action["x"] < original["width"] and 0 <= action["y"] < original["height"])
    state = deepcopy(original)
    if operation == "questions":
        state["questions"] = action["enabled"]
    else:
        index = action["y"] * state["width"] + action["x"]
        cell = state["_cells"][index]
        if operation == "mark" and cell != "open":
            state["_cells"][index] = {"covered": "flag", "flag": "question" if state["questions"] else "covered",
                                       "question": "covered"}[cell]
        elif operation == "reveal" and cell not in ("open", "flag"):
            if state["phase"] == "ready":
                _place(state, index)
            _open(state, [index])
        elif operation == "chord" and cell == "open" and state["_numbers"][index] > 0:
            adjacent = neighbors(state, index)
            if sum(state["_cells"][n] == "flag" for n in adjacent) == state["_numbers"][index]:
                _open(state, adjacent)
    result = None
    if state["phase"] == "playing" and all(value == -1 or state["_cells"][i] == "open"
                                            for i, value in enumerate(state["_numbers"])):
        state["phase"] = "won"
        for index in state["_mines"]:
            state["_cells"][index] = "flag"
        state["message"] = "所有安全格已翻开，扫雷成功！"
    if state["phase"] in ("won", "lost"):
        won = state["phase"] == "won"
        result = {"won": won, "score": sum(cell == "open" and state["_numbers"][i] >= 0
                                           for i, cell in enumerate(state["_cells"])),
                  "medal": list(DIFFICULTIES).index(state["difficulty"]) + 1 if won else 0,
                  "difficulty": state["difficulty"], "reason": state["message"]}
    return state, steps + 1, result
