import { ChevronUp, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Progress } from '@/components/ui/progress'
import { Headline, ResultsPanel, SimulateButton } from './results-panel'
import { RunAnnouncer } from './run-announcer'
import { useRunState } from './use-run-state'

/**
 * The sticky bottom bar on phones and tablets (docs/ux.md#layout). It opens the results sheet
 * whenever there's something in it: a result, a run under way, or why a run failed.
 */
export function MobileSimBar() {
  const [open, setOpen] = useState(false)
  const { result, running, progressPct, error } = useRunState()
  const summaryId = useId()
  const canOpen = result !== null || running || error !== null
  return (
    <>
      {/* The run's live region lives here because this component is mounted once at every width. */}
      <RunAnnouncer />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {running && <Progress value={progressPct ?? 0} aria-hidden className="absolute inset-x-0 top-0 h-0.5 rounded-none" />}
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!canOpen}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Show results"
            aria-describedby={summaryId}
          >
            <span id={summaryId} className="flex min-w-0 flex-1">
              {error !== null ? <BarError message={error} /> : <Headline compact />}
            </span>
            {canOpen && <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          </button>
          <SimulateButton className="px-5" />
        </div>
      </div>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[92svh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Results</DrawerTitle>
            <DrawerDescription className="sr-only">Simulation results for your setup.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
            <ResultsPanel variant="sheet" onNavigate={() => setOpen(false)} />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

/** A failed run in the bar: an icon, a short title and the start of the reason; the sheet has it all. */
function BarError({ message }: { message: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        Couldn’t simulate
      </span>
      <span className="truncate text-xs text-muted-foreground">{message}</span>
    </span>
  )
}
