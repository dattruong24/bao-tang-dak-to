import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GALLERIES } from './content.js';
import {
  WALL_T, ROOMS, DOOR, WALLS, DOORS, ROUTE, FLOOR_PATH, PLAN, roomEdges, along, wallSpot, wallSlots,
} from './layout.js';

const TITLE = 'Bảo tàng số Chiến thắng Đăk Tô – Tân Cảnh';
const SUBTITLE = 'Bảo tàng số 4.0 · Chiến thắng Đăk Tô – Tân Cảnh 24/4/1972';

const EYE = 1.65;
const SERIF = "'Times New Roman', 'Noto Serif', serif";
const ART_Y = 2.2;          // height of a picture's centre


// ---------- renderer / scene ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9d4cb);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';

const manager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);
const anisotropy = renderer.capabilities.getMaxAnisotropy();

const clickables = [];
const floors = [];
const obstacles = [];
const paintings = [];   // one entry per picture on a wall, in visiting order
const stops = [];       // guided tour stops

// ---------- materials ----------
THREE.Cache.enabled = true;
function pbrMaterial(name, repX, repY, extra = {}) {
  const load = (file, srgb) => {
    const t = texLoader.load(`assets/textures/${name}/${file}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX, repY);
    t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return new THREE.MeshStandardMaterial({
    map: load('diff', true), normalMap: load('nor'), roughnessMap: load('rough'), envMapIntensity: 0.5, ...extra,
  });
}

const trimMat = new THREE.MeshStandardMaterial({ color: 0x3a2c24, roughness: 0.55 });
const corniceMat = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.8 });
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.95, emissive: 0xfff6ea, emissiveIntensity: 0.35 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1e16, roughness: 0.45, metalness: 0.2 });
const matMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e7, roughness: 0.9 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xa8834a, metalness: 0.7, roughness: 0.35 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.8, roughness: 0.4 });

function box(w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

function wrapLines(g, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && g.measureText(test).width > maxW) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// lines: [{ text, size, bold, color, wrap }]; a line too wide for the canvas is shrunk to fit.
function textTexture(lines, { w = 1024, h = 256, bg = null, color = '#2b2118', font = SERIF } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fontOf = (l, size) => `${l.bold ? 'bold ' : ''}${size}px ${font}`;
  const rows = [];
  for (const l of lines) {
    g.font = fontOf(l, l.size);
    for (const text of (l.wrap ? wrapLines(g, l.text, w * 0.9) : [l.text])) {
      let size = l.size;
      g.font = fontOf(l, size);
      while (g.measureText(text).width > w * 0.94 && size > 12) { size -= 2; g.font = fontOf(l, size); }
      rows.push({ text, size, font: g.font, color: l.color || color });
    }
  }
  let y = (h - rows.reduce((s, r) => s + r.size * 1.3, 0)) / 2;
  for (const r of rows) {
    g.font = r.font;
    g.fillStyle = r.color;
    y += r.size * 0.65;
    g.fillText(r.text, w / 2, y);
    y += r.size * 0.65;
  }
  return canvasTexture(c);
}

function flatPlane(w, h, map, x, y, z, ry, extra = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.8, ...extra }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  scene.add(m);
  return m;
}

// ---------- floor plan helpers ----------
const roomKeys = Object.keys(ROOMS);
const galleryIndex = (key) => GALLERIES.findIndex((g) => g.id === key);
const galleryOf = (key) => GALLERIES[galleryIndex(key)];
const hasText = (gal) => gal.items.some((it) => it.vi.length || it.en.length);
const centerOf = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];




const roomsAtDoor = (d) => roomKeys.filter((k) => roomEdges(ROOMS[k]).some((e) => along(e, d) !== null));

// ---------- architecture ----------
function wallPiece(ax, az, bx, bz, y0, y1, mat) {
  const len = Math.hypot(bx - ax, bz - az);
  const alongX = Math.abs(bz - az) < 1e-6;
  return box(alongX ? len : WALL_T, y1 - y0, alongX ? WALL_T : len, mat, (ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
}

function wallMaterial(len, height) {
  const m = pbrMaterial('white_plaster_02', len / 3, height / 3, { color: 0xf1e9dc });
  m.map = null; // clean painted plaster: keep only the relief and roughness
  m.normalScale.set(0.6, 0.6);
  return m;
}

function baseboard(ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  const alongX = Math.abs(bz - az) < 1e-6;
  box(alongX ? len : WALL_T + 0.06, 0.18, alongX ? WALL_T + 0.06 : len, trimMat, (ax + bx) / 2, 0.09, (az + bz) / 2);
}

function doorCasing(pt, d, alongX) {
  const thick = WALL_T + 0.12;
  for (const side of [-1, 1]) {
    const [px, pz] = pt(d + side * (DOOR.half + 0.06));
    box(alongX ? 0.12 : thick, DOOR.top, alongX ? thick : 0.12, trimMat, px, DOOR.top / 2, pz);
  }
  const [cx, cz] = pt(d);
  const span = DOOR.half * 2 + 0.24;
  box(alongX ? span : thick, 0.16, alongX ? thick : span, trimMat, cx, DOOR.top + 0.08, cz);
}

function buildWalls() {
  for (const [x1, z1, x2, z2, h, d] of WALLS) {
    const alongX = z1 === z2;
    const a = alongX ? x1 : z1;
    const b = alongX ? x2 : z2;
    const pt = (t) => (alongX ? [t, z1] : [x1, t]);
    const hasDoor = d !== undefined;
    const spans = hasDoor ? [[a, d - DOOR.half], [d + DOOR.half, b]] : [[a, b]];
    for (const [s, e] of spans) {
      wallPiece(...pt(s), ...pt(e), 0, h, wallMaterial(Math.abs(e - s), h));
      baseboard(...pt(s), ...pt(e));
    }
    if (hasDoor) {
      wallPiece(...pt(d - DOOR.half), ...pt(d + DOOR.half), DOOR.top, h, wallMaterial(DOOR.half * 2, h - DOOR.top));
      doorCasing(pt, d, alongX);
    }
  }
}

function buildRoom(key) {
  const r = ROOMS[key];
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const [cx, cz] = centerOf(r);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    pbrMaterial(r.floor, w / r.floorTile, d / r.floorTile, { envMapIntensity: 1.0, roughness: r.floorGloss || 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  floor.userData.kind = 'floor';
  scene.add(floor);
  floors.push(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, r.h, cz);
  scene.add(ceil);

  const ci = WALL_T / 2 + 0.12;
  box(w, 0.3, 0.24, corniceMat, cx, r.h - 0.15, r.z0 + ci);
  box(w, 0.3, 0.24, corniceMat, cx, r.h - 0.15, r.z1 - ci);
  box(0.24, 0.3, d, corniceMat, r.x0 + ci, r.h - 0.15, cz);
  box(0.24, 0.3, d, corniceMat, r.x1 - ci, r.h - 0.15, cz);
}

function buildLobbyCeiling(r) {
  const [cx, cz] = centerOf(r);
  const beam = 0.32;
  const beams = [];
  for (let x = r.x0 + 2.5; x < r.x1; x += 2.5) beams.push(box(0.22, beam, r.z1 - r.z0, corniceMat, x, r.h - beam / 2, cz));
  for (let z = r.z0 + 2; z < r.z1; z += 2) beams.push(box(r.x1 - r.x0, beam, 0.22, corniceMat, cx, r.h - beam / 2, z));
  beams.forEach((b) => { b.castShadow = false; });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 1.6 }));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(cx, r.h - 0.02, cz);
  scene.add(sky);
}

function buildLobby() {
  const r = ROOMS.lobby;
  buildLobbyCeiling(r);
  const colMat = pbrMaterial('marble_01', 1, 3, { envMapIntensity: 0.7 });
  for (const x of [-5.5, 5.5]) {
    for (const z of [8.6, 15.4]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, r.h - 0.6, 32), colMat);
      col.position.set(x, (r.h - 0.6) / 2 + 0.3, z);
      col.castShadow = col.receiveShadow = true;
      scene.add(col);
      box(1.0, 0.3, 1.0, corniceMat, x, 0.15, z);
      box(1.0, 0.3, 1.0, corniceMat, x, r.h - 0.45, z);
      obstacles.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6 });
    }
  }
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3326, roughness: 0.5 });
  for (const s of [-1, 1]) box(1.5, 3.8, 0.12, doorMat, s * 0.77, 1.9, r.z1 - WALL_T / 2 - 0.06);
  box(3.4, 0.2, 0.2, trimMat, 0, 3.9, r.z1 - WALL_T / 2 - 0.1);

  const wallZ = r.z0 + WALL_T / 2 + 0.02;
  flatPlane(13, 3.0, textTexture([
    { text: 'BẢO TÀNG SỐ', size: 92 },
    { text: 'CHIẾN THẮNG ĐĂK TÔ – TÂN CẢNH', size: 150, bold: true, color: '#6b2a1c' },
    { text: 'Bảo tàng số 4.0 · 24/4/1972', size: 64 },
  ], { w: 2048, h: 472 }), 0, 5.35, wallZ, 0, { transparent: true, roughness: 0.9 });
  buildGuideBoard(wallZ);
}

// The floor plan on the lobby wall: the first thing a visitor sees when walking in.
function buildGuideBoard(wallZ) {
  const W = 2048, H = 1240;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#2f2620';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#d6b06a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 84px ${SERIF}`;
  g.fillText('SƠ ĐỒ THAM QUAN', W / 2, 90);
  g.save();
  g.translate(60, 160);
  drawPlan(g, W - 120, H - 330, { font: 64, here: [0, 17], long: true });
  g.restore();
  g.fillStyle = '#f3e9d8';
  g.font = `44px ${SERIF}`;
  g.fillText('Đi theo mũi tên vàng trên sàn: Sảnh → Gian 1 → Gian 2 → Gian 3 → Gian 4 → Sảnh', W / 2, H - 120);
  g.fillText('Bấm vào bức ảnh để đọc lời giới thiệu · Bấm nút ? để xem hướng dẫn', W / 2, H - 55);
  const bw = 5.4, bh = bw * H / W;
  box(bw + 0.2, bh + 0.2, 0.06, frameMat, 0, 2.15, wallZ + 0.02);
  const tex = canvasTexture(c);
  flatPlane(bw, bh, tex, 0, 2.15, wallZ + 0.06, 0, { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
}

function bench(x, z, ry, len = 2.2) {
  const g = new THREE.Group();
  const seatMat = pbrMaterial('herringbone_parquet', 1, 0.3, { color: 0x8a6a50 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.5), seatMat);
  seat.position.y = 0.46;
  seat.castShadow = seat.receiveShadow = true;
  g.add(seat);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.44), metalMat);
    leg.position.set(s * (len / 2 - 0.15), 0.21, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  const hx = Math.abs(Math.cos(ry)) * len / 2 + Math.abs(Math.sin(ry)) * 0.25 + 0.3;
  const hz = Math.abs(Math.sin(ry)) * len / 2 + Math.abs(Math.cos(ry)) * 0.25 + 0.3;
  obstacles.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz });
}

function placeModel(src, x, z, y, height) {
  gltfLoader.load(src, (gltf) => {
    const inner = gltf.scene;
    inner.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    const size = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
    inner.scale.setScalar(height / size.y);
    const b = new THREE.Box3().setFromObject(inner);
    const c = b.getCenter(new THREE.Vector3());
    inner.position.set(x - c.x, y - b.min.y, z - c.z);
    scene.add(inner);
  });
}

function buildDecor() {
  for (const [x, z] of [[-7, 7], [7, 7], [-7, 17], [7, 17]]) {
    placeModel('assets/models/potted_plant_04/potted_plant_04.gltf', x, z, 0, 1.5);
    obstacles.push({ x0: x - 0.7, x1: x + 0.7, z0: z - 0.7, z1: z + 0.7 });
  }
  bench(0, 9.2, 0, 2.6);
  bench(-12.5, 14.6, 0);
  bench(-8, 2.6, 0);
  bench(8, 2.6, 0);
  bench(20.4, 12, Math.PI / 2);
}

// ---------- pictures ----------


function buildPainting(gal, gi, i, slot) {
  const item = gal.items[i];
  const k = Math.min(Math.min(2.6, slot.width - 0.8) / item.w, 1.7 / item.h);
  const w = item.w * k, h = item.h * k;
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.34, h + 0.34, 0.06), frameMat);
  frame.castShadow = true;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, h + 0.2), matMat);
  mat.position.z = 0.031;
  const map = texLoader.load(item.src, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map, roughness: 0.85, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.32,
  }));
  art.position.z = 0.034;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.min(w * 0.6, 1.4), 12), brassMat);
  lamp.rotation.z = Math.PI / 2;
  lamp.position.set(0, h / 2 + 0.32, 0.22);
  g.add(frame, mat, art, lamp);
  const parts = [frame, mat, art];
  if (item.title || item.credit) {
    // Title, and the photo source under it in smaller text, in brackets (owner 2026-11-25). Empty parts are skipped.
    const lines = [];
    if (item.title) lines.push({ text: item.title, size: 50, bold: true, wrap: true });
    if (item.credit) lines.push({ text: `(${item.credit})`, size: 36, wrap: true, color: '#d9ccb6' });
    const ph = item.title && item.credit ? 0.38 : 0.3;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.1, ph), new THREE.MeshStandardMaterial({
      map: textTexture(lines, { w: 1024, h: Math.round(ph / 0.3 * 280), bg: '#2f2620', color: '#f3e9d8' }),
      roughness: 0.6,
    }));
    plaque.position.set(0, -h / 2 - 0.32 - ph / 2, 0.01);
    g.add(plaque);
    parts.push(plaque);
  }
  g.position.set(slot.x, ART_Y, slot.z);
  g.rotation.y = slot.ry;
  scene.add(g);
  const index = paintings.length;
  paintings.push({ gal, gi, i, item, x: slot.x, z: slot.z, nx: slot.nx, nz: slot.nz, w, h });
  for (const part of parts) { part.userData = { kind: 'painting', index }; clickables.push(part); }
}

