import { describe, expect, it } from 'vitest'
import type { Banner, Box, Character, Equipment, GameEvent } from './types'
import { completeTeam, equipmentUsableBy, improveTeam, planBanners, planEvents, recommendEquipment, recommendTeams } from './engine'

function makeChar(id: number, tags: number[], rarity: Character['rarity'] = 'SPARKING', element: Character['element'] = 'RED'): Character {
  return {
    id,
    name: `Unidad ${id}`,
    form: '',
    element,
    rarity,
    zenkai: false,
    lf: false,
    tags,
    release: id,
    releaseZenkai: id,
    card: `DBL${id}`
  }
}

const tags = [
  { id: 1, name: 'Saiyajin' },
  { id: 2, name: 'Familia Son' },
  { id: 3, name: 'Fusión' }
]

function boxOf(ids: number[], stars = 14): Box {
  const box: Box = {}
  for (const id of ids) box[String(id)] = { stars, zenkai: 0 }
  return box
}

describe('recommendTeams', () => {
  it('propone equipos del tag con 6 o más unidades', () => {
    const characters = Array.from({ length: 8 }, (_, i) => makeChar(i + 1, [1, i % 2 ? 2 : 3]))
    const teams = recommendTeams(characters, tags, boxOf([1, 2, 3, 4, 5, 6]))
    expect(teams.length).toBeGreaterThan(0)
    expect(teams[0].core).toHaveLength(3)
    expect(teams[0].bench).toHaveLength(3)
  })

  it('no propone equipos de tags con menos de 6 unidades', () => {
    const characters = [makeChar(1, [1]), makeChar(2, [1]), makeChar(3, [1])]
    const teams = recommendTeams(characters, tags, boxOf([1, 2, 3]))
    expect(teams).toHaveLength(0)
  })

  it('ignora unidades que no están en la caja', () => {
    const characters = Array.from({ length: 8 }, (_, i) => makeChar(i + 1, [1]))
    const teams = recommendTeams(characters, tags, boxOf([1, 2, 3, 4, 5]))
    expect(teams).toHaveLength(0)
  })
})

describe('planEvents', () => {
  it('prioriza actos que terminan antes', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const events: GameEvent[] = [
      { id: 1, name: 'Largo', img: '', begin: nowSec - 100, end: nowSec + 30 * 86400, perm: 0, status: 'active' },
      { id: 2, name: 'Corto', img: '', begin: nowSec - 100, end: nowSec + 3600, perm: 0, status: 'active' }
    ]
    const plans = planEvents(events, [], {}, Date.now())
    expect(plans[0].event.id).toBe(2)
    expect(plans[0].urgency).toBe('alta')
  })
})

describe('planBanners', () => {
  const banner = (id: number, units: { id: number; rarity: Character['rarity'] }[]): Banner => ({
    id,
    type: 1,
    type_label: 'Crystal',
    name: `Banner ${id}`,
    img: '',
    begin: 0,
    end: 0,
    perm: 0,
    stepup: 1,
    status: 'active',
    pools: [
      {
        title: 'Featured Units',
        count: units.length,
        rate: '1%',
        units: units.map((u) => ({ id: u.id, name: `U${u.id}`, element: 'RED', rarity: u.rarity }))
      }
    ]
  })

  it('recomienda tirar si faltan varias unidades de alto valor', () => {
    const plans = planBanners([banner(1, [{ id: 1, rarity: 'LEGEND' }, { id: 2, rarity: 'ULTRA' }, { id: 3, rarity: 'SPARKING' }])], {})
    expect(plans[0].verdict).toBe('TIRAR')
  })

  it('recomienda ahorrar si ya tienes todas', () => {
    const box: Box = { '1': { stars: 7, zenkai: 0 }, '2': { stars: 7, zenkai: 0 } }
    const plans = planBanners([banner(1, [{ id: 1, rarity: 'ULTRA' }, { id: 2, rarity: 'SPARKING' }])], box)
    expect(plans[0].verdict).toBe('AHORRA')
  })

  it('marca las de ticket como uso de tickets', () => {
    const b = banner(1, [{ id: 9, rarity: 'SPARKING' }])
    b.type_label = 'Ticket'
    const plans = planBanners([b], {})
    expect(plans[0].verdict).toBe('TICKETS')
  })
})

describe('equipamiento', () => {
  const equipTag: Equipment = {
    id: 1,
    name: 'Equip de tag',
    rarity: 3,
    rarityLabel: 'Gold',
    icon: '',
    conditions: [8],
    conditionLabels: ['Saiyajin Híbrido'],
    exclusive: true,
    awakenedFrom: 0,
    release: 0,
    slots: [{ n: 1, options: ['Ataque físico básico 10.00% ~ 30.00%'] }],
    obtain: [{ kind: 'Missions', name: 'Misión de prueba', href: '', note: '' }]
  }

  const equipCard: Equipment = {
    ...equipTag,
    id: 2,
    name: 'Equip exclusivo',
    rarityLabel: 'Platinum',
    conditions: [60454],
    conditionLabels: ['DBL42-01U'],
    slots: [{ n: 1, options: ['Salud básica +30%', 'Daño infligido +25%'] }]
  }

  it('detecta equipamiento usable por tag', () => {
    expect(equipmentUsableBy(equipTag, makeChar(1, [8]))).toBe(true)
    expect(equipmentUsableBy(equipTag, makeChar(2, [1, 2]))).toBe(false)
  })

  it('detecta equipamiento exclusivo por carta', () => {
    const exclusive = { ...makeChar(3, [1]), card: 'DBL42-01U' }
    expect(equipmentUsableBy(equipCard, exclusive)).toBe(true)
    expect(equipmentUsableBy(equipCard, makeChar(4, [1]))).toBe(false)
  })

  it('recomienda lo que ya tienes y ordena lo mejor por puntuación', () => {
    const unit = { ...makeChar(1, [8]), card: 'DBL42-01U' }
    const rec = recommendEquipment(unit, [equipTag, equipCard], {
      '1': { count: 2, bestRank: 3, bestScore: 90 }
    })
    expect(rec.owned.map((p) => p.equip.id)).toEqual([1])
    expect(rec.best[0].equip.id).toBe(2)
  })
})

describe('completeTeam', () => {
  it('completa el equipo con personajes que comparten tag', () => {
    const characters = Array.from({ length: 8 }, (_, i) => makeChar(i + 1, [1]))
    const team = completeTeam([1, 2], characters, tags, boxOf([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(team).not.toBeNull()
    expect(team!.core.length + team!.bench.length).toBe(6)
    const ids = [...team!.core, ...team!.bench].map((u) => u.character.id)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
  })

  it('devuelve null sin selección', () => {
    expect(completeTeam([], [], tags, {})).toBeNull()
  })
})

describe('improveTeam', () => {
  it('propone cambios cuando hay unidades mejores fuera del equipo', () => {
    const characters = Array.from({ length: 8 }, (_, i) =>
      makeChar(i + 1, [1], i >= 6 ? 'LEGEND' : 'SPARKING')
    )
    const improvement = improveTeam([1, 2, 3, 4, 5, 6], characters, tags, boxOf([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(improvement).not.toBeNull()
    expect(improvement!.scoreDelta).toBeGreaterThan(0)
    expect(improvement!.changes.length).toBeGreaterThan(0)
  })
})
