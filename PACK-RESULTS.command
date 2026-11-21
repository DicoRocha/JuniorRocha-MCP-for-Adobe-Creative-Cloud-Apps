#!/bin/bash
# macOS: packs what must go back after the Mac validation into ONE zip on the Desktop.
# Run it at the end, whatever the result (all passed, some failed, or setup did not even finish).
# Double-click in Finder, or:  ./PACK-RESULTS.command
# Written on 20/11/2026, not yet validated on a Mac. If it fails, zip by hand:
#   mac-validation/RESULTS.md + logs/ + this project folder without node_modules.
cd "$(dirname "$0")" || exit 1
PROJECT="$(pwd)"
STAMP="$(date +%Y%m%d-%H%M)"
NAME="jr-adb-mcp-mac-results-$STAMP"
DEST="${1:-$HOME/Desktop}"
[ -d "$DEST" ] || DEST="$HOME"
WORK="$(mktemp -d)"
OUT="$WORK/$NAME"
mkdir -p "$OUT/logs" "$OUT/project"

# 1) the filled results sheet (the copy inside the project is the one to fill in)
if [ -f mac-validation/RESULTS.md ]; then cp mac-validation/RESULTS.md "$OUT/RESULTS.md"; else echo "RESULTS.md not found in mac-validation/" > "$OUT/RESULTS-MISSING.txt"; fi

# 2) every setup log
if [ -d logs ]; then cp -R logs/. "$OUT/logs/" 2>/dev/null; fi

# 3) environment, so the result can be read without asking
{
  echo "date: $(date)"
  echo "macOS: $(sw_vers -productVersion 2>/dev/null) ($(uname -m))"
  echo "node: $(node -v 2>/dev/null)"
  echo "npm: $(npm -v 2>/dev/null)"
  echo "project: $PROJECT"
  echo "package version: $(grep -m1 '"version"' package.json 2>/dev/null)"
  echo "adobe apps:"; ls -d /Applications/Adobe* 2>/dev/null
} > "$OUT/environment.txt"

# 4) the project as it is now (code fixes included), without what can be rebuilt
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude node_modules --exclude dist --exclude release --exclude temp --exclude .git --exclude logs --exclude '*.mcpb' ./ "$OUT/project/"
else
  tar -cf - --exclude ./node_modules --exclude ./dist --exclude ./release --exclude ./temp --exclude ./.git --exclude ./logs . | (cd "$OUT/project" && tar -xf -)
fi

ZIP="$DEST/$NAME.zip"
if (cd "$WORK" && zip -qr "$ZIP" "$NAME"); then
  echo ""
  echo "Done. Send this file back:"
  echo "  $ZIP"
  command -v open >/dev/null 2>&1 && open -R "$ZIP" 2>/dev/null
else
  echo "Could not create the zip. Folder left at: $OUT"
  exit 1
fi
rm -rf "$WORK"
