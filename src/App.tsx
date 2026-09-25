import { useCallback, useEffect, useRef } from 'react'
import { Announcer } from '@/app/announcer'
import { DecadesCredit } from '@/app/decades-credit'
import { useDefaultsNotice } from '@/app/defaults-notice'
import { Header } from '@/app/header'
import { SectionTabs } from '@/app/section-tabs'
import { SECTION_IDS, useSetup, type Section } from '@/app/setup-store'
import { SetupSummary } from '@/app/setup-summary'
import { useSharedLink } from '@/app/shared-link'
import { useSimulateShortcut } from '@/app/shortcuts'
import { WhatsNew } from '@/app/whats-new'
import { DataAttribution } from '@/components/data-attribution'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { BuffsSection } from '@/features/buffs/buffs-section'
import { CharacterSection } from '@/features/character/character-section'
import { FightSection } from '@/features/fight/fight-section'
import { GearSection } from '@/features/gear/gear-section'
import { MobileSimBar } from '@/features/results/mobile-sim-bar'
import { ResultsPanel, SimulateButton, SimulateNote } from '@/features/results/results-panel'
import { RotationSection } from '@/features/rotation/rotation-section'
import { TalentsSection } from '@/features/talents/talents-section'
import { useIsWide } from '@/hooks/use-media-query'

// One tab per section the store knows (SECTION_IDS), in its order: a Record, so a section added
// there without a tab here, or a tab it doesn't know, fails the typecheck.
const TABS: Record<Section, { label: string; content: () => React.JSX.Element }> = {
  character: { label: 'Character', content: CharacterSection },
  talents: { label: 'Talents', content: TalentsSection },
  gear: { label: 'Gear', content: GearSection },
  buffs: { label: 'Buffs', content: BuffsSection },
  rotation: { label: 'Rotation', content: RotationSection },
  fight: { label: 'Fight', content: FightSection },
}
const SECTIONS = SECTION_IDS.map((id) => ({ id, ...TABS[id] }))

/**
 * Keeps the phone bar's height in --sim-bar-height, so toasts sit just above it
 * (src/app/toaster.tsx) and focus stays clear of it (the page's scroll padding, src/index.css).
 */
function useSimBarHeight() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // The bar marks itself: MobileSimBar also renders the run's live region beside it.
    const bar = ref.current?.querySelector('[data-sim-bar]')
    if (!bar) return
    const root = document.documentElement
    // Hidden on desktop, where it measures 0.
    const observer = new ResizeObserver(() => root.style.setProperty('--sim-bar-height', `${bar.getBoundingClientRect().height}px`))
    observer.observe(bar)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--sim-bar-height')
    }
  }, [])
  return ref
}

/**
 * After a tab switch, the new section starts at its top, just under the sticky tabs, rather than
 * wherever the last one was scrolled to, which could leave its header and notes (the Classic Era
 * note) under the tabs (docs/ux.md#layout). It only ever scrolls up, smoothly unless reduced motion
 * is asked for.
 */
function scrollToSectionTop(section: Section) {
  const panel = document.querySelector<HTMLElement>(`[data-section="${section}"]`)
  if (!panel) return
  const stickyTop = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) || 0
  const offset = panel.getBoundingClientRect().top - stickyTop
  if (offset >= 0) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: window.scrollY + offset, behavior: reduced ? 'auto' : 'smooth' })
}

