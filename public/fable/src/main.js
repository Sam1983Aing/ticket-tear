// Stage, hands and checkout. The ticket itself lives in ticket.js, the bending in paper.js,
// the perforation in tear.js and the sound in audio.js.
import * as THREE from 'three';
import { W, H, YP, N } from './spec.js';
import { Ticket } from './ticket.js';
import { Tear } from './tear.js';
import { Sound } from './audio.js';
import { angleForShortening, shortening, insideOutline } from './paper.js';
import { FACES } from './art.js';

const Q = new URLSearchParams(location.search);
const REC = Q.has('rec');
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BG = '#272523';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// A value on a spring. Most of the feel of the card is in how these are tuned.
class Spring {
  constructor(x = 0, k = 140, d = 18) { this.x = x; this.v = 0; this.t = x; this.k = k; this.d = d; }
  step(dt) { for (let i = 0; i < 2; i++) { this.v += ((this.t - this.x) * this.k - this.v * this.d) * dt / 2; this.x += this.v * dt / 2; } return this.x; }
}

// ---------------------------------------------------------------- stage
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
const cam = new THREE.PerspectiveCamera(22, 1, 5, 400);

// The room the foil and the paper reflect: a few glowing panels in the dark, like a photo studio.
{
  const room = new THREE.Scene(); room.background = new THREE.Color(0x040404);
  const panel = (w, h, x, y, z, r, g, b) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m); };
  panel(44, 28, -30, 32, 40, 8, 7.8, 7.2);     // big warm softbox, up and to the left
  panel(7, 70, 48, 4, 16, 3.0, 3.5, 4.4);      // tall cool strip on the right
  panel(34, 8, 8, -44, 28, 2.4, 1.5, 0.9);     // low amber kicker
  panel(80, 80, 0, 0, -70, 0.3, 0.3, 0.34);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(room, 0.02, 1, 300).texture;
  pm.dispose();
}
const key = new THREE.DirectionalLight(0xfff7ec, 2.2);
key.position.set(-10, 16, 26); key.castShadow = true;
Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 4, far: 80 });
key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 18; key.shadow.blurSamples = 16; key.shadow.bias = -0.0005;
scene.add(key);

// Backdrop: a pool of light painted with a gradient, and a plane that only shows the shadow.
{
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), gr = g.createRadialGradient(256, 236, 0, 256, 256, 256);
  gr.addColorStop(0, '#5c5850'); gr.addColorStop(0.3, '#47443e'); gr.addColorStop(0.65, '#33312d'); gr.addColorStop(1, BG);
  g.fillStyle = BG; g.fillRect(0, 0, 512, 512); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const im = g.getImageData(0, 0, 512, 512);   // a little noise so the dark gradient does not band
  for (let i = 0; i < im.data.length; i += 4) { const n = (Math.random() - 0.5) * 2.4; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  back.position.z = -2.6; scene.add(back);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.ShadowMaterial({ opacity: 0.5 }));
  sh.position.z = -2.58; sh.receiveShadow = true; scene.add(sh);
}

// The ticket's faces are drawn on a canvas, so the type has to have arrived first.
await Promise.race([Promise.all(FACES.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 3000))]).catch(() => {});

const tear = new Tear(THREE);
const ticket = new Ticket(renderer, tear);
const rig = ticket.rig, stubRig = ticket.stubRig;
scene.add(rig);
const sound = new Sound({ record: REC });

// ---------------------------------------------------------------- layout
const view = { w: 1, h: 1, ppu: 40, cx: 0, cy: 0, wide: true };
function layout() {
  const w = innerWidth, h = innerHeight, wide = w >= 1000;
  renderer.setSize(w, h, false);
  let ppu, cx, cy;
  if (wide) { ppu = Math.min(0.76 * h / H, 0.3 * w / W); cx = w * 0.55; cy = h * 0.5; }
  else { const top = 76, bottom = 212; ppu = Math.min((h - top - bottom) / H, 0.72 * w / W); cx = w / 2; cy = top + (h - top - bottom) / 2; }
  cam.aspect = w / h;
  cam.position.set(0, 0, (h / ppu) / (2 * Math.tan(cam.fov * Math.PI / 360)));
  cam.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
  cam.updateProjectionMatrix();
  Object.assign(view, { w, h, ppu, cx, cy, wide });
}
addEventListener('resize', layout); layout();

