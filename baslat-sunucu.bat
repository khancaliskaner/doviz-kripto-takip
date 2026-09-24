@echo off
rem Alarm sunucusunu baslatir. Cift tikla, pencereyi ACIK BIRAK (kapatirsan sunucu durur).
rem Sonra tarayicida http://localhost:8787 adresini ac; "Fiyat Alarmlari" panelinden sunucu takibini ac.
rem
rem Node.js kurulu degilse VS Code un icindeki Node kullanilir (ekstra kurulum gerekmez).
rem Telefondan/baska cihazdan erismek icin: set HOST=0.0.0.0  (bkz. README, guvenlik notu)

setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "RUNNER="

where node >nul 2>nul
if not errorlevel 1 set "RUNNER=node"

if not defined RUNNER if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe" (
  set "RUNNER=%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"
  set "ELECTRON_RUN_AS_NODE=1"
)
if not defined RUNNER if exist "%ProgramFiles%\Microsoft VS Code\Code.exe" (
  set "RUNNER=%ProgramFiles%\Microsoft VS Code\Code.exe"
  set "ELECTRON_RUN_AS_NODE=1"
)

if not defined RUNNER (
  echo.
  echo Node.js bulunamadi. Su adresten Node.js LTS kurup tekrar dene: https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo Alarm sunucusu baslatiliyor...
"%RUNNER%" server\server.js
echo.
echo Sunucu durdu.
pause
