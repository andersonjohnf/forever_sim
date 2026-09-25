// The Protection priority list and its settings (docs/classes/warrior.md §5.1, §5.4).
//
// This covers the pre-pull (row 0), Shield Block (row 1), Bloodrage (row 2), the racial and on-use
// trinkets (row 3), the Mighty Rage Potion and Juju Flurry (row 4), the upkeep of Thunder Clap and
// Demoralizing Shout, the tank's debuffs, first from the pull and refreshed by the duty rule (rows 5
// and 6, D26), Shield Slam and Revenge (rows 7 and 8), the upkeep of Battle Shout and Sunder Armor
// (rows 9 and 10), the Sunder Armor filler (row 11), the Heroic Strike queue (row 12) and Execute
// (row 13, off by default). The rows are a priority list you reorder (PROTECTION_APL, decision D31),
// each with its own settings, and the Priority choice is its three presets, Defensive, Balanced (the
// default) and Max TPS (D28). Setting ids are `warrior.protection.<ability>.<param>` and every rage
// threshold is in absolute rage points (§5.1); Balanced's defaults for two of them are shares of the
// build's rage bar, resolved to points (§5.4 "Balanced"). Abilities are resolved with the build's talents
// (modifiers.ts) before their costs feed any condition. The lines apply in both phases: only Execute
// is the execute phase's.
import { GCD_MS, toTenths } from '../../core/formulas'
import { type RotationCondition, STANCE } from '../../plan/types'
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import { compileAplRows, DEFAULT_APL_PRESET, normalizeAplOrder } from '../apl'
import {
  BLOODRAGE,
  DEMORALIZING_SHOUT,
  demoralizingShout,
  EXECUTE,
  HEROIC_STRIKE,
  onUseAbility,
  REVENGE,
  revengeWindowProcs,
  SHIELD_BLOCK,
  SHIELD_SLAM,
  shieldSlam,
  SUNDER_ARMOR,
  sunderArmor,
  THUNDER_CLAP,
  thunderClap,
} from './abilities'
import { type TalentRanks, withTalents } from './modifiers'
import {
  auraRefresh,
  battleShoutLine,
  battleShoutOptions,
  bit,
  bloodrageLine,
  bloodrageOptions,
  type ClassRotation,
  consumableOptions,
  cooldownOptions,
  gcdSafe,
  heroicStrikeLine,
  heroicStrikeOptions,
  JUJU_FLURRY,
  maxRage,
  maxRageOf,
  minRage,
  NO_CONTEXT,
  onUseIds,
  prepullCasts,
  prepullOptions,
  racialLines,
  RAGE_POTION,
  rageOption,
  reader,
  RotationBuilder,
  type RotationContext,
  seconds,
  sharedIds,
  stacksBelow,
  timeLeftAtMost,
  trinketLines,
} from './shared'

const P = 'warrior.protection'
const ID = {
  ...sharedIds('protection'),
  priority: `${P}.priority`,
  sbEnabled: `${P}.shieldBlock.enabled`,
  sbMinRage: `${P}.shieldBlock.minRage`,
  slamEnabled: `${P}.shieldSlam.enabled`,
  slamMinRage: `${P}.shieldSlam.minRage`,
  revEnabled: `${P}.revenge.enabled`,
  sunderEnabled: `${P}.sunder.enabled`,
  sunderRefresh: `${P}.sunder.refreshBelowSec`,
  tcEnabled: `${P}.thunderClap.enabled`,
  tcMaintainOnly: `${P}.thunderClap.maintainOnly`,
  tcRefresh: `${P}.thunderClap.refreshBelowSec`,
  demoEnabled: `${P}.demoShout.enabled`,
  demoRefresh: `${P}.demoShout.refreshBelowSec`,
  fillerEnabled: `${P}.sunderFiller.enabled`,
  fillerMinRage: `${P}.sunderFiller.minRage`,
  fillerSafe: `${P}.sunderFiller.waitForShieldSlam`,
  hsLastSec: `${P}.heroicStrike.anyRageLastSec`,
  exEnabled: `${P}.execute.enabled`,
}
export const PROTECTION_IDS = ID

/** The default build's rage cap: no Boundless Rage (warrior.md §5.4). Rage thresholds are absolute (§5.1). */
const PROT_MAX_RAGE = 100

/**
 * The priority choice's values, the list's three presets (warrior.md §5.4 "Priority", decisions D26
 * and D28): Defensive keeps the tank's duties (Shield Block, Thunder Clap, Demoralizing Shout) and is
 * tuned on threat; Balanced, the default, keeps Shield Block and Sunder Armor's five stacks, drops
 * Thunder Clap and Demoralizing Shout, uses the Sunder Armor filler only from 60% of the rage bar,
 * and is tuned on threat and damage together; Max TPS drops the duties whose upkeep costs threat,
 * Thunder Clap and Demoralizing Shout, and keeps the rest, Shield Block (whose blocks make threat
 * since Sunder Armor's fell in 1.60.1.70009, D26's rule) and Shield Slam included. Defensive's
 * stored value is still `duties`, the old default's, so a setup that chose it loads as Defensive (D28).
 */