// ---------------------------------------------------------------- state
const st = {
  mode: 'idle', pid: null, time: 0, now: 0, facing: 1, flips: 0,
  yaw: new Spring(-0.7, 70, 13), tilt: new Spring(0, 60, 13), pitch: new Spring(-0.5, 60, 13), roll: new Spring(0, 120, 14),
  px: new Spring(0, 220, 20), py: new Spring(3.2, 90, 13), home: new Spring(0, 60, 14),
  theta: new Spring(0, 900, 60),                       // the bend you are making
  beta: new Spring(0, 260, 15), alpha: new Spring(0, 240, 18), phi: new Spring(0, 300, 17), lambda: 0.2, tx: W / 2,
  hover: { x: 0, y: 0 }, grab: { x: 0, y: 0 }, w0: new THREE.Vector3(), resid: { x: 0, y: 0 },
  pull: { x: 0, y: 0, q: 0, len: 0 }, qBase: 0, qPrev: 0, vq: 0, tearFacing: 1, creak: 0, snapsFrame: 0, rate: 0,
  ptr: { x: 0, y: 0 }, last: { x: 0, y: 0, t: 0 }, moved: 0, downT: 0, lastTap: -1e9, yaw0: 0, used: false,
  stub: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, grab: new THREE.Vector3() },
};
st.yaw.t = 0;   // it arrives turned away and settles to face you

// ---------------------------------------------------------------- pointer to card
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4(), ro = new THREE.Vector3(), rd = new THREE.Vector3();
const setRay = (x, y) => { ndc.set(x / view.w * 2 - 1, -(y / view.h * 2 - 1)); ray.setFromCamera(ndc, cam); };
// where the pointer meets a wall at depth z, in world space
function worldPoint(x, y, z, out) { setRay(x, y); const o = ray.ray.origin, d = ray.ray.direction, t = (z - o.z) / d.z; return out.set(o.x + d.x * t, o.y + d.y * t, z); }
// where it meets a card, in that card's own flat coordinates
function sheetPoint(x, y, group, out) {
  setRay(x, y); inv.copy(group.matrixWorld).invert();
  ro.copy(ray.ray.origin).applyMatrix4(inv); rd.copy(ray.ray.direction).transformDirection(inv);
  const t = -ro.z / rd.z; out.x = ro.x + rd.x * t; out.y = ro.y + rd.y * t; return out;
}
const hp = { x: 0, y: 0 };
function hit(x, y) {
  if (!ticket.attached) { sheetPoint(x, y, stubRig, hp); if (insideOutline(hp.x, hp.y) && hp.y < YP + 0.15) return { part: 'free', x: hp.x, y: hp.y }; }
  sheetPoint(x, y, rig, hp);
  if (!insideOutline(hp.x, hp.y)) return null;
  if (hp.y < YP) return ticket.attached ? { part: 'stub', x: hp.x, y: hp.y } : null;
  return { part: 'body', x: hp.x, y: hp.y };
}

// ---------------------------------------------------------------- hands
const wp = new THREE.Vector3();

canvas.addEventListener('pointerdown', e => {
  if (st.pid !== null) return;
  e.preventDefault(); canvas.focus({ preventScroll: true });
  sound.unlock();
  st.pid = e.pointerId; canvas.setPointerCapture(e.pointerId);
  st.ptr.x = e.clientX; st.ptr.y = e.clientY; st.last = { x: e.clientX, y: e.clientY, t: e.timeStamp }; st.moved = 0; st.downT = e.timeStamp; st.downX = e.clientX;
  worldPoint(e.clientX, e.clientY, 0, st.w0);
  const h = hit(e.clientX, e.clientY);
  if (!h) { st.mode = 'orbit'; st.yaw0 = st.yaw.t; }
  else if (h.part === 'body') {
    st.mode = 'bend'; st.grab.x = h.x; st.grab.y = h.y; st.theta.k = 900; st.theta.d = 60;
  } else if (h.part === 'stub') {
    st.mode = 'tear'; st.grab.x = h.x; st.grab.y = h.y; st.tearFacing = st.facing; st.used = true;
    tear.begin(h.x >= 0 ? 1 : -1);
    st.qBase = tear.snapped ? tear.thr[tear.snapped] - 0.3 : 0; st.qPrev = 0; st.vq = 0; st.creak = 0;
    st.pull.x = st.pull.y = st.pull.q = st.pull.len = 0;
  } else {
    st.mode = 'carry'; st.stub.grab.set(h.x, h.y, 0); st.stub.pos.copy(st.stub.grab); stubRig.localToWorld(st.stub.pos);
  }
  canvas.style.cursor = h ? 'grabbing' : 'ew-resize';
});

