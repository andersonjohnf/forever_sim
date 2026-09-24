import { ChevronRight, ChevronsDown, Loader2, Play, RotateCw, Square, TriangleAlert } from 'lucide-react'
import { Fragment, type ReactNode, useId, useRef } from 'react'
import { focusSection } from '@/app/section-focus'
import { type Section, useSetup } from '@/app/setup-store'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WowIcon } from '@/components/wow-icon'
import { CHOICE_ITEM } from '@/lib/choice'
import { formatInt, formatOne, formatPct, formatSeconds } from '@/lib/format'
import { casterSheetRows, rangedSheetRows } from './caster-sheet'
import { cn } from '@/lib/utils'
import type { SimConfig, SimResult, Summary } from '@/sim'
import { AssumptionList } from './assumption-list'
import { Delta } from './delta'
import { ManaPerFight } from './mana-results'
import { DIM_FILL, DIM_ICON, DIM_ROOT } from './dim'
import { breakdownRows, isSetupError, neverHit } from './run-logic'
import { avoidanceOf, CRIT_REDUCTION_LABEL, formatCritReduction } from './tank-logic'
import { BossTable, DamageTaken, SwingOutcomes } from './tank-results'
import { useScrollEdges } from './use-scroll-edges'
import { type Metric, METRIC_LABEL, metricsFor, useBreakdownMetric, useRunState } from './use-run-state'

/** `iconClassName` lets the phone bar drop the icon where the headline needs the room. */
export function SimulateButton({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const { config, sim, result, stale, running } = useRunState()
  if (running) {
    return (
      <Button variant="outline" className={cn('h-11', className)} onClick={sim.cancel}>
        <Square className={iconClassName} /> Cancel
      </Button>
    )
  }
  const again = result !== null && !stale
  return (
    <Button className={cn('h-11', className)} onClick={() => sim.run(config)}>
      {again ? <RotateCw className={iconClassName} /> : <Play className={iconClassName} />}
      {again ? 'Run again' : 'Simulate'}
    </Button>
  )
}

/** "Simulating… 45%", with a bar in the panel (docs/ux.md#states "Running"). */
function RunProgress({ pct, compact = false }: { pct: number | null; compact?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="flex items-center gap-2 text-sm text-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
        Simulating…
        {pct !== null && <span className="tabular-nums">{Math.round(pct)}%</span>}
      </span>
      {!compact && <Progress value={pct ?? 0} aria-label="Simulation progress" />}
    </div>
  )
}

/** The small running indicator beside a kept result's label in the phone bar. */
function RunningBadge({ pct }: { pct: number | null }) {
  return (
    <span className="flex items-center gap-1 font-medium text-foreground tabular-nums">
      <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
      <span className="sr-only">Simulating</span>
      {pct !== null ? `${Math.round(pct)}%` : '…'}
    </span>
  )
}

export function Headline({ compact = false }: { compact?: boolean }) {
  const { result, previous, stale, running, rerunning, progressPct, dimmed, config } = useRunState()
  // A result shows the metrics of the spec it was run for; only this spec's result is shown.
  const metrics = metricsFor(result?.spec ?? config.spec)
  if (running && !result) return <RunProgress pct={progressPct} compact={compact} />
  const rows: MetricRow[] = metrics.map((key) => ({
    key,
    label: METRIC_LABEL[key],
    value: result ? result[key] : null,
    previous: previous ? previous[key].mean : null,
  }))
  // In the panel the progress sits above the headline; the phone bar has room only for a badge.
  // A run that applies the change isn't marked "Setup changed": its progress says it's coming.
  const badge = running && compact ? <RunningBadge pct={progressPct} /> : stale && !rerunning ? <StaleBadge /> : null
  const headline =
    rows.length === 1 ? (
      <SingleHeadline row={rows[0]} compact={compact} dimmed={dimmed} badge={badge} />
    ) : (
      <TankHeadline rows={rows} compact={compact} dimmed={dimmed} badge={badge} />
    )
  if (compact || !running) return headline
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <RunProgress pct={progressPct} />
      {headline}
    </div>
  )
}

interface MetricRow {
  key: Metric
  label: string
  value: Summary | null
  /** The same metric's mean in the previous result, for the ▲/▼ change. */
  previous: number | null
}

