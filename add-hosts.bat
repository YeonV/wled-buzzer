@echo off
:: ── Request admin elevation ───────────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

:: ── Add entry if not already present ─────────────────────────────────────
set HOSTS=%SystemRoot%\System32\drivers\etc\hosts
set ENTRY=127.0.0.1   lorains.quiz

findstr /C:"%ENTRY%" "%HOSTS%" >nul 2>&1
if %errorlevel% equ 0 (
  echo Already present: %ENTRY%
) else (
  echo.>> "%HOSTS%"
  echo %ENTRY%>> "%HOSTS%"
  echo Added: %ENTRY%
)

echo.
echo Done! Access the app at: http://lorains.quiz:1303
echo.
pause
