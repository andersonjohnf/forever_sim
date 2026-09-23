// The Protection priority list and its settings (docs/classes/warrior.md §5.1, §5.4).
//
// This covers the pre-pull (row 0), Shield Block (row 1), Bloodrage (row 2), the racial and on-use
// trinkets (row 3), the Mighty Rage Potion and Juju Flurry (row 4), Shield Slam and Revenge (rows 5
// and 6), the upkeep of Battle Shout, Sunder Armor, Thunder Clap and Demoralizing Shout (rows 7–10),
// the Sunder Armor filler (row 11), the Heroic Strike queue (row 12) and Execute (row 13, off by
// default). Setting ids are `warrior.protection.<ability>.<param>` and every rage threshold is in
// absolute rage points (§5.1). Abilities are resolved with the build's talents (modifiers.ts) before
// their costs feed any condition. The lines apply in both phases: only Execute is the execute phase's.
import { toTenths } from '../../core/formulas'
import { type RotationCondition, STANCE } from '../../plan/types'
import type { RotationOption, RotationValue } from '../../types'
import {
  demoralizingShout,
  EXECUTE,
  onUseAbility,
  REVENGE,
  revengeWindowProcs,
  SHIELD_BLOCK,
  SHIELD_SLAM,
  SUNDER_ARMOR,
  thunderClap,
} from './abilities'
import type { TalentRanks } from './modifiers'
import {
  auraRefresh,
  battleShoutLine,
  battleShoutOptions,
  bit,
  bloodrageLine,
  bloodrageOptions,
  type ClassRotation,
  consumableOptions,
  cooldownLines,
  cooldownOptions,
  gcdSafe,
  heroicStrikeLine,
  heroicStrikeOptions,
  JUJU_FLURRY,
  maxRage,
  minRage,
  NO_CONTEXT,
  onUseIds,
  prepullCasts,
  prepullOptions,
  RAGE_POTION,
  rageOption,
  reader,
  RotationBuilder,
  type RotationContext,
  seconds,
  sharedIds,
  stacksBelow,
} from './shared'

const P = 'warrior.protection'
const ID = {
  ...sharedIds('protection'),
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
  exEnabled: `${P}.execute.enabled`,
}
export const PROTECTION_IDS = ID

/** The default build's rage cap: no Boundless Rage (warrior.md §5.4). Rage thresholds are absolute (§5.1). */
const PROT_MAX_RAGE = 100

/** A debuff's refresh input, in seconds left (rows 8–10). */
const refreshOption = (id: string, what: string, dependsOn: string, def = 3): RotationOption => ({
  kind: 'number',
  id,
  group: 'Core abilities',
  label: `${what} again with`,
  help: `Refresh it on the boss when this much of it is left, unless it lasts to the end of the fight.`,
  unit: 's left',
  min: 0,
  max: 30,
  step: 0.5,
  default: def,
  dependsOn,
})

/**
 * Defaults from warrior.md §5.4's table, in priority order. They're the best rotation found for the
 * default setup (decision D23; §5.4 "Tuning the defaults", measured on TPS with
 * scripts/tune/rotation.mjs).
 */
