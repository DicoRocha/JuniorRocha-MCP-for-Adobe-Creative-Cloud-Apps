#!/bin/bash
# macOS: equivalente do SETUP.bat (escrito em 19/11/2026, ainda NAO validado num Mac).
# Dois cliques no Finder. Se o macOS recusar: chmod +x SETUP.command
cd "$(dirname "$0")" || exit 1
mkdir -p logs
[ -f logs/done.txt ] && mv logs/done.txt "logs/done-previous-$RANDOM.txt"
run() { # run <rotulo> <arquivo de log> <comando...>
  echo "$1"; local log="$2"; shift 2
  "$@" > "$log" 2>&1; echo "exit=$?" >> "$log"
}
run "[0/4] npm install..."      logs/00-install.log         npm install --no-audit --no-fund
run "[1/4] build..."            logs/0-build.log            npm run build
run "[2/4] npm test..."         logs/1-test.log             npm test
run "[3/4] install-bridges..."  logs/2-install-bridges.log  npm run install-bridges
run "[4/4] package-plugins..."  logs/3-package-plugins.log  npm run package-plugins
run "doctor..."                 logs/4-doctor.log           npm run doctor
run "mcpb package..."           logs/5-package-mcpb.log     npm run package-mcpb
date > logs/done.txt
echo "Done. You can close this window. Logs are in the logs folder."
