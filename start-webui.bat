@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-webui.ps1"
echo.
echo If the browser did not open, visit http://127.0.0.1:5173/
pause
