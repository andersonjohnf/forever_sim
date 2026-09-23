import { useEffect } from 'react'
import { toast } from 'sonner'
import { Header } from '@/app/header'
import { useSetup, type Section } from '@/app/setup-store'
import { clearSharedSetupFromUrl, readSharedSetup } from '@/app/share'
import { isVisibleSpec } from '@/app/specs'
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
import { normalizeConfig, SPEC_META } from '@/sim'

const SECTIONS: { id: Section; label: string; content: () => React.JSX.Element }[] = [
  { id: 'character', label: 'Character', content: CharacterSection },
  { id: 'talents', label: 'Talents', content: TalentsSection },
  { id: 'gear', label: 'Gear', content: GearSection },
  { id: 'buffs', label: 'Buffs', content: BuffsSection },
  { id: 'rotation', label: 'Rotation', content: RotationSection },
  { id: 'fight', label: 'Fight', content: FightSection },
]

/** Loads a setup from a share link (#s=…), with Undo (docs/ux.md#persistence-and-sharing). */
function useSharedLink() {
  useEffect(() => {
    readSharedSetup()
      .then((raw) => {
        if (raw === null) return
        clearSharedSetupFromUrl()
        const { config, warnings } = normalizeConfig(raw)
        if (!isVisibleSpec(config.spec)) {
          const { name, className } = SPEC_META[config.spec]
          toast.error(`That link is for a ${name} ${className}`, { description: 'This sim doesn’t cover that spec, so your own setup is unchanged.' })
          return
        }
        const previous = useSetup.getState().replace(config)
        toast('Loaded a shared setup', {
          description: warnings.length ? `${warnings.length} part(s) were out of date and reset to defaults.` : undefined,
          action: { label: 'Undo', onClick: () => useSetup.getState().replace(previous) },
        })
      })
      .catch(() => {
        clearSharedSetupFromUrl()
        toast.error('That share link is broken', { description: 'Your own setup is unchanged.' })
      })
  }, [])
}

export default function App() {
  const section = useSetup((s) => s.section)
  const setSection = useSetup((s) => s.setSection)
  useSharedLink()

  return (
    <div className="min-h-svh bg-background">
      <Header />
      <main className="mx-auto max-w-7xl px-4 pb-32 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10 lg:pb-12">
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)} className="min-w-0 gap-0">
          <div className="sticky top-14 z-30 -mx-4 border-b bg-background/95 px-4 backdrop-blur lg:mx-0 lg:px-0">
            {/* On narrow screens the tabs scroll; the fade on the right says there's more. */}
            <TabsList
              variant="line"
              className="h-12 w-full justify-start gap-1 overflow-x-auto [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_85%,transparent)]"
            >
              {SECTIONS.map((s) => (
                <TabsTrigger key={s.id} value={s.id} className="h-10 flex-none px-3">
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
      <MobileSimBar />
    </div>
  )
}
