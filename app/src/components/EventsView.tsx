import type { EventPlan } from '../engine'
import { ELEMENT_LABEL, eventCountdown } from '../engine'
import { UrgencyBadge } from './Home'
import { ElementDot, Section, UnitLine } from './ui'

export function EventsView({ plans }: { plans: EventPlan[] }) {
  return (
    <Section
      title="Actos"
      subtitle="Priorizados por tiempo restante, recompensas y lo que tu caja puede aprovechar"
    >
      {plans.length ? (
        <div class="space-y-4">
          {plans.map((plan) => (
            <article class="card p-4 sm:p-5 space-y-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <UrgencyBadge urgency={plan.urgency} />
                    {plan.event.status === 'upcoming' ? <span class="chip">PRÓXIMO</span> : null}
                    <span class="chip chip-muted">{eventCountdown(plan)}</span>
                    {plan.stageCount ? (
                      <span class="chip chip-muted">
                        {plan.stageCount} {plan.stageCount === 1 ? 'etapa' : 'etapas'}
                      </span>
                    ) : null}
                  </div>
                  <h3 class="font-extrabold leading-snug">{plan.event.name}</h3>
                </div>
                <a
                  class="btn btn-sm"
                  href={`https://es.dblegends.net/event/${plan.event.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver en dblegends
                </a>
              </div>

              <div class="flex flex-wrap gap-2">
                {plan.enemyElements.map((e) => (
                  <span class="chip" key={e.element}>
                    <ElementDot element={e.element} />
                    {ELEMENT_LABEL[e.element]} ×{e.count}
                  </span>
                ))}
                {plan.rewards.map((r) => (
                  <span class="chip chip-muted" key={r}>
                    {r}
                  </span>
                ))}
              </div>

              {plan.suggestions.length ? (
                <div class="rounded-xl border border-line bg-panel2/50 p-3 space-y-2">
                  <p class="text-[0.65rem] uppercase tracking-widest text-gold font-bold">Equipo sugerido</p>
                  <div class="grid gap-1 sm:grid-cols-2">
                    {plan.suggested.map((u) => (
                      <UnitLine key={u.character.id} character={u.character} owned={u.owned} />
                    ))}
                  </div>
                  <ul class="text-xs text-muted space-y-0.5">
                    {plan.suggestions.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {plan.event.detail?.stages.length ? (
                <details class="rounded-xl border border-line bg-panel2/40 p-3">
                  <summary class="text-xs font-bold text-muted uppercase tracking-widest">
                    Etapas, enemigos y retos ({plan.event.detail.stages.length})
                  </summary>
                  <div class="mt-3 space-y-3">
                    {plan.event.detail.stages.map((stage) => (
                      <div class="rounded-lg border border-line p-3 space-y-1.5">
                        <p class="text-sm font-bold">
                          {stage.n}. {stage.name}
                        </p>
                        <p class="text-[0.7rem] text-muted">
                          {Object.entries(stage.meta)
                            .map(([k, v]) => `${k}: ${v.toLocaleString('es-ES')}`)
                            .join(' · ')}
                        </p>
                        <div class="space-y-1">
                          {stage.enemies.map((enemy, i) => (
                            <p class="text-xs text-muted" key={`${stage.n}-${i}`}>
                              ⚔ {enemy.name || 'Enemigo'} {enemy.level ? `· ${enemy.level}` : ''}
                            </p>
                          ))}
                        </div>
                        {stage.drops.length ? (
                          <p class="text-xs text-muted">
                            🎁 {stage.drops.map((d) => d.name).join(', ')}
                          </p>
                        ) : null}
                        {stage.challenges.length ? (
                          <ul class="text-xs text-muted space-y-0.5">
                            {stage.challenges.map((ch, i) => (
                              <li key={i}>
                                · {ch.text}
                                {ch.reward.name ? ` → ${ch.reward.name} ${ch.reward.count}` : ''}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div class="card p-6 text-center text-sm text-muted">No hay actos activos en los datos actuales.</div>
      )}
    </Section>
  )
}
