@echo off
cd /d "%~dp0"
node "scripts\diagnose-claude-desktop.mjs"
echo.
echo Result written to logs\claude-desktop-diagnosis.txt
timeout /t 8 > nul
