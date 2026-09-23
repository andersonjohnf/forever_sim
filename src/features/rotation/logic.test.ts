// The Rotation tab's row states (docs/ux.md "Rotation"): each setting's default for the setup, the
// changed mark, a consumable switch without its Buffs switch, and settings whose parent is off.
import { describe, expect, it } from 'vitest'
import { defaultConfig, getSpec, type SimConfig } from '@/sim'
import { formatSetting, isAdvanced, rotationRows } from './logic'

const rows = (config: SimConfig, rotation: SimConfig['rotation'] = {}, enabled = config.buffs.enabled) =>
  rotationRows({ ...config, rotation }, getSpec(config.spec).rotationOptions, enabled)

describe('rotation rows', () => {
  const fury = defaultConfig('warrior-fury')
  const arms = defaultConfig('warrior-arms')

  it('marks nothing changed by default, and shows each value as its default', () => {
    for (const config of [fury, arms]) {
      for (const [id, row] of rows(config)) {
        expect(row.changed, id).toBe(false)
        expect(row.value, id).toEqual(row.default)
      }
    }
  })

  it('marks a saved value that differs from its default, but not one that matches it', () => {
    const r = rows(fury, { 'warrior.fury.heroicStrike.minRage': 50, 'warrior.fury.bloodthirst.enabled': true })
    expect(r.get('warrior.fury.heroicStrike.minRage')).toMatchObject({ value: 50, default: 42, changed: true })
    expect(r.get('warrior.fury.bloodthirst.enabled')).toMatchObject({ value: true, default: true, changed: false })
  })

  it('takes a default that follows another setting from that setting’s current value (Arms in Berserker Stance, warrior.md §5.3)', () => {
    const berserker = { 'warrior.arms.baseStance': 'berserker' }
    // Whirlwind's default follows the stance: on in Berserker Stance, so saving it off is a change.
    const r = rows(arms, { ...berserker, 'warrior.arms.whirlwind.enabled': false })
    expect(r.get('warrior.arms.whirlwind.enabled')).toMatchObject({ value: false, default: true, changed: true })
    expect(r.get('warrior.arms.baseStance')).toMatchObject({ value: 'berserker', default: 'battle', changed: true })
    // Rend is on with Bloodthrill in Battle Stance and off in Berserker Stance: saving it on is a change only there.
    expect(rows(arms, { 'warrior.arms.rend.enabled': true }).get('warrior.arms.rend.enabled')?.changed).toBe(false)
    expect(rows(arms, { ...berserker, 'warrior.arms.rend.enabled': true }).get('warrior.arms.rend.enabled')?.changed).toBe(true)
  })

  it('shows a consumable’s switch off while its Buffs switch is off, and its settings as inactive', () => {
    const r = rows(fury, {}, [])
    const juju = r.get('warrior.fury.jujuFlurry.enabled')!
    expect(juju.value).toBe(true)
    expect(juju.on).toBe(false)
    expect(juju.missingBuff?.name).toBe('Juju Flurry')
    expect(r.get('warrior.fury.ragePotion.maxRage')?.inactive).toBe(true)
    const withPotion = rows(fury, {}, ['mightyRagePotion'])
    expect(withPotion.get('warrior.fury.ragePotion.enabled')).toMatchObject({ on: true, missingBuff: undefined })
    expect(withPotion.get('warrior.fury.ragePotion.maxRage')?.inactive).toBe(false)
  })

  it('makes the settings under a switch inactive while it’s off, down the tree (U13)', () => {
    const on = rows(fury)
    for (const id of ['warrior.fury.deathWish.alignToEnd', 'warrior.fury.cooldowns.syncWithDeathWish', 'warrior.fury.hamstring.onlyWhenFlurryDown'])
      expect(on.get(id)?.inactive, id).toBe(false)
    const off = rows(fury, { 'warrior.fury.deathWish.enabled': false, 'warrior.fury.hamstring.enabled': false, 'warrior.fury.heroicStrike.enabled': false })
    for (const id of [
      'warrior.fury.deathWish.alignToEnd',
      'warrior.fury.cooldowns.syncWithDeathWish',
      'warrior.fury.hamstring.onlyWhenFlurryDown',
      'warrior.fury.heroicStrike.unqueue',
      // Under "Cancel Heroic Strike on low rage", itself under Heroic Strike.
      'warrior.fury.heroicStrike.unqueueBelow',
    ])
      expect(off.get(id)?.inactive, id).toBe(true)
  })

  it('puts the number settings behind Advanced and keeps switches and choices in view', () => {
    const options = [...getSpec('warrior-fury').rotationOptions, ...getSpec('warrior-arms').rotationOptions]
    for (const o of options) expect(isAdvanced(o), o.id).toBe(o.kind === 'number')
  })

  it('reads a default as the row shows it', () => {
    const [bsRefresh] = getSpec('warrior-fury').rotationOptions.filter((o) => o.id === 'warrior.fury.battleShout.refreshBelowSec')
    const [stance] = getSpec('warrior-arms').rotationOptions.filter((o) => o.id === 'warrior.arms.baseStance')
    const [charge] = getSpec('warrior-fury').rotationOptions.filter((o) => o.id === 'warrior.fury.prepull.charge')
    expect(formatSetting(bsRefresh, 3)).toBe('3 s left')
    expect(formatSetting(stance, 'battle')).toBe('Battle')
    expect(formatSetting(charge, false)).toBe('off')
  })
})
