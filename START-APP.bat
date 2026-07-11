@echo off
title J&R TENTS
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

echo Installing requirements (first run only)...
python -m pip install --quiet flask

echo.
echo Starting J^&R TENTS... keep this window open while using the app.
echo Open your browser at:  http://localhost:5000
echo (Press Ctrl+C in this window to stop the app)
echo.
start "" http://localhost:5000
python app.py
pause
