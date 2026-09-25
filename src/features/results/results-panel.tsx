import { ChevronRight, ChevronsDown, Loader2, Play, RefreshCw, RotateCw, Square, TriangleAlert } from 'lucide-react'
import { Fragment, type PointerEvent, type ReactNode, type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react'
import { focusSection } from '@/app/section-focus'
import { type Section, useSetup } from '@/app/setup-store'
import { CLASS_TEXT, useSpecMeta } from '@/app/specs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WowIcon } from '@/components/wow-icon'
import { CHOICE_ITEM } from '@/lib/choice'
import { formatInt, formatOne, formatPct, formatSeconds } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type CharacterSheet as CharacterSheetData, computeSheet, type FightConfig, WORKER_START_MESSAGE, type SimConfig, type SimResult, type Summary } from '@/sim'
import { AssumptionList } from './assumption-list'
import { Delta } from './delta'
import { ManaPerFight } from './mana-results'
import { outcomeLines } from './outcomes'
import { DIM_FILL, DIM_ICON, DIM_ROOT } from './dim'
import { breakdownRows, carriesItsOwnAdvice, isSetupError, neverHit } from './run-logic'
import { isDefensive, type SheetRow, sheetGroups, sheetRows, WEAPON_SKILL_LABEL, weaponSkillValue } from './sheet-groups'
import { avoidanceOf, CRIT_REDUCTION_LABEL } from './tank-logic'
import { BossTable, DamageTaken, SwingOutcomes } from './tank-results'
import { simulateShortcutLabel } from './shortcut-label'
import { useScrollEdges } from './use-scroll-edges'
import { type Metric, METRIC_LABEL, metricsFor, useBreakdownMetric, useRunState } from './use-run-state'

/** `iconClassName` lets the phone bar drop the icon where the headline needs the room. */
export function SimulateButton({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const { config, sim, result, stale, running } = useRunState()
  const [tip, setTip] = useState(false)
  const hovered = useRef(false)
  // Ctrl+Enter or ⌘+Enter runs it from anywhere (docs/ux.md#accessibility, D34): named here for
  // assistive tech, and in the tooltip for a mouse, with only this platform's key. The tooltip opens
  // on a mouse or pen hovering, never on keyboard focus, where it stayed up over the pane's first
  // line after a run (review finding DA-5). Cancel tracks the pointer too, as it takes the button's place.
  const hover = (on: boolean) => (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    hovered.current = on
    if (!on) setTip(false)
  }
  if (running) {
    return (
      <Button
        variant="outline"
        data-simulate
        className={cn('h-11', className)}
        onClick={sim.cancel}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
      >
        <Square className={iconClassName} /> Cancel
      </Button>
    )
  }
  const again = result !== null && !stale
  const label = again ? 'Run again' : 'Simulate'
  return (
    <Tooltip open={tip} onOpenChange={(open) => setTip(open && hovered.current)}>
      <TooltipTrigger asChild>
        <Button
          data-simulate
          className={cn('h-11', className)}
          onClick={() => sim.run(config)}
          onPointerEnter={hover(true)}
          onPointerLeave={hover(false)}
          aria-keyshortcuts={SIMULATE_SHORTCUTS}
        >
          {again ? <RotateCw className={iconClassName} /> : <Play className={iconClassName} />}
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} ({simulateShortcutLabel(typeof navigator === 'undefined' ? undefined : navigator)})
      </TooltipContent>
    </Tooltip>
  )
}

/** The Simulate button's keyboard shortcuts, as `aria-keyshortcuts` names them. */
export const SIMULATE_SHORTCUTS = 'Control+Enter Meta+Enter'

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

