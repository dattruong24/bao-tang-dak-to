r"""Nhap noi dung tu thu muc Word goc "BAO TANG SO 4.0" sang noi-dung.json (CHAY MOT LAN).

Chay:  python tools\nhap_tu_word.py            (khong ghi de neu noi-dung.json da co)
       python tools\nhap_tu_word.py --ghi-de   (lam lai tu Word, MAT cac sua doi tren trang quan ly)
- Chep anh goc vao nguon-anh\<gian>\, doc loi gioi thieu trong Word, tach tieng Viet / tieng Anh.
- Sau buoc nay noi dung chi sua o trang quan ly (mo-quan-ly.bat); Word giu lai lam ban goc.
"""
import json
import os
import re
import shutil
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(HERE), "BẢO TÀNG SỐ 4.0", "BẢO TÀNG SỐ 4.0")
DATA = os.path.join(HERE, "noi-dung.json")

# Bang ghep anh <-> Word: moi dong = (ten file anh, ten file Word hoac None, ten hien thi, nguon anh hoac None).
GALLERIES = [
    {
        "id": "g1", "folder": "GIAN 1. Căn cứ thép bên dòng Pô Kô/File Hình",
        "name": "Căn cứ thép bên dòng Pô Kô", "captions": True,
        "items": [
            ("01. Toàn cảnh trung đoàn 42 (Ảnh Bảo tàng Kon Tum cung cấp ).png", "01. Căn cứ 42 ĐT - TC.docx",
             "Toàn cảnh căn cứ Trung đoàn 42", "Ảnh Bảo tàng Kon Tum cung cấp"),
            ("02. Sân bay Phượng Hoàng (Ảnh do bảo tàng Kon Tum cung cấp).png", "02. Sân bay Phượng Hoàng.docx",
             "Sân bay Phượng Hoàng", "Ảnh do Bảo tàng Kon Tum cung cấp"),
            ("3. Sân bay L19 (Ảnh do Bảo tàng Kon Tum cung cấp).jpg", "03. Sân bay L19.docx",
             "Sân bay L19", "Ảnh do Bảo tàng Kon Tum cung cấp"),
            ("04. Vườn chuối - địa điểm đoàn xe tăng 273 của ta ém quân trước giờ ra trận .png", "04. Vườn chuối.docx",
             "Vườn chuối – nơi đoàn xe tăng 273 ém quân trước giờ ra trận", None),
            ("05. Xe tăng 377 trước giờ ra trận .png", "05. Xe tăng 377 trước giờ ra trận.docx",
             "Xe tăng 377 trước giờ ra trận", None),
            ("06. Kéo pháo vào trận địa chuẩn bị cho chiến dịch.png", "06. Kéo pháo vào trận địa chuẩn bị cho chiến dịch.docx",
             "Kéo pháo vào trận địa chuẩn bị cho chiến dịch", None),
            ("07. Các lực lượng chiến phối hợp chiến đấu.png", "07. Các lực lượng chiến đấu phối hợp chiến đấu.docx",
             "Các lực lượng phối hợp chiến đấu", None),
            ("08. Căn cứ văn Lem chuẩn bị chiến dịch.png", "08. Căn cứ Văn Lem chuẩn bị chiến dịch.docx",
             "Căn cứ Văn Lem chuẩn bị chiến dịch", None),
            ("09. Đồng bào Tây Nguyên tiếp tế lương thực..png", "09. Đồng bào Tây Nguyên tiếp tế lương thực.docx",
             "Đồng bào Tây Nguyên tiếp tế lương thực", None),
        ],
    },
    {
        "id": "g2", "folder": "GIAN 2.Những ngày đêm khói lửa",
        "name": "Những ngày đêm khói lửa", "captions": True,
        "items": [
            ("01. Sơ đồ trận đánh Đăk Tô - Tân Cảnh.jpg", "1..docx", "Sơ đồ trận đánh Đăk Tô – Tân Cảnh", None),
            ("02. Xe tăng của Tiểu đoàn xe tăng 279 (MT Tây nguyên) xuất kích trong trận ĐT - TC.webp", "2..docx",
             "Xe tăng Tiểu đoàn 279 xuất kích trong trận Đăk Tô – Tân Cảnh", None),
            ("03. Binh chủng pháo binh hỗ trợ hỏa lực trong chiến dịch.jpg", "3..docx",
             "Pháo binh hỗ trợ hỏa lực trong chiến dịch", None),
            ("4. Bộ đội tiến quân đánh căn cứ ĐăkTô-Tân Cảnh.jpg", "4..docx",
             "Bộ đội tiến quân đánh căn cứ Đăk Tô – Tân Cảnh", None),
            ("5. Căn cứ E 42.jfif", "5..docx", "Căn cứ E42", None),
            ("6.các lực lượng chiến đấu tham gia chiến dịch.png", "6..docx",
             "Các lực lượng chiến đấu tham gia chiến dịch", None),
            ("7.Cờ chiến thắng của ta bay trên căn cứ 42.png", "7..docx", "Cờ chiến thắng tung bay trên căn cứ 42", None),
            ("8.Tù binh bị bắt trong trận E 42.png", "8..docx", "Tù binh bị bắt trong trận E42", None),
            # No 9..docx and no image 10: the hill panorama is paired with 10..docx (Hill 1015 today).
            ("9.doi-1049-Kon-Tum.webp", "10..docx", "Toàn cảnh điểm cao ngày nay", None),
            ("11. Điểm cao 1015.png", "11.docx", "Điểm cao 1015 nhìn từ trên cao", None),
            ("12.Cây cối trên điểm cao 1049 và 1015.jpg", "12..docx", "Cây cối trên điểm cao 1049 và 1015", None),
            ("13.Bên trong căn cứ E42.jpg", "13..docx", "Bên trong căn cứ E42", None),
            ("Sa bàn diễn biến trận đánh.jpg", None, "Sa bàn diễn biến trận đánh", None),
            # images.jfif (burnt rice ball, same artifact as gian 3 no. 08) left out: owner ruling 2026-11-25.
        ],
    },
    {
        "id": "g3", "folder": "GIAN 3. Tri ân",
        "name": "Tri ân", "captions": True,
        "items": [
            ("1. Tượng đài chiến thắng Đăk Tô - Tân Cảnh.webp", "1..docx", "Tượng đài chiến thắng Đăk Tô – Tân Cảnh", None),
            ("02. Xe tăng 377.jpg", "02..docx", "Xe tăng 377", None),
            ("03. Hiện vật của các chiến sĩ trong kíp tăng 377.jpg", "03..docx",
             "Hiện vật của các chiến sĩ trong kíp tăng 377", None),
            ("04. Danh hiệu anh hùng lực lượng vũ trang.jpg", "04..docx", "Danh hiệu Anh hùng lực lượng vũ trang nhân dân", None),
            ("05. Quyết định công nhận bảo vật quốc gia xe tăng T59, hiệu 377.pdf", None,
             "Quyết định công nhận bảo vật quốc gia xe tăng T59, hiệu 377", None),
            ("06. Ảnh của 4 liệt sĩ trong kíp tăng.avif", "06..docx", "Bốn liệt sĩ kíp xe tăng 377", None),
            ("07. Nhà bia tưởng niệm.webp", "07..docx", "Nhà bia tưởng niệm", None),
            ("08. Nắm cơm xe tăng 377.avif", "08..docx", "Nắm cơm của kíp xe tăng 377", None),
            ("09. Bi đông và sổ học chính trị.png", "09..docx", "Bi đông và sổ học chính trị", None),
            ("09. Sổ học chính trị và bi đông.png", "09..docx", "Sổ học chính trị và bi đông", None),
            ("11. Lá thư cuối cùng.png", "11..docx", "Lá thư cuối cùng", None),
            ("12. Dấu tích hố bom do Mỹ - Ngụy thả trong trận giao tranh ĐăkTô - Tân Cảnh.jpg", "12..docx",
             "Dấu tích hố bom trong trận Đăk Tô – Tân Cảnh", None),
            ("13. ditichKonTum.avif", "13. Di tích chiến thắng ĐT - TC.docx", "Di tích chiến thắng Đăk Tô – Tân Cảnh", None),
            ("14.Nhà bia tưởng niệm điểm cao 1015 và 1049.webp", "14..docx",
             "Nhà bia tưởng niệm điểm cao 1015 và 1049", None),
        ],
    },
    {
        "id": "g4", "folder": "GIAN 4. ĐăkTô ngày mới",
        "name": "Đăk Tô ngày mới", "captions": False,
        "items": [
            ("01. Quảng trường 244.jfif", None, "", None),
            ("02. Sông Pô Kô.jpg", None, "", None),
            ("03. Cầu treo ĐăkRiPeng.jpg", None, "", None),
            ("0.9. Chứng tích Kon HRing.jpg", None, "", None),
            ("05. Nhà rông văn hóa.jfif", None, "", None),
            ("06.Khu di tích chiến thắng Đăk Tô - Tân Cảnh.png", None, "", None),
            ("07.Một góc Đăk Tô hôm nay.jpg", None, "", None),
            ("08.Người dân Đăk Tô chuyển đổi cây trồng (trồng cây mắc ca).jpg", None, "", None),
            ("09. Suối Đăk Na.jpg", None, "", None),
            ("10. Nghĩa trang liệt sĩ Đăk Tô.jpg", None, "", None),
            ("11. Học sinh học tập tại Khu tưởng niệm di tích.jpg", None, "", None),
            ("12. Học sinh tham  quan bia tưởng niệm.jpg", None, "", None),
        ],
    },
]

