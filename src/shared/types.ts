// Shared types between main process and renderer

export interface Game {
  id: string
  title: string
  originalTitle: string | null
  exePath: string
  gameDir: string
  coverPath: string | null
  coverSource: 'local' | 'vndb' | 'manual' | 'none'
  vndbId: string | null
  developer: string | null
  description: string | null
  releaseDate: string | null
  playTime: number
  lastPlayed: string | null
  dateAdded: string
  isFavorite: boolean
  notes: string | null
  exeArgs: string | null
}

export interface ExeCandidate {
  path: string
  name: string
  score: number
  sizeBytes: number
  reasons: string[]
}

export interface ScanCandidate {
  folderPath: string
  folderName: string
  exeFiles: ExeCandidate[]
  localCovers: string[]
}

export interface ScanProgress {
  currentDir: string
  dirsScanned: number
  gamesFound: number
  phase: 'walking' | 'analyzing' | 'complete'
}

export interface VndbSearchResult {
  id: string
  title: string
  originalTitle: string | null
  imageUrl: string | null
  imageNSFW: boolean
  releaseDate: string | null
  developer: string | null
  description: string | null
  aliases: string[]
  rating: number | null
  voteCount: number | null
}

export type Language = 'zh' | 'en'

export interface AppSettings {
  scanDepth: number
  vndbEnabled: boolean
  theme: 'dark' | 'darker' | 'pink' | 'anime'
  thumbnailSize: number
  scanRoots: string[]
  sidebarCollapsed: boolean
  language: Language
}

export const DEFAULT_SETTINGS: AppSettings = {
  scanDepth: 3,
  vndbEnabled: true,
  theme: 'anime',
  thumbnailSize: 400,
  scanRoots: [],
  sidebarCollapsed: false,
  language: 'zh'
}
