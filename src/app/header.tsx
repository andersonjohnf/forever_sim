import { ChevronDown, Link2, MoreHorizontal, Moon, RotateCcw, Sun } from 'lucide-react'
import { type Ref, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DecadesCrest } from '@/components/decades-crest'
import { WowIcon } from '@/components/wow-icon'
import { useIsWide } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { SPEC_META, type ClassId } from '@/sim'
import { AboutSheet } from './about-sheet'
import { DECADES_URL } from './brand'
import { copyText } from './clipboard'
import { ComingSoonSheet } from './coming-soon-sheet'
import { HEADER_SHEETS, type HeaderSheet, useResetSetup } from './header-items'
import { ThemeChoices, WideTools } from './header-tools'
import { releaseToasts } from './held-toasts'
import { onOpenReleaseHistory } from './release-history-request'
import { ReleaseHistorySheet } from './release-history-sheet'
import { useSetup } from './setup-store'
import { SetupsSheet } from './setups-sheet'
import { shareUrl } from './share'
import { useSheetFocus } from './sheet-focus'
import { CLASS_TEXT, useSpecMeta, visibleSpecs } from './specs'

export function Header() {
  const [sheet, setSheet] = useState<HeaderSheet | null>(null)
  // From 1440 px the menu's items are in the toolbar (docs/ux.md#layout, "Header"); below, in the menu.
  const wide = useIsWide()
  // Each sheet gives focus back to the button that opened it when it closes: its toolbar button, or
  // the overflow menu's. `origin` is the sheet whose button opened it; About's release stamp opens
  // Release history without changing it, so focus goes back to About's button (or the menu's) after
  // the history. What's New's All releases makes it Release history's.
  const menuButton = useRef<HTMLButtonElement>(null)
  const toolButtons = useRef<Partial<Record<HeaderSheet, HTMLButtonElement | null>>>({})
  const origin = useRef<HeaderSheet>('setups')
  // Whichever is on the page: the toolbar's button from 1440 px, the menu's below.
  const opener = () => toolButtons.current[origin.current] ?? menuButton.current
  const setupsFocus = useSheetFocus(opener)
  const aboutFocus = useSheetFocus(opener)
  const historyFocus = useSheetFocus(opener)
  const comingFocus = useSheetFocus(opener)
  const open = (which: HeaderSheet) => {
    origin.current = which
    setSheet(which)
  }
  const openChange = (which: HeaderSheet) => (isOpen: boolean) => setSheet(isOpen ? which : null)
  // About's release stamp opens Release history in its place. About, closing, then leaves focus to
  // the history sheet, which gives it back to About's opener when it closes.
  const toHistory = useRef(false)
  const aboutContentProps = {
    ...aboutFocus.contentProps,
    onCloseAutoFocus: (event: Event) => {
      if (!toHistory.current) return aboutFocus.contentProps.onCloseAutoFocus(event)
      toHistory.current = false
      event.preventDefault()
    },
  }
  const showHistory = () => {
    toHistory.current = true
    setSheet('history')
  }
  // What's New's All releases opens it too, in What's New's place, handing it the load's toasts it
  // held (src/app/held-toasts.ts): they come up once the history has closed and the page is heard again.
  useEffect(
    () =>
      onOpenReleaseHistory(() => {
        origin.current = 'history'
        setSheet('history')
      }),
    [],
  )
  const historyContentProps = {
    ...historyFocus.contentProps,
    onCloseAutoFocus: (event: Event) => {
      historyFocus.contentProps.onCloseAutoFocus(event)
      releaseToasts()
    },
  }
  return (
    <header className="sticky top-0 z-40 border-b border-brand-gold/40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {/*
       * Below 360 px the row's edge and gaps tighten, and the crest and the More button reach a little
       * into the edge, so the widest spec's name ("Marksmanship") still fits at 320 px; a longer one
       * would truncate in the switcher. Never a sideways scroll (docs/ux.md#layout). From 1440 px it
       * spans the page's width, as the page does (src/App.tsx).
       */}
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 max-[360px]:gap-1 max-[360px]:px-3 wide:max-w-[160rem] wide:px-6">
        <Lockup />
        <SpecSwitcher />
        {/*
         * Share, then the menu's items: from 1440 px each is its own button, as wide as its label;
         * below, they're in the overflow menu. One named group, in the tab order left to right.
         */}
        <div role="group" aria-label="Setup and app" className="ml-auto flex items-center gap-1 max-[360px]:-mr-1.5 max-[360px]:gap-0">
          <ShareButton />
          {wide ? (
            <WideTools
              onOpen={open}
              opener={(which, button) => {
                toolButtons.current[which] = button
              }}
            />
          ) : (
            <MoreMenu onOpen={open} triggerRef={menuButton} />
          )}
        </div>
      </div>
      <SetupsSheet
        open={sheet === 'setups'}
        onOpenChange={openChange('setups')}
        titleRef={setupsFocus.titleRef}
        contentProps={setupsFocus.contentProps}
      />
      <AboutSheet
        open={sheet === 'about'}
        onOpenChange={openChange('about')}
        titleRef={aboutFocus.titleRef}
        contentProps={aboutContentProps}
        onShowHistory={showHistory}
      />
      <ReleaseHistorySheet
        open={sheet === 'history'}
        onOpenChange={openChange('history')}
        titleRef={historyFocus.titleRef}
        contentProps={historyContentProps}
      />
      <ComingSoonSheet
        open={sheet === 'coming'}
        onOpenChange={openChange('coming')}
        titleRef={comingFocus.titleRef}
        contentProps={comingFocus.contentProps}
      />
    </header>
  )
}

