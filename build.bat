@echo off
setlocal
REM =====================================================================
REM  1 z 9 — jednoklikowy build launchera do .exe
REM  Wymagania:
REM    * Python 3.10+ z pip (python.org)
REM    * Node.js zainstalowany globalnie (npm w PATH)
REM  Efekt: dist\1z9.exe zawiera:
REM    * Python + Tkinter GUI
REM    * server\ (index.js, node_modules, sounds.js, db.js, package.json)
REM    * web\dist\ (zbudowany frontend)
REM    * node\node.exe (portable Node.js — jesli w folderze node\ istnieje)
REM =====================================================================

pushd "%~dp0"

echo.
echo [1/4] Build frontendu (web\)
call npm.cmd --prefix web install
if errorlevel 1 goto :err
call npm.cmd --prefix web run build
if errorlevel 1 goto :err

echo.
echo [2/4] Instalacja zaleznosci backendu (server\)
call npm.cmd --prefix server install
if errorlevel 1 goto :err

echo.
echo [3/4] Instalacja PyInstaller
py -m pip install --upgrade pip pyinstaller >nul
if errorlevel 1 goto :err

echo.
echo [4/4] Pakowanie do .exe
REM --onefile: jeden plik .exe (rozpakowuje sie do temp przy odpaleniu)
REM --windowed: bez czarnego cmd
REM --add-data: bundlujemy zasoby (server, web\dist, node)
REM Node bundlujemy tylko jesli katalog node\ istnieje (patrz README ponizej)
set ADD_NODE=
if exist "node\node.exe" set ADD_NODE=--add-data "node;node"

py -m PyInstaller ^
    --clean ^
    --onefile ^
    --windowed ^
    --name "1z9" ^
    --add-data "server;server" ^
    --add-data "web\dist;web\dist" ^
    %ADD_NODE% ^
    launcher.py
if errorlevel 1 goto :err

echo.
echo ==========================================
echo  Gotowe. Plik: dist\1z9.exe
echo ==========================================
popd
exit /b 0

:err
echo BLAD podczas budowania.
popd
exit /b 1
