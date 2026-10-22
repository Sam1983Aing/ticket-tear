import * as THREE from 'three'
import { SeatOption, TierEditionId, TierSpec } from './types'

export const TIER_SPECS: Record<TierEditionId, TierSpec> = {
  silver: {
    id: 'silver',
    code: '01 · SILVER HOLO EDITION',
    name: '01 · Silver Holo Edition',
    subtitle: 'Alabaster 350gsm cotton stock & liquid chrome rainbow foil',
    price: '$180 CAD',
    accessBadge: 'MAIN DOME + SOUNDCHECK',
    defaultSeat: 'ROW A · SEAT 04',
    serialPrefix: 'KLS-01-AG',
    paperHex: '#EFECE4',
    inkHex: '#141413',
    accentHex: '#4F46E5',
    secondaryInkHex: '#57544D',
    foilMode: 0,
    swatchGradient: 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 22%, #a5b4fc 48%, #f9a8d4 74%, #fde68a 100%)'
  },
  gold: {
    id: 'gold',
    code: '02 · FOUNDERS GOLD LEAF',
    name: '02 · Founders Gold Leaf',
    subtitle: 'Carbon obsidian stock & 24K hammered solar prismatic leaf',
    price: '$420 CAD',
    accessBadge: 'VIP SALON + BACKSTAGE PASS',
    defaultSeat: 'ROW AA · SUITE 01',
    serialPrefix: 'KLS-02-AU',
    paperHex: '#121215',
    inkHex: '#F7F3E8',
    accentHex: '#F59E0B',
    secondaryInkHex: '#A69E8E',
    foilMode: 1,
    swatchGradient: 'linear-gradient(135deg, #fef3c7 0%, #f59e0b 30%, #fbbf24 58%, #fb7185 82%, #fef08a 100%)'
  },
  ultraviolet: {
    id: 'ultraviolet',
    code: '03 · ULTRAVIOLET PRISM',
    name: '03 · Ultraviolet Prism',
    subtitle: 'Midnight cobalt stock & magenta-cyan dichroic interference foil',
    price: '$290 CAD',
    accessBadge: 'IMMERSIVE DOME LOUNGE',
    defaultSeat: 'MEZZANINE · BOX 12',
    serialPrefix: 'KLS-03-UV',
    paperHex: '#101426',
    inkHex: '#EEF2FF',
    accentHex: '#EC4899',
    secondaryInkHex: '#94A0D4',
    foilMode: 2,
    swatchGradient: 'linear-gradient(135deg, #22d3ee 0%, #6366f1 34%, #ec4899 68%, #f43f5e 88%, #38bdf8 100%)'
  }
}

export const SEAT_OPTIONS: SeatOption[] = [
  { id: 'A-04', label: 'ROW A · SEAT 04', zone: 'ACOUSTIC RING NORTH', gate: 'GATE 01 · WEST' },
  { id: 'AA-01', label: 'ROW AA · SUITE 01', zone: 'FOUNDERS MEZZANINE', gate: 'GATE VIP · ATRIUM' },
  { id: 'MZ-12', label: 'MEZZANINE · BOX 12', zone: 'UPPER PROJECTION ARC', gate: 'GATE 03 · EAST' },
  { id: 'GA-09', label: 'DOME FLOOR · GA-09', zone: 'SUB-BASS IMMERSION', gate: 'GATE 02 · SOUTH' }
]

export interface GeneratedTicketTextures {
  frontMap: THREE.CanvasTexture
  frontFoilMap: THREE.CanvasTexture
  backMap: THREE.CanvasTexture
  backFoilMap: THREE.CanvasTexture
}

const TEX_W = 1024
const TEX_H = 1740
/**
 * Perforation line sits at 72% down from top of ticket (y = 1252.8px in canvas space, v = 0.28 in UV space)
 */
export const PERF_RATIO_FROM_TOP = 0.72
const PERF_Y = Math.round(TEX_H * PERF_RATIO_FROM_TOP)