canvas.addEventListener('pointermove', e => {
  if (st.pid === null) {
    if (e.pointerType === 'mouse') {
      st.hover.x = clamp((e.clientX - view.cx) / (view.w * 0.5), -1, 1); st.hover.y = clamp((e.clientY - view.cy) / (view.h * 0.5), -1, 1);
      canvas.style.cursor = hit(e.clientX, e.clientY) ? 'grab' : 'default';
    }
    return;
  }
  if (e.pointerId !== st.pid) return;
  const dt = Math.max(1, e.timeStamp - st.last.t) / 1000;
  st.moved += Math.hypot(e.clientX - st.last.x, e.clientY - st.last.y);
  st.ptr.x = e.clientX; st.ptr.y = e.clientY;
  worldPoint(e.clientX, e.clientY, 0, wp);
  const dxw = wp.x - st.w0.x, dy = wp.y - st.w0.y;

  if (st.mode === 'orbit') {
    st.yaw.t = st.yaw0 + (e.clientX - st.downX) * 0.0085;
  } else if (st.mode === 'bend') {
    bendTo(dxw * st.facing, dy);
  } else if (st.mode === 'tear') {
    const q = Math.hypot(dxw, Math.min(0, dy));            // pulling up into the ticket does nothing
    st.vq += (Math.max(0, (q - st.qPrev) / dt) - st.vq) * 0.5; st.qPrev = q;
    const len = Math.hypot(dxw, dy);
    st.pull.x = dxw; st.pull.y = dy; st.pull.q = q; st.pull.len = len;
    const qe = st.qBase + q, pos = () => tear.side * st.tearFacing * (1 - 2 * (tear.snapped + 0.5) / N);
    // fibres creak as a bridge gets close to giving, but only when you go slowly
    const f = tear.strain(qe), lvl = f > 0.85 ? 2 : f > 0.5 ? 1 : 0;
    if (lvl > st.creak && st.vq < 7) sound.creak(pos());
    st.creak = lvl;
    let n = 0;
    while (!tear.done && qe >= tear.thr[tear.snapped]) {
      const p = pos();
      tear.snap(e.timeStamp, st.vq, len ? dxw * st.tearFacing / len : 0, len ? dy / len : -1);
      const gap = clamp(dt / 6, 0.004, 0.022);
      if (tear.done) sound.release(p); else sound.tick(n * gap, { strength: 0.8 + Math.random() * 0.4, pos: p, speed: Math.min(1, st.vq / 45) });
      n++;
    }
    if (n) { st.snapsFrame += n; st.creak = 0; showTeeth(); if (navigator.vibrate) navigator.vibrate(n > 3 ? 12 : 5); if (tear.done) free(); }
  }
  st.last.x = e.clientX; st.last.y = e.clientY; st.last.t = e.timeStamp;
});

function release(e) {
  if (e.pointerId !== st.pid) return;
  st.pid = null;
  const tap = st.moved < 7 && e.timeStamp - st.downT < 320;
  if (st.mode === 'bend') {
    if (Math.abs(st.theta.x) > 0.3) sound.thup(Math.min(1, Math.abs(st.theta.x) / 1.3));
    st.theta.k = 520; st.theta.d = 9.5; st.theta.t = 0; st.resid.x = st.resid.y = 0;   // let go: it springs flat and wobbles
  } else if (st.mode === 'orbit') {
    const was = st.flips;
    st.flips = Math.round((st.yaw.t + clamp(st.yaw.v * 0.1, -1.3, 1.3)) / Math.PI); st.yaw.t = st.flips * Math.PI;
    if (st.flips !== was) sound.whoosh();
  }
  st.pull.x = st.pull.y = st.pull.q = st.pull.len = 0;
  st.mode = 'idle'; canvas.style.cursor = 'default';
  if (tap) { if (e.timeStamp - st.lastTap < 380) { flip(); st.lastTap = -1e9; } else st.lastTap = e.timeStamp; }
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', e => e.preventDefault());
// iOS only lets sound start when a touch ends, so try again on every release as well as every press
for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, () => sound.unlock(), { passive: true });

