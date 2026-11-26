import type { AppData } from '../types'
import type { BoxState } from '../box'
import type { BannerPlan, EventPlan, PartyPlan, TeamPlan, Tip } from '../engine'
import { buildPlan, eventCountdown, metaCoverage } from '../engine'
import { Section, UnitLine } from './ui'
import { formatDate } from '../data'
import { useMemo } from 'preact/hooks'

export function Home({
  data,
  state,
  teams,
  events,
  banners,
  parties,
  tips,
  onImport,
  onGo
}: {
  data: AppData
  state: BoxState
  teams: TeamPlan[]
  events: EventPlan[]
  banners: BannerPlan[]
  parties: PartyPlan[]
  tips: Tip[]
  onImport: () => void
  onGo: (tab: 'caja' | 'equipos' | 'actos' | 'invocaciones') => void
}) {
  const owned = Object.keys(state.box).length
  const total = data.characters.characters.filter((c) => !c.extra).length
  const maxed = Object.values(state.box).filter((u) => u.stars >= 14).length
  const zenkai = Object.values(state.box).filter((u) => u.zenkai >= 1).length
  const activeParty = parties.find((p) => p.active)

  const urgent = events.filter(
    (plan) => plan.event.status === 'active' && plan.hoursLeft !== null && plan.hoursLeft > 0 && plan.hoursLeft <= 48
  )
  const plan = useMemo(
    () => buildPlan(teams, parties, data.characters.characters, state.box, data.banners.banners, data.meta),
    [teams, parties, data, state.box]
  )
  const coverage = useMemo(
    () => metaCoverage(data.characters.characters, state.box, data.meta, data.banners.banners),
    [data, state.box]
  )

  return (
    <div class="space-y-8">
      <section class="card p-5 sm:p-6 relative overflow-hidden">
        <div class="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-gold/10 blur-2xl" />
        <div class="relative space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-[0.7rem] uppercase tracking-[0.2em] text-gold font-bold">Tu cuenta</p>
              <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {state.playerName ? state.playerName : 'Sin caja importada'}
              </h1>
              <p class="text-sm text-muted mt-1">
                {owned ? `${owned} de ${total} personajes en tu caja` : 'Importa tu caja para empezar'}
              </p>
            </div>
            <div class="flex gap-2 flex-wrap">
              <button class="btn btn-gold" onClick={onImport}>
                Importar caja
              </button>
              <button class="btn btn-ghost" onClick={() => onGo('caja')}>
                Ver mi caja
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Personajes" value={owned} sub={`de ${total}`} />
            <Stat label="14 estrellas" value={maxed} sub="unidades" />
            <Stat label="Zenkai" value={zenkai} sub="unidades" />
            <Stat label="Equipos" value={parties.length} sub="guardados" />
          </div>

          {activeParty ? (
            <div class="rounded-xl border border-line bg-panel2/60 p-3">
              <p class="text-[0.7rem] uppercase tracking-widest text-muted font-bold">Equipo activo · {activeParty.name}</p>
              <div class="mt-2 grid gap-1 sm:grid-cols-2">
                {activeParty.members.map((m) => (
                  <UnitLine key={m.character.id} character={m.character} owned={m.owned} />
                ))}
              </div>
            </div>
          ) : null}

          {!owned ? (
            <div class="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              <p class="text-text font-semibold mb-1">¿Cómo importo mi caja?</p>
              <p>
                Con el móvil conectado por USB: <code class="text-gold">./scripts/extraer-caja.sh</code> y arrastra el{' '}
                <code class="text-gold">caja.json</code> que genera. También acepta el export de “Mi Caja” de
                dblegends.net y el archivo de guardado del juego.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {urgent.length ? (
        <section class="card p-4 border-fire/50">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h2 class="text-sm font-extrabold uppercase tracking-wide text-fire">⚠ Se te escapa</h2>
            <button class="btn btn-sm" onClick={() => onGo('actos')}>
              Ver actos
            </button>
          </div>
          <ul class="mt-2 space-y-1">
            {urgent.slice(0, 4).map((plan) => (
              <li class="text-sm flex items-center justify-between gap-2">
                <span class="truncate">{plan.event.name}</span>
                <span class="chip chip-fire">{eventCountdown(plan)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.length ? (
        <Section title="Tu plan" subtitle="Acciones concretas para mejorar tu cuenta esta semana">
          <div class="grid gap-3 md:grid-cols-2">
            {plan.map((action, index) => (
              <article class="card p-4">
                <div class="flex items-center gap-2 mb-1">
                  <span class="chip chip-gold">{action.kind === 'stars' ? '★' : action.kind === 'zenkai' ? 'ZK' : '🎯'}</span>
                  <h3 class="font-bold text-sm">{action.title}</h3>
                </div>
                <p class="text-sm text-muted leading-relaxed">{action.detail}</p>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      {coverage.total ? (
        <Section
          title="Tu cuenta vs. el meta"
          subtitle={`Unidades tier Z de dblegends.app · ${coverage.owned}/${coverage.total}`}
        >
          <div class="card p-4 space-y-3">
            <div class="h-2 rounded-full bg-panel2 overflow-hidden">
              <div
                class="h-full bg-gold"
                style={{ width: `${Math.round((coverage.owned / Math.max(1, coverage.total)) * 100)}%` }}
              />
            </div>
            {coverage.gaps.length ? (
              <div class="flex flex-wrap gap-2">
                {coverage.gaps.slice(0, 8).map((gap) => (
                  <span class="chip" key={gap.card} title={gap.source ? `Disponible en: ${gap.source}` : 'Sin banner activo'}>
                    <span class={gap.tier === 'Z' ? 'text-fire font-bold' : 'text-gold font-bold'}>{gap.tier}</span>
                    {gap.name}
                    {gap.source ? <span class="text-muted">· {gap.source.slice(0, 28)}</span> : null}
                  </span>
                ))}
              </div>
            ) : (
              <p class="text-sm text-muted">¡Tienes todas las unidades tier Z! 🎉</p>
            )}
          </div>
        </Section>
      ) : null}

      <Section title="Recomendaciones" subtitle="Generadas a partir de tu caja y los datos del juego">
        <div class="grid gap-3 md:grid-cols-2">
          {tips.map((tip) => (
            <article class="card p-4">
              <p class="text-[0.65rem] uppercase tracking-[0.2em] font-bold text-gold">{tip.kind}</p>
              <h3 class="font-bold mt-1">{tip.title}</h3>
              <p class="text-sm text-muted mt-1 leading-relaxed">{tip.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="Equipos"
        subtitle="Tus mejores combinaciones por tags"
        action={
          <button class="btn btn-sm" onClick={() => onGo('equipos')}>
            Ver todos
          </button>
        }
      >
        {teams.length ? (
          <div class="grid gap-3 md:grid-cols-2">
            {teams.slice(0, 2).map((team) => (
              <article class="card p-4 space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="font-extrabold">{team.tag.name}</h3>
                  <span class="chip chip-gold">{team.score.toFixed(1)} pts</span>
                </div>
                <div class="space-y-1">
                  {team.core.map((u) => (
                    <UnitLine key={u.character.id} character={u.character} owned={u.owned} />
                  ))}
                </div>
                <p class="text-xs text-muted">{team.reasons.join(' · ')}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyBox text="Importa tu caja para ver equipos recomendados." />
        )}
      </Section>

      <Section
        title="Actos activos"
        subtitle={data.events.generatedAt ? `Datos del ${formatDate(Date.parse(data.events.generatedAt) / 1000)}` : undefined}
        action={
          <button class="btn btn-sm" onClick={() => onGo('actos')}>
            Ver todos
          </button>
        }
      >
        {events.length ? (
          <div class="grid gap-3 md:grid-cols-2">
            {events.slice(0, 4).map((plan) => (
              <article class="card p-4 space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-bold text-sm leading-snug">{plan.event.name}</h3>
                  <UrgencyBadge urgency={plan.urgency} />
                </div>
                <p class="text-xs text-muted">{eventCountdown(plan)}</p>
                {plan.suggestions[0] ? <p class="text-xs text-muted">{plan.suggestions[0]}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyBox text="No hay actos activos en los datos." />
        )}
      </Section>

      <Section
        title="Invocaciones"
        subtitle="Veredicto según lo que ya tienes"
        action={
          <button class="btn btn-sm" onClick={() => onGo('invocaciones')}>
            Ver todas
          </button>
        }
      >
        {banners.length ? (
          <div class="grid gap-3 md:grid-cols-2">
            {banners.slice(0, 2).map((plan) => (
              <article class="card p-4 space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-bold text-sm leading-snug">{plan.banner.name}</h3>
                  <VerdictBadge verdict={plan.verdict} />
                </div>
                <p class="text-xs text-muted">{plan.reason}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyBox text="No hay invocaciones activas en los datos." />
        )}
      </Section>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div class="rounded-xl border border-line bg-panel2/60 p-3">
      <p class="text-[0.62rem] uppercase tracking-widest text-muted font-bold">{label}</p>
      <p class="text-xl font-extrabold mono leading-tight">{value}</p>
      {sub ? <p class="text-[0.65rem] text-muted">{sub}</p> : null}
    </div>
  )
}

function EmptyBox({ text }: { text: string }) {
  return <div class="card p-5 text-center text-sm text-muted">{text}</div>
}

export function UrgencyBadge({ urgency }: { urgency: EventPlan['urgency'] }) {
  const cls = urgency === 'alta' ? 'chip chip-fire' : urgency === 'media' ? 'chip chip-gold' : 'chip chip-muted'
  return <span class={cls}>{urgency === 'alta' ? 'PRIORIDAD ALTA' : urgency === 'media' ? 'MEDIA' : 'BAJA'}</span>
}

export function VerdictBadge({ verdict }: { verdict: BannerPlan['verdict'] }) {
  const cls =
    verdict === 'TIRAR'
      ? 'chip chip-green'
      : verdict === 'CONSIDERAR'
        ? 'chip chip-gold'
        : verdict === 'TICKETS'
          ? 'chip chip-muted'
          : 'chip'
  return <span class={cls}>{verdict}</span>
}
