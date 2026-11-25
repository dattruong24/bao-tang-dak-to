r"""Dung bao tang tu noi-dung.json (file nay do trang quan ly ghi; co the sua tay neu can).

Chay:  python tools\build_content.py   (trang quan ly tu chay khi bam Luu)
- Anh goc trong nguon-anh\ -> JPG treo tuong (1024px) + ban lon (2048px) vao assets\tranh\.
  Ten file theo anh goc, nen chi doi anh moi/anh da thay; file khong con dung bi xoa.
- Giong doc mp3 (Edge TTS, can mang) vao assets\giong\, cung cach: chi doc lai doan da doi.
  Mat mang thi doan do khong co nut loa, build van chay.
- Ghi ra content.js (khong sua tay).
Anh dang ".pdf" = lay trang 1 cua file PDF scan.
"""
import hashlib
import io
import json
import os
import re
import struct
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "noi-dung.json")
OUT_IMG = os.path.join(HERE, "assets", "tranh")
OUT_AUDIO = os.path.join(HERE, "assets", "giong")

# Giong doc chu thich (chu nha chon 2026-11-25): Viet = HoaiMy cham 8%, tram hon; Anh = Sonia (giong Anh).
VOICES = {
    "vi": ["--voice", "vi-VN-HoaiMyNeural", "--rate=-8%", "--pitch=-5Hz"],
    "en": ["--voice", "en-GB-SoniaNeural", "--rate=-5%"],
}

WALL_PX = 1024   # texture on the wall
FULL_PX = 2048   # image opened in the viewer


def pdf_first_page(path):
    """First page of a scanned PDF: its CCITT G4 image wrapped as a TIFF for Pillow."""
    data = open(path, "rb").read()
    for m in re.finditer(rb"(\d+) 0 obj\s*<<(.*?)>>\s*stream\r?\n", data, re.S):
        d = m.group(2)
        if b"CCITTFax" not in d:
            continue
        ref = re.search(rb"/Length (\d+) 0 R", d)
        length = int(re.search(rb"%s 0 obj\s*(\d+)" % ref.group(1), data).group(1)) if ref \
            else int(re.search(rb"/Length (\d+)", d).group(1))
        stream = data[m.end():m.end() + length]
        w = int(re.search(rb"/Width (\d+)", d).group(1))
        h = int(re.search(rb"/Height (\d+)", d).group(1))
        tags = [(256, 4, w), (257, 4, h), (258, 3, 1), (259, 3, 4), (262, 3, 0), (273, 4, 0),
                (277, 3, 1), (278, 4, h), (279, 4, len(stream))]
        offset = 8 + 2 + 12 * len(tags) + 4
        ifd = struct.pack("<H", len(tags))
        for tag, typ, val in tags:
            val = offset if tag == 273 else val
            ifd += struct.pack("<HHI", tag, typ, 1)
            ifd += struct.pack("<HH", val, 0) if typ == 3 else struct.pack("<I", val)
        tif = b"II*\x00" + struct.pack("<I", 8) + ifd + b"\x00\x00\x00\x00" + stream
        return Image.open(io.BytesIO(tif)).convert("RGB")
    raise ValueError(f"no scanned page in {path}")


def build_image(gid, rel):
    """JPG tuong + ban lon cho 1 anh goc; ten theo noi dung file goc nen anh khong doi thi khong lam lai."""
    src = os.path.join(HERE, rel)
    with open(src, "rb") as f:
        digest = hashlib.sha1(f.read()).hexdigest()[:12]
    base = os.path.join(OUT_IMG, gid, digest)
    if not (os.path.exists(base + ".jpg") and os.path.exists(base + "-lon.jpg")):
        img = pdf_first_page(src) if src.lower().endswith(".pdf") else Image.open(src)
        img = img.convert("RGB")
        for px, suffix in ((WALL_PX, ""), (FULL_PX, "-lon")):
            copy = img.copy()
            copy.thumbnail((px, px), Image.LANCZOS)
            copy.save(f"{base}{suffix}.jpg", quality=84, optimize=True, progressive=True)
    with Image.open(base + ".jpg") as im:
        w, h = im.size
    rel_out = f"assets/tranh/{gid}/{digest}"
    return {"src": f"{rel_out}.jpg", "full": f"{rel_out}-lon.jpg", "w": w, "h": h}, digest


# Chu hien thi giu nguyen; chi chu dua cho may doc duoc doi, de may khong doc "70m" thanh "70 mờ".
# Moi dong: (mau tim, thay bang). Can them don vi khac thi them dong vao day roi chay lai build.
UNIT = r"(?<![\w.,])(\d+(?:[.,]\d+)?)\s?"
SPOKEN = {
    "vi": [
        # 1.4km -> 1,4km (dau phay thap phan); 1.500m (nghin) giu nguyen vi sau dau cham co 3 chu so.
        (r"(?<=\d)\.(?=\d{1,2}\s?(?:km|cm|mm|m|ha|kg)\b)", ","),
        # km: HoaiMy doc dung san (chu nha nghe 2026-11-25), khong doi.
        (UNIT + r"cm\b", r"\1 xăng-ti-mét"),
        (UNIT + r"mm\b", r"\1 mi-li-mét"),
        (UNIT + r"m\b", r"\1 mét"),
        (UNIT + r"ha\b", r"\1 héc-ta"),
        (UNIT + r"kg\b", r"\1 ki-lô-gam"),
    ],
    "en": [
        (UNIT + r"km\b", r"\1 kilometres"),
        (UNIT + r"cm\b", r"\1 centimetres"),
        (UNIT + r"mm\b", r"\1 millimetres"),
        (UNIT + r"m\b", r"\1 metres"),
        (UNIT + r"kg\b", r"\1 kilograms"),
    ],
}


