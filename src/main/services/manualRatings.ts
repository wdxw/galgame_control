import type { GameRating, ManualEgsRatingInput } from '../../shared/types'
import { getManualEgsRating, saveManualEgsRating, clearManualEgsRating } from './library.db'
import { parseEgsEntry, egsSourceUrl } from './egsSources'

// This provider only reads local data and never uses any network service.
export function getManualRating(gameId: string): GameRating {
  const record = getManualEgsRating(gameId)
  return {
    provider: 'erogamescape', source: 'manual', egsSite: record?.site ?? null,
    externalId: record?.externalId ?? null,
    sourceUrl: record ? egsSourceUrl(record.externalId, record.site) : undefined,
    status: !record ? 'unmatched' : record.score === null ? 'unrated' : 'ready',
    score: record?.score ?? null, maxScore: 100, voteCount: record?.voteCount ?? null,
    updatedAt: record?.updatedAt ?? null, stale: false, candidates: []
  }
}

export function saveManualRating(gameId: string, expectedVndbId: string | null, input: ManualEgsRatingInput): GameRating {
  if (!input || typeof input !== 'object') throw new Error('Invalid manual rating')
  const entry = parseEgsEntry(input.entry)
  const score = input.score ?? null
  const voteCount = input.voteCount ?? null
  if (score !== null && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100)) {
    throw new Error('Invalid manual score')
  }
  if (voteCount !== null && (typeof voteCount !== 'number' || !Number.isSafeInteger(voteCount) || voteCount < 0)) {
    throw new Error('Invalid manual vote count')
  }
  saveManualEgsRating(gameId, expectedVndbId, { ...entry, score, voteCount, updatedAt: Date.now() })
  return getManualRating(gameId)
}

export function clearManualRating(gameId: string, expectedVndbId: string | null): GameRating {
  clearManualEgsRating(gameId, expectedVndbId)
  return getManualRating(gameId)
}
