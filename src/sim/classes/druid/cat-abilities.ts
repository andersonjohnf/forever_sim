// The cat's abilities as data (docs/classes/druid.md §3): Shred, Claw, Rake, Rip, Ferocious Bite,
// Tiger's Fury, Berserk and Faerie Fire in Cat Form, and the on-use items and consumables a cat
// presses. Auto attack is the form's weapon (forms.ts).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), with the doc
// value as fallback, written out here so the app bundle doesn't carry the client dataset;
// cat.test.ts checks them against it. Energy is in tenths, times in ms. These are the base rows:
// the build's talents (Ferocity, Shredding Attacks, Savage Fury, Genesis, Predatory Instincts,
// Rend and Tear, Blood Frenzy) are applied by `withDruidTalents` (modifiers.ts) when the plan
// resolves the rotation.
import { CRIT_MULTIPLIER } from '../../core/formulas'
import type { OnUseSpec } from '../../effects/types'
import { type AbilityDef, STANCE_ANY } from '../../plan/types'
import { NO_STRIKE } from './abilities'
import { formBit } from './forms'

const CAT = formBit('cat')

/** Cat abilities' GCD: `StartRecoveryTime` 1000 [F] [C] (druid.md §2.6). */
export const CAT_GCD_MS = 1000

/** A cat builder that misses or is dodged refunds 80% of its Energy [?] (druid.md §2.4, Q29). */
const BUILDER_REFUND = 0.8

/**
 * Berserk's aura (417141): for 15 s, +100% crit chance on Claw, Rake, Shred, Ravage and Pounce
 * (aura 107, crit chance, class mask 0x39000) [F] (druid.md §3.7). The builders carry the crit
 * (`auraCrit`); Rake's bleed snapshots it with the rest of its crit chance [?].
 */
export const BERSERK_AURA_ID = 'berserk'
export const BERSERK_CRIT_PCT = 100
const BERSERK_CRIT = { aura: BERSERK_AURA_ID, pct: BERSERK_CRIT_PCT } as const

/** The fields of a cat attack: Energy, Cat Form only, the cat GCD, one threat per damage (druid.md §3.11). */
const CAT_ATTACK = {
  ...NO_STRIKE,
  resource: 'energy',
  forms: CAT,
  cooldownMs: 0,
  gcdMs: CAT_GCD_MS,
  stances: STANCE_ANY,
  offHand: false,
  threatMult: 1,
  critMultiplier: CRIT_MULTIPLIER.melee,
} as const

/**
 * Shred rank 5 (spells.json 9830): 60 Energy, GCD 1000, `WEAPON_PERCENT_DAMAGE` 155 and
 * `WEAPON_DAMAGE` +80, added before the percentage as in Classic Era: 1.55 × (W + 80) [F]; the order
 * is [C] (Q1). One roll. +1 combo point (`ENERGIZE` power 4). From behind only (druid.md §3.1).
 */
export const SHRED: AbilityDef = {
  id: 'shred',
  name: 'Shred',
  icon: 'spell_shadow_vampiricaura',
  kind: 'weaponStrike',
  ...CAT_ATTACK,
  costTenths: 600,
  weaponPercent: 1.55,
  flatDamage: 80,
  refundShare: BUILDER_REFUND,
  comboPoints: 1,
  clearcastable: true,
  behindOnly: true,
  auraCrit: BERSERK_CRIT,
}

/** Claw rank 5 (spells.json 9850): 45 Energy, GCD 1000, 1.10 × (W + 115), one roll, +1 combo point (druid.md §3.2). */
export const CLAW: AbilityDef = {
  id: 'claw',
  name: 'Claw',
  icon: 'ability_druid_rake',
  kind: 'weaponStrike',
  ...CAT_ATTACK,
  costTenths: 450,
  weaponPercent: 1.1,
  flatDamage: 115,
  refundShare: BUILDER_REFUND,
  comboPoints: 1,
  clearcastable: true,
  auraCrit: BERSERK_CRIT,
}

