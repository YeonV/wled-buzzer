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

:: ── Embed icon via rcedit ─────────────────────────────────────────────────
if exist "%~dp0icon.ico" (
  "%~dp0backend\node_modules\rcedit\bin\rcedit-x64.exe" "%~dp0dist\wled-buzzer.exe" --set-icon "%~dp0icon.ico"
  if errorlevel 1 (
    echo  WARNING: Icon embedding failed, exe will use default icon.
  )
)
if not exist "%~dp0icon.ico" echo  NOTE: No icon.ico found, skipping icon embed.
if errorlevel 1 (
  echo.
  echo  ERROR: pkg packaging failed!
  echo  Tip: if you see "bytecode" errors, try:
  echo       npx pkg server.js --targets node18-win-x64 --no-bytecode --public --output ..\dist\wled-buzzer.exe
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

set /p OPEN="Open dist\ folder now? [Y/n]: "
if /i not "%OPEN%"=="n" explorer "%~dp0dist"

endlocal
