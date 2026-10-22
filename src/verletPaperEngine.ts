import * as THREE from 'three'
import { PhysicsMetrics } from './types'
import { PERF_RATIO_FROM_TOP } from './ticketTextureGenerator'

export const TICKET_WIDTH = 2.24
export const TICKET_HEIGHT = 3.808 // 2 : 3.4 ratio
export const COLS = 24 // 25 columns (0..24)
export const NUM_COLS = COLS + 1
export const UPPER_ROWS = 24 // rows 0..24 (25 rows) for upper body (0% to 72%)
export const STUB_ROWS = 10 // rows 25..35 (11 rows) for lower stub (72% to 100%)
export const UPPER_SEAM_ROW = UPPER_ROWS // 24
export const LOWER_SEAM_ROW = UPPER_ROWS + 1 // 25
export const TOTAL_ROWS = UPPER_ROWS + 1 + STUB_ROWS + 1 // 36 rows total (0..35)

export type SpringKind = 'structural' | 'shear' | 'bending' | 'seam'

export interface VerletSpring {
  a: number
  b: number
  restLength: number
  stiffness: number
  kind: SpringKind
  active: boolean
  seamCol: number // -1 if not a cross-seam spring, or 0..24 if tied to a perforation column
  currentStrain: number
}

export class VerletPaperEngine {
  public readonly numParticles = NUM_COLS * TOTAL_ROWS
  public readonly pos: Float32Array
  public readonly prevPos: Float32Array
  public readonly restLocalPos: Float32Array
  public readonly targetWorldPos: Float32Array
  public readonly vertexStrain: Float32Array
  public readonly uvs: Float32Array

  public readonly springs: VerletSpring[] = []
  public readonly seamIntact: boolean[] = new Array(NUM_COLS).fill(true)
  public readonly seamStrain: Float32Array = new Float32Array(NUM_COLS)

  public readonly geometry: THREE.BufferGeometry
  public readonly xrayGeometry: THREE.BufferGeometry
  private xrayPositions: Float32Array
  private xrayColors: Float32Array
  private xraySpringsList: VerletSpring[] = []

  // Rigid-body target orientation for smooth hover tilt + 180-deg flip
  public hoverTiltX = 0
  public hoverTiltY = 0
  private smoothTiltX = 0
  private smoothTiltY = 0

  public isFlipped = false
  private currentFlipAngle = 0
  private targetFlipAngle = 0

  // Entrance slide animation when issuing a fresh pass
  private entranceProgress = 1.0

  // Pointer interaction state
  public grabbedIndex = -1
  public grabbedWorldPoint = new THREE.Vector3()
  public isDraggingStub = false
  public pullAccumulator = 0

  // Progressive automated tear state (when triggered via checkout slider/button or full pull release)
  private autoTearActive = false
  private autoTearTimer = 0
  private autoTearDirection: 1 | -1 = 1

  public isFullyDetached = false
  private detachTime = 0

  // Callbacks for sound & UI updates
  private onFiberSevered?: (col: number, progress01: number) => void
  private onFullyDetached?: () => void

  constructor(
    onFiberSevered?: (col: number, progress01: number) => void,
    onFullyDetached?: () => void
  ) {
    this.onFiberSevered = onFiberSevered
    this.onFullyDetached = onFullyDetached

    this.pos = new Float32Array(this.numParticles * 3)
    this.prevPos = new Float32Array(this.numParticles * 3)
    this.restLocalPos = new Float32Array(this.numParticles * 3)
    this.targetWorldPos = new Float32Array(this.numParticles * 3)
    this.vertexStrain = new Float32Array(this.numParticles)
    this.uvs = new Float32Array(this.numParticles * 2)

    this.initParticlesAndUVs()
    this.initSprings()
    this.geometry = this.buildTicketGeometry()
    const xray = this.buildXRayGeometry()
    this.xrayGeometry = xray.geometry
    this.xrayPositions = xray.positions
    this.xrayColors = xray.colors
  }

  public idx(row: number, col: number): number {
    return row * NUM_COLS + col
  }

  private getRowNormalizedY(row: number): number {
    if (row <= UPPER_SEAM_ROW) {
      return (row / UPPER_SEAM_ROW) * PERF_RATIO_FROM_TOP
    } else {
      const stubStep = (row - LOWER_SEAM_ROW) / STUB_ROWS
      return PERF_RATIO_FROM_TOP + stubStep * (1.0 - PERF_RATIO_FROM_TOP)
    }
  }

