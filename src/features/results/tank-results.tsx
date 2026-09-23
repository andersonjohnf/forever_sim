// A tank's results beside TPS and DPS (docs/ux.md#results, decision D18): the damage the boss's
// swings cost you and how they landed, and, on the character sheet, the boss's table against
// your stats (docs/mechanics/combat-tables.md#8-boss--player-tanks, encounter.md §5).
import { useId } from 'react'
import { formatOne, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BossOutcomes, FightConfig, TankResult } from '@/sim'
import { Delta } from './delta'
import { DIM_FILL } from './dim'
import { BOSS_OUTCOMES, crushingState, crushingText, swingDamageText } from './tank-logic'

/**
 * Seven outcomes in two columns, filled down: miss, dodge, parry and block on the left, then
 * crit, crushing and hit, in the table's roll order for anyone reading them in turn.
 */
const OUTCOME_GRID = 'grid grid-flow-col grid-cols-2 grid-rows-4 gap-x-6 text-sm'

/**
 * Damage taken per second with its ± 95% CI and its change from the previous run (lower is
 * better), then how the boss's swings landed in the fights run, as shares with bars.
 */
export function DamageTaken({
  tank,
  previous,
  fight,
}: {
  tank: TankResult
  /** The previous run's damage taken per second, for the change. */
  previous: number | null
  /** The fight the result was run for, for the swing size; null if it can't be read. */
  fight: FightConfig | null
}) {
  const headingId = useId()
  const listId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-sm font-medium">
          Damage taken per second
        </h3>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatOne(tank.dtps.mean)}</span>
          <span className="text-sm text-muted-foreground tabular-nums">± {formatOne(tank.dtps.ci95)}</span>
          <Delta value={tank.dtps.mean} previous={previous} lowerIsBetter className="text-sm" />
        </span>
        {/* The swing size is the Fight setting's; attack-power debuffs on the boss lower it in the fight. */}
        <p className="text-xs text-muted-foreground tabular-nums">
          After your armor, block and other mitigation. The boss swung {formatOne(tank.bossSwingsPerFight)} times a fight
          {fight ? `, set to hit for ${swingDamageText(fight.boss)} before armor (Fight → Advanced)` : ''}.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p id={listId} className="text-xs font-medium text-muted-foreground">
          How the boss’s swings landed
        </p>
        <ul aria-labelledby={listId} className={cn(OUTCOME_GRID, 'gap-y-2')}>
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
      </div>
    </section>
  )
}

/**
 * The character sheet's view of the boss (docs/ux.md#results): its chances against your stats as
 * the fight starts, and whether it can land crushing blows on you.
 */
export function BossTable({ table, fight }: { table: BossOutcomes; fight: FightConfig | null }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h4 id={headingId} className="text-sm font-medium">
          Boss’s attack table
        </h4>
        <p className="text-xs text-muted-foreground">Its chances on each swing at you as the fight starts, from the stats above.</p>
      </div>
      <dl className={cn(OUTCOME_GRID, 'gap-y-1.5')}>
        {BOSS_OUTCOMES.map(([key, label]) => (
          <div key={key} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{formatPct(table[key])}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{crushingText(crushingState(table, fight))}</p>
    </section>
  )
}
