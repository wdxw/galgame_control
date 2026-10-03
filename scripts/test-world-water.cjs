// River geometry, saved-layout compatibility and real navigation over a bridge.
const fs = require('fs')
const assert = require('assert/strict')
require.extensions['.ts'] = (module, filename) => module._compile(require('esbuild').transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename)
const THREE = require('three')
const { hubBlueprint, buildBlueprint } = require('../src/shared/worldBlueprint.ts')
const { ruleAnalysis } = require('../src/shared/worldRules.ts')
const { catalogModel } = require('../src/shared/worldCatalog.ts')
const { landscapeFor } = require('../src/renderer/components/world/scene/landscape.ts')
const { riverLayout } = require('../src/renderer/components/world/scene/riverLayout.ts')
const { createInteraction } = require('../src/renderer/components/world/scene/interaction.ts')

const tags = [['School'], ['Ocean'], ['Science Fiction'], ['Shrine'], ['Fantasy'], ['Mystery'], ['Winter'], ['Romance'], ['Underwater']]
const worlds = [hubBlueprint(), ...tags.map((worldTags, i) => {
  const draft = ruleAnalysis({ id: 'fixture-' + i, title: 'Fixture', worldTags })
  return buildBlueprint({ kind: 'work', biome: draft.biome, seed: 400 + i, elements: draft.elements, launchElementId: draft.elements[0]?.id })
})]
for (const blueprint of worlds) {
  const land = landscapeFor(blueprint), river = riverLayout(blueprint, [], land)
  assert.deepEqual(riverLayout(blueprint, [], land).points, river.points, 'reopening preserves the river course')
  assert.equal(river.contains(0, 0), false, 'the plaza stays dry')
  assert.equal(river.contains(blueprint.spawn.x, blueprint.spawn.z), false, 'the arrival stays dry')
  assert.equal(river.groundAt(blueprint.spawn.x, blueprint.spawn.z), land(blueprint.spawn.x, blueprint.spawn.z))
  for (let i = 1; i < river.points.length; i++) assert.ok(river.points[i].y <= river.points[i - 1].y + 1e-8, 'water flows downhill')
  for (const point of river.points) assert.ok(river.groundAt(point.x, point.z) < point.y - 0.25, 'the river has a submerged bed')
  for (const bridge of river.bridges) {
    assert.ok(river.bridgeAt(bridge.x, bridge.z) > river.sample(bridge.x, bridge.z).y, 'the bridge deck is above the water')
    for (const side of [-1, 1]) {
      const x = bridge.x + side * bridge.nx * bridge.length, z = bridge.z + side * bridge.nz * bridge.length
      assert.ok(Math.hypot(x, z) < blueprint.radius - 0.3, 'both bridge ends reach walkable land')
    }
  }
  for (const placement of blueprint.placements) {
    assert.equal(river.contains(placement.x, placement.z), false, 'the river keeps existing scenery on dry land')
    if (catalogModel(placement.modelId)?.category !== 'plant') {
      assert.ok(Math.abs(river.groundAt(placement.x, placement.z) - land(placement.x, placement.z)) < 0.04, 'the river preserves the foundation of ' + placement.modelId)
    }
  }
}

const blueprint = { ...hubBlueprint(), placements: [] }
const edits = [{ addedId: 'saved', modelId: 'cottage', x: -8, z: -4, rot: Math.PI / 4 }]
const land = landscapeFor(blueprint, edits), river = riverLayout(blueprint, edits, land)
assert.equal(river.groundAt(-8, -4), land(-8, -4), 'a saved cottage keeps its foundation')
assert.equal(river.contains(-8, -4), false, 'saved furniture participates in routing')

const listeners = new Map()
const dom = { addEventListener: (key, value) => listeners.set(key, value), removeEventListener: key => listeners.delete(key),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }), setPointerCapture() {}, hasPointerCapture: () => false }
global.window = { addEventListener() {}, removeEventListener() {} }
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
camera.position.set(0, 12, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
const bridge = river.bridges[1], across = bridge.length + 0.8
const from = { x: bridge.x - bridge.nx * across, z: bridge.z - bridge.nz * across }
const to = { x: bridge.x + bridge.nx * across, z: bridge.z + bridge.nz * across }
const interaction = createInteraction({ dom, rig: { camera }, radius: blueprint.radius,
  groundAt: (x, z) => river.bridgeAt(x, z) ?? river.groundAt(x, z),
  pickGround: (_ray, out) => out.set(to.x, land(to.x, to.z), to.z),
  isWater: (x, z) => river.contains(x, z, 0.12) && river.bridgeAt(x, z) === null,
  onDock: () => false, blocks: [], props: new THREE.Group(), callbacks: { onPick() {}, onPlace() {} } })
interaction.teleport(from.x, from.z)
const event = { button: 0, pointerId: 1, clientX: 300, clientY: 300 }
listeners.get('pointerdown')(event); listeners.get('pointerup')(event)
let onBridge = false
for (let i = 0; i < 1200; i++) {
  interaction.update(1 / 60)
  const p = interaction.position
  if (river.contains(p.x, p.z)) {
    onBridge = true
    assert.notEqual(river.bridgeAt(p.x, p.z), null, 'navigation never walks through open water')
    assert.ok(p.y > river.sample(p.x, p.z).y, 'the avatar stands on the bridge deck')
  }
}
assert.ok(onBridge, 'the route actually crosses a bridge')
assert.ok(Math.hypot(interaction.position.x - to.x, interaction.position.z - to.z) < 0.65, 'click navigation reaches the opposite bank')
interaction.dispose(); delete global.window
console.log('PASS rivers: 10 themes, dry spawn and plaza, downhill flow, submerged bed, saved foundations, real bridge crossing and water avoidance')
