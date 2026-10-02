#!/usr/bin/env python3
"""Focus Quest: local-only, read-only TomatoTodo importer and study dashboard.

No third-party packages are required. Records stay recoverable in a separate
SQLite archive; confirmed source deletions move them out of active statistics.
Targets are current settings, including when viewing previous days.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import mimetypes
import os
import signal
import sqlite3
import threading
import time
import tempfile
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

DEFAULT_SOURCE = Path.home() / "Library/Application Support/tomatodo/tomatodo_db.json"
DEFAULT_DATA = Path.home() / "Library/Application Support/FocusQuest"
STATIC_DIR = Path(__file__).resolve().parent / "static"
POLL_SECONDS = 3
CALENDAR_STALE_SECONDS = 180
SUBJECTS = (
    ("math", "数学", "#65e4b4"),
    ("cs", "408", "#ab9bff"),
    ("politics", "政治", "#ffbd79"),
    ("english", "英语", "#75c9ff"),
)
SUBJECT_IDS = {s[0] for s in SUBJECTS}
ACTIVITY_TYPES = (
    ("lecture", "听课"),
    ("practice", "做题"),
    ("other", "复习 / 其他"),
)
ACTIVITY_IDS = {item[0] for item in ACTIVITY_TYPES}
# These exact task names were confirmed by the user to mean attending lessons.
# Other tasks containing “复习” are intentionally left unclassified.
CONFIRMED_LECTURE_TASKS = {"复习数学", "复习408", "复习政治", "复习英语"}
DEFAULT_SETTINGS = {
    "targets": {"math": 180, "cs": 180, "politics": 60, "english": 60},
    "weeklyTarget": 3000,
    "mapping": {}, "activityMapping": {}, "motion": True, "sound": False,
}
QUEST_DEFINITIONS = (
    {"subject": "math", "name": "数学 · 推演晨光", "period": "morning", "target": 60, "openHour": 0, "deadlineHour": 12},
    {"subject": "politics", "name": "政治 · 思辨札记", "period": "morning", "target": 30, "openHour": 0, "deadlineHour": 12},
    {"subject": "cs", "name": "408 · 解构星图", "period": "afternoon", "target": 60, "openHour": 12, "deadlineHour": 18},
    {"subject": "english", "name": "英语 · 译读回响", "period": "afternoon", "target": 30, "openHour": 12, "deadlineHour": 18},
)
SHOP_CATALOG = (
    ("bar-default", "bar", "初旅刻度", "营地原有的进度刻度", 0, 0),
    ("bar-mint", "bar", "薄荷新芽", "让每一步进度染上清新的绿意", 120, 0),
    ("bar-aurora", "bar", "极光流转", "让学习进度泛起极光", 240, 0),
    ("bar-comet", "bar", "彗星轨迹", "循着彗星推进远征", 360, 0),
    ("bar-tide", "bar", "潮汐回响", "让专注的波纹随进度荡开", 480, 0),
    ("bar-prism", "bar", "棱镜虹光", "把积累折射成缤纷的光带", 0, 12),
    ("fx-default", "fx", "初旅星光", "保留星辉城与群岛原有的细碎星光", 0, 0),
    ("fx-fireflies", "fx", "萤火微光", "让轻盈萤火点缀星辉城的建筑与庭院", 180, 0),
    ("fx-petals", "fx", "花瓣来信", "让零星花瓣掠过星辉城，添一层柔和景色", 300, 0),
    ("fx-snow", "fx", "静雪漫舞", "用安静雪意装点星辉城的城楼与夜空", 420, 0),
    ("fx-meteor", "fx", "流星庆典", "在星辉城上空铺开流星划过的光迹", 0, 12),
    ("fx-nebula", "fx", "星云呼吸", "以层叠星云光彩环绕星辉城的天际", 0, 18),
    ("avatar-default", "avatar", "初旅行装", "让沿星辉城环岛路线前行的小旅人保留最初的行装", 0, 0),
    ("avatar-ranger", "avatar", "知识游侠", "为沿星辉城环岛路线前行的小旅人换上游侠行装", 180, 0),
    ("avatar-voyager", "avatar", "远航行者", "让星辉城里的小旅人背起行囊，沿环岛路线前行", 300, 0),
    ("avatar-alchemist", "avatar", "灵感炼金师", "为星辉城环岛旅人换上炼金师衣装，随进度走向下一站", 420, 0),
    ("avatar-star", "avatar", "星辉旅者", "让星辉城环岛旅人披上星色旅装，随进度走向下一站", 0, 12),
    ("avatar-royal", "avatar", "晨曦冠冕", "为星辉城环岛旅人添上晨光冠冕，沿途看见新的风景", 0, 18),
    ("banner-default", "banner", "营地素纹", "旅人等级与装扮卡片原有的铭牌边框", 0, 0),
    ("banner-leaf", "banner", "青叶纹章", "让清新叶纹在旅人铭牌边框上舒展", 120, 0),
    ("banner-parchment", "banner", "羊皮书页", "用泛黄书页般的卡片边框衬托每一步成长", 240, 0),
    ("banner-obsidian", "banner", "曜石纹章", "用沉静深色的铭牌边框衬托旅人行装", 360, 0),
    ("banner-celestial", "banner", "天穹星纹", "让星轨在旅人卡片的铭牌纹章中交汇", 0, 10),
    ("banner-sovereign", "banner", "远征王徽", "把坚持的轨迹镌刻在自己的铭牌边框上", 0, 16),
    ("theme-default", "theme", "初始星岛", "保留星辉城与群岛熟悉的星空环境", 0, 0),
    ("theme-forest", "theme", "森间秘境", "为星辉城与群岛换上幽绿的森林环境", 0, 24),
    ("theme-ocean", "theme", "深海回廊", "让星辉城与群岛映入深蓝海光的环境", 0, 36),
    ("theme-sakura", "theme", "樱色晴空", "为星辉城与群岛铺开温柔的樱色天幕", 0, 48),
    ("theme-aurora", "theme", "极夜天幕", "让极光夜色环绕星辉城与群岛的天际", 0, 60),
    ("companion-default", "companion", "独自出发", "沿星辉城环岛路线独自前行，暂不携带随行伙伴", 0, 0),
    ("companion-fox", "companion", "萤尾灵狐", "让萤尾灵狐陪着旅人，随学习进度沿星辉城外围同行", 0, 16),
    ("companion-owl", "companion", "书卷夜枭", "让书卷夜枭陪着旅人，随学习进度沿星辉城外围同行", 0, 24),
    ("companion-whale", "companion", "浮空星鲸", "让浮空星鲸伴着旅人，随学习进度游过星辉城环岛路线", 0, 36),
    ("companion-dragon", "companion", "晨光幼龙", "让晨光幼龙陪着旅人，随学习进度沿星辉城外围同行", 0, 48),
    ("relic-default", "relic", "初始晶台", "保留星辉城中央最初的晶石圣物台", 0, 0),
    ("relic-lotus", "relic", "映月莲台", "把星辉城中央圣物换成层叠莲瓣的月光莲台", 0, 20),
    ("relic-orrery", "relic", "群星仪轨", "在星辉城中央安放由星环构成的群星仪轨", 0, 32),
    ("relic-hourglass", "relic", "时砂圣坛", "将星辉城中央圣物换成盛放星砂的时砂圣坛", 0, 44),
    ("portal-default", "portal", "未开启", "保留星辉城环岛路线终点原有的门庭，不另添门景", 0, 0),
    ("portal-moon", "portal", "月门微光", "在星辉城环岛路线终点安放柔和的月光门景", 0, 24),
    ("portal-archive", "portal", "典藏之门", "以典藏书库式门景装点星辉城环岛路线的终点", 0, 36),
    ("portal-cosmos", "portal", "寰宇裂隙", "在星辉城环岛路线终点点亮遥望宇宙的裂隙门景", 0, 48),
    ("camp-default", "camp", "初旅营地", "保留篝火聊天原有的营地风景", 0, 0),
    ("camp-pine", "camp", "松间歇脚", "把聊天营地安放在安静的松林之间", 0, 18),
    ("camp-lake", "camp", "湖畔微澜", "在湖边景色中留一处围炉闲聊的位置", 0, 28),
    ("camp-snow", "camp", "雪原守夜", "让雪地与远山围住一小片温暖营地", 0, 40),
    ("camp-aurora", "camp", "极光停泊", "为火边的片刻闲谈铺开极光夜色", 0, 54),
    ("fire-default", "fire", "初旅篝火", "营地里最初那簇熟悉的暖色火光", 0, 0),
    ("fire-copper", "fire", "铜炉暖焰", "用温润的铜色火炉围起一簇小火", 180, 0),
    ("fire-lantern", "fire", "灯笼火座", "让灯笼式火座为聊天留下一圈暖光", 300, 0),
    ("fire-blue", "fire", "幽蓝炉火", "给火焰换上一层安静的蓝色光彩", 0, 12),
    ("fire-star", "fire", "星焰小憩", "把点点星色装进火边的微光里", 0, 18),
    ("tent-default", "tent", "朴素行帐", "保留聊天营地原有的简朴帐篷", 0, 0),
    ("tent-patchwork", "tent", "补丁小帐", "用拼接布片给帐篷添一点旅途的生活气息", 180, 0),
    ("tent-ranger", "tent", "游侠行帐", "在篝火旁支起便于远行的游侠帐篷", 300, 0),
    ("tent-canopy", "tent", "林间篷亭", "换上一座适合停下来闲坐的轻巧篷亭", 420, 0),
    ("tent-observatory", "tent", "观星帐屋", "让帐篷带上小小观星站的模样", 0, 16),
    ("campgear-default", "campgear", "轻装休憩", "保留篝火边原有的简单陈设", 0, 0),
    ("campgear-tea", "campgear", "暖茶小桌", "在火边摆好茶壶与杯子，添一处闲聊的小桌", 120, 0),
    ("campgear-books", "campgear", "旧书一角", "让几册旧书与随手的笔记留在篝火旁", 240, 0),
    ("campgear-picnic", "campgear", "野餐闲席", "铺开野餐小席，为营地添一点生活里的滋味", 360, 0),
    ("campgear-music", "campgear", "旅途琴架", "把旅途乐器摆在火边，作为一件安静的陈设", 0, 12),
    ("campglow-default", "campglow", "夜色澄净", "保留聊天营地原有的柔和氛围", 0, 0),
    ("campglow-fireflies", "campglow", "萤火作伴", "让轻盈萤光点缀围炉闲谈的片刻", 180, 0),
    ("campglow-petals", "campglow", "花瓣晚风", "让零星花瓣掠过聊天营地", 300, 0),
    ("campglow-snow", "campglow", "细雪轻落", "给篝火周围添一层轻轻落下的雪意", 0, 12),
    ("campglow-stardust", "campglow", "星尘入夜", "用细碎星光点缀营地里的夜色", 0, 18),
    ("chatframe-default", "chatframe", "营地素笺", "保留火边对话原有的简洁外观", 0, 0),
    ("chatframe-linen", "chatframe", "亚麻轻语", "给对话卡片换上柔和的亚麻纹理边饰", 120, 0),
    ("chatframe-wood", "chatframe", "木纹闲话", "用温暖木纹装点每一段火边闲谈", 240, 0),
    ("chatframe-parchment", "chatframe", "旅途信笺", "让对话像写在一张随身的旧信纸上", 360, 0),
    ("chatframe-constellation", "chatframe", "星图低语", "让小小星图沿着对话卡片边缘铺开", 0, 12),
)
SHOP_ITEMS = {item[0]: dict(zip(("id", "slot", "name", "description", "coins", "diamonds"), item))
              for item in SHOP_CATALOG}
SHOP_CATEGORIES = {"bar": "进度条", "fx": "星岛特效", "avatar": "我的时装",
                   "banner": "旅人铭牌", "theme": "星岛环境", "companion": "随行伙伴",
                   "relic": "星岛圣物", "portal": "远征之门", "camp": "营地风景",
                   "fire": "篝火样式", "tent": "营地帐篷", "campgear": "火边陈设",
                   "campglow": "营地氛围", "chatframe": "对话外观"}
LEGACY_SHOP_ITEM_IDS = ("bar-aurora", "bar-comet", "fx-fireflies", "fx-meteor", "npc-scholar",
                        "npc-astral", "avatar-ranger", "avatar-star")
EXCHANGE_COINS_PER_DIAMOND = 75
EXCHANGE_MAX_DIAMONDS = 1000
SHOP_PRICING_MIGRATION = "shopPricing:v18"
SHOP_NPC_REMOVAL_MIGRATION = "shopNpcRemoval:v1"
TIMED_BONUS_START_META = "questTimedBonus:featureStartMs"
RETIRED_NPC_ITEM_IDS = ("npc-default", "npc-scholar", "npc-tea", "npc-copper", "npc-astral", "npc-phoenix")
# These are historical upgrade prices, not purchasable catalog entries. Old
# archives still need the v1.8 difference credited before the final net refund.
RETIRED_NPC_V18_PRICES = {"npc-scholar": {"coins": 180, "diamonds": 0},
                         "npc-astral": {"coins": 0, "diamonds": 12}}
HISTORY_SOURCE = "history_xlsx"
HISTORY_FIELDS = ("name", "minutes", "start_ms", "end_ms", "day")


def quest_clock(now=None):
    current = now or datetime.now().astimezone()
    if not isinstance(current, datetime) or current.tzinfo is None or current.utcoffset() is None:
        raise ValueError("委托时间必须包含时区")
    return current


def quest_window(definition, current):
    midnight = current.replace(hour=0, minute=0, second=0, microsecond=0)
    opens = midnight + timedelta(hours=definition["openHour"])
    deadline = midnight + timedelta(hours=definition["deadlineHour"])
    return opens, deadline, deadline + timedelta(minutes=30)


def finite_number(value, *, minimum=0, maximum=10**16):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("必须使用有效数字")
    if value < minimum or value > maximum or not math.isfinite(value):
        raise ValueError("数字超出允许范围")
    return value


def iso_ms(timestamp_ms):
    return datetime.fromtimestamp(timestamp_ms / 1000).astimezone().isoformat(timespec="seconds")


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def parse_day(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError("日期应为 YYYY-MM-DD")
    result = date.fromisoformat(value)
    if result.isoformat() != value:
        raise ValueError("日期应为 YYYY-MM-DD")
    return result


def percent(minutes, target):
    return round(minutes / target * 100, 1) if target else 0


def classify(name, mapping):
    if name in mapping:
        return mapping[name]
    if "数学" in name:
        return "math"
    if any(word in name for word in ("408", "数据结构", "操作系统", "计组", "计算机组成", "计算机网络")):
        return "cs"
    if "政治" in name:
        return "politics"
    if any(word in name for word in ("英语", "单词")):
        return "english"
    return "other"


def classify_activity(name, mapping):
    if name in mapping:
        return mapping[name]
    if name in CONFIRMED_LECTURE_TASKS:
        return "lecture"
    lecture = any(word in name for word in ("听课", "听讲", "网课", "课程", "看课", "看视频"))
    practice = any(word in name for word in ("做题", "刷题", "练题", "练习", "习题", "真题"))
    if lecture == practice:
        return "other"
    return "lecture" if lecture else "practice"


def normalize_record(record):
    """Extract only study fields; never copy credentials/device/account data."""
    if not isinstance(record, dict) or record.get("isComplete") != 1:
        return None
    try:
        minutes = finite_number(record.get("time"), minimum=0, maximum=1440 * 365)
        if minutes <= 0:
            return None
        name = record.get("name")
        if not isinstance(name, str) or not name.strip():
            return None
        source_id = record.get("id")
        if isinstance(source_id, bool) or not isinstance(source_id, (str, int)) or not str(source_id):
            return None
        start_ms = int(finite_number(record.get("startDate"), minimum=1, maximum=32503680000000))
        create_ms = int(finite_number(record.get("createDate"), minimum=1, maximum=32503680000000))
        completed_ms = create_ms
        # TomatoTodo moves a midnight-closing record's createDate to the
        # archive day. Preserve that day; s4 is the actual end in epoch seconds.
        if record.get("i6") and record.get("s4"):
            try:
                actual_end = float(record["s4"])
                finite_number(actual_end, minimum=1, maximum=32503680000)
                completed_ms = int(actual_end * 1000)
            except (ValueError, TypeError, OverflowError):
                pass
        day = datetime.fromtimestamp(create_ms / 1000).astimezone().date().isoformat()
        # Also validate supported platform datetime ranges.
        iso_ms(start_ms)
        iso_ms(completed_ms)
        key = f"{source_id}:{start_ms}"
        return (key, str(source_id), name.strip(), float(minutes), start_ms, completed_ms, day, "tomatodo")
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def calendar_timestamp(value):
    """Calendar bridge timestamps must include a timezone; never guess one."""
    if not isinstance(value, str) or len(value) > 50:
        raise ValueError("日历时间格式无效")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("日历时间缺少时区")
    timestamp = int(parsed.timestamp() * 1000)
    finite_number(timestamp, minimum=1, maximum=32503680000000)
    return timestamp


def normalize_calendar_record(event, calendar_id, allowed_titles, now_ms, range_start, range_end, *, pending=False):
    """Validate named study events; pending items are only used for status."""
    if not isinstance(event, dict):
        return None
    try:
        if (event.get("calendarID") != calendar_id or event.get("isAllDay") is not False
                or event.get("isRecurring") is True):
            return None
        title = event.get("title")
        if not isinstance(title, str) or title not in allowed_titles:
            return None
        item_id = event.get("calendarItemIdentifier")
        if not isinstance(item_id, str) or not item_id or len(item_id) > 2000:
            return None
        start_ms, end_ms = calendar_timestamp(event.get("start")), calendar_timestamp(event.get("end"))
        duration = end_ms - start_ms
        if not 1000 <= duration <= 86_400_000:
            return None
        if pending:
            if not start_ms <= now_ms < end_ms or end_ms > now_ms + 86_400_000:
                return None
        elif end_ms > now_ms:
            return None
        if end_ms <= range_start or (start_ms > range_end if pending else start_ms >= range_end):
            return None
        external_id = event.get("externalIdentifier")
        if external_id is not None and (not isinstance(external_id, str) or len(external_id) > 2000):
            return None
        # iCloud's external UID survives a full EventKit cache refresh, unlike
        # calendarItemIdentifier. Tomato writes independent, nonrecurring events.
        identity = ["external", external_id] if external_id else ["item", item_id]
        source_key = json.dumps([calendar_id] + identity, ensure_ascii=False, separators=(",", ":"))
        key = "calendar:" + hashlib.sha256(source_key.encode("utf-8")).hexdigest()
        day = datetime.fromtimestamp(end_ms / 1000).astimezone().date().isoformat()
        return (key, source_key, title, round(duration / 60_000, 8), start_ms, end_ms, day, "calendar")
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def validate_settings(current, patch):
    if not isinstance(patch, dict) or set(patch) - set(DEFAULT_SETTINGS):
        raise ValueError("设置字段无效")
    result = json.loads(json.dumps(current))
    if "targets" in patch:
        targets = patch["targets"]
        if not isinstance(targets, dict) or set(targets) - SUBJECT_IDS:
            raise ValueError("科目目标字段无效")
        for subject, value in targets.items():
            finite_number(value, minimum=1, maximum=1440)
            if int(value) != value:
                raise ValueError("目标请使用整数分钟")
            result["targets"][subject] = int(value)
        if sum(result["targets"].values()) > 1440:
            raise ValueError("每日目标合计不能超过 24 小时")
    if "weeklyTarget" in patch:
        value = finite_number(patch["weeklyTarget"], minimum=1, maximum=10080)
        if int(value) != value:
            raise ValueError("周目标请使用整数分钟")
        result["weeklyTarget"] = int(value)
    if "mapping" in patch:
        mapping = patch["mapping"]
        if not isinstance(mapping, dict) or len(mapping) > 5000:
            raise ValueError("任务分类字段无效")
        for name, subject in mapping.items():
            if not isinstance(name, str) or not name.strip() or len(name) > 500:
                raise ValueError("任务名称无效")
            if subject is None:
                result["mapping"].pop(name, None)
            elif not isinstance(subject, str) or (subject not in SUBJECT_IDS and subject != "other"):
                raise ValueError("任务分类无效")
            else:
                result["mapping"][name] = subject
        if len(result["mapping"]) > 5000:
            raise ValueError("任务分类数量过多")
    if "activityMapping" in patch:
        mapping = patch["activityMapping"]
        if not isinstance(mapping, dict) or len(mapping) > 5000:
            raise ValueError("学习方式分类字段无效")
        for name, activity in mapping.items():
            if not isinstance(name, str) or not name.strip() or len(name) > 500:
                raise ValueError("任务名称无效")
            if activity is None:
                result["activityMapping"].pop(name, None)
            elif not isinstance(activity, str) or activity not in ACTIVITY_IDS:
                raise ValueError("学习方式分类无效")
            else:
                result["activityMapping"][name] = activity
        if len(result["activityMapping"]) > 5000:
            raise ValueError("学习方式分类数量过多")
    for key in ("motion", "sound"):
        if key in patch:
            if type(patch[key]) is not bool:
                raise ValueError("开关设置必须为 true 或 false")
            result[key] = patch[key]
    return result


def make_advice(day, subjects, minutes, records, now=None):
    now = now or datetime.now().astimezone()
    if day != now.date().isoformat():
        return {"id": "history", "title": "每一段专注，都留下了足迹", "text": "这是历史学习记录。进度按当前目标计算，回看积累，也为下一次出发积蓄力量。", "tone": "neutral"}
    by_id = {subject["id"]: subject for subject in subjects}
    missing = [s["name"] for s in subjects if s["minutes"] == 0]
    if minutes >= sum(s["target"] for s in subjects):
        balance_note = f"{ '、'.join(missing) }可以在下次安排中优先留出时间。" if missing else ""
        return {"id": "complete", "title": "今日远征完成", "text": "总时长目标已达成，今天的投入已经足够。安心收下成果，也给休息留出位置。" + balance_note + "超额学习会被记录，不是新的义务。", "tone": "success"}
    if now.hour >= 22 or now.hour < 7:
        return {"id": "night-rest", "title": "夜深了，先安心休息", "text": "今天的投入都已保存。现在不必追赶进度，先睡个好觉，未完成的安排留到下一次出发。", "tone": "rest"}
    # A recent chain of completed sessions with gaps <= 15 min is a useful
    # gentle rest signal, without interpreting an old morning chain as current.
    ordered = sorted(records, key=lambda r: r["end_ms"], reverse=True)
    if ordered and -60_000 <= now.timestamp() * 1000 - ordered[0]["end_ms"] <= 30 * 60_000:
        chain_minutes = ordered[0]["minutes"]
        earliest = ordered[0]["start_ms"]
        for item in ordered[1:]:
            if earliest - item["end_ms"] > 15 * 60_000:
                break
            chain_minutes += item["minutes"]
            earliest = min(earliest, item["start_ms"])
        if chain_minutes >= 120:
            return {"id": "rest", "title": "连战两小时，先回营补给", "text": "最近已经连续投入了至少两小时。起身走走、喝点水，让下一段专注更轻松。", "tone": "rest"}
    if 11 <= now.hour <= 14 and minutes >= 300:
        return {"id": "early-progress", "title": "今天推进得很棒，记得恢复体力", "text": "这么早就已经专注了至少五小时。安心吃饭、休息，不必把进度变成压力。", "tone": "rest"}
    if missing and by_id["math"]["minutes"] >= by_id["math"]["target"] and by_id["cs"]["minutes"] >= by_id["cs"]["target"]:
        return {"id": "balance", "title": "主力已就位，照顾一下其他科目", "text": f"数学和 408 已完成目标，{ '、'.join(missing) }还没有学习记录。下一轮可以给它们留一点时间。", "tone": "balance"}
    if 11 <= now.hour < 14 and minutes < 60:
        return {"id": "start", "title": "现在开始，依然来得及", "text": "上午的专注还不到一小时。先开一个 25 分钟的小任务，把注意力从分心的事情上收回来。", "tone": "nudge"}
    if missing and minutes >= 180:
        return {"id": "balance-light", "title": "下一站，也可以换一门科目", "text": f"你已经积累了不少专注。{ '、'.join(missing) }还未开始，换换科目也能给大脑一点新鲜感。", "tone": "balance"}
    if minutes == 0:
        return {"id": "ready", "title": "今天的第一点经验，等你来领取", "text": "在番茄 ToDo 完成一个计时任务，经验和进度就会自动到账。从一小段专注开始。", "tone": "neutral"}
    return {"id": "steady", "title": "稳稳推进，就是在升级", "text": "每一分钟都已记入你的经验。按自己的节奏完成下一小段，专注之后也记得休息。", "tone": "neutral"}


def make_activity_advice(day, subject, daily_minutes, daily_target, now, overall_advice=None):
    """Offer a lightweight time-allocation heuristic, not a learning diagnosis."""
    name = subject["name"]
    historical = day != now.date().isoformat()
    period = "这一天" if historical else "今天"
    if historical:
        next_step = "下次学习时，可以安排 25 分钟做题，检验听课内容。"
    elif daily_minutes >= daily_target:
        next_step = "今天的总目标已达成，先安心休息；下次学习时再安排 25 分钟做题。"
    elif now.hour >= 22 or now.hour < 7:
        next_step = "现在先休息，下一天的学习中可安排 25 分钟做题。"
    elif overall_advice and overall_advice["tone"] == "rest":
        next_step = "先休息、恢复精力；之后的学习中再安排 25 分钟做题。"
    else:
        next_step = "下一段可以安排 25 分钟做题，把听到的方法用起来。"
    lecture, practice = subject["lecture"], subject["practice"]
    if lecture >= 60 and practice < lecture * 0.5:
        return {"id": "lecture-heavy", "title": f"{name}听课偏多",
                "text": f"{period}已记录的{name}听课至少 1 小时，做题时长不足听课的一半。{next_step}",
                "tone": "balance"}
    if subject["minutes"] == 0:
        return {"id": "no-records", "title": f"{name}暂无完成记录",
                "text": f"{period}还没有{name}的完成记录。完成任务后，听课与做题时间会自动统计。",
                "tone": "neutral"}
    if lecture + practice == 0:
        return {"id": "unclassified", "title": f"{name}的学习方式等待记录",
                "text": f"{period}暂无可区分的{name}听课或做题记录。可在设置中给含糊任务指定学习方式；复习、背诵等也可以保留为其他。",
                "tone": "neutral"}
    if practice >= 60 and lecture == 0:
        return {"id": "practice-focused", "title": f"{name}做题已有积累",
                "text": f"{period}记录以做题为主。下次复盘时可整理错因、回看不熟悉的知识点，无需为了凑比例增加听课。",
                "tone": "neutral"}
    return {"id": "steady", "title": f"{name}按自己的节奏推进",
            "text": f"{period}的听课与做题时间已记录。下次安排可结合题目掌握情况调整，不必追求固定比例。",
            "tone": "neutral"}


def activity_summary(day, daily, settings, daily_minutes, daily_target, now, overall_advice=None):
    totals = {aid: 0 for aid in ACTIVITY_IDS}
    by_subject = {sid: {"id": sid, "name": name, "minutes": 0,
                        "lecture": 0, "practice": 0, "other": 0}
                  for sid, name, _ in SUBJECTS}
    for record in daily:
        sid = classify(record["name"], settings["mapping"])
        activity = classify_activity(record["name"], settings["activityMapping"])
        totals[activity] += record["minutes"]
        if sid not in by_subject:
            by_subject[sid] = {"id": "other", "name": "待分类科目", "minutes": 0,
                               "lecture": 0, "practice": 0, "other": 0}
        by_subject[sid][activity] += record["minutes"]
        by_subject[sid]["minutes"] += record["minutes"]
    subjects = list(by_subject.values())
    for subject in subjects:
        for key in ("minutes", "lecture", "practice", "other"):
            subject[key] = round(subject[key], 4)
        identified = subject["lecture"] + subject["practice"]
        subject["practiceShare"] = percent(subject["practice"], identified) if identified else None
        subject["advice"] = make_activity_advice(day, subject, daily_minutes, daily_target, now, overall_advice)
    heavy = [subject for subject in subjects if subject["advice"]["id"] == "lecture-heavy"]
    if heavy:
        # Surface the largest lecture/practice gap; each subject retains its own advice.
        advice = dict(max(heavy, key=lambda item: item["lecture"] - item["practice"])["advice"])
    elif daily_minutes == 0:
        advice = {"id": "no-records", "title": "所选日期暂无完成记录",
                  "text": "完成任务后，听课与做题时间会自动统计。",
                  "tone": "neutral"}
    elif totals["lecture"] + totals["practice"] == 0:
        advice = {"id": "unclassified", "title": "给学习方式补上标签",
                  "text": "暂无可区分的听课或做题记录。可在设置中给含糊任务指定学习方式，复习、背诵等也可以保留为其他。",
                  "tone": "neutral"}
    else:
        advice = {"id": "steady", "title": "学习方式已记录，按掌握情况调整",
                  "text": "听课帮助理解，做题帮助检验。下次安排可结合各科掌握情况和错题反馈调整，不必追求固定比例。",
                  "tone": "neutral"}
    advice["text"] += " 建议仅依据已记录时长，不评判学习效果。"
    return {"totals": {key: round(value, 4) for key, value in totals.items()},
            "subjects": subjects, "advice": advice}


class FocusStore:
    def __init__(self, data_dir=DEFAULT_DATA, source=DEFAULT_SOURCE, *, quest_lower_bound="accepted"):
        if quest_lower_bound not in ("accepted", "opens"):
            raise ValueError("委托计时下界无效")
        self.quest_lower_bound = quest_lower_bound
        self.data_dir = Path(data_dir).expanduser()
        self.source = Path(source).expanduser()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(str(self.data_dir / "focus-quest.sqlite3"), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY, source_id TEXT NOT NULL, name TEXT NOT NULL,
                minutes REAL NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
                day TEXT NOT NULL, source TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS records_day ON records(day);
            CREATE TABLE IF NOT EXISTS record_aliases (
                source TEXT NOT NULL, source_key TEXT NOT NULL, record_id TEXT NOT NULL,
                PRIMARY KEY (source, source_key)
            );
            CREATE INDEX IF NOT EXISTS record_aliases_record ON record_aliases(record_id);
            CREATE TABLE IF NOT EXISTS source_presence (
                source TEXT NOT NULL, source_key TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
                missing_count INTEGER NOT NULL DEFAULT 0, last_snapshot TEXT,
                PRIMARY KEY (source, source_key)
            );
            CREATE TABLE IF NOT EXISTS record_lifecycle (
                record_id TEXT PRIMARY KEY, deleted_at TEXT, reason TEXT, manual_action TEXT
            );
            CREATE TABLE IF NOT EXISTS record_merges (
                removed_id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL,
                merged_at TEXT NOT NULL, original_records TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS records_match ON records(source,name,start_ms);
            CREATE TABLE IF NOT EXISTS daily_openings (
                day TEXT PRIMARY KEY, shown_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS quest_acceptances (
                day TEXT NOT NULL, subject TEXT NOT NULL, accepted_ms INTEGER NOT NULL,
                lower_ms INTEGER NOT NULL, lower_bound TEXT NOT NULL,
                PRIMARY KEY(day,subject)
            );
            CREATE TABLE IF NOT EXISTS quest_receipts (
                day TEXT NOT NULL, subject TEXT NOT NULL, name TEXT NOT NULL,
                minutes REAL NOT NULL, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                submitted_ms INTEGER NOT NULL, PRIMARY KEY(day,subject)
            );
            CREATE TABLE IF NOT EXISTS quest_allocations (
                day TEXT NOT NULL, subject TEXT NOT NULL, record_id TEXT NOT NULL,
                start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, minutes REAL NOT NULL,
                PRIMARY KEY(day,subject,record_id,start_ms,end_ms)
            );
            CREATE TABLE IF NOT EXISTS quest_tracks (
                subject TEXT PRIMARY KEY, accepted_ms INTEGER NOT NULL,
                continuous_ms INTEGER NOT NULL, settled_minutes REAL NOT NULL DEFAULT 0,
                paid_coins INTEGER NOT NULL DEFAULT 0, paid_diamonds INTEGER NOT NULL DEFAULT 0,
                coin_offset INTEGER NOT NULL DEFAULT 0, diamond_offset INTEGER NOT NULL DEFAULT 0,
                first_completed INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS quest_legacy_windows (
                subject TEXT NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
                PRIMARY KEY(subject,start_ms,end_ms)
            );
            CREATE TABLE IF NOT EXISTS quest_deliveries (
                request_id TEXT PRIMARY KEY, subject TEXT NOT NULL, name TEXT NOT NULL,
                minutes REAL NOT NULL, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                submitted_ms INTEGER NOT NULL, total_minutes REAL NOT NULL,
                allocations TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS quest_delivery_subject ON quest_deliveries(subject,submitted_ms);
            CREATE TABLE IF NOT EXISTS quest_bonus_receipts (
                day TEXT NOT NULL, subject TEXT NOT NULL, request_id TEXT NOT NULL,
                minutes REAL NOT NULL, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                submitted_ms INTEGER NOT NULL, allocations TEXT NOT NULL,
                PRIMARY KEY(day,subject)
            );
            CREATE INDEX IF NOT EXISTS quest_bonus_request ON quest_bonus_receipts(request_id);
            CREATE INDEX IF NOT EXISTS quest_bonus_subject ON quest_bonus_receipts(subject,day);
            CREATE INDEX IF NOT EXISTS quest_allocation_end ON quest_allocations(end_ms,start_ms);
            CREATE TABLE IF NOT EXISTS wallet_ledger (
                reference TEXT PRIMARY KEY, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                created_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shop_purchases (
                item_id TEXT PRIMARY KEY, purchased_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shop_equipment (
                slot TEXT PRIMARY KEY, item_id TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shop_exchanges (
                request_id TEXT PRIMARY KEY, diamonds INTEGER NOT NULL,
                coins INTEGER NOT NULL, created_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_rows (
                source_key TEXT PRIMARY KEY, name TEXT NOT NULL, minutes REAL NOT NULL,
                start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, day TEXT NOT NULL,
                last_batch TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_links (
                source_key TEXT NOT NULL, record_id TEXT NOT NULL,
                PRIMARY KEY(source_key,record_id)
            );
            CREATE INDEX IF NOT EXISTS history_links_record ON history_links(record_id);
            CREATE TABLE IF NOT EXISTS history_overrides (
                record_id TEXT PRIMARY KEY, name TEXT NOT NULL, minutes REAL NOT NULL,
                start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, day TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_batches (
                batch_id TEXT PRIMARY KEY, filename TEXT NOT NULL, input_hash TEXT NOT NULL,
                imported_at TEXT NOT NULL, prefer_history INTEGER NOT NULL, receipt TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        # Upgrade old archives without changing record IDs or dropping history.
        with self.db:
            for item in SHOP_ITEMS.values():
                if not item["coins"] and not item["diamonds"]:
                    self.db.execute("INSERT OR IGNORE INTO shop_equipment VALUES (?,?)", (item["slot"], item["id"]))
            for row in self.db.execute("SELECT * FROM records").fetchall():
                # A confirmed history correction may change canonical times.
                # Existing source aliases still identify the original session.
                if self.db.execute("SELECT 1 FROM record_aliases WHERE source=? AND record_id=?",
                                   (row["source"], row["id"])).fetchone():
                    continue
                key = row["source_id"] if row["source"] == "calendar" else f'{row["source_id"]}:{row["start_ms"]}'
                self.db.execute("INSERT OR IGNORE INTO record_aliases VALUES (?,?,?)", (row["source"], key, row["id"]))
            self.db.execute("""INSERT OR IGNORE INTO source_presence(source,source_key)
                               SELECT source,source_key FROM record_aliases""")
        self._migrate_shop_v18()
        self._migrate_remove_npc_outfits()
        self._migrate_continuous_quests()
        self._initialize_timed_bonus()
        self.settings = json.loads(json.dumps(DEFAULT_SETTINGS))
        stored = self._meta("settings")
        if stored:
            self.settings = validate_settings(self.settings, json.loads(stored))
            # Materialize defaults once when opening an archive from version 1.
            if self.settings != json.loads(stored):
                with self.db:
                    self._set_meta("settings", json.dumps(self.settings, ensure_ascii=False, allow_nan=False))
        self.revision = int(self._meta("revision") or 0)
        # Repair duplicates saved by older versions even when either source is
        # currently unavailable. Original rows remain in the merge journal.
        with self.db:
            if self._reconcile_sources() + self._reconcile_history_sources():
                self._bump_revision()
        self.sync = {"connected": False, "sourcePath": str(self.source), "lastCheck": None,
                     "lastImport": self._meta("lastImport"), "error": None,
                     "importedCount": self._active_count(),
                     "pollSeconds": POLL_SECONDS}
        self.calendar_config = self.data_dir / "calendar-bridge-config.json"
        self.calendar_snapshot = self.data_dir / "calendar-bridge-snapshot.json"
        self.calendar_refresh_request = self.data_dir / "calendar-bridge-refresh.json"
        self.source_task_names = set()
        self.calendar_sync = {"enabled": False, "connected": False, "calendarName": None,
                              "lastCheck": None, "lastImport": self._meta("calendarLastImport"),
                              "snapshotAt": None, "error": None, "importedCount": 0,
                              "ignoredCount": 0, "pollSeconds": 30,
                              "pendingCount": 0, "pendingRecords": []}

    @contextmanager
    def _quest_transaction(self):
        """Serialize the check and write across threads AND SQLite connections."""
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield
                self.db.commit()
            except BaseException:
                self.db.rollback()
                raise

    def _wallet(self):
        row = self.db.execute("SELECT COALESCE(SUM(coins),0),COALESCE(SUM(diamonds),0) FROM wallet_ledger").fetchone()
        return {"coins": row[0], "diamonds": row[1]}

    def _migrate_shop_v18(self):
        """Refund only pre-upgrade purchases, never retroactively charge more.

        The migration marker is written even for an empty shop. New-price
        purchases therefore cannot be mistaken for old ones on later starts.
        Both per-item receipts and the completion marker commit atomically.
        """
        with self._quest_transaction():
            if self._meta(SHOP_PRICING_MIGRATION) is not None:
                return
            current = quest_clock()
            for item_id in LEGACY_SHOP_ITEM_IDS:
                row = self.db.execute("""SELECT SUM(l.coins) AS coins,SUM(l.diamonds) AS diamonds FROM shop_purchases p
                    JOIN wallet_ledger l ON l.reference IN ('purchase:'||p.item_id,'buy:'||p.item_id)
                    WHERE p.item_id=? GROUP BY p.item_id""", (item_id,)).fetchone()
                if row is None:
                    continue
                item = SHOP_ITEMS.get(item_id) or RETIRED_NPC_V18_PRICES[item_id]
                coins = max(max(-row["coins"], 0) - item["coins"], 0)
                diamonds = max(max(-row["diamonds"], 0) - item["diamonds"], 0)
                if coins or diamonds:
                    self.db.execute("INSERT OR IGNORE INTO wallet_ledger VALUES (?,?,?,?)",
                                    (f"pricing:v18:{item_id}", coins, diamonds, int(current.timestamp() * 1000)))
            self._set_meta(SHOP_PRICING_MIGRATION, current.isoformat())

    def _migrate_remove_npc_outfits(self):
        """Retire NPC clothing and refund its remaining actual purchase cost.

        Both the v1.8 refund and this retirement receipt remain in the ledger.
        Ownership rows stay for auditing, but no retired item is usable again.
        """
        with self._quest_transaction():
            if self._meta(SHOP_NPC_REMOVAL_MIGRATION) is not None:
                self.db.execute("DELETE FROM shop_equipment WHERE slot='npc'")
                return
            current = quest_clock()
            for item_id in RETIRED_NPC_ITEM_IDS:
                if not self.db.execute("SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone():
                    continue
                # Current archives use purchase:; accept the older buy: spelling
                # too. Price tags are deliberately not used to invent refunds.
                spending = self.db.execute("""SELECT COALESCE(SUM(MIN(coins,0)),0),
                    COALESCE(SUM(MIN(diamonds,0)),0) FROM wallet_ledger
                    WHERE reference IN (?,?)""", (f"purchase:{item_id}", f"buy:{item_id}")).fetchone()
                returned = self.db.execute("SELECT coins,diamonds FROM wallet_ledger WHERE reference=?",
                                           (f"pricing:v18:{item_id}",)).fetchone()
                coins = max(0, -spending[0] - (max(0, returned[0]) if returned else 0))
                diamonds = max(0, -spending[1] - (max(0, returned[1]) if returned else 0))
                if coins or diamonds:
                    self.db.execute("INSERT OR IGNORE INTO wallet_ledger VALUES (?,?,?,?)",
                        (f"retired:npc-outfit:{item_id}", coins, diamonds, int(current.timestamp() * 1000)))
            self.db.execute("DELETE FROM shop_equipment WHERE slot='npc'")
            self._set_meta(SHOP_NPC_REMOVAL_MIGRATION, current.isoformat())

    def _migrate_continuous_quests(self, now=None):
        """Keep old rewards immutable and carry only previously eligible study.

        Unclaimed old intervals remain eligible, including late-arriving source
        records. The continuous interval begins at upgrade time; unrelated study
        outside the old accepted windows does not become a retroactive reward.
        Reward offsets preserve fractional remainders without paying the old
        per-day rounding differences again during the migration.
        """
        with self._quest_transaction():
            if self._meta("continuous_quests_v1") is not None:
                return
            current = quest_clock(now)
            current_ms = int(current.timestamp() * 1000)
            for definition in QUEST_DEFINITIONS:
                subject = definition["subject"]
                acceptances = self.db.execute("SELECT * FROM quest_acceptances WHERE subject=? ORDER BY accepted_ms", (subject,)).fetchall()
                receipts = self.db.execute("SELECT * FROM quest_receipts WHERE subject=? ORDER BY submitted_ms", (subject,)).fetchall()
                if not acceptances and not receipts:
                    continue
                accepted_ms = min([row["accepted_ms"] for row in acceptances] + [row["submitted_ms"] for row in receipts])
                settled = round(sum(row["minutes"] for row in receipts), 8)
                coins = sum(row["coins"] for row in receipts)
                diamonds = sum(row["diamonds"] for row in receipts)
                coin_offset = math.floor(settled * 2 + 1e-8) - coins
                diamond_offset = math.floor(settled / definition["target"] + 1e-10) * 2 - diamonds
                self.db.execute("INSERT OR IGNORE INTO quest_tracks VALUES (?,?,?,?,?,?,?,?,?)",
                                (subject, accepted_ms, current_ms, settled, coins, diamonds,
                                 coin_offset, diamond_offset, int(bool(receipts))))
                for acceptance in acceptances:
                    # Old acceptances were dated in the server's local zone.
                    day_start = datetime.combine(parse_day(acceptance["day"]), datetime.min.time()).astimezone()
                    deadline = day_start + timedelta(hours=definition["deadlineHour"])
                    lower, upper = acceptance["lower_ms"], min(int(deadline.timestamp() * 1000), current_ms)
                    if upper > lower:
                        self.db.execute("INSERT OR IGNORE INTO quest_legacy_windows VALUES (?,?,?)", (subject, lower, upper))
            self._set_meta("continuous_quests_v1", current.isoformat())

    def _initialize_timed_bonus(self, now=None):
        with self._quest_transaction():
            if self._meta(TIMED_BONUS_START_META) is None:
                current = quest_clock(now)
                # Preserve today's accepted study at upgrade, but do not grant
                # bonuses retroactively for earlier days in the saved archive.
                midnight = datetime.combine(current.date(), datetime.min.time()).astimezone()
                self._set_meta(TIMED_BONUS_START_META, int(midnight.timestamp() * 1000))

    def _exchange_state(self, wallet):
        history = [{"diamonds": row["diamonds"], "coins": row["coins"], "createdAt": iso_ms(row["created_ms"])}
                   for row in self.db.execute("SELECT * FROM shop_exchanges ORDER BY created_ms DESC,rowid DESC LIMIT 10")]
        return {"coinsPerDiamond": EXCHANGE_COINS_PER_DIAMOND,
                "maxDiamonds": wallet["coins"] // EXCHANGE_COINS_PER_DIAMOND,
                "maxPerExchange": EXCHANGE_MAX_DIAMONDS, "history": history}

    def _quest_definition(self, subject):
        if not isinstance(subject, str) or subject not in SUBJECT_IDS:
            raise ValueError("请选择有效的委托科目")
        return next(item for item in QUEST_DEFINITIONS if item["subject"] == subject)

    def _quest_contributions(self, subject, lower_ms, upper_ms, now_ms):
        """Allocate only finished, active canonical records to unused time slices.

        A paused timer's effective minutes are distributed proportionally over
        its actual span, and cannot exceed that span. Persisting the intervals
        also prevents a later remapping from spending the same study twice.
        """
        if upper_ms <= lower_ms:
            return []
        merges = {row[0]: row[1] for row in self.db.execute("SELECT removed_id,canonical_id FROM record_merges")}
        def canonical(record_id):
            seen = set()
            while record_id in merges and record_id not in seen:
                seen.add(record_id)
                record_id = merges[record_id]
            return record_id
        allocated = {}
        for row in self.db.execute("SELECT record_id,start_ms,end_ms FROM quest_allocations WHERE end_ms>? AND start_ms<?",
                                   (lower_ms, upper_ms)):
            allocated.setdefault(canonical(row["record_id"]), []).append((row["start_ms"], row["end_ms"]))
        rows = self.db.execute("""SELECT r.* FROM records r WHERE r.end_ms<=? AND r.end_ms>?
            AND r.start_ms<? AND r.end_ms>r.start_ms AND NOT EXISTS
            (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""",
            (now_ms, lower_ms, upper_ms)).fetchall()
        contributions = []
        for row in rows:
            if classify(row["name"], self.settings["mapping"]) != subject:
                continue
            span = row["end_ms"] - row["start_ms"]
            valid_minutes = min(row["minutes"], span / 60_000)
            slices = [(max(lower_ms, row["start_ms"]), min(upper_ms, row["end_ms"], now_ms))]
            for used_start, used_end in allocated.get(row["id"], []):
                remainder = []
                for start, end in slices:
                    if used_end <= start or used_start >= end:
                        remainder.append((start, end))
                    else:
                        if start < used_start:
                            remainder.append((start, used_start))
                        if used_end < end:
                            remainder.append((used_end, end))
                slices = remainder
            for start, end in slices:
                if end > start:
                    contributions.append({"record_id": row["id"], "start_ms": start, "end_ms": end,
                                          "minutes": valid_minutes * (end - start) / span})
        return contributions

    def _continuous_contributions(self, subject, track, now_ms):
        if track is None:
            return []
        windows = [(track["continuous_ms"], now_ms)]
        windows.extend((row[0], min(row[1], now_ms)) for row in self.db.execute(
            "SELECT start_ms,end_ms FROM quest_legacy_windows WHERE subject=?", (subject,)))
        merged = []
        for start, end in sorted(windows):
            if end <= start:
                continue
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
            else:
                merged.append((start, end))
        return [item for start, end in merged
                for item in self._quest_contributions(subject, start, end, now_ms)]

    @staticmethod
    def _bonus_window(definition, day):
        # Convert each local wall-clock boundary separately, including on DST
        # transition days. No date or clock is accepted from the HTTP client.
        midnight = datetime.combine(parse_day(day), datetime.min.time())
        opens = (midnight + timedelta(hours=definition["openHour"])).astimezone()
        deadline = (midnight + timedelta(hours=definition["deadlineHour"])).astimezone()
        return opens, deadline

    def _bonus_evidence(self, subject, lower_ms, now_ms, pending):
        """Combine immutable settled ownership with currently unallocated study.

        Base rewards and bonus rewards have separate ledgers. A half-round that
        was delivered earlier must still qualify toward this day's first round.
        If old source identities were merged, the earliest settled allocation
        owns overlapping time; remapping cannot award a second subject's bonus.
        """
        if now_ms <= lower_ms:
            return []
        merges = {row[0]: row[1] for row in self.db.execute("SELECT removed_id,canonical_id FROM record_merges")}
        def canonical(record_id):
            seen = set()
            while record_id in merges and record_id not in seen:
                seen.add(record_id)
                record_id = merges[record_id]
            return record_id
        def subtract(slices, used):
            for used_start, used_end in used:
                remainder = []
                for start, end in slices:
                    if used_end <= start or used_start >= end:
                        remainder.append((start, end))
                    else:
                        if start < used_start:
                            remainder.append((start, used_start))
                        if used_end < end:
                            remainder.append((used_end, end))
                slices = remainder
            return slices
        occupied, evidence = {}, []
        for row in self.db.execute("""SELECT record_id,subject,start_ms,end_ms,minutes FROM quest_allocations
            WHERE end_ms>? AND start_ms<? ORDER BY rowid""", (lower_ms, now_ms)):
            span = row["end_ms"] - row["start_ms"]
            if span <= 0:
                continue
            record_id = canonical(row["record_id"])
            start, end = max(row["start_ms"], lower_ms), min(row["end_ms"], now_ms)
            used = occupied.setdefault(record_id, [])
            slices = subtract([(start, end)], used)
            used.extend(slices)
            if row["subject"] == subject:
                density = min(max(0, row["minutes"]), span / 60000) / span
                evidence.extend({"record_id": record_id, "start_ms": begin, "end_ms": finish,
                                 "minutes": density * (finish - begin), "source": "settled"}
                                for begin, finish in slices if finish > begin)
        for item in pending:
            start, end = max(item["start_ms"], lower_ms), min(item["end_ms"], now_ms)
            span = item["end_ms"] - item["start_ms"]
            if end <= start or span <= 0:
                continue
            record_id = canonical(item["record_id"])
            # Pending base contributions already exclude the global allocations;
            # applying the ownership mask again keeps this helper self-contained.
            slices = subtract([(start, end)], occupied.get(record_id, []))
            density = min(max(0, item["minutes"]), span / 60000) / span
            evidence.extend({"record_id": record_id, "start_ms": begin, "end_ms": finish,
                             "minutes": density * (finish - begin), "source": "pending"}
                            for begin, finish in slices if finish > begin)
        return evidence

    def _quest_bonus(self, definition, track, contributions, current):
        subject, today = definition["subject"], current.date().isoformat()
        feature_ms = int(self._meta(TIMED_BONUS_START_META))
        now_ms = int(current.timestamp() * 1000)
        lower_ms = max(feature_ms, track["accepted_ms"]) if track else feature_ms
        evidence = self._bonus_evidence(subject, lower_ms, now_ms, contributions) if track else []
        grouped = {}
        # Only dates touched by new eligible evidence are visited, rather than
        # querying every day since installation or scanning the year archive.
        for item in evidence:
            day = datetime.fromtimestamp(item["start_ms"] / 1000).astimezone().date()
            last = datetime.fromtimestamp((item["end_ms"] - 1) / 1000).astimezone().date()
            while day <= last:
                day_key = day.isoformat()
                opens, deadline = self._bonus_window(definition, day_key)
                start = max(item["start_ms"], lower_ms, int(opens.timestamp() * 1000))
                end = min(item["end_ms"], now_ms, int(deadline.timestamp() * 1000))
                if end > start:
                    minutes = item["minutes"] * (end - start) / (item["end_ms"] - item["start_ms"])
                    grouped.setdefault(day_key, []).append(dict(item, start_ms=start, end_ms=end, minutes=minutes))
                day += timedelta(days=1)
        claimed = {row["day"]: row for row in self.db.execute("SELECT * FROM quest_bonus_receipts WHERE subject=?", (subject,))}
        eligible = []
        for day_key, slices in sorted(grouped.items()):
            minutes = round(sum(item["minutes"] for item in slices), 8)
            if day_key in claimed or minutes + 1e-8 < definition["target"]:
                continue
            opens, deadline = self._bonus_window(definition, day_key)
            eligible.append({"day": day_key, "subject": subject, "minutes": minutes, "target": definition["target"],
                             "coins": definition["target"], "diamonds": 1,
                             "opensAt": opens.isoformat(), "deadline": deadline.isoformat(), "allocations": slices})
        opens, deadline = self._bonus_window(definition, today)
        receipt = claimed.get(today)
        minutes = receipt["minutes"] if receipt else round(sum(item["minutes"] for item in grouped.get(today, [])), 8)
        if receipt:
            status = "claimed"
        elif not track:
            status = "unaccepted"
        elif minutes + 1e-8 >= definition["target"]:
            status = "ready"
        elif current < opens:
            status = "upcoming"
        elif current >= deadline:
            status = "ended"
        else:
            status = "active"
        pending = [{key: value for key, value in item.items() if key != "allocations"} for item in eligible]
        result = {"enabled": True, "featureStartMs": feature_ms, "day": today, "period": definition["period"],
                  "windowLabel": "00:00–12:00" if definition["period"] == "morning" else "12:00–18:00",
                  "opensAt": opens.isoformat(), "deadline": deadline.isoformat(),
                  "eligibleFrom": iso_ms(max(lower_ms, int(opens.timestamp() * 1000))),
                  "target": definition["target"], "minutes": round(minutes, 4), "percent": percent(minutes, definition["target"]),
                  "status": status, "claimedAt": iso_ms(receipt["submitted_ms"]) if receipt else None,
                  "reward": {"coins": definition["target"], "diamonds": 1}, "pending": pending,
                  "pendingCount": len(pending), "pendingCoins": sum(item["coins"] for item in pending),
                  "pendingDiamonds": sum(item["diamonds"] for item in pending)}
        return result, eligible

    def _bonus_breakdown(self, request_id, coins, diamonds):
        bonuses = [{"day": row["day"], "subject": row["subject"], "minutes": round(row["minutes"], 4),
                    "target": self._quest_definition(row["subject"])["target"],
                    "coins": row["coins"], "diamonds": row["diamonds"]}
                   for row in self.db.execute("SELECT * FROM quest_bonus_receipts WHERE request_id=? ORDER BY day,subject", (request_id,))] if request_id else []
        bonus_reward = {"coins": sum(item["coins"] for item in bonuses), "diamonds": sum(item["diamonds"] for item in bonuses)}
        return {"baseReward": {"coins": coins - bonus_reward["coins"], "diamonds": diamonds - bonus_reward["diamonds"]},
                "bonusReward": bonus_reward, "bonuses": bonuses}

    def _quest_row(self, definition, current):
        subject = definition["subject"]
        track = self.db.execute("SELECT * FROM quest_tracks WHERE subject=?", (subject,)).fetchone()
        contributions = self._continuous_contributions(subject, track, int(current.timestamp() * 1000))
        minutes = round(sum(item["minutes"] for item in contributions), 8)
        settled = track["settled_minutes"] if track else 0
        paid_coins = track["paid_coins"] if track else 0
        paid_diamonds = track["paid_diamonds"] if track else 0
        coin_offset = track["coin_offset"] if track else 0
        diamond_offset = track["diamond_offset"] if track else 0
        total = round(settled + minutes, 8)
        reward = {"coins": max(0, math.floor(total * 2 + 1e-8) - coin_offset - paid_coins),
                  "diamonds": max(0, math.floor(total / definition["target"] + 1e-10) * 2 - diamond_offset - paid_diamonds)}
        first_completed = bool(track and track["first_completed"])
        base_ready = bool(track and minutes > 0 and reward["coins"] >= 1
                          and (first_completed or total + 1e-8 >= definition["target"]))
        bonus, _ = self._quest_bonus(definition, track, contributions, current)
        bonus_reward = {"coins": bonus["pendingCoins"], "diamonds": bonus["pendingDiamonds"]}
        base_reward = reward if base_ready or not bonus["pendingCount"] else {"coins": 0, "diamonds": 0}
        reward = {key: base_reward[key] + bonus_reward[key] for key in ("coins", "diamonds")}
        ready = base_ready or bool(bonus["pendingCount"])
        progress = max(0, total - (paid_diamonds + diamond_offset) / 2 * definition["target"])
        latest = self.db.execute("SELECT submitted_ms FROM quest_deliveries WHERE subject=? ORDER BY submitted_ms DESC,rowid DESC LIMIT 1", (subject,)).fetchone()
        if latest is None:
            latest = self.db.execute("SELECT submitted_ms FROM quest_receipts WHERE subject=? ORDER BY submitted_ms DESC LIMIT 1", (subject,)).fetchone()
        result = {"subject": subject, "name": definition["name"], "period": "anytime", "continuous": True,
                  "recommended": {"period": definition["period"], "label": "上午可优先安排" if definition["period"] == "morning" else "下午可优先安排", "bonus": True,
                                  "active": definition["openHour"] <= current.hour < definition["deadlineHour"]},
                  "target": definition["target"], "opensAt": None, "deadline": None, "submitDeadline": None,
                  "acceptedAt": iso_ms(track["accepted_ms"]) if track else None,
                  "submittedAt": iso_ms(latest[0]) if latest else None,
                  "lowerBound": "accepted", "eligibleFrom": iso_ms(track["accepted_ms"]) if track else None,
                  "status": "ready" if ready else "active" if track else "available",
                  "minutes": round(minutes, 4), "settledMinutes": round(settled, 4), "totalMinutes": round(total, 4),
                  "progressMinutes": round(progress, 4), "progressPercent": percent(progress, definition["target"]),
                  "percent": percent(progress, definition["target"]), "firstCompleted": first_completed,
                  "paidCoins": paid_coins, "paidDiamonds": paid_diamonds,
                  "reward": reward, "baseReward": {"coins": definition["target"] * 2, "diamonds": 2},
                  "baseReady": base_ready, "rewardBreakdown": {"base": base_reward, "bonus": bonus_reward}, "bonus": bonus}
        return result, contributions, minutes

    def quest_state(self, now=None):
        with self.lock:
            current = quest_clock(now)
            owned = {row[0] for row in self.db.execute("SELECT item_id FROM shop_purchases")}
            equipped = {row[0]: row[1] for row in self.db.execute("SELECT slot,item_id FROM shop_equipment WHERE slot<>'npc'")}
            catalog = [dict(item, currency="coins" if item["coins"] else "diamonds" if item["diamonds"] else "free",
                            category=SHOP_CATEGORIES[item["slot"]],
                            owned=item["id"] in owned or (item["coins"] == 0 and item["diamonds"] == 0),
                            equipped=equipped.get(item["slot"]) == item["id"]) for item in SHOP_ITEMS.values()]
            history = [{"day": row["day"] or datetime.fromtimestamp(row["submitted_ms"] / 1000).astimezone().date().isoformat(),
                        "requestId": row["request_id"], "subject": row["subject"], "name": row["name"],
                        "minutes": round(row["minutes"], 4), "coins": row["coins"], "diamonds": row["diamonds"],
                        "submittedAt": iso_ms(row["submitted_ms"]),
                        **self._bonus_breakdown(row["request_id"], row["coins"], row["diamonds"])}
                       for row in self.db.execute("""SELECT day,subject,name,minutes,coins,diamonds,submitted_ms,NULL AS request_id
                           FROM quest_receipts UNION ALL SELECT NULL,subject,name,minutes,coins,diamonds,submitted_ms,request_id
                           FROM quest_deliveries ORDER BY submitted_ms DESC,subject LIMIT 20""")]
            wallet = self._wallet()
            return {"day": current.date().isoformat(), "now": current.isoformat(), "wallet": wallet,
                    "quests": [self._quest_row(definition, current)[0] for definition in QUEST_DEFINITIONS],
                    "catalog": catalog, "equipped": equipped, "history": history, "exchange": self._exchange_state(wallet)}

    def accept_quest(self, subject, now=None):
        self._quest_definition(subject)
        with self._quest_transaction():
            current = quest_clock(now)
            accepted_ms = int(current.timestamp() * 1000)
            self.db.execute("INSERT OR IGNORE INTO quest_tracks(subject,accepted_ms,continuous_ms) VALUES (?,?,?)",
                            (subject, accepted_ms, accepted_ms))
            return self.quest_state(current)

    @staticmethod
    def _quest_request_id(value):
        if not isinstance(value, str) or len(value) != 36:
            raise ValueError("交付请求标识必须为 UUID 字符串")
        try:
            canonical = str(uuid.UUID(value))
        except (ValueError, AttributeError):
            raise ValueError("交付请求标识必须为 UUID 字符串") from None
        if value.lower() != canonical:
            raise ValueError("交付请求标识必须为 UUID 字符串")
        return canonical

    def _delivery_receipt(self, row, already_claimed):
        return {"requestId": row["request_id"], "day": datetime.fromtimestamp(row["submitted_ms"] / 1000).astimezone().date().isoformat(),
                "subject": row["subject"], "name": row["name"], "minutes": round(row["minutes"], 4),
                "coins": row["coins"], "diamonds": row["diamonds"], "totalMinutes": round(row["total_minutes"], 4),
                "submittedAt": iso_ms(row["submitted_ms"]), "alreadyClaimed": already_claimed,
                **self._bonus_breakdown(row["request_id"], row["coins"], row["diamonds"])}

    def submit_quest(self, subject, now=None, request_id=None):
        definition = self._quest_definition(subject)
        explicit_request = request_id is not None
        request_id = self._quest_request_id(request_id) if explicit_request else str(uuid.uuid4())
        with self._quest_transaction():
            current = quest_clock(now)
            existing = self.db.execute("SELECT * FROM quest_deliveries WHERE request_id=?", (request_id,)).fetchone()
            if existing is not None and existing["subject"] != subject:
                raise ValueError("同一个交付请求标识不能更改科目")
            if existing is None:
                row, contributions, minutes = self._quest_row(definition, current)
                if row["status"] != "ready":
                    # Python callers historically retried without an ID. HTTP
                    # always requires a stable UUID and never uses this fallback.
                    previous = self.db.execute("SELECT * FROM quest_deliveries WHERE subject=? ORDER BY submitted_ms DESC,rowid DESC LIMIT 1", (subject,)).fetchone()
                    if not explicit_request and minutes == 0 and previous:
                        result = self.quest_state(current)
                        result["receipt"] = self._delivery_receipt(previous, True)
                        return result
                    raise ValueError("首次交付需达到目标；之后有新增金币或已达标时段奖励即可交付")
                submitted_ms = int(current.timestamp() * 1000)
                track = self.db.execute("SELECT * FROM quest_tracks WHERE subject=?", (subject,)).fetchone()
                _, bonuses = self._quest_bonus(definition, track, contributions, current)
                base_reward = row["rewardBreakdown"]["base"] if row["baseReady"] else {"coins": 0, "diamonds": 0}
                if not row["baseReady"]:
                    minutes, contributions = 0, []
                total = round(track["settled_minutes"] + minutes, 8)
                reward = row["reward"]
                self.db.execute("INSERT INTO quest_deliveries VALUES (?,?,?,?,?,?,?,?,?)",
                    (request_id, subject, definition["name"], minutes, reward["coins"], reward["diamonds"], submitted_ms,
                     total, json.dumps(contributions, ensure_ascii=False, allow_nan=False)))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"quest-continuous:{request_id}", base_reward["coins"], base_reward["diamonds"], submitted_ms))
                self.db.executemany("INSERT INTO quest_allocations VALUES (?,?,?,?,?,?)",
                    [(current.date().isoformat(), subject, item["record_id"], item["start_ms"], item["end_ms"], item["minutes"])
                     for item in contributions])
                self.db.execute("""UPDATE quest_tracks SET settled_minutes=?,paid_coins=paid_coins+?,
                    paid_diamonds=paid_diamonds+?,first_completed=MAX(first_completed,?) WHERE subject=?""",
                    (total, base_reward["coins"], base_reward["diamonds"], int(row["baseReady"]), subject))
                for bonus in bonuses:
                    self.db.execute("INSERT INTO quest_bonus_receipts VALUES (?,?,?,?,?,?,?,?)",
                        (bonus["day"], subject, request_id, bonus["minutes"], bonus["coins"], bonus["diamonds"], submitted_ms,
                         json.dumps(bonus["allocations"], ensure_ascii=False, allow_nan=False)))
                    self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                        (f"quest-bonus:{bonus['day']}:{subject}", bonus["coins"], bonus["diamonds"], submitted_ms))
            result = self.quest_state(current)
            receipt = existing or self.db.execute("SELECT * FROM quest_deliveries WHERE request_id=?", (request_id,)).fetchone()
            result["receipt"] = self._delivery_receipt(receipt, existing is not None)
            return result

    def _shop_item(self, item_id):
        if not isinstance(item_id, str) or item_id not in SHOP_ITEMS:
            raise ValueError("商品不存在")
        return SHOP_ITEMS[item_id]

    def buy_item(self, item_id, now=None):
        item = self._shop_item(item_id)
        with self._quest_transaction():
            current = quest_clock(now)
            already_owned = (item["coins"] == 0 and item["diamonds"] == 0) or self.db.execute(
                "SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone() is not None
            if not already_owned:
                wallet = self._wallet()
                if wallet["coins"] < item["coins"] or wallet["diamonds"] < item["diamonds"]:
                    raise ValueError("金币或钻石不足，完成并提交委托后再来看看")
                purchased_ms = int(current.timestamp() * 1000)
                self.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (item_id, purchased_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"purchase:{item_id}", -item["coins"], -item["diamonds"], purchased_ms))
            result = self.quest_state(current)
            result["receipt"] = {"itemId": item_id, "alreadyOwned": already_owned,
                                 "coins": 0 if already_owned else item["coins"],
                                 "diamonds": 0 if already_owned else item["diamonds"]}
            return result

    def equip_item(self, item_id, now=None):
        item = self._shop_item(item_id)
        with self._quest_transaction():
            current = quest_clock(now)
            owned = (item["coins"] == 0 and item["diamonds"] == 0) or self.db.execute(
                "SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone() is not None
            if not owned:
                raise ValueError("请先购买这件装扮")
            self.db.execute("INSERT INTO shop_equipment VALUES (?,?) ON CONFLICT(slot) DO UPDATE SET item_id=excluded.item_id",
                            (item["slot"], item_id))
            return self.quest_state(current)

    def exchange_diamonds(self, diamonds, request_id, now=None):
        if type(diamonds) is not int or not 1 <= diamonds <= EXCHANGE_MAX_DIAMONDS:
            raise ValueError("兑换钻石数量必须为 1 至 1000 的整数")
        if not isinstance(request_id, str) or len(request_id) != 36:
            raise ValueError("兑换请求标识必须为 UUID 字符串")
        try:
            canonical_id = str(uuid.UUID(request_id))
        except (ValueError, AttributeError):
            raise ValueError("兑换请求标识必须为 UUID 字符串") from None
        if request_id.lower() != canonical_id:
            raise ValueError("兑换请求标识必须为 UUID 字符串")
        with self._quest_transaction():
            current = quest_clock(now)
            existing = self.db.execute("SELECT * FROM shop_exchanges WHERE request_id=?", (canonical_id,)).fetchone()
            if existing is not None:
                if existing["diamonds"] != diamonds:
                    raise ValueError("同一个兑换请求标识不能更改钻石数量")
                coins, created_ms = existing["coins"], existing["created_ms"]
            else:
                coins = diamonds * EXCHANGE_COINS_PER_DIAMOND
                if self._wallet()["coins"] < coins:
                    raise ValueError("金币不足，无法完成这次兑换")
                created_ms = int(current.timestamp() * 1000)
                self.db.execute("INSERT INTO shop_exchanges VALUES (?,?,?,?)", (canonical_id, diamonds, coins, created_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"exchange:{canonical_id}", -coins, diamonds, created_ms))
            result = self.quest_state(current)
            result["receipt"] = {"requestId": canonical_id, "diamonds": diamonds, "coins": coins,
                                 "createdAt": iso_ms(created_ms), "alreadyExchanged": existing is not None}
            return result

    def _meta(self, key):
        item = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return item[0] if item else None

    def _set_meta(self, key, value):
        self.db.execute("INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))

    def _bump_revision(self):
        self.revision += 1
        self._set_meta("revision", self.revision)

    def _opening_state(self, current):
        day = current.date().isoformat()
        row = self.db.execute("""SELECT COALESCE(SUM(r.minutes),0) AS minutes,
            EXISTS(SELECT 1 FROM daily_openings WHERE day=?) AS seen
            FROM records r WHERE r.day=? AND NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""",
            (day, day)).fetchone()
        return {"day": day, "now": current.isoformat(), "minutes": round(row["minutes"], 4),
                "target": sum(self.settings["targets"].values()), "seen": bool(row["seen"])}

    def opening(self, now=None):
        """Read today's greeting context without consuming its first opening."""
        with self.lock:
            current = now or datetime.now().astimezone()
            if current.tzinfo is None or current.utcoffset() is None:
                raise ValueError("开场时间必须包含时区")
            return self._opening_state(current)

    def claim_opening(self, now=None):
        """Atomically show one daily opening, independently of record revision."""
        with self.lock, self.db:
            current = now or datetime.now().astimezone()
            if current.tzinfo is None or current.utcoffset() is None:
                raise ValueError("开场时间必须包含时区")
            claimed = self.db.execute("INSERT OR IGNORE INTO daily_openings(day,shown_at) VALUES (?,?)",
                                      (current.date().isoformat(), current.isoformat())).rowcount == 1
            return dict(self._opening_state(current), show=claimed)

    def _active_count(self, source=None):
        sql = """SELECT COUNT(*) FROM records r WHERE NOT EXISTS
                 (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)"""
        if source:
            sql += " AND EXISTS (SELECT 1 FROM record_aliases a WHERE a.record_id=r.id AND a.source=?)"
        return self.db.execute(sql, (source,) if source else ()).fetchone()[0]

    def _history_canonical_id(self, record_id):
        if not isinstance(record_id, str) or not record_id or len(record_id) > 5000:
            raise ValueError("历史匹配记录标识无效")
        visited = set()
        while record_id not in visited:
            visited.add(record_id)
            redirect = self.db.execute("SELECT canonical_id FROM record_merges WHERE removed_id=?", (record_id,)).fetchone()
            if not redirect:
                break
            record_id = redirect[0]
        if not self.db.execute("SELECT 1 FROM records WHERE id=?", (record_id,)).fetchone():
            raise ValueError("历史匹配指向不存在的记录")
        return record_id

    def _history_redirect(self, removed_id, survivor_id):
        self.db.execute("""INSERT OR IGNORE INTO history_links(source_key,record_id)
            SELECT source_key,? FROM history_links WHERE record_id=?""", (survivor_id, removed_id))
        self.db.execute("DELETE FROM history_links WHERE record_id=?", (removed_id,))
        removed = self.db.execute("SELECT * FROM history_overrides WHERE record_id=?", (removed_id,)).fetchone()
        if removed:
            self.db.execute("INSERT OR IGNORE INTO history_overrides VALUES (?,?,?,?,?,?)",
                            (survivor_id,) + tuple(removed[field] for field in HISTORY_FIELDS))
            self.db.execute("DELETE FROM history_overrides WHERE record_id=?", (removed_id,))

    def _history_overlay(self, record):
        override = self.db.execute("SELECT * FROM history_overrides WHERE record_id=?", (record[0],)).fetchone()
        if not override:
            return record
        existing = self.db.execute("SELECT * FROM records WHERE id=?", (record[0],)).fetchone()
        # Keep provenance stable; aliases retain each live source's true keys.
        source_id, source = (existing["source_id"], existing["source"]) if existing else (record[1], record[7])
        return (record[0], source_id, override["name"], override["minutes"],
                override["start_ms"], override["end_ms"], override["day"], source)

    def _set_history_override(self, record_id, fields):
        values = tuple(fields[field] for field in HISTORY_FIELDS)
        self.db.execute("""INSERT INTO history_overrides VALUES (?,?,?,?,?,?)
            ON CONFLICT(record_id) DO UPDATE SET name=excluded.name,minutes=excluded.minutes,
            start_ms=excluded.start_ms,end_ms=excluded.end_ms,day=excluded.day""", (record_id,) + values)
        self.db.execute("UPDATE records SET name=?,minutes=?,start_ms=?,end_ms=?,day=? WHERE id=?", values + (record_id,))

    def _history_has_allocations(self, record_ids):
        record_ids = set(record_ids)
        for row in self.db.execute("SELECT DISTINCT record_id FROM quest_allocations"):
            try:
                if self._history_canonical_id(row[0]) in record_ids:
                    return True
            except ValueError:
                # An orphaned allocation cannot safely establish a new match.
                if row[0] in record_ids:
                    return True
        return False

    def _merge_history_records(self, record_ids, authority=None, *, preserve_override=True):
        """Merge reviewed copies, retaining the oldest identity and all tombstones."""
        ids = sorted({self._history_canonical_id(record_id) for record_id in record_ids})
        if len(ids) == 1:
            return ids[0], 0
        if self._history_has_allocations(ids):
            raise ValueError("待合并记录已有委托结算分配，不能自动合并")
        marks = ",".join("?" for _ in ids)
        rows = self.db.execute(f"SELECT rowid AS arrival_order,* FROM records WHERE id IN ({marks}) ORDER BY rowid", ids).fetchall()
        lifecycle = self.db.execute(f"SELECT * FROM record_lifecycle WHERE record_id IN ({marks})", ids).fetchall()
        manual = [row for row in lifecycle if row["manual_action"] in ("delete", "keep")]
        if len({row["manual_action"] for row in manual}) > 1:
            raise ValueError("待合并记录存在人工删除与保留冲突")
        deleted = [row for row in lifecycle if row["deleted_at"] is not None]
        if deleted and any(row["manual_action"] == "keep" for row in manual):
            raise ValueError("待合并记录的删除状态与人工保留冲突")
        survivor = rows[0]
        if authority is None:
            authority = dict(survivor)
        old_overrides = self.db.execute(f"SELECT * FROM history_overrides WHERE record_id IN ({marks})", ids).fetchall()
        journal = json.dumps({"records": [dict(row) for row in rows], "lifecycle": [dict(row) for row in lifecycle],
                              "history_overrides": [dict(row) for row in old_overrides]}, ensure_ascii=False, allow_nan=False)
        for removed in rows[1:]:
            self.db.execute("INSERT INTO record_merges VALUES (?,?,?,?)", (removed["id"], survivor["id"], now_iso(), journal))
            self.db.execute("UPDATE record_aliases SET record_id=? WHERE record_id=?", (survivor["id"], removed["id"]))
            self._history_redirect(removed["id"], survivor["id"])
            self.db.execute("DELETE FROM records WHERE id=?", (removed["id"],))
        self.db.execute(f"DELETE FROM record_lifecycle WHERE record_id IN ({marks})", ids)
        if deleted:
            selected = next((row for row in deleted if row["manual_action"] == "delete"), deleted[0])
            self.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)",
                            (survivor["id"], selected["deleted_at"], selected["reason"], selected["manual_action"]))
        elif manual:
            self.db.execute("INSERT INTO record_lifecycle VALUES (?,NULL,NULL,?)", (survivor["id"], manual[0]["manual_action"]))
        if preserve_override:
            self._set_history_override(survivor["id"], authority)
        else:
            self.db.execute("UPDATE records SET name=?,minutes=?,start_ms=?,end_ms=?,day=? WHERE id=?",
                            tuple(authority[field] for field in HISTORY_FIELDS) + (survivor["id"],))
        return survivor["id"], len(rows) - 1

    @staticmethod
    def _validated_history_rows(records):
        if not isinstance(records, (list, tuple)) or len(records) > 100_000:
            raise ValueError("历史记录列表无效")
        normalized, keys = [], set()
        for row in records:
            if not isinstance(row, dict):
                raise ValueError("历史记录字段无效")
            name, key = row.get("name"), row.get("source_key")
            if not isinstance(name, str) or not name.strip() or len(name) > 500:
                raise ValueError("历史任务名称无效")
            if not isinstance(key, str) or not key or len(key) > 5000 or key in keys:
                raise ValueError("历史记录 source_key 无效或重复")
            minutes = finite_number(row.get("minutes"), minimum=0, maximum=525600)
            if minutes <= 0:
                raise ValueError("历史学习分钟必须大于零")
            times = {}
            for field in ("start_ms", "end_ms"):
                value = finite_number(row.get(field), minimum=1, maximum=32503680000000)
                if int(value) != value:
                    raise ValueError("历史时间必须为整数毫秒")
                times[field] = int(value)
                iso_ms(times[field])
            if times["end_ms"] < times["start_ms"]:
                raise ValueError("历史结束时间不能早于开始时间")
            day = parse_day(row.get("day")).isoformat()
            normalized.append(dict(source_key=key, name=name.strip(), minutes=float(minutes), day=day, **times))
            keys.add(key)
        return normalized

    def import_history(self, records, resolutions, batch_id, filename, prefer_history=False):
        """Import a reviewed, normalized spreadsheet batch without reading it.

        Exact history links take precedence over resolutions and conservative
        mutually-unique minute-bucket matches. Evidence attached to an existing
        live record is deliberately not an additional source-presence vote.
        """
        rows = self._validated_history_rows(records)
        if not isinstance(resolutions, dict) or set(resolutions) - {row["source_key"] for row in rows}:
            raise ValueError("历史匹配清单无效")
        for key, ids in resolutions.items():
            if not isinstance(ids, (list, tuple)) or not ids or any(not isinstance(value, str) or not value for value in ids):
                raise ValueError("历史匹配必须列出有效记录标识")
        if type(prefer_history) is not bool:
            raise ValueError("历史优先策略必须为布尔值")
        if not isinstance(batch_id, str) or not batch_id or len(batch_id) > 500:
            raise ValueError("历史批次标识无效")
        if not isinstance(filename, str) or not filename or len(filename) > 1000:
            raise ValueError("历史文件名无效")
        payload = {"records": sorted(rows, key=lambda row: row["source_key"]),
                   "resolutions": {key: sorted(set(ids)) for key, ids in sorted(resolutions.items())},
                   "filename": filename, "prefer_history": prefer_history}
        digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
        with self._quest_transaction():
            previous = self.db.execute("SELECT * FROM history_batches WHERE batch_id=?", (batch_id,)).fetchone()
            if previous:
                if previous["input_hash"] != digest:
                    raise ValueError("同一历史批次不能更改导入内容或策略")
                return dict(json.loads(previous["receipt"]), alreadyImported=True)
            before_minutes = self.db.execute("""SELECT COALESCE(SUM(r.minutes),0) FROM records r WHERE NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""").fetchone()[0]
            existing = [dict(row) for row in self.db.execute("SELECT * FROM records")]
            bucket_index = {}
            for item in existing:
                bucket_index.setdefault((item["name"], item["start_ms"] // 60000, item["end_ms"] // 60000), []).append(item["id"])
            targets, used, unassigned = {}, {}, []
            for row in rows:
                key = row["source_key"]
                linked = [item[0] for item in self.db.execute("SELECT record_id FROM history_links WHERE source_key=?", (key,))]
                selected = sorted({self._history_canonical_id(value) for value in (linked or resolutions.get(key, []))})
                if linked and key in resolutions and set(selected) != {self._history_canonical_id(value) for value in resolutions[key]}:
                    raise ValueError("已导入历史的匹配关系与新清单冲突")
                if selected:
                    targets[key] = selected
                    for record_id in selected:
                        if record_id in used and used[record_id] != key:
                            raise ValueError("多条历史记录匹配到同一旧记录，请先核对")
                        used[record_id] = key
                else:
                    unassigned.append(row)
            candidates, reverse = {}, {}
            for row in unassigned:
                key = row["source_key"]
                matches = bucket_index.get((row["name"], row["start_ms"] // 60000, row["end_ms"] // 60000), [])
                candidates[key] = matches
                for record_id in matches:
                    reverse.setdefault(record_id, []).append(key)
            for row in unassigned:
                key, matches = row["source_key"], candidates[row["source_key"]]
                if matches and (len(matches) != 1 or len(reverse[matches[0]]) != 1 or matches[0] in used):
                    raise ValueError("历史自动匹配存在歧义，请提供明确匹配清单")
                targets[key] = matches
                if matches:
                    used[matches[0]] = key
            receipt = {"batchId": batch_id, "filename": filename, "preferHistory": prefer_history,
                       "rows": len(rows), "added": 0, "matched": 0, "revised": 0, "merged": 0,
                       "ignoredDeleted": 0, "alreadyImported": False, "beforeMinutes": round(before_minutes, 8)}
            for row in rows:
                key, ids = row["source_key"], targets[row["source_key"]]
                self.db.execute("""INSERT INTO history_rows VALUES (?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET
                    name=excluded.name,minutes=excluded.minutes,start_ms=excluded.start_ms,end_ms=excluded.end_ms,
                    day=excluded.day,last_batch=excluded.last_batch""",
                    (key,) + tuple(row[field] for field in HISTORY_FIELDS) + (batch_id,))
                if not ids:
                    identity = HISTORY_SOURCE + ":" + hashlib.sha256(key.encode()).hexdigest()
                    record_id = f"{identity}:{row['start_ms']}"
                    self._upsert_record((record_id, identity, row["name"], row["minutes"], row["start_ms"], row["end_ms"], row["day"], HISTORY_SOURCE))
                    ids = [record_id]
                    receipt["added"] += 1
                else:
                    receipt["matched"] += 1
                    marks = ",".join("?" for _ in ids)
                    deleted = self.db.execute(f"SELECT 1 FROM record_lifecycle WHERE record_id IN ({marks}) AND deleted_at IS NOT NULL LIMIT 1", ids).fetchone()
                    if deleted:
                        receipt["ignoredDeleted"] += 1
                    elif prefer_history:
                        originals = self.db.execute(f"SELECT rowid AS arrival_order,* FROM records WHERE id IN ({marks}) ORDER BY rowid", ids).fetchall()
                        fields = dict(row)
                        # Preserve sub-minute precision only when a single old
                        # session is in exactly the spreadsheet's minute bucket.
                        if len(originals) == 1:
                            for field in ("start_ms", "end_ms"):
                                if originals[0][field] // 60000 == row[field] // 60000:
                                    fields[field] = originals[0][field]
                        changed = len(originals) > 1 or any(originals[0][field] != fields[field] for field in HISTORY_FIELDS)
                        if len(ids) > 1:
                            survivor, merged = self._merge_history_records(ids, fields)
                            ids = [survivor]
                            receipt["merged"] += merged
                        else:
                            self._set_history_override(ids[0], fields)
                        receipt["revised"] += int(changed)
                for record_id in ids:
                    self.db.execute("INSERT OR IGNORE INTO history_links VALUES (?,?)", (key, record_id))
            after_minutes = self.db.execute("""SELECT COALESCE(SUM(r.minutes),0) FROM records r WHERE NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""").fetchone()[0]
            receipt.update(afterMinutes=round(after_minutes, 8), minuteDelta=round(after_minutes - before_minutes, 8), importedAt=now_iso())
            self.db.execute("INSERT INTO history_batches VALUES (?,?,?,?,?,?)",
                            (batch_id, filename, digest, receipt["importedAt"], int(prefer_history), json.dumps(receipt, ensure_ascii=False, allow_nan=False)))
            self._bump_revision()
            return receipt

    def _reconcile_history_sources(self):
        """Join new live echoes only when history-minute candidates are unique."""
        # Keep live timestamps bare so records_match(source,name,start_ms)
        # supports range probes instead of a full records x history scan.
        pairs = {tuple(row) for row in self.db.execute("""SELECT DISTINCT l.record_id,r.id
            FROM history_rows h JOIN history_links l USING(source_key)
            JOIN records r INDEXED BY records_match ON r.source IN ('tomatodo','calendar') AND r.name=h.name
                AND r.start_ms BETWEEN (h.start_ms/60000)*60000 AND (h.start_ms/60000)*60000+59999
                AND r.end_ms BETWEEN (h.end_ms/60000)*60000 AND (h.end_ms/60000)*60000+59999
            WHERE r.id<>l.record_id AND (r.source='calendar' OR ABS(r.minutes-h.minutes)<=0.00000001)
                AND NOT EXISTS (SELECT 1 FROM history_links already WHERE already.record_id=r.id)
                AND NOT EXISTS (SELECT 1 FROM history_links other
                                WHERE other.source_key=h.source_key AND other.record_id<>l.record_id)""")}
        candidates = {}
        for old, incoming in pairs:
            candidates.setdefault(old, set()).add(incoming)
            candidates.setdefault(incoming, set()).add(old)
        changed = 0
        for old, incoming in sorted(pairs):
            if len(candidates[old]) != 1 or len(candidates[incoming]) != 1:
                continue
            original = self.db.execute("SELECT * FROM records WHERE id=?", (old,)).fetchone()
            if not original or not self.db.execute("SELECT 1 FROM records WHERE id=?", (incoming,)).fetchone():
                continue
            override = self.db.execute("SELECT 1 FROM history_overrides WHERE record_id=?", (old,)).fetchone()
            try:
                survivor, count = self._merge_history_records([old, incoming], dict(original),
                    preserve_override=original["source"] == HISTORY_SOURCE or bool(override))
                # A history-only archive needs a durable presence vote. Once
                # a live source confirms the same session, its aliases take
                # over deletion tracking, including later desktop/phone trash.
                self.db.execute("""UPDATE source_presence SET active=0,missing_count=0
                    WHERE source=? AND source_key IN
                        (SELECT source_key FROM record_aliases WHERE source=? AND record_id=?)""",
                    (HISTORY_SOURCE, HISTORY_SOURCE, survivor))
                changed += count
            except ValueError:
                # Conflicting explicit lifecycle choices or settled intervals
                # remain separate for a reviewed resolution, never a guess.
                continue
        return changed

    def _reset_missing(self, source):
        self.db.execute("UPDATE source_presence SET missing_count=0 WHERE source=? AND missing_count<>0", (source,))

    def _observe_source(self, source, seen, token, eligible=lambda row: True):
        """Two healthy observations confirm absence; each source has its own vote."""
        rows = self.db.execute("""SELECT a.source_key,a.record_id,r.name,r.start_ms,r.end_ms,
                p.active,p.missing_count,p.last_snapshot FROM record_aliases a
                JOIN records r ON r.id=a.record_id
                JOIN source_presence p ON p.source=a.source AND p.source_key=a.source_key
                WHERE a.source=?""", (source,)).fetchall()
        for row in rows:
            # Calendar timestamps are monotonically increasing; rereading the
            # same cached file or an older replay is not a new observation.
            if row["last_snapshot"] == token or (source == "calendar" and row["last_snapshot"] is not None
                                                  and int(token) <= int(row["last_snapshot"])):
                continue
            if row["source_key"] in seen:
                self.db.execute("""UPDATE source_presence SET active=1,missing_count=0,last_snapshot=?
                                   WHERE source=? AND source_key=?""", (token, source, row["source_key"]))
            elif eligible(row):
                missing = min(2, row["missing_count"] + 1)
                self.db.execute("""UPDATE source_presence SET active=?,missing_count=?,last_snapshot=?
                                   WHERE source=? AND source_key=?""",
                                (0 if missing >= 2 else row["active"], missing, token, source, row["source_key"]))
            else:
                self.db.execute("""UPDATE source_presence SET missing_count=0,last_snapshot=?
                                   WHERE source=? AND source_key=?""", (token, source, row["source_key"]))
        changed = 0
        rows = self.db.execute("""SELECT r.id,l.deleted_at,l.manual_action,
                EXISTS(SELECT 1 FROM record_aliases a JOIN source_presence p
                  ON a.source=p.source AND a.source_key=p.source_key
                  WHERE a.record_id=r.id AND p.active=1) AS source_active
                FROM records r LEFT JOIN record_lifecycle l ON l.record_id=r.id""").fetchall()
        for row in rows:
            if row["manual_action"] in ("delete", "keep"):
                continue
            deleted = not row["source_active"]
            if deleted != bool(row["deleted_at"]):
                self.db.execute("""INSERT INTO record_lifecycle VALUES (?,?,?,NULL)
                    ON CONFLICT(record_id) DO UPDATE SET deleted_at=excluded.deleted_at,reason=excluded.reason""",
                    (row["id"], now_iso() if deleted else None, "source_missing" if deleted else None))
                changed += 1
        return changed

    def close(self):
        with self.lock:
            self.db.close()

    def _read_source(self):
        last_error = None
        for attempt in range(3):
            try:
                before = self.source.stat()
                with self.source.open("r", encoding="utf-8-sig") as handle:
                    document = json.load(handle, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("JSON 数字无效")))
                after = self.source.stat()
                if (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
                    raise ValueError("源文件正在更新，请稍后重试")
                if not isinstance(document, dict) or not isinstance(document.get("PCRecord"), list):
                    raise ValueError("未找到番茄 ToDo 的 PCRecord 记录数组")
                templates = document.get("PCToDo", [])
                if isinstance(templates, list):
                    self.source_task_names = {item["name"].strip() for item in templates
                                              if isinstance(item, dict) and isinstance(item.get("name"), str)
                                              and 0 < len(item["name"].strip()) <= 500}
                return document["PCRecord"]
            except (OSError, ValueError, UnicodeError) as error:
                last_error = error
                if attempt < 2:
                    time.sleep(0.03)
        raise last_error

    def _upsert_record(self, record):
        """Update exact source identities; fuzzy matching happens after the batch."""
        source, source_key = record[7], record[1] if record[7] == "calendar" else record[0]
        alias = self.db.execute("SELECT record_id FROM record_aliases WHERE source=? AND source_key=?",
                                (source, source_key)).fetchone()
        record_id = alias[0] if alias else record[0]
        previous = self.db.execute("SELECT * FROM records WHERE id=?", (record_id,)).fetchone()
        self.db.execute("INSERT OR IGNORE INTO record_aliases VALUES (?,?,?)", (source, source_key, record_id))
        self.db.execute("INSERT OR IGNORE INTO source_presence(source,source_key) VALUES (?,?)", (source, source_key))
        # A matching desktop record includes Tomato's measured focus minutes,
        # which are more authoritative than a calendar event's elapsed span.
        if previous is not None and source == "calendar" and previous["source"] in ("tomatodo", HISTORY_SOURCE):
            return 0
        record = self._history_overlay((record_id,) + record[1:])
        if previous is not None and tuple(previous) == record:
            return 0
        self.db.execute("""INSERT INTO records VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,
            name=excluded.name, minutes=excluded.minutes, start_ms=excluded.start_ms,
            end_ms=excluded.end_ms, day=excluded.day, source=excluded.source""", record)
        return 1

    def _upsert_records(self, records):
        # Compare the committed result, not intermediate inserts, so a calendar
        # echo is neither a new reward nor a revision on every repeated poll.
        query = """SELECT r.*,l.deleted_at,l.reason,l.manual_action FROM records r
                   LEFT JOIN record_lifecycle l ON l.record_id=r.id"""
        before = {row[0]: tuple(row) for row in self.db.execute(query)}
        for record in records:
            self._upsert_record(record)
        self._reconcile_sources()
        self._reconcile_history_sources()
        after = {row[0]: tuple(row) for row in self.db.execute(query)}
        return sum(before.get(key) != after.get(key) for key in before.keys() | after.keys())

    def _reconcile_sources(self):
        """Match only mutually unique cross-source sessions, preserving first ID.

        Calendar elapsed seconds are not measured focus minutes: pauses and
        Tomato's whole-minute precision make duration equality inappropriate.
        Both endpoints must still agree within five seconds and overlap.
        Build all candidates before merging to avoid order-dependent guesses.
        """
        pairs = self.db.execute("""SELECT d.id AS desktop_id,c.id AS calendar_id
            FROM records d JOIN records c ON c.source='calendar' AND c.name=d.name
                AND c.start_ms BETWEEN d.start_ms-5000 AND d.start_ms+5000
                AND ABS(c.end_ms-d.end_ms)<=5000
                AND MAX(c.start_ms,d.start_ms)<MIN(c.end_ms,d.end_ms)
            WHERE d.source='tomatodo'
                AND NOT EXISTS (SELECT 1 FROM record_aliases a
                    WHERE a.record_id=d.id AND a.source='calendar')
                AND NOT EXISTS (SELECT 1 FROM record_aliases a
                    WHERE a.record_id=c.id AND a.source='tomatodo')""").fetchall()
        candidates = {}
        for pair in pairs:
            desktop_id, calendar_id = pair
            candidates.setdefault(desktop_id, []).append(calendar_id)
            candidates.setdefault(calendar_id, []).append(desktop_id)
        merged = 0
        for desktop_id, calendar_id in pairs:
            if len(candidates[desktop_id]) != 1 or len(candidates[calendar_id]) != 1:
                continue
            rows = self.db.execute("SELECT rowid AS arrival_order,* FROM records WHERE id IN (?,?) ORDER BY rowid",
                                   (desktop_id, calendar_id)).fetchall()
            lifecycle = self.db.execute("SELECT * FROM record_lifecycle WHERE record_id IN (?,?)",
                                        (desktop_id, calendar_id)).fetchall()
            manual = [row for row in lifecycle if row['manual_action'] in ('delete', 'keep')]
            if len({row['manual_action'] for row in manual}) > 1:
                # Conflicting explicit actions need a human choice, not a guess.
                continue
            overrides = self.db.execute("SELECT * FROM history_overrides WHERE record_id IN (?,?)",
                                        (desktop_id, calendar_id)).fetchall()
            if len({tuple(row[field] for field in HISTORY_FIELDS) for row in overrides}) > 1:
                continue
            survivor, removed = rows
            desktop = next(row for row in rows if row['source'] == 'tomatodo')
            journal = json.dumps({'records': [dict(row) for row in rows],
                                  'lifecycle': [dict(row) for row in lifecycle]}, ensure_ascii=False)
            self.db.execute("INSERT INTO record_merges VALUES (?,?,?,?)",
                            (removed['id'], survivor['id'], now_iso(), journal))
            self.db.execute("UPDATE record_aliases SET record_id=? WHERE record_id=?",
                            (survivor['id'], removed['id']))
            self._history_redirect(removed['id'], survivor['id'])
            # Keep source_presence unchanged: each source retains its own
            # confirmed presence/absence and last-observed snapshot.
            active = self.db.execute("""SELECT 1 FROM record_aliases a JOIN source_presence p
                ON a.source=p.source AND a.source_key=p.source_key
                WHERE a.record_id=? AND p.active=1 LIMIT 1""", (survivor['id'],)).fetchone()
            if manual:
                deleted_at, reason, action = (manual[0][key] for key in ('deleted_at', 'reason', 'manual_action'))
            else:
                deleted_at = None if active else next((row['deleted_at'] for row in lifecycle if row['deleted_at']), now_iso())
                reason, action = ('source_missing' if deleted_at else None), None
            self.db.execute("DELETE FROM record_lifecycle WHERE record_id IN (?,?)", (desktop_id, calendar_id))
            self.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (survivor['id'], deleted_at, reason, action))
            self.db.execute("UPDATE records SET source_id=?,name=?,minutes=?,start_ms=?,end_ms=?,day=?,source=? WHERE id=?",
                            tuple(desktop[key] for key in ('source_id', 'name', 'minutes', 'start_ms', 'end_ms', 'day', 'source'))
                            + (survivor['id'],))
            self.db.execute("DELETE FROM records WHERE id=?", (removed['id'],))
            override = self.db.execute("SELECT * FROM history_overrides WHERE record_id=?", (survivor['id'],)).fetchone()
            if override:
                self._set_history_override(survivor['id'], override)
            merged += 1
        return merged

    def import_source(self):
        with self.lock:
            self.sync["lastCheck"] = now_iso()
            try:
                source_records = self._read_source()
                records = [normalized for item in source_records if (normalized := normalize_record(item))]
                changed = 0
                with self.db:
                    changed += self._upsert_records(records)
                    # Zero-minute/incomplete source rows still prove presence.
                    # Any unidentifiable row makes absence detection unsafe.
                    seen = set()
                    healthy = True
                    for item in source_records:
                        try:
                            rid = item["id"]
                            if isinstance(rid, bool) or not isinstance(rid, (str, int)) or not str(rid):
                                raise ValueError("记录标识无效")
                            start = int(finite_number(item["startDate"], minimum=1, maximum=32503680000000))
                            finite_number(item["createDate"], minimum=1, maximum=32503680000000)
                            finite_number(item["time"], minimum=0, maximum=1440 * 365)
                            if (not isinstance(item["name"], str) or not item["name"].strip()
                                    or type(item["isComplete"]) is not int or item["isComplete"] not in (0, 1)):
                                raise ValueError("记录字段无效")
                            seen.add(f"{rid}:{start}")
                        except (KeyError, TypeError, ValueError, OverflowError):
                            healthy = False
                    if healthy:
                        changed += self._observe_source("tomatodo", seen, str(uuid.uuid4()))
                    else:
                        self._reset_missing("tomatodo")
                    if changed:
                        self.sync["lastImport"] = now_iso()
                        self._set_meta("lastImport", self.sync["lastImport"])
                        self._bump_revision()
                self.sync.update(connected=True, error=None, importedCount=self._active_count())
                return changed
            except (OSError, ValueError, UnicodeError, sqlite3.Error) as error:
                with self.db:
                    self._reset_missing("tomatodo")
                if isinstance(error, FileNotFoundError):
                    message = "暂时找不到番茄 ToDo 本地记录；已保存的学习记录仍然保留。"
                elif isinstance(error, PermissionError):
                    message = "暂时无法读取番茄 ToDo 本地记录，请检查文件读取权限。"
                else:
                    message = f"暂时无法读取记录，将自动重试：{error}"
                self.sync.update(connected=False, error=message)
                return 0

    @staticmethod
    def _read_bridge_json(path):
        if path.stat().st_size > 20_000_000:
            raise ValueError("日历同步文件过大")
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("JSON 数字无效")))
        if not isinstance(value, dict) or type(value.get("schemaVersion")) is not int or value["schemaVersion"] != 1:
            raise ValueError("日历同步文件版本无效")
        return value

    def _refresh_calendar_titles(self, config):
        titles = config.get("allowedTitles")
        if not isinstance(titles, list) or len(titles) > 5000 or any(
                not isinstance(title, str) or not title.strip() or len(title) > 500 for title in titles):
            raise ValueError("日历任务名称列表无效")
        allowed = set(titles) | self.source_task_names | {
            row[0] for row in self.db.execute("SELECT DISTINCT name FROM records") if 0 < len(row[0]) <= 500}
        if len(allowed) > 5000:
            raise ValueError("日历任务名称数量过多")
        if allowed != set(titles):
            # Replace atomically so the native collector cannot see half a JSON.
            # Preserve selected calendar, enable switch and any helper options.
            latest = self._read_bridge_json(self.calendar_config)
            if latest == config:
                config = dict(config, allowedTitles=sorted(allowed))
                descriptor, temporary = tempfile.mkstemp(prefix=".calendar-config-", dir=self.data_dir)
                try:
                    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                        json.dump(config, handle, ensure_ascii=False, allow_nan=False)
                    os.replace(temporary, self.calendar_config)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
        return allowed

    def import_calendar(self, now=None):
        with self.lock:
            self.calendar_sync["lastCheck"] = now_iso()
            self.calendar_sync.update(pendingCount=0, pendingRecords=[])
            self.calendar_sync["importedCount"] = self._active_count("calendar")
            if not self.calendar_config.exists():
                with self.db:
                    self._reset_missing("calendar")
                self.calendar_sync.update(enabled=False, connected=False, error=None, calendarName=None)
                return 0
            try:
                config = self._read_bridge_json(self.calendar_config)
                if type(config.get("enabled")) is not bool:
                    raise ValueError("日历同步开关无效")
                self.calendar_sync["enabled"] = config["enabled"]
                if not config["enabled"]:
                    with self.db:
                        self._reset_missing("calendar")
                    self.calendar_sync.update(connected=False, error=None)
                    return 0
                calendar_id = config.get("calendarID")
                if not isinstance(calendar_id, str) or not calendar_id or len(calendar_id) > 2000:
                    raise ValueError("尚未选择用于同步的日历")
                allowed = self._refresh_calendar_titles(config)
                observed_allowed = set(config["allowedTitles"])
                snapshot = self._read_bridge_json(self.calendar_snapshot)
                if snapshot.get("kind") != "focus_calendar_snapshot":
                    raise ValueError("日历快照类型无效")
                if snapshot.get("status") != "ok":
                    message = snapshot.get("error")
                    raise ValueError(message[:500] if isinstance(message, str) and message else "手机日历同步暂未运行")
                calendar = snapshot.get("calendar")
                if not isinstance(calendar, dict) or calendar.get("calendarID") != calendar_id:
                    raise ValueError("日历快照与所选日历不一致，等待重新读取")
                now_ms = int((now or datetime.now().astimezone()).timestamp() * 1000)
                generated_ms = calendar_timestamp(snapshot.get("generatedAt"))
                if generated_ms > now_ms + 60_000:
                    raise ValueError("日历快照的生成时间无效")
                range_start = calendar_timestamp(snapshot.get("requestedStart"))
                range_end = calendar_timestamp(snapshot.get("requestedEnd"))
                if range_end <= range_start or range_end - range_start > 367 * 86_400_000:
                    raise ValueError("日历快照查询范围无效")
                events = snapshot.get("events")
                if not isinstance(events, list) or len(events) > 50000:
                    raise ValueError("日历快照记录列表无效")
                pending_events = snapshot.get("pendingEvents", [])
                if not isinstance(pending_events, list) or len(pending_events) > 50000:
                    raise ValueError("日历快照待结束记录列表无效")
                pending_records = {}
                for event in pending_events:
                    pending_record = normalize_calendar_record(event, calendar_id, allowed, now_ms,
                                                               range_start, range_end, pending=True)
                    if pending_record:
                        if pending_record[0] in pending_records and pending_records[pending_record[0]] != pending_record:
                            raise ValueError("日历快照包含冲突的待结束记录")
                        pending_records[pending_record[0]] = pending_record
                records = [record for event in events if (record := normalize_calendar_record(
                    event, calendar_id, allowed, now_ms, range_start, range_end))]
                # Duplicate identifiers with conflicting values are ambiguous:
                # reject the whole snapshot rather than oscillating the archive.
                unique = {}
                for record in records:
                    if record[0] in unique and unique[record[0]] != record:
                        raise ValueError("日历快照包含冲突的重复记录")
                    unique[record[0]] = record
                # Validate the whole collection at the moment the helper read it.
                # In particular, an old pending item is still evidence that the
                # event exists even if its end passed while this file was cached.
                observed = [normalize_calendar_record(event, calendar_id, allowed, generated_ms,
                            range_start, range_end, pending=is_pending)
                            for values, is_pending in ((events, False), (pending_events, True)) for event in values]
                healthy = all(item is not None for item in observed)
                stale = now_ms - generated_ms > CALENDAR_STALE_SECONDS * 1000
                def covered(row):
                    try:
                        identity = json.loads(row["source_key"])
                    except (TypeError, ValueError):
                        return False
                    return (isinstance(identity, list) and identity and identity[0] == calendar_id
                            and row["name"] in observed_allowed
                            and range_start <= row["start_ms"] < row["end_ms"] <= min(range_end, generated_ms))
                changed = 0
                with self.db:
                    changed += self._upsert_records(unique.values())
                    if healthy and not stale:
                        changed += self._observe_source("calendar", {item[1] for item in observed}, str(generated_ms), covered)
                    else:
                        self._reset_missing("calendar")
                    if changed:
                        self.calendar_sync["lastImport"] = now_iso()
                        self._set_meta("calendarLastImport", self.calendar_sync["lastImport"])
                        self._bump_revision()
                title = calendar.get("title")
                self.calendar_sync.update(connected=not stale, calendarName=title[:500] if isinstance(title, str) else None,
                    snapshotAt=snapshot["generatedAt"], ignoredCount=len(events) - len(records),
                    pendingCount=len(pending_records),
                    pendingRecords=[{"name": item[2], "start": iso_ms(item[4]), "end": iso_ms(item[5]), "minutes": item[3]}
                                    for item in sorted(pending_records.values(), key=lambda item: (item[5], item[0]))[:10]],
                    error="日历读取暂未更新；已保存的记录仍然保留，唤醒 Mac 后会继续同步。" if stale else None,
                    importedCount=self._active_count("calendar"))
                self.sync["importedCount"] = self._active_count()
                return changed
            except (OSError, ValueError, UnicodeError, sqlite3.Error, OverflowError) as error:
                with self.db:
                    self._reset_missing("calendar")
                message = "等待手机日历同步服务读取记录。" if isinstance(error, FileNotFoundError) else f"日历同步将自动重试：{error}"
                self.calendar_sync.update(connected=False, error=message)
                return 0

    def import_sources(self):
        return self.import_source() + self.import_calendar()

    def request_calendar_refresh(self):
        """Ask the native helper to read EventKit; ordinary archive polls do not."""
        with self.lock:
            try:
                config = self._read_bridge_json(self.calendar_config)
            except (OSError, ValueError, UnicodeError):
                return {"calendarRequested": False}
            if config.get("enabled") is not True:
                return {"calendarRequested": False}
            request = {"schemaVersion": 1,
                       "requestedAt": datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"),
                       "requestID": str(uuid.uuid4())}
            descriptor, temporary = tempfile.mkstemp(prefix=".calendar-refresh-", dir=self.data_dir)
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    json.dump(request, handle, ensure_ascii=False, allow_nan=False)
                os.replace(temporary, self.calendar_refresh_request)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            return {"calendarRequested": True, "requestID": request["requestID"], "requestedAt": request["requestedAt"]}

    def update_settings(self, patch):
        with self.lock, self.db:
            updated = validate_settings(self.settings, patch)
            self._set_meta("settings", json.dumps(updated, ensure_ascii=False, allow_nan=False))
            self._bump_revision()
            self.settings = updated
            return updated

    def move_record(self, record_id, *, restore=False):
        if not isinstance(record_id, str) or not record_id or len(record_id) > 5000:
            raise ValueError("记录标识无效")
        with self.lock, self.db:
            redirected = self.db.execute("SELECT canonical_id FROM record_merges WHERE removed_id=?", (record_id,)).fetchone()
            if redirected:
                record_id = redirected[0]
            if not self.db.execute("SELECT 1 FROM records WHERE id=?", (record_id,)).fetchone():
                raise ValueError("找不到这条学习记录")
            # Explicit restoration pins this local copy, even if both source
            # records remain deleted. Explicit trashing blocks reimport forever
            # unless the user later restores this same record.
            self.db.execute("""INSERT INTO record_lifecycle VALUES (?,?,?,?)
                ON CONFLICT(record_id) DO UPDATE SET deleted_at=excluded.deleted_at,
                reason=excluded.reason,manual_action=excluded.manual_action""",
                (record_id, None if restore else now_iso(), None if restore else "manual", "keep" if restore else "delete"))
            self._bump_revision()
            self.sync["importedCount"] = self._active_count()
            self.calendar_sync["importedCount"] = self._active_count("calendar")

    def _serialize_record(self, row):
        return {"id": row["id"], "name": row["name"], "subject": classify(row["name"], self.settings["mapping"]),
                "activity": classify_activity(row["name"], self.settings["activityMapping"]),
                "minutes": row["minutes"], "start": iso_ms(row["start_ms"]), "end": iso_ms(row["end_ms"]),
                "day": row["day"], "source": row["source"]}

    def trash(self):
        with self.lock:
            count = self.db.execute("SELECT COUNT(*) FROM record_lifecycle WHERE deleted_at IS NOT NULL").fetchone()[0]
            records = [dict(self._serialize_record(row), deletedAt=row["deleted_at"], deletionReason=row["reason"],
                            manualDeleted=row["manual_action"] == "delete") for row in self.db.execute("""
                SELECT r.*,l.deleted_at,l.reason,l.manual_action FROM records r
                JOIN record_lifecycle l ON l.record_id=r.id WHERE l.deleted_at IS NOT NULL
                ORDER BY l.deleted_at DESC,r.end_ms DESC,r.id DESC LIMIT 100""")]
            return {"count": count, "records": records}

    def state(self, selected_day=None, now=None):
        now = now or datetime.now().astimezone()
        selected_day = selected_day or now.date().isoformat()
        selected = parse_day(selected_day)
        with self.lock:
            all_records = [dict(row) for row in self.db.execute("""SELECT r.* FROM records r
                WHERE NOT EXISTS (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)
                ORDER BY end_ms DESC,id DESC""")]
            task_names = sorted(row[0] for row in self.db.execute("SELECT DISTINCT name FROM records"))
            settings = json.loads(json.dumps(self.settings))
            daily = [row for row in all_records if row["day"] == selected_day]
            minutes = round(sum(row["minutes"] for row in daily), 4)
            all_minutes = round(sum(row["minutes"] for row in all_records), 4)
            totals_by_subject = {subject: 0 for subject in SUBJECT_IDS}
            for row in daily:
                subject = classify(row["name"], settings["mapping"])
                if subject in totals_by_subject:
                    totals_by_subject[subject] += row["minutes"]
            subjects = [{"id": sid, "name": name, "color": color, "minutes": round(totals_by_subject[sid], 4),
                         "target": settings["targets"][sid], "percent": percent(totals_by_subject[sid], settings["targets"][sid])}
                        for sid, name, color in SUBJECTS]
            target = sum(settings["targets"].values())
            advice = make_advice(selected_day, subjects, minutes, daily, now)
            # No multipliers: rewards reflect actual completed minutes.
            xp = math.floor(all_minutes)
            level = xp // 120 + 1
            serialize = self._serialize_record
            serialized = [serialize(row) for row in daily[:100]]
            weekly_totals = {}
            for row in all_records:
                weekly_totals[row["day"]] = weekly_totals.get(row["day"], 0) + row["minutes"]
            week = [{"date": (selected - timedelta(days=offset)).isoformat(),
                     "minutes": round(weekly_totals.get((selected - timedelta(days=offset)).isoformat(), 0), 4),
                     "target": target} for offset in range(6, -1, -1)]
            week_start = selected - timedelta(days=selected.weekday())
            week_days = [{"date": (week_start + timedelta(days=offset)).isoformat(),
                          "minutes": round(weekly_totals.get((week_start + timedelta(days=offset)).isoformat(), 0), 4),
                          "target": target} for offset in range(7)]
            week_minutes = round(sum(item["minutes"] for item in week_days), 4)
            weekly = {"date": selected_day, "start": week_days[0]["date"], "end": week_days[-1]["date"],
                      "minutes": week_minutes, "target": settings["weeklyTarget"],
                      "percent": percent(week_minutes, settings["weeklyTarget"]), "days": week_days,
                      "activeDays": sum(item["minutes"] > 0 for item in week_days)}
            badges = [
                {"id": "first", "name": "初次出征", "description": "完成第一个专注任务", "earned": bool(all_records)},
                {"id": "hours-10", "name": "专注学徒", "description": "累计专注 10 小时", "earned": all_minutes >= 600},
                {"id": "hours-50", "name": "知识游侠", "description": "累计专注 50 小时", "earned": all_minutes >= 3000},
                {"id": "hours-100", "name": "百时守护者", "description": "累计专注 100 小时", "earned": all_minutes >= 6000},
                {"id": "balanced", "name": "四科同行", "description": "所选日期四科各专注至少 15 分钟", "earned": all(s["minutes"] >= 15 for s in subjects)},
                {"id": "all-complete", "name": "全线通关", "description": "所选日期完成全部科目目标", "earned": all(s["minutes"] >= s["target"] for s in subjects)},
            ]
            return {"date": selected_day, "today": now.date().isoformat(),
                    "totals": {"minutes": minutes, "target": target, "percent": percent(minutes, target), "xp": xp,
                               "level": level, "levelXp": xp % 120, "levelTarget": 120},
                    "subjects": subjects, "records": serialized, "week": week, "weekly": weekly,
                    "activities": activity_summary(selected_day, daily, settings, minutes, target, now, advice),
                    "activityTypes": [{"id": aid, "name": name} for aid, name in ACTIVITY_TYPES],
                    "taskActivities": {name: classify_activity(name, settings["activityMapping"])
                                       for name in task_names},
                    "taskNames": task_names,
                    "dayRecordCount": len(daily),
                    "latestRecords": [serialize(row) for row in all_records[:20]],
                    "allTime": {"minutes": all_minutes, "records": len(all_records), "activeDays": len(weekly_totals)},
                    "badges": badges, "advice": advice,
                    "sync": dict(self.sync, importedCount=len(all_records)),
                    "calendarSync": dict(self.calendar_sync, importedCount=self._active_count("calendar")), "settings": settings,
                    "unmapped": sorted({row["name"] for row in all_records if classify(row["name"], settings["mapping"]) == "other"}),
                    "trash": self.trash(), "quests": self.quest_state(now.astimezone()), "revision": self.revision}

    def export_csv(self):
        with self.lock:
            stream = io.StringIO(newline="")
            writer = csv.writer(stream)
            writer.writerow(["记录ID", "日期", "任务", "科目", "学习方式", "分钟", "开始时间", "完成时间", "来源"])
            names = {sid: name for sid, name, _ in SUBJECTS} | {"other": "待分类"}
            activity_names = dict(ACTIVITY_TYPES)
            for row in self.db.execute("""SELECT r.* FROM records r WHERE NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)
                ORDER BY day,end_ms"""):
                # Escape spreadsheet formulas in user-controlled names/IDs.
                def safe(value):
                    value = str(value)
                    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value
                writer.writerow([safe(row["id"]), row["day"], safe(row["name"]), names[classify(row["name"], self.settings["mapping"])],
                                 activity_names[classify_activity(row["name"], self.settings["activityMapping"])],
                                 row["minutes"], iso_ms(row["start_ms"]), iso_ms(row["end_ms"]), row["source"]])
            return ("\ufeff" + stream.getvalue()).encode("utf-8")


class FocusHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 32


def make_handler(store, static_dir=STATIC_DIR):
    static_dir = Path(static_dir).resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version = "FocusQuest/1.0"

        def log_message(self, fmt, *args):
            if args and str(args[1] if len(args) > 1 else "").startswith("5"):
                super().log_message(fmt, *args)

        def _send(self, status, payload, content_type="application/json; charset=utf-8", filename=None):
            if isinstance(payload, (dict, list)):
                payload = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
            elif isinstance(payload, str):
                payload = payload.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
            if filename:
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)

        def _authorized(self, writing=False):
            port = self.server.server_address[1]
            hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            if port == 80:
                hosts.update(("127.0.0.1", "localhost"))
            if self.headers.get("Host", "").lower() not in hosts:
                self._send(403, {"error": "仅允许本机访问"})
                return False
            origin = self.headers.get("Origin")
            if writing and (origin and origin.lower() not in {f"http://{host}" for host in hosts}):
                self._send(403, {"error": "不允许跨站修改"})
                return False
            if writing and self.headers.get("Sec-Fetch-Site") == "cross-site":
                self._send(403, {"error": "不允许跨站修改"})
                return False
            return True

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            if not self._authorized():
                return
            try:
                url = urlsplit(self.path)
                if url.path == "/api/health":
                    self._send(200, {"ok": True})
                elif url.path == "/api/state":
                    query = parse_qs(url.query)
                    self._send(200, store.state(query.get("date", [None])[0]))
                elif url.path == "/api/opening":
                    if url.query:
                        raise ValueError("开场使用电脑当前日期和时间，不接受查询参数")
                    self._send(200, store.opening())
                elif url.path == "/api/quests":
                    if url.query:
                        raise ValueError("委托使用电脑当前日期和时间，不接受查询参数")
                    self._send(200, store.quest_state())
                elif url.path == "/api/export":
                    self._send(200, store.export_csv(), "text/csv; charset=utf-8", "focus-quest-records.csv")
                elif url.path == "/api/trash":
                    self._send(200, store.trash())
                elif url.path.startswith("/api/"):
                    self._send(404, {"error": "接口不存在"})
                else:
                    path = (static_dir / unquote(url.path).lstrip("/")).resolve()
                    if path == static_dir:
                        path = static_dir / "index.html"
                    if static_dir not in path.parents or not path.is_file():
                        self._send(404, {"error": "页面不存在"})
                        return
                    kind = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
                    if kind.startswith("text/") or kind == "application/javascript":
                        kind += "; charset=utf-8"
                    self._send(200, path.read_bytes(), kind)
            except (ValueError, OverflowError) as error:
                self._send(400, {"error": str(error)})
            except (OSError, sqlite3.Error):
                self._send(500, {"error": "本地数据暂时无法读取"})

        def do_POST(self):
            if not self._authorized(writing=True):
                return
            try:
                url = urlsplit(self.path)
                path = url.path
                quest_actions = {"/api/quests/accept": ("subject", store.accept_quest),
                                 "/api/shop/buy": ("itemId", store.buy_item),
                                 "/api/shop/equip": ("itemId", store.equip_item)}
                if path not in ("/api/settings", "/api/sync", "/api/records/trash", "/api/records/restore", "/api/opening/claim", "/api/shop/exchange", "/api/quests/submit") and path not in quest_actions:
                    self._send(404, {"error": "接口不存在"})
                    return
                length = int(self.headers.get("Content-Length", "0"))
                if length < 0 or length > 1_000_000:
                    self._send(413, {"error": "请求过大"})
                    return
                if self.headers.get_content_type() != "application/json":
                    self._send(415, {"error": "请使用 application/json"})
                    return
                raw = self.rfile.read(length)
                payload = json.loads(raw or b"{}", parse_constant=lambda value: (_ for _ in ()).throw(ValueError("JSON 数字无效")))
                if not isinstance(payload, dict):
                    raise ValueError("请求必须为 JSON 对象")
                if path == "/api/shop/exchange":
                    if url.query or set(payload) != {"diamonds", "requestId"}:
                        raise ValueError("请仅提供兑换钻石数量和请求标识，价格与时间由服务器确定")
                    self._send(200, store.exchange_diamonds(payload["diamonds"], payload["requestId"]))
                elif path == "/api/quests/submit":
                    if url.query or set(payload) != {"subject", "requestId"}:
                        raise ValueError("请仅提供交付科目和 UUID 请求标识，时间与奖励由服务器确定")
                    request_id = store._quest_request_id(payload["requestId"])
                    self._send(200, store.submit_quest(payload["subject"], request_id=request_id))
                elif path in quest_actions:
                    field, action = quest_actions[path]
                    if url.query or set(payload) != {field}:
                        raise ValueError("请仅提供操作标识；委托日期、时间和奖励由服务器确定")
                    self._send(200, action(payload[field]))
                elif path == "/api/settings":
                    store.update_settings(payload)
                    self._send(200, store.state())
                elif path == "/api/opening/claim":
                    if not raw or payload or url.query:
                        raise ValueError("开场认领仅接受空 JSON 对象，不接受日期或时间参数")
                    self._send(200, store.claim_opening())
                elif path in ("/api/records/trash", "/api/records/restore"):
                    if set(payload) != {"id"}:
                        raise ValueError("请提供要操作的记录标识")
                    store.move_record(payload["id"], restore=path.endswith("/restore"))
                    self._send(200, store.state())
                else:
                    store.import_sources()
                    request = store.request_calendar_refresh()
                    self._send(200, dict(store.state(), refreshRequest=request))
            except (ValueError, UnicodeError) as error:
                self._send(400, {"error": str(error)})
            except (sqlite3.Error, OSError):
                self._send(500, {"error": "本地数据暂时无法保存"})

    return Handler


def main(argv=None):
    parser = argparse.ArgumentParser(description="Focus Quest · 本地学习远征")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--port", type=int, default=18473)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    store = FocusStore(args.data_dir, args.source)
    server = FocusHTTPServer(("127.0.0.1", args.port), make_handler(store))
    stop = threading.Event()
    store.import_sources()

    def poll():
        while not stop.wait(POLL_SECONDS):
            store.import_sources()

    poller = threading.Thread(target=poll, name="tomatodo-read-only-import", daemon=True)
    poller.start()

    def shutdown(signum, frame):
        stop.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    print(f"Focus Quest 已启动：http://127.0.0.1:{args.port}", flush=True)
    print(f"只读同步：{store.source}", flush=True)
    print(f"本地存档：{store.data_dir}", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        stop.set()
        server.server_close()
        poller.join(timeout=5)
        store.close()


if __name__ == "__main__":
    main()
