import * as THREE from 'three'
import type { BlueprintPlacement, PlacedObject, WorldBlueprint, WorldQuality, WorldState } from '../../../../shared/types'
import { catalogModel } from '../../../../shared/worldCatalog'
import { randomFor, seedFor } from '../../../../shared/worldSeed'
import { createCameraRig } from './cameraRig'
import { createCharacter } from './character'
import { createInteraction, type Block } from './interaction'
import { buildModel } from './modelLibrary'
import type { ModelPalette } from './modelKit'
import { qualityFor } from './quality'
import { createStage } from './rendering'
import { createResources, releaseObject, type SceneResources } from './resources'
import { createTerrain } from './terrain'

// The world engine ties the pieces together: it turns a blueprint plus the
// player's edits into a live scene, runs the frame loop and routes input.

export type EngineMode = 'roam' | 'build'

export interface EngineOptions {
  canvas: HTMLCanvasElement
  blueprint: WorldBlueprint
  state: WorldState
  quality: WorldQuality
  /** The bound object was activated. */
  onLaunch(): void
  /** A prop was clicked; null clears the selection. */
  onInspect(prop: PlacedObject | null): void
  /** Reported when the player edits the layout so it can be persisted. */
  onDirty?(state: { placements: PlacedObject[]; removedElementIds: string[] }): void
  onModeChange?(mode: EngineMode): void
  /** Reported when the spot under the cursor stops, or starts, being placeable. */
  onHint?(hint: PlaceBlock | null): void
  launchLabel?: HTMLButtonElement | null
}

/** Why the spot under the build cursor is refused; the shell words it. */
export type PlaceBlock = 'outside' | 'plaza' | 'corridor' | 'dock' | 'taken' | 'river'

export interface WorldEngine {
  readonly mode: EngineMode
  setMode(mode: EngineMode): void
  /** Arm the build cursor with a catalog model, or null to disarm. */
  setTool(modelId: string | null): void
  readonly tool: string | null
  /** Reason the current cursor position is invalid, or null when it is valid. */
  readonly placementHint: PlaceBlock | null
  rotateTool(): void
  moveSelected(): void
  rotateSelected(): void
  removeSelected(): void
  undo(): void
  readonly canUndo: boolean
  frameIsland(): void
  resetCamera(): void
  /** CSS pixel position of a ground point, or null when it is behind the camera. */
  screenPoint(x: number, z: number): { x: number; y: number } | null
  /** CSS pixel position of the launch object, used to click it where it is drawn. */
  launchScreenPoint(): { x: number; y: number } | null
  propScreenPoint(id: string): { x: number; y: number } | null
  /** Frames drawn so far plus a census of the scene, for the UI suite and the FPS check. */
  stats(): EngineStats
  /** Rebuild the scene for a new blueprint (world regeneration). */
  rebuild(blueprint: WorldBlueprint, state: WorldState): void
  /** Apply edited placements without touching the island or the camera. */
  refreshState(state: WorldState): void
  pause(): void
  resume(): void
  dispose(): void
}

export interface EngineStats {
  /** Frames the engine has drawn since it started. */
  frames: number
  /** False while rendering is paused (after a launch, or with the tab hidden). */
  running: boolean
  props: number
  /** Where the camera sits, so a test can tell "framed the island" from "still easing". */
  camera: [number, number, number]
  avatar: [number, number, number]
  launch: string | null
  /**
   * Live GPU objects held by the renderer. Loading another world replaces the
   * whole scene, so these should come back to roughly the same numbers instead of
   * climbing with every switch.
   */
  resources: { geometries: number; textures: number; programs: number }
}

interface LiveProp {
  id: string
  modelId: string
  x: number
  z: number
  rot: number
  added: boolean
  object: THREE.Group
  animate?: (time: number) => void
}


function paletteOf(blueprint: WorldBlueprint): ModelPalette {
  return {
    biome: blueprint.biome,
    ground: blueprint.ground.color,
    stone: blueprint.ground.stone,
    water: blueprint.ground.water,
    foliage: blueprint.ground.foliage,
    accent: blueprint.ground.accent,
    sky: blueprint.ground.sky,
    night: blueprint.ground.night
  }
}

