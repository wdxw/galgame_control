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
  worldTags?: string[]
  bangumiId: number | null
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

export interface WorldMetadata {
  game: Game
  imageUrl: string | null
  status: 'ready' | 'cached' | 'disabled'
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
  tags: string[]
  rating: number | null
  voteCount: number | null
}

export type Language = 'zh' | 'en'

export type WorldQuality = 'high' | 'medium' | 'low'

export interface AppSettings {
  scanDepth: number
  vndbEnabled: boolean
  hiddenRatingProviders: RatingProvider[]
  theme: 'dark' | 'darker' | 'pink' | 'anime' | 'soft-pink'
  thumbnailSize: number
  scanRoots: string[]
  sidebarCollapsed: boolean
  language: Language
  worldQuality: WorldQuality
  aiBaseUrl: string
  aiModel: string
  aiAutoAnalyze: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  scanDepth: 3,
  vndbEnabled: true,
  hiddenRatingProviders: [],
  theme: 'anime',
  thumbnailSize: 400,
  scanRoots: [],
  sidebarCollapsed: false,
  language: 'zh',
  worldQuality: 'high',
  aiBaseUrl: '',
  aiModel: '',
  aiAutoAnalyze: false
}

// ---- 3D world generation ----

export type WorldElementCategory = 'building' | 'landmark' | 'prop' | 'plant'

export interface WorldElement {
  id: string
  name: string
  nameEn: string
  category: WorldElementCategory
  reason: string
  /** The app's own English wording for `reason`; empty when the reason quotes the
   *  work itself (AI evidence, a tag, or a line the player typed). */
  reasonEn?: string
  launchable?: boolean
}

export interface WorldAnalysis {
  gameId: string
  vndbId: string
  /** 'ai' = AI analysis, 'rules' = rule-based fallback */
  source: 'ai' | 'rules'
  /** 'confirmed' | 'failed' | 'pending' (name-only suggestions) */
  status: 'confirmed' | 'failed' | 'pending'
  biome: string
  atmosphere: { night: boolean; note: string | null }
  /** Confirmed elements backed by evidence. */
  elements: WorldElement[]
  /** Name-only inferences awaiting user confirmation. */
  pendingElements: WorldElement[]
  /** Concepts the AI recognized but the model library cannot render yet. */
  missingElements: string[]
  /** Evidence lines shown in the world feature panel. */
  evidence: string[]
  /** The app's own English wording for `evidence`, when it wrote those lines. */
  evidenceEn?: string[]
  error: string | null
  updatedAt: number
}

export interface BlueprintPlacement {
  modelId: string
  x: number
  z: number
  /** Rotation around Y in radians. */
  rot: number
  scale: number
  /** Label rendered on the object's sign / action label. */
  label?: string
  /** True when clicking the object launches the game. */
  launchable?: boolean
  /** Collision box half-extents in meters. */
  block?: { w: number; d: number }
}

export interface WorldBlueprint {
  kind: 'hub' | 'work'
  biome: string
  /** Generation version; bumping it re-lays the base scene. */
  version: number
  seed: number
  spawn: { x: number; z: number }
  radius: number
  ground: { color: number; stone: number; water: number; foliage: number; accent: number; sky: number; night: boolean }
  placements: BlueprintPlacement[]
  /** Element id used to launch the game when no player override exists. */
  defaultLaunchElementId: string | null
}

export interface PlacedObject {
  id: string
  modelId: string
  x: number
  z: number
  rot: number
  /** Stable key for objects the player added, so they can be removed again. */
  addedId?: string
}

export interface WorldState {
  gameId: string
  placements: PlacedObject[]
  addedElements: WorldElement[]
  removedElementIds: string[]
  launchElementId: string | null
  generationVersion: number
  updatedAt: number
}

export const EMPTY_WORLD_STATE: Omit<WorldState, 'gameId'> = {
  placements: [],
  addedElements: [],
  removedElementIds: [],
  launchElementId: null,
  generationVersion: 1,
  updatedAt: 0
}

export interface WorldInfo {
  game: Game
  imageUrl: string | null
  metadataStatus: 'ready' | 'cached' | 'disabled' | 'error' | 'local'
  analysis: WorldAnalysis | null
  blueprint: WorldBlueprint
  state: WorldState
}

export interface WorldMusicTrack {
  id: string
  disc: string
  number: string
  title: string
  originalTitle: string | null
  duration: string | null
  localPath: string | null
  neteaseId?: string
  artist?: string
  sourceUrl?: string
}

export interface WorldMusicAlbum {
  id: string
  title: string
  originalTitle: string | null
  artist: string | null
  releaseDate: string | null
  coverUrl: string | null
  sourceUrl: string
  detailUrl: string | null
  tracks: WorldMusicTrack[]
  tracksLoaded: boolean
  neteaseId?: string
  tracksPartial?: boolean
}

export interface NeteaseMusicInfo {
  gameId: string
  query: string
  status: 'ready' | 'cached' | 'empty' | 'error'
  partial: boolean
  albums: WorldMusicAlbum[]
  searchUrl: string
  updatedAt: number | null
}

export interface WorldMusicInfo {
  gameId: string
  vndbId: string
  status: 'ready' | 'cached' | 'disabled' | 'unavailable' | 'local'
  albums: WorldMusicAlbum[]
  localTracks: WorldMusicTrack[]
  message: string | null
  updatedAt: number | null
}

export interface HubInfo {
  blueprint: WorldBlueprint
  state: WorldState
}

export interface CustomizationInput {
  placements?: PlacedObject[]
  addedElements?: WorldElement[]
  removedElementIds?: string[]
  launchElementId?: string | null
}

export interface LegacyWorldRecord {
  key: string
  props: { kind: string; x: number; z: number }[]
}

export interface AiStatus {
  baseUrl: string
  model: string
  autoAnalyze: boolean
  keySet: boolean
}

export type RatingProvider = 'vndb' | 'bangumi' | 'erogamescape'
export type OnlineRatingProvider = Exclude<RatingProvider, 'erogamescape'>
export type EgsSite = 'koko' | 'official' | 'legacy'
export type RatingStatus = 'ready' | 'unrated' | 'unmatched' | 'needs-match' | 'restricted' | 'error' | 'disabled'

export interface RatingCandidate {
  id: number
  title: string
  originalTitle: string
  releaseDate: string | null
  imageUrl: string | null
}

export interface GameRating {
  provider: RatingProvider
  source: 'online' | 'manual'
  sourceUrl?: string
  egsSite: EgsSite | null
  externalId: string | null
  status: RatingStatus
  score: number | null
  maxScore: number
  voteCount: number | null
  updatedAt: number | null
  stale: boolean
  candidates: RatingCandidate[]
}

export interface ManualEgsRatingInput {
  entry: string
  score: number | null
  voteCount: number | null
}

export interface ManualEgsRatingRecord {
  externalId: string
  site: EgsSite
  score: number | null
  voteCount: number | null
  updatedAt: number
}
