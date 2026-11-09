@echo off
title Compilador de Instalador Safe-PayMatch
cd /d "%~dp0"

echo ============================================================
echo   GENERANDO INSTALADOR .EXE DE SAFE-PAYMATCH
echo ============================================================
echo.

echo [1/3] Compilando binarios de escritorio con PyInstaller...
python packaging/build_desktop.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Fallo la compilacion con PyInstaller.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Empaquetando instalador con Inno Setup...
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" packaging/installer.iss
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Fallo Inno Setup.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================================
echo   INSTALADOR GENERADO EXITOSAMENTE
echo   Ubicacion: installer_output\Safe-PayMatch-Setup-v*.exe
echo ============================================================
echo.
pause
