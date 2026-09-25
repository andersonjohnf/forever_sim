// The app's keyboard shortcut (docs/ux.md#accessibility; decision D34). Ctrl+Enter, or ⌘+Enter on a
// Mac, runs Simulate from anywhere on the page, a text or number field included, at every width. It
// takes a modifier, so it never fires from typing alone (WCAG 2.1.4), and it stands aside while you're
// filling in a sheet's or dialog's own form, or choosing from a menu or list, where Enter is theirs.
// It listens in the capture phase and stops the key once it runs, so a focused control that also acts
// on Enter (a Select's trigger opens, a drag handle picks its row up) never sees it (DL-3).
import { useEffect } from 'react'
import { useSetup } from '@/app/setup-store'
import { useSim } from '@/app/sim-store'

/** The parts of a key event the shortcut reads; a KeyboardEvent has them all. */
export type ShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation'
>

/** The parts of the document the shortcut looks at; `document` has them all. */
export type ShortcutDocument = Pick<Document, 'activeElement' | 'querySelector' | 'querySelectorAll'>

/** Ctrl+Enter or ⌘+Enter, with no other modifier: not a key held down, nor Enter ending an IME's composition. */
export function isSimulateShortcut(e: Omit<ShortcutEvent, 'defaultPrevented' | 'preventDefault' | 'stopPropagation'>): boolean {
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !e.repeat && !e.isComposing
}

/** Input types that take no typing, so have no value to commit. */
const NOT_TYPED = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'])

/** A field you type in: a text or number input, a text area, or editable text. */
export function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName === 'INPUT') return !NOT_TYPED.has(((el as HTMLInputElement).type || 'text').toLowerCase())
  return (el as HTMLElement).isContentEditable === true
}

/** A popup you're choosing in: a menu, or a list of options (a select's, the enchant picker's). */
const CHOOSING = '[role="menu"], [role="listbox"]'
/** Sheets, dialogs and popovers: Radix renders each only while it's open, and marks one closing. */
const DIALOGS = '[role="dialog"], [role="alertdialog"]'
/** What makes a dialog a form: a field, or a control that picks a value. */
const FORM_CONTROLS = 'input:not([type="hidden"]), textarea, select:not([aria-hidden="true"]), [contenteditable="true"], [role="combobox"], [role="listbox"]'

/**
 * True while Enter belongs to something open over the page: a sheet, dialog or popover with a form of
 * its own (the item picker's search, a setup's name, a pasted build code), or a menu or list you're
 * choosing from. A sheet without one, such as the phone's results, which holds Simulate itself, leaves
 * the shortcut on.
 */
export function formOpen(doc: Pick<ShortcutDocument, 'querySelector' | 'querySelectorAll'>): boolean {
  if (doc.querySelector(CHOOSING)) return true
  for (const dialog of doc.querySelectorAll(DIALOGS)) {
    if (dialog.getAttribute('data-state') === 'closed') continue
    if (dialog.querySelector(FORM_CONTROLS)) return true
  }
  return false
}

/**
 * A typed value counts before the run: the field commits it, as it does when you leave it (a number
 * field's draft, src/components/number-field.tsx), and gets focus straight back, so you carry on
 * where you were. Focus moves without scrolling.
 */
export function commitField(el: Element | null): void {
  if (!isTextEntry(el)) return
  el.blur()
  el.focus({ preventScroll: true })
}

/** What the shortcut runs: whether a run is under way, and how to start one with the setup as it is now. */
export interface SimulateTarget {
  busy: () => boolean
  run: () => void
}

/**
 * Runs Simulate for Ctrl+Enter or ⌘+Enter, as its button does, and says whether it did. Nothing while
 * a run is under way (the button is Cancel then), while a form is open over the page (formOpen), or
 * when something on the page already handled the key. A focused field commits its value first, so the
 * run takes what you typed. When it runs it takes the key, and stops it, so the focused control's own
 * Enter doesn't also act (it's heard first, in the capture phase: useSimulateShortcut).
 */
export function handleSimulateShortcut(event: ShortcutEvent, doc: ShortcutDocument, target: SimulateTarget): boolean {
  if (event.defaultPrevented || !isSimulateShortcut(event) || formOpen(doc) || target.busy()) return false
  event.preventDefault()
  event.stopPropagation()
  commitField(doc.activeElement)
  target.run()
  return true
}

/** The app's Simulate: the setup is read after the field's commit, so it holds the typed value. */
const SIMULATE: SimulateTarget = {
  busy: () => useSim.getState().status === 'running',
  run: () => void useSim.getState().run(useSetup.getState().config),
}

/**
 * Mounts the shortcut on the window, once, in the app shell (src/App.tsx), in the capture phase: the
 * window hears a key before anything on the page, React's handlers included, so stopping it there
 * keeps it from the focused control.
 */
export function useSimulateShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleSimulateShortcut(event, document, SIMULATE)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])
}