/** One headline metric: its label (and any badge) above its value, grouped for assistive tech. */
function MetricBlock({ row, badge, className, children }: { row: MetricRow; badge: ReactNode; className?: string; children: ReactNode }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className={cn('flex min-w-0 flex-col', className)}>
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span id={labelId}>{row.label}</span>
        {badge}
      </span>
      {children}
    </div>
  )
}

/**
 * The phone bar's headline is the value and the change's arrow, at every width: the Details
 * button sits beside it, and the results sheet shows the ± and the change's amount
 * (docs/ux.md#layout). One rule, so nothing depends on how wide the phone is.
 */

/** DPS specs: one metric, its ± and change on the value's line. */
function SingleHeadline({ row, compact, dimmed, badge }: { row: MetricRow; compact: boolean; dimmed: boolean; badge: ReactNode }) {
  const size = compact ? 'text-xl' : 'text-4xl'
  if (!row.value) {
    return (
      <MetricBlock row={row} badge={null}>
        <span className={cn('font-semibold tracking-tight text-muted-foreground', size)}>—</span>
      </MetricBlock>
    )
  }
  return (
    <MetricBlock row={row} badge={badge}>
      <span data-dimmed={dimmed} className={cn('flex flex-wrap items-baseline gap-x-2', DIM_ROOT)}>
        <span className={cn('font-semibold tracking-tight tabular-nums', size)}>{formatOne(row.value.mean)}</span>
        {!compact && <span className="text-sm text-muted-foreground tabular-nums">± {formatOne(row.value.ci95)}</span>}
        <Delta value={row.value.mean} previous={row.previous} className="text-sm" amountClassName={compact ? 'hidden' : undefined} />
      </span>
    </MetricBlock>
  )
}

/**
 * Tanks: TPS and DPS as equals (decision D18). Stacked rows fit the phone's bottom bar (beside the
 * Details button it keeps only the values and the changes' arrows; the results sheet shows the ±
 * and the amounts); the panel sets them side by side.
 */
