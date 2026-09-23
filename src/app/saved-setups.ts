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

export const SAVED_SETUPS_KEY = 'forever-sim:saved-setups'
export const SAVED_SETUPS_VERSION = 1
export const MAX_NAME_LENGTH = 60

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
  /** What normalizing repaired: the parts that were out of date, now back to their defaults. */
  warnings: string[]
}

// ---- Names ----

/** A name as it's kept: trimmed, with each run of spaces as one. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

/** Why a name can't be used, or null if it can. */
export function nameProblem(name: string): string | null {
  const clean = cleanName(name)
  if (!clean) return 'Enter a name.'
  if (clean.length > MAX_NAME_LENGTH) return `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`
  return null
}

/** A name as names are compared: case and extra spaces don't count. */
const sameNameKey = (name: string) => cleanName(name).toLocaleLowerCase()

/** Whether two names are the same save's. Case and extra spaces don't count. */
export function sameName(a: string, b: string): boolean {
  return sameNameKey(a) === sameNameKey(b)
}

/** The save with this name, if there is one. */
export function findByName<T extends { name: string }>(setups: readonly T[], name: string): T | undefined {
  return setups.find((s) => sameName(s.name, name))
}

/**
 * `name`, or, if a save already has it, "name (2)", "name (3)" and so on, kept within
 * MAX_NAME_LENGTH. A name that already ends in a number counts on from it: "Fury (2)" → "Fury (3)".
 */
export function uniqueName(name: string, setups: readonly { name: string }[]): string {
  const clean = cleanName(name) || 'Setup'
  const first = clean.slice(0, MAX_NAME_LENGTH).trimEnd()
  if (!findByName(setups, first)) return first
  const base = clean.replace(/ \(\d+\)$/, '')
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const candidate = `${base.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`
    if (!findByName(setups, candidate)) return candidate
  }
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

/** A stored entry (or a setups file's), tidied, or null if it can't be read. */
export function readEntry(entry: unknown): StoredSetup | null {
  if (!isObj(entry)) return null
  const { id, name, savedAt, config } = entry
  if (typeof id !== 'string' || !id) return null
  if (typeof name !== 'string' || !cleanName(name)) return null
  if (typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) return null
  if (!isObj(config)) return null
  return { id, name: cleanName(name).slice(0, MAX_NAME_LENGTH).trimEnd(), savedAt, config }
}

export type ParsedSetups =
  | { ok: true; setups: StoredSetup[]; /** Entries that couldn't be read, left out. */ skipped: number }
  /** corrupt: not the stored form at all. newer: a newer version of the app wrote it. */
  | { ok: false; problem: 'corrupt' | 'newer' }

/** Reads the stored form: JSON text, or null when nothing's been saved yet. */
export function parseSavedSetups(text: string | null): ParsedSetups {
  if (text === null) return { ok: true, setups: [], skipped: 0 }
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
  let skipped = 0
  for (const entry of data.setups) {
    const setup = readEntry(entry)
    // Ids are unique: a repeat is a copy, and the first one stands.
    if (setup && !setups.some((s) => s.id === setup.id)) setups.push(setup)
    else skipped++
  }
  return { ok: true, setups, skipped }
}

/** The stored form of a list. */
export function serializeSavedSetups(setups: readonly StoredSetup[]): string {
  const file: SavedSetupsFile = { version: SAVED_SETUPS_VERSION, setups: [...setups] }
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
 * - One that's saved already, under the same name (case doesn't count) with the same config, isn't
 *   added again, so importing a file twice adds nothing the second time.
 * - The file's current setup is added as "Imported · 23 Sep", saved now, unless a save (one of the
 *   file's included) has the same config: then it's in the list already.
 */
export function importSetups(
  setups: readonly StoredSetup[],
  entries: readonly StoredSetup[],
  current: object | null,
  now: Date,
  newId: () => string,
): { setups: StoredSetup[] } & Imported {
  let list = [...setups]
  const added: StoredSetup[] = []
  let duplicates = 0
  // Kept as they grow, so a big file doesn't compare every pair of configs afresh.
  const ids = new Set(list.map((s) => s.id))
  const configs = new Set(list.map((s) => canonical(s.config)))
  const savedKey = (s: StoredSetup) => `${sameNameKey(s.name)}\n${canonical(s.config)}`
  const saved = new Set(list.map(savedKey))
  const shown = list.filter(isShown)
  const add = (setup: StoredSetup) => {
    list = addSetup(list, setup)
    added.push(setup)
    ids.add(setup.id)
    configs.add(canonical(setup.config))
    saved.add(savedKey(setup))
    if (isShown(setup)) shown.push(setup)
  }
  for (const entry of entries) {
    if (saved.has(savedKey(entry))) {
      duplicates++
      continue
    }
    // Names are matched among the shown saves only (isShown), as saving does.
    const name = isShown(entry) ? uniqueName(entry.name, shown) : entry.name
    add({ ...entry, id: ids.has(entry.id) ? newId() : entry.id, name })
  }
  if (current !== null && !configs.has(canonical(current))) {
    add({ id: newId(), name: uniqueName(`Imported · ${formatDay(now)}`, shown), savedAt: now.toISOString(), config: current })
  }
  return { setups: list, added, duplicates }
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
 * - corrupt: what's stored isn't in the saves' form, so saving starts a new list
 * - newer: a newer version of the app wrote them (in another tab), so this one leaves them alone
 */
export type StorageProblem = 'blocked' | 'full' | 'corrupt' | 'newer'
type ReadProblem = Exclude<StorageProblem, 'full'>

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014)
  )
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

function writeStorage(setups: readonly StoredSetup[]): 'full' | 'blocked' | null {
  try {
    localStorage.setItem(SAVED_SETUPS_KEY, serializeSavedSetups(setups))
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
  skipped: number
  problem: ReadProblem | null
}

/** Reads the saves from storage again: when the list opens, or when another tab changes them. */
export function refreshSavedSetups(): ReadReport {
  const read = readStorage()
  if (!read.ok) {
    useSavedSetups.setState({ setups: [], problem: read.problem })
    return { skipped: 0, problem: read.problem }
  }
  useSavedSetups.setState({ setups: listSetups(read.setups), problem: null })
  return { skipped: read.skipped, problem: null }
}

/**
 * Every stored save, shown or not, as a setups file carries them; or, if they can't be read, none
 * and why.
 */
export function readStoredSetups(): { setups: StoredSetup[]; problem: ReadProblem | null } {
  const read = readStorage()
  return read.ok ? { setups: read.setups, problem: null } : { setups: [], problem: read.problem }
}

/** A change to the stored saves; or why a name can't be used; or why storage refused it. */
export type StorageResult<T> = Change<T> | { ok: false; problem: StorageProblem }

/**
 * Reads what's stored now (another tab may have changed it), applies `change` and writes the
 * result. What's stored but unreadable (corrupt) is replaced, and entries that couldn't be read
 * go; saves a newer version of the app wrote are left alone.
 */
function modify<T>(change: (setups: StoredSetup[]) => Change<T>): StorageResult<T> {
  const read = readStorage()
  if (!read.ok && read.problem !== 'corrupt') {
    useSavedSetups.setState({ setups: [], problem: read.problem })
    return { ok: false, problem: read.problem }
  }
  const result = change(read.ok ? read.setups : [])
  if (!result.ok) return result
  const problem = writeStorage(result.setups)
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
