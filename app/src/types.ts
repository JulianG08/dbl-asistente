export type Element = 'RED' | 'YEL' | 'PUR' | 'GRN' | 'BLU' | 'LGT' | 'DRK'
export type Rarity = 'LEGEND' | 'ULTRA' | 'SPARKING' | 'EXTREME' | 'HERO'

export interface Character {
  id: number
  name: string
  form: string
  element: Element
  rarity: Rarity
  zenkai: boolean
  lf: boolean
  tags: number[]
  release: number
  releaseZenkai: number
  card: string
  icon?: string
  extra?: boolean
  maxStats?: MaxStats
  mechanics?: string[]
  abilities?: { name: string; text: string }[]
  zAbility?: string
  zAbilityLevels?: { name: string; text: string }[]
  zenkaiAbilityLevels?: { name: string; text: string }[]
  zAbilityTags?: number[]
}

export interface MaxStats {
  hp?: number
  sa?: number
  ba?: number
  sd?: number
  bd?: number
}

export interface TagInfo {
  id: number
  name: string
}

export interface CharactersData {
  generatedAt: string
  gameDataVersion: string
  count: number
  characters: Character[]
  tags: TagInfo[]
  traits: TagInfo[]
  episodes: TagInfo[]
}

export interface StageEnemy {
  id: number | null
  name: string
  level: string
  stats: Record<string, string>
}

export interface Stage {
  n: number
  name: string
  meta: Record<string, number>
  enemies: StageEnemy[]
  drops: { name: string; count: string }[]
  challenges: { text: string; reward: { name: string; count: string } }[]
}

export interface EventDetail {
  title: string
  info: string
  stages: Stage[]
}

export interface GameEvent {
  id: number
  name: string
  img: string
  begin: number
  end: number
  perm: number
  status: string
  detail?: EventDetail
}

export interface EventsData {
  generatedAt: string
  gameDataVersion: string
  events: GameEvent[]
}

export interface BannerPoolUnit {
  id: number
  name: string
  element: Element
  rarity: Rarity
  card?: string
}

export interface BannerPool {
  title: string
  count: number | null
  rate: string
  units: BannerPoolUnit[]
}

export interface Banner {
  id: number
  type: number
  type_label: string
  name: string
  img: string
  begin: number
  end: number
  perm: number
  stepup: number
  status: string
  info?: string
  pools?: BannerPool[]
}

export interface BannersData {
  generatedAt: string
  gameDataVersion: string
  banners: Banner[]
}

export interface OwnedUnit {
  stars: number
  zenkai: number
}

export type Box = Record<string, OwnedUnit>

export interface SavedParty {
  name: string
  active: boolean
  members: number[]
}

export interface CajaFile {
  format: string
  generatedAt: string
  source: string
  romVersion: string
  playerName?: string
  player?: { name?: string; playerId?: string; friendCode?: string }
  units: Box
  equipment?: Record<string, OwnedEquipment>
  everOwnedEquipment?: number[]
  missions?: { groups: Record<string, MissionProgress> }
  parties: SavedParty[]
}

export interface AppData {
  characters: CharactersData
  events: EventsData
  banners: BannersData
  equipment: EquipmentData
  meta: MetaData
  missions: MissionsData
}

export interface MetaUnit {
  tier?: string
  rank?: number
  score?: number
  boost?: string
  new?: boolean
  zenkai?: boolean
}

export interface MetaData {
  generatedAt: string
  source: string
  lastUpdated: string
  tierOrder: string[]
  tiers: Record<string, MetaUnit>
  boost?: Record<string, unknown>
}

export interface MissionReward {
  name: string
  count: string
  href: string
  kind: string
}

export interface MissionGroup {
  id: number
  name: string
  img: string
  begin: number
  end: number
  perm: number
  count: number
  status: string
  facts?: Record<string, string>
  rewards?: MissionReward[]
}

export interface MissionProgress {
  completed: number | null
  total: number | null
  clearCount: number
  rewardsClaimed: number
  rewardsTotal: number
}

export interface MissionsData {
  generatedAt: string
  gameDataVersion: string
  missions: MissionGroup[]
}

export interface EquipmentSlot {
  n: number
  options: string[]
}

export interface EquipmentObtain {
  kind: string
  name: string
  href: string
  note: string
}

export interface RequirementAtom {
  kind: 'card' | 'element' | 'rarity' | 'tag' | 'name' | 'unknown'
  value: string | number
}

export interface EquipmentRequirements {
  any: { all: RequirementAtom[] }[]
}

export interface Equipment {
  id: number
  name: string
  rarity: number
  rarityLabel: string
  icon: string
  conditions: number[]
  conditionLabels: string[]
  exclusive: boolean
  awakenedFrom: number
  release: number
  desc?: string
  equippable?: string
  requirements?: EquipmentRequirements
  slots?: EquipmentSlot[]
  obtain?: EquipmentObtain[]
}

export interface EquipmentData {
  generatedAt: string
  gameDataVersion: string
  count: number
  rarityLabels: Record<string, string>
  conditions: Record<string, string>
  items: Equipment[]
}

export interface OwnedEquipment {
  count: number
  bestRank: number | null
  bestScore: number | null
}
