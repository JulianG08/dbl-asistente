import type { Box, CajaFile, OwnedUnit, SavedParty } from './types'

const KEY = 'dbl-asistente/caja-v1'

export interface BoxState {
  box: Box
  parties: SavedParty[]
  playerName?: string
  importedAt?: string
}

export const STAR_THRESHOLDS = [100, 200, 400, 700, 1400, 1900, 2400, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 9999]

export function emptyState(): BoxState {
  return { box: {}, parties: [] }
}

export function loadState(): BoxState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as BoxState
    if (!parsed || typeof parsed !== 'object' || !parsed.box) return emptyState()
    return { ...emptyState(), ...parsed }
  } catch {
    return emptyState()
  }
}

export function saveState(state: BoxState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function starsFromZPower(zp: number): number {
  let stars = 0
  for (let i = 0; i < STAR_THRESHOLDS.length; i++) {
    if (zp >= STAR_THRESHOLDS[i]) stars = i
    else break
  }
  return stars
}

function tryJson(bytes: Uint8Array): unknown | null {
  const candidates = [bytes, bytes.map((b) => b ^ 0xff)]
  for (const candidate of candidates) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(candidate).replace(/^\uFEFF/, '')
      if (!text.trimStart().startsWith('{') && !text.trimStart().startsWith('[')) continue
      return JSON.parse(text)
    } catch {
      // siguiente intento
    }
  }
  return null
}

/** Convierte un guardado crudo de DBL (unit.unitInfo_) en caja. */
function fromRawSave(data: Record<string, unknown>): BoxState | null {
  const unit = data.unit as { unitInfo_?: { id?: number }[] } | undefined
  if (!unit || !Array.isArray(unit.unitInfo_)) return null
  const item = (data.item ?? {}) as {
    characterShards_?: { characterType: number; count: number }[]
    characterPlentyShards_?: { characterType: number; count: number }[]
  }
  const zp = new Map<number, number>()
  for (const s of item.characterShards_ ?? []) zp.set(Number(s.characterType), Number(s.count) || 0)
  const plenty = new Map<number, number>()
  for (const s of item.characterPlentyShards_ ?? []) plenty.set(Number(s.characterType), Number(s.count) || 0)

  const box: Box = {}
  for (const u of unit.unitInfo_) {
    const id = Number(u.id)
    if (!Number.isFinite(id) || id < 0) continue
    box[String(id)] = {
      stars: starsFromZPower(zp.get(id) ?? 0),
      zenkai: Math.min(7, Math.floor((plenty.get(id) ?? 0) / 1000))
    }
  }

  const parties: SavedParty[] = []
  const party = (data.party ?? {}) as { partyInfo_?: unknown[]; activePartyIndex_?: number }
  const active = party.activePartyIndex_
  ;(party.partyInfo_ ?? []).forEach((rawParty, idx) => {
    const p = rawParty as { partyName_?: string; characters_?: { characterId_: number }[] }
    const members = (p.characters_ ?? []).map((c) => Number(c.characterId_)).filter((n) => n >= 0)
    if (members.length) parties.push({ name: p.partyName_ ?? `Party${idx + 1}`, active: idx === active, members })
  })

  return { box, parties }
}

/** Convierte el JSON de "Mi Caja" de dblegends.net. */
function fromDblegendsBox(data: Record<string, unknown>): BoxState | null {
  const box: Box = {}
  let found = false
  for (const [key, value] of Object.entries(data)) {
    if (!/^\d+$/.test(key) || !value || typeof value !== 'object') continue
    const v = value as { unlocked?: boolean; stars?: number; zenkai?: boolean; zenkaiLvl?: number }
    found = true
    if (!v.unlocked && !(v.stars ?? 0)) continue
    box[key] = {
      stars: Math.max(0, Math.min(14, Number(v.stars) || 0)),
      zenkai: v.zenkai ? Math.max(1, Math.min(7, Number(v.zenkaiLvl) || 1)) : 0
    }
  }
  return found ? { box, parties: [] } : null
}

export type ImportKind = 'caja' | 'dblegends' | 'save' | 'desconocido'

export async function importBoxFile(file: File): Promise<{ state: BoxState; kind: ImportKind }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const parsed = tryJson(bytes)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('El archivo no es un JSON válido (ni normal ni con bytes invertidos).')
  }
  const data = parsed as Record<string, unknown>

  if (data.format === 'dbl-asistente/caja-v1') {
    const caja = data as unknown as CajaFile
    return {
      kind: 'caja',
      state: {
        box: caja.units ?? {},
        parties: caja.parties ?? [],
        playerName: caja.playerName ?? caja.player?.name,
        importedAt: new Date().toISOString()
      }
    }
  }

  const fromSave = fromRawSave(data)
  if (fromSave) return { kind: 'save', state: { ...fromSave, importedAt: new Date().toISOString() } }

  const fromBox = fromDblegendsBox(data)
  if (fromBox) return { kind: 'dblegends', state: { ...fromBox, importedAt: new Date().toISOString() } }

  throw new Error('No reconocí el formato. Se acepta caja.json, el export de Mi Caja de dblegends.net o el guardado del juego.')
}

export function toCaja(state: BoxState): CajaFile {
  return {
    format: 'dbl-asistente/caja-v1',
    generatedAt: new Date().toISOString(),
    source: 'web',
    romVersion: '',
    playerName: state.playerName,
    units: state.box,
    parties: state.parties
  }
}

/** Formato de "Mi Caja" de dblegends.net, para interoperar con ese sitio. */
export function toDblegendsBox(state: BoxState): Record<string, { unlocked: boolean; stars: number; zenkai: boolean; zenkaiLvl: number }> {
  const out: Record<string, { unlocked: boolean; stars: number; zenkai: boolean; zenkaiLvl: number }> = {}
  for (const [id, unit] of Object.entries(state.box)) {
    out[id] = { unlocked: true, stars: unit.stars, zenkai: unit.zenkai > 0, zenkaiLvl: unit.zenkai }
  }
  return out
}

export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ownedCount(state: BoxState): number {
  return Object.keys(state.box).length
}

export function boxStats(state: BoxState): { owned: number; maxed: number; zenkai: number } {
  let maxed = 0
  let zenkai = 0
  for (const u of Object.values(state.box)) {
    if (u.stars >= 14) maxed++
    if (u.zenkai >= 1) zenkai++
  }
  return { owned: Object.keys(state.box).length, maxed, zenkai }
}

export type { OwnedUnit }
