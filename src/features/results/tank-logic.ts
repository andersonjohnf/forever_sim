// Pure helpers for a tank's results (docs/ux.md#results): the boss's swings against you, and
// whether it can land crushing blows. No React, no stores, so unit tests can import them.
import { formatInt, formatOne, formatPct } from '@/lib/format'
import { type BossOutcomes, type CharacterSheet, CRUSH_MIN_LEVEL_GAP, DEFENSE_PER_POINT, type FightConfig, mobSkill, PLAYER_LEVEL, SPEC_META, type SpecId } from '@/sim'

/**
 * The boss's outcomes in the order its one roll takes them (docs/mechanics/combat-tables.md#8-boss--player-tanks):
 * the four that spare you most of the swing, then the three that land in full. "Normal hit" keeps
 * the last apart from the character sheet's Hit, your own chance to hit.
 */
export const BOSS_OUTCOMES: readonly (readonly [key: keyof BossOutcomes, label: string])[] = [
  ['miss', 'Miss'],
  ['dodge', 'Dodge'],
  ['parry', 'Parry'],
  ['block', 'Block'],
  ['crit', 'Crit'],
  ['crush', 'Crushing'],
  ['hit', 'Normal hit'],
]

/**
 * The character sheet's label for defense's cut to the boss's crit chance, which sits a few rows
 * under your own Crit.
 */
export const CRIT_REDUCTION_LABEL = 'Crit reduction (boss’s crits)'

/**
 * Where the boss's swings are set, in the app's "(Tab → Section)" form. Non-breaking spaces keep
 * it on one line at 390 px.
 */
export const FIGHT_ADVANCED = '(Fight\u00a0→\u00a0Advanced)'

/** A share this small is float noise from the table's truncation, not a real slice. */
const NOISE = 1e-9

/** The avoidance a character sheet can show, in the table's order. */
export type Avoidance = 'dodge' | 'parry' | 'block'

/**
 * The avoidance you have, from the sheet: dodge, parry and block, each only when above 0. A bear
 * never parries or blocks, and a warrior blocks only with a shield.
 */
export function avoidanceOf(sheet: Pick<CharacterSheet, 'dodgePct' | 'parryPct' | 'blockPct'>): Avoidance[] {
  const all: [Avoidance, number][] = [
    ['dodge', sheet.dodgePct],
    ['parry', sheet.parryPct],
    ['block', sheet.blockPct],
  ]
  return all.filter(([, pct]) => pct > 0).map(([kind]) => kind)
}

/** "a", "a and b", "a, b and c" (or with "or"). */
const list = (words: readonly string[], conjunction: 'and' | 'or') =>
  words.length < 3 ? words.join(` ${conjunction} `) : `${words.slice(0, -1).join(', ')} ${conjunction} ${words.at(-1)}`

/**
 * Whether the boss can land crushing blows on you, from its table as the fight starts
 * (combat-tables §8: only a boss 3 or more levels above you crushes, and crushing blows fall off
 * the table once miss, dodge, parry, block and crit fill it).
 * - `off`: crushing blows are switched off in Fight → Advanced.
 * - `cannot`: the boss can't crush at all (it's under level 63), whatever your avoidance.
 * - `uncrushable`: nothing is left on its table for them.
 * - `crushable`: they land; `short` more points of avoidance or block (to the tenth the table
 *   shows, and at least 0.1 so it never reads 0.0) would push them off. Crushing blows sit before
 *   hits, so that's the crushing slice and the hit slice together.
 * Without the fight (null), a table with no crushing slice but room for hits means a boss that
 * can't crush.
 */
export type CrushingState =
  | { kind: 'off' }
  | { kind: 'cannot'; bossLevel: number | null }
  | { kind: 'uncrushable' }
  | { kind: 'crushable'; short: number }

export function crushingState(table: BossOutcomes, fight: Pick<FightConfig, 'bossLevel' | 'boss'> | null): CrushingState {
  if (fight && !fight.boss.canCrush) return { kind: 'off' }
  // The boss's level decides first: a level 62 boss never crushes, even a tank with no room for hits.
  if (fight && fight.bossLevel - PLAYER_LEVEL < CRUSH_MIN_LEVEL_GAP) return { kind: 'cannot', bossLevel: fight.bossLevel }
  if (table.crush > NOISE) return { kind: 'crushable', short: Math.max(0.1, Math.round((table.crush + table.hit) * 10) / 10) }
  // No crushing slice, yet room for plain hits: this boss never crushes.
  if (!fight && table.hit > NOISE) return { kind: 'cannot', bossLevel: null }
  return { kind: 'uncrushable' }
}

/**
 * What `crushingState` says, as the line under the boss's table. A shortfall names the slices that
 * fill it: miss, and whichever of dodge, parry and block you have (`avoidance`; all three if not given).
 */
export function crushingText(state: CrushingState, avoidance: readonly Avoidance[] = ['dodge', 'parry', 'block']): string {
  switch (state.kind) {
    case 'off':
      return `Crushing blows are off for this fight ${FIGHT_ADVANCED}.`
    case 'cannot':
      return state.bossLevel === null ? 'This boss can’t land crushing blows.' : `A level ${state.bossLevel} boss can’t land crushing blows.`
    case 'uncrushable':
      return 'You’re uncrushable: there’s no room left on its table for crushing blows.'
    case 'crushable':
      return `Another ${formatOne(state.short)} points of ${list(['miss', ...avoidance], 'or')} would push crushing blows off the table.`
  }
}

