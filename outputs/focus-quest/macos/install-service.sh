#!/bin/bash
# Optional: install the local collector as a per-user login service.
set -euo pipefail
MACOS_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_APP="$HOME/Applications/专注远征.app"
if [[ ! -f "$DEFAULT_APP/Contents/Resources/server.py" ]]; then
  DEFAULT_APP="$(cd "$MACOS_DIR/../.." && pwd)/build.noindex/专注远征.app"
fi
APP_PATH="${1:-$DEFAULT_APP}"
if [[ ! -f "$APP_PATH/Contents/Resources/server.py" ]]; then
  echo "找不到应用内的 server.py。请先打包，或传入已安装 .app 的完整路径。" >&2
  exit 1
fi
APP_PATH="$(cd "$APP_PATH" && pwd -P)"
SCRIPT_PATH="$APP_PATH/Contents/Resources/server.py"
LABEL="com.local.focusquest"
USER_DOMAIN="gui/$(id -u)"
DATA_DIR="$HOME/Library/Application Support/FocusQuest"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$DATA_DIR" "$(dirname "$PLIST_PATH")"

# Unload an earlier registration before replacing it. User data is untouched.
launchctl bootout "$USER_DOMAIN/$LABEL" 2>/dev/null || true

# Only stop a collector launched from this exact app; never stop an unrelated listener.
LISTENER_PIDS="$(/usr/sbin/lsof -nP -iTCP:18473 -sTCP:LISTEN -t 2>/dev/null || true)"
for PID in $LISTENER_PIDS; do
  COMMAND="$(/bin/ps -p "$PID" -o command= || true)"
  # bootout may finish stopping the old collector between lsof and ps.
  if [[ -z "$COMMAND" ]]; then continue; fi
  if [[ "$COMMAND" == *"$SCRIPT_PATH"* ]]; then
    kill -TERM "$PID"
  else
    echo "端口 18473 正被其他进程使用（PID ${PID}），未停止它。请先退出该服务再重试。" >&2
    exit 1
  fi
done
for WAIT_STEP in {1..30}; do
  if ! /usr/sbin/lsof -nP -iTCP:18473 -sTCP:LISTEN -t >/dev/null 2>&1; then break; fi
  sleep 0.2
done
if /usr/sbin/lsof -nP -iTCP:18473 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "旧服务还未释放端口，未启动重复进程。稍后重新运行即可。" >&2
  exit 1
fi

/usr/bin/python3 - "$PLIST_PATH" "$SCRIPT_PATH" "$DATA_DIR" <<'PY'
import os, plistlib, sys
plist_path, script_path, data_dir = sys.argv[1:]
content = {
    "Label": "com.local.focusquest",
    "ProgramArguments": ["/usr/bin/python3", "-u", script_path],
    "WorkingDirectory": os.path.dirname(script_path),
    "RunAtLoad": True,
    "KeepAlive": True,
    "ThrottleInterval": 10,
    "ProcessType": "Background",
    "StandardOutPath": os.path.join(data_dir, "service.log"),
    "StandardErrorPath": os.path.join(data_dir, "service.log"),
}
with open(plist_path, "wb") as f:
    plistlib.dump(content, f)
os.chmod(plist_path, 0o644)
PY
launchctl bootstrap "$USER_DOMAIN" "$PLIST_PATH"
launchctl kickstart "$USER_DOMAIN/$LABEL"
echo "已启用登录后台记录：$APP_PATH"
echo "移动 .app 后请重新运行本脚本，以更新服务路径。"
