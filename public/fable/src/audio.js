// Every sound is built here from noise and sine waves. No audio files.
// A tear is not one sound. It is many small ones: each paper bridge that snaps is a click of
// filtered noise with a tiny low knock under it (that knock is what makes it sound like thick
// card and not tissue). Pull slowly and you hear them one by one. Pull fast and they pile up,
// and a bed of hiss fades in underneath so the clicks join into one rip.

const clamp01 = v => Math.max(0, Math.min(1, v));

export class Sound {
  constructor({ record = false } = {}) { this.on = true; this.ctx = null; this.record = record; }

  unlock() {
    if (!this.ctx) this.build();
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  build() {
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.master = C.createGain(); this.master.gain.value = this.on ? 0.9 : 0;
    const comp = C.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.002; comp.release.value = 0.12;
    this.master.connect(comp); comp.connect(C.destination);

    // two seconds of white noise, the raw material for everything papery
    const len = C.sampleRate * 2;
    this.noise = C.createBuffer(1, len, C.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // a room: decaying noise used as a reverb impulse (a dome should ring a little)
    const il = Math.floor(C.sampleRate * 2.4), ir = C.createBuffer(2, il, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); for (let i = 0; i < il; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / il, 3.4) * Math.min(1, i / 300); }
    const verb = C.createConvolver(); verb.buffer = ir;
    const vlp = C.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 3600;
    const vg = C.createGain(); vg.gain.value = 0.55;
    verb.connect(vlp); vlp.connect(vg); vg.connect(this.master);
    this.send = C.createGain(); this.send.gain.value = 0.07; this.send.connect(verb);   // a touch of room on the paper
    this.hall = C.createGain(); this.hall.gain.value = 1; this.hall.connect(verb);       // a lot of room on the chime

    const bed = (type, freq, q) => {
      const src = C.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
      const g = C.createGain(); g.gain.value = 0;
      src.connect(fl); fl.connect(g); g.connect(this.master); src.start();
      return { fl, g };
    };
    this.rip = bed('bandpass', 2400, 0.7);     // the hiss under a fast tear
    this.flexBed = bed('lowpass', 520, 0.5);   // the card creaking as it bends

    if (this.record) {   // recorder tap: the capture script pulls this out and lays it under the video
      const rec = window.__audio = { sr: C.sampleRate, chunks: [], t0: null };
      const sp = C.createScriptProcessor(4096, 2, 2);
      sp.onaudioprocess = e => {
        if (rec.t0 === null) rec.t0 = Date.now() - (C.currentTime - e.playbackTime) * 1000;
        rec.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)), new Float32Array(e.inputBuffer.getChannelData(1)));
      };
      comp.connect(sp); sp.connect(C.destination);
    }
  }

  toggle() { this.on = !this.on; if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.02); return this.on; }

  burst(t, { freq, q = 1, peak, dur, hp = 900, pan = 0, room = true }) {
    const C = this.ctx, src = C.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const h = C.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const b = C.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = freq; b.Q.value = q;
    const g = C.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.0012); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    const p = C.createStereoPanner(); p.pan.value = pan;
    src.connect(h); h.connect(b); b.connect(g); g.connect(p); p.connect(this.master); if (room) p.connect(this.send);
    src.start(t, Math.random() * 1.6); src.stop(t + dur + 0.02);
    return b;
  }

  knock(t, f0, peak, dur, pan = 0) {
    const C = this.ctx, o = C.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + dur * 0.8);
    const g = C.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    const p = C.createStereoPanner(); p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  // One bridge snapping. pos: -1..1 across the ticket (panned), speed: 0..1 (fast tears are brighter).
  tick(delay, { strength = 1, pos = 0, speed = 0, last = false } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.008 + delay, r = Math.random;
    this.burst(t, { freq: 2600 + speed * 2200 + r() * 1400, q: 0.6 + r() * 0.6, peak: 0.6 * strength * (0.7 + r() * 0.6), dur: 0.009 + r() * 0.015 + (last ? 0.07 : 0), pan: pos * 0.45 });
    this.knock(t, 150 + r() * 110, 0.22 * strength * (1 - speed * 0.5), 0.032, pos * 0.45);
  }

  // Fibres complaining just before a bridge gives. Only heard on a slow pull.
  creak(pos = 0) {
    if (!this.ctx) return;
    this.burst(this.ctx.currentTime + 0.005, { freq: 900 + Math.random() * 900, q: 3, peak: 0.07 + Math.random() * 0.05, dur: 0.012 + Math.random() * 0.02, hp: 500, pan: pos * 0.45, room: false });
  }

  // teeth per second, smoothed by the caller
  setRip(rate) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, x = clamp01((rate - 16) / 150), target = Math.pow(x, 0.8) * 0.36;   // silent on a slow pull, so each tooth stands alone
    this.rip.g.gain.setTargetAtTime(target, t, target > this.rip.g.gain.value ? 0.012 : 0.06);
    this.rip.fl.frequency.setTargetAtTime(1700 + 3400 * x, t, 0.03);
  }

  // how fast the bend is changing
  setFlex(v) {
    if (!this.ctx) return;
    this.flexBed.g.gain.setTargetAtTime(Math.min(0.11, v * 0.035), this.ctx.currentTime, 0.05);
  }

  // The card springing back flat after a bend.
  thup(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    this.knock(t, 150, 0.4 * strength, 0.09);
    this.burst(t, { freq: 700, q: 0.6, peak: 0.16 * strength, dur: 0.05, hp: 200, room: false });
  }

  // The ticket turning over.
  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    const b = this.burst(t, { freq: 500, q: 1.1, peak: 0.0006, dur: 0.42, hp: 200, room: false });
    b.frequency.setValueAtTime(500, t); b.frequency.exponentialRampToValueAtTime(1700, t + 0.16); b.frequency.exponentialRampToValueAtTime(600, t + 0.4);
    const g = this.ctx.createGain();   // slower swell than a click: rebuild the envelope by hand
    b.disconnect(); b.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.14); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.4);
  }

  // The last bridge, the stub coming free, then the room answering.
  release(pos = 0) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime + 0.008;
    this.tick(0, { strength: 1.5, pos, speed: 0.4, last: true });
    this.knock(t, 105, 0.6, 0.2, 0);
    const b = this.burst(t + 0.01, { freq: 3200, q: 0.7, peak: 0.22, dur: 0.26, hp: 500 });
    b.frequency.setValueAtTime(3200, t); b.frequency.exponentialRampToValueAtTime(500, t + 0.26);
    // "You're in": three soft bell notes, D, A and F sharp, landing one after the other
    [[293.66, 0], [440, 0.09], [739.99, 0.19]].forEach(([fr, dl]) => {
      const t1 = t + 0.42 + dl, g = C.createGain();
      g.gain.setValueAtTime(0, t1); g.gain.linearRampToValueAtTime(0.15, t1 + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, t1 + 2.8);
      [[1, 1], [2.005, 0.16], [3.01, 0.05]].forEach(([m, a]) => { const o = C.createOscillator(); o.frequency.value = fr * m; const og = C.createGain(); og.gain.value = a; o.connect(og); og.connect(g); o.start(t1); o.stop(t1 + 3); });
      g.connect(this.master); g.connect(this.hall);
    });
  }
}

// Used by the recorder: everything heard so far as base64 16-bit stereo PCM.
window.__audioDump = () => {
  const rec = window.__audio; if (!rec || !rec.chunks.length) return null;
  const n = rec.chunks.length / 2 * 4096, out = new Int16Array(n * 2);
  for (let c = 0; c < rec.chunks.length / 2; c++) { const L = rec.chunks[c * 2], R = rec.chunks[c * 2 + 1]; for (let i = 0; i < 4096; i++) { out[(c * 4096 + i) * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; out[(c * 4096 + i) * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; } }
  const bytes = new Uint8Array(out.buffer); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { sr: rec.sr, t0: rec.t0, b64: btoa(s) };
};