  private initParticlesAndUVs(): void {
    for (let r = 0; r < TOTAL_ROWS; r++) {
      const normY = this.getRowNormalizedY(r) // 0.0 at top, 0.72 at seam, 1.0 at bottom
      const y = (0.5 - normY) * TICKET_HEIGHT
      const v = 1.0 - normY

      for (let c = 0; c < NUM_COLS; c++) {
        const u = c / COLS
        const x = (u - 0.5) * TICKET_WIDTH
        const i = this.idx(r, c)
        const i3 = i * 3

        this.restLocalPos[i3] = x
        this.restLocalPos[i3 + 1] = y
        this.restLocalPos[i3 + 2] = 0

        this.pos[i3] = x
        this.pos[i3 + 1] = y
        this.pos[i3 + 2] = 0

        this.prevPos[i3] = x
        this.prevPos[i3 + 1] = y
        this.prevPos[i3 + 2] = 0

        this.targetWorldPos[i3] = x
        this.targetWorldPos[i3 + 1] = y
        this.targetWorldPos[i3 + 2] = 0

        this.uvs[i * 2] = u
        this.uvs[i * 2 + 1] = v
      }
    }
  }

  private addSpring(
    a: number,
    b: number,
    stiffness: number,
    kind: SpringKind,
    seamCol = -1
  ): void {
    const ax = this.restLocalPos[a * 3]
    const ay = this.restLocalPos[a * 3 + 1]
    const az = this.restLocalPos[a * 3 + 2]
    const bx = this.restLocalPos[b * 3]
    const by = this.restLocalPos[b * 3 + 1]
    const bz = this.restLocalPos[b * 3 + 2]
    const restLength = Math.hypot(bx - ax, by - ay, bz - az)

    this.springs.push({
      a,
      b,
      restLength,
      stiffness,
      kind,
      active: true,
      seamCol,
      currentStrain: 0
    })
  }

  private initSprings(): void {
    this.springs.length = 0

    // Helper to build structural, shear, and bending springs within a contiguous section (upper body OR lower stub)
    const buildSectionSprings = (startRow: number, endRow: number) => {
      // 1. Structural Horizontal & Vertical
      for (let r = startRow; r <= endRow; r++) {
        for (let c = 0; c < NUM_COLS; c++) {
          if (c < COLS) {
            this.addSpring(this.idx(r, c), this.idx(r, c + 1), 0.94, 'structural')
          }
          if (r < endRow) {
            this.addSpring(this.idx(r, c), this.idx(r + 1, c), 0.94, 'structural')
          }
        }
      }

      // 2. Shear Diagonal Springs
      for (let r = startRow; r < endRow; r++) {
        for (let c = 0; c < COLS; c++) {
          this.addSpring(this.idx(r, c), this.idx(r + 1, c + 1), 0.82, 'shear')
          this.addSpring(this.idx(r + 1, c), this.idx(r, c + 1), 0.82, 'shear')
        }
      }

      // 3. Bending Springs (2-hop and 4-hop for authentic 350gsm card-stock curvature resistance)
      for (let r = startRow; r <= endRow; r++) {
        for (let c = 0; c < NUM_COLS; c++) {
          if (c + 2 <= COLS) {
            this.addSpring(this.idx(r, c), this.idx(r, c + 2), 0.76, 'bending')
          }
          if (c + 4 <= COLS) {
            this.addSpring(this.idx(r, c), this.idx(r, c + 4), 0.56, 'bending')
          }
          if (r + 2 <= endRow) {
            this.addSpring(this.idx(r, c), this.idx(r + 2, c), 0.76, 'bending')
          }
          if (r + 4 <= endRow) {
            this.addSpring(this.idx(r, c), this.idx(r + 4, c), 0.56, 'bending')
          }
        }
      }
    }

    // Build Upper Pass Body (rows 0..24) and Lower Stub (rows 25..35)
    buildSectionSprings(0, UPPER_SEAM_ROW)
    buildSectionSprings(LOWER_SEAM_ROW, TOTAL_ROWS - 1)

    // 4. Breakable Perforation Seam Springs & Cross-Seam Couplers across all 25 columns
    for (let c = 0; c < NUM_COLS; c++) {
      // Zero-length primary lock between upper seam lip and lower stub lip
      this.addSpring(
        this.idx(UPPER_SEAM_ROW, c),
        this.idx(LOWER_SEAM_ROW, c),
        0.98,
        'seam',
        c
      )

      // Visible span seam bridge between (UPPER_SEAM_ROW - 1, c) and (LOWER_SEAM_ROW + 1, c)
      // Keeps card tangent continuous across perforation and renders crisply in X-Ray mode!
      this.addSpring(
        this.idx(UPPER_SEAM_ROW - 1, c),
        this.idx(LOWER_SEAM_ROW + 1, c),
        0.85,
        'seam',
        c
      )

      // 2-hop cross-seam bending stiffness so card doesn't hinge limply at the perforation line
      this.addSpring(
        this.idx(UPPER_SEAM_ROW - 2, c),
        this.idx(LOWER_SEAM_ROW + 2, c),
        0.65,
        'bending',
        c
      )

      // Cross-seam diagonal shear couplers
      if (c < COLS) {
        this.addSpring(
          this.idx(UPPER_SEAM_ROW - 1, c),
          this.idx(LOWER_SEAM_ROW + 1, c + 1),
          0.68,
          'seam',
          c
        )
        this.addSpring(
          this.idx(UPPER_SEAM_ROW - 1, c + 1),
          this.idx(LOWER_SEAM_ROW + 1, c),
          0.68,
          'seam',
          c
        )
      }
    }
  }

