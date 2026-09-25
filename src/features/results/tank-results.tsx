// A tank's results beside TPS and DPS (docs/ux.md#results, decision D18): the damage the boss's
// swings cost you and how they landed, and, on the character sheet, the boss's table against
// your stats (docs/mechanics/combat-tables.md#8-boss--player-tanks, encounter.md §5).
import { useId } from 'react'
import { formatOne, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BossOutcomes, FightConfig, SpecId, TankResult } from '@/sim'
import { Delta } from './delta'
import { DIM_FILL } from './dim'
import { type Avoidance, type BlockBuffUp, BOSS_OUTCOMES, bossTableIntro, crushingState, crushingText, damageTakenText } from './tank-logic'

/**
 * Seven outcomes in two columns, filled down: miss, dodge, parry and block on the left, then
 * crit, crushing and normal hit, in the table's roll order for anyone reading them in turn.
 */
const OUTCOME_GRID = 'grid grid-flow-col grid-cols-2 grid-rows-4 gap-x-6 text-sm'

/**
 * Damage taken per second with its ± 95% CI and its change from the previous run (lower is
 * better), and what it counts. It comes first under the headline card, since it has no headline
 * of its own; how the swings landed follows the breakdown (`SwingOutcomes`).
 */
export function DamageTaken({
  tank,
  previous,
  fight,
  spec,
}: {
  tank: TankResult
  /** The previous run's damage taken per second, for the change. */
  previous: number | null
  /** The fight the result was run for, for the swing size; null if it can't be read. */
  fight: FightConfig | null
  /** The spec the result was run for: whose the debuffs it names are. */
  spec: SpecId
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h3 id={headingId} className="text-sm font-medium">
        Damage taken per second
      </h3>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatOne(tank.dtps.mean)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">± {formatOne(tank.dtps.ci95)}</span>
        <Delta value={tank.dtps.mean} previous={previous} lowerIsBetter className="text-sm" />
      </span>
      {/* The swing size is the Fight setting's; attack-power debuffs on the boss lower it in the fight. */}
      <p className="text-xs text-muted-foreground tabular-nums">{damageTakenText(tank.bossSwingsPerFight, fight?.boss ?? null, spec)}</p>
    </section>
  )
}

/**
 * How the boss's swings landed in the fights run, as shares with bars, in the table's roll order.
 * Its heading names the list, so the list itself carries no second name.
 */
export function SwingOutcomes({ tank }: { tank: TankResult }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-medium">
        How the boss’s swings landed
      </h3>
      <ul className={cn(OUTCOME_GRID, 'gap-y-2')}>
        {BOSS_OUTCOMES.map(([key, label]) => {
          const share = tank.outcomes[key]
          return (
            <li key={key} className="flex min-w-0 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">{formatPct(share)}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className={cn('block h-full rounded-full bg-primary', DIM_FILL)} style={{ width: `${Math.min(100, share)}%` }} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * The character sheet's view of the boss (docs/ux.md#results): its chances against your stats as
 * the fight starts, or with the block buff your rotation keeps up (`up`: Holy Shield), and whether
 * it can land crushing blows on you. `avoidance` is what the sheet above it shows you have, for the
 * lines that name it.
 */
export function BossTable({
  table,
  avoidance,
  fight,
  up = null,
  brief = false,
}: {
  table: BossOutcomes
  avoidance: readonly Avoidance[]
  fight: FightConfig | null
  up?: BlockBuffUp | null
  /** The wide panel's shorter line under the heading (`bossTableIntro`). */
  brief?: boolean
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h4 id={headingId} className="text-sm font-medium">
          Boss’s attack table
        </h4>
        <p className="text-xs text-muted-foreground">{bossTableIntro(fight?.bossLevel ?? null, avoidance, up, brief)}</p>
      </div>
      {/* In the wide panel its two columns are the sheet's first two, never stretched across a wider panel (DU2-4). */}
      <dl className={cn(OUTCOME_GRID, 'gap-y-1.5', brief && '@min-[38rem]/results:grid-cols-3 @min-[48rem]/results:grid-cols-4')}>
        {BOSS_OUTCOMES.map(([key, label]) => (
          <div key={key} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{formatPct(table[key])}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{crushingText(crushingState(table, fight), avoidance)}</p>
    </section>
  )
}
