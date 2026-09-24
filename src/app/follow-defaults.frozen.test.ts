import { describe, expect, it, vi } from 'vitest'
import { defaultConfig, GEAR_SLOTS, normalizeConfig, preRaidListGear, type GearSlot, type SimConfig, type SpecId } from '@/sim'
import { followDefaults, legacyFollowing } from './follow-defaults'
import { LEGACY_DEFAULTS, type LegacyEntry } from './legacy-defaults'

// docs/architecture.md "Following the defaults": the migration reads a frozen snapshot, never
// today's defaults, so a save holding ee171d2a's defaults keeps migrating after they change. Here
// the Protection paladin's defaults change as another branch is about to change them: a new talent
// build, and a new helm. Fury's helm changes too, in its default and its pre-raid list alike: Fury
// has no FORMER_GEAR table, so its ee171d2a gear can only be recognised from the snapshot.

const NEW_TALENTS = '240003-0530213321301551-502'
const NEW_HEAD = { itemId: 16731, enchantId: 'arcanumFocus' }
const NEW_FURY_HEAD = { itemId: 16731, enchantId: 'arcanumVoracityStrength' } // Helm of Valor, for Lionheart Helm

vi.mock('@/sim', async (importOriginal) => {
  const sim = await importOriginal<typeof import('@/sim')>()
  const withHead = <T extends object>(gear: T, head: unknown): T => ({ ...gear, head })
  return {
    ...sim,
    defaultTalents: (spec: Parameters<typeof sim.defaultTalents>[0]) =>
      spec === 'paladin-protection' ? NEW_TALENTS : sim.defaultTalents(spec),
    defaultConfig: (...args: Parameters<typeof sim.defaultConfig>) => {
      const config = sim.defaultConfig(...args)
      if (args[0] === 'paladin-protection') return { ...config, talents: NEW_TALENTS, gear: withHead(config.gear, NEW_HEAD) }
      if (args[0] === 'warrior-fury') return { ...config, gear: withHead(config.gear, NEW_FURY_HEAD) }
      return config
    },
    preRaidListGear: (...args: Parameters<typeof sim.preRaidListGear>) => {
      const gear = sim.preRaidListGear(...args)
      return args[0] === 'warrior-fury' ? withHead(gear, NEW_FURY_HEAD) : gear
    },
  }
})

/** A save of ee171d2a's untouched default for the spec and race: the snapshot's talents and gear. */
async function ee171d2aSave(spec: SpecId, race: string): Promise<SimConfig> {
  const sim = await vi.importActual<typeof import('@/sim')>('@/sim')
  const frozen = LEGACY_DEFAULTS[spec]!
  const gear: SimConfig['gear'] = {}
  for (const [slot, [itemId, enchantId]] of Object.entries(frozen.sets[frozen.races[race][0]]) as [GearSlot, LegacyEntry][]) {
    gear[slot] = enchantId === undefined ? { itemId } : { itemId, enchantId }
  }
  return normalizeConfig({ ...sim.defaultConfig(spec, race), talents: frozen.talents, gear }).config
}

/** ee171d2a's untouched Human Protection paladin, as a save from then loads: 0/38/13 and the threat set. */
const ee171d2aPaladin = () => ee171d2aSave('paladin-protection', 'alliance-human')

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

  it('recognises a spec with no former-gear table (Fury) from the snapshot alone', async () => {
    const old = await ee171d2aSave('warrior-fury', 'horde-orc')
    expect(old.gear.head?.itemId).toBe(12640)
    // The mocks are in place: today's default and pre-raid list both wear another helm.
    expect(defaultConfig('warrior-fury', 'horde-orc').gear.head).toEqual(NEW_FURY_HEAD)
    expect(preRaidListGear('warrior-fury', 'horde-orc').head).toEqual(NEW_FURY_HEAD)

    const follow = legacyFollowing(old)
    expect(follow.talents).toBe(true)
    expect(follow.gear).toEqual(GEAR_SLOTS)

    const moved = followDefaults(old, follow)
    expect(moved.gear).toBe(true)
    expect(moved.talents).toBe(false)
    expect(moved.config.gear.head).toEqual(NEW_FURY_HEAD)
    expect({ ...moved.config.gear, head: old.gear.head }).toEqual(old.gear)
  })
})
