@echo off
setlocal
title WLED Buzzer - Builder
color 0A

echo ============================================
echo   WLED Buzzer Builder
echo ============================================
echo.

:: ── 1. Build frontend ──────────────────────────────────────────────────────
echo [1/4] Building React frontend...
cd "%~dp0frontend"
call npm run build
if errorlevel 1 (
  echo.
  echo  ERROR: Frontend build failed!
  pause & exit /b 1
)
cd "%~dp0"

:: ── 2. Install backend deps ────────────────────────────────────────────────
echo.
echo [2/4] Installing backend dependencies...
cd "%~dp0backend"
call npm install
if errorlevel 1 (
  echo.
  echo  ERROR: npm install failed!
  pause & exit /b 1
)

:: ── 3. Package with pkg ────────────────────────────────────────────────────
echo.
echo [3/4] Packaging backend into .exe (this may take a minute)...
if not exist "%~dp0dist" mkdir "%~dp0dist"
call npx pkg server.js --targets node18-win-x64 --output "%~dp0dist\wled-buzzer.exe"
if errorlevel 1 (
  echo.
  echo  ERROR: pkg packaging failed!
  pause & exit /b 1
)
cd "%~dp0"

:: ── 4. Copy frontend assets next to the exe ───────────────────────────────
echo.
echo [4/4] Copying frontend assets to dist\public\...
if not exist "%~dp0dist\public" mkdir "%~dp0dist\public"
xcopy /E /I /Y "%~dp0frontend\dist" "%~dp0dist\public" >nul

:: ── Copy audio files if they exist in frontend/public ─────────────────────
if exist "%~dp0frontend\public\*.mp3" (
  xcopy /Y "%~dp0frontend\public\*.mp3" "%~dp0dist\public\" >nul
)

echo.
echo ============================================
echo   Build complete!
echo ============================================
echo.
echo   dist\wled-buzzer.exe   ^<- double-click to run
echo   dist\public\            ^<- frontend assets
echo.

:: ── Bundle certs if they exist ────────────────────────────────────────────────────────────
if exist "%~dp0certs\cert.pem" (
  if not exist "%~dp0dist\certs" mkdir "%~dp0dist\certs"
  copy /Y "%~dp0certs\cert.pem" "%~dp0dist\certs\cert.pem" >nul
  copy /Y "%~dp0certs\key.pem"  "%~dp0dist\certs\key.pem"  >nul
  echo   dist\certs\             ^<- TLS cert bundled
)

:: ── Bundle add-hosts.bat so users can run it from dist ──────────────────────────────
copy /Y "%~dp0add-hosts.bat" "%~dp0dist\add-hosts.bat" >nul
echo   dist\add-hosts.bat      ^<- run once to enable https://lorains.quiz:1303
echo.
