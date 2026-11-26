import { useMemo, useState } from 'preact/hooks'
import type { Character, Element, Rarity } from '../types'
import type { BoxState } from '../box'
import { ELEMENT_LABEL } from '../engine'
import { ElementDot, RarityChip, Section } from './ui'

const ELEMENTS: Element[] = ['RED', 'YEL', 'PUR', 'GRN', 'BLU', 'LGT', 'DRK']
const RARITIES: Rarity[] = ['LEGEND', 'ULTRA', 'SPARKING', 'EXTREME', 'HERO']

export function BoxView({
  characters,
  state,
  onToggle,
  onStars,
  onZenkai,
  onImport,
  onExport,
  onExportDblegends,
  onReset
}: {
  characters: Character[]
  state: BoxState
  onToggle: (id: number) => void
  onStars: (id: number, stars: number) => void
  onZenkai: (id: number, zenkai: number) => void
  onImport: () => void
  onExport: () => void
  onExportDblegends: () => void
  onReset: () => void
}) {
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<Element | 'ALL'>('ALL')
  const [rarity, setRarity] = useState<Rarity | 'ALL'>('ALL')
  const [view, setView] = useState<'all' | 'owned' | 'missing'>('owned')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return characters
      .filter((c) => !c.extra)
      .filter((c) => (element === 'ALL' ? true : c.element === element))
      .filter((c) => (rarity === 'ALL' ? true : c.rarity === rarity))
      .filter((c) => {
        const owned = String(c.id) in state.box
        if (view === 'owned' && !owned) return false
        if (view === 'missing' && owned) return false
        return true
      })
      .filter((c) => !q || `${c.name} ${c.form}`.toLowerCase().includes(q))
      .sort((a, b) => b.release - a.release || a.name.localeCompare(b.name))
  }, [characters, element, rarity, query, state.box, view])

  return (
    <div class="space-y-5">
      <Section
        title="Mi caja"
        subtitle={`${Object.keys(state.box).length} personajes · ${Object.values(state.box).filter((u) => u.stars >= 14).length} a 14★`}
        action={
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-gold" onClick={onImport}>
              Importar
            </button>
            <button class="btn btn-sm" onClick={onExport} disabled={!Object.keys(state.box).length}>
              Exportar
            </button>
            <button class="btn btn-sm" onClick={onExportDblegends} disabled={!Object.keys(state.box).length}>
              Exportar a dblegends
            </button>
            <button class="btn btn-sm btn-ghost" onClick={onReset}>
              Borrar
            </button>
          </div>
        }
      >
        <div class="card p-3 space-y-3">
          <input
            type="search"
            placeholder="Buscar personaje o transformación…"
            value={query}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
          />
          <div class="flex flex-wrap items-center gap-2">
            <select
              class="!w-auto"
              value={view}
              onChange={(e) => setView((e.currentTarget as HTMLSelectElement).value as 'all' | 'owned' | 'missing')}
            >
              <option value="owned">Solo míos</option>
              <option value="missing">Solo faltantes</option>
              <option value="all">Todos</option>
            </select>
            <select
              class="!w-auto"
              value={element}
              onChange={(e) => setElement((e.currentTarget as HTMLSelectElement).value as Element | 'ALL')}
            >
              <option value="ALL">Todos los elementos</option>
              {ELEMENTS.map((el) => (
                <option value={el}>{ELEMENT_LABEL[el]}</option>
              ))}
            </select>
            <select
              class="!w-auto"
              value={rarity}
              onChange={(e) => setRarity((e.currentTarget as HTMLSelectElement).value as Rarity | 'ALL')}
            >
              <option value="ALL">Todas las rarezas</option>
              {RARITIES.map((r) => (
                <option value={r}>{r}</option>
              ))}
            </select>
            <span class="text-xs text-muted ml-auto">{filtered.length} resultados</span>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {filtered.map((c) => {
            const owned = state.box[String(c.id)]
            return (
              <div
                key={c.id}
                class="unit-card"
                data-owned={owned ? 'true' : 'false'}
                onClick={() => onToggle(c.id)}
                title={`${c.name}${c.form ? ` · ${c.form}` : ''} (${c.card})`}
              >
                <div class="flex items-center gap-1.5 flex-wrap">
                  <ElementDot element={c.element} withLabel />
                  <RarityChip rarity={c.rarity} />
                  {c.lf ? <span class="chip chip-fire">LL</span> : null}
                  {c.zenkai ? <span class="chip chip-muted">ZK</span> : null}
                </div>
                <div class="text-[0.82rem] leading-tight min-h-[2.2em] line-clamp-2">{c.name}</div>
                <div class="flex items-center justify-between">
                  <span class={owned ? 'chip chip-gold' : 'chip chip-muted'}>{owned ? `${owned.stars}★` : '—'}</span>
                  {owned && owned.zenkai ? <span class="chip chip-fire">Z{owned.zenkai}</span> : null}
                </div>
                {owned ? (
                  <div class="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button class="btn btn-sm" aria-label="menos estrellas" onClick={() => onStars(c.id, owned.stars - 1)}>
                      −
                    </button>
                    <button class="btn btn-sm" aria-label="más estrellas" onClick={() => onStars(c.id, owned.stars + 1)}>
                      +
                    </button>
                    <span class="text-[0.66rem] text-muted ml-auto mr-1">ZK</span>
                    <button class="btn btn-sm" aria-label="menos zenkai" onClick={() => onZenkai(c.id, owned.zenkai - 1)}>
                      −
                    </button>
                    <button class="btn btn-sm" aria-label="más zenkai" onClick={() => onZenkai(c.id, owned.zenkai + 1)}>
                      +
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
