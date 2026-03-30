@echo off
:: ── Request admin elevation ───────────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

:: ── Install mkcert if missing ─────────────────────────────────────────────
where mkcert >nul 2>&1
if %errorlevel% neq 0 (
  echo mkcert not found. Installing via winget...
  winget install FiloSottile.mkcert --silent
  if errorlevel 1 (
    echo  ERROR: winget install failed. Install mkcert manually:
    echo    winget install FiloSottile.mkcert
    pause & exit /b 1
  )
  :: Reload PATH so mkcert is available in this session
  for /f "usebackq tokens=2*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH`) do set SYSPATH=%%B
  for /f "usebackq tokens=2*" %%A in (`reg query "HKCU\Environment" /v PATH 2^>nul`) do set USERPATH=%%B
  set "PATH=%SYSPATH%;%USERPATH%"
  echo.
)

:: ── Add hosts entry if not already present ───────────────────────────────
set HOSTS=%SystemRoot%\System32\drivers\etc\hosts
set ENTRY=127.0.0.1   buzzer.local

findstr /C:"%ENTRY%" "%HOSTS%" >nul 2>&1
if %errorlevel% equ 0 (
  echo Already present: %ENTRY%
) else (
  echo.>> "%HOSTS%"
  echo %ENTRY%>> "%HOSTS%"
  echo Added: %ENTRY%
)

:: ── Install local CA (one-time) ───────────────────────────────────────────
echo.
echo Installing local CA (one-time, may prompt)...
mkcert -install

:: ── Generate certificate ──────────────────────────────────────────────────
echo.
echo Generating certificate for buzzer.local...
if not exist "%~dp0certs" mkdir "%~dp0certs"
cd /d "%~dp0certs"
mkcert -cert-file cert.pem -key-file key.pem buzzer.local localhost 127.0.0.1
if errorlevel 1 (
  echo  ERROR: mkcert failed.
  pause & exit /b 1
)
echo  Cert written to: %~dp0certs\cert.pem
echo  Key  written to: %~dp0certs\key.pem

:: ── Open firewall ports for LAN access ────────────────────────────────────
echo.
echo Opening firewall ports for WLED Buzzer...
netsh advfirewall firewall show rule name="WLED Buzzer Web" >nul 2>&1
if %errorlevel% equ 0 (
  echo   Port 1303 ^(web / socket.io^): rule already exists.
) else (
  netsh advfirewall firewall add rule name="WLED Buzzer Web" dir=in action=allow protocol=TCP localport=1303
  echo   Port 1303 ^(web / socket.io^): firewall rule added.
)
netsh advfirewall firewall show rule name="WLED Buzzer MQTT" >nul 2>&1
if %errorlevel% equ 0 (
  echo   Port 1883 ^(MQTT broker^): rule already exists.
) else (
  netsh advfirewall firewall add rule name="WLED Buzzer MQTT" dir=in action=allow protocol=TCP localport=1883
  echo   Port 1883 ^(MQTT broker^): firewall rule added.
)

echo.
echo ============================================
echo   Done!
echo ============================================
echo   Open your browser at: https://buzzer.local:1303
echo   (wled-buzzer.exe must be running)
echo   Other devices on your LAN can connect at:
echo   https://^<your-ip^>:1303
echo.
pause
