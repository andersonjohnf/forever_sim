// Saved setups (docs/ux.md#setups, decision D21): named copies of setups, their spec included,
// kept in this browser under their own localStorage key, apart from the automatic save
// (src/app/setup-store.ts).
//
// Two layers:
// - Pure functions over the stored list (StoredSetup[]): parse and serialize the stored form, list
//   what to show, and add, replace, save, rename, delete and import. A setups file
//   (src/app/setups-file.ts) carries its saves in the stored form.
// - A small store that reads and writes localStorage, every access in try/catch, and reports what
//   went wrong for the UI to say.
import { create } from 'zustand'
import { normalizeConfig, SPEC_IDS, type SimConfig, type SpecId } from '@/sim'
import { isVisibleSpec } from './specs'
import { isQuotaError } from './storage-errors'

export const SAVED_SETUPS_KEY = 'forever-sim:saved-setups'
export const SAVED_SETUPS_VERSION = 1
/** The most characters in a name, counted as a reader counts them (`characters`). */
export const MAX_NAME_LENGTH = 60
/**
 * The most UTF-16 code units in a name, the name fields' `maxLength`: room for 60 of the longest
 * emoji (a kiss with two skin tones is 15), while a letter under hundreds of accents, one
 * character however long, can't fill the browser's storage.
 */
export const MAX_NAME_UNITS = 16 * MAX_NAME_LENGTH

/**
 * A saved setup as it's stored. Its config is as it was saved, maybe by an older version of the
 * app, so it's normalized before use (readSetup).
 */
export interface StoredSetup {
  id: string
  name: string
  /** When it was saved, or last saved over: an ISO 8601 date. */
  savedAt: string
  config: unknown
}

/** The stored form: what localStorage holds under SAVED_SETUPS_KEY. */
export interface SavedSetupsFile {
  version: typeof SAVED_SETUPS_VERSION
  setups: StoredSetup[]
}

/** A saved setup as the list shows it: its config normalized for this version of the app. */
export interface SavedSetup {
  id: string
  name: string
  savedAt: string
  config: SimConfig
  /** What normalizing changed, in its own words: a setting reset, a rival buff turned off (load-notice.ts). */
  warnings: string[]
}

// ---- Names ----

/**
 * The longest raw name read from storage or a file, in UTF-16 code units, before it's tidied. A
 * name the app saved has at most MAX_NAME_UNITS, so the rest is cut before any work is done on it.
 */
export const MAX_RAW_NAME_UNITS = 4 * MAX_NAME_UNITS
/** The longest id read from storage or a file. The app's own are 36 characters (a UUID) or fewer. */
export const MAX_ID_LENGTH = 64

const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

/**
 * A text's characters as a reader counts them: its graphemes, so an emoji is one, a skin tone or a
 * family joined with ZWJs included. A browser without Intl.Segmenter counts code points instead.
 * Lazy, so a long text is read only as far as it's needed.
 */
function* characters(text: string): Generator<string> {
  if (graphemes === null) yield* text
  else for (const { segment } of graphemes.segment(text)) yield segment
}

/**
 * The start of `text`: at most `max` characters (`characters`) and `maxUnits` UTF-16 code units,
 * cut only between characters, so an emoji is never cut in half.
 */
function truncate(text: string, max = MAX_NAME_LENGTH, maxUnits = MAX_NAME_UNITS): string {
  let out = ''
  let n = 0
  for (const char of characters(text)) {
    if (n++ === max || out.length + char.length > maxUnits) break
    out += char
  }
  return out
}

/** A name's length as it's counted here (`characters`): an emoji is one character. */
function nameLength(name: string): number {
  let n = 0
  for (const _char of characters(name)) n++
  return n
}

/**
 * A name as it's kept: in Unicode's composed form (NFC, so an "é" typed either way is the same
 * name), trimmed, with each run of spaces as one.
 */
export function cleanName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Why a name can't be used, or null if it can. Save and Rename both check it. */
export function nameProblem(name: string): string | null {
  const clean = cleanName(name)
  if (!clean) return 'Enter a name.'
  if (clean.length > MAX_NAME_UNITS || nameLength(clean) > MAX_NAME_LENGTH) return `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`
  return null
}

