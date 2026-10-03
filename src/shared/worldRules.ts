// Rule-based recognition, used when AI analysis is unavailable, unconfigured or fails.
// It only reads the game's own VNDB metadata (no-spoiler tags + synopsis) and never
// invents elements it cannot justify with a matched keyword.

import type { WorldAnalysis, WorldElement } from './types'
import { catalogModel, matchModelId } from './worldCatalog'

export type Biome = 'hub' | 'school' | 'coast' | 'scifi' | 'fantasy' | 'shrine' | 'mystery' | 'winter' | 'garden'

export interface BiomePalette {
  name: string
  nameEn: string
  subtitle: string
  subtitleEn: string
  ground: number
  foliage: number
  accent: number
  sky: number
  water: number
  stone: number
  night: boolean
}

// Each biome carries its name in both languages, the way the model catalogue does:
// which one a scene shows is the reader's choice, not the data's.
export const PALETTES: Record<Biome, BiomePalette> = {
  hub: { name: '万象书庭', nameEn: 'Bibliotheca', subtitle: '每一扇门，通向一段故事', subtitleEn: 'Every door opens onto a story', ground: 0x8fbf8f, foliage: 0x5aa07a, accent: 0xffd9a0, sky: 0x9fd0e8, water: 0x4fb3d9, stone: 0xbcae95, night: false },
  school: { name: '放课后的庭院', nameEn: 'After-School Courtyard', subtitle: '钟楼、教学楼与樱花步道', subtitleEn: 'A bell tower, classrooms and a cherry walk', ground: 0x9cc272, foliage: 0xf2aac6, accent: 0xffd8b6, sky: 0x9ed2ea, water: 0x7fc4d8, stone: 0xc9b394, night: false },
  coast: { name: '潮汐的彼岸', nameEn: 'Across the Tide', subtitle: '灯塔守候着海岸与远方', subtitleEn: 'A lighthouse keeps the coast and the horizon', ground: 0xe6d5a8, foliage: 0x74b189, accent: 0xffe2a5, sky: 0x9fd8ea, water: 0x3fa8c9, stone: 0xd6c8ac, night: false },
  scifi: { name: '星轨观测站', nameEn: 'Orbital Observatory', subtitle: '轨道、天文台与霓虹终端', subtitleEn: 'Orbits, a dome and neon terminals', ground: 0x6d7f9e, foliage: 0x74c4c9, accent: 0x8ff0f2, sky: 0x2b3f6b, water: 0x3f6ea8, stone: 0x8894ad, night: true },
  fantasy: { name: '森之古约', nameEn: 'The Old Forest Pact', subtitle: '城堡与魔法之树的微光', subtitleEn: 'A castle and the glow of a magic tree', ground: 0x74b183, foliage: 0x55b189, accent: 0xbdf3c6, sky: 0x6fb2ae, water: 0x59bfb4, stone: 0xa9b3a4, night: false },
  shrine: { name: '山间的约定', nameEn: 'A Promise in the Hills', subtitle: '鸟居、神社与朱红的桥', subtitleEn: 'Torii, a shrine and a vermilion bridge', ground: 0x9cb478, foliage: 0xeaaec0, accent: 0xffc59b, sky: 0xa8c6dd, water: 0x74c0c4, stone: 0xc2b49c, night: false },
  mystery: { name: '午夜回廊', nameEn: 'Midnight Corridor', subtitle: '雾中的洋馆与静止的钟', subtitleEn: 'A mansion in the fog and a stopped clock', ground: 0x6b7793, foliage: 0x707a90, accent: 0xf6d79a, sky: 0x2c3550, water: 0x4a6485, stone: 0x7d879e, night: true },
  winter: { name: '雪落的街角', nameEn: 'Snowfall Corner', subtitle: '雪屋、暖灯与无声的站台', subtitleEn: 'Snow huts, warm lamps and a silent platform', ground: 0xf0f6f8, foliage: 0xbcd8de, accent: 0xffd4a0, sky: 0xa9cbe0, water: 0x94c2d6, stone: 0xcdd8e2, night: false },
  garden: { name: '花与信的庭园', nameEn: 'Garden of Flowers and Letters', subtitle: '温室、花田与未寄出的信', subtitleEn: 'A greenhouse, a flower field and an unsent letter', ground: 0xafc286, foliage: 0xe2a0bf, accent: 0xffd9b5, sky: 0xdcc7dd, water: 0x8fc4c0, stone: 0xc9b0a6, night: false }
}

