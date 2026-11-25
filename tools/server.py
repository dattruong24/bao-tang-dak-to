r"""Web server nho de mo bao tang va trang quan ly tren may (http://localhost:8766).

http.server mac dinh chi xep hang 5 ket noi, trinh duyet tai nhieu file cung luc se bi tu choi.
no-cache: sau khi chay lai build_content.py, trinh duyet phai lay content.js moi chu khong dung ban cu.

API cho quan-ly.html (chi nghe 127.0.0.1, may khac khong goi duoc):
  POST /api/dang-nhap {"user","password"} -> kiem md5(password) voi tools\tai-khoan.json, cap cookie phien 8 gio
  GET  /api/toi                    -> ten dang nhap cua phien (401 neu chua dang nhap)
  POST /api/dang-xuat
  Can dang nhap:
  GET  /api/noi-dung              -> noi-dung.json
  POST /api/anh?gian=g1&ten=a.jpg  (than = file anh) -> luu vao nguon-anh\g1\, tra {"image": duong dan}
  POST /api/luu                    (than = noi dung moi) -> sao luu ban cu vao sao-luu\, ghi file, chay build
tools\, sao-luu\, nguon-anh\ va noi-dung.json khong phat ra ngoai (file tai khoan nam trong tools\).
"""
import functools
import hashlib
import hmac
import http.cookies
import http.server
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse

# Cua so lenh Windows thuong khong phai UTF-8: in tieng Viet se lam sap request dang xu ly.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT =os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
DATA = os.path.join(ROOT, "noi-dung.json")
BACKUP = os.path.join(ROOT, "sao-luu")
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".avif", ".gif", ".bmp", ".tif", ".tiff", ".pdf"}
MAX_IMAGE = 40 * 1024 * 1024
build_lock = threading.Lock()

ACCOUNTS = os.path.join(ROOT, "tools", "tai-khoan.json")
SESSION_HOURS = 8
COOKIE = "baotang_phien"
sessions = {}            # token -> (user, het han luc)
sessions_lock = threading.Lock()
# Thu muc/file khong bao gio phat ra trinh duyet (file tai khoan, anh goc, sao luu, ma nguon server).
PRIVATE = [os.path.normcase(os.path.realpath(os.path.join(ROOT, p)))
           for p in ("tools", "sao-luu", "nguon-anh", "noi-dung.json")]


def is_private(fs_path):
    """So file THAT ma duong dan tro toi (Windows: khong phan biet hoa/thuong, bo dau cham cuoi ten...),
    khong so chuoi URL, nen /TOOLS/, //tools/, /tools./ deu bi chan."""
    real = os.path.normcase(os.path.realpath(fs_path))
    return any(real == p or real.startswith(p + os.sep) for p in PRIVATE)


def check_login(user, password):
    """Doc lai file tai khoan moi lan (sua file khong can mo lai server). Tra ve (ten, None) hoac (None, ly do)."""
    try:
        with open(ACCOUNTS, encoding="utf-8") as f:
            accounts = json.load(f).get("accounts", [])
    except FileNotFoundError:
        return None, "chưa có file tools\\tai-khoan.json"
    except ValueError as e:
        return None, f"file tai-khoan.json sai định dạng ({e})"
    given = hashlib.md5(password.encode("utf-8")).hexdigest()
    for a in accounts:
        want = str(a.get("md5", "")).strip().lower()
        if a.get("user") == user and re.fullmatch(r"[0-9a-f]{32}", want) and hmac.compare_digest(given, want):
            return user, None
    return None, "sai tên đăng nhập hoặc mật khẩu"


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128


def safe_name(name):
    base, ext = os.path.splitext(os.path.basename(name))
    base = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "", base).strip(" .")[:80] or "anh"
    return base, ext.lower()


