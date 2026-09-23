import { Check, CircleAlert } from 'lucide-react'
import { useMemo, useRef, type KeyboardEvent } from 'react'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { undoToast } from '@/app/undo-toast'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WowIcon } from '@/components/wow-icon'
import raceJson from '@/data/races/races.json'
import { racesForClass, racialEffectForClass, type Faction, type Race, type RaceData } from '@/data/races/types'
import { ChangedHint } from '@/features/changed-hint'
import { changeAndFocus, selectedOption } from '@/features/refocus'
import { Advanced, Field, SectionHeader } from '@/features/section'
import { CHOICE_ITEM } from '@/lib/choice'
import { cn } from '@/lib/utils'
import { defaultConfig, type RuleProfileId, type SimConfig } from '@/sim'
import { RULE_PROFILE_ID } from './classic-era-note'
import { changeRace, factionOf } from './faction-gear'
import { raceChangeMessage, raceSimulatable } from './races'

const raceData = raceJson as unknown as RaceData

/** Faction groups in the race picker (docs/ux.md "Character"). */
const FACTIONS: Faction[] = ['Alliance', 'Horde']

const PROFILE_LABEL: Record<RuleProfileId, string> = { forever: 'Forever', classicEra: 'Classic Era' }
const RATINGS_ID = 'unmeasured-ratings'

/** The selected race's tile, the race picker's one tab stop. */
const selectedRace = () => document.querySelector<HTMLElement>('[aria-labelledby="race-label"] [aria-checked="true"]')