/** The headline values, under 1440 px: the panel's and the phone bar's (`compact`). */
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
  // The engine's refusals name what to change, a hung worker's message says to run it again, and
  // workers that couldn't start say to reload, with a button for it; only other failures get the
  // retry advice.
  const setup = isSetupError(message)
  const advice = !carriesItsOwnAdvice(message)
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-destructive/50 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-destructive">{setup ? 'This setup can’t be simulated' : 'The simulation failed'}</p>
        <p>{message}</p>
        {advice && (
          <p className="text-muted-foreground">Try again. If it keeps failing, reset this spec to its defaults from the More menu (⋯).</p>
        )}
        {/* Workers that couldn't start: most likely the site updated since the page loaded, and a
            reload fetches the new one (docs/ux.md#states "Error"). */}
        {message === WORKER_START_MESSAGE && (
          <Button variant="outline" className="mt-1 h-11 self-start" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden /> Reload page
          </Button>
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
      <span>
        {formatInt(result.iterations)} fights of {formatInt(seconds)} s
      </span>
      {' · '}
      <span>{result.profile === 'forever' ? 'Forever' : 'Classic Era'} rules</span>
      {' · '}
      <span>ran in {result.elapsedMs < 50 ? 'under 0.1 s' : formatSeconds(result.elapsedMs)}</span>
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
 *
 * `setup` makes it the wide layout's right panel (from 1440 px, D34; src/App.tsx passes it only
 * there): the character sheet, then that setup summary with Simulate and the headline, then the rest of the result in one column (`WidePanel`).
 */
export function ResultsPanel({ variant = 'panel', onNavigate, setup }: { variant?: 'panel' | 'sheet'; onNavigate?: Navigate; setup?: ReactNode }) {
  const { result, previous, runConfig, stale, running, error, dimmed, metricLabel } = useRunState()
  if (setup !== undefined && variant === 'panel') return <WidePanel setup={setup} />
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
        <Details id="cooldowns" title="Cooldowns and buffs">
          <Cooldowns result={result} runConfig={runConfig} />
        </Details>
      )}
      <Details id="sheet" title="Character sheet">
        <SheetStats sheet={result.sheet} fight={runConfig?.fight ?? null} uptimes={result.cooldowns} />
      </Details>
      {result.assumptions.length > 0 && (
        <Details id="assumptions" title={`Assumptions (${result.assumptions.length})`}>
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
        <div className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0">
            <Headline />
          </div>
          {result && (
            <div>
              <RunSummary result={result} runConfig={runConfig} />
            </div>
          )}
        </div>
        {error !== null && (
          <div>
            <RunError message={error} />
          </div>
        )}
        {result && !running && (
          <div className="empty:hidden">
            <NoDamage result={result} variant={variant} onNavigate={onNavigate} />
          </div>
        )}
        {!result && !running && error === null && <p className="text-sm text-muted-foreground">Your setup is ready. Simulate to see your {metricLabel}.</p>}
        {stale && !running && error === null && <p className="text-sm text-muted-foreground">Your setup changed since this run. Simulate to update it.</p>}
        <SimulateButton className="w-full" />
      </div>
      {body && (variant === 'panel' ? <ScrollBody>{body}</ScrollBody> : body)}
    </div>
  )
}

/**
 * The wide layout's status in Your setup's action row (src/app/setup-summary.tsx), beside its
 * Simulate (docs/ux.md#results), so the row always says where things stand: before a first run, what
 * a run would do; during one, its progress beside Cancel; after it, the result's headline, "DPS
 * 713.7 ± 1.8" large (a tank's TPS over its DPS), with the run's size small to its right ("2,250
 * runs, 0.2 s", user decision), marked "Setup changed" and dimmed once the setup has changed since;
 * or that the run didn't finish, whose message is under the card.
 */
export function WideRunStatus() {
  const { result, previous, runConfig, stale, running, error, metricLabel, progressPct } = useRunState()
  if (running) return <RunProgress pct={progressPct} />
  if (error !== null) return <p className="text-sm text-muted-foreground">This run didn’t finish. See why below.</p>
  if (!result) return <p className="text-sm text-muted-foreground">Your setup is ready. Simulate to see your {metricLabel}.</p>
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-1">
      <div data-dimmed={stale} className={cn('flex flex-col', DIM_ROOT)}>
        {metricsFor(result.spec).map((key) => (
          <RowMetric key={key} label={METRIC_LABEL[key]} value={result[key]} previous={previous ? previous[key].mean : null} />
        ))}
      </div>
      <div className="flex flex-col items-start gap-0.5 pb-1.5 text-xs">
        {stale && <StaleBadge />}
        <WideRunSummary result={result} runConfig={runConfig} />
      </div>
    </div>
  )
}

/**
 * The run's size and how long it took, short, beside the wide headline: "2,250 runs, 0.2 s". The
 * fight's length is in Your setup's Fight line; the rules are said only when they're Classic Era's.
 */
function WideRunSummary({ result }: { result: SimResult; runConfig: SimConfig | null }) {
  const took = result.elapsedMs < 50 ? 'under 0.1 s' : formatSeconds(result.elapsedMs)
  return (
    <p className="text-muted-foreground tabular-nums">
      {formatInt(result.iterations)} runs, {took}
      {result.profile !== 'forever' && ' · Classic Era rules'}
    </p>
  )
}

