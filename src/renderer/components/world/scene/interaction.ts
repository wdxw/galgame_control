import * as THREE from 'three'
import type { CameraMode, CameraRig } from './cameraRig'

// Player input: walking with the keyboard or by clicking the ground, collisions
// with placed scenery, prop picking and the build-mode placement cursor.

export interface Block {
  id?: string
  x: number
  z: number
  w: number
  d: number
}

export interface InteractionCallbacks {
  /** A prop was clicked (or the click landed on empty ground). */
  onPick(id: string | null, object: THREE.Object3D | null): void
  /** Build mode: commit the current placement at a ground position. */
  onPlace(x: number, z: number): void
}

export interface InteractionState {
  moving: boolean
  speed: number
  yaw: number
}

export interface Interaction {
  readonly state: InteractionState
  readonly position: THREE.Vector3
  /** Ground point under the cursor while a placement tool is armed. */
  readonly cursor: THREE.Vector3 | null
  setBlocks(blocks: Block[]): void
  setMode(mode: CameraMode): void
  setPlacing(placing: boolean): void
  teleport(x: number, z: number): void
  faceCamera(): void
  update(delta: number): void
  dispose(): void
}

const CELL = 0.5
const AGENT = 0.42
const WALK = 4.3
const RUN = 7.0

interface Cell { x: number; z: number }

class NavGrid {
  private readonly size: number
  private readonly origin: number
  private blocked: Uint8Array
  private blocks: Block[]

  constructor(private readonly radius: number, blocks: Block[], private readonly onDock: (x: number, z: number) => boolean,
    private readonly isWater: (x: number, z: number) => boolean) {
    this.blocks = blocks
    this.origin = -(radius + 2)
    this.size = Math.ceil(((radius + 2) * 2) / CELL)
    this.blocked = new Uint8Array(this.size * this.size)
    this.rebuild()
  }

  private index(x: number, z: number): number {
    const i = Math.round((x - this.origin) / CELL)
    const j = Math.round((z - this.origin) / CELL)
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return -1
    return j * this.size + i
  }

  private rebuild(): void {
    for (let j = 0; j < this.size; j++) {
      for (let i = 0; i < this.size; i++) {
        const x = this.origin + i * CELL
        const z = this.origin + j * CELL
        let solid = (Math.hypot(x, z) > this.radius - 0.34 && !this.onDock(x, z)) || this.isWater(x, z)
        if (!solid) {
          for (const block of this.blocks) {
            if (Math.abs(x - block.x) < block.w / 2 + AGENT && Math.abs(z - block.z) < block.d / 2 + AGENT) {
              solid = true
              break
            }
          }
        }
        this.blocked[j * this.size + i] = solid ? 1 : 0
      }
    }
  }

  setBlocks(blocks: Block[]): void {
    this.blocks = blocks
    this.rebuild()
  }

  solid(x: number, z: number): boolean {
    const index = this.index(x, z)
    return index < 0 ? true : this.blocked[index] === 1
  }

  /** Nearest walkable cell centre to a point, searched in growing rings. */
  nearest(x: number, z: number): Cell | null {
    if (!this.solid(x, z)) return { x, z }
    for (let ring = 1; ring <= 14; ring++) {
      for (let a = 0; a < ring * 8; a++) {
        const angle = (a / (ring * 8)) * Math.PI * 2
        const cx = x + Math.cos(angle) * ring * CELL
        const cz = z + Math.sin(angle) * ring * CELL
        if (!this.solid(cx, cz)) return { x: cx, z: cz }
      }
    }
    return null
  }

