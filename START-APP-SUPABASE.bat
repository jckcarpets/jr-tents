@echo off
title J&R TENTS (Supabase cloud database)
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python is not installed on this computer.
  echo Download it free from: https://www.python.org/downloads/
  echo IMPORTANT: during installation, tick the box "Add python.exe to PATH"
  echo Then run this file again.
  echo.
  pause
  exit /b
)

if "%SUPABASE_DB_URL%"=="" (
  echo.
  echo Paste your Supabase connection string below and press Enter.
  echo It looks like: postgresql://postgres.xxxx:YOURPASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres
  echo ^(Get it from the Connect button in your Supabase dashboard - Session pooler^)
  echo.
  set /p SUPABASE_DB_URL=Connection string:
)

echo Installing requirements (first run only)...
python -m pip install --quiet flask psycopg2-binary

echo.
echo Starting J^&R TENTS with your cloud database...
echo Open your browser at:  http://localhost:5000
echo (Press Ctrl+C in this window to stop the app)
echo.
start "" http://localhost:5000
python app_supabase.py
pause
