// The ticket as an object: two pieces of card (body and stub), one material, one pose.
import * as THREE from 'three';
import { W, H, YP, RC, RN, PITCH } from './spec.js';
import { makeBend, bakeBend, bendApply, buildPiece, updatePiece } from './paper.js';
import { makeArt } from './art.js';

const f = v => v.toFixed(5);

// Shared by the visible material and the shadow pass: where is there card, and where is there air?
// Three things remove card: the outline (corners, notches), the perforation slots, and the tear.
const CUT = /* glsl */`
uniform sampler2D uTear;
uniform float uPiece;            // +1 body (keeps what is above the tear line), -1 stub
varying vec2 vSheet;
varying float vFace;             // 0 front, 1 back, 2 edge wall
float tkHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tkNoise(vec2 p){ vec2 i = floor(p), q = fract(p); q = q*q*(3.0-2.0*q);
  return mix(mix(tkHash(i), tkHash(i+vec2(1,0)), q.x), mix(tkHash(i+vec2(0,1)), tkHash(i+vec2(1,1)), q.x), q.y); }
// distance to the nearest perforation slot (negative inside the hole)
float tkHole(vec2 s){
  float bx = (0.5 - abs(fract((s.x + ${f(W / 2)}) / ${f(PITCH)}) - 0.5)) * ${f(PITCH)};
  return length(vec2(max(bx - 0.03, 0.0), s.y - ${f(YP)})) - 0.036;
}
// x: coverage, y: distance into this piece from the tear line, z: torn here?, w: fibre band width
vec4 tkCut(vec2 s){
  vec4 tp = texture2D(uTear, vec2(s.x / ${f(W)} + 0.5, 0.5));
  float torn = smoothstep(0.35, 0.65, tp.b);
  float off = (tp.r - 0.5) * 0.6;
  float fib = (tkNoise(s * vec2(70.0, 26.0)) - 0.5) * 0.05 + (tkNoise(s * vec2(19.0, 9.0)) - 0.5) * 0.04;
  float dl = (s.y - (${f(YP)} + (off + fib) * torn)) * uPiece;
  float aa = fwidth(s.y) + fwidth(s.x) * 0.5 + 1e-4;
  float cov = smoothstep(-aa, aa, dl + aa * 0.9);
  vec2 q = abs(s) - vec2(${f(W / 2 - RC)}, ${f(H / 2 - RC)});
  float dBox = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - ${f(RC)};
  float dOut = max(dBox, ${f(RN)} - length(vec2(abs(s.x) - ${f(W / 2)}, s.y - ${f(YP)})));
  cov = min(cov, 1.0 - smoothstep(0.0, aa * 1.5, dOut));
  cov = min(cov, smoothstep(-aa * 0.6, aa * 0.6, tkHole(s)));
  return vec4(cov, dl, torn, tp.g * 0.25);
}`;

const VARY = sh => sh
  .replace('#include <common>', '#include <common>\nattribute vec2 sheet;\nattribute float face;\nvarying vec2 vSheet;\nvarying float vFace;')
  .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSheet = sheet; vFace = face;');

const HEAD = /* glsl */`
uniform sampler2D uFront, uBack, uFoil, uHeight;
uniform vec3 uFoilL[3];
uniform vec3 uFoilI;
uniform float uFoilGain;
// a smooth trip around the rainbow
vec3 tkHue(float t){ return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }`;