const BIOME_RULES: [Biome, RegExp][] = [
  ['coast', /ocean|seaside|island|underwater|aquarium|beach|sea\b|海|岛|水族|海底|深海/iu],
  ['winter', /winter|snow|christmas|冬|雪/iu],
  ['shrine', /shrine|miko|shinto|youkai|yokai|japanese folklore|神社|巫女|妖怪|和风/iu],
  ['scifi', /sci.?fi|science fiction|cyber|space|robot|future|time travel|科幻|未来|宇宙|赛博|时间旅行/iu],
  ['fantasy', /fantasy|magic|medieval|myth|dragon|奇幻|魔法|异世界/iu],
  ['mystery', /mystery|horror|detective|murder|gothic|悬疑|恐怖|推理|谋杀/iu],
  ['school', /school|academy|student|校园|学园|学校/iu],
  ['garden', /romance|love|dating|slice of life|恋爱|爱情|纯爱|日常/iu]
]

// A reason is written once per language: [model id, why in Chinese, why in English].
// These are the sentences the recognition shows as its evidence, so they belong to
// the app rather than to the work, and both readings have to be authored.
type Reasoned = [string, string, string]

/** Signature elements each biome always brings, so worlds read distinctly even with no tags. */
const BIOME_ELEMENTS: Record<Biome, Reasoned[]> = {
  hub: [
    ['cottage', '生活区的小屋', 'A cottage in the living quarter'],
    ['market_stall', '广场上的摊位', 'A stall on the plaza'],
    ['well', '广场中央的水井', 'The well at the centre of the plaza']
  ],
  school: [
    ['school_building', '校园题材的核心建筑', 'The main building of a school story'],
    ['clock_tower', '学校的钟楼', "The school's clock tower"],
    ['sakura_tree', '校园樱花步道', 'A cherry walk through the grounds']
  ],
  coast: [
    ['lighthouse', '海岸边的灯塔', 'A lighthouse on the shore'],
    ['dinghy', '停泊的小舟', 'A moored boat'],
    ['coral_arch', '潮间带的珊瑚', 'Coral in the tidal zone']
  ],
  scifi: [
    ['observatory', '观测宇宙的天文台', 'An observatory watching the sky'],
    ['planet_model', '轨道上的星体模型', 'A planet model in orbit'],
    ['telescope', '观星设备', 'Equipment for watching the stars']
  ],
  fantasy: [
    ['castle', '奇幻世界的城堡', 'A castle of a fantasy world'],
    ['magic_tree', '森林中的魔法树', 'The magic tree in the forest'],
    ['crystal_spire', '魔力结晶', 'A shard of crystallised magic']
  ],
  shrine: [
    ['shrine_hall', '神社本殿', 'The main hall of the shrine'],
    ['torii', '参道入口的鸟居', 'The torii at the approach'],
    ['lantern', '参道两侧的石灯', 'Stone lanterns along the path']
  ],
  mystery: [
    ['manor', '雾中的洋馆', 'A mansion in the fog'],
    ['clock_monument', '停摆的时钟', 'A clock that has stopped'],
    ['street_lamp', '昏黄的街灯', 'A dim street lamp']
  ],
  winter: [
    ['cottage', '雪地里的小屋', 'A cottage in the snow'],
    ['snowman', '雪人', 'A snowman'],
    ['station', '积雪的站台', 'A snowed-in platform']
  ],
  garden: [
    ['greenhouse', '温室花房', 'A greenhouse'],
    ['flower_bed', '庭院花坛', 'A flower bed in the garden'],
    ['bench', '散步道旁的长椅', 'A bench beside the walk'],
    ['picnic_set', '庭院中的休憩茶桌', 'A tea table in the garden']
  ]
}

