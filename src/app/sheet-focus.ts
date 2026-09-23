import { useRef } from 'react'

/**
 * Focus for a sheet, drawer or dialog opened from state rather than from its own Trigger
 * (docs/ux.md#accessibility). When it opens, focus moves to its title, so a long sheet is read
 * from the top; when it closes (Escape, the close button or a tap outside), focus goes back to
 * the control that opened it. Radix only returns focus to a Dialog.Trigger, and vaul's drawers
 * don't move focus in at all by default.
 *
 *   const focus = useSheetFocus<HTMLButtonElement>()
 *   <Button ref={focus.returnRef} onClick={() => setOpen(true)}>…</Button>
 *   <SheetContent {...focus.contentProps}>
 *     <SheetTitle ref={focus.titleRef} tabIndex={-1}>…</SheetTitle>
 *
 * Without a titleRef, the content's own first field takes focus (a search box with autoFocus).
 * When one sheet serves many controls (the item picker, for every gear slot), `returnTo` names
 * the control to go back to instead of `returnRef`. It also runs when the sheet unmounts rather
 * than closing, which Radix reports the same way.
 */
export function useSheetFocus<T extends HTMLElement>(returnTo?: () => HTMLElement | null | undefined) {
  const returnRef = useRef<T>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  return {
    returnRef,
    titleRef,
    contentProps: {
      onOpenAutoFocus: (event: Event) => {
        if (!titleRef.current) return
        event.preventDefault()
        titleRef.current.focus({ preventScroll: true })
      },
      onCloseAutoFocus: (event: Event) => {
        const target = returnTo?.() ?? returnRef.current
        if (!target) return
        event.preventDefault()
        target.focus({ preventScroll: true })
      },
    },
  }
}
