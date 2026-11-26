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
  extra?: boolean
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
  parties: SavedParty[]
}

export interface AppData {
  characters: CharactersData
  events: EventsData
  banners: BannersData
}
