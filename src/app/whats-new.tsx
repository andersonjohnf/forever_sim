import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { DrawerCloseButton } from './drawer-close-button'
import { ReleaseNotes } from './release-notes'
import { checkReleases, type Release } from './releases'
import { useSheetFocus } from './sheet-focus'

/** The browser's localStorage, or null where reaching it throws (blocked site data). */
function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

let unseen: Release[] | undefined

/**
 * The releases this load shows, checked once per page (React's dev double renders ask twice):
 * checkReleases stores the newest id as it reads, so a second check would find nothing new.
 */
function takeUnseen(): Release[] {
  unseen ??= checkReleases(localStorageOrNull())
  return unseen
}

const TITLE = 'What’s new'
const DESCRIPTION = 'Since your last visit, newest first.'

/**
 * What's New (docs/ux.md "What's new"): a returning visitor's first load of a newer release shows
 * every release since the one they last saw, once. A first visit, or a release this list doesn't
 * know, shows nothing. A dialog from 640 px, a bottom sheet on a phone; focus goes to its title,
 * and back where it was (the page) when it closes. Toasts from the same load (a shared link, newer
 * defaults) sit over it, as over any dialog.
 */
export function WhatsNew() {
  const [releases] = useState(takeUnseen)
  const [open, setOpen] = useState(releases.length > 0)
  const wide = useMediaQuery('(min-width: 640px)')
  const { titleRef, contentProps } = useSheetFocus()
  if (releases.length === 0) return null

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="flex max-h-[min(85vh,48rem)] flex-col gap-0 p-0 sm:max-w-lg" {...contentProps}>
          <DialogHeader className="border-b p-4 pr-14">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
              {TITLE}
            </DialogTitle>
            <DialogDescription>{DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 scroll-pb-toast overflow-y-auto overscroll-contain p-4">
            <ReleaseNotes releases={releases} />
          </div>
          <DialogFooter className="m-0 rounded-b-xl border-t p-4">
            <DialogClose asChild>
              <Button className="h-11 px-6">Got it</Button>
            </DialogClose>
          </DialogFooter>
          {/* 44 px, as every dialog's close button is (docs/ux.md#accessibility). */}
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 size-11" aria-label="Close">
              <X />
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[85svh]" {...contentProps}>
        <DrawerHeader className="relative border-b pr-14 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {TITLE}
          </DrawerTitle>
          <DrawerDescription>{DESCRIPTION}</DrawerDescription>
          <DrawerCloseButton />
        </DrawerHeader>
        <div className="min-h-0 flex-1 scroll-pb-toast overflow-y-auto overscroll-contain p-4">
          <ReleaseNotes releases={releases} />
        </div>
        <DrawerFooter className="mt-0 border-t">
          <DrawerClose asChild>
            <Button className="h-11">Got it</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
