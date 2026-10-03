import fs from 'fs'
import path from 'path'
import type { Game, WorldMusicAlbum, WorldMusicInfo, WorldMusicTrack } from '../../shared/types'
import { cachedRating, requestRatingJson } from './ratingNetwork'
import { getGameById, getSetting } from './library.db'

const VNDB_API = 'https://api.vndb.org/kana/vn'
const VGMDB_API = 'https://vgmdb.info'
const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.webm'])
const MAX_LOCAL_TRACKS = 120
const MAX_REMOTE_ALBUMS = 16

interface ExternalLink {
  id?: string | number
  name?: string
  label?: string
  url?: string
}

interface VnMusicRecord {
  id: string
  title?: string
  alttitle?: string | null
  extlinks?: ExternalLink[]
  relations?: Array<{
    id?: string
    title?: string
    alttitle?: string | null
    extlinks?: ExternalLink[]
  }>
}

interface ProductSummary {
  id?: string | number
  link?: string
  titles?: Record<string, string> | string
  names?: Record<string, string> | string
  title?: string
  catalog?: string
  date?: string
  releaseDate?: string
  type?: string
  classifications?: string[]
  covers?: Array<{ full?: string; medium?: string; thumb?: string; url?: string }>
}

interface ProductResponse {
  albums?: ProductSummary[]
  products?: ProductSummary[]
  names?: Record<string, string> | string
  title?: string
}

interface AlbumResponse {
  id?: string | number
  title?: string
  name?: string
  names?: Record<string, string> | string
  titles?: Record<string, string> | string
  artist?: string
  artists?: Array<{ name?: string } | string>
  releaseDate?: string
  date?: string
  covers?: Array<{ full?: string; medium?: string; thumb?: string; url?: string }>
  discs?: Array<{
    name?: string
    tracks?: Array<{
      number?: string | number
      title?: string
      name?: string
      names?: Record<string, string> | string
      length?: string
      track_length?: string
    }>
  }>
  tracks?: Array<{
    number?: string | number
    title?: string
    name?: string
    names?: Record<string, string> | string
    length?: string
    track_length?: string
  }>
}

interface MusicRemoteSnapshot {
  albums: WorldMusicAlbum[]
  message: string | null
}

interface LocalAudioFile {
  path: string
  title: string
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function nameFrom(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const names = value as Record<string, unknown>
  return firstString(names.English, names.en, names.EnglishRomanized, names['ja-latn'], names.Japanese, names.ja, ...Object.values(names))
}

function idFrom(item: ProductSummary): string | null {
  const direct = item.id === undefined || item.id === null ? '' : String(item.id)
  if (/^\d+$/.test(direct)) return direct
  const match = String(item.link || '').match(/(?:album|product)\/(\d+)/i)
  return match?.[1] || null
}

function albumTitle(item: ProductSummary | AlbumResponse): { title: string; originalTitle: string | null } {
  const names = nameFrom(item.names) || nameFrom(item.titles)
  const title = firstString(names, item.title, 'name' in item ? item.name : null) || '未命名音乐专辑'
  const original = nameFrom(item.names) || nameFrom(item.titles)
  return { title, originalTitle: original && original !== title ? original : null }
}

function coverFrom(item: ProductSummary | AlbumResponse): string | null {
  const cover = asArray<{ full?: string; medium?: string; thumb?: string; url?: string }>(item.covers)[0]
  const url = firstString(cover?.medium, cover?.full, cover?.url, cover?.thumb)
  return url && /^https?:\/\//.test(url) ? url : null
}

function normalizeTitle(value: string): string {
  return value
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^\s*(?:\d{1,3}|[a-z]\d{1,3})\s*[-_.、:：]\s*/i, '')
    .replace(/[\[\](){}「」『』【】<>《》]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLocaleLowerCase()
}

function localMatch(title: string, files: LocalAudioFile[]): string | null {
  const wanted = normalizeTitle(title)
  if (!wanted) return null
  const exact = files.find(file => normalizeTitle(file.title) === wanted)
  if (exact) return exact.path
  const contains = files.find(file => {
    const candidate = normalizeTitle(file.title)
    return candidate.length >= 4 && (candidate.includes(wanted) || wanted.includes(candidate))
  })
  return contains?.path || null
}

function scanLocalAudio(gameDir: string): LocalAudioFile[] {
  if (!gameDir || !fs.existsSync(gameDir)) return []
  const result: LocalAudioFile[] = []
  const visited = new Set<string>()
  const walk = (directory: string, depth: number): void => {
    if (depth > 4 || result.length >= MAX_LOCAL_TRACKS) return
    let realDirectory: string
    try { realDirectory = fs.realpathSync(directory) } catch { return }
    if (visited.has(realDirectory)) return
    visited.add(realDirectory)
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(realDirectory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (result.length >= MAX_LOCAL_TRACKS) break
      if (entry.name.startsWith('.') || entry.name.toLowerCase() === 'save') continue
      const full = path.join(realDirectory, entry.name)
      if (entry.isDirectory()) { walk(full, depth + 1); continue }
      if (!entry.isFile() || !AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
      try {
        const stat = fs.statSync(full)
        if (stat.size < 1024 || stat.size > 512 * 1024 * 1024) continue
      } catch { continue }
      result.push({ path: full, title: path.basename(entry.name) })
    }
  }
  walk(gameDir, 0)
  return result.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }))
}

