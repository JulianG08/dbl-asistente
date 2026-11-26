import type { BannerPlan } from '../engine'
import type { MetaData } from '../types'
import { formatCountdown } from '../data'
import { VerdictBadge } from './Home'
import { ElementDot, RarityChip, Section, charIconUrl } from './ui'

export function BannersView({ plans, meta }: { plans: BannerPlan[]; meta?: MetaData }) {
  return (
    <Section
      title="Invocaciones"
      subtitle="Veredicto según las unidades destacadas que ya tienes (datos de es.dblegends.net)"
    >
      {plans.length ? (
        <div class="space-y-4">
          {plans.map(({ banner, featured, missing, verdict, reason }) => (
            <article class="card p-4 sm:p-5 space-y-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <VerdictBadge verdict={verdict} />
                    <span class="chip chip-muted">{banner.type_label}</span>
                    {banner.status === 'upcoming' ? (
                      <span class="chip">PRÓXIMA</span>
                    ) : banner.end ? (
                      <span class="chip chip-muted">
                        termina en {formatCountdown(banner.end * 1000 - Date.now())}
                      </span>
                    ) : null}
                  </div>
                  <h3 class="font-extrabold leading-snug">{banner.name}</h3>
                  <p class="text-xs text-muted mt-1">{reason}</p>
                </div>
                <a
                  class="btn btn-sm"
                  href={`https://es.dblegends.net/banner/${banner.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver en dblegends
                </a>
              </div>

              {banner.pools?.length ? (
                <div class="space-y-2">
                  {banner.pools.map((pool, i) => (
                    <div class="rounded-xl border border-line bg-panel2/50 p-3" key={`${banner.id}-${i}`}>
                      <p class="text-[0.65rem] uppercase tracking-widest text-muted font-bold mb-2">
                        {pool.title} {pool.count ? `· ${pool.count}` : ''} {pool.rate ? `· ${pool.rate}` : ''}
                      </p>
                      <div class="flex flex-wrap gap-2">
                        {pool.units.map((unit) => {
                          const owned = featured.some((f) => f.unit.id === unit.id && f.owned)
                          const tier = unit.card ? meta?.tiers?.[unit.card]?.tier : undefined
                          return (
                            <span class={owned ? 'chip chip-gold' : 'chip'} key={`${pool.title}-${unit.id}`}>
                              <img
                                src={charIconUrl(unit.id)}
                                alt=""
                                class="h-5 w-5 rounded object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
                                }}
                              />
                              <ElementDot element={unit.element} />
                              {unit.name}
                              <RarityChip rarity={unit.rarity} />
                              {tier ? <span class={tier === 'Z' ? 'text-fire font-bold' : 'text-gold font-bold'}>{tier}</span> : null}
                              {owned ? '✓' : ''}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {missing.length ? (
                <p class="text-xs text-muted">
                  Te faltan {missing.length} destacadas, entre ellas{' '}
                  <span class="text-text">{missing.slice(0, 4).map((u) => u.name).join(', ')}</span>.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div class="card p-6 text-center text-sm text-muted">No hay invocaciones activas en los datos actuales.</div>
      )}
    </Section>
  )
}
