import Database from 'better-sqlite3'
import { getDbPath } from '../utils/paths'
import type { Game } from '../../shared/types'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath())
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function initDatabase(): void {
  const database = getDb()

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS games (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      original_title  TEXT,
      exe_path        TEXT NOT NULL UNIQUE,
      game_dir        TEXT NOT NULL,
      cover_path      TEXT,
      cover_source    TEXT NOT NULL DEFAULT 'none'
                      CHECK(cover_source IN ('local','vndb','manual','none')),
      vndb_id         TEXT,
      developer       TEXT,
      description     TEXT,
      release_date    TEXT,
      play_time       INTEGER NOT NULL DEFAULT 0,
      last_played     TEXT,
      date_added      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      is_favorite     INTEGER NOT NULL DEFAULT 0,
      notes           TEXT,
      exe_args        TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS game_tags (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (game_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Ensure schema version
  const row = database.prepare(
    'SELECT version FROM schema_version'
  ).get() as { version: number } | undefined

  if (!row) {
    database.prepare('INSERT INTO schema_version (version) VALUES (2)').run()
  } else if (row.version < 2) {
    // Migrate: add description column (v1 → v2)
    try {
      database.exec('ALTER TABLE games ADD COLUMN description TEXT')
    } catch {
      // Column may already exist
    }
    database.prepare('UPDATE schema_version SET version = 2 WHERE version = 1').run()
  }
}

// ---- Game CRUD ----

function rowToGame(row: Record<string, unknown>): Game {
  return {
    id: row.id as string,
    title: row.title as string,
    originalTitle: (row.original_title as string) || null,
    exePath: row.exe_path as string,
    gameDir: row.game_dir as string,
    coverPath: (row.cover_path as string) || null,
    coverSource: (row.cover_source as Game['coverSource']) || 'none',
    vndbId: (row.vndb_id as string) || null,
    developer: (row.developer as string) || null,
    description: (row.description as string) || null,
    releaseDate: (row.release_date as string) || null,
    playTime: (row.play_time as number) || 0,
    lastPlayed: (row.last_played as string) || null,
    dateAdded: row.date_added as string,
    isFavorite: row.is_favorite === 1,
    notes: (row.notes as string) || null,
    exeArgs: (row.exe_args as string) || null
  }
}

export function getAllGames(): Game[] {
  const database = getDb()
  const rows = database.prepare(
    'SELECT * FROM games ORDER BY date_added DESC'
  ).all() as Record<string, unknown>[]
  return rows.map(rowToGame)
}

export function getGameById(id: string): Game | null {
  const database = getDb()
  const row = database.prepare(
    'SELECT * FROM games WHERE id = ?'
  ).get(id) as Record<string, unknown> | undefined
  return row ? rowToGame(row) : null
}

export function addGame(game: Game): boolean {
  const database = getDb()
  // Check if game with same exePath already exists
  const existing = database.prepare(
    'SELECT id FROM games WHERE exe_path = ?'
  ).get(game.exePath)
  if (existing) return false

  database.prepare(`
    INSERT INTO games (id, title, original_title, exe_path, game_dir,
      cover_path, cover_source, vndb_id, developer, description, release_date,
      play_time, last_played, date_added, is_favorite, notes, exe_args)
    VALUES (@id, @title, @originalTitle, @exePath, @gameDir,
      @coverPath, @coverSource, @vndbId, @developer, @description, @releaseDate,
      @playTime, @lastPlayed, @dateAdded, @isFavorite, @notes, @exeArgs)
  `).run({
    id: game.id,
    title: game.title,
    originalTitle: game.originalTitle,
    exePath: game.exePath,
    gameDir: game.gameDir,
    coverPath: game.coverPath,
    coverSource: game.coverSource,
    vndbId: game.vndbId,
    developer: game.developer,
    description: game.description,
    releaseDate: game.releaseDate,
    playTime: game.playTime,
    lastPlayed: game.lastPlayed,
    dateAdded: game.dateAdded,
    isFavorite: game.isFavorite ? 1 : 0,
    notes: game.notes,
    exeArgs: game.exeArgs
  })
  return true
}

export function updateGame(id: string, fields: Partial<Game>): void {
  const database = getDb()

  // Map camelCase to snake_case for SQL
  const fieldMap: Record<string, string> = {
    title: 'title',
    originalTitle: 'original_title',
    exePath: 'exe_path',
    gameDir: 'game_dir',
    coverPath: 'cover_path',
    coverSource: 'cover_source',
    vndbId: 'vndb_id',
    developer: 'developer',
    description: 'description',
    releaseDate: 'release_date',
    playTime: 'play_time',
    lastPlayed: 'last_played',
    dateAdded: 'date_added',
    isFavorite: 'is_favorite',
    notes: 'notes',
    exeArgs: 'exe_args'
  }

  const setClauses: string[] = []
  const params: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    const colName = fieldMap[key]
    if (colName) {
      setClauses.push(`${colName} = @${key}`)
      params[key] = key === 'isFavorite' ? (value ? 1 : 0) : value
    }
  }

  if (setClauses.length === 0) return

  params['id'] = id
  database.prepare(
    `UPDATE games SET ${setClauses.join(', ')} WHERE id = @id`
  ).run(params)
}

export function deleteGame(id: string): void {
  const database = getDb()
  database.prepare('DELETE FROM games WHERE id = ?').run(id)
}

export function searchGames(query: string): Game[] {
  const database = getDb()
  const like = `%${query}%`
  const rows = database.prepare(
    `SELECT * FROM games
     WHERE title LIKE @q
        OR original_title LIKE @q
        OR developer LIKE @q
     ORDER BY date_added DESC`
  ).all({ q: like }) as Record<string, unknown>[]
  return rows.map(rowToGame)
}

export function getGameByExePath(exePath: string): Game | null {
  const database = getDb()
  const row = database.prepare(
    'SELECT * FROM games WHERE exe_path = ?'
  ).get(exePath) as Record<string, unknown> | undefined
  return row ? rowToGame(row) : null
}

// ---- Settings ----

export function getSetting(key: string): string | null {
  const database = getDb()
  const row = database.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).get(key) as { value: string } | undefined
  return row ? row.value : null
}

export function setSetting(key: string, value: string): void {
  const database = getDb()
  database.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  ).run(key, value)
}

export function getAllSettings(): Record<string, string> {
  const database = getDb()
  const rows = database.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

// ---- Close ----

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