// Bend. Where you grab decides which way the card can curl: an edge curls about a line parallel
// to that edge, a corner about a diagonal, and the middle follows the drag. Pushing the grabbed
// point toward that hinge shortens the span on screen, and a sheet that cannot stretch can only
// do that by curling toward you, so we solve for the curl that shortens it by exactly that much.
// The hinge sits a long way from the finger, which keeps the curve wide. Whatever the curl
// cannot give (pulling outward, sliding along the edge) goes into tilting the whole ticket.
function bendTo(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len < 0.02) { st.theta.t = 0; return; }
  const g = st.grab, B = ticket.B, y0 = ticket.attached ? -H / 2 : YP, yc = (y0 + H / 2) / 2, hh = (H / 2 - y0) / 2;
  const ex = Math.abs(g.x) / (W / 2), ey = Math.abs(g.y - yc) / hh, w = smooth(0.2, 0.7, Math.max(ex, ey));
  let ux = Math.sign(g.x) * ex ** 4, uy = Math.sign(g.y - yc) * ey ** 4; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  let mx = ux * w - dx / len * (1 - 0.65 * w), my = uy * w - dy / len * (1 - 0.65 * w); const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
  let smin = Infinity, smax = -Infinity;
  for (const [cx, cy] of [[-W / 2, y0], [W / 2, y0], [-W / 2, H / 2], [W / 2, H / 2]]) { const s = cx * mx + cy * my; smin = Math.min(smin, s); smax = Math.max(smax, s); }
  const sg = g.x * mx + g.y * my, L = clamp(sg - smin - 0.4, 0, 6.4), tail = smax - sg;
  const push = Math.max(0, -(dx * mx + dy * my));           // how far the finger has gone toward the hinge
  let theta = 0, got = 0;
  if (L > 0.6 && push > 0) {
    const want = Math.min(push * (1 - 0.4 * tail / (smax - smin)), L * 0.9);
    theta = angleForShortening(1 - want / L, Math.min(1.4, L / 2.6, tail > 2.4 ? Math.asin(2.4 / tail) : 9));
    got = L * (1 - shortening(theta));
  }
  B.ox = g.x - mx * L; B.oy = g.y - my * L; B.mx = mx; B.my = my; B.L = Math.max(L, 0.01);
  st.theta.t = theta * st.facing;
  st.resid.x = (dx + mx * got) * st.facing; st.resid.y = dy + my * got;
}

function flip() { st.flips += 1; st.yaw.t = st.flips * Math.PI; sound.unlock(); sound.whoosh(); }

// The last bridge went: the stub is its own object now, in your hand.
function free() {
  const S = st.stub;
  S.grab.set(st.grab.x, st.grab.y, 0); S.pos.copy(S.grab); rig.localToWorld(S.pos); S.vel.set(0, 0, 0); S.yaw = st.flips * Math.PI;
  ticket.detach(scene);
  st.mode = 'carry'; st.beta.t = 0; st.alpha.t = 0; st.phi.t = 0; st.beta.k = 200; st.beta.d = 9; st.home.t = 0.6;
  setTimeout(confirm, 430);
}

// The tear without a pointer (T, Enter or Space): the teeth go one by one at a steady pace.
// The page has no button, so this is the way in for anyone who cannot drag.
function autoTear() {
  if (tear.done || st.mode !== 'idle' || !ticket.attached) return;
  sound.unlock(); tear.begin(1); st.tearFacing = st.facing; st.used = true; st.grab.x = 2.6; st.grab.y = YP - 2;
  const step = () => {
    if (tear.done || st.mode !== 'idle' || !ticket.attached) return;
    const p = tear.side * st.tearFacing * (1 - 2 * (tear.snapped + 0.5) / N);
    tear.snap(performance.now(), 10, 0.2, -1); st.snapsFrame++; showTeeth();
    if (tear.done) { sound.release(p); free(); st.mode = 'idle'; }
    else { sound.tick(0, { strength: 0.8 + Math.random() * 0.4, pos: p, speed: 0.2 }); setTimeout(step, 36 + Math.random() * 34); }
  };
  step();
}

function reset() {
  tear.reset(); ticket.attach();
  st.mode = 'idle'; st.beta.t = st.beta.x = 0; st.alpha.t = st.alpha.x = 0; st.phi.t = st.phi.x = 0; st.beta.k = 260; st.beta.d = 15; st.home.t = 0; st.tx = W / 2;
  st.py.x = 3.2; st.pitch.x = -0.5; st.used = false;
  $('status').dataset.state = 'held'; showTeeth(); clock.left = 599;
  sound.whoosh();
}