export const PROTECTION_PRIORITY = { defensive: 'duties', balanced: 'balanced', maxTps: 'maxTps' } as const
const MAX_TPS = { option: ID.priority, is: PROTECTION_PRIORITY.maxTps } as const
const BALANCED = { option: ID.priority, is: PROTECTION_PRIORITY.balanced } as const
/** Max TPS's Heroic Strike threshold (§5.4 "Max TPS"): 45, where Defensive's is 76. */
const MAX_TPS_HS_MIN_RAGE = 45
/**
 * Balanced's Sunder Armor filler threshold, a share of the rage bar in % (§5.4 "Balanced"; user
 * decision, D28: the filler only above 60% rage). It resolves against the build's max rage
 * (`maxRageOf`, to the nearest point, from it): 60 of the default build's 100, 63 of a Gnome's 105,
 * 78 of Boundless Rage 3/3's 130.
 */
const BALANCED_FILLER_PCT = 60
/**
 * Balanced's Heroic Strike threshold, a share of the rage bar in % the same way (§5.4 "Balanced"), a
 * first pass (D27): 84 of 100, 109 of 130. Scaled with the filler's, so a bigger bar keeps the
 * filler and Heroic Strike in the same order they are at 100.
 */
const BALANCED_HS_PCT = 84

/**
 * The tank duties' refresh rule (warrior.md §5.4, decision D26's amendment): a debuff is refreshed as
 * soon as a miss could still be tried again before it falls off, so from its own cooldown, or from
 * one global cooldown if it has none. It's a fixed rule, never tuned: Thunder Clap from its 6 s
 * cooldown, Demoralizing Shout, which has none, from the 1.5 s global cooldown.
 */
const TC_REFRESH_SEC = THUNDER_CLAP.cooldownMs / 1000
const DS_REFRESH_SEC = GCD_MS / 1000
/** Balanced's Sunder Armor upkeep follows the same rule (D28): it has no cooldown, so from one global cooldown. */
const SUNDER_DUTY_REFRESH_SEC = GCD_MS / 1000
/** The refresh help's second sentence: where the default comes from, the duty rule (warrior.md §5.4). */
const DUTY_RULE = (sec: number, why: string) =>
  ` The default, ${sec} s (${why}), follows the tank duties’ rule: refresh while a missed cast can still be tried again before it falls off.`

/** A debuff's refresh input, in seconds left (rows 5, 6 and 10); `why` says where its default comes from. */
const refreshOption = (id: string, what: string, dependsOn: string, def = 3, why = ''): Extract<RotationOption, { kind: 'number' }> => ({
  kind: 'number',
  id,
  group: 'Core abilities',
  label: `${what} again with`,
  help: `Refresh it on the boss when this much of it is left, unless it lasts to the end of the fight.${why}`,
  unit: 's left',
  min: 0,
  max: 30,
  step: 0.5,
  default: def,
  dependsOn,
})

/**
 * What the presets' help and short lines say, measured in the default setup (warrior.md §5.4 "Build
 * 1.60.1.70009"; seed 31101, 100,000 paired fights, 2026-09-25): Defensive's TPS, DPS and damage taken
 * a second, Balanced and Max TPS against it in percent, and Max TPS against Balanced, since the two
 * share their rows. protection-presets.test.ts measures them again, so a change that moves them fails
 * until they're re-measured here.
 */
export const PROTECTION_PRESET_MEASURES = {
  defensive: { tps: 933.23, dps: 367.63, damageTaken: 610.59 },
  balanced: { tpsPct: 7.33, dpsPct: 6.52, damageTakenPct: 21.05 },
  maxTps: { tpsPct: 8.41, dpsPct: 7.03, damageTakenPct: 21.11 },
  maxTpsOverBalanced: { tpsPct: 1.01, dpsPct: 0.48, damageTakenPct: 0.05 },
} as const

const M = PROTECTION_PRESET_MEASURES
/** A measured percent for the help, whole (7%) or to a tenth (7.3%), unsigned. */
const helpPct = (x: number, digits = 0) => `${Math.abs(x).toFixed(digits)}%`

/**
 * The presets' help, which the preset picker's info lists, and their short lines, which the picker
 * shows under it for the one picked (docs/ux.md "Rotation"): what each keeps and drops, with what it
 * measures against Defensive in the default setup, and Max TPS against Balanced too, since the two
 * share their rows (PROTECTION_PRESET_MEASURES).
 */