function TankHeadline({ rows, compact, dimmed, badge }: { rows: MetricRow[]; compact: boolean; dimmed: boolean; badge: ReactNode }) {
  if (compact) {
    return (
      <div className="flex min-w-0 flex-col">
        {badge && <span className="text-xs font-medium">{badge}</span>}
        <div
          data-dimmed={dimmed}
          className={cn('grid min-w-0 grid-cols-[auto_auto_1fr] items-baseline gap-x-1.5', DIM_ROOT)}
        >
          {rows.map((row) => (
            <Fragment key={row.key}>
              <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
              <span className={cn('text-lg leading-6 font-semibold tracking-tight tabular-nums', !row.value && 'text-muted-foreground')}>
                {row.value ? formatOne(row.value.mean) : '—'}
              </span>
              <span className="text-xs">{row.value && <Delta value={row.value.mean} previous={row.previous} amountClassName="hidden" />}</span>
            </Fragment>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="grid min-w-0 grid-cols-2 gap-x-4">
      {rows.map((row, i) => (
        <MetricBlock key={row.key} row={row} badge={i === 0 ? badge : null}>
          <span data-dimmed={dimmed} className={cn('flex flex-col', DIM_ROOT)}>
            <span className={cn('text-4xl font-semibold tracking-tight tabular-nums', !row.value && 'text-muted-foreground')}>
              {row.value ? formatOne(row.value.mean) : '—'}
            </span>
            {row.value && (
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="text-muted-foreground tabular-nums">± {formatOne(row.value.ci95)}</span>
                <Delta value={row.value.mean} previous={row.previous} />
              </span>
            )}
          </span>
        </MetricBlock>
      ))}
    </div>
  )
}

/** The stale marker beside the headline's label. It isn't dimmed, and meets AA in both themes. */
function StaleBadge() {
  return <span className="rounded bg-amber-100 px-1.5 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300">Setup changed</span>
}

/** What a failed run says, and the way forward (docs/ux.md#states "Error"). */
function RunError({ message }: { message: string }) {
  // The engine's refusals name what to change; only other failures get the retry advice.
  const setup = isSetupError(message)
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-destructive/50 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-destructive">{setup ? 'This setup can’t be simulated' : 'The simulation failed'}</p>
        <p>{message}</p>
        {!setup && (
          <p className="text-muted-foreground">Try again. If it keeps failing, reset this spec to its defaults from the More menu (⋯).</p>
        )}
      </div>
    </div>
  )
}

/** The run's size, length and rules, and how long it took. */
function RunSummary({ result, runConfig }: { result: SimResult; runConfig: SimConfig | null }) {
  // The length you set, not the average of the varied fights (Fight → Advanced → Length variation).
  const seconds = runConfig?.fight.durationSec ?? Math.round(result.durationSec)
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      {formatInt(result.iterations)} fights of {formatInt(seconds)} s · {result.profile === 'forever' ? 'Forever' : 'Classic Era'} rules · ran in{' '}
      {result.elapsedMs < 50 ? 'under 0.1 s' : formatSeconds(result.elapsedMs)}
    </p>
  )
}

/**
 * Closes the phone's results sheet when a link in it opens a setup tab. `then` moves focus into
 * that tab, and runs once the sheet has closed, in place of handing focus back to "Show results and details".
 */
type Navigate = (then: () => void) => void

/**
 * A result with nothing to show (docs/ux.md#states): no main-hand weapon, or nothing that deals
 * damage. It says what to do next and takes you there, focus included: the button goes away once
 * its tab is open beside the desktop panel, so focus moves into the tab (the main hand in Gear).
 */
function NoDamage({ result, variant, onNavigate }: { result: SimResult; variant: 'panel' | 'sheet'; onNavigate?: Navigate }) {
  const section = useSetup((s) => s.section)
  const setSection = useSetup((s) => s.setSection)
  // A warrior's Protection attacks that need no weapon (noWeaponSomeUsed) and a paladin's spells
  // (noWeaponSpells) still deal damage without one (docs/ux.md#states).
  const noWeapon = result.assumptions.some((a) => a.id === 'noWeapon' || a.id === 'noWeaponSomeUsed' || a.id === 'noWeaponSpells')
  if (!noWeapon && result.abilities.length > 0) return null
  const spellsOnly = result.abilities.length > 0 && result.assumptions.some((a) => a.id === 'noWeaponSpells')
  // Beside the desktop panel, the tab you're on is already in view; the phone's sheet covers it.
  const offer = (target: Section) => variant === 'sheet' || section !== target
  const open = (target: Section) => {
    setSection(target)
    window.scrollTo({ top: 0 })
    const focus = () => focusSection(target)
    if (onNavigate) onNavigate(focus)
    else requestAnimationFrame(focus)
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 text-sm">
      <p className="font-medium">{noWeapon ? 'No main-hand weapon' : 'Nothing deals damage'}</p>
      <p className="text-muted-foreground">
        {noWeapon
          ? spellsOnly
            ? 'Only your spells were simulated: unarmed attacks aren’t. Add a weapon in Gear, then simulate again.'
            : 'Unarmed attacks aren’t simulated. Add a weapon in Gear, then simulate again.'
          : 'Nothing in this setup deals damage. Check your weapons in Gear and your abilities in Rotation.'}
      </p>
      {(offer('gear') || (!noWeapon && offer('rotation'))) && (
        <div className="flex flex-wrap gap-2">
          {offer('gear') && (
            <Button variant="outline" className="h-11" onClick={() => open('gear')}>
              Open Gear
            </Button>
          )}
          {!noWeapon && offer('rotation') && (
            <Button variant="outline" className="h-11" onClick={() => open('rotation')}>
              Open Rotation
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The results (docs/ux.md#results). `panel` is the desktop column: it never grows past the
 * viewport, and the details under the headline scroll inside it. `sheet` is the phone's results
 * sheet, which scrolls as a whole; `onNavigate` closes it when a link opens a setup tab.
 */
export function ResultsPanel({ variant = 'panel', onNavigate }: { variant?: 'panel' | 'sheet'; onNavigate?: Navigate }) {
  const { result, previous, runConfig, stale, running, error, dimmed, metricLabel } = useRunState()
  const empty = result !== null && result.abilities.length === 0
  const body = result && (
    <div data-dimmed={dimmed} className={cn('flex flex-col gap-5', DIM_ROOT)}>
      {/* Tanks: what the boss's swings cost you comes first, since it has no headline of its own. How
          they landed follows the breakdown, so the breakdown stays near the top (docs/ux.md#results). */}
      {result.tank && <DamageTaken tank={result.tank} previous={previous?.tank?.dtps.mean ?? null} fight={runConfig?.fight ?? null} spec={result.spec} />}
      {!empty && <Breakdown result={result} />}
      {result.tank && <SwingOutcomes tank={result.tank} />}
      {result.mana && <ManaPerFight mana={result.mana} />}
      {result.cooldowns.length > 0 && (
        <Details title="Cooldowns and buffs">
          <Cooldowns result={result} runConfig={runConfig} />
        </Details>
      )}
      <Details title="Character sheet">
        <CharacterSheet result={result} runConfig={runConfig} />
      </Details>
      {result.assumptions.length > 0 && (
        <Details title={`Assumptions (${result.assumptions.length})`}>
          <AssumptionList result={result} />
        </Details>
      )}
    </div>
  )

  return (
    // The desktop panel sticks 104 px from the top (src/App.tsx: top-20 plus pt-6), so it stops
    // 24 px above the viewport's bottom edge.
    <div className={cn('flex flex-col gap-5', variant === 'panel' && 'max-h-[calc(100svh-8rem)]')}>
      <div className="flex shrink-0 flex-col gap-4 rounded-xl border p-4">
        <Headline />
        {result && <RunSummary result={result} runConfig={runConfig} />}
        {error !== null && <RunError message={error} />}
        {result && !running && <NoDamage result={result} variant={variant} onNavigate={onNavigate} />}
        {!result && !running && error === null && (
          <p className="text-sm text-muted-foreground">Your setup is ready. Simulate to see your {metricLabel}.</p>
        )}
        {stale && !running && error === null && (
          <p className="text-sm text-muted-foreground">Your setup changed since this run. Simulate to update it.</p>
        )}
        <SimulateButton className="w-full" />
      </div>
      {body && (variant === 'panel' ? <ScrollBody>{body}</ScrollBody> : body)}
    </div>
  )
}

/**
 * The desktop panel's details, scrolling inside the panel. Fades at the top and bottom (and a
 * chevron) show there's more; it takes keyboard focus while it overflows so arrow keys scroll it.
 */
function ScrollBody({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const { above, below } = useScrollEdges(scroller, content)
  return (
    <div className="relative flex min-h-40 flex-1 flex-col">
      <div
        ref={scroller}
        role="region"
        aria-label="Result details"
        tabIndex={above || below ? 0 : undefined}
        className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg px-1 py-1 outline-none [scrollbar-width:thin] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div ref={content}>{children}</div>
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-6 bg-linear-to-b from-background to-transparent transition-opacity motion-reduce:transition-none',
          above ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-linear-to-t from-background via-background/80 to-transparent pb-0.5 transition-opacity motion-reduce:transition-none',
          below ? 'opacity-100' : 'opacity-0',
        )}
      >
        <ChevronsDown className="size-4 text-muted-foreground" />
      </div>
    </div>
  )
}

/**
 * Per-ability shares of the headline metric. Tanks switch between threat (the default) and damage
 * (decision D18); rows that add nothing to the metric shown are left out.
 */
function Breakdown({ result }: { result: SimResult }) {
  const tank = metricsFor(result.spec).length > 1
  const chosen = useBreakdownMetric((s) => s.metric)
  const setMetric = useBreakdownMetric((s) => s.setMetric)
  const headingId = useId()
  const metric: Metric = tank ? chosen : 'dps'
  const value = (a: SimResult['abilities'][number]) => (metric === 'tps' ? a.threat : a.damage)
  const rows = breakdownRows(result.abilities, value)
  const total = rows.reduce((n, a) => n + value(a), 0) || 1
  const perSecond = (n: number) => n / result.iterations / result.durationSec
  const noun = metric === 'tps' ? 'Threat' : 'Damage'
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-medium">
          {noun} by ability
        </h3>
        {tank && (
          <ToggleGroup
            type="single"
            variant="outline"
            value={metric}
            onValueChange={(v) => v && setMetric(v as Metric)}
            aria-label="Break down by"
          >
            <ToggleGroupItem value="tps" className={cn('h-11 px-3', CHOICE_ITEM)}>
              Threat
            </ToggleGroupItem>
            <ToggleGroupItem value="dps" className={cn('h-11 px-3', CHOICE_ITEM)}>
              Damage
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing in this setup {metric === 'tps' ? 'makes threat' : 'deals damage'}. Check your weapons in Gear and your abilities in
          Rotation.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((a) => {
          const share = (100 * value(a)) / total
          return (
            <li key={a.id} className="flex items-center gap-3">
              <WowIcon icon={a.icon} size="sm" className={DIM_ICON} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  {/* docs/mechanics/ranged-and-pets.md §10: a pet's rows name it, "Auto attack · Cat". */}
                  <span className="truncate">{a.pet ? `${a.name} · ${a.pet}` : a.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatOne(perSecond(value(a)))} <span className="text-muted-foreground">· {formatPct(share)}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className={cn('h-full rounded-full bg-primary', DIM_FILL)} style={{ width: `${share}%` }} />
                </div>
                <Outcomes ability={a} fights={result.iterations} />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** What a row's count a fight reads as (`AbilityResult.counts`). */
const COUNT_NOUN = { blocks: 'blocks', extraAttacks: 'extra attacks' } as const

/**
 * A breakdown row's outcomes (docs/ux.md#results): crit, avoided and glancing shares of its
 * attempts, left out for a row that can neither crit nor be avoided (Holy Shield's damage). A row
 * that counts something gives it per fight (Holy Shield's blocks, Reckoning's extra attacks), and a
 * row whose threat is mana it gave you, that mana (Shield Specialization). A bleed's row counts
 * applications and ticks apart: crits from its ticks, avoidance from its applications, and then, on
 * a line of its own, its uptime on the boss, with its average stacks for one that stacks
 * (Lacerate). One that can do neither (Deep Wounds) gives its ticks per fight. A spell on the boss
 * (Faerie Fire) can't crit, so it gives only its share missed.
 */
function Outcomes({ ability: a, fights }: { ability: SimResult['abilities'][number]; fights: number }) {
  const avoided = a.misses + a.dodges + a.parries
  const parts: string[] = []
  let uptime: string | null = null
  if (a.counts && fights > 0) parts.push(`${formatOne(a.casts / fights)} ${COUNT_NOUN[a.counts]} a fight`)
  if (a.damage === 0 && a.mana && fights > 0) parts.push(`from ${formatInt(a.mana / fights)} mana a fight`)
  if (a.certain) {
    // Always lands, never crits: nothing to share out.
  } else if (a.bleed) {
    const ticks = a.hits + a.crits
    if (a.bleed.ticksCanCrit && ticks > 0) parts.push(`${formatPct((100 * a.crits) / ticks)} tick crit`)
    if (a.bleed.avoidable && a.casts > 0) parts.push(`${formatPct((100 * avoided) / a.casts)} of applications avoided`)
    if (parts.length === 0 && fights > 0) parts.push(`${formatOne(ticks / fights)} ticks per fight`)
    if (a.bleed.uptimePct !== null) {
      const stacks = a.bleed.averageStacks
      uptime = `${formatPct(a.bleed.uptimePct)} uptime on the boss${stacks !== undefined ? `, ${formatOne(stacks)} stacks on average` : ''}`
    }
  } else if (a.spell) {
    if (a.casts === 0) return null
    parts.push(`${formatPct((100 * a.misses) / a.casts)} missed`)
  } else {
    const attempts = a.hits + a.crits + a.glances + a.blocks + avoided
    if (attempts > 0) {
      parts.push(`${formatPct((100 * a.crits) / attempts)} crit`, `${formatPct((100 * avoided) / attempts)} avoided`)
      if (a.glances > 0) parts.push(`${formatPct((100 * a.glances) / attempts)} glancing`)
    }
  }
  if (parts.length === 0 && uptime === null) return null
  return (
    <span className="flex flex-col text-xs text-muted-foreground tabular-nums">
      {parts.length > 0 && <span>{parts.join(' · ')}</span>}
      {uptime && <span>{uptime}</span>}
    </span>
  )
}

/** What a cast before the pull is for, when its buff is gone by the pull (`beforePull`). */
const BEFORE_PULL: Record<string, string> = { sealOfTheCrusader: 'Before the pull, for its judgement' }

/**
 * Cooldowns and buffs (docs/ux.md#results): each cast and buff on you, with the share of the fight
 * it was up and its casts per fight. A dash marks what doesn't apply: no buff (Bloodrage), nothing
 * to cast (Flurry), a buff that needs you to be hit when the run took no damage (Enrage), or one
 * cast before the pull and gone by it (Seal of the Crusader), which says so.
 */
function Cooldowns({ result, runConfig }: { result: SimResult; runConfig: SimConfig | null }) {
  const none = (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">none</span>
    </>
  )
  return (
    <table className="w-full text-sm">
      <caption className="pb-2 text-left text-xs text-muted-foreground">
        Uptime is the share of the fight it was up; casts are per fight, pre-pull ones included.
      </caption>
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="pb-2 text-left font-medium">
            <span className="sr-only">Cooldown or buff</span>
          </th>
          <th scope="col" className="pb-2 pl-3 text-right font-medium">
            Uptime
          </th>
          <th scope="col" className="pb-2 pl-3 text-right font-medium">
            <span aria-hidden>Casts</span>
            <span className="sr-only">Casts per fight</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {result.cooldowns.map((c) => {
          const unhit = neverHit(c, runConfig)
          return (
            <tr key={c.id}>
              <th scope="row" className="py-1 text-left align-top font-normal">
                <span className="flex min-w-0 items-start gap-2">
                  <WowIcon icon={c.icon} size="xs" className={DIM_ICON} />
                  <span className="flex min-w-0 flex-col">
                    <span>{c.name}</span>
                    {unhit && <span className="text-xs text-muted-foreground">Needs damage taken (Fight → Advanced)</span>}
                    {/* A proc the next ability it makes free spends is up only moments: how often it came says what it did.
                        "It makes free": a Balance druid's Clearcasting waits for a Starfire, Moonfire or Insect Swarm, not Wrath. */}
                    {c.procsPerFight !== undefined && (
                      <span className="text-xs text-muted-foreground">{formatOne(c.procsPerFight)} a fight, each spent by the next ability it makes free</span>
                    )}
                    {c.beforePull && <span className="text-xs text-muted-foreground">{BEFORE_PULL[c.id] ?? 'Before the pull'}</span>}
                  </span>
                </span>
              </th>
              <td className="py-1 pl-3 text-right align-top tabular-nums">{c.uptimePct === null || unhit || c.beforePull ? none : formatPct(c.uptimePct)}</td>
              <td className="py-1 pl-3 text-right align-top tabular-nums">{c.castsPerFight === null ? none : formatOne(c.castsPerFight)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Base values that only the defensive rows (Dodge, Parry, Block) show. */
const AVOIDANCE_BASES = new Set(['base dodge', 'base parry', 'base block'])

function CharacterSheet({ result, runConfig }: { result: SimResult; runConfig: SimConfig | null }) {
  const s = result.sheet
  const unknown = s.unknown ?? []
  const dualWield = s.weaponSkill.offHand !== null && s.weaponSkill.offHand > 0
  // A tank's sheet has the boss's table against it (docs/ux.md#results).
  const bossTable = s.bossTable ?? null
  // A ranged spec's gear defense (Dal'Rend's Tribal Guardian's +7) doesn't make it a tank's sheet (docs/classes/hunter.md#9-implementation-notes).
  const defensive = bossTable !== null || (!s.ranged && (s.defense > 300 || s.blockValue > 0))
  // Decision D24: the unmeasured base values in the numbers shown, the ones the assumptions name
  // (a tank's avoidance placeholders only with their rows).
  const placeholders = (s.placeholders ?? []).filter((p) => defensive || !AVOIDANCE_BASES.has(p))
  // A paladin's spell stats and mana (docs/ux.md#results): two columns of counterparts, melee on the
  // left and spells on the right, row by row (Attack power | Spell damage, Crit | Spell crit, …).
  const spell = s.spell
  const weaponSkill = dualWield ? `${s.weaponSkill.mainHand} main hand / ${s.weaponSkill.offHand} off hand` : String(s.weaponSkill.mainHand)
  // A caster's sheet (docs/mechanics/spells.md §12): spell damage by school, crit, hit, casting speed, mana.
  const casterRows = casterSheetRows(s)
  // A ranged spec's sheet (docs/classes/hunter.md#9-implementation-notes): its ranged weapon's numbers, then its mana.
  const rangedRows = rangedSheetRows(s)
  const rows: [string, string][] = rangedRows
    ? rangedRows
    : casterRows
    ? casterRows
    : spell
    ? [
        ['Attack power', formatInt(s.attackPower)],
        // Holy: every paladin spell is (Champion of the Light's share of Intellect included).
        ['Spell damage', formatInt(spell.holyDamage)],
        ['Crit', formatPct(s.critPct)],
        ['Spell crit', formatPct(spell.critPct)],
        ['Hit', formatPct(s.hitPct)],
        ['Spell hit', formatPct(spell.hitPct)],
        ['Weapon skill', weaponSkill],
        ['Expertise', formatInt(s.expertise)],
        ['Strength', formatInt(s.strength)],
        ['Agility', formatInt(s.agility)],
        ['Stamina', formatInt(s.stamina)],
        ['Intellect', formatInt(s.intellect)],
        ['Health', formatInt(s.health)],
        ['Mana', formatInt(s.mana ?? 0)],
        ['Spirit', formatInt(s.spirit)],
        ['Mana per 5 s', formatInt(spell.mp5)],
        ['Haste', formatPct(s.hastePct)],
      ]
    : [
        ['Attack power', formatInt(s.attackPower)],
        ['Crit', formatPct(s.critPct)],
        ['Hit', formatPct(s.hitPct)],
        ['Haste', formatPct(s.hastePct)],
        ['Weapon skill', weaponSkill],
        ['Expertise', formatInt(s.expertise)],
        ['Strength', formatInt(s.strength)],
        ['Agility', formatInt(s.agility)],
        ['Stamina', formatInt(s.stamina)],
        ['Health', formatInt(s.health)],
      ]
  rows.push(
    ['Armor', formatInt(s.armor)],
    ...(defensive
      ? ([
          ['Defense', formatInt(s.defense)],
          ...(bossTable ? ([[CRIT_REDUCTION_LABEL, formatCritReduction(s.critReductionPct)]] as [string, string][]) : []),
          ['Dodge', formatPct(s.dodgePct)],
          // A druid can neither parry nor block: no rows for them (BU15).
          ...(s.canParry === false ? [] : ([['Parry', formatPct(s.parryPct)]] as [string, string][])),
          ...(s.canBlock === false
            ? []
            : ([
                ['Block', formatPct(s.blockPct)],
                ['Block value', formatInt(s.blockValue)],
              ] as [string, string][])),
        ] as [string, string][])
      : []),
  )
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => {
          // Both hands' weapon skills, and crit reduction's longer label, need the row to themselves at the panel's width.
          const wide = (label === 'Weapon skill' && dualWield) || label === CRIT_REDUCTION_LABEL
          return (
            <div key={label} className={cn('flex justify-between gap-2', wide && 'col-span-2')}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right tabular-nums">{value}</dd>
            </div>
          )
        })}
      </dl>
      {bossTable && (
        <BossTable
          // With the block buff the rotation keeps up (Holy Shield), the table as it is most of the fight.
          table={s.bossTableUp?.table ?? bossTable}
          avoidance={avoidanceOf(s)}
          fight={runConfig?.fight ?? null}
          up={
            s.bossTableUp
              ? {
                  name: s.bossTableUp.name,
                  blockPct: s.bossTableUp.blockPct,
                  uptimePct: result.cooldowns.find((c) => c.id === s.bossTableUp!.auraId)?.uptimePct ?? null,
                }
              : null
          }
        />
      )}
      {unknown.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not known for Forever yet, so left out: {unknown.join(', ')}.
        </p>
      )}
      {placeholders.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Classic-based values until they’re measured: {placeholders.join(', ')}.
        </p>
      )}
    </div>
  )
}

function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible className="rounded-xl border">
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2 px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-4 py-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