/**
 * How many points of dodge, parry and block the boss's weapon skill takes off your sheet's: 0.04 a
 * point of its skill (5 × its level) above 300, since the sheet assumes an attacker of your level
 * (combat-tables §8). A level 63 boss's 315 skill takes 0.6; a level 60 boss's none.
 */
export function bossSkillPenalty(bossLevel: number): { skill: number; points: number } {
  const skill = mobSkill(bossLevel)
  return { skill, points: Math.max(0, (skill - mobSkill(PLAYER_LEVEL)) * DEFENSE_PER_POINT) }
}

/**
 * A block buff the rotation keeps up (a Protection paladin's Holy Shield): the table shows it up.
 * `uptimePct` is how much of the fight it was up, from the result; null if it can't be read.
 */
export interface BlockBuffUp {
  name: string
  blockPct: number
  uptimePct: number | null
}

/**
 * The line under the boss's table's heading: what it is (with the rotation's block buff up, if it
 * keeps one: how much it adds and how long it was up), why its dodge, parry and block are lower
 * than the sheet's above it, and why the swings that landed differ. Without the fight (null) it
 * leaves out the boss's skill.
 * In the wide panel it's behind an info button beside the table's heading (`BossTable`'s `wide`).
 */
export function bossTableIntro(bossLevel: number | null, avoidance: readonly Avoidance[], up: BlockBuffUp | null = null): string {
  const uptime = up && (up.uptimePct === null ? `Your rotation keeps ${up.name} up most of the fight.` : `Your rotation kept it up ${formatPct(up.uptimePct)} of the fight.`)
  const lines = up
    ? [`Its chances on each swing at you with ${up.name} up, from the stats above and its ${formatPct(up.blockPct)} more block.`, uptime!]
    : ['Its chances on each swing at you as the fight starts, from the stats above.']
  const penalty = bossLevel === null ? null : bossSkillPenalty(bossLevel)
  if (penalty && penalty.points > 0 && avoidance.length > 0) {
    lines.push(`Its ${penalty.skill} weapon skill takes ${formatOne(penalty.points)} points off your ${list(avoidance, 'and')}.`)
  }
  lines.push('The swings that landed can differ, by chance and as cooldowns and procs change your stats in the fight.')
  return lines.join(' ')
}

/** A warrior tank's debuffs that lower the boss's damage and slow its swings (buffs doc §6.2, D26). */
const WARRIOR_TANK_DEBUFFS = ['demoralizingShout', 'thunderClap']

/**
 * The attack-power debuff a tank that isn't a warrior can keep up itself, and whose other player
 * brings it in Buffs: the damage-taken line gives it as its example (the bear's Demoralizing Roar,
 * docs/classes/druid.md §6.3). Only Defensive keeps it (D28), so the line says it can be either.
 */
const OWN_AP_DEBUFF: Partial<Record<SpecId, { name: string; other: string }>> = { 'druid-feral-bear': { name: 'Demoralizing Roar', other: 'druid' } }

/**
 * The line under damage taken per second: what it counts, how often the boss swung, and what set
 * the size of its swings. Without the fight (null) it leaves out the swing size. The debuffs it
 * names are a warrior tank's: yours to keep up (Rotation) as a Protection warrior, and only the
 * raid's (Buffs) for another tank, whose presets leave them out (D26); a tank with an attack-power
 * debuff of its own (the bear's roar) names it as yours or another player's, since only Defensive
 * keeps it (D28).
 */
export function damageTakenText(swingsPerFight: number, boss: Pick<FightConfig['boss'], 'damageMin' | 'damageMax'> | null, spec: SpecId): string {
  const swings = `It swung ${formatOne(swingsPerFight)} times a fight on average`
  const yours = WARRIOR_TANK_DEBUFFS.some((id) => SPEC_META[spec].ownBuffs?.includes(id))
  const own = OWN_AP_DEBUFF[spec]
  let debuffs = 'Debuffs on it, such as a warrior tank’s Demoralizing Shout and Thunder Clap (Buffs), lower its damage and slow its swings.'
  if (yours) debuffs = 'Debuffs on it, such as Demoralizing Shout and Thunder Clap, lower its damage and slow its swings, whether yours (Rotation) or the raid’s (Buffs).'
  else if (own) debuffs = `Debuffs on it, such as ${own.name} (yours in Rotation, or another ${own.other}’s in Buffs) and a warrior tank’s Thunder Clap (Buffs), lower its damage and slow its swings.`
  return [
    'The health the boss’s melee swings cost you, after avoidance, armor, block and other reductions.',
    boss ? `${swings}, set to ${swingDamageText(boss)} a swing before armor ${FIGHT_ADVANCED}.` : `${swings}.`,
    debuffs,
  ].join(' ')
}

/**
 * How much your defense lowers an attacker's crit chance (character-stats#defense-skill): "5.6%"
 * at 440 defense. Below 300 it raises it instead, shown with a minus sign: "−0.4%". A value that
 * rounds to 0.0 has no sign.
 */
export function formatCritReduction(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  return rounded < 0 ? `−${formatPct(-rounded)}` : formatPct(Math.abs(rounded))
}

/** The boss's swing size for the damage-taken line: "2,200 to 3,200", or "5,000" when fixed. */
export function swingDamageText(boss: Pick<FightConfig['boss'], 'damageMin' | 'damageMax'>): string {
  return boss.damageMin === boss.damageMax ? formatInt(boss.damageMin) : `${formatInt(boss.damageMin)} to ${formatInt(boss.damageMax)}`
}
