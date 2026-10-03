// Deterministic scene layout. The same seed and element list always produce the
// same island, so a saved player layout stays valid across restarts.

import type { BlueprintPlacement, WorldBlueprint, WorldElement } from './types'
import { catalogModel } from './worldCatalog'
import { PALETTES, type Biome } from './worldRules'
import { randomFor, seedFor } from './worldSeed'

export const BLUEPRINT_VERSION = 2

interface Slot { x: number; z: number; r: number; a: number }

interface BuildInput {
  kind: 'hub' | 'work'
  biome: Biome
  seed: number
  elements: WorldElement[]
  launchElementId: string | null
  version?: number
}

/** Rings ordered outside-in; buildings claim the outer rings so the plaza stays open. */
function slotRing(radius: number, ring: number, spacing: number, random: () => number, jitter: number): Slot[] {
  const count = Math.max(4, Math.round((Math.PI * 2 * ring) / spacing))
  const slots: Slot[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (random() - 0.5) * jitter
    const r = ring + (random() - 0.5) * jitter * 2
    slots.push({ a, r, x: Math.sin(a) * r, z: Math.cos(a) * r })
  }
  return slots
}

/** Keeps the arrival corridor, the plaza and the star dock free of scenery. */
function reserved(kind: 'hub' | 'work', radius: number, x: number, z: number): boolean {
  if (Math.hypot(x, z) < 3.6) return true
  if (Math.abs(x) < 2.3 && z > 1.6 && z < radius + 1) return true
  if (kind === 'hub' && Math.abs(x) < 3.4 && z > radius - 5.4) return true
  return false
}

/** Anything already on the island: generated placements or the player's own. */
interface Occupant {
  modelId: string
  x: number
  z: number
  block?: { w: number; d: number }
}

function halfOf(item: Occupant): { w: number; d: number } {
  if (item.block) return item.block
  return catalogModel(item.modelId)?.block || { w: 0.6, d: 0.6 }
}

function fits(placed: Occupant[], x: number, z: number, w: number, d: number): boolean {
  return !placed.some(item => {
    const half = halfOf(item)
    return Math.abs(x - item.x) < w + half.w + 0.7 && Math.abs(z - item.z) < d + half.d + 0.7
  })
}

export function buildBlueprint(input: BuildInput): WorldBlueprint {
  const kind = input.kind
  const palette = PALETTES[input.biome] || PALETTES.garden
  const radius = kind === 'hub' ? 15 : 13.5
  const random = randomFor(input.seed >>> 0)
  const placements: BlueprintPlacement[] = []
  const spawn = { x: 0, z: kind === 'hub' ? 8.2 : 7.4 }

  // Ordered largest-first so wide models claim the outer rings.
  const ordered = [...input.elements].sort((a, b) => {
    const left = catalogModel(a.id), right = catalogModel(b.id)
    const area = (model: ReturnType<typeof catalogModel>) => model ? model.block.w * model.block.d : 0.5
    return area(right) - area(left)
  })

  const ringPlan = kind === 'hub'
    ? [{ r: 11.4, spacing: 4.6 }, { r: 9.2, spacing: 3.8 }, { r: 7.4, spacing: 3.0 }, { r: 5.8, spacing: 2.6 }, { r: 4.6, spacing: 2.4 }]
    : [{ r: 10.4, spacing: 4.4 }, { r: 8.6, spacing: 3.6 }, { r: 7.0, spacing: 2.9 }, { r: 5.6, spacing: 2.5 }, { r: 4.5, spacing: 2.3 }]
  const slots: Slot[] = []
  ringPlan.forEach((ring, index) => slots.push(...slotRing(radius, ring.r, ring.spacing, random, 0.22 + index * 0.05)))

  // A compact launch object gets a guaranteed spot beside the arrival walk,
  // angled towards the plaza so the player meets it on the way in. Bulky ones
  // take a normal ring slot instead and stay the entrance from there.
  const launchModel = input.launchElementId ? catalogModel(input.launchElementId) : null
  const launchCompact = !!launchModel && Math.max(launchModel.block.w, launchModel.block.d) <= 2.4
  const launchPlaced = launchCompact
  if (launchModel && input.launchElementId && launchCompact) {
    const a = 1.02
    const r = 3.9
    placements.push({
      modelId: launchModel.id,
      x: Math.sin(a) * r,
      z: Math.cos(a) * r,
      rot: a + Math.PI,
      scale: 1,
      label: launchModel.name,
      launchable: true,
      block: launchModel.block
    })
  }

  for (const element of ordered) {
    const model = catalogModel(element.id)
    if (!model) continue
    if (launchPlaced && element.id === input.launchElementId) continue
    const preferred = model.ring ?? 6
    const candidate = slots
      .filter(slot => !reserved(kind, radius, slot.x, slot.z))
      .filter(slot => Math.hypot(slot.x, slot.z) + Math.max(model.block.w, model.block.d) / 2 < radius - 1.2)
      .filter(slot => fits(placements, slot.x, slot.z, model.block.w / 2, model.block.d / 2))
      .sort((a, b) => Math.abs(a.r - preferred) - Math.abs(b.r - preferred))[0]
    if (!candidate) continue
    slots.splice(slots.indexOf(candidate), 1)
    placements.push({
      modelId: model.id,
      x: Math.round(candidate.x * 100) / 100,
      z: Math.round(candidate.z * 100) / 100,
      rot: kind === 'work' && candidate.z < 0 ? 0 : candidate.a + Math.PI,
      scale: 1,
      launchable: model.interactive || element.id === input.launchElementId,
      block: model.block
    })
  }

  // Vegetation fills the leftover slots so no island reads as a bare disc.
  const vegetation = kind === 'hub'
    ? ['tree', 'tree', 'bush', 'flower_patch', 'sakura_tree', 'tree', 'bush', 'flower_bed', 'tree', 'bush']
    : ['tree', 'bush', 'flower_patch', 'tree', 'bush', 'tree', 'flower_patch', 'bush', 'tree', 'flower_patch']
  let index = 0
  for (const slot of slots) {
    if (reserved(kind, radius, slot.x, slot.z)) continue
    const modelId = vegetation[index++ % vegetation.length]
    const model = catalogModel(modelId)
    if (!model) continue
    if (!fits(placements, slot.x, slot.z, model.block.w / 2, model.block.d / 2)) continue
    if (Math.hypot(slot.x, slot.z) > radius - 1.6) continue
    placements.push({
      modelId,
      x: Math.round(slot.x * 100) / 100,
      z: Math.round(slot.z * 100) / 100,
      rot: random() * Math.PI * 2,
      scale: 0.85 + random() * 0.4,
      block: model.block
    })
  }

  return {
    kind,
    biome: input.biome,
    version: input.version ?? BLUEPRINT_VERSION,
    seed: input.seed >>> 0,
    spawn,
    radius,
    ground: {
      color: palette.ground,
      stone: palette.stone,
      water: palette.water,
      foliage: palette.foliage,
      accent: palette.accent,
      sky: palette.sky,
      night: palette.night
    },
    placements,
    defaultLaunchElementId: input.launchElementId
  }
}

