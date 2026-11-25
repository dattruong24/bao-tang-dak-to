@echo off
rem Mo trang quan ly bao tang (sua anh, ten anh, nguon, loi gioi thieu). Can Python.
rem Dong cua so nay la tat ca bao tang lan trang quan ly.
cd /d "%~dp0"
start "" http://localhost:8766/quan-ly.html
python tools\server.py 8766
