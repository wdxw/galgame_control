import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import type { WorldBlueprint } from '../../../../shared/types'
import { randomFor } from '../../../../shared/worldSeed'
import type { QualitySettings } from './quality'
import type { SceneResources } from './resources'

// Renderer, lighting, sky, ambient particles and the optional post-processing
// chain. Everything here scales with the selected quality tier.

export interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  /** Soft contact shadow that follows the avatar. */
  blob: THREE.Mesh
  setSize(width: number, height: number): void
  render(delta: number, camera: THREE.Camera): void
  dispose(): void
}

function skyMaterial(top: number, bottom: number, horizon: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
      horizonColor: { value: new THREE.Color(horizon) }
    },
    vertexShader: [
      'varying vec3 vWorld;',
      'void main() {',
      '  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 topColor;',
      'uniform vec3 bottomColor;',
      'uniform vec3 horizonColor;',
      'varying vec3 vWorld;',
      'void main() {',
      '  float h = normalize(vWorld).y;',
      '  vec3 color = mix(bottomColor, topColor, smoothstep(-0.05, 0.65, h));',
      '  color = mix(color, horizonColor, 1.0 - smoothstep(0.0, 0.28, abs(h)));',
      '  gl_FragColor = vec4(color, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n'),
    side: THREE.BackSide,
    depthWrite: false
  })
}

function blobTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(0,0,0,0.42)')
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.18)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function moteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createStage(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  blueprint: WorldBlueprint,
  quality: QualitySettings,
  resources: SceneResources
): Stage {
  const ground = blueprint.ground
  const night = ground.night
  const radius = blueprint.radius
  const random = randomFor((blueprint.seed ^ 0x51ed270b) >>> 0)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.pixelRatio > 1.2,
    // The world is built for a discrete GPU by default; the quality tiers exist
    // for machines that would rather not wake it.
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Neutral preserves painted greens and warm roof colours under the soft key
  // light; a filmic highlight rolloff was turning the whole village grey.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = night ? 1.16 : 1.02
  renderer.shadowMap.enabled = quality.shadowMapSize > 0
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(new THREE.Color(ground.sky).lerp(new THREE.Color(0xffffff), night ? 0.02 : 0.18).getHex(), quality.fogDensity)

  // --- sky ------------------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 32, 18),
    skyMaterial(
      night ? 0x131a35 : ground.sky,
      night ? 0x2b3358 : new THREE.Color(ground.sky).lerp(new THREE.Color(0xffffff), 0.45).getHex(),
      night ? 0x3a3f66 : new THREE.Color(ground.sky).lerp(new THREE.Color(0xffe6c0), 0.35).getHex()
    )
  )
  scene.add(sky)

  if (night) {
    const starCount = Math.round(420 * quality.particles) + 80
    const positions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const theta = random() * Math.PI * 2
      const phi = Math.acos(random() * 0.9 + 0.05)
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * 150
      positions[i * 3 + 1] = Math.cos(phi) * 150
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * 150
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false
    }))
    scene.add(stars)
  }

  // --- lighting -------------------------------------------------------------
  const sun = new THREE.DirectionalLight(night ? 0xb6cbef : 0xfff0d2, night ? 1.15 : 2.2)
  sun.position.set(-radius * 0.85, radius * 1.5, radius * 0.65)
  if (quality.shadowMapSize > 0) {
    sun.castShadow = true
    sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
    const extent = radius * 1.15
    sun.shadow.camera.left = -extent
    sun.shadow.camera.right = extent
    sun.shadow.camera.top = extent
    sun.shadow.camera.bottom = -extent
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = radius * 5
    sun.shadow.bias = -0.0006
    sun.shadow.normalBias = 0.04
    sun.shadow.radius = quality.softShadows ? 2.6 : 1
  }
  scene.add(sun)
  scene.add(sun.target)

  const hemisphere = new THREE.HemisphereLight(
    night ? 0x94aed5 : 0xdbedff,
    night ? 0x485777 : 0xcbb79d,
    night ? 1.25 : 1.15
  )
  scene.add(hemisphere)

  const fill = new THREE.DirectionalLight(night ? 0xbdb4dc : 0xe1ecff, night ? 0.45 : 0.3)
  fill.position.set(-radius, radius * 0.8, -radius * 0.6)
  scene.add(fill)

  // A quiet horizon of small worlds makes the library feel connected to a
  // larger star garden. Ordinary work worlds keep their own theme's horizon.
  if (blueprint.kind === 'hub' || blueprint.biome === 'scifi' || blueprint.biome === 'fantasy') {
    for (let i = 0; i < 4; i++) {
      const island = new THREE.Group()
      island.position.set(-38 + i * 25, 2.5 + (i % 2) * 4, -48 - (i % 3) * 12)
      const r = 3.2 + (i % 3) * 0.8
      const body = new THREE.Mesh(resources.geometry('sphere', r, 18, 12), resources.material(night ? 0x777da1 : 0x92bc79, { roughness: 1 }))
      body.scale.set(1, 0.6, 1); island.add(body)
      const cap = new THREE.Mesh(resources.geometry('disc', r * 0.93, 32), resources.material(night ? 0x9ba6bc : 0xb1cb83, { roughness: 1 }))
      cap.rotation.x = -Math.PI / 2; cap.position.y = r * 0.18; island.add(cap)
      for (let j = 0; j < 3; j++) {
        const crown = new THREE.Mesh(resources.geometry('sphere', 0.65, 14, 10), resources.material(night ? 0x89ada3 : 0x71a55d, { roughness: 1 }))
        crown.position.set(-1.4 + j * 1.25, r * 0.18 + 0.6 + (j % 2) * 0.4, -0.3 + (j % 2) * 0.7)
        crown.scale.y = 1.2; island.add(crown)
      }
      scene.add(island)
    }
    const planet = new THREE.Mesh(resources.geometry('sphere', 5.8, 32, 20), resources.material(night ? 0xa6b4e6 : 0xf3d5a9, { emissive: night ? 0.4 : 0.1, roughness: 1 }))
    planet.position.set(34, 18, -75); scene.add(planet)
    const orbit = new THREE.Mesh(resources.geometry('torus', 8.2, 0.14, 8, 80), resources.material(night ? 0xccd9f4 : 0xf8e6c9, { opacity: 0.65, emissive: 0.25 }))
    orbit.position.copy(planet.position); orbit.rotation.set(1.12, 0.2, 0.25); scene.add(orbit)
  }

  // --- clouds ---------------------------------------------------------------
  const clouds = new THREE.Group()
  scene.add(clouds)
  const cloudMaterial = resources.material(night ? 0xb9c3e0 : 0xffffff, { roughness: 1, opacity: night ? 0.5 : 0.88 })
  const cloudCount = Math.round(10 * quality.particles) + 4
  for (let i = 0; i < cloudCount; i++) {
    const cloud = new THREE.Group()
    const puffs = 3 + Math.floor(random() * 3)
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(resources.geometry('sphere', 2 + random() * 2.2, 12, 8), cloudMaterial)
      puff.position.set((random() - 0.5) * 5, (random() - 0.5) * 0.8, (random() - 0.5) * 4)
      puff.scale.y = 0.5
      cloud.add(puff)
    }
    const angle = random() * Math.PI * 2
    const distance = 34 + random() * 60
    cloud.position.set(Math.sin(angle) * distance, 20 + random() * 9, Math.cos(angle) * distance)
    clouds.add(cloud)
  }

  // --- ambient particles ----------------------------------------------------
  const moteCount = Math.round((night ? 58 : 18) * quality.particles)
  const motePositions = new Float32Array(moteCount * 3)
  const motePhase = new Float32Array(moteCount)
  for (let i = 0; i < moteCount; i++) {
    const angle = random() * Math.PI * 2
    const r = Math.sqrt(random()) * radius
    motePositions[i * 3] = Math.sin(angle) * r
    motePositions[i * 3 + 1] = random() * 7
    motePositions[i * 3 + 2] = Math.cos(angle) * r
    motePhase[i] = random() * Math.PI * 2
  }
  const moteGeometry = new THREE.BufferGeometry()
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3))
  const motes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({
    map: moteTexture(),
    color: night ? 0xffe9a8 : ground.accent,
    size: night ? 0.12 : 0.07,
    transparent: true,
    opacity: night ? 0.7 : 0.28,
    depthWrite: false,
    blending: night ? THREE.AdditiveBlending : THREE.NormalBlending
  }))
  scene.add(motes)

  // --- contact shadow -------------------------------------------------------
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 24),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.85 })
  )
  blob.rotation.x = -Math.PI / 2
  blob.renderOrder = 1
  blob.userData.ignorePick = true
  scene.add(blob)

  // --- post processing ------------------------------------------------------
  let composer: EffectComposer | null = null
  // Ambient occlusion is gathered at half resolution. It is a soft, low-frequency
  // darkening, and gathering it at full size would mean drawing the whole scene
  // twice more at the display resolution for detail the blur removes anyway.
  const AO_SCALE = 0.5
  let occlusion: SSAOPass | null = null
  const sizeOcclusion = (width: number, height: number): void => {
    occlusion?.setSize(Math.max(1, Math.round(width * AO_SCALE)), Math.max(1, Math.round(height * AO_SCALE)))
  }
  if (quality.ambientOcclusion || quality.bloom) {
    composer = new EffectComposer(renderer)
    // The scene needs a RenderPass of its own: SSAOPass only produces an
    // ambient-occlusion map and multiplies it over whatever the pass before it
    // left behind, so without this the chain composites onto an empty buffer and
    // the island never reaches the canvas.
    composer.addPass(new RenderPass(scene, camera))
    if (quality.ambientOcclusion) {
      occlusion = new SSAOPass(scene, camera, 1, 1)
      occlusion.kernelRadius = 1.6
      occlusion.minDistance = 0.002
      occlusion.maxDistance = 0.018
      composer.addPass(occlusion)
    }
    if (quality.bloom) {
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), night ? 0.24 : 0.06, 0.35, 1.15))
    }
    composer.addPass(new SMAAPass())
    composer.addPass(new OutputPass())
    // EffectComposer sizes its passes off the renderer when it is built, before
    // the canvas has been measured, so the occlusion buffers start half-sized too.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatio)
    sizeOcclusion(renderer.domElement.clientWidth * pixelRatio || 1, renderer.domElement.clientHeight * pixelRatio || 1)
  }

  let elapsed = 0

  const stage: Stage = {
    renderer,
    scene,
    blob,
    setSize(width, height) {
      renderer.setSize(width, height, false)
      if (composer) {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatio)
        composer.setSize(width, height)
        composer.setPixelRatio(pixelRatio)
        // The composer resized every pass to the full frame; put the occlusion
        // buffers back to half of it.
        sizeOcclusion(width * pixelRatio, height * pixelRatio)
      }
    },
    render(delta, camera) {
      elapsed += delta
      resources.time.value = elapsed
      clouds.rotation.y = elapsed * 0.008

      const positions = moteGeometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < moteCount; i++) {
        const phase = motePhase[i]
        positions.setY(i, ((positions.getY(i) + delta * (night ? 0.28 : 0.12)) % 7))
        positions.setX(i, positions.getX(i) + Math.sin(elapsed * 0.5 + phase) * delta * 0.16)
        positions.setZ(i, positions.getZ(i) + Math.cos(elapsed * 0.42 + phase) * delta * 0.16)
      }
      positions.needsUpdate = true

      if (composer) composer.render(delta)
      else renderer.render(scene, camera)
    },
    dispose() {
      // EffectComposer.dispose() only frees its two ping-pong targets and the copy
      // pass; the render targets each pass allocates for itself are left behind,
      // which for this chain is four for the occlusion pass and five bloom levels.
      // Every world switch would strand a full set of them without this.
      for (const pass of composer ? composer.passes : []) pass.dispose?.()
      composer?.dispose()
      // The renderer frees the objects it was asked for, but not the shadow map it
      // allocated on the sun's behalf.
      sun.shadow.map?.depthTexture?.dispose()
      sun.shadow.map?.dispose()
      sun.shadow.map = null
      ;(motes.material as THREE.PointsMaterial).map?.dispose()
      ;(blob.material as THREE.MeshBasicMaterial).map?.dispose()
      blob.geometry.dispose()
      sky.geometry.dispose()
      ;(sky.material as THREE.Material).dispose()
      moteGeometry.dispose()
      ;(motes.material as THREE.Material).dispose()
      // renderer.dispose() frees three.js's own bookkeeping and nothing else — it
      // does not delete a single GL object. Losing the context is what returns the
      // driver's memory, and it has to happen here because a lost context cannot be
      // drawn into again: this canvas is spent, and the next engine gets its own.
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }

  return stage
}
