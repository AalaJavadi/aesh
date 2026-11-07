@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Backup-Supabase-Free.ps1"
echo.
echo Press any key to close this window.
pause >nul
