// Share links, on the way in (docs/ux.md#persistence-and-sharing): a #s=… link loads its setup and
// a notice says so, both when the page opens and when a link is pasted into a tab that already has
// the app open (only the hash changes, so the page doesn't reload).
import { useEffect } from 'react'
import { toast } from 'sonner'
import { normalizeConfig, SPEC_META } from '@/sim'
import { loadedDescription } from './load-notice'
import { useSetup } from './setup-store'
import { hasSharedSetup, readSharedSetup } from './share'
import { isVisibleSpec } from './specs'

/** Only the latest link applies, if two are pasted in quick succession. */
let latest = 0

function loadSharedLink() {
  // Reading a link takes it out of the URL before decoding it (src/app/share.ts), so a second
  // call for the same link (React's dev double effects) finds none, and doesn't count as a newer one.
  if (!hasSharedSetup()) return
  const attempt = ++latest
  readSharedSetup()
    .then((raw) => {
      if (raw === null || attempt !== latest) return
      apply(raw)
    })
    .catch(() => {
      if (attempt !== latest) return
      toast.error('That share link is broken', { description: 'Your own setup is unchanged.' })
    })
}

function apply(raw: unknown) {
  const { config, warnings } = normalizeConfig(raw)
  const { name, className } = SPEC_META[config.spec]
  if (!isVisibleSpec(config.spec)) {
    toast.error(`That link is for a ${name} ${className}`, { description: 'This sim doesn’t cover that spec, so your own setup is unchanged.' })
    return
  }
  const switched = config.spec !== useSetup.getState().config.spec
  useSetup.getState().replace(config)
  // One at a time: a newer link's notice replaces this one.
  toast('Loaded a shared setup', { id: 'shared-link', description: loadedDescription(switched ? config.spec : null, warnings) })
}

/** Loads share links on open and on hashchange. Call once, from App. */
export function useSharedLink() {
  useEffect(() => {
    loadSharedLink()
    window.addEventListener('hashchange', loadSharedLink)
    return () => window.removeEventListener('hashchange', loadSharedLink)
  }, [])
}
