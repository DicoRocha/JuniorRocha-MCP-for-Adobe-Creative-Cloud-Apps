@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
if exist logs\done.txt ren logs\done.txt done-previous-%RANDOM%.txt
echo [0/4] npm install...
call npm install --no-audit --no-fund > logs\00-install.log 2>&1
>> logs\00-install.log echo exit=%ERRORLEVEL%
echo [1/4] build...
call npm run build > logs\0-build.log 2>&1
>> logs\0-build.log echo exit=%ERRORLEVEL%
echo [2/4] npm test...
call npm test > logs\1-test.log 2>&1
>> logs\1-test.log echo exit=%ERRORLEVEL%
echo [3/4] install-bridges...
call npm run install-bridges > logs\2-install-bridges.log 2>&1
>> logs\2-install-bridges.log echo exit=%ERRORLEVEL%
echo [4/4] package-plugins...
call npm run package-plugins > logs\3-package-plugins.log 2>&1
>> logs\3-package-plugins.log echo exit=%ERRORLEVEL%
call npm run doctor > logs\4-doctor.log 2>&1
>> logs\4-doctor.log echo exit=%ERRORLEVEL%
echo [extra] Claude Desktop extension package (.mcpb)...
call npm run package-mcpb > logs\5-package-mcpb.log 2>&1
>> logs\5-package-mcpb.log echo exit=%ERRORLEVEL%
echo [extra] Complete download (one zip with every installer)...
call npm run package-complete > logs\6-package-complete.log 2>&1
>> logs\6-package-complete.log echo exit=%ERRORLEVEL%
echo %DATE% %TIME%> logs\done.txt
echo Done. You can close this window. Logs are in the logs folder.
timeout /t 5 > nul
