import * as THREE from 'three'

// Two camera moods: a tilted chase camera for wandering, and an orbit-and-pan
// god view for building. Both are the same rig, so switching modes eases rather
// than cuts.

export type CameraMode = 'follow' | 'build'

export interface UpdateContext {
  /** Meshes the camera should not see through (tall buildings). */
  occluders: THREE.Object3D[]
  groundAt(x: number, z: number): number
}

export interface CameraRig {
  camera: THREE.PerspectiveCamera
  mode: CameraMode
  setMode(mode: CameraMode): void
  orbit(dx: number, dy: number): void
  zoom(delta: number): void
  /** Pan by screen-space pixels (mouse drag). */
  pan(dx: number, dy: number): void
  /** Pan by world units (keyboard in build mode). */
  panBy(dx: number, dz: number): void
  frameIsland(): void
  reset(): void
  update(delta: number, target: THREE.Vector3, context: UpdateContext): void
  resize(aspect: number): void
  /** Ray from a screen position onto a horizontal plane. */
  groundPoint(ndcX: number, ndcY: number, planeY: number, out: THREE.Vector3): THREE.Vector3 | null
}

const FOLLOW = { distance: 18.5, pitch: 0.56, minDistance: 6, maxDistance: 26, minPitch: 0.3, maxPitch: 1.15 }
const BUILD = { distance: 24, pitch: 1.1, minDistance: 11, maxDistance: 72, minPitch: 0.55, maxPitch: 1.5 }

export function createCameraRig(aspect: number, radius: number): CameraRig {
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.4, 400)
  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  let mode: CameraMode = 'follow'
  let yaw = 0
  let pitch = FOLLOW.pitch
  let distance = FOLLOW.distance
  let targetPitch = FOLLOW.pitch
  let targetDistance = FOLLOW.distance
  const focus = new THREE.Vector3(0, 0, 0)
  const lookAt = new THREE.Vector3()
  const desired = new THREE.Vector3()
  const offset = new THREE.Vector3()
  const followFocus = new THREE.Vector3()
  let currentDistance = FOLLOW.distance

  const limits = (): typeof FOLLOW => (mode === 'follow' ? FOLLOW : BUILD)

  return {
    camera,
    get mode() { return mode },
    setMode(next) {
      mode = next
      targetPitch = mode === 'follow' ? FOLLOW.pitch : BUILD.pitch
      targetDistance = mode === 'follow' ? FOLLOW.distance : Math.max(BUILD.minDistance, radius * 1.9)
      if (mode === 'build') {
        focus.set(0, 0, 0)
        pitch = Math.min(BUILD.maxPitch, Math.max(pitch, BUILD.minPitch))
      }
    },
    orbit(dx, dy) {
      yaw -= dx * 0.0055
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.0045, limits().minPitch, limits().maxPitch)
      targetPitch = pitch
    },
    zoom(delta) {
      const next = THREE.MathUtils.clamp(distance * (1 + delta * 0.0016), limits().minDistance, limits().maxDistance)
      distance = next
      targetDistance = next
    },
    pan(dx, dy) {
      if (mode !== 'build') return
      const scale = distance * 0.0016
      const sin = Math.sin(yaw), cos = Math.cos(yaw)
      this.panBy(-(dx * cos - dy * sin) * scale, -(dx * sin + dy * cos) * scale)
    },
    panBy(dx, dz) {
      if (mode !== 'build') return
      focus.x += dx
      focus.z += dz
      const limit = radius * 1.5
      focus.x = THREE.MathUtils.clamp(focus.x, -limit, limit)
      focus.z = THREE.MathUtils.clamp(focus.z, -limit, limit)
    },
    frameIsland() {
      mode = 'build'
      focus.set(0, 0.6, 1)
      yaw = 0
      pitch = 1.08
      targetPitch = pitch
      // Fit the coast and arrival pier as well as the lawn. A fixed multiple of
      // the radius crops the island on narrow or short viewports.
      distance = (radius + 3.8) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect)) * 1.08
      targetDistance = distance
    },
    reset() {
      focus.set(0, 0, 0)
      yaw = 0
      pitch = FOLLOW.pitch
      targetPitch = pitch
      distance = FOLLOW.distance
      targetDistance = distance
    },
    update(delta, target, context) {
      const easing = 1 - Math.exp(-7 * delta)
      pitch += (targetPitch - pitch) * easing
      distance += (targetDistance - distance) * easing

      if (mode === 'follow') {
        const proximity = THREE.MathUtils.smoothstep(distance, FOLLOW.minDistance, FOLLOW.distance)
        const ahead = 0.4 + proximity * 3
        followFocus.copy(target)
        followFocus.x -= Math.sin(yaw) * ahead
        followFocus.z -= Math.cos(yaw) * ahead
        focus.lerp(followFocus, 1 - Math.exp(-9 * delta))
      }

      const focusHeight = 1.22 + THREE.MathUtils.smoothstep(distance, FOLLOW.minDistance, FOLLOW.distance) * 1.13
      lookAt.set(focus.x, focus.y + (mode === 'follow' ? focusHeight : 0), focus.z)
      offset.set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      ).multiplyScalar(distance)
      desired.copy(lookAt).add(offset)

      // Do not let tall scenery hide the avatar.
      if (mode === 'follow' && context.occluders.length) {
        const direction = desired.clone().sub(lookAt)
        const length = direction.length()
        direction.normalize()
        raycaster.set(lookAt, direction)
        raycaster.far = length
        const hits = raycaster.intersectObjects(context.occluders, false)
        if (hits.length) {
          const allowed = Math.max(2.6, hits[0].distance - 0.5)
          if (allowed < length) desired.copy(lookAt).addScaledVector(direction, allowed)
        }
      }

      currentDistance += (desired.distanceTo(lookAt) - currentDistance) * Math.min(1, delta * 6)
      const floor = context.groundAt(desired.x, desired.z) + 0.85
      if (desired.y < floor) desired.y = floor

      camera.position.lerp(desired, 1 - Math.exp(-10 * delta))
      camera.lookAt(lookAt.x, lookAt.y + 0.2, lookAt.z)
    },
    resize(nextAspect) {
      camera.aspect = nextAspect
      camera.updateProjectionMatrix()
    },
    groundPoint(ndcX, ndcY, planeY, out) {
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      raycaster.far = Infinity
      plane.constant = -planeY
      const hit = raycaster.ray.intersectPlane(plane, out)
      return hit ? out : null
    }
  }
}