function localTracks(files: LocalAudioFile[]): WorldMusicTrack[] {
  return files.map((file, index) => ({
    id: `local:${index}:${file.path}`,
    disc: '本地音乐', number: String(index + 1), title: path.basename(file.title, path.extname(file.title)),
    originalTitle: null, duration: null, localPath: file.path
  }))
}

function vgmdbProductLinks(record: VnMusicRecord): Array<{ id: string; sourceUrl: string }> {
  const records = [record, ...asArray<VnMusicRecord>(record.relations)]
  const links: Array<{ id: string; sourceUrl: string }> = []
  const seen = new Set<string>()
  for (const source of records) {
    for (const link of asArray<ExternalLink>(source.extlinks)) {
      const looksLikeVgmdb = link.name?.toLowerCase().includes('vgmdb') || link.label?.toLowerCase().includes('vgmdb') || link.url?.toLowerCase().includes('vgmdb')
      if (!looksLikeVgmdb) continue
      const match = String(link.id || link.url || '').match(/(?:product\/)?(\d+)\/?$/i)
      const id = match?.[1]
      if (!id || seen.has(id)) continue
      seen.add(id)
      links.push({ id, sourceUrl: `https://vgmdb.net/product/${id}` })
    }
  }
  return links.slice(0, 4)
}

function summaryToAlbum(summary: ProductSummary, productId: string): WorldMusicAlbum | null {
  const id = idFrom(summary)
  if (!id) return null
  const names = albumTitle(summary)
  return {
    id: `vgmdb:${id}`,
    title: names.title,
    originalTitle: names.originalTitle,
    artist: null,
    releaseDate: firstString(summary.date, summary.releaseDate),
    coverUrl: coverFrom(summary),
    sourceUrl: `https://vgmdb.net/album/${id}`,
    detailUrl: `${VGMDB_API}/album/${id}?format=json`,
    tracks: [], tracksLoaded: false
  }
}

function productFallback(productId: string): WorldMusicAlbum {
  return {
    id: `vgmdb-product:${productId}`,
    title: 'VNDB 关联音乐专辑', originalTitle: null, artist: null, releaseDate: null,
    coverUrl: null, sourceUrl: `https://vgmdb.net/product/${productId}`, detailUrl: null,
    tracks: [], tracksLoaded: true
  }
}

async function fetchRemote(vndbId: string): Promise<MusicRemoteSnapshot> {
  const response = await requestRatingJson<{ results?: VnMusicRecord[] }>(VNDB_API, {
    filters: ['id', '=', vndbId],
    fields: 'title,alttitle,extlinks{url,label,name,id},relations{id,title,alttitle,extlinks{url,label,name,id}}',
    results: 1
  })
  const record = response.results?.find(item => item.id === vndbId)
  if (!record) return { albums: [], message: 'VNDB 暂时没有返回音乐关联' }
  const productLinks = vgmdbProductLinks(record)
  if (!productLinks.length) return { albums: [], message: 'VNDB 没有记录关联音乐专辑' }

  const albums: WorldMusicAlbum[] = []
  let productFailed = false
  for (const product of productLinks) {
    try {
      const data = await requestRatingJson<ProductResponse>(`${VGMDB_API}/product/${product.id}?format=json`)
      const summaries = [...asArray<ProductSummary>(data.albums), ...asArray<ProductSummary>(data.products)]
      for (const summary of summaries) {
        const album = summaryToAlbum(summary, product.id)
        if (album) albums.push(album)
        if (albums.length >= MAX_REMOTE_ALBUMS) break
      }
      if (!summaries.length && !albums.some(album => album.id === `vgmdb-product:${product.id}`)) albums.push(productFallback(product.id))
    } catch {
      productFailed = true
      albums.push(productFallback(product.id))
    }
    if (albums.length >= MAX_REMOTE_ALBUMS) break
  }
  const unique = [...new Map(albums.map(album => [album.id, album])).values()].slice(0, MAX_REMOTE_ALBUMS)
  return {
    albums: unique,
    message: productFailed ? '专辑目录已找到，部分曲目暂时无法读取' : null
  }
}

function attachLocalTracks(album: WorldMusicAlbum, files: LocalAudioFile[]): WorldMusicAlbum {
  return {
    ...album,
    tracks: album.tracks.map(track => ({ ...track, localPath: track.localPath || localMatch(track.title, files) }))
  }
}

