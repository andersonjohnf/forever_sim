// Static metadata for every spec in scope (docs/doctrine.md#1-what-were-building). The engine
// adds rotation options and flips `available` when a spec's sim and UI are complete.
import type { ClassId, Role, SpecId } from './types'

export interface SpecMeta {
  id: SpecId
  classId: ClassId
  className: string
  name: string
  role: Role
  icon: string
  /**
   * Buff catalogue ids the Buffs tab assumes are this spec's own: its rotation keeps them up by
   * default (the cat's Faerie Fire, druid.md §6.2; a Protection warrior's Thunder Clap and
   * Demoralizing Shout and a Protection paladin's Devotion Aura, their duties under D26, warrior.md
   * §5.4, paladin.md "Priority"). No preset adds them for the spec, so when the rotation drops one
   * (Max TPS drops them), the Buffs tab's is off until you turn it on there because someone else
   * keeps it up (docs/ux.md "Buffs"). Another tank's Buffs tab says whose duty it is.
   */
  ownBuffs?: readonly string[]
  /**
   * A spec that deals its damage with spells (the caster core, docs/mechanics/spells.md): its
   * character sheet shows spell damage by school, casting speed and spell penetration. The caster
   * class slices (K2–K6) set it.
   */
  caster?: boolean
}

export const SPEC_META: Record<SpecId, SpecMeta> = {
  'warrior-fury': {
    id: 'warrior-fury',
    classId: 'warrior',
    className: 'Warrior',
    name: 'Fury',
    role: 'dps',
    icon: 'ability_warrior_innerrage',
  },
  'warrior-arms': {
    id: 'warrior-arms',
    classId: 'warrior',
    className: 'Warrior',
    name: 'Arms',
    role: 'dps',
    icon: 'ability_warrior_savageblow',
  },
  'warrior-protection': {
    id: 'warrior-protection',
    classId: 'warrior',
    className: 'Warrior',
    name: 'Protection',
    role: 'tank',
    icon: 'ability_warrior_defensivestance',
    ownBuffs: ['thunderClap', 'demoralizingShout'],
  },
  'druid-feral-cat': {
    id: 'druid-feral-cat',
    classId: 'druid',
    className: 'Druid',
    name: 'Feral (Cat)',
    role: 'dps',
    icon: 'ability_druid_catform',
    ownBuffs: ['faerieFire'],
  },
  'druid-feral-bear': {
    id: 'druid-feral-bear',
    classId: 'druid',
    className: 'Druid',
    name: 'Feral (Bear)',
    role: 'tank',
    icon: 'ability_racial_bearform',
    // Its duties (D26; druid.md §6.3): the rotation keeps them on the boss.
    ownBuffs: ['faerieFire', 'demoralizingRoar'],
  },
  'paladin-retribution': {
    id: 'paladin-retribution',
    classId: 'paladin',
    className: 'Paladin',
    name: 'Retribution',
    role: 'dps',
    icon: 'spell_holy_auraoflight',
  },
  'paladin-protection': {
    id: 'paladin-protection',
    classId: 'paladin',
    className: 'Paladin',
    name: 'Protection',
    role: 'tank',
    icon: 'spell_holy_devotionaura',
    // Its duty, Devotion Aura, which Tank duties first keeps up and Max TPS drops (paladin.md "Priority", D26).
    ownBuffs: ['devotionAura'],
  },
  // docs/classes/shaman.md: its own totems are the Buffs tab's (their `selfCast`), as a paladin's
  // Blessing of Might is, so it has no `ownBuffs`.
  'shaman-enhancement': {
    id: 'shaman-enhancement',
    classId: 'shaman',
    className: 'Shaman',
    name: 'Enhancement',
    role: 'dps',
    icon: 'spell_nature_lightningshield',
  },
  // docs/classes/rogue.md: the three rogue specs, landed under D27.
  'rogue-combat': {
    id: 'rogue-combat',
    classId: 'rogue',
    className: 'Rogue',
    name: 'Combat',
    role: 'dps',
    icon: 'ability_backstab',
  },
  'rogue-assassination': {
    id: 'rogue-assassination',
    classId: 'rogue',
    className: 'Rogue',
    name: 'Assassination',
    role: 'dps',
    icon: 'ability_rogue_eviscerate',
  },
  'rogue-subtlety': {
    id: 'rogue-subtlety',
    classId: 'rogue',
    className: 'Rogue',
    name: 'Subtlety',
    role: 'dps',
    icon: 'ability_stealth',
  },
}

export const SPEC_IDS = Object.keys(SPEC_META) as SpecId[]

/** Class colors (docs/ux.md#visual-language): accents only. */
export const CLASS_COLOR: Record<ClassId, string> = {
  warrior: '#C69B6D',
  druid: '#FF7C0A',
  paladin: '#F48CBA',
  shaman: '#0070DD',
  rogue: '#FFF468',
}