function signMesh(lines, w, h, spot, y, opts) {
  const m = flatPlane(w, h, textTexture(lines, opts), spot.x, y, spot.z, spot.ry, { roughness: 0.7, transparent: !opts.bg });
  m.renderOrder = 1;
  return m;
}

// Room name high on the wall facing the entry door.
function buildRoomTitle(gal, gi) {
  const r = ROOMS[gal.id];
  const edges = roomEdges(r);
  const entryEdge = edges.findIndex((e) => along(e, ROUTE[gi].entry) !== null);
  const e = edges[(entryEdge + 2) % 4];
  signMesh([
    { text: `GIAN ${gi + 1}`, size: 62, color: '#8a5a2b' },
    { text: gal.name.toUpperCase(), size: 104, bold: true, color: '#3a2418' },
  ], Math.min(8, e.len - 2), 1.0, wallSpot(e, e.len / 2, 0.02), r.h - 0.95, { w: 2048, h: 256 });
}

function doorSignText(from, to) {
  if (to === 'lobby') return ['VỀ SẢNH CHÍNH', TITLE];
  const gi = galleryIndex(to);
  const name = `Gian ${gi + 1} · ${GALLERIES[gi].name}`;
  if (from === 'lobby') return [gi === 0 ? 'BẮT ĐẦU THAM QUAN →' : `GIAN ${gi + 1}`, name];
  return [gi > galleryIndex(from) ? 'TIẾP THEO →' : '← QUAY LẠI', name];
}

