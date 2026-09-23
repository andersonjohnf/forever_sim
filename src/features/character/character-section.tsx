import { Check } from 'lucide-react'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WowIcon } from '@/components/wow-icon'
import raceJson from '@/data/races/races.json'
import { racesForClass, racialEffectForClass, type RaceData } from '@/data/races/types'
import { Advanced, Field, SectionHeader } from '@/features/section'
import { CHOICE_ITEM } from '@/lib/choice'
import { cn } from '@/lib/utils'
import type { RuleProfileId } from '@/sim'

const raceData = raceJson as unknown as RaceData

export function CharacterSection() {
  const meta = useSpecMeta()
  const config = useSetup((s) => s.config)
  const update = useSetup((s) => s.update)
  const races = racesForClass(raceData, meta.classId)
  const selected = races.find((r) => r.id === config.race) ?? races[0]

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Character" description={`Level 60 ${meta.name} ${meta.className}.`} />

      <Field label="Race">
        <div role="radiogroup" aria-label="Race" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {races.map((race) => {
            const active = race.id === selected.id
            return (
              <button
                key={race.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update((c) => ({ ...c, race: race.id }))}
                className={cn(
                  'flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors outline-none',
                  'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                  active && 'border-primary bg-muted',
                )}
              >
                <WowIcon icon={race.icon} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium">{race.name}</span>
                  <span className="text-xs text-muted-foreground">{race.faction}</span>
                </span>
                {active && <Check className="size-4 shrink-0" aria-hidden />}
              </button>
            )
          })}
        </div>
      </Field>

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

      <Advanced>
        <Field
          label="Rules"
          help="Forever uses the beta client's numbers where they exist. Classic Era uses Classic numbers everywhere they differ, so you can see how much the Forever changes matter."
        >
          <ToggleGroup
            type="single"
            variant="outline"
            value={config.rules.profile}
            onValueChange={(profile) =>
              profile && update((c) => ({ ...c, rules: { ...c.rules, profile: profile as RuleProfileId } }))
            }
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="unmeasured" className="text-sm font-medium">
              Count untested ratings
            </label>
            <p className="text-xs text-muted-foreground">
              Expertise, haste and armor penetration are new in Forever and not measured yet. When on, the sim
              applies their best-guess effect. Turn off to see how much a result depends on them.
            </p>
          </div>
          <Switch
            id="unmeasured"
            checked={config.rules.unmeasuredRatings === 'apply'}
            onCheckedChange={(on) =>
              update((c) => ({ ...c, rules: { ...c.rules, unmeasuredRatings: on ? 'apply' : 'ignore' } }))
            }
          />
        </div>
      </Advanced>
    </div>
  )
}
