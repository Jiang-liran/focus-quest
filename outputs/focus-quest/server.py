#!/usr/bin/env python3
"""Focus Quest: local-only, read-only TomatoTodo importer and study dashboard.

No third-party packages are required. Completed task records are retained in a
separate SQLite database, even if TomatoTodo removes its local copies. Targets
are current settings, including when viewing previous days.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import mimetypes
import os
import signal
import sqlite3
import threading
import time
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

DEFAULT_SOURCE = Path.home() / "Library/Application Support/tomatodo/tomatodo_db.json"
DEFAULT_DATA = Path.home() / "Library/Application Support/FocusQuest"
STATIC_DIR = Path(__file__).resolve().parent / "static"
POLL_SECONDS = 3
SUBJECTS = (
    ("math", "数学", "#65e4b4"),
    ("cs", "408", "#ab9bff"),
    ("politics", "政治", "#ffbd79"),
    ("english", "英语", "#75c9ff"),
)
SUBJECT_IDS = {s[0] for s in SUBJECTS}
DEFAULT_SETTINGS = {
    "targets": {"math": 180, "cs": 180, "politics": 60, "english": 60},
    "mapping": {}, "motion": True, "sound": False,
}


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


class FocusStore:
    def __init__(self, data_dir=DEFAULT_DATA, source=DEFAULT_SOURCE):
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
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        self.settings = json.loads(json.dumps(DEFAULT_SETTINGS))
        stored = self._meta("settings")
        if stored:
            self.settings = validate_settings(self.settings, json.loads(stored))
        self.revision = int(self._meta("revision") or 0)
        self.sync = {"connected": False, "sourcePath": str(self.source), "lastCheck": None,
                     "lastImport": self._meta("lastImport"), "error": None,
                     "importedCount": self.db.execute("SELECT COUNT(*) FROM records").fetchone()[0],
                     "pollSeconds": POLL_SECONDS}

    def _meta(self, key):
        item = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return item[0] if item else None

    def _set_meta(self, key, value):
        self.db.execute("INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))

    def _bump_revision(self):
        self.revision += 1
        self._set_meta("revision", self.revision)

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
                return document["PCRecord"]
            except (OSError, ValueError, UnicodeError) as error:
                last_error = error
                if attempt < 2:
                    time.sleep(0.03)
        raise last_error

    def import_source(self):
        with self.lock:
            self.sync["lastCheck"] = now_iso()
            try:
                source_records = self._read_source()
                records = [normalized for item in source_records if (normalized := normalize_record(item))]
                changed = 0
                with self.db:
                    for record in records:
                        previous = self.db.execute("SELECT * FROM records WHERE id=?", (record[0],)).fetchone()
                        if previous is not None and tuple(previous) == record:
                            continue
                        self.db.execute("""INSERT INTO records VALUES (?,?,?,?,?,?,?,?)
                            ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,
                            name=excluded.name, minutes=excluded.minutes, start_ms=excluded.start_ms,
                            end_ms=excluded.end_ms, day=excluded.day, source=excluded.source""", record)
                        changed += 1
                    if changed:
                        self.sync["lastImport"] = now_iso()
                        self._set_meta("lastImport", self.sync["lastImport"])
                        self._bump_revision()
                self.sync.update(connected=True, error=None, importedCount=self.db.execute("SELECT COUNT(*) FROM records").fetchone()[0])
                return changed
            except (OSError, ValueError, UnicodeError, sqlite3.Error) as error:
                if isinstance(error, FileNotFoundError):
                    message = "暂时找不到番茄 ToDo 本地记录；已保存的学习记录仍然保留。"
                elif isinstance(error, PermissionError):
                    message = "暂时无法读取番茄 ToDo 本地记录，请检查文件读取权限。"
                else:
                    message = f"暂时无法读取记录，将自动重试：{error}"
                self.sync.update(connected=False, error=message)
                return 0

    def update_settings(self, patch):
        with self.lock, self.db:
            updated = validate_settings(self.settings, patch)
            self._set_meta("settings", json.dumps(updated, ensure_ascii=False, allow_nan=False))
            self._bump_revision()
            self.settings = updated
            return updated

    def state(self, selected_day=None, now=None):
        now = now or datetime.now().astimezone()
        selected_day = selected_day or now.date().isoformat()
        selected = parse_day(selected_day)
        with self.lock:
            all_records = [dict(row) for row in self.db.execute("SELECT * FROM records ORDER BY end_ms DESC, id DESC")]
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
            # No multipliers: rewards reflect actual completed minutes.
            xp = math.floor(all_minutes)
            level = xp // 120 + 1
            def serialize(row):
                return {"id": row["id"], "name": row["name"], "subject": classify(row["name"], settings["mapping"]),
                        "minutes": row["minutes"], "start": iso_ms(row["start_ms"]), "end": iso_ms(row["end_ms"]),
                        "day": row["day"], "source": row["source"]}
            serialized = [serialize(row) for row in daily[:100]]
            weekly_totals = {}
            for row in all_records:
                weekly_totals[row["day"]] = weekly_totals.get(row["day"], 0) + row["minutes"]
            week = [{"date": (selected - timedelta(days=offset)).isoformat(),
                     "minutes": round(weekly_totals.get((selected - timedelta(days=offset)).isoformat(), 0), 4),
                     "target": target} for offset in range(6, -1, -1)]
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
                    "subjects": subjects, "records": serialized, "week": week,
                    "taskNames": sorted({row["name"] for row in all_records}),
                    "dayRecordCount": len(daily),
                    "latestRecords": [serialize(row) for row in all_records[:20]],
                    "allTime": {"minutes": all_minutes, "records": len(all_records), "activeDays": len(weekly_totals)},
                    "badges": badges, "advice": make_advice(selected_day, subjects, minutes, daily, now),
                    "sync": dict(self.sync), "settings": settings,
                    "unmapped": sorted({row["name"] for row in all_records if classify(row["name"], settings["mapping"]) == "other"}),
                    "revision": self.revision}

    def export_csv(self):
        with self.lock:
            stream = io.StringIO(newline="")
            writer = csv.writer(stream)
            writer.writerow(["记录ID", "日期", "任务", "科目", "分钟", "开始时间", "完成时间", "来源"])
            names = {sid: name for sid, name, _ in SUBJECTS} | {"other": "待分类"}
            for row in self.db.execute("SELECT * FROM records ORDER BY day, end_ms"):
                # Escape spreadsheet formulas in user-controlled names/IDs.
                def safe(value):
                    value = str(value)
                    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value
                writer.writerow([safe(row["id"]), row["day"], safe(row["name"]), names[classify(row["name"], self.settings["mapping"])],
                                 row["minutes"], iso_ms(row["start_ms"]), iso_ms(row["end_ms"]), row["source"]])
            return ("\ufeff" + stream.getvalue()).encode("utf-8")


class FocusHTTPServer(ThreadingHTTPServer):
    daemon_threads = True


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
                elif url.path == "/api/export":
                    self._send(200, store.export_csv(), "text/csv; charset=utf-8", "focus-quest-records.csv")
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
                path = urlsplit(self.path).path
                if path not in ("/api/settings", "/api/sync"):
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
                if path == "/api/settings":
                    store.update_settings(payload)
                else:
                    store.import_source()
                self._send(200, store.state())
            except (ValueError, UnicodeError) as error:
                self._send(400, {"error": str(error)})
            except sqlite3.Error:
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
    store.import_source()

    def poll():
        while not stop.wait(POLL_SECONDS):
            store.import_source()

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