// Above every doorway, on both sides: where this door leads.
function buildDoorSigns() {
  for (const d of DOORS) {
    const [ra, rb] = roomsAtDoor(d);
    for (const [from, to] of [[ra, rb], [rb, ra]]) {
      const e = roomEdges(ROOMS[from]).find((ed) => along(ed, d) !== null);
      const [top, name] = doorSignText(from, to);
      signMesh([
        { text: top, size: 70, bold: true, color: '#d6b06a' },
        { text: name, size: 58, color: '#f3e9d8' },
      ], 3.4, 0.62, wallSpot(e, along(e, d), 0.02), DOOR.top + 0.5, { w: 1536, h: 280, bg: '#2f2620' });
    }
  }
}

// Gold chevrons on the floor along the visiting route.
function buildFloorArrows() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.24); s.lineTo(0.32, -0.06); s.lineTo(0.32, -0.22); s.lineTo(0, 0.08);
  s.lineTo(-0.32, -0.22); s.lineTo(-0.32, -0.06); s.closePath();
  const geo = new THREE.ShapeGeometry(s);
  const mat = new THREE.MeshBasicMaterial({ color: 0xd9a63e, transparent: true, opacity: 0.9, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2 });
  for (let i = 0; i < FLOOR_PATH.length - 1; i++) {
    const [ax, az] = FLOOR_PATH[i], [bx, bz] = FLOOR_PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bx - ax), -(bz - az));
    for (let t = 0.7; t < len - 0.3; t += 1.4) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.PI / 2, yaw, 0);
      m.position.set(ax + (bx - ax) * (t / len), 0.015, az + (bz - az) * (t / len));
      scene.add(m);
    }
  }
}

