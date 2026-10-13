@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-webui.ps1" %*
set "launch_exit_code=%errorlevel%"
echo.
echo If the browser did not open, visit http://127.0.0.1:5173/
pause
exit /b %launch_exit_code%
