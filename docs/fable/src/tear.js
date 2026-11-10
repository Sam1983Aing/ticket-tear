// The perforation: 44 paper bridges that give one at a time, and the edge they leave behind.
// The torn edge is not a stock shape. Each bridge records how it was broken (how fast the hand
// was moving, which way it pulled, whether it hesitated first) and that decides where the paper
// lets go. The result is written into a tiny texture the shader uses to cut both pieces.
import { W, N, PITCH } from './spec.js';

const COLS = 512;

export class Tear {
  constructor(THREE) {
    this.data = new Uint8Array(COLS * 4);
    this.tex = new THREE.DataTexture(this.data, COLS, 1, THREE.RGBAFormat);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.reset();
  }

  reset() {
    this.side = 0; this.snapped = 0; this.done = false;
    this.off = new Float32Array(N); this.feather = new Float32Array(N); this.speed = new Float32Array(N); this.wait = new Float32Array(N);
    this.wander = 0; this.run = 0; this.runTarget = 0; this.t0 = 0; this.t1 = 0;
    // How far the hand has to travel before each bridge gives. Uneven on purpose: paper is.
    const total = W * 0.36, first = 0.3, inc = [];
    let sum = 0;
    for (let i = 1; i < N; i++) { const w = 0.5 + Math.random(); inc.push(w); sum += w; }
    this.thr = new Float32Array(N); this.thr[0] = first;
    for (let i = 1; i < N; i++) this.thr[i] = this.thr[i - 1] + inc[i - 1] / sum * (total - first);
    this.thr[N - 1] += 0.55;   // the last tooth holds on
    for (let c = 0; c < COLS; c++) { this.data[c * 4] = 128; this.data[c * 4 + 1] = 0; this.data[c * 4 + 2] = 0; this.data[c * 4 + 3] = 255; }
    this.tex.needsUpdate = true;
  }

  begin(side) { if (!this.side) this.side = side; }
  get progress() { return this.snapped / N; }
  // where the tear has reached, in sheet x
  get frontX() { return (this.side || 1) * (W / 2 - this.snapped * PITCH); }
  // 0..1: how close the next bridge is to giving, for a given amount of pull
  strain(q) { const i = this.snapped; if (i >= N) return 0; const a = i ? this.thr[i - 1] : 0; return Math.max(0, Math.min(1, (q - a) / (this.thr[i] - a))); }

  // Break the next bridge. v is hand speed (units per second), dx and dy the pull direction.
  snap(now, v, dx, dy) {
    const i = this.snapped, s = Math.min(1, v / 45);
    const wait = i ? now - this.t1 : 0, hes = i && wait > 320 ? Math.min(1, (wait - 320) / 900) : 0;
    if (!i) this.t0 = now;
    this.t1 = now;
    // A calm pull breaks each bridge near the line. A fast one lets the tear run off into the
    // card for a few teeth before it finds the next hole.
    if (this.run > 0) this.run--;
    else if (Math.random() < 0.04 + 0.3 * s * s) { this.run = 2 + (Math.random() * 4 | 0); this.runTarget = (Math.random() < 0.5 + 0.35 * dy ? -1 : 1) * (0.05 + 0.13 * s); }
    else this.runTarget = 0.03 * s * dx;
    this.wander += (this.runTarget - this.wander) * 0.6;
    let o = this.wander + (Math.random() - 0.5) * (0.02 + 0.07 * s) - hes * 0.07;
    this.off[i] = Math.max(-0.2, Math.min(0.2, o));
    this.feather[i] = Math.min(0.24, 0.025 + 0.1 * s + 0.06 * hes);
    this.speed[i] = v; this.wait[i] = wait;
    this.snapped++;
    if (this.snapped >= N) this.done = true;
    this.write();
  }

  write() {
    const n = this.snapped, d = this.data;
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) / COLS * W - W / 2, cell = (W / 2 - this.side * x) / PITCH;
      if (cell >= n) { d[c * 4] = 128; d[c * 4 + 1] = 0; d[c * 4 + 2] = 0; continue; }
      const f = cell - 0.5, j = Math.floor(f), t = f - j, a = Math.max(0, Math.min(n - 1, j)), b = Math.max(0, Math.min(n - 1, j + 1));
      d[c * 4] = Math.round(128 + (this.off[a] + (this.off[b] - this.off[a]) * t) / 0.6 * 255);
      d[c * 4 + 1] = Math.round((this.feather[a] + (this.feather[b] - this.feather[a]) * t) / 0.25 * 255);
      d[c * 4 + 2] = 255;
    }
    this.tex.needsUpdate = true;
  }

  // A short code from the edge, so two tears never share one.
  code() {
    let h = 2166136261;
    for (let i = 0; i < N; i++) { h ^= Math.round(this.off[i] * 500) + 128; h = Math.imul(h, 16777619); h ^= Math.round(this.feather[i] * 400); h = Math.imul(h, 16777619); }
    const a = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let s = '';
    for (let i = 0; i < 7; i++) { s += a[(h >>> (i * 4)) & 31]; if (i === 3) s += '-'; }
    return 'PRH-' + s;
  }

  // One line about how it was torn.
  tale() {
    const secs = (this.t1 - this.t0) / 1000, stops = Array.from(this.wait).filter(w => w > 500).length;
    const how = secs < 0.7 ? 'One pull.' : secs < 3 ? 'A steady hand.' : 'A patient tear.';
    const pause = stops === 0 ? '' : stops === 1 ? ' You stopped once on the way.' : ` You stopped ${stops} times on the way.`;
    return `${N} teeth in ${secs < 10 ? secs.toFixed(1) : Math.round(secs)} s. ${how}${pause}`;
  }

  // The edge as an SVG path (the stub's top edge, seen from the front): teeth of uneven height.
  markPath(w, h) {
    const p = w / N, base = h * 0.52; let d = `M0 ${h} L0 ${base + 3}`;
    for (let j = 0; j < N; j++) {
      const i = this.side > 0 ? N - 1 - j : j, x = j * p;
      const top = base - 5 - this.off[i] * 90, rag = this.feather[i] * 22;
      d += ` L${(x + p * 0.28).toFixed(1)} ${base + 3} L${(x + p * 0.34).toFixed(1)} ${(top + rag).toFixed(1)} L${(x + p * 0.5).toFixed(1)} ${(top - rag * 0.4).toFixed(1)} L${(x + p * 0.66).toFixed(1)} ${(top + rag * 0.7).toFixed(1)} L${(x + p * 0.72).toFixed(1)} ${base + 3}`;
    }
    return d + ` L${w} ${base + 3} L${w} ${h} Z`;
  }
}
