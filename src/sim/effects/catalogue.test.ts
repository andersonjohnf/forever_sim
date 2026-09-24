// The buff, consumable and enchant catalogue in both rule profiles
// (docs/mechanics/buffs-debuffs-consumables.md#classic-era-values): every entry's values per
// profile against the doc's table of client rows, what a plan with the default buffs and enchants
// gets in each profile, and Classic Era's Windfury Totem taking the main hand's stone slot.
//
// The committed client data (src/data/client) is Forever's only, so the Classic Era values are
// pinned by the table below, which cites each client row. When the raw client tables are cached
// locally (.cache/client/<build>/tables, from `npm run scrape:client`), the last tests also check
// every cited row in both clients, at level 60, and the aura type of each crit source whose spell
// crit differs by profile; without the cache they're skipped.
import { describe, expect, it } from 'vitest'
import { recklessness } from '../classes/warrior/abilities'
import { stanceEffects } from '../classes/warrior/talents'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { CLASSIC_ERA, FOREVER, type RulesProfile } from '../rules/profiles'
import type { SimConfig } from '../types'
import { BUFFS, BUFFS_BY_ID } from './buffs'
import { ENCHANTS } from './enchants'
import { type CatalogueEntry, catalogueEffects, catalogueSummary, type Effect } from './types'

const withRules = (c: SimConfig, profile: 'forever' | 'classicEra'): SimConfig => ({ ...c, rules: { ...c.rules, profile } })

type Line = [label: string, value: number]

/** An entry's effects as labelled numbers, one line per value (so a proc's internal cooldown or a stone's weapon filter doesn't matter here). */
function digest(effects: Effect[]): Line[] {
  const lines: Line[] = []
  for (const e of effects) {
    switch (e.kind) {
      case 'stat':
        lines.push([e.when?.zones ? `${e.stat} in ${e.when.zones.join('/')}` : e.stat, e.value])
        break
      case 'mult':
        lines.push([`mult ${e.stat}`, e.pct])
        break
      case 'haste':
        lines.push([e.when?.zones ? `haste in ${e.when.zones.join('/')}` : 'haste', e.pct])
        break
      case 'castHaste':
        lines.push(['castHaste', e.pct])
        break
      case 'threat':
      case 'bossSlow':
        lines.push([e.kind, round(e.pct)])
        break
      case 'weaponDamage':
      case 'targetArmor':
      case 'holyTaken':
      case 'bossAp':
        lines.push([e.kind, e.value])
        break
      // The caster core's school effects (docs/mechanics/spells.md §9).
      case 'schoolDamage':
      case 'schoolTaken':
      case 'schoolCrit':
        lines.push([`${e.kind} ${e.schools.join('/')}`, e.pct])
        break
      case 'targetResistance':
        lines.push([`${e.kind} ${e.schools.join('/')}`, e.value])
        break
      case 'tempEnchant':
        if (e.weaponDamage) lines.push([`${e.id} weaponDamage`, e.weaponDamage])
        if (e.crit) lines.push([`${e.id} crit`, e.crit])
        // A wizard oil (buffs doc §3.6).
        if (e.spellDamage) lines.push([`${e.id} spellDamage`, e.spellDamage])
        if (e.spellCrit) lines.push([`${e.id} spellCrit`, e.spellCrit])
        // A rogue's poison: its proc (docs/classes/rogue.md §4).
        if (e.proc) lines.push(...digest([{ kind: 'proc', proc: e.proc }]))
        break
      case 'proc': {
        const { id, chance, action } = e.proc
        lines.push('pct' in chance ? [`${id} chance %`, chance.pct] : 'ppm' in chance ? [`${id} ppm`, chance.ppm] : [`${id} ppm of casting`, chance.ppmCast])
        if (action.kind === 'extraAttacks') lines.push([`${id} bonusAp`, action.bonusAp ?? 0])
        else if (action.kind === 'aura') for (const [mod, v] of Object.entries(action.aura.mods)) lines.push([`${id} ${mod}`, v])
        else if (action.kind === 'spellDamage') lines.push([`${id} ${action.school}`, action.min], ...(action.max !== action.min ? [[`${id} ${action.school} max`, action.max] as Line] : []))
        else if (action.kind === 'stackingDot') lines.push([`${id} ${action.school} tick`, action.tick], [`${id} stacks`, action.maxStacks])
        // A damage shield's spell (Thorns): its damage.
        else if (action.kind === 'spell') lines.push([`${id} ${action.spell.school}`, action.spell.min], ...(action.spell.max !== action.spell.min ? [[`${id} ${action.spell.school} max`, action.spell.max] as Line] : []))
        else lines.push([`${id} ${action.kind}`, NaN])
        break
      }
      case 'onUse': {
        const use = e.use
        if (!use) {
          lines.push([`${e.id} (not simulated)`, 0])
          break
        }
        if (use.rageTenths || use.rageSpreadTenths) lines.push([`${e.id} rage tenths min`, use.rageTenths], [`${e.id} rage tenths max`, use.rageTenths + use.rageSpreadTenths])
        if (use.manaTenths) lines.push([`${e.id} mana tenths min`, use.manaTenths], [`${e.id} mana tenths max`, use.manaTenths + (use.manaSpreadTenths ?? 0)])
        for (const [mod, v] of Object.entries(use.aura?.mods ?? {})) lines.push([`${e.id} ${mod}`, v])
        // An explosive's damage (EZ-Thro Dark Bomb, buffs doc §3.7).
        if (use.spell) lines.push([`${e.id} ${use.spell.school}`, use.spell.min], [`${e.id} ${use.spell.school} max`, use.spell.max])
        break
      }
      default:
        lines.push([e.kind, NaN])
    }
  }
  return lines
}

const round = (x: number) => Math.round(x * 1e6) / 1e6

/**
 * Lines the sim stores as a reduction, as a positive number, where the client row holds a negative
 * modifier: target armor (Sunder Armor's −450) and the boss's attack-speed slow (Thunder Clap's
 * aura 138, −20). Every other line has the client row's own sign.
 */
const CLIENT_SIGN: Record<string, -1> = { targetArmor: -1, bossSlow: -1 }
/**
 * A client row a value comes from. `spell`: a SpellEffect row (Forever `EffectBasePointsF`;
 * Classic Era `EffectBasePoints` + 1 when `EffectDieSides` is 1, or the bounds of the roll),
 * times `times`. `enchant`: a SpellItemEnchantment row's `EffectPointsMin` for that slot, or its
 * equip spell's first effect; `via` is the spell whose enchant effect (53 or 54) applies it.
 * `null`: not in the client (a tooltip value, or a server-side rate).
 */
