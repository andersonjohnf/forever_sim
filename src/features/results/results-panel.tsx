import { ArrowDown, ArrowUp, ChevronRight, Loader2, Play, RotateCw, Square, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { WowIcon } from '@/components/wow-icon'
import { formatInt, formatOne, formatPct, formatSeconds } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SimResult } from '@/sim'
import { useRunState } from './use-run-state'

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
  const { sim, stale, metric, metricLabel } = useRunState()
  const result = sim.result
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
  if (!result) {
    return (
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-muted-foreground">{metricLabel}</span>
        <span className={cn('font-semibold tracking-tight text-muted-foreground', compact ? 'text-xl' : 'text-4xl')}>—</span>
      </div>
    )
  }
  const value = metric(result)
  const previous = sim.previous ? metric(sim.previous) : null
  const delta = previous ? value.mean - previous.mean : null
  return (
    <div className={cn('flex min-w-0 flex-col', stale && 'opacity-60')}>
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {metricLabel}
        {stale && <span className="rounded bg-amber-500/15 px-1.5 text-amber-700 dark:text-amber-400">Setup changed</span>}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn('font-semibold tracking-tight tabular-nums', compact ? 'text-xl' : 'text-4xl')}>{formatOne(value.mean)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">± {formatOne(value.ci95)}</span>
        {delta !== null && Math.abs(delta) >= 0.05 && (
          <span
            className={cn(
              'flex items-center text-sm font-medium tabular-nums',
              delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            )}
          >
            {delta > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            {delta > 0 ? '+' : '−'}
            {formatOne(Math.abs(delta))}
          </span>
        )}
      </span>
    </div>
  )
}

export function ResultsPanel() {
  const { sim, stale, tank, metricLabel } = useRunState()
  const result = sim.result

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <Headline />
        {result && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatInt(result.iterations)} fights of {Math.round(result.durationSec)} s ·{' '}
            {result.profile === 'forever' ? 'Forever' : 'Classic Era'} rules · {formatSeconds(result.elapsedMs)}
            {tank && <> · {formatOne(result.dps.mean)} DPS</>}
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
          <Breakdown result={result} tank={tank} />
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

function Breakdown({ result, tank }: { result: SimResult; tank: boolean }) {
  const value = (a: SimResult['abilities'][number]) => (tank ? a.threat : a.damage)
  const total = result.abilities.reduce((n, a) => n + value(a), 0) || 1
  const rows = [...result.abilities].sort((a, b) => value(b) - value(a))
  const perSecond = (n: number) => n / result.iterations / result.durationSec
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{tank ? 'Threat' : 'Damage'} by ability</h3>
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
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
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
