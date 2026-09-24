// Racials as effects (docs/mechanics/character-stats.md#racials-that-matter-to-the-sim).
//
// Passive racials only. Cooldown racials are rotation actions the class rotation presses: Blood
// Fury, Berserking and Elune's Light are `cast` abilities of the Fury rotation
// (classes/warrior/abilities.ts, warrior.md §5.2 row 3); Eureka! isn't simulated yet (warrior.md
// §7, Q18); Touch of the Grave, Stoneform and Shatter Curse aren't simulated (warrior.md §2.9, Q16).
import type { WeaponType } from '@/data/items/types'
import type { ClassId } from '../types'
import type { Effect } from './types'

/**
 * Sword, Axe and Mace Specialization (aura 290): +`value`% crit with all spells and attacks while a
 * weapon of one of `types` is equipped in either hand, as the Forever tooltips read ("while you have
 * a sword or two-handed sword equipped"), so it's aura crit for every attack, both hands and spells
 * alike (character-stats.md#racials-that-matter-to-the-sim, warrior.md §2.9). Whether one matching
 * weapon in either hand is enough when dual wielding is [?] (warrior Q15). Weaponmaster's axe and
 * polearm crit is the same client data, but its tooltip says "with Axes and Polearms", so it counts
 * only for that weapon's attacks (a `weaponCrit` effect, warrior.md §2.7).
 */
const weaponRacial = (value: number, types: WeaponType[]): Effect[] => [
  { kind: 'stat', stat: 'crit', value, when: { weapons: types } },
  { kind: 'stat', stat: 'spellCrit', value, when: { weapons: types } },
]

const SKYBORNE: Effect[] = [
  // Wind Blessed: +1% melee, ranged and spell haste [F] (character-stats racials table)
  { kind: 'haste', pct: 1 },
  // Elemental Insight: +5% damage vs Elementals [F]
  { kind: 'damage', pct: 5, when: { creature: ['elemental'] } },
]

/** A race's passive racials for this class; the weapon racials hold while their weapon is equipped. */
export function racialEffects(race: string, classId: ClassId): Effect[] {
  switch (race) {
    case 'alliance-human':
      return [
        // Sword Specialization (20597): +2% crit while a sword is equipped [F]; either hand [?] (warrior Q15)
        ...weaponRacial(2, ['sword']),
        // The Human Spirit (20598): Spirit +5% [F]
        { kind: 'mult', stat: 'spi', pct: 5 },
      ]
    case 'alliance-dwarf':
      return [
        // Mace Specialization (1259719): +1% crit while a mace is equipped [F]; either hand [?] (warrior Q15)
        ...weaponRacial(1, ['mace']),
        // Big Game Hunter (1259721): +5% damage vs Beasts [F]
        { kind: 'damage', pct: 5, when: { creature: ['beast'] } },
      ]
    case 'alliance-night-elf':
      // Quickness (20582): +1% dodge [F]
      return [{ kind: 'stat', stat: 'dodge', value: 1 }]
    case 'alliance-gnome':
      // Expansive Mind, one spell per class mask (character-stats.md#racials-that-matter-to-the-sim) [F]:
      switch (classId) {
        // 1259802 (warrior): maximum Rage +5%; how it combines with Boundless Rage is [?] (warrior Q17)
        case 'warrior':
          return [{ kind: 'maxRagePct', pct: 5 }]
        // 1259803 (rogue): maximum Energy +5% (aura 178, misc 3); how it combines with Vigor is [?] (rogue.md §2.1)
        case 'rogue':
          return [{ kind: 'maxEnergyPct', pct: 5 }]
        // 20591 (priest, mage, warlock: class mask 400): maximum mana +5% (aura 178)
        case 'priest':
        case 'mage':
        case 'warlock':
          return [{ kind: 'mult', stat: 'mana', pct: 5 }]
        default:
          return []
      }
    case 'horde-orc':
      // Axe Specialization (20574): +1% crit while an axe is equipped [F]; either hand [?] (warrior Q15)
      return weaponRacial(1, ['axe'])
    case 'horde-tauren':
      return [
        // Endurance (20550): total health +5% and +1% hit with melee, ranged and spells [F]
        { kind: 'mult', stat: 'health', pct: 5 },
        { kind: 'stat', stat: 'hit', value: 1 },
        { kind: 'stat', stat: 'spellHit', value: 1 },
      ]
    case 'horde-troll':
      // Beast Slaying (20557): +5% damage vs Beasts [F]
      return [{ kind: 'damage', pct: 5, when: { creature: ['beast'] } }]
    case 'alliance-skyborne-high-order':
    case 'horde-skyborne-windshaper':
      return SKYBORNE
    default:
      return []
  }
}

/**
 * Racial cooldowns (warrior.md §2.9), for the assumptions list: whether a rotation can press them
 * yet. Blood Fury, Berserking and Elune's Light are in the Fury rotation (row 3); Eureka! isn't
 * simulated (its charges and cost rounding are Q18).
 */
export const COOLDOWN_RACIALS: Record<string, { name: string; simulated: boolean }> = {
  'horde-orc': { name: 'Blood Fury', simulated: true },
  'horde-troll': { name: 'Berserking', simulated: true },
  'alliance-night-elf': { name: 'Elune’s Light', simulated: true },
  'alliance-gnome': { name: 'Eureka!', simulated: false },
}
