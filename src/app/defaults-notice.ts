// The notice after a load moved what the player never changed to newer defaults (docs/ux.md
// #persistence-and-sharing): it happens out of sight, before the page is up, so it's said once.
import { useEffect } from 'react'
import { toast } from 'sonner'
import { defaultsUpdateNotice } from './follow-defaults'
import { takeDefaultsUpdates, useSetup } from './setup-store'

/** Says what the load moved to newer defaults, if anything. Call once, from App. */
export function useDefaultsNotice() {
  useEffect(() => {
    // Taken once, so React's dev double effects don't say it twice.
    const notice = defaultsUpdateNotice(takeDefaultsUpdates(), useSetup.getState().config.spec)
    if (notice) toast(notice.title, { id: 'defaults-update', description: notice.description })
  }, [])
}
