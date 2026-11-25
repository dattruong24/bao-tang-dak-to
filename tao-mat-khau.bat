@echo off
rem Tinh ma md5 cua mat khau cho trang quan ly. Chep ma vao tools\tai-khoan.json.
cd /d "%~dp0"
python tools\tao_md5.py
echo.
pause
