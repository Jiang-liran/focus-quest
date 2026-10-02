#!/bin/bash
set -euo pipefail
SERVICE="gui/$(id -u)/com.local.focusquest.calendarbridge"
PLIST_PATH="$HOME/Library/LaunchAgents/com.local.focusquest.calendarbridge.plist"
launchctl bootout "$SERVICE" 2>/dev/null || true
if [[ -f "$PLIST_PATH" ]]; then rm "$PLIST_PATH"; fi
printf '%s\n' '日历后台采集服务已停止并卸载。应用、同步配置、快照、诊断文件及专注远征记录均保留。'
