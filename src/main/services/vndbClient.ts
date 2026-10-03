import https from 'https'
import { requestRatingJson } from './ratingNetwork'
import path from 'path'
import fs from 'fs'
import { getCacheDir } from '../utils/paths'
import type { VndbSearchResult } from '../../shared/types'

const VNDB_API = 'https://api.vndb.org/kana/vn'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

interface VndbCacheEntry {
  results: VndbSearchResult[]
  timestamp: number
}

function getCache(): Record<string, VndbCacheEntry> {
  const cacheFile = path.join(getCacheDir(), 'vndb_cache.json')
  try {
    if (fs.existsSync(cacheFile)) {
      const raw = fs.readFileSync(cacheFile, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // Corrupt cache, start fresh
  }
  return {}
}

function saveCache(cache: Record<string, VndbCacheEntry>): void {
  const cacheFile = path.join(getCacheDir(), 'vndb_cache.json')
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf-8')
  } catch {
    // Can't write cache, ignore
  }
}

async function rateLimitedRequest(body: string): Promise<string> {
  return JSON.stringify(await requestRatingJson(VNDB_API, JSON.parse(body)))
}

/**
 * Search VNDB for visual novels matching the given title.
 * Results are cached for 7 days.
 */
export async function searchVndb(title: string): Promise<VndbSearchResult[]> {
  // Check cache first
  const cache = getCache()
  // Refresh cached search results created before rating support was added.
  const cacheKey = `v3:${title.toLowerCase().trim()}`
  const cached = cache[cacheKey]
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.results
  }

  try {
    const body = JSON.stringify({
      filters: ['search', '=', title],
      fields: 'title, alttitle, image.url, image.sexual, image.violence, released, developers.name, aliases, description, rating, votecount, tags.name, tags.rating, tags.spoiler',
      results: 10,
      sort: 'searchrank'
    })

    const data = await rateLimitedRequest(body)
    const json = JSON.parse(data)

    const results: VndbSearchResult[] = (json.results || []).map((item: Record<string, unknown>) => ({
      id: item.id as string,
      title: item.title as string,
      originalTitle: item.alttitle as string || null,
      imageUrl: (item.image as Record<string, unknown> | null)?.url as string || null,
      imageNSFW: (item.image as Record<string, unknown> | null)?.sexual === 1,
      releaseDate: item.released as string || null,
      developer: (item.developers as Array<Record<string, string>>)?.[0]?.name || null,
      description: item.description as string || null,
      aliases: (item.aliases as string[]) || [],
      tags: ((item.tags as Array<{ name: string; rating: number; spoiler: number }> | undefined) || [])
        .filter(tag => tag.spoiler === 0 && tag.rating >= 1)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 24)
        .map(tag => tag.name),
      rating: typeof item.rating === 'number' ? item.rating : null,
      voteCount: typeof item.votecount === 'number' ? item.votecount : null
    }))

    // Save to cache
    cache[cacheKey] = { results, timestamp: Date.now() }
    saveCache(cache)

    return results
  } catch (error) {
    // If there's a cached version, return it even if expired
    if (cached) return cached.results
    throw error
  }
}

/**
 * Download a cover image from VNDB's URL.
 * Returns the local file path.
 */
export async function downloadVndbCover(
  gameId: string,
  imageUrl: string,
  coversDir: string
): Promise<string> {
  const ext = path.extname(new URL(imageUrl).pathname) || '.jpg'
  const destPath = path.join(coversDir, `${gameId}${ext}`)

  return new Promise((resolve, reject) => {
    https.get(imageUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadVndbCover(gameId, redirectUrl, coversDir)
            .then(resolve)
            .catch(reject)
          return
        }
      }

      const file = fs.createWriteStream(destPath)
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve(destPath)
      })
      file.on('error', (err) => {
        fs.unlink(destPath, () => { })
        reject(err)
      })
    }).on('error', reject)
  })
}