const DEFENSIVE_SUMMARY = 'Shield Block, Thunder Clap and Demoralizing Shout kept up: the least damage taken. Tuned on threat.'
const DEFENSIVE_HELP = `Keeps Shield Block up, and Thunder Clap’s slow and Demoralizing Shout on the boss from the pull, so you take the least damage, and is tuned on threat: ${Math.round(M.defensive.tps)} TPS, ${Math.round(M.defensive.dps)} DPS and ${Math.round(M.defensive.damageTaken)} damage taken a second in the default setup. Pick it for progression fights.`
const BALANCED_SUMMARY = `Shield Block and 5 Sunders kept, no Thunder Clap or Shout: +${helpPct(M.balanced.tpsPct)} TPS, +${helpPct(M.balanced.dpsPct)} DPS, ${helpPct(M.balanced.damageTakenPct)} more damage taken than Defensive.`
const BALANCED_HELP = `The default, as most tanks play fights short of progression. Keeps Shield Block and Sunder Armor’s 5 stacks; drops Thunder Clap and Demoralizing Shout; uses Sunder Armor as a filler only from ${BALANCED_FILLER_PCT}% of your max rage (${BALANCED_FILLER_PCT} rage without Boundless Rage), and Heroic Strike from ${BALANCED_HS_PCT}%. Against Defensive in the default setup: ${helpPct(M.balanced.tpsPct, 1)} more TPS, ${helpPct(M.balanced.dpsPct, 1)} more DPS and ${helpPct(M.balanced.damageTakenPct)} more damage taken. The Buffs tab’s Thunder Clap and Demoralizing Shout stay off unless you turn them on there for another warrior’s.`
const MAX_TPS_SUMMARY = `Sunder Armor filler from its cost, Heroic Strike from ${MAX_TPS_HS_MIN_RAGE} rage: about +${helpPct(M.maxTpsOverBalanced.tpsPct)} TPS over Balanced for the same damage taken.`
const MAX_TPS_HELP = `Balanced’s rotation spending more rage on threat: the Sunder Armor filler from its cost (9 rage with the default talents) rather than ${BALANCED_FILLER_PCT}% of your max rage, and Heroic Strike from ${MAX_TPS_HS_MIN_RAGE} rage rather than ${BALANCED_HS_PCT}% of your max rage. Like Balanced, it drops Thunder Clap and Demoralizing Shout and keeps Shield Block and Shield Slam, which make more threat than they cost. Against Balanced in the default setup: ${helpPct(M.maxTpsOverBalanced.tpsPct, 1)} more TPS, ${helpPct(M.maxTpsOverBalanced.dpsPct, 1)} more DPS and the same damage taken; against Defensive, ${helpPct(M.maxTps.tpsPct, 1)} more TPS, ${helpPct(M.maxTps.dpsPct, 1)} more DPS and ${helpPct(M.maxTps.damageTakenPct)} more damage taken. Pick it when another tank or the raid covers your survival. The Buffs tab’s Thunder Clap and Demoralizing Shout stay off unless you turn them on there for another warrior’s.`

/**
 * Defaults from warrior.md §5.4's table, in priority order. The duties' timing is D26's fixed rule;
 * the rest is the best rotation found around it for the default setup (decision D23; §5.4 "Tuning
 * the defaults", measured on TPS with scripts/tune/rotation.mjs).
 */
