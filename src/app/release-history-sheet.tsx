import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ReleaseNotes } from './release-notes'
import { RELEASES } from './releases'
import type { useSheetFocus } from './sheet-focus'

type SheetFocus = ReturnType<typeof useSheetFocus>

/**
 * Release history (docs/ux.md "What's new"): every release, newest first, with its time in the
 * viewer's zone and what it changed. A side sheet like About, full width on a phone; titleRef and
 * contentProps come from the header's useSheetFocus, which returns focus to its menu.
 */
export function ReleaseHistorySheet({
  open,
  onOpenChange,
  titleRef,
  contentProps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleRef: SheetFocus['titleRef']
  contentProps: SheetFocus['contentProps']
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="scroll-pb-toast overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        showCloseButton={false}
        {...contentProps}
      >
        <SheetHeader className="pr-14">
          <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
            Release history
          </SheetTitle>
          <SheetDescription>What each release changed, newest first, in your time zone.</SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-11">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </SheetClose>
        <div className="px-4 pb-8 text-sm">
          <ReleaseNotes releases={RELEASES} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
