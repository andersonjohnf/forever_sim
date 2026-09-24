// The notice after a load moved what the player never changed to newer defaults (docs/ux.md
// #persistence-and-sharing): it happens out of sight, before the page is up, so it's said once.
import { useEffect } from 'react'
import { toast } from 'sonner'
import type { SpecId } from '@/sim'
import { defaultsUpdateNotice, type DefaultsUpdate } from './follow-defaults'
import { readLinkSetup } from './shared-link'
import { takeDefaultsUpdates, useSetup } from './setup-store'
import { peekSharedSetup } from './share'

/**
 * The spec whose setup the page's share link replaces, or null when there's no link or it's refused
 * (it replaces nothing then). Read from the URL as the page opens, before the link is loaded and
 * taken out of it (src/app/shared-link.ts).
 */
async function linkedSpec(): Promise<SpecId | null> {
  const link = peekSharedSetup()
  if (!link) return null
  try {
    const read = readLinkSetup(await link)
    return read.ok ? read.config.spec : null
  } catch {
    return null
  }
}

/**
 * What to announce: the moved specs, less the one a share link replaces, whose moved setup the link's
 * own takes the place of ("Gear and talents you changed yourself are kept." would contradict it). None when that leaves nothing.
 */
export function withoutLinked(updates: readonly DefaultsUpdate[], linked: SpecId | null): DefaultsUpdate[] {
  return updates.filter((u) => u.spec !== linked)
}

/** Says what the load moved to newer defaults, if anything. Call once, from App, before useSharedLink. */
export function useDefaultsNotice() {
  useEffect(() => {
    // Taken once, so React's dev double effects don't say it twice.
    const updates = takeDefaultsUpdates()
    if (updates.length === 0) return
    const current = useSetup.getState().config.spec
    // The link's spec is read before useSharedLink's effect takes the link out of the URL.
    void linkedSpec().then((linked) => {
      const notice = defaultsUpdateNotice(withoutLinked(updates, linked), current)
      if (notice) toast(notice.title, { id: 'defaults-update', description: notice.description })
    })
  }, [])
}
