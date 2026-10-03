import type { WorldQuality } from '../../../../shared/types'

export interface QualitySettings {
  /** Shadow map resolution; 0 disables real shadows entirely. */
  shadowMapSize: number
  softShadows: boolean
  ambientOcclusion: boolean
  bloom: boolean
  /** Vertex-displaced water surface. */
  waterWaves: boolean
  /** Multiplier applied to scattered vegetation and grass. */
  vegetation: number
  particles: number
  pixelRatio: number
  /** Distance at which the far scenery stops being drawn. */
  fogDensity: number
}

const TIERS: Record<WorldQuality, QualitySettings> = {
  high: {
    shadowMapSize: 2048, softShadows: true, ambientOcclusion: true, bloom: true,
    waterWaves: true, vegetation: 1, particles: 1, pixelRatio: 1.75, fogDensity: 0.0075
  },
  medium: {
    shadowMapSize: 1024, softShadows: true, ambientOcclusion: false, bloom: true,
    waterWaves: true, vegetation: 0.7, particles: 0.7, pixelRatio: 1.35, fogDensity: 0.0085
  },
  low: {
    shadowMapSize: 0, softShadows: false, ambientOcclusion: false, bloom: false,
    waterWaves: false, vegetation: 0.45, particles: 0.4, pixelRatio: 1, fogDensity: 0.011
  }
}

export function qualityFor(quality: WorldQuality | undefined): QualitySettings {
  return TIERS[quality || 'high'] || TIERS.high
}
