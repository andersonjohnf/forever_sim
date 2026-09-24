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
  // docs/classes/druid.md §11: the caster sheet (spell damage by school); its Moonkin Aura comes with
  // the talent (classes/druid/setup.ts), as the cat's Leader of the Pack does.
  'druid-balance': {
    id: 'druid-balance',
    classId: 'druid',
    className: 'Druid',
    name: 'Balance',
    role: 'dps',
    icon: 'spell_nature_starfall',
    caster: true,
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
  // docs/classes/shaman.md#elemental: a caster, landed under D27 (K5): its sheet shows spell damage by school.
  'shaman-elemental': {
    id: 'shaman-elemental',
    classId: 'shaman',
    className: 'Shaman',
    name: 'Elemental',
    role: 'dps',
    icon: 'spell_nature_lightning',
    caster: true,
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
  // docs/classes/mage.md: the caster sheet (spell damage by school) and no own buffs.
  'mage-fire': {
    id: 'mage-fire',
    classId: 'mage',
    className: 'Mage',
    name: 'Fire',
    role: 'dps',
    icon: 'spell_fire_firebolt02',
    caster: true,
  },
  'mage-frost': {
    id: 'mage-frost',
    classId: 'mage',
    className: 'Mage',
    name: 'Frost',
    role: 'dps',
    icon: 'spell_frost_frostbolt02',
    caster: true,
  },
  'mage-arcane': {
    id: 'mage-arcane',
    classId: 'mage',
    className: 'Mage',
    name: 'Arcane',
    role: 'dps',
    icon: 'spell_holy_magicalsentry',
    caster: true,
  },
  // docs/classes/warlock.md: Destruction and Affliction, landed under D27; Demonology waits for the pet core.
  'warlock-destruction': {
    id: 'warlock-destruction',
    classId: 'warlock',
    className: 'Warlock',
    name: 'Destruction',
    role: 'dps',
    icon: 'spell_shadow_rainoffire',
    // Its Curse of the Elements is its own, which its rotation keeps up (warlock.md §6).
    ownBuffs: ['curseOfTheElements'],
    caster: true,
  },
  'warlock-affliction': {
    id: 'warlock-affliction',
    classId: 'warlock',
    className: 'Warlock',
    name: 'Affliction',
    role: 'dps',
    icon: 'spell_shadow_deathcoil',
    ownBuffs: ['curseOfTheElements'],
    caster: true,
  },
  // docs/classes/priest.md: the Shadow Priest, on the caster core, landed under D27 (K4).
  'priest-shadow': {
    id: 'priest-shadow',
    classId: 'priest',
    className: 'Priest',
    name: 'Shadow',
    role: 'dps',
    icon: 'spell_shadow_shadowwordpain',
    caster: true,
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
  mage: '#3FC7EB',
  warlock: '#8788EE',
  priest: '#FFFFFF',
}
