// Warrior stances and passive talents as effects (docs/classes/warrior.md §2.1, §4).
//
// Talents are keyed by name and read their rank from the build code, so a data refresh that
// renames ids doesn't break them. Only passives that change white swings, stats, rage, threat
// or tank avoidance are here; talents that modify abilities (cost reductions, Impale, Raging
// Blows) are in modifiers.ts, and the rest (Improved Slam, …) come with their abilities.
import type { Effect } from '../../effects/types'
import type { RulesProfile } from '../../rules/profiles'

export type Stance = 'battle' | 'defensive' | 'berserker'

/** Stance passives in Forever (warrior.md §2.1). */
export const STANCE_EFFECTS: Record<Stance, Effect[]> = {
  // Battle Stance: threat ×0.8 (spell 21156) [F]
  battle: [{ kind: 'threat', pct: -20 }],
  // Defensive Stance: damage taken −10%, damage done −10%, threat +30% (spell 7376) [F]
  defensive: [
    { kind: 'threat', pct: 30 },
    { kind: 'damage', pct: -10 },
    { kind: 'damageTaken', pct: -10 },
  ],
  // Berserker Stance: +3% crit with attacks and spells (all-crit aura 290), damage taken +10%,
  // threat ×0.8 (spell 7381) [F]
  berserker: [
    { kind: 'threat', pct: -20 },
    { kind: 'stat', stat: 'crit', value: 3 },
    { kind: 'stat', stat: 'spellCrit', value: 3 },
    { kind: 'damageTaken', pct: 10 },
  ],
}

/**
 * Stance passives in Classic Era (warrior.md §2.1): Berserker Stance's +3% is melee crit only
 * (7381 #0 is aura 52 in 1.15.9.69722) [C]; the others are the same.
 */
export const STANCE_EFFECTS_CLASSIC_ERA: Record<Stance, Effect[]> = {
  ...STANCE_EFFECTS,
  berserker: STANCE_EFFECTS.berserker.filter((e) => !(e.kind === 'stat' && e.stat === 'spellCrit')),
}

/** The stance passives under a rule profile: Classic Era's where the profile reads its values. */
export function stanceEffects(profile: RulesProfile): Record<Stance, Effect[]> {
  return profile.catalogue.column === 'classicEra' ? STANCE_EFFECTS_CLASSIC_ERA : STANCE_EFFECTS
}

export const STANCE_NAME: Record<Stance, string> = {
  battle: 'Battle Stance',
  defensive: 'Defensive Stance',
  berserker: 'Berserker Stance',
}

const WARRIOR_DOC = 'docs/classes/warrior.md'

