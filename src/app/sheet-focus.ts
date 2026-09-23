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
 */
export function useSheetFocus<T extends HTMLElement>() {
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
        if (!returnRef.current) return
        event.preventDefault()
        returnRef.current.focus({ preventScroll: true })
      },
    },
  }
}
