import type {
  Banner,
  BannerPoolUnit,
  Box,
  Character,
  Element,
  Equipment,
  GameEvent,
  MetaData,
  MetaUnit,
  OwnedEquipment,
  OwnedUnit,
  Rarity,
  RequirementAtom,
  SavedParty,
  TagInfo
} from './types'
import { formatCountdown } from './data'

export const ELEMENT_LABEL: Record<Element, string> = {
  RED: 'Rojo',
  YEL: 'Amarillo',
  PUR: 'Morado',
  GRN: 'Verde',
  BLU: 'Azul',
  LGT: 'Claro',
  DRK: 'Oscuro'
}

export const ELEMENT_COUNTER: Record<Element, Element> = {
  RED: 'BLU',
  YEL: 'RED',
  PUR: 'YEL',
  GRN: 'PUR',
  BLU: 'GRN',
  LGT: 'LGT',
  DRK: 'DRK'
}

export const RARITY_LABEL: Record<Rarity, string> = {
  LEGEND: 'LEG',
  ULTRA: 'ULTRA',
  SPARKING: 'SP',
  EXTREME: 'EX',
  HERO: 'HE'
}

const RARITY_WEIGHT: Record<Rarity, number> = {
  LEGEND: 5,
  ULTRA: 4.5,
  SPARKING: 3,
  EXTREME: 2,
  HERO: 1
}

// Puntuación v2: stats + recencia + mecánicas + meta
const TIER_WEIGHT: Record<string, number> = { Z: 1, S: 0.8, A: 0.55, B: 0.3, C: 0.1 }
const STAT_SCALE = 500_000
const RELEASE_SCALE = 720

export function attackPower(character: Character): number {
  const stats = character.maxStats
  return (stats?.sa ?? 0) + (stats?.ba ?? 0)
}

export function tierOf(character: Character, meta?: MetaData): MetaUnit | undefined {
  return meta?.tiers?.[character.card]
}

function recencyFactor(character: Character): number {
  const effective = Math.max(character.release ?? -1, character.releaseZenkai ?? -1)
  if (effective < 0) return 0
  return Math.max(0, Math.min(1, effective / RELEASE_SCALE))
}

function statsFactor(character: Character): number {
  if (!character.maxStats) return 0.5
  return Math.max(0, Math.min(1, attackPower(character) / STAT_SCALE))
}

function tierFactor(character: Character, meta?: MetaData): number {
  const unit = tierOf(character, meta)
  if (!unit?.tier) return 0.4
  let value = TIER_WEIGHT[unit.tier] ?? 0.4
  if (unit.boost && ['Z', 'S', 'A'].includes(unit.boost)) value += 0.08
  return Math.min(1, value)
}

export interface ScoredUnit {
  character: Character
  owned: OwnedUnit
  score: number
}

export function unitScore(c: Character, o: OwnedUnit, meta?: MetaData): number {
  const rarity = RARITY_WEIGHT[c.rarity]
  const recency = recencyFactor(c)
  const mechanics = Math.min(1, (c.mechanics?.length ?? 0) / 4)
  return (
    rarity * 2.2 * (0.7 + 0.3 * recency) +
    statsFactor(c) * 2.0 +
    mechanics * 0.8 +
    tierFactor(c, meta) * 1.3 +
    Math.min(14, o.stars) * 0.1 +
    Math.min(7, o.zenkai) * 0.12 +
    (c.lf ? 0.15 : 0)
  )
}

export function ownedUnits(box: Box, characters: Character[], meta?: MetaData): ScoredUnit[] {
  const byId = new Map(characters.map((c) => [c.id, c]))
  const out: ScoredUnit[] = []
  for (const [id, owned] of Object.entries(box)) {
    const character = byId.get(Number(id))
    if (!character) continue
    out.push({ character, owned, score: unitScore(character, owned, meta) })
  }
  return out
}

// ---------------------------------------------------------------- equipos

export interface TagSynergy {
  id: number
  name: string
  count: number
}

export interface TeamPlan {
  tag: TagInfo
  score: number
  core: ScoredUnit[]
  bench: ScoredUnit[]
  synergies: TagSynergy[]
  elements: Element[]
  reasons: string[]
  missing: Character[]
  avgStars: number
  zenkaiCount: number
}

function overlap(a: TeamPlan, b: TeamPlan): number {
  const ids = new Set(a.core.concat(a.bench).map((u) => u.character.id))
  return b.core.concat(b.bench).filter((u) => ids.has(u.character.id)).length
}