function drawRoundedTicketPath(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number): void {
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(w - radius, 0)
  ctx.quadraticCurveTo(w, 0, w, radius)
  ctx.lineTo(w, h - radius)
  ctx.quadraticCurveTo(w, h, w - radius, h)
  ctx.lineTo(radius, h)
  ctx.quadraticCurveTo(0, h, 0, h - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
}

function punchPerforationCutouts(ctx: CanvasRenderingContext2D, w: number, isDark = false): void {
  const sideNotchRadius = 28
  const holeCount = 21
  const startX = 68
  const endX = w - 68
  const stepX = (endX - startX) / (holeCount - 1)
  const holeRadius = 8.2

  // First draw subtle debossed die-cut ring around each perforation hole
  ctx.save()
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(20,20,19,0.26)'
  ctx.lineWidth = 2.0
  for (let i = 0; i < holeCount; i++) {
    const hx = startX + i * stepX
    ctx.beginPath()
    ctx.arc(hx, PERF_Y, holeRadius + 1.2, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // Now punch transparent cutouts
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000000'

  ctx.beginPath()
  ctx.arc(0, PERF_Y, sideNotchRadius, 0, Math.PI * 2)
  ctx.arc(w, PERF_Y, sideNotchRadius, 0, Math.PI * 2)
  ctx.fill()

  for (let i = 0; i < holeCount; i++) {
    const hx = startX + i * stepX
    ctx.beginPath()
    ctx.arc(hx, PERF_Y, holeRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function drawPaperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, isDark: boolean): void {
  ctx.save()
  ctx.globalAlpha = isDark ? 0.045 : 0.032
  for (let i = 0; i < 4200; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * w
    const y = (Math.cos(i * 78.233) * 29431.1123 % 1 + 1) % 1 * h
    const len = 1 + (i % 3)
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000'
    ctx.fillRect(x, y, len, 1)
  }
  ctx.restore()
}

/**
 * Draws the intricate Guilloche Spirograph & Kinetic Prism Emblem both onto the visible diffuse canvas
 * and onto the RGB Foil/Emboss/Phase mask canvas.
 */
function drawGuillochePrismEmblem(
  baseCtx: CanvasRenderingContext2D,
  foilCtx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tier: TierSpec
): void {
  const isDark = tier.id !== 'silver'

  // Outer fine geometric degree ring
  baseCtx.save()
  foilCtx.save()

  for (let i = 0; i < 120; i++) {
    const ang = (i / 120) * Math.PI * 2
    const isMajor = i % 10 === 0
    const isMid = i % 5 === 0
    const r0 = 212
    const r1 = isMajor ? 232 : isMid ? 225 : 219

    const x0 = cx + Math.cos(ang) * r0
    const y0 = cy + Math.sin(ang) * r0
    const x1 = cx + Math.cos(ang) * r1
    const y1 = cy + Math.sin(ang) * r1

    baseCtx.strokeStyle = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(20,20,19,0.72)'
    baseCtx.lineWidth = isMajor ? 2.4 : 1.3
    baseCtx.beginPath()
    baseCtx.moveTo(x0, y0)
    baseCtx.lineTo(x1, y1)
    baseCtx.stroke()

    const phaseByte = Math.round(((i / 120) * 255) % 255)
    foilCtx.strokeStyle = `rgb(245, 210, ${phaseByte})`
    foilCtx.lineWidth = isMajor ? 3.2 : 1.8
    foilCtx.beginPath()
    foilCtx.moveTo(x0, y0)
    foilCtx.lineTo(x1, y1)
    foilCtx.stroke()
  }

  // Multi-wave Guilloche Spirograph Curves
  const numWaves = 44
  for (let w = 0; w < numWaves; w++) {
    const tWave = w / numWaves
    const phaseShift = tWave * Math.PI * 2
    const phaseByte = Math.round(tWave * 255)

    baseCtx.beginPath()
    foilCtx.beginPath()

    const steps = 200
    for (let s = 0; s <= steps; s++) {
      const theta = (s / steps) * Math.PI * 2
      const r =
        138 +
        38 * Math.sin(6 * theta + phaseShift) +
        18 * Math.cos(12 * theta - phaseShift * 1.5)
      const px = cx + Math.cos(theta) * r
      const py = cy + Math.sin(theta) * r
      if (s === 0) {
        baseCtx.moveTo(px, py)
        foilCtx.moveTo(px, py)
      } else {
        baseCtx.lineTo(px, py)
        foilCtx.lineTo(px, py)
      }
    }

    baseCtx.strokeStyle = isDark
      ? `hsla(${40 + tWave * 220}, 70%, 78%, 0.42)`
      : `hsla(${210 + tWave * 160}, 35%, 24%, 0.40)`
    baseCtx.lineWidth = 1.35
    baseCtx.stroke()

    foilCtx.strokeStyle = `rgb(255, ${185 + (w % 60)}, ${phaseByte})`
    foilCtx.lineWidth = 2.2
    foilCtx.stroke()
  }

  // Central Faceted Holographic Octagon / Prism Star
  const facets = 16
  const innerRadius = 92
  for (let f = 0; f < facets; f++) {
    const a0 = (f / facets) * Math.PI * 2
    const a1 = ((f + 1) / facets) * Math.PI * 2
    const x0 = cx + Math.cos(a0) * innerRadius
    const y0 = cy + Math.sin(a0) * innerRadius
    const x1 = cx + Math.cos(a1) * innerRadius
    const y1 = cy + Math.sin(a1) * innerRadius

    baseCtx.beginPath()
    baseCtx.moveTo(cx, cy)
    baseCtx.lineTo(x0, y0)
    baseCtx.lineTo(x1, y1)
    baseCtx.closePath()

    const shade = f % 2 === 0 ? 0.88 : 0.62
    baseCtx.fillStyle = isDark
      ? `rgba(255, 255, 255, ${0.14 * shade})`
      : `rgba(20, 20, 22, ${0.12 * shade})`
    baseCtx.fill()
    baseCtx.strokeStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(20,20,20,0.65)'
    baseCtx.lineWidth = 1.4
    baseCtx.stroke()

    // Each triangular facet gets a distinct diffraction phase in Blue channel + raised height in Green channel
    const facetPhase = Math.round(((f * 37) % 256))
    const facetHeight = f % 2 === 0 ? 235 : 175
    foilCtx.beginPath()
    foilCtx.moveTo(cx, cy)
    foilCtx.lineTo(x0, y0)
    foilCtx.lineTo(x1, y1)
    foilCtx.closePath()
    foilCtx.fillStyle = `rgb(255, ${facetHeight}, ${facetPhase})`
    foilCtx.fill()
  }

  // Concentric Holographic Core Ring
  baseCtx.beginPath()
  baseCtx.arc(cx, cy, 38, 0, Math.PI * 2)
  baseCtx.fillStyle = tier.paperHex
  baseCtx.fill()
  baseCtx.lineWidth = 3
  baseCtx.strokeStyle = tier.inkHex
  baseCtx.stroke()

  foilCtx.beginPath()
  foilCtx.arc(cx, cy, 38, 0, Math.PI * 2)
  foilCtx.fillStyle = 'rgb(255, 248, 128)'
  foilCtx.fill()

  // Center Edition Monogram inside Prism Core
  baseCtx.fillStyle = tier.inkHex
  baseCtx.font = '700 22px "JetBrains Mono", monospace'
  baseCtx.textAlign = 'center'
  baseCtx.textBaseline = 'middle'
  const monogram = tier.id === 'silver' ? 'AG·01' : tier.id === 'gold' ? 'AU·02' : 'UV·03'
  baseCtx.fillText(monogram, cx, cy + 1)

  baseCtx.restore()
  foilCtx.restore()
}

function drawFrontTicket(
  baseCtx: CanvasRenderingContext2D,
  foilCtx: CanvasRenderingContext2D,
  tier: TierSpec,
  seat: SeatOption
): void {
  const w = TEX_W
  const h = TEX_H
  const isDark = tier.id !== 'silver'

  // 1. Initialize Foil Mask Canvas with neutral non-foil matte card stock:
  // R=0 (no foil), G=128 (neutral height), B=0 (base phase), A=255
  foilCtx.fillStyle = 'rgb(0, 128, 0)'
  foilCtx.fillRect(0, 0, w, h)

  // 2. Draw Rounded Ticket Shape on Base Canvas
  baseCtx.clearRect(0, 0, w, h)
  baseCtx.save()
  drawRoundedTicketPath(baseCtx, w, h, 48)
  baseCtx.clip()

  // Base paper stock fill
  baseCtx.fillStyle = tier.paperHex
  baseCtx.fillRect(0, 0, w, h)
  drawPaperGrain(baseCtx, w, h, isDark)

  // Subtle outer die-cut paper edge bevel
  baseCtx.save()
  drawRoundedTicketPath(baseCtx, w - 3, h - 3, 47)
  baseCtx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(20,20,18,0.22)'
  baseCtx.lineWidth = 4
  baseCtx.stroke()
  baseCtx.restore()

  // Outer double security border frame (both ink and raised holographic foil)
  const pad = 34
  baseCtx.strokeStyle = tier.inkHex
  baseCtx.lineWidth = 2.5
  baseCtx.strokeRect(pad, pad, w - pad * 2, h - pad * 2)

  foilCtx.strokeStyle = 'rgb(235, 220, 64)'
  foilCtx.lineWidth = 4.5
  foilCtx.strokeRect(pad, pad, w - pad * 2, h - pad * 2)

  // Inner hairline frame for upper pass body
  baseCtx.strokeStyle = tier.secondaryInkHex
  baseCtx.lineWidth = 1.2
  baseCtx.strokeRect(pad + 14, pad + 14, w - (pad + 14) * 2, PERF_Y - pad - 34)

  // Top Holographic Security Ribbon Header
  const headerY = 74
  baseCtx.fillStyle = tier.inkHex
  baseCtx.fillRect(pad + 14, headerY, w - (pad + 14) * 2, 54)

  foilCtx.fillStyle = 'rgb(235, 215, 96)'
  foilCtx.fillRect(pad + 14, headerY, w - (pad + 14) * 2, 54)

  baseCtx.fillStyle = tier.paperHex
  baseCtx.font = '700 21px "JetBrains Mono", monospace'
  baseCtx.textAlign = 'left'
  baseCtx.textBaseline = 'middle'
  baseCtx.fillText('ADMIT ONE // HOLOGRAPHIC PASS', pad + 36, headerY + 28)

  baseCtx.textAlign = 'right'
  baseCtx.fillText(tier.code, w - pad - 36, headerY + 28)

  // Knock out foil R channel on the header text so the knockout lettering is razor-sharp against the holographic bar!
  foilCtx.fillStyle = 'rgb(0, 250, 0)'
  foilCtx.font = '700 21px "JetBrains Mono", monospace'
  foilCtx.textAlign = 'left'
  foilCtx.textBaseline = 'middle'
  foilCtx.fillText('ADMIT ONE // HOLOGRAPHIC PASS', pad + 36, headerY + 28)
  foilCtx.textAlign = 'right'
  foilCtx.fillText(tier.code, w - pad - 36, headerY + 28)

  // Sub-header technical metadata row
  const metaY = 160
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '600 17px "JetBrains Mono", monospace'
  baseCtx.textAlign = 'left'
  baseCtx.fillText('ISSUER: ATELIER KINETIC MONTREAL', pad + 32, metaY)
  baseCtx.textAlign = 'right'
  baseCtx.fillText('STOCK: 350GSM PRISMATIC LAMINATE', w - pad - 32, metaY)

  // Horizontal divider
  baseCtx.strokeStyle = tier.secondaryInkHex
  baseCtx.lineWidth = 1
  baseCtx.beginPath()
  baseCtx.moveTo(pad + 32, metaY + 22)
  baseCtx.lineTo(w - pad - 32, metaY + 22)
  baseCtx.stroke()

  // 3. Central Hero Guilloche & Prismatic Crest Emblem
  const emblemCx = w * 0.5
  const emblemCy = 445
  drawGuillochePrismEmblem(baseCtx, foilCtx, emblemCx, emblemCy, tier)

  // Corner holographic registration crosshairs around the emblem
  const corners = [
    [pad + 56, 224],
    [w - pad - 56, 224],
    [pad + 56, 660],
    [w - pad - 56, 660]
  ]
  corners.forEach(([cx, cy], idx) => {
    baseCtx.strokeStyle = tier.inkHex
    baseCtx.lineWidth = 1.8
    baseCtx.beginPath()
    baseCtx.arc(cx, cy, 14, 0, Math.PI * 2)
    baseCtx.moveTo(cx - 22, cy)
    baseCtx.lineTo(cx + 22, cy)
    baseCtx.moveTo(cx, cy - 22)
    baseCtx.lineTo(cx, cy + 22)
    baseCtx.stroke()

    foilCtx.strokeStyle = `rgb(250, 230, ${idx * 60})`
    foilCtx.lineWidth = 3.2
    baseCtx.beginPath()
    foilCtx.beginPath()
    foilCtx.arc(cx, cy, 14, 0, Math.PI * 2)
    foilCtx.moveTo(cx - 22, cy)
    foilCtx.lineTo(cx + 22, cy)
    foilCtx.moveTo(cx, cy - 22)
    foilCtx.lineTo(cx, cy + 22)
    foilCtx.stroke()
  })

  // 4. Main Editorial Event Title Block (Embossed Foil + High-Contrast Ink)
  const titleY = 742
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '600 18px "JetBrains Mono", monospace'
  baseCtx.textAlign = 'center'
  baseCtx.fillText('ANNUAL AUDIOVISUAL ARCHITECTURE & LIGHT SYMPOSIUM', w * 0.5, titleY - 38)

  baseCtx.fillStyle = tier.inkHex
  baseCtx.font = '800 68px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif'
  baseCtx.fillText('KINETIC LIGHTS', w * 0.5, titleY + 24)

  // Stamp main headline with high emboss (G=252) and partial foil sheen (R=72) so ink remains deep and razor-sharp!
  foilCtx.font = '800 68px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif'
  foilCtx.textAlign = 'center'
  foilCtx.fillStyle = 'rgb(72, 252, 140)'
  foilCtx.fillText('KINETIC LIGHTS', w * 0.5, titleY + 24)

  baseCtx.font = '600 34px "JetBrains Mono", monospace'
  baseCtx.fillStyle = tier.inkHex
  baseCtx.fillText('SYMPOSIUM · MONTREAL · QC', w * 0.5, titleY + 78)

  foilCtx.font = '600 34px "JetBrains Mono", monospace'
  foilCtx.fillStyle = 'rgb(64, 240, 195)'
  foilCtx.fillText('SYMPOSIUM · MONTREAL · QC', w * 0.5, titleY + 78)

  // 5. Structured Architectural Checkout Spec Grid (Venue / Date / Seat / Tier)
  const gridTop = 868
  const gridHeight = 250
  const gridLeft = pad + 36
  const gridWidth = w - (pad + 36) * 2

  baseCtx.strokeStyle = tier.inkHex
  baseCtx.lineWidth = 2
  baseCtx.strokeRect(gridLeft, gridTop, gridWidth, gridHeight)

  foilCtx.strokeStyle = 'rgb(220, 215, 110)'
  foilCtx.lineWidth = 3
  foilCtx.strokeRect(gridLeft, gridTop, gridWidth, gridHeight)

  // Horizontal & vertical internal dividers
  const midRowY = gridTop + 125
  const midColX = w * 0.5
  baseCtx.beginPath()
  baseCtx.moveTo(gridLeft, midRowY)
  baseCtx.lineTo(gridLeft + gridWidth, midRowY)
  baseCtx.moveTo(midColX, gridTop)
  baseCtx.lineTo(midColX, gridTop + gridHeight)
  baseCtx.stroke()

  // Cell 1 (Top-Left): VENUE & DOME
  baseCtx.textAlign = 'left'
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '600 16px "JetBrains Mono", monospace'
  baseCtx.fillText('01 // VENUE & SPACE', gridLeft + 24, gridTop + 34)
  baseCtx.fillStyle = tier.inkHex
  baseCtx.font = '700 28px "Plus Jakarta Sans", sans-serif'
  baseCtx.fillText('SATOSPHERE 360 DOME', gridLeft + 24, gridTop + 72)
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '500 17px "JetBrains Mono", monospace'
  baseCtx.fillText(seat.zone, gridLeft + 24, gridTop + 102)

  // Cell 2 (Top-Right): DATE & DOORS
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '600 16px "JetBrains Mono", monospace'
  baseCtx.fillText('02 // DATE & SESSION', midColX + 24, gridTop + 34)
  baseCtx.fillStyle = tier.inkHex
  baseCtx.font = '700 28px "Plus Jakarta Sans", sans-serif'
  baseCtx.fillText('NOV 14, 2026 · 20:00', midColX + 24, gridTop + 72)
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '500 17px "JetBrains Mono", monospace'
  baseCtx.fillText(seat.gate, midColX + 24, gridTop + 102)

  // Cell 3 (Bottom-Left): ASSIGNED SEAT (Embossed + Foil Sheen)
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '600 16px "JetBrains Mono", monospace'
  baseCtx.fillText('03 // SEAT ASSIGNMENT', gridLeft + 24, midRowY + 34)
  baseCtx.fillStyle = tier.inkHex
  baseCtx.font = '700 32px "JetBrains Mono", monospace'
  baseCtx.fillText(seat.label, gridLeft + 24, midRowY + 76)

  foilCtx.textAlign = 'left'
  foilCtx.font = '700 32px "JetBrains Mono", monospace'
  foilCtx.fillStyle = 'rgb(75, 250, 210)'
  foilCtx.fillText(seat.label, gridLeft + 24, midRowY + 76)

  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '500 16px "JetBrains Mono", monospace'
  baseCtx.fillText(tier.accessBadge, gridLeft + 24, midRowY + 104)

  // Cell 4 (Bottom-Right): FOIL TIER & VALUATION
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '600 16px "JetBrains Mono", monospace'
  baseCtx.fillText('04 // EDITION & TARIFF', midColX + 24, midRowY + 34)
  baseCtx.fillStyle = tier.inkHex
  baseCtx.font = '700 32px "JetBrains Mono", monospace'
  baseCtx.fillText(`${tier.price} · INCL`, midColX + 24, midRowY + 76)

  foilCtx.fillStyle = 'rgb(75, 250, 85)'
  foilCtx.fillText(`${tier.price} · INCL`, midColX + 24, midRowY + 76)

  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '500 16px "JetBrains Mono", monospace'
  baseCtx.fillText(`SERIAL ${tier.serialPrefix}-${seat.id}`, midColX + 24, midRowY + 104)

  // 6. Perforation Seam Callout Band (around y = 1253px)
  baseCtx.textAlign = 'center'
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '700 16px "JetBrains Mono", monospace'
  baseCtx.fillText(
    '▼  SLICE ACROSS PERFORATION SEAM OR PULL STUB DOWNWARD TO VALIDATE ADMISSION  ▼',
    w * 0.5,
    PERF_Y - 34
  )

  // Dashed micro-cut line along PERF_Y
  baseCtx.save()
  baseCtx.strokeStyle = tier.inkHex
  baseCtx.lineWidth = 2.2
  baseCtx.setLineDash([10, 12])
  baseCtx.beginPath()
  baseCtx.moveTo(40, PERF_Y)
  baseCtx.lineTo(w - 40, PERF_Y)
  baseCtx.stroke()
  baseCtx.restore()

  // Holographic foil strip bordering the perforation line
  foilCtx.fillStyle = 'rgb(240, 210, 180)'
  foilCtx.fillRect(pad + 14, PERF_Y - 16, w - (pad + 14) * 2, 6)
  foilCtx.fillRect(pad + 14, PERF_Y + 10, w - (pad + 14) * 2, 6)

  // 7. DETACHABLE LOWER BARCODE / QR STUB (y = PERF_Y + 24 .. h - 48)
  const stubTop = PERF_Y + 28
  const stubLeft = pad + 30
  const stubWidth = w - (pad + 30) * 2
  const stubHeight = h - stubTop - (pad + 20)

  baseCtx.strokeStyle = tier.secondaryInkHex
  baseCtx.lineWidth = 1.4
  baseCtx.strokeRect(stubLeft, stubTop, stubWidth, stubHeight)

  // Left side of stub: Procedural High-Contrast QR Matrix
  const qrSize = 240
  const qrX = stubLeft + 34
  const qrY = stubTop + 42

  baseCtx.fillStyle = '#FFFFFF'
  baseCtx.fillRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24)
  baseCtx.strokeStyle = tier.inkHex
  baseCtx.lineWidth = 2
  baseCtx.strokeRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24)

  const cells = 21
  const cellW = qrSize / cells
  const seedStr = `${tier.id}:${seat.id}:KLS2026`
  let hash = 2166136261
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  const isFinderSquare = (r: number, c: number, fr: number, fc: number): boolean => {
    const dr = r - fr
    const dc = c - fc
    if (dr < 0 || dr > 6 || dc < 0 || dc > 6) return false
    if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true
    if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true
    return false
  }

  const inFinderZone = (r: number, c: number): boolean => {
    return (r < 8 && c < 8) || (r < 8 && c >= cells - 8) || (r >= cells - 8 && c < 8)
  }

  baseCtx.fillStyle = '#111111'
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      let filled = false
      if (inFinderZone(r, c)) {
        filled =
          isFinderSquare(r, c, 0, 0) ||
          isFinderSquare(r, c, 0, cells - 7) ||
          isFinderSquare(r, c, cells - 7, 0)
      } else {
        const bit = Math.sin((r * 31 + c * 17 + (hash & 0xffff)) * 12.9898) * 43758.5453
        filled = Math.abs(bit - Math.floor(bit)) > 0.46
      }
      if (filled) {
        baseCtx.fillRect(qrX + c * cellW, qrY + r * cellW, Math.ceil(cellW), Math.ceil(cellW))
      }
    }
  }

  // Right side of stub: 1D Barcode + Stub Metadata + Holographic Security Seal
  const rightX = qrX + qrSize + 48
  const rightW = stubLeft + stubWidth - rightX - 34

  baseCtx.textAlign = 'left'
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '700 16px "JetBrains Mono", monospace'
  baseCtx.fillText('DETACHABLE GATE STUB // ADMIT ONE', rightX, qrY + 12)

  baseCtx.fillStyle = tier.inkHex
  baseCtx.font = '700 32px "Plus Jakarta Sans", sans-serif'
  baseCtx.fillText(seat.label, rightX, qrY + 54)

  foilCtx.textAlign = 'left'
  foilCtx.font = '700 32px "Plus Jakarta Sans", sans-serif'
  foilCtx.fillStyle = 'rgb(70, 250, 160)'
  foilCtx.fillText(seat.label, rightX, qrY + 54)

  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '600 18px "JetBrains Mono", monospace'
  baseCtx.fillText(`${tier.code} · ${tier.price}`, rightX, qrY + 86)

  // Procedural 1D Vertical Barcode Bars (both ink and holographic foil shimmer)
  const barTop = qrY + 112
  const barHeight = 96
  let curX = rightX
  let barIdx = 0
  while (curX < rightX + rightW - 8) {
    const bw = ((barIdx * 7 + (hash & 15)) % 4) * 2 + 2
    const gap = ((barIdx * 13) % 3) * 2 + 2
    baseCtx.fillStyle = tier.inkHex
    baseCtx.fillRect(curX, barTop, bw, barHeight)

    if (barIdx % 2 === 0) {
      foilCtx.fillStyle = `rgb(185, 220, ${(barIdx * 19) % 255})`
      foilCtx.fillRect(curX, barTop, bw, barHeight)
    }
    curX += bw + gap
    barIdx++
  }

  // Bottom cryptographic serial line under barcode
  const serialText = `AUTH ${tier.serialPrefix}-${seat.id}-8942-MTL // SHA256 VERIFIED`
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '600 15px "JetBrains Mono", monospace'
  baseCtx.fillText(serialText, rightX, barTop + barHeight + 28)

  // Bottom holographic security foil bar along base of stub
  const bottomBarY = stubTop + stubHeight - 44
  baseCtx.fillStyle = tier.inkHex
  baseCtx.fillRect(stubLeft + 24, bottomBarY, stubWidth - 48, 24)
  foilCtx.fillStyle = 'rgb(235, 235, 200)'
  foilCtx.fillRect(stubLeft + 24, bottomBarY, stubWidth - 48, 24)

  baseCtx.fillStyle = tier.paperHex
  baseCtx.font = '700 13px "JetBrains Mono", monospace'
  baseCtx.textAlign = 'center'
  baseCtx.fillText(
    'HOLOGRAPHIC SECURITY FOIL · VOID IF DETACHED PRIOR TO GATE SCAN',
    w * 0.5,
    bottomBarY + 13
  )

  foilCtx.fillStyle = 'rgb(0, 250, 0)'
  foilCtx.font = '700 13px "JetBrains Mono", monospace'
  foilCtx.textAlign = 'center'
  foilCtx.fillText(
    'HOLOGRAPHIC SECURITY FOIL · VOID IF DETACHED PRIOR TO GATE SCAN',
    w * 0.5,
    bottomBarY + 13
  )

  baseCtx.restore()

  // 8. Punch out transparent perforation holes & side notches on Base Canvas
  punchPerforationCutouts(baseCtx, w, isDark)
}

function drawBackTicket(
  baseCtx: CanvasRenderingContext2D,
  foilCtx: CanvasRenderingContext2D,
  tier: TierSpec,
  seat: SeatOption
): void {
  const w = TEX_W
  const h = TEX_H
  const isDark = tier.id !== 'silver'

  foilCtx.fillStyle = 'rgb(0, 128, 0)'
  foilCtx.fillRect(0, 0, w, h)

  baseCtx.clearRect(0, 0, w, h)
  baseCtx.save()
  drawRoundedTicketPath(baseCtx, w, h, 48)
  baseCtx.clip()

  baseCtx.fillStyle = tier.paperHex
  baseCtx.fillRect(0, 0, w, h)
  drawPaperGrain(baseCtx, w, h, isDark)

  const pad = 34
  baseCtx.strokeStyle = tier.inkHex
  baseCtx.lineWidth = 2.5
  baseCtx.strokeRect(pad, pad, w - pad * 2, h - pad * 2)

  foilCtx.strokeStyle = 'rgb(235, 220, 90)'
  foilCtx.lineWidth = 4
  foilCtx.strokeRect(pad, pad, w - pad * 2, h - pad * 2)

  // Back Header
  baseCtx.fillStyle = tier.secondaryInkHex
  baseCtx.font = '700 19px "JetBrains Mono", monospace'
  baseCtx.textAlign = 'center'
  baseCtx.fillText('REVERSE FACE // ACOUSTIC DOME TOPOLOGY & CRYPTOGRAPHIC SEAL', w * 0.5, 96)

  // Satosphere 360° Acoustic Dome Architectural Radar Diagram
  const cx = w * 0.5
  const cy = 470
  const radii = [80, 145, 210, 275]
  radii.forEach((r, idx) => {
    baseCtx.beginPath()
    baseCtx.arc(cx, cy, r, 0, Math.PI * 2)
    baseCtx.strokeStyle = idx === 2 ? tier.inkHex : tier.secondaryInkHex
    baseCtx.lineWidth = idx === 2 ? 2.6 : 1.4
    baseCtx.stroke()

    foilCtx.beginPath()
    foilCtx.arc(cx, cy, r, 0, Math.PI * 2)
    foilCtx.strokeStyle = `rgb(245, 225, ${60 + idx * 45})`
    foilCtx.lineWidth = idx === 2 ? 4.5 : 2.2
    foilCtx.stroke()
  })

  // Radial speaker array axes
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2
    const x1 = cx + Math.cos(ang) * 295
    const y1 = cy + Math.sin(ang) * 295
    baseCtx.beginPath()
    baseCtx.moveTo(cx, cy)
    baseCtx.lineTo(x1, y1)
    baseCtx.strokeStyle = tier.secondaryInkHex
    baseCtx.lineWidth = 1
    baseCtx.stroke()
  }

  // Highlight active acoustic seat zone arc in bright holographic foil
  baseCtx.beginPath()
  baseCtx.arc(cx, cy, 178, -Math.PI * 0.75, -Math.PI * 0.25)
  baseCtx.lineWidth = 26
  baseCtx.strokeStyle = tier.inkHex
  baseCtx.stroke()

  foilCtx.beginPath()
  foilCtx.arc(cx, cy, 178, -Math.PI * 0.75, -Math.PI * 0.25)
  foilCtx.lineWidth = 30
  foilCtx.strokeStyle = 'rgb(255, 250, 180)'
  foilCtx.stroke()

  baseCtx.fillStyle = tier.inkHex
  baseCtx.font = '700 22px "JetBrains Mono", monospace'
  baseCtx.fillText(`ACTIVE ZONE: ${seat.zone}`, cx, cy + 335)

  // Back Credentials Spec Block
  const specY = 890
  baseCtx.strokeStyle = tier.secondaryInkHex
  baseCtx.lineWidth = 1.5
  baseCtx.strokeRect(pad + 44, specY, w - (pad + 44) * 2, 260)

  const lines = [
    `HOLDER ZONE       : ${seat.label} (${seat.gate})`,
    `EDITION SPEC      : ${tier.code}`,
    `LAMINATE WEIGHT   : 350 GSM BI-AXIAL FOIL COMPOSITE`,
    `OPTICAL GRATING   : 1,400 LINES/MM DICHROIC DIFFRACTION`,
    `VERIFICATION      : TEAR PERFORATED STUB AT GATE ENTRY`
  ]
  baseCtx.textAlign = 'left'
  baseCtx.font = '600 20px "JetBrains Mono", monospace'
  lines.forEach((line, idx) => {
    baseCtx.fillStyle = idx === 0 || idx === 4 ? tier.inkHex : tier.secondaryInkHex
    baseCtx.fillText(line, pad + 78, specY + 48 + idx * 42)
    if (idx === 0 || idx === 4) {
      foilCtx.textAlign = 'left'
      foilCtx.font = '600 20px "JetBrains Mono", monospace'
      foilCtx.fillStyle = `rgb(235, 220, ${100 + idx * 30})`
      foilCtx.fillText(line, pad + 78, specY + 48 + idx * 42)
    }
  })

  // Perforation seam line on back
  baseCtx.save()
  baseCtx.strokeStyle = tier.inkHex
  baseCtx.lineWidth = 2.2
  baseCtx.setLineDash([10, 12])
  baseCtx.beginPath()
  baseCtx.moveTo(40, PERF_Y)
  baseCtx.lineTo(w - 40, PERF_Y)
  baseCtx.stroke()
  baseCtx.restore()

  // Back Stub Seal
  const stubCy = PERF_Y + 230
  baseCtx.beginPath()
  baseCtx.arc(cx, stubCy, 110, 0, Math.PI * 2)
  baseCtx.strokeStyle = tier.inkHex
  baseCtx.lineWidth = 3
  baseCtx.stroke()

  foilCtx.beginPath()
  foilCtx.arc(cx, stubCy, 110, 0, Math.PI * 2)
  foilCtx.fillStyle = 'rgb(250, 235, 145)'
  foilCtx.fill()

  baseCtx.fillStyle = tier.inkHex
  baseCtx.textAlign = 'center'
  baseCtx.font = '700 24px "JetBrains Mono", monospace'
  baseCtx.fillText('AUTHENTICATED', cx, stubCy - 14)
  baseCtx.font = '600 18px "JetBrains Mono", monospace'
  baseCtx.fillText(`${tier.serialPrefix} // ${seat.id}`, cx, stubCy + 18)

  baseCtx.restore()
  punchPerforationCutouts(baseCtx, w)
}