  /** Straight-line visibility test used to smooth the raw grid path. */
  lineFree(ax: number, az: number, bx: number, bz: number): boolean {
    const distance = Math.hypot(bx - ax, bz - az)
    const steps = Math.ceil(distance / (CELL * 0.5))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      if (this.solid(ax + (bx - ax) * t, az + (bz - az) * t)) return false
    }
    return true
  }

  find(from: Cell, to: Cell): Cell[] | null {
    const start = this.index(from.x, from.z)
    const goal = this.index(to.x, to.z)
    if (start < 0 || goal < 0) return null
    const total = this.size * this.size
    const cameFrom = new Int32Array(total).fill(-1)
    const gScore = new Float32Array(total).fill(Infinity)
    const closed = new Uint8Array(total)
    const open: number[] = [start]
    const fScore = new Float32Array(total).fill(Infinity)
    gScore[start] = 0
    fScore[start] = Math.hypot(to.x - from.x, to.z - from.z)

    const heuristic = (index: number): number => {
      const i = index % this.size
      const j = Math.floor(index / this.size)
      const x = this.origin + i * CELL
      const z = this.origin + j * CELL
      return Math.hypot(x - to.x, z - to.z)
    }

    let guard = 0
    while (open.length && guard++ < total * 2) {
      let best = 0
      for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[best]]) best = i
      const current = open.splice(best, 1)[0]
      if (current === goal) {
        const path: Cell[] = []
        let node = current
        while (node !== -1) {
          const i = node % this.size
          const j = Math.floor(node / this.size)
          path.push({ x: this.origin + i * CELL, z: this.origin + j * CELL })
          node = cameFrom[node]
        }
        return path.reverse()
      }
      closed[current] = 1
      const ci = current % this.size
      const cj = Math.floor(current / this.size)
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = ci + di
          const nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= this.size || nj >= this.size) continue
          const neighbour = nj * this.size + ni
          if (closed[neighbour] || this.blocked[neighbour]) continue
          if (di && dj) {
            // No cutting corners diagonally through a wall.
            if (this.blocked[cj * this.size + ni] || this.blocked[nj * this.size + ci]) continue
          }
          const step = di && dj ? CELL * Math.SQRT2 : CELL
          const tentative = gScore[current] + step
          if (tentative >= gScore[neighbour]) continue
          cameFrom[neighbour] = current
          gScore[neighbour] = tentative
          fScore[neighbour] = tentative + heuristic(neighbour)
          if (!open.includes(neighbour)) open.push(neighbour)
        }
      }
    }
    return null
  }
}

