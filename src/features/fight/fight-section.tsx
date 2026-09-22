import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { NumberField } from '@/components/number-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Advanced, Field, SectionHeader } from '@/features/section'
import type { CreatureType, FightConfig } from '@/sim'

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

const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

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

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Fight" description="A level 63 raid boss, and how the fight plays out." />

      <Field
        label={
          <span className="flex items-baseline justify-between">
            Fight length <span className="tabular-nums text-muted-foreground">{formatDuration(fight.durationSec)}</span>
          </span>
        }
      >
        <Slider
          min={30}
          max={600}
          step={15}
          value={[fight.durationSec]}
          onValueChange={([durationSec]) => set({ durationSec })}
          aria-label="Fight length in seconds"
          className="py-3"
        />
      </Field>

      <Field label="Boss armor" help="Before armor debuffs such as Sunder Armor, which you set under Buffs.">
        <ToggleGroup
          type="single"
          variant="outline"
          value={isPreset ? String(fight.bossArmor) : 'custom'}
          onValueChange={(v) => v && v !== 'custom' && set({ bossArmor: Number(v) })}
          className="w-full items-stretch"
        >
          {ARMOR_PRESETS.map((p) => (
            <ToggleGroupItem key={p.value} value={String(p.value)} className="h-auto min-h-14 flex-1 flex-col py-1.5">
              <span className="tabular-nums">{p.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{p.help}</span>
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom" className="h-auto min-h-14 flex-1" onClick={() => isPreset && set({ bossArmor: 3500 })}>
            Custom
          </ToggleGroupItem>
        </ToggleGroup>
        {!isPreset && (
          <NumberField value={fight.bossArmor} onChange={(bossArmor) => set({ bossArmor })} min={0} max={10000} step={1} aria-label="Custom boss armor" />
        )}
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Position" help={tank ? 'Tanks face the boss: it can parry and block.' : 'Behind the boss, it can’t parry or block.'}>
          <ToggleGroup
            type="single"
            variant="outline"
            value={fight.position}
            onValueChange={(v) => v && set({ position: v as FightConfig['position'] })}
            className="w-full"
          >
            <ToggleGroupItem value="behind" className="h-11 flex-1">
              Behind
            </ToggleGroupItem>
            <ToggleGroupItem value="front" className="h-11 flex-1">
              In front
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field label="Enemies" help="Extra enemies in range of cleaves and area attacks.">
          <NumberField
            value={fight.extraTargets + 1}
            onChange={(n) => set({ extraTargets: n - 1 })}
            min={1}
            max={5}
            aria-label="Number of enemies"
          />
        </Field>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="execute" className="text-sm font-medium">
            Execute phase
          </label>
          <p className="text-xs text-muted-foreground">
            The last {fight.executePct || 20}% of the boss’s health, when Execute and Hammer of Wrath work.
          </p>
        </div>
        <Switch id="execute" checked={fight.executePct > 0} onCheckedChange={(on) => set({ executePct: on ? 20 : 0 })} />
      </div>

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
            >
              <ToggleGroupItem value="adaptive" className="h-11 px-4">
                Adaptive
              </ToggleGroupItem>
              <ToggleGroupItem value="fixed" className="h-11 px-4">
                Fixed
              </ToggleGroupItem>
            </ToggleGroup>
            {run.mode === 'fixed' && (
              <NumberField value={run.iterations} onChange={(iterations) => setRun({ iterations })} min={100} max={100000} step={100} aria-label="Number of fights" />
            )}
          </div>
        </Field>
        <Field label="Seed" help="The same setup and seed give exactly the same result on any device.">
          <NumberField value={run.seed} onChange={(seed) => setRun({ seed })} min={0} max={4294967295} step={1} aria-label="Random seed" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Length variation" help="Each simulated fight varies by up to this much.">
            <NumberField value={fight.durationVariationPct} onChange={(v) => set({ durationVariationPct: v })} min={0} max={25} unit="%" aria-label="Length variation" />
          </Field>
          {fight.executePct > 0 && (
            <Field label="Execute phase starts at" help="Boss health remaining.">
              <NumberField value={fight.executePct} onChange={(v) => set({ executePct: v })} min={1} max={50} unit="%" aria-label="Execute phase threshold" />
            </Field>
          )}
          <Field label="Boss level">
            <NumberField value={fight.bossLevel} onChange={(v) => set({ bossLevel: v })} min={60} max={63} aria-label="Boss level" />
          </Field>
          <Field label="Creature type" help="Some racials and items only work against certain types.">
            <Select value={fight.creatureType} onValueChange={(v) => set({ creatureType: v as CreatureType })}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATURE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="min-h-10">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Zone" help="Some Forever consumables only work in certain zones.">
            <Select value={fight.zone} onValueChange={(v) => set({ zone: v as FightConfig['zone'] })}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map((z) => (
                  <SelectItem key={z.value} value={z.value} className="min-h-10">
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!tank && (
            <Field label="Damage you take" help="For effects that trigger when you’re hit.">
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
