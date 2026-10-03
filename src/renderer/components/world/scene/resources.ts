import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createSurfaceTexture, type SurfaceStyle } from './surfaceTextures'

// Shared geometry and material caches. Every model in the library is built from
// these rounded primitives, so the whole island keeps one soft, consistent look.

export interface MaterialOptions {
  roughness?: number
  metalness?: number
  emissive?: number
  opacity?: number
  shade?: 'standard' | 'toon'
  /** Wind sway strength for foliage; 0 disables the shader hook. */
  sway?: number
  /** Vertical ripple strength for water surfaces; 0 disables the shader hook. */
  wave?: number
  flatShading?: boolean
  side?: THREE.Side
  surface?: SurfaceStyle
  repeat?: number
  vertexColors?: boolean
}

export interface SceneResources {
  time: { value: number }
  geometry(kind: string, ...params: number[]): THREE.BufferGeometry
  /** Box with rounded edges — the core of the soft toy-like silhouette. */
  roundedBox(width: number, height: number, depth: number, radius?: number): THREE.BufferGeometry
  material(color: number, options?: MaterialOptions): THREE.Material
  dispose(): void
}

/** Rounds a box by pushing its surface out of the inner core by `radius`. */
function buildRoundedBox(width: number, height: number, depth: number, radius: number, segments = 3): THREE.BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, segments, radius)
}

