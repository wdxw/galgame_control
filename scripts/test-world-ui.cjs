// End-to-end run of the 3D world: planet catalogue, per-work scenes, the
// curated Muramasa world, launching from an object, building, persistence and
// the legacy localStorage migration.
const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const { spawnSync } = require('child_process')
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true, timeout: 600000 })
  process.exit(result.status ?? 1)
}
const { app, BrowserWindow, protocol, net } = require('electron')
const { backstage, showBackstage } = require('./lib/backstage.cjs')
const Module = require('module')
const root = path.resolve(__dirname, '..')
// Also exercise the renderer/preload shipped in an unpacked executable.
const builtRoot = process.env.WORLD_UI_APP_ASAR ? path.join(path.resolve(process.env.WORLD_UI_APP_ASAR), 'out') : path.join(root, 'out')
const testDir = fs.mkdtempSync(path.join(root, 'build', 'world-ui-'))
app.setPath('appData', testDir); app.setPath('userData', path.join(testDir, 'profile'))
// The scene has to draw real frames: the camera eases towards the avatar, and the
// clicks below aim at where the props are projected. Chromium only drives
// requestAnimationFrame for a window it considers visible, so the test window is
// shown rather than hidden, and the backgrounding switches below keep it running
// even when another window covers it — an occluded page is throttled to a few
// frames a second, which is far too slow for the camera to arrive anywhere.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
protocol.registerSchemesAsPrivileged([{ scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
require.extensions['.ts'] = (module, filename) => module._compile(require('esbuild').transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename)
const { zh, en } = require('../src/renderer/i18n/translations.ts')
const { PALETTES } = require('../src/shared/worldRules.ts')

const cases = [
  { id: 'world-0', vndbId: 'v100', biome: 'school', title: '青空学园', tags: [], color: '#bc93b5' },
  { id: 'world-1', vndbId: 'v101', biome: 'coast', title: '潮汐之岛', tags: ['Island', 'Ocean'], color: '#4992a6' },
  { id: 'world-2', vndbId: 'v102', biome: 'scifi', title: '星海档案', tags: ['Science Fiction', 'Space', 'Time Travel'], color: '#646caa' },
  { id: 'world-3', vndbId: 'v103', biome: 'shrine', title: '山间神社', tags: ['Shrine', 'Miko', 'Romance'], color: '#bd7d74' },
  { id: 'world-4', vndbId: 'v104', biome: 'fantasy', title: '森之古约', tags: ['Fantasy', 'Magic', 'Library'], color: '#598776' },
  { id: 'world-5', vndbId: 'v105', biome: 'mystery', title: '午夜回廊', tags: ['Mystery', 'Gothic'], color: '#6f678c' },
  { id: 'world-6', vndbId: 'v106', biome: 'winter', title: '雪国列车', tags: ['Winter', 'Snow', 'Train'], color: '#8fa8b8' },
  { id: 'world-7', vndbId: 'v107', biome: 'garden', title: '花与信', tags: ['Romance', 'Music'], color: '#ad8c99' },
  { id: 'world-8', vndbId: 'v108', biome: 'coast', title: '深海回声', tags: ['Underwater', 'Science Fiction'], color: '#397082' },
  { id: 'world-9', vndbId: 'v2016', biome: 'mystery', title: '装甲恶鬼村正', tags: ['Mystery', 'Katana'], color: '#5d5a52', curated: true }
]
const byVndb = new Map(cases.map(entry => [entry.vndbId, entry]))

const originalLoad = Module._load
let launched = null
let launchCount = 0
let launchWindow = null
const launchMediaSnapshots = []
const lookups = []
const neteaseLookups = []
// Keep a long, valid PCM fixture available to every test game.  It lets the
// UI test observe real playback time while it crosses pages and worlds instead
// of only checking that an <audio> element exists.
const writeWavFixture = (filePath, seconds = 300) => {
  const sampleRate = 22050
  const dataSize = sampleRate * seconds * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + dataSize, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(dataSize, 40)
  const audio = Buffer.allocUnsafe(dataSize)
  for (let i = 0; i < dataSize / 2; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 4500)
    audio.writeInt16LE(sample, i * 2)
  }
  fs.writeFileSync(filePath, Buffer.concat([header, audio]))
}
writeWavFixture(path.join(testDir, 'World Theme.wav'))
Module._load = function (request, parent, isMain) {
  if (!process.env.WORLD_UI_NETEASE_LIVE && request === './ratingNetwork' && parent.filename.endsWith('neteaseMusic.ts')) return {
    cachedRating: async (_key, _force, fetcher) => ({ data: await fetcher(), stale: false, updatedAt: 1000 }),
    requestRatingJson: async (_url, body) => {
      const query = body.get('s'); neteaseLookups.push(query)
      if (query === 'offline') throw new Error('offline fixture')
      const album = { id: 494126, name: query + ' · Original Soundtrack', artist: { name: 'Cloud Music Fixture' } }
      return { code: 200, result: body.get('type') === '10' ? { albums: [album] } : { songs: [{ id: 4942751, name: '落葉', al: album, ar: [{ name: 'いとうかなこ' }], dt: 283946 }, { id: 4942713, name: '村正(矛)', al: album, dt: 127400 }] } }
    }
  }
  if (request === '../services/gameLauncher' && parent.filename.endsWith('launcher.ipc.ts')) return { launchGame: async id => {
    launchMediaSnapshots.push(await launchWindow.webContents.executeJavaScript('(()=>{const a=document.querySelector("[data-music-audio]");return {paused:a?.paused,src:a?.getAttribute("src"),frames:document.querySelectorAll("[data-netease-player]").length,hidden:document.querySelector("[data-background-music]")?.hidden}})()'))
    launched = id; launchCount++; return { success: true }
  } }
  if (request === './ratingNetwork' && parent.filename.endsWith('worldMetadata.ts')) return {
    cachedRating: async (_key, _force, fetcher) => ({ data: await fetcher(), stale: false }),
    requestRatingJson: async (_url, body) => {
      lookups.push(body.filters)
      const entry = byVndb.get(body.filters[2])
      if (!entry) return { results: [] }
      return { results: [{ id: entry.vndbId, description: entry.title, image: null, tags: [
        ...entry.tags.map(name => ({ name, category: 'cont', spoiler: 0, rating: 2 })),
        { name: 'Spoiler excluded', category: 'cont', spoiler: 2, rating: 3 }
      ] }] }
    }
  }
  if (request === './ratingNetwork' && parent.filename.endsWith('musicClient.ts')) return {
    cachedRating: async (_key, _force, fetcher) => ({ data: await fetcher(), stale: false, updatedAt: 1000 }),
    requestRatingJson: async (url, body) => {
      if (url.includes('/kana/vn')) {
        const entry = byVndb.get(body.filters[2])
        return { results: entry ? [{ id: entry.vndbId, title: entry.title, alttitle: entry.title, extlinks: [{ id: '7755', label: 'VGMdb', name: 'vgmdb_product', url: 'https://vgmdb.net/product/7755' }], relations: [] }] : [] }
      }
      if (url.includes('/product/')) return { albums: [{ id: 9001, names: { en: 'Fixture Original Soundtrack' }, date: '2026-01-01' }] }
      if (url.includes('/album/')) return { id: 9001, names: { en: 'Fixture Original Soundtrack' }, discs: [{ name: 'Disc 1', tracks: [{ number: 1, names: { en: 'World Theme' }, length: '2:18' }, { number: 2, names: { en: 'Night Walk' }, length: '3:04' }] }] }
      return {}
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  if (!process.env.WORLD_UI_NETEASE_LIVE) protocol.handle('https', request => {
    if (new URL(request.url).hostname === 'music.163.com') {
      if (new URL(request.url).pathname === '/fixture-tone.wav') return new Response(fs.readFileSync(path.join(testDir, 'World Theme.wav')), { headers: { 'Content-Type': 'audio/wav' } })
      return new Response('<!doctype html><html><body>Music player fixture<audio controls autoplay loop src="https://music.163.com/fixture-tone.wav"></audio></body></html>', { headers: { 'Content-Type': 'text/html' } })
    }
    return net.fetch(request, { bypassCustomProtocolHandlers: true })
  })
  protocol.handle('local-file', request => {
    const filePath = decodeURI(request.url.slice('local-file:///'.length))
    const contentType = path.extname(filePath).toLowerCase() === '.wav' ? 'audio/wav' : 'image/svg+xml'
    return new Response(fs.readFileSync(filePath), { headers: { 'Content-Type': contentType } })
  })
  const db = require('../src/main/services/library.db.ts'); db.initDatabase()
  const world = require('../src/main/services/world.db.ts')
  cases.forEach((entry, i) => {
    const coverPath = path.join(testDir, 'cover-' + i + '.svg')
    fs.writeFileSync(coverPath, '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="' + entry.color + '"/><circle cx="290" cy="120" r="70" fill="#f1dbc1"/><path d="M0 430L150 220L300 470L400 340V600H0Z" fill="#233b52" opacity=".65"/><rect x="22" y="22" width="356" height="556" fill="none" stroke="#f6e4c6" stroke-width="2"/><text x="200" y="495" text-anchor="middle" fill="#fff3df" font-size="40" font-family="sans-serif">' + entry.title + '</text><text x="200" y="535" text-anchor="middle" fill="#e4dac9" font-size="15">WORLD TEST · ' + entry.biome.toUpperCase() + '</text></svg>')
    db.addGame({ id: entry.id, title: entry.title, originalTitle: entry.title, exePath: i + '.exe', gameDir: testDir,
      coverPath, coverSource: 'manual', vndbId: entry.vndbId, worldTags: entry.tags,
      bangumiId: null, developer: '世界场景测试', description: null, releaseDate: null, playTime: 0,
      lastPlayed: null, dateAdded: '2026-09-27T00:00:00Z', isFavorite: false, notes: null, exeArgs: null })
  })
  require('../src/main/ipc/index.ts').registerAllHandlers()
  const win = new BrowserWindow({ width: 1440, height: 1000, frame: false, show: false,
    webPreferences: { preload: path.join(builtRoot, 'preload/preload.js'), sandbox: false, contextIsolation: true, backgroundThrottling: false } })
  launchWindow = win
  win.webContents.setAudioMuted(true)
  backstage(win)
  const errors = []
  win.webContents.on('console-message', (_event, level, message) => { if (process.env.WORLD_UI_TRACE) console.log('[renderer ' + level + ']', message); if (level >= 3) errors.push(message) })
  // The renderer reports a thrown script without saying which one, so keep the
  // source of the failing call in the message.
  const run = code => win.webContents.executeJavaScript(code)
    .catch(error => { throw new Error(error.message + '\n  while running: ' + code) })
  const waitFor = async code => {
    for (let i = 0; i < 200; i++) { if (await run(code)) return; await pause(100) }
    throw new Error('Timeout: ' + code)
  }
  const click = async selector => { await waitFor('!!document.querySelector(' + JSON.stringify(selector) + ')'); await run('document.querySelector(' + JSON.stringify(selector) + ').click()') }
  const capture = async name => { await pause(700); fs.writeFileSync(path.join(testDir, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
  const record = async name => {
    const clip = await run(`new Promise((resolve, reject) => {
      const stream = document.querySelector('canvas').captureStream(30), chunks = [];
      const recorder = new MediaRecorder(stream, {mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3500000});
      recorder.ondataavailable = event => { if(event.data.size) chunks.push(event.data) };
      recorder.onerror = reject;
      recorder.onstop = () => { stream.getTracks().forEach(track=>track.stop()); const reader=new FileReader();
        reader.onload=()=>resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob(chunks,{type:'video/webm'})); };
      recorder.start(); setTimeout(()=>recorder.stop(), 4000);
    })`)
    fs.writeFileSync(path.join(testDir, name + '.webm'), Buffer.from(clip, 'base64'))
  }
  const worldReady = async biome => {
    await waitFor('document.querySelector(".world-shell")?.dataset.worldBiome===' + JSON.stringify(biome) + ' && !document.querySelector(".world-loading") && !!window.galWorldProbe')
    // The chase camera eases towards the avatar, so give it enough frames to
    // arrive before anything is projected onto the screen or clicked.
    await run('window.__worldFrames = window.galWorldProbe.stats().frames')
    // A minimize/restore or a page navigation can take Chromium a few seconds
    // to resume the compositor.  Keep the readiness budget generous while the
    // frame delta itself remains the same meaningful check.
    for (let i = 0; i < 600; i++) { if (await run('window.galWorldProbe.stats().frames - window.__worldFrames > 45')) return; await pause(100) }
    throw new Error('Timeout: world frames did not resume for ' + biome)
  }
  const enterWorld = async id => {
    await click('[data-world-action="catalog"]')
    const target = '[data-enter-world="' + id + '"]'
    const shown = () => run('!!document.querySelector(' + JSON.stringify(target) + ')')
    if (!(await shown())) {
      // The catalogue keeps its page between visits, so search both ways.
      for (let i = 0; i < 3 && !(await shown()); i++) await click('[aria-label="下一页星球"]')
      for (let i = 0; i < 3 && !(await shown()); i++) await click('[aria-label="上一页星球"]')
    }
    await click(target)
  }
  const pointerAt = async point => run('(()=>{const c=document.querySelector("canvas");for(const type of ["pointerdown","pointerup"])' +
    'c.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:1,clientX:' + Math.round(point.x) + ',clientY:' + Math.round(point.y) + '}));})()')
  const hoverAt = async point => run('(()=>{const c=document.querySelector("canvas");' +
    'c.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,pointerId:1,clientX:' + Math.round(point.x) + ',clientY:' + Math.round(point.y) + '}));})()')
  const placements = id => world.getWorldState(id).placements.length
  const waitForPlacements = async (id, count) => {
    for (let i = 0; i < 100; i++) { if (placements(id) === count) return; await pause(100) }
    throw new Error('Timeout: ' + id + ' has ' + placements(id) + ' placements, expected ' + count)
  }

  try {
    await win.loadFile(path.join(builtRoot, 'renderer/index.html'))
    // An uncomposited window has no accelerated layer for capturePage to pick up,
    // so the window has to be shown once the page is loaded for the screenshots to
    // contain the canvas. It is shown without focus, in the corner, so a run does
    // not take over the desktop.
    showBackstage(win)
    await waitFor('document.querySelectorAll(".game-card").length === ' + cases.length)
    // A layout saved by an older build, waiting to be moved into the database.
    await run('localStorage.setItem("gal-world-props:world-3", JSON.stringify([{kind:"tree",x:6.5,z:-6.5},{kind:"crystal",x:-7,z:-5.5}]))')
    await run('localStorage.setItem("gal-world-props:hub", JSON.stringify([{kind:"lantern",x:5.5,z:-5.5}]))')
    await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("三维世界")).click()')
    await worldReady('hub'); await capture('hub')
    if (process.env.WORLD_UI_NETEASE_LIVE === '1') {
      win.webContents.setAudioMuted(true)
      await enterWorld('world-9'); await worldReady('mystery')
      await click('[data-music-source="netease"]')
      await waitFor('document.querySelector("[data-netease-status]")?.dataset.neteaseStatus==="ready"')
      await click('[data-world-music-album="netease:494126"] .world-music-album-row')
      await click('[data-world-music-track="netease-song:4942751"] .world-music-play')
      await pause(8000)
      const frame = win.webContents.mainFrame.frames.find(item => item.url.startsWith('https://music.163.com/outchain/player'))
      assert.ok(frame, 'official NetEase player loaded inside the world')
      await frame.executeJavaScript('document.querySelector("#play")?.click()', true)
      await pause(12000)
      const state = await frame.executeJavaScript('({title:document.title,text:document.body.innerText.slice(0,1500),audio:Array.from(document.querySelectorAll("audio")).map(a=>({paused:a.paused,time:a.currentTime,duration:a.duration,error:a.error?.code})),hasApi:typeof window.api?.getAllGames==="function"||typeof window.api?.launchGame==="function",hasRequire:typeof require!=="undefined"})')
      console.log('LIVE NetEase player: ' + JSON.stringify(state))
      assert.equal(state.hasApi, false, 'remote player has no preload API')
      assert.equal(state.hasRequire, false, 'remote player has no Node access')
      await capture('world-muramasa-netease-live')
      console.log('Renderer diagnostics: ' + JSON.stringify(errors))
      console.log('Screenshots: ' + testDir)
      return
    }
    if (process.env.WORLD_UI_BACKGROUND_ONLY === '1') {
      win.webContents.setAudioMuted(true)
      await enterWorld('world-0'); await worldReady('school')
      await waitFor('!!document.querySelector("[data-world-music]")')
      await click('[data-music-source="local"]')
      await waitFor('!!document.querySelector("[data-world-music-album=local]")')
      await click('[data-world-music-album="local"] .world-music-album-row')
      await waitFor('document.querySelectorAll("[data-world-music-track]").length > 0')
      await run('Array.from(document.querySelectorAll("[data-world-music-track]")).find(row=>row.querySelector("strong")?.textContent==="World Theme").querySelector("button").click()')
      await waitFor('document.querySelector("[data-music-audio]")?.src.includes("local-file:") && !document.querySelector("[data-music-audio]").paused && document.querySelector("[data-music-audio]").currentTime > 0')
      await run('window.__backgroundAudioNode = document.querySelector("[data-music-audio]")')
      await capture('background-local-controls')
      const start = await run('document.querySelector("[data-music-audio]").currentTime')
      await click('[aria-label="关闭音乐窗口"]'); await pause(550)
      assert.ok(await run('document.querySelector("[data-music-audio]").currentTime > ' + start), 'music continues after closing its world window')
      const beforeMinimize = await run('document.querySelector("[data-music-audio]").currentTime')
      win.minimize(); await pause(550); showBackstage(win)
      assert.ok(await run('document.querySelector("[data-music-audio]").currentTime > ' + beforeMinimize), 'music continues while minimized')
      await click('[data-world-action="back"]'); await worldReady('hub')
      await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("全部游戏")).click()')
      await waitFor('document.querySelectorAll(".game-card").length === ' + cases.length)
      const inLibrary = await run('document.querySelector("[data-music-audio]").currentTime')
      await pause(550)
      assert.ok(await run('document.querySelector("[data-music-audio]").currentTime > ' + inLibrary), 'music continues in the game library')
      await capture('background-local-library')
      await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("三维世界")).click()')
      await worldReady('hub'); await enterWorld('world-1'); await worldReady('coast')
      const inWorldAgain = await run('document.querySelector("[data-music-audio]").currentTime')
      assert.ok(inWorldAgain > inLibrary, 'music continues after entering a different world')
      assert.equal(await run('document.querySelector("[data-music-audio]") === window.__backgroundAudioNode'), true, 'world navigation preserves the same audio element')
      await click('[data-world-action="back"]'); await worldReady('hub')
      await enterWorld('world-2'); await worldReady('scifi')
      const launchPoint = await run('window.galWorldProbe.launchScreenPoint()')
      await pointerAt(launchPoint)
      await waitFor('document.querySelector("[data-background-music]")?.hidden && document.querySelector("[data-music-audio]")?.paused')
      assert.equal(await run('document.querySelector("[data-music-audio]").getAttribute("src")'), null, 'launch clears the audio source')
      await waitFor('document.body.textContent.includes("正在启动 星海档案")')
      assert.equal(launched, 'world-2')
      await click('.world-resume')

      // The cloud fixture uses a real cross-origin audio player.  A frame merely
      // remaining in the DOM would not prove that hidden controls keep playing.
      const startCloud = async () => {
        if (!await run('!!document.querySelector("[data-world-music]")')) await click('[data-world-action="music"]')
        await click('[data-music-source="netease"]')
        await waitFor('document.querySelector("[data-netease-status]")?.dataset.neteaseStatus==="ready"')
        await click('[data-world-music-album="netease:494126"] .world-music-album-row')
        await click('[data-world-music-track="netease-song:4942751"] .world-music-play')
        let frame
        for (let i = 0; i < 100; i++) {
          frame = win.webContents.mainFrame.frames.find(item => item.url.startsWith('https://music.163.com/outchain/player'))
          if (frame && await frame.executeJavaScript('!!document.querySelector("audio")')) break
          await pause(100)
        }
        assert.ok(frame, 'cloud player loads a separate frame')
        await frame.executeJavaScript('document.querySelector("audio").play()', true)
        await pause(400)
        const state = await frame.executeJavaScript('({time:document.querySelector("audio").currentTime,paused:document.querySelector("audio").paused,api:typeof window.api,require:typeof require})')
        assert.ok(state.time > 0 && !state.paused, 'the cloud fixture actually plays audio')
        assert.equal(state.api, 'undefined', 'remote audio player has no local app API')
        assert.equal(state.require, 'undefined', 'remote audio player has no Node access')
        await run('window.__backgroundCloudNode = document.querySelector("[data-netease-player]")')
        return frame
      }
      const frame = await startCloud()
      const cloudTime = () => frame.executeJavaScript('document.querySelector("audio").currentTime')
      const assertCloudContinues = async (previous, message) => {
        await pause(450)
        assert.equal(await run('document.querySelector("[data-netease-player]") === window.__backgroundCloudNode'), true, message + ': frame identity')
        assert.equal(await frame.executeJavaScript('document.querySelector("audio").paused'), false, message + ': still playing')
        assert.ok(await cloudTime() > previous, message + ': progress advances')
      }
      await capture('background-cloud-controls')
      const beforeCloudClose = await cloudTime()
      await click('[aria-label="关闭音乐窗口"]')
      await assertCloudContinues(beforeCloudClose, 'closing music controls keeps cloud audio playing')
      const beforeCloudMinimize = await cloudTime()
      win.minimize(); await pause(550); showBackstage(win)
      await assertCloudContinues(beforeCloudMinimize, 'minimizing keeps cloud audio playing')
      await click('[data-world-action="back"]'); await worldReady('hub')
      const beforeNewWorld = await cloudTime()
      await enterWorld('world-1'); await worldReady('coast')
      await assertCloudContinues(beforeNewWorld, 'entering a different world keeps cloud audio playing')
      const beforeCloudLibrary = await cloudTime()
      await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("全部游戏")).click()')
      await waitFor('document.querySelectorAll(".game-card").length === ' + cases.length)
      await assertCloudContinues(beforeCloudLibrary, 'library navigation keeps cloud audio playing')
      await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("三维世界")).click()')
      await worldReady('hub'); await enterWorld('world-0'); await worldReady('school')
      await assertCloudContinues(beforeCloudLibrary, 'switching from library to world keeps cloud audio playing')
      await capture('background-cloud-world')
      await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("全部游戏")).click()')
      await waitFor('document.querySelectorAll(".game-card").length === ' + cases.length)
      await run('Array.from(document.querySelectorAll(".game-card")).find(card=>card.querySelector("h3")?.textContent==="青空学园").querySelector("button").click()')
      await waitFor('document.querySelector("[data-background-music]")?.hidden && !document.querySelector("[data-netease-player]")')
      for (let i = 0; i < 100 && launchCount < 2; i++) await pause(100)
      assert.equal(launchCount, 2, 'the game card launches the game after stopping cloud playback')
      assert.equal(launched, 'world-0')
      assert.deepEqual(launchMediaSnapshots, Array(2).fill({ paused: true, src: null, frames: 0, hidden: true }), 'media is already stopped when the game launcher receives each request')
      assert.deepEqual(errors, [])
      console.log('PASS background music: local and cross-origin audio progress survives close, minimize, library/world navigation; world object and library card stop media before launch; remote frame isolation')
      console.log('Screenshots: ' + testDir)
      return
    }
    await run('document.querySelector("canvas").dispatchEvent(new WheelEvent("wheel", {bubbles:true,deltaY:-420}))')
    await pause(1400); await capture('character-close')
    await click('[data-world-action="build"]'); await click('[data-world-action="reset"]'); await pause(1200)
    const hubGlobe = require('../src/main/services/worldAnalysis.ts').getHubWorld().blueprint.placements.findIndex(item => item.modelId === 'globe_monument')
    await pointerAt(await run('window.galWorldProbe.propScreenPoint("gen-' + hubGlobe + '")'))
    await waitFor('!!document.querySelector(".world-catalog")')
    await click('[aria-label="关闭星球目录"]')

    // The raised garden must be reachable through the actual ground picker and
    // navigation, not merely look raised in a screenshot.
    await click('[data-world-action="build"]')
    await click('[data-world-action="frame"]')
    await pause(1200); await capture('hub-overview')
    await record('river-flow')
    const hubBlueprint = require('../src/main/services/worldAnalysis.ts').getHubWorld().blueprint
    const hubEdits = world.getWorldState('__hub__').placements
    const land = require('../src/renderer/components/world/scene/landscape.ts').landscapeFor(hubBlueprint, hubEdits)
    const river = require('../src/renderer/components/world/scene/riverLayout.ts').riverLayout(hubBlueprint, hubEdits, land)
    await click('[data-world-tool="tree"]')
    let riverRefused = false
    for (const p of river.points.filter((_, i) => i % 6 === 0)) {
      await hoverAt(await run('window.galWorldProbe.screenPoint(' + p.x + ',' + p.z + ')')); await pause(120)
      if (await run('document.querySelector("[data-world-hint]")?.dataset.worldHint==="river"')) { riverRefused = true; break }
    }
    assert.ok(riverRefused, 'building explains why the river must remain clear')
    await capture('river-build-refused')
    await click('[data-world-action="reset"]')
    await run('document.querySelector("canvas").dispatchEvent(new WheelEvent("wheel", {bubbles:true,deltaY:700}))')
    await pause(1400)
    let reachedTerrace = false
    for (const [x, z] of [[0, -11.5], [-3, -10.5], [4, -10.5]]) {
      const point = await run('window.galWorldProbe.screenPoint(' + x + ',' + z + ')')
      if (!point) continue
      await pointerAt(point)
      for (let step = 0; step < 80; step++) {
        const avatar = await run('window.galWorldProbe.stats().avatar')
        if (avatar[1] > 0.85 && avatar[2] < -7.5) { reachedTerrace = true; break }
        await pause(100)
      }
      if (reachedTerrace) break
    }
    assert.ok(reachedTerrace, 'clicking elevated ground guides the avatar onto the terrace')
    await pause(1100); await capture('hub-terrace-walk')
    if (process.env.WORLD_UI_VISUAL_ONLY === '1') {
      assert.deepEqual(errors, [], 'no rendering errors in water or character materials')
      console.log('PASS visual checks: river placement protection, terrace walking, character close view, animated water capture')
      console.log('Screenshots: ' + testDir)
      return
    }

    await waitForPlacements('world-3', 2)
    await waitForPlacements('__hub__', 1)
    assert.equal(await run('localStorage.getItem("gal-world-props:world-3")'), null, 'the migrated key is cleared')
    assert.equal(await run('localStorage.getItem("gal-world-props:hub")'), null, 'the shared island migrates too')

    for (const entry of cases) {
      await enterWorld(entry.id)
      await worldReady(entry.biome)
      await waitFor('document.querySelector(".world-launch-text small")?.textContent.includes("VNDB 资料已同步")')
      if (entry.id === 'world-0') {
        await waitFor('!!document.querySelector("[data-world-music]")')
        await waitFor('document.querySelectorAll("[data-world-music-album]").length > 0')
        await click('[data-world-music-album="vgmdb:9001"] button')
        await waitFor('document.querySelectorAll("[data-world-music-track]").length === 2')
        assert.ok(await run('document.querySelector("[data-world-music-track]").textContent.includes("World Theme")'), 'VNDB-linked album track list is shown')
        await click('[data-music-source="netease"]')
        await waitFor('document.querySelectorAll("[data-world-music-album]").length===1')
        await click('[data-world-music-album="netease:494126"] .world-music-album-row')
        assert.equal(await run('document.querySelector(".world-music-play").disabled'), false, 'NetEase song needs no local file')
        await click('[data-world-music-track="netease-song:4942751"] .world-music-play')
        await waitFor('document.querySelector("[data-netease-player]")?.src.includes("type=2&id=4942751")')
        await click('[data-world-music-track="netease-song:4942713"] .world-music-play')
        await waitFor('document.querySelector("[data-netease-player]")?.src.includes("id=4942713")')
        assert.equal(await run('document.querySelectorAll("[data-netease-player]").length'), 1, 'song switching keeps one player')
        assert.equal(await run('document.querySelector("audio").paused'), true, 'local audio is stopped during cloud playback')
        await click('[data-music-play-album="netease:494126"]')
        await waitFor('document.querySelector("[data-netease-player]")?.src.includes("type=1&id=494126")')
        await capture('world-netease-album')
        await click('[data-music-stop]')
        assert.equal(await run('document.querySelectorAll("[data-netease-player]").length'), 0)
        const submitMusicSearch = async query => {
          await run('(()=>{const i=document.querySelector(".world-music-search input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,' + JSON.stringify(query) + ');i.dispatchEvent(new Event("input",{bubbles:true}))})()')
          await click('.world-music-search button')
        }
        await submitMusicSearch('offline')
        await waitFor('document.querySelector("[data-netease-status]")?.dataset.neteaseStatus==="error"')
        await click('[data-music-source="vndb"]')
        assert.equal(await run('Array.from(document.querySelectorAll("[data-world-music-album]")).some(a=>a.dataset.worldMusicAlbum==="vgmdb:9001")'), true, 'VNDB survives a cloud failure')
        await click('[data-music-source="netease"]')
        await submitMusicSearch('MURAMASA')
        await waitFor('document.querySelector("[data-netease-status]")?.dataset.neteaseStatus==="ready"')
        assert.ok(neteaseLookups.includes('MURAMASA'), 'manual music query reached the service')
        await click('[data-world-music-album="netease:494126"] .world-music-album-row')
        await click('[data-world-music-track="netease-song:4942751"] .world-music-play')
        await click('[aria-label="关闭音乐窗口"]')
        assert.equal(await run('document.querySelectorAll("[data-netease-player]").length'), 1, 'closing the music window keeps the shared player mounted')
        await click('[data-world-action="music"]')
        assert.equal(await run('document.querySelectorAll("[data-netease-player]").length'), 1, 'reopening the music window keeps the same shared player')

        // A local track uses the app-owned audio element.  Its clock is the
        // observable proof that the player survives panel and page changes.
        await click('[data-music-source="local"]')
        await waitFor('!!document.querySelector("[data-world-music-album=local]")')
        await click('[data-world-music-album="local"] .world-music-album-row')
        await waitFor('document.querySelectorAll("[data-world-music-track]").length > 0')
        await run('Array.from(document.querySelectorAll("[data-world-music-track]")).find(row=>row.querySelector("strong")?.textContent==="World Theme").querySelector("button").click()')
        await waitFor('document.querySelector("[data-music-audio]")?.src.includes("local-file:") && !document.querySelector("[data-music-audio]").paused && document.querySelector("[data-music-audio]").currentTime > 0')
        await run('window.__backgroundAudioNode = document.querySelector("[data-music-audio]")')
        const localTimeBeforeClose = await run('document.querySelector("[data-music-audio]").currentTime')
        await click('[aria-label="关闭音乐窗口"]')
        await pause(650)
        assert.equal(await run('document.querySelector("[data-music-audio]") === window.__backgroundAudioNode'), true, 'the audio element survives closing the music window')
        assert.ok(await run('document.querySelector("[data-music-audio]").currentTime > ' + localTimeBeforeClose), 'local audio keeps advancing after closing the music window')

        const localTimeBeforeMinimize = await run('document.querySelector("[data-music-audio]").currentTime')
        win.minimize(); await pause(650); showBackstage(win)
        assert.ok(await run('document.querySelector("[data-music-audio]").currentTime > ' + localTimeBeforeMinimize), 'local audio keeps advancing while the app is minimized')

        await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("全部游戏")).click()')
        await waitFor('document.querySelectorAll(".game-card").length === ' + cases.length)
        const localTimeInLibrary = await run('document.querySelector("[data-music-audio]").currentTime')
        await pause(650)
        assert.ok(await run('document.querySelector("[data-music-audio]").currentTime > ' + localTimeInLibrary), 'local audio keeps advancing in the game library')
        await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("三维世界")).click()')
        await worldReady('hub')
        const localTimeAtHub = await run('document.querySelector("[data-music-audio]").currentTime')
        await enterWorld('world-0'); await worldReady('school')
        assert.ok(await run('document.querySelector("[data-music-audio]").currentTime > ' + localTimeAtHub), 'local audio keeps advancing after returning to a world')
        await capture('world-netease-music')
      }
      await capture('world-' + entry.biome + '-' + entry.id)
      if (entry.curated) {
        await click('[data-world-action="features"]')
        await waitFor('document.querySelector(".world-panel")?.textContent.includes("妖刀")')
        assert.ok(await run('document.querySelector(".world-element.is-launch strong").textContent.includes("刀架")'),
          'the cursed blade is the entrance of the Muramasa world')
        await capture('world-muramasa-panel')
        await click('[aria-label="关闭世界特色"]')
      }
      assert.deepEqual(db.getGameById(entry.id).worldTags, entry.tags)
      await click('[data-world-action="back"]')
      await worldReady('hub')
      const backgroundStateAfterWorld = await run('(()=>{const root=document.querySelector("[data-background-music]"); const audio=document.querySelector("[data-music-audio]"); return {active:!!root, kind:root?.dataset.backgroundMusic || null, time:audio?.currentTime || 0, paused:audio?.paused ?? true}})()')
      if (backgroundStateAfterWorld.active && backgroundStateAfterWorld.kind === 'local' && !backgroundStateAfterWorld.paused) {
        await pause(450)
        assert.ok(await run('document.querySelector("[data-music-audio]").currentTime > ' + backgroundStateAfterWorld.time), 'leaving a world keeps local music playing')
      }
    }

    // Launching by clicking the object itself.
    await enterWorld('world-2'); await worldReady('scifi')
    const entrance = await run('window.galWorldProbe.launchScreenPoint()')
    assert.ok(entrance, 'the world entrance is drawn on screen')
    assert.equal(await run('document.querySelector("[data-background-music]")?.dataset.backgroundMusic'), 'local', 'background music is still active before launching a game')
    await pointerAt(entrance)
    await waitFor('document.querySelector("[data-background-music]")?.hidden && document.querySelector("[data-music-audio]")?.paused')
    assert.equal(await run('document.querySelector("[data-music-audio]").getAttribute("src")'), null, 'launching a game clears the local audio source before IPC')
    await waitFor('document.body.textContent.includes("正在启动 星海档案")')
    assert.equal(launched, 'world-2')
    assert.equal(await run('!!document.querySelector(".world-resume")'), true, 'rendering pauses after a launch')
    await run('document.querySelector(".world-resume").click()')

    // Building, undo and persistence.
    await click('[data-world-action="build"]')
    await click('[data-world-tool="tree"]')
    await pause(1200)
    const spots = [[7, -6], [-7, -6], [8, 4], [-8, 4], [6, -9], [-6, -9]]
    for (const [x, z] of spots) {
      if (placements('world-2') > 0) break
      const point = await run('window.galWorldProbe.screenPoint(' + x + ',' + z + ')')
      if (point) { await pointerAt(point); await pause(900) }
    }
    await waitForPlacements('world-2', 1)
    // A refused spot explains itself: the plaza has to stay open for the spawn,
    // and the ground under the cursor turns red without saying why otherwise.
    const plazaPoint = await run('window.galWorldProbe.screenPoint(0,0)')
    assert.ok(plazaPoint, 'the plaza centre is on screen')
    await hoverAt(plazaPoint)
    await waitFor('document.querySelector("[data-world-hint]")?.dataset.worldHint==="plaza"')
    assert.equal(await run('document.querySelector("[data-world-hint]").textContent'), zh['world.place.plaza'])
    // The launch toast is still up from the step before and covers the corner the
    // refusal chip sits in, so let it expire before the screenshot.
    await waitFor('!document.querySelector("div.fixed.bottom-4.right-4.z-50")?.firstElementChild')
    await capture('world-build-refused')
    const firstTreeSpot = world.getWorldState('world-2').placements[0]
    await click('[data-world-action="undo"]')
    await waitForPlacements('world-2', 0)
    const point = await run('window.galWorldProbe.screenPoint(' + firstTreeSpot.x + ',' + firstTreeSpot.z + ')')
    await pointerAt(point)
    await waitForPlacements('world-2', 1)
    // The spot just filled is refused from then on, and the bar says so.
    await waitFor('document.querySelector("[data-world-hint]")?.dataset.worldHint==="taken"')

    // Leaving and returning to the canvas must restore the build preview.
    await run('document.querySelector("canvas").dispatchEvent(new PointerEvent("pointerleave"))')
    await waitFor('!document.querySelector("[data-world-hint]")')
    await hoverAt(plazaPoint)
    await waitFor('document.querySelector("[data-world-hint]")?.dataset.worldHint==="plaza"')
    await click('[data-world-tool="tree"]')
    const propsWithTree = await run('window.galWorldProbe.stats().props')
    const originalTree = world.getWorldState('world-2').placements[0]
    const treeId = originalTree.addedId
    assert.ok(treeId, 'new props have a selectable identity')
    const selectTree = async () => {
      const point = await run('window.galWorldProbe.propScreenPoint(' + JSON.stringify(treeId) + ')')
      assert.ok(point, 'the placed tree can be projected')
      await pointerAt(point)
      await waitFor('!!document.querySelector("[data-world-action=move-selected]")')
    }
    // Inspecting the bound object while building must not start the game.
    await pointerAt(await run('window.galWorldProbe.launchScreenPoint()'))
    await pause(300)
    assert.equal(launchCount, 1, 'building only inspects the bound object')
    await selectTree()
    await click('[data-world-action="rotate-selected"]')
    await pause(200)
    assert.equal(world.getWorldState('world-2').placements[0].rot, originalTree.rot + Math.PI / 4)
    assert.equal(await run('window.galWorldProbe.stats().props'), propsWithTree, 'rotation does not accumulate live props')
    await click('[data-world-action="move-selected"]')
    let moved = false
    for (const [x, z] of spots) {
      if (Math.hypot(x - originalTree.x, z - originalTree.z) < 2) continue
      const destination = await run('window.galWorldProbe.screenPoint(' + x + ',' + z + ')')
      await hoverAt(destination); await pause(120)
      if (await run('!!document.querySelector("[data-world-hint]")')) continue
      await pointerAt(destination)
      // Navigate immediately after the click, without waiting for the saved reply.
      await click('[data-world-action="back"]'); await worldReady('hub')
      const saved = world.getWorldState('world-2').placements[0]
      assert.equal(saved.addedId, treeId, 'moving retains the identity')
      assert.ok(Math.hypot(saved.x - originalTree.x, saved.z - originalTree.z) > 1, 'the last move saves before leaving')
      assert.equal(saved.x * 4, Math.round(saved.x * 4), 'the stored position matches the snapped preview')
      assert.equal(saved.z * 4, Math.round(saved.z * 4))
      moved = true
      break
    }
    assert.ok(moved, 'a free spot accepts the move')
    await enterWorld('world-2'); await worldReady('scifi')
    await click('[data-world-action="build"]'); await pause(1200)
    await selectTree()
    await click('[data-world-action="delete-selected"]')
    await waitForPlacements('world-2', 0)
    assert.equal(await run('window.galWorldProbe.stats().props'), propsWithTree - 1, 'deletion releases the live prop')
    await click('[data-world-action="undo"]'); await waitForPlacements('world-2', 1)
    assert.equal(await run('window.galWorldProbe.stats().props'), propsWithTree, 'undo restores exactly one prop')

    // Restart recovery: the layout is in the database, not in the page.
    await win.loadFile(path.join(builtRoot, 'renderer/index.html'))
    await waitFor('document.querySelectorAll(".game-card").length === ' + cases.length)
    await run('Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent.includes("三维世界")).click()')
    await worldReady('hub')
    await enterWorld('world-2'); await worldReady('scifi')
    assert.equal(placements('world-2'), 1, 'the layout survives a restart')
    await click('[data-world-action="build"]')
    await capture('world-scifi-build')
    const propsAfterRestart = await run('window.galWorldProbe.stats().props')
    await click('[data-world-tool="tree"]')
    for (const [x, z] of spots) {
      if (placements('world-2') === 2) break
      const candidate = await run('window.galWorldProbe.screenPoint(' + x + ',' + z + ')')
      await hoverAt(candidate); await pause(120)
      if (await run('!!document.querySelector("[data-world-hint]")')) continue
      await pointerAt(candidate); await pause(200)
    }
    await waitForPlacements('world-2', 2)
    const identities = world.getWorldState('world-2').placements.map(item => item.addedId)
    assert.equal(new Set(identities).size, 2, 'new placements cannot reuse an existing identity after restart')
    assert.equal(await run('window.galWorldProbe.stats().props'), propsAfterRestart + 1)
    await click('[data-world-action="undo"]'); await waitForPlacements('world-2', 1)
    await click('[data-world-tool="tree"]')

    // A quality tier chosen in the settings panel has to reach the world that is
    // already running, which means the engine is rebuilt on a fresh context.
    const engineFrames = () => run('window.galWorldProbe.stats().frames')
    const beforeTier = await engineFrames()
    await run('window.api.updateSettings({ worldQuality: "medium" })')
    await run('window.dispatchEvent(new CustomEvent("gal:settings", { detail: { worldQuality: "medium" } }))')
    await pause(900)
    await waitFor('!!window.galWorldProbe')
    assert.ok(await engineFrames() < beforeTier, 'the scene is rebuilt when the quality tier changes')
    await run('window.api.updateSettings({ worldQuality: "high" })')
    await run('window.dispatchEvent(new CustomEvent("gal:settings", { detail: { worldQuality: "high" } }))')
    await pause(900)
    await worldReady('scifi')

    // Bind another feature, and check that the old entrance no longer launches.
    const oldEntrance = await run('window.galWorldProbe.launchScreenPoint()')
    await click('[data-world-action="features"]')
    await click('[data-world-bind="clock_monument"]')
    await waitFor('window.galWorldProbe.stats().launch==="clock_monument"')
    await click('[data-world-action="add-element"]')
    const avatarBeforeTyping = await run('window.galWorldProbe.stats().avatar')
    await run('(()=>{const input=document.querySelector(".world-picker input");input.focus();input.dispatchEvent(new KeyboardEvent("keydown",{key:"w",bubbles:true}));})()')
    await pause(600)
    await run('document.querySelector(".world-picker input").dispatchEvent(new KeyboardEvent("keyup",{key:"w",bubbles:true}))')
    assert.deepEqual(await run('window.galWorldProbe.stats().avatar'), avatarBeforeTyping, 'typing in the model search leaves the avatar still')
    await click('[aria-label="关闭世界特色"]')
    await pointerAt(oldEntrance); await pause(200)
    assert.equal(launchCount, 1, 'the old bound object no longer launches')
    await pointerAt(await run('window.galWorldProbe.launchScreenPoint()'))
    await waitFor('!!document.querySelector(".world-resume")')
    assert.equal(launchCount, 2, 'the newly bound clock launches the same installed game')
    await click('.world-resume')

    // The world follows the interface language, and changing the wording must not
    // rebuild the scene: the frame counter belongs to one engine, so a rebuild
    // would reset it. The Muramasa panel is the richest one — a reason per element
    // plus a curated evidence line — so an untranslated string surfaces there.
    const clickLabel = (selector, text) => run('Array.from(document.querySelectorAll(' + JSON.stringify(selector) + ')).find(b => b.textContent.includes(' + JSON.stringify(text) + '))?.click()')
    const setLanguage = async (from, to) => {
      await clickLabel('.app-sidebar button', (from === 'zh' ? zh : en)['sidebar.settings'])
      // The panel fills its selects from the stored settings, so wait for the
      // value and not merely for the control.
      await waitFor('Array.from(document.querySelectorAll(".modal-panel select")).some(s=>s.value===' + JSON.stringify(from) + ')')
      // Wrapped, because executeJavaScript evaluates at top level: a bare `const`
      // would still be declared on the second call and collide with itself.
      await run('(()=>{const s=Array.from(document.querySelectorAll(".modal-panel select")).find(s=>s.value===' + JSON.stringify(from) + ');s.value=' + JSON.stringify(to) + ';s.dispatchEvent(new Event("change",{bubbles:true}))})()')
      await clickLabel('.modal-panel button', (from === 'zh' ? zh : en)['settings.save'])
      await waitFor('!document.querySelector(".modal-panel")')
    }
    await click('[data-world-action="back"]'); await worldReady('hub')
    await enterWorld('world-9'); await worldReady('mystery')
    await click('[data-world-action="features"]')
    await waitFor('!!document.querySelector(".world-panel")')
    const framesBeforeSwitch = await engineFrames()
    await setLanguage('zh', 'en')
    await waitFor('document.querySelector(".world-panel")?.textContent.includes(' + JSON.stringify(en['world.features']) + ')')
    assert.ok(await engineFrames() > framesBeforeSwitch, 'changing the language does not rebuild the scene')
    assert.ok(await run('document.querySelector(".world-identity .world-eyebrow")?.textContent.includes(' + JSON.stringify(en['world.workWorld']) + ')'))
    assert.ok(await run('document.querySelector(".world-identity small")?.textContent.includes(' + JSON.stringify(PALETTES.mystery.subtitleEn) + ')'))
    assert.ok(await run('document.querySelector(".world-launch-text small")?.textContent.includes(' + JSON.stringify(en['world.sync.ready']) + ')'))
    assert.ok(await run('document.querySelector(".world-launch")?.textContent.includes(' + JSON.stringify(en['world.launch']) + ')'))
    assert.ok(await run('document.querySelector(".world-hint")?.textContent.includes("Move")'))
    const chrome = await run('(()=>{const pick=s=>document.querySelector(s)?.textContent||"";' +
      'return [".world-identity .world-eyebrow",".world-identity small",".world-topbar-actions",".world-hint",' +
      '".world-launch-text small",".world-launch",".world-panel"].map(pick).join(" | ")})()')
    assert.ok(!/[一-鿿]/.test(chrome), 'the world reads in English: ' + chrome)
    await capture('world-muramasa-english')
    await click('[aria-label="' + en['world.closeFeatures'] + '"]')
    await setLanguage('en', 'zh')
    assert.ok(await run('document.querySelector(".world-identity .world-eyebrow")?.textContent.includes(' + JSON.stringify(zh['world.workWorld']) + ')'), 'the world reads in Chinese again')
    await click('[data-world-action="back"]')
    await worldReady('hub')

    assert.ok(lookups.length > 0 && lookups.every(filter => filter[0] === 'id' && /^v\d+$/.test(filter[2])))
    assert.deepEqual(errors, [])
    assert.ok(launchMediaSnapshots.every(snapshot => snapshot.paused && snapshot.src === null && snapshot.frames === 0 && snapshot.hidden), 'music is stopped before every game launch request')
    console.log('PASS world UI: NetEase search/filter/song switching/album player/failure isolation, background playback and launch stop, VNDB album lookup, planet catalogue, terrace walking, 10 scenes, Muramasa entrance, launch binding, build editing and persistence, English wording, no renderer errors')
    console.log('Screenshots: ' + testDir)
  } finally { win.close(); db.closeDatabase(); app.quit() }
}).catch(error => { console.error(error); app.exit(1) })
