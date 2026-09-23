import { useEffect, useRef } from 'react'
import { Header } from '@/app/header'
import { useScrollFade } from '@/app/scroll-fade'
import { useSetup, type Section } from '@/app/setup-store'
import { useSharedLink } from '@/app/shared-link'
import { DataAttribution } from '@/components/data-attribution'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BuffsSection } from '@/features/buffs/buffs-section'
import { CharacterSection } from '@/features/character/character-section'
import { FightSection } from '@/features/fight/fight-section'
import { GearSection } from '@/features/gear/gear-section'
import { MobileSimBar } from '@/features/results/mobile-sim-bar'
import { ResultsPanel } from '@/features/results/results-panel'
import { RotationSection } from '@/features/rotation/rotation-section'
import { TalentsSection } from '@/features/talents/talents-section'

const SECTIONS: { id: Section; label: string; content: () => React.JSX.Element }[] = [
  { id: 'character', label: 'Character', content: CharacterSection },
  { id: 'talents', label: 'Talents', content: TalentsSection },
  { id: 'gear', label: 'Gear', content: GearSection },
  { id: 'buffs', label: 'Buffs', content: BuffsSection },
  { id: 'rotation', label: 'Rotation', content: RotationSection },
  { id: 'fight', label: 'Fight', content: FightSection },
]

/** Keeps the phone bar's height in --sim-bar-height, so toasts sit just above it (src/app/toaster.tsx). */
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

export default function App() {
  const section = useSetup((s) => s.section)
  const setSection = useSetup((s) => s.setSection)
  const { ref: tabsRef, fade } = useScrollFade<HTMLDivElement>(section)
  const simBar = useSimBarHeight()
  useSharedLink()

  return (
    <div className="min-h-svh bg-background">
      <Header />
      <main className="mx-auto max-w-7xl px-4 pb-32 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10 lg:pb-12">
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)} className="min-w-0 gap-0">
          <div className="sticky top-14 z-30 -mx-4 border-b bg-background/95 px-4 backdrop-blur lg:mx-0 lg:px-0">
            {/*
             * On narrow screens the tabs scroll sideways, and a fade marks each edge with more past
             * it. Tabs are 44 px tall (docs/ux.md principle 4), their underline on the bar's edge.
             */}
            <TabsList
              ref={tabsRef}
              variant="line"
              data-fade={fade}
              className="w-full justify-start gap-1 overflow-x-auto [scrollbar-width:none] group-data-horizontal/tabs:h-[50px] data-[fade=both]:[mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent)] data-[fade=left]:[mask-image:linear-gradient(to_left,black_calc(100%-3rem),transparent)] data-[fade=right]:[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]"
            >
              {SECTIONS.map((s) => (
                <TabsTrigger key={s.id} value={s.id} className="h-11 flex-none px-3 group-data-horizontal/tabs:after:bottom-[-3px]">
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {SECTIONS.map(({ id, content: Content }) => (
            <TabsContent key={id} value={id} className="pt-6">
              <Content />
            </TabsContent>
          ))}
          <footer className="mt-12 border-t pt-6">
            <DataAttribution />
          </footer>
        </Tabs>
        <aside className="hidden lg:block" aria-label="Results">
          <div className="sticky top-20 pt-6">
            <ResultsPanel />
          </div>
        </aside>
      </main>
      <div ref={simBar} className="contents">
        <MobileSimBar />
      </div>
    </div>
  )
}
