import './style.css'
import * as THREE from 'three'
import { SoundEngine } from './soundEngine'
import {
  SEAT_OPTIONS,
  TIER_SPECS,
  TicketTextureGenerator
} from './ticketTextureGenerator'
import {
  COLS,
  LOWER_SEAM_ROW,
  NUM_COLS,
  TICKET_HEIGHT,
  TICKET_WIDTH,
  UPPER_SEAM_ROW,
  VerletPaperEngine
} from './verletPaperEngine'
import {
  createContactShadowMaterial,
  createHolographicPassMaterial
} from './holographicShader'
import { SeatOption, TierEditionId, TierSpec } from './types'

class HolographicTicketApp {
  private stageEl: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera

  private sound = new SoundEngine()
  private currentTier: TierSpec = TIER_SPECS.silver
  private currentSeat: SeatOption = SEAT_OPTIONS[0]

  private texGen: TicketTextureGenerator
  private verlet: VerletPaperEngine
  private passMesh: THREE.Mesh
  private shadowMesh: THREE.Mesh
  private xrayLines: THREE.LineSegments
  private passUniforms: ReturnType<typeof createHolographicPassMaterial>['uniforms']
  private setShadowDarkTheme: (isDark: boolean) => void

  private raycaster = new THREE.Raycaster()
  private pointerNdc = new THREE.Vector2()
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  private planeHit = new THREE.Vector3()

  private isPointerDown = false
  private isSlicingSeam = false
  private lastSliceU: number | null = null
  private seamHoverAmount = 0
  private xrayEnabled = false
  private currentXRayMix = 0

  private fiberCells: HTMLElement[] = []
  private clock = new THREE.Clock()

  constructor() {
    this.stageEl = document.getElementById('canvas-stage') as HTMLElement

    // 1. Setup Three.js Scene, Camera & High-DPI Renderer
    this.scene = new THREE.Scene()
    const w = this.stageEl.clientWidth || 800
    const h = this.stageEl.clientHeight || 700

    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 50)
    this.camera.position.set(0, -0.04, 6.85)
    this.camera.lookAt(0, -0.04, 0)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.stageEl.prepend(this.renderer.domElement)

    // 2. Generate Initial High-DPI Ticket Canvas Textures (1024x1740)
    this.texGen = new TicketTextureGenerator(this.currentTier, this.currentSeat)

    // 3. Initialize Real-Time Verlet Paper / 350gsm Card-Stock Engine
    this.verlet = new VerletPaperEngine(
      (col, progress01) => {
        this.sound.playFiberRipTick(progress01, 1.0)
        this.syncPerforationUI()
      },
      () => {
        this.sound.playStubDetachChord()
        this.syncPerforationUI()
      }
    )

    // 4. Create Deforming Soft Contact Shadow Mesh (mirrors live Verlet geometry)
    const shadowMatObj = createContactShadowMaterial(this.texGen.textures.frontMap)
    this.setShadowDarkTheme = shadowMatObj.setDarkTheme
    this.shadowMesh = new THREE.Mesh(this.verlet.geometry, shadowMatObj.material)
    this.shadowMesh.renderOrder = 1
    this.scene.add(this.shadowMesh)

    // 5. Create Main Holographic Pass Mesh
    const passMatObj = createHolographicPassMaterial(this.texGen.textures)
    this.passUniforms = passMatObj.uniforms
    this.passMesh = new THREE.Mesh(this.verlet.geometry, passMatObj.material)
    this.passMesh.renderOrder = 2
    this.scene.add(this.passMesh)

