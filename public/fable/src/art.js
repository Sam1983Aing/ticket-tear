// Everything printed on the ticket is drawn here with Canvas 2D. No image files.
// Three layers for the front: ink (what you see), foil (where the hologram is and what phase of
// the rainbow each part starts on) and height (what the press pushed into the card, including the
// fine engraving in the foil). One ink layer for the back.
import { W, H, STUB, S } from './spec.js';

export const SANS = '"Geist","Inter Tight","Avenir Next","Helvetica Neue","Segoe UI",Arial,sans-serif';
export const MONO = '"Geist Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace';
// the faces the canvas needs loaded before it draws (see main.js)
export const FACES = ['400 20px Geist', '500 20px Geist', '600 20px Geist', '400 20px "Geist Mono"', '500 20px "Geist Mono"'];

const PY = H - STUB;          // perforation, measured from the top edge
const BAND = PY - 0.6;        // where the night-black flood starts
const CREAM = '#efe9db', INK = '#17140f', NIGHT = '#0f0e0d', PALE = '#e9e1cd', FOILBASE = '#b9ad92';
const SOFT = 'rgba(23,20,15,0.58)', PALESOFT = 'rgba(233,225,205,0.6)';

// Orbit drawing: the sun sits at one focus of the ellipse, the Earth at the closest point.
const SUN = { x: 3.35, y: 4.5, r: 1.28 };
const RHO = -0.35, RX = 5.2, RY = 3.9, CF = Math.sqrt(RX * RX - RY * RY);
const AX = { x: Math.cos(RHO), y: Math.sin(RHO) };
const ORB = { x: SUN.x + CF * AX.x, y: SUN.y + CF * AX.y };
const PERI = { x: ORB.x - RX * AX.x, y: ORB.y - RX * AX.y };
const ART = { x: 0.6, y: 1.5, w: W - 1.2, h: 5.95 };   // the window the hologram lives in

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// The foil layer stores "foil is here" in red, and in green and blue where on the rainbow this
// bit of foil starts (as cos and sin of the phase, so it never jumps where the phase wraps).
// Around the sun the phase follows the angle, so the colours fan out from the centre.
const phase = a => `rgb(255,${Math.round(128 + 127 * Math.cos(2 * a))},${Math.round(128 + 127 * Math.sin(2 * a))})`;

function canvas(scale) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * S * scale); c.height = Math.round(H * S * scale);
  return [c, c.getContext('2d'), S * scale];
}

function pen(g, k) {
  const u = v => v * k;
  const text = (s, x, y, o) => {
    g.font = `${o.weight || 400} ${u(o.size)}px ${o.font || SANS}`;
    g.fillStyle = o.color; g.textBaseline = 'alphabetic';
    const tr = (o.track || 0) * u(o.size);
    if (!tr) { g.textAlign = o.align || 'left'; g.fillText(s, u(x), u(y)); return g.measureText(s).width / k; }
    const chars = [...s], ws = chars.map(c => g.measureText(c).width);
    const total = ws.reduce((a, b) => a + b, 0) + tr * (chars.length - 1);
    let px = u(x) - (o.align === 'right' ? total : o.align === 'center' ? total / 2 : 0);
    g.textAlign = 'left';
    chars.forEach((c, i) => { g.fillText(c, px, u(y)); px += ws[i] + tr; });
    return total / k;
  };
  // small data labels: monospace capitals, the way a ticket printer sets them
  const label = (s, x, y, color, align, size = 0.17) => text(s.toUpperCase(), x, y, { font: MONO, size, weight: 500, track: 0.06, color, align });
  const line = (x0, y0, x1, y1, w, color) => { g.strokeStyle = color; g.lineWidth = u(w); g.beginPath(); g.moveTo(u(x0), u(y0)); g.lineTo(u(x1), u(y1)); g.stroke(); };
  const circle = (x, y, r) => { g.beginPath(); g.arc(u(x), u(y), u(r), 0, Math.PI * 2); };
  const rrect = (x, y, w, h, r) => { g.beginPath(); g.roundRect(u(x), u(y), u(w), u(h), u(r)); };
  return { u, text, label, line, circle, rrect };
}

