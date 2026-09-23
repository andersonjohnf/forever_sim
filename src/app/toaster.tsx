import { useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { focusNewestUndo } from './toast-layer'
import { UNDO_TOAST_MS } from './undo-toast'

/**
 * Sonner's hotkey, Alt+T (Option+T on a Mac). A constant, so sonner registers its listener once,
 * on mount, ahead of the one below.
 */
const HOTKEY = ['altKey', 'KeyT']

/**
 * Toasts (docs/ux.md#persistence-and-sharing) sit at the bottom, clear of the header's controls:
 * on phones and tablets just above the sticky bar, whose height App keeps in --sim-bar-height.
 * Any toast with Undo stays up 10 s (undoToast also pauses it while focused), or until dismissed
 * when a key press raised it.
 *
 * Alt+T is the keyboard's way to the toasts: sonner focuses the list and spreads the toasts out,
 * then this moves focus on to the newest toast's Undo, one keystroke from it.
 */
export function AppToaster() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyT') focusNewestUndo()
    }
    // Effects run child first, so this comes after sonner's listener and runs after it.
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  return (
    <Toaster
      position="bottom-center"
      hotkey={HOTKEY}
      duration={UNDO_TOAST_MS}
      offset={{ bottom: 'calc(var(--sim-bar-height, 0px) + 1rem)' }}
      mobileOffset={{ bottom: 'calc(var(--sim-bar-height, 0px) + 0.75rem)' }}
    />
  )
}