// ---------------------------------------------------------------- checkout
const clock = { left: 599 };
setInterval(() => { if ($('status').dataset.state !== 'held') return; clock.left = clock.left > 0 ? clock.left - 1 : 599; $('clock').textContent = `${String(clock.left / 60 | 0).padStart(2, '0')}:${String(clock.left % 60).padStart(2, '0')}`; }, 1000);
function showTeeth() { $('count').textContent = String(tear.snapped).padStart(2, '0'); $('meter').style.width = `${tear.progress * 100}%`; }
function confirm() {
  $('code').textContent = tear.code(); $('tale').textContent = tear.tale();
  $('mark').firstElementChild.setAttribute('d', tear.markPath(290, 44));
  $('status').dataset.state = 'in';
}
$('flip').addEventListener('click', flip);
$('again').addEventListener('click', () => { sound.unlock(); reset(); });
$('sound').addEventListener('click', e => { sound.unlock(); const on = sound.toggle(); e.currentTarget.textContent = on ? 'Sound on' : 'Sound off'; e.currentTarget.setAttribute('aria-pressed', on); });
addEventListener('keydown', e => {
  if (e.target.tagName === 'BUTTON') return;
  const k = e.key.toLowerCase();
  if (k === 'f') flip(); else if (k === 'r') reset(); else if (k === 't' || k === 'enter' || k === ' ') { e.preventDefault(); autoTear(); }
});