def check_data(new):
    """Tra ve ly do sai, hoac None neu dung khuon."""
    with open(DATA, encoding="utf-8") as f:
        old = json.load(f)
    if not isinstance(new, dict) or not isinstance(new.get("galleries"), list):
        return "thiếu danh sách gian"
    if [g.get("id") for g in new["galleries"]] != [g["id"] for g in old["galleries"]]:
        return "danh sách gian bị đổi"
    for g in new["galleries"]:
        if not isinstance(g.get("name"), str) or not g["name"].strip():
            return f"{g['id']}: thiếu tên gian"
        for n, it in enumerate(g.get("items", []), 1):
            img = it.get("image", "")
            full = os.path.normpath(os.path.join(ROOT, img))
            if not img.startswith("nguon-anh/") or not full.startswith(os.path.join(ROOT, "nguon-anh")) \
                    or not os.path.isfile(full):
                return f"{g['id']} ảnh {n}: không thấy file ảnh {img}"
            for k in ("title", "credit"):
                if not isinstance(it.get(k, ""), str):
                    return f"{g['id']} ảnh {n}: {k} sai kiểu"
            for k in ("vi", "en"):
                if not isinstance(it.get(k, []), list) or not all(isinstance(p, str) for p in it.get(k, [])):
                    return f"{g['id']} ảnh {n}: {k} sai kiểu"
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > limit:
            return None
        return self.rfile.read(n)

    def same_origin(self):
        # Chan trang web la goi API nay qua trinh duyet cua chu may.
        origin = self.headers.get("Origin")
        return origin is None or origin in (f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}")

    def current_user(self):
        jar = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        token = jar[COOKIE].value if COOKIE in jar else ""
        with sessions_lock:
            s = sessions.get(token)
            if s and s[1] > time.time():
                return s[0]
            sessions.pop(token, None)
        return None

    def set_cookie(self, token, max_age):
        return f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}"

    def do_GET(self):
        path = urllib.parse.unquote(self.path.split("?")[0])
        if path == "/api/toi":
            user = self.current_user()
            return self.send_json(200 if user else 401, {"user": user})
        if path == "/api/noi-dung":
            if not self.current_user():
                return self.send_json(401, {"error": "chưa đăng nhập"})
            with open(DATA, encoding="utf-8") as f:
                return self.send_json(200, json.load(f))
        return super().do_GET()

    def send_head(self):
        # Moi file tinh (GET va HEAD) di qua day: chan file rieng tu va ten co ":" (luong du lieu NTFS).
        path = urllib.parse.unquote(self.path.split("?")[0].split("#")[0])
        if ":" in path or is_private(self.translate_path(self.path)):
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if not self.same_origin():
            return self.send_json(403, {"error": "không cho phép"})
        if url.path == "/api/dang-nhap":
            return self.login()
        if url.path == "/api/dang-xuat":
            return self.logout()
        user = self.current_user()
        if not user:
            return self.send_json(401, {"error": "chưa đăng nhập hoặc hết phiên, đăng nhập lại"})
        if url.path == "/api/anh":
            return self.upload(urllib.parse.parse_qs(url.query))
        if url.path == "/api/luu":
            print(f"[{time.strftime('%H:%M:%S')}] {user} bấm Lưu")
            return self.save()
        self.send_json(404, {"error": "không có"})

    def login(self):
        raw = self.read_body(10_000)
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except ValueError:
            body = {}
        user, err = check_login(str(body.get("user", "")), str(body.get("password", "")))
        if not user:
            time.sleep(1)  # cham lai de khong do mat khau nhanh duoc
            print(f"[{time.strftime('%H:%M:%S')}] đăng nhập hỏng: {err}")
            return self.send_json(401, {"error": err})
        token = secrets.token_urlsafe(32)
        with sessions_lock:
            sessions[token] = (user, time.time() + SESSION_HOURS * 3600)
        body = json.dumps({"user": user}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Set-Cookie", self.set_cookie(token, SESSION_HOURS * 3600))
        self.end_headers()
        self.wfile.write(body)
        print(f"[{time.strftime('%H:%M:%S')}] {user} đăng nhập")

    def logout(self):
        jar = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        if COOKIE in jar:
            with sessions_lock:
                sessions.pop(jar[COOKIE].value, None)
        self.send_response(200)
        self.send_header("Set-Cookie", self.set_cookie("", 0))
        self.send_header("Content-Length", "0")
        self.end_headers()

    def upload(self, q):
        gid = (q.get("gian") or [""])[0]
        if not re.fullmatch(r"g\d+", gid):
            return self.send_json(400, {"error": "gian sai"})
        base, ext = safe_name((q.get("ten") or [""])[0])
        if ext not in IMAGE_EXT:
            return self.send_json(400, {"error": f"không nhận file {ext or '(không đuôi)'}"})
        data = self.read_body(MAX_IMAGE)
        if data is None:
            return self.send_json(400, {"error": "file rỗng hoặc lớn quá 40 MB"})
        folder = os.path.join(ROOT, "nguon-anh", gid)
        os.makedirs(folder, exist_ok=True)
        name = f"{time.strftime('%Y%m%d-%H%M%S')}-{base}{ext}"
        with open(os.path.join(folder, name), "wb") as f:
            f.write(data)
        self.send_json(200, {"image": f"nguon-anh/{gid}/{name}"})

    def save(self):
        raw = self.read_body(5 * 1024 * 1024)
        try:
            new = json.loads(raw.decode("utf-8")) if raw else None
        except ValueError:
            new = None
        problem = check_data(new) if new is not None else "dữ liệu không đọc được"
        if problem:
            return self.send_json(400, {"error": problem})
        if not build_lock.acquire(blocking=False):
            return self.send_json(409, {"error": "đang cập nhật lần trước, chờ xong rồi lưu lại"})
        try:
            os.makedirs(BACKUP, exist_ok=True)
            stamp = time.strftime("%Y%m%d-%H%M%S")
            os.replace(DATA, os.path.join(BACKUP, f"noi-dung-{stamp}.json"))
            with open(DATA, "w", encoding="utf-8", newline="\n") as f:
                json.dump({"galleries": new["galleries"]}, f, ensure_ascii=False, indent=1)
            r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_content.py")],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=ROOT)
            log = (r.stdout + r.stderr).strip()
            self.send_json(200, {"ok": r.returncode == 0, "log": log, "backup": f"sao-luu/noi-dung-{stamp}.json"})
        finally:
            build_lock.release()


handler = functools.partial(Handler, directory=ROOT)
print(f"Bao tang dang chay tai http://localhost:{PORT}/  (dong cua so nay de tat)")
print(f"Trang quan ly: http://localhost:{PORT}/quan-ly.html")
Server(("127.0.0.1", PORT), handler).serve_forever()