# English for Vietnamese paragraphs whose Word file has no translation (added 2026-11-25 at the owner's request).
# Key: (gallery id, Word file name). Appended after the English found in the Word file.
EXTRA_EN = {
    ("g2", "5..docx"): [
        "At 11:00 AM on April 24, 1972, Regiment 66 took complete control of the base. The Liberation flag, "
        "presented to Regiment 66 by the Kon Tum Provincial Party Committee before the troops set out, was raised "
        "by Squad Leader Nguyễn Xuân Hoàng of Company 2 and fluttered proudly over the center of the base.",
    ],
    ("g3", "13. Di tích chiến thắng ĐT - TC.docx"): [
        # Same wording as the English in gian 3, 14..docx.
        "On January 18, 2022, the Prime Minister signed Decision No. 93/QĐ-TTg adding the Historical Sites of "
        "Hill 1015 and Hill 1049, in Sa Thầy District and Đắk Tô District, Kon Tum Province, to the Special "
        "National Monument of the Đắk Tô – Tân Cảnh Victory Site.",
    ],
}

EN_WORDS = set("the of and in on at to a an by for from with was were is are as this that these "
               "our their its it who which into after before during while under".split())
PREFIX = re.compile(r"^\s*(Nói|Phụ đề|English)\s*:\s*", re.I)
JUNK = ["Dịch sang TIẾNG Anh giúp tôi đoạn này"]



