import { CalendarClock, FolderOpen, History, Info, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { resetTitle } from './load-notice'
import { useSetup } from './setup-store'

/** The sheets the header opens: from the overflow menu, or from the toolbar from 1440 px. */
export type HeaderSheet = 'setups' | 'about' | 'history' | 'coming'

/** The sheets, in the order the menu and the toolbar list them (docs/ux.md#layout, "Header"). */
export const HEADER_SHEETS: readonly { sheet: HeaderSheet; label: string; menuLabel: string; icon: LucideIcon }[] = [
  // In the menu, Setups… keeps the ellipsis of a menu item that opens a dialog; in the toolbar, where
  // every button opens a sheet, none has one.
  { sheet: 'setups', label: 'Setups', menuLabel: 'Setups…', icon: FolderOpen },
  { sheet: 'about', label: 'About & data', menuLabel: 'About & data', icon: Info },
  { sheet: 'history', label: 'Release history', menuLabel: 'Release history', icon: History },
  { sheet: 'coming', label: 'Coming soon', menuLabel: 'Coming soon', icon: CalendarClock },
]

/** Puts this spec's setup back to its defaults, and says so: the menu's Reset and the toolbar's. */
export function useResetSetup() {
  const reset = useSetup((s) => s.reset)
  return () => {
    const spec = useSetup.getState().config.spec
    reset()
    // Said, since it changes every tab, most of them out of sight, and with no prompt first
    // (decision D21): whose setup it replaced.
    toast(resetTitle(spec), { id: 'setup-reset' })
  }
}
