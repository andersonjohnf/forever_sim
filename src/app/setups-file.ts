// Setups files (docs/ux.md#setups, decision D21): Export's "Download all setups" saves every saved
// setup and the current one as a .json file, and Import's "Add setups from a file…" adds a file's
// setups to the saved ones. Pure functions: the Setups sheet reads and writes the file and the
// stored saves.
import type { SimConfig } from '@/sim'
import { readEntry, withinDepth, type StoredSetup } from './saved-setups'
import { MAX_SETUP_BYTES } from './share'

export const SETUPS_FILE_APP = 'forever-sim'
export const SETUPS_FILE_VERSION = 1

/**
 * The largest file that's read. Browsers give a site about 5 MB of localStorage, shared with the
 * automatic save, so a larger file can't have come from a browser's saves, nor fit back into them.
 * A saved setup is about 1 to 5 KB, so a real file is far smaller.
 */
export const MAX_SETUPS_FILE_BYTES = 5 * 1024 * 1024
/** The most setups a file can hold, so a crafted one can't bury the list. */
export const MAX_SETUPS_FILE_SETUPS = 1000

/** A setups file: `app` and `version` say what it is; `setups` are the saves in their stored form. */
export interface SetupsFile {
  app: typeof SETUPS_FILE_APP
  version: typeof SETUPS_FILE_VERSION
  /** When it was downloaded: an ISO 8601 date. */
  exportedAt: string
  /** The setup that was current when it was downloaded. */
  current: SimConfig
  setups: StoredSetup[]
}

/**
 * The file for a download: the current setup, and every save as it's stored. Entries the app
 * couldn't read go in too, after the rest, as they are, so the file keeps everything that's stored;
 * an import leaves them out and counts them, as the sheet does.
 */
export function buildSetupsFile(current: SimConfig, setups: readonly StoredSetup[], now: Date, unreadable: readonly unknown[] = []): SetupsFile {
  return {
    app: SETUPS_FILE_APP,
    version: SETUPS_FILE_VERSION,
    exportedAt: now.toISOString(),
    current,
    setups: [...setups, ...(unreadable as StoredSetup[])],
  }
}

/** The file's text: indented, so it reads in a text editor. */
export function serializeSetupsFile(file: SetupsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/** "forever-sim-setups-2026-09-23.json", on the local date. */
export function setupsFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `forever-sim-setups-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/**
 * Why a file can't be imported:
 * - notOurs: not JSON, or not a Forever Sim setups file
 * - newer: a newer version of the app wrote it
 * - damaged: it says it's a setups file, but it doesn't parse (cut short), or its setups aren't a
 *   list, or importing it failed
 * - tooLarge: over MAX_SETUPS_FILE_BYTES, or holding more than MAX_SETUPS_FILE_SETUPS setups
 * - empty: it holds no setups at all
 */
export type SetupsFileProblem = 'notOurs' | 'newer' | 'damaged' | 'tooLarge' | 'empty'

export type ParsedSetupsFile =
  | {
      ok: true
      /** The saves that can be read, tidied (readEntry). */
      setups: StoredSetup[]
      /** The setup that was current when the file was downloaded, as it was written, if it can be read. */
      current: object | null
      /** Setups that couldn't be read, or were over MAX_SETUP_BYTES: left out. */
      skipped: number
    }
  | { ok: false; problem: SetupsFileProblem }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length

/** A config no larger than a share link's (MAX_SETUP_BYTES), so a file can't hold what a link couldn't. */
const fits = (config: unknown) => utf8Bytes(JSON.stringify(config)) <= MAX_SETUP_BYTES

/** Text that says it's a setups file, `"app": "forever-sim"`, whether or not the rest parses. */
const NAMES_THE_APP = new RegExp(`"app"\\s*:\\s*"${SETUPS_FILE_APP}"`)

/** Reads a setups file's text. */
export function parseSetupsFile(text: string): ParsedSetupsFile {
  if (utf8Bytes(text) > MAX_SETUPS_FILE_BYTES) return { ok: false, problem: 'tooLarge' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    // A file that names the app but doesn't parse was one of ours, cut short or edited: damaged.
    return { ok: false, problem: NAMES_THE_APP.test(text) ? 'damaged' : 'notOurs' }
  }
  if (!isObj(data) || data.app !== SETUPS_FILE_APP) return { ok: false, problem: 'notOurs' }
  if (typeof data.version === 'number' && data.version > SETUPS_FILE_VERSION) return { ok: false, problem: 'newer' }
  if (data.version !== SETUPS_FILE_VERSION || !Array.isArray(data.setups)) return { ok: false, problem: 'damaged' }
  if (data.setups.length > MAX_SETUPS_FILE_SETUPS) return { ok: false, problem: 'tooLarge' }

  const setups: StoredSetup[] = []
  let skipped = 0
  for (const entry of data.setups) {
    const setup = readEntry(entry)
    if (setup && fits(setup.config)) setups.push(setup)
    else skipped++
  }
  let current: object | null = null
  if (data.current !== undefined) {
    if (isObj(data.current) && withinDepth(data.current) && fits(data.current)) current = data.current
    else skipped++
  }
  if (setups.length === 0 && current === null && skipped === 0) return { ok: false, problem: 'empty' }
  return { ok: true, setups, current, skipped }
}

/** What a file's import did, for its notice. */
export interface ImportCounts {
  /** Setups added that the list shows. */
  shown: number
  /** Setups added but not shown: for a spec the sim doesn't cover, or from a newer version (isShown). */
  hidden: number
  /** The file's saves that were saved already, so weren't added again. */
  duplicates: number
  /** The file's setups that couldn't be read, left out. */
  skipped: number
}

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/**
 * The notice for an import that added something, or found it all saved already: "Imported 3
 * setups", and what else happened. Null when nothing could be read at all, which the sheet says
 * under the button instead.
 */
export function importNotice({ shown, hidden, duplicates, skipped }: ImportCounts): { title: string; description?: string } | null {
  const added = shown + hidden
  if (added === 0 && duplicates === 0) return null
  const title = added === 0 ? 'Nothing new to import' : `Imported ${count(added, 'setup', 'setups')}`
  const parts = [
    duplicates === 0 ? '' : added === 0 ? 'Every setup in that file is saved already.' : `${count(duplicates, 'was', 'were')} saved already.`,
    hidden === 0 ? '' : `${count(hidden, 'is', 'are')} kept but not shown: this version of the sim can’t load ${hidden === 1 ? 'it' : 'them'}.`,
    skipped === 0 ? '' : `${count(skipped, 'couldn’t', 'couldn’t')} be read, so ${skipped === 1 ? 'it was' : 'they were'} left out.`,
  ]
  return { title, description: parts.filter(Boolean).join(' ') || undefined }
}
