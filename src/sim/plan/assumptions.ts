// The [?] assumptions a result depends on (docs/doctrine.md#4-engine, docs/ux.md#results).
//
// The plan builder adds an assumption only when the setup actually relies on it, so the list
// stays short and specific. Each links to the doc section that owns the value.
import type { Assumption, RuleProfileId } from '../types'
import { LACERATE_THREAT } from '../classes/druid/bear-abilities'

const CT = 'docs/mechanics/combat-tables.md'
const DT = 'docs/mechanics/damage-and-timing.md'
const RAGE = 'docs/mechanics/rage.md'
const THREAT = 'docs/mechanics/threat.md'
const STATS = 'docs/mechanics/character-stats.md'
const BUFFS = 'docs/mechanics/buffs-debuffs-consumables.md'
const ENC = 'docs/mechanics/encounter.md'
const WAR = 'docs/classes/warrior.md'
const DRUID = 'docs/classes/druid.md'
const PAL = 'docs/classes/paladin.md'
const SHAM = 'docs/classes/shaman.md'
const ROGUE = 'docs/classes/rogue.md'
const MAGE = 'docs/classes/mage.md'
const LOCK = 'docs/classes/warlock.md'
const SPELLS = 'docs/mechanics/spells.md'
const PRIEST = 'docs/classes/priest.md'
const HUNTER = 'docs/classes/hunter.md'
const RANGED = 'docs/mechanics/ranged-and-pets.md'

