// Pure helpers for a tank's results (docs/ux.md#results): the boss's swings against you, and
// whether it can land crushing blows. No React, no stores, so unit tests can import them.
import { formatInt, formatOne, formatPct } from '@/lib/format'
import { type BossOutcomes, type CharacterSheet, CRUSH_MIN_LEVEL_GAP, DEFENSE_PER_POINT, type FightConfig, mobSkill, PLAYER_LEVEL } from '@/sim'

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
 * The line under the boss's table's heading: what it is, why its dodge, parry and block are lower
 * than the sheet's above it, and why the swings that landed differ a little. Without the fight
 * (null) it leaves out the boss's skill.
 */
export function bossTableIntro(bossLevel: number | null, avoidance: readonly Avoidance[]): string {
  const lines = ['Its chances on each swing at you as the fight starts, from the stats above.']
  const penalty = bossLevel === null ? null : bossSkillPenalty(bossLevel)
  if (penalty && penalty.points > 0 && avoidance.length > 0) {
    lines.push(`Its ${penalty.skill} weapon skill takes ${formatOne(penalty.points)} points off your ${list(avoidance, 'and')}.`)
  }
  lines.push('The swings that landed can differ a little, by chance and as cooldowns and procs change your stats in the fight.')
  return lines.join(' ')
}

/**
 * The line under damage taken per second: what it counts, how often the boss swung, and what set
 * the size of its swings. Without the fight (null) it leaves out the swing size.
 */
export function damageTakenText(swingsPerFight: number, boss: Pick<FightConfig['boss'], 'damageMin' | 'damageMax'> | null): string {
  const swings = `It swung ${formatOne(swingsPerFight)} times a fight on average`
  return [
    'The health the boss’s melee swings cost you, after avoidance, armor, block and other reductions.',
    boss ? `${swings}, set to ${swingDamageText(boss)} a swing before armor ${FIGHT_ADVANCED}.` : `${swings}.`,
    'Debuffs on it, such as Demoralizing Shout and Thunder Clap, lower its damage and slow its swings, whether yours (Rotation) or the raid’s (Buffs).',
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

/** The boss's swing size for the damage-taken line: "4,500 to 5,500", or "5,000" when fixed. */
export function swingDamageText(boss: Pick<FightConfig['boss'], 'damageMin' | 'damageMax'>): string {
  return boss.damageMin === boss.damageMax ? formatInt(boss.damageMin) : `${formatInt(boss.damageMin)} to ${formatInt(boss.damageMax)}`
}
