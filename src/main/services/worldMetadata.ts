import { cachedRating, requestRatingJson } from './ratingNetwork'
import { getGameById, getSetting, updateGame } from './library.db'
import type { WorldMetadata } from '../../shared/types'

interface VnWorld {
  id: string
  description: string | null
  image: { url: string } | null
  tags: { name: string; rating: number; spoiler: number; category: string }[]
}

export async function getWorldMetadata(gameId: string, force = false): Promise<WorldMetadata> {
  const game = getGameById(gameId)
  if (!game?.vndbId || !/^v\d+$/.test(game.vndbId)) throw new Error('游戏尚未关联 VNDB')
  if (getSetting('vndbEnabled') === 'false') return { game, imageUrl: null, status: 'disabled' }
  const id = game.vndbId
  const snapshot = await cachedRating<VnWorld>('world-v1:' + id, force, async () => {
    const response = await requestRatingJson<{ results: VnWorld[] }>('https://api.vndb.org/kana/vn', {
      filters: ['id', '=', id],
      fields: 'description,image.url,tags.name,tags.rating,tags.spoiler,tags.category',
      results: 1
    })
    const result = response.results?.find(item => item.id === id)
    if (!result) throw new Error('VNDB 暂时没有返回这部作品的世界资料')
    return result
  })
  const latest = getGameById(gameId)
  if (!latest || latest.vndbId !== id) throw new Error('游戏的 VNDB 关联已改变')
  const worldTags = (snapshot.data.tags || [])
    .filter(tag => tag.spoiler === 0 && tag.rating >= 1 && tag.category === 'cont')
    .sort((a, b) => b.rating - a.rating).slice(0, 80).map(tag => tag.name)
  updateGame(gameId, { worldTags, ...(!latest.description && snapshot.data.description ? { description: snapshot.data.description } : {}) })
  const imageUrl = snapshot.data.image?.url || null
  return {
    game: getGameById(gameId)!,
    imageUrl: imageUrl && /^https:\/\//.test(imageUrl) ? imageUrl : null,
    status: snapshot.stale ? 'cached' : 'ready'
  }
}