type Ref = { spell: number; effect?: number; times?: number; bound?: 'min' | 'max'; whole?: boolean } | { enchant: number; slot?: number; via?: number } | null

/** `whole`: the value rounded to a whole number, as the tooltip shows a roll's bounds (Instant Poison's 76–100). */
const S = (spell: number, effect = 0, extra: { times?: number; bound?: 'min' | 'max'; whole?: boolean } = {}): Ref => ({ spell, effect, ...extra })
const E = (enchant: number, via?: number, slot = 0): Ref => ({ enchant, via, slot })

/**
 * Every catalogue entry, as in the doc's table ("Classic Era values"). `forever`/`classicEra`: the
 * expected values where the two differ (`classicEra` absent: the same in both). `rows`: the client
 * rows of the values, in `digest` order (both clients, or Forever's when `classicRows` is given).
 * `foreverOnly`: new in Forever (or only a Season of Discovery row in the 1.15 client), so there's
 * no Classic Era value and both profiles use Forever's.
 */
interface Row {
  forever?: Line[]
  classicEra?: Line[]
  rows: Ref[]
  classicRows?: Ref[]
  foreverOnly?: true
}

const ROWS: Record<string, Row> = {
  // Raid buffs
  battleShout: { forever: [['ap', 139]], classicEra: [['ap', 232]], rows: [S(25289)] },
  blessingOfMight: { forever: [['ap', 133]], classicEra: [['ap', 185]], rows: [S(25291)] },
  blessingOfKings: { rows: [S(20217)] },
  markOfTheWild: {
    forever: [['str', 16], ['agi', 16], ['sta', 16], ['int', 16], ['spi', 16], ['bonusArmor', 385]],
    classicEra: [['str', 12], ['agi', 12], ['sta', 12], ['int', 12], ['spi', 12], ['bonusArmor', 285]],
    rows: [S(21850, 1), S(21850, 1), S(21850, 1), S(21850, 1), S(21850, 1), S(21850, 0)],
  },
  powerWordFortitude: { forever: [['sta', 70]], classicEra: [['sta', 54]], rows: [S(21564)] },
  prayerOfSpirit: { forever: [['spi', 40]], rows: [S(27681)] },
  arcaneBrilliance: { forever: [['int', 31]], rows: [S(23028)] },
  // The casters' (docs/mechanics/spells.md §9): Moonkin Aura is all crit (aura 290) in Forever, spell
  // crit (aura 57) in Classic Era; Power Infusion's +20% spell damage (aura 79), every magic school.
  moonkinAura: { forever: [['crit', 3], ['spellCrit', 3]], classicEra: [['spellCrit', 3]], rows: [S(24907), S(24907)], classicRows: [S(24907)] },
  powerInfusion: { rows: [null, S(10060, 1)] },
  // Forever: all crit (aura 290), so spell crit too; Classic Era: aura 52, melee and ranged only.
  leaderOfThePack: {
    forever: [['crit', 3], ['spellCrit', 3]],
    classicEra: [['crit', 3]],
    rows: [S(24932), S(24932)],
    classicRows: [S(24932)],
  },
  windfuryTotem: {
    forever: [['windfury chance %', 20], ['windfury bonusAp', 246]],
    classicEra: [['windfury chance %', 20], ['windfury bonusAp', 315]],
    rows: [E(564), S(10610)],
  },
  graceOfAir: { forever: [['agi', 89]], classicEra: [['agi', 77]], rows: [S(25360)] },
  strengthOfEarth: { forever: [['str', 53]], classicEra: [['str', 77]], rows: [S(25362)] },
  blessingOfSalvation: { rows: [S(1038)] },
  devotionAura: { rows: [S(10293)] },
  // A damage shield on the tank: 100% of the boss's landed swings, and its damage.
  thorns: { forever: [['thorns chance %', 100], ['thorns nature', 22]], classicEra: [['thorns chance %', 100], ['thorns nature', 18]], rows: [null, S(9910)] },
  // Mana per 5 s: 40 every 5 s (Classic Era 33); the totem's Mana Spring 10494, 10 every 2 s, × 2.5.
  blessingOfWisdom: { forever: [['mp5', 40]], classicEra: [['mp5', 33]], rows: [S(25290)] },
  manaSpringTotem: { forever: [['mp5', 25]], rows: [S(10494, 0, { times: 2.5 })] },
  // Target debuffs
  sunderArmor: { rows: [S(11597, 0, { times: 5 })] },
  // Both clients have 0 here (combo points scale it server-side): tooltip values.
  exposeArmor: { forever: [['targetArmor', 2250]], classicEra: [['targetArmor', 1700]], rows: [null] },
  faerieFire: { rows: [S(9907)] },
  // Forever's effect #0 is a dummy (no attack power for the target).
  curseOfRecklessness: {
    forever: [['targetArmor', 505], ['bossAp', 0]],
    classicEra: [['targetArmor', 640], ['bossAp', 90]],
    rows: [S(11717, 1), null],
    classicRows: [S(11717, 1), S(11717, 0)],
  },
  armorShatter: { forever: [['targetArmor', 495]], classicEra: [['targetArmor', 600]], rows: [S(16928, 0, { times: 3 })] },
  // Forever's rank 4 (1311680) is every magic school; Classic Era's rank 3 (11722) Fire and Frost.
  curseOfTheElements: {
    forever: [['schoolTaken fire/frost/shadow/nature/arcane/holy', 10], ['targetResistance fire/frost/shadow/nature/arcane/holy', -75]],
    classicEra: [['schoolTaken fire/frost', 10], ['targetResistance fire/frost', -75]],
    rows: [S(1311680, 1), S(1311680, 0)],
    classicRows: [S(11722, 1), S(11722, 0)],
  },
  // Level 60: the base points and the per-level term from 54 (−196 − 1.4 × 6; Classic −140 − 6).
  // Whether combat applies the per-level term is OQ 19's.
  // Level 60: −193 − 1.4 × 8, truncated to −204 (Classic −130 − 8): the bear's own (druid.md §4.5).
  demoralizingRoar: { forever: [['bossAp', -204]], classicEra: [['bossAp', -138]], rows: [S(9898)] },
  demoralizingShout: { forever: [['bossAp', -204]], classicEra: [['bossAp', -146]], rows: [S(11556)] },
  thunderClap: { forever: [['bossSlow', 20]], classicEra: [['bossSlow', 10]], rows: [S(11581, 1)] },
  // Another paladin's (buffs doc §4.2): 20303 #0, aura 14 (Holy damage taken), 161; Classic Era 139 + 1.
  judgementOfTheCrusader: { forever: [['holyTaken', 161]], classicEra: [['holyTaken', 140]], rows: [S(20303)] },
  // Consumables
  // Forever: #1 is all crit (aura 290), so spell crit too; Classic Era: aura 52.
  elixirOfTheMongoose: {
    forever: [['agi', 25], ['crit', 2], ['spellCrit', 2]],
    classicEra: [['agi', 25], ['crit', 2]],
    rows: [S(17538, 0), S(17538, 1), S(17538, 1)],
    classicRows: [S(17538, 0), S(17538, 1)],
  },
  elixirOfGreaterStrength: { rows: [S(11405)] },
  jujuPower: { rows: [S(16323)] },
  elixirOfGreaterDefense: { rows: [S(11348)] },
  elixirOfFortitude: { foreverOnly: true, rows: [S(1250928)] },
  flaskOfTheTitans: { rows: [S(17626)] },
  flaskOfSupremePower: { forever: [['spellDamage', 150]], rows: [S(17628)] },
  greaterArcaneElixir: { forever: [['spellDamage', 35]], rows: [S(17539)] },
  elixirOfShadowPower: { forever: [['shadowSpellDamage', 40]], rows: [S(11474)] },
  // Classic Era's item is Elixir of Greater Firepower (26276), Fire spell damage: nothing for Holy.
  elixirOfHolyPower: { forever: [['holySpellDamage', 40]], classicEra: [], rows: [S(1310077)], classicRows: [] },
  flaskOfNaturalAccuracy: { foreverOnly: true, rows: [S(1293740, 0), S(1293740, 1)] },
  // The dummy's 4 is the zone bonus of its all-crit aura (290), so spell crit too.
  flaskOfNaturalAggression: { foreverOnly: true, rows: [S(1293741, 0), S(1293741, 1), S(1293741, 1)] },
  flaskOfNaturalPrecision: { foreverOnly: true, rows: [S(1293742, 0), S(1293742, 1)] },
  flaskOfNaturalSwiftness: { foreverOnly: true, rows: [S(1293743, 0), S(1293743, 1)] },
  winterfallFirewater: { rows: [S(17038)] },
  jujuMight: { rows: [S(16329), S(16329, 1)] },
  roids: { rows: [S(10667)] },
  groundScorpokAssay: { rows: [S(10669)] },
  rumseyRum: { rows: [S(25804)] },
  // Forever: Nutritious Food's aura 227 amount (the item's spell); Classic Era: the Well Fed buff.
  smokedDesertDumplings: { rows: [S(1248401, 1)], classicRows: [S(24799)] },
  mightfishSteak: { forever: [['ap', 40]], classicEra: [['sta', 10]], rows: [S(1249515, 1)], classicRows: [S(18191)] },
  // Forever: Well Fed 1249523 is all crit (aura 290), so spell crit too.
  grilledSquid: { forever: [['crit', 1], ['spellCrit', 1]], classicEra: [['agi', 10]], rows: [S(1249522, 1), S(1249523)], classicRows: [S(18192)] },
  // New in Forever: Flank au Poivre (250069) → Nutritious Food 1248399, whose Well Fed 1248420 is Agility (aura 29, misc 1; checked below).
  flankAuPoivre: { foreverOnly: true, rows: [S(1248399, 1)] },
  // Forever: Nutritious Food 1249513 #1's aura 227 amount, passed to Well Fed 1249520 (spell damage,
  // checked below); Classic Era: Mana Regeneration 18194, 8 every 5 s.
  nightfinSoup: { forever: [['spellDamage', 22]], classicEra: [['mp5', 8]], rows: [S(1249513, 1)], classicRows: [S(18194)] },
  denseSharpeningStone: { rows: [E(1643, 16138)] },
  elementalSharpeningStone: { rows: [E(2506, 22756)] },
  // The oils' enchants apply their equip spell (25111, 25113): its spell damage, then its spell crit.
  wizardOil: { forever: [['wizardOil spellDamage', 30]], classicEra: [['wizardOil spellDamage', 24]], rows: [E(2627, 25121)] },
  brilliantWizardOil: { rows: [E(2628, 25122), S(25113, 2)] },
  mightyRagePotion: { rows: [S(17528, 0, { bound: 'min' }), S(17528, 0, { bound: 'max' }), S(17528, 1)] },
  // Mana in tenths: the energize's bounds × 10 (the health a rune costs isn't simulated).
  majorManaPotion: { rows: [S(17531, 0, { bound: 'min', times: 10 }), S(17531, 0, { bound: 'max', times: 10 })] },
  demonicRune: { rows: [S(16666, 0, { bound: 'min', times: 10 }), S(16666, 0, { bound: 'max', times: 10 })] },
  jujuFlurry: { rows: [S(16322)] },
  // The rogue's poisons (docs/classes/rogue.md §4): the enchant's proc chance, then the proc spell's
  // damage (Instant Poison's roll to whole numbers) or Deadly Poison's tick and stacks (its
  // SpellAuraOptions, which rogue.test.ts checks).
  instantPoisonMainHand: {
    forever: [['instantPoison chance %', 20], ['instantPoison nature', 76], ['instantPoison nature max', 100]],
    classicEra: [['instantPoison chance %', 20], ['instantPoison nature', 112], ['instantPoison nature max', 148]],
    rows: [E(625), S(11337, 0, { bound: 'min', whole: true }), S(11337, 0, { bound: 'max', whole: true })],
  },
  instantPoisonOffHand: {
    forever: [['instantPoison chance %', 20], ['instantPoison nature', 76], ['instantPoison nature max', 100]],
    classicEra: [['instantPoison chance %', 20], ['instantPoison nature', 112], ['instantPoison nature max', 148]],
    rows: [E(625), S(11337, 0, { bound: 'min', whole: true }), S(11337, 0, { bound: 'max', whole: true })],
  },
  deadlyPoisonMainHand: {
    forever: [['deadlyPoison chance %', 30], ['deadlyPoison nature tick', 23], ['deadlyPoison stacks', 5]],
    classicEra: [['deadlyPoison chance %', 30], ['deadlyPoison nature tick', 34], ['deadlyPoison stacks', 5]],
    rows: [E(2630), S(25349), null],
  },
  deadlyPoisonOffHand: {
    forever: [['deadlyPoison chance %', 30], ['deadlyPoison nature tick', 23], ['deadlyPoison stacks', 5]],
    classicEra: [['deadlyPoison chance %', 30], ['deadlyPoison nature tick', 34], ['deadlyPoison stacks', 5]],
    rows: [E(2630), S(25349), null],
  },
  // Its Energy in tenths: Restore Energy 9512's 100 × 10.
  thistleTea: { rows: [S(9512, 0, { times: 10 }), S(9512, 0, { times: 10 })] },
  // School Damage 450 with variance 1: 225–675 Fire.
  ezThroDarkBomb: { foreverOnly: true, rows: [S(1269334, 0, { bound: 'min' }), S(1269334, 0, { bound: 'max' })] },
  // Aura 22 (armor), 2,000.
  greaterStoneshieldPotion: { rows: [S(17540)] },
  // Enchants
  crusader: { rows: [null, S(20007)] },
  weaponAgility: { rows: [E(2564, 23800)] },
  weaponSpellPower: { forever: [['spellDamage', 30]], rows: [E(2504, 22749)] },
  weaponStrength: { rows: [E(2563, 23799)] },
  superiorStriking: { rows: [E(1897, 20031)] },
  fieryWeapon: { rows: [null, S(13897)] },
  twoHandAgility: { rows: [E(2646, 27837)] },
  twoHandStrength: { foreverOnly: true, rows: [E(8215, 1248668)] },
  twoHandLesserStrength: { foreverOnly: true, rows: [E(2563, 1248511)] },
  superiorImpact: { rows: [E(1896, 20030)] },
  arcanumVoracityStrength: { rows: [E(1506)] },
  arcanumVoracityAgility: { rows: [E(1508)] },
  arcanumVoracityStamina: { rows: [E(1507)] },
  arcanumConstitution: { rows: [E(1503)] },
  arcanumTenacity: { rows: [E(1504)] },
  arcanumRapidity: { rows: [E(2543)] },
  arcanumProtection: { rows: [E(2545)] },
  arcanumFocus: { forever: [['spellDamage', 8]], rows: [E(2544)] },
  presenceOfMight: { rows: [S(24148, 0), S(24148, 2), S(24148, 1)] },
  forcefulRuggedArmorKit: { foreverOnly: true, rows: [E(8491, 1254772, 1), E(8491, 1254772, 0)] },
  wildLeatherArmorKit: { foreverOnly: true, rows: [E(8719, 1306907, 0), E(8719, 1306907, 1)] },
  ruggedArmorKit: {
    forever: [['sta', 5], ['bonusArmor', 40]],
    classicEra: [['bonusArmor', 40]],
    rows: [E(8490, 19057, 1), E(8490, 19057, 0)],
    classicRows: [E(1843, 19057)],
  },
  coreArmorKit: { rows: [E(2503, 22725)] },
  zandalarSignetOfMight: { rows: [E(2606)] },
  mightOfTheScourge: { rows: [S(29482, 2), S(29482, 1)] },
  fortitudeOfTheScourge: { rows: [S(29481, 1), S(29481, 2)] },
  // The 1.15 client's rows for these are Season of Discovery's (a forbidden source).
  cloakAgility: { foreverOnly: true, rows: [E(7667, 1219587)] },
  cloakLesserAgility: { rows: [E(849, 13882)] },
  cloakSuperiorDefense: { rows: [E(1889, 20015)] },
  cloakGreaterDefense: { forever: [['bonusArmor', 60]], classicEra: [['bonusArmor', 50]], rows: [E(884, 13746)] },
  cloakDodge: { rows: [E(2622, 25086)] },
  cloakSubtlety: { rows: [E(2621, 25084)] },
  chestGreaterStats: { rows: Array(5).fill(E(1891, 20025)) },
  chestStats: { rows: Array(5).fill(E(928, 13941)) },
  chestMajorStamina: { forever: [['sta', 10]], classicEra: [['health', 100]], rows: [E(1892, 20026)] },
  bracerSuperiorStrength: { rows: [E(1885, 20010)] },
  bracerGreaterStrength: { rows: [E(927, 13939)] },
  bracerSuperiorAgility: { foreverOnly: true, rows: [E(7656, 1248599)] },
  bracerSuperiorStamina: { rows: [E(1886, 20011)] },
  bracerDeflection: { forever: [['defense', 7]], classicEra: [['defense', 3]], rows: [E(923, 13931)] },
  bracerSuperiorDeflection: { foreverOnly: true, rows: [E(8214, 1248665)] },
  gloveSuperiorStrength: { foreverOnly: true, rows: [E(2563, 1248640)] },
  gloveSuperiorAgility: { rows: [E(2564, 25080)] },
  // The enchanting spell applies another enchant in each client.
  gloveGreaterStrength: { forever: [['str', 10]], classicEra: [['str', 7]], rows: [E(8207, 20013)], classicRows: [E(927, 20013)] },
  gloveGreaterAgility: { forever: [['agi', 10]], classicEra: [['agi', 7]], rows: [E(8206, 20012)], classicRows: [E(1887, 20012)] },
  gloveStrength: { forever: [['str', 7]], classicEra: [['str', 5]], rows: [E(927, 13887)], classicRows: [E(856, 13887)] },
  gloveAgility: { forever: [['agi', 7]], classicEra: [['agi', 5]], rows: [E(1887, 13815)], classicRows: [E(904, 13815)] },
  // Forever's tooltip adds casting speed (docs/mechanics/spells.md §4): the same enchant row's 1.
  gloveMinorHaste: { forever: [['haste', 1], ['castHaste', 1]], classicEra: [['haste', 1]], rows: [E(931, 13948), E(931, 13948)], classicRows: [E(931, 13948)] },
  gloveThreat: { rows: [E(2613, 25072)] },
  bootsGreaterAgility: { rows: [E(1887, 20023)] },
  bootsAgility: { rows: [E(904, 13935)] },
  bootsGreaterStamina: { rows: [E(929, 20020)] },
  shieldGreaterStamina: { forever: [['sta', 9]], classicEra: [['sta', 7]], rows: [E(1886, 20017)], classicRows: [E(929, 20017)] },
  shieldExcellentStamina: { foreverOnly: true, rows: [E(7663, 1219581)] },
  shieldCriticalStrike: { foreverOnly: true, rows: [S(1220596, 0), S(1220596, 1)] },
  shieldLesserBlock: { rows: [E(863, 13689)] },
  neckStrength: { foreverOnly: true, rows: [E(856, 1249019)] },
  neckAgility: { foreverOnly: true, rows: [E(904, 1249059)] },
}

