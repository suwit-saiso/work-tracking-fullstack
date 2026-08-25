@echo off
title Office Work Tracking Server
cd /d "%~dp0"
echo ==========================================
echo Office Work Tracking
echo ==========================================
echo.
echo Starting server on port 3000...
echo Open from another PC:
echo http://YOUR-OFFICE-LAPTOP-IP:3000
echo.
npm start --prefix backend
pause
