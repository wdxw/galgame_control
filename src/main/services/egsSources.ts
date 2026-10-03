import type { EgsSite } from '../../shared/types'

const sites: Record<EgsSite, { host: string; path: string }> = {
  koko: { host: 'koko.kyara.top', path: '/game.php' },
  official: { host: 'erogamescape.org', path: '/~ap2/ero/toukei_kaiseki/game.php' },
  legacy: { host: 'erogamescape.dyndns.org', path: '/~ap2/ero/toukei_kaiseki/game.php' }
}

function normalizeId(value: string): string {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw new Error('Invalid ErogameScape game ID')
  }
  return String(Number(value))
}

export function egsSourceUrl(id: string, site: EgsSite): string {
  if (!Object.prototype.hasOwnProperty.call(sites, site)) throw new Error('Invalid ErogameScape site')
  const source = sites[site]
  return `https://${source.host}${source.path}?game=${normalizeId(id)}`
}

export function parseEgsEntry(entry: string): { externalId: string; site: EgsSite } {
  if (typeof entry !== 'string' || !entry.trim() || entry.length > 2048) throw new Error('Invalid ErogameScape entry')
  const value = entry.trim()
  if (/^\d+$/.test(value)) return { externalId: normalizeId(value), site: 'koko' }
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Invalid ErogameScape URL')
  const site = (Object.keys(sites) as EgsSite[]).find(key => sites[key].host === url.hostname && sites[key].path === url.pathname)
  if (!site || url.searchParams.getAll('game').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'game')) {
    throw new Error('Invalid ErogameScape game URL')
  }
  return { externalId: normalizeId(url.searchParams.get('game')!), site }
}