const REGISTRY = {
  whiteSwingsOnly: {
    text: 'Only white swings, talents, procs and buffs are simulated for now: abilities, cooldowns and on-use items arrive with the rotation.',
    docRef: 'docs/milestones.md#m2-warrior-dps-with-the-production-ux-',
  },
  knownFightTimings: {
    text: 'The rotation knows exactly when the execute phase starts and when the fight ends, and times its cooldowns and the Mighty Rage Potion to them, where a player has to judge both.',
    docRef: `${WAR}#52-fury-dual-wield`,
  },
  // The paladin's: its early mana potion or rune line needs another to be ready before the end.
  knownFightEnd: {
    text: 'The rotation knows exactly when the fight ends, and drinks a mana potion or uses a rune early only while another will be ready before then, where a player has to judge it.',
    docRef: `${PAL}#forever-priority-list-default`,
  },
  reactionTime: {
    text: 'The rotation reacts instantly: it acts at the very moment a cooldown ends, rage arrives or a proc or dodge opens a window, with no reaction time or latency.',
    docRef: `${DT}#36-server-tick-and-spell-batching`,
  },
  // The cat's two below say the same as reactionTime and gcdHaste, in its terms (druid.md §2.4, §2.6).
  reactionTimeEnergy: {
    text: 'The rotation reacts instantly: it acts at the very moment a cooldown ends, Energy ticks in or Clearcasting procs, with no reaction time or latency.',
    docRef: `${DT}#36-server-tick-and-spell-batching`,
  },
  // The same for a rotation that spends mana, with no rage or procs that open windows (the paladin's).
  reactionTimeMana: {
    text: 'The rotation reacts instantly: it acts at the very moment a cooldown or the global cooldown ends or you have the mana, with no reaction time or latency.',
    docRef: `${DT}#36-server-tick-and-spell-batching`,
  },
  gcdHaste: {
    text: 'The 1.5 s global cooldown isn’t shortened by haste, as in Classic Era; untested in Forever.',
    docRef: `${DT}#35-global-cooldown`,
  },
  gcdHasteCat: {
    text: 'The global cooldown, 1 s in Cat Form, isn’t shortened by haste, as in Classic Era; untested in Forever.',
    docRef: `${DT}#35-global-cooldown`,
  },
  // The rogue's two: its 1 s global cooldown, and a rotation that waits on Energy with no procs to react to.
  gcdHasteRogue: {
    text: 'The rogue’s 1 s global cooldown isn’t shortened by haste, as in Classic Era; untested in Forever.',
    docRef: `${DT}#35-global-cooldown`,
  },
  reactionTimeRogue: {
    text: 'The rotation reacts instantly: it acts at the very moment a cooldown or the global cooldown ends or Energy ticks in, with no reaction time or latency.',
    docRef: `${DT}#36-server-tick-and-spell-batching`,
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
    text: 'Unbridled Wrath procs only from auto attacks (white swings of either hand and extra attacks), not from Heroic Strike or Cleave swings, as the Forever client’s data says; untested in combat.',
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
    text: 'The boss’s armor is below zero after debuffs, which increases your damage, as the Forever tooltip says; unmeasured in combat.',
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
    text: 'Each landed white hit gives a fixed rage set by weapon speed (3.46 per second one-handed, 4.5 two-handed), from low-level beta logs by other players.',
    docRef: `${RAGE}#forever-normalized-rage-per-swing-`,
  },
  foreverOffHandRage: {
    text: 'Off-hand white hits give half the main-hand rate before Dual Wield Specialization.',
    docRef: `${RAGE}#forever-normalized-rage-per-swing-`,
  },
  damageTakenRage: {
    text: 'A hit that lands on you gives rage of 10 × the hit before armor, block and absorbs, divided by your maximum health. That fits about 2,000 hits in low-level beta logs, but it isn’t tested at level 60, and stances that change the damage you take are assumed not to change it.',
    docRef: `${RAGE}#forever-`,
  },
  damageTakenRageFlat: {
    text: 'Rage from damage taken uses an earlier fit, 1.5 × health lost ÷ 230.6, which the beta logs don’t support.',
    docRef: `${RAGE}#forever-`,
  },
  damageTakenRageHealthLost: {
    text: 'Rage from damage taken is 10 × health lost ÷ your maximum health, an alternative to the logged fit, which uses the damage before armor.',
    docRef: `${RAGE}#forever-`,
  },
  baseStatPlaceholders: {
    text: 'Some base values of a level-60 character aren’t measured yet, so the sim uses Classic-based placeholders until they are.',
    docRef: `${STATS}#other-base-values-at-level-60`,
  },
  unknownBaseAttributes: {
    text: 'Base attributes for this race and class aren’t known yet, so the character sheet counts gear, buffs and talents only.',
    docRef: `${STATS}#oq-1-paladin-druid-and-skyborne-base-attributes`,
  },
  racialWeaponCrit: {
    text: 'Weapon racials (Sword, Axe and Mace Specialization) add their crit to all your attacks and spells while either hand holds that weapon type, as their Forever tooltips say. Weaponmaster’s axe and polearm crit counts only for attacks made with the axe or polearm, as its tooltip says. Neither is tested with two different weapons.',
    docRef: `${STATS}#implementation-notes`,
  },
  gnomeRage: {
    text: 'Expansive Mind’s +5% maximum rage multiplies the total, including Boundless Rage.',
    docRef: `${WAR}#9-open-questions`,
  },
  gnomeEnergy: {
    text: 'Expansive Mind’s +5% maximum Energy multiplies the total, including Vigor, rounded down to whole Energy: 110 with Vigor 1/2, 115 with 2/2.',
    docRef: `${ROGUE}#21-energy`,
  },
  eureka: {
    // src/sim/classes/eureka.ts; the plan names the class's resource and cut ({detail}: "mana cost 10%").
    // "Covered" is the client's spell masks; Arcane Missiles is covered for its cost only, hence "most".
    text: 'For 15 s, Eureka! cuts the next 3 covered abilities’ {detail}, rounded down to a whole point, and most of them deal 10% more damage, damage over time included. Each one uses up a charge when you pay for it, whether it lands or not. Untested.',
    docRef: `${STATS}#racials-that-matter-to-the-sim`,
  },
  touchOfTheGrave: {
    // docs/mechanics/character-stats.md#touch-of-the-grave; the plan gives the chance and the drain ({detail}).
    text: 'Touch of the Grave: each attack or spell you land that deals damage has a {detail}, as Shadow damage. Its tooltip says “up to 5%”, and how much it really drains isn’t known, so the sim uses the most. The drain never misses or crits, takes your Shadow damage bonuses and the boss’s average partial resist, and makes normal damage threat. The health it drains heals you for as much and makes healing threat, half what the same damage would make; the sim can’t tell overhealing, so it counts all of it. Damage over time sets it off as it lands, not on its ticks. Untested.',
    docRef: `${STATS}#touch-of-the-grave`,
  },
  classicItems: {
    text: 'Some of your items have no Forever data yet and use their Classic Era stats.',
    docRef: 'docs/decisions.md#d6-items-with-no-forever-data-use-classic-era-stats-flagged-2026-09-22-confirmed-by-the-guild',
  },
  unmodelledProcs: {
    text: 'Some item effects aren’t simulated yet',
    docRef: `${DT}#52-ppm-vs-flat-chance-classic-era-examples`,
  },
  unmodelledSetBonuses: {
    text: 'Some of your set bonuses aren’t simulated yet',
    docRef: 'docs/data/items.md#effect-and-set-bonus-text',
  },
  procRates: {
    text: 'Procs-per-minute rates (Crusader 1, Fiery Weapon 6, Flurry Axe 1.8, …) are Classic Era’s: Forever sets them on the server, and nobody has measured them.',
    docRef: `${DT}#52-ppm-vs-flat-chance-classic-era-examples`,
  },
  draconicEmblemChance: {
    text: 'Draconic Infused Emblem’s +35 spell damage (+70 against Dragonkin) procs on every harmful spell that lands, so it stays up from the first: the Forever client gives it a 100% chance with no cooldown, though its tooltip says “chance”. At a lower chance it would be worth less. Nobody has measured it.',
    docRef: 'docs/data/items.md#modelled-item-effects',
  },
  ironfoeChance: {
    text: 'Ironfoe procs on 3% of its own hits, at most once per 100 ms. The Forever client gives it a 6% chance and says it procs twice as often against Orcs, so, as for Hand of Justice, we read 6% as the chance against Orcs and 3% against other bosses. We also count only its own hits: if hits from the other hand proc it too, the default Fury warrior does about 2.7% more DPS. Nobody has measured either.',
    docRef: `${DT}#52-ppm-vs-flat-chance-classic-era-examples`,
  },
  extraAttackChains: {
    text: 'Each extra-attack effect (Windfury, Hand of Justice, …) can proc only once from one swing and the extra attacks that follow it, so none procs from its own extra attack.',
    docRef: `${DT}#54-extra-attacks-and-chaining`,
  },
  windfuryIcd: {
    text: 'Windfury can’t proc again within 100 ms of a proc, the internal cooldown the Forever client gives it. Its +246 attack power lasts 1 s and reaches the extra attack, your next auto attack and any ability you use in that second. Both are untested.',
    docRef: `${DT}#54-extra-attacks-and-chaining`,
  },
  windfuryStone: {
    text: 'Windfury Totem is a party aura in Forever, so a main-hand stone or wizard oil still applies alongside it.',
    docRef: `${BUFFS}#windfury-totem`,
  },
  // The same for a rogue's main-hand poison (docs/classes/rogue.md §4).
  windfuryPoison: {
    text: 'Windfury Totem is a party aura in Forever, so a main-hand poison still applies alongside it.',
    docRef: `${BUFFS}#windfury-totem`,
  },
  elementalStone: {
    text: 'Each Elemental Sharpening Stone gives +2% crit to all your melee attacks, whichever weapon it’s on, so two stack; untested in Forever.',
    docRef: `${BUFFS}#36-weapon-enhancements-temporary`,
  },
  magicProcs: {
    text: 'Magic weapon procs roll spell hit against a 24-resistance boss, then crit at your spell crit chance for 150% damage, as in Classic Era.',
    docRef: `${CT}#9-spell-hit-and-crit-generic`,
  },
  // warrior.md §2.5 (the rolling model, D36, Q21) and Q36: the tick spell's "ignore caster damage modifiers" flag.
  // The restart model's cost, measured with only `deepWoundsRolls` off at the default seed (1) over 5,000
  // fights, on the defaults since W4: Fury 842.3 → 727.0 DPS (−13.7%), Arms 821.8 → 710.4 (−13.6%), as warrior.md Q21 gives.
  deepWounds: {
    text: 'Deep Wounds rolls, as the bleed spell the Forever client uses does: each crit adds 60% of the critting weapon’s average hit (less for an off-hand crit) to the bleed, dealt over its next 4 ticks, and none of it is lost. Each crit’s share is set when it lands, raised by Death Wish, Enrage and Two-Handed Weapon Specialization if they’re up, though the client says the ticks ignore them. It can’t crit. Under Classic Era rules each crit restarts it and loses what was left: about 14% less DPS for the default Fury and Arms warriors. Untested in Forever.',
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
    text: 'Threat uses Classic Era rules (1 threat per damage, 5 per rage from talents, stance or form multipliers); Forever threat is server-side and unmeasured.',
    docRef: `${THREAT}#per-ability-threat-at-max-rank`,
  },
  // threat.md#threat-wording-table, warrior.md Q1: the plan gives the bonus ({detail}).
  shieldSlamThreat: {
    text: 'Shield Slam makes its damage plus {detail} in threat. Forever’s tooltip raised its threat from Classic Era’s “high” (254) to “very high” with no number, and raised its damage 1.87 times, so the bonus rises with it. Untested.',
    docRef: `${THREAT}#threat-wording-table`,
  },
  // threat.md#warrior, warrior.md Q1: the plan gives the client's value and the attack power share ({detail}).
  sunderThreat: {
    text: 'Sunder Armor makes {detail} in threat, before your stance’s multiplier. The 206 is the Forever client’s; Blizzard’s notes add threat from attack power without a number, so 5% is a guess that keeps it near Classic Era’s 261: about 281 at the default tank’s 1,500 attack power in a fight. Untested.',
    docRef: `${THREAT}#warrior`,
  },
  // The same in a paladin tank's terms: no rage or stance, its mana and Righteous Fury instead.
  whiteThreatPaladin: {
    text: 'Threat uses Classic Era rules: 1 threat per damage, ×1.6 on Holy damage from Righteous Fury. Each mana you gain makes 0.5 threat, a Classic Era threat library’s value, borrowed because nobody has measured it, in Forever or in Classic Era (about 6% of your threat in the default setup). Forever threat is server-side and unmeasured.',
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
    text: 'The Forever client gives shields no block value of their own, so block value counts Strength and the block value on your gear; whether Forever shields have one is unknown.',
    docRef: 'docs/data/items.md#stats-armor-and-block-value',
  },
  classicShieldBlockValue: {
    text: 'Your shield has no Forever data, so the sim counts its Classic Era block value, as it does its other Classic Era stats.',
    docRef: 'docs/data/items.md#stats-armor-and-block-value',
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
    text: 'Damage you take arrives as one hit every 2 seconds, sized before your armor, stance and other mitigation, none of which the sim applies to it.',
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
  // buffs doc §3.7: EZ-Thro Dark Bomb's throw and its spell table, the [?] rules it rests on; the plan
  // says when this spec throws it and what the throw holds ({detail}: build.ts explosiveThrowDetail).
  explosiveThrow: {
    text: '{detail} It rolls your spell hit and crit, none of your class’s talents reach it, and the boss resists it whole at its average Fire resistance. Untested in Forever.',
    docRef: `${BUFFS}#37-engineering-and-explosives`,
  },
  weaknessAnalyzer: {
    text: 'Weakness Analyzer’s +5% crit ends on your next crit, white or special, and it’s ready again after 90 s, as the Forever client says; an older tooltip said 2 minutes.',
    docRef: `${WAR}#9-open-questions`,
  },
  // The same for the paladin, whose seal procs and Consecration ticks can crit too: a triggered
  // spell ends it only with NOT_A_PROC, as Seal of Command's proc has (paladin.md#conventions-used-below).
  weaknessAnalyzerPaladin: {
    text: 'Weakness Analyzer’s +5% crit and spell crit ends on your next crit: a white hit, Seal of Command’s proc, a judgement, Holy Strike, Exorcism or Hammer of Wrath; not Seal of Righteousness’s or Seal of Fury’s proc or a Consecration tick. It’s ready again after 90 s, as the Forever client says; an older tooltip said 2 minutes.',
    docRef: `${PAL}#conventions-used-below`,
  },
  overpowerWindow: {
    text: 'A dodge opens Overpower for 5 s and each new dodge refreshes it, so windows aren’t banked; an Overpower that misses still closes it.',
    docRef: `${WAR}#28-reactive-abilities-overpower-bloodthrill-revenge`,
  },
  revengeWindow: {
    // warrior.md §2.8, Q12: no tier 1–3 source gives its length; 5 s is Overpower's.
    text: 'A block, dodge or parry of the boss’s swings opens Revenge for 5 s, assumed like Overpower’s window, and using it closes the window; untested. A 4 s window would cost about 0.05% of your TPS.',
    docRef: `${WAR}#28-reactive-abilities-overpower-bloodthrill-revenge`,
  },
  spellTable: {
    // warrior.md §7 "Spell-table abilities" and Q33; the plan names the abilities and the verb ({detail}).
    text: '{detail} the spell table, as the Forever client marks it: one roll for a spell miss (17% against a raid boss before spell hit), and no dodge, parry or block. A miss refunds 80% of the cost, as a melee ability’s does; untested.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  replacedDebuff: {
    // warrior.md §5.4 notes, §7 "Debuffs on the boss", Q35; the plan names both ({detail}).
    text: '{detail} on the boss, since only one applies: yours removes nothing, but still lands and makes its full threat. In Classic Era it may fail to apply over a stronger one, and then make none; untested.',
    docRef: `${WAR}#54-protection-tps`,
  },
  spellTableCrit: {
    // warrior.md §7 "Spell-table abilities" and Q33: the ones that deal damage ({detail}; Demoralizing Shout deals none).
    text: '{detail} at your special-attack crit chance, not your spell crit, as a melee ability does; untested.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  bloodthrill: {
    text: 'Bloodthrill procs from your landed main-hand attacks, white swings and abilities alike (Heroic Strike and Cleave too, never the off hand), while your own Rend is on the target, and opens the same 5 s Overpower window as a dodge, as the Forever client triggers it; its tooltip still says 6 s.',
    docRef: `${WAR}#28-reactive-abilities-overpower-bloodthrill-revenge`,
  },
  slamCast: {
    text: 'Slam spends its rage and starts its cooldown when its cast ends (failing if rage fell short during it), Heroic Strike and other off-GCD actions work during the cast, and haste doesn’t shorten it; untested in Forever.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  spearingStrike: {
    text: 'Spearing Strike deals 40% of normalized weapon damage, attack power included, and 120% against Giants and Dragonkin, as its tooltip reads; untested.',
    docRef: `${WAR}#31-damage-abilities`,
  },
  rendTickCrits: {
    text: 'Each Rend tick adds 2% of your attack power as it lands, a coefficient another Forever sim measured at a low level that nobody has confirmed at 60. The ticks can crit, at your special-attack crit chance when Rend landed, with the same bonus as your abilities’ crits (×2.2 with Impale 2/2); untested in Forever.',
    docRef: `${WAR}#25-crits-impale-flurry-deep-wounds`,
  },
  executeRageTenths: {
    text: 'Execute turns all the rage left after its cost into damage, tenths of a rage point included (15 damage per rage); the server may count whole points only.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  improvedBloodrageRounding: {
    text: 'Improved Bloodrage 1/2 gives 12.5 rage at once and 1.2 per tick (1.25 rounded down to a tenth), 24.5 in all; how the server rounds is untested.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  rendOnHit: {
    text: 'A Rend that lands triggers on-hit effects such as Windfury and Crusader, though it deals no damage itself; untested.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  hyjalFlask: {
    text: 'Your flask’s bonus works only in Mount Hyjal, Hyjal Summit and the Barrow Deeps; this fight is elsewhere.',
    docRef: `${BUFFS}#31-flasks`,
  },
  // Each form's lines give only its own figures: the cat's, and the bear's (formWeapon, omenOfClarity).
  formWeaponCat: {
    text: 'In Cat Form you attack with the form’s own weapon: 43.84–65.76 damage every 1.0 s (54.8 damage per second), a figure from another sim, not the game. Your weapon’s damage and weapon skill don’t count, its other stats do, and procs per minute use the form’s 1.0 s swing.',
    docRef: `${DRUID}#21-form-attacks-swing-timer-and-damage`,
  },
  formWeapon: {
    text: 'In Dire Bear Form you attack with the form’s own weapon: 109.6–164.4 damage every 2.5 s (54.8 damage per second), a figure from another sim, not the game. Your weapon’s damage and weapon skill don’t count, its other stats do, and procs per minute use the form’s 2.5 s swing.',
    docRef: `${DRUID}#21-form-attacks-swing-timer-and-damage`,
  },
  omenOfClarityCat: {
    text: 'Omen of Clarity procs Clearcasting 2 times a minute (3.33% of landed hits in Cat Form), at most once every 10 s. The 10 s is client data; the rate comes from another sim.',
    docRef: `${DRUID}#27-omen-of-clarity-and-clearcasting`,
  },
  omenOfClarity: {
    text: 'Omen of Clarity procs Clearcasting 2 times a minute (8.33% of landed hits in Dire Bear Form), at most once every 10 s. The 10 s is client data; the rate comes from another sim.',
    docRef: `${DRUID}#27-omen-of-clarity-and-clearcasting`,
  },
  noPowershift: {
    text: 'The cat never powershifts. Forever’s Furor gives back the Energy you left Cat Form with, where Classic Era’s set it to 40, so a shift gains nothing and costs a GCD and mana: an inference from the tooltips, untested.',
    docRef: `${DRUID}#28-shapeshifting-furor-wolfshead-helm-powershifting-mana`,
  },
  energyTicks: {
    text: 'Energy comes 20 every 2 s, as in Classic Era. The rest is untested: a cap of 100, a full bar at the pull, the first tick at a random moment in the first 2 s, and 80% of a builder’s Energy back when it misses or is dodged or parried (a finisher gets none back).',
    docRef: `${DRUID}#24-energy-cat`,
  },
  shapeshifts: {
    text: 'A shapeshift keeps the swing and Energy timers running, Furor keeps your Energy (Forever’s tooltip), and the health that rage from damage taken divides by stays your starting form’s.',
    docRef: `${DRUID}#28-shapeshifting-furor-wolfshead-helm-powershifting-mana`,
  },
  bearWhiteRage: {
    text: 'Each landed bear swing gives 8.65 rage (3.46 per second of its 2.5 s swing, the one-handed rate); bear rage in Forever is unmeasured.',
    docRef: `${RAGE}#bear-druid-rage`,
  },
  bearArmor: {
    text: 'Dire Bear Form multiplies bonus armor (enchants, buffs, a Greater Stoneshield Potion, Forever’s green armor) by 4.6 as well as item armor, as a second armor aura in the Forever client suggests; unmeasured.',
    docRef: `${DRUID}#47-bear-armor-low-priority-tps-doesnt-need-it`,
  },
  // docs/mechanics/buffs-debuffs-consumables.md §1.2 (BR5): Thorns on the tank, as Retribution Aura's damage shield.
  thorns: {
    text: 'Thorns deals 22 Nature damage plus 0.08 × its caster’s spell damage (Holy Shield’s coefficient; Forever’s is on the server): 38 in all, its caster’s spell damage taken as a raid healer’s 200, a third of +600 healing on its gear, as Forever’s items give. It hits on every boss swing that lands on you, a blocked one too, always lands, never crits, and makes threat at your threat multipliers. Untested.',
    docRef: 'docs/mechanics/buffs-debuffs-consumables.md#12-threat-defense-and-mana',
  },
  thornsOwn: {
    text: 'Your own Thorns deals its base 22 Nature damage: the 0.08 × its caster’s spell damage it adds is taken as none, since a bear’s gear carries almost none. It hits on every boss swing that lands on you, a blocked one too, always lands, never crits, and makes threat at your threat multipliers. Untested.',
    docRef: 'docs/mechanics/buffs-debuffs-consumables.md#12-threat-defense-and-mana',
  },
  // buffs doc §1.1 (D36): no Ahn'Qiraj book's rank (src/sim/aq-ranks.test.ts), and the Greater Blessings'
  // rank 2 taken to need Ahn'Qiraj too [?] (OQ 22). The plan words it for the setup (`preAqRanksText`).
  preAqRanks: {
    text: 'Abilities and buffs use the ranks trainable before Ahn’Qiraj, not the higher ones its books teach.',
    docRef: `${BUFFS}#11-attack-power-stats-and-crit`,
  },
  // buffs doc §4.2 (W5): Gift of Arthas on the boss; where its flat +8 adds (damage-and-timing §2.4, B70).
  giftOfArthas: {
    text: 'Gift of Arthas is on the boss all fight, and each direct physical hit on it deals +8: added after the damage bonuses and before the boss’s armor, so the hit’s crit multiplier applies to it too (×2 on a white crit). Bleed ticks get none. Untested.',
    docRef: `${DT}#24-damage-modifier-stacking`,
  },
  // buffs doc §1.1 "Power Infusion": one cast at the pull (the user's rule); with Arcane Power, one
  // cast as it ends, since they don't stack (`powerInfusionText`): [?] placeholder (D24), patch 1.12's rule (OQ 23).
  powerInfusion: {
    text: 'A priest casts Power Infusion on you once, at the pull: +20% spell damage from 0 to 15 s. It isn’t cast again, though its 3-minute cooldown would allow a second in a fight over 3 minutes.',
    docRef: `${BUFFS}#power-infusion`,
  },
  // docs/classes/druid.md §4.7 (BR6, Q19): Thick Hide's base armor, a reading of "further increased by multipliers from those forms".
  thickHide: {
    text: 'Thick Hide’s base armor (3 per level and 2 per defense point above 300 at 3/3) is multiplied by Dire Bear Form’s +360%, as armor from items is, a reading of its tooltip’s “further increased by multipliers from those forms”; unmeasured.',
    docRef: `${DRUID}#47-bear-armor-low-priority-tps-doesnt-need-it`,
  },
  // docs/classes/druid.md §4.1 (BR2, Q37): Idol of Brutality's class mask covers Primal Bite, which its tooltip doesn't name.
  idolOfBrutality: {
    text: 'Idol of Brutality takes 2 rage off Primal Bite as well as Maul and Swipe: its spell’s class mask covers Primal Bite, though the tooltip names only Maul and Swipe; untested.',
    docRef: `${DRUID}#41-maul-r7-9881`,
  },
  sealOfCommandRate: {
    text: 'Seal of Command procs 7 times a minute from your weapon’s base speed, with a 1 s internal cooldown: Classic Era’s rate. Forever sets it on the server, and it’s unmeasured.',
    docRef: `${PAL}#open-questions`,
  },
  sealOfCommandScaling: {
    text: 'Seal of Command’s proc adds its 0.29 spell damage coefficient inside its 70% of weapon damage (0.203 × spell damage), and like a special attack it can miss or be dodged, parried or blocked; untested.',
    docRef: `${PAL}#seal-of-command-soc`,
  },
  judgementOfCommand: {
    text: 'Judgement of Command deals half its damage, since a boss can’t be stunned, but gets its full spell damage bonus (untested). It can miss like a melee attack, as beta combat logs show, but can’t be dodged, parried or blocked.',
    docRef: `${PAL}#seal-of-command-soc`,
  },
  sealOfRighteousness: {
    text: 'Seal of Righteousness deals 1.2 × 18.8 × your weapon’s speed with a two-hander (0.85 × with a one-hander) plus 0.1 × spell damage on each landed auto attack. Beta combat logs below level 40 show the weapon part, and 0.2 × spell damage, which the game’s data at those ranks gives as 0.1 from the seal and 0.1 from each hit; at rank 8 the seal’s 0.1 is gone from its data. Untested at level 60.',
    docRef: `${PAL}#seal-of-righteousness-sor`,
  },
  sealOfFury: {
    text: 'Seal of Fury deals 35 Holy plus 0.1 × spell damage on each landed auto attack, whatever the weapon: unlike Seal of Righteousness, it gets no bonus from a slower weapon. Its tooltip reads so, and beta combat logs below level 40 show it; untested at level 60.',
    docRef: `${PAL}#seal-of-fury-sof-new-the-protection-seal`,
  },
  meleeSpellProcs: {
    text: 'Seal procs and judgements are melee attacks that crit for double at your melee crit. Seal of Command’s proc and the judgements trigger Windfury, Hand of Justice, Crusader, Vengeance and Vindication; Seal of Righteousness’s and Seal of Fury’s procs trigger none of them but Vengeance, whose aura the client data lets procs trigger; their crits give it stacks. Untested in game.',
    docRef: `${PAL}#open-questions`,
  },
  jotcBonus: {
    text: 'Each Holy hit gets its spell damage coefficient’s share of Judgement of the Crusader’s +161, as beta combat logs below level 40 and a level-20 in-game test show; untested at level 60. That share is added after your own damage bonuses and before a crit doubles it, which is untested too.',
    docRef: `${PAL}#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc`,
  },
  // paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc: Seal of Command's share, by Holy Strike's (DU-9).
  jotcSealOfCommand: {
    text: 'Seal of Command’s proc gets its whole 0.29 share of Judgement of the Crusader’s bonus (+46.7), outside its 70% of weapon damage, as Holy Strike’s whole 0.429 is outside its half in beta combat logs; no log shows Seal of Command under the judgement.',
    docRef: `${PAL}#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc`,
  },
  // The Buffs tab's Judgement of the Crusader, another paladin's, with your own off (buffs doc §4.2).
  jotcRaid: {
    text: 'Another paladin keeps Judgement of the Crusader on the boss all fight (+161 Holy damage taken), as set in Buffs with your own off; each of your Holy hits gets its share, as above.',
    docRef: `${BUFFS}#42-other-debuffs`,
  },
  holyStrike: {
    text: 'Holy Strike deals half of (a normalized main-hand swing + 81 to 105 + 0.429 × your spell damage), so 0.21 × spell damage, as beta combat logs below level 40 show; its tooltip reads as if the 81 to 105 and the spell damage came on top of the half. Its script effect adds no threat. Untested at level 60.',
    docRef: `${PAL}#other-abilities`,
  },
  consecrationTicks: {
    text: 'Each Consecration tick rolls its own spell hit and crit (×1.5); untested in Forever.',
    docRef: `${PAL}#other-abilities`,
  },
  hammerOfWrath: {
    text: 'Hammer of Wrath rolls the ranged table: a miss, then a crit at your melee crit chance for double damage; untested.',
    docRef: `${PAL}#other-abilities`,
  },
  manaRegen: {
    text: 'Mana regenerates every 2 s, from a random moment in the first 2 s of the fight: 15 + Spirit / 5 when you’ve spent none for 5 s, and your mp5 always. A seal cast before the pull costs nothing.',
    docRef: `${PAL}#mana-model`,
  },
  sanctifiedJudgement: {
    text: 'Sanctified Judgement returns its share of the judged seal’s base cost, not the cost after talents, and only when the judgement lands; each mana it returns makes 0.5 threat. Untested.',
    docRef: `${PAL}#judgement`,
  },
  vindication: {
    text: 'Vindication procs from every landed melee attack, as its data reads, so its attack power bonus is up almost all fight; untested.',
    docRef: `${PAL}#retribution-tree`,
  },
  catShredFlat: {
    text: 'Shred’s and Claw’s flat bonus is added before the weapon percentage, as in Classic Era: Shred deals 155% of (weapon damage + 80). Forever’s tooltip doesn’t settle it; untested.',
    docRef: `${DRUID}#31-shred-r5-9830`,
  },
  catFinisherAp: {
    text: 'Rip gains 1% of your attack power per combo point per tick (4 points at most) and Ferocious Bite 3% per combo point, as another sim has it; the Forever client doesn’t carry the scaling.',
    docRef: `${DRUID}#34-rip-r6-9896`,
  },
  catBleeds: {
    text: 'Rip and Rake’s bleed keep your attack power, damage bonuses (Tiger’s Fury) and crit chance from when they land, and in Forever their ticks can crit, as the client’s flag says; a Rip that lands can also proc Omen of Clarity. Untested.',
    docRef: `${DRUID}#29-snapshotting`,
  },
  catTwoRolls: {
    text: 'Rake’s hit and Ferocious Bite roll to hit and then to crit, since they deal no weapon damage; Shred and Claw roll once. Untested for druids.',
    docRef: `${DRUID}#3-feral-cat-sim-model`,
  },
  predatoryInstincts: {
    text: 'Predatory Instincts makes your abilities crit for 2.2× (the +100% bonus becomes +120%), Rip’s ticks included; 2.4× is the other reading. Untested.',
    docRef: `${DRUID}#51-feral-combat`,
  },
  rendAndTear: {
    text: 'Rend and Tear adds 10% to your abilities’ direct damage, not auto attacks or bleed ticks, while the boss bleeds from your Rip or Rake, or all fight in a raid with warriors, whose Deep Wounds count. Untested.',
    docRef: `${DRUID}#51-feral-combat`,
  },
  berserkCrits: {
    text: 'Berserk’s crits give Blood Frenzy’s extra combo point like any crit, and Rake’s bleed keeps its crit chance. Untested.',
    docRef: `${DRUID}#37-berserk-417141-cat-use`,
  },
  formHaste: {
    text: 'Attack speed bonuses (the Manual Crowd Pummeler, Juju Flurry) speed up your form’s swings, as other sims have it; untested in Forever.',
    docRef: `${DRUID}#21-form-attacks-swing-timer-and-damage`,
  },
  // Protection (paladin.md "Protection: model and rotation", #protection-tree, OQ 8, 9, 16, 22).
  holyShieldDamage: {
    text: 'Holy Shield’s damage on each block always lands and never crits, though the client marks the spell as magic, which could miss and crit as spells do; and its 20% more threat multiplies Righteous Fury’s (×1.92, not ×1.8). Untested.',
    docRef: `${PAL}#other-abilities`,
  },
  retributionAura: {
    text: 'Retribution Aura deals 30 Holy damage plus 0.08 × your spell damage (Holy Shield’s coefficient; Forever’s is on the server) on every boss swing that lands on you, a blocked one too; it always lands and never crits. Untested.',
    docRef: `${PAL}#other-abilities`,
  },
  reckoning: {
    text: 'Reckoning gives you an extra attack after 40% of your blocks and every crit you take at 5/5, as its tooltip reads, and it swings at once. Whether Forever lets you save them up for later, and how many, is untested.',
    docRef: `${PAL}#protection-tree`,
  },
  redoubt: {
    text: 'Redoubt has a 10% chance at every rank, as its tooltips read, from every boss swing that lands on you; one reading of the client data gives 2% a rank. Untested.',
    docRef: `${PAL}#protection-tree`,
  },
  hammerOfWrathCast: {
    text: 'Hammer of Wrath’s 1 s cast stops your auto attacks, which start again from a full swing when it ends, and holds Judgement until then; it pays its mana when the cast ends. Untested in Forever.',
    docRef: `${PAL}#other-abilities`,
  },
  hammerOfTheRighteous: {
    text: 'Hammer of the Righteous deals 3 × your main hand’s weapon DPS with your attack power counted in, as the character sheet shows it (as set under Character → Advanced; its tooltip reads as the weapon’s own), with no spell damage bonus; like a special attack it can miss or be dodged, parried or blocked, and crits for double. Untested.',
    docRef: `${PAL}#other-abilities`,
  },
  hammerOfTheRighteousWeaponOnly: {
    text: 'Hammer of the Righteous deals 3 × your main hand’s own weapon DPS, as its tooltip reads, without your attack power (Character → Advanced can count it), with no spell damage bonus; like a special attack it can miss or be dodged, parried or blocked, and crits for double. Untested.',
    docRef: `${PAL}#other-abilities`,
  },
  improvedSealOfFury: {
    text: 'Seal of Fury’s absorb, Light’s Fury, is one shield of half its last proc’s damage, for 10 s: each proc replaces it, and hits you take spend it before they cost health, as beta combat logs below level 40 show. The hit that uses it up restores Improved Seal of Fury’s mana, as the logs show too; the 87 against a level-63 boss is its tooltip’s, untested at level 60.',
    docRef: `${PAL}#seal-of-fury-sof-new-the-protection-seal`,
  },
  // docs/classes/druid.md §4, §8 "Uncertainty surfacing": the bear's abilities.
  bearThreat: {
    text: 'Maul and Swipe make 1.75 threat per damage, Faerie Fire 108 and Demoralizing Roar 39, as a Classic Era threat library has them. Primal Bite makes 1 threat per damage, since its threat is unknown. Lacerate makes 1 per damage and 206 plus 5% of your attack power more each time it lands: its tooltip’s “high amount of threat”, valued as the warrior’s Sunder Armor, which has the same words at the same level (206 is Forever’s client value; the attack power share is the sim’s guess at the one Blizzard’s notes add). None is measured in Forever.',
    docRef: `${THREAT}#druid-bear`,
  },
  lacerate: {
    text: 'Lacerate stacks to 5 on the boss. Each one hits for 10% of your Dire Bear Form attack’s damage per stack already there (nothing for the first), and restarts its bleed for every stack, losing the tick under way, as a warrior’s Rend does. Its ticks keep your crit chance and damage bonuses from the last one and can crit in Forever. The hit and the restart are readings of its tooltip; untested.',
    docRef: `${DRUID}#43-lacerate-r3-1235827`,
  },
  bearTwoRolls: {
    text: 'Swipe rolls to hit and then to crit, like Bloodthirst, since it deals no weapon damage; Maul, Primal Bite and Lacerate roll once. Untested for druids.',
    docRef: `${DRUID}#44-swipe-r5-9908`,
  },
  bearRage: {
    text: 'A Maul swing gives no rage: the white swing it replaces would give 8.65 rage. A bear attack that misses or is dodged or parried refunds 80% of its rage (Swipe nothing, like a warrior’s area attacks), as in Classic Era; untested for bears in Forever.',
    docRef: `${RAGE}#bear-druid-rage`,
  },
  demoralizingRoar: {
    text: 'Demoralizing Roar lowers the boss’s attack power by 204, its level-60 tooltip; whether combat applies all of it is untested. Demoralizing Roar and Faerie Fire roll to hit as spells do; the boss resists 6% of the Faerie Fires that would land, a Nature spell against its 24 resistance; a roar that misses refunds 80% of its rage, as a missed melee ability does; untested.',
    docRef: `${DRUID}#45-other-bear-abilities`,
  },
  berserkMangle: {
    text: 'Under Berserk a Primal Bite starts no cooldown, and one already running when Berserk starts keeps running; untested. The sim has one target, so Primal Bite’s and Swipe’s extra targets add nothing.',
    docRef: `${DRUID}#46-berserk-bear-use`,
  },
  enrageArmor: {
    text: 'Enrage lowers the armor from your items by 16% of it for 10 s (Dire Bear Form’s +360% becomes +344%), a reading of its tooltip; the client leaves the effect to the server.',
    docRef: `${DRUID}#45-other-bear-abilities`,
  },
  noWeapon: {
    text: 'No main-hand weapon: unarmed attacks aren’t simulated, and neither is any ability that needs one; only cooldowns and buffs are used.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  // The same, when some attacks need no weapon and are still used (`weaponlessAttacks` names them).
  noWeaponSomeUsed: {
    text: 'No main-hand weapon: unarmed attacks aren’t simulated, and neither is any ability that needs one.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  // The paladin's spells don't need a weapon, so they're still cast.
  noWeaponSpells: {
    text: 'No main-hand weapon: unarmed attacks aren’t simulated, so neither is anything that needs them, such as your seal’s procs and Holy Strike; your other spells are.',
    docRef: `${PAL}#conventions-used-below`,
  },
  weaponlessAttacks: {
    // warrior.md §7; the plan names the abilities, and which roll the special-attack table ({detail}).
    text: 'Still used, since {detail}.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  // --- The shaman's (docs/classes/shaman.md#open-questions). ---
  reactionTimeShaman: {
    text: 'The rotation reacts instantly: it acts at the very moment a cooldown or the global cooldown ends, a Maelstrom Weapon stack arrives or you have the mana, with no reaction time or latency.',
    docRef: `${DT}#36-server-tick-and-spell-batching`,
  },
  noWeaponShaman: {
    text: 'No main-hand weapon: unarmed attacks aren’t simulated, so neither is anything that needs them, such as Stormstrike, your weapon imbue and Maelstrom Weapon; your shocks are.',
    docRef: `${SHAM}#weapon-imbues`,
  },
  windfuryWeaponTotem: {
    text: 'Windfury Totem is left out: Windfury Weapon on your main hand disables its benefit for you, as the Forever tooltip says.',
    docRef: `${SHAM}#totems`,
  },
  manaRegenShaman: {
    text: 'Mana regenerates every 2 s, from a random moment in the first 2 s of the fight: 15 + Spirit / 5 when you’ve spent none for 5 s, half of it for 15 s after a Stormstrike with Improved Stormstrike, and your mp5 always. Your weapon imbue is on before the pull.',
    docRef: `${SHAM}#mana`,
  },
  windfuryWeapon: {
    text: 'Windfury Weapon’s 2 extra attacks both get its attack power, and its proc waits 1.5 s between procs, as the client says; its extra attacks can’t proc it again.',
    docRef: `${SHAM}#weapon-imbues`,
  },
  maelstromWeapon: {
    text: 'Maelstrom Weapon stacks on 50% of your landed melee hits, white, special and extra attacks: the rate is server-side and untested, read from a value the talent carries.',
    docRef: `${SHAM}#maelstrom-weapon`,
  },
  shamanFlurry: {
    text: 'Flurry loses at most one charge every 0.5 s, as the client says, so Windfury Weapon’s extra attacks use one between them; a crit refreshes it to 3.',
    docRef: `${SHAM}#flurry`,
  },
  stormstrikeBoost: {
    text: 'Stormstrike’s +20% goes to your next Lightning Bolt or Earth Shock that lands, which uses it up; a miss keeps it.',
    docRef: `${SHAM}#stormstrike`,
  },
  lightningBoltCast: {
    text: 'A Lightning Bolt with a cast time stops your swings, which start again from full when it completes, as Slam does.',
    docRef: `${SHAM}#shocks-and-lightning-bolt`,
  },
  shamanSpellDamage: {
    text: 'Your spells use your all-schools spell damage, Mental Quickness’s share of Intellect and their own school’s spell damage on gear. They roll the spell table with an average partial resist.',
    docRef: `${SHAM}#spell-damage`,
  },
  shamanTotems: {
    text: 'Your own totems (Strength of Earth, Grace of Air, Mana Spring; see Buffs) are up all fight, dropped before the pull.',
    docRef: `${SHAM}#totems`,
  },
  // The Elemental shaman's (docs/classes/shaman.md#elemental-open-questions).
  elementalSpells: {
    text: 'You cast from range and never swing your weapon. Your spells miss 17% of the time against a raid boss before spell hit and lose 6% to partial resists on average; Flame Shock’s ticks crit at your spell crit, as the Forever client flags them; casting speed doesn’t shorten the 1.5 s global cooldown. All untested in Forever.',
    docRef: `${SHAM}#elemental-open-questions`,
  },
  manaRegenElemental: {
    text: 'Mana regenerates every 2 s, from a random moment in the first 2 s of the fight: 15 + Spirit / 5 when you’ve spent none for 5 s, Mindfulness’s share of it inside those 5 s, and your mp5 always.',
    docRef: `${SHAM}#elemental-mana`,
  },
  elementalTotems: {
    text: 'Your own Mana Spring Totem (see Buffs) is up all fight, dropped before the pull.',
    docRef: `${SHAM}#totems`,
  },
  elementalFocus: {
    text: 'Clearcasting comes from 10% of your Fire, Frost and Nature spells that land (the tooltip says after casting), and the next spell you cast uses it, whatever it costs.',
    docRef: `${SHAM}#elemental-talents`,
  },
  lightningOverload: {
    text: 'Lightning Overload’s second spell comes from a Lightning Bolt or Chain Lightning that lands, deals half damage with the same talents, rolls its own hit and crit, and triggers nothing; untested.',
    docRef: `${SHAM}#elemental-talents`,
  },
  manaTideTotem: {
    text: 'Mana Tide Totem restores its 290 mana 4 times, every 3 s from 3 s after you drop it; untested.',
    docRef: `${SHAM}#elemental-mana`,
  },
  lightningBoltDownrank: {
    text: 'Rank 4 Lightning Bolt keeps rank 10’s 0.714 spell damage coefficient, as the client gives it, with no penalty for a lower rank; untested in Forever.',
    docRef: `${SHAM}#elemental-priority`,
  },
  totemOfTheStorm: {
    text: 'Totem of the Storm’s “up to 33” is read as 33 spell damage for Lightning Bolt and Chain Lightning, so it adds 33 × their coefficient; the effect is a server-side script.',
    docRef: `${SHAM}#elemental-defaults`,
  },
  bloodFurySpellPower: {
    text: 'Blood Fury’s +10% spell power multiplies your spell damage of every school while it’s up, buffs and trinkets included, unrounded.',
    docRef: `${LOCK}#72-race`,
  },
  // --- The rogue's (docs/classes/rogue.md §9) ---
  energyTicksRogue: {
    text: 'Energy comes 20 every 2 s, as in Classic Era, and Adrenaline Rush doubles each tick. The rest is untested: a cap of 100 (more with Vigor), a full bar at the pull, the first tick at a random moment in the first 2 s, and 80% of a builder’s Energy back when it misses or is dodged or parried (a finisher gets none back and keeps its combo points).',
    docRef: `${ROGUE}#21-energy`,
  },
  rogueFinisherTalents: {
    text: 'A guild test measured the attack-power part of Eviscerate (4% of your attack power per combo point) and of Rupture (1% per combo point a tick, up to 3%) without saying which talents the tester had. The sim raises those parts by your Improved Eviscerate, Aggression and Serrated Blades, as it raises the rest of the damage: if the test’s numbers already included these talents, they’re counted twice. Untested.',
    docRef: `${ROGUE}#10-open-questions`,
  },
  rogueTwoRolls: {
    text: 'Eviscerate and Expose Armor roll to hit and then to crit, since they deal no weapon damage; Sinister Strike and Backstab roll once. Untested for rogues.',
    docRef: `${ROGUE}#3-abilities`,
  },
  rogueFlatInside: {
    text: 'Backstab’s flat 150 is inside its 150% of weapon damage, so it adds 225, as Classic Era’s tooltip reads; Forever’s tooltip says 150. Untested.',
    docRef: `${ROGUE}#32-backstab-r8-11281`,
  },
  lethality: {
    text: 'Lethality makes Sinister Strike, Backstab, Hemorrhage, Ghostly Strike and Mutilate crit for 2.2× at 5/5 (the +100% bonus becomes +120%), as the warrior’s Impale; untested.',
    docRef: `${ROGUE}#51-assassination`,
  },
  poisons: {
    text: 'Poisons roll spell hit (your hit, Precision’s too, lowers their misses), are partly resisted by the boss’s 24 resistance, and crit at your spell crit for 150%, since Malice’s Forever tooltip names poisons. Untested.',
    docRef: `${ROGUE}#4-poisons`,
  },
  poisonAp: {
    text: 'Instant Poison adds 0.5% of your attack power a hit, as a guild test measured, and Deadly Poison 0.1125% a stack each tick, measured on Deadly Poison V; rank IV is taken to be the same. Deadly Poison reads your attack power at each tick, not when the stack lands, and Vile Poisons and Venom raise the attack-power part as they raise the rest of a poison’s damage. Untested.',
    docRef: `${ROGUE}#4-poisons`,
  },
  deadlyPoisonTicks: {
    text: 'Deadly Poison’s stacks tick on their own timer, which a new stack doesn’t restart, and its ticks can crit in Forever, as the client’s flag says. Untested.',
    docRef: `${ROGUE}#42-deadly-poison-iv`,
  },
  hackAndSlash: {
    text: 'Hack and Slash’s extra attack is a main-hand swing whichever sword procs it, at most one each 0.2 s, as the warrior’s sword Weaponmaster; its dagger and fist crit counts only for that weapon’s attacks. Untested.',
    docRef: `${ROGUE}#52-combat`,
  },
  rogueArmorPen: {
    text: 'Serrated Blades’ and a mace’s Hack and Slash armor penetration apply after the flat armor debuffs.',
    docRef: `${ROGUE}#53-subtlety`,
  },
  sliceAndDiceHaste: {
    text: 'Slice and Dice’s and Blade Flurry’s attack speed multiply with each other and with other haste, as in Classic Era; untested in Forever.',
    docRef: `${ROGUE}#33-slice-and-dice-r2-6774`,
  },
  coldBlood: {
    text: 'Cold Blood is used up by the next Sinister Strike, Backstab, Ambush, Eviscerate or Mutilate that lands; one that misses keeps it. Untested.',
    docRef: `${ROGUE}#38-cold-blood-14177`,
  },
  mutilate: {
    text: 'Mutilate’s off-hand strike deals off-hand damage at the off-hand multiplier, each strike rolls its own hit and crit, and only the main hand’s crit gives Seal Fate’s extra point. Untested.',
    docRef: `${ROGUE}#311-mutilate-r4-1241584`,
  },
  venom: {
    text: 'Venom does nothing beyond its three effects on your poisons: the client’s fourth, a dummy on the target, is taken to add nothing. Its +30% multiplies with Vile Poisons’ +20%, ×1.56 in all. Untested.',
    docRef: `${ROGUE}#43-poison-talents`,
  },
  // Subtlety's (docs/classes/rogue.md §3.9, §5.3, §10).
  hemorrhage: {
    text: 'Hemorrhage’s +15% counts on each Rupture tick while its debuff is on the boss, not only on a Rupture applied under it, and its 145% needs the dagger in the main hand. Untested.',
    docRef: `${ROGUE}#39-hemorrhage-16511-and-ghostly-strike-14278`,
  },
  quietus: {
    text: 'Quietus’s bonus starts when the boss reaches 35% health, with its health falling evenly over the fight as the execute phase’s does, and multiplies with your other damage bonuses. Untested.',
    docRef: `${ROGUE}#53-subtlety`,
  },
  thousandCuts: {
    text: 'Thousand Cuts gains a stack from every Rupture tick, and the next Backstab or Hemorrhage uses them all up when it’s used, even if it misses. Untested.',
    docRef: `${ROGUE}#53-subtlety`,
  },
  cutthroat: {
    text: 'Cutthroat’s chance rolls on each Backstab that lands, crits and blocks included, and Ambush is used only in its window: the sim has no Stealth opener. Untested.',
    docRef: `${ROGUE}#53-subtlety`,
  },
  // The mage's (docs/classes/mage.md#open-questions).
  reactionTimeMage: {
    text: 'The rotation reacts instantly: it acts the moment a cast lands, a cooldown or the global cooldown ends or you have the mana, with no reaction time or latency.',
    docRef: `${DT}#36-server-tick-and-spell-batching`,
  },
  mageSpells: {
    text: 'Your spells roll the spell table against a level-63 boss with a level-based resistance of 24 (an average partial resist of 6%; Frostbolt, whose slow makes it binary, is resisted whole instead). Projectiles land the moment the cast does. The Forever spell values are the client’s rows, not yet checked in game.',
    docRef: `${MAGE}#open-questions`,
  },
  mageIgnite: {
    text: 'Ignite pools: each Fire crit adds 40% of its damage to what’s still to come and gives it 2 more ticks, 2 s apart; a tick already due keeps its time. The boss’s Fire Vulnerability and Curse of the Elements are in the crit’s damage and don’t apply again at each tick (Forever’s Ignite no longer double dips); the average partial resist does, as it did in Classic. Forever’s pooling rules are server-side and untested.',
    docRef: `${MAGE}#ignite`,
  },
  mageImprovedScorch: {
    text: 'Improved Scorch’s stacks land with Scorch’s hit, with no separate roll to resist the debuff.',
    docRef: `${MAGE}#improved-scorch`,
  },
  mageHotStreak: {
    text: 'Hot Streak stacks on non-periodic crits of Fireball, Fire Blast and Scorch, and Pyroblast uses them all; the client’s charge rule is server-side.',
    docRef: `${MAGE}#hot-streak`,
  },
  mageFireWait: {
    text: 'Fireball waits up to 0.3 s for a Fire Blast coming off cooldown, and Pyroblast up to 0.3 s so it lands with its own DoT’s next tick instead of cutting it off: what a perfect player would do, a reasoned estimate.',
    docRef: `${MAGE}#fire-priority`,
  },
  mageCombustion: {
    text: 'Combustion gives the first Fire spell after it +10% crit, then +10% more for each Fire spell that hits; it ends after 4 Fire crits, and its cooldown starts then.',
    docRef: `${MAGE}#combustion`,
  },
  mageWintersChill: {
    text: 'Winter’s Chill stacks on landed Frost spells and gives your Frostbolt +2% crit a stack, as the Forever tooltip says.',
    docRef: `${MAGE}#winters-chill`,
  },
  mageClearcasting: {
    text: 'Clearcasting can come from any damage spell that hits, each Arcane Missile included, at most once a second, and makes the next damage spell free.',
    docRef: `${MAGE}#talents`,
  },
  mageArcaneMissiles: {
    text: 'Arcane Missiles fires 5 missiles a second apart, each with its own hit, crit and resist; casting speed doesn’t shorten it.',
    docRef: `${MAGE}#arcane-priority`,
  },
  magePresenceOfMind: {
    text: 'Presence of Mind makes your next spell with a cast time instant, and its 3-minute cooldown starts when you use it.',
    docRef: `${MAGE}#presence-of-mind`,
  },
  manaRegenMage: {
    text: 'Mana regenerates every 2 s, from a random moment in the first 2 s of the fight: 13 + Spirit / 4 when you’ve spent none for 5 s, and inside that rule Mage Armor’s share (kept up all fight) with Arcane Meditation’s; your mp5 always. Mana gems are conjured before the pull.',
    docRef: `${MAGE}#mana`,
  },
  // --- The warlock's (docs/classes/warlock.md §9), and the caster core's rules it relies on ---
  reactionTimeWarlock: {
    text: 'The rotation reacts instantly: it acts at the very moment a cast or the global cooldown ends, a DoT runs out, Shadow Trance procs or you have the mana, with no reaction time or latency.',
    docRef: `${DT}#36-server-tick-and-spell-batching`,
  },
  warlockMana: {
    text: 'Mana regenerates every 2 s, from a random moment in the first 2 s of the fight: 8 + Spirit / 4 when you’ve cast nothing that costs mana for 5 s, and your mp5 always, as in Classic Era. A spell’s mana is paid as its cast completes.',
    docRef: `${LOCK}#5-mana`,
  },
  casterSpellRules: {
    text: 'Spells miss a level-63 boss 17% of the time before hit, and lose 6% of their damage on average to its resistance (24, a Classic Era estimate): the average, not the 25/50/75% partial resists. Casting speed shortens cast times, not the 1.5 s global cooldown. Untested in Forever.',
    docRef: `${SPELLS}#3-resistances`,
  },
  casterDotCrits: {
    text: 'Your DoTs’ ticks can crit, as Forever’s periodic-crit flag on them says, at the crit chance you had when the DoT landed and your spells’ crit bonus; they fire no crit procs. A DoT keeps your spell damage and buffs from when it landed, and reads the boss’s debuffs at each tick. Untested.',
    docRef: `${SPELLS}#7-dots`,
  },
  casterDots: {
    text: 'A DoT keeps your spell damage and buffs from when it landed, and reads the boss’s debuffs at each tick; its ticks never crit in Classic Era. Recasting it restarts it and loses the partial tick.',
    docRef: `${SPELLS}#7-dots`,
  },
  lifeTap: {
    text: 'Life Tap gives 424 mana plus your Spirit at the pull, as its Forever tooltip reads, with Improved Life Tap’s bonus; its health cost isn’t simulated (you’re healed), and neither is threat from its mana.',
    docRef: `${LOCK}#33-curses-life-tap-and-buffs`,
  },
  demonicSacrifice: {
    text: 'Demonic Sacrifice’s buff is up from before the pull, and you keep no demon out, as Classic Era’s raid warlocks played.',
    docRef: `${LOCK}#34-demonic-sacrifice`,
  },
  warlockNoPet: {
    text: 'You fight with no demon, out or sacrificed: neither its damage nor the talents that need one out (Soul Link, Master Demonologist, Demonic Knowledge) count. Demonology keeps one out.',
    docRef: `${LOCK}#34-demonic-sacrifice`,
  },
  curseOfTheElementsOwn: {
    text: 'Your own Curse of the Elements is recast when it misses; a curse that’s resisted isn’t rolled apart from the miss, and its −75 resistance changes nothing on a boss. Untested.',
    docRef: `${LOCK}#33-curses-life-tap-and-buffs`,
  },
  conflagrate: {
    text: 'Conflagrate needs your Immolate on the boss and ends it when it lands, unless Shadow and Flame keeps it (100% at 5/5); a miss leaves it. Untested in Forever.',
    docRef: `${LOCK}#31-destruction`,
  },
  incinerate: {
    text: 'Incinerate’s 25% more on a target with your Immolate multiplies the rest of its damage, as its tooltip reads. Untested.',
    docRef: `${LOCK}#31-destruction`,
  },
  shadowburnShards: {
    text: 'Shadowburn’s Soul Shard isn’t tracked: you’re taken to have one for every cast (Shadow and Flame at 5/5 refunds it).',
    docRef: `${LOCK}#31-destruction`,
  },
  nightfall: {
    text: 'Nightfall rolls its chance on every Corruption tick, as in Classic Era, and Shadow Trance makes the next Shadow Bolt instant; it’s spent even by a Shadow Bolt that misses. Untested in Forever.',
    docRef: `${LOCK}#42-affliction`,
  },
  improvedShadowBolt: {
    text: 'Improved Shadow Bolt’s Shadow Vulnerability is your own: +{detail}% Shadow damage taken from you (4% a rank) for 12 s after a Shadow Bolt crit, DoT ticks included, with no charges, as Forever’s client has it. Untested.',
    docRef: `${LOCK}#41-destruction`,
  },
  baneOfAgonyRamp: {
    text: 'Bane of Agony deals its average each tick: its ramp from weak to strong ticks is server-side, and changes only a Bane the fight ends early.',
    docRef: `${LOCK}#32-affliction`,
  },
  // --- The Demonology warlock's (docs/classes/warlock.md §11.7) ---
  demonOut: {
    text: 'Your demon is out from the pull and never dies: Soul Link, Master Demonologist and Demonic Knowledge are up all fight, and with Demonic Pact so is the buff of the demon you sacrificed before summoning it.',
    docRef: `${LOCK}#114-your-demons-passives`,
  },
  demonStats: {
    // docs/classes/warlock.md §11.2; the plan names what this demon has ({detail}): its mana, its swing.
    text: 'Your demon’s stats are placeholders: {detail}. Untested.',
    docRef: `${LOCK}#112-your-demon`,
  },
  improvedImpCast: {
    text: 'Improved Imp also carries an effect its tooltip doesn’t show (−0.3/−0.7/−1 s); the sim reads it as time off Firebolt’s 2 s cast, so it’s {detail} s. Untested.',
    docRef: `${LOCK}#117-open-questions`,
  },
  demonTable: {
    // docs/classes/warlock.md §11.2; the plan names the tables this demon rolls ({detail}).
    text: 'Your demon rolls a player’s tables at its level: {detail}. Untested.',
    docRef: `${LOCK}#112-your-demon`,
  },
  demonMana: {
    text: 'Your demon’s mana regenerates 8 + Spirit / 4 every 2 s, casting or not, and with Demonic Energies it gains the mana each Life Tap gives you. Untested.',
    docRef: `${LOCK}#112-your-demon`,
  },
  masterDemonologist: {
    // docs/classes/warlock.md §11.4; the plan names the demon out, its school and its spell ({detail}).
    text: 'Master Demonologist gives {detail}. Untested.',
    docRef: `${LOCK}#114-your-demons-passives`,
  },
  decimation: {
    text: 'Decimation: below 35% health your Soul Fire casts 40% faster, costs no Soul Shard and cools down in 6 s from the moment the boss reaches 35% (in game a Shadow Bolt cast there starts it), and Shadow Bolt deals 6% more. Untested.',
    docRef: `${LOCK}#113-talents-in-the-sim`,
  },
  demonicBrand: {
    // docs/classes/warlock.md §11.3, Q21, Q23; the plan names the demon, the charges, the school and its multipliers ({detail}).
    text: 'Demonic Brand: your Searing Pain brands the boss for 10 s. {detail} Untested.',
    docRef: `${LOCK}#113-talents-in-the-sim`,
  },
  warlockTalentStacking: {
    text: 'Talents that raise the same spell’s damage multiply with each other (Agonizing Flames and Aftermath on Immolate, Malediction and Shadow Mastery on the DoTs), as the modern client does; the additive reading would be under 1% lower. Untested.',
    docRef: `${LOCK}#4-talents`,
  },
  // --- The Shadow Priest's (docs/classes/priest.md §9) ---
  priestNoMelee: {
    text: 'You stand at range and cast: no melee swings and no wand shots are simulated, though your weapon’s and wand’s stats count.',
    docRef: `${PRIEST}#8-implementation-notes`,
  },
  manaRegenPriest: {
    text: 'Mana regenerates every 2 s, from a random moment in the first 2 s of the fight: 13 + Spirit / 4 when you’ve spent none for 5 s, Meditation’s share of it while casting, and your mp5 always, as in Classic Era; untested in Forever.',
    docRef: `${PRIEST}#5-mana`,
  },
  priestSpellResists: {
    text: 'The boss resists your Shadow spells by 6% on average (24 resistance at level 63), Mind Flay whole or not at all, like a spell with a slow; the numbers are Classic Era’s, untested in Forever.',
    docRef: 'docs/mechanics/spells.md#3-resistances',
  },
  priestPeriodicCrits: {
    text: 'Shadow Word: Pain’s and Mind Flay’s ticks can crit, as the Forever client’s flag says, at your spell crit when they land, for double damage in Shadowform. Untested in combat.',
    docRef: `${PRIEST}#31-shadow-word-pain-r8-10894`,
  },
  mindFlayChannel: {
    text: 'Mind Flay rolls to hit once, as it starts, and casting speed doesn’t shorten it; a cut channel loses the ticks it would have dealt. Untested.',
    docRef: 'docs/mechanics/spells.md#6-channels',
  },
  shadowWeaving: {
    text: 'Shadow Weaving is a debuff on the boss that raises only your Shadow damage, 2% a stack; each of your Shadow spells that lands adds a stack and refreshes it, and damage over time ticks don’t. Forever’s client says so; untested in combat.',
    docRef: `${PRIEST}#4-talents`,
  },
  shadowformCosts: {
    text: 'Shadowform halves your Shadow spells’ mana after the talents’ cuts, which add up (Mental Agility, Devouring Contagion); each cost rounds down to whole mana. Untested.',
    docRef: `${PRIEST}#36-shadowform-15473`,
  },
  shadowFocusHit: {
    text: 'Shadow Focus adds its hit to your Shadow spells, up to the 17% that makes them never miss a raid boss in Forever.',
    docRef: `${PRIEST}#4-talents`,
  },
  innerFocus: {
    text: 'Inner Focus is used just before a Mind Blast, which costs nothing and gets +25% crit; its charge goes to the next spell with a cost.',
    docRef: `${PRIEST}#35-inner-focus-14751`,
  },
  darkSacrifice: {
    text: 'Dark Sacrifice’s mana, 1,600 plus your Spirit at the pull, comes in 5 even ticks over 15 s; the health it costs isn’t tracked.',
    docRef: `${PRIEST}#72-race-and-weapons`,
  },
  shadowfiendNotSimulated: {
    text: 'Shadowfiend isn’t simulated: it’s a pet, which the sim can’t model yet, so its mana (5% of yours each hit, for 15 s every 5 minutes) is left out.',
    docRef: `${PRIEST}#5-mana`,
  },
  // The Balance druid's (docs/classes/druid.md §11.8): its spells, their DoTs and procs, then its mana.
  balanceSpells: {
    text: 'Your spells roll the spell table against a level-63 boss with a level-based resistance of 24 (an average partial resist of 6%; Insect Swarm, whose −2% hit makes it binary, is resisted whole instead). Wrath lands the moment its cast does. The Forever spell values are the client’s rows, not yet checked in game, and your talents’ cuts to a spell’s mana multiply and round down.',
    docRef: `${DRUID}#118-open-questions`,
  },
  balanceDotCrits: {
    text: 'Moonfire’s and Insect Swarm’s ticks can crit, as their client flag says, at the spell crit they landed with, and Vengeance doubles those crits too. Untested in Forever.',
    docRef: `${DRUID}#112-spells`,
  },
  balanceNaturesGrace: {
    text: 'Each non-periodic spell crit gives Nature’s Grace for 3 s: +10% casting speed and a 1.35 s global cooldown for your Balance spells, which a cast gets if it starts inside them. Untested.',
    docRef: `${DRUID}#113-talents-and-procs`,
  },
  balanceEclipse: {
    text: 'Each Wrath that lands gives 2 Eclipse charges (at most 4, for 15 s from the last Wrath), and each Starfire you start with one uses it and casts 0.5 s faster, before casting speed. Only the tooltip says so: the client’s effects are server-side.',
    docRef: `${DRUID}#113-talents-and-procs`,
  },
  balanceOmenOfClarity: {
    text: 'Omen of Clarity procs from your landed spells 2 times a minute of casting, twice that in Moonkin Form (a 3 s Starfire’s chance is 20%), at most once every 5 s; Clearcasting makes your next Starfire, Moonfire or Insect Swarm free, not Wrath. The doubling and the 5 s are client data; the rate is the melee one, which only another sim gives.',
    docRef: `${DRUID}#113-talents-and-procs`,
  },
  manaRegenBalance: {
    text: 'Mana regenerates every 2 s, from a random moment in the first 2 s of the fight: 15 + Spirit / 5 when you’ve spent none for 5 s, five times that and all of it while casting in Innervate’s 20 s, and your mp5 always. You’re in Moonkin Form at the pull.',
    docRef: `${DRUID}#114-mana`,
  },
  // --- The hunter's (docs/classes/hunter.md §11; docs/mechanics/ranged-and-pets.md open questions) ---
  hunterNoMelee: {
    text: 'You stand at range and shoot: no melee swings or melee weaving (Raptor Strike) are simulated, though your melee weapons’ stats count.',
    docRef: `${HUNTER}#9-implementation-notes`,
  },
  manaRegenHunter: {
    text: 'Mana regenerates every 2 s, from a random moment in the first 2 s of the fight: 15 + Spirit / 5 when you’ve spent none for 5 s, Bestial Discipline’s share of it while casting, and your mp5 always, as in Classic Era; untested in Forever.',
    docRef: `${HUNTER}#5-mana`,
  },
  autoShotWindup: {
    text: 'Auto Shot aims for its last 0.5 s, not shortened by haste, and a cast or channel still going then holds that shot back until it ends, as in Classic Era. Forever testers report shots firing through Aimed Shot; untested.',
    docRef: `${RANGED}#oq-4-auto-shot-and-casts`,
  },
  ammoDamage: {
    text: 'Your ammo adds its damage per second from the client’s table (17.715 for Thorium arrows or shells) × your weapon’s speed to every shot, normalized shots too. Untested in Forever.',
    docRef: `${RANGED}#oq-3-ammo-damage`,
  },
  rangedTableRolls: {
    text: 'A ranged attack rolls to hit (and to be blocked, from the front) and then separately to crit, as a Classic Era hunter wiki says; one roll would give about 8% fewer crits. Untested.',
    docRef: `${RANGED}#oq-2-two-rolls-or-one`,
  },
  shotCastHaste: {
    text: 'Ranged attack speed (your quiver, Rapid Fire, Quick Shots) shortens Aimed Shot’s, Multi-Shot’s and Sniper Shot’s casts, as Classic Era players measured for Aimed Shot. Untested in Forever.',
    docRef: `${RANGED}#4-auto-shot-the-timer-the-wind-up-and-clipping`,
  },
  serpentStingCrits: {
    text: 'Serpent Sting’s ticks can crit, as the Forever client’s flag says, at your spell crit when it lands, for 1.5 times the damage (Mortal Shots raises it). Untested in combat.',
    docRef: `${HUNTER}#34-serpent-sting-r8-13555`,
  },
  arcaneShotResists: {
    text: 'Arcane Shot and Serpent Sting lose the boss’s average resist of their school (6% at level 63), as spells do; untested for shots.',
    docRef: 'docs/mechanics/spells.md#3-resistances',
  },
  huntersMarkLands: {
    text: 'Hunter’s Mark always lands, and its +71 ranged attack power counts for your shots and Auto Shots; your pet gets only the tenth of it that it inherits from your ranged attack power.',
    docRef: `${HUNTER}#36-hunters-mark-r4-14325`,
  },
  petBaseStats: {
    text: 'Your cat’s base numbers aren’t in the client: 45.8 damage a swing every 2.0 s, 252 attack power and 5% crit, from a Classic Era player’s report, Happy (×1.25) and a cat (×1.10). Not evidence; untested in Forever.',
    docRef: `${RANGED}#oq-6-pet-stats-and-inheritance`,
  },
  petInheritance: {
    // docs/mechanics/ranged-and-pets.md §6.1, every pet's one rule; the plan names what this pet uses
    // ({detail}: plan/pet.ts petInheritanceDetail).
    text: 'Your pet inherits {detail}. Forever’s pet scaling is server-side: this is Forever testers’ report for hunters’ pets (10% of the hunter’s attack power and all its crit), read for every stat and every pet. Untested.',
    docRef: `${RANGED}#61-what-a-pet-inherits-from-you`,
  },
  focusRegen: {
    text: 'Your pet gains 5 Focus a second (6 with Bestial Discipline), as Classic Era players measured; Forever testers report 10. Untested.',
    docRef: `${RANGED}#oq-5-focus-regeneration`,
  },
  petTable: {
    text: 'Your pet attacks from behind with a player’s attack table at its level and skill: it misses, is dodged and glances against a level-63 boss as a player would. Untested.',
    docRef: `${RANGED}#oq-7-the-pets-attack-table`,
  },
  petBuffs: {
    text: 'Of the Buffs tab’s entries, only Battle Shout reaches your pet, as Classic Era’s notes say; Forever testers report pets can’t be buffed at all. Untested.',
    docRef: `${RANGED}#oq-8-buffs-on-pets`,
  },
  carefulAim: {
    text: 'Careful Aim adds 100% of your Intellect to both your attack power and your ranged attack power: the Forever client has two new auras for it, and its text says “Attack Power”. Untested.',
    docRef: `${HUNTER}#4-talents`,
  },
  rangedWeaponSpecialization: {
    text: 'Ranged Weapon Specialization’s +5% raises your ranged weapon’s damage: Auto Shot and the physical shots, not Arcane Shot or Serpent Sting. Untested.',
    docRef: `${HUNTER}#4-talents`,
  },
  focusedFire: {
    text: 'Focused Fire’s +2% is a server script in the Forever client; the sim gives it to all your damage and your pet’s while the pet is out, as its text says. Untested.',
    docRef: `${HUNTER}#4-talents`,
  },
  loneWolf: {
    text: 'With Lone Wolf you fight without a pet, for its +20% to all your damage.',
    docRef: `${HUNTER}#6-pets`,
  },
  ammoNotFired: {
    text: 'Your ammo, {detail}, isn’t what your ranged weapon fires (arrows for bows and crossbows, bullets for guns), so it adds no damage.',
    docRef: `${RANGED}#1-ranged-weapons-ammo-and-quivers`,
  },
  summonHawkNotSimulated: {
    text: 'Summon Hawk isn’t simulated: its hawk’s attacks after the first dive are a creature’s the client doesn’t describe.',
    docRef: `${HUNTER}#11-open-questions`,
  },
} satisfies Record<string, { text: string; docRef: string }>

export type AssumptionId = keyof typeof REGISTRY

/** The `preAqRanks` assumption, with the Greater Blessings' rank 2 when a Blessing of Might or Wisdom is on. */
export const preAqRanksText = (blessings: boolean): string =>
  blessings
    ? 'Abilities and buffs use the ranks trainable before Ahn’Qiraj, not the higher ones its books teach, and the Greater Blessings’ rank 2 is taken to need Ahn’Qiraj too.'
    : REGISTRY.preAqRanks.text

/**
 * The `powerInfusion` assumption. For a setup that also uses Arcane Power it says the priest holds
 * the one cast until Arcane Power ends (user decision, PIV-5), since the two don't stack: a [?]
 * placeholder (D24), patch 1.12's rule, which no 2019+ Classic Era source confirms (buffs doc §1.1
 * "Power Infusion"; open question 23, testable on Classic Era or on Forever).
 */
export const powerInfusionText = (arcanePower: boolean): string =>
  arcanePower
    ? 'A priest casts Power Infusion on you once, as your Arcane Power ends: +20% spell damage for the 15 s after it. The two don’t stack, as patch 1.12 had it (Power Infusion can’t land while Arcane Power is up, and Arcane Power ends it), so the priest holds it until then. It isn’t cast again, though its 3-minute cooldown would allow a second in a fight over 3 minutes. Untested in Classic Era or Forever.'
    : REGISTRY.powerInfusion.text

/** Items in prose: "a", "a and b", "a, b and c". */
const prose = (items: readonly string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/**
 * The bear's texts follow the setup: the abilities it uses, the raid and the rule profile's numbers
 * (druid.md §8 "Uncertainty surfacing"). The registry's are the default bear's in Forever.
 */
export const BEAR_TEXT = {
  /** What its abilities' threat rests on, naming only the ones it uses, with Lacerate's in the profile's terms. */
  threat(uses: { maul: boolean; swipe: boolean; mangle: boolean; lacerate: boolean; faerieFire: boolean; roar: boolean }, profile: RuleProfileId = 'forever'): string {
    const multiplied = [...(uses.maul ? ['Maul'] : []), ...(uses.swipe ? ['Swipe'] : [])]
    const flat = [...(uses.faerieFire ? ['Faerie Fire 108'] : []), ...(uses.roar ? ['Demoralizing Roar 39'] : [])]
    const known = [...(multiplied.length ? [`${prose(multiplied)} ${multiplied.length > 1 ? 'make' : 'makes'} 1.75 threat per damage`] : []), ...flat]
    if (multiplied.length === 0 && known.length > 0) known[0] = known[0].replace(/ (\d+)$/, ' makes $1 threat')
    // threat.md#threat-wording-table (D29): Lacerate's "high amount of threat" is the warrior's Sunder
    // Armor's at its level, the profile's (bear-abilities.ts LACERATE_THREAT).
    const lacerate = LACERATE_THREAT[profile]
    const sentences = [
      ...(known.length ? [`${prose(known)}, as a Classic Era threat library has them.`] : []),
      ...(uses.mangle ? ['Primal Bite makes 1 threat per damage, since its threat is unknown.'] : []),
      ...(uses.lacerate
        ? [
            lacerate.apCoefficient > 0
              ? `Lacerate makes 1 per damage and ${lacerate.bonus} plus ${Math.round(100 * lacerate.apCoefficient)}% of your attack power more each time it lands: its tooltip’s “high amount of threat”, valued as the warrior’s Sunder Armor, which has the same words at the same level (${lacerate.bonus} is Forever’s client value; the attack power share is the sim’s guess at the one Blizzard’s notes add).`
              : `Lacerate makes 1 per damage and ${lacerate.bonus} more each time it lands: its tooltip’s “high amount of threat”, valued as a warrior’s abilities with the same words (4.5 × the spell’s level, Sunder Armor’s ${lacerate.bonus} in Classic Era).`,
          ]
        : []),
      'None is measured in Forever.',
    ]
    return sentences.join(' ')
  },
  /** Maul's swing and the refunds, in the profile's white rage. */
  rage(o: { maul: boolean; swipe: boolean; normalizedRage: boolean }): string {
    const maul = o.maul
      ? `A Maul swing gives no rage: the white swing it replaces would give ${o.normalizedRage ? '8.65 rage' : 'rage for its damage'}. `
      : ''
    return `${maul}A bear attack that misses or is dodged or parried refunds 80% of its rage${o.swipe ? ' (Swipe nothing, like a warrior’s area attacks)' : ''}, as in Classic Era; untested for bears in Forever.`
  },
  /** Its spells on the boss: the roar's attack power in this profile, and their hit and resist rolls. */
  spells(o: { roar: boolean; faerieFire: boolean; roarAp: number; classicEra: boolean; resistPct: number }): string {
    const ap = o.classicEra
      ? `Demoralizing Roar lowers the boss’s attack power by ${o.roarAp}, Classic Era’s rank 5 at level 60.`
      : `Demoralizing Roar lowers the boss’s attack power by ${o.roarAp}, its level-60 tooltip; whether combat applies all of it is untested.`
    const names = prose([...(o.roar ? ['Demoralizing Roar'] : []), ...(o.faerieFire ? ['Faerie Fire'] : [])])
    const rolls = [
      `${names} ${o.roar && o.faerieFire ? 'roll to hit as spells do' : 'rolls to hit as a spell does'}`,
      ...(o.faerieFire && o.resistPct > 0 ? [`the boss resists ${o.resistPct}% of the Faerie Fires that would land, a Nature spell against its 24 resistance`] : []),
      ...(o.roar ? ['a roar that misses refunds 80% of its rage, as a missed melee ability does'] : []),
    ]
    return `${o.roar ? `${ap} ` : ''}${rolls.join('; ')}; untested.`
  },
  /** Predatory Instincts, the registry's `predatoryInstincts` in the bear's terms: Lacerate's ticks, when it's used. */
  predatoryInstincts(lacerate: boolean): string {
    return `Predatory Instincts makes your abilities crit for 2.2× (the +100% bonus becomes +120%)${lacerate ? ', Lacerate’s ticks included' : ''}; 2.4× is the other reading. Untested.`
  },
  /** Rend and Tear's bonus, the registry's `rendAndTear` in the bear's terms, and whether the boss bleeds here. */
  rendAndTear(o: { pct: number; othersBleed: boolean; lacerate: boolean }): string {
    const when = o.othersBleed
      ? 'while the boss bleeds: all fight here, since the warriors in your raid keep their Deep Wounds on it'
      : o.lacerate
        ? 'while the boss bleeds: here, while your Lacerate is on it (no warriors in your raid keep Deep Wounds on it)'
        : 'while the boss bleeds, which it doesn’t here: no warriors in your raid keep Deep Wounds on it, and you don’t use Lacerate'
    return `Rend and Tear adds ${o.pct}% to your abilities’ direct damage, not auto attacks or bleed ticks, ${when}. Untested.`
  },
  /** Berserk's Primal Bite (Mangle until 1.60.1.70009; the id keeps the old name), and the extra targets the sim leaves out. */
  berserkMangle(swipe: boolean): string {
    return `Under Berserk a Primal Bite starts no cooldown, and one already running when Berserk starts keeps running; untested. The sim has one target, so Primal Bite’s${swipe ? ' and Swipe’s' : ''} extra targets add nothing.`
  },
}

export class Assumptions {
  private readonly list: Assumption[] = []
  private readonly seen = new Set<string>()

  /** Adds an assumption once. Its `detail` fills the text's `{detail}`, or follows the text after a colon. */
  add(id: AssumptionId, detail?: string): void {
    if (this.seen.has(id)) return
    const entry: { text: string; docRef: string } = REGISTRY[id]
    const text = !detail ? entry.text : entry.text.includes('{detail}') ? entry.text.replace('{detail}', detail) : `${entry.text.replace(/\.$/, '')}: ${detail}.`
    this.addText(id, text)
  }

  /** Adds `id` with a text of its own, built from the setup (`BEAR_TEXT`); its doc link stays the registry's. */
  addText(id: AssumptionId, text: string): void {
    if (this.seen.has(id)) return
    this.seen.add(id)
    this.list.push({ id, text, docRef: REGISTRY[id].docRef })
  }

  toArray(): Assumption[] {
    return [...this.list]
  }
}
