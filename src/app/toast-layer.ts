// Toasts sit above everything else (docs/ux.md#persistence-and-sharing): a toast with Undo stays
// reachable by tap and by keyboard while a sheet, dialog or menu is open, and the keyboard has a
// shortcut to it.
import { toast } from 'sonner'

const TOASTER = '[data-sonner-toaster]'
const inToaster = (node: EventTarget | null): node is Element => node instanceof Element && node.closest(TOASTER) !== null

/** Keys that don't count as using the keyboard on their own. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])
/** Input types that take typing, so on a touch screen the on-screen keyboard. */
const TEXT_INPUTS = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url'])
let keyboard = false

/**
 * Whether the user's last action was a key press rather than a tap or click, e.g. choosing
 * "Remove all gear" with Enter. A toast it raises stays until dismissed (src/app/undo-toast.ts).
 */
export const lastInputWasKeyboard = () => keyboard

/**
 * Whether a key press counts as using the keyboard. On a touch screen (a coarse pointer), typing
 * in a text field is the on-screen keyboard: Enter in the paste dialog on a phone isn't keyboard
 * navigation, so the toast it raises keeps its 10 s and gets no Alt+T hint.
 */
function isKeyboardUse(e: KeyboardEvent) {
  if (MODIFIERS.has(e.key)) return false
  const target = e.target
  const typing =
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type)) ||
    (target instanceof HTMLElement && target.isContentEditable)
  return !(typing && window.matchMedia('(pointer: coarse)').matches)
}

/** The shortcut to the toasts (sonner's hotkey), as the keyboard labels it. */
export const TOAST_HOTKEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? 'Option+T' : 'Alt+T'

/** Hands focus back from the toasts to where it was before (sonner restores it when focus leaves them). */
export function leaveToasts() {
  const focused = document.activeElement
  if (inToaster(focused) && focused instanceof HTMLElement) focused.blur()
}

let installed = false

/**
 * Installs the document listeners that keep toasts reachable. Call it once, before the app
 * renders: they have to come before any sheet's own listeners.
 *
 * - A sheet, dialog or menu (Radix) treats a pointer down or focus outside it as a reason to
 *   close, and a modal one pulls focus back into its trap; it listens on the document, in the
 *   bubble phase. These listeners run first and stop a toast's pointerdown, focusin and focusout
 *   there, so the sheet under a toast stays open and focus can reach its Undo. React's own
 *   handlers, on the app's root below the document, have already run by then. (Pointer events
 *   reach the toast at all through src/index.css; the rest of the page has them off meanwhile.)
 * - Escape in a toast dismisses it, if it has Undo, and hands focus back, rather than closing the
 *   sheet under it: capture phase, ahead of Radix's own Escape listener.
 *
 * The shortcut itself is the toaster's (src/app/toaster.tsx).
 */
export function installToastLayer() {
  if (installed) return
  installed = true
  window.addEventListener(
    'keydown',
    (e) => {
      if (isKeyboardUse(e)) keyboard = true
    },
    true,
  )
  window.addEventListener(
    'pointerdown',
    () => {
      keyboard = false
    },
    true,
  )

  const stopIf = (inside: boolean, e: Event) => {
    if (inside) e.stopImmediatePropagation()
  }
  document.addEventListener('pointerdown', (e) => stopIf(inToaster(e.target), e))
  document.addEventListener('focusin', (e) => stopIf(inToaster(e.target), e))
  document.addEventListener('focusout', (e) => stopIf(inToaster(e.relatedTarget), e))

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !inToaster(e.target)) return
      e.stopImmediatePropagation()
      // undoToast gives each toast its marker as both its id and its class.
      const marker = [...(e.target.closest('[data-sonner-toast]')?.classList ?? [])].find((c) => c.startsWith('undo-toast-'))
      leaveToasts()
      if (marker) toast.dismiss(marker)
    },
    { capture: true },
  )
}

/**
 * Focuses the newest toast's Undo (its action button), if a toast has one. It's marked while it
 * keeps that focus, so its ring shows (src/index.css): Chrome doesn't count a key press with Alt
 * as keyboard use, so after a click elsewhere :focus-visible wouldn't match.
 */
export function focusNewestUndo() {
  const undo = document.querySelector<HTMLElement>(`${TOASTER} [data-sonner-toast][data-removed='false'] [data-action]`)
  if (!undo) return
  undo.dataset.hotkeyFocus = ''
  undo.addEventListener('blur', () => delete undo.dataset.hotkeyFocus, { once: true })
  undo.focus()
}
