import * as THREE from 'three'
import { Kit, type ModelPalette } from './modelKit'
import type { SceneResources } from './resources'
import { leafCluster } from './foliage'

// The original rounded model library. Each entry is authored here as procedural
// geometry and shipped inside the app bundle — no runtime download of assets.

export interface BuiltModel {
  object: THREE.Group
  animate?: (time: number) => void
}

type Builder = (kit: Kit, random: () => number) => BuiltModel

const WOOD = 0xb08356
const WOOD_DARK = 0x7d5a3c
const WOOD_LIGHT = 0xd8b98c
const CREAM = 0xf6ead4
const PLASTER = 0xf0e2ca
const ROOF_BLUE = 0x6f93a8
const ROOF_RED = 0xc4705f
const ROOF_GREEN = 0x6f9a7c
const GLASS = 0x9fd8e6
const METAL = 0xb9c2cc
const METAL_DARK = 0x6b7480
const STONE_LIGHT = 0xd7cdb8
const GLOW = 0xffd794

/** Small canvas texture for clock faces. */
function clockFace(resources: SceneResources, radius = 0.5, night = false): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = night ? '#f6e3bd' : '#fff6e2'
  ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#4a4358'; ctx.lineWidth = 7
  for (let i = 0; i < 12; i++) {
    const angle = (i / 6) * Math.PI
    ctx.beginPath()
    ctx.moveTo(128 + Math.sin(angle) * 96, 128 - Math.cos(angle) * 96)
    ctx.lineTo(128 + Math.sin(angle) * 112, 128 - Math.cos(angle) * 112)
    ctx.stroke()
  }
  ctx.lineWidth = 9
  ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128, 58); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(180, 156); ctx.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ map: texture, transparent: true }))
  return mesh
}

