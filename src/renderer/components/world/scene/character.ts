import * as THREE from 'three'
import { Kit, type ModelPalette } from './modelKit'
import type { SceneResources } from './resources'

export interface CharacterState { moving: boolean; speed: number; yaw: number }
export interface Character {
  object: THREE.Group
  update(delta: number, state: CharacterState): void
  teleport(x: number, y: number, z: number, yaw: number): void
}

/** A garden traveller with layered hair, tailored clothes and articulated limbs. */
export function createCharacter(resources: SceneResources, palette: ModelPalette): Character {
  const root = new THREE.Group(), rig = new THREE.Group()
  root.add(rig)
  const kit = new Kit(resources, palette)
  const skin = 0xf4cbb0, hair = 0x644735, cloth = 0x73b9ad, trim = 0xeae1c5, leather = 0xb48757

  const curve = (parent: THREE.Object3D, color: number, points: number[][], radius: number, tapered = false): THREE.Mesh => {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])))
    const geometry = new THREE.TubeGeometry(path, 18, radius, 8, false)
    if (tapered) {
      const vertices = geometry.attributes.position as THREE.BufferAttribute
      for (let row = 0; row <= 18; row++) {
        const t = row / 18, centre = path.getPointAt(t), taper = (0.75 + Math.sin(t * Math.PI) * 0.25) * (1 - Math.pow(t, 3) * 0.91)
        for (let col = 0; col <= 8; col++) {
          const index = row * 9 + col
          vertices.setXYZ(index, centre.x + (vertices.getX(index) - centre.x) * taper,
            centre.y + (vertices.getY(index) - centre.y) * taper, centre.z + (vertices.getZ(index) - centre.z) * taper)
        }
      }
      geometry.computeVertexNormals()
    }
    const mesh = new THREE.Mesh(geometry, resources.material(color, { roughness: 0.8 }))
    mesh.castShadow = radius > 0.025; mesh.receiveShadow = true; parent.add(mesh)
    return mesh
  }

  // Coat, knit front, lapels, pockets, piping and brass buttons.
  kit.box(rig, cloth, 0.64, 0.66, 0.43, 0, 0.87, 0, { round: 0.17 })
  kit.box(rig, 0xf3e7ce, 0.29, 0.47, 0.08, 0, 0.91, 0.206, { round: 0.055 })
  for (const side of [-1, 1]) {
    kit.box(rig, 0x96cbb9, 0.16, 0.49, 0.085, side * 0.218, 0.88, 0.206, { rz: side * 0.025, round: 0.035 })
    kit.box(rig, 0xa6d4be, 0.16, 0.19, 0.07, side * 0.15, 1.105, 0.24, { rz: side * 0.43, round: 0.025 })
    kit.box(rig, 0x64a99c, 0.17, 0.14, 0.035, side * 0.205, 0.715, 0.253, { round: 0.035 })
    kit.box(rig, 0xadd3be, 0.175, 0.025, 0.044, side * 0.205, 0.765, 0.259, { round: 0.008 })
    kit.box(rig, trim, 0.028, 0.51, 0.027, side * 0.14, 0.86, 0.258, { round: 0.009 })
  }
  for (let i = 0; i < 3; i++) kit.sphere(rig, 0xb79257, 0.022, 0.073, 0.79 + i * 0.105, 0.258, { sz: 0.55, metalness: 0.2 })
  kit.box(rig, 0x4f958c, 0.58, 0.042, 0.43, 0, 0.56, 0.005, { round: 0.018 })
  kit.torus(rig, trim, 0.156, 0.039, 0, 1.17, 0.025, { rx: Math.PI / 2, sz: 0.75 })
  kit.box(rig, 0xeab86a, 0.12, 0.18, 0.055, -0.045, 1.035, 0.277, { rz: -0.2, round: 0.025 })
  kit.box(rig, 0xf2c57b, 0.1, 0.15, 0.04, 0.05, 1.055, 0.28, { rz: 0.34, round: 0.02 })
  kit.sphere(rig, 0x659f67, 0.033, -0.23, 1.0, 0.283, { sx: 0.7, sz: 0.25, rz: -0.4 })

  const pack = kit.group(rig, 0, 0.85, -0.26)
  kit.box(pack, 0xc7a56e, 0.43, 0.52, 0.22, 0, 0, -0.075, { round: 0.085 })
  kit.box(pack, 0xd8bb85, 0.45, 0.19, 0.25, 0, 0.16, -0.095, { round: 0.06 })
  kit.box(pack, leather, 0.27, 0.20, 0.07, 0, -0.12, -0.205, { round: 0.04 })
  kit.box(pack, 0x896349, 0.045, 0.28, 0.035, 0, 0.035, -0.233, { round: 0.008 })
  kit.box(pack, 0xdcc697, 0.085, 0.075, 0.04, 0, 0.005, -0.254, { round: 0.014, metalness: 0.2 })
  curve(pack, 0x896349, [[-0.09, 0.24, -0.06], [-0.08, 0.34, -0.06], [0.08, 0.34, -0.06], [0.09, 0.24, -0.06]], 0.021)
  for (const side of [-1, 1]) curve(rig, leather, [[side * 0.25, 0.63, 0.16], [side * 0.29, 1.11, 0.15],
    [side * 0.26, 1.17, -0.1], [side * 0.20, 0.76, -0.36]], 0.024)

  // Ears, inset irises, lashes, brows, blush and a small curved smile.
  const head = kit.group(rig, 0, 1.51, 0)
  kit.sphere(head, skin, 0.44, 0, 0, 0, { sx: 1.02, sy: 1.035, sz: 0.95, roughness: 0.82 })
  for (const side of [-1, 1]) {
    kit.sphere(head, skin, 0.096, side * 0.43, -0.035, 0.012, { sx: 0.58, sy: 0.86, sz: 0.7 })
    kit.sphere(head, 0xe9aa96, 0.048, side * 0.444, -0.03, 0.066, { sx: 0.55, sy: 0.9, sz: 0.35 })
    kit.sphere(head, 0xeeb3a4, 0.072, side * 0.265, -0.07, 0.346, { sy: 0.37, sz: 0.18 })
    curve(head, 0x72513a, [[side * 0.10, 0.145, 0.389], [side * 0.17, 0.16, 0.371], [side * 0.23, 0.143, 0.346]], 0.013)
  }
  const eyes = [-1, 1].map(side => {
    const eye = kit.group(head, side * 0.153, 0.017, 0.4)
    kit.sphere(eye, 0xfff6e5, 0.076, 0, 0, 0, { sx: 0.79, sy: 1.13, sz: 0.24, roughness: 0.4 })
    kit.sphere(eye, 0x835a3d, 0.052, -side * 0.002, -0.006, 0.014, { sx: 0.83, sy: 1.16, sz: 0.23, roughness: 0.32 })
    kit.sphere(eye, 0x2d3030, 0.032, -side * 0.003, -0.003, 0.026, { sx: 0.86, sy: 1.2, sz: 0.24, roughness: 0.28 })
    kit.sphere(eye, 0xffffff, 0.017, -0.014, 0.027, 0.036, { sz: 0.3 })
    kit.sphere(eye, 0xffe8b8, 0.009, 0.017, -0.028, 0.035, { sz: 0.3 })
    curve(eye, 0x624637, [[-0.057, 0.044, 0.006], [0, 0.079, 0.008], [0.056, 0.05, 0.004]], 0.011)
    return eye
  })
  kit.sphere(head, 0xedbb98, 0.039, 0, -0.062, 0.419, { sx: 0.8, sy: 0.83, sz: 0.95 })
  curve(head, 0xb36e60, [[-0.047, -0.151, 0.391], [0, -0.169, 0.395], [0.047, -0.151, 0.391]], 0.009)
  kit.sphere(head, 0xffd9bd, 0.018, -0.01, -0.049, 0.447, { sy: 0.35, sz: 0.22 })

  // A shaped hairline is higher at the forehead and lower at the nape.
  const hairVertices: number[] = [], hairIndices: number[] = []
  for (let row = 0; row <= 18; row++) for (let col = 0; col <= 48; col++) {
    const phi = col / 48 * Math.PI * 2, theta = row / 18 * (1.62 - 0.39 * Math.cos(phi))
    hairVertices.push(Math.sin(phi) * Math.sin(theta) * 0.459, Math.cos(theta) * 0.464 + 0.019, Math.cos(phi) * Math.sin(theta) * 0.434)
    if (row < 18 && col < 48) { const a = row * 49 + col; hairIndices.push(a, a + 49, a + 1, a + 1, a + 49, a + 50) }
  }
  const capGeometry = new THREE.BufferGeometry()
  capGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hairVertices, 3)); capGeometry.setIndex(hairIndices); capGeometry.computeVertexNormals()
  const cap = new THREE.Mesh(capGeometry, resources.material(hair, { roughness: 0.83, side: THREE.DoubleSide }))
  cap.castShadow = true; cap.receiveShadow = true; head.add(cap)
  const locks = [
    [[0.14, 0.41, 0.15], [0.03, 0.34, 0.34], [-0.12, 0.22, 0.41], [-0.20, 0.14, 0.374]],
    [[0.24, 0.35, 0.15], [0.20, 0.28, 0.33], [0.12, 0.18, 0.41], [0.01, 0.11, 0.424]],
    [[-0.03, 0.40, 0.18], [-0.22, 0.31, 0.29], [-0.32, 0.18, 0.27], [-0.36, 0.06, 0.23]],
    [[0.34, 0.24, 0.12], [0.38, 0.13, 0.17], [0.39, 0.02, 0.17], [0.37, -0.065, 0.17]],
    [[-0.35, 0.18, 0.09], [-0.40, 0.08, 0.12], [-0.40, -0.03, 0.10], [-0.37, -0.10, 0.06]]
  ]
  locks.forEach((points, i) => curve(head, i % 2 ? 0x70503b : hair, points, i < 3 ? 0.093 : 0.064, true))
  curve(head, 0x886044, [[0.1, 0.442, 0.17], [-0.025, 0.36, 0.35], [-0.15, 0.24, 0.409]], 0.009, true)
  curve(head, 0x836044, [[0.24, 0.375, 0.19], [0.22, 0.31, 0.327], [0.12, 0.208, 0.417]], 0.008, true)
  curve(head, hair, [[0.04, 0.43, -0.07], [0.07, 0.54, -0.03], [0.16, 0.54, 0.02], [0.18, 0.49, 0.07]], 0.039, true)

  const elbows: THREE.Group[] = []
  const arms = [-1, 1].map(side => {
    const pivot = kit.group(rig, side * 0.35, 1.075, 0)
    pivot.rotation.z = side * 0.12
    kit.capsule(pivot, cloth, 0.108, 0.14, 0, -0.12, 0, { sz: 0.94 })
    const elbow = kit.group(pivot, 0, -0.23, 0)
    kit.capsule(elbow, 0x82c1b0, 0.095, 0.1, 0, -0.055, 0)
    kit.cylinder(elbow, trim, 0.10, 0.098, 0.055, 0, -0.15, 0)
    kit.sphere(elbow, skin, 0.085, 0, -0.225, 0.006, { sx: 0.88, sy: 1.08, sz: 0.8 })
    kit.sphere(elbow, skin, 0.041, -side * 0.066, -0.20, 0.02, { sy: 0.95, sz: 0.9 })
    elbows.push(elbow); return pivot
  })
  const knees: THREE.Group[] = []
  const legs = [-1, 1].map(side => {
    const pivot = kit.group(rig, side * 0.15, 0.61, 0)
    kit.capsule(pivot, 0x596c79, 0.11, 0.13, 0, -0.12, 0)
    kit.box(pivot, 0x71818b, 0.2, 0.055, 0.21, 0, -0.21, 0, { round: 0.025 })
    const knee = kit.group(pivot, 0, -0.23, 0)
    kit.capsule(knee, skin, 0.077, 0.09, 0, -0.055, 0)
    kit.cylinder(knee, trim, 0.083, 0.086, 0.105, 0, -0.15, 0)
    kit.cylinder(knee, 0x9dbfaf, 0.086, 0.086, 0.024, 0, -0.105, 0)
    kit.box(knee, 0x996e4c, 0.23, 0.17, 0.32, 0, -0.25, 0.045, { round: 0.065 })
    kit.box(knee, 0xd9c79c, 0.242, 0.055, 0.33, 0, -0.327, 0.047, { round: 0.025 })
    for (let i = 0; i < 2; i++) kit.box(knee, 0xf1e4c8, 0.10, 0.012, 0.02, 0, -0.17, 0.065 + i * 0.046, { rz: i % 2 ? 0.13 : -0.13, round: 0.005 })
    knees.push(knee); return pivot
  })

  let phase = 0, idleTime = 0, yaw = 0, blend = 0, blinkTimer = 2.7, blinkAge = 1
  return {
    object: root,
    update(delta, state) {
      let difference = state.yaw - yaw
      while (difference > Math.PI) difference -= Math.PI * 2
      while (difference < -Math.PI) difference += Math.PI * 2
      yaw += difference * Math.min(1, delta * 10)
      root.rotation.y = yaw
      idleTime += delta
      blend += ((state.moving ? 1 : 0) - blend) * Math.min(1, delta * 9)
      phase += delta * (3.2 + state.speed * 2.1) * blend
      const swing = Math.min(0.72, 0.24 + state.speed * 0.08) * blend
      for (let i = 0; i < 2; i++) {
        const stride = Math.sin(phase + i * Math.PI)
        legs[i].rotation.x = stride * swing
        knees[i].rotation.x = Math.max(0, -stride) * 0.42 * blend
        arms[i].rotation.x = -stride * swing * 0.72 + Math.sin(idleTime * 1.4 + i * Math.PI) * 0.025 * (1 - blend)
        elbows[i].rotation.x = -0.10 - Math.max(0, stride) * 0.18 * blend
      }
      rig.position.y = Math.abs(Math.sin(phase)) * 0.027 * blend + Math.sin(idleTime * 1.7) * 0.007 * (1 - blend)
      rig.rotation.x = 0.035 * blend
      rig.rotation.z += (THREE.MathUtils.clamp(-difference * 0.26, -0.09, 0.09) + Math.sin(phase) * 0.018 * blend - rig.rotation.z) * Math.min(1, delta * 8)
      head.rotation.z = -Math.sin(phase) * 0.025 * blend + Math.sin(idleTime * 0.7) * 0.012 * (1 - blend)
      head.rotation.y = Math.sin(idleTime * 0.45) * 0.055 * (1 - blend)
      pack.rotation.x = Math.sin(phase * 2 - 0.5) * 0.023 * blend
      blinkTimer -= delta
      if (blinkTimer <= 0) { blinkAge = 0; blinkTimer = 3.0 + Math.random() * 2.2 }
      blinkAge += delta
      const opening = blinkAge < 0.2 ? 1 - Math.sin(blinkAge / 0.2 * Math.PI) * 0.94 : 1
      eyes.forEach(eye => { eye.scale.y = opening })
    },
    teleport(x, y, z, nextYaw) {
      root.position.set(x, y, z); yaw = nextYaw; root.rotation.y = yaw
      rig.position.y = 0; blend = 0
    }
  }
}