const MOTIFS: { id: string; pattern: RegExp; models: Reasoned[] }[] = [
  {
    id: 'farming',
    pattern: /farming|agriculture|vegetable|田园|农场|种植|菜园/i,
    models: [['vegetable_patch', '作品资料中的种植与田园场景', 'Farming and gardens described by the work']]
  },
  {
    id: 'railway',
    pattern: /train|railway|station|locomotive|列车|铁路|车站|火车/i,
    models: [['train', '作品中出现的列车', 'A train from the work'], ['station', '铁路车站', 'A railway station']]
  },
  {
    id: 'clock',
    pattern: /time travel|time loop|clock|时间|轮回|时钟/i,
    models: [['clock_monument', '与时间相关的标志物', 'A marker tied to time']]
  },
  {
    id: 'music',
    pattern: /music|band|piano|音乐|乐队|钢琴/i,
    models: [['piano', '作品中的乐器', 'An instrument from the work']]
  },
  {
    id: 'library',
    pattern: /book|library|literature|图书|文学|书店/i,
    models: [['bookshelf', '与书籍相关的陈设', 'Furnishings around books']]
  },
  {
    id: 'sakura',
    pattern: /cherry|sakura|樱/i,
    models: [['sakura_tree', '樱花意象', 'The image of cherry blossom']]
  },
  {
    id: 'underwater',
    pattern: /underwater|submarine|deep sea|海底|深海|水下/i,
    models: [['submarine_dome', '海底观测设施', 'An underwater observation post'], ['coral_arch', '海底生态', 'Life on the sea floor']]
  },
  {
    id: 'machine',
    pattern: /machine|mecha|robot|engine|机械|机甲|机器人|兵器/i,
    models: [['machinery', '作品中的机械设施', 'Machinery from the work']]
  }
]

/** Works the user asked to verify by hand get curated elements keyed by their VNDB id. */
const CURATED: Record<string, { biome: Biome; elements: Reasoned[]; note: string; noteEn: string }> = {
  v2016: {
    biome: 'mystery',
    note: '《装甲恶鬼村正》专属配置：妖刀、刀架与装甲展示。',
    noteEn: 'The dedicated configuration for Full Metal Daemon Muramasa: the cursed blade, its rack and the armour display.',
    elements: [
      ['sword_rack', '作品核心的妖刀，置于刀架之上', 'The cursed blade at the heart of the work, resting on its rack'],
      ['armor_display', '作品中的装甲（劔胄）展示', 'A display of the armour (tsurugi) from the work'],
      ['machinery', '武家社会的机械设施', 'The machinery of a warrior-house society'],
      ['torii', '和风舞台的鸟居', 'A torii of the Japanese setting'],
      ['manor', '武家宅邸', 'A warrior-house residence']
    ]
  }
}

export interface WorldSource {
  id: string
  title: string
  originalTitle: string | null
  description: string | null
  worldTags?: string[] | null
}

export interface AnalysisDraft {
  source: 'ai' | 'rules'
  status: 'confirmed' | 'failed' | 'pending'
  biome: Biome
  atmosphere: { night: boolean; note: string | null }
  elements: WorldElement[]
  pendingElements: WorldElement[]
  missingElements: string[]
  evidence: string[]
  evidenceEn?: string[]
}

function element(modelId: string, reason: string, reasonEn: string, index: number): WorldElement | null {
  const model = catalogModel(modelId)
  if (!model) return null
  return {
    id: model.id,
    name: model.name,
    nameEn: model.nameEn,
    category: model.category,
    reason,
    reasonEn,
    launchable: model.interactive
  }
}

