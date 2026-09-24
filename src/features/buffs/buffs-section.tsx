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
import { buffSwitchId } from './ids'
import {
  buffCatalogueFor,
  buffPresets,
  buffProvided,
  unusedBuffs,
  defaultConfig,
  FULL_RAID,
  getSpec,
  presetBuffs,
  rotationValues,
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
  // something for your class: mana and spell damage are the paladin's (docs/ux.md "Buffs").
  const profile = useSetup((s) => s.config.rules.profile)
  const buffCatalogue = useMemo(
    () => buffCatalogueFor(profile).filter((b) => !b.forClasses || b.forClasses.includes(meta.classId)),
    [profile, meta.classId],
  )
  const update = useSetup((s) => s.update)
  const setBuffs = (patch: Partial<typeof buffs>) => update((c) => ({ ...c, buffs: { ...c.buffs, ...patch } }))
  // Buffs the rotation keeps up itself (your own Battle Shout, warrior.md §5.2 row 1): the switch
  // shows them on and locked, since the Buffs version would be the same buff. Read through the same
  // resolver as the plan, so a default that follows the talents or another setting counts.
  const maintained = useMemo(() => {
    const values = rotationValues({ spec: meta.id, talents, rotation })
    return new Set(
      getSpec(meta.id).rotationOptions.flatMap((o) => (o.kind === 'toggle' && o.maintainsBuff && Boolean(values[o.id]) ? [o.maintainsBuff] : [])),
    )
  }, [meta.id, talents, rotation])
  // Buffs the talents bring (a druid's Leader of the Pack): on and locked the same way, since the
  // plan leaves the Buffs copy out too (druid.md §2.3).
  const fromTalents = useMemo(() => new Set(talentBuffs({ spec: meta.id, talents })), [meta.id, talents])
  // The spec's own buffs (the cat's Faerie Fire, a Protection warrior's Thunder Clap and Demoralizing
  // Shout): while the rotation doesn't keep one up, the tab's switch is someone else's, off unless
  // you turn it on (SpecMeta.ownBuffs, druid.md §6.2, warrior.md §5.4).
  const ownBuffs = useMemo(() => new Set(getSpec(meta.id).ownBuffs ?? []), [meta.id])
  // Buffs that do nothing for the spec (a weapon stone's damage in Cat Form): off and locked, saying why.
  const inert = useMemo(() => unusedBuffs(meta.id), [meta.id])

  // A preset matches on what you choose here: a buff your rotation keeps up shows on whatever the
  // preset says, so it's left out of both sides (your own Devotion Aura, D26).
  const chosen = (ids: string[]) => ids.filter((id) => !maintained.has(id))
  const activePreset = buffPresets.find((p) => sameSet(chosen(presetBuffs(p.id, meta.id, buffs.raid)), chosen(buffs.enabled)))?.id
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
          className="grid w-full grid-cols-2 items-stretch sm:grid-cols-4"
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
        <div className="flex flex-wrap gap-2">
          {FULL_RAID.map((cls) => {
            const on = buffs.raid.includes(cls)
            return (
              <button
                key={cls}
                type="button"
                aria-pressed={on}
                onClick={() => toggleClass(cls, !on)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
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
              {groups.map((group) => (
                <div key={group} className="flex flex-col gap-1 rounded-xl border p-1">
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
                      // A buff you cast on yourself needs no one else (a druid's Mark of the Wild).
                      const missing = !own && !buffProvided(def, buffs.raid, meta.id)
                      const unused = own ? undefined : inert[def.id]
                      const unavailable = missing || unused !== undefined
                      const providerName = def.providedBy ? CLASS_LABEL[def.providedBy].toLowerCase() : ''
                      let help = def.summary
                      if (talent) help = `${def.summary}. Your talents bring it (see Talents), so it isn’t added twice.`
                      else if (replacedBy) help = `${def.summary}. ${replacedBy.name} takes its place on the boss, since only one applies; yours still makes its threat (untested).`
                      else if (own) help = `${def.summary}. You keep it up yourself (see Rotation), so it isn’t added twice.`
                      else if (unused !== undefined) help = `${def.summary}. ${unused}.`
                      // You're one of your class yourself, so a buff your class brings that you don't count
                      // for needs another (a paladin's Blessing of Kings, a cat's Faerie Fire when its
                      // rotation drops it; docs/ux.md "Buffs").
                      else if (missing) help = `Needs ${def.providedBy === meta.classId ? 'another' : 'a'} ${providerName} in the raid`
                      else if (dropped) help = `${def.summary}. You’re not keeping it up (see Rotation); turn this on if another ${providerName} does.`
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
                            checked={own || (!unavailable && buffs.enabled.includes(def.id))}
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
            </section>
          )
        })
      )}
    </div>
  )
}