export const PROTECTION_OPTIONS: RotationOption[] = [
  {
    kind: 'choice',
    id: ID.priority,
    label: 'Priority',
    // Not shown as a control: the priority list's preset picker sets it (PROTECTION_APL's presets).
    help: 'Which of the three rotations you play: Defensive, Balanced or Max TPS. The priority list’s preset picker sets it.',
    choices: [
      { value: PROTECTION_PRIORITY.defensive, label: 'Defensive' },
      { value: PROTECTION_PRIORITY.balanced, label: 'Balanced' },
      { value: PROTECTION_PRIORITY.maxTps, label: 'Max TPS' },
    ],
    default: PROTECTION_PRIORITY.balanced,
  },
  ...prepullOptions(
    ID,
    'Open with Charge for 15 rage (+3 per Improved Charge rank). With Vanguard you Charge in Defensive Stance, and it’s on by default; without it, the swap back keeps at most 10 rage, plus 3 per Improved Tactical Mastery rank.',
    {
      chargeDefaultWhen: [{ talent: 'Vanguard', default: true }],
      bloodrage: {
        default: false,
        help: 'Use Bloodrage 1 s before the pull, so its rage is there at the pull. Off by default: used at the pull instead, its rage makes threat (5 a point), and it’s ready again 1 s later.',
      },
    },
  ),
  {
    kind: 'toggle',
    id: ID.sbEnabled,
    group: 'Cooldowns and buffs',
    label: 'Shield Block',
    help: 'Use Shield Block on cooldown: +75% block chance for your next 2 blocks, up to 7 s. Each block gives 5 rage with Shield Specialization 5/5 and opens Revenge, so Max TPS keeps it too: its blocks make more threat than its rage would elsewhere.',
    default: true,
    requires: { shield: true },
  },
  rageOption(ID.sbMinRage, 'Shield Block from', 'Use it only at or above this much rage. It costs 10.', 10, ID.sbEnabled, 'Cooldowns and buffs'),
  ...bloodrageOptions(ID, {
    default: PROT_MAX_RAGE - 30,
    help: `Use it only at or below this much rage, so its rage isn’t lost at the cap. ${PROT_MAX_RAGE - 30} is the 100 cap minus its 30 with Improved Bloodrage 2/2.`,
  }),
  ...battleShoutOptions(ID, 0),
  // The racial and on-use trinkets on cooldown: Protection has no Death Wish to sync them with.
  ...cooldownOptions(ID).filter((o) => o.id !== ID.cdSync),
  {
    kind: 'toggle',
    id: ID.tcEnabled,
    group: 'Core abilities',
    label: 'Thunder Clap',
    help: 'Keep Thunder Clap’s slow on the boss from the pull, before your threat abilities: it attacks 20% slower (10% in Classic Era rules). While this is on, the Buffs tab’s Thunder Clap adds nothing more. Off by default with Balanced and Max TPS.',
    default: true,
    defaultWhen: [
      { ...BALANCED, default: false },
      { ...MAX_TPS, default: false },
    ],
    maintainsBuff: 'thunderClap',
  },
  {
    kind: 'toggle',
    id: ID.tcMaintainOnly,
    group: 'Core abilities',
    label: 'Thunder Clap only to keep the slow up',
    help: 'Use it only when the slow is about to run out. Off: also whenever it’s ready and Shield Slam isn’t about to be.',
    default: true,
    dependsOn: ID.tcEnabled,
  },
  refreshOption(ID.tcRefresh, 'Thunder Clap', ID.tcMaintainOnly, TC_REFRESH_SEC, DUTY_RULE(TC_REFRESH_SEC, 'its cooldown')),
  {
    kind: 'toggle',
    id: ID.demoEnabled,
    group: 'Core abilities',
    label: 'Demoralizing Shout',
    help: 'Keep Demoralizing Shout on the boss from the pull, before your threat abilities: its attack power is 204 lower (146 in Classic Era rules), so it hits you for less. While this is on, the Buffs tab’s Demoralizing Shout adds nothing more. Off by default with Balanced and Max TPS.',
    default: true,
    defaultWhen: [
      { ...BALANCED, default: false },
      { ...MAX_TPS, default: false },
    ],
    maintainsBuff: 'demoralizingShout',
  },
  refreshOption(ID.demoRefresh, 'Demoralizing Shout', ID.demoEnabled, DS_REFRESH_SEC, DUTY_RULE(DS_REFRESH_SEC, 'one global cooldown, as it has none')),
  {
    kind: 'toggle',
    id: ID.slamEnabled,
    group: 'Core abilities',
    label: 'Shield Slam',
    help: 'Use Shield Slam whenever it’s ready, for its damage and threat: the most threat a global cooldown makes, even at Classic Era’s threat value, and Forever’s tooltip calls its threat very high.',
    default: true,
    requires: { talent: 'Shield Slam', shield: true },
  },
  rageOption(ID.slamMinRage, 'Shield Slam from', 'Use it only at or above this much rage. It costs 17 with the default talents.', 17, ID.slamEnabled, 'Core abilities'),
  {
    kind: 'toggle',
    id: ID.revEnabled,
    group: 'Core abilities',
    label: 'Revenge',
    help: 'Use Revenge whenever it’s ready after you block, dodge or parry. Needs Defensive Stance.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.sunderEnabled,
    group: 'Core abilities',
    label: 'Sunder Armor',
    help: 'Build Sunder Armor to 5 stacks on the boss and keep it up. It replaces the Buffs tab’s Sunder Armor, the same debuff. With Expose Armor on there, yours removes no armor, since only one applies, but still makes its threat (untested).',
    default: true,
    maintainsBuff: 'sunderArmor',
  },
  {
    ...refreshOption(ID.sunderRefresh, 'Sunder Armor', ID.sunderEnabled),
    help: `Refresh it on the boss when this much of it is left, unless it lasts to the end of the fight. With Balanced it’s ${SUNDER_DUTY_REFRESH_SEC} s by default (one global cooldown, as it has none), the tank duties’ rule: refresh while a missed cast can still be tried again before it falls off.`,
    defaultWhen: [{ ...BALANCED, default: SUNDER_DUTY_REFRESH_SEC }],
  },
  {
    kind: 'toggle',
    id: ID.fillerEnabled,
    group: 'Fillers',
    label: 'Sunder Armor filler',
    help: 'Fill each global cooldown the abilities above leave free with Sunder Armor, for its threat.',
    default: true,
    maintainsBuff: 'sunderArmor',
  },
  {
    ...rageOption(ID.fillerMinRage, 'Sunder Armor filler from', 'Use it only at or above this much rage. It costs 9 with the default talents.', 9, ID.fillerEnabled, 'Fillers'),
    help: `Use it only at or above this much rage. It costs 9 with the default talents. With Balanced it’s ${BALANCED_FILLER_PCT}% of your max rage by default (${BALANCED_FILLER_PCT} of 100, ${Math.round(1.3 * BALANCED_FILLER_PCT)} with Boundless Rage 3/3), so the filler spends only rage you have to spare.`,
    defaultWhen: [{ ...BALANCED, default: BALANCED_FILLER_PCT, pctOfMaxRage: true }],
  },
  {
    kind: 'toggle',
    id: ID.fillerSafe,
    group: 'Fillers',
    label: 'Sunder Armor filler waits for Shield Slam',
    help: 'Hold the filler while Shield Slam will be ready within a global cooldown, so Sunder Armor doesn’t delay it. Needs Shield Slam on. Off by default: it changes your threat by under 0.1%.',
    default: false,
    dependsOn: ID.fillerEnabled,
    alsoDependsOn: ID.slamEnabled,
  },
  ...heroicStrikeOptions(
    ID,
    76,
    {
      default: true,
      help: 'Queue Heroic Strike on the next main-hand swing when rage is high, to spend rage the global cooldowns can’t.',
    },
    { default: false, spenders: 'Shield Slam or Sunder Armor', underAdvanced: false },
  ).map((o): RotationOption =>
    o.id === ID.hsMinRage && o.kind === 'number'
      ? {
          ...o,
          help: `Queue it at or above this much rage. With Balanced it’s ${BALANCED_HS_PCT}% of your max rage by default (${BALANCED_HS_PCT} of 100), and with Max TPS ${MAX_TPS_HS_MIN_RAGE}: with fewer abilities to pay for, there’s more rage to spend.`,
          defaultWhen: [
            { ...BALANCED, default: BALANCED_HS_PCT, pctOfMaxRage: true },
            { ...MAX_TPS, default: MAX_TPS_HS_MIN_RAGE },
          ],
        }
      : o,
  ),
  {
    kind: 'number',
    id: ID.hsLastSec,
    group: 'Fillers',
    label: 'Heroic Strike with any rage in the last',
    help: 'Near the end of the fight, queue it whenever you can pay for it: rage left at the end is wasted. 0 turns this off.',
    unit: 's',
    min: 0,
    max: 60,
    step: 1,
    default: 12,
    dependsOn: ID.hsEnabled,
  },
  {
    // Under Core abilities: a heading over one setting says nothing (docs/ux.md "Rotation").
    kind: 'toggle',
    id: ID.exEnabled,
    group: 'Core abilities',
    label: 'Execute',
    help: 'In the execute phase, swap to Battle Stance for Execute and back, which loses Defensive Stance’s threat. Without Improved Tactical Mastery the swap keeps 10 rage, less than Execute’s 12, so it’s never used. Needs an execute phase under Fight.',
    default: false,
    needsExecutePhase: true,
  },
  ...consumableOptions(ID, 'Drink it once, as soon as your rage is low enough: 45–75 rage and +60 Strength for 20 s.', {
    default: PROT_MAX_RAGE - 75,
    help: `Drink it the first time your rage is at or below this much, so none of its rage is lost at the cap. ${PROT_MAX_RAGE - 75} is the 100 cap minus 75.`,
  }),
]

