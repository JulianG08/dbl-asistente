import type { PartyPlan, TeamPlan } from '../engine'
import { ELEMENT_LABEL } from '../engine'
import { ElementDot, RarityChip, Section, UnitLine } from './ui'

export function TeamsView({ teams, parties }: { teams: TeamPlan[]; parties: PartyPlan[] }) {
  return (
    <div class="space-y-8">
      <Section
        title="Equipos recomendados"
        subtitle="Calculados con tus estrellas, Zenkai, tags compartidos y cobertura de elementos"
      >
        {teams.length ? (
          <div class="space-y-4">
            {teams.map((team, index) => (
              <article class="card p-4 sm:p-5 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="chip chip-gold">#{index + 1}</span>
                    <h3 class="text-base font-extrabold uppercase tracking-wide">{team.tag.name}</h3>
                    <span class="chip">{team.score.toFixed(1)} pts</span>
                    <span class="chip chip-muted">media {team.avgStars.toFixed(1)}★</span>
                    {team.zenkaiCount ? <span class="chip chip-fire">{team.zenkaiCount} Zenkai</span> : null}
                  </div>
                  <div class="flex items-center gap-1">
                    {team.elements.map((el) => (
                      <span class="chip chip-muted" title={ELEMENT_LABEL[el]}>
                        <ElementDot element={el} />
                        {ELEMENT_LABEL[el]}
                      </span>
                    ))}
                  </div>
                </div>

                <div class="grid gap-2 md:grid-cols-2">
                  <div class="rounded-xl border border-line bg-panel2/50 p-3 space-y-1.5">
                    <p class="text-[0.65rem] uppercase tracking-widest text-gold font-bold">Núcleo (3)</p>
                    {team.core.map((u) => (
                      <div class="flex items-center justify-between gap-2">
                        <UnitLine character={u.character} owned={u.owned} />
                        <span class="text-[0.7rem] text-muted mono">{u.score.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                  <div class="rounded-xl border border-line bg-panel2/50 p-3 space-y-1.5">
                    <p class="text-[0.65rem] uppercase tracking-widest text-muted font-bold">Banquillo (3)</p>
                    {team.bench.map((u) => (
                      <UnitLine key={u.character.id} character={u.character} owned={u.owned} />
                    ))}
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  {team.synergies.map((s) => (
                    <span class="chip chip-muted" key={s.id}>
                      {s.name} ×{s.count}
                    </span>
                  ))}
                  {team.reasons.map((r) => (
                    <span class="chip">{r}</span>
                  ))}
                </div>

                {team.missing.length ? (
                  <div class="rounded-xl border border-dashed border-line p-3">
                    <p class="text-[0.65rem] uppercase tracking-widest text-muted font-bold mb-1">
                      Mejoras posibles (no las tienes)
                    </p>
                    <div class="flex flex-wrap gap-2">
                      {team.missing.map((c) => (
                        <span class="chip" key={c.id}>
                          <ElementDot element={c.element} />
                          {c.name}
                          <RarityChip rarity={c.rarity} />
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div class="card p-6 text-center text-sm text-muted">
            Importa tu caja para generar equipos. Se necesitan al menos 6 personajes que compartan un tag.
          </div>
        )}
      </Section>

      {parties.length ? (
        <Section title="Tus equipos guardados" subtitle="Los que tienes configurados en el juego">
          <div class="grid gap-3 md:grid-cols-2">
            {parties.map((party) => (
              <article class="card p-4 space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="font-bold">
                    {party.name} {party.active ? <span class="chip chip-gold">ACTIVO</span> : null}
                  </h3>
                  <span class="chip chip-muted">media {party.avgScore.toFixed(1)}</span>
                </div>
                <div class="space-y-1">
                  {party.members.map((m) => (
                    <UnitLine key={m.character.id} character={m.character} owned={m.owned} />
                  ))}
                </div>
                <div class="flex flex-wrap gap-1.5">
                  {party.sharedTags.slice(0, 4).map((t) => (
                    <span class="chip chip-muted" key={t.id}>
                      {t.name} ×{t.count}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}
