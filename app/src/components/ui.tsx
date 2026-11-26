import type { ComponentChildren } from 'preact'
import type { Character, Element, MetaData, OwnedUnit, Rarity } from '../types'
import { attackPower, ELEMENT_LABEL, RARITY_LABEL, tierOf } from '../engine'

export const ELEMENT_COLOR: Record<Element, string> = {
  RED: 'var(--color-red)',
  YEL: 'var(--color-yel)',
  PUR: 'var(--color-pur)',
  GRN: 'var(--color-grn)',
  BLU: 'var(--color-blu)',
  LGT: 'var(--color-lgt)',
  DRK: 'var(--color-drk)'
}

export function ElementDot({ element, withLabel = false }: { element: Element; withLabel?: boolean }) {
  return (
    <span class="inline-flex items-center gap-1" title={ELEMENT_LABEL[element] ?? element}>
      <span class="el-dot" style={{ background: ELEMENT_COLOR[element] ?? 'var(--color-muted)' }} />
      {withLabel ? <span class="text-[0.72rem] text-muted">{ELEMENT_LABEL[element] ?? element}</span> : null}
    </span>
  )
}

export function charIconUrl(id: number): string {
  return `${import.meta.env.BASE_URL}img/chars/${id}.webp`
}

export function equipIconUrl(id: number): string {
  return `${import.meta.env.BASE_URL}img/equips/${id}.webp`
}

export function CharAvatar({
  character,
  size = 28,
  className = ''
}: {
  character: { id: number }
  size?: number
  className?: string
}) {
  return (
    <img
      src={charIconUrl(character.id)}
      alt=""
      class={`rounded-md object-cover bg-panel2 shrink-0 ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
      }}
    />
  )
}

export function RarityChip({ rarity }: { rarity: Rarity }) {
  const cls =
    rarity === 'LEGEND'
      ? 'chip chip-fire'
      : rarity === 'ULTRA'
        ? 'chip chip-gold'
        : rarity === 'SPARKING'
          ? 'chip'
          : 'chip chip-muted'
  return <span class={cls}>{RARITY_LABEL[rarity] ?? rarity}</span>
}

export function Stars({ stars }: { stars: number }) {
  return <span class="text-[0.72rem] text-gold mono">{stars}★</span>
}

export function formatPower(character: Character): string {
  const atk = attackPower(character)
  if (!atk) return ''
  return atk >= 1_000_000 ? `${(atk / 1_000_000).toFixed(1)}M` : `${Math.round(atk / 1000)}k`
}

export function UnitMetrics({ character, meta }: { character: Character; meta?: MetaData }) {
  const tier = tierOf(character, meta)?.tier
  const mechanics = character.mechanics?.length ?? 0
  return (
    <>
      {character.maxStats ? (
        <span class="chip chip-muted" title="Ataque máximo (físico + energía)">
          {formatPower(character)}
        </span>
      ) : null}
      {tier ? (
        <span
          class={tier === 'Z' ? 'chip chip-fire' : tier === 'S' ? 'chip chip-gold' : 'chip chip-muted'}
          title={`Tier ${tier}${tierOf(character, meta)?.boost ? ` · boost ${tierOf(character, meta)?.boost}` : ''}`}
        >
          {tier}
        </span>
      ) : null}
      {mechanics ? (
        <span class="chip chip-muted" title={`Mecánicas modernas: ${character.mechanics?.join(', ')}`}>
          ⚙{mechanics}
        </span>
      ) : null}
    </>
  )
}

export function UnitLine({
  character,
  owned,
  meta,
  showMetrics = false
}: {
  character: Character
  owned?: OwnedUnit
  meta?: MetaData
  showMetrics?: boolean
}) {
  return (
    <div
      class={
        showMetrics
          ? 'flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0'
          : 'flex items-center gap-2 min-w-0'
      }
      title={`${character.name}${character.form ? ` · ${character.form}` : ''} (${character.card})`}
    >
      <CharAvatar character={character} size={28} />
      <ElementDot element={character.element} />
      <span class={showMetrics ? 'truncate text-sm max-w-[46%]' : 'truncate text-sm'}>{character.name}</span>
      {showMetrics ? null : <span class="text-[0.6rem] text-muted mono">{character.card}</span>}
      <RarityChip rarity={character.rarity} />
      {showMetrics ? <UnitMetrics character={character} meta={meta} /> : null}
      {owned ? <Stars stars={owned.stars} /> : null}
      {owned && owned.zenkai ? <span class="chip chip-fire">Z{owned.zenkai}</span> : null}
    </div>
  )
}

export function Section({
  title,
  subtitle,
  action,
  children
}: {
  title: string
  subtitle?: string
  action?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <section class="space-y-3">
      <div class="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-extrabold tracking-wide uppercase">{title}</h2>
          {subtitle ? <p class="text-xs text-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="card p-6 text-center text-sm text-muted">{children}</div>
}
