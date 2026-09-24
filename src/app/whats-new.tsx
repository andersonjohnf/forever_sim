import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { DrawerCloseButton } from './drawer-close-button'
import { holdToasts, releaseToasts } from './held-toasts'
import { openReleaseHistory } from './release-history-request'
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
 * checkReleases stores the newest id as it reads, so a second check would find nothing new. While
 * there are any, the load's toasts wait for What's New to close (src/app/held-toasts.ts).
 *
 * It runs in What's New's first render (its useState initializer), before any effect: checkReleases
 * tells a visitor from before What's New by the automatic save it finds, and useSharedLink's effect
 * writes that save on a first visit that opens a share link. Don't move it into an effect.
 */
function takeUnseen(): Release[] {
  unseen ??= checkReleases(localStorageOrNull())
  if (unseen.length > 0) holdToasts()
  return unseen
}

const TITLE = 'What’s new'
const DESCRIPTION = 'Since your last visit, newest first.'

/**
 * While a toast is up, the footer's bottom padding grows by how far up the toasts reach
 * (--toast-clearance, src/app/toaster.tsx), so Got it and All releases sit clear of a toast that
 * comes up over the dialog (a link pasted in while it's open).
 */
const FOOTER_CLEAR_OF_TOASTS = 'pb-[calc(1rem+var(--toast-clearance,0px))]'

/**
 * What's New (docs/ux.md "What's new"): a returning visitor's first load of a newer release shows
 * every release since the one they last saw, once. A first visit, or a release this list doesn't
 * know, shows nothing. A dialog from 640 px, a bottom sheet on a phone; focus goes to its title,
 * and back where it was (the page) when it closes. The load's toasts (a shared link, newer
 * defaults) wait until it has closed. All releases opens Release history in its place, as About's
 * link does.
 */
export function WhatsNew() {
  const [releases] = useState(takeUnseen)
  const [open, setOpen] = useState(releases.length > 0)
  const wide = useMediaQuery('(min-width: 640px)')
  const { titleRef, contentProps } = useSheetFocus()
  // All releases hands focus to Release history, which gives it to the header's menu when it closes.
  const toHistory = useRef(false)
  if (releases.length === 0) return null

  const showHistory = () => {
    toHistory.current = true
    setOpen(false)
    openReleaseHistory()
  }
  const props = {
    ...contentProps,
    // Once it has closed and unmounted, so the page it hid from screen readers is heard again.
    onCloseAutoFocus: (event: Event) => {
      // Unmounted while still open: the window crossed 640 px, and the other form takes its place.
      if (open) return
      if (toHistory.current) {
        // The toasts wait on for Release history, which lets them go as it closes (src/app/header.tsx).
        event.preventDefault()
        return
      }
      contentProps.onCloseAutoFocus(event)
      releaseToasts()
    },
  }
  const allReleases = (
    <Button variant="outline" className="h-11 px-6" onClick={showHistory}>
      All releases
    </Button>
  )

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="flex max-h-[min(85vh,48rem)] flex-col gap-0 p-0 sm:max-w-lg" {...props}>
          <DialogHeader className="border-b p-4 pr-14">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
              {TITLE}
            </DialogTitle>
            <DialogDescription>{DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 scroll-pb-toast overflow-y-auto overscroll-contain p-4">
            <ReleaseNotes releases={releases} />
          </div>
          <DialogFooter className={`m-0 rounded-b-xl border-t p-4 ${FOOTER_CLEAR_OF_TOASTS}`}>
            {allReleases}
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
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[85svh]" {...props}>
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
        <DrawerFooter className={`mt-0 border-t ${FOOTER_CLEAR_OF_TOASTS}`}>
          <DrawerClose asChild>
            <Button className="h-11">Got it</Button>
          </DrawerClose>
          {allReleases}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
