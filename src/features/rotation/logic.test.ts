// The Rotation tab's row states (docs/ux.md "Rotation"): each setting's default for the setup, the
// changed mark, a consumable switch without its Buffs switch, settings whose parent is off, and
// those that need an execute phase.
import { describe, expect, it } from 'vitest'
import { defaultConfig, getSpec, type SimConfig, unusedRotationSettings } from '@/sim'
import { formatSetting, isAdvanced, rotationRows } from './logic'

const rows = (config: SimConfig, rotation: SimConfig['rotation'] = {}, enabled = config.buffs.enabled) =>
  rotationRows({ ...config, rotation }, getSpec(config.spec).rotationOptions, enabled)

describe('rotation rows', () => {
  const fury = defaultConfig('warrior-fury')
  const arms = defaultConfig('warrior-arms')

  it('dims a setting the setup leaves unused and says why, leaving the settings under it active', () => {
    const cat = { ...defaultConfig('druid-feral-cat'), rotation: { 'druid.cat.rake.enabled': true } }
    const unused = unusedRotationSettings(cat)
    const r = rotationRows({ ...cat }, getSpec(cat.spec).rotationOptions, cat.buffs.enabled, unused)
    // The default cat is a Tauren, and the default raid's warriors keep the boss bleeding.
    expect(r.get('druid.cat.racial.enabled')).toMatchObject({ inactive: true, notUsed: 'Not used: Tauren has no racial cooldown that adds damage.' })
    expect(r.get('druid.cat.rake.enabled')).toMatchObject({ on: true, inactive: true })
    expect(r.get('druid.cat.rake.enabled')?.notUsed).toMatch(/^Not used in this raid: its warriors keep the boss bleeding\. Turn off “Rake only when nothing else bleeds”/)
    // The way to use it stays active.
    expect(r.get('druid.cat.rake.onlyWithoutBleeds')).toMatchObject({ inactive: false })
    expect(r.get('druid.cat.rake.onlyWithoutBleeds')?.notUsed).toBeUndefined()
  })

  it('marks nothing changed by default, and shows each value as its default', () => {
    for (const config of [fury, arms, defaultConfig('druid-feral-cat')]) {
      for (const [id, row] of rows(config)) {
        expect(row.changed, id).toBe(false)
        expect(row.value, id).toEqual(row.default)
      }
    }
  })

  it('marks a saved value that differs from its default, but not one that matches it', () => {
    const r = rows(fury, { 'warrior.fury.heroicStrike.minRage': 50, 'warrior.fury.bloodthirst.enabled': true })
    expect(r.get('warrior.fury.heroicStrike.minRage')).toMatchObject({ value: 50, default: 40, changed: true })
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
    // Hamstring is off by default since M2.5b, so its setting is inactive until it's on.
    expect(rows(fury).get('warrior.fury.hamstring.onlyWhenFlurryDown')?.inactive).toBe(true)
    const on = rows(fury, { 'warrior.fury.hamstring.enabled': true })
    for (const id of ['warrior.fury.deathWish.alignToEnd', 'warrior.fury.cooldowns.syncWithDeathWish', 'warrior.fury.hamstring.onlyWhenFlurryDown', 'warrior.fury.heroicStrike.unqueueBelow'])
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

  it('dims Arms’ Recklessness before the execute phase while Recklessness or Execute is off, as the execute phase’s rows are', () => {
    const id = 'warrior.arms.recklessness.beforeExecuteSec'
    expect(rows(arms).get(id)?.inactive).toBe(false)
    expect(rows(arms, { 'warrior.arms.recklessness.enabled': false }).get(id)?.inactive).toBe(true)
    expect(rows(arms, { 'warrior.arms.execute.enabled': false }).get(id)?.inactive).toBe(true)
    expect(rows(arms, { 'warrior.arms.execute.enabled': false }).get('warrior.arms.execute.slamInExecute')?.inactive).toBe(true)
  })

  it('dims Fury’s timings before the execute phase the same way: Death Wish’s under its alignment, Recklessness’s under it (M2.5b)', () => {
    for (const [id, parent] of [
      ['warrior.fury.deathWish.beforeExecuteSec', 'warrior.fury.deathWish.alignToEnd'],
      ['warrior.fury.recklessness.beforeExecuteSec', 'warrior.fury.recklessness.enabled'],
    ]) {
      expect(rows(fury).get(id)?.inactive, id).toBe(false)
      expect(rows(fury, { [parent]: false }).get(id)?.inactive, id).toBe(true)
      expect(rows(fury, { 'warrior.fury.execute.enabled': false }).get(id)?.inactive, id).toBe(true)
    }
  })

  it('dims the potion’s limit while Execute is off: it applies only in the execute phase (both specs)', () => {
    for (const [config, spec] of [
      [fury, 'fury'],
      [arms, 'arms'],
    ] as const) {
      const id = `warrior.${spec}.ragePotion.maxRage`
      const potion = ['mightyRagePotion']
      expect(rows(config, {}, potion).get(id)?.inactive, id).toBe(false)
      expect(rows(config, { [`warrior.${spec}.execute.enabled`]: false }, potion).get(id)?.inactive, id).toBe(true)
    }
  })

  it('with no execute phase under Fight (0%), dims Execute and every setting that needs it, and nothing else (both specs)', () => {
    const noPhase = (config: SimConfig) => ({ ...config, fight: { ...config.fight, executePct: 0 } })
    const potion = ['mightyRagePotion']
    const dimmed = (config: SimConfig) =>
      [...rows(config, {}, potion)].filter(([, row]) => row.inactive).map(([id]) => id)
    // With the phase, Fury dims only Hamstring's own settings (Hamstring is off by default); Arms'
    // are those of its switches that are off (Heroic Strike, Whirlwind).
    const furyBase = dimmed(fury)
    const armsBase = dimmed(arms)
    expect(furyBase).toEqual(['warrior.fury.hamstring.minRage', 'warrior.fury.hamstring.onlyWhenFlurryDown'])
    expect(dimmed(noPhase(fury)).filter((id) => !furyBase.includes(id))).toEqual([
      'warrior.fury.deathWish.beforeExecuteSec',
      'warrior.fury.recklessness.beforeExecuteSec',
      'warrior.fury.execute.enabled',
      'warrior.fury.execute.minExtraRage',
      'warrior.fury.execute.btOverExecuteAp',
      'warrior.fury.execute.whirlwindInExecute',
      'warrior.fury.execute.heroicStrikeInExecute',
      'warrior.fury.ragePotion.maxRage',
    ])
    expect(dimmed(noPhase(arms)).filter((id) => !armsBase.includes(id))).toEqual([
      'warrior.arms.recklessness.beforeExecuteSec',
      'warrior.arms.execute.enabled',
      'warrior.arms.execute.slamInExecute',
      'warrior.arms.execute.mortalStrikeInExecute',
      'warrior.arms.ragePotion.maxRage',
    ])
    // Any phase at all counts.
    expect(rows({ ...fury, fight: { ...fury.fight, executePct: 0.5 } }).get('warrior.fury.execute.enabled')?.inactive).toBe(false)
  })

  it('puts the number settings behind Advanced and keeps switches and choices in view', () => {
    const options = [...getSpec('warrior-fury').rotationOptions, ...getSpec('warrior-arms').rotationOptions, ...getSpec('druid-feral-cat').rotationOptions]
    for (const o of options) expect(isAdvanced(o), o.id).toBe(o.kind === 'number')
  })

  it('reads a default as the row shows it', () => {
    const [bsRefresh] = getSpec('warrior-fury').rotationOptions.filter((o) => o.id === 'warrior.fury.battleShout.refreshBelowSec')
    const [stance] = getSpec('warrior-arms').rotationOptions.filter((o) => o.id === 'warrior.arms.baseStance')
    const [charge] = getSpec('warrior-fury').rotationOptions.filter((o) => o.id === 'warrior.fury.prepull.charge')
    expect(formatSetting(bsRefresh, 3)).toBe('3 s left')
    expect(formatSetting(stance, 'battle')).toBe('Battle')
    expect(formatSetting(charge, false)).toBe('off')
    // A percentage sits against its number, and a unitless number stands alone.
    const number = { kind: 'number', id: 'x', label: 'X', help: '', min: 0, max: 100, step: 5, default: 0 } as const
    expect(formatSetting({ ...number, unit: '%' }, 65)).toBe('65%')
    expect(formatSetting({ ...number, unit: '' }, 1500)).toBe('1500')
  })
})