const ENTRIES: [string, CatalogueEntry][] = [...BUFFS.map((b) => [b.id, b] as [string, CatalogueEntry]), ...ENCHANTS.map((e) => [e.id, e] as [string, CatalogueEntry])]

describe('the catalogue in both profiles (buffs doc, Classic Era values)', () => {
  it('lists every entry once in the table, as the doc does', () => {
    expect(Object.keys(ROWS).sort()).toEqual(ENTRIES.map(([id]) => id).sort())
    expect(ENTRIES).toHaveLength(125)
  })

  it.each(ENTRIES)('%s: Forever’s values, and Classic Era’s where they differ', (id, entry) => {
    const row = ROWS[id]
    const forever = digest(catalogueEffects(entry, FOREVER))
    const classic = digest(catalogueEffects(entry, CLASSIC_ERA))
    if (row.forever) expect(forever).toEqual(row.forever)
    expect(classic).toEqual(row.classicEra ?? forever)
    // An entry is in the table as differing exactly when its values differ.
    expect(row.classicEra !== undefined, 'differs').toBe(JSON.stringify(classic) !== JSON.stringify(forever))
    expect(row.rows, 'one client row per value').toHaveLength(forever.length)
    if (row.classicRows) expect(row.classicRows).toHaveLength(classic.length)
    // Forever-only entries have no Classic Era values of their own.
    if (row.foreverOnly) expect(entry.classicEra).toBeUndefined()
  })

  it('shows each profile’s own numbers in the summaries of the entries that differ', () => {
    // Every number but a time ("every 5 s", "for 2 min"), which says how often, not how much.
    const numbers = (text: string) => [...text.matchAll(/\d[\d,]*(?:\.\d+)?(?! ?(?:s|min)\b)/g)].map((m) => Number(m[0].replaceAll(',', '')))
    for (const [id, entry] of ENTRIES) {
      if (!entry.classicEra) continue
      for (const profile of [FOREVER, CLASSIC_ERA]) {
        const values = digest(catalogueEffects(entry, profile)).map(([, v]) => Math.abs(round(v)))
        const summary = catalogueSummary(entry, profile)
        for (const n of numbers(summary)) expect(values, `${id} (${profile.id}): “${summary}”`).toContain(n)
      }
    }
    expect(catalogueSummary(BUFFS_BY_ID.get('battleShout')!, FOREVER)).toBe('+139 attack power')
    expect(catalogueSummary(BUFFS_BY_ID.get('battleShout')!, CLASSIC_ERA)).toBe('+232 attack power')
    expect(catalogueSummary(BUFFS_BY_ID.get('blessingOfKings')!, CLASSIC_ERA)).toBe('+10% all stats')
    expect(catalogueSummary(BUFFS_BY_ID.get('blessingOfWisdom')!, CLASSIC_ERA)).toBe('+33 mana every 5 s')
  })
})

