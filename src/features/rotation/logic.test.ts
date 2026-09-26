// The Rotation tab's row states (docs/ux.md "Rotation"): each setting's default for the setup, the
// changed mark, a consumable switch without its Buffs switch, settings whose parent is off, and
// those that need an execute phase.
import { describe, expect, it } from 'vitest'
import { defaultAplOrder, defaultConfig, getSpec, moveAplRow, normalizeConfig, type SimConfig, specs, unusedRotationSettings } from '@/sim'
import { aplRowChanged, aplRowIdle, aplRowNote, aplRowSummary, formatSetting, groupsThousands, isAdvanced, rotationRows, UNIT_SINGULAR, unitFor, withRotationOrder } from './logic'

const rows = (config: SimConfig, rotation: SimConfig['rotation'] = {}, enabled = config.buffs.enabled) =>
  rotationRows({ ...config, rotation }, getSpec(config.spec).rotationOptions, enabled)
const rowsOf = rows

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
    // Every spec's racial says so: the default Protection warrior is a Human, an Orc's Blood Fury is used.
    const prot = defaultConfig('warrior-protection')
    expect(unusedRotationSettings(prot)).toEqual({ 'warrior.protection.racial.enabled': 'Not used: Human has no racial cooldown that adds damage.' })
    expect(unusedRotationSettings({ ...prot, race: 'horde-orc' })).toEqual({})
  })

  it('marks nothing changed by default, and shows each value as its default', () => {
    for (const config of [fury, arms, defaultConfig('druid-feral-cat'), defaultConfig('druid-feral-bear')]) {
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
    // With the phase, Fury dims only Hamstring's own settings (Hamstring is off by default) and
    // Berserker Rage's (the default build has no Improved Berserker Rage); Arms' are those of its
    // switches that are off (Heroic Strike, Whirlwind).
    const furyBase = dimmed(fury)
    const armsBase = dimmed(arms)
    expect(furyBase).toEqual(['warrior.fury.hamstring.minRage', 'warrior.fury.hamstring.onlyWhenFlurryDown', 'warrior.fury.berserkerRage.maxRage'])
    expect(dimmed(noPhase(fury)).filter((id) => !furyBase.includes(id))).toEqual([
      'warrior.fury.deathWish.beforeExecuteSec',
      'warrior.fury.recklessness.beforeExecuteSec',
      'warrior.fury.execute.enabled',
      'warrior.fury.execute.minExtraRage',
      'warrior.fury.execute.bloodthirst',
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

  it('says in the help of every switch that needs an execute phase that it needs one under Fight, in every spec (RV5)', () => {
    const needing = specs.flatMap((s) => s.rotationOptions.filter((o) => o.kind === 'toggle' && o.needsExecutePhase))
    expect(needing.map((o) => o.label)).toEqual(expect.arrayContaining(['Execute', 'Hammer of Wrath']))
    for (const option of needing) expect(option.help, option.id).toMatch(/ Needs an execute phase under Fight\.$/)
  })

  it('dims Retribution’s Exorcism and its threshold unless the target is Undead or a Demon, and Hammer of Wrath without an execute phase (RU7)', () => {
    const ret = defaultConfig('paladin-retribution')
    const exo = 'paladin.retribution.exorcism.enabled'
    const exoMana = 'paladin.retribution.exorcism.minManaPct'
    const fight = (f: Partial<SimConfig['fight']>) => ({ ...ret, fight: { ...ret.fight, ...f } })
    // No creature type (the default): dimmed, and the switch says which types it needs.
    const none = rows(ret)
    expect(none.get(exo)).toMatchObject({ inactive: true, needsCreature: ['undead', 'demon'], on: true })
    expect(none.get(exoMana)?.inactive).toBe(true)
    for (const creatureType of ['undead', 'demon'] as const) {
      const r = rows(fight({ creatureType }))
      expect(r.get(exo)?.inactive, creatureType).toBe(false)
      expect(r.get(exo)?.needsCreature, creatureType).toBeUndefined()
      expect(r.get(exoMana)?.inactive, creatureType).toBe(false)
    }
    expect(rows(fight({ creatureType: 'beast' })).get(exo)?.inactive).toBe(true)
    // Hammer of Wrath and its threshold need an execute phase.
    const how = 'paladin.retribution.hammerOfWrath.enabled'
    expect(none.get(how)?.inactive).toBe(false)
    const noPhase = rows(fight({ executePct: 0 }))
    expect(noPhase.get(how)?.inactive).toBe(true)
    expect(noPhase.get('paladin.retribution.hammerOfWrath.minManaPct')?.inactive).toBe(true)
  })

  it('writes thousands in a setting’s help as its field shows them, grouped where the field groups (RV7)', () => {
    const grouped = specs.flatMap((s) => s.rotationOptions.filter((o) => o.kind === 'number' && groupsThousands(o)))
    expect(grouped.map((o) => o.id)).toContain('warrior.fury.execute.btOverExecuteAp')
    for (const option of grouped) expect(option.help, option.id).not.toMatch(/\b\d{4,}\b/)
    const fury = getSpec('warrior-fury').rotationOptions.find((o) => o.id === 'warrior.fury.execute.btOverExecuteAp')!
    expect(fury.help).toContain('The default is the break-even for your talents: 2,434 with Improved Execute, as the default talents have (Execute costs 10 rage at 2/2), or 2,220 without it (15 rage).')
  })

  it('locks Shield Block and Shield Slam off without a shield or the talent, and dims the filler’s wait for Shield Slam (Protection, PU4)', () => {
    const prot = defaultConfig('warrior-protection')
    const P = 'warrior.protection'
    // Defensive, whose filler the wait belongs to (Balanced, the default, has no filler, D28).
    const rows = (config: SimConfig, rotation: SimConfig['rotation'] = {}) => rowsOf(config, { [`${P}.priority`]: 'duties', ...rotation })
    const on = rows(prot)
    for (const id of [`${P}.shieldBlock.enabled`, `${P}.shieldSlam.enabled`]) {
      expect(on.get(id)?.on, id).toBe(true)
      expect(on.get(id)?.unmet, id).toBeUndefined()
    }
    // Without a shield, both need one; the filler's wait for Shield Slam then changes nothing.
    const noShield = rows({ ...prot, gear: { ...prot.gear, offHand: undefined } })
    expect(noShield.get(`${P}.shieldBlock.enabled`)).toMatchObject({ value: true, on: false, unmet: { shield: true } })
    expect(noShield.get(`${P}.shieldSlam.enabled`)).toMatchObject({ on: false, unmet: { shield: true } })
    expect(noShield.get(`${P}.shieldBlock.minRage`)?.inactive).toBe(true)
    expect(noShield.get(`${P}.sunderFiller.waitForShieldSlam`)?.inactive).toBe(true)
    // Without the talent, Shield Slam needs it; Shield Block still works.
    const noTalent = rows({ ...prot, talents: '35-05-55210123330121053' })
    expect(noTalent.get(`${P}.shieldSlam.enabled`)).toMatchObject({ on: false, unmet: { talent: 'Shield Slam' } })
    expect(noTalent.get(`${P}.shieldBlock.enabled`)?.on).toBe(true)
    expect(noTalent.get(`${P}.shieldBlock.enabled`)?.unmet).toBeUndefined()
    // Both missing: both named.
    expect(rows({ ...prot, talents: '', gear: { ...prot.gear, offHand: undefined } }).get(`${P}.shieldSlam.enabled`)?.unmet).toEqual({ talent: 'Shield Slam', shield: true })
    // The wait is dimmed while Shield Slam is off, and not otherwise.
    expect(on.get(`${P}.sunderFiller.waitForShieldSlam`)?.inactive).toBe(false)
    expect(rows(prot, { [`${P}.shieldSlam.enabled`]: false }).get(`${P}.sunderFiller.waitForShieldSlam`)?.inactive).toBe(true)
  })

  it('says why the bear’s Lacerate and Demoralizing Roar do nothing here, and dims only them (BU4, BL3)', () => {
    const bear = defaultConfig('druid-feral-bear')
    const unusedRows = (config: SimConfig) => rotationRows(config, getSpec(config.spec).rotationOptions, config.buffs.enabled, unusedRotationSettings(config))
    const lacerate = 'druid.bear.lacerate.enabled'
    const roar = 'druid.bear.demoRoar.enabled'
    const byDefault = unusedRows(bear)
    for (const id of [lacerate, roar]) expect(byDefault.get(id)?.notUsed, id).toBeUndefined()
    // Lacerate set to wait for no other bleeds, in a raid with warriors: unused, as the cat's Rake
    // is; the switch that makes it wait stays live.
    const waits = unusedRows({ ...bear, rotation: { 'druid.bear.lacerate.onlyWithoutOtherBleeds': true } })
    expect(waits.get(lacerate)).toMatchObject({ on: true, inactive: true })
    expect(waits.get(lacerate)?.notUsed).toContain('its warriors keep the boss bleeding')
    expect(waits.get('druid.bear.lacerate.onlyWithoutOtherBleeds')?.inactive).toBe(false)
    // A Demoralizing Shout in Buffs takes the roar's place, while the rotation keeps it (Defensive).
    const shout = {
      ...bear,
      rotation: { 'druid.bear.priority': 'duties' },
      buffs: { ...bear.buffs, enabled: [...bear.buffs.enabled.filter((id) => id !== 'demoralizingRoar'), 'demoralizingShout'] },
    }
    expect(unusedRows(shout).get(roar)).toMatchObject({ on: true, inactive: true, notUsed: 'Not used: the Demoralizing Shout in Buffs is on the boss instead, so you don’t cast the roar.' })
    // Balanced, the default, drops the roar: it's off, not "not used".
    expect(unusedRows({ ...shout, rotation: {} }).get(roar)).toMatchObject({ on: false })
    expect(unusedRows({ ...shout, rotation: {} }).get(roar)?.notUsed).toBeUndefined()
  })

  it('puts the number settings behind Advanced and keeps switches and choices in view', () => {
    const options = [
      ...getSpec('warrior-fury').rotationOptions,
      ...getSpec('warrior-arms').rotationOptions,
      ...getSpec('druid-feral-cat').rotationOptions,
      ...getSpec('druid-feral-bear').rotationOptions,
    ]
    for (const o of options) expect(isAdvanced(o), o.id).toBe(o.kind === 'number')
  })

  it('reads a default as the row shows it', () => {
    const [bsRefresh] = getSpec('warrior-fury').rotationOptions.filter((o) => o.id === 'warrior.fury.battleShout.refreshBelowSec')
    const [stance] = getSpec('warrior-arms').rotationOptions.filter((o) => o.id === 'warrior.arms.baseStance')
    const [charge] = getSpec('warrior-fury').rotationOptions.filter((o) => o.id === 'warrior.fury.prepull.charge')
    expect(formatSetting(bsRefresh, 3)).toBe('3 s left')
    expect(formatSetting(stance, 'battle')).toBe('Battle')
    expect(formatSetting(charge, false)).toBe('off')
    // A percentage sits against its number, a unitless number stands alone, and thousands are grouped.
    const number = { kind: 'number', id: 'x', label: 'X', help: '', min: 0, max: 100, step: 5, default: 0 } as const
    expect(formatSetting({ ...number, unit: '%' }, 65)).toBe('65%')
    expect(formatSetting({ ...number, unit: '% mana' }, 65)).toBe('65% mana')
    expect(formatSetting({ ...number, unit: '' }, 1500)).toBe('1,500')
    expect(formatSetting({ ...number, unit: 'mana' }, 1500)).toBe('1,500 mana')
    expect(formatSetting({ ...number, unit: 's left' }, 1.5)).toBe('1.5 s left')
    expect([groupsThousands({ ...number, unit: '', max: 5000 }), groupsThousands({ ...number, unit: '%' })]).toEqual([true, false])
  })

  it('reads a counted unit in the singular at exactly 1, and a measured one the same', () => {
    const number = { kind: 'number', id: 'x', label: 'X', help: '', min: 0, max: 5, step: 1, default: 0 } as const
    expect(formatSetting({ ...number, unit: 'combo points' }, 1)).toBe('1 combo point')
    expect(formatSetting({ ...number, unit: 'combo points' }, 5)).toBe('5 combo points')
    expect(formatSetting({ ...number, unit: 'combo points' }, 0)).toBe('0 combo points')
    expect(formatSetting({ ...number, unit: 'stacks' }, 1)).toBe('1 stack')
    expect(formatSetting({ ...number, unit: 'ticks' }, 1)).toBe('1 tick')
    expect(formatSetting({ ...number, unit: 'casts' }, 1)).toBe('1 cast')
    expect(formatSetting({ ...number, unit: 'stacks' }, 1.5)).toBe('1.5 stacks')
    expect(formatSetting({ ...number, unit: 'mana' }, 1)).toBe('1 mana')
    expect(formatSetting({ ...number, unit: 's left' }, 1)).toBe('1 s left')
    expect(unitFor('Energy', 1)).toBe('Energy')
  })

  it('knows every number setting’s unit: counted ones have a singular, the rest read the same at 1', () => {
    // A new unit fails here until it's added to one list or the other (UNIT_SINGULAR in logic.ts).
    const same = new Set(['', '%', '% mana', 'mana', 'rage', 'Energy', 'Focus', 'AP', 's', 's left'])
    const units = new Set(specs.flatMap((s) => s.rotationOptions.flatMap((o) => (o.kind === 'number' ? [o.unit] : []))))
    for (const unit of units) expect(unit in UNIT_SINGULAR || same.has(unit), `unit "${unit}"`).toBe(true)
  })
})

describe('a Protection paladin’s settings the setup can’t use (docs/ux.md "Rotation")', () => {
  const prot = defaultConfig('paladin-protection')
  const rowsOf = (config: SimConfig) => rotationRows(config, getSpec(config.spec).rotationOptions, config.buffs.enabled, unusedRotationSettings(config))

  it('dims Exorcism without an Undead or Demon target, and the threshold under it, as Retribution’s', () => {
    const r = rowsOf(prot)
    expect(r.get('paladin.protection.exorcism.enabled')).toMatchObject({ inactive: true, on: true, needsCreature: ['undead', 'demon'] })
    expect(r.get('paladin.protection.exorcism.minManaPct')!.inactive).toBe(true)
    // Nothing else in the default setup but the rune's, which the Standard raid doesn't bring:
    // Balanced keeps Holy Strike, and Hammer of the Righteous is off (paladin.md row 5b).
    expect(r.get('paladin.protection.holyStrike.enabled')).toMatchObject({ inactive: false, on: true })
    expect([...r].filter(([, row]) => row.inactive).map(([id]) => id)).toEqual([
      'paladin.protection.exorcism.enabled',
      'paladin.protection.exorcism.minManaPct',
      'paladin.protection.rune.earlyMissingMana',
      'paladin.protection.rune.missingMana',
    ])
    const u = rowsOf({ ...prot, fight: { ...prot.fight, creatureType: 'undead' } })
    expect(u.get('paladin.protection.exorcism.enabled')).toMatchObject({ inactive: false })
    expect(u.get('paladin.protection.exorcism.enabled')!.needsCreature).toBeUndefined()
  })

  it('locks Holy Shield off without its talent and a shield, and Swift Judgement without its talent, as Protection’s Shield Slam', () => {
    const r = rowsOf({ ...prot, gear: { ...prot.gear, offHand: undefined }, talents: '' })
    expect(r.get('paladin.protection.holyShield.enabled')).toMatchObject({ value: true, on: false, unmet: { talent: 'Holy Shield', shield: true } })
    expect(r.get('paladin.protection.swiftJudgement.enabled')).toMatchObject({ value: true, on: false, unmet: { talent: 'Swift Judgement' } })
    // The threshold under Swift Judgement changes nothing then.
    expect(r.get('paladin.protection.swiftJudgement.minCooldownSec')?.inactive).toBe(true)
    // With them, neither is locked.
    const d = rowsOf(prot)
    for (const id of ['paladin.protection.holyShield.enabled', 'paladin.protection.swiftJudgement.enabled']) {
      expect(d.get(id)).toMatchObject({ on: true })
      expect(d.get(id)?.unmet, id).toBeUndefined()
    }
  })
})

describe('a priority list’s rows (decision D31)', () => {
  const fury = defaultConfig('warrior-fury')
  const apl = getSpec('warrior-fury').rotationApl!
  const row = (id: string) => apl.rows.find((r) => r.id === id)!
  const summary = (id: string, rotation: SimConfig['rotation'] = {}, config: SimConfig = fury) =>
    aplRowSummary(row(id), getSpec(config.spec).rotationOptions, rows(config, rotation))

  it('sums each row up in a line from its own settings', () => {
    expect(summary('heroicStrike')).toBe('From 40 rage · cancel below 20 rage')
    // A setting whose switch is off is left out; a switch's part shows at its value.
    expect(summary('heroicStrike', { 'warrior.fury.heroicStrike.unqueue': false, 'warrior.fury.execute.heroicStrikeInExecute': false })).toBe(
      'From 40 rage · not in the execute phase',
    )
    // A number at its hideWhen is left out; fixed text stays.
    expect(summary('execute')).toBe('Execute phase')
    expect(summary('execute', { 'warrior.fury.execute.minExtraRage': 10 })).toBe('Execute phase · 10 rage extra')
    expect(summary('executeBloodthirst')).toBe('From 2,434 AP')
    // A number with a zeroText reads it at 0 (review finding TM-3: not "again with 0 s left").
    expect(summary('battleShout', { 'warrior.fury.battleShout.refreshBelowSec': 0 })).toBe('Again once it runs out')
    expect(summary('battleShout', { 'warrior.fury.battleShout.refreshBelowSec': 3 })).toBe('Again with 3 s left')
    expect(summary('whirlwind')).toBe('Bloodthirst 0.5 s away')
    // Off, it says so; the pre-pull, with no switch, lists what it does, or None.
    expect(summary('slam')).toBe('Off')
    expect(summary('prepull')).toBe('Battle Shout · Bloodrage')
    expect(summary('prepull', { 'warrior.fury.battleShout.enabled': false, 'warrior.fury.prepull.bloodrage': false })).toBe('None')
    // A switch whose talent the build lacks is off, whatever it's set to.
    expect(summary('berserkerRage')).toBe('Off')
  })

  it('reads the warrior’s on-use trinkets as on cooldown unless they wait for Death Wish, as every spec’s do (UA-4)', () => {
    expect(summary('trinkets')).toBe('With Death Wish')
    expect(summary('trinkets', { 'warrior.fury.cooldowns.syncWithDeathWish': false })).toBe('On cooldown')
    expect(summary('trinkets', { 'warrior.fury.deathWish.enabled': false })).toBe('On cooldown')
    // The default Arms build hasn't the Death Wish talent, so Death Wish is off and nothing waits for it.
    const arms = defaultConfig('warrior-arms')
    const armsRow = getSpec('warrior-arms').rotationApl!.rows.find((r) => r.id === 'trinkets')!
    expect(aplRowSummary(armsRow, getSpec('warrior-arms').rotationOptions, rows(arms))).toBe('On cooldown')
  })

  it('reads a warlock’s filler as Shadow Bolt while Incinerate isn’t talented, whatever its choice says (issue #17)', () => {
    const filler = (config: SimConfig) => {
      const apl = getSpec(config.spec).rotationApl!
      const options = getSpec(config.spec).rotationOptions
      const state = rotationRows(config, options, config.buffs.enabled, unusedRotationSettings(config))
      return aplRowSummary(apl.rows.find((r) => r.id === 'filler')!, options, state)
    }
    expect(filler(defaultConfig('warlock-destruction'))).toBe('Incinerate')
    expect(filler(defaultConfig('warlock-affliction'))).toBe('Shadow Bolt')
    // Demonology's choice is Incinerate by default (warlock.md §6.4), but its default talents have none.
    const demo = defaultConfig('warlock-demonology')
    expect(filler(demo)).toBe('Shadow Bolt')
    expect(filler({ ...demo, talents: '-03050032011203-0550315103101051' })).toBe('Incinerate')
    expect(filler({ ...defaultConfig('warlock-affliction'), talents: '255500100002--0550315103101051', rotation: { 'warlock.affliction.filler.spell': 'incinerate' } })).toBe('Incinerate')
  })

  it('says which rows stop in the execute phase, and which wait for Bloodthirst and Whirlwind, while that holds', () => {
    const fillers = { 'warrior.fury.hamstring.enabled': true, 'warrior.fury.slam.enabled': true }
    expect(summary('bloodthirst')).toBe('On cooldown · not in the execute phase')
    expect(summary('overpower')).toBe('Up to 45 rage · while Bloodthirst and Whirlwind cool down')
    expect(summary('rend')).toBe('Up to 25 rage · not in the execute phase · while Bloodthirst and Whirlwind cool down')
    expect(summary('hamstring', fillers)).toBe('From 60 rage · not in the execute phase · while Bloodthirst and Whirlwind cool down')
    expect(summary('slam', fillers)).toBe('Not in the execute phase · while Bloodthirst and Whirlwind cool down')
    // Execute off, or no phase: they don't stop for it.
    expect(summary('bloodthirst', { 'warrior.fury.execute.enabled': false })).toBe('On cooldown')
    const noPhase = { ...fury, fight: { ...fury.fight, executePct: 0 } }
    expect(summary('hamstring', fillers, noPhase)).toBe('From 60 rage · while Bloodthirst and Whirlwind cool down')
    // Without Bloodthirst, the fillers don't claim to wait for it, nor Whirlwind.
    const noBt = { ...fillers, 'warrior.fury.bloodthirst.enabled': false }
    expect(summary('slam', noBt)).toBe('Not in the execute phase')
    expect(summary('overpower', noBt)).toBe('Up to 45 rage')
    expect(summary('whirlwind', noBt)).toBe('')
  })

  it('says why a row that’s on can’t do anything: Bloodthirst in the execute phase with Bloodthirst off (A1-1)', () => {
    const note = (id: string, rotation: SimConfig['rotation'] = {}, config: SimConfig = fury) => {
      const setup = { ...config, rotation }
      return aplRowNote(row(id), rotationRows(setup, getSpec(setup.spec).rotationOptions, setup.buffs.enabled, unusedRotationSettings(setup)))
    }
    expect(note('executeBloodthirst')).toBeUndefined()
    const r = rows(fury, { 'warrior.fury.bloodthirst.enabled': false })
    // On, but dimmed with its threshold, as the engine never uses it (btExec in furyRotation).
    expect(r.get('warrior.fury.execute.bloodthirst')).toMatchObject({ on: true, inactive: true, blockedBy: { kind: 'off', label: 'Bloodthirst' } })
    expect(r.get('warrior.fury.execute.btOverExecuteAp')?.inactive).toBe(true)
    expect(note('executeBloodthirst', { 'warrior.fury.bloodthirst.enabled': false })).toBe('Not used: Bloodthirst is off.')
    // Execute off says so.
    expect(note('executeBloodthirst', { 'warrior.fury.execute.enabled': false })).toBe('Not used: Execute is off.')
    // With no execute phase, the fight is why, for Execute and what hangs on it (A1-7).
    const noPhase = { ...fury, fight: { ...fury.fight, executePct: 0 } }
    for (const id of ['execute', 'executeBloodthirst']) expect(note(id, {}, noPhase), id).toBe('Not used: needs an execute phase (Fight tab).')
    // A row that's off says Off, not why it would be unused.
    expect(note('executeBloodthirst', { 'warrior.fury.execute.bloodthirst': false, 'warrior.fury.bloodthirst.enabled': false })).toBeUndefined()
    // The setup's own notes come first: the racial for a Human, a talent the build lacks.
    expect(note('racial')).toBe('Not used: Human has no racial cooldown that adds damage.')
    expect(note('berserkerRage')).toBe('Not used: needs the Improved Berserker Rage talent.')
    expect(note('bloodthirst')).toBeUndefined()
  })

  it('marks a row whose switch or own settings differ from their defaults', () => {
    const r = rows(fury, { 'warrior.fury.heroicStrike.minRage': 50 })
    expect(aplRowChanged(row('heroicStrike'), r)).toBe(true)
    expect(aplRowChanged(row('whirlwind'), r)).toBe(false)
    // A value set to its default isn't a change.
    expect(aplRowChanged(row('heroicStrike'), rows(fury, { 'warrior.fury.heroicStrike.minRage': 40 }))).toBe(false)
  })

  it('stores the order after the rotation settings, as normalizing does, and clears it', () => {
    const order = moveAplRow(apl, defaultAplOrder(apl), 'whirlwind', 1)!
    const withOrder = withRotationOrder(fury, order)
    expect(JSON.stringify(withOrder)).toBe(JSON.stringify(normalizeConfig(withOrder).config))
    expect(withOrder.rotationOrder).toEqual(order)
    expect(JSON.stringify(withRotationOrder(withOrder, undefined))).toBe(JSON.stringify(fury))
  })
})

describe('a summary part a choice or the setup rules out (choiceIs, choiceIsNot, requires)', () => {
  const summaryOf = (config: SimConfig, id: string, rotation: SimConfig['rotation'] = {}, setup: Pick<SimConfig, 'spec' | 'talents' | 'gear'> | null = config) => {
    const row = getSpec(config.spec).rotationApl!.rows.find((r) => r.id === id)!
    return aplRowSummary(row, getSpec(config.spec).rotationOptions, rows(config, rotation), setup ?? undefined)
  }
  const mm = defaultConfig('hunter-marksmanship')
  const enh = defaultConfig('shaman-enhancement')
  const ele = defaultConfig('shaman-elemental')
  const shot = 'hunter.marksmanship.sharedCooldown.shot'

  it('leaves out a part while its choice is (choiceIsNot) one of the values: the hunter’s Neither, the Shock’s None', () => {
    expect(summaryOf(mm, 'sharedShot')).toBe('Aimed Shot · between Auto Shots')
    expect(summaryOf(mm, 'sharedShot', { [shot]: 'multi' })).toBe('Multi-Shot · between Auto Shots')
    expect(summaryOf(mm, 'sharedShot', { [shot]: 'none' })).toBe('Neither')
    expect(summaryOf(enh, 'shock')).toBe('Earth Shock · from 10% mana')
    expect(summaryOf(enh, 'shock', { 'shaman.enhancement.shock.spell': 'frost' })).toBe('Frost Shock · from 10% mana')
    expect(summaryOf(enh, 'shock', { 'shaman.enhancement.shock.spell': 'none' })).toBe('None')
  })

  it('shows a part only while its choice is (choiceIs) one of the values: Chain Lightning with Clearcasting', () => {
    const use = 'shaman.elemental.chainLightning.use'
    expect(summaryOf(ele, 'chainLightning')).toBe('With Clearcasting')
    expect(summaryOf(ele, 'chainLightning', { [use]: 'cooldown' })).toBe('On cooldown')
    expect(summaryOf(ele, 'chainLightning', { [use]: 'never' })).toBe('Never')
  })

  it('names, in every spec’s rows, a choice setting of the spec and values it offers', () => {
    for (const spec of specs) {
      const options = getSpec(spec.id).rotationOptions
      for (const row of getSpec(spec.id).rotationApl?.rows ?? []) {
        for (const part of row.summary ?? []) {
          for (const choice of [part.choiceIs, part.choiceIsNot]) {
            if (!choice) continue
            const option = options.find((o) => o.id === choice.option)
            expect(option?.kind, `${spec.id} ${row.id}`).toBe('choice')
            const offered = option?.kind === 'choice' ? option.choices.map((c) => c.value) : []
            for (const value of choice.values) expect(offered, `${spec.id} ${row.id}`).toContain(value)
          }
        }
      }
    }
  })

  it('shows a part that requires a talent only with it: Trueshot Aura before the pull', () => {
    expect(summaryOf(mm, 'prepull')).toBe('Aspect of the Hawk · Trueshot Aura')
    expect(summaryOf({ ...mm, talents: '' }, 'prepull')).toBe('Aspect of the Hawk')
    // Without the setup to read, the part is left out rather than guessed.
    expect(summaryOf(mm, 'prepull', {}, null)).toBe('Aspect of the Hawk')
  })

  it('dims a row without a switch that does nothing: a choice of nothing, a summary of None (UA-5)', () => {
    const idle = (config: SimConfig, id: string, rotation: SimConfig['rotation'] = {}) => {
      const row = getSpec(config.spec).rotationApl!.rows.find((r) => r.id === id)!
      return aplRowIdle(row, getSpec(config.spec).rotationOptions, rows(config, rotation), config)
    }
    const use = 'shaman.elemental.chainLightning.use'
    expect(idle(ele, 'chainLightning')).toBe(false)
    expect(idle(ele, 'chainLightning', { [use]: 'cooldown' })).toBe(false)
    expect(idle(ele, 'chainLightning', { [use]: 'never' })).toBe(true)
    // With Clearcasting but without Elemental Focus it's never cast, and reads None.
    expect(idle({ ...ele, talents: '' }, 'chainLightning')).toBe(true)
    expect(idle(enh, 'shock')).toBe(false)
    expect(idle(enh, 'shock', { 'shaman.enhancement.shock.spell': 'none' })).toBe(true)
    expect(idle(mm, 'sharedShot', { [shot]: 'none' })).toBe(true)
    const destro = defaultConfig('warlock-destruction')
    expect(idle(destro, 'bane')).toBe(false)
    expect(idle(destro, 'bane', { 'warlock.destruction.bane.spell': 'none' })).toBe(true)
    // The pre-pull with every part off reads None.
    const fury = defaultConfig('warrior-fury')
    expect(idle(fury, 'prepull')).toBe(false)
    expect(idle(fury, 'prepull', { 'warrior.fury.battleShout.enabled': false, 'warrior.fury.prepull.bloodrage': false })).toBe(true)
    // A row with a switch dims by its switch, never by this.
    expect(idle(enh, 'stormstrike')).toBe(false)
  })

  it('says why Balance’s Filler does nothing under Wrath for Eclipse, in place of its summary, and dims it; a warlock’s untalented filler still casts (UA-5)', () => {
    const state = (config: SimConfig) => {
      const options = getSpec(config.spec).rotationOptions
      const apl = getSpec(config.spec).rotationApl!
      const r = rotationRows(config, options, config.buffs.enabled, unusedRotationSettings(config))
      const filler = apl.rows.find((row) => row.id === 'filler')!
      return { note: aplRowNote(filler, r), idle: aplRowIdle(filler, options, r, config), summary: aplRowSummary(filler, options, r, config) }
    }
    const balance = defaultConfig('druid-balance')
    const note = 'Not used: Wrath for Eclipse is on. Starfire and Wrath already take turns. Turn Wrath for Eclipse off to cast only the filler.'
    expect(state(balance)).toMatchObject({ note, idle: true })
    // Eclipse off, or the Filler moved above it: the filler casts.
    expect(state({ ...balance, rotation: { 'druid.balance.eclipse.enabled': false } })).toEqual({ note: undefined, idle: false, summary: 'Starfire' })
    const apl = getSpec('druid-balance').rotationApl!
    const above = moveAplRow(apl, defaultAplOrder(apl), 'filler', defaultAplOrder(apl).indexOf('eclipse'))!
    expect(state({ ...balance, rotationOrder: above })).toEqual({ note: undefined, idle: false, summary: 'Starfire' })
    // Affliction's filler choice is unused without Incinerate, but the row casts Shadow Bolt: no note, not dimmed.
    expect(state(defaultConfig('warlock-affliction'))).toEqual({ note: undefined, idle: false, summary: 'Shadow Bolt' })
  })

  it('shows the note of a row below the filler and dims it, even with a summary part’s inactiveText: Chain Lightning below Lightning Bolt (VA-3)', () => {
    const options = getSpec('shaman-elemental').rotationOptions
    const apl = getSpec('shaman-elemental').rotationApl!
    const chain = apl.rows.find((row) => row.id === 'chainLightning')!
    const state = (config: SimConfig) => {
      const r = rotationRows(config, options, config.buffs.enabled, unusedRotationSettings(config))
      return { note: aplRowNote(chain, r), idle: aplRowIdle(chain, options, r, config), setting: r.get('shaman.elemental.chainLightning.use')?.notUsed }
    }
    const note = 'Below Lightning Bolt: cast only when Lightning Bolt can’t be.'
    const below = moveAplRow(apl, defaultAplOrder(apl), 'lightningBolt', defaultAplOrder(apl).indexOf('chainLightning'))!
    // The row and its setting say the same, and the row is dimmed as Flame Shock's is below it.
    expect(state({ ...ele, rotationOrder: below })).toEqual({ note, idle: true, setting: note })
    expect(chain.summary!.some((p) => p.inactiveText !== undefined)).toBe(true)
    const all = moveAplRow(apl, defaultAplOrder(apl), 'lightningBolt', 1)!
    const boltFirst: SimConfig = { ...ele, rotationOrder: all }
    const r = rotationRows(boltFirst, options, ele.buffs.enabled, unusedRotationSettings(boltFirst))
    const flame = apl.rows.find((row) => row.id === 'flameShock')!
    expect(aplRowNote(flame, r)).toBe(note)
    expect(r.get(flame.enabledId!)?.inactive).toBe(true)
    // In the default order: no note, not dimmed.
    expect(state(ele)).toEqual({ note: undefined, idle: false, setting: undefined })
  })

  it('says None for Chain Lightning with Clearcasting without Elemental Focus, which never casts it', () => {
    const use = 'shaman.elemental.chainLightning.use'
    const noFocus = { ...ele, talents: '' }
    expect(summaryOf(noFocus, 'chainLightning')).toBe('None')
    expect(summaryOf(noFocus, 'chainLightning', { [use]: 'cooldown' })).toBe('On cooldown')
    expect(summaryOf(noFocus, 'chainLightning', { [use]: 'never' })).toBe('Never')
  })
})
