@echo off
rem ============================================================
rem  WomanLive launcher with extension
rem  Reuses the original womanlive.bat environment (bundled Node /
rem  ffmpeg) and only adds the --require preload, so server/index.js
rem  is NOT modified. ASCII only to avoid code page / mojibake issues.
rem ============================================================
cd /d "%~dp0"

if not exist "%~dp0server\ext\preload.js" (
	echo [Error] "server\ext" not found.
	echo Copy the "ext" folder from this package into the "server" folder.
	pause
	exit /b 1
)

if not exist "%~dp0womanlive.bat" (
	echo [Error] "womanlive.bat" not found.
	echo Put this file in the WomanLive root folder ^(next to womanlive.bat^).
	pause
	exit /b 1
)

rem Load the extension without editing server/index.js
set "NODE_OPTIONS=--require=./server/ext/preload.js"

call "%~dp0womanlive.bat"
