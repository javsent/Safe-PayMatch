@echo off
title Safe-PayMatch - Conciliador de Condominios
cd /d "%~dp0"
echo ==================================================
echo  Iniciando Safe-PayMatch...
echo ==================================================
python run.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocurrio un inconveniente al iniciar. Presiona una tecla para salir.
    pause
)
