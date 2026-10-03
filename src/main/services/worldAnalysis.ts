// Turns a game's VNDB metadata into a WorldAnalysis, then into a deterministic
// blueprint. AI analysis is optional: rules always produce a usable world.

import { getDb, getGameById } from './library.db'
import { getWorldMetadata } from './worldMetadata'
import { aiConfigured, getAiConfig, chatCompletion, type ChatMessage } from './aiClient'
import {
  clearOtherAnalyses, getWorldAnalysis, saveWorldAnalysis, resetWorldGeneration,
  getWorldState, saveWorldState, initWorldTables, HUB_ID
} from './world.db'
import { hubBlueprint, buildBlueprint, BLUEPRINT_VERSION } from '../../shared/worldBlueprint'
import { WORLD_CATALOG, catalogModel } from '../../shared/worldCatalog'
import { PALETTES, analysisFromDraft, curatedAnalysis, normalizeElements, ruleAnalysis, type AnalysisDraft, type Biome } from '../../shared/worldRules'
import { seedFor } from '../../shared/worldSeed'
import type { Game, PlacedObject, WorldAnalysis, WorldBlueprint, WorldElement, WorldState, WorldInfo, HubInfo, CustomizationInput } from '../../shared/types'
export type { HubInfo, CustomizationInput } from '../../shared/types'

const BIOMES: Biome[] = ['school', 'coast', 'scifi', 'fantasy', 'shrine', 'mystery', 'winter', 'garden']
const pendingAnalyses = new Map<string, Promise<WorldAnalysis>>()

export function initWorldSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS world_blueprints (
      game_id    TEXT PRIMARY KEY,
      vndb_id    TEXT NOT NULL,
      payload    TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
}

function loadBlueprint(gameId: string): { blueprint: WorldBlueprint; vndbId: string } | null {
  const row = getDb().prepare('SELECT payload, vndb_id FROM world_blueprints WHERE game_id = ?').get(gameId) as
    { payload: string; vndb_id: string } | undefined
  if (!row) return null
  try {
    const parsed = JSON.parse(row.payload) as WorldBlueprint
    if (!parsed || !Array.isArray(parsed.placements) || typeof parsed.seed !== 'number') return null
    return { blueprint: parsed, vndbId: row.vndb_id }
  } catch { return null }
}

function saveBlueprint(gameId: string, vndbId: string, blueprint: WorldBlueprint): void {
  getDb().prepare(`
    INSERT INTO world_blueprints(game_id, vndb_id, payload, updated_at) VALUES(?, ?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET vndb_id = excluded.vndb_id, payload = excluded.payload, updated_at = excluded.updated_at
  `).run(gameId, vndbId, JSON.stringify(blueprint), Date.now())
}

function buildMessages(game: Game): ChatMessage[] {
  const catalog = WORLD_CATALOG
    .filter(model => model.feature || model.category === 'building')
    .map(model => model.id + '(' + model.name + ')')
    .join(', ')
  const tags = (game.worldTags || []).slice(0, 40)
  const system = [
    '你是视觉小说改编三维小岛的场景策划。你只依据用户提供的作品资料推断场景特征，绝不剧透。',
    '输出必须是单个 JSON 对象，不要输出解释、Markdown 或代码块标记。',
    'JSON 结构：',
    '{"biome":"school|coast|scifi|fantasy|shrine|mystery|winter|garden","atmosphere":{"night":true|false,"note":"简短说明或 null"},',
    '"elements":[{"name":"元素名","reason":"依据（引用标签或简介片段）"}],"pending":[{"name":"元素名","reason":"缺少资料依据，仅由名称联想"}],',
    '"missing":["模型库尚无的元素名"],"evidence":["列出你使用的主要依据"]}',
    '规则：',
    '1. elements 只能来自资料中确有依据的内容，reason 必须指出依据来源。',
    '2. 只能从下面的模型清单里挑选 elements；清单外的内容写进 missing，不要编造模型。',
    '3. 仅凭作品名称联想到、资料中无证据的内容放进 pending。',
    '4. elements 最多 8 项，pending 最多 4 项，missing 最多 6 项。',
    '模型清单：' + catalog
  ].join('\n')
  const user = JSON.stringify({
    title: game.title,
    原名: game.originalTitle,
    开发商: game.developer,
    发售日期: game.releaseDate,
    无剧透标签: tags,
    简介: (game.description || '').slice(0, 1600)
  }, null, 1)
  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}