describe('a plan per profile', () => {
  const fury = defaultConfig('warrior-fury')
  const noBuffs: SimConfig = { ...fury, buffs: { ...fury.buffs, enabled: [] } }
  const FLAT = ['str', 'agi', 'sta', 'int', 'spi', 'ap', 'crit', 'bonusArmor', 'health'] as const
  const numbers = (config: SimConfig) => {
    const { plan } = buildPlan(config)
    return {
      ...Object.fromEntries(FLAT.map((k) => [k, plan.stats[k]])),
      targetArmor: plan.fight.targetArmor,
      mainHandStone: plan.weapons[0]!.flatDamage,
      offHandStone: plan.weapons[1]!.flatDamage,
    }
  }
  const delta = (a: Record<string, number>, b: Record<string, number>) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - b[k]]))

  it('gets the expected stats from the default (Standard raid) buffs in each profile', () => {
    expect(fury.buffs.enabled).toEqual([
      'battleShout',
      'blessingOfMight',
      'blessingOfKings',
      'markOfTheWild',
      'powerWordFortitude',
      'leaderOfThePack',
      'windfuryTotem',
      'strengthOfEarth',
      'blessingOfSalvation',
      'sunderArmor',
      'faerieFire',
      'curseOfRecklessness',
      'elixirOfTheMongoose',
      'elixirOfGreaterStrength',
      'winterfallFirewater',
      'smokedDesertDumplings',
      'denseSharpeningStone',
      'mightyRagePotion',
    ])
    const buffs = (profile: 'forever' | 'classicEra') => delta(numbers(withRules(fury, profile)), numbers(withRules(noBuffs, profile)))
    // Battle Shout is the rotation's own (an aura in the fight), Kings a multiplier and the potion a cast,
    // so none of them is here. Forever: Strength of Earth 53 + Gift of the Wild 16 + Giants 25 +
    // Dumplings 20; Mongoose 25; Prayer of Fortitude 70; Might 133 + Firewater 35; Leader of the Pack
    // 3 + Mongoose 2; Sunder 2250 + Faerie Fire 505 + Recklessness 505; the stone on each weapon.
    expect(buffs('forever')).toEqual({
      str: 114,
      agi: 41,
      sta: 86,
      int: 16,
      spi: 16,
      ap: 168,
      crit: 5,
      bonusArmor: 385,
      health: 0,
      targetArmor: -3260,
      mainHandStone: 8,
      offHandStone: 8,
    })
    // Classic Era: Strength of Earth 77, Gift of the Wild 12 and 285, Fortitude 54, Might 185,
    // Recklessness 640, and Windfury Totem holds the main hand's temporary-enchant slot.
    expect(buffs('classicEra')).toEqual({
      str: 134,
      agi: 37,
      sta: 66,
      int: 12,
      spi: 12,
      ap: 220,
      crit: 5,
      bonusArmor: 285,
      health: 0,
      targetArmor: -3395,
      mainHandStone: 0,
      offHandStone: 8,
    })
  })

  it('gets Classic Era’s glove enchant, and nothing else changes, from the default enchants', () => {
    const forever = buildPlan(withRules(noBuffs, 'forever')).plan.stats
    const classic = buildPlan(withRules(noBuffs, 'classicEra')).plan.stats
    const changed = Object.fromEntries(
      Object.entries(classic)
        .filter(([k, v]) => typeof v === 'number' && v !== (forever as unknown as Record<string, number>)[k])
        .map(([k, v]) => [k, (v as number) - (forever as unknown as Record<string, number>)[k]]),
    )
    // Gloves – Greater Strength: +10 in Forever, +7 in Classic Era (the cloak and necklace enchants are
    // Forever's in both). And Berserker Stance's +3% crit is melee only in Classic Era (7381 #0 is aura
    // 52 there, 290 in Forever), so spell crit is 3 lower (warrior.md §2.1).
    expect(fury.gear.hands?.enchantId).toBe('gloveGreaterStrength')
    expect(changed).toEqual({ str: -3, spellCrit: -3 })
  })

  it('buffs doc example 5 in Classic Era: another warrior’s Battle Shout and Blessing of Might, untalented, add 417', () => {
    const rotation = { 'warrior.fury.battleShout.enabled': false }
    const bare: SimConfig = { ...noBuffs, gear: {}, talents: '', rotation }
    const ap = (profile: 'forever' | 'classicEra', enabled: string[]) =>
      buildPlan(withRules({ ...bare, buffs: { raid: ['warrior', 'paladin'], enabled } }, profile)).sheet.attackPower
    expect(ap('forever', ['battleShout', 'blessingOfMight']) - ap('forever', [])).toBe(272)
    expect(ap('classicEra', ['battleShout', 'blessingOfMight']) - ap('classicEra', [])).toBe(232 + 185)
  })

  it('counts the rotation’s own Battle Shout on the sheet at the value the fight uses, in both profiles', () => {
    for (const profile of ['forever', 'classicEra'] as const) {
      const own = buildPlan(withRules(fury, profile))
      const none = buildPlan(
        withRules({ ...fury, rotation: { 'warrior.fury.battleShout.enabled': false }, buffs: { ...fury.buffs, enabled: fury.buffs.enabled.filter((id) => id !== 'battleShout') } }, profile),
      )
      const aura = own.plan.auras.find((a) => a.id === 'battleShout')!
      // The profile's own shout (warrior.md §1.1): Forever 139 for 3 min, Classic Era 232 for 2 min.
      expect([aura.ap, aura.durationMs], profile).toEqual(profile === 'forever' ? [139, 180000] : [232, 120000])
      expect(own.plan.stats.apMult).toBe(1)
      expect(own.sheet.attackPower - none.sheet.attackPower, profile).toBe(aura.ap)
    }
  })
})