function buildGalleries() {
  GALLERIES.forEach((gal, gi) => {
    const slots = wallSlots(ROOMS[gal.id], gal.items.length, ROUTE[gi].entry);
    gal.items.forEach((_, i) => buildPainting(gal, gi, i, slots[i]));
    buildRoomTitle(gal, gi);
  });
}

// ---------- lighting ----------
function buildLights() {
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8d8070, 1.2));
  const sun = new THREE.DirectionalLight(0xfff2de, 2.0);
  sun.position.set(4, 30, 9);
  sun.target.position.set(0, 0, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  for (const gal of GALLERIES) {
    const r = ROOMS[gal.id];
    const [cx, cz] = centerOf(r);
    const wide = r.x1 - r.x0 >= r.z1 - r.z0;
    const reach = (wide ? r.x1 - r.x0 : r.z1 - r.z0) / 4;
    for (const o of [-reach, reach]) {
      const [px, pz] = wide ? [cx + o, cz] : [cx, cz + o];
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e4, emissiveIntensity: 1.4 }));
      panel.rotation.x = Math.PI / 2;
      panel.position.set(px, r.h - 0.01, pz);
      const p = new THREE.PointLight(0xfff0dc, 26, 0, 2);
      p.position.set(px, r.h - 0.6, pz);
      scene.add(panel, p);
    }
  }
  new RGBELoader(manager).load('assets/hdri/museum_of_history.hdr', (hdr) => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
  });
}

