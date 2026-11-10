// How the card bends.
// Paper does not stretch, so every bend here is a roll around one straight line (a "developable"
// bend): pick a hinge line, everything past it wraps onto a curve, everything before it stays flat.
// The curve is not a circle. Its curvature eases in and out (angle follows a smoothstep), which is
// what makes it read as stiff card instead of a page curl. Past the bend the sheet runs on straight.
import { W, H, YP, RC, RN, THICK, MARGIN } from './spec.js';

const LUT = 32;

export function makeBend() {
  return { ox: 0, oy: 0, mx: 1, my: 0, L: 1, theta: 0, X: new Float32Array(LUT + 1), Z: new Float32Array(LUT + 1), c: 1, s: 0 };
}

// Walk along the bend once and remember where each step lands, so vertices only need a lookup.
export function bakeBend(b) {
  let x = 0, z = 0, pc = 1, ps = 0;
  const step = b.L / LUT;
  for (let i = 1; i <= LUT; i++) {
    const u = i / LUT, th = b.theta * u * u * (3 - 2 * u), c = Math.cos(th), s = Math.sin(th);
    x += (pc + c) * 0.5 * step; z += (ps + s) * 0.5 * step;
    b.X[i] = x; b.Z[i] = z; pc = c; ps = s;
  }
  b.c = Math.cos(b.theta); b.s = Math.sin(b.theta);
}

export function bendApply(b, p) {
  if (b.theta === 0) return;
  const dx = p.x - b.ox, dy = p.y - b.oy;
  const s = dx * b.mx + dy * b.my;
  if (s <= 0) return;
  const t = -dx * b.my + dy * b.mx, z = p.z;
  let X, Z, c, sn;
  if (s < b.L) {
    const f = s / b.L * LUT, i = Math.min(LUT - 1, f | 0), r = f - i, u = s / b.L, th = b.theta * u * u * (3 - 2 * u);
    X = b.X[i] + (b.X[i + 1] - b.X[i]) * r; Z = b.Z[i] + (b.Z[i + 1] - b.Z[i]) * r;
    c = Math.cos(th); sn = Math.sin(th);
  } else {
    X = b.X[LUT] + (s - b.L) * b.c; Z = b.Z[LUT] + (s - b.L) * b.s; c = b.c; sn = b.s;
  }
  const S2 = X - z * sn;
  p.x = b.ox + b.mx * S2 - b.my * t;
  p.y = b.oy + b.my * S2 + b.mx * t;
  p.z = Z + z * c;
}

// How much shorter a bent span looks from the front, for a given total angle. Used backwards:
// "the finger moved this far in, so how much must the card curl?"
const CTAB = new Float32Array(121);
for (let k = 0; k <= 120; k++) {
  const th = k / 60; let acc = 0;
  for (let i = 0; i < 64; i++) { const u = (i + 0.5) / 64; acc += Math.cos(th * u * u * (3 - 2 * u)); }
  CTAB[k] = acc / 64;
}
export function angleForShortening(ratio, maxTheta) {
  const kmax = Math.min(120, Math.round(maxTheta * 60));
  for (let k = 0; k < kmax; k++) {
    if (CTAB[k + 1] <= ratio) return (k + (CTAB[k] - ratio) / (CTAB[k] - CTAB[k + 1])) / 60;
  }
  return kmax / 60;
}
export const shortening = theta => { const f = Math.min(119.999, Math.abs(theta) * 60), i = f | 0; return CTAB[i] + (CTAB[i + 1] - CTAB[i]) * (f - i); };

// ---------------------------------------------------------------- geometry

// Outline of one piece as a list of points with their outward direction, walked anticlockwise.
// The perforation side is left open: that edge is cut in the shader, tooth by tooth.
function outline(kind) {
  const pts = [], hw = W / 2, hh = H / 2;
  const seg = (x0, y0, x1, y1, ox, oy) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.15)); for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, ox, oy]); };
  const arc = (cx, cy, r, a0, a1, inward) => { for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8, c = Math.cos(a), s = Math.sin(a); pts.push([cx + c * r, cy + s * r, inward ? -c : c, inward ? -s : s]); } };
  const P = Math.PI;
  if (kind === 'body') {
    arc(hw, YP, RN, P, P / 2, true);
    seg(hw, YP + RN, hw, hh - RC, 1, 0);
    arc(hw - RC, hh - RC, RC, 0, P / 2);
    seg(hw - RC, hh, -hw + RC, hh, 0, 1);
    arc(-hw + RC, hh - RC, RC, P / 2, P);
    seg(-hw, hh - RC, -hw, YP + RN, -1, 0);
    arc(-hw, YP, RN, P / 2, 0, true);
  } else {
    arc(-hw, YP, RN, 0, -P / 2, true);
    seg(-hw, YP - RN, -hw, -hh + RC, -1, 0);
    arc(-hw + RC, -hh + RC, RC, P, P * 1.5);
    seg(-hw + RC, -hh, hw - RC, -hh, 0, -1);
    arc(hw - RC, -hh + RC, RC, P * 1.5, P * 2);
    seg(hw, -hh + RC, hw, YP - RN, 1, 0);
    arc(hw, YP, RN, P * 1.5, P, true);
  }
  return pts;
}