function buildToonGradient(): THREE.DataTexture {
  const steps = new Uint8Array([90, 150, 205, 255])
  const texture = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

export function createResources(): SceneResources {
  // Share primitives within one world. Keeping the objects across renderers also
  // keeps each renderer's disposal listeners attached, retaining old contexts.
  const geometries = new Map<string, THREE.BufferGeometry>()
  const materials = new Map<string, THREE.Material>()
  const surfaces = new Map<string, THREE.Texture>()
  const time = { value: 0 }
  let toonGradient: THREE.DataTexture | null = null

  function geometry(kind: string, ...params: number[]): THREE.BufferGeometry {
    const key = kind + ':' + params.join(',')
    const cached = geometries.get(key)
    if (cached) return cached
    const [a = 1, b = 1, c = 1, d = 0.25] = params
    let built: THREE.BufferGeometry
    switch (kind) {
      case 'sphere': built = new THREE.SphereGeometry(a, params[1] || 28, params[2] || 20); break
      case 'dome': built = new THREE.SphereGeometry(a, params[1] || 20, params[2] || 12, 0, Math.PI * 2, 0, Math.PI / 2); break
      case 'ico': built = new THREE.IcosahedronGeometry(a, params[1] ?? 1); break
      case 'capsule': built = new THREE.CapsuleGeometry(a, b, 6, 14); break
      case 'cylinder': built = new THREE.CylinderGeometry(a, params[1] ?? a, params[2] ?? 1, params[3] ?? 24); break
      case 'island': {
        built = new THREE.CylinderGeometry(a, params[1] ?? a, params[2] ?? 1, 96, 1)
        const positions = built.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), z = positions.getZ(i)
          if (Math.hypot(x, z) < 0.001) continue
          const angle = Math.atan2(x, z)
          const contour = 0.35 + Math.sin(angle * 3 + 0.6) * 0.13 + Math.cos(angle * 5) * 0.1
          const scale = 1 + contour / a
          positions.setXYZ(i, x * scale, positions.getY(i), z * scale)
        }
        built.computeVertexNormals()
        break
      }
      case 'cone': built = new THREE.ConeGeometry(a, b, params[2] ?? 20); break
      case 'leaf': {
        // A pointed, gently folded leaf. The central ridge catches the light;
        // hundreds of these can share one geometry and one instanced draw.
        const shape = [[0, 0, 1], [-0.46, 0, 0.45], [-0.62, 0, -0.05], [-0.4, 0, -0.6],
          [0, 0, -1], [0.4, 0, -0.6], [0.62, 0, -0.05], [0.46, 0, 0.45]]
        const vertices: number[] = [], uv: number[] = [], indices: number[] = []
        for (const v of [[0, 0.085, 0], ...shape]) {
          vertices.push(v[0] * a, v[1] * a, v[2] * a)
          uv.push(v[0] * 0.5 + 0.5, v[2] * 0.5 + 0.5)
        }
        for (let i = 0; i < shape.length; i++) indices.push(0, i + 1, (i + 1) % shape.length + 1)
        built = new THREE.BufferGeometry()
        built.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
        built.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
        built.setIndex(indices)
        built.computeVertexNormals()
        break
      }
      case 'gable': {
        built = new THREE.BufferGeometry()
        built.setAttribute('position', new THREE.Float32BufferAttribute([0, -b / 2, -a / 2, 0, b / 2, 0, 0, -b / 2, a / 2], 3))
        built.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 1, 1, 0], 2))
        built.computeVertexNormals()
        break
      }
      case 'torus': built = new THREE.TorusGeometry(a, b, params[2] ?? 10, params[3] ?? 40); break
      case 'disc': built = new THREE.CircleGeometry(a, params[1] ?? 32); break
      case 'plane': built = new THREE.PlaneGeometry(a, b, params[2] ?? 1, params[3] ?? 1); break
      case 'rbox': built = buildRoundedBox(a, b, c, Math.min(d, Math.min(a, b, c) / 2 - 0.001)); break
      default: built = new THREE.BoxGeometry(a, b, c)
    }
    built.userData.worldShared = true
    geometries.set(key, built)
    return built
  }

  function material(color: number, options: MaterialOptions = {}): THREE.Material {
    const shade = options.shade || 'standard'
    const sway = options.sway || 0
    const wave = options.wave || 0
    const key = [color, shade, options.roughness ?? 0.85, options.metalness ?? 0, options.emissive ?? 0,
      options.opacity ?? 1, sway, wave, options.flatShading ? 1 : 0, options.side ?? 0, options.surface || '', options.repeat ?? 1, !!options.vertexColors].join(':')
    const cached = materials.get(key)
    if (cached) return cached
    let map: THREE.Texture | undefined
    if (options.surface) {
      const surfaceKey = options.surface + ':' + (options.repeat ?? 1)
      map = surfaces.get(surfaceKey)
      if (!map) {
        map = createSurfaceTexture(options.surface)
        map.repeat.setScalar(options.repeat ?? 1)
        surfaces.set(surfaceKey, map)
      }
    }
    let bumpMap: THREE.Texture | undefined
    if (map && options.surface !== 'water') {
      const bumpKey = 'height:' + options.surface + ':' + (options.repeat ?? 1)
      bumpMap = surfaces.get(bumpKey)
      if (!bumpMap) {
        bumpMap = new THREE.CanvasTexture(map.image)
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping
        bumpMap.repeat.copy(map.repeat)
        bumpMap.anisotropy = 4
        surfaces.set(bumpKey, bumpMap)
      }
    }
    const common = {
      color,
      map,
      vertexColors: !!options.vertexColors,
      transparent: (options.opacity ?? 1) < 1,
      opacity: options.opacity ?? 1,
      ...(options.side !== undefined ? { side: options.side } : {})
    }
    const built: THREE.Material = shade === 'toon'
      ? new THREE.MeshToonMaterial({ ...common, gradientMap: (toonGradient ||= buildToonGradient()) })
      : new THREE.MeshStandardMaterial({
          ...common,
          bumpMap,
          bumpScale: options.surface === 'leaf' ? 0.008 : options.surface === 'tiles' || options.surface === 'stone' ? 0.1 : 0.035,
          roughness: options.roughness ?? 0.85,
          metalness: options.metalness ?? 0,
          emissive: new THREE.Color(options.emissive ? color : 0x000000),
          emissiveIntensity: options.emissive ?? 0,
          flatShading: !!options.flatShading
        })
    if (sway > 0) {
      built.onBeforeCompile = shader => {
        shader.uniforms.uSwayTime = time
        shader.uniforms.uSwayAmount = { value: sway }
        shader.vertexShader = 'uniform float uSwayTime;\nuniform float uSwayAmount;\n' + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          '  vec3 swayOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
          '#else',
          '  vec3 swayOrigin = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);',
          '#endif',
          'float swayPhase = uSwayTime * 1.7 + swayOrigin.x * 0.8 + swayOrigin.z * 0.6;',
          'float swayHeight = max(position.y, 0.0);',
          'transformed.x += sin(swayPhase) * uSwayAmount * swayHeight;',
          'transformed.z += cos(swayPhase * 0.85) * uSwayAmount * 0.7 * swayHeight;'
        ].join('\n'))
      }
      built.customProgramCacheKey = () => 'sway' + sway
    }
    if (wave > 0) {
      built.onBeforeCompile = shader => {
        shader.uniforms.uWaveTime = time
        shader.uniforms.uWaveAmount = { value: wave }
        shader.vertexShader = 'uniform float uWaveTime;\nuniform float uWaveAmount;\n' + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'vec3 wavePoint = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          'float ripple = sin(wavePoint.x * 1.4 + uWaveTime * 1.6) * uWaveAmount;',
          'ripple += cos(wavePoint.z * 1.9 + uWaveTime * 2.1) * uWaveAmount * 0.7;',
          'transformed += normal * ripple;'
        ].join('\n'))
      }
      built.customProgramCacheKey = () => 'wave' + wave
    }
    built.userData.worldShared = true
    materials.set(key, built)
    return built
  }

  return {
    time,
    geometry,
    roundedBox: (w, h, d, r = 0.08) => geometry('rbox', w, h, d, r),
    material,
    dispose() {
      // Dispatch disposal while the renderer is alive so it removes its listeners
      // and frees uploaded buffers; clearing the caches also releases CPU copies.
      for (const material of materials.values()) material.dispose()
      for (const geometry of geometries.values()) geometry.dispose()
      for (const surface of surfaces.values()) surface.dispose()
      toonGradient?.dispose()
      materials.clear(); geometries.clear(); surfaces.clear()
      toonGradient = null
    }
  }
}

/** Release model-owned clock textures and preview materials, keeping the kit's
 * shared primitives alive for the next edit or island. */
export function releaseObject(root: THREE.Object3D): void {
  const disposed = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
  root.traverse(node => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry
    if (!geometry.userData.worldShared && !disposed.has(geometry)) {
      geometry.dispose(); disposed.add(geometry)
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.userData.worldShared || disposed.has(material)) continue
      const map = (material as THREE.MeshBasicMaterial).map
      if (map && !disposed.has(map)) { map.dispose(); disposed.add(map) }
      material.dispose(); disposed.add(material)
    }
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose()
  })
}
