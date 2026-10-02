"""Ticket-only night-market draws; randomness and outcomes stay on the server.

Currency expectations deliberately stay below a ticket's purchase price. Item
pools include all unowned paid cosmetics and favor modest prices; free defaults
are excluded, and lottery-only collections use their own rarity tier.
Cash jackpots have no pity meter. Lottery-only collections have separate,
persistent hard-pity counters; there is never an escalating ticket price.
"""
from __future__ import annotations

import secrets

PURCHASE_LIMIT = 3
PRICES = {"coin": {"coins": 80, "diamonds": 0},
          "diamond": {"coins": 0, "diamonds": 4}}
ODDS = {"coin": (("coins", 7760), ("diamonds", 1200), ("coinItem", 950), ("diamondItem", 50), ("lotteryOnly", 40)),
        "diamond": (("diamonds", 8440), ("diamondItem", 1500), ("lotteryOnly", 60))}
PITY_LIMITS = {"coin": 30, "diamond": 20}
LIMITED_FALLBACK = {"coin": {"coins": 120, "diamonds": 0},
                    "diamond": {"coins": 0, "diamonds": 8}}
# Weight, minimum, maximum; each interval is sampled uniformly.
COIN_AMOUNTS = ((8500, 2, 45), (1400, 46, 80), (90, 120, 250), (10, 600, 1000))
COIN_DIAMOND_AMOUNTS = ((9000, 1, 1), (900, 2, 3), (90, 4, 8), (10, 25, 40))
DIAMOND_AMOUNTS = ((7500, 1, 2), (2200, 3, 4), (280, 6, 10), (20, 30, 50))
FALLBACK = {"coinItem": {"coins": 35, "diamonds": 0},
            "diamondItem": {"coins": 0, "diamonds": 2}}


def _pick(entries, randbelow):
    position = randbelow(sum(weight for _, weight in entries))
    for value, weight in entries:
        if position < weight:
            return value
        position -= weight
    raise RuntimeError("随机结果超出奖池")


def _amount(ranges, randbelow):
    low, high = _pick([((low, high), weight) for weight, low, high in ranges], randbelow)
    return low+randbelow(high-low+1)


def currency_expectation(machine, *, exhausted=False):
    """Long-run currency mean, including persistent hard pity's actual rate.

    A truncated geometric cycle gives one limited result every expected cycle;
    common branches retain their ratios on non-limited draws. This is not an
    item resale value or a promise for a particular draw at a particular count.
    """
    def mean(ranges):
        return sum(weight*(low+high)/2 for weight, low, high in ranges)/10000
    probability = .004 if machine == "coin" else .006
    limited_rate = probability/(1-(1-probability)**PITY_LIMITS[machine])
    scale = (1-limited_rate)/(1-probability)
    if machine == "coin":
        coins, diamonds = .776*mean(COIN_AMOUNTS), .12*mean(COIN_DIAMOND_AMOUNTS)
        if exhausted:
            coins += .095*FALLBACK["coinItem"]["coins"]
            diamonds += .005*FALLBACK["diamondItem"]["diamonds"]
    else:
        coins, diamonds = 0, .844*mean(DIAMOND_AMOUNTS)
        if exhausted:
            diamonds += .15*FALLBACK["diamondItem"]["diamonds"]
    coins, diamonds = coins*scale, diamonds*scale
    if exhausted:
        coins += limited_rate*LIMITED_FALLBACK[machine]["coins"]
        diamonds += limited_rate*LIMITED_FALLBACK[machine]["diamonds"]
    return {"coins": round(coins, 6), "diamonds": round(diamonds, 6),
            "coinEquivalent": round(coins+75*diamonds, 6)}


def item_weight(item, currency):
    price = item["coins" if currency == "coinItem" else "diamonds"]
    thresholds = (150, 350, 700, 1500) if currency == "coinItem" else (8, 18, 36, 70)
    for threshold, weight in zip(thresholds, (80, 40, 16, 6)):
        if price <= threshold:
            return weight
    return 2


def draw(machine, pools, *, force_limited=False, randbelow=None):
    if machine not in ODDS:
        raise ValueError("请选择金币或钻石抽奖机")
    randbelow = randbelow or secrets.randbelow
    kind = "lotteryOnly" if force_limited else _pick(ODDS[machine], randbelow)
    result = {"machine": machine, "coins": 0, "diamonds": 0,
              "item": None, "fallback": False, "rarity": "ordinary",
              "limited": kind == "lotteryOnly", "pityTriggered": force_limited}
    if kind in ("coins", "diamonds"):
        ranges = COIN_AMOUNTS if kind == "coins" else COIN_DIAMOND_AMOUNTS if machine == "coin" else DIAMOND_AMOUNTS
        amount = _amount(ranges, randbelow)
        result.update(type=kind, **{kind: amount})
        if amount >= (600 if kind == "coins" else 25):
            result["rarity"] = "jackpot"
        elif amount >= (120 if kind == "coins" else 4 if machine == "coin" else 6):
            result["rarity"] = "rare"
        result["label"] = f"{amount} {'金币' if kind == 'coins' else '钻石'}"
    elif kind == "lotteryOnly":
        candidates = pools.get(machine+"Limited", [])
        if candidates:
            item = candidates[randbelow(len(candidates))]
            result.update(type="item", item=dict(item), rarity="jackpot", label=item["name"])
        else:
            fallback = LIMITED_FALLBACK[machine]
            result.update(type="coins" if fallback["coins"] else "diamonds", fallback=True,
                          rarity="rare", **fallback)
            amount = fallback["coins"] or fallback["diamonds"]
            result["label"] = f"限定藏品已集齐 · {amount} {'金币' if fallback['coins'] else '钻石'}"
    elif pools.get(kind):
        item = _pick([(item, item_weight(item, kind)) for item in pools[kind]], randbelow)
        result.update(type="item", item=dict(item), rarity="rare" if kind == "coinItem" else "jackpot",
                      label=item["name"])
    else:
        fallback = FALLBACK[kind]
        result.update(type="coins" if fallback["coins"] else "diamonds", fallback=True, **fallback)
        amount = fallback["coins"] or fallback["diamonds"]
        result["label"] = f"奖池已收藏齐 · {amount} {'金币' if fallback['coins'] else '钻石'}"
    return result


def odds_for(machine):
    descriptions = {
        "coins": {"label": "随机金币", "min": 2, "max": 1000,
                  "typical": "85% 的金币结果为 2–45 金币；0.1% 的金币结果为 600–1000 金币"},
        "diamonds": {"label": "随机钻石", "min": 1, "max": 40 if machine == "coin" else 50,
                     "typical": "90% 的钻石结果为 1 钻石；0.1% 为 25–40 钻石" if machine == "coin" else "97% 的钻石结果为 1–4 钻石；0.2% 为 30–50 钻石"},
        "coinItem": {"label": "未拥有的金币商品", "fallback": dict(FALLBACK["coinItem"])},
        "diamondItem": {"label": "未拥有的钻石商品", "fallback": dict(FALLBACK["diamondItem"])},
        "lotteryOnly": {"label": "抽奖限定藏品", "fallback": dict(LIMITED_FALLBACK[machine])},
    }
    return [{"type": kind, "percent": weight/100, **descriptions[kind]} for kind, weight in ODDS[machine]]