// A sun: a foil disc whose colours fan around the centre, engraved with fine spokes and rings
// (the engraving goes in the height layer, so the light catches each line), with short rays.
// mode: 'ink' | 'foil' | 'height'
function sun(g, p, mode, x, y, r, spokes, rays) {
  const { u, circle, line } = p;
  if (mode === 'foil') {
    const cg = g.createConicGradient(0, u(x), u(y));
    for (let i = 0; i <= 48; i++) cg.addColorStop(i / 48, phase(i / 48 * Math.PI * 2));
    g.fillStyle = cg;
  } else g.fillStyle = mode === 'ink' ? FOILBASE : '#8c8c8c';
  circle(x, y, r); g.fill();
  if (mode === 'height') {
    g.strokeStyle = '#555'; g.lineWidth = u(0.02);
    for (let i = 0; i < spokes; i++) { const a = i / spokes * Math.PI * 2, r0 = r * (i % 2 ? 0.42 : 0.2); g.beginPath(); g.moveTo(u(x + Math.cos(a) * r0), u(y + Math.sin(a) * r0)); g.lineTo(u(x + Math.cos(a) * r * 0.97), u(y + Math.sin(a) * r * 0.97)); g.stroke(); }
    for (const f of [0.2, 0.42, 0.7]) { circle(x, y, r * f); g.stroke(); }
    g.fillStyle = '#b4b4b4'; circle(x, y, r * 0.13); g.fill();
  }
  // one clean ring cut through the foil
  g.strokeStyle = mode === 'foil' ? '#000' : mode === 'ink' ? CREAM : '#808080'; g.lineWidth = u(r * 0.022);
  circle(x, y, r * 0.86); g.stroke();
  for (let i = 0; i < rays; i++) {
    const a = i / rays * Math.PI * 2, long = i % 2 === 0, r0 = r * 1.1, r1 = r * (long ? 1.27 : 1.18);
    line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, r * 0.017, mode === 'foil' ? phase(a) : mode === 'ink' ? FOILBASE : '#6a6a6a');
  }
}

function orbit(g, p, mode) {
  const { u, circle, label } = p;
  const foil = mode === 'foil', ink = mode === 'ink';
  g.save();
  g.beginPath(); g.rect(u(ART.x), u(ART.y), u(ART.w), u(ART.h)); g.clip();
  const ell = (scale) => { g.beginPath(); g.ellipse(u(ORB.x), u(ORB.y), u(RX * scale), u(RY * scale), RHO, 0, Math.PI * 2); };
  const metal = a => foil ? phase(a) : ink ? FOILBASE : '#6a6a6a';
  // light leaving the sun: hairlines of foil across the whole window, every other one short
  for (let i = 0; i < 72; i++) {
    const a = (i + 0.5) / 72 * Math.PI * 2, r0 = SUN.r * 1.42, r1 = i % 2 ? SUN.r * 2.1 : 11;
    g.strokeStyle = metal(a); g.lineWidth = u(i % 2 ? 0.012 : 0.018);
    g.beginPath(); g.moveTo(u(SUN.x + Math.cos(a) * r0), u(SUN.y + Math.sin(a) * r0)); g.lineTo(u(SUN.x + Math.cos(a) * r1), u(SUN.y + Math.sin(a) * r1)); g.stroke();
  }
  // keep the rays away from the small print
  g.fillStyle = ink ? CREAM : foil ? '#000' : '#808080';
  g.fillRect(u(ART.x), u(6.16), u(2.45), u(0.66)); g.fillRect(u(W - 3.2), u(7.02), u(2.6), u(0.43));
  // the orbit and its neighbour
  g.strokeStyle = metal(0.9); g.lineWidth = u(0.034); ell(1); g.stroke();
  g.strokeStyle = metal(2.2); g.lineWidth = u(0.016); g.setLineDash([u(0.05), u(0.11)]); ell(1.17); g.stroke(); g.setLineDash([]);
  sun(g, p, mode, SUN.x, SUN.y, SUN.r, 96, 64);
  if (ink) {
    g.fillStyle = INK; circle(PERI.x, PERI.y, 0.085); g.fill();
    g.strokeStyle = INK; g.lineWidth = u(0.012); circle(PERI.x, PERI.y, 0.2); g.stroke();
    label('Perihelion', 0.6, 6.42, INK, 'left', 0.15);
    label('147.1 M km from the Sun', 0.6, 6.7, SOFT, 'left', 0.12);
    label('To aphelion · 152.1 M km', W - 0.6, 7.28, SOFT, 'right', 0.12);
  }
  g.restore();
}

function fibres(g, u, seed) {   // loose fibres in the stock
  const r = rng(seed);
  for (let i = 0; i < 1400; i++) {
    const x = r() * W, y = r() * H, a = r() * 6.28, l = 0.04 + r() * 0.16;
    g.strokeStyle = r() > 0.5 ? 'rgba(110,90,60,0.07)' : 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(u(x), u(y)); g.lineTo(u(x + Math.cos(a) * l), u(y + Math.sin(a) * l)); g.stroke();
  }
}

