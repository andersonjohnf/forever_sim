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
   * default (the cat's Faerie Fire, druid.md §6.2). No preset adds them for the spec, so when the
   * rotation drops one, the Buffs tab's is off until you turn it on there because someone else
   * keeps it up (docs/ux.md "Buffs"). The tank's duties under D26 work the same way.
   */
  ownBuffs?: readonly string[]
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
  },
}

export const SPEC_IDS = Object.keys(SPEC_META) as SpecId[]

/** Class colors (docs/ux.md#visual-language): accents only. */
export const CLASS_COLOR: Record<ClassId, string> = {
  warrior: '#C69B6D',
  druid: '#FF7C0A',
  paladin: '#F48CBA',
}
