// The [?] assumptions a result depends on (docs/doctrine.md#4-engine, docs/ux.md#results).
//
// The plan builder adds an assumption only when the setup actually relies on it, so the list
// stays short and specific. Each links to the doc section that owns the value.
import type { Assumption } from '../types'

const CT = 'docs/mechanics/combat-tables.md'
const DT = 'docs/mechanics/damage-and-timing.md'
const RAGE = 'docs/mechanics/rage.md'
const THREAT = 'docs/mechanics/threat.md'
const STATS = 'docs/mechanics/character-stats.md'
const BUFFS = 'docs/mechanics/buffs-debuffs-consumables.md'
const ENC = 'docs/mechanics/encounter.md'
const WAR = 'docs/classes/warrior.md'

const REGISTRY = {
  whiteSwingsOnly: {
    text: 'Only white swings, talents, procs and buffs are simulated for now: abilities, cooldowns and on-use items arrive with the rotation.',
    docRef: 'docs/milestones.md#m2-warrior-dps-with-the-production-ux',
  },
  gcdHaste: {
    text: 'The 1.5 s global cooldown isn’t shortened by haste, as in Classic Era; untested in Forever.',
    docRef: `${DT}#35-global-cooldown`,
  },
  abilityRefunds: {
    text: 'An ability that misses or is dodged or parried refunds 80% of its rage cost (Whirlwind nothing; a missed Execute loses only its cost), as in Classic Era; untested in Forever.',
    docRef: `${RAGE}#rage-refunds-on-avoided-abilities`,
  },
  onNextSwingRage: {
    text: 'A Heroic Strike swing generates no rage from its damage, as in Classic Era and as Forever players report; unmeasured.',
    docRef: `${RAGE}#yellow-damage-and-on-next-swing-attacks`,
  },
  onNextSwingOffHand: {
    text: 'While Heroic Strike is queued, off-hand swings don’t take the 19% dual-wield miss penalty, as a small Forever beta test found.',
    docRef: `${CT}#5-dual-wield-and-on-next-swing-queues`,
  },
  unbridledWrathSwings: {
    text: 'Unbridled Wrath can also proc from Heroic Strike swings and extra attacks, as in Classic Era sims; the Forever data lists only auto attacks.',
    docRef: `${WAR}#23-rage-warrior-specific`,
  },
  ragingBlows: {
    text: 'Raging Blows’ off-hand Whirlwind strike deals normalized off-hand weapon damage at the off-hand multiplier, rolls its own hit and crit, and procs on-hit effects; untested.',
    docRef: `${WAR}#31-damage-abilities`,
  },
  foreverHitTable: {
    text: 'The boss’s miss and dodge chances (8% and 6.5% at 300 weapon skill, no hit suppression) are what the Forever client shows; nobody has measured them in combat yet.',
    docRef: `${CT}#1-rules-profiles`,
  },
  foreverBossParry: {
    text: 'From the front the boss parries 16.5% of attacks, as the Forever client shows (Classic Era: 14%); unmeasured in combat.',
    docRef: `${CT}#11-profile-parameters-player-level-60-vs-boss-level-63-defense-315`,
  },
  foreverGlancing: {
    text: 'Glancing blows deal 75% damage at 300 weapon skill, per the Forever client’s skill panel. Beta glancing damage is reported broken, so this is unmeasured.',
    docRef: `${CT}#23-glancing-blows`,
  },
  critSuppression: {
    text: 'Against a level-63 boss, crit is lowered by the weapon-skill gap plus up to 1.8% of crit from auras, carried over from Classic Era.',
    docRef: `${CT}#44-crit-suppression`,
  },
  ratingsInCombat: {
    text: 'Gear ratings convert at the rates the client displays (14 crit, 10 hit, 12 dodge, 15 parry, 5 block per 1%); whether they hold in combat is unmeasured.',
    docRef: `${CT}#10-ratings`,
  },
  expertise: {
    text: 'Expertise lowers the boss’s dodge and parry chances by its percentage (10 rating per 1%), the untested best guess.',
    docRef: 'docs/decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22',
  },
  hasteRating: {
    text: 'Haste rating gives 1% attack speed per 10 rating and multiplies with other haste, the untested best guess.',
    docRef: 'docs/decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22',
  },
  armorPen: {
    text: 'Armor penetration removes that much armor from the boss for your attacks, the untested best guess.',
    docRef: 'docs/decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22',
  },
  negativeArmor: {
    text: 'The boss’s armor is below zero after debuffs, which increases your damage per the Forever tooltip; unmeasured in combat.',
    docRef: `${DT}#12-armor-reduction-debuffs-and-penetration`,
  },
  offHandFirstSwing: {
    text: 'The off hand’s first swing lands half a swing after the main hand’s, a modelling choice that avoids synchronised hands.',
    docRef: `${DT}#31-haste`,
  },
  hasteNextSwing: {
    text: 'A change in attack speed applies from the next swing; the swing in progress isn’t rescaled.',
    docRef: `${DT}#31-haste`,
  },
  foreverWhiteRage: {
    text: 'Each landed white hit gives a fixed rage set by weapon speed (3.5 per second one-handed, 4.5 two-handed), from low-level beta logs by other players.',
    docRef: `${RAGE}#forever-normalized-rage-per-swing-`,
  },
  foreverOffHandRage: {
    text: 'Off-hand white hits give half the main-hand rate before Dual Wield Specialization.',
    docRef: `${RAGE}#forever-normalized-rage-per-swing-`,
  },
  damageTakenRage: {
    text: 'Rage from damage taken follows the Forever default (1.5 × damage ÷ 230.6), fitted to low-level beta reports.',
    docRef: `${RAGE}#rage-from-damage-taken`,
  },
  damageTakenRageHp: {
    text: 'Rage from damage taken scales with your maximum health (10 × damage ÷ max health), a third-party fit to low-level beta logs.',
    docRef: `${RAGE}#rage-from-damage-taken`,
  },
  unknownBaseHealth: {
    text: 'Health leaves out base health, which isn’t known for level-60 characters yet.',
    docRef: `${STATS}#oq-2-base-health`,
  },
  unknownBaseDodge: {
    text: 'Dodge leaves out base dodge, which isn’t known yet; base parry and block are taken as 5%.',
    docRef: `${STATS}#oq-5-base-dodge-parry-and-block`,
  },
  unknownBaseAttributes: {
    text: 'Base attributes for this race and class aren’t known yet, so the character sheet counts gear, buffs and talents only.',
    docRef: `${STATS}#oq-1-paladin-druid-and-skyborne-base-attributes`,
  },
  racialWeaponCrit: {
    text: 'Weapon racials (Sword, Axe and Mace Specialization) add crit only to swings made with that weapon type.',
    docRef: `${STATS}#implementation-notes`,
  },
  gnomeRage: {
    text: 'Expansive Mind’s +5% maximum rage multiplies the total, including Boundless Rage.',
    docRef: `${WAR}#9-open-questions`,
  },
  cooldownRacial: {
    text: 'Eureka! isn’t simulated: how its 40% cost cut rounds, and what spends its charges, are open questions.',
    docRef: `${WAR}#9-open-questions`,
  },
  touchOfTheGrave: {
    text: 'Touch of the Grave isn’t simulated: whether it deals damage is unknown.',
    docRef: `${WAR}#9-open-questions`,
  },
  classicItems: {
    text: 'Some of your items have no Forever data yet and use their Classic Era stats.',
    docRef: 'docs/decisions.md#d6-items-with-no-forever-data-use-classic-era-stats-flagged-2026-09-22-confirmed-by-the-guild',
  },
  unmodelledProcs: {
    text: 'Some item effects aren’t simulated yet',
    docRef: `${DT}#52-ppm-vs-flat-chance-classic-era-examples`,
  },
  procRates: {
    text: 'Proc rates (Crusader 1 per minute, Hand of Justice 2%, …) are Classic Era’s; Forever’s are server-side and unmeasured.',
    docRef: `${DT}#52-ppm-vs-flat-chance-classic-era-examples`,
  },
  extraAttackChains: {
    text: 'An extra-attack effect can’t trigger from its own extra attacks, and Windfury has no internal cooldown.',
    docRef: `${DT}#54-extra-attacks-and-chaining`,
  },
  windfuryStone: {
    text: 'Windfury Totem is a party aura in Forever, so a main-hand stone still applies alongside it.',
    docRef: `${BUFFS}#windfury-totem`,
  },
  elementalStone: {
    text: 'Each Elemental Sharpening Stone gives +2% crit to all attacks, so two stack.',
    docRef: `${BUFFS}#36-weapon-enhancements-temporary`,
  },
  magicProcs: {
    text: 'Magic weapon procs roll spell hit against a 24-resistance boss and don’t crit.',
    docRef: `${CT}#9-spell-hit-and-crit-generic`,
  },
  deepWounds: {
    text: 'Deep Wounds follows Classic Era rules: recomputed each tick from current attack power, and it can’t crit.',
    docRef: `${WAR}#25-crits-impale-flurry-deep-wounds`,
  },
  angerManagement: {
    text: 'Anger Management ticks every 3 s from the pull.',
    docRef: `${RAGE}#open-questions`,
  },
  weaponmasterMace: {
    text: 'Weaponmaster’s mace armor penetration applies after the flat armor debuffs.',
    docRef: `${WAR}#27-weaponmaster-extra-attacks-and-windfury`,
  },
  whiteThreat: {
    text: 'Threat uses Classic Era rules (1 threat per damage, 5 per rage from talents, stance multipliers); Forever threat is server-side and unmeasured.',
    docRef: `${THREAT}#per-ability-threat-at-max-rank`,
  },
  defiance: {
    text: 'Defiance multiplies with Defensive Stance (×1.495 at 3/3), as Classic Era’s stance and talent auras do.',
    docRef: `${THREAT}#open-questions`,
  },
  bossMelee: {
    text: 'Boss melee (swing speed, damage and table) is a stand-in: Forever raid bosses haven’t been logged yet.',
    docRef: `${ENC}#5-boss-melee-tank-modeling`,
  },
  bossFlags: {
    text: 'From the front the boss can dodge, parry and block like a Classic Era raid boss; a boss’s block removes nothing.',
    docRef: `${CT}#24-attacking-from-behind-vs-the-front`,
  },
  shieldBlockValue: {
    text: 'Shield block values aren’t in the item data yet, so block value counts Strength only.',
    docRef: `${STATS}#strength`,
  },
  bossSlow: {
    text: 'Attack-speed slows lengthen the boss’s swings as base × (1 + slow).',
    docRef: `${DT}#32-attack-speed-debuffs-on-the-boss-tank-modeling`,
  },
  bossApDebuff: {
    text: 'Attack-power debuffs change boss damage by AP ÷ 14 × swing speed.',
    docRef: `${ENC}#5-boss-melee-tank-modeling`,
  },
  dpsDamageTaken: {
    text: 'Incoming damage for a DPS player arrives as one hit every 2 seconds.',
    docRef: `${ENC}#4-targets-and-position`,
  },
  berserkerRageTaken: {
    text: 'Berserker Rage adds no extra rage from damage taken: the amount is unknown, so it’s taken as none.',
    docRef: `${RAGE}#rage-from-damage-taken`,
  },
  enrageTrigger: {
    text: 'Enrage triggers on any hit that costs health, including blocked hits.',
    docRef: `${WAR}#9-open-questions`,
  },
  onUseConsumables: {
    text: 'Some on-use items and consumables aren’t simulated',
    docRef: `${BUFFS}#on-use-items-and-cooldown-categories`,
  },
  weaknessAnalyzer: {
    text: 'Weakness Analyzer’s +5% crit ends on your next crit, white or special, and it’s ready again after 90 s, as the Forever client says; an older tooltip said 2 minutes.',
    docRef: `${WAR}#9-open-questions`,
  },
  hyjalFlask: {
    text: 'Your flask’s bonus works only in Mount Hyjal, Hyjal Summit and the Barrow Deeps; this fight is elsewhere.',
    docRef: `${BUFFS}#31-flasks`,
  },
  noWeapon: {
    text: 'No main-hand weapon: unarmed attacks aren’t simulated.',
    docRef: `${DT}#2-weapon-damage`,
  },
} satisfies Record<string, { text: string; docRef: string }>

export type AssumptionId = keyof typeof REGISTRY

export class Assumptions {
  private readonly list: Assumption[] = []
  private readonly seen = new Set<string>()

  add(id: AssumptionId, detail?: string): void {
    if (this.seen.has(id)) return
    this.seen.add(id)
    const entry = REGISTRY[id]
    const text = detail ? `${entry.text.replace(/\.$/, '')}: ${detail}.` : entry.text
    this.list.push({ id, text, docRef: entry.docRef })
  }

  toArray(): Assumption[] {
    return [...this.list]
  }
}