/**
 * Buff catalogue ids the rotation keeps up itself with these settings, so the plan drops the Buffs
 * switch's static version: Battle Shout, and the boss's Sunder Armor, Thunder Clap and Demoralizing
 * Shout (warrior.md §5.4 notes).
 */
export function protectionMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  const v = reader(PROTECTION_OPTIONS, values)
  return [
    ...(v.on(ID.bsEnabled) ? ['battleShout'] : []),
    ...(v.on(ID.sunderEnabled) || v.on(ID.fillerEnabled) ? ['sunderArmor'] : []),
    ...(v.on(ID.tcEnabled) ? ['thunderClap'] : []),
    ...(v.on(ID.demoEnabled) ? ['demoralizingShout'] : []),
  ]
}

/**
 * The rows on the global cooldown that the Sunder Armor filler above them takes the global cooldown
 * from, each with its switch: the duties Thunder Clap and Demoralizing Shout, and Battle Shout's
 * upkeep. None needs a talent or a shield, so the note never hides one that says what's missing.
 */
const BELOW_FILLER: readonly { row: string; enabled: string }[] = [
  { row: 'thunderClap', enabled: ID.tcEnabled },
  { row: 'demoShout', enabled: ID.demoEnabled },
  { row: 'battleShout', enabled: ID.bsEnabled },
]

/**
 * What the Rotation tab says under a duty below the Sunder Armor filler (docs/ux.md "Rotation";
 * warrior.md §5.4 "The priority list"). A row keeps its own conditions wherever it sits, so a duty
 * keeps its refresh rule below the filler; but the filler takes the global cooldown first whenever
 * rage is at its threshold, so the duty gets one only while rage is under it. The note says that
 * fact and judges nothing: below Defensive's filler from 9, Demoralizing Shout gets under one cast a
 * fight; below Balanced's from 60, about a third of its casts. It's on any enabled Thunder Clap, Demoralizing
 * Shout or Battle Shout below the enabled filler, with the filler's threshold, or Sunder Armor's cost
 * if that's higher (the filler can't be cast for less). Thunder Clap on cooldown (`maintainOnly` off)
 * is tried just above the filler, wherever its own row is, so it has no note. (TI-4, simplified under
 * CLAUDE.md's step 6: the review log's TV-1.)
 */
