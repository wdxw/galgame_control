import * as THREE from 'three'
import type { SceneResources } from './resources'
import type { RiverLayout } from './riverLayout'
import { Kit, type ModelPalette } from './modelKit'
import { waterMaterial } from './water'
import type { QualitySettings } from './quality'

export function createRiverScene(resources: SceneResources, river: RiverLayout, land: (x: number, z: number) => number,
  palette: ModelPalette, quality: QualitySettings, radius: number): { group: THREE.Group; walks: THREE.Mesh[]; update(time: number): void } {
  const group = new THREE.Group(), walks: THREE.Mesh[] = [], kit = new Kit(resources, palette)
  const points = river.points
  const waterColor = new THREE.Color(palette.water).lerp(new THREE.Color(0x46bfca), palette.night ? 0.12 : 0.65).getHex()
  const material = waterMaterial(resources, waterColor, 'river', quality.waterWaves)
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  const bankPositions: number[] = [], bankUvs: number[] = [], bankIndices: number[] = []
  const cross = 8
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]
    const len = Math.hypot(b.x - a.x, b.z - a.z), nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len
    for (let j = 0; j <= cross; j++) {
      const offset = (j / cross * 2 - 1) * p.width * 1.12
      positions.push(p.x + nx * offset, p.y, p.z + nz * offset)
      uvs.push(j / cross, p.distance)
      if (i < points.length - 1 && j < cross) {
        const start = i * (cross + 1) + j
        indices.push(start, start + cross + 1, start + 1, start + 1, start + cross + 1, start + cross + 2)
      }
    }
    for (const side of [-1, 1]) for (const t of [0, 1]) {
      const taper = Math.min(1, i / 5, (points.length - 1 - i) / 5)
      const offset = side * (p.width * 1.07 + t * 0.4 * taper)
      const x = p.x + nx * offset, z = p.z + nz * offset
      bankPositions.push(x, Math.hypot(x, z) > radius + 0.2 ? -0.48 : river.groundAt(x, z) + 0.018, z)
      bankUvs.push(t, p.distance * 0.45)
    }
    if (i < points.length - 1) for (const side of [0, 2]) {
      const a = i * 4 + side
      bankIndices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  const water = new THREE.Mesh(geometry, material)
  water.receiveShadow = true; group.add(water); walks.push(water)
  for (const p of [points[0], points[points.length - 1]]) {
    const pool = new THREE.Mesh(resources.geometry('disc', p.width * 1.12, 40), material)
    pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, p.y - 0.008, p.z)
    group.add(pool); walks.push(pool)
  }
  const bankGeometry = new THREE.BufferGeometry()
  bankGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bankPositions, 3))
  bankGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(bankUvs, 2))
  bankGeometry.setIndex(bankIndices); bankGeometry.computeVertexNormals()
  const bank = new THREE.Mesh(bankGeometry, resources.material(palette.night ? 0x8e9295 : palette.biome === 'winter' ? 0xdbded9 : 0xdec99e,
    { roughness: 0.97, surface: 'sand', side: THREE.DoubleSide }))
  bank.receiveShadow = true; group.add(bank)

  // Small arched footbridges share their deck height with walking and picking.
  for (const bridge of river.bridges) {
    const g = kit.group(group, bridge.x, 0, bridge.z, Math.atan2(-bridge.nz, bridge.nx))
    const deckHeight = (u: number): number => river.bridgeAt(bridge.x + bridge.nx * u * 0.999, bridge.z + bridge.nz * u * 0.999)!
    const count = Math.ceil(bridge.length * 2 / 0.23), step = bridge.length * 2 / count
    for (let i = 0; i < count; i++) {
      const u = -bridge.length + step * (i + 0.5)
      const plank = kit.box(g, i % 3 ? 0xb98b5a : 0xc9a16c, step * 0.96, 0.085, 1.72, u, deckHeight(u) - 0.043, 0, { round: 0.035, surface: 'wood' })
      plank.rotation.z = Math.atan2(deckHeight(Math.min(bridge.length, u + 0.08)) - deckHeight(Math.max(-bridge.length, u - 0.08)), 0.16)
      walks.push(plank)
    }
    // A thin continuous deck keeps the gaps between boards pickable.
    const vertices: number[] = [], faces: number[] = []
    for (let i = 0; i <= count; i++) {
      const u = -bridge.length + i * step
      for (const v of [-0.86, 0.86]) vertices.push(u, deckHeight(u) - 0.06, v)
      if (i < count) { const n = i * 2; faces.push(n, n + 1, n + 2, n + 1, n + 3, n + 2) }
    }
    const deckGeometry = new THREE.BufferGeometry()
    deckGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); deckGeometry.setIndex(faces); deckGeometry.computeVertexNormals()
    const deck = new THREE.Mesh(deckGeometry, resources.material(0x896140, { side: THREE.DoubleSide }))
    g.add(deck); walks.push(deck)
    for (const side of [-1, 1]) {
      for (const u of [-bridge.length + 0.1, 0, bridge.length - 0.1]) {
        const y = deckHeight(u)
        kit.box(g, 0xede3c7, 0.11, 0.67, 0.11, u, y + 0.27, side * 0.88, { round: 0.035 })
        kit.sphere(g, 0x81bcb2, 0.095, u, y + 0.64, side * 0.88, { sy: 0.7 })
      }
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => {
        const u = -bridge.length + i / 16 * bridge.length * 2
        return new THREE.Vector3(u, deckHeight(u) + 0.55, side * 0.88)
      }))
      const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.055, 8, false), resources.material(0x9c784f, { roughness: 0.82 }))
      rail.castShadow = true; g.add(rail)
    }
  }

  for (let i = 5; i < points.length - 3; i += 7) {
    const p = points[i], a = points[i - 1], b = points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z)
    const side = i % 2 ? -1 : 1, offset = p.width + 0.65
    const x = p.x + (b.z - a.z) / len * offset * side, z = p.z - (b.x - a.x) / len * offset * side
    if (river.bridgeAt(x, z) !== null) continue
    kit.sphere(group, palette.biome === 'winter' ? 0xdde2df : 0x9a9e86, 0.23 + (i % 3) * 0.06, x, land(x, z) + 0.08, z,
      { sx: 1.3, sy: 0.65, sz: 0.9, roughness: 0.95 })
    for (let reed = 0; reed < 3; reed++) {
      const dx = x + Math.sin(reed * 2.3) * 0.17, dz = z + Math.cos(reed * 2.3) * 0.17
      const h = 0.3 + (reed % 3) * 0.10
      kit.capsule(group, 0x809856, 0.02, h, dx, land(dx, dz) + h / 2, dz, { sway: 0.18, rz: 0.13 - reed * 0.1 })
    }
  }

  // A spring spills out of a rounded rock face into the upper pool.
  const source = points[0]
  for (const side of [-1, 1]) kit.sphere(group, palette.biome === 'winter' ? 0xd7dfdd : 0x929b88,
    0.55, source.x + side * 0.47, source.y + 0.35, source.z - 0.4, { sx: 0.9, sy: 1.4, sz: 0.85 })
  kit.sphere(group, 0xa7ae95, 0.6, source.x, source.y + 0.75, source.z - 0.55, { sx: 1.25, sy: 0.45, sz: 0.8 })
  const fallPositions: number[] = [], fallUvs: number[] = [], fallIndices: number[] = []
  for (let row = 0; row <= 18; row++) for (let col = 0; col <= 6; col++) {
    const t = row / 18, u = col / 6
    fallPositions.push(source.x + (u - 0.5) * (0.55 + t * 0.25), source.y + 0.81 * (1 - t), source.z - 0.22 + t * 0.32 + Math.sin(t * Math.PI) * 0.12)
    fallUvs.push(u, t)
    if (row < 18 && col < 6) { const a = row * 7 + col; fallIndices.push(a, a + 7, a + 1, a + 1, a + 7, a + 8) }
  }
  const fallGeometry = new THREE.BufferGeometry()
  fallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fallPositions, 3)); fallGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(fallUvs, 2))
  fallGeometry.setIndex(fallIndices); fallGeometry.computeVertexNormals()
  group.add(new THREE.Mesh(fallGeometry, waterMaterial(resources, 0x9edfe4, 'fall', quality.waterWaves)))
  const foamMaterial = new THREE.MeshStandardMaterial({ color: 0xe6fff4, transparent: true, opacity: 0.64, roughness: 0.8, depthWrite: false })
  const spray = new THREE.InstancedMesh(resources.geometry('sphere', 0.065, 10, 8), foamMaterial, Math.round(20 * quality.particles) + 8)
  group.add(spray)
  const rings = [0, 1, 2].map(() => {
    const material = new THREE.MeshBasicMaterial({ color: 0xe4fff5, transparent: true, opacity: 0.35, depthWrite: false })
    const ring = new THREE.Mesh(resources.geometry('torus', 0.36, 0.013, 6, 36), material)
    ring.rotation.x = -Math.PI / 2; ring.position.set(source.x, source.y + 0.025, source.z + 0.15)
    group.add(ring); return ring
  })
  const drifters = [0, 1, 2].map(i => {
    const g = kit.group(group)
    kit.sphere(g, i === 1 ? 0xe8b15c : 0x88ba6d, 0.14, 0, 0, 0, { sx: 0.8, sy: 0.075, sz: 1.4 })
    kit.box(g, 0xdfdca0, 0.015, 0.015, 0.23, 0, 0.012, 0, { round: 0.005 })
    return g
  })
  const matrix = new THREE.Matrix4()
  return {
    group, walks,
    update(time) {
      for (let i = 0; i < spray.count; i++) {
        const t = (time * 0.75 + i * 0.173) % 1, a = i * 2.399
        const spread = 0.1 + t * 0.48
        const size = (1 - t) * 0.7 + 0.2
        matrix.makeScale(size, size * 0.8, size)
        matrix.setPosition(source.x + Math.sin(a) * spread, source.y + 0.035 + Math.sin(t * Math.PI) * 0.19, source.z + 0.18 + Math.cos(a) * spread * 0.7)
        spray.setMatrixAt(i, matrix)
      }
      spray.instanceMatrix.needsUpdate = true
      rings.forEach((ring, i) => {
        const t = (time * 0.5 + i / 3) % 1
        ring.scale.setScalar(0.5 + t * 2.2)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = Math.sin(t * Math.PI) * 0.38
      })
      drifters.forEach((leaf, i) => {
        const progress = (time * 0.019 + i / 3) % 1 * (points.length - 1)
        const index = Math.floor(progress), t = progress - index, a = points[index], b = points[Math.min(index + 1, points.length - 1)]
        leaf.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + 0.03, a.z + (b.z - a.z) * t)
        leaf.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.sin(time + i) * 0.2
      })
    }
  }
}