    // 6. Create [X] Verlet Spring Lattice X-Ray Overlay LineSegments
    const xrayMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthTest: false
    })
    this.xrayLines = new THREE.LineSegments(this.verlet.xrayGeometry, xrayMat)
    this.xrayLines.renderOrder = 4
    this.xrayLines.visible = false
    this.scene.add(this.xrayLines)

    // 7. Build UI Fiber Strip, Bind DOM Controls & Pointer / Keyboard Events
    this.initFiberStripDOM()
    this.bindUIControls()
    this.bindStageInteractions()
    this.applyUrlQueryState()
    this.syncPerforationUI()

    // Wait for web fonts to settle so canvas typography is ultra-sharp
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        this.texGen.updateTicket(this.currentTier, this.currentSeat)
      })
    }

    window.addEventListener('resize', () => this.onResize())
    this.animate()
  }

  private applyUrlQueryState(): void {
    const params = new URLSearchParams(window.location.search)
    const tierParam = params.get('tier') as TierEditionId | null
    if (tierParam && TIER_SPECS[tierParam]) {
      this.selectTier(tierParam)
    }

    const themeParam = params.get('theme')
    if (themeParam === 'concert') {
      document.body.setAttribute('data-theme', 'concert')
      const label = document.getElementById('theme-label')
      if (label) label.textContent = 'Alabaster Studio'
      this.setShadowDarkTheme(true)
    }

    const stateParam = params.get('state')
    if (stateParam === 'midtear') {
      // Tear 13 of 25 perforation fibers and step physics 45 frames so V-gap peel is settled
      this.verlet.tearToFraction(0.52)
      for (let i = 0; i < 45; i++) {
        this.verlet.step(0.016, i * 0.016)
      }
    } else if (stateParam === 'verified' || stateParam === 'torn') {
      this.verlet.tearToFraction(1.0)
      for (let i = 0; i < 38; i++) {
        this.verlet.step(0.016, i * 0.016)
      }
    }

    if (params.get('xray') === '1') {
      this.toggleXRayMode(true)
      this.currentXRayMix = 1.0
      this.passUniforms.uXRayMix.value = 1.0
      this.updateXRayTelemetryDOM()
    }

    if (params.get('flip') === '1') {
      this.toggleFlipPass()
    }
  }

  private initFiberStripDOM(): void {
    const strip = document.getElementById('fiber-bar-strip')!
    strip.innerHTML = ''
    this.fiberCells = []
    for (let c = 0; c < NUM_COLS; c++) {
      const cell = document.createElement('div')
      cell.className = 'fiber-cell'
      cell.title = `Perforation Fiber #${c + 1}`
      strip.appendChild(cell)
      this.fiberCells.push(cell)
    }
  }

  private bindUIControls(): void {
    // Tier Edition Selector
    const tierBtns = document.querySelectorAll<HTMLButtonElement>('.tier-option')
    tierBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tierId = btn.dataset.tier as TierEditionId
        if (!tierId || !TIER_SPECS[tierId]) return
        this.selectTier(tierId)
      })
    })

    // Seat Assignment Selector
    const seatBtns = document.querySelectorAll<HTMLButtonElement>('.seat-pill')
    seatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const seatId = btn.dataset.seat
        const found = SEAT_OPTIONS.find((s) => s.id === seatId)
        if (found) {
          this.selectSeat(found)
        }
      })
    })

    // Header Action Buttons
    document.getElementById('btn-flip')?.addEventListener('click', () => {
      this.toggleFlipPass()
    })

    document.getElementById('btn-xray')?.addEventListener('click', () => {
      this.toggleXRayMode()
    })

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.issueFreshPass()
    })

    document.getElementById('btn-audio')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      const next = !this.sound.isEnabled()
      this.sound.setEnabled(next)
      btn.classList.toggle('is-active', next)
      const label = document.getElementById('audio-label')
      if (label) label.textContent = next ? 'Audio: On' : 'Audio: Muted'
    })

    document.getElementById('btn-theme')?.addEventListener('click', () => {
      const currentTheme = document.body.getAttribute('data-theme')
      const nextTheme = currentTheme === 'concert' ? 'alabaster' : 'concert'
      document.body.setAttribute('data-theme', nextTheme)
      const label = document.getElementById('theme-label')
      if (label) {
        label.textContent =
          nextTheme === 'concert' ? 'Alabaster Studio' : 'Dark Concert Hall'
      }
      this.setShadowDarkTheme(nextTheme === 'concert')
    })

    // Primary Checkout Tear / Re-Issue CTA Button
    document.getElementById('btn-tear-cta')?.addEventListener('click', () => {
      if (this.verlet.isFullyDetached) {
        this.issueFreshPass()
      } else {
        this.verlet.triggerZipperTear(1)
      }
    })

    // Global Keyboard Shortcuts (X = X-Ray, F = Flip 180°, R = Issue Fresh Pass, T = Tear Stub)
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      const key = e.key.toLowerCase()
      if (key === 'x') {
        this.toggleXRayMode()
      } else if (key === 'f') {
        this.toggleFlipPass()
      } else if (key === 'r') {
        this.issueFreshPass()
      } else if (key === 't') {
        if (!this.verlet.isFullyDetached) {
          this.verlet.triggerZipperTear(1)
        }
      }
    })
  }

  public selectTier(tierId: TierEditionId): void {
    this.currentTier = TIER_SPECS[tierId]
    this.passUniforms.uFoilMode.value = this.currentTier.foilMode

    document.querySelectorAll<HTMLButtonElement>('.tier-option').forEach((btn) => {
      const active = btn.dataset.tier === tierId
      btn.classList.toggle('is-selected', active)
      btn.setAttribute('aria-checked', String(active))
    })

    this.texGen.updateTicket(this.currentTier, this.currentSeat)
    this.updateCheckoutSummaryText()
    this.sound.playCardFlexWhoosh(0.45)

    // Subtle tactile ripple on the Verlet card when re-stamping foil edition
    for (let r = 0; r <= UPPER_SEAM_ROW; r++) {
      for (let c = 0; c < NUM_COLS; c++) {
        const i3 = this.verlet.idx(r, c) * 3
        const wave = Math.sin((c / COLS) * Math.PI) * 0.012
        this.verlet.pos[i3 + 2] += wave
      }
    }
  }

  public selectSeat(seat: SeatOption): void {
    this.currentSeat = seat
    document.querySelectorAll<HTMLButtonElement>('.seat-pill').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.seat === seat.id)
    })

    const gateEl = document.getElementById('active-gate-label')
    if (gateEl) gateEl.textContent = seat.gate

    this.texGen.updateTicket(this.currentTier, this.currentSeat)
    this.updateCheckoutSummaryText()
    this.sound.playCardFlexWhoosh(0.35)
  }

  private updateCheckoutSummaryText(): void {
    const priceEl = document.getElementById('checkout-price')
    const serialEl = document.getElementById('checkout-serial')
    if (priceEl) priceEl.textContent = this.currentTier.price
    if (serialEl) {
      serialEl.textContent = `${this.currentTier.serialPrefix}-${this.currentSeat.id}`
    }
  }

  public toggleFlipPass(): void {
    const flipped = this.verlet.toggleFlip()
    const btn = document.getElementById('btn-flip')
    btn?.classList.toggle('is-active', flipped)

    const faceIndicator = document.getElementById('stage-face-indicator')
    if (faceIndicator) {
      faceIndicator.textContent = flipped
        ? 'REVERSE FACE · DOME TOPOLOGY & SEAL'
        : 'FRONT FACE · HOLOGRAPHIC FOIL'
    }
    this.sound.playCardFlexWhoosh(0.7)
  }

  public toggleXRayMode(forceState?: boolean): void {
    this.xrayEnabled = forceState !== undefined ? forceState : !this.xrayEnabled
    this.xrayLines.visible = this.xrayEnabled

    const btn = document.getElementById('btn-xray')
    btn?.classList.toggle('is-active', this.xrayEnabled)

    const bar = document.getElementById('xray-telemetry-bar')
    bar?.classList.toggle('is-hidden', !this.xrayEnabled)
    this.sound.playCardFlexWhoosh(0.4)
  }

  public issueFreshPass(): void {
    this.verlet.resetPass(true)
    this.sound.playCardFlexWhoosh(0.8)
    this.syncPerforationUI()
  }

  private bindStageInteractions(): void {
    const cursorPill = document.getElementById('seam-cursor-pill')!
    const cursorText = document.getElementById('seam-cursor-text')!

    const updatePointerFromEvent = (e: PointerEvent) => {
      const rect = this.stageEl.getBoundingClientRect()
      this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      cursorPill.style.left = `${e.clientX - rect.left}px`
      cursorPill.style.top = `${e.clientY - rect.top}px`
    }

    this.stageEl.addEventListener('pointerDown', () => {})

    this.stageEl.addEventListener('pointerdown', (e: PointerEvent) => {
      updatePointerFromEvent(e)
      this.isPointerDown = true
      this.stageEl.setPointerCapture(e.pointerId)

      this.raycaster.setFromCamera(this.pointerNdc, this.camera)
      const hits = this.raycaster.intersectObject(this.passMesh, false)

      if (hits.length > 0 && hits[0].uv) {
        const hit = hits[0]
        const uv = hit.uv!
        const seamV = 0.28 // Perforation seam UV.y

        // Check if pointer clicked right on or near the perforation seam band
        if (Math.abs(uv.y - seamV) < 0.055 && !this.verlet.isFullyDetached) {
          this.isSlicingSeam = true
          this.lastSliceU = uv.x
          this.verlet.sliceSeamAtU(uv.x, 1.5)
          return
        }

        // Otherwise grab the nearest Verlet particle on Upper Body or Lower Stub
        const col = Math.round((this.verlet.isFlipped ? 1.0 - uv.x : uv.x) * COLS)
        const isLowerStub = uv.y < seamV
        let row = 0
        if (isLowerStub) {
          const stubNorm = (seamV - uv.y) / seamV
          row = Math.min(
            LOWER_SEAM_ROW + Math.round(stubNorm * 10),
            LOWER_SEAM_ROW + 10
          )
        } else {
          const upperNorm = (1.0 - uv.y) / (1.0 - seamV)
          row = Math.min(UPPER_SEAM_ROW, Math.round(upperNorm * UPPER_SEAM_ROW))
        }

        this.verlet.grabbedIndex = this.verlet.idx(row, col)
        this.verlet.isDraggingStub = isLowerStub
        this.verlet.grabbedWorldPoint.copy(hit.point)
        this.dragPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 0, 1),
          hit.point
        )
        this.sound.playCardFlexWhoosh(0.45)
      } else {
        // Even if starting slightly outside the left/right edge of the ticket,
        // allow sweeping across the perforation seam to slice it!
        this.dragPlane.set(new THREE.Vector3(0, 0, 1), 0)
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)) {
          const seamWorldY = (0.5 - 0.72) * TICKET_HEIGHT
          if (Math.abs(this.planeHit.y - seamWorldY) < 0.26 && !this.verlet.isFullyDetached) {
            this.isSlicingSeam = true
            const u = (this.planeHit.x / TICKET_WIDTH) + 0.5
            this.lastSliceU = u
          }
        }
      }
    })

    this.stageEl.addEventListener('pointermove', (e: PointerEvent) => {
      updatePointerFromEvent(e)

      // Smooth pointer tilt when hovering or dragging
      this.verlet.hoverTiltY = this.pointerNdc.x * 0.34
      this.verlet.hoverTiltX = -this.pointerNdc.y * 0.22

      this.raycaster.setFromCamera(this.pointerNdc, this.camera)

      // 1. If actively slicing across the perforation seam
      if (this.isPointerDown && this.isSlicingSeam && !this.verlet.isFullyDetached) {
        this.dragPlane.set(new THREE.Vector3(0, 0, 1), 0)
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)) {
          const rawU = this.planeHit.x / TICKET_WIDTH + 0.5
          const u = this.verlet.isFlipped ? 1.0 - rawU : rawU
          if (this.lastSliceU !== null) {
            // Sweep slice across all columns between lastSliceU and current u
            const steps = 8
            for (let s = 0; s <= steps; s++) {
              const interpU = this.lastSliceU + (u - this.lastSliceU) * (s / steps)
              if (interpU >= -0.05 && interpU <= 1.05) {
                this.verlet.sliceSeamAtU(Math.max(0, Math.min(1, interpU)), 1.55)
              }
            }
          }
          this.lastSliceU = u
          this.passUniforms.uPointerUv.value.set(Math.max(0, Math.min(1, u)), 0.28)
          this.seamHoverAmount = 1.0
          cursorPill.classList.add('is-visible')
          const pct = Math.round((1 - this.verlet.getIntactSeamCount() / NUM_COLS) * 100)
          cursorText.textContent = `TEARING SEAM · ${pct}%`
        }
        return
      }

      // 2. If grabbing and flexing the upper pass OR pulling the lower stub downward
      if (this.isPointerDown && this.verlet.grabbedIndex !== -1) {
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)) {
          this.verlet.grabbedWorldPoint.copy(this.planeHit)
          // Add subtle Z pull toward camera when flexing or pulling stub
          const pullMag = Math.hypot(this.pointerNdc.x, this.pointerNdc.y)
          this.verlet.grabbedWorldPoint.z = Math.min(0.65, 0.22 + pullMag * 0.28)

          if (this.verlet.isDraggingStub && !this.verlet.isFullyDetached) {
            cursorPill.classList.add('is-visible')
            const pct = Math.round((1 - this.verlet.getIntactSeamCount() / NUM_COLS) * 100)
            cursorText.textContent =
              pct > 0 ? `PULLING STUB · ${pct}% TORN` : 'PULL DOWN TO TEAR STUB'
          }
        }
        return
      }

      // 3. Hover inspection over the ticket & perforation seam detection
      const hits = this.raycaster.intersectObject(this.passMesh, false)
      if (hits.length > 0 && hits[0].uv) {
        const uv = hits[0].uv
        this.passUniforms.uPointerUv.value.copy(uv)
        const distSeam = Math.abs(uv.y - 0.28)

        if (distSeam < 0.055 && !this.verlet.isFullyDetached) {
          this.seamHoverAmount = 1.0
          cursorPill.classList.add('is-visible')
          cursorText.textContent = 'SLICE SEAM TO TEAR'
        } else if (uv.y < 0.28 && !this.verlet.isFullyDetached) {
          this.seamHoverAmount = 0.45
          cursorPill.classList.add('is-visible')
          cursorText.textContent = 'PULL STUB DOWN TO TEAR'
        } else {
          this.seamHoverAmount = 0.0
          cursorPill.classList.remove('is-visible')
        }
      } else {
        this.seamHoverAmount = 0.0
        cursorPill.classList.remove('is-visible')
      }
    })

    const releasePointer = () => {
      this.isPointerDown = false
      this.isSlicingSeam = false
      this.lastSliceU = null

      if (this.verlet.grabbedIndex !== -1) {
        // If user already tore more than 65% of the seam by pulling the stub, complete the tear cascade cleanly
        const intact = this.verlet.getIntactSeamCount()
        if (this.verlet.isDraggingStub && intact > 0 && intact <= Math.floor(NUM_COLS * 0.35)) {
          this.verlet.triggerZipperTear(1)
        }
        this.verlet.grabbedIndex = -1
        this.verlet.isDraggingStub = false
      }
      cursorPill.classList.remove('is-visible')
    }

    this.stageEl.addEventListener('pointerup', releasePointer)
    this.stageEl.addEventListener('pointercancel', releasePointer)
    this.stageEl.addEventListener('pointerleave', () => {
      if (!this.isPointerDown) {
        this.verlet.hoverTiltX = 0
        this.verlet.hoverTiltY = 0
        this.seamHoverAmount = 0
        cursorPill.classList.remove('is-visible')
      }
    })

    // Double-click anywhere on stage to flip the pass 180°
    this.stageEl.addEventListener('dblclick', () => {
      this.toggleFlipPass()
    })
  }

  private syncPerforationUI(): void {
    const metrics = this.verlet.getMetrics()
    const tornCount = metrics.totalSeamCount - metrics.intactSeamCount
    const tornPct = Math.round((tornCount / metrics.totalSeamCount) * 100)

    // Update 25 individual fiber cells
    for (let c = 0; c < NUM_COLS; c++) {
      const cell = this.fiberCells[c]
      if (!cell) continue
      const intact = this.verlet.seamIntact[c]
      const strained = intact && this.verlet.seamStrain[c] > 0.18
      cell.classList.toggle('is-severed', !intact)
      cell.classList.toggle('is-strained', strained)
    }

    const readoutEl = document.getElementById('seam-pct-readout')
    if (readoutEl) {
      readoutEl.textContent = `${tornPct}% TORN · ${metrics.intactSeamCount}/${metrics.totalSeamCount} FIBERS INTACT`
    }

    // Update Checkout Status Badge & Primary CTA Button
    const badgeEl = document.getElementById('status-badge')!
    const statusTextEl = document.getElementById('status-text')!
    const ctaBtn = document.getElementById('btn-tear-cta')!
    const ctaText = document.getElementById('btn-tear-text')!
    const ctaSub = ctaBtn.querySelector('.btn-tear-sub') as HTMLElement

    badgeEl.classList.remove('status-pending', 'status-tearing', 'status-verified')

    if (metrics.isDetached) {
      badgeEl.classList.add('status-verified')
      statusTextEl.textContent = 'PASS VERIFIED · ADMIT ONE'
      ctaBtn.classList.add('is-verified')
      ctaText.textContent = 'PASS VERIFIED · ADMIT ONE'
      if (ctaSub) ctaSub.textContent = 'CLICK OR PRESS [R] FOR FRESH PASS'
    } else if (tornCount > 0) {
      badgeEl.classList.add('status-tearing')
      statusTextEl.textContent = `SEAM TEARING · ${tornPct}% SEVERED`
      ctaBtn.classList.remove('is-verified')
      ctaText.textContent = `Complete Tear (${tornPct}%)`
      if (ctaSub) ctaSub.textContent = 'FINISH TEARING TO VERIFY'
    } else {
      badgeEl.classList.add('status-pending')
      statusTextEl.textContent = 'AWAITING TEAR VALIDATION'
      ctaBtn.classList.remove('is-verified')
      ctaText.textContent = 'Tear Perforated Stub'
      if (ctaSub) ctaSub.textContent = 'OR SLICE 3D SEAM'
    }

    this.passUniforms.uTearProgress.value = tornCount / metrics.totalSeamCount
  }

  private updateXRayTelemetryDOM(): void {
    if (!this.xrayEnabled) return
    const m = this.verlet.getMetrics()
    const springsEl = document.getElementById('metric-springs')
    const seamEl = document.getElementById('metric-seam')
    const tensionEl = document.getElementById('metric-tension')

    if (springsEl) {
      springsEl.textContent = `${m.activeSprings.toLocaleString()} / ${m.totalSprings.toLocaleString()}`
    }
    if (seamEl) {
      seamEl.textContent = `${m.seamIntegrityPct}% (${m.intactSeamCount}/${m.totalSeamCount})`
    }
    if (tensionEl) {
      tensionEl.textContent = `${(m.maxFiberStrain * 12.4).toFixed(2)} N`
    }
  }

  private onResize(): void {
    const w = this.stageEl.clientWidth
    const h = this.stageEl.clientHeight
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate)

    const dt = this.clock.getDelta()
    const elapsed = this.clock.getElapsedTime()

    // Step 3D Verlet Paper & Perforation Seam Solver
    this.verlet.step(dt, elapsed)

    // Smoothly interpolate shader uniforms
    this.passUniforms.uTime.value = elapsed
    this.passUniforms.uSeamHoverIntensity.value +=
      (this.seamHoverAmount - this.passUniforms.uSeamHoverIntensity.value) * 0.15

    const targetXRay = this.xrayEnabled ? 1.0 : 0.0
    this.currentXRayMix += (targetXRay - this.currentXRayMix) * 0.16
    this.passUniforms.uXRayMix.value = this.currentXRayMix

    // Keep fiber tension indicators & X-Ray telemetry live
    if (this.verlet.isDraggingStub || this.xrayEnabled) {
      this.syncPerforationUI()
      this.updateXRayTelemetryDOM()
    }

    this.renderer.render(this.scene, this.camera)
  }

  // Public helpers for automated verification & inspection
  public getEngine(): VerletPaperEngine {
    return this.verlet
  }
}

declare global {
  interface Window {
    __ticketApp?: HolographicTicketApp
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__ticketApp = new HolographicTicketApp()
})
