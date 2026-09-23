import { ChevronDown, Info, Link2, MoreHorizontal, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
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
import { SPEC_META, type ClassId, type SimConfig } from '@/sim'
import { AboutSheet } from './about-sheet'
import { useSetup } from './setup-store'
import { shareUrl } from './share'
import { useSheetFocus } from './sheet-focus'
import { CLASS_TEXT, useSpecMeta, visibleSpecs } from './specs'
import { undoToast } from './undo-toast'

export function Header() {
  const [aboutOpen, setAboutOpen] = useState(false)
  // About opens from the overflow menu, and focus goes back to the menu's button when it closes.
  const { returnRef, titleRef, contentProps } = useSheetFocus<HTMLButtonElement>()
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        {/* The page's one heading 1 (docs/ux.md#accessibility); phones show only the spec switcher. */}
        <h1 className="mr-1 font-semibold tracking-tight max-sm:sr-only">Forever Sim</h1>
        <SpecSwitcher />
        <div className="ml-auto flex items-center gap-1">
          <ShareButton />
          <MoreMenu onAbout={() => setAboutOpen(true)} triggerRef={returnRef} />
        </div>
      </div>
      <AboutSheet open={aboutOpen} onOpenChange={setAboutOpen} titleRef={titleRef} contentProps={contentProps} />
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

/**
 * Copies a link to the setup (docs/ux.md#persistence-and-sharing). The clipboard write starts
 * inside the tap itself, with the link still being compressed, because Safari refuses a write
 * that follows an await. Browsers without ClipboardItem write the text once it's ready.
 */
async function copyShareLink(config: SimConfig) {
  const url = shareUrl(config)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const text = url.then((link) => new Blob([link], { type: 'text/plain' }))
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })])
  } else {
    await navigator.clipboard.writeText(await url)
  }
}

function ShareButton() {
  const share = () => {
    copyShareLink(useSetup.getState().config).then(
      () => toast.success('Link copied', { description: 'Anyone with the link gets this exact setup.', duration: 4000 }),
      () =>
        toast.error('Couldn’t copy the link', {
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

function MoreMenu({ onAbout, triggerRef }: { onAbout: () => void; triggerRef: Ref<HTMLButtonElement> }) {
  const reset = useSetup((s) => s.reset)
  const meta = useSpecMeta()
  const { theme, setTheme } = useTheme()
  // About opens once the menu has closed, so the menu doesn't hand focus back to its button
  // after the sheet has taken it.
  const aboutChosen = useRef(false)
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
          if (!aboutChosen.current) return
          aboutChosen.current = false
          event.preventDefault()
          onAbout()
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            aboutChosen.current = true
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
        <DropdownMenuItem className="min-h-11" onSelect={() => undoToast(`${meta.name} ${meta.className} reset to defaults`, reset())}>
          <RotateCcw /> Reset {meta.name} to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