def spoken(lang, text):
    for pat, rep in SPOKEN[lang]:
        text = re.sub(pat, rep, text)
    return text


def audio_name(lang, text):
    """Ten file = bam cua giong + loi doc: doi chu hoac doi giong thi ra file moi."""
    key = json.dumps([VOICES[lang], text], ensure_ascii=False)
    return f"{lang}-{hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]}.mp3"


def speak(lang, text, path, tries=3):
    """Doc 1 doan bang edge-tts. Tra ve None neu xong, hoac ly do loi.
    File tam nam ngoai OneDrive (OneDrive giu file dang dong bo -> WinError 32)."""
    import shutil
    import tempfile
    err = None
    for _ in range(tries):
        tmp_dir = tempfile.mkdtemp(prefix="baotang-tts-")
        tmp_txt = os.path.join(tmp_dir, "loi.txt")
        tmp_mp3 = os.path.join(tmp_dir, "giong.mp3")
        try:
            with open(tmp_txt, "w", encoding="utf-8") as f:
                f.write(text)
            r = subprocess.run([sys.executable, "-m", "edge_tts", *VOICES[lang], "-f", tmp_txt,
                                "--write-media", tmp_mp3], capture_output=True, text=True, timeout=120)
            if r.returncode == 0 and os.path.exists(tmp_mp3) and os.path.getsize(tmp_mp3) > 0:
                shutil.copyfile(tmp_mp3, path)
                return None
            err = ((r.stderr or "").strip().splitlines() or ["edge-tts không tạo được file"])[-1]
        except (OSError, subprocess.SubprocessError) as e:
            err = str(e)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
    return err


def build_audio(out):
    """Gan item["audio"] = {"vi": ..., "en": ...} cho anh co chu thich; chi doc doan moi."""
    os.makedirs(OUT_AUDIO, exist_ok=True)
    jobs = []  # (item, lang, file name, text)
    for g in out:
        for item in g["items"]:
            texts = {}
            if item.get("vi"):
                title = item["title"].rstrip(". ")
                texts["vi"] = ". ".join(([title] if title else []) + item["vi"])
            if item.get("en"):
                texts["en"] = " ".join(item["en"])
            for lang, text in texts.items():
                text = spoken(lang, text)
                jobs.append((item, lang, audio_name(lang, text), text))

    todo = [j for j in jobs if not os.path.exists(os.path.join(OUT_AUDIO, j[2]))]
    print(f"\nGiọng đọc: {len(jobs)} đoạn, {len(jobs) - len(todo)} đã có, cần đọc mới {len(todo)}")
    with ThreadPoolExecutor(max_workers=4) as pool:
        errors = list(pool.map(lambda j: speak(j[1], j[3], os.path.join(OUT_AUDIO, j[2])), todo))
    failed = {j[2]: e for j, e in zip(todo, errors) if e}
    for name, e in failed.items():
        print(f"  LỖI giọng đọc {name}: {e}")

    keep = set()
    for item, lang, name, _ in jobs:
        if name in failed:
            continue
        keep.add(name)
        item.setdefault("audio", {})[lang] = f"assets/giong/{name}"
    for name in os.listdir(OUT_AUDIO):
        if name.endswith(".mp3") and name not in keep and name.split("-")[0] in VOICES and name not in failed:
            os.remove(os.path.join(OUT_AUDIO, name))
    if failed:
        print(f"  {len(failed)} đoạn chưa có tiếng (kiểm tra mạng rồi chạy lại build).")


def main():
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    out, report, problems = [], [], []
    for g in data["galleries"]:
        os.makedirs(os.path.join(OUT_IMG, g["id"]), exist_ok=True)
        items, used = [], set()
        for n, it in enumerate(g["items"], 1):
            try:
                item, digest = build_image(g["id"], it["image"])
            except (OSError, ValueError) as e:
                problems.append(f"{g['id']} ảnh {n}: không đọc được {it['image']} ({e})")
                continue
            used.add(digest)
            item["goc"] = it["image"]  # trang quan ly dung de lay anh nho xem truoc
            # Moi gian deu co the co chu; o nao trong thi bao tang khong hien o do (chu nha 2026-11-25).
            vi = [p.strip() for p in it.get("vi", []) if p.strip()]
            en = [p.strip() for p in it.get("en", []) if p.strip()]
            item.update({"title": it.get("title", "").strip(), "vi": vi, "en": en})
            if it.get("credit", "").strip():
                item["credit"] = it["credit"].strip()
            label = item["title"] or f"(chưa có tên) {os.path.basename(it['image'])}"
            report.append(f"{g['id']} {n:02d} {label} | VI {len(vi)} đoạn, EN {len(en)} đoạn")
            items.append(item)
        for name in os.listdir(os.path.join(OUT_IMG, g["id"])):
            if name.endswith(".jpg") and name[:12] not in used:
                os.remove(os.path.join(OUT_IMG, g["id"], name))
        out.append({"id": g["id"], "name": g["name"], "items": items})

    build_audio(out)

    with open(os.path.join(HERE, "content.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("// Tao tu dong boi tools/build_content.py tu noi-dung.json. Khong sua tay.\n")
        f.write("export const GALLERIES = ")
        f.write(json.dumps(out, ensure_ascii=False, indent=1))
        f.write(";\n")
    print("\n".join(report))
    for p in problems:
        print("LỖI", p)
    print(f"\n{sum(len(g['items']) for g in out)} ảnh -> content.js")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
