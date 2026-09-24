// Buff presets (docs/mechanics/buffs-debuffs-consumables.md#6-default-presets): built on raid
// composition, never faction. An entry is in a preset when the preset gives it to this spec's
// role or spec (§6.2, §6.3) and someone in the raid provides it; the first entry of an
// exclusive group wins.
import type { ClassSlug } from '@/data/races/types'
import { SPEC_META } from '../specs'
import type { BuffDefinition, BuffPreset, SpecId } from '../types'
import { FOREVER } from '../rules/profiles'
import { type Audience, BUFFS, BUFFS_BY_ID, type BuffSpec } from './buffs'
import { catalogueEffects } from './types'

/** Whether the entry does anything for the spec's class (`forClasses`; absent, every class). */
export const forSpecClass = (buff: { forClasses?: readonly string[] }, spec: SpecId): boolean =>
  !buff.forClasses || buff.forClasses.includes(SPEC_META[spec].classId)

function reaches(audience: Audience, spec: SpecId): boolean {
  if (audience === 'all') return true
  if (audience === 'dps' || audience === 'tank') return SPEC_META[spec].role === audience
  // Every spec but these (Windfury Totem: not the Enhancement shaman, docs/classes/shaman.md#totems).
  if ('not' in audience) return !audience.not.includes(spec)
  return audience.includes(spec)
}

/**
 * Whether someone in the raid provides a buff for this spec (buffs doc §6.1): it needs no class, its
 * class is in the raid, or you're of that class and cast it on yourself (a druid's Mark of the Wild).
 */
export function buffProvided(buff: Pick<BuffDefinition, 'providedBy' | 'selfCast'>, raid: readonly ClassSlug[], spec: SpecId): boolean {
  return !buff.providedBy || raid.includes(buff.providedBy) || (buff.selfCast === true && SPEC_META[spec].classId === buff.providedBy)
}

/** The form a spec fights in, for the notes that name it (druid.md §2). */
const FORM_NAME: Partial<Record<SpecId, string>> = { 'druid-feral-cat': 'Cat Form', 'druid-feral-bear': 'Dire Bear Form' }

/**
 * Why a buff does nothing for this spec, as the Buffs tab says it, or undefined (docs/ux.md
 * "Buffs"): a temporary enchant that only adds weapon damage (a Dense Sharpening Stone or
 * Weightstone) for a spec that fights in a form, whose attacks don't use the weapon's damage
 * (druid.md §2.1, §7.5, Q25). The Buffs tab locks it off with this note, and the plan leaves it
 * out. An Elemental Sharpening Stone's crit still applies.
 */
export function buffUnusedReason(buff: BuffSpec, spec: SpecId): string | undefined {
  // docs/classes/shaman.md#weapon-imbues: a shaman's weapon imbue is its main hand's temporary
  // enchant, so a stone or oil has no weapon to go on.
  if (SPEC_META[spec].classId === 'shaman' && catalogueEffects(buff, FOREVER).some((e) => e.kind === 'tempEnchant'))
    return 'Not used: your weapon imbue is your main hand’s temporary enchant'
  const form = FORM_NAME[spec]
  if (!form) return undefined
  const effects = catalogueEffects(buff, FOREVER)
  const weaponDamageOnly = effects.length > 0 && effects.every((e) => e.kind === 'tempEnchant' && (e.weaponDamage ?? 0) > 0 && !e.crit)
  return weaponDamageOnly ? `Not used in ${form}: your attacks there don’t use your weapon’s damage` : undefined
}

/** Every buff that does nothing for this spec, with why (`buffUnusedReason`). */
export function unusedBuffs(spec: SpecId): Record<string, string> {
  const out: Record<string, string> = {}
  for (const buff of BUFFS) {
    const reason = buffUnusedReason(buff, spec)
    if (reason) out[buff.id] = reason
  }
  return out
}

export function presetBuffIds(preset: BuffPreset['id'], spec: SpecId, raid: readonly ClassSlug[]): string[] {
  // The spec's own buffs (the cat's Faerie Fire): its rotation keeps them up, so no preset adds the
  // Buffs tab's, which then means someone else's (SpecMeta.ownBuffs; buffs doc §6.2).
  const own = SPEC_META[spec].ownBuffs ?? []
  // Self only is the buffs you cast on yourself: a paladin's Blessing of Might, a druid's Mark of
  // the Wild (buffs doc §6.2).
  if (preset === 'self') {
    const classId = SPEC_META[spec].classId
    return BUFFS.filter((b) => b.selfCast === true && b.providedBy === classId && forSpecClass(b, spec) && !own.includes(b.id)).map((b) => b.id)
  }
  const ids: string[] = []
  const taken = new Set<string>()
  for (const buff of BUFFS) {
    const audience = buff.presets[preset]
    if (!audience || !reaches(audience, spec) || !forSpecClass(buff, spec) || own.includes(buff.id)) continue
    if (!buffProvided(buff, raid, spec)) continue
    if (buff.exclusiveGroup) {
      if (taken.has(buff.exclusiveGroup)) continue
      taken.add(buff.exclusiveGroup)
    }
    ids.push(buff.id)
  }
  return ids
}

/**
 * The exclusive groups the Buffs tab fills in the plan, each with the name of the entry that fills
 * it: each enabled entry the plan applies (for the spec's class, provided by the raid or by
 * yourself, not unused in its form), except those in `skip` (kept up by the rotation, or brought by
 * the talents), whose Buffs copy the plan leaves out; the last of them, if two share a group. An
 * Expose Armor there takes `armor-major` from a warrior's Sunder Armor (warrior.md §7), a Demoralizing
 * Shout `ap-reduction` from a bear's roar (docs/classes/druid.md §6.3).
 */
export function buffGroupFillers(enabled: readonly string[], raid: readonly ClassSlug[], spec: SpecId, skip: readonly string[]): Map<string, string> {
  const fillers = new Map<string, string>()
  for (const id of enabled) {
    const buff = BUFFS_BY_ID.get(id)
    if (!buff?.exclusiveGroup || skip.includes(id)) continue
    if (!forSpecClass(buff, spec) || !buffProvided(buff, raid, spec) || buffUnusedReason(buff, spec)) continue
    fillers.set(buff.exclusiveGroup, buff.name)
  }
  return fillers
}

/** The exclusive groups the Buffs tab fills in the plan (`buffGroupFillers`). */
export const filledBuffGroups = (enabled: readonly string[], raid: readonly ClassSlug[], spec: SpecId, skip: readonly string[]): Set<string> =>
  new Set(buffGroupFillers(enabled, raid, spec, skip).keys())
