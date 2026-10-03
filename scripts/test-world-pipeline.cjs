// Runs the recognition/persistence pipeline with an isolated SQLite library and
// a loopback AI fixture. No user library, credentials or external AI are used.
const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const http = require('http')
const Module = require('module')
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = require('child_process').spawnSync(require('electron'), [__filename], {
    env, stdio: 'inherit', windowsHide: true, timeout: 240000
  })
  process.exit(result.status ?? 1)
}
const { app } = require('electron')
const root = path.resolve(__dirname, '..')
const testDir = fs.mkdtempSync(path.join(root, 'build', 'world-pipeline-'))
app.setPath('appData', testDir); app.setPath('userData', path.join(testDir, 'profile'))
require.extensions['.ts'] = (module, filename) => module._compile(require('esbuild').transformSync(
  fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename)

let db
let encrypted = true
const handlers = new Map()
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === './worldMetadata' && parent?.filename.endsWith('worldAnalysis.ts')) return {
    getWorldMetadata: async id => ({ game: db.getGameById(id), status: 'ready', imageUrl: null })
  }
  if (request === 'electron' && parent?.filename.endsWith('aiClient.ts')) return { safeStorage: {
    isEncryptionAvailable: () => encrypted,
    encryptString: key => Buffer.from('fixture-encrypted:' + key),
    decryptString: buffer => buffer.toString().replace(/^fixture-encrypted:/, '')
  } }
  if (request === 'electron' && /(?:world|library)\.ipc\.ts$/.test(parent?.filename || '')) return {
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }
  }
  if (request === '../services/ratings' && parent?.filename.endsWith('library.ipc.ts')) return {
    getGameRating: async () => null
  }
  return originalLoad.call(this, request, parent, isMain)
}
const reply = JSON.stringify({
  biome: 'shrine', atmosphere: { night: false, note: 'Shrine tag' },
  elements: [{ name: '神社本殿', reason: 'Shrine tag' }, { name: '妖刀', reason: 'Katana tag' },
    { name: 'fixture unsupported dragon statue', reason: 'Unsupported object' }],
  pending: [{ name: '小屋', reason: 'Only suggested by the title' }],
  missing: ['fixture absent dragon'], evidence: ['Shrine', 'Katana']
})
let responseText = reply
let gate = null
let entered = null
const requests = []
const server = http.createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString())
  requests.push({ url: req.url, body, authorization: req.headers.authorization })
  if (entered) { entered(); entered = null }
  if (gate) await gate
  // Keep the response async so two simultaneous entries exercise de-duplication.
  await new Promise(resolve => setTimeout(resolve, 40))
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ choices: [{ message: { content: responseText } }] }))
})

