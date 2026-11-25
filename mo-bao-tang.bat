@echo off
rem Mo bao tang 3D tren may: chay mot web server nho roi mo trinh duyet.
rem Can Python. Dong cua so nay la tat bao tang.
cd /d "%~dp0"
start "" http://localhost:8766/
python tools\server.py 8766