describe('Windfury Totem and a main-hand stone (buffs doc, Windfury Totem)', () => {
  const fury = defaultConfig('warrior-fury')
  const setup = (profile: 'forever' | 'classicEra', enabled: string[]) =>
    buildPlan(withRules({ ...fury, buffs: { raid: fury.buffs.raid, enabled } }, profile))
  const stones = (bundle: ReturnType<typeof buildPlan>) => bundle.plan.weapons.map((w) => w?.flatDamage)
  const notes = (bundle: ReturnType<typeof buildPlan>) => bundle.assumptions.map((a) => a.id)

  it('Forever: the totem is a party aura, so both hands keep their stone, and the result says so [?]', () => {
    const both = setup('forever', ['windfuryTotem', 'denseSharpeningStone'])
    expect(stones(both)).toEqual([8, 8])
    expect(notes(both)).toContain('windfuryStone')
    expect(both.plan.procs.some((p) => p.id === 'windfury')).toBe(true)
  })

  it('Classic Era: the totem’s enchant takes the main hand’s slot; the off hand keeps its stone [C]', () => {
    const both = setup('classicEra', ['windfuryTotem', 'denseSharpeningStone'])
    expect(stones(both)).toEqual([0, 8])
    expect(notes(both)).not.toContain('windfuryStone')
    expect(both.plan.procs.find((p) => p.id === 'windfury')!.a).toBe(315)
    // Without the totem, or without a shaman to drop it, the main hand keeps its stone.
    expect(stones(setup('classicEra', ['denseSharpeningStone']))).toEqual([8, 8])
    const noShaman = buildPlan(
      withRules({ ...fury, buffs: { raid: fury.buffs.raid.filter((c) => c !== 'shaman'), enabled: ['windfuryTotem', 'denseSharpeningStone'] } }, 'classicEra'),
    )
    expect(stones(noShaman)).toEqual([8, 8])
  })

  it('Classic Era with a two-hander: no stone at all under the totem', () => {
    const arms = defaultConfig('warrior-arms')
    const plan = (profile: 'forever' | 'classicEra') => buildPlan(withRules(arms, profile)).plan
    expect(arms.buffs.enabled).toEqual(expect.arrayContaining(['windfuryTotem', 'denseSharpeningStone']))
    expect(plan('forever').weapons[0]!.flatDamage).toBe(8)
    expect(plan('classicEra').weapons[0]!.flatDamage).toBe(0)
  })
})

