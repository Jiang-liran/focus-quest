#!/bin/bash
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGE="$(mktemp -d /private/tmp/focus-calendar-probe.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
APP="$STAGE/专注日历诊断.app"
mkdir -p "$APP/Contents/MacOS"
cp "$SOURCE_DIR/AppInfo.plist" "$APP/Contents/Info.plist"
xcrun swiftc -parse-as-library -target arm64-apple-macosx14.0 \
  -framework AppKit -framework EventKit \
  "$SOURCE_DIR/CalendarProbeApp.swift" "$SOURCE_DIR/CalendarBridge.swift" -o "$APP/Contents/MacOS/CalendarProbeApp"
codesign --force --sign - --identifier com.local.focusquest.calendarprobe "$APP"
codesign --verify --deep --strict "$APP"
# Preserve a clean signed copy in the archive before FileProvider adds metadata.
ditto -c -k --sequesterRsrc --keepParent "$APP" "$SOURCE_DIR/专注日历诊断.zip"
ditto "$APP" "$SOURCE_DIR/专注日历诊断.app"
printf '%s\n' "已编译并验证：$SOURCE_DIR/专注日历诊断.app"
