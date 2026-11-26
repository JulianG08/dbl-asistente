import { useMemo, useState } from 'preact/hooks'
import type { Box, Character, Equipment, OwnedEquipment, TagInfo } from '../types'
import type { EquipmentPick, EquipmentRecommendation, PartyPlan, TeamPlan } from '../engine'
import { completeTeam, ELEMENT_LABEL, improveTeam, recommendEquipment, teamEquipment } from '../engine'
import { CharAvatar, ElementDot, RarityChip, Section, UnitLine, equipIconUrl } from './ui'

export function TeamsView({
  teams,
  parties,
  characters,
  tags,
  box,
  equipment,
  userEquipment
}: {
  teams: TeamPlan[]
  parties: PartyPlan[]
  characters: Character[]
  tags: TagInfo[]
  box: Box
  equipment: Equipment[]
  userEquipment: Record<string, OwnedEquipment>
}) {
  return (
    <div class="space-y-8">
      <TeamBuilder characters={characters} tags={tags} box={box} equipment={equipment} userEquipment={userEquipment} />

      <Section
        title="Equipos recomendados"
        subtitle="Calculados con tus estrellas, Zenkai, tags compartidos y cobertura de elementos"
      >
        {teams.length ? (
          <div class="space-y-4">
            {teams.map((team, index) => (
              <TeamCard key={team.tag.id} team={team} index={index} equipment={equipment} userEquipment={userEquipment} />
            ))}
          </div>
        ) : (
          <div class="card p-6 text-center text-sm text-muted">
            Importa tu caja para generar equipos. Se necesitan al menos 6 personajes que compartan un tag.
          </div>
        )}
      </Section>

      {parties.length ? (
        <Section title="Tus equipos guardados" subtitle="Los que tienes configurados en el juego · mejóralos con un clic">
          <div class="grid gap-3 md:grid-cols-2">
            {parties.map((party) => (
              <SavedPartyCard
                key={party.name}
                party={party}
                characters={characters}
                tags={tags}
                box={box}
                equipment={equipment}
                userEquipment={userEquipment}
              />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- constructor

function TeamBuilder({
  characters,
  tags,
  box,
  equipment,
  userEquipment
}: {
  characters: Character[]
  tags: TagInfo[]
  box: Box
  equipment: Equipment[]
  userEquipment: Record<string, OwnedEquipment>
}) {
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<number[]>([])
  const [result, setResult] = useState<{ team: TeamPlan; recs: EquipmentRecommendation[] } | null>(null)
  const [error, setError] = useState('')

  const allCharacters = useMemo(() => characters.filter((c) => !c.extra), [characters])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allCharacters
      .filter((c) => `${c.name} ${c.form}`.toLowerCase().includes(q))
      .slice(0, 12)
  }, [allCharacters, query])

  function add(id: number) {
    if (selection.length >= 6 || selection.includes(id)) return
    setSelection([...selection, id])
    setError('')
  }

  function remove(id: number) {
    setSelection(selection.filter((x) => x !== id))
  }

  function build() {
    if (!selection.length) {
      setError('Selecciona al menos un personaje.')
      return
    }
    const team = completeTeam(selection, characters, tags, box)
    if (!team) {
      setResult(null)
      setError('No encontré suficientes personajes con tags en común. Prueba con otro personaje.')
      return
    }
    setError('')
    setResult({ team, recs: teamEquipment(team, equipment, userEquipment) })
  }

  return (
    <Section title="Constructor de equipo" subtitle="Elige 1–6 personajes y completo el equipo por sinergia y cobertura">
      <div class="card p-4 space-y-4">
        <div class="space-y-2">
          <input
            type="search"
            placeholder="Busca un personaje de tu caja…"
            value={query}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
          />
          {matches.length ? (
            <div class="flex flex-wrap gap-2">
              {matches.map((c) => {
                const owned = box[String(c.id)]
                return (
                  <button class={owned ? 'chip hover:border-gold' : 'chip chip-muted'} onClick={() => add(c.id)} key={c.id}>
                    <CharAvatar character={c} size={20} />
                    {c.name}
                    <span class="text-muted">{owned ? `${owned.stars}★` : 'no lo tienes'}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <div class="flex flex-wrap items-center gap-2 min-h-[34px]">
          {selection.length ? (
            selection.map((id) => {
              const c = characters.find((x) => x.id === id)
              if (!c) return null
              const owned = box[String(id)]
              return (
                <button
                  class={owned ? 'chip chip-gold' : 'chip chip-muted'}
                  onClick={() => remove(id)}
                  title="Quitar"
                  key={id}
                >
                  <CharAvatar character={c} size={20} />
                  {c.name} {owned ? `${owned.stars}★` : '(no lo tienes)'} ✕
                </button>
              )
            })
          ) : (
            <span class="text-xs text-muted">Aún no has seleccionado personajes.</span>
          )}
          <div class="ml-auto flex gap-2">
            <button class="btn btn-sm" onClick={() => setSelection([])} disabled={!selection.length}>
              Limpiar
            </button>
            <button class="btn btn-sm btn-gold" onClick={build} disabled={!selection.length}>
              Completar equipo
            </button>
          </div>
        </div>

        {error ? <p class="text-xs text-fire">{error}</p> : null}
      </div>

      {result ? (
        <div class="mt-4">
          <TeamCard
            team={result.team}
            index={0}
            equipment={equipment}
            userEquipment={userEquipment}
            recs={result.recs}
            openEquipment
            title={`Equipo completado · ${result.team.tag.name}`}
          />
        </div>
      ) : null}
    </Section>
  )
}

// ---------------------------------------------------------------- tarjetas

function TeamCard({
  team,
  index,
  equipment,
  userEquipment,
  recs,
  openEquipment = false,
  title
}: {
  team: TeamPlan
  index: number
  equipment: Equipment[]
  userEquipment: Record<string, OwnedEquipment>
  recs?: EquipmentRecommendation[]
  openEquipment?: boolean
  title?: string
}) {
  const equipmentRecs = useMemo(
    () => recs ?? teamEquipment(team, equipment, userEquipment),
    [recs, team, equipment, userEquipment]
  )

  return (
    <article class="card p-4 sm:p-5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2 flex-wrap">
          {title ? <span class="chip chip-gold">{title}</span> : <span class="chip chip-gold">#{index + 1}</span>}
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
            <div class="flex items-center justify-between gap-2" key={u.character.id}>
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
          <span class="chip" key={r}>
            {r}
          </span>
        ))}
      </div>

      <details class="rounded-xl border border-line bg-panel2/40 p-3" open={openEquipment}>
        <summary class="text-xs font-bold text-muted uppercase tracking-widest">
          Equipamiento recomendado (lo tuyo + lo mejor)
        </summary>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          {equipmentRecs.map((rec) => (
            <EquipmentForCharacter key={rec.character.id} rec={rec} />
          ))}
        </div>
      </details>

      {team.missing.length ? (
        <div class="rounded-xl border border-dashed border-line p-3">
          <p class="text-[0.65rem] uppercase tracking-widest text-muted font-bold mb-1">
            Mejoras posibles (no las tienes)
          </p>
          <div class="flex flex-wrap gap-2">
            {team.missing.map((c) => (
              <span class="chip" key={c.id}>
                <CharAvatar character={c} size={20} />
                {c.name}
                <RarityChip rarity={c.rarity} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function SavedPartyCard({
  party,
  characters,
  tags,
  box,
  equipment,
  userEquipment
}: {
  party: PartyPlan
  characters: Character[]
  tags: TagInfo[]
  box: Box
  equipment: Equipment[]
  userEquipment: Record<string, OwnedEquipment>
}) {
  const [improvement, setImprovement] = useState<ReturnType<typeof improveTeam>>(null)
  const [showEquipment, setShowEquipment] = useState(false)

  const members = party.members
  const recs = useMemo(
    () => members.flatMap((m) => recommendEquipment(m.character, equipment, userEquipment)),
    [members, equipment, userEquipment]
  )

  return (
    <article class="card p-4 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-bold">
          {party.name} {party.active ? <span class="chip chip-gold">ACTIVO</span> : null}
        </h3>
        <span class="chip chip-muted">media {party.avgScore.toFixed(1)}</span>
      </div>
      <div class="space-y-1">
        {members.map((m) => (
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

      <div class="flex flex-wrap gap-2 pt-1">
        <button
          class="btn btn-sm btn-gold"
          onClick={() => setImprovement(improveTeam(party.members.map((m) => m.character.id), characters, tags, box))}
        >
          Mejorar equipo
        </button>
        <button class="btn btn-sm" onClick={() => setShowEquipment((v) => !v)}>
          {showEquipment ? 'Ocultar equipamiento' : 'Ver equipamiento'}
        </button>
      </div>

      {showEquipment ? (
        <div class="grid gap-2 sm:grid-cols-2 pt-2">
          {recs.map((rec) => (
            <EquipmentForCharacter key={rec.character.id} rec={rec} />
          ))}
        </div>
      ) : null}

      {improvement ? (
        <div class="rounded-xl border border-gold/40 bg-gold/5 p-3 space-y-2">
          <p class="text-xs font-bold text-gold">
            {improvement.scoreDelta > 0.05
              ? `Mejora propuesta: +${improvement.scoreDelta.toFixed(1)} pts`
              : 'Tu equipo ya es óptimo dentro de tu caja para su tag principal'}
          </p>
          {improvement.changes.length ? (
            <ul class="space-y-1">
              {improvement.changes.map((c, i) => (
                <li class="text-xs text-muted" key={`${c.in.character.id}-${i}`}>
                  <span class="text-fire">− {c.out.character.name}</span>{' '}
                  <span class="text-text">+ {c.in.character.name}</span>{' '}
                  <span class="text-muted">({c.in.owned.stars}★{c.in.owned.zenkai ? ` Z${c.in.owned.zenkai}` : ''})</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div class="grid gap-2 sm:grid-cols-2">
            {improvement.proposed.map((u) => (
              <EquipmentForCharacter
                key={u.character.id}
                rec={recommendEquipment(u.character, equipment, userEquipment)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

// ---------------------------------------------------------------- equipamiento

function EquipmentForCharacter({ rec }: { rec: EquipmentRecommendation }) {
  const ownedPicks = rec.owned.slice(0, 2)
  const missingPicks = rec.best.filter((p) => !p.owned).slice(0, 2)

  return (
    <div class="rounded-lg border border-line bg-panel/60 p-2.5">
      <div class="flex items-center gap-2 mb-1.5">
        <CharAvatar character={rec.character} size={24} />
        <span class="text-xs font-bold truncate">{rec.character.name}</span>
      </div>
      {ownedPicks.length || missingPicks.length ? (
        <div class="space-y-1.5">
          {ownedPicks.map((p) => (
            <EquipRow key={`own-${p.equip.id}`} pick={p} owned />
          ))}
          {missingPicks.map((p) => (
            <EquipRow key={`best-${p.equip.id}`} pick={p} />
          ))}
        </div>
      ) : (
        <p class="text-[0.65rem] text-muted">No encontré equipamiento compatible con este personaje.</p>
      )}
    </div>
  )
}

function EquipRow({ pick, owned }: { pick: EquipmentPick; owned?: boolean }) {
  const equip = pick.equip
  const effect = equip.slots?.[0]?.options?.at(-1) ?? equip.desc ?? ''
  const obtain = equip.obtain?.[0]

  return (
    <div class="flex items-start gap-2">
      <img
        src={equipIconUrl(equip.id)}
        alt=""
        class="h-8 w-8 rounded object-cover bg-panel2 shrink-0"
        loading="lazy"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
        }}
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1 min-w-0">
          <span class="text-[0.72rem] truncate">{equip.name}</span>
          <span class="chip chip-muted">{equip.rarityLabel}</span>
        </div>
        {effect ? (
          <p class="text-[0.6rem] text-muted truncate" title={effect}>
            {effect}
          </p>
        ) : null}
        <p class={`text-[0.6rem] ${owned ? 'text-gold' : 'text-muted'}`}>
          {owned
            ? `Ya lo tienes${pick.owned?.bestRank != null ? ` · rank ${pick.owned.bestRank}` : ''}${pick.owned?.count && pick.owned.count > 1 ? ` · ×${pick.owned.count}` : ''}`
            : obtain
              ? `Te falta · ${obtain.kind || 'Fuente'}: ${obtain.name}`
              : 'Te falta'}
        </p>
      </div>
    </div>
  )
}