const BUILDERS: Record<string, Builder> = {
  school_building: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, PLASTER, 5.4, 3.0, 3.4, 0, 1.5, 0, { round: 0.14, occluder: true })
    kit.windows(g, { width: 5.4, floors: 2, depth: 3.4, color: GLASS, y: 1.1 })
    kit.roof(g, ROOF_BLUE, 6.3, 4.3, 1.5, 3.75, { round: 0.06, occluder: true })
    const entrance = kit.group(g, 0, 0, 1.75)
    kit.box(entrance, CREAM, 1.7, 0.24, 1.0, 0, 2.05, 0.3, { round: 0.08 })
    kit.box(entrance, 0x5e7684, 1.5, 0.18, 1.1, 0, 2.22, 0.42, { round: 0.06 })
    kit.door(entrance, 0x8a6a4c, 0, 0.62, 0.06, 0.8, 1.24)
    for (let i = 0; i < 3; i++) kit.box(g, STONE_LIGHT, 2.6 - i * 0.3, 0.16, 0.5 + i * 0.34, 0, 0.08 + i * 0.16, 2.1 + i * 0.2, { round: 0.05 })
    kit.sign(g, 0x2f6d78, -1.7, 2.5, 1.78)
    kit.box(g, PLASTER, 3.4, 0.5, 2.2, 0, 3.35, -0.6, { round: 0.16 })
    return { object: g }
  },

  clock_tower: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, PLASTER, 1.5, 4.4, 1.5, 0, 2.2, 0, { round: 0.12, occluder: true })
    kit.box(g, CREAM, 1.72, 0.2, 1.72, 0, 3.4, 0, { round: 0.06 })
    for (const side of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const face = clockFace(kit.resources, 0.42, kit.p.night)
      face.position.set(Math.sin(side) * 0.78, 3.9, Math.cos(side) * 0.78)
      face.rotation.y = side
      g.add(face)
    }
    kit.box(g, PLASTER, 1.2, 1.0, 1.2, 0, 4.9, 0, { round: 0.12, occluder: true })
    kit.roof(g, ROOF_BLUE, 1.9, 1.9, 1.2, 5.85, { round: 0.05, occluder: true })
    kit.sphere(g, 0xe2c98f, 0.12, 0, 6.55, 0, { emissive: 0.2 })
    kit.box(g, 0x8b6b4a, 0.42, 1.0, 0.08, 0, 0.5, 0.8, { round: 0.04 })
    return { object: g }
  },

  cottage: (kit, random) => {
    const g = kit.group(new THREE.Group())
    const roofColor = kit.p.night ? 0x6e7893 : [ROOF_RED, 0xd8ac50, ROOF_GREEN][Math.floor(random() * 3)]
    kit.box(g, 0xbcab8d, 2.44, 0.3, 2.14, 0, 0.1, 0, { round: 0.06, surface: 'stone' })
    kit.box(g, PLASTER, 2.3, 1.85, 2.0, 0, 1.025, 0, { round: 0.12, surface: 'plaster', occluder: true })
    for (const x of [-1.08, 1.08]) kit.box(g, CREAM, 0.13, 1.8, 0.12, x, 1.05, 1.02, { round: 0.04 })
    kit.box(g, CREAM, 2.36, 0.16, 2.05, 0, 1.82, 0, { round: 0.04 })
    kit.roof(g, roofColor, 2.7, 3.0, 1.2, 2.42, { ry: Math.PI / 2, round: 0.06, occluder: true, gableColor: PLASTER })
    kit.door(g, 0x6f9f91, -0.5, 0.79, 1.05, 0.64, 1.28)
    kit.box(g, 0x8aa9a2, 0.71, 0.73, 0.07, 0.58, 1.12, 1.06, { round: 0.05 })
    kit.box(g, kit.p.night ? GLOW : GLASS, 0.54, 0.55, 0.06, 0.58, 1.12, 1.11, { emissive: kit.p.night ? 0.55 : 0.08, round: 0.035 })
    for (const x of [0.46, 0.7]) kit.box(g, CREAM, 0.035, 0.58, 0.03, x, 1.12, 1.15)
    kit.box(g, CREAM, 0.58, 0.035, 0.03, 0.58, 1.12, 1.15)
    for (const x of [0.14, 1.02]) {
      kit.box(g, 0x6f9f91, 0.16, 0.73, 0.09, x, 1.12, 1.12, { round: 0.025, surface: 'wood' })
      for (let i = 0; i < 5; i++) kit.box(g, 0x527f75, 0.12, 0.025, 0.03, x, 0.88 + i * 0.11, 1.18)
    }
    kit.box(g, WOOD, 0.82, 0.19, 0.32, 0.58, 0.62, 1.2, { round: 0.05, surface: 'wood' })
    leafCluster(kit, g, 0x578c46, random, [0.58, 0.77, 1.23], [0.35, 0.09, 0.16], 24, 0.075)
    for (let i = 0; i < 5; i++) kit.sphere(g, [0xe996a0, 0xffdb8d, 0xf9efd7][i % 3], 0.065, 0.3 + i * 0.14, 0.82, 1.26, { sy: 0.6 })
    kit.box(g, STONE_LIGHT, 1.2, 0.14, 0.46, -0.5, 0.08, 1.23, { round: 0.04, surface: 'stone' })
    kit.box(g, WOOD_DARK, 0.3, 0.07, 0.06, -0.5, 1.5, 1.19, { round: 0.02 })
    kit.box(g, GLOW, 0.12, 0.18, 0.12, -0.5, 1.38, 1.22, { emissive: kit.p.night ? 0.8 : 0.2 })
    kit.box(g, 0xb59a79, 0.36, 0.65, 0.36, 0.7, 2.72, -0.4, { round: 0.045, surface: 'stone' })
    kit.box(g, METAL_DARK, 0.46, 0.08, 0.44, 0.7, 3.06, -0.4, { round: 0.025 })
    const ivy = kit.group(g, -1.15, 1.05, 0.12)
    leafCluster(kit, ivy, 0x61934c, random, [0, 0.24, 0], [0.09, 0.7, 0.4], 50, 0.1)
    return { object: g }
  },

  lighthouse: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, STONE_LIGHT, 1.05, 1.35, 0.4, 0, 0.2, 0)
    for (let i = 0; i < 5; i++) {
      kit.cylinder(g, i % 2 ? 0xe8e2d4 : ROOF_RED, 1.02 - i * 0.11, 1.12 - i * 0.11, 1.0, 0, 0.4 + i * 1.0 + 0.5, 0, { occluder: true })
    }
    kit.cylinder(g, 0x5c6a75, 1.18, 1.18, 0.16, 0, 5.5, 0)
    const lamp = kit.cylinder(g, 0xffe6ad, 0.68, 0.68, 0.85, 0, 6.0, 0, { emissive: 0.85, opacity: 0.92 })
    lamp.castShadow = false
    kit.cylinder(g, 0x8e9aa4, 0.72, 0.72, 0.1, 0, 5.62, 0)
    kit.roof(g, ROOF_RED, 1.7, 1.7, 0.75, 6.8, { round: 0.05 })
    kit.sphere(g, 0xfff1c4, 0.16, 0, 7.25, 0, { emissive: 1 })
    const beam = kit.group(g, 0, 6.0, 0)
    const light = new THREE.SpotLight(0xffe1a8, kit.p.night ? 22 : 0, 26, 0.5, 0.6, 1.4)
    light.position.set(0, 0, 0)
    light.target.position.set(0, -6, 14)
    beam.add(light, light.target)
    return { object: g, animate: time => { beam.rotation.y = time * 0.35 } }
  },

  observatory: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, 0xe4e8ec, 1.9, 2.1, 1.5, 0, 0.75, 0, { occluder: true })
    kit.cylinder(g, 0xcfd6dd, 2.0, 2.0, 0.18, 0, 1.58, 0)
    kit.dome(g, 0xdce4ea, 1.85, 0, 1.6, 0, { occluder: true })
    kit.box(g, 0x4d5866, 0.5, 0.9, 1.3, 0.9, 2.9, 0.2, { rx: -0.7, round: 0.14 })
    kit.cylinder(g, METAL, 0.24, 0.24, 1.6, 0.9 + 0.5, 3.4, -0.5, { rx: -0.7 + Math.PI / 2 })
    kit.door(g, 0x6b7480, 0, 0.7, 2.1, 0.85, 1.4)
    kit.sign(g, 0x2f4b6d, -1.6, 1.7, 1.4)
    return { object: g }
  },

  castle: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0xcfd8d2, 4.0, 2.6, 2.6, 0, 1.3, 0, { round: 0.14, occluder: true })
    for (const x of [-2.2, 2.2]) {
      kit.cylinder(g, 0xdae2da, 0.85, 0.95, 4.4, x, 2.2, 0, { occluder: true })
      kit.cone(g, ROOF_GREEN, 1.15, 1.8, x, 5.3, 0, { occluder: true })
      kit.box(g, kit.p.accent, 0.32, 0.9, 0.06, x, 3.2, 0.92, { emissive: 0.45, round: 0.03 })
    }
    kit.roof(g, ROOF_GREEN, 4.6, 3.2, 1.4, 3.4, { round: 0.06, occluder: true })
    kit.door(g, WOOD_DARK, 0, 0.85, 1.35, 1.0, 1.6)
    kit.box(g, 0x8f9a94, 3.9, 0.14, 0.12, 0, 2.9, 1.4, { round: 0.05 })
    for (let i = 0; i < 5; i++) kit.box(g, 0x8f9a94, 0.22, 0.28, 0.14, -1.9 + i * 0.95, 3.05, 1.4, { round: 0.05 })
    const flag = kit.group(g, 0, 5.9, 0)
    kit.box(flag, 0x8a6a4c, 0.06, 1.6, 0.06, 0, 0.5, 0)
    const cloth = kit.box(flag, kit.p.accent, 0.42, 0.34, 0.04, 0.24, 1.1, 0, { emissive: 0.2 })
    return { object: g, animate: time => { cloth.rotation.y = Math.sin(time * 2) * 0.3 } }
  },

  manor: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0x9aa3b4, 5.0, 3.4, 3.2, 0, 1.7, 0, { round: 0.12, occluder: true })
    kit.windows(g, { width: 5.0, floors: 3, depth: 3.2, color: 0xffc078, glow: 0.7, y: 0.9 })
    kit.roof(g, 0x4a4a63, 5.8, 3.9, 1.7, 4.1, { round: 0.06, occluder: true })
    const tower = kit.group(g, -1.9, 0, -0.6)
    kit.box(tower, 0xa7b0c0, 1.7, 6.2, 1.7, 0, 3.1, 0, { round: 0.1, occluder: true })
    kit.roof(tower, 0x3f4058, 2.3, 2.3, 1.5, 6.9, { round: 0.05, occluder: true })
    const face = clockFace(kit.resources, 0.5, true)
    face.position.set(0, 4.8, 0.9)
    tower.add(face)
    kit.door(g, 0x3f3a44, 0, 1.05, 1.62, 1.1, 2.1)
    kit.box(g, 0xc9d0da, 2.2, 0.16, 0.5, 0, 2.4, 1.75, { round: 0.06 })
    for (const x of [-2.6, 2.6]) kit.cylinder(g, 0xb8bcc4, 0.22, 0.26, 1.1, x, 0.55, 1.9)
    return { object: g }
  },

  shrine_hall: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0xcfc3ab, 3.4, 0.4, 2.4, 0, 0.2, 0, { round: 0.06 })
    kit.box(g, 0xe8d6b4, 2.8, 1.6, 2.0, 0, 1.2, 0, { round: 0.1, occluder: true })
    for (const x of [-1.1, 1.1]) kit.cylinder(g, 0xa9503f, 0.14, 0.16, 1.8, x, 1.3, 1.0)
    kit.roof(g, 0x5c6f7d, 4.2, 3.4, 1.2, 2.5, { round: 0.05, occluder: true })
    kit.roof(g, 0x556878, 3.8, 3.0, 0.35, 2.05, { round: 0.05 })
    kit.box(g, 0x6b4a35, 1.1, 1.3, 0.14, 0, 0.85, 0.98, { round: 0.05 })
    kit.box(g, 0x8a6a4c, 1.3, 0.5, 0.5, 0, 0.5, 1.35, { round: 0.06 })
    for (const x of [-1.6, 1.6]) {
      kit.cylinder(g, 0xd9c9a4, 0.2, 0.22, 0.5, x, 1.75, 1.1, { emissive: 0.35 })
      kit.roof(g, 0xa9503f, 0.62, 0.62, 0.24, 2.02, { round: 0.04 })
    }
    return { object: g }
  },

  station: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0xe9dcc4, 3.0, 0.35, 2.6, 0, 0.18, 0, { round: 0.08 })
    kit.box(g, 0xf3e7cf, 2.4, 1.5, 1.5, -0.5, 1.1, -0.4, { round: 0.12, occluder: true })
    kit.windows(g, { width: 2.4, floors: 1, depth: 1.5, color: GLOW, y: 1.2 })
    kit.roof(g, ROOF_BLUE, 3.4, 2.4, 0.9, 2.0, { round: 0.06 })
    for (const x of [-1.4, -0.2, 1.0]) kit.cylinder(g, 0x6b7480, 0.08, 0.08, 2.2, x, 1.28, 0.9)
    kit.box(g, 0x7f8b96, 3.1, 0.14, 1.9, -0.2, 2.4, 0.4, { round: 0.05 })
    kit.sign(g, 0x2f6d78, 0.9, 1.75, 0.85)
    kit.box(g, 0xb98d5f, 0.9, 0.1, 0.4, 0.5, 0.62, 0.9, { round: 0.04 })
    for (const x of [-0.1, 1.1]) kit.box(g, 0x6b7480, 0.1, 0.44, 0.1, x, 0.4, 0.9, { round: 0.04 })
    for (const x of [1.2, 2.3]) kit.box(g, 0x8a8f96, 0.14, 0.12, 6.2, x, 0.1, 0, { round: 0.04 })
    for (let i = 0; i < 6; i++) kit.box(g, 0xa9825c, 1.5, 0.1, 0.22, 1.75, 0.06, -2.4 + i * 0.95, { round: 0.04 })
    return { object: g }
  },

  greenhouse: (kit, random) => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0xa29f86, 2.65, 0.26, 2.05, 0, 0.13, 0, { round: 0.05, surface: 'stone' })
    for (const x of [-1.23, 0, 1.23]) for (const z of [-0.94, 0.94]) {
      kit.box(g, CREAM, 0.07, 1.45, 0.07, x, 0.98, z, { round: 0.02 })
    }
    for (const x of [-1.23, 1.23]) kit.box(g, GLASS, 0.04, 1.4, 1.8, x, 0.98, 0, { opacity: 0.26, roughness: 0.18 })
    for (const z of [-0.94, 0.94]) {
      kit.box(g, GLASS, 2.44, 1.4, 0.035, 0, 0.98, z, { opacity: 0.26, roughness: 0.18 })
      kit.box(g, CREAM, 2.5, 0.065, 0.08, 0, 1.65, z)
      kit.box(g, CREAM, 2.5, 0.065, 0.08, 0, 0.64, z)
    }
    const slope = Math.hypot(1.06, 0.7), pitch = Math.atan2(0.7, 1.06)
    for (const side of [-1, 1]) {
      kit.box(g, GLASS, 2.64, 0.045, slope, 0, 2.02, side * 0.53, { rx: side * pitch, opacity: 0.35, roughness: 0.16 })
      for (const x of [-1.3, 0, 1.3]) kit.box(g, CREAM, 0.065, 0.07, slope + 0.08, x, 2.04, side * 0.53, { rx: side * pitch })
    }
    kit.box(g, CREAM, 2.76, 0.09, 0.09, 0, 2.4, 0)
    for (const z of [-0.45, 0.45]) {
      kit.box(g, WOOD, 2.05, 0.34, 0.5, 0, 0.4, z, { surface: 'wood' })
      kit.box(g, 0x5b4430, 1.94, 0.045, 0.42, 0, 0.59, z, { surface: 'soil' })
      for (let i = 0; i < 4; i++) leafCluster(kit, g, 0x6a9d48, random, [-0.72 + i * 0.48, 0.73, z], [0.18, 0.16, 0.18], 16, 0.085)
    }
    kit.door(g, 0x89aaa1, 0.85, 0.84, 1.0, 0.54, 1.24)
    return { object: g }
  },

  submarine_dome: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, 0x9fb0b8, 2.3, 2.5, 0.5, 0, 0.25, 0, { occluder: true })
    kit.cylinder(g, 0xb8c6cc, 2.1, 2.1, 0.2, 0, 0.55, 0)
    const glass = kit.dome(g, GLASS, 2.0, 0, 0.6, 0, { opacity: 0.42 })
    glass.castShadow = false
    for (let i = 0; i < 4; i++) {
      const arch = kit.torus(g, 0xd8e2e6, 2.0, 0.07, 0, 0.6, 0, { rx: Math.PI / 2, rz: (i * Math.PI) / 4 })
      arch.castShadow = false
    }
    kit.sphere(g, 0x7fd8e8, 0.5, 0, 2.05, 0, { emissive: 0.55 })
    kit.cylinder(g, 0x8c9aa2, 0.9, 1.0, 0.7, 0, 0.5, 2.2, { occluder: true })
    kit.cylinder(g, 0xdfe8ea, 0.66, 0.66, 0.1, 0, 0.62, 2.6, { emissive: 0.3 })
    for (let i = 0; i < 3; i++) kit.cylinder(g, 0xb9c6cc, 0.12, 0.12, 0.5, -1.9 + i * 1.9, 0.3, -2.4, { rx: Math.PI / 2 })
    return { object: g }
  },

  workshop: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0xc9b393, 2.2, 1.6, 1.8, 0, 0.8, 0, { round: 0.14, occluder: true })
    kit.roof(g, 0x8c7b68, 2.8, 2.3, 0.85, 1.9, { round: 0.06, occluder: true })
    kit.box(g, 0x6f6659, 0.7, 1.0, 0.05, 0.62, 0.72, 0.92, { round: 0.04 })
    kit.cylinder(g, 0x8a8f96, 0.22, 0.26, 1.5, -0.7, 2.4, -0.4)
    kit.sphere(g, 0xb9c2cc, 0.3, -0.7, 3.2, -0.4)
    const wheel = kit.torus(g, 0x7d8792, 0.42, 0.12, 1.2, 0.55, 0.4, { ry: Math.PI / 2 })
    kit.box(g, WOOD_DARK, 1.0, 0.14, 0.6, 1.35, 0.62, 0.7, { round: 0.05 })
    for (const [x, z] of [[0.95, 0.5], [1.75, 0.5], [0.95, 0.95], [1.75, 0.95]]) kit.box(g, WOOD_DARK, 0.1, 0.6, 0.1, x, 0.3, z, { round: 0.03 })
    kit.box(g, 0x9c8a6a, 0.45, 0.45, 0.45, 1.5, 0.85, 0.72, { round: 0.06 })
    return { object: g, animate: time => { wheel.rotation.x = time * 1.6 } }
  },

  torii: kit => {
    const g = kit.group(new THREE.Group())
    for (const side of [-1, 1]) {
      kit.cylinder(g, 0xc25a4a, 0.18, 0.22, 3.2, side * 1.5, 1.6, 0, { occluder: true })
      kit.cylinder(g, 0x4a4450, 0.34, 0.38, 0.3, side * 1.5, 0.15, 0)
      const end = kit.box(g, 0x4a4450, 0.55, 0.2, 0.4, side * 2.0, 3.35, 0, { round: 0.06 })
      end.rotation.z = side * 0.18
    }
    kit.box(g, 0xc25a4a, 3.9, 0.24, 0.36, 0, 2.75, 0, { round: 0.08, occluder: true })
    kit.box(g, 0x4a4450, 4.5, 0.22, 0.44, 0, 3.34, 0, { round: 0.08, occluder: true })
    kit.box(g, 0xd8c9a8, 0.7, 0.5, 0.12, 0, 3.0, 0.16, { round: 0.04 })
    return { object: g }
  },

  // The signature object of 《装甲恶鬼村正》: a cursed blade resting on its rack.
  sword_rack: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, WOOD_DARK, 1.5, 0.16, 0.9, 0, 0.08, 0, { round: 0.06 })
    kit.box(g, 0x3c3648, 1.3, 0.1, 0.7, 0, 0.2, 0, { round: 0.04 })
    for (const side of [-1, 1]) {
      kit.box(g, WOOD, 0.16, 1.15, 0.16, side * 0.55, 0.75, 0, { round: 0.06 })
      kit.box(g, WOOD, 0.2, 0.12, 0.2, side * 0.55, 1.35, 0, { round: 0.06 })
    }
    kit.box(g, WOOD, 1.3, 0.12, 0.16, 0, 1.32, 0, { round: 0.06 })
    kit.box(g, 0x8f2f3d, 1.15, 0.08, 0.34, 0, 1.4, 0, { round: 0.03 })
    // The blade itself, lying across the rack.
    const katana = kit.group(g, 0, 1.52, 0, 0.06)
    kit.box(katana, 0xdfe6ee, 0.1, 0.05, 1.5, 0, 0, -0.25, { round: 0.02, metalness: 0.75, roughness: 0.22 })
    kit.box(katana, 0xf2f6fa, 0.035, 0.055, 1.42, -0.045, 0.005, -0.25, { round: 0.01, metalness: 0.9, roughness: 0.12 })
    kit.torus(katana, 0x6b5a3c, 0.13, 0.035, 0, 0, 0.52, { rx: Math.PI / 2 })
    kit.cylinder(katana, 0x2f2a38, 0.06, 0.07, 0.62, 0, 0, 0.9, { rx: Math.PI / 2 })
    for (let i = 0; i < 5; i++) kit.torus(katana, 0xc9b184, 0.068, 0.012, 0, 0, 0.66 + i * 0.13, { rx: Math.PI / 2 })
    kit.sphere(katana, 0xc9b184, 0.085, 0, 0, 1.23)
    // A faint curse aura hovering over the blade.
    const aura = kit.torus(g, 0xd94a5a, 0.55, 0.02, 0, 1.75, 0, { rx: Math.PI / 2, emissive: 1.2 })
    aura.castShadow = false
    const motes = kit.group(g, 0, 1.7, 0)
    const sparks = [0, 1, 2, 3, 4].map(i => kit.sphere(motes, 0xff8f9a, 0.05, Math.sin(i * 1.3) * 0.4, 0.1 + i * 0.09, Math.cos(i * 1.3) * 0.4, { emissive: 1.4 }))
    return {
      object: g,
      animate: time => {
        aura.rotation.z = time * 0.6
        aura.position.y = 1.75 + Math.sin(time * 1.4) * 0.05
        sparks.forEach((spark, i) => {
          spark.position.y = 0.1 + ((time * 0.35 + i * 0.19) % 0.55)
        })
      }
    }
  },

  katana_display: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0x2f2a38, 0.9, 0.14, 0.7, 0, 0.07, 0, { round: 0.05 })
    kit.box(g, 0x4a3f52, 0.8, 0.1, 0.6, 0, 0.19, 0, { round: 0.04 })
    for (const z of [-0.22, 0.22]) {
      kit.box(g, 0x8f6f9c, 0.1, 0.6, 0.1, -0.28, 0.5, z, { round: 0.04 })
      kit.box(g, 0x8f6f9c, 0.1, 0.6, 0.1, 0.28, 0.5, z, { round: 0.04 })
    }
    const blade = kit.group(g, 0, 0.86, 0, Math.PI / 2)
    kit.box(blade, 0xe4ebf2, 0.09, 0.05, 1.35, 0, 0, -0.2, { round: 0.02, metalness: 0.8, roughness: 0.18 })
    kit.torus(blade, 0x5a4a30, 0.12, 0.03, 0, 0, 0.48, { rx: Math.PI / 2 })
    kit.cylinder(blade, 0x241f2c, 0.055, 0.065, 0.5, 0, 0, 0.78, { rx: Math.PI / 2 })
    const glow = kit.torus(g, 0xc23a4c, 0.42, 0.018, 0, 0.9, 0, { rx: Math.PI / 2, emissive: 1.1 })
    glow.castShadow = false
    return { object: g, animate: time => { glow.rotation.z = -time * 0.5 } }
  },

  armor_display: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0x8c8f9a, 1.6, 0.16, 1.0, 0, 0.08, 0, { round: 0.06, occluder: true })
    kit.box(g, 0x767a86, 1.2, 0.12, 0.7, 0, 0.22, 0, { round: 0.05 })
    kit.box(g, 0x6b6f7b, 0.5, 0.14, 0.5, 0, 0.3, 0, { round: 0.06 })
    for (const side of [-1, 1]) {
      kit.box(g, 0x99a0ac, 0.22, 1.3, 0.26, side * 0.28, 0.95, 0, { round: 0.08, metalness: 0.35 })
      kit.box(g, 0x7f8794, 0.3, 0.3, 0.36, side * 0.28, 0.35, 0.02, { round: 0.1, metalness: 0.35 })
    }
    const torso = kit.group(g, 0, 1.95, 0)
    kit.box(torso, 0xa9b1bd, 0.86, 1.0, 0.6, 0, 0, 0, { round: 0.16, metalness: 0.4 })
    kit.box(torso, 0x8d95a2, 0.62, 0.5, 0.64, 0, 0.36, 0.02, { round: 0.12, metalness: 0.4 })
    kit.box(torso, 0xc23a4c, 0.16, 0.36, 0.06, 0, -0.1, 0.32, { emissive: 0.5, round: 0.03 })
    for (const side of [-1, 1]) {
      kit.sphere(torso, 0x99a0ac, 0.34, side * 0.62, 0.3, 0, { sx: 1, sy: 0.85, sz: 1, metalness: 0.45 })
      kit.cone(torso, 0xb6bec9, 0.26, 0.4, side * 0.86, 0.28, 0, { rz: side * 0.5, metalness: 0.45 })
      kit.capsule(torso, 0x7f8794, 0.12, 0.5, side * 0.68, -0.28, 0.1, { rz: side * 0.2 })
    }
    const helmet = kit.group(g, 0, 2.85, 0)
    kit.sphere(helmet, 0xbcc4cf, 0.33, 0, 0, 0, { sy: 0.95, metalness: 0.45 })
    kit.box(helmet, 0x6d7480, 0.52, 0.14, 0.4, 0, -0.14, 0.06, { round: 0.05, metalness: 0.4 })
    const visor = kit.box(helmet, 0xff5a68, 0.44, 0.1, 0.06, 0, -0.03, 0.32, { emissive: 1.1, round: 0.03 })
    kit.cone(helmet, 0xc23a4c, 0.34, 0.34, 0, -0.36, 0.06, { rx: Math.PI })
    kit.box(helmet, 0x9aa2ae, 0.1, 0.42, 0.1, 0, 0.34, -0.24, { round: 0.04 })
    return {
      object: g,
      animate: time => { (visor.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + Math.sin(time * 2.4) * 0.5 }
    }
  },

  machinery: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, 0x6f7885, 1.1, 1.2, 1.8, 0, 0.9, 0, { occluder: true })
    kit.cylinder(g, 0x8f98a4, 1.24, 1.24, 0.16, 0, 0.22, 0)
    kit.cylinder(g, 0x8f98a4, 1.24, 1.24, 0.16, 0, 1.62, 0)
    kit.sphere(g, 0xa7b0bc, 1.08, 0, 1.95, 0, { sy: 0.5, occluder: true })
    kit.cylinder(g, 0x5c6470, 0.2, 0.24, 1.2, 0.6, 2.6, 0.2)
    kit.cylinder(g, 0x5c6470, 0.3, 0.24, 0.3, 0.6, 3.2, 0.2)
    const flywheel = kit.torus(g, 0x59616d, 0.75, 0.14, -1.35, 1.0, 0, { ry: Math.PI / 2 })
    for (let i = 0; i < 4; i++) kit.box(g, 0x4d545f, 0.1, 1.4, 0.1, -1.35, 1.0, 0, { ry: Math.PI / 2, rz: (i * Math.PI) / 4 })
    for (const z of [-0.7, 0.7]) kit.cylinder(g, 0x707a86, 0.12, 0.12, 2.2, 0.9, 1.1, z, { rx: Math.PI / 2 })
    kit.torus(g, 0xd9a35c, 0.2, 0.05, 0.4, 1.1, 1.16, { rx: 0, emissive: 0.4 })
    kit.torus(g, 0x7fd8e8, 0.16, 0.04, -0.5, 1.35, 1.16, { rx: 0, emissive: 0.5 })
    const steam = kit.group(g, 0.6, 3.35, 0.2)
    const puffs = [0, 1, 2].map(i => kit.sphere(steam, 0xdfe6ea, 0.22 + i * 0.06, 0, 0, 0, { opacity: 0.4 }))
    puffs.forEach(puff => { puff.castShadow = false })
    return {
      object: g,
      animate: time => {
        flywheel.rotation.z = time * 1.1
        puffs.forEach((puff, i) => {
          const phase = (time * 0.5 + i / 3) % 1
          puff.position.y = phase * 1.6
          puff.scale.setScalar(0.6 + phase * 1.1)
          ;(puff.material as THREE.MeshStandardMaterial).opacity = 0.42 * (1 - phase)
        })
      }
    }
  },

  train: kit => {
    const g = kit.group(new THREE.Group())
    const loco = kit.group(g, 0, 0, -2.2)
    kit.cylinder(loco, 0x3f5468, 0.62, 0.62, 2.6, 0, 1.2, 0, { rx: Math.PI / 2, occluder: true })
    kit.box(loco, 0x46607a, 1.3, 1.0, 1.1, 0, 1.3, 1.5, { round: 0.12, occluder: true })
    kit.box(loco, 0x8fd0e0, 0.9, 0.44, 0.06, 0, 1.5, 2.06, { emissive: 0.3, round: 0.03 })
    kit.cylinder(loco, 0x2f3b4a, 0.24, 0.3, 0.7, 0, 1.95, -1.0, { occluder: true })
    kit.cylinder(loco, 0x2f3b4a, 0.34, 0.24, 0.24, 0, 2.36, -1.0)
    kit.box(loco, 0xd9a35c, 0.34, 0.34, 0.2, 0, 1.15, -1.35, { emissive: 0.6, round: 0.06 })
    for (const z of [-0.9, 0.6]) for (const x of [-0.62, 0.62]) {
      const wheel = kit.cylinder(loco, 0x2a3038, 0.42, 0.42, 0.16, x, 0.52, z, { rz: Math.PI / 2, metalness: 0.4 })
      wheel.userData.wheel = true
    }
    kit.box(loco, 0x3f5468, 1.7, 0.2, 3.6, 0, 0.24, 0, { round: 0.06 })
    const carriage = kit.group(g, 0, 0, 1.6)
    kit.box(carriage, 0x7ba0ad, 1.5, 1.5, 3.4, 0, 1.25, 0, { round: 0.16, occluder: true })
    kit.box(carriage, 0xe6ecef, 1.66, 0.24, 3.6, 0, 2.1, 0, { round: 0.08 })
    for (const x of [-0.76, 0.76]) for (let i = 0; i < 4; i++) {
      kit.box(carriage, GLOW, 0.05, 0.62, 0.62, x, 1.4, -1.3 + i * 0.85, { emissive: 0.45, round: 0.04 })
    }
    for (const z of [-1.2, 1.2]) for (const x of [-0.6, 0.6]) kit.cylinder(carriage, 0x2a3038, 0.3, 0.3, 0.14, x, 0.42, z, { rz: Math.PI / 2 })
    kit.box(carriage, 0x5c6b78, 1.4, 0.18, 3.5, 0, 0.26, 0, { round: 0.06 })
    return { object: g }
  },

  piano: kit => {
    const g = kit.group(new THREE.Group())
    const body = kit.group(g, 0, 0.92, 0)
    kit.box(body, 0x2c2a34, 1.5, 0.4, 1.5, 0, 0, 0, { round: 0.16 })
    kit.box(body, 0x3a3746, 1.4, 0.22, 1.4, 0, 0.28, 0, { round: 0.1 })
    kit.box(body, 0xf7f2e6, 0.86, 0.06, 0.4, 0, 0.2, 0.72, { round: 0.02 })
    for (let i = 0; i < 10; i++) kit.box(body, 0x1c1a22, 0.05, 0.04, 0.26, -0.38 + i * 0.085, 0.24, 0.66, { round: 0.01 })
    const lid = kit.box(body, 0x25232c, 1.5, 0.1, 1.5, 0, 0.55, -0.05, { round: 0.06 })
    lid.rotation.x = -0.75
    lid.position.z = -0.42
    kit.cylinder(body, 0x8f8f9c, 0.05, 0.05, 0.7, 0, 0.75, -0.5, { rx: -0.75 })
    for (const [x, z] of [[-0.62, 0.6], [0.62, 0.6], [0, -0.6]]) kit.cylinder(g, 0x2c2a34, 0.09, 0.12, 0.95, x, 0.47, z)
    const bench = kit.group(g, 0, 0, 1.35)
    kit.box(bench, 0x3a3746, 0.9, 0.1, 0.34, 0, 0.52, 0, { round: 0.05 })
    for (const x of [-0.34, 0.34]) kit.box(bench, 0x2c2a34, 0.1, 0.52, 0.28, x, 0.26, 0, { round: 0.04 })
    return { object: g }
  },

  bookshelf: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, WOOD, 1.3, 2.3, 0.42, 0, 1.15, 0, { round: 0.08, occluder: true })
    kit.box(g, WOOD_DARK, 1.2, 2.1, 0.36, 0, 1.15, 0.08, { round: 0.06 })
    const colors = [0xc46a5a, 0x5a8fa8, 0x6fa87a, 0xd9b45c, 0x8a6fa8, 0xc98fa8]
    for (let shelf = 0; shelf < 3; shelf++) {
      kit.box(g, WOOD_LIGHT, 1.16, 0.06, 0.34, 0, 0.62 + shelf * 0.66, 0.12, { round: 0.02 })
      for (let i = 0; i < 9; i++) {
        const width = 0.08 + ((i * 7) % 3) * 0.02
        kit.box(g, colors[(i + shelf) % colors.length], width, 0.34 + ((i * 5) % 4) * 0.03, 0.26,
          -0.5 + i * 0.12, 0.83 + shelf * 0.66, 0.14, { round: 0.015 })
      }
    }
    kit.box(g, WOOD, 1.3, 0.12, 0.46, 0, 2.34, 0, { round: 0.05 })
    return { object: g }
  },

  sakura_tree: (kit, random) => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, 0x6f5748, 0.2, 0.3, 2.0, 0, 1.0, 0, { occluder: true })
    for (const [x, z, r] of [[-0.5, 0.2, 0.12], [0.45, -0.3, 0.11], [0.1, 0.5, 0.1]]) {
      kit.cylinder(g, 0x6f5748, 0.07, 0.11, 1.2, x, 2.2, z, { rz: x * 0.4, rx: -z * 0.4 })
    }
    kit.sphere(g, 0xe59aaf, 1.0, 0, 2.85, 0, { sy: 0.68, surface: 'leaf' })
    leafCluster(kit, g, 0xf3a9bd, random, [0, 2.9, 0], [1.18, 0.84, 1.12], 270, 0.19)
    for (let i = 0; i < 8; i++) kit.sphere(g, 0xffe0e4, 0.065, Math.sin(i * 2.2) * 1.1, 3.05 + Math.sin(i * 1.4) * 0.55, Math.cos(i * 2.2) * 1.1, { sy: 0.7 })
    return { object: g }
  },

  magic_tree: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, 0x5f4a3c, 0.32, 0.55, 2.6, 0, 1.3, 0, { occluder: true })
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      kit.cylinder(g, 0x5f4a3c, 0.14, 0.26, 0.9, Math.sin(angle) * 0.42, 0.35, Math.cos(angle) * 0.42, { rz: Math.sin(angle) * 0.7, rx: -Math.cos(angle) * 0.7 })
    }
    const canopy = kit.group(g, 0, 3.3, 0)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      kit.sphere(canopy, i % 2 ? 0x4fbf9a : 0x6fd9b0, 0.62, Math.sin(angle) * 0.62, (i % 2) * 0.4, Math.cos(angle) * 0.62, { shade: 'toon', emissive: 0.18, sway: 0.025 })
    }
    const core = kit.sphere(canopy, 0xbdf3c6, 0.34, 0, 0.35, 0, { emissive: 0.8 })
    const motes = kit.group(g, 0, 3.6, 0)
    const sparks = [0, 1, 2, 3, 4, 5].map(i => kit.sphere(motes, 0xd8ffe8, 0.05,
      Math.sin(i * 2.1) * 0.8, (i % 3) * 0.3, Math.cos(i * 2.1) * 0.8, { emissive: 1.2 }))
    return {
      object: g,
      animate: time => {
        core.scale.setScalar(1 + Math.sin(time * 1.6) * 0.08)
        sparks.forEach((spark, i) => {
          const phase = (time * 0.25 + i / 6) % 1
          spark.position.y = phase * 1.4
          spark.position.x = Math.sin(i * 2.1 + time * 0.5) * 0.8
        })
      }
    }
  },

  crystal_spire: kit => {
    const g = kit.group(new THREE.Group())
    kit.rock(g, kit.p.stone, 0.42, 0, 0.12, 0, { sy: 0.5 })
    const crystals: THREE.Mesh[] = []
    const scale = [[0, 0, 1.5, 0.34], [0.3, 0.15, 1.0, 0.22], [-0.28, -0.1, 0.85, 0.2], [0.05, -0.3, 0.7, 0.16]]
    scale.forEach(([x, z, height, radius], i) => {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(1),
        kit.resources.material(kit.p.accent, { emissive: 0.55 - i * 0.08, opacity: 0.88, roughness: 0.2 })
      )
      crystal.position.set(x, 0.2 + height / 2, z)
      crystal.scale.set(radius, height, radius)
      crystal.rotation.y = i * 0.7
      g.add(crystal)
      crystals.push(crystal)
    })
    return { object: g, animate: time => { crystals[0].rotation.y = time * 0.25 } }
  },

  planet_model: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, METAL_DARK, 0.4, 0.55, 0.24, 0, 0.12, 0, { occluder: true })
    kit.cylinder(g, METAL, 0.08, 0.08, 1.2, 0, 0.8, 0)
    const planet = kit.group(g, 0, 1.8, 0)
    kit.sphere(planet, 0xbca5d8, 0.62, 0, 0, 0, { emissive: 0.12 })
    const ring = kit.torus(planet, kit.p.accent, 0.95, 0.05, 0, 0, 0, { rx: 1.15, emissive: 0.4 })
    kit.sphere(planet, 0xe8d8f0, 0.1, 0.3, 0.32, 0.32)
    const moon = kit.group(planet, 1.25, 0.15, 0)
    kit.sphere(moon, 0xd8d8e0, 0.14, 0, 0, 0)
    return {
      object: g,
      animate: time => {
        planet.rotation.y = time * 0.2
        ring.rotation.z = time * 0.05
        moon.position.set(Math.cos(time * 0.6) * 1.25, Math.sin(time * 0.6) * 0.3, Math.sin(time * 0.6) * 1.25)
      }
    }
  },

  telescope: kit => {
    const g = kit.group(new THREE.Group())
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2
      kit.box(g, METAL_DARK, 0.08, 1.1, 0.08, Math.sin(angle) * 0.34, 0.55, Math.cos(angle) * 0.34, { rz: Math.sin(angle) * 0.25, rx: -Math.cos(angle) * 0.25 })
    }
    kit.cylinder(g, METAL, 0.12, 0.12, 0.12, 0, 1.12, 0)
    const tube = kit.group(g, 0, 1.28, 0, 0)
    tube.rotation.x = -0.5
    kit.cylinder(tube, 0xd2d9da, 0.16, 0.2, 1.5, 0, 0, 0, { rx: Math.PI / 2 })
    kit.cylinder(tube, 0x8f9aa4, 0.2, 0.2, 0.14, 0, 0.02, 0.78, { rx: Math.PI / 2 })
    kit.cylinder(tube, kit.p.accent, 0.1, 0.1, 0.16, 0, 0, -0.8, { rx: Math.PI / 2, emissive: 0.4 })
    return { object: g }
  },

  clock_monument: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, kit.p.stone, 1.1, 0.3, 1.1, 0, 0.15, 0, { round: 0.08, occluder: true })
    kit.box(g, STONE_LIGHT, 0.75, 2.0, 0.75, 0, 1.3, 0, { round: 0.1, occluder: true })
    kit.box(g, kit.p.stone, 0.95, 0.16, 0.95, 0, 2.36, 0, { round: 0.06 })
    const face = clockFace(kit.resources, 0.42, kit.p.night)
    face.position.set(0, 2.85, 0.42)
    g.add(face)
    kit.sphere(g, 0xd9b45c, 0.14, 0, 3.35, 0, { emissive: 0.3 })
    return { object: g }
  },

  coral_arch: kit => {
    const g = kit.group(new THREE.Group())
    for (let i = 0; i < 7; i++) {
      const angle = Math.PI * (i / 6)
      const x = -Math.cos(angle) * 0.85, y = Math.sin(angle) * 1.15
      kit.capsule(g, i % 2 ? 0xe08fb0 : 0x7fd0c4, 0.13, 0.28, x, y + 0.2, 0, { rz: -angle + Math.PI / 2, shade: 'toon' })
    }
    for (let i = 0; i < 4; i++) kit.sphere(g, 0xf0b0c8, 0.11, -0.6 + i * 0.4, 1.5 + (i % 2) * 0.2, 0.1, { shade: 'toon' })
    kit.rock(g, 0xb8a894, 0.4, 0, 0.05, 0, { sy: 0.45 })
    return { object: g }
  },

  globe_monument: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, kit.p.stone, 0.55, 0.7, 0.32, 0, 0.16, 0, { occluder: true })
    kit.cylinder(g, METAL_DARK, 0.1, 0.14, 0.7, 0, 0.6, 0)
    const globe = kit.group(g, 0, 1.4, 0)
    kit.sphere(globe, 0x6fa8c8, 0.62, 0, 0, 0, { emissive: 0.1 })
    for (let i = 0; i < 4; i++) kit.sphere(globe, 0x7fc48f, 0.26, Math.sin(i * 1.9) * 0.34, Math.sin(i * 2.7) * 0.34, Math.cos(i * 1.9) * 0.34, { sx: 1.3, sy: 0.9, sz: 1.1 })
    const ring = kit.torus(globe, 0xd9b45c, 0.78, 0.035, 0, 0, 0, { rx: 0.4, emissive: 0.2 })
    return { object: g, animate: time => { globe.rotation.y = time * 0.25; ring.rotation.z = Math.PI / 4 } }
  },

  tree: (kit, random) => {
    const g = kit.group(new THREE.Group())
    if (kit.p.biome === 'coast') {
      for (let i = 0; i < 5; i++) {
        kit.cylinder(g, i % 2 ? 0xb18e61 : 0xa28055, 0.12 + (4 - i) * 0.015, 0.15 + (4 - i) * 0.02,
          0.56, Math.sin(i * 0.3) * 0.22, 0.28 + i * 0.5, 0, { rz: -0.07, surface: 'bark', occluder: true })
      }
      const fronds = new THREE.InstancedMesh(kit.resources.geometry('leaf', 1), kit.resources.material(0xffffff,
        { roughness: 0.88, surface: 'leaf', sway: 0.025, side: THREE.DoubleSide }), 112)
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3()
      const tint = new THREE.Color()
      let index = 0
      for (let branch = 0; branch < 8; branch++) {
        const angle = branch * Math.PI / 4, sin = Math.sin(angle), cos = Math.cos(angle)
        const stem = kit.group(g, 0.2, 2.7, 0, angle)
        kit.box(stem, 0x759841, 0.038, 0.035, 1.9, 0, -0.12, 0.94, { rx: 0.16, round: 0.012 })
        for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
          const t = i / 6, x = side * 0.12, z = 0.22 + t * 1.52
          position.set(0.2 + x * cos + z * sin, 2.85 - t * t * 0.64, -x * sin + z * cos)
          rotation.setFromEuler(new THREE.Euler(0.15 + t * 0.2, angle + side * 1.05, side * 0.05))
          scale.set(0.18 * (1 - t * 0.48), 0.18, 0.42 * (1 - t * 0.25))
          matrix.compose(position, rotation, scale); fronds.setMatrixAt(index, matrix)
          tint.set(branch % 2 ? 0x7faa4d : 0x5e9947).lerp(new THREE.Color(0xd2d985), t * 0.15)
          fronds.setColorAt(index++, tint)
        }
      }
      fronds.castShadow = true; fronds.receiveShadow = true; g.add(fronds)
      for (let i = 0; i < 3; i++) kit.sphere(g, 0xa18451, 0.16, 0.2 + Math.sin(i * 2.1) * 0.18, 2.58, Math.cos(i * 2.1) * 0.18)
      return { object: g }
    }
    if (kit.p.biome === 'winter') {
      kit.cylinder(g, 0x957454, 0.12, 0.23, 1.2, 0, 0.6, 0, { surface: 'bark', occluder: true })
      for (let i = 0; i < 3; i++) {
        const radius = 1.06 - i * 0.23, height = 1.5 - i * 0.2, y = 1.35 + i * 0.6
        kit.cone(g, i % 2 ? 0x68937d : 0x547967, radius, height, 0, y, 0, { roughness: 0.95 })
        kit.cone(g, 0xf5faf7, radius * 0.84, height * 0.77, 0, y + height * 0.115 + 0.025, 0, { roughness: 0.95, surface: 'snow' })
      }
      return { object: g }
    }
    kit.cylinder(g, 0xa37a4e, 0.15, 0.27, 1.8, 0, 0.9, 0, { surface: 'bark', occluder: true })
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3
      kit.capsule(g, 0xa37a4e, 0.09, 0.22, Math.sin(a) * 0.18, 0.15, Math.cos(a) * 0.18,
        { rx: Math.cos(a) * 0.8, rz: -Math.sin(a) * 0.8, surface: 'bark' })
    }
    const snow = kit.p.ground === 0xf0f6f8
    const leaf = kit.p.night ? kit.p.foliage : new THREE.Color(kit.p.foliage).lerp(new THREE.Color(0x83ba50), 0.85).getHex()
    const canopy = kit.group(g, 0, 1.95, 0)
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3
      const color = new THREE.Color(leaf).lerp(new THREE.Color(0xd4eaa2), i * 0.06).getHex()
      kit.sphere(canopy, color, 0.68, Math.sin(a) * 0.3, i === 0 ? 0.12 : 0, Math.cos(a) * 0.3,
        { sy: 0.85, surface: 'leaf', sway: 0.012 })
    }
    const crown = snow ? 0xfafcf7 : new THREE.Color(leaf).lerp(new THREE.Color(0xd4eaa2), 0.18).getHex()
    kit.sphere(canopy, crown, 0.76, 0, 0.48, -0.03, { sy: 0.8, surface: snow ? undefined : 'leaf', sway: 0.012 })
    leafCluster(kit, canopy, snow ? 0xf4faf3 : leaf, random, [0, 0.27, 0], [1.01, 0.88, 1.01], 240, 0.2)
    if (!snow && !kit.p.night && random() > 0.55) {
      for (const [x, y, z] of [[-0.46, 0.04, 0.55], [0.54, 0.18, 0.44], [0.06, 0.54, 0.67]]) {
        kit.sphere(canopy, 0xf5a044, 0.15, x, y, z, { roughness: 0.75 })
        kit.sphere(canopy, 0x4c8e47, 0.07, x + 0.03, y + 0.16, z, { sy: 0.45 })
      }
    }
    return { object: g }
  },

  bush: (kit, random) => {
    const g = kit.group(new THREE.Group())
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      kit.sphere(g, i % 2 ? 0x69ad6b : 0x85be73, 0.38, Math.sin(angle) * 0.24, 0.28 + (i % 2) * 0.12, Math.cos(angle) * 0.24,
        { sy: 0.85, surface: 'leaf', sway: 0.015 })
    }
    leafCluster(kit, g, kit.p.night ? 0x5e8274 : 0x5c9d4e, random, [0, 0.34, 0], [0.59, 0.4, 0.58], 82, 0.14)
    return { object: g }
  },

  flower_patch: kit => {
    const g = kit.group(new THREE.Group())
    const colors = [0xf2a7bd, 0xffd18a, 0xf7f0d0, 0xc9a7f2, 0xf28f8f]
    for (let i = 0; i < 7; i++) {
      const angle = i * 1.9, radius = 0.1 + (i % 3) * 0.14
      const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius
      kit.cylinder(g, 0x6fa87a, 0.02, 0.02, 0.3, x, 0.15, z, { sway: 0.06 })
      kit.sphere(g, 0xf3c95d, 0.05, x, 0.33, z, { sy: 0.6 })
      for (let petal = 0; petal < 5; petal++) {
        const a = petal * Math.PI * 2 / 5
        kit.sphere(g, colors[i % colors.length], 0.065, x + Math.sin(a) * 0.07, 0.32, z + Math.cos(a) * 0.07, { sy: 0.45, sway: 0.025 })
      }
    }
    return { object: g }
  },

  flower_bed: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, 0x7d5a3c, 1.5, 0.28, 1.0, 0, 0.14, 0, { round: 0.08 })
    kit.box(g, 0x4a3a2c, 1.32, 0.12, 0.84, 0, 0.28, 0, { round: 0.04 })
    const colors = [0xf2a7bd, 0xffd18a, 0xf7f0d0, 0xc9a7f2]
    for (let i = 0; i < 10; i++) {
      const x = -0.55 + (i % 5) * 0.28, z = -0.24 + Math.floor(i / 5) * 0.48
      kit.cylinder(g, 0x6fa87a, 0.02, 0.02, 0.26, x, 0.42, z, { sway: 0.06 })
      kit.sphere(g, 0xf3c95d, 0.05, x, 0.58, z, { sy: 0.65 })
      for (let petal = 0; petal < 5; petal++) {
        const a = petal * Math.PI * 2 / 5
        kit.sphere(g, colors[i % colors.length], 0.07, x + Math.sin(a) * 0.075, 0.57, z + Math.cos(a) * 0.075, { sy: 0.45, sway: 0.025 })
      }
    }
    return { object: g }
  },

  vegetable_patch: (kit, random) => {
    const g = kit.group(new THREE.Group())
    kit.box(g, WOOD, 2.1, 0.22, 1.7, 0, 0.11, 0, { round: 0.05, surface: 'wood' })
    kit.box(g, 0x745039, 1.96, 0.06, 1.56, 0, 0.25, 0, { round: 0.035, surface: 'soil' })
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
      const x = -0.72 + col * 0.48, z = -0.4 + row * 0.8
      leafCluster(kit, g, row ? 0x6f9c40 : 0x568e40, random, [x, 0.43, z], [0.18, 0.17, 0.2], 20, 0.08)
      kit.sphere(g, row ? 0xdf9245 : 0xd7654b, 0.09, x - 0.045, 0.46, z + 0.14)
      kit.sphere(g, row ? 0xe9b659 : 0xf18762, 0.07, x + 0.08, 0.47, z + 0.08)
    }
    for (const x of [-0.9, 0.9]) {
      kit.box(g, WOOD_DARK, 0.035, 0.75, 0.035, x, 0.52, -0.56)
      kit.box(g, 0xe9d9b4, 0.32, 0.2, 0.035, x, 0.85, -0.56, { round: 0.025 })
    }
    return { object: g }
  },

  picnic_set: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, WOOD_LIGHT, 1.45, 0.14, 0.85, 0, 0.86, 0, { round: 0.05, surface: 'wood' })
    for (const x of [-0.53, 0.53]) for (const z of [-0.28, 0.28]) kit.box(g, WOOD_DARK, 0.09, 0.8, 0.09, x, 0.4, z, { rz: x * 0.12 })
    for (const z of [-0.85, 0.85]) {
      kit.box(g, WOOD, 1.55, 0.1, 0.35, 0, 0.44, z, { round: 0.04, surface: 'wood' })
      for (const x of [-0.56, 0.56]) kit.box(g, WOOD_DARK, 0.1, 0.4, 0.22, x, 0.2, z)
    }
    kit.box(g, 0xe9a38a, 0.7, 0.025, 0.78, 0, 0.95, 0, { round: 0.012 })
    for (const x of [-0.42, 0.42]) {
      kit.cylinder(g, CREAM, 0.1, 0.085, 0.15, x, 1.02, 0.12)
      kit.torus(g, CREAM, 0.058, 0.018, x + 0.12, 1.02, 0.12)
      kit.cylinder(g, CREAM, 0.18, 0.18, 0.025, x, 0.965, -0.14)
      kit.sphere(g, 0xd7a266, 0.1, x, 1.02, -0.14, { sy: 0.45 })
    }
    kit.cylinder(g, 0x6d9c94, 0.14, 0.2, 0.18, 0, 1.04, 0)
    kit.dome(g, 0x6d9c94, 0.15, 0, 1.13, 0)
    kit.sphere(g, 0x6d9c94, 0.035, 0, 1.3, 0)
    return { object: g }
  },

  lantern: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, kit.p.stone, 0.36, 0.42, 0.22, 0, 0.11, 0)
    kit.cylinder(g, WOOD_DARK, 0.09, 0.1, 1.5, 0, 0.95, 0)
    const glow = kit.box(g, GLOW, 0.4, 0.46, 0.4, 0, 1.9, 0, { emissive: 0.85, round: 0.06 })
    glow.castShadow = false
    kit.box(g, WOOD_DARK, 0.5, 0.1, 0.5, 0, 1.68, 0, { round: 0.04 })
    kit.roof(g, WOOD_DARK, 0.72, 0.72, 0.3, 2.22, { round: 0.04 })
    kit.sphere(g, 0xd9b45c, 0.07, 0, 2.44, 0, { emissive: 0.4 })
    if (kit.p.night) { const light = new THREE.PointLight(GLOW, 4.2, 4, 2); light.position.set(0, 1.85, 0); g.add(light) }
    return { object: g }
  },

  street_lamp: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, METAL_DARK, 0.12, 0.22, 0.3, 0, 0.15, 0)
    kit.cylinder(g, METAL_DARK, 0.07, 0.09, 2.6, 0, 1.45, 0, { occluder: true })
    for (const side of [-1, 1]) {
      kit.cylinder(g, METAL_DARK, 0.05, 0.05, 0.7, side * 0.28, 2.7, 0, { rz: side * 1.1 })
      kit.cone(g, 0x3f4652, 0.24, 0.24, side * 0.52, 2.74, 0, { rz: Math.PI })
      const bulb = kit.sphere(g, GLOW, 0.16, side * 0.52, 2.58, 0, { emissive: 1 })
      bulb.castShadow = false
    }
    kit.sphere(g, METAL_DARK, 0.11, 0, 2.85, 0)
    return { object: g }
  },

  bench: kit => {
    const g = kit.group(new THREE.Group())
    for (const x of [-0.62, 0.62]) {
      kit.box(g, METAL_DARK, 0.12, 0.5, 0.5, x, 0.25, 0, { round: 0.04 })
    }
    for (let i = 0; i < 4; i++) kit.box(g, WOOD, 1.6, 0.08, 0.12, 0, 0.54, -0.2 + i * 0.14, { round: 0.03 })
    for (let i = 0; i < 3; i++) kit.box(g, WOOD, 1.6, 0.1, 0.08, 0, 0.72 + i * 0.16, -0.28, { rx: -0.22, round: 0.03 })
    return { object: g }
  },

  fence: kit => {
    const g = kit.group(new THREE.Group())
    for (let i = 0; i < 4; i++) kit.box(g, WOOD_LIGHT, 0.12, 0.9, 0.12, -1.05 + i * 0.7, 0.45, 0, { round: 0.04 })
    for (const y of [0.35, 0.68]) kit.box(g, WOOD_LIGHT, 2.2, 0.1, 0.09, 0, y, 0, { round: 0.03 })
    return { object: g }
  },

  signpost: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, WOOD_DARK, 0.09, 0.11, 2.0, 0, 1.0, 0, { occluder: true })
    const board = kit.box(g, WOOD_LIGHT, 0.9, 0.3, 0.08, 0.32, 1.75, 0, { round: 0.05 })
    board.rotation.y = -0.18
    const board2 = kit.box(g, WOOD_LIGHT, 0.78, 0.26, 0.08, -0.28, 1.38, 0, { round: 0.05 })
    board2.rotation.y = Math.PI + 0.15
    kit.sphere(g, WOOD_DARK, 0.12, 0, 2.05, 0)
    return { object: g }
  },

  crate: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, WOOD, 0.68, 0.68, 0.68, 0, 0.34, 0, { round: 0.07 })
    for (const y of [0.12, 0.56]) kit.box(g, WOOD_DARK, 0.72, 0.08, 0.72, 0, y, 0, { round: 0.03 })
    kit.box(g, WOOD_DARK, 0.72, 0.08, 0.1, 0, 0.34, 0.34, { round: 0.03 })
    return { object: g }
  },

  well: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, kit.p.stone, 0.72, 0.78, 0.7, 0, 0.35, 0, { occluder: true })
    kit.torus(g, STONE_LIGHT, 0.74, 0.09, 0, 0.7, 0, { rx: Math.PI / 2 })
    kit.cylinder(g, 0x2f4a5c, 0.6, 0.6, 0.1, 0, 0.62, 0, { emissive: 0.05 })
    for (const side of [-1, 1]) kit.box(g, WOOD_DARK, 0.1, 1.5, 0.1, side * 0.6, 1.45, 0, { round: 0.04 })
    kit.roof(g, ROOF_RED, 1.7, 1.3, 0.5, 2.35, { round: 0.05 })
    kit.cylinder(g, WOOD, 0.07, 0.07, 1.0, 0, 2.0, 0, { rz: Math.PI / 2 })
    kit.box(g, WOOD_DARK, 0.3, 0.3, 0.3, 0, 1.55, 0, { round: 0.06 })
    return { object: g }
  },

  market_stall: kit => {
    const g = kit.group(new THREE.Group())
    kit.box(g, WOOD, 1.5, 0.14, 0.8, 0, 0.85, 0, { round: 0.05 })
    kit.box(g, WOOD_DARK, 1.4, 0.7, 0.7, 0, 0.45, 0, { round: 0.06 })
    for (const [x, z] of [[-0.62, -0.3], [0.62, -0.3], [-0.62, 0.3], [0.62, 0.3]]) kit.box(g, WOOD_DARK, 0.09, 1.6, 0.09, x, 0.8, z, { round: 0.03 })
    for (let i = 0; i < 5; i++) {
      kit.box(g, i % 2 ? 0xf6ead4 : 0xe0787f, 0.38, 0.12, 1.2, -0.76 + i * 0.38, 1.75, 0, { round: 0.05 })
    }
    kit.box(g, 0xf6ead4, 1.9, 0.1, 0.14, 0, 1.68, 0.62, { round: 0.04 })
    const goods = [0xe08a5a, 0x8fc46a, 0xf0d060, 0xd06a7a]
    goods.forEach((color, i) => {
      kit.sphere(g, color, 0.1, -0.5 + i * 0.32, 0.99, 0.05, { shade: 'toon' })
      kit.sphere(g, color, 0.1, -0.5 + i * 0.32, 1.16, 0.05, { shade: 'toon' })
    })
    return { object: g }
  },

  mailbox: kit => {
    const g = kit.group(new THREE.Group())
    kit.cylinder(g, WOOD_DARK, 0.08, 0.1, 0.9, 0, 0.45, 0)
    kit.box(g, 0xc45a5a, 0.42, 0.34, 0.6, 0, 1.05, 0, { round: 0.12 })
    kit.dome(g, 0xc45a5a, 0.21, 0, 1.22, 0, { sz: 1.4 })
    kit.box(g, 0xf6ead4, 0.1, 0.2, 0.06, 0.16, 1.05, 0.28, { round: 0.02 })
    kit.box(g, 0xd9b45c, 0.06, 0.22, 0.06, -0.2, 1.2, 0.1, { round: 0.02 })
    return { object: g }
  },

  snowman: kit => {
    const g = kit.group(new THREE.Group())
    kit.sphere(g, 0xf8f8f2, 0.5, 0, 0.5, 0, { sy: 0.95 })
    kit.sphere(g, 0xf8f8f2, 0.34, 0, 1.15, 0)
    kit.sphere(g, 0x2f2a30, 0.05, -0.12, 1.2, 0.3)
    kit.sphere(g, 0x2f2a30, 0.05, 0.12, 1.2, 0.3)
    kit.cone(g, 0xe08a3a, 0.06, 0.28, 0, 1.12, 0.34, { rx: Math.PI / 2 })
    kit.box(g, 0x2f2a30, 0.5, 0.12, 0.5, 0, 1.48, 0, { round: 0.05 })
    kit.box(g, 0x2f2a30, 0.36, 0.3, 0.36, 0, 1.65, 0, { round: 0.08 })
    kit.box(g, 0xc45a5a, 0.6, 0.12, 0.14, 0, 0.95, 0.34, { round: 0.04 })
    for (const side of [-1, 1]) kit.cylinder(g, WOOD_DARK, 0.04, 0.05, 0.7, side * 0.5, 1.05, 0, { rz: side * 0.9 })
    return { object: g }
  },

  dinghy: kit => {
    const g = kit.group(new THREE.Group())
    kit.sphere(g, 0xc59160, 0.72, 0, 0.28, 0, { sx: 1, sy: 0.42, sz: 1.9 })
    kit.box(g, 0x8f6a44, 0.86, 0.1, 1.9, 0, 0.46, 0, { round: 0.05 })
    kit.cylinder(g, WOOD_DARK, 0.06, 0.06, 2.4, 0, 1.5, 0)
    const sail = kit.box(g, 0xf7f0dc, 0.1, 1.6, 1.3, 0.1, 1.6, 0, { rz: 0.06, round: 0.05 })
    sail.rotation.y = Math.PI / 2
    kit.box(g, 0xc59160, 0.1, 0.24, 1.6, 0, 0.5, 0, { round: 0.04 })
    return { object: g, animate: time => { g.position.y = Math.sin(time * 0.9) * 0.06; g.rotation.z = Math.sin(time * 0.7) * 0.04 } }
  }
}

export function buildModel(id: string, resources: SceneResources, palette: ModelPalette, random: () => number): BuiltModel | null {
  const builder = BUILDERS[id]
  if (!builder) return null
  const kit = new Kit(resources, palette)
  const built = builder(kit, random)
  built.object.traverse(child => {
    child.userData.modelId = id
  })
  return built
}

export function hasModel(id: string): boolean {
  return !!BUILDERS[id]
}

export const MODEL_IDS = Object.keys(BUILDERS)