  private buildTicketGeometry(): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry()
    const indices: number[] = []

    const addGridTriangles = (startRow: number, endRow: number) => {
      for (let r = startRow; r < endRow; r++) {
        for (let c = 0; c < COLS; c++) {
          const i00 = this.idx(r, c)
          const i10 = this.idx(r, c + 1)
          const i01 = this.idx(r + 1, c)
          const i11 = this.idx(r + 1, c + 1)

          indices.push(i00, i01, i10)
          indices.push(i10, i01, i11)
        }
      }
    }

    // Upper body triangles (rows 0..24) and lower stub triangles (rows 25..35)
    // No triangles bridge across UPPER_SEAM_ROW -> LOWER_SEAM_ROW so tearing physically opens the mesh!
    addGridTriangles(0, UPPER_SEAM_ROW)
    addGridTriangles(LOWER_SEAM_ROW, TOTAL_ROWS - 1)

    geom.setIndex(indices)
    geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geom.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2))
    geom.setAttribute('aStrain', new THREE.BufferAttribute(this.vertexStrain, 1))
    geom.computeVertexNormals()
    return geom
  }

  private buildXRayGeometry(): {
    geometry: THREE.BufferGeometry
    positions: Float32Array
    colors: Float32Array
  } {
    // Include all structural, shear, 2-hop bending, and non-zero-length seam springs in X-Ray visualization
    this.xraySpringsList = this.springs.filter((s) => s.restLength > 0.001)
    const count = this.xraySpringsList.length
    const positions = new Float32Array(count * 2 * 3)
    const colors = new Float32Array(count * 2 * 3)

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    return { geometry: geom, positions, colors }
  }

  /**
   * Severs a specific perforation column (0..24) if still intact.
   */
  public severSeamColumn(col: number, playAudio = true): boolean {
    if (col < 0 || col >= NUM_COLS || !this.seamIntact[col]) return false

    this.seamIntact[col] = false
    this.seamStrain[col] = 0

    // Deactivate all springs associated with this seam column (and diagonal couplers touching it)
    for (let i = 0; i < this.springs.length; i++) {
      const s = this.springs[i]
      if (s.seamCol === col) {
        s.active = false
      } else if (s.seamCol !== -1 && Math.abs(s.seamCol - col) <= 1 && s.kind === 'seam') {
        // If neighbor diagonal coupler crosses a broken column, release diagonal lock
        if (!this.seamIntact[s.seamCol]) {
          s.active = false
        }
      }
    }

    // Apply a subtle downward + forward peel impulse on the newly liberated stub lip particle
    // and an equal/opposite upward micro-recoil on the upper pass lip particle!
    const lowerIdx = this.idx(LOWER_SEAM_ROW, col) * 3
    const upperIdx = this.idx(UPPER_SEAM_ROW, col) * 3
    const flipSign = Math.cos(this.currentFlipAngle) >= 0 ? 1 : -1

    this.pos[lowerIdx + 1] -= 0.018
    this.pos[lowerIdx + 2] += 0.014 * flipSign
    this.pos[upperIdx + 1] += 0.008

    const intactCount = this.getIntactSeamCount()
    const progress01 = 1.0 - intactCount / NUM_COLS

    if (playAudio && this.onFiberSevered) {
      this.onFiberSevered(col, progress01)
    }

    if (intactCount === 0 && !this.isFullyDetached) {
      this.handleCompleteDetachment()
    }

    return true
  }

  private handleCompleteDetachment(): void {
    this.isFullyDetached = true
    this.detachTime = performance.now()
    this.autoTearActive = false
    if (this.isDraggingStub) {
      this.grabbedIndex = -1
      this.isDraggingStub = false
    }

    // Give the upper pass a crisp upward elastic release recoil
    // and give the detached lower stub an authentic downward + rotational curl impulse
    const flipSign = Math.cos(this.currentFlipAngle) >= 0 ? 1 : -1
    for (let r = 0; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < NUM_COLS; c++) {
        const i3 = this.idx(r, c) * 3
        const u = c / COLS - 0.5
        if (r <= UPPER_SEAM_ROW) {
          const rowFactor = r / UPPER_SEAM_ROW
          this.prevPos[i3 + 1] -= 0.028 * rowFactor
          this.prevPos[i3 + 2] += 0.016 * rowFactor * flipSign
        } else {
          // Stub receives downward velocity + slight rotational flutter torque
          this.prevPos[i3 + 1] += 0.032 + u * 0.018
          this.prevPos[i3 + 2] -= (0.022 + u * 0.025) * flipSign
          this.prevPos[i3] -= 0.008 * u
        }
      }
    }

    if (this.onFullyDetached) {
      this.onFullyDetached()
    }
  }

  /**
   * Slices perforation columns near normalized horizontal coordinate u (0..1) with given brush radius.
   */
  public sliceSeamAtU(u: number, radiusCols = 1.65): number {
    if (this.isFullyDetached) return 0
    const centerCol = u * COLS
    let severedNow = 0
    for (let c = 0; c < NUM_COLS; c++) {
      if (this.seamIntact[c] && Math.abs(c - centerCol) <= radiusCols) {
        if (this.severSeamColumn(c, true)) {
          severedNow++
        }
      }
    }
    // If only 1 or 2 edge fibers remain, snap them automatically so the user never gets stuck at 96%
    if (this.getIntactSeamCount() <= 2 && this.getIntactSeamCount() > 0) {
      for (let c = 0; c < NUM_COLS; c++) {
        if (this.seamIntact[c]) this.severSeamColumn(c, true)
      }
    }
    return severedNow
  }

  /**
   * Tears the seam progressively up to `targetFraction01` (0..1) from left to right.
   * Used when dragging the checkout tear slider.
   */
  public tearToFraction(targetFraction01: number): void {
    const clamped = Math.max(0, Math.min(1, targetFraction01))
    const targetSevered = Math.round(clamped * NUM_COLS)
    for (let c = 0; c < targetSevered; c++) {
      if (this.seamIntact[c]) {
        this.severSeamColumn(c, true)
      }
    }
    if (clamped >= 0.96 && !this.isFullyDetached) {
      for (let c = 0; c < NUM_COLS; c++) {
        if (this.seamIntact[c]) this.severSeamColumn(c, true)
      }
    }
  }

  /**
   * Triggers an automated sequential zipper tear across the perforation line.
   */
  public triggerZipperTear(direction: 1 | -1 = 1): void {
    if (this.isFullyDetached) return
    this.autoTearActive = true
    this.autoTearDirection = direction
    this.autoTearTimer = 0
  }

  public toggleFlip(): boolean {
    this.isFlipped = !this.isFlipped
    this.targetFlipAngle = this.isFlipped ? Math.PI : 0
    return this.isFlipped
  }

  /**
   * Resets all particles, repairs all perforation springs, and slides in a crisp fresh pass.
   */
  public resetPass(animateEntrance = true): void {
    this.isFullyDetached = false
    this.autoTearActive = false
    this.grabbedIndex = -1
    this.isDraggingStub = false
    this.pullAccumulator = 0
    this.seamIntact.fill(true)
    this.seamStrain.fill(0)
    this.vertexStrain.fill(0)
    this.entranceProgress = animateEntrance ? 0.0 : 1.0

    for (let i = 0; i < this.springs.length; i++) {
      this.springs[i].active = true
      this.springs[i].currentStrain = 0
    }

    const offsetY = animateEntrance ? 0.55 : 0.0
    const offsetZ = animateEntrance ? -0.35 : 0.0

    for (let i = 0; i < this.numParticles; i++) {
      const i3 = i * 3
      const rx = this.restLocalPos[i3]
      const ry = this.restLocalPos[i3 + 1]
      const rz = this.restLocalPos[i3 + 2]

      const cosY = Math.cos(this.currentFlipAngle)
      const sinY = Math.sin(this.currentFlipAngle)
      const wx = rx * cosY + rz * sinY
      const wy = ry + offsetY
      const wz = -rx * sinY + rz * cosY + offsetZ

      this.pos[i3] = wx
      this.pos[i3 + 1] = wy
      this.pos[i3 + 2] = wz

      this.prevPos[i3] = wx
      this.prevPos[i3 + 1] = wy
      this.prevPos[i3 + 2] = wz
    }

    this.updateGeometryBuffers()
  }

  public getIntactSeamCount(): number {
    let count = 0
    for (let c = 0; c < NUM_COLS; c++) {
      if (this.seamIntact[c]) count++
    }
    return count
  }

  public getMetrics(): PhysicsMetrics {
    let activeSprings = 0
    let maxFiberStrain = 0
    for (let i = 0; i < this.springs.length; i++) {
      const s = this.springs[i]
      if (s.active) {
        activeSprings++
        if (s.currentStrain > maxFiberStrain) {
          maxFiberStrain = s.currentStrain
        }
      }
    }
    const intactSeamCount = this.getIntactSeamCount()
    const seamIntegrityPct = Math.round((intactSeamCount / NUM_COLS) * 100)

    return {
      activeSprings,
      totalSprings: this.springs.length,
      intactSeamCount,
      totalSeamCount: NUM_COLS,
      seamIntegrityPct,
      maxFiberStrain,
      isDetached: this.isFullyDetached
    }
  }

  /**
   * Advances the Verlet integration and spring relaxation solver by dt seconds.
   */
  public step(dt: number, elapsedTime: number): void {
    const clampedDt = Math.min(dt, 0.033)

    // Smoothly interpolate rigid hover tilt & 180° flip rotation
    this.smoothTiltX += (this.hoverTiltX - this.smoothTiltX) * Math.min(1, clampedDt * 10)
    this.smoothTiltY += (this.hoverTiltY - this.smoothTiltY) * Math.min(1, clampedDt * 10)
    this.currentFlipAngle +=
      (this.targetFlipAngle - this.currentFlipAngle) * Math.min(1, clampedDt * 9)

    if (this.entranceProgress < 1.0) {
      this.entranceProgress = Math.min(1.0, this.entranceProgress + clampedDt * 2.8)
    }

    // Handle automated sequential zipper tear if active
    if (this.autoTearActive && !this.isFullyDetached) {
      this.autoTearTimer += clampedDt
      // Sever roughly 1 column every 18ms for a super crisp audible zipper cascade!
      while (this.autoTearTimer >= 0.018 && !this.isFullyDetached) {
        this.autoTearTimer -= 0.018
        const nextCol = this.findNextIntactSeamCol(this.autoTearDirection)
        if (nextCol !== -1) {
          // Apply downward peel force just ahead of the tear tip
          const tipIdx = this.idx(LOWER_SEAM_ROW + 3, nextCol) * 3
          this.pos[tipIdx + 1] -= 0.025
          this.pos[tipIdx + 2] += 0.018
          this.severSeamColumn(nextCol, true)
        } else {
          this.autoTearActive = false
          break
        }
      }
    }

    // Precompute rigid rest-pose world positions for the suspended pass
    const idleFloatY = Math.sin(elapsedTime * 1.7) * 0.018
    const idleSwayZ = Math.cos(elapsedTime * 1.3) * 0.012
    const autoStudioTiltX =
      Math.abs(this.hoverTiltX) < 0.001 && Math.abs(this.hoverTiltY) < 0.001
        ? -0.055 + Math.cos(elapsedTime * 0.85) * 0.045
        : 0
    const autoStudioTiltY =
      Math.abs(this.hoverTiltX) < 0.001 && Math.abs(this.hoverTiltY) < 0.001
        ? 0.165 + Math.sin(elapsedTime * 0.95) * 0.085
        : 0

    const totalRotX = this.smoothTiltX + autoStudioTiltX
    const totalRotY = this.currentFlipAngle + this.smoothTiltY + autoStudioTiltY

    const cosX = Math.cos(totalRotX)
    const sinX = Math.sin(totalRotX)
    const cosY = Math.cos(totalRotY)
    const sinY = Math.sin(totalRotY)

    for (let r = 0; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < NUM_COLS; c++) {
        const i = this.idx(r, c)
        const i3 = i * 3
        const lx = this.restLocalPos[i3]
        const ly = this.restLocalPos[i3 + 1]
        // Subtle natural card-stock arch in Z
        const lz = Math.cos((c / COLS - 0.5) * Math.PI) * 0.026

        // Rotate around X then around Y
        const y1 = ly * cosX - lz * sinX
        const z1 = ly * sinX + lz * cosX

        const wx = lx * cosY + z1 * sinY
        const wy = y1 + idleFloatY
        const wz = -lx * sinY + z1 * cosY + idleSwayZ

        this.targetWorldPos[i3] = wx
        this.targetWorldPos[i3 + 1] = wy
        this.targetWorldPos[i3 + 2] = wz
      }
    }

    // 1. Verlet Velocity Integration + Posture Return Forces + Gravity on Torn Stub
    const damping = 0.942
    const intactCount = this.getIntactSeamCount()
    const tornRatio = 1.0 - intactCount / NUM_COLS
    const firstIntactCol = this.findNextIntactSeamCol(1)

    for (let r = 0; r < TOTAL_ROWS; r++) {
      const isStub = r >= LOWER_SEAM_ROW
      for (let c = 0; c < NUM_COLS; c++) {
        const i = this.idx(r, c)
        const i3 = i * 3

        const px = this.pos[i3]
        const py = this.pos[i3 + 1]
        const pz = this.pos[i3 + 2]

        const vx = (px - this.prevPos[i3]) * damping
        const vy = (py - this.prevPos[i3 + 1]) * damping
        const vz = (pz - this.prevPos[i3 + 2]) * damping

        this.prevPos[i3] = px
        this.prevPos[i3 + 1] = py
        this.prevPos[i3 + 2] = pz

        let nx = px + vx
        let ny = py + vy
        let nz = pz + vz

        if (!isStub) {
          // Upper pass is suspended in 3D space with a graduated posture stiffness:
          // Stronger near the upper center so the card stays anchored in stage, softer toward corners/seam so it waves and flexes!
          const rowNorm = r / UPPER_SEAM_ROW
          const edgeDist = Math.abs(c / COLS - 0.5) * 2.0
          let postureStiffness = 0.054 * (1.0 - 0.52 * rowNorm - 0.24 * edgeDist)
          if (this.grabbedIndex !== -1 && !this.isDraggingStub) {
            postureStiffness *= 0.48
          }

          nx += (this.targetWorldPos[i3] - nx) * postureStiffness
          ny += (this.targetWorldPos[i3 + 1] - ny) * postureStiffness
          nz += (this.targetWorldPos[i3 + 2] - nz) * postureStiffness
        } else {
          // Lower Stub Physics:
          if (this.isFullyDetached) {
            // Detached stub falls freely under gravity with aerodynamic flutter and paper curl!
            const timeSinceDetach = (performance.now() - this.detachTime) * 0.001
            const flutterWave =
              Math.sin(elapsedTime * 11.0 + c * 0.35 + r * 0.2) * 0.0026
            const lateralDrift = Math.cos(elapsedTime * 5.5 + r * 0.15) * 0.0012

            ny -= 0.0068 * Math.min(1.8, 0.7 + timeSinceDetach * 1.4)
            nx += lateralDrift
            nz += flutterWave
          } else {
            // Stub is still attached (fully or partially)
            const colIntact = this.seamIntact[c]
            if (colIntact && tornRatio < 0.04 && !this.isDraggingStub) {
              // Completely intact & undisturbed: align smoothly with upper card posture
              const stubPosture = 0.028
              nx += (this.targetWorldPos[i3] - nx) * stubPosture
              ny += (this.targetWorldPos[i3 + 1] - ny) * stubPosture
              nz += (this.targetWorldPos[i3 + 2] - nz) * stubPosture
            } else {
              // Partially torn OR being pulled: apply weak posture on intact columns and downward V-peel curl on torn columns!
              if (colIntact) {
                const holdFactor = this.isDraggingStub ? 0.005 : 0.018
                nx += (this.targetWorldPos[i3] - nx) * holdFactor
                ny += (this.targetWorldPos[i3 + 1] - ny) * holdFactor
                nz += (this.targetWorldPos[i3 + 2] - nz) * holdFactor
              } else {
                // Torn column hangs & peels forward/downward proportional to distance from tear hinge!
                const hingeCol = firstIntactCol !== -1 ? firstIntactCol : COLS
                const spanFromHinge = Math.abs(c - hingeCol) / NUM_COLS
                const stubRowProgress = (r - LOWER_SEAM_ROW + 1) / (STUB_ROWS + 1)
                const flipSign = Math.cos(this.currentFlipAngle) >= 0 ? 1 : -1

                ny -= (0.0042 + spanFromHinge * 0.0085) * (0.75 + stubRowProgress * 0.9)
                nz += (0.0034 + spanFromHinge * 0.0065) * (0.65 + stubRowProgress * 0.8) * flipSign
              }
            }
          }
        }

        this.pos[i3] = nx
        this.pos[i3 + 1] = ny
        this.pos[i3 + 2] = nz
      }
    }

    // 2. Apply Active Pointer Grab / Flex / Stub Pull Manipulation
    if (this.grabbedIndex !== -1) {
      const grabRow = Math.floor(this.grabbedIndex / NUM_COLS)
      const grabCol = this.grabbedIndex % NUM_COLS

      for (let r = 0; r < TOTAL_ROWS; r++) {
        // Only influence particles on the same half (upper vs lower stub) unless seam is intact
        const sameHalf =
          (grabRow <= UPPER_SEAM_ROW && r <= UPPER_SEAM_ROW) ||
          (grabRow >= LOWER_SEAM_ROW && r >= LOWER_SEAM_ROW)
        if (!sameHalf) continue

        for (let c = 0; c < NUM_COLS; c++) {
          const distGrid = Math.hypot(r - grabRow, c - grabCol)
          const radius = this.isDraggingStub ? 9.5 : 7.5
          if (distGrid <= radius) {
            const falloff = Math.pow(1.0 - distGrid / radius, 1.7)
            const i = this.idx(r, c)
            const i3 = i * 3
            const grabOffset = this.idx(grabRow, grabCol) * 3

            const dx =
              this.grabbedWorldPoint.x +
              (this.restLocalPos[i3] - this.restLocalPos[grabOffset]) -
              this.pos[i3]
            const dy =
              this.grabbedWorldPoint.y +
              (this.restLocalPos[i3 + 1] - this.restLocalPos[grabOffset + 1]) -
              this.pos[i3 + 1]
            const dz = this.grabbedWorldPoint.z - this.pos[i3 + 2]

            const strength = 0.38 * falloff
            this.pos[i3] += dx * strength
            this.pos[i3 + 1] += dy * strength
            this.pos[i3 + 2] += dz * strength
          }
        }
      }

      // If pulling the lower stub downward, evaluate tear propagation from pull displacement!
      if (this.isDraggingStub && !this.isFullyDetached) {
        const grabI3 = this.grabbedIndex * 3
        const targetY = this.targetWorldPos[grabI3 + 1]
        const pullDownDist = Math.max(0, targetY - this.grabbedWorldPoint.y)
        const pullOutDist = Math.abs(this.grabbedWorldPoint.z - this.targetWorldPos[grabI3 + 2])
        const effectivePull = pullDownDist + pullOutDist * 0.65

        // Update visual strain along intact seam columns
        for (let c = 0; c < NUM_COLS; c++) {
          if (this.seamIntact[c]) {
            const colProximity = 1.0 - Math.abs(c - grabCol) / NUM_COLS
            this.seamStrain[c] = Math.min(1.0, effectivePull * 3.2 * (0.5 + 0.5 * colProximity))
          }
        }

        // Progressive tear threshold as user pulls down:
        // Begins tearing at pull >= 0.11 and reaches 100% tear at pull >= 0.56
        if (effectivePull > 0.11) {
          const desiredTearProgress = Math.min(1.0, (effectivePull - 0.11) / 0.45)
          const desiredSeveredCount = Math.floor(desiredTearProgress * NUM_COLS)
          const currentlySevered = NUM_COLS - this.getIntactSeamCount()

          if (desiredSeveredCount > currentlySevered) {
            // Tear from the edge closest to where the user grabbed the stub
            const dir: 1 | -1 = grabCol <= COLS * 0.5 ? 1 : -1
            const nextCol = this.findNextIntactSeamCol(dir)
            if (nextCol !== -1) {
              this.severSeamColumn(nextCol, true)
            }
            if (this.getIntactSeamCount() <= 2) {
              this.triggerZipperTear(dir)
            }
          }
        }
      }
    } else {
      // Decay seam strain smoothly when not pulling
      for (let c = 0; c < NUM_COLS; c++) {
        this.seamStrain[c] *= 0.88
      }
    }

    // 3. Iterative Spring Constraint Relaxation (10 substeps for crisp 350gsm card stock)
    const iterations = 10
    this.vertexStrain.fill(0)

    for (let iter = 0; iter < iterations; iter++) {
      const isLastIter = iter === iterations - 1
      for (let sIdx = 0; sIdx < this.springs.length; sIdx++) {
        const s = this.springs[sIdx]
        if (!s.active) continue

        const a3 = s.a * 3
        const b3 = s.b * 3

        const dx = this.pos[b3] - this.pos[a3]
        const dy = this.pos[b3 + 1] - this.pos[a3 + 1]
        const dz = this.pos[b3 + 2] - this.pos[a3 + 2]

        const dist = Math.hypot(dx, dy, dz)
        if (dist < 1e-7) continue

        const diff = dist - s.restLength
        if (isLastIter) {
          const strain =
            s.restLength > 0.001
              ? Math.min(1.0, Math.abs(diff) / (s.restLength * 0.25))
              : Math.min(1.0, dist * 14.0)
          s.currentStrain = strain
          if (strain > this.vertexStrain[s.a]) this.vertexStrain[s.a] = strain
          if (strain > this.vertexStrain[s.b]) this.vertexStrain[s.b] = strain
        }

        const corr = (diff / dist) * 0.5 * s.stiffness
        const cx = dx * corr
        const cy = dy * corr
        const cz = dz * corr

        this.pos[a3] += cx
        this.pos[a3 + 1] += cy
        this.pos[a3 + 2] += cz

        this.pos[b3] -= cx
        this.pos[b3 + 1] -= cy
        this.pos[b3 + 2] -= cz
      }
    }

    // Boost vertexStrain along seam lips so torn/stressed seam fibers glow vividly in shader & X-ray
    for (let c = 0; c < NUM_COLS; c++) {
      const uIdx = this.idx(UPPER_SEAM_ROW, c)
      const lIdx = this.idx(LOWER_SEAM_ROW, c)
      const strainVal = this.seamIntact[c] ? this.seamStrain[c] : 0.85
      this.vertexStrain[uIdx] = Math.max(this.vertexStrain[uIdx], strainVal)
      this.vertexStrain[lIdx] = Math.max(this.vertexStrain[lIdx], strainVal)
    }

    this.updateGeometryBuffers()
  }

  private findNextIntactSeamCol(direction: 1 | -1): number {
    if (direction === 1) {
      for (let c = 0; c < NUM_COLS; c++) {
        if (this.seamIntact[c]) return c
      }
    } else {
      for (let c = NUM_COLS - 1; c >= 0; c--) {
        if (this.seamIntact[c]) return c
      }
    }
    return -1
  }

  private updateGeometryBuffers(): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    posAttr.needsUpdate = true

    const strainAttr = this.geometry.getAttribute('aStrain') as THREE.BufferAttribute
    strainAttr.needsUpdate = true

    this.geometry.computeVertexNormals()

    // Blend vertex normals across intact perforation columns so the untorn portion of the seam has 100% smooth shading!
    const normAttr = this.geometry.getAttribute('normal') as THREE.BufferAttribute
    const norms = normAttr.array as Float32Array
    for (let c = 0; c < NUM_COLS; c++) {
      if (this.seamIntact[c]) {
        const u3 = this.idx(UPPER_SEAM_ROW, c) * 3
        const l3 = this.idx(LOWER_SEAM_ROW, c) * 3
        let nx = norms[u3] + norms[l3]
        let ny = norms[u3 + 1] + norms[l3 + 1]
        let nz = norms[u3 + 2] + norms[l3 + 2]
        const len = Math.hypot(nx, ny, nz) || 1
        nx /= len
        ny /= len
        nz /= len
        norms[u3] = norms[l3] = nx
        norms[u3 + 1] = norms[l3 + 1] = ny
        norms[u3 + 2] = norms[l3 + 2] = nz
      }
    }
    normAttr.needsUpdate = true

    // Update X-Ray Spring Lattice LineSegments
    for (let i = 0; i < this.xraySpringsList.length; i++) {
      const s = this.xraySpringsList[i]
      const pOffset = i * 6
      const a3 = s.a * 3
      const b3 = s.b * 3

      if (!s.active) {
        // Collapse broken spring line to a tiny severed ember dot on the upper lip
        this.xrayPositions[pOffset] = this.pos[a3]
        this.xrayPositions[pOffset + 1] = this.pos[a3 + 1]
        this.xrayPositions[pOffset + 2] = this.pos[a3 + 2]
        this.xrayPositions[pOffset + 3] = this.pos[a3]
        this.xrayPositions[pOffset + 4] = this.pos[a3 + 1] - 0.015
        this.xrayPositions[pOffset + 5] = this.pos[a3 + 2]

        // Glowing crimson severed indicator
        this.xrayColors[pOffset] = 0.96
        this.xrayColors[pOffset + 1] = 0.22
        this.xrayColors[pOffset + 2] = 0.28
        this.xrayColors[pOffset + 3] = 0.96
        this.xrayColors[pOffset + 4] = 0.22
        this.xrayColors[pOffset + 5] = 0.28
        continue
      }

      // Lift X-Ray lines slightly along normal so they never z-fight with the pass surface
      this.xrayPositions[pOffset] = this.pos[a3]
      this.xrayPositions[pOffset + 1] = this.pos[a3 + 1]
      this.xrayPositions[pOffset + 2] = this.pos[a3 + 2]

      this.xrayPositions[pOffset + 3] = this.pos[b3]
      this.xrayPositions[pOffset + 4] = this.pos[b3 + 1]
      this.xrayPositions[pOffset + 5] = this.pos[b3 + 2]

      const strain = Math.min(1.0, s.currentStrain * 2.5)
      let r = 0.13
      let g = 0.83
      let b = 0.93

      if (s.kind === 'structural') {
        // Cyan (#22D3EE) -> shifts toward bright amber/red under strain
        r = 0.13 + strain * 0.85
        g = 0.83 - strain * 0.35
        b = 0.93 - strain * 0.7
      } else if (s.kind === 'shear' || s.kind === 'bending') {
        // Indigo (#818CF8)
        r = 0.5 + strain * 0.48
        g = 0.55 - strain * 0.2
        b = 0.97 - strain * 0.5
      } else if (s.kind === 'seam') {
        // Breakable Perforation Seam Springs: High-visibility glowing Amber/Crimson (#F59E0B -> #EF4444)
        const seamColStrain = s.seamCol >= 0 ? this.seamStrain[s.seamCol] : 0
        const totalSeamStrain = Math.min(1.0, Math.max(strain, seamColStrain))
        r = 0.98
        g = 0.62 - totalSeamStrain * 0.45
        b = 0.08 + totalSeamStrain * 0.18
      }

      this.xrayColors[pOffset] = r
      this.xrayColors[pOffset + 1] = g
      this.xrayColors[pOffset + 2] = b
      this.xrayColors[pOffset + 3] = r
      this.xrayColors[pOffset + 4] = g
      this.xrayColors[pOffset + 5] = b
    }

    ;(this.xrayGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(this.xrayGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }
}
