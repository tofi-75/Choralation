@echo off
setlocal
rem Project task launcher for terminals that block direct .ps1 execution.
rem Bypass applies only to this child process; no saved execution policy changes.
rem Keep paths quoted so the project also works in directories containing spaces.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1" %*
exit /b %errorlevel%
