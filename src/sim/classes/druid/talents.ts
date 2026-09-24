// Druid passive talents as effects (docs/classes/druid.md §2.3, §5.1, §5.2).
//
// Talents are keyed by name and read their rank from the build code, as the warrior's are. Only
// passives that change stats, white swings, rage or threat are here. Those bound to a form carry
// `when.form`: the plan builds each form's stat block with them. Talents that modify abilities
// (costs, damage, crit damage, combo points) are in modifiers.ts; Furor and Natural Shapeshifter
// act on shapeshifts (abilities.ts), and the rest (Mangle, Berserk, King of the Jungle) come with
// the abilities they change.
import { PLAYER_LEVEL } from '../../core/attack-table'
import type { Effect } from '../../effects/types'
import type { RulesProfile } from '../../rules/profiles'
import { ECLIPSE, NATURES_GRACE } from './balance-abilities'

const DOC = 'docs/classes/druid.md'
const ANIMAL = { form: ['cat', 'bear'] } as const

/** Effects of one talent at a rank (druid.md §5 "Sim model" column), or undefined if it has none. */
export const DRUID_TALENT_EFFECTS: Record<string, (rank: number, profile: RulesProfile) => Effect[]> = {
  // Feral 1·3: Int ×(1 + 0.02·r); Stamina ×(1 + 0.04·r) in bear; Strength ×(1 + 0.02·r) in cat (§5.1)
  'Heart of the Wild': (r) => [
    { kind: 'mult', stat: 'int', pct: 2 * r },
    { kind: 'mult', stat: 'sta', pct: 4 * r, when: { form: ['bear'] } },
    { kind: 'mult', stat: 'str', pct: 2 * r, when: { form: ['cat'] } },
  ],
  // Feral 2·1: +2% dodge per rank; the Forever tooltip drops "while in Cat Form", so in every form
  // [?] (character-stats.md OQ-11)
  'Feral Swiftness': (r) => [{ kind: 'stat', stat: 'dodge', value: 2 * r }],
  // Feral 3·4: +3% crit per rank in Cat, Bear and Dire Bear Form (§2.3); aura 290, so spells too
  'Sharpened Claws': (r) => [
    { kind: 'stat', stat: 'crit', value: 3 * r, when: ANIMAL },
    { kind: 'stat', stat: 'spellCrit', value: 3 * r, when: ANIMAL },
  ],
  // Feral 4·3: +50% of level as attack power per rank in the animal forms, +90 at 3/3 (§2.2)
  'Predatory Strikes': (r) => [{ kind: 'stat', stat: 'ap', value: 0.5 * PLAYER_LEVEL * r, when: ANIMAL }],
  // Feral 4·4: 50% per rank to gain 5 rage on any crit in Bear or Dire Bear Form (16959: energize
  // 50; §4.8, rage.md#bear-druid-rage). Its combo-point part is on the builders (modifiers.ts).
  'Primal Fury': (r) => [
    {
      kind: 'proc',
      proc: {
        id: 'primalFury',
        name: 'Primal Fury',
        icon: 'ability_racial_cannibalize',
        trigger: 'meleeCrit',
        from: 'any',
        chance: { pct: 50 * r },
        action: { kind: 'rage', amount: 5 },
        forms: ['bear'],
        docRef: `${DOC}#48-bear-threat-and-druid-rage-numbers-summary-for-the-shared-docs`,
      },
    },
  ],
  // Feral 5·2: +3% crit to the party in an animal form (24932, aura 290: all crit in Forever;
  // Classic Era's is melee crit only, as the buff catalogue's Classic Era column) (§2.3). The
  // druid is its own source, so the Buffs tab's Leader of the Pack adds nothing more (classes/index.ts).
  'Leader of the Pack': (_r, profile) => [
    { kind: 'stat', stat: 'crit', value: 3, when: ANIMAL },
    ...(profile.catalogue.column === 'classicEra' ? [] : [{ kind: 'stat', stat: 'spellCrit', value: 3, when: ANIMAL } as const]),
  ],
  // Feral 6·1: +1% dodge per rank, and 20% per rank to gain 5 rage on a dodge (417051, 417053:
  // energize 50) (§4.8, rage.md#bear-druid-rage). It fires on the player's dodges only (the `dodge`
  // trigger, combat-tables §8), not on parries, which a druid can't make anyway.
  'Natural Reaction': (r) => [
    { kind: 'stat', stat: 'dodge', value: r },
    {
      kind: 'proc',
      proc: {
        id: 'naturalReaction',
        name: 'Natural Reaction',
        icon: 'ability_bullrush',
        trigger: 'dodge',
        from: 'any',
        chance: { pct: 20 * r },
        action: { kind: 'rage', amount: 5 },
        docRef: `${DOC}#48-bear-threat-and-druid-rage-numbers-summary-for-the-shared-docs`,
      },
    },
  ],
  // Balance 2·3: +2% crit per rank with spells and melee (aura 290) (§2.3, §5.2)
  "Nature's Majesty": (r) => [
    { kind: 'stat', stat: 'crit', value: 2 * r },
    { kind: 'stat', stat: 'spellCrit', value: 2 * r },
  ],
  // Balance 2·4: +2% melee hit (aura 54) and spell hit (aura 55) per rank (§2.3, §5.2)
  "Nature's Reach": (r) => [
    { kind: 'stat', stat: 'hit', value: 2 * r },
    { kind: 'stat', stat: 'spellHit', value: 2 * r },
  ],
  // Restoration 2·1: +1% all damage per rank (aura 79, all schools) (§2.3, §5.2)
  Naturalist: (r) => [{ kind: 'damage', pct: r }],
  // Restoration: +5% Spirit per rank (character-stats.md#other-stat-changing-talents-and-spells)
  'Living Spirit': (r) => [{ kind: 'mult', stat: 'spi', pct: 5 * r }],
  // Balance 6·2: +2% Arcane and Nature damage per rank (16896: aura 79, school mask 72) [F] (§11.3)
  Moonfury: (r) => [{ kind: 'schoolDamage', schools: ['arcane', 'nature'], pct: 2 * r }],
  // Balance 5·2: a non-periodic spell crit gives +10% casting speed and a 10% shorter GCD for 3 s (§11.3)
  "Nature's Grace": () => [{ kind: 'proc', proc: NATURES_GRACE }],
  // Balance 5·3: a landed Wrath gives 2 charges that shorten Starfire's cast (§11.3); the cut per rank
  // is on Starfire (balance-abilities.ts withBalanceTalents), and without a Wrath the proc is left out.
  Eclipse: () => [{ kind: 'proc', proc: ECLIPSE }],
}
