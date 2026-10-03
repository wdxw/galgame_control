import * as THREE from 'three'
import type { SceneResources } from './resources'

/** Painted water with downstream streaks, drifting caustics and moving normals.
 * Its only changing input is the scene clock, including on the low quality tier. */
export function waterMaterial(resources: SceneResources, color: number, kind: 'river' | 'ocean' | 'fall', waves: boolean): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color, roughness: kind === 'ocean' ? 0.46 : 0.34, metalness: 0.04,
    emissive: color, emissiveIntensity: 0.08,
    transparent: kind !== 'ocean', opacity: kind === 'fall' ? 0.86 : 0.96,
    depthWrite: kind === 'ocean', side: THREE.DoubleSide
  })
  material.onBeforeCompile = shader => {
    shader.uniforms.uWaterTime = resources.time
    const define = kind === 'ocean' ? '#define OCEAN\n' : kind === 'fall' ? '#define FALL\n' : ''
    shader.vertexShader = 'uniform float uWaterTime;\nvarying vec2 vWaterUv;\nvarying vec3 vWaterWorld;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vWaterUv = uv;
      vWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      transformed += normal * (sin(vWaterWorld.x * 3.1 + uWaterTime * 1.6) + cos(vWaterWorld.z * 2.5 - uWaterTime * 1.9)) * ${waves ? '0.012' : '0.0'};
    `)
    shader.fragmentShader = define + 'uniform float uWaterTime;\nvarying vec2 vWaterUv;\nvarying vec3 vWaterWorld;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      vec2 flow = vWaterUv;
      #ifdef OCEAN
        flow = vWaterWorld.xz * 0.22;
      #endif
      float travel = flow.y * 3.7 - uWaterTime * 1.45;
      #ifdef FALL
        travel = flow.y * 10.0 - uWaterTime * 7.0;
      #endif
      float bend = sin(flow.x * 17.0 + sin(travel * 0.43) * 1.6);
      float ripple = sin(travel + bend * 1.5);
      float caustic = pow(max(0.0, sin(flow.x * 25.0 + sin(travel)) * cos(travel * 0.7 + flow.x * 4.0)), 8.0);
      float glimmer = smoothstep(0.88, 1.0, ripple) * (0.3 + 0.7 * smoothstep(-0.1, 0.75, bend));
      glimmer *= smoothstep(-0.3, 0.6, sin(flow.y * 1.11 + sin(flow.x * 2.61)) * sin(flow.x * 3.93 + cos(flow.y * 0.71)));
      float edge = min(flow.x, 1.0 - flow.x);
      float foam = (1.0 - smoothstep(0.018, 0.10, edge + sin(travel * 0.65) * 0.018)) * (0.7 + 0.3 * sin(travel));
      #ifdef OCEAN
        foam = 0.0;
        glimmer *= 0.20;
        caustic *= 0.35;
      #endif
      #ifdef FALL
        foam = pow(max(0.0, sin(flow.x * 31.0 + sin(travel) * 0.6)), 6.0) * 0.52;
        glimmer *= 0.6;
      #endif
      diffuseColor.rgb *= 0.83 + ripple * 0.05 + caustic * 0.32;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76, 0.95, 0.88), min(0.78, glimmer * 0.19 + foam * 0.64));
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      float normalStrength = 0.055;
      #ifdef OCEAN
        normalStrength = 0.025;
      #endif
      normal = normalize(normal + vec3(sin(travel + flow.x * 11.0) * normalStrength, cos(travel * 0.7 - flow.x * 8.0) * normalStrength, 0.0));
    `)
  }
  material.customProgramCacheKey = () => `flowing-water-${kind}-${waves}`
  return material
}
