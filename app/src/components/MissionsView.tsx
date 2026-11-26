import type { MissionGroup } from '../types'
import { formatCountdown } from '../data'
import { Section } from './ui'

export function MissionsView({ missions }: { missions: MissionGroup[] }) {
  return (
    <Section
      title="Misiones"
      subtitle="Grupos de misiones activos con sus recompensas (datos de es.dblegends.net)"
    >
      <div class="card p-3 text-xs text-muted">
        El estado de tus misiones (completadas/pendientes) se activará al conectar el móvil y reimportar la
        caja: la app leerá tu guardado y te dirá exactamente qué te falta.
      </div>

      {missions.length ? (
        <div class="space-y-3">
          {missions.map((mission) => (
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
