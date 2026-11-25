# Digital museum: Đăk Tô – Tân Cảnh Victory (24/4/1972)

A walk-through 3D museum in the browser (three.js): a lobby and four galleries with photos,
Vietnamese and English captions, and a read-aloud button for each caption.

- **Visit the museum:** https://dattruong24.github.io/bao-tang-dak-to/
- **Guide (Vietnamese):** https://dattruong24.github.io/bao-tang-dak-to/HUONG-DAN.html

## How it is built

- `noi-dung.json` holds the content: photo, title, source, Vietnamese and English text.
- `tools/build_content.py` turns it into wall images (`assets/tranh/`), voice files made with
  Edge TTS (`assets/giong/`) and `content.js`, which the museum reads.
- `quan-ly.html` is the content manager. It runs only on the owner's computer through
  `tools/server.py` (login required) and is not usable from this website.
- Original photos and the account file are kept off this repository (see `.gitignore`).

Run locally: double-click `mo-bao-tang.bat` (museum) or `mo-quan-ly.bat` (manager). Needs Python 3 with Pillow and edge-tts.

Textures and HDRI: Poly Haven (CC0). 3D library: three.js (MIT).
