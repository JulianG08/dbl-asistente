import type { AppData, CharactersData, EventsData, BannersData, EquipmentData, MetaData } from './types'

const base = import.meta.env.BASE_URL

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${base}data/${file}`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`No se pudo cargar data/${file} (${res.status})`)
  return (await res.json()) as T
}

const EMPTY_META: MetaData = {
  generatedAt: '',
  source: '',
  lastUpdated: '',
  tierOrder: [],
  tiers: {}
}

export async function loadData(): Promise<AppData> {
  const [characters, events, banners, equipment, meta] = await Promise.all([
    getJson<CharactersData>('characters.json'),
    getJson<EventsData>('events.json'),
    getJson<BannersData>('banners.json'),
    getJson<EquipmentData>('equipment.json'),
    getJson<MetaData>('meta.json').catch(() => EMPTY_META)
  ])
  return { characters, events, banners, equipment, meta }
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'terminado'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
