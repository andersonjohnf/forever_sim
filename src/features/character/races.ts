import type { Faction } from '@/data/races/types'
import { computeSheet, defaultConfig, type SpecId } from '@/sim'
import type { FactionGearChange } from './faction-gear'

const simulatable = new Map<string, boolean>()

/**
 * Whether the sim knows the race's base attributes for the spec's class. Skyborne warriors' aren't
 * known yet (docs/mechanics/character-stats.md, OQ-1), so the engine refuses to simulate them.
 */
export function raceSimulatable(spec: SpecId, race: string): boolean {
  const key = `${spec}:${race}`
  let known = simulatable.get(key)
  if (known === undefined) {
    const sheet = computeSheet({ ...defaultConfig(spec), race })
    known = sheet !== null && !sheet.unknown.includes('base attributes')
    simulatable.set(key, known)
  }
  return known
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** The toast after a race change that moved faction-bound gear, or null when nothing changed. */
export function raceChangeMessage(change: FactionGearChange, faction: Faction): { title: string; description: string } | null {
  const { swapped, kept } = change
  if (swapped.length === 0 && kept.length === 0) return null
  const keptNames = list(kept.map((k) => k.item.name))
  const keptLine = kept.length
    ? `Kept ${keptNames}: ${kept.length === 1 ? 'it has' : 'they have'} no ${faction} version, so pick ${kept.length === 1 ? 'a replacement' : 'replacements'} under Gear.`
    : ''
  if (swapped.length === 0) return { title: `Your gear includes items a ${faction} character can’t wear`, description: keptLine }
  const swappedLine = `${list(swapped.map((s) => s.to.name))}, with the same stats.`
  return {
    title:
      swapped.length === 1
        ? `Swapped 1 item for its ${faction} version`
        : `Swapped ${swapped.length} items for their ${faction} versions`,
    description: kept.length ? `${swappedLine} ${keptLine}` : swappedLine,
  }
}
