@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.19 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\tsx\dist\cli.mjs" (
  echo Run npm ci --ignore-scripts in this folder first.
  pause
  exit /b 1
)
echo Open http://localhost:3000/ in your browser.
echo Keep this window open. Press Ctrl+C to stop the proxy.
call npm start
if errorlevel 1 pause
