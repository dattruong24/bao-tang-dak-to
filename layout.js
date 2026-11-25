// Floor plan and wall slots of the museum. No three.js here: museum.js (3D) and quan-ly.html (manager)
// both import it, so the manager's per-room picture limit always matches what the walls can hold.

export const WALL_T = 0.3;
export const CORNER = 0.9;         // no picture closer than this to a corner
export const DOOR_GAP = 0.6;       // no picture closer than this to a door frame

// Floor plan, seen from above (metres). x grows east, z grows south; the entrance is on the south wall.
export const ROOMS = {
  lobby: { x0: -8, x1: 8, z0: 6, z1: 18, h: 7, floor: 'marble_tiles', floorTile: 5.0, floorGloss: 0.45 },
  g1: { x0: -24, x1: -8, z0: 6, z1: 18, h: 5, floor: 'herringbone_parquet', floorTile: 1.6 },
  g2: { x0: -24, x1: 0, z0: -8, z1: 6, h: 5, floor: 'herringbone_parquet', floorTile: 1.6 },
  g3: { x0: 0, x1: 24, z0: -8, z1: 6, h: 5, floor: 'herringbone_parquet', floorTile: 1.6 },
  g4: { x0: 8, x1: 24, z0: 6, z1: 18, h: 5, floor: 'herringbone_parquet', floorTile: 1.6 },
};
export const DOOR = { half: 1.5, top: 4 };

// [x1, z1, x2, z2, height, doorAt?]  doorAt = position of a doorway along the wall.
export const WALLS = [
  [-24, 18, -8, 18, 5], [-8, 18, 8, 18, 7], [8, 18, 24, 18, 5],
  [-24, -8, 0, -8, 5], [0, -8, 24, -8, 5],
  [-24, -8, -24, 6, 5], [-24, 6, -24, 18, 5],
  [24, -8, 24, 6, 5], [24, 6, 24, 18, 5],
  [-8, 6, -8, 18, 7, 12], [8, 6, 8, 18, 7, 12],
  [-24, 6, -8, 6, 5, -16], [-8, 6, 8, 6, 7], [8, 6, 24, 6, 5, 16],
  [0, -8, 0, 6, 5, -1],
];
export const DOORS = WALLS.filter((w) => w[5] !== undefined).map(([x1, z1, , z2, , d]) => (z1 === z2 ? [d, z1] : [x1, d]));

// Visiting order: lobby -> gian 1 -> 2 -> 3 -> 4 -> lobby. entry/exit are doorways.
export const ROUTE = [
  { room: 'g1', entry: [-8, 12], exit: [-16, 6] },
  { room: 'g2', entry: [-16, 6], exit: [0, -1] },
  { room: 'g3', entry: [0, -1], exit: [16, 6] },
  { room: 'g4', entry: [16, 6], exit: [8, 12] },
];
export const FLOOR_PATH = [[0, 17], [0, 12], [-8, 12], [-16, 12], [-16, 6], [-16, -1], [0, -1], [16, -1], [16, 6],
  [16, 12], [8, 12], [3.5, 12]];
export const PLAN = { x0: -24, x1: 24, z0: -8, z1: 18 };

export function roomEdges(r) {
  return [
    { wall: 'N', a: [r.x0, r.z0], b: [r.x1, r.z0] },
    { wall: 'E', a: [r.x1, r.z0], b: [r.x1, r.z1] },
    { wall: 'S', a: [r.x1, r.z1], b: [r.x0, r.z1] },
    { wall: 'W', a: [r.x0, r.z1], b: [r.x0, r.z0] },
  ].map((e) => ({ ...e, len: Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) }));
}

// Distance of point p along edge e, or null when p is not on that edge.
export function along(e, p) {
  const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1];
  const t = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dz) / (e.len * e.len);
  const off = Math.abs((p[0] - e.a[0]) * dz - (p[1] - e.a[1]) * dx) / e.len;
  return off < 0.01 && t >= 0 && t <= 1 ? t * e.len : null;
}

// A spot on the inner face of a wall: position, facing (ry) and the normal pointing into the room.
export function wallSpot(e, s, lift = 0.05) {
  const t = s / e.len;
  const x = e.a[0] + (e.b[0] - e.a[0]) * t, z = e.a[1] + (e.b[1] - e.a[1]) * t;
  const [nx, nz, ry] = { N: [0, 1, 0], E: [-1, 0, -Math.PI / 2], S: [0, -1, Math.PI], W: [1, 0, Math.PI / 2] }[e.wall];
  const off = WALL_T / 2 + lift;
  return { x: x + nx * off, z: z + nz * off, nx, nz, ry };
}

// Usable stretches of wall in visiting order: clockwise from the entry door, skipping corners and doors.
export function wallIntervals(r, entry) {
  const intervals = [];
  let base = 0, entryT = 0;
  for (const e of roomEdges(r)) {
    const cuts = [[0, CORNER], [e.len - CORNER, e.len]];
    for (const d of DOORS) {
      const s = along(e, d);
      if (s !== null) cuts.push([s - DOOR.half - DOOR_GAP, s + DOOR.half + DOOR_GAP]);
    }
    const se = along(e, entry);
    if (se !== null) entryT = base + se;
    cuts.sort((p, q) => p[0] - q[0]);
    let s0 = 0;
    for (const [c0, c1] of cuts) {
      if (c0 - s0 > 1.2) intervals.push({ e, s0, s1: c0, T: base + s0 });
      s0 = Math.max(s0, c1);
    }
    base += e.len;
  }
  const order = (it) => (it.T - entryT + base) % base;
  return intervals.sort((p, q) => order(p) - order(q));
}

export function wallSlots(r, count, entry) {
  const intervals = wallIntervals(r, entry);
  const total = intervals.reduce((s, it) => s + it.s1 - it.s0, 0);
  const raw = intervals.map((it) => ((it.s1 - it.s0) / total) * count);
  const n = raw.map(Math.floor);
  const left = count - n.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - n[i], i]).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, i]) => { n[i] += 1; });
  const slots = [];
  intervals.forEach((it, i) => {
    const step = (it.s1 - it.s0) / n[i];
    for (let k = 0; k < n[i]; k++) slots.push({ ...wallSpot(it.e, it.s0 + (k + 0.5) * step), width: step });
  });
  return slots;
}

// Picture limit per room: every picture keeps at least MIN_SLOT metres of wall (frame up to MIN_SLOT - 0.8 m wide),
// measured 2026-11-25: g1 16, g2 21, g3 21, g4 16.
export const MIN_SLOT = 2.2;
export function capacity(roomId) {
  const r = ROUTE.find((x) => x.room === roomId);
  if (!r) return 0;
  const narrowest = (c) => Math.min(...wallSlots(ROOMS[roomId], c, r.entry).map((s) => s.width));
  let c = 1;
  while (narrowest(c + 1) >= MIN_SLOT) c++;
  return c;
}