export function protectionUnusedSettings(values: Record<string, RotationValue>, talents: TalentRanks, order?: readonly string[]): Record<string, string> {
  const v = reader(PROTECTION_OPTIONS, values, talents)
  if (!v.on(ID.fillerEnabled)) return {}
  const current = normalizeAplOrder(PROTECTION_APL, order)
  const filler = current.indexOf('sunderFiller')
  const threshold = Math.max(v.num(ID.fillerMinRage), withTalents(SUNDER_ARMOR, talents).costTenths / 10)
  const note = `Below the Sunder Armor filler: used only while your rage is under its ${threshold}.`
  const out: Record<string, string> = {}
  for (const { row, enabled } of BELOW_FILLER) {
    if (!v.on(enabled) || current.indexOf(row) < filler) continue
    if (row === 'thunderClap' && !v.on(ID.tcMaintainOnly)) continue
    out[enabled] = note
  }
  return out
}

/**
 * Protection's rotation as a priority list (decision D31; warrior.md §5.4 "The priority list"): §5.4's
 * rows in its order, each with its switch and its own settings. Row 3 is two rows here, the racial
 * and the trinkets. Only the pre-pull is pinned, first. The duties, Shield Block, Thunder Clap and
 * Demoralizing Shout, aren't: every preset puts them first on the global cooldown (D26's rule), and
 * their refresh keeps the duty rule wherever you move them. The Priority choice has no control but
 * the preset picker (its three values are the presets, which share the default order). The
 * consumables (row 4) are spec-wide, above the list; they take their turn with the on-use trinkets,
 * wherever that row sits.
 */
export const PROTECTION_APL: AplDefinition = {
  rows: [
    {
      id: 'prepull',
      label: 'Before the pull',
      icon: 'ability_warrior_charge',
      optionIds: [ID.prepullShout, ID.prepullBloodrage, ID.prepullCharge],
      summary: [
        { option: ID.prepullShout, text: 'Battle Shout' },
        { option: ID.prepullBloodrage, text: 'Bloodrage' },
        { option: ID.prepullCharge, text: 'Charge' },
      ],
      help: 'What you do before the pull. It always comes first.',
      pinned: true,
    },
    {
      id: 'shieldBlock',
      label: 'Shield Block',
      icon: SHIELD_BLOCK.icon,
      enabledId: ID.sbEnabled,
      optionIds: [ID.sbMinRage],
      summary: [{ option: ID.sbMinRage, text: 'on cooldown from {}' }],
    },
    {
      id: 'bloodrage',
      label: 'Bloodrage',
      icon: BLOODRAGE.icon,
      enabledId: ID.brEnabled,
      optionIds: [ID.brMaxRage],
      summary: [{ option: ID.brMaxRage, text: 'up to {}' }],
    },
    { id: 'racial', label: 'Racial cooldown', icon: 'racial_orc_berserkerstrength', enabledId: ID.racialEnabled, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'trinkets', label: 'On-use trinkets', icon: 'inv_jewelry_talisman_01', enabledId: ID.trinketsEnabled, optionIds: [], summary: [{ text: 'on cooldown' }] },
    {
      id: 'thunderClap',
      label: 'Thunder Clap',
      icon: THUNDER_CLAP.icon,
      enabledId: ID.tcEnabled,
      optionIds: [ID.tcMaintainOnly, ID.tcRefresh],
      summary: [
        { option: ID.tcRefresh, text: 'again with {}' },
        { option: ID.tcMaintainOnly, text: 'on cooldown too, before the filler', when: false },
      ],
    },
    {
      id: 'demoShout',
      label: 'Demoralizing Shout',
      icon: DEMORALIZING_SHOUT.icon,
      enabledId: ID.demoEnabled,
      optionIds: [ID.demoRefresh],
      summary: [{ option: ID.demoRefresh, text: 'again with {}' }],
    },
    {
      id: 'shieldSlam',
      label: 'Shield Slam',
      icon: SHIELD_SLAM.icon,
      enabledId: ID.slamEnabled,
      optionIds: [ID.slamMinRage],
      summary: [{ option: ID.slamMinRage, text: 'from {}' }],
    },
    { id: 'revenge', label: 'Revenge', icon: REVENGE.icon, enabledId: ID.revEnabled, optionIds: [], summary: [{ text: 'after a block, dodge or parry' }] },
    {
      id: 'battleShout',
      label: 'Battle Shout',
      icon: 'ability_warrior_battleshout',
      enabledId: ID.bsEnabled,
      optionIds: [ID.bsRefresh],
      summary: [{ option: ID.bsRefresh, text: 'again with {}', zeroText: 'again once it runs out' }],
    },
    {
      id: 'sunder',
      label: 'Sunder Armor',
      icon: SUNDER_ARMOR.icon,
      enabledId: ID.sunderEnabled,
      optionIds: [ID.sunderRefresh],
      summary: [{ text: '5 stacks' }, { option: ID.sunderRefresh, text: 'again with {}' }],
    },
    {
      id: 'sunderFiller',
      label: 'Sunder Armor filler',
      icon: SUNDER_ARMOR.icon,
      enabledId: ID.fillerEnabled,
      optionIds: [ID.fillerMinRage, ID.fillerSafe],
      summary: [
        { option: ID.fillerMinRage, text: 'from {}' },
        { option: ID.fillerSafe, text: 'waits for Shield Slam', alsoOn: [ID.slamEnabled] },
      ],
    },
    {
      id: 'heroicStrike',
      label: 'Heroic Strike',
      icon: HEROIC_STRIKE.icon,
      enabledId: ID.hsEnabled,
      optionIds: [ID.hsMinRage, ID.hsLastSec, ID.hsUnqueue, ID.hsUnqueueBelow],
      summary: [
        { option: ID.hsMinRage, text: 'from {}' },
        { option: ID.hsLastSec, text: 'any rage in the last {}', hideWhen: 0 },
        { option: ID.hsUnqueueBelow, text: 'cancel below {}' },
      ],
    },
    { id: 'execute', label: 'Execute', icon: EXECUTE.icon, enabledId: ID.exEnabled, optionIds: [], summary: [{ text: 'execute phase, in Battle Stance' }] },
  ],
  specWide: [ID.potionEnabled, ID.potionMaxRage, ID.jujuEnabled],
  presets: [
    {
      id: 'defensive',
      label: 'Defensive',
      summary: DEFENSIVE_SUMMARY,
      help: DEFENSIVE_HELP,
      values: { [ID.priority]: PROTECTION_PRIORITY.defensive },
    },
    {
      id: DEFAULT_APL_PRESET,
      label: 'Balanced',
      summary: BALANCED_SUMMARY,
      help: BALANCED_HELP,
      values: {},
    },
    {
      id: 'maxTps',
      label: 'Max TPS',
      summary: MAX_TPS_SUMMARY,
      help: MAX_TPS_HELP,
      values: { [ID.priority]: PROTECTION_PRIORITY.maxTps },
    },
  ],
}