export function createInteraction(options: {
  dom: HTMLElement
  rig: CameraRig
  radius: number
  groundAt(x: number, z: number): number
  pickGround?(raycaster: THREE.Raycaster, out: THREE.Vector3): THREE.Vector3 | null
  onDock(x: number, z: number): boolean
  isWater(x: number, z: number): boolean
  blocks: Block[]
  props: THREE.Object3D
  callbacks: InteractionCallbacks
}): Interaction {
  const { dom, rig, radius, groundAt, onDock, props, callbacks } = options
  const grid = new NavGrid(radius, options.blocks, onDock, options.isWater)
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const state: InteractionState = { moving: false, speed: 0, yaw: 0 }
  const position = new THREE.Vector3(0, 0, 0)
  const cursor = new THREE.Vector3()
  const keys = new Set<string>()
  let path: Cell[] = []
  let placing = false
  let hasCursor = false
  let mode: CameraMode = 'follow'
  let dragging = false
  let dragStart = { x: 0, y: 0 }
  let lastPointer = { x: 0, y: 0 }
  let pointerInside = false

  const groundPoint = (): THREE.Vector3 | null => {
    raycaster.setFromCamera(pointer, rig.camera)
    return options.pickGround ? options.pickGround(raycaster, cursor) : rig.groundPoint(pointer.x, pointer.y, 0, cursor)
  }

  const updatePointer = (event: PointerEvent): void => {
    const rect = dom.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) return
    // Capture keeps a drag alive outside the canvas; an unknown pointer id
    // (synthetic events, a stale touch) is not an error worth breaking on.
    try { dom.setPointerCapture(event.pointerId) } catch { /* not capturable */ }
    dragging = false
    dragStart = { x: event.clientX, y: event.clientY }
    lastPointer = { x: event.clientX, y: event.clientY }
    updatePointer(event)
    pointerInside = true
  }

  const onPointerMove = (event: PointerEvent): void => {
    updatePointer(event)
    pointerInside = true
    const dx = event.clientX - lastPointer.x
    const dy = event.clientY - lastPointer.y
    lastPointer = { x: event.clientX, y: event.clientY }
    if (event.buttons & 2) {
      rig.pan(dx, dy)
      dragging = true
      return
    }
    if (event.buttons & 1) {
      if (Math.abs(event.clientX - dragStart.x) + Math.abs(event.clientY - dragStart.y) > 5) dragging = true
      if (dragging) rig.orbit(dx, dy)
    }
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) return
    try { if (dom.hasPointerCapture(event.pointerId)) dom.releasePointerCapture(event.pointerId) } catch { /* already gone */ }
    if (dragging) {
      dragging = false
      return
    }
    updatePointer(event)
    raycaster.setFromCamera(pointer, rig.camera)
    const hits = raycaster.intersectObjects(props.children, true)
    const hit = hits.find(item => !item.object.userData.ignorePick)
    if (hit) {
      let node: THREE.Object3D | null = hit.object
      while (node && !node.userData.propId) node = node.parent
      callbacks.onPick(node?.userData.propId ?? null, node)
      return
    }
    if (placing) {
      const point = groundPoint()
      if (point) {
        hasCursor = true
        callbacks.onPlace(point.x, point.z)
      }
      return
    }
    const point = groundPoint()
    if (point) {
      hasCursor = true
      walkTo(point.x, point.z)
    }
    callbacks.onPick(null, null)
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    rig.zoom(event.deltaY)
  }

  const onContextMenu = (event: MouseEvent): void => event.preventDefault()

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') ||
      document.querySelector('.modal-panel, .world-panel, .world-catalog')) return
    const key = event.key.toLowerCase()
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      event.preventDefault()
      keys.add(key)
      path = []
    }
    if (key === 'shift') keys.add('shift')
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.key.toLowerCase())
  }

  const onBlur = (): void => {
    keys.clear()
    path = []
  }

  const onPointerLeave = (): void => { pointerInside = false; hasCursor = false }

  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointermove', onPointerMove)
  dom.addEventListener('pointerup', onPointerUp)
  dom.addEventListener('pointerleave', onPointerLeave)
  dom.addEventListener('wheel', onWheel, { passive: false })
  dom.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  function walkTo(x: number, z: number): void {
    const start = grid.nearest(position.x, position.z)
    const goal = grid.nearest(x, z)
    if (!start || !goal) return
    const raw = grid.find(start, goal)
    if (!raw || raw.length < 2) {
      path = raw && raw.length ? raw : []
      return
    }
    // String-pull the grid path so the avatar walks in straight lines.
    const smooth: Cell[] = [raw[0]]
    let anchor = 0
    for (let i = 2; i < raw.length; i++) {
      if (!grid.lineFree(raw[anchor].x, raw[anchor].z, raw[i].x, raw[i].z)) {
        smooth.push(raw[i - 1])
        anchor = i - 1
      }
    }
    smooth.push(raw[raw.length - 1])
    path = smooth.slice(1)
  }

  function moveAxis(dx: number, dz: number): void {
    const nextX = position.x + dx
    const nextZ = position.z + dz
    const blocked = (x: number, z: number): boolean => {
      if (Math.hypot(x, z) > radius - 0.3 && !onDock(x, z)) return true
      if (options.isWater(x, z)) return true
      return options.blocks.some(block =>
        Math.abs(x - block.x) < block.w / 2 + AGENT && Math.abs(z - block.z) < block.d / 2 + AGENT)
    }
    if (!blocked(nextX, position.z)) position.x = nextX
    if (!blocked(position.x, nextZ)) position.z = nextZ
  }

  return {
    state,
    position,
    get cursor() { return hasCursor ? cursor : null },
    setBlocks(blocks) {
      options.blocks = blocks
      grid.setBlocks(blocks)
    },
    setMode(next) {
      mode = next
      if (next === 'build') path = []
    },
    setPlacing(on) {
      placing = on
      hasCursor = on && pointerInside
      if (!on) hasCursor = false
    },
    teleport(x, z) {
      position.set(x, groundAt(x, z), z)
      path = []
    },
    faceCamera() {
      state.yaw = Math.atan2(rig.camera.position.x - position.x, rig.camera.position.z - position.z)
    },
    update(delta) {
      const forward = new THREE.Vector3(rig.camera.position.x - position.x, 0, rig.camera.position.z - position.z)
      if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1)
      forward.normalize()
      const right = new THREE.Vector3(-forward.z, 0, forward.x)

      let wish = new THREE.Vector3()
      if (keys.has('w') || keys.has('arrowup')) wish.sub(forward)
      if (keys.has('s') || keys.has('arrowdown')) wish.add(forward)
      if (keys.has('a') || keys.has('arrowleft')) wish.sub(right)
      if (keys.has('d') || keys.has('arrowright')) wish.add(right)

      if (mode === 'build') {
        // In the god view the same keys slide the camera over the island.
        if (wish.lengthSq() > 0) {
          wish.normalize()
          rig.panBy(wish.x * 16 * delta, wish.z * 16 * delta)
        }
        state.moving = false
        state.speed = 0
        if (placing) {
          const point = groundPoint()
          hasCursor = !!point && pointerInside
        }
        return
      }

      const running = keys.has('shift')
      let speed = 0
      if (wish.lengthSq() > 0) {
        wish.normalize()
        speed = running ? RUN : WALK
        moveAxis(wish.x * speed * delta, 0)
        moveAxis(0, wish.z * speed * delta)
        state.yaw = Math.atan2(wish.x, wish.z)
      } else if (path.length) {
        const waypoint = path[0]
        const dx = waypoint.x - position.x
        const dz = waypoint.z - position.z
        const distance = Math.hypot(dx, dz)
        if (distance < 0.22) {
          path.shift()
        } else {
          const step = Math.min(distance, WALK * delta)
          speed = WALK
          moveAxis((dx / distance) * step, 0)
          moveAxis(0, (dz / distance) * step)
          state.yaw = Math.atan2(dx, dz)
        }
      }

      position.y = groundAt(position.x, position.z)
      state.speed = speed
      state.moving = speed > 0.01

      if (placing) {
        const point = groundPoint()
        hasCursor = !!point && pointerInside
      }
    },
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointerleave', onPointerLeave)
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }
}
