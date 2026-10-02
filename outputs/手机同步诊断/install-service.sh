#!/bin/bash
set -euo pipefail
APP_PATH="${1:?用法：bash install-service.sh /绝对路径/专注日历诊断.app}"
case "$APP_PATH" in /*) ;; *) printf '%s\n' '应用路径必须是绝对路径。' >&2; exit 1;; esac
EXECUTABLE="$APP_PATH/Contents/MacOS/CalendarProbeApp"
if [[ ! -x "$EXECUTABLE" ]]; then printf '%s\n' '找不到日历采集器可执行文件。' >&2; exit 1; fi
codesign --verify --deep --strict "$APP_PATH"
SUPPORT_DIR="$HOME/Library/Application Support/FocusQuest"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$AGENTS_DIR/com.local.focusquest.calendarbridge.plist"
SERVICE="gui/$(id -u)/com.local.focusquest.calendarbridge"
mkdir -p "$SUPPORT_DIR" "$AGENTS_DIR"
touch "$SUPPORT_DIR/calendar-bridge.log"
chmod 600 "$SUPPORT_DIR/calendar-bridge.log"
/usr/bin/python3 - "$PLIST_PATH" "$EXECUTABLE" "$SUPPORT_DIR/calendar-bridge.log" <<'PY'
import os, plistlib, sys
destination, executable, log = sys.argv[1:]
value = {
    'Label': 'com.local.focusquest.calendarbridge',
    'ProgramArguments': [executable, '--background'],
    'RunAtLoad': True,
    'KeepAlive': True,
    'ThrottleInterval': 30,
    'ProcessType': 'Background',
    'StandardOutPath': log,
    'StandardErrorPath': log,
}
temporary = destination + '.tmp'
with open(temporary, 'wb') as stream:
    plistlib.dump(value, stream)
os.chmod(temporary, 0o644)
os.replace(temporary, destination)
PY
plutil -lint "$PLIST_PATH"
launchctl bootout "$SERVICE" 2>/dev/null || true
launchctl enable "$SERVICE"
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
printf '%s\n' '日历后台采集服务已安装。只读取已有配置，不会自动弹出授权。'