/**
 * The Protection priority list from the settings (warrior.md §5.4), its rows in `order`
 * (PROTECTION_APL; absent: the default order). `talents` gates Shield Slam, follows Vanguard for
 * Charge's default and resolves costs, Improved Revenge and Improved Bloodrage; `context` gives the
 * race (its racial cooldown), the equipped on-use items, the selected consumables and the profile
 * (Thunder Clap's slow, Demoralizing Shout's attack power, Sunder Armor's and Shield Slam's threat,
 * and the rage a stance swap keeps). `_auraIndex` is unused: no Protection line reads a plan aura by id.
 *
 * A row's conditions are its own wherever it sits: the filler stays GCD-safe for Shield Slam if you
 * move it above Shield Slam, so rows refer to each other's abilities by definition (`b.ability`),
 * which in the default order resolves to the index the earlier row gave it, as before the list.
 */
export function protectionRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  _auraIndex: (id: string) => number,
  context: Partial<RotationContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  // Balanced's thresholds are shares of the plan's rage bar (§5.4 "Balanced"): race and talents.
  const v = reader(PROTECTION_OPTIONS, values, talents, { maxRage: maxRageOf(talents, ctx.race) })
  const b = new RotationBuilder(talents)

  const tcDef = thunderClap(ctx.profile)
  // Its threat is the profile's: Forever's 206 plus 5% of attack power, Classic Era's 261 (threat.md#warrior).
  const sunderDef = sunderArmor(ctx.profile)
  // Its threat bonus is the profile's: Forever's "very high" 475 [?], Classic Era's 254 (threat.md#warrior).
  const slamDef = shieldSlam(ctx.profile)
  /** Shield Slam's index, −1 when it isn't used (no talent, or off). */
  const slam = () => (talents.has('Shield Slam') && v.on(ID.slamEnabled) ? b.ability(slamDef) : -1)

  // Row 4: the Mighty Rage Potion (off the GCD), once, the first time rage ≤ maxRage; Juju Flurry on
  // cooldown. Each only when it's selected in Buffs. Spec-wide, above the list, and tried where §5.4
  // has them: just after the on-use trinkets (row 3), wherever that row sits.
  const consumables = () => {
    const potion = ctx.consumables.find((c) => c.id === RAGE_POTION)
    if (potion && v.on(ID.potionEnabled)) b.add({ ...onUseAbility(potion), usesPerFight: 1 }, [maxRage(v.num(ID.potionMaxRage))])
    const juju = ctx.consumables.find((c) => c.id === JUJU_FLURRY)
    if (juju && v.on(ID.jujuEnabled)) b.add(onUseAbility(juju), [])
  }

  compileAplRows(PROTECTION_APL, order, {
    // Row 1: Shield Block (off the GCD) on cooldown at rage ≥ minRage; the engine checks its cost,
    // Defensive Stance and the shield.
    shieldBlock: () => {
      if (v.on(ID.sbEnabled)) b.add(SHIELD_BLOCK, [minRage(toTenths(v.num(ID.sbMinRage)))])
    },
    // Row 2: Bloodrage on cooldown (off the GCD) at rage ≤ maxRage.
    bloodrage: () => bloodrageLine(b, v, ID),
    // Row 3: the racial and on-use trinkets (off the GCD), on cooldown: no Death Wish to sync with.
    racial: () => racialLines(b, v, ID, ctx, { dw: -1, align: false }),
    // Row 4: the consumables ride with the trinkets, wherever that row sits, as before the list.
    trinkets: () => {
      trinketLines(b, v, ID, ctx, { dw: -1, align: false })
      consumables()
    },
    // Rows 5 and 6: the tank's debuffs on the boss, first from the pull, before any threat ability on
    // the global cooldown (D26's amendment, §5.4): Thunder Clap's slow, and Demoralizing Shout, each
    // missing or with ≤ refreshBelowSec left, by default the duty rule's (TC_REFRESH_SEC,
    // DS_REFRESH_SEC). Without maintainOnly, Thunder Clap's slow goes up here once it's down, and it's
    // also used on cooldown for its threat just above the filler (row 11).
    thunderClap: () => {
      if (v.on(ID.tcEnabled)) b.add(tcDef, [auraRefresh(b.ability(tcDef), v.on(ID.tcMaintainOnly) ? seconds(v, ID.tcRefresh) : 0)])
    },
    demoShout: () => {
      if (!v.on(ID.demoEnabled)) return
      const def = demoralizingShout(ctx.profile)
      b.add(def, [auraRefresh(b.ability(def), seconds(v, ID.demoRefresh))])
    },
    // Row 7: Shield Slam (the talent) whenever it's ready, at rage ≥ minRage.
    shieldSlam: () => {
      if (slam() >= 0) b.add(slamDef, [minRage(toTenths(v.num(ID.slamMinRage)))])
    },
    // Row 8: Revenge whenever its window is open (the engine adds the window to the line); its openers
    // come with it: a block, dodge or parry of the boss's swings (§2.8).
    revenge: () => {
      if (!v.on(ID.revEnabled)) return
      b.add(REVENGE, [])
      b.procs.push(...revengeWindowProcs())
    },
    // Row 9: Battle Shout (shared.ts), missing or with ≤ refreshBelowSec left.
    battleShout: () => battleShoutLine(b, v, ID, ctx),
    // Row 10: Sunder Armor while the boss has fewer than 5 stacks, or they have ≤ refreshBelowSec left
    // and would run out before the fight does (Balanced: the duty rule's 1.5 s).
    sunder: () => {
      if (!v.on(ID.sunderEnabled)) return
      const sunder = b.ability(sunderDef)
      b.add(sunderDef, [stacksBelow(sunder, 5)])
      b.add(sunderDef, [auraRefresh(sunder, seconds(v, ID.sunderRefresh))])
    },
    // Row 11: first, row 5 without maintainOnly: Thunder Clap on cooldown, when Shield Slam is GCD-safe.
    // Then the Sunder Armor filler at rage ≥ minRage; with waitForShieldSlam, GCD-safe for Shield Slam
    // only, so it's a setting that changes nothing without Shield Slam. Revenge waits for its window,
    // so it isn't in the mask, as Overpower isn't in Arms' (§5.3): holding the filler for it measured
    // worse (§5.4 "Tuning the defaults").
    sunderFiller: () => {
      if (v.on(ID.tcEnabled) && !v.on(ID.tcMaintainOnly)) b.add(tcDef, [...gcdSafe(bit(slam()))])
      if (v.on(ID.fillerEnabled)) {
        b.add(sunderDef, [minRage(toTenths(v.num(ID.fillerMinRage))), ...(v.on(ID.fillerSafe) ? gcdSafe(bit(slam())) : [])])
      }
    },
    // Row 12: the Heroic Strike queue (off the GCD) at rage ≥ minRage, in both phases; and in the
    // fight's last anyRageLastSec s whenever it can pay (the engine checks its cost), since rage left
    // is wasted.
    heroicStrike: () => {
      const none: RotationCondition[] = []
      heroicStrikeLine(b, v, ID, none)
      const lastMs = seconds(v, ID.hsLastSec)
      if (v.on(ID.hsEnabled) && lastMs > 0) heroicStrikeLine(b, v, ID, [timeLeftAtMost(lastMs)], 0)
    },
    // Row 13: Execute (off by default), in the execute phase: a dance to Battle Stance and back. The
    // swap keeps at most 10 rage (+3 per Improved Tactical Mastery rank), which must pay its cost (§7).
    execute: () => {
      if (v.on(ID.exEnabled)) b.dance(EXECUTE, STANCE.battle, [])
    },
  })

  // Row 0: the pre-pull (shared.ts), built last so the abilities keep their indexes. With Vanguard,
  // Charge works in Defensive Stance; without it, Charge is Battle Stance's, and the swap back keeps
  // at most the swap's cap (§2.1, §2.3).
  prepullCasts(b, v, ID, ctx, v.on(ID.bsEnabled), !talents.has('Vanguard'))

  return b.result(onUseIds(ctx))
}