export function createWorldEngine(options: EngineOptions): WorldEngine {
  const { canvas, quality } = options
  const tier = qualityFor(quality)
  const resources: SceneResources = createResources()
  let blueprint = options.blueprint
  let palette = paletteOf(blueprint)
  let radius = blueprint.radius

  const rig = createCameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight), radius)
  const stage = createStage(canvas, rig.camera, blueprint, tier, resources)
  const character = createCharacter(resources, palette)

  const propsRoot = new THREE.Group()
  const editRoot = new THREE.Group()
  const pickRoot = new THREE.Group()
  pickRoot.add(propsRoot, editRoot)
  const ghostRoot = new THREE.Group()
  ghostRoot.visible = false
  stage.scene.add(pickRoot, ghostRoot, character.object)

  let terrain = createTerrain(resources, blueprint, tier)
  stage.scene.add(terrain.group)

  const props = new Map<string, LiveProp>()
  let occluders: THREE.Object3D[] = []
  let animators: ((time: number) => void)[] = []
  let blocks: Block[] = []
  let mode: EngineMode = 'roam'
  let tool: string | null = null
  let toolRotation = 0
  let hint: PlaceBlock | null = null
  // The refusal only reaches the shell when it changes: the cursor is tested on
  // every drawn frame, and the build bar has no reason to hear about it then.
  function setHint(next: PlaceBlock | null): void {
    if (next === hint) return
    hint = next
    options.onHint?.(next)
  }
  let selectedId: string | null = null
  let movingId: string | null = null
  let history: { added: PlacedObject[]; removed: string[] }[] = []
  let editable: { added: PlacedObject[]; removed: string[] } = {
    added: normalizePlacements(options.state.placements),
    removed: [...options.state.removedElementIds]
  }
  let propCounter = options.state.placements.length

  const selectionRing = new THREE.Mesh(
    resources.geometry('torus', 0.9, 0.06, 8, 32),
    resources.material(0xffffff, { emissive: 0.9, roughness: 0.4 })
  )
  selectionRing.rotation.x = Math.PI / 2
  selectionRing.visible = false
  selectionRing.userData.ignorePick = true
  stage.scene.add(selectionRing)

  const launchRing = new THREE.Mesh(
    resources.geometry('torus', 1.0, 0.07, 8, 40),
    resources.material(blueprint.ground.accent, { emissive: 0.8, roughness: 0.4 })
  )
  launchRing.rotation.x = Math.PI / 2
  launchRing.visible = false
  launchRing.userData.ignorePick = true
  stage.scene.add(launchRing)

  const ghostFloor = new THREE.Mesh(
    resources.roundedBox(1, 0.08, 1, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x7fe0b0, transparent: true, opacity: 0.4, depthWrite: false })
  )
  ghostRoot.add(ghostFloor)

  // --- scene assembly --------------------------------------------------------

  function instantiate(placement: BlueprintPlacement, id: string, added: boolean, into: THREE.Group): LiveProp | null {
    const random = randomFor(seedFor(`${blueprint.seed}:${placement.modelId}:${placement.x.toFixed(2)}:${placement.z.toFixed(2)}`))
    const built = buildModel(placement.modelId, resources, palette, random)
    const object = new THREE.Group()
    if (built) {
      object.add(built.object)
      object.userData.propId = id
    } else {
      // Recognized element without a model yet — a placeholder keeps the slot
      // visible so the feature panel can offer to fill it in later.
      object.userData.propId = id
      const kitMissing = buildModel('clock_monument', resources, palette, random)
      if (kitMissing) object.add(kitMissing.object)
      const marker = new THREE.Mesh(
        resources.roundedBox(0.42, 0.42, 0.42, 0.12),
        resources.material(blueprint.ground.accent, { emissive: 0.9, roughness: 0.3 })
      )
      marker.position.y = 3.1
      marker.userData.ignorePick = true
      object.add(marker)
    }
    object.position.set(placement.x, terrain.heightAt(placement.x, placement.z), placement.z)
    object.rotation.y = placement.rot
    object.scale.setScalar(placement.scale ?? 1)
    object.traverse(child => {
      if (child.userData.occluder) occluders.push(child)
      child.userData.propId = id
    })
    into.add(object)
    return {
      id,
      modelId: placement.modelId,
      x: placement.x,
      z: placement.z,
      rot: placement.rot,
      added,
      object,
      animate: built?.animate
    }
  }

  function effectiveLaunchId(): string | null {
    return launchOverride ?? blueprint.defaultLaunchElementId
  }
  let launchOverride: string | null = options.state.launchElementId
  let removedIds: string[] = [...options.state.removedElementIds]

  function buildGenerated(): void {
    releaseObject(propsRoot)
    propsRoot.clear()
    props.clear()
    occluders = []
    animators = []
    const entrance = blueprint.placements.find(item => item.modelId === effectiveLaunchId())
    blueprint.placements.forEach((placement, index) => {
      if (removedIds.includes(placement.modelId)) return
      if (placement.modelId === 'tree' && entrance && Math.hypot(placement.x - entrance.x, placement.z - entrance.z) < 2.1) return
      const live = instantiate(placement, `gen-${index}`, false, propsRoot)
      if (live) {
        props.set(live.id, live)
        if (live.animate) animators.push(live.animate)
      }
    })
  }

  function normalizePlacements(list: PlacedObject[]): PlacedObject[] {
    return list.map((item, index) => ({ ...item, addedId: item.addedId || `add-${index}` }))
  }

  function buildEdits(): void {
    releaseObject(editRoot)
    editRoot.clear()
    editable.added.forEach(placed => {
      const model = catalogModel(placed.modelId)
      const live = instantiate({
        modelId: placed.modelId,
        x: placed.x,
        z: placed.z,
        rot: placed.rot,
        scale: 1,
        block: model?.block ?? { w: 0.8, d: 0.8 }
      }, placed.addedId as string, true, editRoot)
      if (live) {
        props.set(live.id, live)
        if (live.animate) animators.push(live.animate)
      }
    })
    refreshBlocks()
  }

  function refreshBlocks(): void {
    blocks = []
    props.forEach(prop => {
      const model = catalogModel(prop.modelId)
      const block = model?.block ?? { w: 0.8, d: 0.8 }
      blocks.push({ id: prop.id, x: prop.x, z: prop.z, w: block.w, d: block.d })
    })
    interaction.setBlocks(blocks)
  }

  const projected = new THREE.Vector3()

  /** World point to CSS pixel, so the UI (and its tests) can aim at what is drawn. */
  function project(x: number, y: number, z: number): { x: number; y: number } | null {
    projected.set(x, y, z).project(rig.camera)
    if (projected.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height
    }
  }

  function updateLaunchRing(): void {
    const launchId = effectiveLaunchId()
    const target = [...props.values()].find(prop => prop.modelId === launchId)
    if (!target) {
      launchRing.visible = false
      return
    }
    const model = catalogModel(target.modelId)
    const size = Math.max(0.9, Math.max(model?.block.w ?? 1, model?.block.d ?? 1) * 0.72)
    launchRing.scale.setScalar(size)
    launchRing.position.set(target.x, terrain.heightAt(target.x, target.z) + 0.09, target.z)
    launchRing.visible = true
  }

  function rebuildAll(): void {
    // Regenerate building pads and ground cover when the player changes the
    // layout. Terrain-owned buffers are released before creating their replacement.
    stage.scene.remove(terrain.group)
    releaseObject(terrain.group)
    terrain = createTerrain(resources, blueprint, tier, editable.added)
    stage.scene.add(terrain.group)
    buildGenerated()
    buildEdits()
    updateLaunchRing()
    refreshSelectionRing()
  }

  /** Swaps in the stored edits; used both by a full rebuild and by lighter updates. */
  function applyState(nextState: WorldState): void {
    removedIds = [...nextState.removedElementIds]
    launchOverride = nextState.launchElementId
    editable = { added: normalizePlacements(nextState.placements), removed: [...nextState.removedElementIds] }
    propCounter = nextState.placements.length
    history = []
    selectedId = null
    rebuildAll()
  }

  function refreshSelectionRing(): void {
    const prop = selectedId ? props.get(selectedId) : null
    if (!prop) {
      selectionRing.visible = false
      return
    }
    const model = catalogModel(prop.modelId)
    selectionRing.scale.setScalar(Math.max(0.7, Math.max(model?.block.w ?? 1, model?.block.d ?? 1) * 0.6))
    selectionRing.position.set(prop.x, terrain.heightAt(prop.x, prop.z) + 0.07, prop.z)
    selectionRing.visible = true
  }

  // --- placement -------------------------------------------------------------

  function placementHintAt(x: number, z: number, modelId: string): PlaceBlock | null {
    const model = catalogModel(modelId)
    const block = model?.block ?? { w: 0.8, d: 0.8 }
    if (Math.hypot(x, z) > radius - 1.5) return 'outside'
    if (Math.hypot(x, z) < 3.6) return 'plaza'
    if (Math.abs(x) < 2.4 && z > 1.6) return 'corridor'
    if (Math.abs(x) < 3.6 && z > radius - 6) return 'dock'
    const collision = blocks.some(item => item.id !== movingId &&
      Math.abs(x - item.x) < block.w / 2 + item.w / 2 + 0.7 && Math.abs(z - item.z) < block.d / 2 + item.d / 2 + 0.7)
    if (collision) return 'taken'
    if (terrain.waterArea(x, z, Math.max(block.w, block.d) / 2 + 0.2)) return 'river'
    return null
  }

  function buildGhost(): void {
    ghostRoot.remove(ghostFloor)
    releaseObject(ghostRoot)
    ghostRoot.clear()
    ghostRoot.add(ghostFloor)
    if (!tool) {
      ghostRoot.visible = false
      return
    }
    const random = randomFor(seedFor('ghost:' + tool))
    const built = buildModel(tool, resources, palette, random)
    if (!built) {
      ghostRoot.visible = false
      return
    }
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: blueprint.ground.accent, transparent: true, opacity: 0.42, depthWrite: false
    })
    built.object.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        ;(child as THREE.Mesh).material = ghostMaterial
        child.castShadow = false
        child.receiveShadow = false
      }
      child.userData.ignorePick = true
    })
    ghostRoot.add(built.object)
    ghostRoot.visible = mode === 'build'
  }

  function commitPlacement(x: number, z: number): void {
    if (!tool) return
    x = Math.round(x * 4) / 4
    z = Math.round(z * 4) / 4
    if (placementHintAt(x, z, tool)) return
    pushHistory()
    if (movingId) {
      editable.added = editable.added.map(item => item.addedId === movingId ? { ...item, x, z, rot: toolRotation } : item)
      movingId = null
      tool = null
      ghostRoot.visible = false
      interaction.setPlacing(false)
      options.onInspect(null)
    } else {
    let key: string
    do { key = `add-${propCounter++}` } while (editable.added.some(item => item.addedId === key))
    editable.added.push({
      id: key,
      addedId: key,
      modelId: tool,
      x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100,
      rot: toolRotation
    })
    }
    rebuildAll()
    notifyDirty()
  }

  function pushHistory(): void {
    history.push({ added: editable.added.map(item => ({ ...item })), removed: [...removedIds] })
    if (history.length > 40) history.shift()
  }

  function notifyDirty(): void {
    options.onDirty?.({
      placements: editable.added,
      removedElementIds: removedIds
    })
  }

  // --- interaction -----------------------------------------------------------

  const interaction = createInteraction({
    dom: canvas,
    rig,
    radius,
    groundAt: (x, z) => terrain.heightAt(x, z),
    pickGround: (raycaster, out) => terrain.pick(raycaster, out),
    onDock: (x, z) => terrain.onDock(x, z),
    isWater: (x, z) => terrain.isWater(x, z),
    blocks,
    props: pickRoot,
    callbacks: {
      onPick(id) {
        selectedId = id
        refreshSelectionRing()
        const prop = id ? props.get(id) : null
        if (!prop) {
          options.onInspect(null)
          return
        }
        if (mode === 'roam' && prop.modelId === effectiveLaunchId()) {
          options.onLaunch()
          return
        }
        options.onInspect({
          id: prop.id,
          modelId: prop.modelId,
          x: prop.x,
          z: prop.z,
          rot: prop.rot,
          addedId: prop.added ? prop.id : undefined
        })
      },
      onPlace(x, z) {
        commitPlacement(x, z)
      }
    }
  })

  interaction.teleport(blueprint.spawn.x, blueprint.spawn.z)
  character.teleport(blueprint.spawn.x, 0, blueprint.spawn.z, 0)
  rig.reset()
  rebuildAll()

  // --- frame loop ------------------------------------------------------------

  const clock = new THREE.Clock()
  let running = true
  let frames = 0
  const occluderScratch: THREE.Object3D[] = []

  function frame(): void {
    frames++
    const delta = Math.min(0.05, clock.getDelta())
    interaction.update(delta)
    character.update(delta, interaction.state)
    character.object.position.copy(interaction.position)
    stage.blob.position.set(interaction.position.x, interaction.position.y + 0.02, interaction.position.z)
    stage.blob.scale.setScalar(tier.shadowMapSize > 0 ? 0.85 : 1.25)

    occluderScratch.length = 0
    for (const item of occluders) occluderScratch.push(item)
    rig.update(delta, interaction.position, { occluders: occluderScratch, groundAt: (x, z) => terrain.heightAt(x, z) })
    if (options.launchLabel) {
      rig.camera.updateMatrixWorld()
      const entrance = [...props.values()].find(item => item.modelId === effectiveLaunchId())
      const point = entrance ? project(entrance.x, terrain.heightAt(entrance.x, entrance.z) + 2.2, entrance.z) : null
      const rect = canvas.getBoundingClientRect()
      const visible = mode === 'roam' && point && point.x > rect.left + 20 && point.x < rect.right - 20 && point.y > rect.top + 90 && point.y < rect.bottom - 90
      options.launchLabel.style.visibility = visible ? 'visible' : 'hidden'
      if (point) options.launchLabel.style.transform = `translate(${point.x - rect.left}px, ${point.y - rect.top}px) translate(-50%, -100%)`
    }

    const time = resources.time.value
    terrain.update(time)
    for (const animate of animators) animate(time)
    const launchMaterial = launchRing.material as THREE.MeshStandardMaterial
    launchMaterial.emissiveIntensity = 0.7 + Math.sin(time * 2.2) * 0.35
    const selectionMaterial = selectionRing.material as THREE.MeshStandardMaterial
    selectionMaterial.emissiveIntensity = 0.8 + Math.sin(time * 3.4) * 0.3

    if (mode === 'build' && tool) {
      const cursor = interaction.cursor
      if (cursor) {
        const snapped = { x: Math.round(cursor.x * 4) / 4, z: Math.round(cursor.z * 4) / 4 }
        ghostRoot.position.set(snapped.x, terrain.heightAt(snapped.x, snapped.z) + 0.04, snapped.z)
        ghostRoot.rotation.y = toolRotation
        const blocked = placementHintAt(snapped.x, snapped.z, tool)
        setHint(blocked)
        const model = catalogModel(tool)
        const block = model?.block ?? { w: 1, d: 1 }
        ghostFloor.scale.set(block.w, 1, block.d)
        ;(ghostFloor.material as THREE.MeshBasicMaterial).color.set(blocked ? 0xe07a7a : 0x7fe0b0)
        ghostRoot.visible = true
      } else {
        // The cursor is off the island: there is nothing to refuse, so the last
        // refusal must not stay on screen while the ghost is hidden.
        setHint(null)
        ghostRoot.visible = false
      }
    } else {
      setHint(null)
    }

    stage.render(delta, rig.camera)
  }

  const observer = new ResizeObserver(() => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return
    rig.resize(width / height)
    stage.setSize(width, height)
  })
  observer.observe(canvas)

  stage.renderer.setAnimationLoop(frame)

  return {
    get mode() { return mode },
    setMode(next) {
      mode = next
      rig.setMode(next === 'build' ? 'build' : 'follow')
      interaction.setMode(next === 'build' ? 'build' : 'follow')
      ghostRoot.visible = next === 'build' && !!tool
      options.onModeChange?.(next)
    },
    setTool(modelId) {
      movingId = null
      tool = modelId
      toolRotation = 0
      buildGhost()
      interaction.setPlacing(!!modelId && mode === 'build')
    },
    get tool() { return tool },
    get placementHint() { return hint },
    rotateTool() {
      toolRotation += Math.PI / 8
      if (ghostRoot.visible) ghostRoot.rotation.y = toolRotation
    },
    moveSelected() {
      const prop = selectedId ? props.get(selectedId) : null
      if (!prop?.added || mode !== 'build') return
      movingId = prop.id
      tool = prop.modelId
      toolRotation = prop.rot
      buildGhost()
      interaction.setPlacing(true)
    },
    rotateSelected() {
      const prop = selectedId ? props.get(selectedId) : null
      if (!prop?.added || mode !== 'build') return
      pushHistory()
      editable.added = editable.added.map(item => item.addedId === prop.id ? { ...item, rot: item.rot + Math.PI / 4 } : item)
      rebuildAll()
      notifyDirty()
    },
    removeSelected() {
      if (!selectedId) return
      const prop = props.get(selectedId)
      if (!prop) return
      pushHistory()
      if (prop.added) {
        editable.added = editable.added.filter(item => item.addedId !== selectedId)
      } else if (!removedIds.includes(prop.modelId)) {
        removedIds.push(prop.modelId)
      }
      selectedId = null
      props.delete(prop.id)
      rebuildAll()
      options.onInspect(null)
      notifyDirty()
    },
    undo() {
      const previous = history.pop()
      if (!previous) return
      editable = { added: previous.added.map(item => ({ ...item })), removed: previous.removed }
      removedIds = [...previous.removed]
      rebuildAll()
      notifyDirty()
    },
    get canUndo() { return history.length > 0 },
    frameIsland() {
      mode = 'build'
      interaction.setMode('build')
      rig.frameIsland()
      options.onModeChange?.('build')
    },
    resetCamera() {
      mode = 'roam'
      tool = null
      movingId = null
      ghostRoot.visible = false
      interaction.setMode('follow')
      interaction.setPlacing(false)
      rig.setMode('follow')
      rig.reset()
      options.onModeChange?.('roam')
    },
    screenPoint(x, z) {
      return project(x, terrain.heightAt(x, z), z)
    },
    launchScreenPoint() {
      const target = [...props.values()].find(prop => prop.modelId === effectiveLaunchId())
      return target ? project(target.x, terrain.heightAt(target.x, target.z) + 1.2, target.z) : null
    },
    propScreenPoint(id) {
      const prop = props.get(id)
      return prop ? project(prop.x, terrain.heightAt(prop.x, prop.z) + 1, prop.z) : null
    },
    stats() {
      const { x, y, z } = rig.camera.position
      const info = stage.renderer.info
      return {
        frames,
        running,
        props: props.size,
        camera: [x, y, z],
        avatar: [interaction.position.x, interaction.position.y, interaction.position.z],
        launch: effectiveLaunchId(),
        resources: { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 }
      }
    },
    rebuild(nextBlueprint, nextState) {
      blueprint = nextBlueprint
      palette = paletteOf(blueprint)
      radius = blueprint.radius
      stage.scene.remove(terrain.group)
      releaseObject(terrain.group)
      terrain = createTerrain(resources, blueprint, tier)
      stage.scene.add(terrain.group)
      applyState(nextState)
      interaction.teleport(blueprint.spawn.x, blueprint.spawn.z)
      character.teleport(blueprint.spawn.x, 0, blueprint.spawn.z, 0)
    },
    refreshState(nextState) {
      applyState(nextState)
    },
    pause() {
      if (!running) return
      running = false
      stage.renderer.setAnimationLoop(null)
    },
    resume() {
      if (running) return
      running = true
      clock.getDelta()
      stage.renderer.setAnimationLoop(frame)
    },
    dispose() {
      observer.disconnect()
      stage.renderer.setAnimationLoop(null)
      interaction.dispose()
      for (const object of [pickRoot, ghostRoot, character.object, terrain.group, selectionRing, launchRing]) releaseObject(object)
      stage.scene.remove(pickRoot, ghostRoot, character.object, terrain.group, selectionRing, launchRing)
      resources.dispose()
      stage.dispose()
    }
  }
}
