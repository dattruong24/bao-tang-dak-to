@echo off
rem Cai dat lan dau cho nguoi sua bao tang. Chay lai bao nhieu lan cung duoc: buoc nao xong roi thi bo qua.
rem Chay duoc ca khi chi co rieng file nay (tai tu web): se tu tai repo ve thu muc ben canh.
chcp 65001 >nul
setlocal EnableDelayedExpansion
set "REPO_URL=https://github.com/dattruong24/bao-tang-dak-to.git"
echo.
echo ===== CÀI ĐẶT LẦN ĐẦU: QUẢN LÝ BẢO TÀNG ĐĂK TÔ - TÂN CẢNH =====
echo.

rem ---------- 1. Git ----------
echo [1/6] Kiểm tra Git...
where git >nul 2>nul
if errorlevel 1 (
  echo    Chưa có Git. Đang cài Git ^(có thể hỏi quyền, bấm Yes^)...
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto :no_winget
  echo.
  echo    Đã cài Git. ĐÓNG cửa sổ này rồi bấm đúp lại cai-dat-lan-dau.bat để làm tiếp.
  goto :end
)
echo    OK

rem ---------- 2. Python ----------
echo [2/6] Kiểm tra Python...
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>nul
if errorlevel 1 (
  echo    Chưa có Python ^(hoặc bản quá cũ^). Đang cài Python 3.12...
  winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto :no_winget
  echo.
  echo    Đã cài Python. ĐÓNG cửa sổ này rồi bấm đúp lại cai-dat-lan-dau.bat để làm tiếp.
  goto :end
)
echo    OK

rem ---------- 3. Goi Python ----------
echo [3/6] Cài gói Python ^(Pillow để xử lý ảnh, edge-tts để tạo giọng đọc^)...
python -m pip install --quiet --disable-pip-version-check --upgrade pillow edge-tts
if errorlevel 1 (
  echo    LỖI: không cài được gói Python. Kiểm tra mạng rồi chạy lại file này.
  goto :end
)
echo    OK

rem ---------- 4. Ten va email cho Git ----------
echo [4/6] Tên và email ghi vào mỗi lần lưu...
set "GNAME="
set "GMAIL="
for /f "delims=" %%a in ('git config --global user.name 2^>nul') do set "GNAME=%%a"
for /f "delims=" %%a in ('git config --global user.email 2^>nul') do set "GMAIL=%%a"
if not defined GNAME (
  set /p "GNAME=   Nhập tên của bạn (ví dụ: Nguyen Van A): "
  if not defined GNAME set "GNAME=Nguoi sua bao tang"
  git config --global user.name "!GNAME!"
)
if not defined GMAIL (
  set /p "GMAIL=   Nhập email tài khoản GitHub của bạn: "
  if not defined GMAIL set "GMAIL=khong-co@example.com"
  git config --global user.email "!GMAIL!"
)
echo    OK: !GNAME! ^<!GMAIL!^>

rem ---------- 5. Tai repo ----------
echo [5/6] Thư mục bảo tàng...
if exist "%~dp0museum.js" (
  set "REPO=%~dp0"
  echo    Đang ở trong thư mục bảo tàng. Lấy bản mới nhất...
  git -C "%~dp0." pull --ff-only
) else if exist "%~dp0bao-tang-dak-to\museum.js" (
  set "REPO=%~dp0bao-tang-dak-to\"
  echo    Đã có thư mục bao-tang-dak-to. Lấy bản mới nhất...
  git -C "%~dp0bao-tang-dak-to" pull --ff-only
) else (
  echo    Đang tải bảo tàng về %~dp0bao-tang-dak-to ^(khoảng 100 MB, chờ vài phút^)...
  git clone "%REPO_URL%" "%~dp0bao-tang-dak-to"
  if errorlevel 1 (
    echo    LỖI: không tải được. Kiểm tra mạng rồi chạy lại file này.
    goto :end
  )
  set "REPO=%~dp0bao-tang-dak-to\"
)

rem ---------- 6. Dang nhap GitHub + kiem quyen ghi ----------
echo [6/6] Đăng nhập GitHub và kiểm tra quyền sửa...
echo    Nếu hiện cửa sổ GitHub, chọn "Sign in with your browser" và đăng nhập.
git -C "!REPO!." push --dry-run >nul 2>"%TEMP%\baotang-push.txt"
if errorlevel 1 (
  echo.
  echo    CHƯA CÓ QUYỀN ĐĂNG LÊN WEB. Thông báo từ GitHub:
  type "%TEMP%\baotang-push.txt"
  echo.
  echo    Thường là do: chưa được mời vào repo, chưa bấm Accept lời mời ^(xem email^),
  echo    hoặc đăng nhập nhầm tài khoản GitHub. Xử lý xong thì chạy lại file này.
  echo    ^(Vẫn mở trang quản lý xem được, nhưng bấm Lưu sẽ không lên web.^)
  goto :end
)
echo    OK: tài khoản này được phép đăng lên web.

echo.
echo ===== XONG =====
echo Từ giờ mỗi lần sửa: bấm đúp mo-quan-ly.bat trong thư mục
echo    !REPO!
echo.
set "OPEN="
set /p "OPEN=Mở trang quản lý ngay bây giờ? (c/k): "
if /i "!OPEN!"=="c" (
  start "" explorer "!REPO!."
  call "!REPO!mo-quan-ly.bat"
)
goto :end

:no_winget
echo.
echo    Máy không tự cài được ^(thiếu winget hoặc bị chặn^). Cài tay rồi chạy lại file này:
echo      Git:    https://git-scm.com/download/win
echo      Python: https://www.python.org/downloads/  ^(nhớ tích "Add Python to PATH"^)

:end
echo.
pause
