import { getDb } from './library.db'
import type { LegacyWorldRecord, PlacedObject, WorldAnalysis, WorldElement, WorldState } from '../../shared/types'
import { EMPTY_WORLD_STATE } from '../../shared/types'
import { catalogModel } from '../../shared/worldCatalog'
import { HUB_WORLD_ID } from '../../shared/constants'

const LEGACY_KIND_MODELS: Record<string, string> = {
  tree: 'tree',
  lantern: 'lantern',
  crystal: 'crystal_spire',
  pillar: 'clock_monument'
}

/** The shared island; it has no library row, so it keeps its own single-row table. */
export const HUB_ID = HUB_WORLD_ID

export function initWorldTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS world_states (
      game_id             TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
      placements          TEXT NOT NULL DEFAULT '[]',
      added_elements      TEXT NOT NULL DEFAULT '[]',
      removed_element_ids TEXT NOT NULL DEFAULT '[]',
      launch_element_id   TEXT,
      generation_version  INTEGER NOT NULL DEFAULT 1,
      updated_at          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS world_hub_state (
      id                  INTEGER PRIMARY KEY CHECK (id = 1),
      placements          TEXT NOT NULL DEFAULT '[]',
      added_elements      TEXT NOT NULL DEFAULT '[]',
      removed_element_ids TEXT NOT NULL DEFAULT '[]',
      launch_element_id   TEXT,
      generation_version  INTEGER NOT NULL DEFAULT 1,
      updated_at          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS world_analyses (
      game_id    TEXT NOT NULL,
      vndb_id    TEXT NOT NULL,
      payload    TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (game_id, vndb_id)
    );
  `)
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    const parsed = JSON.parse(String(raw ?? ''))
    return parsed ?? fallback
  } catch { return fallback }
}

function parseList(raw: unknown): unknown[] {
  const value = parseJson<unknown>(raw, [])
  return Array.isArray(value) ? value : []
}

function toPlacedObject(value: unknown): PlacedObject | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.modelId !== 'string' || !catalogModel(item.modelId)) return null
  if (!Number.isFinite(item.x) || !Number.isFinite(item.z)) return null
  const placed: PlacedObject = {
    id: typeof item.id === 'string' && item.id ? item.id : 'p' + Math.random().toString(36).slice(2, 10),
    modelId: item.modelId,
    x: Math.round(Number(item.x) * 100) / 100,
    z: Math.round(Number(item.z) * 100) / 100,
    rot: Number.isFinite(item.rot) ? Number(item.rot) : 0
  }
  if (typeof item.addedId === 'string' && item.addedId) placed.addedId = item.addedId
  return placed
}

function toElement(value: unknown): WorldElement | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string') return null
  const model = catalogModel(item.id)
  if (!model) return null
  return {
    id: model.id,
    name: model.name,
    nameEn: model.nameEn,
    category: model.category,
    reason: typeof item.reason === 'string' ? item.reason.slice(0, 200) : '',
    reasonEn: typeof item.reasonEn === 'string' ? item.reasonEn.slice(0, 200) : undefined,
    launchable: model.interactive
  }
}

export function getWorldState(gameId: string): WorldState {
  const row = (gameId === HUB_ID
    ? getDb().prepare('SELECT * FROM world_hub_state WHERE id = 1').get()
    : getDb().prepare('SELECT * FROM world_states WHERE game_id = ?').get(gameId)) as Record<string, unknown> | undefined
  if (!row) return { gameId, ...EMPTY_WORLD_STATE }
  const placements = parseList(row.placements).map(toPlacedObject).filter((item): item is PlacedObject => !!item).slice(0, 200)
  const addedElements = parseList(row.added_elements).map(toElement).filter((item): item is WorldElement => !!item)
  const removed = parseList(row.removed_element_ids).filter((id): id is string => typeof id === 'string')
  return {
    gameId,
    placements,
    addedElements,
    removedElementIds: removed,
    launchElementId: typeof row.launch_element_id === 'string' ? row.launch_element_id : null,
    generationVersion: Number(row.generation_version) || 1,
    updatedAt: Number(row.updated_at) || 0
  }
}

export function saveWorldState(state: WorldState): WorldState {
  const clean: WorldState = {
    gameId: state.gameId,
    placements: (Array.isArray(state.placements) ? state.placements : []).map(toPlacedObject).filter((item): item is PlacedObject => !!item).slice(0, 200),
    addedElements: (Array.isArray(state.addedElements) ? state.addedElements : []).map(toElement).filter((item): item is WorldElement => !!item),
    removedElementIds: [...new Set((Array.isArray(state.removedElementIds) ? state.removedElementIds : []).filter(id => typeof id === 'string'))],
    launchElementId: state.launchElementId && catalogModel(state.launchElementId) ? state.launchElementId : null,
    generationVersion: Number(state.generationVersion) || 1,
    updatedAt: Date.now()
  }
  const values = {
    placements: JSON.stringify(clean.placements),
    addedElements: JSON.stringify(clean.addedElements),
    removedElementIds: JSON.stringify(clean.removedElementIds),
    launchElementId: clean.launchElementId,
    generationVersion: clean.generationVersion,
    updatedAt: clean.updatedAt
  }
  if (clean.gameId === HUB_ID) {
    getDb().prepare(`
      INSERT INTO world_hub_state(id, placements, added_elements, removed_element_ids, launch_element_id, generation_version, updated_at)
      VALUES(1, @placements, @addedElements, @removedElementIds, @launchElementId, @generationVersion, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET placements = excluded.placements, added_elements = excluded.added_elements,
        removed_element_ids = excluded.removed_element_ids, launch_element_id = excluded.launch_element_id,
        generation_version = excluded.generation_version, updated_at = excluded.updated_at
    `).run(values)
  } else {
    getDb().prepare(`
      INSERT INTO world_states(game_id, placements, added_elements, removed_element_ids, launch_element_id, generation_version, updated_at)
      VALUES(@gameId, @placements, @addedElements, @removedElementIds, @launchElementId, @generationVersion, @updatedAt)
      ON CONFLICT(game_id) DO UPDATE SET placements = excluded.placements, added_elements = excluded.added_elements,
        removed_element_ids = excluded.removed_element_ids, launch_element_id = excluded.launch_element_id,
        generation_version = excluded.generation_version, updated_at = excluded.updated_at
    `).run({ ...values, gameId: clean.gameId })
  }
  return clean
}

/** Re-lays the base scene while keeping everything the player placed by hand. */
export function resetWorldGeneration(gameId: string): WorldState {
  const state = getWorldState(gameId)
  return saveWorldState({ ...state, generationVersion: state.generationVersion + 1 })
}

export function getWorldAnalysis(gameId: string, vndbId: string): WorldAnalysis | null {
  const row = getDb().prepare(
    'SELECT payload FROM world_analyses WHERE game_id = ? AND vndb_id = ?'
  ).get(gameId, vndbId) as { payload: string } | undefined
  if (!row) return null
  const payload = parseJson<WorldAnalysis | null>(row.payload, null)
  if (!payload || typeof payload !== 'object' || payload.gameId !== gameId || payload.vndbId !== vndbId ||
    !Array.isArray(payload.elements) || !Array.isArray(payload.pendingElements) ||
    !Array.isArray(payload.missingElements) || !Array.isArray(payload.evidence) ||
    !payload.atmosphere || typeof payload.atmosphere.night !== 'boolean') return null
  return payload
}

export function saveWorldAnalysis(analysis: WorldAnalysis): void {
  getDb().prepare(`
    INSERT INTO world_analyses(game_id, vndb_id, payload, updated_at) VALUES(?, ?, ?, ?)
    ON CONFLICT(game_id, vndb_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(analysis.gameId, analysis.vndbId, JSON.stringify(analysis), Date.now())
}

/** Drops analyses for every other VNDB association of this game. */
export function clearOtherAnalyses(gameId: string, keepVndbId: string): void {
  getDb().prepare('DELETE FROM world_analyses WHERE game_id = ? AND vndb_id IS NOT ?').run(gameId, keepVndbId)
}

export function hasWorldState(gameId: string): boolean {
  return gameId === HUB_ID
    ? !!getDb().prepare('SELECT 1 FROM world_hub_state WHERE id = 1').get()
    : !!getDb().prepare('SELECT 1 FROM world_states WHERE game_id = ?').get(gameId)
}

/**
 * Imports placements that older builds kept in renderer localStorage.
 * Records are only consumed when the write succeeds, so the caller can keep
 * the legacy copy until it is confirmed.
 */
export function migrateLegacyWorldProps(records: LegacyWorldRecord[]): { migrated: number; keys: string[] } {
  initWorldTables()
  const keys: string[] = []
  let migrated = 0
  getDb().transaction(() => {
    for (const record of records) {
      if (!record || typeof record.key !== 'string' || !Array.isArray(record.props)) continue
      const raw = record.key.startsWith('gal-world-props:') ? record.key.slice('gal-world-props:'.length) : record.key
      const gameId = raw === 'hub' ? HUB_ID : raw
      if (!gameId) continue
      // A deleted game's legacy key must not roll back every other migration.
      if (gameId !== HUB_ID && !getDb().prepare('SELECT 1 FROM games WHERE id = ?').get(gameId)) continue
      if (hasWorldState(gameId)) { keys.push(record.key); continue }
      const placements: PlacedObject[] = []
      for (const prop of record.props.slice(0, 200)) {
        const modelId = LEGACY_KIND_MODELS[String(prop?.kind)]
        if (!modelId || !Number.isFinite(prop?.x) || !Number.isFinite(prop?.z)) continue
        placements.push({
          id: 'm' + placements.length + '-' + Math.random().toString(36).slice(2, 8),
          modelId,
          x: Math.round(Number(prop.x) * 100) / 100,
          z: Math.round(Number(prop.z) * 100) / 100,
          rot: 0
        })
      }
      // Records without a single recognizable prop still mark the world as migrated.
      saveWorldState({ gameId, ...EMPTY_WORLD_STATE, placements, updatedAt: Date.now() })
      keys.push(record.key)
      migrated += placements.length
    }
  })()
  return { migrated, keys }
}
