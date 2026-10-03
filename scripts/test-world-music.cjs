const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const Module = require('module')
require.extensions['.ts'] = (module, filename) => module._compile(require('esbuild').transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename)
const game = { id: 'game', title: '装甲恶鬼村正', originalTitle: '装甲悪鬼村正', vndbId: null }
let mode = 'ready', stale = false
const queries = [], keys = []
const album = { id: 494126, name: '邪悪宣言 装甲悪鬼村正 オリジナルサウンドトラック', picUrl: 'http://p1.music.126.net/cover.jpg', artist: { name: 'ZIZZ STUDIO' }, publishTime: 1259251200000 }
const song = { id: 4942751, name: '落葉', dt: 283946, al: album, ar: [{ name: 'いとうかなこ' }] }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith('neteaseMusic.ts') && request === './library.db') return { getGameById: id => id === 'game' ? game : null }
  if (parent?.filename.endsWith('neteaseMusic.ts') && request === './ratingNetwork') return {
    cachedRating: async (key, force, fetcher) => { keys.push({ key, force }); return { data: await fetcher(), stale, updatedAt: 1000 } },
    requestRatingJson: async (url, body) => {
      assert.equal(url, 'https://music.163.com/api/cloudsearch/pc')
      assert.ok(body instanceof URLSearchParams)
      const query = body.get('s'), type = body.get('type')
      queries.push({ query, type })
      if (mode === 'offline' || (mode === 'partial' && type === '10')) throw new Error('offline')
      if (mode === 'denied') return { code: -462 }
      if (mode === 'empty' || (mode === 'fallback' && query === game.originalTitle)) return { code: 200, result: {} }
      if (type === '10') return { code: 200, result: { albums: [album, album, { id: 'javascript:bad', name: 'bad' }] } }
      return { code: 200, result: { songs: [song, song, { ...song, id: '1&auto=1' }] } }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}
async function main() {
  const { searchNeteaseMusic } = require('../src/main/services/neteaseMusic.ts')
  const result = await searchNeteaseMusic('game')
  assert.equal(result.status, 'ready', 'a VNDB ID is not required')
  assert.deepEqual(queries.map(item => item.query), [game.originalTitle, game.originalTitle])
  assert.equal(result.albums.length, 1, 'albums deduplicate and invalid IDs are discarded')
  assert.equal(result.albums[0].tracks.length, 1, 'songs deduplicate and cannot inject URL parameters')
  assert.equal(result.albums[0].coverUrl, 'https://p1.music.126.net/cover.jpg')
  assert.equal(result.albums[0].tracksPartial, true, 'search hits are not presented as a complete album')
  assert.equal(result.albums[0].tracks[0].duration, '4:43')
  assert.equal(result.albums[0].tracks[0].neteaseId, '4942751')
  assert.equal(result.albums[0].tracks[0].localPath, null, 'online playback needs no local audio')
  assert.equal(result.albums[0].tracks[0].sourceUrl, 'https://music.163.com/#/song?id=4942751')
  const autoKey = keys.at(-1).key
  await searchNeteaseMusic('game', 'MURAMASA', true)
  assert.notEqual(keys.at(-1).key, autoKey, 'manual search does not reuse another title cache')
  assert.equal(keys.at(-1).force, true)
  mode = 'fallback'; queries.length = 0
  assert.equal((await searchNeteaseMusic('game')).query, game.title)
  assert.equal(queries.length, 4, 'tries the translated title when the original yields no results')
  mode = 'partial'
  assert.equal((await searchNeteaseMusic('game')).partial, true)
  mode = 'ready'; stale = true
  assert.equal((await searchNeteaseMusic('game')).status, 'cached')
  stale = false; mode = 'empty'
  assert.equal((await searchNeteaseMusic('game')).status, 'empty')
  for (mode of ['offline', 'denied']) {
    const result = await searchNeteaseMusic('game')
    assert.equal(result.status, 'error')
    assert.equal(result.albums.length, 0)
    assert.ok(result.searchUrl.startsWith('https://music.163.com/'))
  }
  const count = queries.length
  for (const query of ['', '   ', 'x'.repeat(161), {}, null]) await assert.rejects(searchNeteaseMusic('game', query))
  await assert.rejects(searchNeteaseMusic('unknown'))
  assert.equal(queries.length, count, 'invalid IPC inputs cause no requests')
  console.log('PASS music: independent NetEase lookup, title fallback, album/song parsing, source URLs, deduplication, input validation, cache keys, partial results and offline states')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { Module._load = originalLoad })
