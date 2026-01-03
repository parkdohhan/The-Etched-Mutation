@echo off
chcp 65001 >nul
cd /d "%~dp0portfolio-site"
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)
call npx next dev

