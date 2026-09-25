import { XIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { useSheetFocus } from './sheet-focus'

type SheetFocus = ReturnType<typeof useSheetFocus>

/** What the header hands a sheet its menu opens. */
export interface MenuSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleRef: SheetFocus['titleRef']
  contentProps: SheetFocus['contentProps']
}

/**
 * The side sheet Release history and Coming soon share (docs/ux.md "What's new", "Coming soon"), so
 * the two read as a pair: a title and a line under it, a 44 px Close in the corner, then the entries.
 * Full width on a phone. titleRef and contentProps come from the header's useSheetFocus, which puts
 * focus on the title and gives it back to the menu's button.
 */
export function NotesSheet({
  open,
  onOpenChange,
  titleRef,
  contentProps,
  title,
  description,
  children,
}: MenuSheetProps & { title: string; description: string; children: ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="scroll-pb-toast overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        showCloseButton={false}
        {...contentProps}
      >
        <SheetHeader className="pr-14">
          <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {title}
          </SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-11">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </SheetClose>
        <div className="px-4 pb-8 text-sm">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

/** The entries' column. */
export function NotesList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>
}

/**
 * An entry: its heading (a name, and a small label beside it that wraps under it when it must), then
 * its content. Each after the first is divided from the one before it by a rule.
 *
 * A screen reader names the heading "Stat boosts, Planned". The comma sits inside the name's own
 * span, against the name: the heading lays its parts out as flex items, and the browser puts a space
 * between those, so a comma inside the label would read "Stat boosts , Planned". It's hidden by a
 * zero font size rather than sr-only, whose absolute position makes it a block with spaces around it.
 */
export function NoteEntry({
  divided,
  heading,
  label,
  headingClassName,
  children,
}: {
  divided: boolean
  heading: ReactNode
  /** The small label beside the name ("Latest", "Planned"), if it has one. */
  label?: ReactNode
  headingClassName?: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <article aria-labelledby={headingId} className={cn('flex flex-col gap-3', divided && 'border-t pt-6')}>
      <h3 id={headingId} className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 font-medium', headingClassName)}>
        <span>
          {heading}
          {label && <span className="text-[0px]">,</span>}
        </span>
        {label}
      </h3>
      {children}
    </article>
  )
}

/** An entry's changes or plans, as a bulleted list. */
export function NoteItems({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
