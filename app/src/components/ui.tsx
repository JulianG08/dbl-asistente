import type { ComponentChildren } from 'preact'
import type { Character, Element, OwnedUnit, Rarity } from '../types'
import { ELEMENT_LABEL, RARITY_LABEL } from '../engine'

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

export function UnitLine({ character, owned }: { character: Character; owned?: OwnedUnit }) {
  return (
    <div class="flex items-center gap-2 min-w-0" title={`${character.name}${character.form ? ` · ${character.form}` : ''} (${character.card})`}>
      <ElementDot element={character.element} />
      <span class="truncate text-sm">{character.name}</span>
      <span class="text-[0.6rem] text-muted mono">{character.card}</span>
      <RarityChip rarity={character.rarity} />
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
