import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { DataAttribution } from '@/components/data-attribution'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const REPO = 'https://github.com/andersonjohnf/forever_sim'

// Only each dataset's `meta` envelope is imported, so this doesn't pull whole datasets in.
const metas = import.meta.glob<{ foreverBuild: string; scrapedAt: string }>(
  ['@/data/spells/warrior.json', '@/data/talents/warrior.json', '@/data/races/races.json', '@/data/items/pre-bis.json'],
  { import: 'meta', eager: true },
)
const DATASETS = Object.entries(metas).map(([path, meta]) => ({
  name: { spells: 'Spellbooks', talents: 'Talents', races: 'Races', items: 'Items' }[path.split('/').at(-2) ?? ''] ?? path,
  meta,
}))

export function AboutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>About Forever Sim</SheetTitle>
          <SheetDescription>
            A DPS and TPS simulator for Warriors, Feral Druids and Paladins in WoW Forever. Everything runs in
            your browser.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-8 text-sm">
          <Section title="Where the numbers come from">
            <p>
              WoW Forever values come first. Where Forever data doesn&apos;t exist yet, the sim falls back to Classic
              Era values. Season of Discovery, Season of Mastery, original Vanilla, TBC and Retail values are never
              used.
            </p>
            <p>
              Anything the sim assumes but nobody has verified in game yet is listed with each result, so you know
              how much to trust it.
            </p>
          </Section>
          <Section title="Items marked “Classic stats”">
            <p>
              The Forever beta client doesn&apos;t include every item yet, so those items use their Classic Era
              stats until a client build ships them. They&apos;re marked{' '}
              <Badge variant="outline">Classic stats</Badge> in the gear picker.
            </p>
          </Section>
          <Section title="Game data">
            <DataAttribution />
            <p className="text-muted-foreground">
              Both read the WoW Forever beta client. Items and ability numbers come straight from the
              client&apos;s data tables, served by wago.tools. Spellbooks, talents and races come from
              foreverchanges.pro, which compares the client with Classic Era.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
              {DATASETS.map(({ name, meta }) => (
                <div key={name} className="contents">
                  <dt className="text-muted-foreground">{name}</dt>
                  <dd>
                    <span className="whitespace-nowrap">Build {meta.foreverBuild}</span> ·{' '}
                    <span className="whitespace-nowrap">{meta.scrapedAt.slice(0, 10)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
          <Section title="Source and docs">
            <a className="inline-flex items-center gap-1 underline underline-offset-2" href={REPO}>
              GitHub repository <ExternalLink className="size-3.5" />
            </a>
            <a className="inline-flex items-center gap-1 underline underline-offset-2" href={`${REPO}/blob/main/docs/open-questions.md`}>
              What still needs testing in game <ExternalLink className="size-3.5" />
            </a>
          </Section>
          <p className="text-xs text-muted-foreground">
            World of Warcraft is a trademark of Blizzard Entertainment. This project is not affiliated with Blizzard.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  )
}
