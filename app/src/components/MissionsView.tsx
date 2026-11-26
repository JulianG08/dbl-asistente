import type { MissionGroup, MissionProgress } from '../types'
import { formatCountdown } from '../data'
import { Section } from './ui'

export function MissionsView({
  missions,
  progress
}: {
  missions: MissionGroup[]
  progress: Record<string, MissionProgress>
}) {
  const rows = missions
    .map((mission) => {
      const state = progress[String(mission.id)]
      const pending =
        state?.total != null && state?.completed != null ? Math.max(0, state.total - state.completed) : null
      return { mission, state, pending }
    })
    .sort(
      (a, b) =>
        (b.pending ?? -1) - (a.pending ?? -1) || (a.mission.end || Number.MAX_SAFE_INTEGER) - (b.mission.end || Number.MAX_SAFE_INTEGER)
    )

  const totalPending = rows.reduce((sum, r) => sum + (r.pending ?? 0), 0)
  const hasProgress = rows.some((r) => r.state)

  return (
    <Section
      title="Misiones"
      subtitle="Grupos de misiones activos, tu progreso y sus recompensas (datos de es.dblegends.net)"
    >
      {hasProgress ? (
        <div class="card p-3 text-xs">
          {totalPending > 0 ? (
            <span class="text-gold font-semibold">
              Tienes {totalPending} misiones pendientes en los grupos de abajo.
            </span>
          ) : (
            <span class="text-muted">No te quedan misiones pendientes en estos grupos. 🎉</span>
          )}{' '}
          <span class="text-muted">Las recompensas se marcan como “reclamadas” cuando ya las cogiste.</span>
        </div>
      ) : (
        <div class="card p-3 text-xs text-muted">
          El estado de tus misiones se activará al conectar el móvil y reimportar la caja: la app leerá tu
          guardado y te dirá exactamente qué te falta.
        </div>
      )}

      {rows.length ? (
        <div class="space-y-3">
          {rows.map(({ mission, state, pending }) => (
            <article class="card p-4 space-y-2" key={mission.id}>
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="font-bold text-sm leading-snug">{mission.name}</h3>
                  <div class="flex gap-2 mt-1 flex-wrap">
                    <span class="chip chip-muted">
                      {mission.facts?.['Missions'] ?? mission.count} misiones
                    </span>
                    {mission.status === 'upcoming' ? (
                      <span class="chip">PRÓXIMA</span>
                    ) : mission.end ? (
                      <span class="chip chip-muted">
                        termina en {formatCountdown(mission.end * 1000 - Date.now())}
                      </span>
                    ) : (
                      <span class="chip chip-gold">permanente</span>
                    )}
                    {mission.facts?.['Total Rewards'] ? (
                      <span class="chip chip-muted">{mission.facts['Total Rewards']} recompensas</span>
                    ) : null}
                    {Object.entries(mission.facts ?? {})
                      .filter(([key]) => key !== 'Missions' && key !== 'Total Rewards')
                      .map(([key, value]) => (
                        <span class={/crystal/i.test(key) ? 'chip chip-gold' : 'chip chip-muted'} key={key}>
                          {key}: {value}
                        </span>
                      ))}
                  </div>
                </div>
                <a
                  class="btn btn-sm"
                  href={`https://es.dblegends.net/mission/${mission.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver en dblegends
                </a>
              </div>

              {state?.total != null && state?.completed != null ? (
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-[0.68rem] text-muted">
                    <span>
                      {state.completed}/{state.total} completadas
                    </span>
                    <span class={pending ? 'text-gold font-semibold' : ''}>
                      {pending ? `${pending} pendientes` : 'completado'}
                    </span>
                  </div>
                  <div class="h-1.5 rounded-full bg-panel2 overflow-hidden">
                    <div
                      class="h-full bg-gold"
                      style={{ width: `${Math.round((state.completed / Math.max(1, state.total)) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {state?.rewardsTotal ? (
                <div class="flex flex-wrap gap-2">
                  <span class={state.rewardsClaimed < state.rewardsTotal ? 'chip chip-fire' : 'chip chip-muted'}>
                    {state.rewardsClaimed < state.rewardsTotal
                      ? `Reclama ${state.rewardsTotal - state.rewardsClaimed} ${
                          state.rewardsTotal - state.rewardsClaimed === 1 ? 'recompensa' : 'recompensas'
                        }`
                      : 'Recompensas reclamadas'}
                  </span>
                </div>
              ) : null}

              {mission.rewards?.length ? (
                <div class="flex flex-wrap gap-2">
                  {mission.rewards.slice(0, 10).map((reward, index) => (
                    <span
                      class={
                        reward.kind === 'zpower'
                          ? 'chip chip-gold'
                          : reward.kind === 'zenkai'
                            ? 'chip chip-fire'
                            : 'chip'
                      }
                      key={`${mission.id}-${index}`}
                      title={reward.kind === 'zpower' ? 'Z Power de personaje' : undefined}
                    >
                      {reward.name} {reward.count}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div class="card p-6 text-center text-sm text-muted">No hay misiones activas en los datos.</div>
      )}
    </Section>
  )
}