export function CharacterSection() {
  const meta = useSpecMeta()
  const config = useSetup((s) => s.config)
  const update = useSetup((s) => s.update)
  const replace = useSetup((s) => s.replace)
  const races = racesForClass(raceData, meta.classId)
  const selected = races.find((r) => r.id === config.race) ?? races[0]
  // What a changed setting shows as its default, and resets to (docs/ux.md "Character", checklist 3).
  const defaults = useMemo(() => defaultConfig(meta.id), [meta.id])
  const defaultRace = races.find((r) => r.id === defaults.race)
  const raceChanged = defaultRace !== undefined && selected.id !== defaultRace.id
  const setRules = (patch: Partial<SimConfig['rules']>) => update((c) => ({ ...c, rules: { ...c.rules, ...patch } }))
  const profileChanged = config.rules.profile !== defaults.rules.profile
  const ratingsChanged = config.rules.unmeasuredRatings !== defaults.rules.unmeasuredRatings

  const pick = (race: Race) => {
    if (race.id === config.race) return
    const previous = config
    const change = changeRace(previous, race.id)
    update(() => change.config)
    const message = raceChangeMessage(change, race.faction)
    if (message) undoToast(message.title, () => replace(previous), { description: message.description })
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Character" description={`Level 60 ${meta.name} ${meta.className}.`} />

      <div className="flex flex-col gap-2">
        <span id="race-label" className="text-sm font-medium">
          Race
        </span>
        <RacePicker races={races} selected={selected} onPick={pick} describedBy={raceChanged ? 'race-default' : undefined} />
        {raceChanged && (
          <ChangedHint
            id="race-default"
            label="Race"
            value={defaultRace.name}
            onReset={() => changeAndFocus(() => pick(defaultRace), selectedRace)}
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{selected.name} racials</h3>
        <ul className="flex flex-col gap-3">
          {selected.racials.map((racial) => (
            <li key={racial.id} className="flex gap-3">
              <WowIcon icon={racial.icon} size="sm" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{racial.name}</span>
                <span className="text-sm text-muted-foreground">
                  {racialEffectForClass(racial, meta.classId) ?? 'No details yet.'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Opens by itself while a setting in it differs from its default, so Classic Era rules are never out of sight. */}
      <Advanced changed={Number(profileChanged) + Number(ratingsChanged)}>
        <div className="flex flex-col gap-2">
          <Field
            label="Rules"
            help={
              // What Classic Era changes and what stays Forever's (docs/architecture.md "Rules and stats"),
              // every exception named: the warrior's own Battle Shout, Recklessness and Berserker
              // Stance, and two items' procs.
              <span id="rules-help">
                Forever uses the Forever client’s numbers wherever it has them. Classic Era swaps in Classic’s combat rules; its raid
                buff, debuff, consumable and enchant values;{' '}
                {meta.classId === 'warrior' ? 'your Battle Shout, Recklessness and Berserker Stance; ' : ''}and the Hand of Justice
                and Ironfoe procs, so you can see what those Forever changes are worth. Racials, talents,{' '}
                {meta.classId === 'warrior' ? 'your other abilities' : 'abilities'} and the rest of your gear stay Forever’s.
              </span>
            }
          >
            <ToggleGroup
              id={RULE_PROFILE_ID}
              type="single"
              variant="outline"
              value={config.rules.profile}
              onValueChange={(profile) => profile && setRules({ profile: profile as RuleProfileId })}
              aria-label="Rules"
              aria-describedby={profileChanged ? 'rules-help rules-default' : 'rules-help'}
              className="w-full"
            >
              <ToggleGroupItem value="forever" className={cn('h-11 flex-1', CHOICE_ITEM)}>
                Forever
              </ToggleGroupItem>
              <ToggleGroupItem value="classicEra" className={cn('h-11 flex-1', CHOICE_ITEM)}>
                Classic Era
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {profileChanged && (
            <ChangedHint
              id="rules-default"
              label="Rules"
              value={PROFILE_LABEL[defaults.rules.profile]}
              onReset={() =>
                changeAndFocus(
                  () => setRules({ profile: defaults.rules.profile }),
                  () => selectedOption(RULE_PROFILE_ID),
                )
              }
            />
          )}
        </div>
        {/* The whole row is the switch's label, so it's one 44 px target (docs/ux.md "Accessibility"). */}
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Count untested ratings</span>
              <span id="unmeasured-help" className="text-xs text-muted-foreground">
                Expertise, haste and armor penetration are new in Forever and not measured yet. When on, the sim
                applies their best-guess effect. Turn off to see how much a result depends on them.
              </span>
            </span>
            <Switch
              id={RATINGS_ID}
              aria-label="Count untested ratings"
              aria-describedby={ratingsChanged ? 'unmeasured-help unmeasured-default' : 'unmeasured-help'}
              checked={config.rules.unmeasuredRatings === 'apply'}
              onCheckedChange={(on) => setRules({ unmeasuredRatings: on ? 'apply' : 'ignore' })}
            />
          </label>
          {/* Outside the label, since it has a button. */}
          {ratingsChanged && (
            <ChangedHint
              id="unmeasured-default"
              label="Count untested ratings"
              value={defaults.rules.unmeasuredRatings === 'apply' ? 'on' : 'off'}
              onReset={() =>
                changeAndFocus(
                  () => setRules({ unmeasuredRatings: defaults.rules.unmeasuredRatings }),
                  () => document.getElementById(RATINGS_ID),
                )
              }
            />
          )}
        </div>
      </Advanced>
    </div>
  )
}

/**
 * One radio group for every race, grouped by faction, with arrow-key movement and a single tab
 * stop (the selected race). A race the sim can't simulate yet says so in its tile and in its
 * description; it can still be picked, to see its racials, and a run explains why it can't go.
 */
function RacePicker({
  races,
  selected,
  onPick,
  describedBy,
}: {
  races: Race[]
  selected: Race
  onPick: (race: Race) => void
  /** The "Changed. Default: …" text, while the race isn't the default. */
  describedBy?: string
}) {
  const meta = useSpecMeta()
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const groups = FACTIONS.map((faction) => ({ faction, races: races.filter((r) => factionOf(r.id) === faction) })).filter(
    (g) => g.races.length > 0,
  )
  const order = groups.flatMap((g) => g.races)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = order.findIndex((r) => refs.current.get(r.id) === document.activeElement)
    if (index < 0) return
    const last = order.length - 1
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? index === last ? 0 : index + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? index === 0 ? last : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null
    if (next === null) return
    e.preventDefault()
    const race = order[next]
    refs.current.get(race.id)?.focus()
    onPick(race)
  }

  return (
    <div role="radiogroup" aria-labelledby="race-label" aria-describedby={describedBy} onKeyDown={onKeyDown} className="flex flex-col gap-4">
      {groups.map(({ faction, races: members }) => (
        <div key={faction} className="flex flex-col gap-2">
          <span id={`race-faction-${faction}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {faction}
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {members.map((race) => {
              const active = race.id === selected.id
              const available = raceSimulatable(meta.id, race.id)
              return (
                <button
                  key={race.id}
                  ref={(el) => {
                    if (el) refs.current.set(race.id, el)
                    else refs.current.delete(race.id)
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-labelledby={`race-${race.id}`}
                  aria-describedby={available ? `race-faction-${faction}` : `race-faction-${faction} race-${race.id}-reason`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onPick(race)}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors outline-none',
                    'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                    !available && 'col-span-2 border-dashed',
                    active && 'border-primary bg-muted',
                  )}
                >
                  <WowIcon icon={race.icon} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                    <span id={`race-${race.id}`} className="text-sm font-medium">
                      {race.name}
                    </span>
                    {!available && (
                      <span id={`race-${race.id}-reason`} className="flex items-start gap-1 text-xs text-muted-foreground">
                        <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                        Can’t be simulated yet: its base stats at level 60 aren’t known.
                      </span>
                    )}
                  </span>
                  {active && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
