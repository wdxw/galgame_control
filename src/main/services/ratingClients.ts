import type { RatingCandidate } from '../../shared/types'
import { cachedRating, requestRatingJson, RatingHttpError } from './ratingNetwork'

export interface VndbRatingDetails {
  id: string
  title: string
  alttitle: string | null
  aliases: string[]
  released: string | null
  rating: number | null
  votecount: number | null
  extlinks: { url: string }[]
}
interface BangumiSubject {
  id: number
  type: number
  name: string
  name_cn: string
  date?: string
  images?: { small?: string }
  rating?: { score: number; total: number }
}

export function getVndbRatingDetails(id: string, force = false) {
  if (!/^v[1-9]\d*$/.test(id)) throw new Error('Invalid VNDB ID')
  return cachedRating<VndbRatingDetails>(`vndb:${id}`, force, async () => {
    const json = await requestRatingJson<{ results: VndbRatingDetails[] }>('https://api.vndb.org/kana/vn', {
      filters: ['id', '=', id], fields: 'title,alttitle,aliases,released,rating,votecount,extlinks.url', results: 1
    })
    const result = json.results?.find(item => item.id === id)
    if (!result) throw new RatingHttpError(404)
    return { ...result, aliases: result.aliases || [], extlinks: result.extlinks || [] }
  })
}

export function getBangumiSubject(id: number, force = false) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid Bangumi ID')
  return cachedRating<BangumiSubject>(`bangumi:${id}`, force, async () => {
    const subject = await requestRatingJson<BangumiSubject>(`https://api.bgm.tv/v0/subjects/${id}`)
    if (subject.id !== id || subject.type !== 4) throw new Error('Not a Bangumi game')
    return subject
  })
}

export async function searchBangumi(names: string[], force = false): Promise<{ candidates: RatingCandidate[]; complete: boolean }> {
  const keywords = [...new Set(names.map(name => name.trim()).filter(Boolean))].slice(0, 4)
  const candidates = new Map<number, RatingCandidate>()
  // One failed alias query must not hide candidates from successful queries.
  const responses = await Promise.allSettled(keywords.map(keyword => cachedRating<RatingCandidate[]>(
    `bangumi-search:${keyword}`, force, async () => {
      const json = await requestRatingJson<{ data: BangumiSubject[] }>('https://api.bgm.tv/v0/search/subjects?limit=10', {
        keyword, sort: 'match', filter: { type: [4] }
      })
      if (!Array.isArray(json.data)) throw new Error('Invalid Bangumi search response')
      return json.data.filter(item => item.type === 4 && Number.isSafeInteger(item.id) && item.id > 0).map(item => ({
        id: item.id, title: item.name_cn || item.name, originalTitle: item.name,
        releaseDate: item.date || null,
        imageUrl: item.images?.small?.startsWith('https://') ? item.images.small : null
      }))
    }
  )))
  if (responses.length && responses.every(result => result.status === 'rejected')) {
    throw (responses[0] as PromiseRejectedResult).reason
  }
  for (const response of responses) {
    if (response.status === 'fulfilled') for (const candidate of response.value.data) candidates.set(candidate.id, candidate)
  }
  return { candidates: [...candidates.values()], complete: responses.every(response => response.status === 'fulfilled' && !response.value.stale) }
}
