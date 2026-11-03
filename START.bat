@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting VML RECOVER at http://localhost:3000
call npm run dev
pause