/**
 * One value of the action row's headline on a line: its label, the value, its ± and its change,
 * named by its label for assistive tech as the headline's are ("DPS").
 */
function RowMetric({ label, value, previous }: { label: string; value: Summary; previous: number | null }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span id={labelId} className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatOne(value.mean)}</span>
      <span className="text-sm text-muted-foreground tabular-nums">± {formatOne(value.ci95)}</span>
      <Delta value={value.mean} previous={previous} className="text-sm" />
    </div>
  )
}

/** The bottom fade's height (`h-12` in `WidePanel`): what it covers of the panel while there's more below. */
const FADE_PX = 48

/**
 * When a run starts, finishes or fails, the wide panel keeps Your setup's action row in view
 * (docs/ux.md#results "Scrolling"), since it holds the run's progress, the result's headline or the
 * failure, and on a failure the message under the card too. A row already in view stays where it is;
 * otherwise the panel scrolls (smoothly, unless reduced motion is asked for) just far enough, clear
 * of the bottom fade: up to the row when Ctrl+Enter ran it from deep in a long result, or down a
 * little when a result arrives under a tank's long sheet at 1440×900, the sheet's top giving way
 * first. Never on the first render, so a result waiting when the page opens leaves the sheet in view.
 */
function useRevealRunRow(scroller: RefObject<HTMLElement | null>, running: boolean, result: SimResult | null, error: string | null) {
  const last = useRef({ running, result, error })
  useEffect(() => {
    const changed = last.current.running !== running || last.current.result !== result || last.current.error !== error
    last.current = { running, result, error }
    const el = scroller.current
    const row = el?.querySelector('[data-setup-actions]')
    if (!changed || !el || !row) return
    const view = el.getBoundingClientRect()
    const top = row.getBoundingClientRect().top
    const bottom = (error !== null && !running ? el.querySelector('[role="alert"]') : null)?.getBoundingClientRect().bottom ?? row.getBoundingClientRect().bottom
    // The fade covers the panel's foot while anything is below what's revealed.
    const more = el.scrollHeight - (el.scrollTop + bottom - view.top) > 1
    const floor = view.bottom - (more ? FADE_PX : 0)
    // Up to the row, a little under the panel's top; or down until its end clears the fade, never
    // taking the row's own top out of view.
    const delta = top < view.top ? top - view.top - 8 : bottom > floor ? Math.min(bottom - floor, top - view.top) : 0
    if (Math.abs(delta) < 1) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollTop + delta, behavior: reduced ? 'auto' : 'smooth' })
  }, [scroller, running, result, error])
}

/**
 * The wide layout's right panel (from 1440 px, D34 as the user left it after the fixes;
 * docs/ux.md#results): the character sheet, always shown and live from the setup; Your setup under
 * it, whose action row holds Simulate and the result's headline (`WideRunStatus`); then, once run,
 * the rest of the result in one column. Nothing is pinned: it never runs past the viewport and
 * scrolls inside as one, with a fade at an edge that has more.
 */