/**
 * Finds a free spot for an element the player added by hand, following the same
 * ring and spacing rules as the generated layout so the island stays tidy.
 */
export function freeSlotFor(blueprint: WorldBlueprint, taken: Occupant[], modelId: string): { x: number; z: number; rot: number } | null {
  const model = catalogModel(modelId)
  if (!model) return null
  const existing = [...blueprint.placements, ...taken]
  const random = randomFor(seedFor(`${blueprint.seed}:${modelId}:${existing.length}`))
  const rings = blueprint.kind === 'hub'
    ? [11.4, 9.2, 7.4, 5.8, 4.6]
    : [10.4, 8.6, 7.0, 5.6, 4.5]
  const preferred = model.ring ?? 6
  const ordered = [...rings].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))
  for (const ring of ordered) {
    const slots = slotRing(blueprint.radius, ring, 2.4, random, 0.4)
    for (const slot of slots) {
      if (reserved(blueprint.kind, blueprint.radius, slot.x, slot.z)) continue
      if (Math.hypot(slot.x, slot.z) + Math.max(model.block.w, model.block.d) / 2 > blueprint.radius - 1.2) continue
      if (!fits(existing, slot.x, slot.z, model.block.w / 2, model.block.d / 2)) continue
      return {
        x: Math.round(slot.x * 100) / 100,
        z: Math.round(slot.z * 100) / 100,
        rot: slot.a + Math.PI
      }
    }
  }
  return null
}

const HUB_ELEMENTS: WorldElement[] = [
  { id: 'cottage', name: '小屋', nameEn: 'Cottage', category: 'building', reason: '岛上的生活区' },
  { id: 'cottage', name: '小屋', nameEn: 'Cottage', category: 'building', reason: '岛上的生活区' },
  { id: 'cottage', name: '小屋', nameEn: 'Cottage', category: 'building', reason: '岛上的生活区' },
  { id: 'greenhouse', name: '温室', nameEn: 'Greenhouse', category: 'building', reason: '岛上的种植温室' },
  { id: 'vegetable_patch', name: '蔬果菜圃', nameEn: 'Vegetable patch', category: 'plant', reason: '生活区的蔬果菜圃' },
  { id: 'picnic_set', name: '庭院茶桌', nameEn: 'Garden tea table', category: 'prop', reason: '花园里的下午茶' },
  { id: 'market_stall', name: '摊位', nameEn: 'Market stall', category: 'prop', reason: '广场旁的小集市' },
  { id: 'well', name: '水井', nameEn: 'Well', category: 'prop', reason: '广场中央的喷泉' },
  { id: 'bench', name: '长椅', nameEn: 'Bench', category: 'prop', reason: '散步道旁的长椅' },
  { id: 'bench', name: '长椅', nameEn: 'Bench', category: 'prop', reason: '散步道旁的长椅' },
  { id: 'lantern', name: '路灯', nameEn: 'Lantern', category: 'prop', reason: '夜间照明' },
  { id: 'globe_monument', name: '地球仪', nameEn: 'Globe', category: 'landmark', reason: '码头旁的星图仪' }
]

export function hubBlueprint(seed = seedFor('gal-library-hub')): WorldBlueprint {
  return buildBlueprint({ kind: 'hub', biome: 'hub', seed, elements: HUB_ELEMENTS, launchElementId: null })
}
