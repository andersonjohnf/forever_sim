import { useMemo } from 'react'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WowIcon } from '@/components/wow-icon'
import type { ClassSlug } from '@/data/races/types'
import { EmptyState } from '@/features/empty-state'
import { Field, SectionHeader } from '@/features/section'
import { CHOICE_HINT, CHOICE_ITEM } from '@/lib/choice'
import { cn } from '@/lib/utils'
import {
  buffCatalogueFor,
  buffPresets,
  FULL_RAID,
  getSpec,
  presetBuffs,
  rotationValues,
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
  // Summaries in the setup's rule profile: Classic Era's numbers where they differ.
  const buffCatalogue = buffCatalogueFor(useSetup((s) => s.config.rules.profile))
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

  const activePreset = buffPresets.find((p) => sameSet(presetBuffs(p.id, meta.id, buffs.raid), buffs.enabled))?.id
  const applyPreset = (id: BuffPreset['id']) => setBuffs({ enabled: presetBuffs(id, meta.id, buffs.raid) })

  const toggleClass = (cls: ClassSlug, on: boolean) => {
    const raid = on ? [...buffs.raid, cls] : buffs.raid.filter((c) => c !== cls)
    // Drop buffs nobody in the raid can provide any more.
    const enabled = buffs.enabled.filter((id) => {
      const def = buffCatalogue.find((b) => b.id === id)
      return !def?.providedBy || raid.includes(def.providedBy)
    })
    setBuffs({ raid, enabled })
  }

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
              <span id={`buff-preset-${p.id}-name`}>{p.name}</span>
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
                  on ? 'border-primary bg-muted font-medium' : 'text-muted-foreground hover:bg-muted',
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
                      const own = maintained.has(def.id)
                      const missing = !own && def.providedBy && !buffs.raid.includes(def.providedBy)
                      return (
                        <label
                          key={def.id}
                          className={cn('flex min-h-14 items-center gap-3 rounded-lg px-3 py-2', missing ? 'opacity-60' : !own && 'hover:bg-muted')}
                        >
                          <WowIcon icon={def.icon} size="sm" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-sm font-medium">{def.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {own
                                ? `${def.summary}. You keep it up yourself (see Rotation), so it isn’t added twice.`
                                : missing
                                  ? `Needs a ${CLASS_LABEL[def.providedBy!].toLowerCase()} in the raid`
                                  : def.summary}
                            </span>
                          </span>
                          <Switch
                            checked={own || buffs.enabled.includes(def.id)}
                            disabled={own || !!missing}
                            onCheckedChange={(on) => toggleBuff(def, on)}
                            aria-label={def.name}
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
