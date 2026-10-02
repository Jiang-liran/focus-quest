#!/bin/bash
set -euo pipefail
MACOS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$MACOS_DIR/.." && pwd)"
OUTPUT_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
APP_PATH="${1:-$OUTPUT_DIR/专注远征.app}"
ARCHIVE_PATH="$OUTPUT_DIR/专注远征.zip"

if [[ ! -f "$PROJECT_DIR/server.py" || ! -f "$PROJECT_DIR/static/index.html" ]]; then
  echo "缺少 server.py 或 static/index.html；请先完成后端和界面。" >&2
  exit 1
fi
# Sign outside Documents/File Provider folders, where package metadata can
# otherwise be reattached while codesign is running.
STAGING_DIR="$(mktemp -d /private/tmp/focusquest-build.XXXXXX)"
trap 'rm -rf "$STAGING_DIR"' EXIT
BUILD_APP="$STAGING_DIR/专注远征.app"
mkdir -p "$BUILD_APP/Contents/MacOS" "$BUILD_APP/Contents/Resources"
xcrun swiftc -O -parse-as-library -target "$(uname -m)-apple-macosx12.0" -framework Cocoa -framework WebKit \
  "$MACOS_DIR/FocusQuest.swift" -o "$BUILD_APP/Contents/MacOS/FocusQuest"
cp -X "$MACOS_DIR/Info.plist" "$BUILD_APP/Contents/Info.plist"
cp -X "$MACOS_DIR/FocusQuest.icns" "$BUILD_APP/Contents/Resources/FocusQuest.icns"
cp -X "$PROJECT_DIR/server.py" "$BUILD_APP/Contents/Resources/server.py"
cp -X "$PROJECT_DIR/lottery_rules.py" "$BUILD_APP/Contents/Resources/lottery_rules.py"
cp -X "$PROJECT_DIR/shop_catalog_expansion.py" "$BUILD_APP/Contents/Resources/shop_catalog_expansion.py"
cp -X "$PROJECT_DIR/arcade_rules.py" "$BUILD_APP/Contents/Resources/arcade_rules.py"
cp -X "$PROJECT_DIR/survivor_rules.py" "$BUILD_APP/Contents/Resources/survivor_rules.py"
cp -X "$PROJECT_DIR/minesweeper_rules.py" "$BUILD_APP/Contents/Resources/minesweeper_rules.py"
cp -X "$PROJECT_DIR/voyage_rules.py" "$BUILD_APP/Contents/Resources/voyage_rules.py"
cp -X "$PROJECT_DIR/dice_rules.py" "$BUILD_APP/Contents/Resources/dice_rules.py"
/usr/bin/ditto --norsrc --noextattr "$PROJECT_DIR/static" "$BUILD_APP/Contents/Resources/static"
chmod +x "$BUILD_APP/Contents/MacOS/FocusQuest"
/usr/bin/codesign --force --deep --sign - "$BUILD_APP"
/usr/bin/codesign --verify --deep --strict "$BUILD_APP"
# Archive the clean, signed bundle before copying into a File Provider folder.
# The archive keeps Finder metadata out of the installed bundle after extraction.
/usr/bin/ditto -c -k --keepParent --norsrc --noextattr "$BUILD_APP" "$STAGING_DIR/专注远征.zip"
/usr/bin/ditto -x -k "$STAGING_DIR/专注远征.zip" "$STAGING_DIR/archive-check"
/usr/bin/codesign --verify --deep --strict "$STAGING_DIR/archive-check/专注远征.app"
cp -X "$STAGING_DIR/专注远征.zip" "$ARCHIVE_PATH"
/usr/bin/ditto --norsrc --noextattr "$BUILD_APP" "$APP_PATH"
# File Provider may add its package FinderInfo again. Normal verification still
# checks the executable and resources; strict verification was done above both
# before compression and after a test extraction outside the synced folder.
/usr/bin/codesign --verify --deep "$APP_PATH"
/usr/bin/touch "$APP_PATH"
echo "已打包：$APP_PATH"
echo "已验证压缩安装包：$ARCHIVE_PATH"
