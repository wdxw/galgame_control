import type { Game, GameRating, RatingProvider, OnlineRatingProvider } from '../../shared/types'
import { getAllSettings, getGameById, linkBangumi } from './library.db'
import { getBangumiSubject, getVndbRatingDetails, searchBangumi } from './ratingClients'
import { linkedBangumiId, uniqueExactMatch } from './ratingMatching'
import { RatingHttpError } from './ratingNetwork'

import { getManualRating } from './manualRatings'

const pending = new Map<string, Promise<GameRating>>()
export const ratingsEnabled = () => getAllSettings().vndbEnabled !== 'false'

export function getGameRating(gameId: string, provider: RatingProvider, force = false): Promise<GameRating> {
  const game = getGameById(gameId)
  if (!game || !['vndb', 'bangumi', 'erogamescape'].includes(provider)) return Promise.reject(new Error('Invalid rating request'))
  if (provider === 'erogamescape') return Promise.resolve(getManualRating(gameId))
  const key = JSON.stringify([gameId, provider, game.vndbId, game.bangumiId, game.title, game.originalTitle, force])
  const existing = pending.get(key)
  if (existing) return existing
  const work = loadRating(game, provider, force).finally(() => pending.delete(key))
  pending.set(key, work)
  return work
}

async function loadRating(game: Game, provider: OnlineRatingProvider, force: boolean): Promise<GameRating> {
  const result: GameRating = {
    provider, source: 'online', egsSite: null, externalId: provider === 'vndb' ? game.vndbId : game.bangumiId ? String(game.bangumiId) : null,
    status: 'unmatched', score: null, maxScore: 10, voteCount: null, updatedAt: null, stale: false, candidates: []
  }
  if (!ratingsEnabled()) return { ...result, status: 'disabled' }
  try {
    if (provider === 'vndb') {
      if (!game.vndbId) return result
      const response = await getVndbRatingDetails(game.vndbId, force)
      result.score = validScore(response.data.rating, 100) ? response.data.rating! / 10 : null
      result.voteCount = validCount(response.data.votecount)
      result.updatedAt = response.updatedAt
      result.stale = response.stale
    } else {
      let id = game.bangumiId
      let linked = Boolean(id)
      if (!id) {
        if (!game.vndbId) return result
        const vndb = await getVndbRatingDetails(game.vndbId, force)
        if (!ratingsEnabled()) return { ...result, status: 'disabled' }
        id = linkedBangumiId(vndb.data.extlinks)
        if (id) {
          // Preserve explicit cross-site links even when a restricted entry cannot be fetched.
          linked = linkBangumi(game.id, game.vndbId, id, true)
        } else {
          const names = [vndb.data.alttitle, vndb.data.title, ...vndb.data.aliases].filter((name): name is string => Boolean(name))
          const search = await searchBangumi(names, force)
          result.candidates = search.candidates
          const matched = search.complete ? uniqueExactMatch(names, vndb.data.released, result.candidates) : null
          if (!matched) return { ...result, status: result.candidates.length ? 'needs-match' : 'unmatched' }
          id = matched.id
        }
      }
      if (linked) result.externalId = String(id)
      const response = await getBangumiSubject(id, force)
      // Name-derived candidates are only saved after verifying the detail endpoint's game type.
      if (!linked) {
        if (!ratingsEnabled()) return { ...result, status: 'disabled' }
        linkBangumi(game.id, game.vndbId, id, true)
      }
      result.externalId = String(id)
      result.score = validScore(response.data.rating?.score, 10) ? response.data.rating!.score : null
      result.voteCount = validCount(response.data.rating?.total)
      result.updatedAt = response.updatedAt
      result.stale = response.stale
      result.candidates = []
    }
    if (result.voteCount === 0) result.score = null
    result.status = result.score === null ? 'unrated' : 'ready'
    return result
  } catch (error) {
    result.status = error instanceof RatingHttpError && [401, 403].includes(error.status)
      ? 'restricted'
      : error instanceof RatingHttpError && error.status === 404 ? 'unmatched' : 'error'
    return result
  }
}

function validScore(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
}
function validCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export async function searchRatingCandidates(gameId: string, query: string) {
  if (!ratingsEnabled() || !getGameById(gameId)) throw new Error('Rating lookup unavailable')
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw new Error('Invalid search')
  return (await searchBangumi([query], true)).candidates
}

export async function selectRatingCandidate(gameId: string, expectedVndbId: string | null, subjectId: number) {
  if (!ratingsEnabled()) throw new Error('Rating lookup disabled')
  const game = getGameById(gameId)
  if (!game || game.vndbId !== expectedVndbId) throw new Error('Game identity changed')
  await getBangumiSubject(subjectId)
  if (!ratingsEnabled() || !linkBangumi(gameId, expectedVndbId, subjectId, false)) throw new Error('Game identity changed')
}
