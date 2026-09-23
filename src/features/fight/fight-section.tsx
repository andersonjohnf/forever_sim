import { useMemo, type ReactNode } from 'react'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { NumberField } from '@/components/number-field'
import { SelectContent } from '@/components/select-content'
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ChangedHint } from '@/features/changed-hint'
import { changeAndFocus, selectedOption } from '@/features/refocus'
import { Advanced, Field, SectionHeader } from '@/features/section'
import { CREATURE_TYPES, FIGHT_ADVANCED_ID } from './ids'
import { CHOICE_HINT, CHOICE_ITEM } from '@/lib/choice'
import { cn } from '@/lib/utils'
import { defaultConfig, type ClassId, type CreatureType, type FightConfig, type SimConfig, type SpecId } from '@/sim'
import { formatDuration } from './duration'
import { LengthSlider } from './length-slider'

// docs/mechanics/encounter.md#2-boss-armor
const ARMOR_PRESETS = [
  { value: 3731, label: '3,731', help: 'Most raid bosses' },
  { value: 3009, label: '3,009', help: 'Lightly armored bosses' },
]

const ZONES: { value: FightConfig['zone']; label: string }[] = [
  { value: 'hyjal', label: 'Hyjal Summit' },
  { value: 'barrowDeeps', label: 'Barrow Deeps' },
  { value: 'onyxia', label: "Onyxia's Lair" },
  { value: 'other', label: 'Other' },
]

const POSITIONS: Record<FightConfig['position'], string> = { behind: 'Behind', front: 'In front' }
const PRECISION: Record<SimConfig['run']['mode'], string> = { adaptive: 'Adaptive', fixed: 'Fixed' }

const BOSS_SWITCHES = [
  ['canCrush', 'Crushing blows'],
  ['parryHaste', 'Parry speeds up the boss'],
  ['canDodge', 'Boss can dodge'],
  ['canParry', 'Boss can parry'],
  ['canBlock', 'Boss can block'],
] as const
type BossSwitch = (typeof BOSS_SWITCHES)[number][0]

/**
 * The ability the execute phase unlocks, per class (docs/mechanics/encounter.md#3-fight-length-and-execute-phase).
 * A class without one reads nothing from the phase (a druid's rotations, druid.md §6.2), so its
 * Fight tab leaves the phase out: a control that changes nothing isn't shown (docs/ux.md "Fight").
 */
const EXECUTE_ABILITY: Partial<Record<ClassId, string>> = { warrior: 'Execute', paladin: 'Hammer of Wrath' }

/** What a DPS spec loses in front of the boss besides its parry and block (the cat's Shred, druid.md §3.1). */
const FRONT_NOTE: Partial<Record<SpecId, string>> = { 'druid-feral-cat': ' You can’t Shred there, so Claw builds instead.' }

/**
 * What the damage a DPS player takes does, per class (docs/ux.md "Fight"). A class without an entry
 * has nothing that reacts to being hit (a cat: no rage in Cat Form, and no talent, item or buff of
 * its fires on a hit, druid.md §8; a Retribution paladin: no rage, and no talent, item or buff that
 * fires on a hit), so its Fight tab leaves the field out: a control that changes nothing isn't
 * shown. Saved setups keep the value.
 */
const DAMAGE_TAKEN_HELP: Partial<Record<ClassId, string>> = {
  warrior: 'What the boss deals you per second, before your armor. Each hit gives rage and can trigger Enrage. At 0 you’re never hit.',
}

/** What else the creature type decides, per spec: Retribution's Exorcism (paladin.md#other-abilities). */
const CREATURE_NOTE: Partial<Record<SpecId, string>> = { 'paladin-retribution': ' Exorcism can only be cast on Undead and Demons.' }

const number = (n: number) => n.toLocaleString('en-US')

/** Element ids: each control, and the "Changed. Default: …" text that describes it. */
const ids = (key: string) => ({ control: `fight-${key}`, default: `fight-${key}-default` })
const byId = (id: string) => () => document.getElementById(id)