/**
 * A name as names are compared: case and extra spaces don't count. The lowercase is Unicode's
 * own, the same in every locale (a Turkish browser's toLocaleLowerCase makes "I" another letter).
 */
const sameNameKey = (name: string) => cleanName(name).toLowerCase()

/** A name as it's compared without the number uniqueName gives it: "Raid night (2)" as "raid night". */
const baseNameKey = (name: string) => sameNameKey(cleanName(name).replace(/ \(\d+\)$/, ''))

/** Whether two names are the same save's. Case and extra spaces don't count. */
export function sameName(a: string, b: string): boolean {
  return sameNameKey(a) === sameNameKey(b)
}

/** The save with this name, if there is one. Save and Rename both find a clash with it. */
export function findByName<T extends { name: string }>(setups: readonly T[], name: string): T | undefined {
  const key = sameNameKey(name)
  return setups.find((s) => sameNameKey(s.name) === key)
}

/**
 * Makes names unique among `setups`' names and the ones it has made: `name`, or, if that's taken,
 * "name (2)", "name (3)" and so on, kept within MAX_NAME_LENGTH. A name that already ends in a
 * number counts on from it: "Fury (2)" → "Fury (3)". The taken names are a set, and each base name
 * remembers the number it reached, so naming a whole file's setups takes time in proportion to them.
 */
export function nameMaker(setups: readonly { name: string }[]): (name: string) => string {
  const taken = new Set(setups.map((s) => sameNameKey(s.name)))
  const next = new Map<string, number>()
  const take = (name: string) => {
    taken.add(sameNameKey(name))
    return name
  }
  return (name) => {
    const clean = cleanName(name) || 'Setup'
    const first = truncate(clean).trimEnd()
    if (!taken.has(sameNameKey(first))) return take(first)
    const base = clean.replace(/ \(\d+\)$/, '')
    const key = sameNameKey(base)
    for (let n = next.get(key) ?? 2; ; n++) {
      const suffix = ` (${n})`
      const candidate = `${truncate(base, MAX_NAME_LENGTH - suffix.length, MAX_NAME_UNITS - suffix.length).trimEnd()}${suffix}`
      if (!taken.has(sameNameKey(candidate))) {
        next.set(key, n + 1)
        return take(candidate)
      }
    }
  }
}

