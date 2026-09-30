#!/bin/bash
# Sets up playwright-cli (used by .claude/skills/playwright-cli) in Claude Code on the web.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v playwright-cli >/dev/null 2>&1; then
  npm install -g @playwright/cli@latest
fi

# The CLI defaults to Google Chrome, which isn't installed in the web container;
# point it at the pre-installed Playwright Chromium via the global config.
CHROMIUM="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium"
if [ -x "$CHROMIUM" ]; then
  mkdir -p "$HOME/.playwright"
  cat > "$HOME/.playwright/cli.config.json" <<JSON
{ "browser": { "browserName": "chromium", "launchOptions": { "channel": "chromium", "executablePath": "$CHROMIUM" } } }
JSON
fi