function paintFront(g, k, mode) {
  const p = pen(g, k), { u, text, label, line, rrect } = p;
  const ink = mode === 'ink', foil = mode === 'foil';
  g.fillStyle = ink ? CREAM : foil ? '#000' : '#808080'; g.fillRect(0, 0, u(W), u(H));
  if (ink) {
    fibres(g, u, 7);
    g.fillStyle = NIGHT; g.fillRect(0, u(BAND), u(W), u(H - BAND));
    label('Perihelion', 0.6, 1.0, INK, 'left');
    label('Nº 0147 / 0300', W - 0.6, 1.0, INK, 'right');
    line(0.6, 1.3, W - 0.6, 1.3, 0.012, INK);
  }
  orbit(g, p, mode);

  // title, pressed into the card
  if (!foil) text('Perihelion', 0.52, 8.92, { size: 1.5, weight: 500, track: -0.045, color: ink ? INK : '#262626' });
  if (ink) {
    text('A concert for the closest night', 0.62, 9.52, { size: 0.36, color: SOFT });
    line(0.6, 9.95, W - 0.6, 9.95, 0.012, INK);
    const cell = (x, y, k2, v) => { label(k2, x, y, SOFT, 'left', 0.13); text(v, x, y + 0.4, { size: 0.33, weight: 500, track: -0.01, color: INK }); };
    cell(0.6, 10.36, 'Date', '02 Jan 2027');
    cell(3.75, 10.36, 'Doors', '21:00');
    cell(5.95, 10.36, 'Closest pass', '23:32 CLT');
    cell(0.6, 11.22, 'Venue · Atacama, Chile', 'Cerro Alba Observatory');
    cell(5.95, 11.22, 'Seat', 'Row C · 14');
    // the black band and the stub
    const tri = (x, y, s, up) => { g.fillStyle = PALE; g.beginPath(); g.moveTo(u(x), u(y + (up ? -s : s))); g.lineTo(u(x - s * 0.7), u(y + (up ? s * 0.3 : -s * 0.3))); g.lineTo(u(x + s * 0.7), u(y + (up ? s * 0.3 : -s * 0.3))); g.fill(); };
    tri(0.68, PY - 0.3, 0.09, true); label('Yours to keep', 0.92, PY - 0.25, PALE, 'left', 0.13);
    label('Tear to enter', W - 0.6, PY - 0.25, PALE, 'right', 0.13);
    tri(0.68, PY + 0.52, 0.09, false); label('The door keeps this half', 0.92, PY + 0.57, PALE, 'left', 0.13);
    label('Seat', 0.6, PY + 1.42, PALESOFT, 'left', 0.13);
    label('Row C · Main dome', 0.6, PY + 3.16, PALESOFT, 'left', 0.13);
    label('Admit one', W - 1.5, PY + 3.16, PALE, 'center', 0.13);
    label('Perihelion · 02.01.2027 · Cerro Alba', 0.62, H - 0.36, 'rgba(233,225,205,0.4)', 'left', 0.1);
  }
  if (!foil) text('C14', 0.54, PY + 2.7, { size: 1.3, weight: 500, track: -0.03, color: ink ? PALE : '#c8c8c8' });
  // foil: serial number, seal on the stub, hairline frame
  const metal = a => foil ? phase(a) : ink ? FOILBASE : '#6a6a6a';
  label('Nº 0147', W - 0.6, PY + 0.57, metal(0.4), 'right', 0.16);
  sun(g, p, mode, W - 1.5, PY + 2.0, 0.56, 48, 32);
  g.strokeStyle = metal(1.2); g.lineWidth = u(0.022); rrect(0.27, 0.27, W - 0.54, H - 0.54, 0.22); g.stroke();
}

