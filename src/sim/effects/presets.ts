// Buff presets (docs/mechanics/buffs-debuffs-consumables.md#6-default-presets): built on raid
// composition, never faction. An entry is in a preset when the preset gives it to this spec's
// role or spec (§6.2, §6.3) and someone in the raid provides it; the first entry of an
// exclusive group wins.
import type { ClassSlug } from '@/data/races/types'
import { SPEC_META } from '../specs'
import type { BuffPreset, SpecId } from '../types'
import { type Audience, BUFFS } from './buffs'

function reaches(audience: Audience, spec: SpecId): boolean {
  if (audience === 'all') return true
  if (audience === 'dps' || audience === 'tank') return SPEC_META[spec].role === audience
  return audience.includes(spec)
}

export function presetBuffIds(preset: BuffPreset['id'], spec: SpecId, raid: readonly ClassSlug[]): string[] {
  if (preset === 'self') return []
  const ids: string[] = []
  const taken = new Set<string>()
  for (const buff of BUFFS) {
    const audience = buff.presets[preset]
    if (!audience || !reaches(audience, spec)) continue
    if (buff.providedBy && !raid.includes(buff.providedBy)) continue
    if (buff.exclusiveGroup) {
      if (taken.has(buff.exclusiveGroup)) continue
      taken.add(buff.exclusiveGroup)
    }
    ids.push(buff.id)
  }
  return ids
}
