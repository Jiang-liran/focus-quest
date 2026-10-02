#!/bin/bash
# Create a consistent SQLite backup while the collector remains running.
set -euo pipefail
BACKUP_PATH="${1:-$PWD/FocusQuest-$(date +%Y%m%d-%H%M%S).sqlite3}"
/usr/bin/python3 - "$HOME/Library/Application Support/FocusQuest/focus-quest.sqlite3" "$BACKUP_PATH" <<'PY'
import sqlite3, sys
from pathlib import Path
source, destination = map(lambda value: Path(value).expanduser().resolve(), sys.argv[1:])
if not source.is_file():
    raise SystemExit("尚未找到学习存档，请先打开专注远征。")
if destination.exists():
    raise SystemExit("备份目标已存在，请换一个文件名；原文件未改动。")
destination.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as origin:
    with sqlite3.connect(str(destination)) as backup:
        origin.backup(backup)
print("已备份学习记录和设置：" + str(destination))
PY
