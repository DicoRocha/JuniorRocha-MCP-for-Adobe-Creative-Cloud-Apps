#!/bin/bash
# macOS: equivalente do ADD-TO-CLAUDE-DESKTOP.bat (escrito em 19/11/2026, ainda NAO validado num Mac).
cd "$(dirname "$0")" || exit 1
node "scripts/install-claude-desktop.mjs"
echo "Quit and reopen Claude Desktop to load the server."