export class TicketTextureGenerator {
  private frontCanvas: HTMLCanvasElement
  private frontFoilCanvas: HTMLCanvasElement
  private backCanvas: HTMLCanvasElement
  private backFoilCanvas: HTMLCanvasElement

  public readonly textures: GeneratedTicketTextures

  constructor(initialTier: TierSpec, initialSeat: SeatOption) {
    this.frontCanvas = document.createElement('canvas')
    this.frontCanvas.width = TEX_W
    this.frontCanvas.height = TEX_H

    this.frontFoilCanvas = document.createElement('canvas')
    this.frontFoilCanvas.width = TEX_W
    this.frontFoilCanvas.height = TEX_H

    this.backCanvas = document.createElement('canvas')
    this.backCanvas.width = TEX_W
    this.backCanvas.height = TEX_H

    this.backFoilCanvas = document.createElement('canvas')
    this.backFoilCanvas.width = TEX_W
    this.backFoilCanvas.height = TEX_H

    const frontMap = new THREE.CanvasTexture(this.frontCanvas)
    const frontFoilMap = new THREE.CanvasTexture(this.frontFoilCanvas)
    const backMap = new THREE.CanvasTexture(this.backCanvas)
    const backFoilMap = new THREE.CanvasTexture(this.backFoilCanvas)

    ;[frontMap, frontFoilMap, backMap, backFoilMap].forEach((tex) => {
      tex.anisotropy = 8
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
    })

    this.textures = { frontMap, frontFoilMap, backMap, backFoilMap }
    this.updateTicket(initialTier, initialSeat)
  }

  public updateTicket(tier: TierSpec, seat: SeatOption): void {
    const fCtx = this.frontCanvas.getContext('2d')!
    const ffCtx = this.frontFoilCanvas.getContext('2d')!
    const bCtx = this.backCanvas.getContext('2d')!
    const bfCtx = this.backFoilCanvas.getContext('2d')!

    drawFrontTicket(fCtx, ffCtx, tier, seat)
    drawBackTicket(bCtx, bfCtx, tier, seat)

    this.textures.frontMap.needsUpdate = true
    this.textures.frontFoilMap.needsUpdate = true
    this.textures.backMap.needsUpdate = true
    this.textures.backFoilMap.needsUpdate = true
  }
}