function buildTeamPlan(
  tagId: number,
  tagNames: Map<number, string>,
  team: ScoredUnit[],
  characters: Character[],
  box: Box,
  meta?: MetaData
): TeamPlan {
  const tagName = tagNames.get(tagId) ?? `#${tagId}`
  const sorted = [...team].sort((a, b) => b.score - a.score)
  const core = sorted.slice(0, 3)

  // Banquillo: prioriza quien buffea al núcleo con su Habilidad Z
  const coreTags = new Set(core.flatMap((u) => u.character.tags))
  const bench = sorted
    .slice(3)
    .map((unit) => {
      const zHits = (unit.character.zAbilityTags ?? []).filter((t) => coreTags.has(t)).length
      return { unit, value: unit.score + zHits * 0.35 }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((x) => x.unit)
  const teamAll = [...core, ...bench]

  const shared = new Map<number, number>()
  for (const unit of teamAll) {
    for (const t of unit.character.tags) {
      if (t === tagId || !tagNames.has(t)) continue
      shared.set(t, (shared.get(t) ?? 0) + 1)
    }
  }

  const synergies = [...shared.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, count]) => ({ id, name: tagNames.get(id) ?? `#${id}`, count }))

  const elements = [...new Set(core.map((u) => u.character.element))]
  const zenkaiCount = teamAll.filter((u) => u.owned.zenkai >= 1).length
  const avgStars = teamAll.reduce((sum, u) => sum + u.owned.stars, 0) / Math.max(1, teamAll.length)

  const coreScore = core.reduce((s, u) => s + u.score, 0)
  const benchScore = bench.reduce((s, u) => s + u.score, 0)
  const synergyScore = synergies.slice(0, 3).reduce((s, x) => s + x.count, 0)
  const score =
    coreScore + benchScore * 0.55 + synergyScore * 0.4 + elements.length * 0.6 + (elements.length === 3 ? 0.8 : 0)

  const missing = characters
    .filter((c) => !c.extra && c.tags.includes(tagId) && !(String(c.id) in box))
    .sort(
      (a, b) =>
        tierFactor(b, meta) - tierFactor(a, meta) ||
        b.release - a.release ||
        RARITY_WEIGHT[b.rarity] - RARITY_WEIGHT[a.rarity]
    )
    .slice(0, 3)

  const reasons: string[] = [`6 unidades con el tag ${tagName}`]
  if (synergies.length) {
    reasons.push(`sinergia extra en ${synergies.slice(0, 2).map((s) => s.name).join(' y ')}`)
  }
  reasons.push(`elementos del núcleo: ${elements.map((e) => ELEMENT_LABEL[e]).join(', ')}`)
  const topTier = teamAll.filter((u) => ['Z', 'S'].includes(tierOf(u.character, meta)?.tier ?? '')).length
  if (topTier) reasons.push(`${topTier} en tier Z/S`)
  const modern = core.filter((u) => (u.character.mechanics?.length ?? 0) >= 2).length
  if (modern) reasons.push(`${modern} con mecánicas modernas`)
  if (zenkaiCount) reasons.push(`${zenkaiCount} con Zenkai`)
  if (missing.length) reasons.push(`te falta ${missing[0].name}`)

  return {
    tag: { id: tagId, name: tagName },
    score,
    core,
    bench,
    synergies,
    elements,
    reasons,
    missing,
    avgStars,
    zenkaiCount
  }
}

export function recommendTeams(
  characters: Character[],
  tags: TagInfo[],
  box: Box,
  meta?: MetaData,
  limit = 8
): TeamPlan[] {
  const owned = ownedUnits(box, characters, meta).filter((u) => !u.character.extra)
  const tagNames = new Map(tags.map((t) => [t.id, t.name]))
  const byTag = new Map<number, ScoredUnit[]>()
  for (const unit of owned) {
    for (const tagId of unit.character.tags) {
      if (!tagNames.has(tagId)) continue
      const list = byTag.get(tagId) ?? []
      list.push(unit)
      byTag.set(tagId, list)
    }
  }

  const candidates: TeamPlan[] = []
  for (const [tagId, units] of byTag) {
    if (units.length < 6) continue
    const sorted = [...units].sort((a, b) => b.score - a.score)
    candidates.push(buildTeamPlan(tagId, tagNames, sorted.slice(0, 6), characters, box, meta))
  }

  candidates.sort((a, b) => b.score - a.score)
  const picked: TeamPlan[] = []
  for (const team of candidates) {
    if (picked.some((p) => overlap(p, team) >= 4)) continue
    picked.push(team)
    if (picked.length >= limit) break
  }
  return picked
}

export function sharedTagCount(character: Character, team: ScoredUnit[]): number {
  const teamTags = new Set(team.flatMap((u) => u.character.tags))
  return character.tags.filter((t) => teamTags.has(t)).length
}