export function FightSection() {
  const meta = useSpecMeta()
  const fight = useSetup((s) => s.config.fight)
  const update = useSetup((s) => s.update)
  const set = (patch: Partial<FightConfig>) => update((c) => ({ ...c, fight: { ...c.fight, ...patch } }))
  const setBoss = (patch: Partial<FightConfig['boss']>) => update((c) => ({ ...c, fight: { ...c.fight, boss: { ...c.fight.boss, ...patch } } }))
  const run = useSetup((s) => s.config.run)
  const setRun = (patch: Partial<typeof run>) => update((c) => ({ ...c, run: { ...c.run, ...patch } }))
  const isPreset = ARMOR_PRESETS.some((p) => p.value === fight.bossArmor)
  const tank = meta.role === 'tank'
  const executeAbility = EXECUTE_ABILITY[meta.classId]
  const usesExecute = executeAbility !== undefined
  const damageTakenHelp = tank ? undefined : DAMAGE_TAKEN_HELP[meta.classId]

  // Each setting that differs from the spec's default says so, with a Reset (docs/ux.md "Fight",
  // checklist 3). A reset moves focus to the setting's control, since the Reset button goes away.
  const defaults = useMemo(() => defaultConfig(meta.id), [meta.id])
  const def = defaults.fight
  const hint = (key: string, label: string, changed: boolean, value: string, reset: () => void, target = byId(ids(key).control)): ReactNode =>
    changed && <ChangedHint id={ids(key).default} label={label} value={value} onReset={() => changeAndFocus(reset, target)} />
  const describedBy = (changed: boolean, key: string, ...others: string[]) => [...others, changed && ids(key).default].filter(Boolean).join(' ') || undefined

  const changed = {
    length: fight.durationSec !== def.durationSec,
    armor: fight.bossArmor !== def.bossArmor,
    position: fight.position !== def.position,
    execute: usesExecute && fight.executePct > 0 !== def.executePct > 0,
    // Advanced
    precision: run.mode !== defaults.run.mode,
    iterations: run.mode === 'fixed' && run.iterations !== defaults.run.iterations,
    seed: run.seed !== defaults.run.seed,
    variation: fight.durationVariationPct !== def.durationVariationPct,
    executePct: usesExecute && fight.executePct > 0 && fight.executePct !== def.executePct,
    bossLevel: fight.bossLevel !== def.bossLevel,
    creatureType: fight.creatureType !== def.creatureType,
    zone: fight.zone !== def.zone,
    damageTaken: damageTakenHelp !== undefined && fight.damageTakenPerSec !== def.damageTakenPerSec,
    swingSpeed: tank && fight.boss.swingSpeedSec !== def.boss.swingSpeedSec,
    swingDamage: tank && (fight.boss.damageMin !== def.boss.damageMin || fight.boss.damageMax !== def.boss.damageMax),
    ...(Object.fromEntries(BOSS_SWITCHES.map(([key]) => [key, tank && fight.boss[key] !== def.boss[key]])) as Record<BossSwitch, boolean>),
  }
  const advancedKeys = ['precision', 'iterations', 'seed', 'variation', 'executePct', 'bossLevel', 'creatureType', 'zone', 'damageTaken', 'swingSpeed', 'swingDamage', ...BOSS_SWITCHES.map(([key]) => key)] as const
  const advancedChanged = advancedKeys.filter((key) => changed[key]).length

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
        changed={hint('length', 'Fight length', changed.length, formatDuration(def.durationSec), () => set({ durationSec: def.durationSec }))}
      >
        <LengthSlider
          id={ids('length').control}
          min={30}
          max={600}
          step={15}
          value={fight.durationSec}
          onChange={(durationSec) => set({ durationSec })}
          labelledBy="fight-length-label"
          describedBy={describedBy(changed.length, 'length')}
        />
      </Field>

      <Field
        label="Boss armor"
        help="Before armor debuffs such as Sunder Armor, which you set under Buffs."
        changed={hint('armor', 'Boss armor', changed.armor, number(def.bossArmor), () => set({ bossArmor: def.bossArmor }), () => selectedOption(ids('armor').control))}
      >
        <ToggleGroup
          id={ids('armor').control}
          type="single"
          variant="outline"
          value={isPreset ? String(fight.bossArmor) : 'custom'}
          onValueChange={(v) => v && v !== 'custom' && set({ bossArmor: Number(v) })}
          aria-label="Boss armor"
          aria-describedby={describedBy(changed.armor, 'armor')}
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
          <NumberField value={fight.bossArmor} onChange={(bossArmor) => set({ bossArmor })} min={0} max={10000} step={1} grouping aria-label="Custom boss armor" />
        )}
      </Field>

      {/* No "Enemies" control until multi-target is simulated (warrior.md §5.5, docs/ux.md "Fight"): the
          sim has one target. The config keeps `extraTargets`, so saved setups still load. */}
      <Field
        label="Position"
        // Follows the chosen position, so a DPS spec moved in front hears what that changes.
        help={
          fight.position === 'behind'
            ? 'Behind the boss, it can’t parry or block.'
            : tank
              ? 'Tanks face the boss: it can parry and block.'
              : `In front of the boss, it can parry and block your attacks.${FRONT_NOTE[meta.id] ?? ''}`
        }
        changed={hint('position', 'Position', changed.position, POSITIONS[def.position], () => set({ position: def.position }), () => selectedOption(ids('position').control))}
      >
        <ToggleGroup
          id={ids('position').control}
          type="single"
          variant="outline"
          value={fight.position}
          onValueChange={(v) => v && set({ position: v as FightConfig['position'] })}
          aria-label="Position"
          aria-describedby={describedBy(changed.position, 'position')}
          className="w-full"
        >
          <ToggleGroupItem value="behind" className={cn('h-11 flex-1', CHOICE_ITEM)}>
            {POSITIONS.behind}
          </ToggleGroupItem>
          <ToggleGroupItem value="front" className={cn('h-11 flex-1', CHOICE_ITEM)}>
            {POSITIONS.front}
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {usesExecute && (
        <div className="flex flex-col gap-2">
          {/* The whole row is the switch's label, so it's one 44 px target (docs/ux.md "Accessibility"). */}
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Execute phase</span>
              <span id="execute-help" className="text-xs text-muted-foreground">
                The last {fight.executePct || 20}% of the boss’s health, when {executeAbility} can be used.
              </span>
            </span>
            <Switch
              id={ids('execute').control}
              aria-label="Execute phase"
              aria-describedby={describedBy(changed.execute, 'execute', 'execute-help')}
              checked={fight.executePct > 0}
              onCheckedChange={(on) => set({ executePct: on ? 20 : 0 })}
            />
          </label>
          {/* Outside the label, since it has a button. */}
          {hint('execute', 'Execute phase', changed.execute, def.executePct > 0 ? 'on' : 'off', () => set({ executePct: def.executePct }))}
        </div>
      )}

      <Advanced changed={advancedChanged} id={FIGHT_ADVANCED_ID}>
        <Field
          label="Precision"
          help={
            run.mode === 'adaptive'
              ? 'Runs until the result is within about ±0.25% (95% confidence), between 1,000 and 50,000 fights.'
              : 'Always runs exactly the number of fights you set below.'
          }
          changed={hint('precision', 'Precision', changed.precision, PRECISION[defaults.run.mode], () => setRun({ mode: defaults.run.mode }), () => selectedOption(ids('precision').control))}
        >
          <ToggleGroup
            id={ids('precision').control}
            type="single"
            variant="outline"
            value={run.mode}
            onValueChange={(v) => v && setRun({ mode: v as typeof run.mode })}
            aria-label="Precision"
            aria-describedby={describedBy(changed.precision, 'precision')}
            className="w-full sm:w-auto"
          >
            <ToggleGroupItem value="adaptive" className={cn('h-11 flex-1 px-4 sm:flex-none', CHOICE_ITEM)}>
              {PRECISION.adaptive}
            </ToggleGroupItem>
            <ToggleGroupItem value="fixed" className={cn('h-11 flex-1 px-4 sm:flex-none', CHOICE_ITEM)}>
              {PRECISION.fixed}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        {run.mode === 'fixed' && (
          // Its own labelled field, with its own help and default (TU8); its name is its visible label.
          <Field
            label="Number of fights"
            htmlFor={ids('iterations').control}
            help="From 100 to 100,000. More fights give a narrower ± range, and take longer."
            changed={hint('iterations', 'Number of fights', changed.iterations, number(defaults.run.iterations), () => setRun({ iterations: defaults.run.iterations }))}
          >
            <NumberField
              id={ids('iterations').control}
              value={run.iterations}
              onChange={(iterations) => setRun({ iterations })}
              min={100}
              max={100000}
              step={100}
              grouping
              aria-label="Number of fights"
              aria-describedby={describedBy(changed.iterations, 'iterations')}
            />
          </Field>
        )}
        <Field
          label="Seed"
          htmlFor={ids('seed').control}
          help="The same setup and seed give exactly the same result on any device."
          // A seed is an identifier, so no thousands separators, in its default or its field.
          changed={hint('seed', 'Seed', changed.seed, String(defaults.run.seed), () => setRun({ seed: defaults.run.seed }))}
        >
          <NumberField
            id={ids('seed').control}
            value={run.seed}
            onChange={(seed) => setRun({ seed })}
            min={0}
            max={4294967295}
            step={1}
            aria-label="Random seed"
            aria-describedby={describedBy(changed.seed, 'seed')}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Length variation"
            htmlFor={ids('variation').control}
            help="Each simulated fight varies by up to this much."
            changed={hint('variation', 'Length variation', changed.variation, `${def.durationVariationPct}%`, () => set({ durationVariationPct: def.durationVariationPct }))}
          >
            <NumberField
              id={ids('variation').control}
              value={fight.durationVariationPct}
              onChange={(v) => set({ durationVariationPct: v })}
              min={0}
              max={25}
              unit="%"
              aria-label="Length variation"
              aria-describedby={describedBy(changed.variation, 'variation')}
            />
          </Field>
          {usesExecute && fight.executePct > 0 && (
            // Its accessible name is its visible label (WCAG 2.5.3); the steppers read better shorter.
            <Field
              label="Execute phase starts at"
              htmlFor={ids('executePct').control}
              help="Boss health remaining."
              changed={hint('executePct', 'Execute phase starts at', changed.executePct, `${def.executePct}%`, () => set({ executePct: def.executePct }))}
            >
              <NumberField
                id={ids('executePct').control}
                value={fight.executePct}
                onChange={(v) => set({ executePct: v })}
                min={1}
                max={50}
                unit="%"
                aria-label="Execute phase starts at"
                stepLabel="execute phase start"
                aria-describedby={describedBy(changed.executePct, 'executePct')}
              />
            </Field>
          )}
          <Field
            label="Boss level"
            htmlFor={ids('bossLevel').control}
            changed={hint('bossLevel', 'Boss level', changed.bossLevel, String(def.bossLevel), () => set({ bossLevel: def.bossLevel }))}
          >
            <NumberField
              id={ids('bossLevel').control}
              value={fight.bossLevel}
              onChange={(v) => set({ bossLevel: v })}
              min={60}
              max={63}
              aria-label="Boss level"
              aria-describedby={describedBy(changed.bossLevel, 'bossLevel')}
            />
          </Field>
          <Field
            label="Creature type"
            htmlFor={ids('creatureType').control}
            help={`Some racials and items only work against certain types.${CREATURE_NOTE[meta.id] ?? ''}`}
            changed={hint('creatureType', 'Creature type', changed.creatureType, CREATURE_TYPES.find((t) => t.value === def.creatureType)!.label, () => set({ creatureType: def.creatureType }))}
          >
            <Select value={fight.creatureType} onValueChange={(v) => set({ creatureType: v as CreatureType })}>
              {/* The trigger's size attribute sets its height, so the 44 px target overrides that. */}
              <SelectTrigger id={ids('creatureType').control} aria-describedby={describedBy(changed.creatureType, 'creatureType')} className="w-full data-[size=default]:h-11">
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
          <Field
            label="Zone"
            htmlFor={ids('zone').control}
            help="Some Forever consumables only work in certain zones."
            changed={hint('zone', 'Zone', changed.zone, ZONES.find((z) => z.value === def.zone)!.label, () => set({ zone: def.zone }))}
          >
            <Select value={fight.zone} onValueChange={(v) => set({ zone: v as FightConfig['zone'] })}>
              <SelectTrigger id={ids('zone').control} aria-describedby={describedBy(changed.zone, 'zone')} className="w-full data-[size=default]:h-11">
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
          {damageTakenHelp !== undefined && (
            // Its accessible name is its visible label (WCAG 2.5.3).
            <Field
              label="Damage you take"
              htmlFor={ids('damageTaken').control}
              help={damageTakenHelp}
              changed={hint('damageTaken', 'Damage you take', changed.damageTaken, `${def.damageTakenPerSec}/s`, () => set({ damageTakenPerSec: def.damageTakenPerSec }))}
            >
              <NumberField
                id={ids('damageTaken').control}
                value={fight.damageTakenPerSec}
                onChange={(v) => set({ damageTakenPerSec: v })}
                min={0}
                max={500}
                step={10}
                unit="/s"
                aria-label="Damage you take"
                stepLabel="damage you take"
                aria-describedby={describedBy(changed.damageTaken, 'damageTaken')}
              />
            </Field>
          )}
        </div>

        {tank && (
          <div className="flex flex-col gap-5">
            <h3 className="text-sm font-medium">Boss melee</h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Swing speed"
                changed={hint('swingSpeed', 'Swing speed', changed.swingSpeed, `${def.boss.swingSpeedSec} s`, () => setBoss({ swingSpeedSec: def.boss.swingSpeedSec }))}
              >
                <NumberField
                  id={ids('swingSpeed').control}
                  value={fight.boss.swingSpeedSec}
                  onChange={(v) => setBoss({ swingSpeedSec: v })}
                  min={1}
                  max={4}
                  step={0.1}
                  unit="s"
                  aria-label="Boss swing speed"
                  aria-describedby={describedBy(changed.swingSpeed, 'swingSpeed')}
                />
              </Field>
              <Field
                label="Damage per swing"
                help="Before your armor."
                changed={hint(
                  'swingDamage',
                  'Damage per swing',
                  changed.swingDamage,
                  `${number(def.boss.damageMin)} to ${number(def.boss.damageMax)}`,
                  () => setBoss({ damageMin: def.boss.damageMin, damageMax: def.boss.damageMax }),
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <NumberField
                    id={ids('swingDamage').control}
                    value={fight.boss.damageMin}
                    onChange={(v) => setBoss({ damageMin: Math.min(v, fight.boss.damageMax) })}
                    min={0}
                    max={20000}
                    step={100}
                    grouping
                    aria-label="Minimum damage per swing"
                    aria-describedby={describedBy(changed.swingDamage, 'swingDamage')}
                  />
                  <span className="text-muted-foreground">to</span>
                  <NumberField
                    value={fight.boss.damageMax}
                    onChange={(v) => setBoss({ damageMax: Math.max(v, fight.boss.damageMin) })}
                    min={0}
                    max={20000}
                    step={100}
                    grouping
                    aria-label="Maximum damage per swing"
                    aria-describedby={describedBy(changed.swingDamage, 'swingDamage')}
                  />
                </div>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {BOSS_SWITCHES.map(([key, label]) => (
                // Room for the Reset's hit area, clear of the switch above and the next row (LINK_HIT_AREA).
                <div key={key} className={cn('flex flex-col', changed[key] ? 'gap-2 pb-2' : 'gap-1')}>
                  <label className="flex min-h-11 items-center justify-between gap-4 text-sm">
                    {label}
                    <Switch
                      id={ids(key).control}
                      checked={fight.boss[key]}
                      onCheckedChange={(on) => setBoss({ [key]: on })}
                      aria-describedby={describedBy(changed[key], key)}
                    />
                  </label>
                  {hint(key, label, changed[key], def.boss[key] ? 'on' : 'off', () => setBoss({ [key]: def.boss[key] }))}
                </div>
              ))}
            </div>
          </div>
        )}
      </Advanced>
    </div>
  )
}
