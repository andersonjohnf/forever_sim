// Share links, on the way in (docs/ux.md#persistence-and-sharing): a #s=… link loads its setup and
// a notice says so, both when the page opens and when a link is pasted into a tab that already has
// the app open (only the hash changes, so the page doesn't reload). A link that isn't a setup the
// app can load is refused with a notice saying why, and your setup is left as it was.
import { useEffect } from 'react'
import { toast } from 'sonner'
import { normalizeConfig, SPEC_META, type SimConfig } from '@/sim'
import { replacedDescription } from './load-notice'
import { setupProblem, type SetupProblem } from './setup-code'
import { useSetup } from './setup-store'
import { hasSharedSetup, readSharedSetup } from './share'
import { isVisibleSpec } from './specs'

const UNCHANGED = 'Your own setup is unchanged.'

/** Why a link can't be loaded, as a notice: its title says why, and its description that nothing changed. */
export interface LinkRefusal {
  title: string
  description: string
}

export const BROKEN_LINK: LinkRefusal = { title: 'That share link is broken', description: `It couldn’t be loaded, so your own setup is unchanged.` }

const LINK_PROBLEMS: Record<SetupProblem, LinkRefusal> = {
  notASetup: { title: 'That share link is broken', description: `It doesn’t hold a setup, so your own setup is unchanged.` },
  newer: {
    title: 'That link is from a newer version of Forever Sim',
    description: `Reload this page to update it, then open the link again. ${UNCHANGED}`,
  },
  unknownSpec: { title: 'That link is for a spec this sim doesn’t know', description: `It couldn’t be loaded, so your own setup is unchanged.` },
}

/**
 * A link's setup, as unpacked, normalized for this version of the app; or why it can't be loaded:
 * refused before it's normalized (setupProblem), or for a spec the app doesn't offer yet.
 */
export function readLinkSetup(raw: unknown): { ok: true; config: SimConfig; warnings: string[] } | ({ ok: false } & LinkRefusal) {
  const problem = setupProblem(raw)
  if (problem) return { ok: false, ...LINK_PROBLEMS[problem] }
  const { config, warnings } = normalizeConfig(raw)
  if (!isVisibleSpec(config.spec)) {
    const { name, className } = SPEC_META[config.spec]
    return { ok: false, title: `That link is for a ${name} ${className}`, description: `This sim doesn’t cover that spec, so your own setup is unchanged.` }
  }
  return { ok: true, config, warnings }
}

/** Only the latest link applies, if two are pasted in quick succession. */
let latest = 0

/** One notice at a time: a newer link's replaces this one's, loaded or refused. */
const NOTICE_ID = 'shared-link'

function loadSharedLink() {
  // Reading a link takes it out of the URL before decoding it (src/app/share.ts), so a second
  // call for the same link (React's dev double effects) finds none, and doesn't count as a newer one.
  if (!hasSharedSetup()) return
  const attempt = ++latest
  readSharedSetup()
    .then((raw) => {
      if (raw === undefined || attempt !== latest) return
      apply(raw)
    })
    .catch(() => {
      if (attempt !== latest) return
      toast.error(BROKEN_LINK.title, { id: NOTICE_ID, description: BROKEN_LINK.description })
    })
}

function apply(raw: unknown) {
  const read = readLinkSetup(raw)
  if (!read.ok) {
    toast.error(read.title, { id: NOTICE_ID, description: read.description })
    return
  }
  const { config, warnings } = read
  const switched = config.spec !== useSetup.getState().config.spec
  useSetup.getState().replace(config)
  toast('Loaded a shared setup', { id: NOTICE_ID, description: replacedDescription(config.spec, switched, warnings) })
}

/** Loads share links on open and on hashchange. Call once, from App. */
export function useSharedLink() {
  useEffect(() => {
    loadSharedLink()
    window.addEventListener('hashchange', loadSharedLink)
    return () => window.removeEventListener('hashchange', loadSharedLink)
  }, [])
}