describe('the wizard oils (buffs doc §3.6)', () => {
  const prot = defaultConfig('paladin-protection')
  const noWeaponBuffs = prot.buffs.enabled.filter((id) => id !== 'wizardOil')
  const plan = (config: SimConfig, enabled: string[], profile: 'forever' | 'classicEra' = 'forever') => buildPlan(withRules({ ...config, buffs: { ...config.buffs, enabled } }, profile)).plan
  const sp = (p: ReturnType<typeof plan>) => p.stats.spellDamage

  it('Wizard Oil is +30 spell damage on you (Classic Era 24), and the Protection paladin’s Standard raid brings it and Nightfin Soup’s +22', () => {
    expect(prot.buffs.enabled).toEqual(expect.arrayContaining(['wizardOil', 'nightfinSoup']))
    expect(sp(plan(prot, [...noWeaponBuffs, 'wizardOil'])) - sp(plan(prot, noWeaponBuffs))).toBe(30)
    // Classic Era's Windfury Totem is the main hand's temporary enchant, so it takes the oil's place
    // (buffs doc, Windfury Totem); without it, the oil's 24.
    expect(sp(plan(prot, [...noWeaponBuffs, 'wizardOil'], 'classicEra')) - sp(plan(prot, noWeaponBuffs, 'classicEra'))).toBe(0)
    const noTotem = noWeaponBuffs.filter((id) => id !== 'windfuryTotem')
    expect(sp(plan(prot, [...noTotem, 'wizardOil'], 'classicEra')) - sp(plan(prot, noTotem, 'classicEra'))).toBe(24)
    const noFood = noWeaponBuffs.filter((id) => id !== 'nightfinSoup')
    expect(sp(plan(prot, noWeaponBuffs)) - sp(plan(prot, noFood))).toBe(22)
    // Classic Era's Nightfin Soup is 8 mana every 5 s, and no spell damage.
    expect(sp(plan(prot, noWeaponBuffs, 'classicEra')) - sp(plan(prot, noFood, 'classicEra'))).toBe(0)
    expect(plan(prot, noWeaponBuffs, 'classicEra').stats.mp5 - plan(prot, noFood, 'classicEra').stats.mp5).toBe(8)
  })

  it('Brilliant Wizard Oil takes Wizard Oil’s place: +36 spell damage and +1% spell crit, once', () => {
    const both = plan(prot, [...noWeaponBuffs, 'wizardOil', 'brilliantWizardOil'])
    const none = plan(prot, noWeaponBuffs)
    expect(sp(both) - sp(none)).toBe(36)
    expect(both.stats.spellCrit - none.stats.spellCrit).toBeCloseTo(1, 9)
  })

  it('goes on the main hand in place of a stone there; the off hand keeps its stone', () => {
    const fury = defaultConfig('warrior-fury')
    const withStone = { ...fury, buffs: { raid: fury.buffs.raid, enabled: ['denseSharpeningStone'] } }
    // A warrior sees no oil (it has no mana), so the plan skips it: both stones stay.
    expect(plan(withStone, ['denseSharpeningStone', 'wizardOil']).weapons.map((w) => w?.flatDamage)).toEqual([8, 8])
    const ret = defaultConfig('paladin-retribution')
    const retPlan = plan(ret, ['denseSharpeningStone', 'wizardOil'])
    expect(retPlan.weapons[0]!.flatDamage).toBe(0)
    expect(sp(retPlan) - sp(plan(ret, ['denseSharpeningStone']))).toBe(30)
  })

  it('reaches a caster’s spells too: an Elemental shaman’s +36', () => {
    const ele = defaultConfig('shaman-elemental')
    const off = ele.buffs.enabled.filter((id) => id !== 'brilliantWizardOil')
    expect(sp(plan(ele, [...off, 'brilliantWizardOil'])) - sp(plan(ele, off))).toBe(36)
  })
})