export const PROTECTION_OPTIONS: RotationOption[] = [
  ...prepullOptions(
    ID,
    'Open with Charge for 15 rage (+3 per Improved Charge rank). With Vanguard you Charge in Defensive Stance, and it’s on by default; without it, the swap back keeps at most 10 rage, plus 3 per Improved Tactical Mastery rank.',
    [{ talent: 'Vanguard', default: true }],
  ),
  {
    kind: 'toggle',
    id: ID.sbEnabled,
    group: 'Cooldowns and buffs',
    label: 'Shield Block',
    help: 'Use Shield Block on cooldown: +75% block chance for your next 2 blocks, up to 7 s. Each block gives 5 rage with Shield Specialization 5/5 and opens Revenge.',
    default: true,
  },
  rageOption(ID.sbMinRage, 'Shield Block from', 'Use it only at or above this much rage. It costs 10.', 10, ID.sbEnabled, 'Cooldowns and buffs'),
  ...bloodrageOptions(ID, {
    default: PROT_MAX_RAGE - 30,
    help: `Use it only at or below this much rage, so its rage isn’t lost at the cap. ${PROT_MAX_RAGE - 30} is the 100 cap minus its 30 with Improved Bloodrage 2/2.`,
  }),
  ...battleShoutOptions(ID),
  // The racial and on-use trinkets on cooldown: Protection has no Death Wish to sync them with.
  ...cooldownOptions(ID).filter((o) => o.id !== ID.cdSync),
  {
    kind: 'toggle',
    id: ID.slamEnabled,
    group: 'Core abilities',
    label: 'Shield Slam',
    help: 'Use Shield Slam whenever it’s ready. Needs the Shield Slam talent and a shield.',
    default: true,
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
    help: 'Build Sunder Armor to 5 stacks on the boss and keep it up. While this is on, the Buffs tab’s Sunder Armor adds nothing more, since it’s the same debuff.',
    default: true,
    maintainsBuff: 'sunderArmor',
  },
  refreshOption(ID.sunderRefresh, 'Sunder Armor', ID.sunderEnabled),
  {
    kind: 'toggle',
    id: ID.tcEnabled,
    group: 'Core abilities',
    label: 'Thunder Clap',
    help: 'Keep Thunder Clap’s slow on the boss: it attacks 20% slower (10% in Classic Era rules). While this is on, the Buffs tab’s Thunder Clap adds nothing more.',
    default: true,
    maintainsBuff: 'thunderClap',
  },
  {
    kind: 'toggle',
    id: ID.tcMaintainOnly,
    group: 'Core abilities',
    label: 'Thunder Clap only to keep the slow up',
    help: 'Use it only when the slow is about to run out. Off: whenever it’s ready and Shield Slam isn’t about to be.',
    default: true,
    dependsOn: ID.tcEnabled,
  },
  refreshOption(ID.tcRefresh, 'Thunder Clap', ID.tcMaintainOnly),
  {
    kind: 'toggle',
    id: ID.demoEnabled,
    group: 'Core abilities',
    label: 'Demoralizing Shout',
    help: 'Keep Demoralizing Shout on the boss: its attack power is 204 lower (146 in Classic Era rules), so it hits you for less. While this is on, the Buffs tab’s Demoralizing Shout adds nothing more.',
    default: true,
    maintainsBuff: 'demoralizingShout',
  },
  refreshOption(ID.demoRefresh, 'Demoralizing Shout', ID.demoEnabled),
  {
    kind: 'toggle',
    id: ID.fillerEnabled,
    group: 'Fillers',
    label: 'Sunder Armor filler',
    help: 'Fill every other global cooldown with Sunder Armor for its threat.',
    default: true,
    maintainsBuff: 'sunderArmor',
  },
  rageOption(ID.fillerMinRage, 'Sunder Armor filler from', 'Use it only at or above this much rage. It costs 10 with the default talents.', 10, ID.fillerEnabled, 'Fillers'),
  {
    kind: 'toggle',
    id: ID.fillerSafe,
    group: 'Fillers',
    label: 'Sunder Armor filler waits for Shield Slam',
    help: 'Hold the filler while Shield Slam will be ready within a global cooldown, so Sunder Armor doesn’t delay it.',
    default: true,
    dependsOn: ID.fillerEnabled,
  },
  ...heroicStrikeOptions(
    ID,
    45,
    {
      default: true,
      help: 'Queue Heroic Strike on the next main-hand swing when rage is high, to spend rage the global cooldowns can’t.',
    },
    { default: false, spenders: 'Shield Slam or Sunder Armor' },
  ),
  {
    kind: 'toggle',
    id: ID.exEnabled,
    group: 'Execute phase',
    label: 'Execute',
    help: 'In the execute phase, swap to Battle Stance for Execute and back. Battle Stance loses Defensive Stance’s threat, and the swap keeps at most 10 rage (plus 3 per Improved Tactical Mastery rank), less than Execute’s cost without that talent.',
    default: false,
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
 * The Protection priority list from the settings (warrior.md §5.4). `talents` gates Shield Slam,
 * follows Vanguard for Charge's default and resolves costs, Improved Revenge and Improved Bloodrage;
 * `context` gives the race (its racial cooldown), the equipped on-use items, the selected
 * consumables and the profile (Thunder Clap's slow and Demoralizing Shout's attack power, and the
 * rage a stance swap keeps). `_auraIndex` is unused: no Protection line reads a plan aura by id.
 */
export function protectionRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  _auraIndex: (id: string) => number,
  context: Partial<RotationContext> = {},
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(PROTECTION_OPTIONS, values, talents)
  const b = new RotationBuilder(talents)

  // Row 1: Shield Block (off the GCD) on cooldown at rage ≥ minRage; the engine checks its cost,
  // Defensive Stance and the shield.
  if (v.on(ID.sbEnabled)) b.add(SHIELD_BLOCK, [minRage(toTenths(v.num(ID.sbMinRage)))])

  // Row 2: Bloodrage on cooldown (off the GCD) at rage ≤ maxRage.
  bloodrageLine(b, v, ID)

  // Row 3: the racial and on-use trinkets (off the GCD), on cooldown: no Death Wish to sync with.
  cooldownLines(b, v, ID, ctx, { dw: -1, align: false })

  // Row 4: the Mighty Rage Potion (off the GCD), once, the first time rage ≤ maxRage; Juju Flurry on
  // cooldown. Each only when it's selected in Buffs.
  const potion = ctx.consumables.find((c) => c.id === RAGE_POTION)
  if (potion && v.on(ID.potionEnabled)) b.add({ ...onUseAbility(potion), usesPerFight: 1 }, [maxRage(v.num(ID.potionMaxRage))])
  const juju = ctx.consumables.find((c) => c.id === JUJU_FLURRY)
  if (juju && v.on(ID.jujuEnabled)) b.add(onUseAbility(juju), [])

  // Row 5: Shield Slam (the talent) whenever it's ready, at rage ≥ minRage.
  let slam = -1
  if (talents.has('Shield Slam') && v.on(ID.slamEnabled)) slam = b.add(SHIELD_SLAM, [minRage(toTenths(v.num(ID.slamMinRage)))])

  // Row 6: Revenge whenever its window is open (the engine adds the window to the line); its openers
  // come with it: a block, dodge or parry of the boss's swings (§2.8).
  if (v.on(ID.revEnabled)) {
    b.add(REVENGE, [])
    b.procs.push(...revengeWindowProcs())
  }

  // Row 7: Battle Shout (shared.ts), missing or with ≤ refreshBelowSec left.
  const shout = battleShoutLine(b, v, ID, ctx)

  // Row 8: Sunder Armor while the boss has fewer than 5 stacks, or they have ≤ refreshBelowSec left
  // and would run out before the fight does.
  if (v.on(ID.sunderEnabled)) {
    const sunder = b.ability(SUNDER_ARMOR)
    b.add(SUNDER_ARMOR, [stacksBelow(sunder, 5)])
    b.add(SUNDER_ARMOR, [auraRefresh(sunder, seconds(v, ID.sunderRefresh))])
  }

  // Row 9: Thunder Clap, to keep its slow up (maintainOnly), or on cooldown.
  let tc = -1
  if (v.on(ID.tcEnabled)) {
    const def = thunderClap(ctx.profile)
    const maintain = v.on(ID.tcMaintainOnly)
    const a = b.add(def, maintain ? [auraRefresh(b.ability(def), seconds(v, ID.tcRefresh))] : [...gcdSafe(bit(slam))])
    if (!maintain) tc = a
  }

  // Row 10: Demoralizing Shout, missing or with ≤ refreshBelowSec left.
  if (v.on(ID.demoEnabled)) {
    const def = demoralizingShout(ctx.profile)
    b.add(def, [auraRefresh(b.ability(def), seconds(v, ID.demoRefresh))])
  }

  // Row 11: the Sunder Armor filler at rage ≥ minRage; with waitForShieldSlam, GCD-safe for Shield Slam
  // and a Thunder Clap on cooldown. Revenge waits for its window, so it isn't in the mask, as Overpower
  // isn't in Arms' (§5.3): holding the filler for it measured worse (§5.4 "Tuning the defaults").
  if (v.on(ID.fillerEnabled)) {
    b.add(SUNDER_ARMOR, [minRage(toTenths(v.num(ID.fillerMinRage))), ...(v.on(ID.fillerSafe) ? gcdSafe(bit(slam) | bit(tc)) : [])])
  }

  // Row 12: the Heroic Strike queue (off the GCD) at rage ≥ minRage, in both phases.
  const none: RotationCondition[] = []
  heroicStrikeLine(b, v, ID, none)

  // Row 13: Execute (off by default), in the execute phase: a dance to Battle Stance and back. The
  // swap keeps at most 10 rage (+3 per Improved Tactical Mastery rank), which must pay its cost (§7).
  if (v.on(ID.exEnabled)) b.dance(EXECUTE, STANCE.battle, [])

  // Row 0: the pre-pull (shared.ts). With Vanguard, Charge works in Defensive Stance; without it,
  // Charge is Battle Stance's, and the swap back keeps at most the swap's cap (§2.1, §2.3).
  prepullCasts(b, v, ID, ctx, shout, !talents.has('Vanguard'))

  return b.result(onUseIds(ctx))
}
