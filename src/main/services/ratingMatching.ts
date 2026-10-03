import type { RatingCandidate, RatingProvider, EgsSite } from '../../shared/types'

import { egsSourceUrl } from './egsSources'

// NFKC handles full-width text; keep punctuation and version/sequence markers.
export const normalizeTitle = (title: string) => title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

export function uniqueExactMatch(names: string[], releaseDate: string | null, candidates: RatingCandidate[]): RatingCandidate | null {
  const titles = new Set(names.map(normalizeTitle).filter(Boolean))
  const matches = candidates.filter(candidate =>
    [candidate.title, candidate.originalTitle].some(title => titles.has(normalizeTitle(title)))
  )
  if (matches.length !== 1) return null
  const match = matches[0]
  const validDate = (value: string | null) => value?.match(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/)?.[0]
  const left = validDate(releaseDate)
  const right = validDate(match.releaseDate)
  if (left && right && left.slice(0, Math.min(left.length, right.length)) !== right.slice(0, Math.min(left.length, right.length))) return null
  return match
}

export function ratingSourceUrl(provider: RatingProvider, id: string, site?: EgsSite): string {
  if (provider === 'erogamescape' && site) return egsSourceUrl(id, site)
  if (provider === 'vndb' && /^v[1-9]\d*$/.test(id)) return `https://vndb.org/${id}`
  if (provider === 'bangumi' && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))) return `https://bgm.tv/subject/${id}`
  throw new Error('Invalid rating source')
}

export function linkedBangumiId(links: { url: string }[]): number | null {
  const ids = new Set<number>()
  for (const link of links) {
    try {
      const url = new URL(link.url)
      const id = url.pathname.match(/^\/subject\/([1-9]\d*)\/?$/)?.[1]
      if (url.protocol === 'https:' && ['bgm.tv', 'bangumi.tv', 'chii.in'].includes(url.hostname) && id && Number.isSafeInteger(Number(id))) ids.add(Number(id))
    } catch { /* Ignore unsupported links. */ }
  }
  return ids.size === 1 ? [...ids][0] : null
}
