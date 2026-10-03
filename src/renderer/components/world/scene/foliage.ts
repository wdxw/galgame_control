import * as THREE from 'three'
import type { Kit } from './modelKit'

/** Layered leaves replace the balloon silhouette without hundreds of draw calls. */
export function leafCluster(
  kit: Kit, parent: THREE.Object3D, color: number, random: () => number,
  centre: [number, number, number], radius: [number, number, number], count = 180, size = 0.22
): void {
  const leaves = new THREE.InstancedMesh(kit.resources.geometry('leaf', 1),
    kit.resources.material(0xffffff, { roughness: 0.9, side: THREE.DoubleSide, sway: 0.018, surface: 'leaf' }), count)
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), spin = new THREE.Quaternion()
  const normal = new THREE.Vector3(), point = new THREE.Vector3(), scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const base = new THREE.Color(color), light = new THREE.Color(0xf0eec2), tint = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963 + random() * 0.35
    const y = 1 - (i + 0.5) / count * 1.9
    const ring = Math.sqrt(1 - y * y)
    normal.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring)
    const uneven = 0.9 + random() * 0.17
    point.set(centre[0] + normal.x * radius[0] * uneven,
      centre[1] + normal.y * radius[1] * uneven, centre[2] + normal.z * radius[2] * uneven)
    rotation.setFromUnitVectors(up, normal)
    spin.setFromAxisAngle(up, random() * Math.PI * 2)
    rotation.multiply(spin)
    const length = size * (0.8 + random() * 0.65)
    scale.set(length, length, length * 1.15)
    matrix.compose(point, rotation, scale)
    leaves.setMatrixAt(i, matrix)
    tint.copy(base).lerp(light, Math.max(0, y) * 0.18 + random() * 0.09).multiplyScalar(0.94 + random() * 0.12)
    leaves.setColorAt(i, tint)
  }
  leaves.castShadow = true
  leaves.receiveShadow = true
  parent.add(leaves)
}
