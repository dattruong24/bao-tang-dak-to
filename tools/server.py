r"""Web server nho de mo bao tang va trang quan ly tren may (http://localhost:8766).

http.server mac dinh chi xep hang 5 ket noi, trinh duyet tai nhieu file cung luc se bi tu choi.
no-cache: sau khi chay lai build_content.py, trinh duyet phai lay content.js moi chu khong dung ban cu.

Khong co dang nhap (chu nha bo 2026-11-26): ai sua duoc bao tang tren mang la do quyen ghi vao repo GitHub.
API cho quan-ly.html (chi nghe 127.0.0.1, may khac khong goi duoc):
  GET  /api/noi-dung              -> noi-dung.json
  POST /api/anh?gian=g1&ten=a.jpg  (than = file anh) -> luu vao nguon-anh\g1\, tra {"image": duong dan}
  POST /api/luu                    (than = noi dung moi) -> sao luu ban cu vao sao-luu\, ghi file, chay build,
                                      roi commit + push len GitHub (GitHub Pages tu cap nhat sau 1-2 phut)
Khi mo server: git pull de lay ban moi nhat. Truoc moi lan Luu: co ai vua day ban moi thi lay ve va bao tai lai trang,
de khong ghi de phan nguoi khac vua sua.
tools\, sao-luu\, nguon-anh\ va noi-dung.json khong phat ra trinh duyet o may nay.
"""
import functools
import http.server
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse

# Cua so lenh Windows thuong khong phai UTF-8: in tieng Viet se lam sap request dang xu ly.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
DATA = os.path.join(ROOT, "noi-dung.json")
BACKUP = os.path.join(ROOT, "sao-luu")
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".avif", ".gif", ".bmp", ".tif", ".tiff", ".pdf"}
MAX_IMAGE = 40 * 1024 * 1024
build_lock = threading.Lock()

# Chi nhung duong dan nay duoc commit khi bam Luu (sao-luu\ va file rieng khac trong may khong bi day len).
PUBLISH = ["noi-dung.json", "content.js", "assets", "nguon-anh"]
# Thu muc/file khong bao gio phat ra trinh duyet (anh goc, sao luu, ma nguon server).
PRIVATE = [os.path.normcase(os.path.realpath(os.path.join(ROOT, p)))
           for p in ("tools", "sao-luu", "nguon-anh", "noi-dung.json")]


def is_private(fs_path):
    """So file THAT ma duong dan tro toi (Windows: khong phan biet hoa/thuong, bo dau cham cuoi ten...),
    khong so chuoi URL, nen /TOOLS/, //tools/, /tools./ deu bi chan."""
    real = os.path.normcase(os.path.realpath(fs_path))
    return any(real == p or real.startswith(p + os.sep) for p in PRIVATE)


def now():
    return time.strftime("%H:%M:%S")


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=ROOT)
    return r.returncode, (r.stdout + r.stderr).strip()


def remote_news():
    """Co nguoi khac vua day ban moi len GitHub thi lay ve truoc khi luu, de khong ghi de phan cua ho.
    Tra ve ly do (chuoi) neu trang phai tai lai; None neu luu tiep duoc."""
    code, out = git("fetch", "--quiet")
    if code != 0:
        print(f"[{now()}] không kiểm tra được GitHub (mất mạng?): {out}")
        return None  # mat mang: van cho luu tren may; buoc push se bao loi
    code, n = git("rev-list", "--count", "HEAD..@{u}")
    if code != 0 or n.strip() == "0":
        return None
    code, out = git("pull", "--ff-only", "--quiet")
    if code != 0:
        return "Có người vừa đăng bản mới lên GitHub nhưng máy này lấy về không được:\n" + out
    return ("Có người vừa đăng bản mới lên GitHub. Máy đã lấy bản mới về. Bấm F5 tải lại trang "
            "rồi sửa lại phần của bạn (phần vừa sửa chưa được lưu).")


def publish():
    """Commit cac file cua bao tang roi push. GitHub Pages tu dung lai trang khi nhan push.
    Tra ve (da_len_web, nhat_ky)."""
    git("add", "-A", "--", *PUBLISH)
    code, _ = git("diff", "--cached", "--quiet")
    if code != 0:
        code, out = git("commit", "-m", "Cập nhật nội dung từ trang quản lý")
        if code != 0:
            return False, "Không commit được:\n" + out
    else:
        code, n = git("rev-list", "--count", "@{u}..HEAD")
        if code == 0 and n.strip() == "0":
            return True, "Không có gì mới để đăng."
    code, out = git("push")
    if code != 0:
        return False, ("Đã lưu trên máy nhưng CHƯA đăng lên web (push lỗi). Kiểm tra mạng và quyền ghi vào repo, "
                       "rồi bấm Lưu lần nữa để đăng lại.\n" + out)
    return True, "Đã đẩy lên GitHub. Trang web tự cập nhật sau khoảng 1-2 phút.\n" + out


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

    def do_GET(self):
        path = urllib.parse.unquote(self.path.split("?")[0])
        if path == "/api/noi-dung":
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
        if url.path == "/api/anh":
            return self.upload(urllib.parse.parse_qs(url.query))
        if url.path == "/api/luu":
            print(f"[{now()}] bấm Lưu")
            return self.save()
        self.send_json(404, {"error": "không có"})

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
            behind = remote_news()
            if behind:
                return self.send_json(409, {"error": behind})
            os.makedirs(BACKUP, exist_ok=True)
            stamp = time.strftime("%Y%m%d-%H%M%S")
            os.replace(DATA, os.path.join(BACKUP, f"noi-dung-{stamp}.json"))
            with open(DATA, "w", encoding="utf-8", newline="\n") as f:
                json.dump({"galleries": new["galleries"]}, f, ensure_ascii=False, indent=1)
            r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_content.py")],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=ROOT)
            log = (r.stdout + r.stderr).strip()
            if r.returncode != 0:
                pushed, plog = False, "Chưa đăng lên web vì bước build bị lỗi (xem ở trên). Sửa xong bấm Lưu lại."
            else:
                pushed, plog = publish()
            print(f"[{now()}] {plog.splitlines()[0]}")
            self.send_json(200, {"ok": r.returncode == 0, "pushed": pushed,
                                 "log": f"{log}\n\n--- Đăng lên web ---\n{plog}",
                                 "backup": f"sao-luu/noi-dung-{stamp}.json"})
        finally:
            build_lock.release()


code, out = git("pull", "--ff-only")
if code == 0:
    print("Lấy bản mới nhất từ GitHub: " + (out or "ok"))
else:
    print("CHÚ Ý: chưa lấy được bản mới từ GitHub (mất mạng, hoặc máy có thay đổi chưa đăng):\n" + out)
handler = functools.partial(Handler, directory=ROOT)
print(f"Bao tang dang chay tai http://localhost:{PORT}/  (dong cua so nay de tat)")
print(f"Trang quan ly: http://localhost:{PORT}/quan-ly.html")
Server(("127.0.0.1", PORT), handler).serve_forever()