/**
 * Rake rank 4 (spells.json 9904): 40 Energy, GCD 1000; `SCHOOL_DAMAGE` 61 with no attack power
 * scaling, then a bleed of 34 every 3000 ms for 9000 ms (aura 3, mechanic 15), +1 combo point. Its
 * hit has no weapon damage, so it rolls twice like Bloodthirst [?] (Q33); its ticks carry the
 * periodic-crit flag (SpellMisc Attributes[8] 0x200), so they crit in `forever` [?] (druid.md §3.3,
 * §2.9).
 */
export const RAKE: AbilityDef = {
  id: 'rake',
  name: 'Rake',
  icon: 'ability_druid_disembowel',
  kind: 'meleeSpell',
  ...CAT_ATTACK,
  costTenths: 400,
  flatDamage: 61,
  refundShare: BUILDER_REFUND,
  comboPoints: 1,
  clearcastable: true,
  dotTickDamage: 34,
  dotTicks: 3,
  dotTickMs: 3000,
  periodicCanCrit: true,
  aura: { id: 'rake', name: 'Rake', durationMs: 9000, mods: {} },
  auraCrit: BERSERK_CRIT,
}

/**
 * Rip rank 6 (spells.json 9896): 30 Energy and every combo point, GCD 1000; a bleed of 15 + 25.5 per
 * combo point every 2000 ms for 12000 ms (`EffectPointsPerResource` 25.5) [F], plus 1% of attack
 * power per combo point per tick, up to 4 [?] (Q3), snapshotted when it lands (druid.md §3.4, §2.9).
 * A finisher refunds nothing when avoided and keeps its combo points [?] (Q29).
 */
export const RIP: AbilityDef = {
  id: 'rip',
  name: 'Rip',
  icon: 'ability_ghoulfrenzy',
  kind: 'bleed',
  ...CAT_ATTACK,
  costTenths: 300,
  finisher: true,
  clearcastable: true,
  dotTickDamage: 15,
  dotTickPerComboPoint: 25.5,
  dotApCoefficientPerComboPoint: 0.01,
  comboPointApCap: 4,
  dotTicks: 6,
  dotTickMs: 2000,
  periodicCanCrit: true,
  aura: { id: 'rip', name: 'Rip', durationMs: 12000, mods: {} },
}

/**
 * Ferocious Bite rank 5 (spells.json 31018): 35 Energy and every combo point, GCD 1000;
 * `SCHOOL_DAMAGE` 82 with `Variance` 0.7317, so 52–112, + 147 per combo point, + 2.7 per Energy left
 * after the cost (`DUMMY` 270) [F], + 3% of attack power per combo point [?] (Q3). A landed Bite
 * spends all the Energy. No weapon damage, so it rolls twice [?] (Q33) (druid.md §3.5).
 */
export const FEROCIOUS_BITE: AbilityDef = {
  id: 'ferociousBite',
  name: 'Ferocious Bite',
  icon: 'ability_druid_ferociousbite',
  kind: 'meleeSpell',
  ...CAT_ATTACK,
  costTenths: 350,
  flatDamage: 52,
  flatDamageRange: 60,
  damagePerComboPoint: 147,
  apCoefficientPerComboPoint: 0.03,
  damagePerExtraRage: 2.7,
  finisher: true,
  clearcastable: true,
}

/** King of the Jungle: Tiger's Fury grants 20 Energy per rank (curve on 417046 effect 0) [F] (druid.md §3.6). */
export const KING_OF_THE_JUNGLE_ENERGY_PER_RANK = 20

/** Wolfshead Helm (17768 effect 1): Tiger's Fury grants 20 Energy more [F] (druid.md §1.1, §3.6). */
export const WOLFSHEAD_TIGERS_FURY_ENERGY = 20

/** Tiger's Fury's Energy for this build and head: 20 per King of the Jungle rank, +20 with Wolfshead Helm (druid.md §3.6, W8). */
export const tigersFuryEnergy = (kingOfTheJungleRank: number, wolfshead: boolean) =>
  KING_OF_THE_JUNGLE_ENERGY_PER_RANK * kingOfTheJungleRank + (wolfshead ? WOLFSHEAD_TIGERS_FURY_ENERGY : 0)

