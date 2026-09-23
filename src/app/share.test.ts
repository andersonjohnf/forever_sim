import { afterEach, describe, expect, it, vi } from 'vitest'
import { itemData } from '@/lib/items'
import { buffCatalogue, defaultConfig, enchantCatalogue, getSpec, SPEC_IDS, type GearSlot, type SimConfig, type SpecId } from '@/sim'
import { GEAR_SLOTS } from '@/sim/config/normalize'
import { BrokenShareLinkError, MAX_LINK_CHARS, MAX_SETUP_BYTES, packSetup, readSharedSetup, unpackSetup } from './share'

/** The largest setup the app can save for a spec: every slot enchanted, every buff and setting saved. */
function largestSetup(spec: SpecId): SimConfig {
  const d = defaultConfig(spec)
  const itemId = Math.max(...itemData.items.map((i) => i.id))
  const enchantId = enchantCatalogue.reduce((a, e) => (e.id.length > a.length ? e.id : a), '')
  const gear: SimConfig['gear'] = {}
  for (const slot of GEAR_SLOTS as GearSlot[]) gear[slot] = { itemId, enchantId }
  const rotation: SimConfig['rotation'] = {}
  for (const o of getSpec(spec).rotationOptions) {
    rotation[o.id] =
      o.kind === 'toggle'
        ? false
        : o.kind === 'choice'
          ? o.choices.reduce((a, c) => (String(c.value).length > String(a).length ? c.value : a), o.choices[0].value)
          : 12345.678901234
  }
  return {
    ...d,
    race: 'alliance-skyborne-high-order',
    talents: `${'5'.repeat(28)}-${'5'.repeat(28)}-${'5'.repeat(28)}`,
    gear,
    buffs: { raid: [...d.buffs.raid], enabled: buffCatalogue.map((b) => b.id) },
    rotation,
    fight: {
      ...d.fight,
      durationVariationPct: 12.345678901234,
      executePct: 20.123456789012,
      damageTakenPerSec: 123.456789012345,
      boss: { ...d.fight.boss, swingSpeedSec: 1.23456789012345, damageMin: 12345.6789012345, damageMax: 19999.999999999 },
    },
    // The longest damage-taken rage model id.
    rules: { profile: 'classicEra', unmeasuredRatings: 'ignore', damageTakenRage: 'foreverHealthLost' },
    run: { mode: 'adaptive', iterations: 100000, seed: 4294967295 },
  }
}

describe('share links', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a setup', async () => {
    const config = defaultConfig('warrior-arms')
    expect(await unpackSetup(await packSetup(config))).toEqual(config)
  })

  it('fits the largest real setup in half of each size cap', async () => {
    for (const spec of SPEC_IDS) {
      const config = largestSetup(spec)
      const packed = await packSetup(config)
      expect(new TextEncoder().encode(JSON.stringify(config)).length, spec).toBeLessThanOrEqual(MAX_SETUP_BYTES / 2)
      expect(packed.length, spec).toBeLessThanOrEqual(MAX_LINK_CHARS / 2)
      expect(await unpackSetup(packed)).toEqual(config)
    }
  })

  it('refuses a link over the length cap without inflating it', async () => {
    await expect(unpackSetup('A'.repeat(MAX_LINK_CHARS + 1))).rejects.toBeInstanceOf(BrokenShareLinkError)
  })

  it('stops inflating a short link that inflates past the size cap (a deflate bomb)', async () => {
    const bomb = await packSetup({ padding: ' '.repeat(4 * 1024 * 1024) } as unknown as SimConfig)
    expect(bomb.length).toBeLessThan(MAX_LINK_CHARS)
    await expect(unpackSetup(bomb)).rejects.toBeInstanceOf(BrokenShareLinkError)
  })

  it('rejects corrupt links', async () => {
    await expect(unpackSetup('not base64!')).rejects.toThrow()
    await expect(unpackSetup('AAAA')).rejects.toThrow()
    const good = await packSetup(defaultConfig('warrior-fury'))
    await expect(unpackSetup(good.slice(0, good.length / 2))).rejects.toThrow()
  })

  it('clears the link from the URL before decoding it, so a bad one can’t fail again on reload', async () => {
    const replaceState = vi.fn()
    vi.stubGlobal('history', { replaceState })
    vi.stubGlobal('location', { hash: `#s=${'A'.repeat(MAX_LINK_CHARS + 1)}`, pathname: '/forever_sim/', search: '?x=1' })
    const reading = readSharedSetup()
    expect(replaceState).toHaveBeenCalledWith(null, '', '/forever_sim/?x=1')
    await expect(reading).rejects.toBeInstanceOf(BrokenShareLinkError)
  })

  it('leaves a URL without a link alone', async () => {
    const replaceState = vi.fn()
    vi.stubGlobal('history', { replaceState })
    vi.stubGlobal('location', { hash: '#other', pathname: '/forever_sim/', search: '' })
    expect(await readSharedSetup()).toBeUndefined()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('reads a link whose JSON is null as null, not as no link', async () => {
    vi.stubGlobal('history', { replaceState: vi.fn() })
    vi.stubGlobal('location', { hash: `#s=${await packSetup(null as unknown as SimConfig)}`, pathname: '/forever_sim/', search: '' })
    expect(await readSharedSetup()).toBeNull()
  })
})
