import { createHash } from 'crypto'
import type { NeteaseMusicInfo, WorldMusicAlbum, WorldMusicTrack } from '../../shared/types'
import { getGameById } from './library.db'
import { cachedRating, requestRatingJson } from './ratingNetwork'

const SEARCH_API = 'https://music.163.com/api/cloudsearch/pc'
const MAX_ALBUMS = 12
const MAX_SONGS = 30

interface Artist { name?: string }
interface Album {
  id?: number | string
  name?: string
  picUrl?: string
  publishTime?: number
  artist?: Artist
  artists?: Artist[]
}
interface Song {
  id?: number | string
  name?: string
  dt?: number
  duration?: number
  ar?: Artist[]
  artists?: Artist[]
  al?: Album
  album?: Album
  no?: number
}
interface SearchResponse {
  code?: number
  result?: { albums?: Album[]; songs?: Song[] }
}
interface SearchSnapshot { albums: WorldMusicAlbum[]; partial: boolean }

function idOf(value: unknown): string | null {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null
  const id = String(value ?? '')
  return /^[1-9]\d{0,17}$/.test(id) ? id : null
}

function titleOf(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 300) : ''
}

function artistsOf(artists: Artist[] | undefined): string {
  return Array.isArray(artists) ? [...new Set(artists.map(artist => titleOf(artist?.name)).filter(Boolean))].join(' / ') : ''
}

function coverOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.endsWith('.music.126.net')) return null
    url.protocol = 'https:'
    return url.toString()
  } catch { return null }
}

function albumOf(item: Album): WorldMusicAlbum | null {
  const id = idOf(item?.id)
  const title = titleOf(item?.name)
  if (!id || !title) return null
  const date = Number.isFinite(item.publishTime) && item.publishTime! > 0 ? new Date(item.publishTime!) : null
  return {
    id: `netease:${id}`, neteaseId: id, title, originalTitle: null,
    artist: artistsOf(item.artists) || titleOf(item.artist?.name) || null,
    releaseDate: date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null,
    coverUrl: coverOf(item.picUrl), sourceUrl: `https://music.163.com/#/album?id=${id}`, detailUrl: null,
    // Search gives only the matching songs. The official album player offers
    // the full list and handles login, previews and regional availability.
    tracks: [], tracksLoaded: true, tracksPartial: true
  }
}

function trackOf(item: Song, index: number): WorldMusicTrack | null {
  const id = idOf(item?.id)
  const title = titleOf(item?.name)
  if (!id || !title) return null
  const ms = item.dt ?? item.duration
  const seconds = typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / 1000) : null
  return {
    id: `netease-song:${id}`, neteaseId: id, title, originalTitle: null,
    disc: '', number: String(item.no && item.no > 0 ? item.no : index + 1),
    duration: seconds === null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    artist: artistsOf(item.ar || item.artists), localPath: null,
    sourceUrl: `https://music.163.com/#/song?id=${id}`
  }
}

async function search(query: string, type: '10' | '1'): Promise<SearchResponse> {
  const data = await requestRatingJson<SearchResponse>(SEARCH_API, new URLSearchParams({
    s: query, type, limit: String(type === '10' ? MAX_ALBUMS : MAX_SONGS), offset: '0'
  }))
  if (data.code !== 200 || (data.result != null && typeof data.result !== 'object')) {
    throw new Error('NetEase search is unavailable')
  }
  return data
}

async function fetchSearch(query: string): Promise<SearchSnapshot> {
  const [albums, songs] = await Promise.allSettled([search(query, '10'), search(query, '1')])
  if (albums.status === 'rejected' && songs.status === 'rejected') throw new Error('NetEase search is unavailable')
  const byId = new Map<string, WorldMusicAlbum>()
  const foundAlbums = albums.status === 'fulfilled' ? albums.value.result?.albums : []
  for (const item of (Array.isArray(foundAlbums) ? foundAlbums : []).slice(0, MAX_ALBUMS)) {
    const album = albumOf(item)
    if (album) byId.set(album.id, album)
  }
  const seen = new Set<string>()
  const foundSongs = songs.status === 'fulfilled' ? songs.value.result?.songs : []
  for (const [index, item] of (Array.isArray(foundSongs) ? foundSongs : []).slice(0, MAX_SONGS).entries()) {
    const track = trackOf(item, index)
    const summary = albumOf(item.al || item.album || {})
    if (!track || !summary || seen.has(track.id)) continue
    seen.add(track.id)
    const album = byId.get(summary.id) || summary
    album.tracks.push(track)
    if (!album.artist) album.artist = track.artist || null
    byId.set(album.id, album)
  }
  return { albums: [...byId.values()].slice(0, MAX_ALBUMS + 6), partial: albums.status === 'rejected' || songs.status === 'rejected' }
}

export async function searchNeteaseMusic(gameId: string, query?: string, force = false): Promise<NeteaseMusicInfo> {
  const game = getGameById(gameId)
  if (!game) throw new Error('游戏不存在')
  if (query !== undefined && (typeof query !== 'string' || !query.trim() || query.length > 160)) throw new Error('无效的音乐搜索词')
  const names = [...new Set((query ? [query] : [game.originalTitle, game.title]).map(name => name?.trim().slice(0, 160)).filter((name): name is string => Boolean(name)))].slice(0, 2)
  if (!names.length) throw new Error('游戏缺少名称')
  const base = { gameId, query: names[0], searchUrl: `https://music.163.com/#/search/m/?s=${encodeURIComponent(names[0])}&type=10` }
  try {
    // A title-based cache keeps a new VNDB binding or renamed game from reusing
    // a previous game's search. VNDB network settings don't disable NetEase.
    let result: Awaited<ReturnType<typeof cachedRating<SearchSnapshot>>> | undefined
    let usedQuery = names[0]
    for (const name of names) {
      usedQuery = name
      const key = createHash('sha256').update(name.normalize('NFKC').toLowerCase()).digest('hex')
      result = await cachedRating<SearchSnapshot>(`world-netease-v1:${key}`, force, async () => {
        const snapshot = await fetchSearch(name)
        if (snapshot.partial && !snapshot.albums.length) throw new Error('NetEase search is incomplete')
        return snapshot
      })
      if (result.data.albums.length) break
    }
    return {
      ...base, query: usedQuery, searchUrl: `https://music.163.com/#/search/m/?s=${encodeURIComponent(usedQuery)}&type=10`,
      status: result!.stale ? 'cached' : result!.data.albums.length ? 'ready' : 'empty',
      partial: result!.data.partial, albums: result!.data.albums, updatedAt: result!.updatedAt
    }
  } catch {
    return { ...base, status: 'error', partial: false, albums: [], updatedAt: null }
  }
}