/**
 * Tiger's Fury (spells.json 5217): free, off the GCD, `RecoveryTime` 30000, Cat Form only; +15%
 * physical damage done for 6000 ms [F], and the Energy of King of the Jungle and Wolfshead Helm at
 * once, an energize (druid.md §3.6). The hidden 5/10/15 of King of the Jungle does nothing here (Q7).
 */
export function tigersFury(kingOfTheJungleRank: number, wolfshead: boolean): AbilityDef {
  return {
    id: 'tigersFury',
    name: 'Tiger’s Fury',
    icon: 'ability_mount_jungletiger',
    kind: 'cast',
    ...CAT_ATTACK,
    gcdMs: 0,
    threatMult: 0,
    costTenths: 0,
    cooldownMs: 30000,
    aura: { id: 'tigersFury', name: 'Tiger’s Fury', durationMs: 6000, mods: { damage: 15 } },
    rageTenths: 10 * tigersFuryEnergy(kingOfTheJungleRank, wolfshead),
  }
}

/**
 * Berserk (spells.json 417141, the talent): free, off the GCD, `RecoveryTime` 180000; for 15000 ms
 * the builders' crit (`auraCrit` on Shred, Claw and Rake) [F] (druid.md §3.7). Usable in cat and bear;
 * its bear part is Primal Bite's: no cooldown while it's up (`noCooldownWhile`, bear-abilities.ts, §4.6).
 */
export const BERSERK: AbilityDef = {
  id: 'berserk',
  name: 'Berserk',
  icon: 'ability_druid_berserk',
  kind: 'cast',
  ...CAT_ATTACK,
  forms: formBit('cat', 'bear'),
  resource: 'rage',
  gcdMs: 0,
  threatMult: 0,
  costTenths: 0,
  cooldownMs: 180000,
  aura: { id: BERSERK_AURA_ID, name: 'Berserk', durationMs: 15000, mods: {} },
}

/** Faerie Fire's armor, −505 at rank 4 (aura 22) [F] (druid.md §3.8). */
export const FAERIE_FIRE_ARMOR = 505

/**
 * Faerie Fire rank 4 (spells.json 9907) in Cat Form: −505 armor on the boss for 40000 ms. The cat
 * passive (3025) makes it free (−100% cost), adds a 6000 ms cooldown and takes 500 ms off its 1500 ms
 * GCD [F] (druid.md §3.8). A Nature spell, so it rolls spell hit (combat-tables §9); its threat isn't
 * counted (Q15).
 */
export const FAERIE_FIRE_CAT: AbilityDef = {
  id: 'faerieFire',
  name: 'Faerie Fire',
  icon: 'spell_nature_faeriefire',
  kind: 'cast',
  ...CAT_ATTACK,
  resource: 'mana',
  threatMult: 0,
  costTenths: 0,
  cooldownMs: 6000,
  gcdMs: 1000,
  spellHit: true,
  aura: { id: 'faerieFire', name: 'Faerie Fire', durationMs: 40000, mods: { targetArmor: FAERIE_FIRE_ARMOR } },
}

/**
 * An on-use item or consumable as a cast (effects/types.ts OnUseSpec): free, off the GCD unless it
 * has one, any form, its buff and rage, and at most its charges a fight (Manual Crowd Pummeler's 3,
 * druid.md §7.3).
 */
export const onUseCast = (use: OnUseSpec): AbilityDef => ({
  id: use.id,
  name: use.name,
  icon: use.icon,
  kind: 'cast',
  ...NO_STRIKE,
  offHand: false,
  costTenths: 0,
  cooldownMs: use.cooldownMs,
  gcdMs: use.gcdMs,
  stances: STANCE_ANY,
  aura: use.aura,
  rageTenths: use.rageTenths,
  rageSpreadTenths: use.rageSpreadTenths,
  usesPerFight: use.charges ?? 0,
})
