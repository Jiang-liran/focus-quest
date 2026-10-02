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
    ("bar-aurora", "bar", "极光流转", "让学习进度泛起极光", 300, 0),
    ("bar-comet", "bar", "彗星轨迹", "循着彗星推进远征", 700, 4),
    ("fx-default", "fx", "初旅星光", "记录每一次普通而珍贵的完成", 0, 0),
    ("fx-fireflies", "fx", "萤火微光", "让轻盈萤火常驻你的星岛", 400, 0),
    ("fx-meteor", "fx", "流星庆典", "让星岛上空不时划过流星", 900, 6),
    ("npc-default", "npc", "营地向导", "陪你开启每日委托", 0, 0),
    ("npc-scholar", "npc", "博学旅人", "让书卷中的同伴加入营地", 250, 0),
    ("npc-astral", "npc", "星界使者", "来自星空的委托同伴", 700, 6),
    ("avatar-default", "avatar", "初旅行装", "第一次出征时的模样", 0, 0),
    ("avatar-ranger", "avatar", "知识游侠", "为持续前行换上新行装", 300, 0),
    ("avatar-star", "avatar", "星辉旅者", "披上属于你的积累与星辉", 800, 8),
)
SHOP_ITEMS = {item[0]: dict(zip(("id", "slot", "name", "description", "coins", "diamonds"), item))
              for item in SHOP_CATALOG}


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
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        # Upgrade old archives without changing record IDs or dropping history.
        with self.db:
            for item in SHOP_ITEMS.values():
                if not item["coins"] and not item["diamonds"]:
                    self.db.execute("INSERT OR IGNORE INTO shop_equipment VALUES (?,?)", (item["slot"], item["id"]))
            for row in self.db.execute("SELECT * FROM records").fetchall():
                key = row["source_id"] if row["source"] == "calendar" else f'{row["source_id"]}:{row["start_ms"]}'
                self.db.execute("INSERT OR IGNORE INTO record_aliases VALUES (?,?,?)", (row["source"], key, row["id"]))
            self.db.execute("""INSERT OR IGNORE INTO source_presence(source,source_key)
                               SELECT source,source_key FROM record_aliases""")
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
            if self._reconcile_sources():
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

    def _quest_row(self, definition, current):
        day, subject = current.date().isoformat(), definition["subject"]
        opens, deadline, submit_deadline = quest_window(definition, current)
        acceptance = self.db.execute("SELECT * FROM quest_acceptances WHERE day=? AND subject=?", (day, subject)).fetchone()
        receipt = self.db.execute("SELECT * FROM quest_receipts WHERE day=? AND subject=?", (day, subject)).fetchone()
        now_ms = int(current.timestamp() * 1000)
        contributions = []
        if receipt:
            minutes = receipt["minutes"]
            reward = {"coins": receipt["coins"], "diamonds": receipt["diamonds"]}
            status = "claimed"
        else:
            if acceptance:
                contributions = self._quest_contributions(subject, acceptance["lower_ms"], int(deadline.timestamp() * 1000), now_ms)
            minutes = round(sum(item["minutes"] for item in contributions), 8)
            reward = {"coins": math.floor(minutes * 2 + 1e-8),
                      "diamonds": math.floor(minutes / definition["target"] + 1e-10) * 2}
            if current < opens:
                status = "locked"
            elif not acceptance:
                status = "available" if current < deadline else "expired"
            elif current > submit_deadline:
                status = "expired"
            elif minutes + 1e-8 >= definition["target"]:
                status = "ready"
            else:
                status = "active"
        result = {"subject": subject, "name": definition["name"], "period": definition["period"],
                  "target": definition["target"], "opensAt": opens.isoformat(), "deadline": deadline.isoformat(),
                  "submitDeadline": submit_deadline.isoformat(),
                  "acceptedAt": iso_ms(acceptance["accepted_ms"]) if acceptance else None,
                  "submittedAt": iso_ms(receipt["submitted_ms"]) if receipt else None,
                  "lowerBound": acceptance["lower_bound"] if acceptance else self.quest_lower_bound,
                  "eligibleFrom": iso_ms(acceptance["lower_ms"]) if acceptance else None,
                  "status": status, "minutes": round(minutes, 4), "percent": percent(minutes, definition["target"]),
                  "reward": reward, "baseReward": {"coins": definition["target"] * 2, "diamonds": 2}}
        return result, contributions, minutes

    def quest_state(self, now=None):
        current = quest_clock(now)
        with self.lock:
            owned = {row[0] for row in self.db.execute("SELECT item_id FROM shop_purchases")}
            equipped = {row[0]: row[1] for row in self.db.execute("SELECT slot,item_id FROM shop_equipment")}
            catalog = [dict(item, owned=item["id"] in owned or (item["coins"] == 0 and item["diamonds"] == 0),
                            equipped=equipped.get(item["slot"]) == item["id"]) for item in SHOP_ITEMS.values()]
            history = [{"day": row["day"], "subject": row["subject"], "name": row["name"],
                        "minutes": round(row["minutes"], 4), "coins": row["coins"], "diamonds": row["diamonds"],
                        "submittedAt": iso_ms(row["submitted_ms"])}
                       for row in self.db.execute("SELECT * FROM quest_receipts ORDER BY submitted_ms DESC,day DESC,subject LIMIT 20")]
            return {"day": current.date().isoformat(), "now": current.isoformat(), "wallet": self._wallet(),
                    "quests": [self._quest_row(definition, current)[0] for definition in QUEST_DEFINITIONS],
                    "catalog": catalog, "equipped": equipped, "history": history}

    def accept_quest(self, subject, now=None):
        definition = self._quest_definition(subject)
        with self._quest_transaction():
            # Sample the production clock after waiting for the write lock so
            # a queued request cannot carry an earlier deadline check forward.
            current = quest_clock(now)
            day = current.date().isoformat()
            opens, deadline, _ = quest_window(definition, current)
            existing = self.db.execute("SELECT 1 FROM quest_acceptances WHERE day=? AND subject=?", (day, subject)).fetchone()
            if not existing:
                if not opens <= current < deadline:
                    raise ValueError("这项委托当前不可接取，请查看发布时间与截止时间")
                accepted_ms = int(current.timestamp() * 1000)
                lower_ms = accepted_ms if self.quest_lower_bound == "accepted" else int(opens.timestamp() * 1000)
                self.db.execute("INSERT INTO quest_acceptances VALUES (?,?,?,?,?)",
                                (day, subject, accepted_ms, lower_ms, self.quest_lower_bound))
            return self.quest_state(current)

    def submit_quest(self, subject, now=None):
        definition = self._quest_definition(subject)
        with self._quest_transaction():
            current = quest_clock(now)
            day = current.date().isoformat()
            row, contributions, minutes = self._quest_row(definition, current)
            already_claimed = row["status"] == "claimed"
            if not already_claimed:
                if row["status"] != "ready":
                    raise ValueError("委托尚未达标、未接取或已超过提交时限，暂不能领取奖励")
                submitted_ms = int(current.timestamp() * 1000)
                reward = row["reward"]
                self.db.execute("INSERT INTO quest_receipts VALUES (?,?,?,?,?,?,?)",
                                (day, subject, definition["name"], minutes, reward["coins"], reward["diamonds"], submitted_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"quest:{day}:{subject}", reward["coins"], reward["diamonds"], submitted_ms))
                self.db.executemany("INSERT INTO quest_allocations VALUES (?,?,?,?,?,?)",
                                    [(day, subject, item["record_id"], item["start_ms"], item["end_ms"], item["minutes"])
                                     for item in contributions])
            result = self.quest_state(current)
            receipt = self.db.execute("SELECT * FROM quest_receipts WHERE day=? AND subject=?", (day, subject)).fetchone()
            result["receipt"] = {"day": day, "subject": subject, "name": receipt["name"],
                                 "minutes": round(receipt["minutes"], 4), "coins": receipt["coins"],
                                 "diamonds": receipt["diamonds"], "submittedAt": iso_ms(receipt["submitted_ms"]),
                                 "alreadyClaimed": already_claimed}
            return result

    def _shop_item(self, item_id):
        if not isinstance(item_id, str) or item_id not in SHOP_ITEMS:
            raise ValueError("商品不存在")
        return SHOP_ITEMS[item_id]

    def buy_item(self, item_id, now=None):
        current = quest_clock(now)
        item = self._shop_item(item_id)
        with self._quest_transaction():
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
        current = quest_clock(now)
        item = self._shop_item(item_id)
        with self._quest_transaction():
            owned = (item["coins"] == 0 and item["diamonds"] == 0) or self.db.execute(
                "SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone() is not None
            if not owned:
                raise ValueError("请先购买这件装扮")
            self.db.execute("INSERT INTO shop_equipment VALUES (?,?) ON CONFLICT(slot) DO UPDATE SET item_id=excluded.item_id",
                            (item["slot"], item_id))
            return self.quest_state(current)

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
        if previous is not None and source == "calendar" and previous["source"] == "tomatodo":
            return 0
        record = (record_id,) + record[1:]
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
            survivor, removed = rows
            desktop = next(row for row in rows if row['source'] == 'tomatodo')
            journal = json.dumps({'records': [dict(row) for row in rows],
                                  'lifecycle': [dict(row) for row in lifecycle]}, ensure_ascii=False)
            self.db.execute("INSERT INTO record_merges VALUES (?,?,?,?)",
                            (removed['id'], survivor['id'], now_iso(), journal))
            self.db.execute("UPDATE record_aliases SET record_id=? WHERE record_id=?",
                            (survivor['id'], removed['id']))
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
                                 "/api/quests/submit": ("subject", store.submit_quest),
                                 "/api/shop/buy": ("itemId", store.buy_item),
                                 "/api/shop/equip": ("itemId", store.equip_item)}
                if path not in ("/api/settings", "/api/sync", "/api/records/trash", "/api/records/restore", "/api/opening/claim") and path not in quest_actions:
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
                if path in quest_actions:
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
