import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { NumberField } from '@/components/number-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Advanced, Field, SectionHeader } from '@/features/section'
import { CHOICE_HINT, CHOICE_ITEM } from '@/lib/choice'
import { cn } from '@/lib/utils'
import type { ClassId, CreatureType, FightConfig } from '@/sim'
import { formatDuration } from './duration'
import { LengthSlider } from './length-slider'

// docs/mechanics/encounter.md#2-boss-armor
const ARMOR_PRESETS = [
  { value: 3731, label: '3,731', help: 'Most raid bosses' },
  { value: 3009, label: '3,009', help: 'Lightly armored bosses' },
]

const CREATURE_TYPES: { value: CreatureType; label: string }[] = [
  { value: 'none', label: 'Unspecified' },
  { value: 'beast', label: 'Beast' },
  { value: 'demon', label: 'Demon' },
  { value: 'dragonkin', label: 'Dragonkin' },
  { value: 'elemental', label: 'Elemental' },
  { value: 'giant', label: 'Giant' },
  { value: 'humanoid', label: 'Humanoid' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'undead', label: 'Undead' },
]

const ZONES: { value: FightConfig['zone']; label: string }[] = [
  { value: 'hyjal', label: 'Hyjal Summit' },
  { value: 'barrowDeeps', label: 'Barrow Deeps' },
  { value: 'onyxia', label: "Onyxia's Lair" },
  { value: 'other', label: 'Other' },
]

/** The ability the execute phase unlocks, per class (docs/mechanics/encounter.md#3-fight-length-and-execute-phase). */
const EXECUTE_ABILITY: Partial<Record<ClassId, string>> = { warrior: 'Execute', paladin: 'Hammer of Wrath' }

