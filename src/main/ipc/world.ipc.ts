import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { getDb } from '../services/library.db'
import { initWorldTables, migrateLegacyWorldProps } from '../services/world.db'
import { getHubWorld, getWorldInfo, saveWorldCustomization, type CustomizationInput } from '../services/worldAnalysis'
import { getAiStatus, saveAiSettings, testAiConnection } from '../services/aiClient'
import type { LegacyWorldRecord, WorldAnalysis } from '../../shared/types'

interface QueueRow {
  id: string
  vndb_id: string
  title: string
  original_title: string | null
  description: string | null
  world_tags: string
}

const QUEUE_BATCH = 4

/** Analyses games that were linked to VNDB but never analyzed, one batch per call. */
async function analyzeQueue(): Promise<{ analyzed: number; remaining: number }> {
  initWorldTables()
  if (!getAiStatus().autoAnalyze) return { analyzed: 0, remaining: 0 }
  const rows = getDb().prepare(`
    SELECT g.id, g.vndb_id, g.title, g.original_title, g.description, g.world_tags
    FROM games g
    WHERE g.vndb_id IS NOT NULL AND g.vndb_id <> ''
      AND NOT EXISTS (SELECT 1 FROM world_analyses a WHERE a.game_id = g.id AND a.vndb_id = g.vndb_id)
    ORDER BY g.date_added DESC
    LIMIT ?
  `).all(QUEUE_BATCH) as QueueRow[]
  let analyzed = 0
  for (const row of rows) {
    if (!getAiStatus().autoAnalyze) break
    try {
      // Reuse the full pipeline so curation and validation apply here too.
      await getWorldInfo(row.id)
      analyzed++
    } catch {
      // A failing work must not block the rest of the queue; rules still apply on entry.
    }
  }
  const remaining = (getDb().prepare(`
    SELECT COUNT(*) AS total FROM games g
    WHERE g.vndb_id IS NOT NULL AND g.vndb_id <> ''
      AND NOT EXISTS (SELECT 1 FROM world_analyses a WHERE a.game_id = g.id AND a.vndb_id = g.vndb_id)
  `).get() as { total: number }).total
  return { analyzed, remaining }
}

export function registerWorldHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_WORLD, (_event, gameId: string, options?: { force?: boolean; regenerate?: boolean }) =>
    getWorldInfo(String(gameId), { force: options?.force === true, regenerate: options?.regenerate === true }))

  ipcMain.handle(IPC_CHANNELS.GET_HUB_WORLD, () => getHubWorld())

  ipcMain.handle(IPC_CHANNELS.SAVE_WORLD, (_event, gameId: string, input: CustomizationInput) =>
    saveWorldCustomization(String(gameId), input || {}))

  ipcMain.handle(IPC_CHANNELS.ANALYZE_WORLD, async (_event, gameId: string): Promise<WorldAnalysis> => {
    const info = await getWorldInfo(String(gameId), { force: true })
    return info.analysis!
  })

  ipcMain.handle(IPC_CHANNELS.ANALYZE_WORLD_QUEUE, () => analyzeQueue())

  ipcMain.handle(IPC_CHANNELS.MIGRATE_WORLD_PROPS, (_event, records: LegacyWorldRecord[]) =>
    migrateLegacyWorldProps(Array.isArray(records) ? records.slice(0, 200) : []))

  ipcMain.handle(IPC_CHANNELS.AI_STATUS, () => getAiStatus())

  ipcMain.handle(IPC_CHANNELS.AI_SAVE, (_event, input: Record<string, unknown>) => saveAiSettings(input || {}))

  ipcMain.handle(IPC_CHANNELS.AI_TEST, () => testAiConnection())
}
