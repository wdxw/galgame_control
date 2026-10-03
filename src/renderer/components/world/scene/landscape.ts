import type { PlacedObject, WorldBlueprint } from '../../../../shared/types'
import { catalogModel } from '../../../../shared/worldCatalog'

const smooth = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/** One surface for drawing, walking, foundations and the placement cursor.
 * The arrival walk and plaza stay level; the rear garden climbs two terraces.
 * Building pads follow the saved layout, including the player's own buildings.
 */
export function landscapeFor(blueprint: WorldBlueprint, edits: PlacedObject[] = []): (x: number, z: number) => number {
  const radius = blueprint.radius
  const raw = (x: number, z: number): number => {
    const rear = smooth(radius * 0.35, radius * 0.54, -z) * 1.05
      + smooth(radius * 0.66, radius * 0.82, -z) * 0.85
    const clearing = smooth(3.9, 5.1, Math.hypot(x, z))
    return rear * clearing
  }
  const pads = [...blueprint.placements, ...edits].flatMap(item => {
    const model = catalogModel(item.modelId)
    if (!model || (model.category === 'plant' && item.modelId !== 'vegetable_patch')
      || Math.max(model.block.w, model.block.d) < 0.8) return []
    const scale = 'scale' in item ? item.scale ?? 1 : 1
    const w = model.block.w * scale * 0.8 + 0.35
    const d = model.block.d * scale * 0.8 + 0.35
    return [{ x: item.x, z: item.z, rot: item.rot, w, d, y: raw(item.x, item.z) }]
  })
  return (x, z) => {
    const base = raw(x, z)
    let weight = 0, level = base
    for (const pad of pads) {
      const dx = x - pad.x, dz = z - pad.z
      const localX = dx * Math.cos(pad.rot) - dz * Math.sin(pad.rot)
      const localZ = dx * Math.sin(pad.rot) + dz * Math.cos(pad.rot)
      const edge = Math.max(Math.abs(localX) - pad.w, Math.abs(localZ) - pad.d)
      const influence = 1 - smooth(0, 0.8, edge)
      if (influence > weight) { weight = influence; level = pad.y }
    }
    return base + (level - base) * weight
  }
}