/** Effects of one talent at a rank (warrior.md §4 "Model" column), or undefined if it has none in M1. */
export const TALENT_EFFECTS: Record<string, (rank: number) => Effect[]> = {
  // Fury 1·3: +1% melee crit per rank
  Cruelty: (r) => [{ kind: 'stat', stat: 'crit', value: r }],
  // Fury 4·1: +5% off-hand damage, +2% off-hand hit, +20% off-hand rage per rank (§2.3, W8, W23)
  'Dual Wield Specialization': (r) => [{ kind: 'offHand', damagePct: 5 * r, hit: 2 * r, ragePct: 20 * r }],
  // Fury 5·1: +1% hit per rank (the data also adds spell hit)
  Precision: (r) => [
    { kind: 'stat', stat: 'hit', value: r },
    { kind: 'stat', stat: 'spellHit', value: r },
  ],
  // Fury 3·4: +10 maximum rage per rank
  'Boundless Rage': (r) => [{ kind: 'maxRage', value: 10 * r }],
  // Fury 6·3: any melee crit gives 3 charges of +5%/rank attack speed for 15 s (§2.5)
  Flurry: (r) => [
    {
      kind: 'proc',
      proc: {
        id: 'flurry',
        name: 'Flurry',
        icon: 'ability_ghoulfrenzy',
        trigger: 'meleeCrit',
        from: 'any',
        chance: { pct: 100 },
        action: {
          kind: 'aura',
          aura: { id: 'flurry', name: 'Flurry', durationMs: 15000, whiteSwingCharges: 3, mods: { haste: 5 * r } },
        },
        docRef: `${WARRIOR_DOC}#25-crits-impale-flurry-deep-wounds`,
      },
    },
  ],
  // Fury 2·3: 12%/rank to gain 1 rage (2 with a two-hander) on a landed auto attack: white swings of
  // either hand and extra attacks, not Heroic Strike or Cleave swings (§2.3: 12319's proc mask 0x4, D36)
  'Unbridled Wrath': (r) =>
    [false, true].map(
      (twoHand): Effect => ({
        kind: 'proc',
        when: { twoHand },
        proc: {
          id: 'unbridledWrath',
          name: 'Unbridled Wrath',
          icon: 'spell_nature_stoneclawtotem',
          trigger: 'whiteLanded',
          from: 'any',
          chance: { pct: 12 * r },
          action: { kind: 'rage', amount: twoHand ? 2 : 1 },
          docRef: `${WARRIOR_DOC}#23-rage-warrior-specific`,
        },
      }),
    ),
  // Fury 4·3: 30% chance when hit by a damaging attack: +2%/rank physical damage for 12 s (§2.6)
  Enrage: (r) => [
    {
      kind: 'proc',
      proc: {
        id: 'enrage',
        name: 'Enrage',
        icon: 'spell_shadow_unholyfrenzy',
        trigger: 'damageTaken',
        from: 'any',
        chance: { pct: 30 },
        action: { kind: 'aura', aura: { id: 'enrage', name: 'Enrage', durationMs: 12000, mods: { damage: 2 * r } } },
        docRef: `${WARRIOR_DOC}#26-enrage-death-wish-recklessness`,
      },
    },
  ],
  // Arms 4·2: +1% damage per rank with a two-hander; WarriorSim applies it to every attack and Deep Wounds
  'Two-Handed Weapon Specialization': (r) => [{ kind: 'damage', pct: r, physicalOnly: true, when: { twoHand: true } }],
  // Arms 3·2: +1 rage every 3 s in combat (§2.3; a regen aura, so no threat)
  'Anger Management': () => [{ kind: 'periodicRage', periodMs: 3000, amount: 1 }],
  // Arms 3·3: crits apply a bleed of 20%/rank of the main hand's average swing over 12 s (§2.5)
  'Deep Wounds': (r) => [
    {
      kind: 'proc',
      proc: {
        id: 'deepWounds',
        name: 'Deep Wounds',
        icon: 'ability_backstab',
        trigger: 'meleeCrit',
        from: 'any',
        chance: { pct: 100 },
        action: { kind: 'weaponBleed', share: 0.2 * r, ticks: 4, periodMs: 3000 },
        docRef: `${WARRIOR_DOC}#25-crits-impale-flurry-deep-wounds`,
      },
    },
  ],
  // Arms 5·3, per rank (§2.7): axe/polearm +1% crit on the attacks made with the axe or polearm, as
  // 12700's tooltip reads ("…with Axes and Polearms"), so no spell crit (the racials' tooltips say
  // "all spells and attacks"; Q15 [?]); mace/staff ignore 3% armor; sword 1% extra attack (200 ms ICD)
  Weaponmaster: (r) => [
    { kind: 'weaponCrit', value: r, weapons: ['axe', 'polearm'] },
    { kind: 'weaponArmorPenPct', pct: 3 * r, weapons: ['mace', 'staff'] },
    {
      kind: 'proc',
      proc: {
        id: 'weaponmaster',
        name: 'Weaponmaster',
        icon: 'inv_sword_27',
        trigger: 'meleeLanded',
        from: 'any',
        weapons: ['sword'],
        chance: { pct: r },
        icdMs: 200,
        action: { kind: 'extraAttacks', count: 1 },
        docRef: `${WARRIOR_DOC}#27-weaponmaster-extra-attacks-and-windfury`,
      },
    },
  ],
  // Arms 1·2: +1% parry per rank
  Deflection: (r) => [{ kind: 'stat', stat: 'parry', value: r }],
  // Protection 1·3: +4 defense per rank
  Anticipation: (r) => [{ kind: 'stat', stat: 'defense', value: 4 * r }],
  // Protection 2·3: +2% armor from items per rank
  Toughness: (r) => [{ kind: 'itemArmorPct', pct: 2 * r }],
  // Protection 1·2: +1% block per rank; 20%/rank to gain 5 rage on a block (§2.3)
  'Shield Specialization': (r) => [
    { kind: 'stat', stat: 'block', value: r, when: { shield: true } },
    {
      kind: 'proc',
      when: { shield: true },
      proc: {
        id: 'shieldSpecialization',
        name: 'Shield Specialization',
        icon: 'inv_shield_06',
        trigger: 'block',
        from: 'any',
        chance: { pct: 20 * r },
        action: { kind: 'rage', amount: 5 },
        docRef: `${WARRIOR_DOC}#23-rage-warrior-specific`,
      },
    },
  ],
  // Protection 3·2: 50%/rank to gain 5 rage on a dodge or parry with a shield equipped (§2.3)
  'Master of Defense': (r) => [
    {
      kind: 'proc',
      when: { shield: true },
      proc: {
        id: 'masterOfDefense',
        name: 'Master of Defense',
        icon: 'ability_warrior_defensivestance',
        trigger: 'dodgeParry',
        from: 'any',
        chance: { pct: 50 * r },
        action: { kind: 'rage', amount: 5 },
        docRef: `${WARRIOR_DOC}#23-rage-warrior-specific`,
      },
    },
  ],
  // Protection 3·4: +5% threat per rank in Defensive Stance with a shield (threat.md, W16)
  Defiance: (r) => [{ kind: 'threat', pct: 5 * r, when: { stance: 'defensive', shield: true } }],
  // Protection 5·4: +2% damage per rank with a shield (physical-school aura)
  Bastion: (r) => [{ kind: 'damage', pct: 2 * r, physicalOnly: true, when: { shield: true } }],
}