def is_vietnamese(text):
    # Vietnamese place names appear in the English text too, so count English function words instead.
    words = re.findall(r"\w+", text.lower())
    if not words:
        return True
    # A plain-ASCII word of 6+ letters is almost never a Vietnamese syllable.
    english = sum(1 for w in words if w in EN_WORDS or (len(w) >= 6 and w.isascii() and w.isalpha()))
    return english / len(words) < 0.12


def read_docx(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf8")
    paras = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
        text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
        for junk in JUNK:
            text = text.replace(junk, "")
        text = PREFIX.sub("", text.replace("&amp;", "&").replace("&quot;", '"')).replace("\xa0", " ").strip()
        if text:
            paras.append(text)
    vi, en = [], []
    for para in paras:
        # A paragraph may hold both languages (e.g. "...1972). Van Lem Base served ..."): split by sentence.
        sentences = re.split(r"(?<=[.!?…)\"”])\s+(?=[A-ZĐ])", para)
        langs = [is_vietnamese(s) for s in sentences]
        if all(langs) or not any(langs):
            (vi if langs[0] else en).append(para)
            continue
        cut = langs.index(False)
        vi.append(" ".join(sentences[:cut]))
        en.append(" ".join(sentences[cut:]))
    return vi, en


def main():
    if os.path.exists(DATA) and "--ghi-de" not in sys.argv:
        print("noi-dung.json đã có. Sửa nội dung ở trang quản lý; muốn làm lại từ Word thì thêm --ghi-de.")
        return
    out = []
    for g in GALLERIES:
        folder = os.path.join(SRC, g["folder"])
        dest = os.path.join(HERE, "nguon-anh", g["id"])
        os.makedirs(dest, exist_ok=True)
        items = []
        for n, (img_name, doc_name, title, credit) in enumerate(g["items"], 1):
            name = f"{n:02d}-{img_name}"
            shutil.copyfile(os.path.join(folder, img_name), os.path.join(dest, name))
            vi, en = read_docx(os.path.join(folder, doc_name)) if doc_name else ([], [])
            en += EXTRA_EN.get((g["id"], doc_name), [])
            items.append({"image": f"nguon-anh/{g['id']}/{name}", "title": title, "credit": credit or "",
                          "vi": vi, "en": en})
        out.append({"id": g["id"], "name": g["name"], "captions": g["captions"], "items": items})
        print(f"{g['id']}: {len(items)} ảnh")
    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"galleries": out}, f, ensure_ascii=False, indent=1)
    print("-> noi-dung.json. Chạy tiếp: python tools\\build_content.py")


if __name__ == "__main__":
    main()
