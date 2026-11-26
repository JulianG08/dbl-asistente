import type { Banner, BannerPoolUnit, Box, Character, Element, GameEvent, OwnedUnit, Rarity, SavedParty, TagInfo } from './types'
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
    const core = sorted.slice(0, 3)
    const bench = sorted.slice(3, 6)
    const team = [...core, ...bench]

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
    const avgStars = team.reduce((sum, u) => sum + u.owned.stars, 0) / team.length

    const coreScore = core.reduce((s, u) => s + u.score, 0)
    const benchScore = bench.reduce((s, u) => s + u.score, 0)
    const synergyScore = synergies.slice(0, 3).reduce((s, x) => s + x.count, 0)
    const score =
      coreScore + benchScore * 0.55 + synergyScore * 0.4 + elements.length * 0.6 + (elements.length === 3 ? 0.8 : 0)

    const missing = characters
      .filter((c) => !c.extra && c.tags.includes(tagId) && !(String(c.id) in box))
      .sort((a, b) => b.release - a.release || RARITY_WEIGHT[b.rarity] - RARITY_WEIGHT[a.rarity])
      .slice(0, 3)

    const reasons: string[] = [`6 unidades con el tag ${tagNames.get(tagId)}`]
    if (synergies.length) {
      reasons.push(`sinergia extra en ${synergies.slice(0, 2).map((s) => s.name).join(' y ')}`)
    }
    reasons.push(`elementos del núcleo: ${elements.map((e) => ELEMENT_LABEL[e]).join(', ')}`)
    if (zenkaiCount) reasons.push(`${zenkaiCount} con Zenkai`)
    if (missing.length) reasons.push(`te falta ${missing[0].name}`)

    candidates.push({
      tag: { id: tagId, name: tagNames.get(tagId) ?? `#${tagId}` },
      score,
      core,
      bench,
      synergies,
      elements,
      reasons,
      missing,
      avgStars,
      zenkaiCount
    })
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
