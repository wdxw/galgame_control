import * as THREE from 'three'
import type { PlacedObject, WorldBlueprint } from '../../../../shared/types'
import { catalogModel } from '../../../../shared/worldCatalog'
import { randomFor } from '../../../../shared/worldSeed'
import { Kit } from './modelKit'
import type { QualitySettings } from './quality'
import type { SceneResources } from './resources'
import { landscapeFor } from './landscape'
import { riverLayout } from './riverLayout'
import { createRiverScene } from './riverScene'
import { waterMaterial } from './water'

// The island itself: cliff, beach, plaza, arrival pad, stream, shoreline and the
// star dock. Placement slots never reach the outer rim, so the rim is where the
// scenery lives.

export interface Terrain {
  group: THREE.Group
  /** The same terraced surface used by models and the avatar. */
  heightAt(x: number, z: number): number
  /** True when the point is on the dock planks rather than the island. */
  onDock(x: number, z: number): boolean
  isWater(x: number, z: number): boolean
  waterArea(x: number, z: number, margin?: number): boolean
  update(time: number): void
  pick(raycaster: THREE.Raycaster, out: THREE.Vector3): THREE.Vector3 | null
}

const DOCK_Y = 0.26

interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

/** A curved strip of geometry following a path — used for the stream. */
function ribbon(points: { x: number; z: number }[], width: number, y: number | ((x: number, z: number) => number)): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  points.forEach((point, i) => {
    const previous = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const tx = next.x - previous.x
    const tz = next.z - previous.z
    const length = Math.hypot(tx, tz) || 1
    const nx = -tz / length
    const nz = tx / length
    for (const side of [1, -1]) {
      const x = point.x + nx * width / 2 * side, z = point.z + nz * width / 2 * side
      positions.push(x, typeof y === 'number' ? y : y(x, z), z)
    }
    uvs.push(0, i / points.length, 1, i / points.length)
    if (i < points.length - 1) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function islandSurface(radius: number, height: (x: number, z: number) => number, detail: number, lawn: number, soil: number): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = []
  const segments = detail > 50 ? 192 : 128, rings = detail
  const tint = new THREE.Color()
  for (let row = 0; row <= rings; row++) for (let col = 0; col <= segments; col++) {
    const angle = col / segments * Math.PI * 2
    const edge = radius + 0.35 + Math.sin(angle * 3 + 0.6) * 0.13 + Math.cos(angle * 5) * 0.1
    const r = row / rings * edge, x = Math.sin(angle) * r, z = Math.cos(angle) * r
    positions.push(x, height(x, z), z)
    uvs.push(0.5 + x / (radius * 2), 0.5 + z / (radius * 2))
    const patch = (Math.sin(x * 0.47 + Math.cos(z * 0.29)) + Math.cos(z * 0.51 - x * 0.17)) / 4 + 0.5
    const slope = Math.hypot(height(x + 0.12, z) - height(x - 0.12, z), height(x, z + 0.12) - height(x, z - 0.12)) / 0.24
    tint.set(lawn).lerp(new THREE.Color(0xbaca89), patch * 0.06)
    tint.lerp(new THREE.Color(soil), THREE.MathUtils.smoothstep(slope, 0.25, 0.72) * 0.88)
    colors.push(tint.r, tint.g, tint.b)
    if (row < rings && col < segments) {
      const a = row * (segments + 1) + col, b = a + segments + 1
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  return geometry
}

function meadowGeometry(flower: number | null): THREE.BufferGeometry {
  const vertices: number[] = [], colors: number[] = []
  const add = (color: number, ...points: number[][]): void => {
    const c = new THREE.Color(color)
    for (const p of points) { vertices.push(...p); colors.push(c.r, c.g, c.b) }
  }
  for (let i = 0; i < (flower ? 2 : 5); i++) {
    const a = i * 2.4, x = Math.sin(a) * 0.055, z = Math.cos(a) * 0.055, h = 0.14 + (i % 3) * 0.055
    add(0x79974d, [x - 0.025, 0, z], [x + 0.025, 0, z], [x + 0.025, h * 0.6, z + 0.025])
    add(0xa7c87e, [x - 0.025, 0, z], [x + 0.025, h * 0.6, z + 0.025], [x + 0.04, h, z + 0.065])
  }
  if (flower) {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5, cx = Math.sin(a) * 0.05, cz = Math.cos(a) * 0.05
      for (let j = 0; j < 6; j++) {
        const b = j * Math.PI / 3, n = (j + 1) * Math.PI / 3
        add(flower, [cx, 0.27, cz], [cx + Math.cos(b) * 0.047, 0.245, cz + Math.sin(b) * 0.047],
          [cx + Math.cos(n) * 0.047, 0.245, cz + Math.sin(n) * 0.047])
      }
    }
    for (let i = 0; i < 8; i++) add(0xeab64f, [0, 0.285, 0],
      [Math.sin(i * Math.PI / 4) * 0.038, 0.28, Math.cos(i * Math.PI / 4) * 0.038],
      [Math.sin((i + 1) * Math.PI / 4) * 0.038, 0.28, Math.cos((i + 1) * Math.PI / 4) * 0.038])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

function mix(a: number, b: number, amount: number): number {
  const color = new THREE.Color(a).lerp(new THREE.Color(b), amount)
  return color.getHex()
}

export function createTerrain(resources: SceneResources, blueprint: WorldBlueprint, quality: QualitySettings, edits: PlacedObject[] = []): Terrain {
  const group = new THREE.Group()
  const ground = blueprint.ground
  const radius = blueprint.radius
  const stone = ground.stone
  const random = randomFor((blueprint.seed ^ 0x9e3779b9) >>> 0)
  const sand = mix(ground.color, 0xf0e0b8, 0.6)
  const cliff = mix(stone, 0x6f6558, 0.45)
  const foliage = ground.foliage
  const landHeight = landscapeFor(blueprint, edits)
  const river = riverLayout(blueprint, edits, landHeight)
  const surfaceHeight = river.groundAt

  const dock: Rect = blueprint.kind === 'hub'
    ? { minX: -2.3, maxX: 2.3, minZ: radius - 5.4, maxZ: radius + 3.6 }
    : { minX: -1.8, maxX: 1.8, minZ: radius - 3.2, maxZ: radius + 2.4 }

  // --- island body -----------------------------------------------------------
  // The mouth cuts through the beach as well as the lawn, so a solid sand cap
  // cannot dam the river just before it reaches sea level.
  const beach = new THREE.Mesh(islandSurface(radius * 1.10, (x, z) => Math.min(-0.25, surfaceHeight(x, z)), 48, 0xf2dfb6, 0xf2dfb6),
    resources.material(0xffffff, { roughness: 0.95, surface: 'sand', repeat: 9, vertexColors: true }))
  beach.receiveShadow = true
  group.add(beach)

  const cliffMesh = new THREE.Mesh(resources.geometry('cylinder', radius * 0.99, radius * 0.7, 4.2, 72), resources.material(cliff, { roughness: 1 }))
  cliffMesh.position.y = -2.9
  cliffMesh.receiveShadow = true
  group.add(cliffMesh)

  const lawn = ground.night || blueprint.biome === 'coast' || blueprint.biome === 'winter'
    ? ground.color : mix(ground.color, 0x73c15a, 0.35)
  const top = new THREE.Mesh(islandSurface(radius, surfaceHeight, quality.vegetation < 0.6 ? 48 : 84, lawn,
    ground.night ? mix(stone, 0x807666, 0.22) : blueprint.biome === 'winter' ? 0xcdd7d9 : 0xdfb77d),
    resources.material(0xffffff, { roughness: 0.94, surface: blueprint.biome === 'coast' ? 'sand' : blueprint.biome === 'winter' ? 'snow' : 'grass', repeat: radius / 2.4, vertexColors: true }))
  top.receiveShadow = true
  group.add(top)

  // Soil strata follow the elevated rim rather than ending in a flat cylinder.
  const rimVertices: number[] = [], rimUvs: number[] = [], rimColors: number[] = [], rimIndices: number[] = []
  const strata = [0xe0b176, 0xeac58c, 0xd5ac70, lawn]
  for (let row = 0; row <= 4; row++) for (let col = 0; col <= 128; col++) {
    const a = col / 128 * Math.PI * 2, r = radius + 0.35 + Math.sin(a * 3 + 0.6) * 0.13 + Math.cos(a * 5) * 0.1
    const x = Math.sin(a) * r, z = Math.cos(a) * r, y = surfaceHeight(x, z)
    const t = [0, 0.25, 0.6, 0.96, 1][row]
    rimVertices.push(x, -0.36 + (y + 0.36) * t, z)
    rimUvs.push(col / 128 * 10, row / 4)
    const color = new THREE.Color(ground.night ? mix(stone, strata[Math.min(row, 3)], 0.2) : strata[Math.min(row, 3)])
    rimColors.push(color.r, color.g, color.b)
    if (row < 4 && col < 128) { const i = row * 129 + col; rimIndices.push(i, i + 1, i + 129, i + 1, i + 130, i + 129) }
  }
  const rimGeometry = new THREE.BufferGeometry()
  rimGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rimVertices, 3))
  rimGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(rimUvs, 2))
  rimGeometry.setAttribute('color', new THREE.Float32BufferAttribute(rimColors, 3))
  rimGeometry.setIndex(rimIndices); rimGeometry.computeVertexNormals()
  const rim = new THREE.Mesh(rimGeometry, resources.material(0xffffff, { vertexColors: true, roughness: 1, surface: 'plaster', side: THREE.DoubleSide }))
  rim.receiveShadow = true; group.add(rim)

  // --- plaza -----------------------------------------------------------------
  const plaza = new THREE.Mesh(resources.geometry('disc', 3.7, 48), resources.material(mix(stone, 0xf5e2c0, 0.24), { roughness: 0.9, surface: 'pavers', repeat: 4 }))
  plaza.rotation.x = -Math.PI / 2
  plaza.position.y = 0.03
  plaza.receiveShadow = true
  group.add(plaza)

  const medallion = new THREE.Mesh(resources.geometry('disc', 1.2, 40), resources.material(mix(stone, 0xffffff, 0.22), { roughness: 0.85 }))
  medallion.rotation.x = -Math.PI / 2
  medallion.position.y = 0.05
  medallion.receiveShadow = true
  group.add(medallion)
  // A flush compass mosaic decorates the walking plaza without obstructing it.
  const compassVertices: number[] = [], compassColors: number[] = []
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, color = new THREE.Color(i % 2 ? 0xe7d39c : mix(ground.water, stone, 0.5))
    const length = i % 2 ? 0.67 : 0.96
    for (const p of [[0, 0], [Math.sin(a - 0.17) * 0.35, Math.cos(a - 0.17) * 0.35], [Math.sin(a) * length, Math.cos(a) * length],
      [0, 0], [Math.sin(a) * length, Math.cos(a) * length], [Math.sin(a + 0.17) * 0.35, Math.cos(a + 0.17) * 0.35]]) {
      compassVertices.push(p[0], 0.057, p[1]); compassColors.push(color.r, color.g, color.b)
    }
  }
  const compassGeometry = new THREE.BufferGeometry()
  compassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(compassVertices, 3))
  compassGeometry.setAttribute('color', new THREE.Float32BufferAttribute(compassColors, 3)); compassGeometry.computeVertexNormals()
  const compass = new THREE.Mesh(compassGeometry, resources.material(0xffffff, { vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }))
  compass.receiveShadow = true; group.add(compass)

  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2
    const tile = new THREE.Mesh(
      resources.roundedBox(0.46, 0.07, 0.9, 0.04),
      resources.material(i % 2 ? mix(stone, 0xffffff, 0.14) : mix(stone, 0x000000, 0.08), { roughness: 0.92 })
    )
    tile.position.set(Math.sin(angle) * 3.35, 0.05, Math.cos(angle) * 3.35)
    tile.rotation.y = angle
    tile.receiveShadow = true
    group.add(tile)
  }

  const plazaRing = new THREE.Mesh(resources.geometry('torus', 3.7, 0.09, 8, 56), resources.material(mix(stone, 0xffffff, 0.3), { roughness: 0.85 }))
  plazaRing.rotation.x = Math.PI / 2
  plazaRing.position.y = 0.05
  group.add(plazaRing)

  // --- paths -----------------------------------------------------------------
  const pathMaterial = resources.material(mix(stone, 0xf5e2c0, 0.28), { roughness: 0.94, surface: 'pavers', repeat: 3 })
  const corridor = new THREE.Mesh(resources.roundedBox(2.5, 0.09, blueprint.spawn.z + 1.6, 0.08), pathMaterial)
  corridor.position.set(0, 0.045, (blueprint.spawn.z + 1.6) / 2 + 1.4)
  corridor.receiveShadow = true
  group.add(corridor)

  const branches: { x: number; z: number }[][] = []
  const walks: THREE.Mesh[] = [top, plaza, medallion, corridor]
  for (const item of blueprint.placements) {
    if (catalogModel(item.modelId)?.category !== 'building') continue
    const distance = Math.hypot(item.x, item.z), end = Math.max(3.9, distance - 1.2)
    const points = Array.from({ length: 18 }, (_, i) => {
      const t = i / 17, r = 3.65 + (end - 3.65) * t, bend = Math.sin(t * Math.PI) * 0.45
      return { x: item.x / distance * r + item.z / distance * bend, z: item.z / distance * r - item.x / distance * bend }
    })
    branches.push(points)
    const path = new THREE.Mesh(ribbon(points, 1.1, (x, z) => surfaceHeight(x, z) + 0.035),
      resources.material(mix(stone, 0xf3d8ab, 0.25), { roughness: 0.94, surface: 'pavers', repeat: 3, side: THREE.DoubleSide }))
    path.receiveShadow = true; group.add(path); walks.push(path)
  }
  const uplandPath = Array.from({ length: 42 }, (_, i) => ({ x: Math.sin(i / 41 * Math.PI) * 0.35, z: -3.7 - i / 41 * (radius - 4.5) }))
  branches.push(uplandPath)
  const uplandWalk = new THREE.Mesh(ribbon(uplandPath, 1.35, (x, z) => surfaceHeight(x, z) + 0.04),
    resources.material(mix(stone, 0xf2dec0, 0.3), { roughness: 0.94, surface: 'pavers', repeat: 5, side: THREE.DoubleSide }))
  uplandWalk.receiveShadow = true; group.add(uplandWalk); walks.push(uplandWalk)

  // --- arrival pad -----------------------------------------------------------
  const pad = new THREE.Mesh(resources.geometry('disc', 1.35, 40), resources.material(mix(stone, 0xffffff, 0.3), { roughness: 0.8 }))
  pad.rotation.x = -Math.PI / 2
  pad.position.set(0, 0.105, blueprint.spawn.z)
  pad.receiveShadow = true
  group.add(pad)
  walks.push(pad)

  const padRing = new THREE.Mesh(resources.geometry('torus', 1.35, 0.035, 8, 40), resources.material(mix(stone, 0xffffff, 0.5), { roughness: 0.85 }))
  padRing.rotation.x = Math.PI / 2
  padRing.position.set(0, 0.14, blueprint.spawn.z)
  padRing.castShadow = false
  group.add(padRing)

  // --- river and open water --------------------------------------------------
  const riverScene = createRiverScene(resources, river, landHeight, {
    biome: blueprint.biome, ground: ground.color, stone, water: ground.water,
    foliage, accent: ground.accent, sky: ground.sky, night: ground.night
  }, quality, radius)
  group.add(riverScene.group)
  walks.push(...riverScene.walks)

  const ocean = new THREE.Mesh(
    resources.geometry('plane', 700, 700, 64, 64),
    waterMaterial(resources, mix(ground.water, 0x347f9e, 0.24), 'ocean', quality.waterWaves)
  )
  ocean.rotation.x = -Math.PI / 2
  ocean.position.y = -0.42
  group.add(ocean)

  // --- shoreline rocks and rim hills ----------------------------------------
  const rockCount = Math.round(26 * quality.vegetation) + 8
  for (let i = 0; i < rockCount; i++) {
    const angle = random() * Math.PI * 2
    const r = radius * (0.99 + random() * 0.14)
    if (river.contains(Math.sin(angle) * r, Math.cos(angle) * r, 0.3)) continue
    const size = 0.3 + random() * 0.5
    const rockMesh = new THREE.Mesh(
      resources.geometry('ico', size, random() > 0.5 ? 1 : 0),
      resources.material(mix(stone, cliff, random() * 0.7), { roughness: 1, flatShading: true })
    )
    rockMesh.position.set(Math.sin(angle) * r, -0.24 + random() * 0.3, Math.cos(angle) * r)
    rockMesh.rotation.set(random() * 3, random() * 3, random() * 3)
    rockMesh.castShadow = true
    rockMesh.receiveShadow = true
    group.add(rockMesh)
  }

  // --- star dock -------------------------------------------------------------
  const kit = new Kit(resources, {
    biome: blueprint.biome, ground: ground.color, stone, water: ground.water, foliage: ground.foliage,
    accent: ground.accent, sky: ground.sky, night: ground.night
  })
  const deckWidth = blueprint.kind === 'hub' ? 4.6 : 3.6
  const deck = new THREE.Mesh(
    resources.roundedBox(deckWidth, DOCK_Y, dock.maxZ - dock.minZ, 0.1),
    resources.material(mix(ground.stone, 0xb08a5c, 0.55), { roughness: 0.9, surface: 'wood' })
  )
  deck.position.set(0, DOCK_Y / 2, (dock.minZ + dock.maxZ) / 2)
  deck.receiveShadow = true
  deck.castShadow = true
  group.add(deck)
  walks.push(deck)

  const plankCount = Math.round((dock.maxZ - dock.minZ) / 0.62)
  for (let i = 0; i < plankCount; i++) {
    const plank = new THREE.Mesh(
      resources.roundedBox(deckWidth - 0.2, 0.06, 0.5, 0.03),
      resources.material(i % 2 ? mix(stone, 0xc9a06a, 0.6) : mix(stone, 0x9c7748, 0.6), { roughness: 0.92, surface: 'wood' })
    )
    plank.position.set(0, DOCK_Y + 0.03, dock.minZ + 0.4 + i * 0.62)
    plank.receiveShadow = true
    group.add(plank)
    walks.push(plank)
  }

  const postOffset = deckWidth / 2 - 0.25
  for (const z of [dock.minZ + 0.4, (dock.minZ + dock.maxZ) / 2, dock.maxZ - 0.4]) {
    for (const side of [-1, 1]) {
      kit.cylinder(group, mix(stone, 0x6b5334, 0.6), 0.16, 0.18, 2.4, side * postOffset, -0.9, z, { occluder: true })
    }
  }

  // Side railings run along the pier, so they are built by hand rather than with
  // the X-aligned railing helper.
  const railColor = mix(stone, 0xb08a5c, 0.5)
  const railCount = Math.max(3, Math.round((dock.maxZ - dock.minZ) / 0.9))
  for (let i = 0; i < railCount; i++) {
    const z = dock.minZ + 0.4 + ((dock.maxZ - dock.minZ - 0.8) * i) / (railCount - 1)
    kit.box(group, railColor, 0.12, 0.9, 0.12, -postOffset, DOCK_Y + 0.45, z, { round: 0.04 })
  }
  kit.box(group, railColor, 0.12, 0.1, dock.maxZ - dock.minZ - 0.6, -postOffset, DOCK_Y + 0.9, (dock.minZ + dock.maxZ) / 2, { round: 0.04 })

  const gate = new THREE.Group()
  gate.position.set(0, DOCK_Y + 0.1, dock.maxZ - 0.9)
  group.add(gate)
  kit.torus(gate, ground.accent, 1.9, 0.14, 0, 1.9, 0, { emissive: 0.5, occluder: true })
  for (const side of [-1, 1]) kit.cylinder(gate, mix(stone, 0x8f9aa4, 0.5), 0.16, 0.22, 1.9, side * 1.9, 0.95, 0, { occluder: true })
  kit.box(gate, mix(stone, 0xdfe6ea, 0.6), 4.3, 0.2, 0.4, 0, 1.95, 0, { round: 0.08 })
  for (let i = 0; i < 10; i++) {
    const mote = kit.sphere(gate, ground.accent, 0.07 + random() * 0.05, (random() - 0.5) * 3.2, 0.5 + random() * 2.6, (random() - 0.5) * 0.8, { emissive: 1.2 })
    mote.castShadow = false
  }

  for (const side of [-1, 1]) {
    kit.cylinder(group, mix(stone, 0x4a4450, 0.4), 0.1, 0.13, 2.4, side * (deckWidth / 2 + 0.2), 1.2, dock.minZ - 0.9, { occluder: true })
    const glow = kit.sphere(group, 0xffd794, 0.22, side * (deckWidth / 2 + 0.2), 2.5, dock.minZ - 0.9, { emissive: 1 })
    glow.castShadow = false
  }

  // --- scattered undergrowth -------------------------------------------------
  const occupied = (x: number, z: number, margin: number): boolean => [...blueprint.placements, ...edits].some(item => {
    const half = ('block' in item ? item.block : catalogModel(item.modelId)?.block) || { w: 0.6, d: 0.6 }
    return Math.abs(x - item.x) < half.w / 2 + margin && Math.abs(z - item.z) < half.d / 2 + margin
  })

  const scatter = (count: number, geometry: THREE.BufferGeometry, material: THREE.Material, height: number, minRadius: number): void => {
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.castShadow = false
    mesh.receiveShadow = true
    const matrix = new THREE.Matrix4()
    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 12) {
      const angle = random() * Math.PI * 2
      const r = minRadius + random() * (radius - 1.5 - minRadius)
      const x = Math.sin(angle) * r
      const z = Math.cos(angle) * r
      if (Math.hypot(x, z) < 4.2) continue
      if (Math.abs(x) < 2.5 && z > 1.4) continue
      if (x > dock.minX - 0.6 && x < dock.maxX + 0.6 && z > dock.minZ - 0.6 && z < dock.maxZ + 0.6) continue
      if (occupied(x, z, 0.35)) continue
      if (river.contains(x, z, 0.4)) continue
      if (branches.some(points => points.some(point => Math.hypot(point.x - x, point.z - z) < 0.75))) continue
      matrix.makeTranslation(x, surfaceHeight(x, z) + height, z)
      matrix.multiply(new THREE.Matrix4().makeRotationY(random() * Math.PI * 2))
      matrix.multiply(new THREE.Matrix4().makeScale(0.8 + random() * 0.6, 0.7 + random() * 0.8, 0.8 + random() * 0.6))
      mesh.setMatrixAt(placed++, matrix)
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }

  const meadowMaterial = resources.material(0xffffff, { roughness: 0.95, vertexColors: true, sway: 0.16, side: THREE.DoubleSide })
  scatter(Math.round((blueprint.biome === 'winter' ? 100 : blueprint.biome === 'coast' ? 260 : 860) * quality.vegetation), meadowGeometry(null), meadowMaterial, 0.005, 3.0)
  if (blueprint.biome !== 'winter') {
    scatter(Math.round((blueprint.biome === 'coast' ? 35 : 125) * quality.vegetation), meadowGeometry(0xf5b5c2), meadowMaterial, 0, 3.4)
    scatter(Math.round((blueprint.biome === 'coast' ? 42 : 120) * quality.vegetation), meadowGeometry(0xfff5c8), meadowMaterial, 0, 3.4)
  }
  scatter(Math.round(30 * quality.vegetation), resources.geometry('ico', 0.14, 0), resources.material(mix(stone, 0xffffff, 0.25), { roughness: 1, flatShading: true }), 0.06, 4.0)

  return {
    group,
    heightAt(x, z) {
      if (x > dock.minX && x < dock.maxX && z > dock.minZ && z < dock.maxZ) return DOCK_Y + 0.06
      const bridge = river.bridgeAt(x, z)
      if (bridge !== null) return bridge
      let height = surfaceHeight(x, z)
      if (Math.hypot(x, z - blueprint.spawn.z) < 1.35) height = Math.max(height, 0.105)
      else if (Math.abs(x) < 1.25 && z > 1.4 && z < blueprint.spawn.z + 3) height = Math.max(height, 0.09)
      else if (Math.hypot(x, z) < 3.7) height = Math.max(height, 0.055)
      else if (branches.some(points => points.some(point => Math.hypot(point.x - x, point.z - z) < 0.55))) height += 0.035
      return height
    },
    onDock: (x, z) => x > dock.minX && x < dock.maxX && z > dock.minZ && z < dock.maxZ,
    isWater: (x, z) => river.contains(x, z, 0.12) && river.bridgeAt(x, z) === null,
    waterArea: (x, z, margin = 0) => river.contains(x, z, margin) || river.bridgeAt(x, z) !== null,
    update: riverScene.update,
    pick(raycaster, out) {
      group.updateMatrixWorld(true)
      const hit = raycaster.intersectObjects(walks, false)[0]
      return hit ? out.copy(hit.point) : null
    }
  }
}
