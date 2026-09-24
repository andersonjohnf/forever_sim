import { describe, expect, it, vi } from 'vitest'
import { defaultConfig, GEAR_SLOTS, normalizeConfig, type GearSlot, type SimConfig } from '@/sim'
import { followDefaults, legacyFollowing } from './follow-defaults'
import { LEGACY_DEFAULTS, type LegacyEntry } from './legacy-defaults'

// docs/architecture.md "Following the defaults": the migration reads a frozen snapshot, never
// today's defaults, so a save holding ee171d2a's defaults keeps migrating after they change. Here
// the Protection paladin's defaults change as another branch is about to change them: a new talent
// build, and a new helm.

const NEW_TALENTS = '240003-0530213321301551-502'
const NEW_HEAD = { itemId: 16731, enchantId: 'arcanumFocus' }

vi.mock('@/sim', async (importOriginal) => {
  const sim = await importOriginal<typeof import('@/sim')>()
  const changed = (spec: string) => spec === 'paladin-protection'
  return {
    ...sim,
    defaultTalents: (spec: Parameters<typeof sim.defaultTalents>[0]) => (changed(spec) ? NEW_TALENTS : sim.defaultTalents(spec)),
    defaultConfig: (...args: Parameters<typeof sim.defaultConfig>) => {
      const config = sim.defaultConfig(...args)
      return changed(args[0]) ? { ...config, talents: NEW_TALENTS, gear: { ...config.gear, head: NEW_HEAD } } : config
    },
  }
})

/** ee171d2a's untouched Human Protection paladin, as a save from then loads: 0/38/13 and the threat set. */
async function ee171d2aPaladin(): Promise<SimConfig> {
  const sim = await vi.importActual<typeof import('@/sim')>('@/sim')
  const frozen = LEGACY_DEFAULTS['paladin-protection']!
  const gear: SimConfig['gear'] = {}
  for (const [slot, [itemId, enchantId]] of Object.entries(frozen.sets[frozen.races['alliance-human'][0]]) as [GearSlot, LegacyEntry][]) {
    gear[slot] = enchantId === undefined ? { itemId } : { itemId, enchantId }
  }
  return normalizeConfig({ ...sim.defaultConfig('paladin-protection', 'alliance-human'), talents: frozen.talents, gear }).config
}

describe('a save from before `following`, after the defaults change', () => {
  it('still counts ee171d2a’s talents and gear as the defaults’, and moves them to the new ones', async () => {
    const old = await ee171d2aPaladin()
    expect(old.talents).toBe('-0530513321301551-50215')
    // The mock is in place: today's default differs from the save.
    expect(defaultConfig('paladin-protection').talents).toBe(NEW_TALENTS)

    const follow = legacyFollowing(old)
    expect(follow.talents).toBe(true)
    expect(follow.gear).toContain('head')
    expect(follow.gear).toEqual(GEAR_SLOTS)

    const moved = followDefaults(old, follow)
    expect(moved.talents).toBe(true)
    expect(moved.config.talents).toBe(NEW_TALENTS)
    expect(moved.gear).toBe(true)
    expect(moved.config.gear.head).toEqual(NEW_HEAD)
    expect({ ...moved.config.gear, head: old.gear.head }).toEqual(old.gear)
  })

  it('still leaves the player’s own talents alone', async () => {
    const old = { ...(await ee171d2aPaladin()), talents: '-0530513321301551-5021' }
    expect(legacyFollowing(old).talents).toBe(false)
  })
})
