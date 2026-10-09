@echo off
setlocal
set "URL=https://raw.githubusercontent.com/tkitch1983-sudo/Shiftboard/216e2d120888cae5a75b05f82c45f40fb1cebbfb/public/chester-camera-bridge.ps1"
set "SCRIPT=%TEMP%\chester-camera-bridge-%RANDOM%.ps1"
echo.
echo Shiftboard - Chester Camera Bridge
echo Downloading the setup script from the Shiftboard site...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -OutFile '%SCRIPT%'"
if errorlevel 1 (
  echo.
  echo Could not download the setup script.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "RC=%ERRORLEVEL%"
del "%SCRIPT%" >nul 2>&1
exit /b %RC%