// One piece of the ticket: a front sheet, a back sheet and a wall around the outside.
// Positions are rewritten on the CPU whenever the pose changes (about 8,000 points for the body).
export function buildPiece(THREE, kind) {
  const y0 = kind === 'body' ? YP - MARGIN : -H / 2, y1 = kind === 'body' ? H / 2 : YP + MARGIN;
  const nx = 64, ny = Math.round((y1 - y0) / (W / nx)), cols = nx + 1, rows = ny + 1, G = cols * rows;
  const path = outline(kind), Pn = path.length, total = 2 * G + 2 * Pn;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), sheet = new Float32Array(total * 2), face = new Float32Array(total);
  for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
    const i = iy * cols + ix, x = -W / 2 + W * ix / nx, y = y0 + (y1 - y0) * iy / ny;
    sheet[i * 2] = x; sheet[i * 2 + 1] = y; face[i] = 0;
    sheet[(G + i) * 2] = x; sheet[(G + i) * 2 + 1] = y; face[G + i] = 1;
  }
  path.forEach(([x, y], k) => { for (let j = 0; j < 2; j++) { const i = 2 * G + k * 2 + j; sheet[i * 2] = x; sheet[i * 2 + 1] = y; face[i] = 2; } });
  const idx = [];
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const a = iy * cols + ix, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c, G + a, G + c, G + b, G + b, G + c, G + d);
  }
  for (let k = 0; k < Pn - 1; k++) { const a = 2 * G + k * 2, b = a + 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('sheet', new THREE.BufferAttribute(sheet, 2));
  geo.setAttribute('face', new THREE.BufferAttribute(face, 1));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
  return { kind, geo, cols, rows, G, path, mid: new Float32Array(G * 3), sheet };
}

const P = { x: 0, y: 0, z: 0 }, A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 };

// Push every point of a piece through `map` (flat sheet coords in, bent position out).
export function updatePiece(piece, map) {
  const { cols, rows, G, mid, sheet, path, geo } = piece;
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array, h = THICK / 2;
  for (let i = 0; i < G; i++) { P.x = sheet[i * 2]; P.y = sheet[i * 2 + 1]; P.z = 0; map(P); mid[i * 3] = P.x; mid[i * 3 + 1] = P.y; mid[i * 3 + 2] = P.z; }
  for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
    const i = iy * cols + ix;
    const l = (iy * cols + Math.max(0, ix - 1)) * 3, r = (iy * cols + Math.min(cols - 1, ix + 1)) * 3;
    const d = (Math.max(0, iy - 1) * cols + ix) * 3, u = (Math.min(rows - 1, iy + 1) * cols + ix) * 3;
    const ax = mid[r] - mid[l], ay = mid[r + 1] - mid[l + 1], az = mid[r + 2] - mid[l + 2];
    const bx = mid[u] - mid[d], by = mid[u + 1] - mid[d + 1], bz = mid[u + 2] - mid[d + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
    const f = i * 3, bk = (G + i) * 3;
    pos[f] = mid[f] + nx * h; pos[f + 1] = mid[f + 1] + ny * h; pos[f + 2] = mid[f + 2] + nz * h;
    pos[bk] = mid[f] - nx * h; pos[bk + 1] = mid[f + 1] - ny * h; pos[bk + 2] = mid[f + 2] - nz * h;
    nor[f] = nx; nor[f + 1] = ny; nor[f + 2] = nz; nor[bk] = -nx; nor[bk + 1] = -ny; nor[bk + 2] = -nz;
  }
  const e = 0.02;
  for (let k = 0; k < path.length; k++) {
    const [x, y, ox, oy] = path[k];
    P.x = x; P.y = y; P.z = 0; map(P);
    A.x = x + e; A.y = y; A.z = 0; map(A);
    B.x = x; B.y = y + e; B.z = 0; map(B);
    const ax = (A.x - P.x) / e, ay = (A.y - P.y) / e, az = (A.z - P.z) / e, bx = (B.x - P.x) / e, by = (B.y - P.y) / e, bz = (B.z - P.z) / e;
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
    let wx = ax * ox + bx * oy, wy = ay * ox + by * oy, wz = az * ox + bz * oy;
    const wl = 1 / Math.hypot(wx, wy, wz); wx *= wl; wy *= wl; wz *= wl;
    const i = (2 * G + k * 2) * 3;
    pos[i] = P.x + nx * h; pos[i + 1] = P.y + ny * h; pos[i + 2] = P.z + nz * h;
    pos[i + 3] = P.x - nx * h; pos[i + 4] = P.y - ny * h; pos[i + 5] = P.z - nz * h;
    nor[i] = wx; nor[i + 1] = wy; nor[i + 2] = wz; nor[i + 3] = wx; nor[i + 4] = wy; nor[i + 5] = wz;
  }
  geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
}

// Is this flat sheet point inside the ticket outline (rounded corners, notches)?
export function insideOutline(x, y) {
  const qx = Math.abs(x) - (W / 2 - RC), qy = Math.abs(y) - (H / 2 - RC);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RC;
  return d < 0 && Math.hypot(Math.abs(x) - W / 2, y - YP) > RN;
}