/** `name`, made unique among `setups`' names, as nameMaker makes it. */
export function uniqueName(name: string, setups: readonly { name: string }[]): string {
  return nameMaker(setups)(name)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "23 Sep", in local time. Spelled out here, so it reads the same in every browser and locale. */
export function formatDay(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** When a setup was saved, for its row: "23 Sep, 14:05" this year, "23 Sep 2025" before. */
export function formatSavedAt(savedAt: string, now = new Date()): string {
  const date = new Date(savedAt)
  if (date.getFullYear() !== now.getFullYear()) return `${formatDay(date)} ${date.getFullYear()}`
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${formatDay(date)}, ${time}`
}

// ---- The stored list ----

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The deepest a setup's objects and arrays nest: a real one nests 3 deep (gear, a slot, its item),
 * so this is room to grow. Anything deeper isn't a setup, and could overflow the stack of the code
 * that walks it (comparing configs, or JSON.stringify's replacer).
 */
export const MAX_CONFIG_DEPTH = 10

/** Whether `value`'s objects and arrays nest no deeper than `max` levels, `value` itself the first. */
export function withinDepth(value: unknown, max = MAX_CONFIG_DEPTH): boolean {
  if (typeof value !== 'object' || value === null) return true
  if (max === 0) return false
  for (const child of Object.values(value)) if (!withinDepth(child, max - 1)) return false
  return true
}

/**
 * A stored entry (or a setups file's), tidied, or null if it can't be read: an id of up to
 * MAX_ID_LENGTH characters, a name (cut to MAX_RAW_NAME_UNITS before it's tidied, then to
 * MAX_NAME_LENGTH characters and MAX_NAME_UNITS), a date, and a config object no deeper than
 * MAX_CONFIG_DEPTH.
 */
export function readEntry(entry: unknown): StoredSetup | null {
  if (!isObj(entry)) return null
  const { id, name: rawName, savedAt, config } = entry
  if (typeof id !== 'string' || !id || id.length > MAX_ID_LENGTH) return null
  if (typeof rawName !== 'string') return null
  const name = truncate(cleanName(truncate(rawName, Infinity, MAX_RAW_NAME_UNITS))).trimEnd()
  if (!name) return null
  if (typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) return null
  if (!isObj(config) || !withinDepth(config)) return null
  return { id, name, savedAt, config }
}

export type ParsedSetups =
  | {
      ok: true
      setups: StoredSetup[]
      /**
       * Entries that couldn't be read, or that repeat an id (a copy: the first one stands). They're
       * kept as they are, and written back after the readable ones, so nothing is lost.
       */
      unreadable: unknown[]
    }
  /** corrupt: not the stored form at all. newer: a newer version of the app wrote it. */
  | { ok: false; problem: 'corrupt' | 'newer' }

/** Reads the stored form: JSON text, or null when nothing's been saved yet. */
export function parseSavedSetups(text: string | null): ParsedSetups {
  if (text === null) return { ok: true, setups: [], unreadable: [] }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, problem: 'corrupt' }
  }
  if (!isObj(data)) return { ok: false, problem: 'corrupt' }
  if (typeof data.version === 'number' && data.version > SAVED_SETUPS_VERSION) return { ok: false, problem: 'newer' }
  if (data.version !== SAVED_SETUPS_VERSION || !Array.isArray(data.setups)) return { ok: false, problem: 'corrupt' }
  const setups: StoredSetup[] = []
  const unreadable: unknown[] = []
  const ids = new Set<string>()
  for (const entry of data.setups) {
    const setup = readEntry(entry)
    if (setup && !ids.has(setup.id)) {
      setups.push(setup)
      ids.add(setup.id)
    } else unreadable.push(entry)
  }
  return { ok: true, setups, unreadable }
}

/** The stored form of a list, with any entries that couldn't be read after it, as they were. */
export function serializeSavedSetups(setups: readonly StoredSetup[], unreadable: readonly unknown[] = []): string {
  const file: SavedSetupsFile = { version: SAVED_SETUPS_VERSION, setups: [...setups, ...(unreadable as StoredSetup[])] }
  return JSON.stringify(file)
}

/**
 * Whether a stored setup is shown. One whose spec the app doesn't offer (docs/ux.md principle 8),
 * or that a newer version of the app saved, is kept for later but not shown, rather than loaded as
 * something it isn't. Names are matched among the shown ones only.
 */
export function isShown(setup: StoredSetup): boolean {
  const config = setup.config as Obj
  if (config.version !== undefined && config.version !== 1) return false
  return SPEC_IDS.includes(config.spec as SpecId) && isVisibleSpec(config.spec as SpecId)
}

/** A stored setup normalized for this version of the app, or null if it isn't shown. */
export function readSetup(setup: StoredSetup): SavedSetup | null {
  if (!isShown(setup)) return null
  const { config, warnings } = normalizeConfig(setup.config)
  return { id: setup.id, name: setup.name, savedAt: setup.savedAt, config, warnings }
}

/** The saves to show, newest first. */
export function listSetups(setups: readonly StoredSetup[]): SavedSetup[] {
  return setups
    .map(readSetup)
    .filter((s) => s !== null)
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
}

/** A change to the list, or why a name can't be used. */
export type Change<T> = ({ ok: true; setups: StoredSetup[] } & T) | { ok: false; error: string }

/** Adds a save, whatever its name: pick one with uniqueName first to keep names apart. */
export function addSetup(setups: readonly StoredSetup[], setup: StoredSetup): StoredSetup[] {
  return [setup, ...setups]
}

/** Saves `config` over the save with this id, which keeps its name and counts as saved now. */
export function replaceSetup(setups: readonly StoredSetup[], id: string, config: SimConfig, savedAt: string): StoredSetup[] {
  return setups.map((s) => (s.id === id ? { ...s, config, savedAt } : s))
}

/**
 * Saves `config` under `name`: over the shown save that already has the name (`updated`), or as a
 * new one, whose id `newId` makes.
 */
export function saveSetup(
  setups: readonly StoredSetup[],
  name: string,
  config: SimConfig,
  savedAt: string,
  newId: () => string,
): Change<{ setup: StoredSetup; updated: boolean }> {
  const error = nameProblem(name)
  if (error) return { ok: false, error }
  const existing = findByName(setups.filter(isShown), name)
  if (existing) {
    // Under the name as typed this time, in case its case changed.
    const renamed = replaceSetup(setups, existing.id, config, savedAt).map((s) => (s.id === existing.id ? { ...s, name: cleanName(name) } : s))
    return { ok: true, setups: renamed, setup: renamed.find((s) => s.id === existing.id)!, updated: true }
  }
  const setup: StoredSetup = { id: newId(), name: cleanName(name), savedAt, config }
  return { ok: true, setups: addSetup(setups, setup), setup, updated: false }
}

/** Renames a save. A name another save has is refused, so a rename never replaces a save. */
export function renameSetup(setups: readonly StoredSetup[], id: string, name: string): Change<{ setup: StoredSetup }> {
  const error = nameProblem(name)
  if (error) return { ok: false, error }
  const target = setups.find((s) => s.id === id)
  if (!target) return { ok: false, error: 'That setup isn’t saved any more.' }
  if (setups.some((s) => s.id !== id && isShown(s) && sameName(s.name, name))) return { ok: false, error: 'Another saved setup has that name.' }
  const setup = { ...target, name: cleanName(name) }
  return { ok: true, setups: setups.map((s) => (s.id === id ? setup : s)), setup }
}

/** Removes a save. */
export function deleteSetup(setups: readonly StoredSetup[], id: string): StoredSetup[] {
  return setups.filter((s) => s.id !== id)
}

/**
 * A config as text that doesn't depend on its keys' order, so two copies of a setup compare equal
 * however they were written.
 */
function canonical(config: unknown): string {
  return JSON.stringify(config, (_key, value: unknown) =>
    isObj(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : value,
  )
}

/** Whether two configs are the same setup, as stored: key order doesn't count. */
export function sameConfig(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b)
}

/** What importing a file's setups added, and how many of them were saved already. */
export interface Imported {
  added: StoredSetup[]
  duplicates: number
}

/**
 * Adds a setups file's saves to the list, without replacing any (docs/ux.md#setups, D21):
 * - Each keeps its date and config, and its name, made unique among the shown saves as a new save's
 *   is ("Raid night (2)"). It keeps its id too, unless a save has that id already.
 * - One that's saved already isn't added again, so importing a file twice adds nothing the second
 *   time: a save with the same config, and either the same name (case, and a number the import
 *   gave it, don't count: "raid night (2)" is "Raid night") or the same id.
 * - The file's current setup is added as "Imported · 23 Sep", saved now, unless a save (one of the
 *   file's included) has the same config: then it's in the list already.
 * What's been seen is kept in sets as it grows, so the time taken is in proportion to the setups.
 */
export function importSetups(
  setups: readonly StoredSetup[],
  entries: readonly StoredSetup[],
  current: object | null,
  now: Date,
  newId: () => string,
): { setups: StoredSetup[] } & Imported {
  const added: StoredSetup[] = []
  let duplicates = 0
  const ids = new Set<string>()
  const configs = new Set<string>()
  // A save's config with its name (as compared, without a number), and with its id.
  const byName = new Set<string>()
  const byId = new Set<string>()
  const remember = (setup: StoredSetup, config: string) => {
    ids.add(setup.id)
    configs.add(config)
    byName.add(`${baseNameKey(setup.name)}\n${config}`)
    byId.add(`${setup.id}\n${config}`)
  }
  for (const setup of setups) remember(setup, canonical(setup.config))
  // Names are matched among the shown saves only (isShown), as saving does.
  const unique = nameMaker(setups.filter(isShown))
  const add = (setup: StoredSetup, config: string) => {
    added.push(setup)
    remember(setup, config)
  }
  for (const entry of entries) {
    const config = canonical(entry.config)
    if (byName.has(`${baseNameKey(entry.name)}\n${config}`) || byId.has(`${entry.id}\n${config}`)) {
      duplicates++
      continue
    }
    const name = isShown(entry) ? unique(entry.name) : entry.name
    add({ ...entry, id: ids.has(entry.id) ? newId() : entry.id, name }, config)
  }
  if (current !== null) {
    const config = canonical(current)
    if (!configs.has(config)) add({ id: newId(), name: unique(`Imported · ${formatDay(now)}`), savedAt: now.toISOString(), config: current }, config)
  }
  // Newest addition first, as adding them one by one would put them.
  return { setups: [...[...added].reverse(), ...setups], added, duplicates }
}

/** A new save's id. */
export function newSetupId(): string {
  // randomUUID needs a secure context: GitHub Pages and localhost are; a dev server on a LAN IP isn't.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ---- Browser storage ----

/**
 * Why the saves can't be used:
 * - blocked: the browser refuses this site storage (site data blocked, some private modes)
 * - full: this site's storage is full
 * - corrupt: what's stored isn't in the saves' form, so the next save replaces it with a new list
 * - newer: a newer version of the app wrote them (in another tab), so this one leaves them alone
 */
export type StorageProblem = 'blocked' | 'full' | 'corrupt' | 'newer'
type ReadProblem = Exclude<StorageProblem, 'full'>

/** What a change to the saves was, for the words when storage refuses it. */
export type StorageAction = 'save' | 'rename' | 'delete' | 'import'

/** What makes room when storage is full of something other than saves. */
const CLEAR_SITE_DATA = 'Clearing this site’s data in your browser’s settings makes room, and resets your setup too.'

/**
 * Why storage refused a change, in words for what was being done and what's saved: full storage
 * asks you to delete a save only when there's one to delete.
 */
export function storageMessage(problem: StorageProblem, action: StorageAction, hasSaves: boolean): string {
  switch (problem) {
    case 'blocked':
      return 'Your browser is blocking storage for this site. Allow site data for it, then try again.'
    case 'newer':
      return 'A newer version of the app saved your setups in another tab. Reload this page, then try again.'
    case 'corrupt':
      return 'Your saved setups couldn’t be read. Try again.'
    case 'full':
      if (action === 'import') {
        return hasSaves
          ? 'Those setups don’t fit in your browser’s storage for this site. Delete saved setups you don’t need, then try again.'
          : 'Those setups don’t fit in your browser’s storage for this site. Try a file with fewer setups.'
      }
      // Deleting frees room, so it's full only if something else filled it meanwhile.
      if (action === 'delete') return 'Your browser’s storage for this site is full. Reload this page, then try again.'
      return hasSaves
        ? 'Your browser’s storage for this site is full. Delete a saved setup you don’t need, then try again.'
        : `Your browser’s storage for this site is full, but not with saved setups. ${CLEAR_SITE_DATA}`
  }
}

/**
 * Why the automatic save failed on full storage (src/app/setup-store.ts): the setup will be lost
 * when the page closes, and what makes room, worded as storageMessage words it. It asks you to
 * delete saves only when there are some to delete.
 */
export function autoSaveFullMessage(hasSaves: boolean): string {
  return hasSaves
    ? 'Your browser’s storage for this site is full, so this setup will be lost when you close the page. Delete saved setups you don’t need to make room.'
    : `Your browser’s storage for this site is full, but not with saved setups, so this setup will be lost when you close the page. ${CLEAR_SITE_DATA}`
}

function readStorage(): ParsedSetups | { ok: false; problem: 'blocked' } {
  let text: string | null
  try {
    text = localStorage.getItem(SAVED_SETUPS_KEY)
  } catch {
    return { ok: false, problem: 'blocked' }
  }
  return parseSavedSetups(text)
}

function writeStorage(setups: readonly StoredSetup[], unreadable: readonly unknown[]): 'full' | 'blocked' | null {
  try {
    localStorage.setItem(SAVED_SETUPS_KEY, serializeSavedSetups(setups, unreadable))
    return null
  } catch (error) {
    return isQuotaError(error) ? 'full' : 'blocked'
  }
}

interface SavedSetupsState {
  /** The saves to show, newest first. */
  setups: SavedSetup[]
  /** Why the stored saves couldn't be read when last read, if they couldn't. */
  problem: ReadProblem | null
}

/** The saved setups as last read from storage. refreshSavedSetups reads them again. */
export const useSavedSetups = create<SavedSetupsState>()(() => ({ setups: [], problem: null }))

/** What a read found that's worth saying: entries that couldn't be read, or why none could be. */
export interface ReadReport {
  /** Entries that couldn't be read: kept as they are, but not shown. */
  unreadable: number
  problem: ReadProblem | null
}

/** Reads the saves from storage again: when the list opens, or when another tab changes them. */
export function refreshSavedSetups(): ReadReport {
  const read = readStorage()
  if (!read.ok) {
    useSavedSetups.setState({ setups: [], problem: read.problem })
    return { unreadable: 0, problem: read.problem }
  }
  useSavedSetups.setState({ setups: listSetups(read.setups), problem: null })
  return { unreadable: read.unreadable.length, problem: null }
}

/**
 * Whether storage holds a save the list shows, one you could delete to make room: read afresh,
 * since the list is only read while the Setups sheet is open.
 */
export function hasShownSaves(): boolean {
  const read = readStorage()
  return read.ok && read.setups.some(isShown)
}

/**
 * Every stored save, shown or not, as a setups file carries them, with any entries that couldn't be
 * read, as they are; or, if the saves can't be read at all, none and why.
 */
export function readStoredSetups(): { setups: StoredSetup[]; unreadable: unknown[]; problem: ReadProblem | null } {
  const read = readStorage()
  return read.ok ? { setups: read.setups, unreadable: read.unreadable, problem: null } : { setups: [], unreadable: [], problem: read.problem }
}

/** A change to the stored saves; or why a name can't be used; or why storage refused it. */
export type StorageResult<T> = Change<T> | { ok: false; problem: StorageProblem }

/**
 * Reads what's stored now (another tab may have changed it), applies `change` and writes the
 * result. Saves a newer version of the app wrote are left alone. Storage that isn't in the saves'
 * form at all (corrupt) is replaced by the new list; the sheet says so before you save.
 *
 * Entries that couldn't be read are kept as they are, after the readable ones, so a later version
 * of the app may still read them; one with the id of a save that `change` removed goes with it,
 * since it's a copy of that save.
 */
function modify<T>(change: (setups: StoredSetup[]) => Change<T>): StorageResult<T> {
  const read = readStorage()
  if (!read.ok && read.problem !== 'corrupt') {
    useSavedSetups.setState({ setups: [], problem: read.problem })
    return { ok: false, problem: read.problem }
  }
  const before = read.ok ? read.setups : []
  const result = change(before)
  if (!result.ok) return result
  const remaining = new Set(result.setups.map((s) => s.id))
  const removed = new Set(before.filter((s) => !remaining.has(s.id)).map((s) => s.id))
  const unreadable = (read.ok ? read.unreadable : []).filter((entry) => !(isObj(entry) && typeof entry.id === 'string' && removed.has(entry.id)))
  const problem = writeStorage(result.setups, unreadable)
  if (problem) return { ok: false, problem }
  useSavedSetups.setState({ setups: listSetups(result.setups), problem: null })
  return result
}

/** Saves `config` as `name`, over the save that has that name already, if one does. */
export function saveToStorage(name: string, config: SimConfig, now = new Date()): StorageResult<{ setup: StoredSetup; updated: boolean }> {
  return modify((setups) => saveSetup(setups, name, config, now.toISOString(), newSetupId))
}

/** Renames a save. */
export function renameInStorage(id: string, name: string): StorageResult<{ setup: StoredSetup }> {
  return modify((setups) => renameSetup(setups, id, name))
}

/** Deletes a save. */
export function deleteFromStorage(id: string): StorageResult<object> {
  return modify((setups) => ({ ok: true, setups: deleteSetup(setups, id) }))
}

/** Adds a setups file's saves, and its current setup, to the stored saves (importSetups). */
export function importToStorage(entries: readonly StoredSetup[], current: object | null, now = new Date()): StorageResult<Imported> {
  return modify((setups) => ({ ok: true, ...importSetups(setups, entries, current, now, newSetupId) }))
}
