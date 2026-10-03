// The original rounded model library shipped with the app.
// Both processes share this catalog: the main process validates AI element ids
// against it and lays out blueprints, the renderer builds the actual meshes.

export type ModelCategory = 'building' | 'landmark' | 'prop' | 'plant'

export interface CatalogModel {
  id: string
  name: string
  nameEn: string
  category: ModelCategory
  /** Full collision box dimensions in meters, used for pathing and placement checks. */
  block: { w: number; d: number }
  /** Preferred distance from the island centre when auto-placed. */
  ring?: number
  /** Keywords matched against AI element names to resolve a model. */
  keywords: string[]
  /** True for models the player can click to launch the game. */
  interactive?: boolean
  /** Default display name when used as a world feature. */
  feature?: boolean
}

export const WORLD_CATALOG: CatalogModel[] = [
  // ---- Buildings ----
  { id: 'school_building', name: '教学楼', nameEn: 'School building', category: 'building', block: { w: 4.2, d: 1.9 }, ring: 8.5, keywords: ['school', 'classroom', 'academy', '学校', '教学楼', '学园'] },
  { id: 'clock_tower', name: '钟楼', nameEn: 'Clock tower', category: 'building', block: { w: 1.3, d: 1.3 }, ring: 6.6, keywords: ['clock tower', 'bell tower', '钟楼', '钟塔'] },
  { id: 'cottage', name: '小屋', nameEn: 'Cottage', category: 'building', block: { w: 1.6, d: 1.4 }, ring: 7.4, keywords: ['house', 'cottage', 'home', 'cabin', '小屋', '民居', '住宅'] },
  { id: 'lighthouse', name: '灯塔', nameEn: 'Lighthouse', category: 'building', block: { w: 1, d: 1 }, ring: 10.4, keywords: ['lighthouse', 'beacon', '灯塔'] },
  { id: 'observatory', name: '天文台', nameEn: 'Observatory', category: 'building', block: { w: 2.2, d: 2.2 }, ring: 8.2, keywords: ['observatory', 'planetarium', '天文台', '观测站', '天文馆'] },
  { id: 'castle', name: '城堡', nameEn: 'Castle', category: 'building', block: { w: 3.2, d: 1.8 }, ring: 8.6, keywords: ['castle', 'fortress', 'palace', '城堡', '要塞', '宫殿'] },
  { id: 'manor', name: '洋馆', nameEn: 'Manor', category: 'building', block: { w: 3.4, d: 1.9 }, ring: 8.4, keywords: ['manor', 'mansion', 'estate', '洋馆', '宅邸', '公馆'] },
  { id: 'shrine_hall', name: '神社本殿', nameEn: 'Shrine hall', category: 'building', block: { w: 2.6, d: 1.7 }, ring: 8.0, keywords: ['shrine', 'temple', 'honden', '神社', '本殿', '寺庙'] },
  { id: 'station', name: '车站', nameEn: 'Station', category: 'building', block: { w: 3.0, d: 1.5 }, ring: 9.2, keywords: ['station', 'platform', 'terminal', '车站', '站台', '月台'] },
  { id: 'greenhouse', name: '温室', nameEn: 'Greenhouse', category: 'building', block: { w: 2.2, d: 1.5 }, ring: 7.6, keywords: ['greenhouse', 'conservatory', '温室', '花房'] },
  { id: 'submarine_dome', name: '海底观测穹顶', nameEn: 'Undersea dome', category: 'building', block: { w: 2.6, d: 2.6 }, ring: 8.0, keywords: ['underwater', 'submarine', 'deep sea', 'dome', '海底', '深海', '潜水', '观测舱', '水下'] },
  { id: 'workshop', name: '工房', nameEn: 'Workshop', category: 'building', block: { w: 2.0, d: 1.6 }, ring: 8.0, keywords: ['workshop', 'factory', 'lab', '工房', '工场', '实验室', '研究所'] },

  // ---- Landmarks ----
  { id: 'torii', name: '鸟居', nameEn: 'Torii gate', category: 'landmark', block: { w: 1.9, d: 0.35 }, ring: 5.6, keywords: ['torii', 'shinto gate', '鸟居', '牌坊'] },
  { id: 'sword_rack', name: '刀架与妖刀', nameEn: 'Sword rack with cursed blade', category: 'landmark', block: { w: 1.0, d: 0.6 }, ring: 3.4, keywords: ['katana', 'cursed blade', 'demon sword', 'muramasa', '妖刀', '刀架', '村正', '太刀', '日本刀'], interactive: true, feature: true },
  { id: 'katana_display', name: '妖刀展示', nameEn: 'Cursed blade display', category: 'landmark', block: { w: 0.9, d: 0.5 }, ring: 4.4, keywords: ['blade', 'sword', '刀', '剑'], interactive: true, feature: true },
  { id: 'armor_display', name: '装甲展示', nameEn: 'Armour display', category: 'landmark', block: { w: 1.5, d: 1.0 }, ring: 5.2, keywords: ['armour', 'armor', 'mecha', 'tsurugi', 'suit', '装甲', '机甲', '铠甲', '机体'], feature: true },
  { id: 'machinery', name: '机械设施', nameEn: 'Machinery', category: 'landmark', block: { w: 1.4, d: 1.4 }, ring: 6.0, keywords: ['machine', 'engine', 'reactor', 'generator', '机械', '机关', '反应堆', '引擎'], feature: true },
  { id: 'train', name: '列车', nameEn: 'Train', category: 'landmark', block: { w: 1.1, d: 3.6 }, ring: 9.6, keywords: ['train', 'railway', 'locomotive', 'carriage', '列车', '火车', '铁路', '车厢'], feature: true },
  { id: 'piano', name: '钢琴', nameEn: 'Piano', category: 'landmark', block: { w: 1.1, d: 0.7 }, ring: 4.8, keywords: ['piano', 'keyboard', 'music room', '钢琴', '键盘', '音乐'], interactive: true, feature: true },
  { id: 'bookshelf', name: '书架', nameEn: 'Bookshelf', category: 'landmark', block: { w: 0.9, d: 0.35 }, ring: 4.6, keywords: ['book', 'library', 'bookshelf', 'literature', '书架', '图书', '图书馆', '书库'], feature: true },
  { id: 'sakura_tree', name: '樱花树', nameEn: 'Cherry tree', category: 'plant', block: { w: 0.5, d: 0.5 }, ring: 6.4, keywords: ['sakura', 'cherry blossom', '樱花', '樱树'], feature: true },
  { id: 'magic_tree', name: '魔法树', nameEn: 'Magic tree', category: 'plant', block: { w: 0.7, d: 0.7 }, ring: 6.8, keywords: ['world tree', 'magic tree', 'sacred tree', '魔法树', '神木', '世界树'] },
  { id: 'crystal_spire', name: '晶石', nameEn: 'Crystal spire', category: 'landmark', block: { w: 0.6, d: 0.6 }, ring: 5.4, keywords: ['crystal', 'gem', 'mana', '水晶', '晶石', '宝石'] },
  { id: 'planet_model', name: '星体模型', nameEn: 'Planet model', category: 'landmark', block: { w: 0.9, d: 0.9 }, ring: 6.2, keywords: ['planet', 'orbit', 'space', 'saturn', '星球', '行星', '轨道'], feature: true },
  { id: 'telescope', name: '望远镜', nameEn: 'Telescope', category: 'landmark', block: { w: 0.7, d: 0.9 }, ring: 5.0, keywords: ['telescope', 'stargazing', '望远镜', '观星'] },
  { id: 'clock_monument', name: '时钟纪念碑', nameEn: 'Clock monument', category: 'landmark', block: { w: 0.8, d: 0.8 }, ring: 5.2, keywords: ['clock', 'timepiece', 'time loop', '时钟', '怀表', '时间'] },
  { id: 'snowman', name: '雪人', nameEn: 'Snowman', category: 'prop', block: { w: 0.5, d: 0.5 }, ring: 4.6, keywords: ['snowman', 'snow', '雪人', '雪'] },
  { id: 'dinghy', name: '小舟', nameEn: 'Dinghy', category: 'prop', block: { w: 1.0, d: 1.8 }, ring: 10.2, keywords: ['boat', 'ship', 'dinghy', 'sail', '小船', '舟', '帆船'] },
  { id: 'coral_arch', name: '珊瑚拱', nameEn: 'Coral arch', category: 'landmark', block: { w: 1.2, d: 0.5 }, ring: 6.6, keywords: ['coral', 'reef', '珊瑚', '礁'] },
  { id: 'globe_monument', name: '地球仪', nameEn: 'Globe', category: 'landmark', block: { w: 0.7, d: 0.7 }, ring: 4.2, keywords: ['globe', 'earth', 'atlas', '地球仪', '世界地图'] },

  // ---- Props ----
  { id: 'vegetable_patch', name: '蔬果菜圃', nameEn: 'Vegetable patch', category: 'plant', block: { w: 2.1, d: 1.7 }, ring: 6.7, keywords: ['vegetable', 'farm plot', 'crop bed', '菜圃', '菜田', '蔬果'], feature: true },
  { id: 'picnic_set', name: '庭院茶桌', nameEn: 'Garden tea table', category: 'prop', block: { w: 1.65, d: 2.05 }, ring: 5.4, keywords: ['picnic', 'tea table', 'outdoor dining', '野餐', '茶桌', '下午茶'], feature: true },
  { id: 'tree', name: '树木', nameEn: 'Tree', category: 'plant', block: { w: 0.4, d: 0.4 }, keywords: ['tree', 'forest', 'wood', '树木', '森林'] },
  { id: 'lantern', name: '路灯', nameEn: 'Lantern', category: 'prop', block: { w: 0.35, d: 0.35 }, keywords: ['lantern', 'lamp', '路灯', '灯笼'] },
  { id: 'street_lamp', name: '街灯', nameEn: 'Street lamp', category: 'prop', block: { w: 0.3, d: 0.3 }, keywords: ['street lamp', 'streetlight', '街灯', '路灯'] },
  { id: 'bench', name: '长椅', nameEn: 'Bench', category: 'prop', block: { w: 0.8, d: 0.35 }, keywords: ['bench', 'seat', '长椅', '长凳'] },
  { id: 'fence', name: '木栅栏', nameEn: 'Fence', category: 'prop', block: { w: 1.2, d: 0.15 }, keywords: ['fence', '栅栏', '围栏'] },
  { id: 'signpost', name: '路牌', nameEn: 'Signpost', category: 'prop', block: { w: 0.3, d: 0.15 }, keywords: ['sign', 'signpost', '路牌', '指示牌'] },
  { id: 'flower_bed', name: '花坛', nameEn: 'Flower bed', category: 'prop', block: { w: 0.9, d: 0.6 }, keywords: ['flower bed', 'garden', '花坛', '花圃'] },
  { id: 'bush', name: '灌木', nameEn: 'Bush', category: 'plant', block: { w: 0.4, d: 0.4 }, keywords: ['bush', 'shrub', 'hedge', '灌木', '树篱'] },
  { id: 'flower_patch', name: '花丛', nameEn: 'Flowers', category: 'plant', block: { w: 0.3, d: 0.3 }, keywords: ['flower', 'bloom', '花丛', '野花'] },
  { id: 'crate', name: '木箱', nameEn: 'Crate', category: 'prop', block: { w: 0.45, d: 0.45 }, keywords: ['crate', 'box', '木箱', '货箱'] },
  { id: 'well', name: '水井', nameEn: 'Well', category: 'prop', block: { w: 0.7, d: 0.7 }, keywords: ['well', 'fountain', '水井', '喷泉'] },
  { id: 'market_stall', name: '摊位', nameEn: 'Market stall', category: 'prop', block: { w: 1.1, d: 0.8 }, keywords: ['stall', 'market', 'shop', '摊位', '集市', '商店'] },
  { id: 'mailbox', name: '信箱', nameEn: 'Mailbox', category: 'prop', block: { w: 0.3, d: 0.3 }, keywords: ['mail', 'letter', 'postbox', '信箱', '邮筒', '信'] }
]

export const CATALOG_BY_ID = new Map(WORLD_CATALOG.map(model => [model.id, model]))

/** Models the player can place by hand, grouped for the build toolbar. */
export const BUILDABLE_IDS = [
  'tree', 'sakura_tree', 'bush', 'flower_patch', 'flower_bed',
  'lantern', 'street_lamp', 'bench', 'fence', 'signpost', 'mailbox',
  'crystal_spire', 'well', 'crate', 'market_stall', 'bookshelf', 'piano', 'vegetable_patch', 'picnic_set'
]

export function catalogModel(id: string): CatalogModel | null {
  return CATALOG_BY_ID.get(id) || null
}

/** Resolves a free-text element name to a catalog model, newest matches first. */
export function matchModelId(text: string): string | null {
  const value = text.trim().toLowerCase()
  if (!value) return null
  if (CATALOG_BY_ID.has(value)) return value
  for (const model of WORLD_CATALOG) {
    if (model.keywords.some(keyword => value.includes(keyword.toLowerCase()))) return model.id
    if (value.includes(model.name) || value.includes(model.nameEn.toLowerCase())) return model.id
  }
  return null
}
