// Which Buffs preset a setup matches (docs/ux.md "Buffs"): the rule the Buffs tab's preset picker
// uses, as a pure function, so the section tabs' summary line (src/app/section-summary.ts, decision
// D34) reads the same preset the tab shows. The tab (buffs-section.tsx) still holds its own copy of
// this rule until it's wired to this one; the two must stay the same.
import { buffPresets, getSpec, presetBuffs, rotationValues, type BuffPreset, type SimConfig } from '@/sim'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * The buffs the rotation keeps up itself (your own Battle Shout, warrior.md §5.2 row 1), read
 * through the same resolver as the plan, so a default that follows the talents counts.
 */
export function maintainedBuffIds(config: Pick<SimConfig, 'spec' | 'talents' | 'rotation'>): Set<string> {
  const values = rotationValues(config)
  return new Set(getSpec(config.spec).rotationOptions.flatMap((o) => (o.kind === 'toggle' && o.maintainsBuff && Boolean(values[o.id]) ? [o.maintainsBuff] : [])))
}

/**
 * The first preset whose buffs, for this raid, are the ones switched on, or undefined ("Custom").
 * A buff your rotation keeps up shows on whatever the preset says, so it's left out of both sides
 * (your own Devotion Aura, D26).
 */
export function activeBuffPreset(config: Pick<SimConfig, 'spec' | 'talents' | 'rotation' | 'buffs'>): BuffPreset | undefined {
  const maintained = maintainedBuffIds(config)
  const chosen = (ids: string[]) => ids.filter((id) => !maintained.has(id))
  const enabled = chosen(config.buffs.enabled)
  return buffPresets.find((p) => sameSet(chosen(presetBuffs(p.id, config.spec, config.buffs.raid)), enabled))
}
