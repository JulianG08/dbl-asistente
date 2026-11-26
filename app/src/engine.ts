import type {
  Banner,
  BannerPoolUnit,
  Box,
  Character,
  Element,
  Equipment,
  GameEvent,
  OwnedEquipment,
  OwnedUnit,
  Rarity,
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

export interface ScoredUnit {
  character: Character
  owned: OwnedUnit
  score: number
}

export function unitScore(c: Character, o: OwnedUnit): number {
  return (
    RARITY_WEIGHT[c.rarity] +
    Math.min(14, o.stars) * 0.12 +
    Math.min(7, o.zenkai) * 0.15 +
    (c.lf ? 0.2 : 0)
  )
}

export function ownedUnits(box: Box, characters: Character[]): ScoredUnit[] {
  const byId = new Map(characters.map((c) => [c.id, c]))
  const out: ScoredUnit[] = []
  for (const [id, owned] of Object.entries(box)) {
    const character = byId.get(Number(id))
    if (!character) continue
    out.push({ character, owned, score: unitScore(character, owned) })
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
  box: Box
): TeamPlan {
  const tagName = tagNames.get(tagId) ?? `#${tagId}`
  const sorted = [...team].sort((a, b) => b.score - a.score)
  const core = sorted.slice(0, 3)
  const bench = sorted.slice(3, 6)

  const shared = new Map<number, number>()
  for (const unit of team) {
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
  const zenkaiCount = team.filter((u) => u.owned.zenkai >= 1).length
  const avgStars = team.reduce((sum, u) => sum + u.owned.stars, 0) / Math.max(1, team.length)

  const coreScore = core.reduce((s, u) => s + u.score, 0)
  const benchScore = bench.reduce((s, u) => s + u.score, 0)
  const synergyScore = synergies.slice(0, 3).reduce((s, x) => s + x.count, 0)
  const score =
    coreScore + benchScore * 0.55 + synergyScore * 0.4 + elements.length * 0.6 + (elements.length === 3 ? 0.8 : 0)

  const missing = characters
    .filter((c) => !c.extra && c.tags.includes(tagId) && !(String(c.id) in box))
    .sort((a, b) => b.release - a.release || RARITY_WEIGHT[b.rarity] - RARITY_WEIGHT[a.rarity])
    .slice(0, 3)

  const reasons: string[] = [`6 unidades con el tag ${tagName}`]
  if (synergies.length) {
    reasons.push(`sinergia extra en ${synergies.slice(0, 2).map((s) => s.name).join(' y ')}`)
  }
  reasons.push(`elementos del núcleo: ${elements.map((e) => ELEMENT_LABEL[e]).join(', ')}`)
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

export function recommendTeams(characters: Character[], tags: TagInfo[], box: Box, limit = 8): TeamPlan[] {
  const owned = ownedUnits(box, characters).filter((u) => !u.character.extra)
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
    candidates.push(buildTeamPlan(tagId, tagNames, sorted.slice(0, 6), characters, box))
  }

  candidates.sort((a, b) => b.score - a.score)
  const picked: TeamPlan[] = []
  for (const team of candidates) {
    if (picked.some((p) => overlap(p, team) >= 5)) continue
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
  box: Box
): TeamPlan | null {
  const owned = ownedUnits(box, characters)
  const ownedById = new Map(owned.map((u) => [u.character.id, u]))
  const charById = new Map(characters.map((c) => [c.id, c]))
  const selected = selection
    .map((id) => {
      const ownedUnit = ownedById.get(id)
      if (ownedUnit) return ownedUnit
      const character = charById.get(id)
      if (!character) return undefined
      const empty = { stars: 0, zenkai: 0 }
      return { character, owned: empty, score: unitScore(character, empty) }
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
    const plan = buildTeamPlan(tagId, tagNames, team, characters, box)
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
  box: Box
): TeamImprovement | null {
  const owned = ownedUnits(box, characters)
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
  const currentPlan = buildTeamPlan(tagId, tagNames, currentTeam, characters, box)

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
        const plan = buildTeamPlan(tagId, tagNames, trial, characters, box)
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

const EQUIP_RARITY_SCORE: Record<string, number> = {
  Platinum: 100,
  Unique: 85,
  Gold: 70,
  Silver: 45,
  Bronze: 30,
  Event: 55,
  Iron: 15
}

const EFFECT_WEIGHTS: [RegExp, number][] = [
  [/daño infligido/i, 1.1],
  [/salud/i, 1.0],
  [/ataque físico|ataque de energía/i, 1.0],
  [/guardia de daño/i, 0.9],
  [/defensa física|defensa de energía/i, 0.8],
  [/daño recibido/i, 0.7],
  [/crítico/i, 0.4],
  [/ki/i, 0.3]
]

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function equipmentUsableBy(equip: Equipment, character: Character): boolean {
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

function effectScore(text: string): number {
  let total = 0
  for (const line of text.split(/\n|\|/)) {
    const clean = line.trim()
    if (!clean) continue
    const nums = [...clean.matchAll(/([\d.]+)\s*%/g)].map((m) => Number(m[1]))
    if (!nums.length) {
      if (clean.length > 14) total += 1.2
      continue
    }
    const max = Math.max(...nums)
    let weight = 0.35
    for (const [re, w] of EFFECT_WEIGHTS) {
      if (re.test(clean)) {
        weight = w
        break
      }
    }
    total += Math.min(max, 150) * weight
  }
  return total
}

export function equipmentScore(equip: Equipment): number {
  const base = EQUIP_RARITY_SCORE[equip.rarityLabel] ?? 20
  let effects = 0
  for (const slot of equip.slots ?? []) {
    let best = 0
    for (const option of slot.options) best = Math.max(best, effectScore(option))
    effects += Math.min(best, 70)
  }
  return base + effects * 0.5
}

export interface EquipmentPick {
  equip: Equipment
  score: number
  owned: OwnedEquipment | null
}

export interface EquipmentRecommendation {
  character: Character
  owned: EquipmentPick[]
  best: EquipmentPick[]
}

export function recommendEquipment(
  character: Character,
  equipment: Equipment[],
  userEquipment: Record<string, OwnedEquipment>
): EquipmentRecommendation {
  const usable = equipment
    .filter((e) => equipmentUsableBy(e, character))
    .map((e) => ({ equip: e, score: equipmentScore(e), owned: userEquipment[String(e.id)] ?? null }))
  const owned = usable.filter((p) => p.owned).sort((a, b) => b.score - a.score).slice(0, 3)
  const best = [...usable].sort((a, b) => b.score - a.score).slice(0, 3)
  return { character, owned, best }
}

export function teamEquipment(
  team: TeamPlan,
  equipment: Equipment[],
  userEquipment: Record<string, OwnedEquipment>
): EquipmentRecommendation[] {
  return team.core.concat(team.bench).map((u) => recommendEquipment(u.character, equipment, userEquipment))
}


export interface PartyPlan {
  name: string
  active: boolean
  members: ScoredUnit[]
  avgScore: number
  elements: Element[]
  sharedTags: TagSynergy[]
}

export function analyzeSavedParties(parties: SavedParty[], characters: Character[], tags: TagInfo[], box: Box): PartyPlan[] {
  const byId = new Map(characters.map((c) => [c.id, c]))
  const tagNames = new Map(tags.map((t) => [t.id, t.name]))
  return parties.map((party) => {
    const members: ScoredUnit[] = []
    for (const id of party.members) {
      const character = byId.get(id)
      if (!character) continue
      const owned = box[String(id)] ?? { stars: 0, zenkai: 0 }
      members.push({ character, owned, score: unitScore(character, owned) })
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