const SURFACE = /* glsl */`
vec4 tkC = tkCut(vSheet);
float tkWall = step(1.5, vFace);
float tkCov = mix(tkC.x, 1.0, tkWall);
if (tkCov < 0.02) discard;
float tkBack = step(0.5, vFace) * (1.0 - tkWall);
vec2 tkUV = vec2(vSheet.x / ${f(W)} + 0.5, vSheet.y / ${f(H)} + 0.5);
vec3 tkAlb = mix(texture2D(uFront, tkUV).rgb, texture2D(uBack, vec2(1.0 - tkUV.x, tkUV.y)).rgb, tkBack);
vec4 tkFoilT = texture2D(uFoil, tkUV);
float tkFoil = tkFoilT.r * (1.0 - tkBack) * (1.0 - tkWall);
// paper grain, faded out once it gets smaller than a pixel so it never turns into shimmer
float tkPx = max(fwidth(vSheet.x), fwidth(vSheet.y)) + 1e-5;
float tkG = 0.5 + (tkNoise(vSheet * 14.0) - 0.5) * 0.7 + (tkNoise(vSheet * 44.0) - 0.5) * clamp(0.5 / (44.0 * tkPx) - 0.15, 0.0, 1.0);
tkAlb *= 0.97 + 0.06 * tkG;
// Where the card tore, the printed surface peels and the pale core shows, in a ragged band.
// It peels off the stub on the front and off the body on the back, like a real sheet.
float tkSide = mix(0.3, 1.0, step(0.0, -uPiece * (1.0 - 2.0 * tkBack)));
float tkBandW = (0.006 + tkC.w * 1.25) * (0.3 + 1.2 * tkNoise(vSheet * vec2(46.0, 15.0)));
float tkBand = tkC.z * (1.0 - smoothstep(0.0, tkBandW, tkC.y)) * tkSide * (1.0 - tkWall);
tkAlb = mix(tkAlb, vec3(0.90, 0.875, 0.82) * (0.86 + 0.24 * tkG), tkBand);
tkFoil *= 1.0 - tkBand;
// the punch leaves a pale burr around each perforation hole, which is what lets you see the line
float tkRim = (1.0 - smoothstep(0.0, 0.03, tkHole(vSheet))) * (1.0 - tkWall);
tkAlb = mix(tkAlb, vec3(0.78, 0.75, 0.68), tkRim * 0.45);
tkFoil *= 1.0 - tkRim;
tkAlb = mix(tkAlb, vec3(0.74, 0.70, 0.62) * (0.88 + 0.2 * tkNoise(vSheet * 60.0)), tkWall);
float tkInk = 1.0 - smoothstep(0.02, 0.35, dot(tkAlb, vec3(0.33)));
diffuseColor.rgb = mix(tkAlb, vec3(0.86, 0.76, 0.58), tkFoil);
diffuseColor.a = tkCov;
// directions along the sheet (x and y of the card) in view space, for embossing and foil grooves
vec3 tkTx = vec3(1.0, 0.0, 0.0), tkTy = vec3(0.0, 1.0, 0.0);
{
  vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition);
  vec2 sx = dFdx(vSheet), sy = dFdy(vSheet);
  float det = sx.x * sy.y - sx.y * sy.x;
  if (abs(det) > 1e-10) { tkTx = normalize((px * sy.y - py * sx.y) / det); tkTy = normalize((py * sx.x - px * sy.x) / det); }
}`;

const NORMAL = /* glsl */`
{
  float e = 0.02;
  float hx = texture2D(uHeight, tkUV + vec2(e / ${f(W)}, 0.0)).r - texture2D(uHeight, tkUV - vec2(e / ${f(W)}, 0.0)).r;
  float hy = texture2D(uHeight, tkUV + vec2(0.0, e / ${f(H)})).r - texture2D(uHeight, tkUV - vec2(0.0, e / ${f(H)})).r;
  vec2 gr = vec2(hx, hy) * mix(1.5, 2.6, tkFoil) * (1.0 - tkBack);
  float tf = clamp(0.5 / (36.0 * tkPx) - 0.15, 0.0, 1.0);
  float n0 = tkNoise(vSheet * 36.0);
  gr += vec2(tkNoise(vSheet * 36.0 + vec2(0.5, 0.0)) - n0, tkNoise(vSheet * 36.0 + vec2(0.0, 0.5)) - n0) * (0.16 * tf + 1.2 * tkBand) * (1.0 - tkFoil);
  normal = normalize(normal - (gr.x * tkTx + gr.y * tkTy) * (1.0 - tkWall));
}`;

// Holographic foil, the clean kind you see on a collector card.
// Three layers, all smooth, nothing random:
//   1. the metal itself, a pale gold that mirrors the room (three.js does this part)
//   2. a rainbow film whose colour depends on where the eye sits relative to that bit of card,
//      plus the phase the artwork gave it. Around the sun the phase follows the angle, so the
//      colours fan out from the centre and turn as the card tilts.
//   3. one soft band of light that sweeps across the foil as the card moves.
// The engraving in the height layer bends the surface a little, so each fine line catches all three.
const FOIL = /* glsl */`
if (tkFoil > 0.01) {
  vec2 cs = tkFoilT.gb * 2.0 - 1.0;
  float pat = atan(cs.y, cs.x) / 6.2831853;
  vec3 Vd = normalize(vViewPosition);
  vec2 eye = vec2(dot(Vd, tkTx), dot(Vd, tkTy));
  float nh = max(dot(normal, normalize(uFoilL[0] + Vd)), 0.0);
  vec3 film = mix(tkHue(pat + eye.x * 2.3 + eye.y * 1.5 + dot(vSheet, vec2(0.03, 0.045))), vec3(1.0), 0.3);
  float sx = dot(vSheet, vec2(0.062, 0.046)) + eye.x * 1.5 + eye.y * 1.05 + 0.18;
  float d = fract(sx) - 0.5, band = exp(-d * d / 0.013);
  vec3 bandCol = mix(vec3(1.0, 0.9, 0.72), tkHue(sx * 3.0 + pat * 0.5), 0.5);
  totalEmissiveRadiance += (film * (0.07 + 0.8 * pow(nh, 6.0)) + bandCol * band * 0.6) * tkFoil * uFoilGain;
}`;

