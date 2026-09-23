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
const DRUID = 'docs/classes/druid.md'
const PAL = 'docs/classes/paladin.md'

const REGISTRY = {
  whiteSwingsOnly: {
    text: 'Only white swings, talents, procs and buffs are simulated for now: abilities, cooldowns and on-use items arrive with the rotation.',
    docRef: 'docs/milestones.md#m2-warrior-dps-with-the-production-ux',
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
  unmodelledSetBonuses: {
    text: 'Some of your set bonuses aren’t simulated yet',
    docRef: 'docs/data/items.md#effect-and-set-bonus-text',
  },
  procRates: {
    text: 'Procs-per-minute rates (Crusader 1, Fiery Weapon 6, Flurry Axe 1.8, …) are Classic Era’s: Forever sets them on the server, and nobody has measured them.',
    docRef: `${DT}#52-ppm-vs-flat-chance-classic-era-examples`,
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
    text: 'Windfury can’t proc again within 100 ms of a proc, the internal cooldown the Forever client gives it; whether the server enforces it is untested.',
    docRef: `${DT}#54-extra-attacks-and-chaining`,
  },
  windfuryStone: {
    text: 'Windfury Totem is a party aura in Forever, so a main-hand stone still applies alongside it.',
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
    // warrior.md §2.8, Q10; the plan says how the window opens and closes.
    text: 'Overpower waits for its window, as in Classic Era; untested in Forever.',
    docRef: `${WAR}#28-reactive-abilities-overpower-bloodthrill-revenge`,
  },
  revengeWindow: {
    text: 'A block, dodge or parry of the boss’s swings opens Revenge for 5 s, and using it closes the window, as in Classic Era; untested in Forever.',
    docRef: `${WAR}#28-reactive-abilities-overpower-bloodthrill-revenge`,
  },
  spellTable: {
    // warrior.md §7 "Spell-table abilities" and Q33; the plan names the abilities ({detail}).
    text: '{detail}: the spell table, as the Forever client marks it, with one roll for a spell miss (17% against a raid boss before spell hit) and no dodge, parry or block. What lands crits at your special-attack crit chance, and a miss refunds 80% of its cost, as a melee ability’s does; both untested.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  bloodthrill: {
    text: 'Bloodthrill procs only from your white swings while your own Rend is on the target, and opens the same Overpower window as a dodge, for 6 s.',
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
    text: 'Rend’s ticks can crit, at your special-attack crit chance when it landed, with the same bonus as your abilities’ crits (×2.2 with Impale 2/2); untested in Forever.',
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
    text: 'Dire Bear Form multiplies bonus armor (enchants, buffs, Forever’s green armor) by 4.6 as well as item armor, as a second armor aura in the Forever client suggests; unmeasured.',
    docRef: `${DRUID}#47-bear-armor-low-priority-tps-doesnt-need-it`,
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
    text: 'Judgement of Command deals half its damage, since a boss can’t be stunned, but gets its full spell damage bonus, and never misses; untested.',
    docRef: `${PAL}#seal-of-command-soc`,
  },
  sealOfRighteousness: {
    text: 'Seal of Righteousness deals 1.2 × 18.8 × your weapon’s speed with a two-hander (0.85 × with a one-hander) plus 0.1 × spell damage on each landed auto attack; the formula is untested in Forever.',
    docRef: `${PAL}#seal-of-righteousness-sor`,
  },
  sealOfFury: {
    text: 'Seal of Fury deals a flat 35 Holy plus 0.1 × spell damage on each landed auto attack, as its tooltip reads; untested.',
    docRef: `${PAL}#seal-of-fury-sof-new-the-protection-seal`,
  },
  meleeSpellProcs: {
    text: 'Seal procs and judgements are melee attacks that crit for double at your melee crit. Seal of Command’s proc and the judgements trigger Windfury, Hand of Justice, Crusader, Vengeance and Vindication; Seal of Righteousness’s and Seal of Fury’s procs trigger none of them, as the client data marks them. Untested in game.',
    docRef: `${PAL}#open-questions`,
  },
  jotcBonus: {
    text: 'Judgement of the Crusader’s +161 Holy damage is scaled by each hit’s spell damage coefficient and added after your own damage bonuses; untested, and the biggest uncertainty in Retribution damage.',
    docRef: `${PAL}#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc`,
  },
  jotcBonusFlat: {
    text: 'Judgement of the Crusader’s +161 Holy damage is added in full to each melee-class Holy hit (seal procs, judgements, Holy Strike), as set on the Rotation tab, and by its coefficient’s share to spells; untested, and the biggest uncertainty in Retribution damage.',
    docRef: `${PAL}#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc`,
  },
  holyStrike: {
    text: 'Holy Strike deals 40% of a normalized main-hand swing and of its 81–105, plus the full 0.429 × spell damage; untested.',
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
    text: 'Berserk’s crits give Primal Fury’s extra combo point like any crit, and Rake’s bleed keeps its crit chance. Untested.',
    docRef: `${DRUID}#37-berserk-417141-cat-use`,
  },
  formHaste: {
    text: 'Attack speed bonuses (the Manual Crowd Pummeler, Juju Flurry) speed up your form’s swings, as other sims have it; untested in Forever.',
    docRef: `${DRUID}#21-form-attacks-swing-timer-and-damage`,
  },
  noWeapon: {
    text: 'No main-hand weapon: unarmed attacks aren’t simulated, so neither is any ability that attacks; only cooldowns and buffs are used.',
    docRef: `${WAR}#7-implementation-notes`,
  },
  // The paladin's spells don't need a weapon, so they're still cast.
  noWeaponSpells: {
    text: 'No main-hand weapon: unarmed attacks aren’t simulated, so neither is anything that needs them, such as your seal’s procs and Holy Strike; your other spells are.',
    docRef: `${PAL}#conventions-used-below`,
  },
} satisfies Record<string, { text: string; docRef: string }>

export type AssumptionId = keyof typeof REGISTRY

export class Assumptions {
  private readonly list: Assumption[] = []
  private readonly seen = new Set<string>()

  /** Adds an assumption once. Its `detail` fills the text's `{detail}`, or follows the text after a colon. */
  add(id: AssumptionId, detail?: string): void {
    if (this.seen.has(id)) return
    this.seen.add(id)
    const entry: { text: string; docRef: string } = REGISTRY[id]
    const text = !detail ? entry.text : entry.text.includes('{detail}') ? entry.text.replace('{detail}', detail) : `${entry.text.replace(/\.$/, '')}: ${detail}.`
    this.list.push({ id, text, docRef: entry.docRef })
  }

  toArray(): Assumption[] {
    return [...this.list]
  }
}
