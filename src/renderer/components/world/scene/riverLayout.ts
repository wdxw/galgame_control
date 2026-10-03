import type { PlacedObject, WorldBlueprint } from '../../../../shared/types'
import { catalogModel } from '../../../../shared/worldCatalog'

export interface RiverPoint { x: number; z: number; y: number; width: number; distance: number }
export interface RiverSample { distance: number; y: number; width: number }
export interface RiverBridge { x: number; z: number; nx: number; nz: number; length: number }
export interface RiverLayout {
  points: RiverPoint[]
  bridges: RiverBridge[]
  sample(x: number, z: number): RiverSample
  groundAt(x: number, z: number): number
  bridgeAt(x: number, z: number): number | null
  contains(x: number, z: number, margin?: number): boolean
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A deterministic stream that finds room beside the existing village. Saved
 * furniture participates in routing, so upgrading an old island preserves it. */
export function riverLayout(blueprint: WorldBlueprint, edits: PlacedObject[], land: (x: number, z: number) => number): RiverLayout {
  const r = blueprint.radius, rows = 81, cols = 37
  const startZ = -r * 0.70, stepZ = r * 1.54 / (rows - 1)
  const obstacles = [...blueprint.placements, ...edits].map(item => {
    const model = catalogModel(item.modelId)
    const plant = model?.category === 'plant' && item.modelId !== 'vegetable_patch'
    const scale = 'scale' in item ? item.scale ?? 1 : 1
    return { x: item.x, z: item.z, rot: item.rot, plant,
      w: (model?.block.w ?? 0.6) * scale * (plant ? 0.5 : 0.98) + 0.18,
      d: (model?.block.d ?? 0.6) * scale * (plant ? 0.5 : 0.98) + 0.18 }
  })
  const clearance = (x: number, z: number): number => {
    let nearest = 10
    for (const item of obstacles) {
      const dx = x - item.x, dz = z - item.z, c = Math.cos(item.rot), s = Math.sin(item.rot)
      const ox = Math.abs(dx * c - dz * s) - item.w, oz = Math.abs(dx * s + dz * c) - item.d
      const d = ox < 0 && oz < 0 ? Math.max(ox, oz) : Math.hypot(Math.max(0, ox), Math.max(0, oz))
      nearest = Math.min(nearest, d)
    }
    return nearest
  }
  const route = (side: number): { xs: number[]; cost: number } => {
    const parents = new Int16Array(rows * cols).fill(-1)
    let previous = new Float64Array(cols).fill(0)
    const xAt = (col: number): number => side * r * (0.32 + col / (cols - 1) * 0.57)
    for (let row = 0; row < rows; row++) {
      const z = startZ + row * stepZ
      const target = side * r * (0.54 + Math.sin(row / (rows - 1) * Math.PI * 2.6 + 0.7) * 0.10)
      const next = new Float64Array(cols).fill(Infinity)
      for (let col = 0; col < cols; col++) {
        const x = xAt(col), distance = clearance(x, z)
        const outside = Math.max(0, Math.hypot(x, z) - r + (row < 10 ? 1.7 : 0.5))
        const obstacleCost = Math.pow(Math.max(0, 1.3 - distance), 2) * 75
        const coastCost = row < rows - 7 ? outside * outside * 200 : Math.pow(Math.hypot(x, z) - r - 0.25, 2) * (row / rows) * 3
        const cost = obstacleCost + coastCost + Math.pow(x - target, 2) * 0.5
        for (let from = Math.max(0, col - 2); from <= Math.min(cols - 1, col + 2); from++) {
          const total = previous[from] + cost + Math.pow(col - from, 2) * 2.4
          if (total < next[col]) { next[col] = total; parents[row * cols + col] = from }
        }
      }
      previous = next
    }
    let end = 0
    for (let i = 1; i < cols; i++) if (previous[i] < previous[end]) end = i
    const cost = previous[end], xs = new Array<number>(rows)
    for (let row = rows - 1; row >= 0; row--) { xs[row] = xAt(end); end = parents[row * cols + end] }
    for (let pass = 0; pass < 2; pass++) {
      const old = [...xs]
      for (let i = 1; i < rows - 1; i++) xs[i] = (old[i - 1] + old[i] * 2 + old[i + 1]) / 4
    }
    return { xs, cost }
  }
  const left = route(-1), right = route(1)
  const xs = left.cost < right.cost ? left.xs : right.xs
  const points: RiverPoint[] = []
  let distance = 0
  for (let i = 0; i < rows; i++) {
    const x = xs[i], z = startZ + i * stepZ
    if (i) distance += Math.hypot(x - xs[i - 1], stepZ)
    const width = Math.max(0.38, Math.min(1.08 + Math.sin(i * 0.14) * 0.16, clearance(x, z) - 0.14))
    // A small spring at the head and a wider mouth give the stream a silhouette.
    const head = i < 9 ? 1 + (1 - i / 9) * 0.3 : 1
    const bankLevel = land(x, z) - 0.09
    const outlet = i > rows * 0.7 ? smooth(r - 0.2, r + 0.45, Math.hypot(x, z)) : 0
    const level = bankLevel + (-0.405 - bankLevel) * outlet
    points.push({ x, z, y: i ? Math.min(points[i - 1].y, level) : level, width: width * head, distance })
  }
  const sample = (x: number, z: number): RiverSample => {
    let distance = Infinity, y = 0, width = 1
    const row = Math.floor((z - startZ) / stepZ)
    for (let i = Math.max(0, Math.min(rows - 2, row - 8)); i <= Math.min(rows - 2, Math.max(0, row + 8)); i++) {
      const a = points[i], b = points[i + 1], dx = b.x - a.x, dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t)
      if (d < distance) { distance = d; y = a.y + (b.y - a.y) * t; width = a.width + (b.width - a.width) * t }
    }
    return { distance, y, width }
  }
  const bridges: RiverBridge[] = []
  for (const target of [-r * 0.49, r * 0.12]) {
    let best = 12, bestScore = Infinity
    for (let i = 9; i < rows - 9; i++) {
      const p = points[i], a = points[i - 1], b = points[i + 1]
      const l = Math.hypot(b.x - a.x, b.z - a.z), nx = (b.z - a.z) / l, nz = -(b.x - a.x) / l
      const length = p.width * 1.2 + 0.75
      const occupied = [-1, 0, 1].reduce((sum, t) => sum + Math.pow(Math.max(0, 0.85 - clearance(p.x + nx * length * t, p.z + nz * length * t)), 2) * 30, 0)
      const shore = [-1, 1].reduce((sum, side) => sum + Math.pow(Math.max(0,
        Math.hypot(p.x + nx * (length + 0.6) * side, p.z + nz * (length + 0.6) * side) - r + 0.8), 2) * 180, 0)
      const score = Math.pow(p.z - target, 2) + occupied + shore + Math.abs(land(p.x - nx * length, p.z - nz * length) - land(p.x + nx * length, p.z + nz * length)) * 10
      if (score < bestScore) { bestScore = score; best = i }
    }
    const p = points[best], a = points[best - 1], b = points[best + 1], length = Math.hypot(b.x - a.x, b.z - a.z)
    bridges.push({ x: p.x, z: p.z, nx: (b.z - a.z) / length, nz: -(b.x - a.x) / length, length: p.width * 1.2 + 0.75 })
  }
  const bridgeAt = (x: number, z: number): number | null => {
    for (const bridge of bridges) {
      const dx = x - bridge.x, dz = z - bridge.z, across = dx * bridge.nx + dz * bridge.nz
      const along = -dx * bridge.nz + dz * bridge.nx
      if (Math.abs(across) > bridge.length || Math.abs(along) > 0.86) continue
      const left = land(bridge.x - bridge.nx * bridge.length, bridge.z - bridge.nz * bridge.length)
      const right = land(bridge.x + bridge.nx * bridge.length, bridge.z + bridge.nz * bridge.length)
      const t = (across / bridge.length + 1) / 2
      const centre = sample(bridge.x, bridge.z).y
      const arch = Math.max(0.18, centre + 0.22 - (left + right) / 2)
      const deck = left + (right - left) * t + 0.07 + Math.sin(t * Math.PI) * arch
      const water = sample(x, z)
      return water.distance < water.width * 1.12 ? Math.max(deck, water.y + 0.14) : deck
    }
    return null
  }
  return {
    points, bridges, sample, bridgeAt,
    contains(x, z, margin = 0) { const p = sample(x, z); return p.distance < p.width * 1.12 + margin },
    groundAt(x, z) {
      const base = land(x, z), p = sample(x, z)
      const blend = 1 - smooth(p.width * 0.62, p.width + 0.55, p.distance)
      return base + (Math.min(base, p.y - 0.30) - base) * blend
    }
  }
}
