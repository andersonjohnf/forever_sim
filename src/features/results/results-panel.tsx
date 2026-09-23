import { ArrowDown, ArrowUp, ChevronRight, Loader2, Play, RotateCw, Square, TriangleAlert } from 'lucide-react'
import { Fragment, type ReactNode, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WowIcon } from '@/components/wow-icon'
import { formatInt, formatOne, formatPct, formatSeconds } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SimResult, Summary } from '@/sim'
import { type Metric, METRIC_LABEL, metricsFor, useBreakdownMetric, useRunState } from './use-run-state'

export function SimulateButton({ className }: { className?: string }) {
  const { config, sim, stale } = useRunState()
  if (sim.status === 'running') {
    return (
      <Button variant="outline" className={cn('h-11', className)} onClick={sim.cancel}>
        <Square /> Cancel
      </Button>
    )
  }
  return (
    <Button className={cn('h-11', className)} onClick={() => sim.run(config)}>
      {sim.result && !stale ? <RotateCw /> : <Play />}
      {sim.result && !stale ? 'Run again' : 'Simulate'}
    </Button>
  )
}

export function Headline({ compact = false }: { compact?: boolean }) {
  const { sim, stale, config } = useRunState()
  const result = sim.result
  // A result shows the metrics of the spec it was run for, even when the setup has moved on.
  const metrics = metricsFor(result?.spec ?? config.spec)
  if (sim.status === 'running' && !result) {
    const p = sim.progress
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Simulating
          {p && <span className="tabular-nums">{Math.round((100 * p.completedIterations) / p.totalIterations)}%</span>}
        </span>
        {!compact && <Progress value={p ? (100 * p.completedIterations) / p.totalIterations : 0} aria-label="Simulation progress" />}
      </div>
    )
  }
  const rows: MetricRow[] = metrics.map((key) => ({
    key,
    label: METRIC_LABEL[key],
    value: result ? result[key] : null,
    previous: sim.previous ? sim.previous[key].mean : null,
  }))
  const badge = stale ? <StaleBadge /> : null
  if (rows.length === 1) return <SingleHeadline row={rows[0]} compact={compact} stale={stale} badge={badge} />
  // Tanks: TPS and DPS as equals (decision D18). Stacked rows fit the phone's bottom bar (below
  // 375 px wide it drops the ± column, which the results sheet still shows); the panel sets them
  // side by side.
  if (compact) {
    return (
      <div className={cn('flex min-w-0 flex-col', stale && 'opacity-60')}>
        {badge && <span className="text-xs font-medium">{badge}</span>}
        <div className="grid min-w-0 grid-cols-[auto_auto_auto_1fr] items-baseline gap-x-1.5 max-[375px]:grid-cols-[auto_auto_1fr]">
          {rows.map((row) => (
            <Fragment key={row.key}>
              <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
              <span className={cn('text-lg leading-6 font-semibold tracking-tight tabular-nums', !row.value && 'text-muted-foreground')}>
                {row.value ? formatOne(row.value.mean) : '—'}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums max-[375px]:hidden">{row.value && `± ${formatOne(row.value.ci95)}`}</span>
              <span className="text-xs">{row.value && <Delta value={row.value.mean} previous={row.previous} />}</span>
            </Fragment>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className={cn('grid min-w-0 grid-cols-2 gap-x-4', stale && 'opacity-60')}>
      {rows.map((row, i) => (
        <MetricBlock key={row.key} row={row} badge={i === 0 ? badge : null}>
          <span className={cn('text-4xl font-semibold tracking-tight tabular-nums', !row.value && 'text-muted-foreground')}>
            {row.value ? formatOne(row.value.mean) : '—'}
          </span>
          {row.value && (
            <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-muted-foreground tabular-nums">± {formatOne(row.value.ci95)}</span>
              <Delta value={row.value.mean} previous={row.previous} />
            </span>
          )}
        </MetricBlock>
      ))}
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

/** DPS specs: one metric, its ± and change on the value's line. */
function SingleHeadline({ row, compact, stale, badge }: { row: MetricRow; compact: boolean; stale: boolean; badge: ReactNode }) {
  const size = compact ? 'text-xl' : 'text-4xl'
  if (!row.value) {
    return (
      <MetricBlock row={row} badge={null}>
        <span className={cn('font-semibold tracking-tight text-muted-foreground', size)}>—</span>
      </MetricBlock>
    )
  }
  return (
    <MetricBlock row={row} badge={badge} className={cn(stale && 'opacity-60')}>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn('font-semibold tracking-tight tabular-nums', size)}>{formatOne(row.value.mean)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">± {formatOne(row.value.ci95)}</span>
        <Delta value={row.value.mean} previous={row.previous} className="text-sm" />
      </span>
    </MetricBlock>
  )
}

function StaleBadge() {
  return <span className="rounded bg-amber-500/15 px-1.5 text-amber-700 dark:text-amber-400">Setup changed</span>
}

/** The change from the previous result: arrow, sign and color (docs/ux.md#results). */
function Delta({ value, previous, className }: { value: number; previous: number | null; className?: string }) {
  if (previous === null) return null
  const delta = value - previous
  if (Math.abs(delta) < 0.05) return null
  return (
    <span
      className={cn(
        'flex items-center font-medium tabular-nums',
        delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
        className,
      )}
    >
      {delta > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      {delta > 0 ? '+' : '−'}
      {formatOne(Math.abs(delta))}
    </span>
  )
}

export function ResultsPanel() {
  const { sim, stale, metricLabel } = useRunState()
  const result = sim.result

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <Headline />
        {result && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatInt(result.iterations)} fights of {Math.round(result.durationSec)} s ·{' '}
            {result.profile === 'forever' ? 'Forever' : 'Classic Era'} rules · {formatSeconds(result.elapsedMs)}
          </p>
        )}
        {sim.status === 'error' && (
          <div role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              The simulation failed: {sim.error} Try again, or reset this spec to its defaults from the menu.
            </span>
          </div>
        )}
        {!result && sim.status === 'idle' && (
          <p className="text-sm text-muted-foreground">Your setup is ready. Simulate to see your {metricLabel}.</p>
        )}
        {stale && sim.status !== 'running' && <p className="text-sm text-muted-foreground">Your setup changed since this run.</p>}
        <SimulateButton className="w-full" />
      </div>

      {result && (
        <>
          <Breakdown result={result} />
          <Details title="Character sheet">
            <Sheet result={result} />
          </Details>
          {result.assumptions.length > 0 && (
            <Details title={`Assumptions (${result.assumptions.length})`}>
              <ul className="flex list-disc flex-col gap-2 pl-4 text-sm text-muted-foreground">
                {result.assumptions.map((a) => (
                  <li key={a.id}>{a.text}</li>
                ))}
              </ul>
            </Details>
          )}
        </>
      )}
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
  const rows = result.abilities.filter((a) => value(a) > 0).sort((a, b) => value(b) - value(a))
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
            <ToggleGroupItem value="tps" className="h-11 px-3">
              Threat
            </ToggleGroupItem>
            <ToggleGroupItem value="dps" className="h-11 px-3">
              Damage
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing in this setup {metric === 'tps' ? 'makes threat' : 'deals damage'}.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((a) => {
          const share = (100 * value(a)) / total
          const landed = a.hits + a.crits + a.glances + a.blocks
          const attempts = landed + a.misses + a.dodges + a.parries
          return (
            <li key={a.id} className="flex items-center gap-3">
              <WowIcon icon={a.icon} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatOne(perSecond(value(a)))} <span className="text-muted-foreground">· {formatPct(share)}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                </div>
                {attempts > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatPct((100 * a.crits) / attempts)} crit · {formatPct((100 * (a.misses + a.dodges + a.parries)) / attempts)} avoided
                    {a.glances > 0 && <> · {formatPct((100 * a.glances) / attempts)} glancing</>}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Sheet({ result }: { result: SimResult }) {
  const s = result.sheet
  const unknown = s.unknown ?? []
  const rows: [string, string][] = [
    ['Attack power', formatInt(s.attackPower)],
    ['Crit', formatPct(s.critPct)],
    ['Hit', formatPct(s.hitPct)],
    ['Haste', formatPct(s.hastePct)],
    ['Weapon skill', s.weaponSkill.offHand ? `${s.weaponSkill.mainHand} / ${s.weaponSkill.offHand}` : String(s.weaponSkill.mainHand)],
    ['Expertise', formatInt(s.expertise)],
    ['Strength', formatInt(s.strength)],
    ['Agility', formatInt(s.agility)],
    ['Stamina', formatInt(s.stamina)],
    ['Health', formatInt(s.health)],
    ['Armor', formatInt(s.armor)],
    ...(s.defense > 300 || s.blockValue > 0
      ? ([
          ['Defense', formatInt(s.defense)],
          ['Dodge', formatPct(s.dodgePct)],
          ['Parry', formatPct(s.parryPct)],
          ['Block', formatPct(s.blockPct)],
          ['Block value', formatInt(s.blockValue)],
        ] as [string, string][])
      : []),
  ]
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {unknown.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not known for Forever yet, so left out: {unknown.join(', ')}.
        </p>
      )}
    </div>
  )
}

function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible className="rounded-xl border">
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2 px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-4 py-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
