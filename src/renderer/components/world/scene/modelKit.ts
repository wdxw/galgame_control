import * as THREE from 'three'
import type { SceneResources } from './resources'
import type { SurfaceStyle } from './surfaceTextures'

// A tiny modelling DSL. Every model in the library is assembled from these
// rounded primitives so the island keeps one consistent, soft toy-like look.

export interface ModelPalette {
  biome?: string
  ground: number
  stone: number
  water: number
  foliage: number
  accent: number
  sky: number
  night: boolean
}

export interface PartOptions {
  rx?: number
  ry?: number
  rz?: number
  sx?: number
  sy?: number
  sz?: number
  emissive?: number
  opacity?: number
  round?: number
  shade?: 'standard' | 'toon'
  sway?: number
  /** Mark the part as a camera occluder (tall structures). */
  occluder?: boolean
  flat?: boolean
  metalness?: number
  roughness?: number
  surface?: SurfaceStyle
}

export class Kit {
  constructor(readonly resources: SceneResources, readonly p: ModelPalette) {}

  group(parent: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0): THREE.Group {
    const node = new THREE.Group()
    node.position.set(x, y, z)
    node.rotation.y = ry
    parent.add(node)
    return node
  }

  private place(mesh: THREE.Mesh, x: number, y: number, z: number, o: PartOptions): THREE.Mesh {
    mesh.position.set(x, y, z)
    if (o.rx) mesh.rotation.x = o.rx
    if (o.ry) mesh.rotation.y = o.ry
    if (o.rz) mesh.rotation.z = o.rz
    mesh.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)
    mesh.castShadow = !o.opacity
    mesh.receiveShadow = true
    if (o.occluder) mesh.userData.occluder = true
    return mesh
  }

  private build(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.resources.material(color, {
      emissive: o.emissive, opacity: o.opacity, shade: o.shade, sway: o.sway,
      flatShading: o.flat, metalness: o.metalness, roughness: o.roughness, surface: o.surface
    }))
    parent.add(this.place(mesh, x, y, z, o))
    return mesh
  }

  /** Rounded box — the workhorse for walls, roofs and furniture. */
  box(parent: THREE.Object3D, color: number, w: number, h: number, d: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    const radius = o.round ?? Math.min(0.12, Math.min(w, h, d) * 0.3)
    return this.build(parent, this.resources.geometry('rbox', w, h, d, radius), color, x, y, z, o)
  }

  sphere(parent: THREE.Object3D, color: number, radius: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    return this.build(parent, this.resources.geometry('sphere', radius), color, x, y, z, o)
  }

  dome(parent: THREE.Object3D, color: number, radius: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    return this.build(parent, this.resources.geometry('dome', radius), color, x, y, z, o)
  }

  rock(parent: THREE.Object3D, color: number, radius: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    return this.build(parent, this.resources.geometry('ico', radius, 1), color, x, y, z, o)
  }

  cylinder(parent: THREE.Object3D, color: number, top: number, bottom: number, height: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    return this.build(parent, this.resources.geometry('cylinder', top, bottom, height, 24), color, x, y, z, o)
  }

  cone(parent: THREE.Object3D, color: number, radius: number, height: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    return this.build(parent, this.resources.geometry('cone', radius, height, 20), color, x, y, z, o)
  }

  torus(parent: THREE.Object3D, color: number, radius: number, tube: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    return this.build(parent, this.resources.geometry('torus', radius, tube, 10, 40), color, x, y, z, o)
  }

  capsule(parent: THREE.Object3D, color: number, radius: number, length: number, x: number, y: number, z: number, o: PartOptions = {}): THREE.Mesh {
    return this.build(parent, this.resources.geometry('capsule', radius, length), color, x, y, z, o)
  }

  /** Tiled gable roof with thick, rounded eaves and a soft ridge. */
  roof(parent: THREE.Object3D, color: number, width: number, depth: number, height: number, y: number, o: PartOptions & { gableColor?: number } = {}): THREE.Mesh {
    const roof = this.group(parent, 0, y, 0, o.ry ?? 0)
    const pitch = Math.atan2(height, depth / 2)
    const slope = Math.hypot(height, depth / 2)
    let front!: THREE.Mesh
    for (const side of [-1, 1]) {
      const panel = this.box(roof, color, width, 0.14, slope + 0.12, 0, 0, side * depth / 4,
        { ...o, ry: 0, rx: side * pitch, round: 0.06, surface: 'tiles' })
      if (side === 1) front = panel
      if (width > 1.5) {
        const columns = Math.max(4, Math.round(width / 0.37)), rows = Math.max(3, Math.round(slope / 0.32))
        const tiles = new THREE.InstancedMesh(this.resources.roundedBox(0.36, 0.055, 0.46, 0.025),
          this.resources.material(color, { roughness: 0.88 }), columns * rows)
        const matrix = new THREE.Matrix4(), tint = new THREE.Color(color)
        let index = 0
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
          matrix.makeScale(width / columns / 0.36 * 0.95, 1, slope / rows / 0.46 * 1.25)
          matrix.setPosition(-width / 2 + (col + 0.5) * width / columns,
            0.105 + (rows - row) * 0.009, -slope / 2 + (row + 0.5) * slope / rows)
          tiles.setMatrixAt(index, matrix)
          tiles.setColorAt(index++, tint.clone().multiplyScalar(0.9 + ((row * 7 + col * 3) % 5) * 0.025))
        }
        tiles.castShadow = true; tiles.receiveShadow = true
        panel.add(tiles)
      }
    }
    this.box(roof, color, width + 0.08, 0.2, 0.2, 0, height / 2, 0, { round: 0.09 })
    for (const side of [-1, 1]) {
      this.box(roof, color, width + 0.12, 0.18, 0.16, 0, -height / 2, side * depth / 2, { round: 0.07 })
    }
    if (o.gableColor !== undefined) {
      for (const side of [-1, 1]) {
        this.build(roof, this.resources.geometry('gable', depth, height), o.gableColor, side * (width / 2 - 0.18), 0, 0,
          { surface: 'plaster', opacity: 1, ry: side === 1 ? 0 : Math.PI })
        for (const frontSide of [-1, 1]) this.box(roof, 0xf5ecd7, 0.12, 0.14, slope + 0.13,
          side * (width / 2 - 0.12), 0.02, frontSide * depth / 4, { rx: frontSide * pitch, round: 0.04 })
      }
    }
    return front
  }

  /** Glowing window band with a frame and a sill. */
  windows(parent: THREE.Object3D, options: { width: number; floors: number; depth: number; color: number; rows?: number; y?: number; glow?: number }): void {
    const { width, floors, depth, color } = options
    const columns = Math.max(2, Math.round(width / 1.15))
    for (let level = 0; level < floors; level++) {
      for (let i = 0; i < columns; i++) {
        const x = -width / 2 + (i + 0.5) * (width / columns)
        const y = (options.y ?? 0.95) + level * 1.05
        this.box(parent, 0x4a5568, 0.62, 0.72, 0.06, x, y, depth / 2 + 0.02, { round: 0.03 })
        this.box(parent, color, 0.48, 0.58, 0.04, x, y, depth / 2 + 0.06, { emissive: options.glow ?? 0.35, round: 0.03 })
        this.box(parent, 0xf3ead8, 0.06, 0.6, 0.05, x, y, depth / 2 + 0.08, { round: 0.02 })
        this.box(parent, 0xf3ead8, 0.66, 0.08, 0.14, x, y - 0.38, depth / 2 + 0.07, { round: 0.025 })
        this.box(parent, 0xffffff, 0.05, 0.25, 0.012, x + 0.13, y + 0.13, depth / 2 + 0.085, { rz: -0.55, opacity: 0.42 })
      }
    }
  }

  /** Door with a frame and a knob. */
  door(parent: THREE.Object3D, color: number, x: number, y: number, z: number, width = 0.62, height = 1.25): void {
    this.box(parent, 0xf1e6d2, width + 0.16, height + 0.14, 0.08, x, y, z, { round: 0.05 })
    this.box(parent, color, width, height, 0.08, x, y, z + 0.03, { round: 0.05, surface: 'wood' })
    this.box(parent, 0xffedc8, width * 0.68, height * 0.33, 0.015, x, y + height * 0.17, z + 0.08, { round: 0.04, emissive: this.p.night ? 0.4 : 0.03 })
    this.box(parent, color, width * 0.68, height * 0.32, 0.018, x, y - height * 0.27, z + 0.075, { round: 0.035, surface: 'wood' })
    this.sphere(parent, 0xf7d68a, 0.045, x + width / 2 - 0.12, y, z + 0.09, { emissive: 0.2, shade: 'toon' })
  }

  /** Hanging shop sign. */
  sign(parent: THREE.Object3D, color: number, x: number, y: number, z: number): void {
    this.torus(parent, 0x6b5844, 0.05, 0.012, x, y + 0.24, z)
    this.box(parent, color, 0.62, 0.34, 0.06, x, y, z, { round: 0.05 })
  }

  /** A ring of rounded posts, used for fences and railings. */
  railing(parent: THREE.Object3D, color: number, from: number, to: number, z: number, count = 6, y = 0.4): void {
    for (let i = 0; i < count; i++) {
      const x = from + (to - from) * (i / (count - 1))
      this.box(parent, color, 0.1, y * 2, 0.1, x, y, z, { round: 0.04 })
    }
    this.box(parent, color, Math.abs(to - from), 0.09, 0.1, (from + to) / 2, y * 1.8, z, { round: 0.04 })
  }
}
