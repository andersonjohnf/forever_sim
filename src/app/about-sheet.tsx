import { ExternalLink, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { DataAttribution } from '@/components/data-attribution'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DECADES_URL } from './brand'
import { formatReleaseTime, RELEASE, shortCommit } from './release'
import type { useSheetFocus } from './sheet-focus'
import { appSentence, coverageSentence } from './specs'

const REPO = 'https://github.com/andersonjohnf/forever_sim'
const base = import.meta.env.BASE_URL

// Only each dataset's `meta` envelope is imported, so this doesn't pull whole datasets in.
const metas = import.meta.glob<{ foreverBuild: string; scrapedAt: string }>(
  ['@/data/spells/warrior.json', '@/data/talents/warrior.json', '@/data/races/races.json', '@/data/items/pre-bis.json'],
  { import: 'meta', eager: true },
)
const DATASETS = Object.entries(metas).map(([path, meta]) => ({
  name: { spells: 'Spellbooks', talents: 'Talents', races: 'Races', items: 'Items' }[path.split('/').at(-2) ?? ''] ?? path,
  meta,
}))

type SheetFocus = ReturnType<typeof useSheetFocus>

/** titleRef and contentProps come from the header's useSheetFocus, which returns focus to its menu. */
export function AboutSheet({
  open,
  onOpenChange,
  titleRef,
  contentProps,
  onShowHistory,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleRef: SheetFocus['titleRef']
  contentProps: SheetFocus['contentProps']
  /** Opens Release history in About's place. */
  onShowHistory: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
       * Full width on a phone, as Setups is (the stock side sheet is three quarters wide, and its
       * data-side classes outrank a plain w-full). Focus in it scrolls clear of the toasts, which
       * sit over the sheet (src/index.css).
       */}
      <SheetContent
        className="scroll-pb-toast overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        showCloseButton={false}
        {...contentProps}
      >
        <SheetHeader className="pr-14">
          <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
            About Forever Sim
          </SheetTitle>
          {/* What it is, then the specs it covers, which grow as they ship (docs/ux.md principle 8). */}
          <SheetDescription>{keepGameNameWhole(appSentence())} Everything runs in your browser.</SheetDescription>
          <ReleaseStamp onShowHistory={onShowHistory} />
          <p className="mt-1 text-sm text-muted-foreground">{coverageSentence()}</p>
        </SheetHeader>
        <SheetClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-11">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </SheetClose>
        <div className="flex flex-col gap-6 px-4 pb-8 text-sm">
          <Section title="Where the numbers come from">
            <p>
              WoW Forever values come first. Where Forever data doesn&apos;t exist yet, the sim falls back to Classic
              Era values. Season of Discovery, Season of Mastery, original Vanilla, TBC and Retail values are never
              used. A few base values nobody has measured yet, such as class base health, are left out or use the
              value Classic Era is expected to have until someone measures them, and each result lists them.
            </p>
            <p>
              Anything the sim assumes but nobody has verified in game yet is listed with each result, so you know
              how much to trust it.
            </p>
          </Section>
          <Section title="Items marked “Classic stats”">
            <p>
              The Forever beta client doesn&apos;t include every item yet, so those items use their Classic Era
              stats until a client build ships them. A few Forever caster weapons, such as Sageclaw and Mindfang,
              take their spell power from Classic Era too, because no one has recorded their Forever tooltip yet.
              Both are marked <Badge variant="outline">Classic stats</Badge> in the gear picker.
            </p>
          </Section>
          <Section title="Game data">
            <DataAttribution newTab icon />
            <p className="text-muted-foreground">
              Spellbooks, talents, races, items and ability numbers all come from the WoW Forever beta
              client&apos;s own data tables, served by wago.tools. Classic Era comparisons come from the Classic Era
              client the same way.
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
          {/* The links are 44 px tall touch targets (docs/ux.md principle 4), and as wide as their text. */}
          <Section title="Source and docs">
            <div className="flex flex-col items-start">
              <ExternalTextLink href={REPO}>GitHub repository</ExternalTextLink>
              <ExternalTextLink href={`${REPO}/blob/main/docs/open-questions.md`}>What still needs testing in game</ExternalTextLink>
            </div>
          </Section>
          <MadeByDecades />
          <p className="text-xs text-muted-foreground">
            World of Warcraft is a trademark of Blizzard Entertainment. Forever Sim and Decades are not affiliated with
            or endorsed by Blizzard Entertainment.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The guild's signature (docs/ux.md#brand): its full logo, the ink one on light surfaces and the
 * guild's own white one on dark, a line of its own positioning, and its site in a new tab. Under a
 * gold hairline, with its heading in the guild's lettering.
 */
function MadeByDecades() {
  return (
    <section aria-labelledby="about-decades" className="flex flex-col gap-3 border-t border-brand-gold/50 pt-6">
      <h3 id="about-decades" className="font-brand text-xs font-semibold tracking-[0.24em] text-brand-gold-text uppercase">
        Made by Decades
      </h3>
      <div className="flex items-center gap-4">
        {/* The heading names it, so the logo is decorative. Its aspect is the guild's file's. */}
        <img src={`${base}brand/decades-logo-on-light.svg`} alt="" width={88} height={74} className="shrink-0 dark:hidden" />
        <img src={`${base}brand/decades-logo-on-dark.svg`} alt="" width={88} height={74} className="hidden shrink-0 dark:block" />
        <div className="flex flex-col items-start gap-1">
          <p>
            Forever Sim is made by Decades, a gaming community since 2005. Community first: we invest in our players.
          </p>
          <ExternalTextLink href={DECADES_URL}>Visit decades.gg</ExternalTextLink>
        </div>
      </div>
    </section>
  )
}

/**
 * A link out of the app, as every link in About is: a new tab, so the sheet stays open, that says so
 * to screen readers (docs/ux.md, "About & data").
 */
function ExternalTextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="inline-flex min-h-11 items-center gap-1 underline underline-offset-2" href={href} target="_blank" rel="noopener">
      {children} <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
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

/**
 * When this release went out, in the viewer's time zone, and its build (docs/ux.md "About & data"),
 * then a 44 px link-style button to Release history, which says what each release changed.
 */
function ReleaseStamp({ onShowHistory }: { onShowHistory: () => void }) {
  const commit = shortCommit(RELEASE.commit)
  return (
    <div className="mt-1 flex flex-col items-start">
      <p className="text-sm text-muted-foreground">
        Updated{' '}
        {/* The "·" stays on the time's line, so a build that wraps never opens its line with it. */}
        <span className="whitespace-nowrap">
          <time dateTime={RELEASE.time.toISOString()}>{formatReleaseTime(RELEASE.time)}</time>
          {commit && ' ·'}
        </span>
        {commit && (
          <>
            {' '}
            <span className="whitespace-nowrap">build {commit}</span>
          </>
        )}
      </p>
      <Button variant="link" className="h-11 px-0 text-sm text-foreground underline underline-offset-2" onClick={onShowHistory}>
        What changed in each release
      </Button>
    </div>
  )
}

/** The game's full name kept on one line, so "World of Warcraft: Forever" never splits (the meta keeps the plain string). */
function keepGameNameWhole(sentence: string): ReactNode {
  const name = 'World of Warcraft: Forever'
  const at = sentence.indexOf(name)
  if (at < 0) return sentence
  return (
    <>
      {sentence.slice(0, at)}
      <span className="whitespace-nowrap">{name}</span>
      {sentence.slice(at + name.length)}
    </>
  )
}

