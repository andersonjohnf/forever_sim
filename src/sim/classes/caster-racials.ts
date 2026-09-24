// The racial cooldowns of every class that casts spells: the mage, the priest, the warlock and the
// shaman (docs/mechanics/character-stats.md#racials-that-matter-to-the-sim, docs/mechanics/spells.md
// §4). One definition each, so no class drifts from the client: Forever's Troll Berserking and Orc
// Blood Fury have their caster effects, and Night Elf Elune's Light is the warrior's (its crit is for
// spells and attacks alike). All three are off the GCD, cost nothing and are pressed on cooldown.
import type { AbilityDef } from '../plan/types'
import { BERSERKING, BLOOD_FURY, RACIAL_COOLDOWNS } from './warrior/abilities'

/**
 * Berserking (20554) [F] [client] (SpellEffect auras 65, 140 and 319, SpellDuration, SpellCooldowns,
 * 1.60.1.69913): a flat +10% casting and attack speed for 10 s, 3 min (docs/mechanics/spells.md §4).
 */
export const BERSERKING_CASTER: AbilityDef = {
  ...BERSERKING,
  aura: { id: 'berserking', name: 'Berserking', durationMs: 10000, mods: { haste: 10, castHaste: 10 } },
}

/**
 * Blood Fury (20572) [F] [client] (SpellEffect auras 166, 167 and 317, 1.60.1.69913): +10% attack
 * power and +10% spell power for 15 s, 2 min. The spell power is a live multiplier on every school's
 * spell damage while the aura is up, gear, buffs and other cooldowns included, not rounded [?]
 * (docs/classes/warlock.md#72-race).
 */
export const BLOOD_FURY_CASTER: AbilityDef = {
  ...BLOOD_FURY,
  aura: { id: 'bloodFury', name: 'Blood Fury', durationMs: 15000, mods: { apPct: 10, spellDamagePct: 10 } },
}

/** A caster's racial cooldown by race id; races without one (Human, Dwarf, Undead, Gnome, Tauren, Skyborne) have none. */
export const CASTER_RACIALS: Readonly<Partial<Record<string, AbilityDef>>> = {
  ...RACIAL_COOLDOWNS,
  'horde-orc': BLOOD_FURY_CASTER,
  'horde-troll': BERSERKING_CASTER,
}
