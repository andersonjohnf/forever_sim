// Rogue passive talents as effects (docs/classes/rogue.md §5). Keyed by name, reading the rank from
// the build code. Talents that modify abilities (costs, damage, crit, combo points, Slice and Dice's
// time) are in modifiers.ts; Vigor is in the Energy plan (setup.ts).
import type { Effect } from '../../effects/types'

const DOC = 'docs/classes/rogue.md'

export const ROGUE_TALENT_EFFECTS: Record<string, (rank: number) => Effect[]> = {
  // Assassination 1·3: +1% crit per rank with all attacks and poisons (aura 290, all crit) [F]
  Malice: (r) => [
    { kind: 'stat', stat: 'crit', value: r },
    { kind: 'stat', stat: 'spellCrit', value: r },
  ],
  // Assassination 2·2: +2% all damage per rank against Humanoids and Giants (aura 168, mask 80) [F]
  Murder: (r) => [{ kind: 'damage', pct: 2 * r, when: { creature: ['humanoid', 'giant'] } }],
  // Assassination 4·1: +4% poison damage per rank (Vile Poisons, rogue.md §4.3) [F]
  'Vile Poisons': (r) => [{ kind: 'poisonDamage', pct: 4 * r }],
  // Assassination 4·3: +2 points of poison apply chance per rank [F]; its charge saving doesn't matter in one fight
  'Improved Poisons': (r) => [{ kind: 'poisonChance', pct: 2 * r }],
  // Combat 1·3: +1% dodge per rank [F]
  'Lightning Reflexes': (r) => [{ kind: 'stat', stat: 'dodge', value: r }],
  // Combat 2·2: +2% parry per rank [F]
  Deflection: (r) => [{ kind: 'stat', stat: 'parry', value: 2 * r }],
  // Combat 2·3: +1% hit and +1% spell hit per rank (auras 54 and 55): poisons too [F]
  Precision: (r) => [
    { kind: 'stat', stat: 'hit', value: r },
    { kind: 'stat', stat: 'spellHit', value: r },
  ],
  // Combat 4·3: +5% off-hand damage per rank (aura 122) [F]
  'Dual Wield Specialization': (r) => [{ kind: 'offHand', damagePct: 5 * r }],
  // Combat 5·3, per rank (rogue.md §5.2): axe/sword 1% extra attack (200 ms ICD, like the warrior's
  // Weaponmaster); dagger/fist +1% crit on that weapon's attacks [?]; mace ignores 3% armor [F]
  'Hack and Slash': (r) => [
    { kind: 'weaponCrit', value: r, weapons: ['dagger', 'fist'] },
    { kind: 'weaponArmorPenPct', pct: 3 * r, weapons: ['mace'] },
    {
      kind: 'proc',
      proc: {
        id: 'hackAndSlash',
        name: 'Hack and Slash',
        icon: 'inv_sword_27',
        trigger: 'meleeLanded',
        from: 'any',
        weapons: ['sword', 'axe'],
        chance: { pct: r },
        icdMs: 200,
        action: { kind: 'extraAttacks', count: 1 },
        docRef: `${DOC}#52-combat`,
      },
    },
  ],
  // Combat 6·2: −1% chance to be dodged or parried per rank (aura 240, expertise) [F]
  'Weapon Expertise': (r) => [{ kind: 'stat', stat: 'expertise', value: r }],
  // Subtlety 4·3: attacks ignore 3% of the target's armor per rank (aura 280) [F]; its Rupture damage is in modifiers.ts
  'Serrated Blades': (r) => [{ kind: 'weaponArmorPenPct', pct: 3 * r }],
}

/** The rogue's passive effects for a build (rogue.md §5). */
export function rogueTalentEffects(talents: ReadonlyMap<string, number>): Effect[] {
  const out: Effect[] = []
  for (const [name, rank] of talents) {
    const f = ROGUE_TALENT_EFFECTS[name]
    if (f) out.push(...f(rank))
  }
  return out
}
