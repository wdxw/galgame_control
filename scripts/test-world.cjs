// Rule recognition, curated overrides and deterministic layout, plus the VNDB
// metadata pipeline the world generator reads from.
const fs = require('fs')
const assert = require('assert/strict')
const Module = require('module')
require.extensions['.ts'] = (module, filename) => module._compile(require('esbuild').transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename)

const { ruleAnalysis, curatedAnalysis, normalizeElements, PALETTES } = require('../src/shared/worldRules.ts')
const { buildBlueprint, hubBlueprint, freeSlotFor } = require('../src/shared/worldBlueprint.ts')
const { catalogModel } = require('../src/shared/worldCatalog.ts')
const { seedFor } = require('../src/shared/worldSeed.ts')
const { landscapeFor } = require('../src/renderer/components/world/scene/landscape.ts')

const fixture = { id: 'game', vndbId: 'v17', title: 'Fixture', description: null, worldTags: [] }
let game = { ...fixture }, enabled = true, calls = [], gate, stale = false, rows
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith('worldMetadata.ts')) {
    if (request === './library.db') return {
      getGameById: () => game && { ...game },
      getSetting: () => enabled ? 'true' : 'false',
      updateGame: (_id, fields) => { game = { ...game, ...fields } }
    }
    if (request === './ratingNetwork') return {
      cachedRating: async (_key, _force, fetcher) => ({ data: await fetcher(), stale }),
      requestRatingJson: async (_url, body) => { calls.push(body); if (gate) await gate; return { results: rows } }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { getWorldMetadata } = require('../src/main/services/worldMetadata.ts')

const ids = draft => draft.elements.map(element => element.id)

function layout(elements, options = {}) {
  return buildBlueprint({
    kind: options.kind || 'work',
    biome: options.biome || 'school',
    seed: options.seed ?? 1234,
    elements,
    launchElementId: options.launchElementId ?? null
  })
}

async function main() {
  // ---- rule recognition -----------------------------------------------------
  const school = ruleAnalysis({ ...fixture, worldTags: ['School', 'Music', 'Cherry Blossom'] })
  assert.equal(school.biome, 'school')
  assert.ok(ids(school).includes('school_building'))
  assert.ok(ids(school).includes('piano'), 'music tag brings the piano')
  assert.ok(ids(school).includes('sakura_tree'))
  assert.deepEqual(school.evidence, ['School'])
  assert.equal(school.elements[0].launchable, undefined, 'the school building is not a launch object')

  const sea = ruleAnalysis({ ...fixture, worldTags: ['Underwater', 'Science Fiction', 'School', 'High School Student'] })
  assert.equal(sea.biome, 'coast', 'the earlier biome rule wins the tie')
  assert.ok(ids(sea).includes('submarine_dome'))
  assert.ok(ids(sea).includes('coral_arch'))
  assert.ok(ids(sea).includes('lighthouse'))

  const winter = ruleAnalysis({ ...fixture, worldTags: ['Winter', 'Train'] })
  assert.equal(winter.biome, 'winter')
  assert.ok(ids(winter).includes('train'))
  assert.ok(ids(winter).includes('station'))
  assert.equal(winter.atmosphere.night, PALETTES.winter.night)

  const bare = ruleAnalysis(fixture)
  assert.equal(bare.biome, 'garden')
  assert.deepEqual(bare.evidence, [], 'a fallback garden must not claim evidence the work did not provide')

  const farm = ruleAnalysis({ ...fixture, worldTags: ['Farming'] })
  assert.ok(ids(farm).includes('vegetable_patch'), 'a farming tag brings a planted vegetable bed')

  // A description alone is weaker evidence than a tag, but still recognised.
  assert.equal(ruleAnalysis({ ...fixture, description: 'A quiet seaside town.' }).biome, 'coast')

  // ---- curated works --------------------------------------------------------
  const muramasa = curatedAnalysis({ ...fixture, vndbId: 'v2016' }, 'v2016')
  assert.equal(muramasa.biome, 'mystery')
  assert.ok(ids(muramasa).includes('sword_rack'), 'the cursed blade is the signature object')
  assert.ok(ids(muramasa).includes('armor_display'))
  assert.equal(muramasa.elements.find(item => item.id === 'sword_rack').launchable, true)
  assert.equal(curatedAnalysis(fixture, 'v9999'), null, 'other works fall through to the rules')

  // ---- layout ---------------------------------------------------------------
  const elements = school.elements
  const first = layout(elements, { launchElementId: 'piano' })
  const again = layout(elements, { launchElementId: 'piano' })
  assert.deepEqual(first.placements, again.placements, 'the same seed always lays out the same island')
  assert.notDeepEqual(layout(elements, { seed: 4321 }).placements, first.placements, 'a new generation moves things')

  const launch = first.placements.find(item => item.modelId === 'piano')
  assert.ok(launch && launch.launchable, 'the launch object is placed and marked')
  assert.equal(first.defaultLaunchElementId, 'piano')
  assert.ok(Math.hypot(launch.x, launch.z) < 6, 'the launch object stays near the plaza')

  for (const item of first.placements) {
    const model = catalogModel(item.modelId)
    assert.ok(model, 'every placement has a model')
    assert.ok(Math.hypot(item.x, item.z) + Math.max(model.block.w, model.block.d) / 2 < first.radius,
      `${item.modelId} stays inside the island`)
    assert.ok(!(Math.abs(item.x) < 2.3 && item.z > 1.6), `${item.modelId} keeps the arrival corridor clear`)
    assert.ok(Math.hypot(item.x, item.z) >= 3.6, `${item.modelId} keeps the plaza clear`)
  }

  const buildings = first.placements.filter(item => catalogModel(item.modelId).category === 'building')
  assert.ok(buildings.length >= 2, 'buildings are placed')

  // A bulky entrance (the work's landmark building) is placed by the normal ring
  // rules and still marked as the way in.
  const bulky = layout(elements, { launchElementId: 'school_building' })
  const entrance = bulky.placements.find(item => item.modelId === 'school_building')
  assert.ok(entrance, 'the landmark entrance is placed')
  assert.equal(entrance.launchable, true)
  assert.ok(Math.hypot(entrance.x, entrance.z) > 6, 'a wide building does not crowd the plaza')

  // Vegetation fills the island so it never reads as a bare disc.
  assert.ok(first.placements.filter(item => catalogModel(item.modelId).category === 'plant').length >= 4)

  // Unknown elements are skipped rather than crashing the layout.
  const withUnknown = layout([...elements, { id: 'not_a_model', name: '未知', nameEn: 'Unknown', category: 'prop', reason: '' }])
  assert.ok(!withUnknown.placements.some(item => item.modelId === 'not_a_model'))

  // ---- free slots for player additions --------------------------------------
  const slot = freeSlotFor(first, [], 'sakura_tree')
  assert.ok(slot, 'a free slot is found for a new tree')
  const tree = catalogModel('sakura_tree')
  for (const item of first.placements) {
    const other = catalogModel(item.modelId)
    const apart = Math.abs(slot.x - item.x) >= tree.block.w / 2 + other.block.w / 2 + 0.7 ||
      Math.abs(slot.z - item.z) >= tree.block.d / 2 + other.block.d / 2 + 0.7
    assert.ok(apart, 'the new element does not overlap an existing one')
  }
  assert.ok(!(Math.abs(slot.x) < 2.3 && slot.z > 1.6), 'the new element keeps the corridor clear')

  const hub = hubBlueprint()
  assert.equal(hub.kind, 'hub')
  assert.equal(hub.radius, 15)
  assert.equal(hub.defaultLaunchElementId, null)
  assert.ok(hub.placements.length > 0)
  assert.notEqual(hub.seed, first.seed)
  assert.equal(seedFor('v17#1'), seedFor('v17#1'), 'seeds are stable across runs')
  assert.notEqual(seedFor('v17#1'), seedFor('v17#2'), 'regenerating changes the seed')

  // Drawing and walking share a continuous height field. The plaza and arrival
  // stay level, while saved furniture gets a flat foundation on the terraces.
  const emptyIsland = { ...hub, placements: [] }
  const height = landscapeFor(emptyIsland)
  assert.equal(height(0, 0), 0, 'the plaza stays level')
  assert.equal(height(hub.spawn.x, hub.spawn.z), 0, 'the arrival remains level')
  assert.ok(height(0, -hub.radius * 0.57) > 1, 'the first terrace is raised')
  assert.ok(height(0, -hub.radius * 0.85) > 1.85, 'the rear terrace is higher')
  for (let z = -hub.radius; z < hub.radius; z += 0.05) {
    assert.ok(Math.abs(height(0, z + 0.05) - height(0, z)) < 0.05, 'the terrace slopes remain continuous')
  }
  const addedBed = { addedId: 'terrace-bed', modelId: 'vegetable_patch', x: 6, z: -6.5, rot: Math.PI / 2, scale: 1 }
  const supported = landscapeFor(emptyIsland, [addedBed])
  assert.equal(supported(6, -6.5), height(6, -6.5), 'a saved foundation keeps its centre height')
  assert.equal(supported(6.5, -7), supported(5.5, -6), 'a rotated crop bed has a level foundation')
  assert.ok(Math.abs(height(6.5, -7) - height(5.5, -6)) > 0.1, 'the foundation test covers a real slope')
  assert.equal(landscapeFor(emptyIsland, [addedBed])(6.5, -7), supported(6.5, -7), 'reopening a layout restores its foundation')
  const plantedTree = { ...addedBed, modelId: 'tree' }
  assert.equal(landscapeFor(emptyIsland, [plantedTree])(6.5, -7), height(6.5, -7), 'trees grow on the slope without flattening the garden')

  // ---- AI element validation ------------------------------------------------
  const normalized = normalizeElements([
    { name: '钢琴', reason: '音乐室' },
    { name: '天空鲸鱼', reason: '资料中未出现' },
    { name: '钢琴', reason: '重复项' }
  ])
  assert.deepEqual(normalized.elements.map(item => item.id), ['piano'])
  assert.deepEqual(normalized.missing, ['天空鲸鱼'], 'unknown concepts are kept as missing models')

  rows = [{ id: 'v17', description: 'An underwater facility.', image: { url: 'https://s.vndb.org/cv/1.jpg' }, tags: [
    { name: 'Underwater', rating: 2, spoiler: 0, category: 'cont' },
    { name: 'Hidden killer', rating: 3, spoiler: 2, category: 'cont' },
    { name: 'Technical', rating: 2, spoiler: 0, category: 'tech' },
    { name: 'Weak', rating: 0.5, spoiler: 0, category: 'cont' }
  ] }]
  const result = await getWorldMetadata('game')
  assert.deepEqual(calls[0].filters, ['id', '=', 'v17'])
  assert.deepEqual(game.worldTags, ['Underwater'])
  assert.equal(result.status, 'ready')
  assert.equal(game.description, 'An underwater facility.')
  const count = calls.length
  enabled = false
  assert.equal((await getWorldMetadata('game', true)).status, 'disabled')
  assert.equal(calls.length, count)
  enabled = true; stale = true
  assert.equal((await getWorldMetadata('game')).status, 'cached')
  stale = false
  let release
  gate = new Promise(resolve => { release = resolve })
  const pending = getWorldMetadata('game')
  game = { ...game, vndbId: 'v99', worldTags: ['School'], description: 'Preserve user text' }
  release()
  await assert.rejects(pending, /关联已改变/)
  assert.deepEqual(game.worldTags, ['School'])
  assert.equal(game.description, 'Preserve user text')
  gate = null

  console.log('PASS world: rule biomes, farming recognition, curated Muramasa world, deterministic layout, terrace continuity and saved foundations, reserved areas, free slots, AI element validation, VNDB metadata pipeline')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