function trackTitle(item: { title?: string; name?: string; names?: Record<string, string> | string }): { title: string; originalTitle: string | null } {
  const names = nameFrom(item.names)
  const title = firstString(names, item.title, item.name) || '未命名曲目'
  return { title, originalTitle: names && names !== title ? names : null }
}

function parseAlbumTracks(album: WorldMusicAlbum, data: AlbumResponse, files: LocalAudioFile[]): WorldMusicAlbum {
  const tracks: WorldMusicTrack[] = []
  type AlbumDisc = NonNullable<AlbumResponse['discs']>[number]
  type AlbumTrack = NonNullable<AlbumDisc['tracks']>[number]
  const discs = asArray<AlbumDisc>(data.discs)
  if (discs.length) {
    for (const [discIndex, disc] of discs.entries()) {
      for (const [trackIndex, item] of asArray<AlbumTrack>(disc?.tracks).entries()) {
        const names = trackTitle(item)
        tracks.push({
          id: `${album.id}:${discIndex}:${trackIndex}`, disc: disc?.name || `Disc ${discIndex + 1}`,
          number: String(item.number ?? trackIndex + 1), title: names.title, originalTitle: names.originalTitle,
          duration: firstString(item.length, item.track_length), localPath: localMatch(names.title, files)
        })
      }
    }
  } else {
    for (const [trackIndex, item] of asArray<AlbumTrack>(data.tracks).entries()) {
      const names = trackTitle(item)
      tracks.push({
        id: `${album.id}:0:${trackIndex}`, disc: 'Disc 1', number: String(item.number ?? trackIndex + 1),
        title: names.title, originalTitle: names.originalTitle, duration: firstString(item.length, item.track_length), localPath: localMatch(names.title, files)
      })
    }
  }
  const names = albumTitle(data)
  return attachLocalTracks({
    ...album,
    title: names.title !== '未命名音乐专辑' ? names.title : album.title,
    originalTitle: names.originalTitle || album.originalTitle,
    artist: firstString(data.artist, asArray<{ name?: string } | string>(data.artists).map(item => typeof item === 'string' ? item : item.name).find(Boolean)),
    releaseDate: firstString(data.date, data.releaseDate, album.releaseDate),
    coverUrl: coverFrom(data) || album.coverUrl,
    tracks, tracksLoaded: true
  }, files)
}

export async function getWorldMusic(gameId: string, force = false): Promise<WorldMusicInfo> {
  const game = getGameById(gameId)
  if (!game?.vndbId || !/^v\d+$/.test(game.vndbId)) throw new Error('游戏尚未关联 VNDB')
  const files = scanLocalAudio(game.gameDir)
  const local = localTracks(files)
  if (getSetting('vndbEnabled') === 'false') {
    return { gameId, vndbId: game.vndbId, status: local.length ? 'local' : 'disabled', albums: [], localTracks: local, message: 'VNDB 联网查询已关闭', updatedAt: null }
  }
  try {
    const remote = await cachedRating<MusicRemoteSnapshot>('world-music-v2:' + game.vndbId, force, () => fetchRemote(game.vndbId!))
    const status = remote.data.albums.length ? (remote.stale ? 'cached' : 'ready') : (local.length ? 'local' : 'unavailable')
    return { gameId, vndbId: game.vndbId, status, albums: remote.data.albums.map(album => attachLocalTracks(album, files)), localTracks: local, message: remote.data.message, updatedAt: remote.updatedAt }
  } catch {
    return { gameId, vndbId: game.vndbId, status: local.length ? 'local' : 'unavailable', albums: [], localTracks: local, message: '音乐资料暂时不可用，可在游戏目录中放入音频后播放', updatedAt: null }
  }
}

export async function getWorldMusicAlbum(gameId: string, albumId: string, force = false): Promise<WorldMusicAlbum> {
  const game = getGameById(gameId)
  if (!game?.vndbId || !/^v\d+$/.test(game.vndbId)) throw new Error('游戏尚未关联 VNDB')
  const numericId = String(albumId).replace(/^vgmdb:/, '')
  if (!/^\d+$/.test(numericId)) throw new Error('无效的音乐专辑')
  const files = scanLocalAudio(game.gameDir)
  const base: WorldMusicAlbum = {
    id: `vgmdb:${numericId}`, title: '音乐专辑', originalTitle: null, artist: null, releaseDate: null,
    coverUrl: null, sourceUrl: `https://vgmdb.net/album/${numericId}`, detailUrl: `${VGMDB_API}/album/${numericId}?format=json`, tracks: [], tracksLoaded: false
  }
  try {
    const cached = await cachedRating<AlbumResponse>('world-music-album-v2:' + numericId, force, () => requestRatingJson<AlbumResponse>(`${VGMDB_API}/album/${numericId}?format=json`))
    return parseAlbumTracks(base, cached.data, files)
  } catch {
    return { ...base, tracksLoaded: true, tracks: [], }
  }
}