// ---------- floor plan drawing (wall board + on-screen map) ----------
function planLabel(g, key, x, y, font, long) {
  const gi = galleryIndex(key);
  g.fillStyle = '#f6efe3';
  g.font = `bold ${font}px ${SERIF}`;
  if (key === 'lobby') { g.fillText(long ? 'SẢNH CHÍNH' : 'Sảnh', x, y); return; }
  if (!long) { g.fillText(String(gi + 1), x, y); return; }
  g.fillText(`GIAN ${gi + 1}`, x, y - font * 0.6);
  g.font = `${font * 0.6}px ${SERIF}`;
  g.fillText(GALLERIES[gi].name, x, y + font * 0.45);
}

function drawRoute(g, P, s) {
  g.strokeStyle = '#e07a4f';
  g.lineWidth = Math.max(1.5, s * 0.22);
  g.setLineDash([s * 0.9, s * 0.6]);
  g.beginPath();
  FLOOR_PATH.forEach(([x, z], i) => (i ? g.lineTo(...P(x, z)) : g.moveTo(...P(x, z))));
  g.stroke();
  g.setLineDash([]);
}

function drawHere(g, P, s, [x, z], yaw) {
  const [hx, hy] = P(x, z);
  if (yaw !== undefined) {
    g.fillStyle = 'rgba(224,122,79,.35)';
    g.beginPath();
    g.moveTo(hx, hy);
    g.arc(hx, hy, s * 3.2, -Math.PI / 2 - yaw - 0.55, -Math.PI / 2 - yaw + 0.55);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#e0462f';
  g.beginPath();
  g.arc(hx, hy, Math.max(4, s * 0.55), 0, Math.PI * 2);
  g.fill();
}

function drawPlan(g, W, H, { font = 12, here = null, yaw, active = null, long = false } = {}) {
  const s = Math.min(W / (PLAN.x1 - PLAN.x0), H / (PLAN.z1 - PLAN.z0));
  const ox = (W - s * (PLAN.x1 - PLAN.x0)) / 2, oy = (H - s * (PLAN.z1 - PLAN.z0)) / 2;
  const P = (x, z) => [ox + (x - PLAN.x0) * s, oy + (z - PLAN.z0) * s];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const key of roomKeys) {
    const r = ROOMS[key];
    const [ax, ay] = P(r.x0, r.z0);
    g.fillStyle = key === active ? 'rgba(214,176,106,.5)' : 'rgba(246,239,227,.1)';
    g.fillRect(ax, ay, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    g.strokeStyle = '#d6b06a';
    g.lineWidth = Math.max(1, s * 0.18);
    g.strokeRect(ax, ay, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
  }
  g.fillStyle = '#2f2620';
  for (const [x, z] of [...DOORS, [0, 18]]) {
    const vertical = WALLS.some((w) => w[0] === w[2] && w[0] === x && w[5] === z);
    const [px, py] = P(x, z);
    const half = DOOR.half * s;
    g.fillRect(vertical ? px - s * 0.4 : px - half, vertical ? py - half : py - s * 0.4, vertical ? s * 0.8 : half * 2, vertical ? half * 2 : s * 0.8);
  }
  drawRoute(g, P, s);
  for (const key of roomKeys) { const [cx, cz] = centerOf(ROOMS[key]); planLabel(g, key, ...P(cx, cz), font, long); }
  if (here) drawHere(g, P, s, here, yaw);
  return { s, ox, oy };
}

// ---------- navigation ----------
const M = 0.45;
const walkable = [
  ...Object.values(ROOMS).map((r) => ({ x0: r.x0 + M, x1: r.x1 - M, z0: r.z0 + M, z1: r.z1 - M })),
  ...DOORS.map(([x, z]) => {
    const vertical = WALLS.some((w) => w[0] === w[2] && w[0] === x && w[5] === z);
    return vertical
      ? { x0: x - M - 0.2, x1: x + M + 0.2, z0: z - DOOR.half + M, z1: z + DOOR.half - M }
      : { x0: x - DOOR.half + M, x1: x + DOOR.half - M, z0: z - M - 0.2, z1: z + M + 0.2 };
  }),
];
const inside = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
const canStand = (x, z) => walkable.some((b) => inside(b, x, z)) && !obstacles.some((b) => inside(b, x, z));
const roomKeyAt = (x, z) => roomKeys.find((k) => inside(ROOMS[k], x, z)) || null;

const nav = { yaw: 0, pitch: 0, keys: new Set(), glide: null };

function lookAngles(x, z, look) {
  const dx = look[0] - x, dy = look[1] - EYE, dz = look[2] - z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

function setView(x, z, look) {
  camera.position.set(x, EYE, z);
  Object.assign(nav, lookAngles(x, z, look));
}

function glideTo(x, z, look) {
  const from = { x: camera.position.x, z: camera.position.z, yaw: nav.yaw, pitch: nav.pitch };
  const { yaw, pitch } = look ? lookAngles(x, z, look) : nav;
  let dyaw = yaw - from.yaw;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const dist = Math.hypot(x - from.x, z - from.z);
  nav.glide = { from, to: { x, z, yaw: from.yaw + dyaw, pitch }, t: 0, dur: Math.min(2.6, 0.6 + dist / 5) };
}

function updateNav(dt) {
  if (nav.glide) {
    const g = nav.glide;
    g.t += dt / g.dur;
    const k = g.t >= 1 ? 1 : 0.5 - Math.cos(Math.PI * g.t) / 2;
    camera.position.x = g.from.x + (g.to.x - g.from.x) * k;
    camera.position.z = g.from.z + (g.to.z - g.from.z) * k;
    nav.yaw = g.from.yaw + (g.to.yaw - g.from.yaw) * k;
    nav.pitch = g.from.pitch + (g.to.pitch - g.from.pitch) * k;
    if (g.t >= 1) nav.glide = null;
  } else {
    const k = nav.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    nav.yaw += ((k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0)) * dt * 1.6;
    if (fwd || side) {
      const sp = 3.4 * dt;
      const sx = -Math.sin(nav.yaw), sz = -Math.cos(nav.yaw);
      const nx = camera.position.x + (sx * fwd - sz * side) * sp;
      const nz = camera.position.z + (sz * fwd + sx * side) * sp;
      if (canStand(nx, camera.position.z)) camera.position.x = nx;
      if (canStand(camera.position.x, nz)) camera.position.z = nz;
    }
  }
  camera.rotation.set(nav.pitch, nav.yaw, 0);
}

// ---------- tour ----------
function buildStops() {
  stops.push({ room: 'lobby', label: 'Sảnh chính', pos: [0, 16.4], look: [0, 2.8, 6],
    desc: 'Chào mừng bạn! Đi theo mũi tên vàng trên sàn, bắt đầu từ Gian 1 (cửa bên trái).' });
  GALLERIES.forEach((gal, gi) => {
    const r = ROOMS[gal.id];
    const [ex, ez] = ROUTE[gi].entry;
    const [cx, cz] = centerOf(r);
    const d = Math.hypot(cx - ex, cz - ez);
    stops.push({
      room: gal.id, label: `Gian ${gi + 1} · ${gal.name}`,
      pos: [ex + ((cx - ex) / d) * 2.2, ez + ((cz - ez) / d) * 2.2], look: [cx, 2.2, cz],
      desc: hasText(gal)
        ? `${gal.items.length} hình ảnh. Bấm › để xem lần lượt từng ảnh và lời giới thiệu.`
        : `${gal.items.length} hình ảnh. Bấm › để xem lần lượt từng ảnh.`,
    });
    paintings.forEach((p, index) => {
      if (p.gal !== gal) return;
      stops.push({ painting: index, label: `Gian ${gi + 1} · Ảnh ${p.i + 1}/${gal.items.length}`,
        desc: p.item.title || '' });
    });
  });
  stops.push({ room: 'lobby', label: 'Kết thúc', pos: [0, 13.4], look: [0, 3.2, 6],
    desc: `Cảm ơn bạn đã tham quan ${TITLE}.` });
}

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const ui = {
  info: $('info'), infoKicker: $('info-kicker'), infoTitle: $('info-title'), infoBody: $('info-body'),
  tourLabel: $('tour-label'), tourDesc: $('tour-desc'), hudRoom: $('hud-room'),
  viewer: $('viewer'), viewerImg: $('viewer-img'), welcome: $('welcome'), map: $('map'),
};
let tourIndex = 0;
let zoomSrc = '';

function para(text, cls) {
  const p = document.createElement(cls ? 'div' : 'p');
  if (cls) p.className = cls;
  p.textContent = text;
  return p;
}

// Giong doc chu thich: mot trinh phat chung; bam lai nut dang doc = dung.
const voice = { audio: new Audio(), btn: null };
function stopVoice() {
  voice.audio.pause();
  if (voice.btn) voice.btn.classList.remove('playing');
  voice.btn = null;
}
voice.audio.addEventListener('ended', stopVoice);
voice.audio.addEventListener('error', stopVoice);
// Khung thong tin dong (nut x, Esc, bam ra ngoai, di tiep) thi tat tieng.
new MutationObserver(() => { if (ui.info.hidden) stopVoice(); })
  .observe(ui.info, { attributes: true, attributeFilter: ['hidden'] });

function speakerBtn(src, label) {
  const b = document.createElement('button');
  b.className = 'speak';
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = '<span class="on">🔊</span><span class="off">⏹</span>';
  b.onclick = () => {
    const again = voice.btn === b;
    stopVoice();
    if (again) return;
    voice.btn = b;
    b.classList.add('playing');
    voice.audio.src = src;
    voice.audio.play().catch(stopVoice);
  };
  return b;
}

function langRow(text, src, label) {
  const row = para(text, 'lang');
  if (src) row.append(speakerBtn(src, label));
  return row;
}

function showItemInfo(p) {
  const { gal, gi, i, item } = p;
  stopVoice();
  ui.infoKicker.textContent = `Gian ${gi + 1} · Ảnh ${i + 1}/${gal.items.length}`;
  ui.infoTitle.textContent = item.title || '';
  // Only what the item has: title, (source), Vietnamese, English. Empty parts are not shown.
  const body = [];
  const audio = item.audio || {};
  if (item.credit) body.push(para(`(${item.credit})`, 'credit'));
  if (item.vi.length) body.push(langRow('Tiếng Việt', audio.vi, 'Nghe tiếng Việt'));
  item.vi.forEach((t) => body.push(para(t)));
  if (item.en.length) {
    const en = document.createElement('div');
    en.className = 'en';
    en.append(langRow('English', audio.en, 'Listen in English'), ...item.en.map((t) => para(t)));
    body.push(en);
  }
  ui.infoBody.replaceChildren(...body);
  ui.info.scrollTop = 0;
  zoomSrc = item.full;
  ui.info.hidden = false;
}

function setTourText(i) {
  tourIndex = (i + stops.length) % stops.length;
  ui.tourLabel.textContent = `${stops[tourIndex].label}`;
  ui.tourDesc.textContent = stops[tourIndex].desc;
}

function focusPainting(index) {
  const p = paintings[index];
  // Stand far enough back for the whole frame to fit the screen's width (a phone held upright is narrow).
  const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  let d = Math.min(7, Math.max(2.6, (p.w + 0.6) / 2 / Math.tan(halfFov)));
  while (d > 1.8 && !canStand(p.x + p.nx * d, p.z + p.nz * d)) d -= 0.3;
  glideTo(p.x + p.nx * d, p.z + p.nz * d, [p.x, ART_Y, p.z]);
  showItemInfo(p);
  setTourText(stops.findIndex((s) => s.painting === index));
}

function goTour(i) {
  setTourText(i);
  const s = stops[tourIndex];
  if (s.painting !== undefined) { focusPainting(s.painting); return; }
  ui.info.hidden = true;
  glideTo(s.pos[0], s.pos[1], s.look);
}

function openViewer(src) {
  ui.viewerImg.src = src;
  ui.viewer.hidden = false;
}

function fillWelcome() {
  $('welcome-title').textContent = TITLE;
  $('welcome-sub').textContent = SUBTITLE;
  const items = [['S', 'Sảnh chính', 'sơ đồ tham quan']].concat(GALLERIES.map((g, gi) => [String(gi + 1),
    `Gian ${gi + 1} · ${g.name}`, `${g.items.length} hình ảnh${hasText(g) ? ' kèm lời giới thiệu (Việt – Anh)' : ''}`]));
  $('welcome-route').replaceChildren(...items.map(([n, name, note]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="n"></span><span><span class="t"></span> <span class="c"></span></span>';
    li.querySelector('.n').textContent = n;
    li.querySelector('.t').textContent = name;
    li.querySelector('.c').textContent = `– ${note}`;
    return li;
  }));
}

// ---------- on-screen map ----------
const mapCtx = ui.map.getContext('2d');
let mapGeom = null;
function drawMap(active) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = ui.map.clientWidth, H = ui.map.clientHeight;
  if (ui.map.width !== W * dpr) { ui.map.width = W * dpr; ui.map.height = H * dpr; }
  mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mapCtx.clearRect(0, 0, W, H);
  mapGeom = drawPlan(mapCtx, W, H, { font: 15, here: [camera.position.x, camera.position.z], yaw: nav.yaw, active });
}

function mapClick(ev) {
  if (!mapGeom) return;
  const rect = ui.map.getBoundingClientRect();
  const x = PLAN.x0 + (ev.clientX - rect.left - mapGeom.ox) / mapGeom.s;
  const z = PLAN.z0 + (ev.clientY - rect.top - mapGeom.oy) / mapGeom.s;
  const key = roomKeyAt(x, z);
  if (!key) return;
  goTour(stops.findIndex((s) => s.room === key));
  document.body.classList.remove('show-map');
}

let lastRoom = null;
function updateRoomLabel() {
  const key = roomKeyAt(camera.position.x, camera.position.z) || lastRoom;
  if (key === lastRoom) return key;
  lastRoom = key;
  const gal = galleryOf(key);
  ui.hudRoom.replaceChildren('Bạn đang ở: ', Object.assign(document.createElement('b'), {
    textContent: gal ? `Gian ${galleryIndex(key) + 1} · ${gal.name}` : 'Sảnh chính',
  }));
  return key;
}

// ---------- input ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pick(ev) {
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...clickables, ...floors], false);
  return hits.length ? hits[0] : null;
}

