@echo off
rem Starts the OBSIDIAN site on http://localhost:4173/jet/ and opens it in your browser.
rem Keep this window open while you use the site; close it to stop the server.
cd /d "%~dp0"
start "" http://localhost:4173/jet/
node server.js
pause