export default function App() {
  const section = useSetup((s) => s.section)
  const setSection = useSetup((s) => s.setSection)
  const simBar = useSimBarHeight()
  const results = useRef<HTMLElement>(null)
  useDefaultsNotice()
  useSharedLink()
  useSimulateShortcut()
  const wide = useIsWide()
  // Opens a section's tab, as a tab does and as the wide panel's setup summary does.
  const openSection = useCallback(
    (next: Section) => {
      setSection(next)
      // Next frame: the new section has rendered by then, and a click has finished moving focus to
      // its tab.
      requestAnimationFrame(() => scrollToSectionTop(next))
    },
    [setSection],
  )
  // The setup summary's lines also move focus into the section they open (docs/ux.md#results).
  const openAndFocus = useCallback(
    (next: Section) => {
      openSection(next)
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-section="${next}"]`)?.focus({ preventScroll: true }))
    },
    [openSection],
  )

  return (
    <div className="min-h-svh bg-background">
      {/*
       * First in the page from 1024 px, where the results sit beside the setup, and hidden until
       * focused (docs/ux.md#layout). It moves focus to the pane's Simulate button (Run again, or
       * Cancel while a run is under way), whose focus ring shows where it landed: the pane itself
       * draws none (review finding DA-4). It moves focus in script rather than by its hash, which
       * the share links own (src/app/shared-link.ts).
       */}
      <a
        href="#results"
        onClick={(event) => {
          event.preventDefault()
          results.current?.querySelector<HTMLElement>('[data-simulate]')?.focus()
        }}
        className="sr-only max-lg:hidden focus:not-sr-only focus:fixed focus:top-1.5 focus:left-4 focus:z-50 focus:inline-flex focus:h-11 focus:items-center focus:rounded-lg focus:border focus:bg-background focus:px-4 focus:text-sm focus:font-medium focus:shadow-md focus:ring-3 focus:ring-ring/50 focus:outline-none"
      >
        Skip to results
      </a>
      <Header />
      {/*
       * The bottom padding clears the phone's sim bar. From 1440 px (the wide layout, D34) the page
       * fills the window up to 2560 px, with 24 px gutters, and the results pane widens smoothly: 30 rem
       * at 1440, a third of each pixel past it (40 rem at 1920, about 53 rem at 2560), up to 60 rem, so
       * no step at 1920 takes a column from the setup (review finding DA-2). Each pane is a named container from
       * 1440 px (setup, results), so a section styles itself by its own width there, and container
       * queries match nothing below it.
       */}
      <main className="mx-auto max-w-7xl px-4 pb-32 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10 lg:pb-12 wide:max-w-[160rem] wide:grid-cols-[minmax(0,1fr)_clamp(30rem,calc(30rem_+_(100vw_-_90rem)_/_3),60rem)] wide:gap-8 wide:px-6">
        {/*
         * Manual activation: arrow keys move between tabs, Enter or Space opens one. Sonner hands
         * focus back to where it was when you leave the toasts, so with automatic activation a tab
         * you clicked right after a toast was switched back to the one focused before (docs/ux.md).
         */}
        <Tabs
          value={section}
          onValueChange={(v) => openSection(v as Section)}
          activationMode="manual"
          className="min-w-0 gap-0 wide:@container/setup"
        >
          <SectionTabs sections={SECTIONS} active={section} />
          {SECTIONS.map(({ id, content: Content }) => (
            // data-section: a control that opens this tab moves focus here (src/app/section-focus.ts).
            <TabsContent key={id} value={id} data-section={id} className="pt-6">
              <Content />
            </TabsContent>
          ))}
          {/* The game data's credit, then the guild's (docs/ux.md#brand): one line, or two on a phone. */}
          <footer className="mt-12 flex flex-wrap items-center gap-x-8 border-t pt-6">
            <DataAttribution newTab />
            <DecadesCredit />
          </footer>
        </Tabs>
        {/*
         * The skip link's target: focus lands on its Simulate button. From 1440 px (D34) it's the
         * wide panel: the character sheet and the setup summary, with Simulate, then the result.
         */}
        <aside ref={results} id="results" className="hidden outline-none lg:block wide:@container/results" aria-label="Results">
          <div className="sticky top-20 pt-6">
            <ResultsPanel setup={wide ? <SetupSummary sections={SECTIONS} onOpen={openAndFocus} action={<SimulateButton />} note={<SimulateNote />} /> : undefined} />
          </div>
        </aside>
      </main>
      <div ref={simBar} className="contents">
        <MobileSimBar />
      </div>
      {/* Screen readers hear bulk changes that have no visible notice (src/app/announce.ts). */}
      <Announcer />
      {/* A returning visitor's first load of a newer release says what changed (docs/ux.md "What's new"). */}
      <WhatsNew />
    </div>
  )
}
