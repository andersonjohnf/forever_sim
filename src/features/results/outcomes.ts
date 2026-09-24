import { formatInt, formatOne, formatPct } from '@/lib/format'
import type { AbilityResult } from '@/sim'

/** What a row's count a fight reads as (`AbilityResult.counts`). */
const COUNT_NOUN = { blocks: 'blocks', extraAttacks: 'extra attacks' } as const

export interface OutcomeLines {
  /** The first line's parts, joined with " · ": the count a fight first, then the shares. */
  parts: string[]
  /** Its average damage per landed hit (or tick, or missile), shown at the end of the first line; null when it has none to show. */
  average: { value: string; per: 'hit' | 'tick' | 'missile' } | null
  /** A bleed's uptime on the boss, a second line; null for any other row. */
  uptime: string | null
}

/**
 * A breakdown row's outcomes (docs/ux.md#results "Breakdown"). The line starts with the row's count a
 * fight, named for what it counts (`AbilityResult.unit`: "31.2 casts a fight", "118.4 swings a
 * fight", "14.2 procs a fight", an extra-attacks proc's fires, not its swings), or the row's own
 * count (Holy Shield's blocks, Reckoning's extra attacks), and a row whose threat is mana it gave
 * you says that mana (Shield Specialization). Then the crit, avoided and glancing shares of its
 * attempts, left out for a row that can neither crit nor be avoided (Holy Shield's damage). A bleed's
 * row counts applications and ticks apart: crits from its ticks, avoidance from what its count
 * counts (applications, procs or casts, "1.1% avoided"), and then, on a line of its own, its uptime
 * on the boss, with its average stacks for one that stacks (Lacerate). A spell on the boss (Faerie
 * Fire) can't crit, so it gives only its share missed. On the Damage metric the line ends with the
 * average damage per landing: its damage over its hits, crits, glances and blocks, per tick for a
 * bleed's or a periodic effect's row, and per tick or missile for a cast that lands more than once
 * (`AbilityResult.landing`: Consecration, Arcane Missiles), whose crit and avoided shares name what
 * lands too ("tick crit · of ticks avoided"), on either metric.
 */
export function outcomeLines(a: AbilityResult, fights: number, damageMetric: boolean): OutcomeLines {
  const avoided = a.misses + a.dodges + a.parries
  const landed = a.hits + a.crits + a.glances + a.blocks
  const parts: string[] = []
  let uptime: string | null = null
  if (a.unit && fights > 0) parts.push(`${formatOne((a.unit === 'ticks' ? landed + avoided : (a.procs ?? a.casts)) / fights)} ${a.unit} a fight`)
  if (a.counts && fights > 0) parts.push(`${formatOne(a.casts / fights)} ${COUNT_NOUN[a.counts]} a fight`)
  if (a.damage === 0 && a.mana && fights > 0) parts.push(`from ${formatInt(a.mana / fights)} mana a fight`)
  if (a.certain) {
    // Always lands, never crits: nothing to share out.
  } else if (a.bleed) {
    const ticks = a.hits + a.crits
    if (a.bleed.ticksCanCrit && ticks > 0) parts.push(`${formatPct((100 * a.crits) / ticks)} tick crit`)
    // Of what the count counts, which the line has just named.
    if (a.bleed.avoidable && a.casts > 0) parts.push(`${formatPct((100 * avoided) / a.casts)} avoided`)
    if (a.bleed.uptimePct !== null) {
      const stacks = a.bleed.averageStacks
      uptime = `${formatPct(a.bleed.uptimePct)} uptime on the boss${stacks !== undefined ? `, ${formatOne(stacks)} stacks on average` : ''}`
    }
  } else if (a.spell) {
    if (a.casts > 0) parts.push(`${formatPct((100 * a.misses) / a.casts)} missed`)
  } else {
    const attempts = landed + avoided
    if (attempts > 0) {
      // A cast that lands more than once (Consecration, Arcane Missiles) names what its shares are of,
      // since its count is casts (review finding PV-3).
      const of = a.landing ? { crit: `${a.landing} crit`, avoided: `of ${a.landing}s avoided` } : { crit: 'crit', avoided: 'avoided' }
      parts.push(`${formatPct((100 * a.crits) / attempts)} ${of.crit}`, `${formatPct((100 * avoided) / attempts)} ${of.avoided}`)
      if (a.glances > 0) parts.push(`${formatPct((100 * a.glances) / attempts)} glancing`)
    }
  }
  const per: NonNullable<OutcomeLines['average']>['per'] = a.landing ?? (a.bleed || a.unit === 'ticks' ? 'tick' : 'hit')
  const average = damageMetric && a.damage > 0 && landed > 0 ? { value: formatInt(a.damage / landed), per } : null
  return { parts, average, uptime }
}
