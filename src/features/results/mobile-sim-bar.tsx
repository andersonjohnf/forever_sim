import { ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Headline, ResultsPanel, SimulateButton } from './results-panel'
import { useRunState } from './use-run-state'

/** The sticky bottom bar on phones and tablets (docs/ux.md#layout). */
export function MobileSimBar() {
  const [open, setOpen] = useState(false)
  const { sim } = useRunState()
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!sim.result && sim.status !== 'running'}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Show results"
          >
            <Headline compact />
            {sim.result && <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
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
            <ResultsPanel />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
