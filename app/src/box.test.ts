import { describe, expect, it } from 'vitest'
import { importBoxFile, starsFromZPower } from './box'

describe('starsFromZPower', () => {
  it('respeta los umbrales del juego', () => {
    expect(starsFromZPower(0)).toBe(0)
    expect(starsFromZPower(99)).toBe(0)
    expect(starsFromZPower(100)).toBe(0)
    expect(starsFromZPower(200)).toBe(1)
    expect(starsFromZPower(9999)).toBe(14)
  })
})

describe('importBoxFile', () => {
  it('lee caja.json de la app', async () => {
    const caja = {
      format: 'dbl-asistente/caja-v1',
      units: { '262': { stars: 14, zenkai: 7 } },
      parties: [{ name: 'Party1', active: true, members: [262] }]
    }
    const file = new File([JSON.stringify(caja)], 'caja.json', { type: 'application/json' })
    const { state, kind } = await importBoxFile(file)
    expect(kind).toBe('caja')
    expect(state.box['262']).toEqual({ stars: 14, zenkai: 7 })
    expect(state.parties).toHaveLength(1)
  })

  it('lee caja v2 con inventario de equipamiento', async () => {
    const caja = {
      format: 'dbl-asistente/caja-v2',
      units: { '751': { stars: 14, zenkai: 0 } },
      equipment: { '1771': { count: 2, bestRank: 4, bestScore: 98.5 } },
      everOwnedEquipment: [1771, 100],
      parties: []
    }
    const file = new File([JSON.stringify(caja)], 'caja.json', { type: 'application/json' })
    const { state } = await importBoxFile(file)
    expect(state.equipment['1771']).toEqual({ count: 2, bestRank: 4, bestScore: 98.5 })
    expect(state.everOwnedEquipment).toEqual([1771, 100])
  })

  it('lee caja v3 con misiones', async () => {
    const caja = {
      format: 'dbl-asistente/caja-v3',
      units: { '751': { stars: 14, zenkai: 0 } },
      missions: {
        groups: {
          '2611212': { completed: 4, total: 50, clearCount: 0, rewardsClaimed: 0, rewardsTotal: 2 }
        }
      },
      parties: []
    }
    const file = new File([JSON.stringify(caja)], 'caja.json', { type: 'application/json' })
    const { state } = await importBoxFile(file)
    expect(state.missions['2611212']).toEqual({
      completed: 4,
      total: 50,
      clearCount: 0,
      rewardsClaimed: 0,
      rewardsTotal: 2
    })
  })

  it('lee el export de Mi Caja de dblegends.net', async () => {
    const box = { '751': { unlocked: true, stars: 10, zenkai: true, zenkaiLvl: 3 } }
    const file = new File([JSON.stringify(box)], 'box.json', { type: 'application/json' })
    const { state, kind } = await importBoxFile(file)
    expect(kind).toBe('dblegends')
    expect(state.box['751']).toEqual({ stars: 10, zenkai: 3 })
  })

  it('lee el guardado crudo del juego (bytes invertidos)', async () => {
    const save = {
      unit: { unitInfo_: [{ id: 10 }, { id: 20 }] },
      item: {
        characterShards_: [{ characterType: 10, count: 9999 }],
        characterPlentyShards_: [{ characterType: 10, count: 5000 }],
        equipItems_: [
          { equipId: 1771, rank: 2, score: 80 },
          { equipId: 1771, rank: 4, score: 95 }
        ],
        givenEquipInfo_: { everGivenIdList: [1771, 100] }
      }
    }
    const text = JSON.stringify(save)
    const bytes = new TextEncoder().encode(text).map((b) => b ^ 0xff)
    const file = new File([bytes], 'save.bin')
    const { state, kind } = await importBoxFile(file)
    expect(kind).toBe('save')
    expect(state.box['10']).toEqual({ stars: 14, zenkai: 5 })
    expect(state.box['20']).toEqual({ stars: 0, zenkai: 0 })
    expect(state.equipment['1771']).toEqual({ count: 2, bestRank: 4, bestScore: 95 })
    expect(state.everOwnedEquipment).toEqual([1771, 100])
  })
})