app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  db = require('../src/main/services/library.db.ts'); db.initDatabase()
  const world = require('../src/main/services/world.db.ts')
  const pipeline = require('../src/main/services/worldAnalysis.ts')
  const ai = require('../src/main/services/aiClient.ts')
  const { catalogModel } = require('../src/shared/worldCatalog.ts')
  const { IPC_CHANNELS } = require('../src/shared/constants.ts')
  const fixture = (id, vndbId) => ({
    id, vndbId, title: 'Fixture shrine', originalTitle: 'Fixture original',
    exePath: 'private-fixture-' + id + '.exe', gameDir: 'private-fixture-path', coverPath: null,
    coverSource: 'manual', bangumiId: null, developer: 'Fixture developer',
    description: 'A shrine with a katana.', worldTags: ['Shrine', 'Katana'],
    releaseDate: '2000-01-01', playTime: 0, lastPlayed: null,
    dateAdded: '2026-10-01T00:00:00Z', isFavorite: false, notes: 'private-fixture-notes', exeArgs: null
  })
  const add = (id, vndbId) => db.addGame(fixture(id, vndbId))
  const waitForAnalysis = async (id, vndbId) => {
    for (let i = 0; i < 100; i++) {
      if (world.getWorldAnalysis(id, vndbId)) return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Automatic analysis did not finish for ' + id)
  }
  try {
    ai.saveAiSettings({ baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1/',
      model: 'fixture-model', apiKey: 'fixture-dummy-key', autoAnalyze: false })
    assert.ok(!JSON.stringify(ai.getAiStatus()).includes('fixture-dummy-key'), 'status never returns the key')
    assert.notEqual(db.getSetting('aiKey'), 'fixture-dummy-key')

    add('new-game', 'v300')
    const local = await pipeline.getWorldInfo('new-game')
    assert.equal(local.analysis.source, 'rules')
    assert.equal(local.analysis.biome, 'shrine', 'a newly linked game gets a world on entry')
    assert.equal(requests.length, 0, 'auto-analysis disabled means no request on entry')
    const analyzed = await pipeline.getWorldInfo('new-game', { force: true })
    assert.equal(requests.length, 1, 'explicit analysis can use the configured service')
    assert.equal(analyzed.analysis.source, 'ai')
    assert.ok(analyzed.analysis.elements.every(item => catalogModel(item.id)), 'only available models are accepted')
    assert.ok(analyzed.analysis.pendingElements.some(item => item.id === 'cottage'))
    assert.ok(analyzed.analysis.missingElements.includes('fixture unsupported dragon statue'))
    assert.ok(analyzed.analysis.missingElements.includes('fixture absent dragon'))
    const sentWork = JSON.parse(requests[0].body.messages[1].content)
    assert.deepEqual(sentWork['无剧透标签'], ['Shrine', 'Katana'])
    assert.ok(!JSON.stringify(requests[0].body).includes('private-fixture'), 'paths and notes are excluded from the prompt')
    assert.equal(requests[0].url, '/v1/chat/completions')
    assert.equal(requests[0].authorization, 'Bearer fixture-dummy-key')
    await pipeline.getWorldInfo('new-game')
    assert.equal(requests.length, 1, 're-entering uses the cached analysis')

    const custom = pipeline.saveWorldCustomization('new-game', {
      placements: [{ id: 'own', addedId: 'own', modelId: 'bookshelf', x: 7, z: -7, rot: .75 }],
      addedElements: [{ id: 'bookshelf', name: 'Bookshelf', nameEn: 'Bookshelf', category: 'landmark', reason: 'Player choice' }],
      removedElementIds: ['torii'], launchElementId: 'sword_rack'
    })
    const refreshed = await pipeline.getWorldInfo('new-game', { force: true })
    assert.deepEqual(refreshed.state.placements, custom.placements)
    assert.deepEqual(refreshed.state.addedElements, custom.addedElements)
    assert.deepEqual(refreshed.state.removedElementIds, custom.removedElementIds)
    assert.equal(refreshed.state.launchElementId, 'sword_rack')
    assert.ok(!refreshed.blueprint.placements.some(item => item.modelId === 'bookshelf'), 'reanalysis never duplicates an adopted feature')
    assert.ok(!refreshed.blueprint.placements.some(item => item.modelId === 'torii'))
    const regenerated = await pipeline.getWorldInfo('new-game', { regenerate: true })
    assert.equal(regenerated.state.generationVersion, custom.generationVersion + 1)
    assert.notEqual(regenerated.blueprint.seed, refreshed.blueprint.seed)
    assert.deepEqual(regenerated.state.placements, custom.placements, 'regeneration retains manual decoration')

    ai.saveAiSettings({ autoAnalyze: true })
    add('concurrent', 'v301')
    const beforeConcurrent = requests.length
    const both = await Promise.all([pipeline.getWorldInfo('concurrent'), pipeline.getWorldInfo('concurrent')])
    assert.equal(requests.length, beforeConcurrent + 1, 'simultaneous entries share one AI request')
    assert.deepEqual(both[0].blueprint, both[1].blueprint)
    responseText = 'This is not a JSON object'
    add('bad-reply', 'v302')
    const fallback = await pipeline.getWorldInfo('bad-reply')
    assert.equal(fallback.analysis.source, 'rules')
    assert.ok(fallback.analysis.error.includes('JSON'), 'bad replies fall back to an explained usable world')
    responseText = reply

    for (const kind of ['relinked', 'deleted']) {
      add(kind, kind === 'relinked' ? 'v303' : 'v304')
      let release
      gate = new Promise(resolve => { release = resolve })
      const started = new Promise(resolve => { entered = resolve })
      const pending = pipeline.getWorldInfo(kind)
      const rejection = assert.rejects(pending, /VNDB 关联已改变/)
      await started
      const oldVndb = db.getGameById(kind).vndbId
      if (kind === 'relinked') db.updateGame(kind, { vndbId: 'v399' })
      else db.deleteGame(kind)
      gate = null; release()
      await rejection
      assert.equal(world.getWorldAnalysis(kind, oldVndb), null, 'a stale response cannot write an analysis')
      assert.equal(db.getDb().prepare('SELECT 1 FROM world_blueprints WHERE game_id = ?').get(kind), undefined)
    }

    // Exercise the actual import and association handlers, without entering a world.
    require('../src/main/ipc/library.ipc.ts').registerLibraryHandlers()
    const beforeImport = requests.length
    handlers.get(IPC_CHANNELS.ADD_GAME)(null, fixture('auto-import', 'v390'))
    await waitForAnalysis('auto-import', 'v390')
    assert.equal(requests.length, beforeImport + 1, 'import immediately schedules enabled analysis')
    handlers.get(IPC_CHANNELS.ADD_GAME)(null, fixture('auto-link', null))
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(requests.length, beforeImport + 1, 'an unlinked import does not call AI')
    handlers.get(IPC_CHANNELS.UPDATE_GAME)(null, 'auto-link', { vndbId: 'v391' })
    await waitForAnalysis('auto-link', 'v391')
    assert.equal(requests.length, beforeImport + 2, 'linking to VNDB immediately schedules analysis')
    handlers.get(IPC_CHANNELS.UPDATE_GAME)(null, 'auto-link', { vndbId: 'v391', notes: 'private-fixture-edit' })
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(requests.length, beforeImport + 2, 'an unchanged association does not repeat analysis')
    add('disabled-during-metadata', 'v396')
    const beforeTurningOff = requests.length
    const automatic = pipeline.scheduleWorldAnalysis('disabled-during-metadata')
    ai.saveAiSettings({ autoAnalyze: false })
    await automatic
    assert.equal(requests.length, beforeTurningOff, 'turning off analysis while metadata loads prevents the AI request')

    add('legacy-valid', 'v305')
    const migration = world.migrateLegacyWorldProps([
      { key: 'gal-world-props:deleted-legacy-game', props: [{ kind: 'tree', x: 6, z: 6 }] },
      { key: 'gal-world-props:legacy-valid', props: [{ kind: 'tree', x: 7, z: -7 }] }
    ])
    assert.deepEqual(migration.keys, ['gal-world-props:legacy-valid'], 'an orphan cannot roll back valid layouts')
    assert.equal(world.getWorldState('legacy-valid').placements.length, 1)
    db.getDb().prepare("UPDATE world_states SET placements = '{}', added_elements = 'null', removed_element_ids = 'false' WHERE game_id = ?").run('legacy-valid')
    assert.deepEqual(world.getWorldState('legacy-valid').placements, [])
    assert.deepEqual(world.getWorldState('legacy-valid').addedElements, [])
    assert.deepEqual(world.getWorldState('legacy-valid').removedElementIds, [])
    db.getDb().prepare("UPDATE world_analyses SET payload = '{}' WHERE game_id = ?").run('new-game')
    ai.saveAiSettings({ autoAnalyze: false })
    const beforeDisabled = requests.length
    handlers.get(IPC_CHANNELS.ADD_GAME)(null, fixture('disabled-import', 'v392'))
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(world.getWorldAnalysis('disabled-import', 'v392'), null)
    assert.equal((await pipeline.getWorldInfo('new-game')).analysis.source, 'rules', 'a malformed cache is rebuilt')
    require('../src/main/ipc/world.ipc.ts').registerWorldHandlers()
    assert.deepEqual(await handlers.get(IPC_CHANNELS.ANALYZE_WORLD_QUEUE)(), { analyzed: 0, remaining: 0 })
    ai.saveAiSettings({ autoAnalyze: true })
    const queued = handlers.get(IPC_CHANNELS.ANALYZE_WORLD_QUEUE)()
    ai.saveAiSettings({ autoAnalyze: false })
    await queued
    assert.equal(requests.length, beforeDisabled, 'the queue respects the automatic analysis switch')
    const hub = pipeline.getHubWorld()
    assert.equal(hub.blueprint.kind, 'hub')
    assert.equal(requests.length, beforeDisabled, 'the hub does not call AI')

    encrypted = false
    ai.saveAiSettings({ apiKey: 'fixture-session-key' })
    assert.equal(ai.getAiStatus().keySet, true)
    assert.equal(ai.aiKeyEncrypted(), false)
    assert.equal(db.getSetting('aiKey'), '', 'encryption unavailable never writes a plaintext fallback')
    assert.ok(!JSON.stringify(ai.getAiStatus()).includes('fixture-session-key'))
    await ai.testAiConnection()
    assert.equal(requests[requests.length - 1].authorization, 'Bearer fixture-session-key', 'the session key still works')
    ai.saveAiSettings({ apiKey: '' })
    assert.equal(ai.getAiStatus().keySet, false)

    console.log('PASS world pipeline: new-game generation, automatic import/association hooks, AI switch/cache/dedup, supported/pending/missing elements, fallback, custom layout preservation, stale response rejection, orphan migration, corrupt cache recovery, key storage')
    console.log('Isolated fixtures: ' + testDir)
  } finally {
    await new Promise(resolve => server.close(resolve))
    db.closeDatabase(); app.quit()
  }
}).catch(error => { console.error(error); app.exit(1) })
