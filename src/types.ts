export type TierEditionId = 'silver' | 'gold' | 'ultraviolet'

export interface TierSpec {
  id: TierEditionId
  code: string
  name: string
  subtitle: string
  price: string
  accessBadge: string
  defaultSeat: string
  serialPrefix: string
  paperHex: string
  inkHex: string
  accentHex: string
  secondaryInkHex: string
  foilMode: number
  swatchGradient: string
}

export interface SeatOption {
  id: string
  label: string
  zone: string
  gate: string
}

export interface PhysicsMetrics {
  activeSprings: number
  totalSprings: number
  intactSeamCount: number
  totalSeamCount: number
  seamIntegrityPct: number
  maxFiberStrain: number
  isDetached: boolean
}