export function FightSection() {
  const meta = useSpecMeta()
  const fight = useSetup((s) => s.config.fight)
  const update = useSetup((s) => s.update)
  const set = (patch: Partial<FightConfig>) => update((c) => ({ ...c, fight: { ...c.fight, ...patch } }))
  const setBoss = (patch: Partial<FightConfig['boss']>) => set({ boss: { ...fight.boss, ...patch } })
  const run = useSetup((s) => s.config.run)
  const setRun = (patch: Partial<typeof run>) => update((c) => ({ ...c, run: { ...c.run, ...patch } }))
  const isPreset = ARMOR_PRESETS.some((p) => p.value === fight.bossArmor)
  const tank = meta.role === 'tank'
  const executeAbility = EXECUTE_ABILITY[meta.classId]

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Fight"
        description={`A level ${fight.bossLevel} ${fight.bossLevel === 63 ? 'raid boss' : 'boss'}, and how the fight plays out.`}
      />

      <Field
        label={
          <span className="flex items-baseline justify-between">
            <span id="fight-length-label">Fight length</span>
            <span className="tabular-nums text-muted-foreground">{formatDuration(fight.durationSec)}</span>
          </span>
        }
      >
        <LengthSlider
          min={30}
          max={600}
          step={15}
          value={fight.durationSec}
          onChange={(durationSec) => set({ durationSec })}
          labelledBy="fight-length-label"
        />
      </Field>

      <Field label="Boss armor" help="Before armor debuffs such as Sunder Armor, which you set under Buffs.">
        <ToggleGroup
          type="single"
          variant="outline"
          value={isPreset ? String(fight.bossArmor) : 'custom'}
          onValueChange={(v) => v && v !== 'custom' && set({ bossArmor: Number(v) })}
          aria-label="Boss armor"
          className="w-full items-stretch"
        >
          {ARMOR_PRESETS.map((p) => (
            <ToggleGroupItem key={p.value} value={String(p.value)} className={cn('h-auto min-h-14 flex-1 flex-col py-1.5', CHOICE_ITEM)}>
              <span className="tabular-nums">{p.label}</span>
              <span className={cn('text-center text-xs font-normal whitespace-normal', CHOICE_HINT)}>{p.help}</span>
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom" className={cn('h-auto min-h-14 flex-1', CHOICE_ITEM)} onClick={() => isPreset && set({ bossArmor: 3500 })}>
            Custom
          </ToggleGroupItem>
        </ToggleGroup>
        {!isPreset && (
          <NumberField value={fight.bossArmor} onChange={(bossArmor) => set({ bossArmor })} min={0} max={10000} step={1} aria-label="Custom boss armor" />
        )}
      </Field>

      {/* No "Enemies" control until multi-target is simulated (warrior.md §5.5, docs/ux.md "Fight"): the
          sim has one target. The config keeps `extraTargets`, so saved setups still load. */}
      <Field label="Position" help={tank ? 'Tanks face the boss: it can parry and block.' : 'Behind the boss, it can’t parry or block.'}>
        <ToggleGroup
          type="single"
          variant="outline"
          value={fight.position}
          onValueChange={(v) => v && set({ position: v as FightConfig['position'] })}
          aria-label="Position"
          className="w-full"
        >
          <ToggleGroupItem value="behind" className={cn('h-11 flex-1', CHOICE_ITEM)}>
            Behind
          </ToggleGroupItem>
          <ToggleGroupItem value="front" className={cn('h-11 flex-1', CHOICE_ITEM)}>
            In front
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {/* The whole row is the switch's label, so it's one 44 px target (docs/ux.md "Accessibility"). */}
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium">Execute phase</span>
          <span id="execute-help" className="text-xs text-muted-foreground">
            The last {fight.executePct || 20}% of the boss’s health{executeAbility ? `, when ${executeAbility} can be used` : ''}.
          </span>
        </span>
        <Switch
          aria-label="Execute phase"
          aria-describedby="execute-help"
          checked={fight.executePct > 0}
          onCheckedChange={(on) => set({ executePct: on ? 20 : 0 })}
        />
      </label>

      <Advanced>
        <Field
          label="Precision"
          help={
            run.mode === 'adaptive'
              ? 'Runs until the result is within about ±0.25% (95% confidence), between 1,000 and 50,000 fights.'
              : 'Always runs exactly this many fights.'
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              value={run.mode}
              onValueChange={(v) => v && setRun({ mode: v as typeof run.mode })}
              aria-label="Precision"
            >
              <ToggleGroupItem value="adaptive" className={cn('h-11 px-4', CHOICE_ITEM)}>
                Adaptive
              </ToggleGroupItem>
              <ToggleGroupItem value="fixed" className={cn('h-11 px-4', CHOICE_ITEM)}>
                Fixed
              </ToggleGroupItem>
            </ToggleGroup>
            {run.mode === 'fixed' && (
              <NumberField value={run.iterations} onChange={(iterations) => setRun({ iterations })} min={100} max={100000} step={100} aria-label="Number of fights" />
            )}
          </div>
        </Field>
        <Field label="Seed" htmlFor="fight-seed" help="The same setup and seed give exactly the same result on any device.">
          <NumberField id="fight-seed" value={run.seed} onChange={(seed) => setRun({ seed })} min={0} max={4294967295} step={1} aria-label="Random seed" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Length variation" htmlFor="fight-length-variation" help="Each simulated fight varies by up to this much.">
            <NumberField id="fight-length-variation" value={fight.durationVariationPct} onChange={(v) => set({ durationVariationPct: v })} min={0} max={25} unit="%" aria-label="Length variation" />
          </Field>
          {fight.executePct > 0 && (
            <Field label="Execute phase starts at" htmlFor="fight-execute-pct" help="Boss health remaining.">
              <NumberField id="fight-execute-pct" value={fight.executePct} onChange={(v) => set({ executePct: v })} min={1} max={50} unit="%" aria-label="Execute phase threshold" />
            </Field>
          )}
          <Field label="Boss level" htmlFor="fight-boss-level">
            <NumberField id="fight-boss-level" value={fight.bossLevel} onChange={(v) => set({ bossLevel: v })} min={60} max={63} aria-label="Boss level" />
          </Field>
          <Field label="Creature type" htmlFor="fight-creature-type" help="Some racials and items only work against certain types.">
            <Select value={fight.creatureType} onValueChange={(v) => set({ creatureType: v as CreatureType })}>
              {/* The trigger's size attribute sets its height, so the 44 px target overrides that. */}
              <SelectTrigger id="fight-creature-type" className="w-full data-[size=default]:h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATURE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="min-h-11">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Zone" htmlFor="fight-zone" help="Some Forever consumables only work in certain zones.">
            <Select value={fight.zone} onValueChange={(v) => set({ zone: v as FightConfig['zone'] })}>
              <SelectTrigger id="fight-zone" className="w-full data-[size=default]:h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map((z) => (
                  <SelectItem key={z.value} value={z.value} className="min-h-11">
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!tank && (
            <Field label="Damage you take" help="For effects that trigger when you’re hit, such as Enrage. At 0 they never trigger.">
              <NumberField value={fight.damageTakenPerSec} onChange={(v) => set({ damageTakenPerSec: v })} min={0} max={500} step={10} unit="/s" aria-label="Damage taken per second" />
            </Field>
          )}
        </div>

        {tank && (
          <div className="flex flex-col gap-5">
            <h3 className="text-sm font-medium">Boss melee</h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Swing speed">
                <NumberField value={fight.boss.swingSpeedSec} onChange={(v) => setBoss({ swingSpeedSec: v })} min={1} max={4} step={0.1} unit="s" aria-label="Boss swing speed" />
              </Field>
              <Field label="Damage per swing" help="Before your armor.">
                <div className="flex flex-wrap items-center gap-2">
                  <NumberField value={fight.boss.damageMin} onChange={(v) => setBoss({ damageMin: Math.min(v, fight.boss.damageMax) })} min={0} max={20000} step={100} aria-label="Minimum damage per swing" />
                  <span className="text-muted-foreground">to</span>
                  <NumberField value={fight.boss.damageMax} onChange={(v) => setBoss({ damageMax: Math.max(v, fight.boss.damageMin) })} min={0} max={20000} step={100} aria-label="Maximum damage per swing" />
                </div>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['canCrush', 'Crushing blows'],
                  ['parryHaste', 'Parry speeds up the boss'],
                  ['canDodge', 'Boss can dodge'],
                  ['canParry', 'Boss can parry'],
                  ['canBlock', 'Boss can block'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex min-h-11 items-center justify-between gap-4 text-sm">
                  {label}
                  <Switch checked={fight.boss[key]} onCheckedChange={(on) => setBoss({ [key]: on })} />
                </label>
              ))}
            </div>
          </div>
        )}
      </Advanced>
    </div>
  )
}