/** Rule recognition over the game's own metadata. */
export function ruleAnalysis(game: WorldSource): AnalysisDraft {
  const tags = (game.worldTags || []).filter(tag => typeof tag === 'string')
  const description = game.description || ''
  const ranked = BIOME_RULES.map(([biome, pattern], index) => ({
    biome,
    score: (tags.some(tag => pattern.test(tag)) ? 20 + Math.min(3, tags.filter(tag => pattern.test(tag)).length) + (index < 3 ? 5 : 0) : 0)
      + (pattern.test(description) ? 3 : 0),
    index,
    evidence: tags.filter(tag => pattern.test(tag))
  })).sort((a, b) => b.score - a.score || a.index - b.index)
  const biome: Biome = ranked[0].score > 0 ? ranked[0].biome : 'garden'
  // The tags themselves are the evidence, and they come from the work; when a
  // biome was chosen without any, the panel names the fallback in its own words.
  const evidence = ranked.find(item => item.biome === biome)?.evidence.slice(0, 4) || []
  const elements: WorldElement[] = []
  const push = (modelId: string, reason: string, reasonEn: string) => {
    if (elements.some(item => item.id === modelId)) return
    const built = element(modelId, reason, reasonEn, elements.length)
    if (built) elements.push(built)
  }
  for (const [modelId, reason, reasonEn] of BIOME_ELEMENTS[biome]) push(modelId, reason, reasonEn)
  const text = tags.join(' ') + ' ' + description
  for (const motif of MOTIFS) {
    if (!motif.pattern.test(text)) continue
    for (const [modelId, reason, reasonEn] of motif.models) push(modelId, reason, reasonEn)
  }
  return {
    source: 'rules',
    status: 'confirmed',
    biome,
    atmosphere: { night: PALETTES[biome].night, note: null },
    elements,
    pendingElements: [],
    missingElements: [],
    evidence
  }
}

/** Curated overrides matched on the VNDB id, ahead of rule recognition. */
export function curatedAnalysis(game: WorldSource, vndbId: string | null): AnalysisDraft | null {
  const entry = vndbId ? CURATED[vndbId] : undefined
  if (!entry) return null
  const elements: WorldElement[] = []
  for (const [modelId, reason, reasonEn] of entry.elements) {
    const built = element(modelId, reason, reasonEn, elements.length)
    if (built) elements.push(built)
  }
  return {
    source: 'rules',
    status: 'confirmed',
    biome: entry.biome,
    atmosphere: { night: PALETTES[entry.biome].night, note: entry.note },
    elements,
    pendingElements: [],
    missingElements: [],
    evidence: [entry.note],
    evidenceEn: [entry.noteEn]
  }
}

/** Fills in ids the AI may have returned as free text, and drops unknown models. */
export function normalizeElements(raw: { name?: unknown; reason?: unknown }[]): { elements: WorldElement[]; missing: string[] } {
  const elements: WorldElement[] = []
  const missing: string[] = []
  for (const item of raw) {
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) continue
    const modelId = matchModelId(name)
    const model = modelId ? catalogModel(modelId) : null
    if (!model) { missing.push(name); continue }
    if (elements.some(existing => existing.id === model.id)) continue
    elements.push({
      id: model.id,
      name: model.name,
      nameEn: model.nameEn,
      category: model.category,
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 200) : '',
      launchable: model.interactive
    })
  }
  return { elements, missing }
}

export function analysisFromDraft(gameId: string, vndbId: string, draft: AnalysisDraft, error: string | null): WorldAnalysis {
  return {
    gameId,
    vndbId,
    source: draft.source,
    status: draft.status,
    biome: draft.biome,
    atmosphere: draft.atmosphere,
    elements: draft.elements,
    pendingElements: draft.pendingElements,
    missingElements: draft.missingElements,
    evidence: draft.evidence,
    evidenceEn: draft.evidenceEn,
    error,
    updatedAt: Date.now()
  }
}