// --- The cited client rows, when the raw client tables are cached locally -------------------------

const FOREVER_BUILD = '1.60.1.69913'
const CLASSIC_BUILD = '1.15.9.69722'
const TABLES = import.meta.glob<string>(
  [
    '/.cache/client/1.60.1.69913/tables/{SpellEffect,SpellItemEnchantment,SpellLevels}.ndjson',
    '/.cache/client/1.15.9.69722/tables/{SpellEffect,SpellItemEnchantment,SpellLevels}.ndjson',
  ],
  { query: '?raw', import: 'default' },
)
type ClientRow = Record<string, number | number[]>

async function load(build: string, table: string): Promise<ClientRow[]> {
  const raw = await TABLES[`/.cache/client/${build}/tables/${table}.ndjson`]()
  // The first line is the parser's header, then one row per line.
  return raw.split('\n').slice(1).filter(Boolean).map((line) => JSON.parse(line) as ClientRow)
}

class Client {
  readonly build: string
  private readonly effects = new Map<number, ClientRow[]>()
  private readonly enchants = new Map<number, ClientRow>()
  private readonly levels = new Map<number, ClientRow>()

  private constructor(build: string) {
    this.build = build
  }

  static async open(build: string): Promise<Client> {
    const client = new Client(build)
    for (const r of await load(build, 'SpellEffect')) {
      if (r.DifficultyID !== 0) continue
      const list = client.effects.get(r.SpellID as number) ?? []
      list.push(r)
      client.effects.set(r.SpellID as number, list)
    }
    for (const r of await load(build, 'SpellItemEnchantment')) client.enchants.set(r.ID as number, r)
    for (const r of await load(build, 'SpellLevels')) if (r.DifficultyID === 0) client.levels.set(r.SpellID as number, r)
    return client
  }

  /** A spell effect's aura type (SpellAuraName: 290 all crit, 52 melee and ranged crit, …). */
  aura(spell: number, index: number): number {
    return this.effect(spell, index).EffectAura as number
  }

  /** A spell effect's first misc value (for aura 29, the stat: 0 Strength, 1 Agility, …). */
  misc(spell: number, index: number): number {
    return (this.effect(spell, index).EffectMiscValue as number[])[0]
  }

  /** The spell a spell effect triggers (a periodic trigger's, aura 227), or 0. */
  triggers(spell: number, index: number): number {
    return this.effect(spell, index).EffectTriggerSpell as number
  }

  private effect(spell: number, index: number): ClientRow {
    const row = this.effects.get(spell)?.find((r) => r.EffectIndex === index)
    if (!row) throw new Error(`${this.build}: no SpellEffect ${spell} #${index}`)
    return row
  }

  /**
   * The per-level term a spell's effect adds at level 60, as the spell-text renderer reads it
   * (scripts/scrape/lib/spell-text.mjs `scalingLevels`, `effectRange`; docs/data/items.md#per-level-values):
   * `EffectRealPointsPerLevel` × the levels from `SpellLevel` to 60 (or to `MaxLevel` when that's
   * lower), truncated toward zero. Demoralizing Shout 11556: −1.4 × 6 → −8.
   */
  private perLevel(spell: number, r: ClientRow): number {
    const perLevel = (r.EffectRealPointsPerLevel as number) ?? 0
    const levels = this.levels.get(spell)
    if (!perLevel || !levels) return 0
    const max = levels.MaxLevel as number
    const top = max > 0 ? Math.min(60, max) : 60
    return Math.trunc(perLevel * Math.max(0, top - ((levels.SpellLevel as number) ?? 0)))
  }

  /** The value a row gives at level 60, per-level term included (see `Ref`). */
  value(ref: Exclude<Ref, null>): number {
    if ('spell' in ref) {
      const r = this.effect(ref.spell, ref.effect ?? 0)
      const perLevel = this.perLevel(ref.spell, r)
      let v: number
      if (this.build === FOREVER_BUILD) {
        const spread = ((r.Variance as number) ?? 0) / 2
        const bpf = r.EffectBasePointsF as number
        v = (ref.bound === 'min' ? bpf * (1 - spread) : ref.bound === 'max' ? bpf * (1 + spread) : bpf) + perLevel
      } else {
        const bp = (r.EffectBasePoints as number) + perLevel
        const die = r.EffectDieSides as number
        if (!ref.bound && die > 1) throw new Error(`${this.build}: SpellEffect ${ref.spell} is a roll`)
        v = ref.bound === 'max' ? bp + die : die > 0 ? bp + 1 : bp
      }
      return (ref.whole ? Math.round(v) : v) * (ref.times ?? 1)
    }
    const row = this.enchants.get(ref.enchant)
    if (!row) throw new Error(`${this.build}: no SpellItemEnchantment ${ref.enchant}`)
    if (ref.via !== undefined) {
      const applies = (this.effects.get(ref.via) ?? []).some((r) => [53, 54].includes(r.Effect as number) && (r.EffectMiscValue as number[])[0] === ref.enchant)
      expect(applies, `${this.build}: spell ${ref.via} applies enchant ${ref.enchant}`).toBe(true)
    }
    const slot = ref.slot ?? 0
    const type = (row.Effect as number[])[slot]
    // 3: an equip spell; 1 (a proc: its chance), 2 (weapon damage), 4 (armor), 5 (a stat): the points.
    return type === 3 ? this.value({ spell: (row.EffectArg as number[])[slot] }) : (row.EffectPointsMin as number[])[slot]
  }
}