// ---------------------------------------------------------------- every frame
const v3 = new THREE.Vector3(), eul = new THREE.Euler(), qt = new THREE.Quaternion();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.034, (now - st.now) / 1000 || 0.016); st.now = now; st.time += dt;
  const fx = st.facing, sway = CALM ? 0 : 1;

  // where the whole ticket wants to sit
  let pitchT = 0.03 - st.hover.y * 0.1 + Math.sin(st.time * 0.7) * 0.04 * sway;
  let tiltT = st.hover.x * 0.16 + Math.sin(st.time * 0.53 + 1) * 0.07 * sway;
  let pxT = 0, pyT = 0, rollT = 0;
  if (st.mode === 'bend') {
    tiltT = clamp(-st.resid.x * 0.07, -0.5, 0.5); pitchT = clamp(st.resid.y * 0.07, -0.5, 0.5);
    pxT = clamp(st.resid.x * 0.1, -0.8, 0.8); pyT = clamp(st.resid.y * 0.1, -0.8, 0.8);
  } else if (st.mode === 'tear') {
    // Tear stance: the ticket tips toward you and gives a little in the direction of the pull,
    // so the torn part lifting off the card reads as the stub coming away.
    const pl = st.pull, f = tear.strain(st.qBase + pl.q), sw = tear.side * st.tearFacing;
    const dirx = pl.len > 0.01 ? pl.x / pl.len : 0, diry = pl.len > 0.01 ? pl.y / pl.len : -1;
    const eng = smooth(0, 0.6, pl.len), down = clamp(-diry, 0, 1), fol = Math.min(pl.len, 4) * 0.22 + f * 0.12;
    pitchT = 0.12 + 0.22 * eng; tiltT = 0.2 * sw * eng;
    pxT = dirx * fol; pyT = diry * fol; rollT = clamp(pl.x * 0.018, -0.12, 0.12);
    st.beta.t = (0.5 + 0.22 * f + 0.2 * Math.min(1, pl.q / 3)) * eng;
    st.alpha.t = (0.2 + 0.1 * f) * down * eng;
    st.phi.t = (0.05 + 0.2 * Math.min(1, pl.q / 3) + 0.06 * f) * eng;
    st.lambda += (0.1 + 0.42 * down - st.lambda) * 0.2;
  }
  if (ticket.attached && st.mode !== 'tear') { st.beta.t = 0.2 * Math.sqrt(tear.progress); st.alpha.t = 0; st.phi.t = 0.05 * tear.progress; }
  st.pitch.t = pitchT; st.tilt.t = tiltT; st.px.t = pxT; st.py.t = pyT; st.roll.t = rollT;
  for (const k of ['yaw', 'tilt', 'pitch', 'roll', 'px', 'py', 'home', 'theta', 'beta', 'alpha', 'phi']) st[k].step(dt);
  st.facing = Math.cos(st.yaw.x) >= 0 ? 1 : -1;

  rig.position.set(st.px.x, st.home.x + st.py.x, 0);
  rig.rotation.set(st.pitch.x, st.yaw.x + st.tilt.x, st.roll.x * fx, 'XYZ');

  // pose of the card itself
  ticket.B.theta = st.theta.x;
  st.tx += (tear.frontX - st.tx) * (1 - Math.exp(-dt * 50));
  const F = ticket.F, s = tear.side || 1;
  F.ox = st.tx; F.oy = YP; F.mx = s * Math.cos(st.lambda); F.my = Math.sin(st.lambda); F.L = 1.9; F.theta = st.beta.x * st.tearFacing;
  ticket.alpha = st.alpha.x * st.tearFacing; ticket.phi = -s * st.phi.x;
  ticket.update();

  // the stub once it is free: it trails the hand, leans into the motion, and comes to rest below
  if (!ticket.attached) {
    const S = st.stub, sw = tear.side * st.tearFacing, carried = st.mode === 'carry';
    if (carried) {
      const floor = worldPoint(st.ptr.x, view.h, 1.6, wp).y + S.grab.y + H / 2 + 0.35;   // keep the whole stub on screen
      worldPoint(st.ptr.x, st.ptr.y, 1.6, v3); v3.y = Math.max(v3.y, floor);
      eul.set(clamp(-S.vel.y * 0.025, -0.5, 0.5) + 0.1, S.yaw + clamp(S.vel.x * 0.025, -0.5, 0.5), clamp(-S.vel.x * 0.02, -0.5, 0.5) * st.tearFacing, 'XYZ');
    } else {
      eul.set(0.03, S.yaw + 0.05 * sw, -0.055 * sw * st.tearFacing, 'XYZ');
      qt.setFromEuler(eul);
      v3.copy(S.grab).applyQuaternion(qt).add(wp.set(0.4 * sw, st.home.x - 1.15, 0.25));
    }
    qt.setFromEuler(eul);
    const a = 1 - Math.exp(-dt * (carried ? 20 : 9));
    wp.copy(S.pos); S.pos.lerp(v3, a);
    wp.subVectors(S.pos, wp).divideScalar(dt); S.vel.lerp(wp, 0.25);
    stubRig.quaternion.slerp(qt, 1 - Math.exp(-dt * 12));
    stubRig.position.copy(S.grab).applyQuaternion(stubRig.quaternion).negate().add(S.pos);
  }

  // sound that follows motion
  st.rate += (st.snapsFrame / dt - st.rate) * (st.snapsFrame ? 0.7 : 0.2); st.snapsFrame = 0;
  sound.setRip(st.rate);
  sound.setFlex(Math.abs(st.theta.v) * (st.mode === 'bend' ? 1 : 0.25));

  // the small "pull to tear" cue rides on the stub's corner until you have used it
  const cue = $('cue'), showCue = ticket.attached && !st.used && st.mode === 'idle' && st.time > 1.6 && fx > 0;
  cue.classList.toggle('on', showCue);
  if (showCue) { const p = screenOf(2.9, YP - 2.9); cue.style.transform = `translate(${p.x}px, ${p.y}px)`; }

  renderer.render(scene, cam);
}

function screenOf(x, y, group = rig) {
  v3.set(x, y, 0); group.updateMatrixWorld(); v3.applyMatrix4(group.matrixWorld).project(cam);
  return { x: (v3.x * 0.5 + 0.5) * view.w, y: (-v3.y * 0.5 + 0.5) * view.h };
}

// A visible pointer for recordings (headless Chrome draws no cursor).
if (REC) {
  const c = $('cursor'); c.style.display = 'block';
  const mv = e => { c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; c.classList.toggle('touch', e.pointerType === 'touch'); };
  addEventListener('pointermove', mv, true);
  addEventListener('pointerdown', e => { mv(e); c.classList.add('down'); }, true);
  addEventListener('pointerup', () => c.classList.remove('down'), true);
}

showTeeth();
ticket.update();
requestAnimationFrame(frame);
window.__demo = { screenOf: (x, y, free) => screenOf(x, y, free ? stubRig : rig), state: () => ({ mode: st.mode, snapped: tear.snapped, done: tear.done, flips: st.flips, theta: st.theta.x, audio: sound.ctx ? sound.ctx.state : 'none' }), st, tear, ticket, reset };
window.__ready = true;
