export class SoundEngine {
  private ctx: AudioContext | null = null
  private enabled = true
  private lastRustleTime = 0

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Synthesizes a crisp 350gsm card-stock fiber snap tick as each perforation spring severs.
   */
  public playFiberRipTick(seamProgress01: number, intensity = 1.0): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    const now = ctx.currentTime
    const dur = 0.042

    // 1. Short band-passed noise burst for paper fiber tear
    const bufferSize = Math.floor(ctx.sampleRate * dur)
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, 1.8)
      output[i] = (Math.random() * 2 - 1) * env
    }

    const whiteNoise = ctx.createBufferSource()
    whiteNoise.buffer = noiseBuffer

    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    // Pitch rises subtly as the tear progresses from 0% to 100%
    const centerFreq = 1350 + seamProgress01 * 1450 + (Math.random() - 0.5) * 180
    bandpass.frequency.setValueAtTime(centerFreq, now)
    bandpass.Q.setValueAtTime(3.2, now)

    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.setValueAtTime(520, now)

    const noiseGain = ctx.createGain()
    const peakGain = Math.min(0.28, 0.14 * intensity)
    noiseGain.gain.setValueAtTime(peakGain, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur)

    whiteNoise.connect(bandpass)
    bandpass.connect(highpass)
    highpass.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    whiteNoise.start(now)
    whiteNoise.stop(now + dur)

    // 2. Crisp mechanical card-body pop impulse
    const osc = ctx.createOscillator()
    const popGain = ctx.createGain()
    osc.type = 'triangle'
    const basePitch = 310 + seamProgress01 * 290
    osc.frequency.setValueAtTime(basePitch, now)
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.024)

    popGain.gain.setValueAtTime(0.08 * intensity, now)
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025)

    osc.connect(popGain)
    popGain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.026)
  }

  /**
   * Plays the final satisfying tear separation + harmonic verification chord when the stub detaches.
   */
  public playStubDetachChord(): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    const now = ctx.currentTime

    // Final crisp paper release burst
    const ripDur = 0.11
    const bufferSize = Math.floor(ctx.sampleRate * ripDur)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize
      data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * Math.pow(1 - t, 1.3)
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1800, now)
    filter.frequency.exponentialRampToValueAtTime(3400, now + ripDur)
    filter.Q.setValueAtTime(1.8, now)

    const ripGain = ctx.createGain()
    ripGain.gain.setValueAtTime(0.22, now)
    ripGain.gain.exponentialRampToValueAtTime(0.001, now + ripDur)

    noise.connect(filter)
    filter.connect(ripGain)
    ripGain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + ripDur)

    // Warm Keynote Verification Chord (Fmaj9 / Cmaj9 shimmer)
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66]
    notes.forEach((freq, idx) => {
      const start = now + 0.04 + idx * 0.035
      const duration = 1.15 - idx * 0.08
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(0.055 / (1 + idx * 0.22), start + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0005, start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.02)
    })
  }

  /**
   * Subtle card-stock flex sound when waving or flipping the pass.
   */
  public playCardFlexWhoosh(strength = 0.5): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    const nowPerf = performance.now()
    if (nowPerf - this.lastRustleTime < 140) return
    this.lastRustleTime = nowPerf

    const now = ctx.currentTime
    const dur = 0.14
    const bufferSize = Math.floor(ctx.sampleRate * dur)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize
      data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI)
    }

    const src = ctx.createBufferSource()
    src.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(340, now)
    filter.frequency.exponentialRampToValueAtTime(760, now + dur * 0.6)
    filter.Q.setValueAtTime(2.4, now)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(Math.min(0.09, 0.045 * strength), now)
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur)

    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start(now)
    src.stop(now + dur)
  }
}