describe('the cited client rows', () => {
  const cached = Object.keys(TABLES).length === 6
  /** Both clients, parsed once for the tests below. */
  let clients: Promise<[Client, Client]> | undefined
  const open = () => (clients ??= Promise.all([Client.open(FOREVER_BUILD), Client.open(CLASSIC_BUILD)]))
  it.skipIf(!cached)(`match the raw client tables (${FOREVER_BUILD} and ${CLASSIC_BUILD}, cached locally)`, async () => {
    const [forever, classic] = await open()
    const check = (client: Client, profile: RulesProfile, id: string, entry: CatalogueEntry, refs: Ref[]) => {
      const lines = digest(catalogueEffects(entry, profile))
      refs.forEach((ref, i) => {
        if (!ref) return
        const [label, value] = lines[i]
        // Signed: a flipped sign fails (`+ 0` makes −0 and 0 equal).
        expect(round(client.value(ref)) + 0, `${id} ${label} (${client.build})`).toBe(round((CLIENT_SIGN[label] ?? 1) * value) + 0)
      })
    }
    for (const [id, entry] of ENTRIES) {
      const row = ROWS[id]
      check(forever, FOREVER, id, entry, row.rows)
      if (!row.foreverOnly) check(classic, CLASSIC_ERA, id, entry, row.classicRows ?? row.rows)
    }
  })

  it.skipIf(!cached)('give Flank au Poivre’s Well Fed as Agility: Nutritious Food 1248399 #1 triggers 1248420, aura 29 (a stat) with misc 1 (Agility)', async () => {
    const [forever] = await open()
    const MOD_STAT = 29
    const AGILITY = 1
    // ROWS cites 1248399 #1 for the amount (its 20); the stat is in the spell it triggers.
    expect(ROWS.flankAuPoivre.rows).toEqual([S(1248399, 1)])
    expect(forever.triggers(1248399, 1)).toBe(1248420)
    expect([forever.aura(1248420, 0), forever.misc(1248420, 0)]).toEqual([MOD_STAT, AGILITY])
    expect(digest(catalogueEffects(BUFFS_BY_ID.get('flankAuPoivre')!, FOREVER))).toEqual([['agi', 20]])
  })

  it.skipIf(!cached)('give Nightfin Soup’s Well Fed as spell damage: Nutritious Food 1249513 #1 triggers 1249520, aura 13 with school mask 126 (every magic school)', async () => {
    const [forever] = await open()
    const MOD_DAMAGE_DONE = 13
    const MAGIC_SCHOOLS = 126
    expect(ROWS.nightfinSoup.rows).toEqual([S(1249513, 1)])
    expect(forever.triggers(1249513, 1)).toBe(1249520)
    expect([forever.aura(1249520, 0), forever.misc(1249520, 0)]).toEqual([MOD_DAMAGE_DONE, MAGIC_SCHOOLS])
    expect(digest(catalogueEffects(BUFFS_BY_ID.get('nightfinSoup')!, FOREVER))).toEqual([['spellDamage', 22]])
  })

  // TL4: the RL5 split, crit source by crit source (character-stats.md#implementation-notes).
  it.skipIf(!cached)('give spell crit in a profile exactly where its client row is all crit (aura 290), not Classic Era’s melee crit (aura 52)', async () => {
    const [forever, classic] = await open()
    const ALL_CRIT = 290
    const MELEE_CRIT = 52
    const labels = (entry: CatalogueEntry, profile: RulesProfile) => digest(catalogueEffects(entry, profile)).map(([label]) => label)
    const inCatalogue = (id: string) => (profile: RulesProfile) => labels(ENTRIES.find(([e]) => e === id)![1], profile).includes('spellCrit')
    /** Each crit source whose spell crit differs by profile: its spell's effect, and whether a profile's model gives spell crit. */
    const sources: { id: string; spell: number; effect: number; spellCrit: (profile: RulesProfile) => boolean }[] = [
      { id: 'recklessness', spell: 1719, effect: 0, spellCrit: (p) => (recklessness(p).aura?.mods.spellCrit ?? 0) > 0 },
      { id: 'berserkerStance', spell: 7381, effect: 0, spellCrit: (p) => stanceEffects(p).berserker.some((e) => e.kind === 'stat' && e.stat === 'spellCrit') },
      { id: 'leaderOfThePack', spell: 24932, effect: 0, spellCrit: inCatalogue('leaderOfThePack') },
      { id: 'elixirOfTheMongoose', spell: 17538, effect: 1, spellCrit: inCatalogue('elixirOfTheMongoose') },
    ]
    for (const { id, spell, effect, spellCrit } of sources) {
      expect([forever.aura(spell, effect), classic.aura(spell, effect)], `${id} (${spell} #${effect})`).toEqual([ALL_CRIT, MELEE_CRIT])
      expect([spellCrit(FOREVER), spellCrit(CLASSIC_ERA)], id).toEqual([true, false])
    }
    // Every catalogue entry whose crit gives spell crit in Forever only is in the list, citing that row.
    const differing = ENTRIES.filter(([, entry]) => {
      const [f, c] = [labels(entry, FOREVER), labels(entry, CLASSIC_ERA)]
      return f.includes('spellCrit') && !c.includes('spellCrit') && c.includes('crit')
    }).map(([id]) => id)
    expect(differing.sort()).toEqual(sources.filter((s) => s.id in ROWS).map((s) => s.id).sort())
    for (const id of differing) {
      const source = sources.find((s) => s.id === id)!
      const crit = labels(ENTRIES.find(([e]) => e === id)![1], FOREVER).indexOf('crit')
      expect(ROWS[id].rows[crit], id).toEqual(S(source.spell, source.effect))
    }
  })
})
