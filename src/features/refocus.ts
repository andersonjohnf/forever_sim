// Moving focus after a change that removes or disables the focused control (docs/ux.md#accessibility:
// focus never falls to the page).
import { flushSync } from 'react-dom'

/**
 * Applies a change, renders it at once, then focuses what `target` finds, so focus lands on the
 * control as it now is (a segmented control's newly selected option, a tab that just opened)
 * rather than falling to the page when the button that made the change goes away.
 */
export function changeAndFocus(change: () => void, target: () => HTMLElement | null | undefined) {
  flushSync(change)
  target()?.focus()
}

/** The selected option of a segmented control (a single-select toggle group) with this id. */
export const selectedOption = (groupId: string) => document.querySelector<HTMLElement>(`#${CSS.escape(groupId)} [data-state="on"]`)