function WidePanel({ setup }: { setup: ReactNode }) {
  const { config, result, previous, runConfig, running, error, dimmed } = useRunState()
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const sheetHeadingId = useId()
  const { above, below } = useScrollEdges(scroller, content)
  const sheetData = useMemo(() => computeSheet(config), [config])
  const empty = result !== null && result.abilities.length === 0
  // The headline and a run's progress are in Your setup's action row, so a first run shows nothing here yet.
  const shown = result !== null || error !== null
  useRevealRunRow(scroller, running, result, error)
  return (
    // The panel sticks 104 px from the top (src/App.tsx: top-20 plus pt-6), so it stops 24 px above
    // the viewport's bottom edge.
    <div className="relative flex max-h-[calc(100svh-8rem)] flex-col">
      <div
        ref={scroller}
        role="region"
        aria-label="Sheet, setup and result"
        tabIndex={above || below ? 0 : undefined}
        // Relative, so what's visually hidden inside (the links' "(opens in a new tab)") scrolls with
        // it rather than lengthening the page (results-assumptions-scroll.spec.ts).
        className="relative -mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg px-1 outline-none [scrollbar-width:thin] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* The 1 px top padding keeps the sheet card's ring inside the scroll area. */}
        <div ref={content} className="flex flex-col gap-2 pt-px">
          <section aria-labelledby={sheetHeadingId}>
            <Card size="sm" className="gap-2">
              <CardHeader className="flex items-center justify-between gap-3">
                {/* A section heading's size, as Your setup's, with no icon (D34, after the user's look at the fixes). */}
                <h3 id={sheetHeadingId} className="text-base font-semibold tracking-tight">
                  Character sheet
                </h3>
                <SpecLine />
              </CardHeader>
              <CardContent>
                <LiveSheet sheet={sheetData} />
              </CardContent>
            </Card>
          </section>
          {setup}
          {shown && (
            <div data-dimmed={dimmed} className={cn('flex flex-col [&>*:last-child]:border-b-0', DIM_ROOT)}>
              <WideSection>
                {error !== null && <RunError message={error} />}
                {result && !running && <NoDamage result={result} variant="panel" />}
              </WideSection>
              {result?.tank && (
                <WideSection>
                  <DamageTaken tank={result.tank} previous={previous?.tank?.dtps.mean ?? null} fight={runConfig?.fight ?? null} spec={result.spec} />
                </WideSection>
              )}
              {result && !empty && (
                <WideSection>
                  <Breakdown result={result} />
                </WideSection>
              )}
              {result?.tank && (
                <WideSection>
                  <SwingOutcomes tank={result.tank} />
                </WideSection>
              )}
              {result?.mana && (
                <WideSection>
                  <ManaPerFight mana={result.mana} />
                </WideSection>
              )}
              {result && result.cooldowns.length > 0 && (
                <Details id="cooldowns" title="Cooldowns and buffs" remember flat>
                  <Cooldowns result={result} runConfig={runConfig} />
                </Details>
              )}
              {result && result.assumptions.length > 0 && (
                <Details id="assumptions" title={`Assumptions (${result.assumptions.length})`} flat>
                  <AssumptionList result={result} />
                </Details>
              )}
            </div>
          )}
        </div>
      </div>
      <div
        aria-hidden
        data-fade-above
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

/** One part of the wide panel's result, divided from the next by a rule, with the same spacing each. */
function WideSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 border-b py-4 empty:hidden">{children}</div>
}

/**
 * The wide panel's character sheet: live from the setup (`sheet`, computed from the plan, not the
 * fights), so it shows before any run and follows every change. A block buff's uptime (Holy
 * Shield's, for the boss's table) is the latest run's while that run is of this setup.
 */
function LiveSheet({ sheet }: { sheet: CharacterSheetData | null }) {
  const { config, result, stale } = useRunState()
  if (!sheet) {
    return <p className="text-sm text-muted-foreground">This setup can’t be simulated, so it has no sheet. Simulate to see what to change.</p>
  }
  return <SheetStats sheet={sheet} fight={config.fight} uptimes={result && !stale ? result.cooldowns : []} grouped />
}

/** Whose sheet it is, "Fury Warrior", in the class's colour: the panel's one accent (docs/ux.md#visual-language). */
function SpecLine() {
  const meta = useSpecMeta()
  return (
    <span className={cn('truncate text-xs font-medium', CLASS_TEXT[meta.classId])}>
      {meta.name} {meta.className}
    </span>
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
        className="relative -mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg px-1 py-1 outline-none [scrollbar-width:thin] focus-visible:ring-3 focus-visible:ring-ring/50"
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
                <Outcomes ability={a} fights={result.iterations} damageMetric={metric === 'dps'} />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * A breakdown row's outcomes (docs/ux.md#results "Breakdown", `outcomeLines`): its count a fight and
 * shares, ending on the Damage metric with its average damage per landed hit, which a screen reader
 * hears in words; and a bleed's uptime on a line of its own.
 */
function Outcomes({ ability, fights, damageMetric }: { ability: SimResult['abilities'][number]; fights: number; damageMetric: boolean }) {
  const { parts, average, uptime } = outcomeLines(ability, fights, damageMetric)
  if (parts.length === 0 && average === null && uptime === null) return null
  return (
    <span data-outcomes className="flex flex-col text-xs text-muted-foreground tabular-nums">
      {(parts.length > 0 || average) && (
        <span>
          {/* It wraps only between parts, never inside one ("1,318 avg | hit"). */}
          {parts.map((p, i) => (
            <Fragment key={p}>
              {i > 0 && ' · '}
              <span className="whitespace-nowrap">{p}</span>
            </Fragment>
          ))}
          {average && (
            <>
              <span aria-hidden>
                {parts.length > 0 ? ' · ' : ''}
                <span className="whitespace-nowrap">
                  {average.value} avg {average.per}
                </span>
              </span>
              <span className="sr-only">
                {parts.length > 0 ? ', ' : ''}
                {average.value} damage a {average.per} on average
              </span>
            </>
          )}
        </span>
      )}
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

/**
 * The character sheet's stats (docs/ux.md#results): a result's, or in the wide panel the setup's own
 * (`LiveSheet`). `fight` is the fight for the boss's table; `uptimes`, a run's cooldowns and buffs,
 * gives the block buff's uptime that the table's line names, when there's a run to take it from.
 * `grouped` is the wide panel's layout: the rows in groups as a player reads them (`sheetGroups`);
 * otherwise they run in two columns of counterparts.
 */
function SheetStats({
  sheet: s,
  fight,
  uptimes,
  grouped = false,
}: {
  sheet: CharacterSheetData
  fight: FightConfig | null
  uptimes: SimResult['cooldowns']
  grouped?: boolean
}) {
  const unknown = s.unknown ?? []
  // A tank's sheet has the boss's table against it (docs/ux.md#results).
  const bossTable = s.bossTable ?? null
  // Decision D24: the unmeasured base values in the numbers shown, the ones the assumptions name
  // (a tank's avoidance placeholders only with their rows).
  const defensive = isDefensive(s)
  const placeholders = (s.placeholders ?? []).filter((p) => defensive || !AVOIDANCE_BASES.has(p))
  const rows = sheetRows(s)
  const unevenHands = weaponSkillValue(s.weaponSkill).spoken !== null
  const stat = ([label, value]: SheetRow, className?: string) => (
    <div key={label} className={cn('flex justify-between gap-2', className)}>
      <dt className="text-muted-foreground">
        {/* In the wide panel's columns crit reduction's label takes two lines, broken before its "(boss's crits)". */}
        {grouped && label === CRIT_REDUCTION_LABEL ? (
          <>
            {label.slice(0, label.indexOf(' ('))} <span className="whitespace-nowrap">{label.slice(label.indexOf(' (') + 1)}</span>
          </>
        ) : (
          label
        )}
      </dt>
      {label === WEAPON_SKILL_LABEL ? <WeaponSkill skill={s.weaponSkill} /> : <dd className="text-right tabular-nums">{value}</dd>}
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      {grouped ? (
        <SheetGroups rows={rows} stat={stat} />
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {/* Crit reduction's longer label, and both hands' weapon skills where they differ ("302 · 300", which a
              column 9 rem wide can't hold beside its label), need the row to themselves at the panel's width. */}
          {rows.map((row) => stat(row, row[0] === CRIT_REDUCTION_LABEL || (row[0] === WEAPON_SKILL_LABEL && unevenHands) ? 'col-span-2' : undefined))}
        </dl>
      )}
      {bossTable && (
        <BossTable
          // With the block buff the rotation keeps up (Holy Shield), the table as it is most of the fight.
          table={s.bossTableUp?.table ?? bossTable}
          avoidance={avoidanceOf(s)}
          fight={fight}
          wide={grouped}
          up={
            s.bossTableUp
              ? {
                  name: s.bossTableUp.name,
                  blockPct: s.bossTableUp.blockPct,
                  uptimePct: uptimes.find((c) => c.id === s.bossTableUp!.auraId)?.uptimePct ?? null,
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

/**
 * Weapon skill as one number, "300", or "300 · 305" when the hands differ, which never wraps; a
 * screen reader and the tooltip name the hands (docs/ux.md#results, `weaponSkillValue`).
 */
function WeaponSkill({ skill }: { skill: CharacterSheetData['weaponSkill'] }) {
  const { text, spoken, title } = weaponSkillValue(skill)
  if (!spoken) return <dd className="text-right tabular-nums">{text}</dd>
  return (
    <dd className="text-right whitespace-nowrap tabular-nums" title={title ?? undefined}>
      <span aria-hidden>{text}</span>
      <span className="sr-only">{spoken}</span>
    </dd>
  )
}

/**
 * The wide panel's sheet in groups (docs/ux.md#results): Offense, Attributes and Defense for a melee
 * spec, Spells and Mana for a caster, Melee beside Spells for a paladin. They flow in two columns in
 * a 30 rem panel, three from 38 rem and four from 48 rem (about 2,300 px), so a column is never much
 * wider than at 1920 px and a value never far from its label (review finding DU2-4); each group is
 * kept whole. A tank's Defense spans the columns, its rows in the same columns, just above the boss's
 * table. From three columns its crit reduction, whose label fills a column, takes two, its value in
 * the second; the rows after it fill any cell that leaves.
 *
 * A paladin's sheet, Melee beside Spells, has three columns from 30 rem, as at 1920 px: its five
 * groups are short, and in two columns a Protection paladin's sheet ran so long that Your setup's
 * Simulate went under the panel's edge at 1440×900 (review finding DU2-1). Its longest row, "Attack
 * power 1,094", fits a 30 rem panel's third beside a classic scrollbar.
 */
function SheetGroups({ rows, stat }: { rows: SheetRow[]; stat: (row: SheetRow, className?: string) => ReactNode }) {
  const groups = sheetGroups(rows)
  const paladin = groups.some((g) => g.id === 'offense') && groups.some((g) => g.id === 'spells')
  return (
    <div className={cn('-mb-2.5 gap-x-6 text-sm @min-[48rem]/results:columns-4', paladin ? 'columns-3' : 'columns-2 @min-[38rem]/results:columns-3')}>
      {groups.map((g) => {
        const wide = g.rows.some(([label]) => label === CRIT_REDUCTION_LABEL)
        return (
          <div key={g.id} className={cn('flex break-inside-avoid flex-col gap-1 pb-2.5', wide && '[column-span:all]')}>
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</h4>
            <dl
              className={cn(
                'grid gap-y-1',
                wide && 'grid-flow-row-dense gap-x-6 @min-[48rem]/results:grid-cols-4',
                !wide ? 'grid-cols-1' : paladin ? 'grid-cols-3' : 'grid-cols-2 @min-[38rem]/results:grid-cols-3',
              )}
            >
              {g.rows.map((row) => stat(row, row[0] === CRIT_REDUCTION_LABEL ? (paladin ? CRIT_REDUCTION_SPAN_ALWAYS : CRIT_REDUCTION_SPAN) : undefined))}
            </dl>
          </div>
        )
      })}
    </div>
  )
}

/** Crit reduction's row from three columns: two of them, its label in the first and its value in the second. */
const CRIT_REDUCTION_SPAN = '@min-[38rem]/results:col-span-2 @min-[38rem]/results:grid @min-[38rem]/results:grid-cols-subgrid'
/**
 * In a paladin's sheet, three columns from the start: two of them, a 30 rem panel's too narrow for
 * its label in the first, so its label runs across both and its value ends the second.
 */
const CRIT_REDUCTION_SPAN_ALWAYS = 'col-span-2 @min-[38rem]/results:grid @min-[38rem]/results:grid-cols-subgrid'

/** The collapsible details. The sheet's is under 1440 px only: the wide panel shows it at its top. */
type DetailsId = 'cooldowns' | 'sheet' | 'assumptions'

/**
 * The details a reader closed in the wide panel, remembered per browser, so they stay closed. The
 * stored list is untrusted: anything but an array of strings reads as nothing closed.
 */
const CLOSED_KEY = 'forever-sim:results-closed'

function readClosed(): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]')
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeClosed(id: DetailsId, closed: boolean) {
  try {
    const ids = readClosed()
    if (closed) ids.add(id)
    else ids.delete(id)
    localStorage.setItem(CLOSED_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage blocked or full: it stays as it is for this page.
  }
}

/**
 * A collapsible section of the details. Collapsed until opened, except where `remember` holds (the
 * wide panel's Cooldowns and buffs): there it's open unless the reader closed it, which this browser
 * remembers. `flat` is the wide panel's style: a section divided from the next by a rule, like the
 * others there, rather than a card.
 */
function Details({
  id,
  title,
  remember = false,
  flat = false,
  children,
}: {
  id: DetailsId
  title: string
  remember?: boolean
  flat?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [wideOpen, setWideOpen] = useState(() => !readClosed().has(id))
  return (
    <Collapsible
      open={remember ? wideOpen : open}
      onOpenChange={(next) => {
        if (!remember) return setOpen(next)
        setWideOpen(next)
        writeClosed(id, !next)
      }}
      className={flat ? 'border-b py-1.5' : 'rounded-xl border'}
    >
      <CollapsibleTrigger
        className={cn(
          'group flex min-h-11 w-full items-center gap-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          flat ? 'rounded-md' : 'px-4',
        )}
      >
        <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className={flat ? 'pb-3' : 'border-t px-4 py-3'}>{children}</CollapsibleContent>
    </Collapsible>
  )
}
