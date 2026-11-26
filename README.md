# Digital museum: Đăk Tô – Tân Cảnh Victory (24/4/1972)

A walk-through 3D museum in the browser (three.js): a lobby and four galleries with photos,
Vietnamese and English captions, and a read-aloud button for each caption.

- **Visit the museum:** https://dattruong24.github.io/bao-tang-dak-to/
- **Guide (Vietnamese):** https://dattruong24.github.io/bao-tang-dak-to/HUONG-DAN.html

## How it is built

- `noi-dung.json` holds the content: photo, title, source, Vietnamese and English text.
- `tools/build_content.py` turns it into wall images (`assets/tranh/`), voice files made with
  Edge TTS (`assets/giong/`) and `content.js`, which the museum reads.
- `quan-ly.html` is the content manager. It runs on an editor's own computer through
  `tools/server.py` (no login) and is not usable from this website. Its Save button rebuilds,
  commits and pushes; GitHub Pages then updates the site. Who can edit = who has write access
  to this repository.
- Original photos are in `nguon-anh/`, so any collaborator can rebuild.

New editor: run `cai-dat-lan-dau.bat` once (installs Git, Python packages, clones, checks write access).
Run locally: double-click `mo-bao-tang.bat` (museum) or `mo-quan-ly.bat` (manager). Needs Python 3 with Pillow and edge-tts, and Git signed in to GitHub for publishing.

Textures and HDRI: Poly Haven (CC0). 3D library: three.js (MIT).
