import { useMemo } from 'react'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WowIcon } from '@/components/wow-icon'
import type { ClassSlug } from '@/data/races/types'
import { ClassicEraNote } from '@/features/character/classic-era-note'
import { EmptyState } from '@/features/empty-state'
import { Field, SectionHeader } from '@/features/section'
import { CHOICE_HINT, CHOICE_ITEM } from '@/lib/choice'
import { cn } from '@/lib/utils'
import { activeBuffPreset, maintainedBuffIds } from './active-preset'
import { buffSwitchId } from './ids'
import { rivalNote } from './rival-note'
import { weaponNote } from './weapon-note'
import {
  buffCatalogueFor,
  buffPresets,
  buffProvided,
  unusedBuffs,
  buffSummaryFor,
  defaultConfig,
  unusedRotationSettings,
  FULL_RAID,
  forSpecClass,
  getSpec,
  presetBuffs,
  rotationValues,
  specs,
  talentBuffs,
  type BuffCategory,
  type BuffDefinition,
  type BuffPreset,
} from '@/sim'

const CATEGORY_LABEL: Record<BuffCategory, string> = {
  raidBuff: 'Raid buffs',
  targetDebuff: 'Debuffs on the boss',
  consumable: 'Consumables',
}

const CLASS_LABEL: Record<ClassSlug, string> = {
  warrior: 'Warrior',
  paladin: 'Paladin',
  hunter: 'Hunter',
  rogue: 'Rogue',
  priest: 'Priest',
  shaman: 'Shaman',
  mage: 'Mage',
  warlock: 'Warlock',
  druid: 'Druid',
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function BuffsSection() {
  const meta = useSpecMeta()
  const buffs = useSetup((s) => s.config.buffs)
  const rotation = useSetup((s) => s.config.rotation)
  const talents = useSetup((s) => s.config.talents)
  // Summaries in the setup's rule profile: Classic Era's numbers where they differ. Only what does
  // something for your class and spec: mana and spell damage for the classes that spend mana, attack
  // power and the boss's armor for the melee, the caster core's for the casters (docs/ux.md "Buffs").
  const profile = useSetup((s) => s.config.rules.profile)
  const buffCatalogue = useMemo(() => buffCatalogueFor(profile).filter((b) => forSpecClass(b, meta.id)), [profile, meta.id])
  const update = useSetup((s) => s.update)
  const setBuffs = (patch: Partial<typeof buffs>) => update((c) => ({ ...c, buffs: { ...c.buffs, ...patch } }))
  // Buffs the rotation keeps up itself (your own Battle Shout, warrior.md §5.2 row 1): the switch
  // shows them on and locked, since the Buffs version would be the same buff. The preset picker's
  // own rule (maintainedBuffIds), read through the same resolver as the plan, so a default that
  // follows the talents or another setting counts.
  const values = useMemo(() => rotationValues({ spec: meta.id, talents, rotation }), [meta.id, talents, rotation])
  const maintained = useMemo(() => maintainedBuffIds({ spec: meta.id, talents, rotation }), [meta.id, talents, rotation])
  // Buffs the talents bring (a druid's Leader of the Pack): on and locked the same way, since the
  // plan leaves the Buffs copy out too (druid.md §2.3).
  const fromTalents = useMemo(() => new Set(talentBuffs({ spec: meta.id, talents })), [meta.id, talents])
  // The spec's own buffs (the cat's Faerie Fire, a Protection warrior's Thunder Clap and Demoralizing
  // Shout): while the rotation doesn't keep one up, the tab's switch is someone else's, off unless
  // you turn it on (SpecMeta.ownBuffs, druid.md §6.2, warrior.md §5.4).
  const ownBuffs = useMemo(() => new Set(getSpec(meta.id).ownBuffs ?? []), [meta.id])
  // Another tank's duties (a warrior tank's Thunder Clap and Demoralizing Shout), for a tank: when no
  // preset assumes another tank keeps one up, the switch says whose it is (D26, buffs doc §6.2).
  const otherTanksDuty = useMemo(() => {
    const duty = new Map<string, string>()
    if (meta.role !== 'tank') return duty
    const inPresets = new Set(buffPresets.flatMap((p) => presetBuffs(p.id, meta.id, FULL_RAID)))
    for (const s of specs) {
      if (s.role !== 'tank' || s.classId === meta.classId) continue
      for (const id of s.ownBuffs ?? []) if (!inPresets.has(id)) duty.set(id, CLASS_LABEL[s.classId].toLowerCase())
    }
    return duty
  }, [meta.id, meta.role, meta.classId])
  // Buffs that do nothing for the spec (a weapon stone's damage in Cat Form): off and locked, saying why.
  // An Enhancement shaman's Windfury Weapon disables Windfury Totem's benefit for it, so the plan
  // leaves the totem out while that's the imbue (docs/classes/shaman.md#totems, plan/build.ts).
  const inert = useMemo(() => {
    const out = unusedBuffs(meta.id)
    if (values['shaman.enhancement.imbue'] === 'windfury') out.windfuryTotem = 'Not used: your Windfury Weapon (see Rotation) turns it off for you'
    // A caster whose pet swings gets the boss's armor debuffs for its pet (SpecMeta.petMelee): with the
    // Imp or no demon out, nothing of yours meets the boss's armor (docs/classes/warlock.md §11.2).
    const demon = values['warlock.demonology.demon.summoned']
    if (meta.petMelee && (demon === 'imp' || demon === 'none')) {
      const why = demon === 'imp' ? 'your Imp (see Rotation) doesn’t swing' : 'you keep no demon out (see Rotation)'
      for (const b of buffCatalogue) if (b.category === 'targetDebuff' && b.group === 'Armor' && b.forSpecs === 'melee') out[b.id] = `Not used: only your demon’s swings meet the boss’s armor, and ${why}`
    }
    return out
  }, [meta.id, meta.petMelee, values, buffCatalogue])
  // Your own buffs whose Rotation setting the setup leaves unused (the bear's roar while a Demoralizing
  // Shout here takes its place, druid.md §6.3): your rotation doesn't cast them.
  const race = useSetup((s) => s.config.race)
  const notCastOwn = useMemo(() => {
    const unused = unusedRotationSettings({ spec: meta.id, talents, rotation, race, buffs })
    return new Set(getSpec(meta.id).rotationOptions.flatMap((o) => (o.kind === 'toggle' && o.maintainsBuff && unused[o.id] !== undefined ? [o.maintainsBuff] : [])))
  }, [meta.id, talents, rotation, race, buffs])

  // The preset your buffs match, by the one rule the section tabs' summary line reads too (active-preset.ts).
  const activePreset = activeBuffPreset({ spec: meta.id, talents, rotation, buffs })?.id
  // The spec's default preset, marked like the talent presets' "(default)" (docs/ux.md "Buffs", checklist 3).
  const defaultPreset = useMemo(
    () => buffPresets.find((p) => sameSet(presetBuffs(p.id, meta.id, FULL_RAID), defaultConfig(meta.id).buffs.enabled))?.id,
    [meta.id],
  )
  const applyPreset = (id: BuffPreset['id']) => setBuffs({ enabled: presetBuffs(id, meta.id, buffs.raid) })

  const toggleClass = (cls: ClassSlug, on: boolean) => {
    const raid = on ? [...buffs.raid, cls] : buffs.raid.filter((c) => c !== cls)
    // Drop buffs nobody in the raid can provide any more.
    const enabled = buffs.enabled.filter((id) => {
      const def = buffCatalogue.find((b) => b.id === id)
      return !def || buffProvided(def, raid, meta.id)
    })
    setBuffs({ raid, enabled })
  }

  /** The other entry of `def`'s exclusive group that's on and brought by the raid, if any. */
  const rivalOn = (def: BuffDefinition) =>
    buffCatalogue.find(
      (b) =>
        b.id !== def.id &&
        b.exclusiveGroup === def.exclusiveGroup &&
        buffs.enabled.includes(b.id) &&
        buffProvided(b, buffs.raid, meta.id),
    )

  const toggleBuff = (def: BuffDefinition, on: boolean) => {
    let enabled = buffs.enabled.filter((id) => id !== def.id)
    if (on) {
      if (def.exclusiveGroup) {
        const rivals = new Set(buffCatalogue.filter((b) => b.exclusiveGroup === def.exclusiveGroup).map((b) => b.id))
        enabled = enabled.filter((id) => !rivals.has(id))
      }
      enabled.push(def.id)
    }
    setBuffs({ enabled })
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Buffs" description="What your raid brings, what’s on the boss, and your consumables." />
      <ClassicEraNote what="Raid buffs, debuffs and consumables" />

      <Field label="Preset">
        <ToggleGroup
          type="single"
          variant="outline"
          value={activePreset ?? ''}
          onValueChange={(v) => v && applyPreset(v as BuffPreset['id'])}
          aria-label="Preset"
          // In the wide layout each preset stops at 16 rem, left-aligned, rather than stretching a
          // quarter of the pane (docs/ux.md principle 4, "Never enlarge to fill"); at 1440 px a quarter
          // is under 16 rem anyway. Below 1440 px the pane isn't a container, so this changes nothing.
          className="grid w-full grid-cols-2 items-stretch sm:grid-cols-4 @min-[53rem]/setup:grid-cols-[repeat(4,minmax(0,16rem))]"
        >
          {/* Each preset says what it brings in visible text, never a hover-only title (docs/ux.md "Accessibility"). */}
          {buffPresets.map((p) => (
            <ToggleGroupItem
              key={p.id}
              value={p.id}
              aria-labelledby={`buff-preset-${p.id}-name`}
              aria-describedby={`buff-preset-${p.id}`}
              className={cn('h-auto min-h-11 flex-col items-start justify-start gap-0.5 px-3 py-2 text-left', CHOICE_ITEM)}
            >
              <span id={`buff-preset-${p.id}-name`}>
                {p.name}
                {p.id === defaultPreset && ' (default)'}
              </span>
              <span id={`buff-preset-${p.id}`} className={cn('text-xs font-normal whitespace-normal', CHOICE_HINT)}>
                {p.description}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!activePreset && <p className="text-xs text-muted-foreground">Custom selection.</p>}
      </Field>

      <Field label="In your raid" help="Raid buffs follow who’s in the raid. In Forever, both factions can bring paladins and shamans.">
        {/*
         * In the wide layout, where the full raid's chips don't fit one line (a setup pane under
         * 72 rem), two even rows of equal chips, as many columns as half the classes, each as wide as
         * the widest name, rather than a row that leaves the last one alone (review finding DU1-8);
         * from 72 rem they're one line. Below 1440 px the pane isn't a container, so they wrap as
         * they always have and the columns do nothing.
         */}
        <div
          className="flex flex-wrap gap-2 @min-[53rem]/setup:grid @min-[53rem]/setup:w-fit @min-[72rem]/setup:flex @min-[72rem]/setup:w-auto"
          style={{ gridTemplateColumns: `repeat(${Math.ceil(FULL_RAID.length / 2)}, 1fr)` }}
        >
          {FULL_RAID.map((cls) => {
            const on = buffs.raid.includes(cls)
            return (
              <button
                key={cls}
                type="button"
                aria-pressed={on}
                onClick={() => toggleClass(cls, !on)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  on ? 'border-primary bg-muted font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <WowIcon icon={`classicon_${cls}`} size="xs" grayscale={!on} />
                {CLASS_LABEL[cls]}
              </button>
            )
          })}
        </div>
      </Field>

      {buffCatalogue.length === 0 ? (
        <EmptyState title="No buffs to choose yet">The buff catalogue comes with the simulation engine.</EmptyState>
      ) : (
        (Object.keys(CATEGORY_LABEL) as BuffCategory[]).map((category) => {
          const defs = buffCatalogue.filter((b) => b.category === category)
          if (defs.length === 0) return null
          const groups = [...new Set(defs.map((d) => d.group))]
          return (
            <section key={category} className="flex flex-col gap-3">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{CATEGORY_LABEL[category]}</h3>
              {/*
               * In the wide layout the category's groups flow into columns by the setup pane's width
               * (D34, docs/ux.md "Buffs"): 2 from 53 rem, 3 from 72 rem, where each column is still
               * about 23 rem, room for a buff's name and a line or two of help beside its switch (at
               * 1920 px, a 75 rem pane, they're 24.3). CSS columns keep the reading order top to bottom,
               * column by column, and no group splits across two. Below 1440 px the pane isn't a
               * container, so this stays the one column of cards it always was.
               */}
              <div className="flex flex-col gap-3 @min-[53rem]/setup:block @min-[53rem]/setup:columns-2 @min-[53rem]/setup:gap-4 @min-[72rem]/setup:columns-3">
                {groups.map((group) => (
                  <div
                    key={group}
                    className="flex flex-col gap-1 rounded-xl border p-1 @min-[53rem]/setup:mb-4 @min-[53rem]/setup:break-inside-avoid"
                  >
                    <span className="px-3 pt-2 text-xs font-medium text-muted-foreground">{group}</span>
                    {defs
                      .filter((d) => d.group === group)
                      .map((def) => {
                        const talent = !maintained.has(def.id) && fromTalents.has(def.id)
                        const own = maintained.has(def.id) || talent
                        // Another entry of its exclusive group is on, and only one applies in game: yours
                        // stays in the rotation for its threat (Expose Armor over your Sunder Armor, warrior.md Q35).
                        const replacedBy = maintained.has(def.id) && def.exclusiveGroup ? rivalOn(def) : undefined
                        // Yours, but the rotation doesn't keep it up: the switch means another player's.
                        const dropped = !own && ownBuffs.has(def.id)
                        const dutyOf = own || dropped ? undefined : otherTanksDuty.get(def.id)
                        // A buff you cast on yourself needs no one else (a druid's Mark of the Wild).
                        const missing = !own && !buffProvided(def, buffs.raid, meta.id)
                        const unused = own ? undefined : inert[def.id]
                        const unavailable = missing || unused !== undefined
                        const providerName = def.providedBy ? CLASS_LABEL[def.providedBy].toLowerCase() : ''
                        // A debuff on the boss's swings changes only a tank's results (docs/ux.md "Buffs").
                        const tankOnly = def.bossMelee === true && meta.role !== 'tank'
                        // Replaced, and your rotation doesn't cast it then (a bear's roar under a Demoralizing
                        // Shout: its Rotation setting says it isn't used; druid.md §6.3).
                        const notCast = replacedBy !== undefined && notCastOwn.has(def.id)
                        // A stone's or an oil's note names what this spec's weapons can take (weapon-note.ts).
                        const note = weaponNote(def, buffCatalogue, inert)
                        // A bomb's summary says what its throw holds for this spec (buffs doc §3.7).
                        const base = buffSummaryFor(def, meta.id)
                        // One that turns off a rival its summary doesn't name says so (rival-note.ts).
                        const rival = rivalNote(def, buffCatalogue, inert)
                        const noted = note ? `${base} ${note}` : base
                        const summary = rival ? `${noted}. ${rival}` : noted
                        let help = summary
                        if (talent) help = `${summary}. Your talents bring it (see Talents), so it isn’t added twice.`
                        else if (replacedBy && notCast) help = `${summary}. Your raid’s ${replacedBy.name} is on the boss instead, so you don’t cast it (see Rotation).`
                        else if (replacedBy) help = `${summary}. ${replacedBy.name} takes its place on the boss, since only one applies; yours still makes its threat (untested).`
                        else if (own) help = `${summary}. You keep it up yourself (see Rotation), so it isn’t added twice.`
                        else if (unused !== undefined) help = `${summary}. ${unused}.`
                        // You're one of your class yourself, so a buff your class brings that you don't count
                        // for needs another (a paladin's Blessing of Kings, a cat's Faerie Fire when its
                        // rotation drops it; docs/ux.md "Buffs").
                        else if (missing) help = `Needs ${def.providedBy === meta.classId ? 'another' : 'a'} ${providerName} in the raid`
                        else if (dropped) help = `${summary}. You’re not keeping it up (see Rotation); turn this on if another ${providerName} does.`
                        else if (dutyOf) help = `${summary}. A ${dutyOf} tank’s duty, so presets leave it out; turn this on if one keeps it up.`
                        else if (tankOnly) help = `${summary}. Only the tank takes the boss’s swings, so it changes nothing for you.`
                        return (
                          // A buff nobody in the raid brings, or one that does nothing for you, is dimmed by
                          // colour, never opacity: its text turns to the muted colour (AA) and its icon to
                          // gray (docs/ux.md "Buffs").
                          <label
                            key={def.id}
                            data-unavailable={unavailable || undefined}
                            className={cn(
                              'flex min-h-14 items-center gap-3 rounded-lg px-3 py-2',
                              unavailable ? 'cursor-not-allowed text-muted-foreground' : !own && 'hover:bg-muted',
                            )}
                          >
                            <WowIcon icon={def.icon} size="sm" grayscale={unavailable} />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="text-sm font-medium">{def.name}</span>
                              <span id={`${buffSwitchId(def.id)}-help`} className="text-xs text-muted-foreground">
                                {help}
                              </span>
                            </span>
                            <Switch
                              id={buffSwitchId(def.id)}
                              checked={notCast ? false : own || (!unavailable && buffs.enabled.includes(def.id))}
                              disabled={own || unavailable}
                              onCheckedChange={(on) => toggleBuff(def, on)}
                              aria-label={def.name}
                              aria-describedby={`${buffSwitchId(def.id)}-help`}
                            />
                          </label>
                        )
                      })}
                  </div>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
