import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks'
import type { AppData } from './types'
import { loadData, formatDate } from './data'
import {
  analyzeSavedParties,
  buildTips,
  planBanners,
  planEvents,
  recommendTeams
} from './engine'
import {
  boxStats,
  downloadJson,
  emptyState,
  importBoxFile,
  loadState,
  saveState,
  toCaja,
  toDblegendsBox
} from './box'
import type { BoxState } from './box'
import { Home } from './components/Home'
import { BoxView } from './components/BoxView'
import { TeamsView } from './components/TeamsView'
import { EventsView } from './components/EventsView'
import { BannersView } from './components/BannersView'

type Tab = 'inicio' | 'caja' | 'equipos' | 'actos' | 'invocaciones'

const TABS: { id: Tab; label: string }[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'caja', label: 'Mi caja' },
  { id: 'equipos', label: 'Equipos' },
  { id: 'actos', label: 'Actos' },
  { id: 'invocaciones', label: 'Invocaciones' }
]

const IMPORT_LABEL: Record<string, string> = {
  caja: 'caja.json importada',
  dblegends: 'caja de dblegends.net importada',
  save: 'guardado del juego importado',
  desconocido: 'archivo importado'
}

export function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState('')
  const [state, setState] = useState<BoxState>(() => loadState())
  const [tab, setTab] = useState<Tab>('inicio')
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const [, forceTick] = useReducer((x: number) => x + 1, 0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setInterval(forceTick, 60_000)
    return () => clearInterval(id)
  }, [forceTick])

  useEffect(() => {
    loadData()
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(t)
  }, [toast])

  const teams = useMemo(
    () => (data ? recommendTeams(data.characters.characters, data.characters.tags, state.box) : []),
    [data, state.box]
  )
  const eventPlans = useMemo(
    () => (data ? planEvents(data.events.events, data.characters.characters, state.box) : []),
    [data, state.box]
  )
  const bannerPlans = useMemo(() => (data ? planBanners(data.banners.banners, state.box) : []), [data, state.box])
  const parties = useMemo(
    () =>
      data
        ? analyzeSavedParties(state.parties, data.characters.characters, data.characters.tags, state.box)
        : [],
    [data, state.parties, state.box]
  )
  const tips = useMemo(
    () =>
      data
        ? buildTips(
            teams,
            eventPlans,
            bannerPlans,
            parties,
            state.box,
            data.characters.characters.filter((c) => !c.extra).length
          )
        : [],
    [data, teams, eventPlans, bannerPlans, parties, state.box]
  )
  const stats = boxStats(state)

  function openImport() {
    fileRef.current?.click()
  }

  async function onFileChosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const { state: imported, kind } = await importBoxFile(file)
      setState(imported)
      setToast({
        msg: `${IMPORT_LABEL[kind]} · ${Object.keys(imported.box).length} personajes${
          imported.parties.length ? ` · ${imported.parties.length} equipos` : ''
        }`
      })
    } catch (err) {
      setToast({ msg: (err as Error).message, bad: true })
    }
  }

  function toggleUnit(id: number) {
    setState((prev) => {
      const box = { ...prev.box }
      const key = String(id)
      if (key in box) delete box[key]
      else box[key] = { stars: 1, zenkai: 0 }
      return { ...prev, box }
    })
  }

  function setStars(id: number, stars: number) {
    setState((prev) => {
      const key = String(id)
      const current = prev.box[key] ?? { stars: 0, zenkai: 0 }
      return { ...prev, box: { ...prev.box, [key]: { ...current, stars: Math.max(0, Math.min(14, stars)) } } }
    })
  }

  function setZenkai(id: number, zenkai: number) {
    setState((prev) => {
      const key = String(id)
      const current = prev.box[key] ?? { stars: 0, zenkai: 0 }
      return { ...prev, box: { ...prev.box, [key]: { ...current, zenkai: Math.max(0, Math.min(7, zenkai)) } } }
    })
  }

  function resetBox() {
    if (!confirm('¿Borrar la caja guardada en este navegador?')) return
    setState(emptyState())
    setToast({ msg: 'Caja borrada' })
  }

  return (
    <div class="min-h-dvh">
      <header class="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <div class="mx-auto max-w-6xl px-3 sm:px-5">
          <div class="flex items-center gap-3 py-2.5">
            <div class="flex items-center gap-2 min-w-0">
              <img src="./icon.svg" alt="" class="h-8 w-8" />
              <div class="leading-tight min-w-0">
                <p class="font-extrabold tracking-wide text-sm">DBL ASISTENTE</p>
                <p class="text-[0.62rem] text-muted truncate">
                  {stats.owned} personajes · {stats.maxed} a 14★ · {stats.zenkai} Zenkai ·{' '}
                  {Object.keys(state.equipment).length} equips
                </p>
              </div>
            </div>
            <div class="ml-auto flex items-center gap-2">
              <button class="btn btn-sm btn-gold" onClick={openImport}>
                Importar
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json,.bin"
              class="hidden"
              onChange={onFileChosen}
            />
          </div>
          <nav class="flex gap-1 overflow-x-auto pb-2 scroll-x" aria-label="Secciones">
            {TABS.map((t) => (
              <button key={t.id} class="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-3 sm:px-5 py-6">
        {error ? (
          <div class="card p-6 text-center">
            <p class="font-bold text-fire">No se pudieron cargar los datos</p>
            <p class="text-sm text-muted mt-2">{error}</p>
            <p class="text-xs text-muted mt-3">
              Ejecuta <code class="text-gold">python scraper/scrape.py --out app/public/data</code> para generarlos.
            </p>
          </div>
        ) : !data ? (
          <div class="card p-10 text-center text-sm text-muted">Cargando datos del juego…</div>
        ) : tab === 'inicio' ? (
          <Home
            data={data}
            state={state}
            teams={teams}
            events={eventPlans}
            banners={bannerPlans}
            parties={parties}
            tips={tips}
            onImport={openImport}
            onGo={setTab}
          />
        ) : tab === 'caja' ? (
          <BoxView
            characters={data.characters.characters}
            state={state}
            onToggle={toggleUnit}
            onStars={setStars}
            onZenkai={setZenkai}
            onImport={openImport}
            onExport={() => downloadJson(`dbl-caja-${new Date().toISOString().slice(0, 10)}.json`, toCaja(state))}
            onExportDblegends={() =>
              downloadJson(`dbl-mybox-${new Date().toISOString().slice(0, 10)}.json`, toDblegendsBox(state))
            }
            onReset={resetBox}
          />
        ) : tab === 'equipos' ? (
          <TeamsView
            teams={teams}
            parties={parties}
            characters={data.characters.characters}
            tags={data.characters.tags}
            box={state.box}
            equipment={data.equipment.items}
            userEquipment={state.equipment}
          />
        ) : tab === 'actos' ? (
          <EventsView plans={eventPlans} />
        ) : (
          <BannersView plans={bannerPlans} />
        )}

        <footer class="mt-10 border-t border-line pt-4 text-[0.68rem] text-muted leading-relaxed">
          <p>
            Datos del juego: es.dblegends.net (v{data?.characters.gameDataVersion ?? '—'}, actualizado{' '}
            {data?.characters.generatedAt ? new Date(data.characters.generatedAt).toLocaleString('es-ES') : '—'}).
            Proyecto de fans sin afiliación con Bandai Namco. Tu caja se guarda solo en este navegador.
          </p>
          {data ? (
            <p class="mt-1">
              Actos: {data.events.events.length} · Invocaciones: {data.banners.banners.length} · Personajes:{' '}
              {data.characters.characters.filter((c) => !c.extra).length} · Datos de actos:{' '}
              {formatDate(Date.parse(data.events.generatedAt) / 1000)}
            </p>
          ) : null}
        </footer>
      </main>

      {toast ? (
        <div
          class={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 card px-4 py-3 text-sm shadow-2xl max-w-[92vw] ${
            toast.bad ? 'border-fire/60' : 'border-gold/50'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  )
}
