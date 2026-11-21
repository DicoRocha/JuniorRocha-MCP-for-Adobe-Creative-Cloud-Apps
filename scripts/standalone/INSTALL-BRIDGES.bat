@echo off
setlocal
rem Junior Rocha MCP - installs the bridges for After Effects, Illustrator and Lightroom Classic.
rem No Node.js needed. Close the apps first. Photoshop, Premiere Pro and InDesign use the .ccx files instead.
cd /d "%~dp0"

set "CEP=%APPDATA%\Adobe\CEP\extensions\com.jradbmcp.universal"
set "LR=%APPDATA%\Adobe\Lightroom\Modules\JrAdbMcpBridge.lrplugin"

if not exist "com.jradbmcp.universal\CSXS\manifest.xml" (
  echo The folder com.jradbmcp.universal is missing. Extract the whole zip before running this file.
  pause
  exit /b 1
)

echo Installing the panel for After Effects and Illustrator...
if exist "%CEP%" rmdir /s /q "%CEP%"
xcopy "com.jradbmcp.universal" "%CEP%\" /e /i /h /y /q >nul
if errorlevel 1 (
  echo Could not copy to %CEP%
  pause
  exit /b 1
)

rem The panel is not signed, so the apps load it only with the CEP debug mode on.
for %%V in (9 10 11 12 13 14) do reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1

echo Installing the Lightroom Classic plug-in...
if exist "%LR%" rmdir /s /q "%LR%"
xcopy "JrAdbMcpBridge.lrplugin" "%LR%\" /e /i /h /y /q >nul
if errorlevel 1 echo Could not copy to %LR% (skip this if you do not use Lightroom Classic)

echo.
echo Done. Restart After Effects, Illustrator and Lightroom Classic.
echo The panel is listed as "Junior Rocha MCP" under Window ^> Extensions; you do not need to open it.
pause