function parseAiReply(reply: string, game: Game): AnalysisDraft {
  const cleaned = reply.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 返回的内容不是 JSON')
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  const biomeRaw = String(parsed.biome || '').toLowerCase() as Biome
  const biome: Biome = BIOMES.includes(biomeRaw) ? biomeRaw : 'garden'
  const toList = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : []
  const confirmed = normalizeElements(toList(parsed.elements))
  const pending = normalizeElements(toList(parsed.pending))
  const missing = [
    ...confirmed.missing,
    ...(Array.isArray(parsed.missing)
      ? parsed.missing.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean) : [])
  ].slice(0, 8)
  const atmosphere = (parsed.atmosphere && typeof parsed.atmosphere === 'object' ? parsed.atmosphere : {}) as Record<string, unknown>
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence.filter((item): item is string => typeof item === 'string')
        .map(item => item.trim().slice(0, 120)).filter(Boolean).slice(0, 6)
    : []
  if (!confirmed.elements.length) throw new Error('AI 没有返回可用的场景元素')
  return {
    source: 'ai',
    status: 'confirmed',
    biome,
    atmosphere: {
      night: atmosphere.night === true,
      note: typeof atmosphere.note === 'string' ? atmosphere.note.slice(0, 160) : null
    },
    elements: confirmed.elements,
    pendingElements: pending.elements,
    missingElements: missing,
    // What the model wrote is quoted as it wrote it; with nothing to quote the
    // panel says, in the reader's own language, where the scene came from.
    evidence
  }
}

/** Rules always succeed; AI is attempted first when configured. */
async function runAnalysis(game: Game, force: boolean): Promise<WorldAnalysis> {
  const vndbId = game.vndbId!
  const curated = curatedAnalysis(game, vndbId)
  if (curated) return analysisFromDraft(game.id, vndbId, curated, null)
  if (aiConfigured() && (force || getAiConfig().autoAnalyze)) {
    try {
      const reply = await chatCompletion(buildMessages(game))
      return analysisFromDraft(game.id, vndbId, parseAiReply(reply, game), null)
    } catch (error) {
      const fallback = ruleAnalysis(game)
      return analysisFromDraft(game.id, vndbId, fallback, (error as Error).message || 'AI 分析失败')
    }
  }
  const fallback = ruleAnalysis(game)
  return analysisFromDraft(game.id, vndbId, fallback, force ? '尚未配置 AI 服务，使用规则识别' : null)
}

/** Analysis elements combined with the player's own additions and removals. */
export function effectiveElements(analysis: WorldAnalysis, added: WorldElement[], removedIds: string[]): WorldElement[] {
  const removed = new Set(removedIds)
  const list = [...analysis.elements, ...added].filter(item => !removed.has(item.id))
  const seen = new Set<string>()
  return list.filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)))
}

function blueprintFor(game: Game, analysis: WorldAnalysis, generation: number, added: WorldElement[], removedIds: string[], placements: PlacedObject[]): WorldBlueprint {
  const elements = effectiveElements(analysis, added, removedIds)
  // Manually adopted features already have a placed object. Reanalysis must not
  // create a second copy elsewhere on the island.
  const placedFeatures = new Set(added.filter(item => placements.some(placed => placed.modelId === item.id)).map(item => item.id))
  // The signature object of the work is the way in; when nothing is naturally
  // interactive, its landmark building becomes the world entrance.
  const launch = elements.find(item => catalogModel(item.id)?.interactive)?.id || elements[0]?.id || null
  const biome = (BIOMES.includes(analysis.biome as Biome) ? analysis.biome : 'garden') as Biome
  const blueprint = buildBlueprint({
    kind: 'work',
    biome,
    // The generation counter is what makes "regenerate" produce a new island.
    seed: seedFor((game.vndbId || game.id) + '#' + generation),
    elements: elements.filter(item => !placedFeatures.has(item.id)),
    launchElementId: launch
  })
  blueprint.ground.night = analysis.atmosphere.night
  blueprint.ground.sky = PALETTES[biome].sky
  return blueprint
}