export function completeTeam(
  selection: number[],
  characters: Character[],
  tags: TagInfo[],
  box: Box,
  meta?: MetaData
): TeamPlan | null {
  const owned = ownedUnits(box, characters, meta)
  const ownedById = new Map(owned.map((u) => [u.character.id, u]))
  const charById = new Map(characters.map((c) => [c.id, c]))
  const selected = selection
    .map((id) => {
      const ownedUnit = ownedById.get(id)
      if (ownedUnit) return ownedUnit
      const character = charById.get(id)
      if (!character) return undefined
      const empty = { stars: 0, zenkai: 0 }
      return { character, owned: empty, score: unitScore(character, empty, meta) }
    })
    .filter(Boolean) as ScoredUnit[]
  if (!selected.length) return null

  const tagNames = new Map(tags.map((t) => [t.id, t.name]))
  const tagCounts = new Map<number, number>()
  for (const unit of selected) {
    for (const t of unit.character.tags) {
      if (!tagNames.has(t)) continue
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
  }
  const candidates = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  if (!candidates.length) return null

  let best: TeamPlan | null = null
  const selectedIds = new Set(selected.map((u) => u.character.id))

  for (const [tagId] of candidates) {
    const pool = owned.filter((u) => u.character.tags.includes(tagId) || selectedIds.has(u.character.id))
    const team: ScoredUnit[] = [...selected]
    while (team.length < 6) {
      let pick: ScoredUnit | null = null
      let bestGain = -Infinity
      for (const unit of pool) {
        if (team.some((t) => t.character.id === unit.character.id)) continue
        const shared = sharedTagCount(unit.character, team)
        const addsElement = !team.some((t) => t.character.element === unit.character.element)
        const gain = unit.score + shared * 0.9 + (addsElement ? 0.6 : 0)
        if (gain > bestGain) {
          bestGain = gain
          pick = unit
        }
      }
      if (!pick) break
      team.push(pick)
    }
    if (team.length < 6) continue
    const plan = buildTeamPlan(tagId, tagNames, team, characters, box, meta)
    if (!best || plan.score > best.score) best = plan
  }
  return best
}

export interface TeamChange {
  in: ScoredUnit
  out: ScoredUnit
}

export interface TeamImprovement {
  tag: TagInfo
  current: ScoredUnit[]
  proposed: ScoredUnit[]
  changes: TeamChange[]
  scoreDelta: number
  reasons: string[]
}

export function improveTeam(
  members: number[],
  characters: Character[],
  tags: TagInfo[],
  box: Box,
  meta?: MetaData
): TeamImprovement | null {
  const owned = ownedUnits(box, characters, meta)
  const byId = new Map(owned.map((u) => [u.character.id, u]))
  const current = members.map((id) => byId.get(id)).filter(Boolean) as ScoredUnit[]
  if (!current.length) return null

  const tagNames = new Map(tags.map((t) => [t.id, t.name]))
  const counts = new Map<number, number>()
  for (const unit of current) {
    for (const t of unit.character.tags) if (tagNames.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  const [tagId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  if (tagId === undefined) return null
  const tagName = tagNames.get(tagId) ?? `#${tagId}`

  const currentTeam = current.slice(0, 6)
  const currentPlan = buildTeamPlan(tagId, tagNames, currentTeam, characters, box, meta)

  // Candidatos del mismo tag que no están ya en el equipo
  const currentIds = new Set(currentTeam.map((u) => u.character.id))
  const candidates = owned
    .filter((u) => u.character.tags.includes(tagId) && !currentIds.has(u.character.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)

  // Búsqueda de cambios mínimos: sólo se aceptan sustituciones que suben la puntuación
  let working = [...currentTeam]
  let workingPlan = currentPlan
  const changes: TeamChange[] = []
  const maxSwaps = 3

  for (let step = 0; step < maxSwaps; step++) {
    let bestSwap: { incoming: ScoredUnit; outgoing: ScoredUnit; team: ScoredUnit[]; plan: TeamPlan } | null = null
    for (const incoming of candidates) {
      if (working.some((w) => w.character.id === incoming.character.id)) continue
      for (const outgoing of working) {
        const trial = working.map((w) => (w.character.id === outgoing.character.id ? incoming : w))
        const plan = buildTeamPlan(tagId, tagNames, trial, characters, box, meta)
        if (plan.score > workingPlan.score + 0.05 && (!bestSwap || plan.score > bestSwap.plan.score)) {
          bestSwap = { incoming, outgoing, team: trial, plan }
        }
      }
    }
    if (!bestSwap) break
    working = bestSwap.team
    workingPlan = bestSwap.plan
    changes.push({ in: bestSwap.incoming, out: bestSwap.outgoing })
  }

  return {
    tag: { id: tagId, name: tagName },
    current: currentTeam,
    proposed: working,
    changes,
    scoreDelta: workingPlan.score - currentPlan.score,
    reasons: workingPlan.reasons
  }
}

// ---------------------------------------------------------------- equipamiento

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function requirementAtomMatches(atom: RequirementAtom, character: Character): boolean {
  switch (atom.kind) {
    case 'card':
      return character.card.toLowerCase() === String(atom.value).toLowerCase()
    case 'element':
      return character.element === atom.value
    case 'rarity':
      return character.rarity === atom.value
    case 'tag':
      return character.tags.includes(Number(atom.value))
    case 'name':
      return normalizeText(character.name) === normalizeText(String(atom.value))
    default:
      return false
  }
}

export function equipmentUsableBy(equip: Equipment, character: Character): boolean {
  if (equip.requirements) {
    if (!equip.requirements.any.length) return true
    return equip.requirements.any.some((clause) =>
      clause.all.every((atom) => requirementAtomMatches(atom, character))
    )
  }

  // Compatibilidad con datos anteriores sin requisitos estructurados
  if (!equip.conditions.length) return true
  const name = normalizeText(character.name)
  const card = character.card.toLowerCase()
  return equip.conditions.some((id, index) => {
    const label = equip.conditionLabels[index] ?? ''
    if (!label) return false
    if (/^dbl/i.test(label)) return card === label.toLowerCase()
    if (id >= 50000 && id < 60000) return name === normalizeText(label)
    if (id >= 60000) return card === label.toLowerCase()
    return character.tags.includes(id)
  })
}

const EQUIP_RARITY_SCORE: Record<string, number> = {
  Platinum: 100,
  Unique: 85,
  Gold: 70,
  Silver: 45,
  Bronze: 30,
  Event: 55,
  Iron: 15
}

export type EquipRole = 'strike' | 'blast' | 'balanced'
export type EquipContext = 'core' | 'bench'
export type EquipMode = 'attack' | 'balanced'

export function equipRole(character: Character): EquipRole {
  const strike = character.maxStats?.sa ?? 0
  const blast = character.maxStats?.ba ?? 0
  if (!strike || !blast) return 'balanced'
  if (strike > blast * 1.08) return 'strike'
  if (blast > strike * 1.08) return 'blast'
  return 'balanced'
}

export const ROLE_LABEL: Record<EquipRole, string> = {
  strike: 'físico',
  blast: 'energía',
  balanced: 'mixto'
}

export interface ParsedEffect {
  name: string
  min: number
  max: number
}

const EFFECT_RE =
  /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñºª .+&-]{1,70}?)\s*([+-]?\d+(?:[.,]\d+)?)\s*%\s*(?:~\s*(\d+(?:[.,]\d+)?)\s*%)?/g

function toNumber(value: string | undefined): number {
  return value ? Number(value.replace(',', '.')) : 0
}

/** Extrae cada efecto con su rango de un texto de slot (puede haber varios en la misma línea). */
export function parseEffects(text: string): ParsedEffect[] {
  const out: ParsedEffect[] = []
  if (!text) return out
  const normalized = text.replace(/\r\n|\r|\n/g, ' | ')
  for (const chunk of normalized.split('|')) {
    const part = chunk.trim()
    if (!part) continue
    let matched = false
    EFFECT_RE.lastIndex = 0
    for (const match of part.matchAll(EFFECT_RE)) {
      const name = match[1].trim().replace(/[·]+$/, '').trim()
      if (!name || name.length < 3) continue
      out.push({ name, min: toNumber(match[2]), max: toNumber(match[3] ?? match[2]) })
      matched = true
    }
    if (!matched && part.length > 12) {
      out.push({ name: part.slice(0, 90), min: 0, max: 0 })
    }
  }
  return out
}

function effectWeight(name: string, role: EquipRole, context: EquipContext, mode: EquipMode): number {
  const n = name.toLowerCase()
  if (mode === 'balanced') {
    if (/daño infligido/.test(n)) return 1.15
    if (/ataque físico|ataque de energía/.test(n)) return context === 'bench' ? 0.75 : 0.9
    if (/salud/.test(n)) return context === 'bench' ? 1.15 : 1.0
    if (/defensa/.test(n)) return context === 'bench' ? 1.0 : 0.85
    if (/guardia de daño/.test(n)) return context === 'bench' ? 0.9 : 0.8
    if (/daño (especial|definitiva|de técnica)/.test(n)) return 0.95
    return 0.5
  }
  const benchPenalty = context === 'bench' ? 0.85 : 1
  if (/daño infligido/.test(n)) return 1.25 * benchPenalty
  if (/ataque físico/.test(n)) return (role === 'strike' ? 1.15 : role === 'blast' ? 0.7 : 1.0) * benchPenalty
  if (/ataque de energía/.test(n)) return (role === 'blast' ? 1.15 : role === 'strike' ? 0.7 : 1.0) * benchPenalty
  if (/daño (especial|definitiva|de técnica)/.test(n)) return context === 'core' ? 0.95 : 0.45
  if (/salud/.test(n)) return context === 'bench' ? 1.15 : 0.85
  if (/defensa/.test(n)) return context === 'bench' ? 1.0 : 0.6
  if (/guardia de daño/.test(n)) return context === 'bench' ? 0.9 : 0.7
  if (/ki|robo de cartas|tiempo de espera|crítico/.test(n)) return context === 'bench' ? 0.4 : 0.6
  return 0.35
}

function slotScore(text: string, role: EquipRole, context: EquipContext, mode: EquipMode): number {
  let total = 0
  for (const effect of parseEffects(text)) {
    if (effect.max === 0) {
      total += context === 'core' ? 0.8 : 0.6
      continue
    }
    total += Math.min(effect.max, 120) * effectWeight(effect.name, role, context, mode)
  }
  return total
}

export function equipmentScore(
  equip: Equipment,
  character: Character,
  context: EquipContext = 'core',
  mode: EquipMode = 'attack'
): number {
  const role = equipRole(character)
  const base = EQUIP_RARITY_SCORE[equip.rarityLabel] ?? 20
  let effects = 0
  for (const slot of equip.slots ?? []) {
    let best = 0
    for (const option of slot.options) best = Math.max(best, slotScore(option, role, context, mode))
    effects += Math.min(best, 90)
  }
  return base + effects * 0.5
}

export interface EquipmentHighlights {
  primary: string
  secondary: string
  slots: string[]
}

export function equipmentHighlights(
  equip: Equipment,
  character: Character,
  context: EquipContext = 'core',
  mode: EquipMode = 'attack'
): EquipmentHighlights {
  const role = equipRole(character)
  const slots: string[] = []
  const effects: { text: string; value: number }[] = []

  for (const slot of equip.slots ?? []) {
    let bestOption = ''
    let bestValue = -1
    for (const option of slot.options) {
      const value = slotScore(option, role, context, mode)
      if (value > bestValue) {
        bestValue = value
        bestOption = option
      }
    }
    if (bestValue > 0) slots.push(bestOption)
    for (const option of slot.options) {
      for (const effect of parseEffects(option)) {
        const value = effect.max * effectWeight(effect.name, role, context, mode)
        const range = effect.min && effect.min !== effect.max ? `${effect.min}–${effect.max}%` : `+${effect.max}%`
        effects.push({ text: `${effect.name} ${range}`, value })
      }
    }
  }

  effects.sort((a, b) => b.value - a.value)
  return {
    primary: effects[0]?.text ?? equip.desc ?? '',
    secondary: effects
      .slice(1, 3)
      .map((e) => e.text)
      .join(' · '),
    slots
  }
}

export interface EquipmentPick {
  equip: Equipment
  score: number
  owned: OwnedEquipment | null
}

export interface EquipmentRecommendation {
  character: Character
  role: EquipRole
  context: EquipContext
  owned: EquipmentPick[]
  best: EquipmentPick[]
}

export function recommendEquipment(
  character: Character,
  equipment: Equipment[],
  userEquipment: Record<string, OwnedEquipment>,
  options: { context?: EquipContext; mode?: EquipMode } = {}
): EquipmentRecommendation {
  const context = options.context ?? 'core'
  const mode = options.mode ?? 'attack'
  const usable = equipment
    .filter((e) => equipmentUsableBy(e, character))
    .map((e) => ({
      equip: e,
      score: equipmentScore(e, character, context, mode),
      owned: userEquipment[String(e.id)] ?? null
    }))
  const owned = usable.filter((p) => p.owned).sort((a, b) => b.score - a.score).slice(0, 3)
  const best = [...usable].sort((a, b) => b.score - a.score).slice(0, 3)
  return { character, role: equipRole(character), context, owned, best }
}

export function teamEquipment(
  team: TeamPlan,
  equipment: Equipment[],
  userEquipment: Record<string, OwnedEquipment>,
  mode: EquipMode = 'attack'
): EquipmentRecommendation[] {
  return [
    ...team.core.map((u) => recommendEquipment(u.character, equipment, userEquipment, { context: 'core', mode })),
    ...team.bench.map((u) => recommendEquipment(u.character, equipment, userEquipment, { context: 'bench', mode }))
  ]
}


export interface PartyPlan {
  name: string
  active: boolean
  members: ScoredUnit[]
  avgScore: number
  elements: Element[]
  sharedTags: TagSynergy[]
}

export function analyzeSavedParties(
  parties: SavedParty[],
  characters: Character[],
  tags: TagInfo[],
  box: Box,
  meta?: MetaData
): PartyPlan[] {
  const byId = new Map(characters.map((c) => [c.id, c]))
  const tagNames = new Map(tags.map((t) => [t.id, t.name]))
  return parties.map((party) => {
    const members: ScoredUnit[] = []
    for (const id of party.members) {
      const character = byId.get(id)
      if (!character) continue
      const owned = box[String(id)] ?? { stars: 0, zenkai: 0 }
      members.push({ character, owned, score: unitScore(character, owned, meta) })
    }
    const counts = new Map<number, number>()
    for (const m of members) for (const t of m.character.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    const sharedTags = [...counts.entries()]
      .filter(([id]) => tagNames.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id, count]) => ({ id, name: tagNames.get(id) ?? `#${id}`, count }))
    return {
      name: party.name,
      active: party.active,
      members,
      avgScore: members.length ? members.reduce((s, m) => s + m.score, 0) / members.length : 0,
      elements: [...new Set(members.map((m) => m.character.element))],
      sharedTags
    }
  })
}

// ---------------------------------------------------------------- actos

export interface EventPlan {
  event: GameEvent
  priority: number
  urgency: 'alta' | 'media' | 'baja'
  hoursLeft: number | null
  startsIn: number | null
  stageCount: number
  enemyElements: { element: Element; count: number }[]
  suggested: ScoredUnit[]
  suggestions: string[]
  rewards: string[]
}

const ITEM_VALUE: [RegExp, number][] = [
  [/chrono|cristal/i, 18],
  [/z power|multi-z/i, 14],
  [/legends ticket|ticket/i, 10],
  [/energy|energía/i, 6],
  [/medal|medalla/i, 5],
  [/equip/i, 5],
  [/skip/i, 3],
  [/zeni/i, 2]
]

function itemValue(name: string): number {
  for (const [re, value] of ITEM_VALUE) if (re.test(name)) return value
  return 1
}

export function planEvents(events: GameEvent[], characters: Character[], box: Box, now = Date.now()): EventPlan[] {
  const byId = new Map(characters.map((c) => [c.id, c]))
  const owned = ownedUnits(box, characters)
  const nowSec = Math.floor(now / 1000)
  const plans: EventPlan[] = []

  for (const event of events) {
    if (event.status === 'ended') continue
    const detail = event.detail
    const stages = detail?.stages ?? []
    const hoursLeft = event.end ? (event.end - nowSec) / 3600 : null
    const startsIn = event.begin > nowSec ? (event.begin - nowSec) / 3600 : null

    let urgency: EventPlan['urgency'] = 'baja'
    let urgencyScore = 0
    if (hoursLeft !== null) {
      if (hoursLeft <= 24) {
        urgency = 'alta'
        urgencyScore = 3
      } else if (hoursLeft <= 72) {
        urgency = 'media'
        urgencyScore = 2
      } else if (hoursLeft <= 168) {
        urgency = 'media'
        urgencyScore = 1
      }
    }
    if (startsIn !== null && startsIn <= 72) urgencyScore += 1

    const rewards = new Set<string>()
    for (const stage of stages) {
      for (const drop of stage.drops) rewards.add(drop.name.replace(/^×\d+\s*/, ''))
      for (const ch of stage.challenges) if (ch.reward.name) rewards.add(ch.reward.name.replace(/^×\d+\s*/, ''))
    }
    const rewardList = [...rewards].filter((r) => r && !/^\d+$/.test(r))
    const rewardValue = rewardList.reduce((sum, r) => sum + itemValue(r), 0)

    const elementCounts = new Map<Element, number>()
    for (const stage of stages) {
      for (const enemy of stage.enemies) {
        const ch = enemy.id != null ? byId.get(enemy.id) : undefined
        if (!ch) continue
        elementCounts.set(ch.element, (elementCounts.get(ch.element) ?? 0) + 1)
      }
    }
    const enemyElements = [...elementCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([element, count]) => ({ element, count }))

    const suggested: ScoredUnit[] = []
    const suggestions: string[] = []
    for (const { element } of enemyElements.slice(0, 2)) {
      const counter = ELEMENT_COUNTER[element]
      const picks = owned
        .filter((u) => u.character.element === counter)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
      if (picks.length) {
        suggested.push(...picks)
        suggestions.push(`Contra ${ELEMENT_LABEL[element]}: ${picks.map((p) => p.character.name).join(', ')}`)
      }
    }
    if (suggested.length) {
      const ids = new Set(suggested.map((u) => u.character.id))
      const sharedTags = new Set(suggested.flatMap((u) => u.character.tags))
      const bench = owned
        .filter((u) => !ids.has(u.character.id) && u.character.tags.some((t) => sharedTags.has(t)))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
      suggested.push(...bench)
      if (bench.length) suggestions.push(`Banquillo por sinergia: ${bench.map((b) => b.character.name).join(', ')}`)
    }

    const priority =
      urgencyScore * (rewardValue >= 12 ? 20 : 12) +
      rewardValue +
      (stages.length ? 5 : 0) +
      (/zenkai/i.test(event.name) ? 5 : 0) +
      (/raid|co-op|multiverso/i.test(event.name) ? 4 : 0)

    plans.push({
      event,
      priority,
      urgency,
      hoursLeft,
      startsIn,
      stageCount: stages.length,
      enemyElements,
      suggested,
      suggestions,
      rewards: rewardList.slice(0, 6)
    })
  }

  return plans.sort((a, b) => {
    const aUpcoming = a.event.status === 'upcoming' ? 1 : 0
    const bUpcoming = b.event.status === 'upcoming' ? 1 : 0
    return aUpcoming - bUpcoming || b.priority - a.priority
  })
}

export function eventCountdown(plan: EventPlan): string {
  if (plan.event.status === 'upcoming' && plan.event.begin) {
    return `empieza en ${formatCountdown(plan.event.begin * 1000 - Date.now())}`
  }
  if (!plan.event.end) return 'sin fecha de fin'
  return `termina en ${formatCountdown(plan.event.end * 1000 - Date.now())}`
}

// ---------------------------------------------------------------- invocaciones

export interface BannerPlan {
  banner: Banner
  featured: { unit: BannerPoolUnit; owned: boolean }[]
  missing: BannerPoolUnit[]
  verdict: 'TIRAR' | 'CONSIDERAR' | 'AHORRA' | 'TICKETS'
  reason: string
  score: number
}

const FEATURED_WEIGHT: Record<string, number> = { LEGEND: 3, ULTRA: 3, SPARKING: 1, EXTREME: 0.4, HERO: 0.1 }

export function planBanners(banners: Banner[], box: Box): BannerPlan[] {
  const plans = banners.map((banner) => {
    const seen = new Map<number, BannerPoolUnit>()
    for (const pool of banner.pools ?? []) for (const unit of pool.units) if (!seen.has(unit.id)) seen.set(unit.id, unit)
    const featured = [...seen.values()].map((unit) => ({ unit, owned: String(unit.id) in box }))
    const missing = featured.filter((f) => !f.owned).map((f) => f.unit)
    const score = missing.reduce((sum, u) => sum + (FEATURED_WEIGHT[u.rarity] ?? 0), 0) / Math.max(1, featured.length)

    let verdict: BannerPlan['verdict'] = 'AHORRA'
    let reason = ''
    if (banner.type_label === 'Ticket') {
      verdict = 'TICKETS'
      reason = 'Es una invocación con tickets: si tienes tickets, úsalos; no gastan cristales.'
    } else if (!missing.length) {
      verdict = 'AHORRA'
      reason = 'Ya tienes todas las unidades destacadas: no aporta nada nuevo a tu caja.'
    } else if (score >= 1.5) {
      verdict = 'TIRAR'
      reason = `Te faltan ${missing.length} destacadas, varias de alto valor. Es de las mejores para tu caja.`
    } else if (score >= 0.7) {
      verdict = 'CONSIDERAR'
      reason = `Te faltan ${missing.length} destacadas (${missing.slice(0, 2).map((u) => u.name).join(', ')}). Útil, pero sin urgencia.`
    } else {
      verdict = 'AHORRA'
      reason = 'Casi todo lo destacado ya está en tu caja: guarda cristales.'
    }

    if (banner.type_label !== 'Ticket' && missing.some((u) => u.rarity === 'LEGEND' || u.rarity === 'ULTRA') && verdict === 'AHORRA') {
      verdict = 'CONSIDERAR'
      reason = `Te falta ${missing.filter((u) => u.rarity === 'LEGEND' || u.rarity === 'ULTRA').map((u) => u.name).join(', ')}; valora si te interesa esa unidad.`
    }

    return { banner, featured, missing, verdict, reason, score }
  })

  const order = { TIRAR: 0, CONSIDERAR: 1, TICKETS: 2, AHORRA: 3 } as const
  return plans.sort((a, b) => order[a.verdict] - order[b.verdict] || b.score - a.score)
}

// ---------------------------------------------------------------- guías

export interface AbilityBonus {
  total: number
  byStat: Record<string, number>
  givers: { name: string; value: number }[]
}

interface ZClause {
  tags: number[]
  stat: string
  value: number
}

const Z_LEVEL_STARS = [3, 6, 14]

const STAT_PATTERNS: [RegExp, string][] = [
  [/salud/i, 'Salud'],
  [/ataque físico/i, 'Ataque físico'],
  [/ataque de energía/i, 'Ataque de energía'],
  [/defensa física/i, 'Defensa física'],
  [/defensa de energía/i, 'Defensa de energía'],
  [/daño infligido/i, 'Daño'],
  [/guardia de daño/i, 'Guardia'],
  [/recuperación|ki|crítico|velocidad de robo/i, 'Utilidad']
]

export function zAbilityLevelFor(stars: number): number {
  if (stars >= Z_LEVEL_STARS[2]) return 3
  if (stars >= Z_LEVEL_STARS[1]) return 2
  if (stars >= Z_LEVEL_STARS[0]) return 1
  return 0
}

function resolveTagIds(fragment: string, lookup: Map<string, number>): number[] {
  const cleaned = fragment.replace(/\{\{ICN:[^}]+\}\}/g, ' ')
  const ids: number[] = []
  for (const part of cleaned.split(/,| o | y |\//i)) {
    const name = normalizeText(part)
    if (!name) continue
    let id = lookup.get(name)
    if (id === undefined) {
      for (const [knownName, knownId] of lookup) {
        if (knownName.length >= 4 && name.includes(knownName)) {
          id = knownId
          break
        }
      }
    }
    if (id !== undefined && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function parseZAbilityText(text: string, lookup: Map<string, number>): ZClause[] {
  const clauses: ZClause[] = []
  let currentTags: number[] = []

  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.includes('{{ICN:')) {
      const withoutIcons = line.replace(/\{\{ICN:[^}]+\}\}/g, ' ')
      const conditionPart = withoutIcons.split(':')[0]
      currentTags = resolveTagIds(conditionPart, lookup)
    } else {
      const etiqueta = line.match(/para etiqueta ([^\n·]+)/i)
      if (etiqueta) currentTags = resolveTagIds(etiqueta[1], lookup)
    }
    const match = line.match(/([^+·\d][^+·]*?)\s*\+([\d.]+)\s*%/)
    if (!match) continue
    const statName = match[1].trim()
    const stat = STAT_PATTERNS.find(([re]) => re.test(statName))?.[1]
    if (stat) clauses.push({ tags: [...currentTags], stat, value: Number(match[2]) })
  }
  return clauses
}

export function abilityBonus(
  team: TeamPlan,
  characters: Character[],
  tagNames: TagInfo[]
): AbilityBonus {
  const lookup = new Map<string, number>()
  for (const tag of tagNames) lookup.set(normalizeText(tag.name), tag.id)

  const scored = [...team.core, ...team.bench]
  const members = scored.map((u) => u.character)
  const leader = team.core[0]?.character
  const coreIds = new Set(team.core.map((u) => u.character.id))

  const byStat: Record<string, number> = {}
  const giverTotals = new Map<string, number>()
  let total = 0

  for (const giver of scored) {
    const levels = giver.character.zAbilityLevels ?? []
    const levelIndex = Math.min(zAbilityLevelFor(giver.owned.stars), Math.max(0, levels.length - 1))
    const baseText = levels[levelIndex]?.text ?? ''
    const zenkaiLevels = giver.character.zenkaiAbilityLevels ?? []
    const zenkaiText =
      giver.owned.zenkai > 0 && zenkaiLevels.length
        ? zenkaiLevels[Math.min(giver.owned.zenkai - 1, zenkaiLevels.length - 1)]?.text ?? ''
        : ''

    const clauses = [
      ...parseZAbilityText(baseText, lookup),
      ...parseZAbilityText(zenkaiText, lookup)
    ]

    for (const clause of clauses) {
      for (const receiver of members) {
        const isLeaderReceiver = receiver.id === leader?.id
        const leaderGift = giver.character.id === leader?.id && coreIds.has(receiver.id)
        const applies =
          clause.tags.length === 0 ||
          isLeaderReceiver ||
          leaderGift ||
          clause.tags.some((t) => receiver.tags.includes(t))
        if (!applies) continue
        total += clause.value
        byStat[clause.stat] = (byStat[clause.stat] ?? 0) + clause.value
        giverTotals.set(giver.character.name, (giverTotals.get(giver.character.name) ?? 0) + clause.value)
      }
    }
  }

  const givers = [...giverTotals.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => b.value - a.value)

  return { total: Math.round(total * 10) / 10, byStat, givers }
}

export interface PlanAction {
  kind: 'stars' | 'zenkai' | 'missing'
  title: string
  detail: string
  href?: string
}

export function buildPlan(
  teams: TeamPlan[],
  parties: PartyPlan[],
  characters: Character[],
  box: Box,
  banners: Banner[],
  meta?: MetaData
): PlanAction[] {
  const actions: PlanAction[] = []
  const seen = new Set<number>()
  const pool: { unit: ScoredUnit; teamTag: string }[] = []

  for (const team of teams.slice(0, 3)) {
    for (const unit of [...team.core, ...team.bench]) {
      if (seen.has(unit.character.id)) continue
      seen.add(unit.character.id)
      pool.push({ unit, teamTag: team.tag.name })
    }
  }
  for (const party of parties) {
    for (const unit of party.members) {
      if (seen.has(unit.character.id)) continue
      seen.add(unit.character.id)
      pool.push({ unit, teamTag: party.name })
    }
  }

  // Subir estrellas de las unidades con más impacto
  const upgrades = pool
    .filter((u) => u.unit.owned.stars < 14 && u.unit.character.rarity !== 'HERO')
    .sort(
      (a, b) =>
        b.unit.score * (14 - b.unit.owned.stars) - a.unit.score * (14 - a.unit.owned.stars)
    )
    .slice(0, 3)
  for (const { unit, teamTag } of upgrades) {
    actions.push({
      kind: 'stars',
      title: `Sube estrellas: ${unit.character.name}`,
      detail: `Está a ${unit.owned.stars}★ en "${teamTag}". Farmea su Z Power (Multi-Z Power o su evento) para acercarla a 14★ sin gastar cristales.`
    })
  }

  // Zenkai disponibles sin despertar
  const zenkais = pool
    .filter((u) => u.unit.character.zenkai && u.unit.owned.zenkai === 0)
    .sort((a, b) => b.unit.score - a.unit.score)
    .slice(0, 2)
  for (const { unit } of zenkais) {
    actions.push({
      kind: 'zenkai',
      title: `Despierta el Zenkai de ${unit.character.name}`,
      detail: 'Tiene Zenkai disponible y lo llevas sin despertar. Con su Rush ZENKAI gana un salto grande de poder.'
    })
  }

  // Faltantes de tus equipos que se pueden conseguir ahora
  const bannersWith = (card: string) =>
    banners.find((b) => b.pools?.some((p) => p.units.some((u) => u.card === card)))
  const missingPool: { character: Character; tag: string }[] = []
  const topTags = teams.slice(0, 2).map((t) => t.tag)
  for (const tag of topTags) {
    for (const character of characters) {
      if (character.extra || !character.tags.includes(tag.id)) continue
      if (String(character.id) in box) continue
      missingPool.push({ character, tag: tag.name })
    }
  }
  const missingSorted = missingPool
    .sort(
      (a, b) =>
        tierFactor(b.character, meta) - tierFactor(a.character, meta) ||
        b.character.release - a.character.release
    )
    .slice(0, 2)
  for (const { character, tag } of missingSorted) {
    const banner = bannersWith(character.card)
    actions.push({
      kind: 'missing',
      title: `Objetivo: ${character.name}`,
      detail: banner
        ? `Encaja en "${tag}" y está destacado en "${banner.name}".`
        : `Encaja en "${tag}" y todavía no está en banners activos. Guárdalo como objetivo.`
    })
  }

  return actions.slice(0, 6)
}

export interface MetaGap {
  card: string
  tier?: string
  name: string
  characterId?: number
  source?: string
}

export interface MetaCoverage {
  total: number
  owned: number
  gaps: MetaGap[]
}

export function metaCoverage(
  characters: Character[],
  box: Box,
  meta: MetaData,
  banners: Banner[],
  tiers: string[] = ['Z']
): MetaCoverage {
  const byCard = new Map(characters.map((c) => [c.card.toLowerCase(), c]))
  const entries = Object.entries(meta.tiers).filter(([, unit]) => unit.tier && tiers.includes(unit.tier))
  let owned = 0
  const gaps: MetaGap[] = []

  for (const [card, unit] of entries) {
    const character = byCard.get(card.toLowerCase())
    if (character && String(character.id) in box) {
      owned++
      continue
    }
    const banner = banners.find((b) => b.pools?.some((p) => p.units.some((u) => u.card === card)))
    gaps.push({
      card,
      tier: unit.tier,
      name: character?.name ?? card,
      characterId: character?.id,
      source: banner?.name
    })
  }

  gaps.sort((a, b) => (meta.tiers[a.card]?.rank ?? 999) - (meta.tiers[b.card]?.rank ?? 999))
  return { total: entries.length, owned, gaps }
}

export interface Tip {
  kind: 'equipo' | 'acto' | 'invocacion' | 'caja'
  title: string
  body: string
}

export function buildTips(
  teams: TeamPlan[],
  events: EventPlan[],
  banners: BannerPlan[],
  parties: PartyPlan[],
  box: Box,
  totalCharacters: number
): Tip[] {
  const tips: Tip[] = []
  const owned = Object.keys(box).length

  if (teams[0]) {
    const t = teams[0]
    tips.push({
      kind: 'equipo',
      title: `Tu equipo más fuerte: ${t.tag.name}`,
      body: `Núcleo ${t.core.map((u) => `${u.character.name} (${u.owned.stars}★)`).join(' · ')}. ${t.reasons.join('; ')}.`
    })
  }

  const urgent = events.find((e) => e.urgency === 'alta' && e.event.status === 'active')
  if (urgent) {
    tips.push({
      kind: 'acto',
      title: `Prioridad: ${urgent.event.name}`,
      body: `${eventCountdown(urgent)}. ${urgent.suggestions[0] ?? 'Completa las etapas con tu mejor equipo antes de que cierre.'}`
    })
  }

  const bestBanner = banners.find((b) => b.verdict === 'TIRAR') ?? banners.find((b) => b.verdict === 'CONSIDERAR')
  if (bestBanner) {
    tips.push({ kind: 'invocacion', title: `${bestBanner.verdict}: ${bestBanner.banner.name}`, body: bestBanner.reason })
  }

  tips.push({
    kind: 'caja',
    title: `Caja: ${owned}/${totalCharacters} personajes`,
    body:
      owned / totalCharacters > 0.8
        ? 'Tienes casi todo el roster: prioriza Zenkai Awakenings y equipos con sinergia sobre nuevas invocaciones.'
        : 'Aún te falta roster: las invocaciones con unidades ULTRA/LEGEND nuevas tienen más valor para ti.'
  })

  const weakLink = parties
    .flatMap((p) => p.members)
    .filter((m) => m.owned.stars < 14 && m.character.rarity !== 'HERO')
    .sort((a, b) => a.owned.stars - b.owned.stars)[0]
  if (weakLink) {
    tips.push({
      kind: 'caja',
      title: `Sube estrellas: ${weakLink.character.name}`,
      body: `Está a ${weakLink.owned.stars}★ en uno de tus equipos guardados. Farmear su Z Power (Multi-Z Power o su evento) mejora ese equipo sin gastar cristales.`
    })
  }

  return tips
}