/**
 * The brand lockup (docs/ux.md#brand): the Decades crest, the app's name (the page's one heading 1,
 * docs/ux.md#accessibility) and "Decades" under it, the whole of it one 44 px link to the guild's
 * site in a new tab. The link is the crest; its ::after stretches over the name as well, so a click
 * anywhere on the lockup follows it. The lockup lights up on hover (only where a pointer hovers, so
 * a tap leaves no highlight) and shows the focus ring, as a ghost button does. The name comes first
 * in the DOM, so a screen reader hears "Forever Sim" and then the link, though the crest shows
 * first. On a phone only the crest shows.
 */
function Lockup() {
  return (
    <div className="group/lockup relative -ml-1.5 flex h-11 min-w-11 shrink-0 items-center justify-center gap-2.5 rounded-lg px-1.5 transition-colors hover:bg-muted has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 sm:pr-2.5 max-[360px]:-ml-2 dark:hover:bg-muted/50">
      <div className="order-last flex flex-col gap-1 max-sm:sr-only">
        <h1 className="leading-none font-semibold tracking-tight">Forever Sim</h1>
        {/* The link says it for screen readers. On hover it takes the text colour, as a ghost button's does. */}
        <span
          aria-hidden
          className="font-brand text-xs leading-none font-semibold tracking-[0.24em] text-muted-foreground uppercase transition-colors group-hover/lockup:text-foreground"
        >
          Decades
        </span>
      </div>
      <a
        href={DECADES_URL}
        target="_blank"
        rel="noopener"
        title="Decades: decades.gg, opens in a new tab"
        className="outline-none after:absolute after:inset-0 after:rounded-lg"
      >
        <DecadesCrest className="size-8" />
        <span className="sr-only">Decades: decades.gg, opens in a new tab</span>
      </a>
    </div>
  )
}

function SpecSwitcher() {
  const meta = useSpecMeta()
  const setSpec = useSetup((s) => s.setSpec)
  const labelId = useId()
  const byClass = new Map<ClassId, ReturnType<typeof visibleSpecs>>()
  for (const spec of visibleSpecs()) byClass.set(spec.classId, [...(byClass.get(spec.classId) ?? []), spec])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* It gives way first when the row is tight: a name too long for it truncates, never the page scrolling sideways. */}
        <Button
          variant="ghost"
          className="h-11 min-w-0 shrink gap-2 px-2 max-[360px]:gap-1.5 max-[360px]:px-1.5"
          aria-label={`Spec: ${meta.name} ${meta.className}. Change spec`}
        >
          <WowIcon icon={meta.icon} size="sm" />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="max-w-full truncate text-sm font-semibold">{meta.name}</span>
            <span className={cn('max-w-full truncate text-xs font-medium', CLASS_TEXT[meta.classId])}>{meta.className}</span>
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {[...byClass.entries()].map(([classId, classSpecs], index) => (
          // Each class's specs are a group named by its heading, so two classes' specs of one name
          // (a warrior's and a paladin's Protection) are told apart by ear too.
          <DropdownMenuGroup key={classId} aria-labelledby={`${labelId}-${classId}`}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel id={`${labelId}-${classId}`} className={CLASS_TEXT[classId]}>
              {SPEC_META[classSpecs[0].id].className}
            </DropdownMenuLabel>
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

function MoreMenu({ onOpen, triggerRef }: { onOpen: (sheet: HeaderSheet) => void; triggerRef: Ref<HTMLButtonElement> }) {
  const meta = useSpecMeta()
  const resetSetup = useResetSetup()
  // A sheet opens once the menu has closed, so the menu doesn't hand focus back to its button
  // after the sheet has taken it.
  const chosen = useRef<HeaderSheet | null>(null)
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
        {HEADER_SHEETS.map(({ sheet, menuLabel, icon: Icon }) => (
          <DropdownMenuItem
            key={sheet}
            onSelect={() => {
              chosen.current = sheet
            }}
            className="min-h-11"
          >
            <Icon /> {menuLabel}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="min-h-11">
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ThemeChoices />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onSelect={resetSetup}>
          <RotateCcw /> Reset {meta.name} to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
