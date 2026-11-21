#!/bin/bash
# JuniorRocha MCP for Adobe Creative Cloud - installer for the ChatGPT desktop app (macOS).
cd "$(dirname "$0")" || exit 1
# a double-clicked script may not load the PATH where Homebrew or the Node installer put node
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is needed. Get it from https://nodejs.org and run this file again."
  read -r -p "Press Enter to close."
  exit 1
fi
node install-chatgpt.mjs
read -r -p "Press Enter to close."
