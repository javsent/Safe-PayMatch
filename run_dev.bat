@echo off
title Safe-PayMatch - Modo Desarrollador
cd /d "%~dp0"
echo Iniciando servidor FastAPI con recarga en caliente...
start python -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload
timeout /t 2 /nobreak > nul
start "" http://127.0.0.1:8000
