@echo off
cd /d "%~dp0"
echo.
echo  Starting... Open http://localhost:8000 in your browser. (Close this window to stop)
echo.
start "" http://localhost:8000
where python >nul 2>&1 && (python -m http.server 8000) || (py -m http.server 8000)
pause
