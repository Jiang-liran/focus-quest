#!/bin/bash
set -euo pipefail
LABEL="com.local.focusquest"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [[ -f "$PLIST_PATH" ]]; then rm "$PLIST_PATH"; fi
echo "已移除登录后台服务。学习记录和设置均已保留。"
echo "数据位置：$HOME/Library/Application Support/FocusQuest"
