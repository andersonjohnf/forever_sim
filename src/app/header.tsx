import { ChevronDown, FolderOpen, Info, Link2, MoreHorizontal, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { type Ref, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WowIcon } from '@/components/wow-icon'
import { cn } from '@/lib/utils'
import { SPEC_META, type ClassId } from '@/sim'
import { AboutSheet } from './about-sheet'
import { copyText } from './clipboard'
import { useSetup } from './setup-store'
import { SetupsSheet } from './setups-sheet'
import { shareUrl } from './share'
import { useSheetFocus } from './sheet-focus'
import { CLASS_TEXT, useSpecMeta, visibleSpecs } from './specs'

/** The sheets the overflow menu opens. */
type MenuSheet = 'setups' | 'about'

export function Header() {
  const [sheet, setSheet] = useState<MenuSheet | null>(null)
  // Each sheet opens from the overflow menu, and focus goes back to the menu's button when it closes.
  const menuButton = useRef<HTMLButtonElement>(null)
  const setupsFocus = useSheetFocus(() => menuButton.current)
  const aboutFocus = useSheetFocus(() => menuButton.current)
  const openChange = (which: MenuSheet) => (open: boolean) => setSheet(open ? which : null)
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        {/* The page's one heading 1 (docs/ux.md#accessibility); phones show only the spec switcher. */}
        <h1 className="mr-1 font-semibold tracking-tight max-sm:sr-only">Forever Sim</h1>
        <SpecSwitcher />
        <div className="ml-auto flex items-center gap-1">
          <ShareButton />
          <MoreMenu onOpen={setSheet} triggerRef={menuButton} />
        </div>
      </div>
      <SetupsSheet
        open={sheet === 'setups'}
        onOpenChange={openChange('setups')}
        titleRef={setupsFocus.titleRef}
        contentProps={setupsFocus.contentProps}
      />
      <AboutSheet open={sheet === 'about'} onOpenChange={openChange('about')} titleRef={aboutFocus.titleRef} contentProps={aboutFocus.contentProps} />
    </header>
  )
}

function SpecSwitcher() {
  const meta = useSpecMeta()
  const setSpec = useSetup((s) => s.setSpec)
  const byClass = new Map<ClassId, ReturnType<typeof visibleSpecs>>()
  for (const spec of visibleSpecs()) byClass.set(spec.classId, [...(byClass.get(spec.classId) ?? []), spec])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2" aria-label={`Spec: ${meta.name} ${meta.className}. Change spec`}>
          <WowIcon icon={meta.icon} size="sm" />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm font-semibold">{meta.name}</span>
            <span className={cn('text-xs font-medium', CLASS_TEXT[meta.classId])}>{meta.className}</span>
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {[...byClass.entries()].map(([classId, classSpecs], index) => (
          <DropdownMenuGroup key={classId}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className={CLASS_TEXT[classId]}>{SPEC_META[classSpecs[0].id].className}</DropdownMenuLabel>
            {classSpecs.map((spec) => (
              <DropdownMenuItem key={spec.id} onSelect={() => setSpec(spec.id)} className="min-h-11 gap-3">
                <WowIcon icon={spec.icon} size="xs" />
                <span className="flex-1">{spec.name}</span>
                <span className="text-xs text-muted-foreground">{spec.role === 'tank' ? 'Tank' : 'DPS'}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Copies a link to the setup (docs/ux.md#persistence-and-sharing), within the tap (copyText). */
function ShareButton() {
  // One notice at a time: sharing again replaces the last one's.
  const share = () => {
    copyText(shareUrl(useSetup.getState().config)).then(
      () => toast.success('Link copied', { id: 'share', description: 'Anyone with the link gets this exact setup.' }),
      () =>
        toast.error('Couldn’t copy the link', {
          id: 'share',
          description: 'Your browser blocked the clipboard. Allow clipboard access for this site, then try Share again.',
        }),
    )
  }
  return (
    // At least 44 px wide on a phone, where it's the icon alone (docs/ux.md principle 4).
    <Button variant="ghost" className="h-11 min-w-11 gap-2 px-3" onClick={share}>
      <Link2 />
      <span className="hidden sm:inline">Share</span>
      <span className="sr-only sm:hidden">Share setup</span>
    </Button>
  )
}

function MoreMenu({ onOpen, triggerRef }: { onOpen: (sheet: MenuSheet) => void; triggerRef: Ref<HTMLButtonElement> }) {
  const reset = useSetup((s) => s.reset)
  const meta = useSpecMeta()
  const { theme, setTheme } = useTheme()
  // A sheet opens once the menu has closed, so the menu doesn't hand focus back to its button
  // after the sheet has taken it.
  const chosen = useRef<MenuSheet | null>(null)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} variant="ghost" size="icon" className="size-11" aria-label="More">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(event) => {
          const sheet = chosen.current
          if (!sheet) return
          chosen.current = null
          event.preventDefault()
          onOpen(sheet)
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            chosen.current = 'setups'
          }}
          className="min-h-11"
        >
          <FolderOpen /> Setups…
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            chosen.current = 'about'
          }}
          className="min-h-11"
        >
          <Info /> About &amp; data
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="min-h-11">
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
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
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11"
          onSelect={() => {
            reset()
            // Said, since it changes every tab, most of them out of sight.
            toast(`${meta.name} ${meta.className} reset to defaults`, { id: 'setup-reset' })
          }}
        >
          <RotateCcw /> Reset {meta.name} to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