function paintBack(g, k) {
  const p = pen(g, k), { u, text, label, line, circle } = p;
  g.fillStyle = '#ece6d7'; g.fillRect(0, 0, u(W), u(H));
  fibres(g, u, 11);
  const r = rng(23);
  g.fillStyle = NIGHT; g.fillRect(0, u(BAND), u(W), u(H - BAND));
  label('Programme', 0.6, 1.0, INK, 'left');
  label('Cerro Alba · Atacama', W - 0.6, 1.0, INK, 'right');
  line(0.6, 1.3, W - 0.6, 1.3, 0.012, INK);
  [['01', 'Aphelion, remembered', '11 min'], ['02', 'The long fall inward', '19 min'], ['03', 'Closest night', '23:32'], ['04', 'Outbound', '14 min']].forEach(([n, t, d], i) => {
    const y = 2.3 + i * 0.98;
    label(n, 0.62, y - 0.04, SOFT, 'left', 0.14);
    text(t, 1.45, y, { size: 0.5, weight: 500, track: -0.02, color: INK });
    label(d, W - 0.6, y - 0.04, SOFT, 'right', 0.13);
    line(0.6, y + 0.32, W - 0.6, y + 0.32, 0.006, 'rgba(23,20,15,0.35)');
  });
  text('Lumen Octet with Ilse Marrow, voice', 0.6, 6.6, { size: 0.3, color: INK });
  // a small sky chart, all dots and hairlines
  const cx = W / 2, cy = 8.85, cr = 1.72;
  g.strokeStyle = INK; g.lineWidth = u(0.014); circle(cx, cy, cr); g.stroke();
  g.lineWidth = u(0.006); circle(cx, cy, cr * 0.66); g.stroke(); circle(cx, cy, cr * 0.33); g.stroke();
  line(cx - cr, cy, cx + cr, cy, 0.006, INK); line(cx, cy - cr, cx, cy + cr, 0.006, INK);
  const stars = [];
  for (let i = 0; i < 90; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * cr * 0.96, m = r();
    stars.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.012 + m * m * m * 0.05]);
  }
  g.fillStyle = INK; for (const [x, y, s] of stars) { circle(x, y, s); g.fill(); }
  const bright = stars.filter(s => s[2] > 0.03).slice(0, 7);
  g.strokeStyle = 'rgba(23,20,15,0.7)'; g.lineWidth = u(0.008); g.beginPath();
  bright.forEach(([x, y], i) => i ? g.lineTo(u(x), u(y)) : g.moveTo(u(x), u(y))); g.stroke();
  g.strokeStyle = INK; g.lineWidth = u(0.01); g.setLineDash([u(0.04), u(0.06)]);
  g.beginPath(); g.ellipse(u(cx), u(cy + 0.2), u(cr * 1.2), u(cr * 0.5), -0.2, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); g.setLineDash([]);
  ['S', 'W', 'N', 'E'].forEach((c, i) => label(c, cx + Math.sin(i * Math.PI / 2) * (cr + 0.22) * (i % 2 ? -1 : 1), cy + Math.cos(i * Math.PI / 2) * (cr + 0.22) + 0.05, INK, 'center', 0.12));
  label('The sky at 23:32, looking south', cx, 11.16, INK, 'center', 0.12);
  label('Valid once torn. One entry. No re-admission once the dome opens.', cx, 11.52, SOFT, 'center', 0.09);
  label('Valid once torn', 0.6, PY - 0.25, PALE, 'left', 0.13);
  label('Fold first, then pull', W - 0.6, PY - 0.25, PALE, 'right', 0.13);
  // stub back: a barcode drawn from the serial
  let x = 0.6; const bars = rng(147);
  g.fillStyle = PALE;
  while (x < 5.4) { const w = 0.03 + Math.floor(bars() * 3) * 0.03; g.fillRect(u(x), u(PY + 0.95), u(w), u(1.75)); x += w + 0.03 + Math.floor(bars() * 3) * 0.03; }
  label('0147 0300 C14 PRH27', 0.6, PY + 3.08, PALESOFT, 'left', 0.13);
  label('Stub', W - 0.6, PY + 1.15, PALESOFT, 'right', 0.13);
  text('Nº 0147', W - 0.6, PY + 1.78, { size: 0.48, weight: 500, track: -0.02, color: PALE, align: 'right' });
  text('Your tear is', W - 0.6, PY + 2.56, { size: 0.3, color: PALE, align: 'right' });
  text('your entry mark.', W - 0.6, PY + 2.96, { size: 0.3, color: PALE, align: 'right' });
  label('Perihelion · 02.01.2027 · Cerro Alba', 0.62, H - 0.36, 'rgba(233,225,205,0.4)', 'left', 0.1);
}

export function makeArt() {
  const [front, gf, kf] = canvas(1); paintFront(gf, kf, 'ink');
  const [foil, go, ko] = canvas(1); paintFront(go, ko, 'foil');
  const [height, gh, kh] = canvas(1); paintFront(gh, kh, 'height');
  const [back, gb, kb] = canvas(1); paintBack(gb, kb);
  return { front, foil, height, back };
}
