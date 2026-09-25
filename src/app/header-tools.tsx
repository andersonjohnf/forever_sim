import { ChevronDown, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { HEADER_SHEETS, type HeaderSheet, useResetSetup } from './header-items'
import { useSpecMeta } from './specs'

/** The theme's three choices, as radio items: in the overflow menu's Theme submenu and the toolbar's Theme menu. */
export function ThemeChoices() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
      <DropdownMenuRadioItem value="system" className="min-h-11">
        <Monitor /> System
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="light" className="min-h-11">
        <Sun /> Light
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark" className="min-h-11">
        <Moon /> Dark
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  )
}

/** A toolbar button: 44 px tall, as wide as its label (docs/ux.md principle 4), never stretched. */
const TOOL = 'h-11 gap-2 px-3'

/**
 * The overflow menu's items, listed in the header from 1440 px, where there's room (D34 as amended,
 * docs/ux.md#layout "Header"): the four sheets, then Theme and Reset setup, each opening the choices
 * the menu's items do. Reset setup opens a one-item menu naming the spec, so it still takes a second,
 * deliberate click, as it does in the overflow menu, and nothing prompts (decision D21).
 *
 * `opener` receives each sheet's button, so the sheet gives focus back to it when it closes.
 */
export function WideTools({
  onOpen,
  opener,
}: {
  onOpen: (sheet: HeaderSheet) => void
  opener: (sheet: HeaderSheet, button: HTMLButtonElement | null) => void
}) {
  const meta = useSpecMeta()
  const resetSetup = useResetSetup()
  return (
    <>
      {HEADER_SHEETS.map(({ sheet, label, icon: Icon }) => (
        <Button key={sheet} ref={(button) => opener(sheet, button)} variant="ghost" className={TOOL} onClick={() => onOpen(sheet)}>
          <Icon />
          {label}
        </Button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className={TOOL}>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
            Theme
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <ThemeChoices />
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className={TOOL}>
            <RotateCcw />
            Reset setup
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className="min-h-11" onSelect={resetSetup}>
            <RotateCcw /> Reset {meta.name} to defaults
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
