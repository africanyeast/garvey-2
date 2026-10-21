#!/bin/bash
# Build Garvey and (re)start it as a launchd service on port 3001.
# First run installs the service; it then starts at login and restarts if it crashes.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=com.garvey.server
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/garvey.log"
BUN="$(command -v bun)"
TARGET="gui/$(id -u)/$LABEL"

cd "$REPO"
"$BUN" run build

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$BUN</string><string>run</string><string>start</string><string>-p</string><string>3001</string></array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$BUN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

if launchctl print "$TARGET" >/dev/null 2>&1; then
  launchctl kickstart -k "$TARGET"
else
  lsof -ti tcp:3001 | xargs kill 2>/dev/null || true   # stray nohup server
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
fi
echo "Garvey running at http://localhost:3001 (log: $LOG)"