export class Ticket {
  constructor(renderer, tear) {
    const art = makeArt(), aniso = renderer.capabilities.getMaxAnisotropy();
    const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
    this.art = art;
    this.uniforms = {
      uTear: { value: tear.tex }, uFront: { value: tex(art.front, true) }, uBack: { value: tex(art.back, true) },
      uFoil: { value: tex(art.foil, false) }, uHeight: { value: tex(art.height, false) },
      uFoilL: { value: [new THREE.Vector3(-0.36, 0.52, 0.78).normalize(), new THREE.Vector3(0.82, 0.1, 0.56).normalize(), new THREE.Vector3(0.1, -0.7, 0.7).normalize()] },
      uFoilI: { value: new THREE.Vector3(1.0, 0.55, 0.4) }, uFoilGain: { value: 1.0 },
    };
    this.body = buildPiece(THREE, 'body'); this.stub = buildPiece(THREE, 'stub');
    this.bodyMesh = this.mesh(this.body, 1); this.stubMesh = this.mesh(this.stub, -1);
    this.rig = new THREE.Group(); this.stubRig = new THREE.Group();
    this.rig.add(this.bodyMesh, this.stubMesh);
    this.attached = true;
    this.B = makeBend();      // the bend you make by dragging the card
    this.F = makeBend();      // the torn part of the stub folding up at the tear front
    this.alpha = 0;           // the stub hinging on the perforation
    this.phi = 0;             // the torn part swinging away from the body, opening the gap
    this.key = '';
  }

  mesh(piece, sign) {
    const uni = { ...this.uniforms, uPiece: { value: sign } };
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, sheen: 0.14, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff2dc), envMapIntensity: 0.9 });
    mat.alphaToCoverage = true;
    mat.shadowSide = THREE.DoubleSide;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = VARY(sh.vertexShader);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + CUT + HEAD)
        .replace('#include <map_fragment>', SURFACE)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(0.86, 0.6, tkInk), 0.2, tkFoil);')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = tkFoil;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + NORMAL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FOIL);
    };
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = sh => {
      sh.uniforms.uTear = uni.uTear; sh.uniforms.uPiece = uni.uPiece;
      sh.vertexShader = VARY(sh.vertexShader);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + CUT)
        .replace('void main() {', 'void main() {\n  if (vFace < 1.5 && tkCut(vSheet).x < 0.5) discard;');
    };
    const m = new THREE.Mesh(piece.geo, mat);
    m.customDepthMaterial = depth; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    return m;
  }

  // Rewrite the vertices if the pose changed since the last frame.
  update() {
    const B = this.B, F = this.F;
    const key = [B.ox, B.oy, B.mx, B.my, B.L, B.theta, F.ox, F.mx, F.my, F.L, F.theta, this.alpha, this.phi, this.attached].map(v => typeof v === 'number' ? v.toFixed(4) : v).join();
    if (key === this.key) return false;
    this.key = key;
    bakeBend(B); bakeBend(F);
    const ca = Math.cos(this.alpha), sa = Math.sin(this.alpha), attached = this.attached, phi = this.phi;
    updatePiece(this.body, p => bendApply(B, p));
    updatePiece(this.stub, p => {
      const s = (p.x - F.ox) * F.mx + (p.y - F.oy) * F.my;   // how far past the tear front this point is
      bendApply(F, p);
      if (s > 0 && phi) {   // once it has lifted clear of the card, the torn part can swing open
        const u = Math.min(1, s / F.L), a = phi * u * u * (3 - 2 * u), c = Math.cos(a), sn = Math.sin(a), dx = p.x - F.ox, dy = p.y - F.oy;
        p.x = F.ox + dx * c - dy * sn; p.y = F.oy + dx * sn + dy * c;
      }
      const d = p.y - YP, z = p.z; p.y = YP + d * ca + z * sa; p.z = -d * sa + z * ca;
      if (attached) bendApply(B, p);
    });
    return true;
  }

  // The stub comes free: it leaves the ticket's group and gets its own, starting exactly where it was.
  detach(scene) {
    this.attached = false;
    this.stubRig.position.copy(this.rig.position); this.stubRig.quaternion.copy(this.rig.quaternion);
    this.stubRig.add(this.stubMesh); scene.add(this.stubRig);
  }
  attach() {
    this.attached = true; this.rig.add(this.stubMesh); this.stubRig.removeFromParent();
    this.F.theta = 0; this.alpha = 0; this.phi = 0; this.key = '';
  }
}