function bindInput() {
  let drag = null;
  canvas.addEventListener('pointerdown', (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, moved: 0 };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (drag) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = ev.clientX; drag.y = ev.clientY;
      if (drag.moved > 4) {
        nav.glide = null;
        nav.yaw += dx * 0.0035;
        nav.pitch = Math.max(-1.2, Math.min(1.2, nav.pitch + dy * 0.0035));
      }
      return;
    }
    const hit = pick(ev);
    canvas.style.cursor = hit && hit.object.userData.kind === 'painting' ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', (ev) => {
    const wasClick = drag && drag.moved <= 4;
    drag = null;
    if (!wasClick) return;
    const hit = pick(ev);
    if (!hit) return;
    const u = hit.object.userData;
    if (u.kind === 'painting') focusPainting(u.index);
    else if (u.kind === 'floor' && canStand(hit.point.x, hit.point.z)) {
      ui.info.hidden = true;
      glideTo(hit.point.x, hit.point.z);
    }
  });
  bindKeysAndButtons();
  bindPad();
}

// On-screen walking pad (mouse or touch): holding a button acts like holding the matching key.
function bindPad() {
  const pad = $('pad');
  pad.addEventListener('contextmenu', (ev) => ev.preventDefault());
  for (const btn of pad.querySelectorAll('button')) {
    const key = btn.dataset.key;
    const release = () => { nav.keys.delete(key); btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      // Capture keeps the release event on this button even if the thumb slides off; walking works without it.
      try { btn.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
      nav.glide = null;
      nav.keys.add(key);
      btn.classList.add('on');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(type, release);
  }
}

function closeTopmost() {
  if (!ui.viewer.hidden) ui.viewer.hidden = true;
  else if (!ui.welcome.hidden) ui.welcome.hidden = true;
  else ui.info.hidden = true;
}

function bindKeysAndButtons() {
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape') { closeTopmost(); return; }
    if (!ui.welcome.hidden || !ui.viewer.hidden) return;
    nav.keys.add(ev.code);
    if (ev.code.startsWith('Key') || ev.code.startsWith('Arrow')) nav.glide = null;
  });
  window.addEventListener('keyup', (ev) => nav.keys.delete(ev.code));
  window.addEventListener('blur', () => nav.keys.clear());
  $('tour-prev').onclick = () => goTour(tourIndex - 1);
  $('tour-next').onclick = () => goTour(tourIndex + 1);
  $('info-close').onclick = () => { ui.info.hidden = true; };
  $('info-zoom').onclick = () => openViewer(zoomSrc);
  $('viewer-close').onclick = () => { ui.viewer.hidden = true; };
  ui.viewer.onclick = (ev) => { if (ev.target === ui.viewer) ui.viewer.hidden = true; };
  $('help-btn').onclick = () => { ui.welcome.hidden = false; };
  $('welcome-close').onclick = () => { ui.welcome.hidden = true; };
  $('free-roam').onclick = () => { ui.welcome.hidden = true; };
  $('start-tour').onclick = () => { ui.welcome.hidden = true; goTour(1); };
  $('map-toggle').onclick = () => document.body.classList.toggle('show-map');
  ui.map.addEventListener('click', mapClick);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ---------- boot ----------
const loading = $('loading');
const bar = $('loading-bar');
manager.onProgress = (_, done, total) => { bar.style.width = `${Math.round((done / total) * 100)}%`; };
manager.onLoad = () => {
  if (window.__museumReady) return;
  loading.classList.add('done');
  window.__museumReady = true;
  ui.welcome.hidden = false;
};

document.title = TITLE;
$('hud-title').textContent = TITLE;
$('loading-title').textContent = `${TITLE.toUpperCase()}…`;
buildWalls();
roomKeys.forEach(buildRoom);
buildLobby();
buildLights();
buildGalleries();
buildDoorSigns();
buildFloorArrows();
buildDecor();
buildStops();
fillWelcome();
bindInput();
setView(stops[0].pos[0], stops[0].pos[1], stops[0].look);
setTourText(0);

const clock = new THREE.Clock();
let mapTimer = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateNav(dt);
  const room = updateRoomLabel();
  mapTimer += dt;
  if (mapTimer > 0.1) { mapTimer = 0; drawMap(room); }
  renderer.render(scene, camera);
});

window.__museum = { goTour, focusPainting, setView, stops, paintings, camera };
