import { Toaster } from '@/components/ui/sonner'
import { UNDO_TOAST_MS } from './undo-toast'

/**
 * Toasts (docs/ux.md#persistence-and-sharing) sit at the bottom, clear of the header's controls:
 * on phones and tablets just above the sticky bar, whose height App keeps in --sim-bar-height.
 * Any toast with Undo stays up 10 s (undoToast also pauses it while focused).
 */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      duration={UNDO_TOAST_MS}
      offset={{ bottom: 'calc(var(--sim-bar-height, 0px) + 1rem)' }}
      mobileOffset={{ bottom: 'calc(var(--sim-bar-height, 0px) + 0.75rem)' }}
    />
  )
}