export interface WorldInfoOptions {
  force?: boolean
  regenerate?: boolean
}

/** Authorized import hook; disabled unless automatic analysis is configured. */
export async function scheduleWorldAnalysis(gameId: string): Promise<void> {
  const config = getAiConfig()
  const game = getGameById(gameId)
  if (!config.autoAnalyze || !aiConfigured() || !game?.vndbId || !/^v\d+$/.test(game.vndbId)) return
  // Keep the normal path's live switch check: turning automatic analysis off
  // while metadata loads must stop the subsequent AI request as well.
  await getWorldInfo(gameId)
}

export async function getWorldInfo(gameId: string, options: WorldInfoOptions = {}): Promise<WorldInfo> {
  initWorldTables()
  initWorldSchema()
  let game = getGameById(gameId)
  if (!game) throw new Error('找不到这部作品')
  if (!game.vndbId) throw new Error('游戏尚未关联 VNDB')

  let metadataStatus: WorldInfo['metadataStatus'] = 'local'
  let imageUrl: string | null = null
  try {
    const metadata = await getWorldMetadata(gameId, options.force === true)
    metadataStatus = metadata.status
    imageUrl = metadata.imageUrl
    game = metadata.game
  } catch {
    metadataStatus = 'error'
    game = getGameById(gameId) || game
  }

  const vndbId = game.vndbId!
  let analysis = getWorldAnalysis(gameId, vndbId)
  let reanalyzed = false
  if (!analysis || options.force || analysis.status === 'pending') {
    const key = gameId + ':' + vndbId
    let pending = pendingAnalyses.get(key)
    if (!pending) {
      pending = runAnalysis(game, options.force === true)
      pendingAnalyses.set(key, pending)
      void pending.finally(() => pendingAnalyses.delete(key)).catch(() => {})
    }
    analysis = await pending
    const latest = getGameById(gameId)
    if (!latest || latest.vndbId !== vndbId) throw new Error('游戏的 VNDB 关联已改变，请重新进入世界')
    clearOtherAnalyses(gameId, vndbId)
    saveWorldAnalysis(analysis)
    reanalyzed = true
  }

  const state = getWorldState(gameId)
  const stored = loadBlueprint(gameId)
  // A fresh analysis re-lays the base scene with the same seed, so the island
  // keeps its shape while newly recognized elements find their slots.
  let blueprint = stored && stored.vndbId === vndbId && !reanalyzed && !options.regenerate ? stored.blueprint : null
  if (!blueprint || options.regenerate) {
    const generation = options.regenerate ? state.generationVersion + 1 : state.generationVersion
    blueprint = blueprintFor(game, analysis, generation, state.addedElements, state.removedElementIds, state.placements)
    saveBlueprint(gameId, vndbId, blueprint)
    if (options.regenerate) resetWorldGeneration(gameId)
  }

  return { game, imageUrl, metadataStatus, analysis, blueprint, state: options.regenerate ? getWorldState(gameId) : state }
}

export function getHubWorld(): HubInfo {
  initWorldTables()
  initWorldSchema()
  const stored = loadBlueprint(HUB_ID)
  const blueprint = stored && stored.blueprint.kind === 'hub' ? stored.blueprint : hubBlueprint()
  if (!stored) saveBlueprint(HUB_ID, HUB_ID, blueprint)
  return { blueprint, state: getWorldState(HUB_ID) }
}

export function saveWorldCustomization(gameId: string, input: CustomizationInput): WorldState {
  const current = getWorldState(gameId)
  return saveWorldState({
    ...current,
    gameId,
    placements: input.placements ?? current.placements,
    addedElements: input.addedElements ?? current.addedElements,
    removedElementIds: input.removedElementIds ?? current.removedElementIds,
    launchElementId: input.launchElementId === undefined ? current.launchElementId : input.launchElementId
  })
}
