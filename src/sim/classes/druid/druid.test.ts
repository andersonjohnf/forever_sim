// The druid class foundation against docs/classes/druid.md: the forms' and passives' numbers
// against the Forever client (src/data/client), the talents' per-rank values against their curves,
// the ability modifiers, the forms the plan builds (§2.1–§2.3, §4.7), the worked examples that need
// no cat or bear ability (W1, W9, W10, W17, and the talent arithmetic of W3, W5 and W6), and the
// defaults (§7). Every base value is a D24 placeholder: the attribute rows (mangos, not evidence)
// and the rest (character-stats.md OQ-1).
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpells, ClientTalents } from '@/data/client/types'
import itemJson from '@/data/items/pre-bis.json'
import type { ItemData } from '@/data/items/types'
import { CRIT_MULTIPLIER, furorCatEnergyTenths } from '../../core/formulas'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { BUFFS_BY_ID } from '../../effects/buffs'
import type { Effect } from '../../effects/types'
import { buildPlan } from '../../plan/build'
import type { AbilityDef } from '../../plan/types'
import { STANCE_ANY } from '../../plan/types'
import { CLASSIC_ERA, FOREVER } from '../../rules/profiles'
import { CLASS_BASE, DRUID_PLACEHOLDERS, DRUID_ROWS } from '../../stats/base-stats'
import { DerivedStats, deriveStats, StatBlock } from '../../stats/stat-block'
import type { SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import {
  CLEARCASTING,
  ENERGY_PER_TICK_TENTHS,
  MAX_ENERGY_TENTHS,
  NO_STRIKE,
  OMEN_OF_CLARITY,
  OMEN_OF_CLARITY_ICD_MS,
  shapeshift,
  shapeshiftMana,
  SHAPESHIFT_COST_PCT,
  SHAPESHIFT_SPELL,
  spiritRegenTickTenths,
} from './abilities'
import { catFormAp, direBearAp, direBearHealth, FORM_INDEX, FORM_SWING_MS, FORM_THREAT_PCT, formEffects, formWeaponRange } from './forms'
import { abilityCritMultiplier, costReduction, withDruidTalents } from './modifiers'
import { DRUID_TALENT_EFFECTS } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientTalents = (talentsJson as unknown as ClientTalents).classes.druid.talents
const CAT_CODE = defaultConfig('druid-feral-cat').talents
const BEAR_CODE = defaultConfig('druid-feral-bear').talents
const ranks = (code: string) => talentRanksByName(TALENT_DATA.druid, code)
const effect = (id: number, index: number) => spells[String(id)].effects.find((e) => e.effectIndex === index)!

/** The config with no buffs, for plan-level checks. */
const bare = (config: SimConfig): SimConfig => ({ ...config, buffs: { raid: config.buffs.raid, enabled: [] } })

describe('forms against the client (druid.md §2.1, §2.2, §3.11, §4.8)', () => {
  it('Cat Form: 12 + 2 AP per level from 6 (120 at 60), 1 AP per Agility, threat −29%', () => {
    const passive = spells['3025']
    expect(passive.levels?.baseLevel).toBe(6)
    expect(effect(3025, 0)).toMatchObject({ effectAura: 99, effectBasePointsF: 12, effectRealPointsPerLevel: 2 })
    expect(catFormAp(60)).toBe(120)
    expect(effect(3025, 5)).toMatchObject({ effectAura: 598, effectBasePointsF: 100, effectMiscValue: [1, 0] })
    expect(effect(3025, 1)).toMatchObject({ effectAura: 10, effectBasePointsF: FORM_THREAT_PCT.cat })
  })

  it('Bear Form: threat +30% (Bear Form Passive2); Dire Bear: 180 AP, 1,240 health at 60', () => {
    expect(effect(21178, 0)).toMatchObject({ effectAura: 10, effectBasePointsF: FORM_THREAT_PCT.bear })
    expect(direBearAp(60)).toBe(180)
    expect(direBearHealth(60)).toBe(1240)
  })

  it('the form weapons: ±20% of the 54.8 DPS average [?] (Q5), at the form’s swing time', () => {
    expect(FORM_SWING_MS).toEqual({ cat: 1000, bear: 2500 })
    const cat = formWeaponRange('cat')
    const bear = formWeaponRange('bear')
    expect(cat.min).toBeCloseTo(43.84, 9)
    expect(cat.max).toBeCloseTo(65.76, 9)
    expect(bear.min).toBeCloseTo(109.6, 9)
    expect(bear.max).toBeCloseTo(164.4, 9)
  })

  it('the shapeshifts cost 55% of base mana with a 1.5 s GCD (768, 9634)', () => {
    for (const id of Object.values(SHAPESHIFT_SPELL)) {
      expect(spells[String(id)].power?.[0].powerCostPct).toBe(SHAPESHIFT_COST_PCT)
      expect(spells[String(id)].cooldowns?.startRecoveryTime).toBe(1500)
    }
    expect(CLASS_BASE.druid.baseMana).toBe(1244)
    expect(shapeshiftMana(0)).toBe(684) // 0.55 × 1244 = 684.2, rounded down [?]
    expect(shapeshiftMana(3)).toBe(478) // × 0.7 = 478.94
    expect(shapeshift('cat', 3)).toMatchObject({ kind: 'shift', resource: 'mana', costTenths: 4780, gcdMs: 1500, shiftTo: FORM_INDEX.cat })
  })
})

describe('Omen of Clarity, Furor and the druid rage sources against the client (druid.md §2.7, §2.8, §4.8)', () => {
  it('Omen of Clarity: a 10 s proc cooldown; Clearcasting: 15 s, one charge, not used by a shapeshift', () => {
    expect(spells['16864'].auraOptions?.procCategoryRecovery).toBe(OMEN_OF_CLARITY_ICD_MS)
    expect(spells['16870'].duration?.duration).toBe(CLEARCASTING.durationMs)
    expect(spells['16870'].auraOptions?.procCharges).toBe(1)
    expect(OMEN_OF_CLARITY).toMatchObject({ trigger: 'meleeLanded', chance: { ppm: 2 }, icdMs: 10000 })
    // The free-cost modifier's class mask (16870 effect 0) has neither shapeshift's bit.
    const mask = effect(16870, 0).effectSpellClassMask!
    for (const id of Object.values(SHAPESHIFT_SPELL)) {
      const own = spells[String(id)].classOptions!.spellClassMask!
      expect(own.some((word, i) => (word & mask[i]) !== 0)).toBe(false)
    }
    expect(shapeshift('cat', 0).clearcastable).toBeUndefined()
  })

  it('energizes: Furor 10 rage on bear (17057), Primal Fury 5 (16959), Natural Reaction 5 (417053)', () => {
    expect(effect(17057, 0)).toMatchObject({ effect: 30, effectBasePointsF: 100 })
    expect(effect(16959, 0)).toMatchObject({ effect: 30, effectBasePointsF: 50 })
    expect(effect(417053, 0)).toMatchObject({ effect: 30, effectBasePointsF: 50 })
  })

  it('Leader of the Pack: +3% all crit (24932, aura 290)', () => {
    expect(effect(24932, 0)).toMatchObject({ effectAura: 290, effectBasePointsF: 3 })
  })
})

describe('talents against their client curves (druid.md §5)', () => {
  const curve = (name: string, index = 0) => clientTalents.find((t) => t.name === name)!.rankEffects.find((e) => e.effectIndex === index)!.values
  /** The value of one stat an effect list gives, summed. */
  const stat = (effects: Effect[], s: string, form?: string) =>
    effects.reduce((sum, e) => (e.kind === 'stat' && e.stat === s && (form === undefined || e.when?.form?.includes(form as never)) ? sum + e.value : sum), 0)
  const mult = (effects: Effect[], s: string) => effects.reduce((sum, e) => (e.kind === 'mult' && e.stat === s ? sum + e.pct : sum), 0)
  const at = (name: string, r: number) => DRUID_TALENT_EFFECTS[name](r, FOREVER)

  it('uses each rank’s client value', () => {
    for (let r = 1; r <= 2; r++) {
      expect(stat(at('Sharpened Claws', r), 'crit', 'cat')).toBe(curve('Sharpened Claws')[r - 1])
      expect(stat(at("Nature's Majesty", r), 'crit')).toBe(curve("Nature's Majesty")[r - 1])
      expect(stat(at("Nature's Reach", r), 'hit')).toBe(curve("Nature's Reach", 1)[r - 1])
      expect(stat(at('Feral Swiftness', r), 'dodge')).toBe(curve('Feral Swiftness')[r - 1])
    }
    for (let r = 1; r <= 3; r++) {
      // Predatory Strikes: the curve is % of level
      expect(stat(at('Predatory Strikes', r), 'ap', 'cat')).toBe((curve('Predatory Strikes')[r - 1] * 60) / 100)
      expect(mult(at('Living Spirit', r), 'spi')).toBe(curve('Living Spirit')[r - 1])
    }
    for (let r = 1; r <= 5; r++) {
      expect(mult(at('Heart of the Wild', r), 'int')).toBe(curve('Heart of the Wild', 0)[r - 1])
      expect(stat(at('Natural Reaction', r), 'dodge')).toBe(curve('Natural Reaction', 0)[r - 1])
      const naturalist = at('Naturalist', r).find((e) => e.kind === 'damage')
      expect(naturalist).toMatchObject({ pct: curve('Naturalist', 1)[r - 1] })
      const reaction = at('Natural Reaction', r).find((e) => e.kind === 'proc')
      expect(reaction?.kind === 'proc' && reaction.proc.chance).toEqual({ pct: curve('Natural Reaction', 1)[r - 1] })
    }
    for (let r = 1; r <= 2; r++) {
      const fury = at('Primal Fury', r)[0]
      expect(fury.kind === 'proc' && fury.proc.chance).toEqual({ pct: curve('Primal Fury', 0)[r - 1] })
    }
  })

  it('binds the form talents to their forms: Heart of the Wild’s Strength to cat and Stamina to bear', () => {
    const hotw = at('Heart of the Wild', 5)
    expect(hotw).toContainEqual({ kind: 'mult', stat: 'str', pct: 10, when: { form: ['cat'] } })
    expect(hotw).toContainEqual({ kind: 'mult', stat: 'sta', pct: 20, when: { form: ['bear'] } })
    expect(hotw).toContainEqual({ kind: 'mult', stat: 'int', pct: 10 })
  })

  it('Leader of the Pack is all crit in Forever and melee crit in Classic Era, in the animal forms', () => {
    expect(DRUID_TALENT_EFFECTS['Leader of the Pack'](1, FOREVER).map((e) => e.kind === 'stat' && e.stat)).toEqual(['crit', 'spellCrit'])
    expect(DRUID_TALENT_EFFECTS['Leader of the Pack'](1, CLASSIC_ERA).map((e) => e.kind === 'stat' && e.stat)).toEqual(['crit'])
  })
})

describe('ability modifiers (druid.md §2.3, §5.1)', () => {
  /** A test row: Rake's numbers (§3.3) as a stand-in, to check the talent arithmetic, not Rake itself. */
  const row = (id: string, fields: Partial<AbilityDef>): AbilityDef => ({
    id,
    name: id,
    icon: 'x',
    kind: 'weaponStrike',
    ...NO_STRIKE,
    costTenths: 0,
    cooldownMs: 0,
    gcdMs: 1000,
    stances: STANCE_ANY,
    ...fields,
  })
  const cat = ranks(CAT_CODE)

  it('W5 (talent part): Savage Fury on Rake’s hit and bleed, Genesis on its bleed: 67.10 and 39.27', () => {
    const rake = withDruidTalents(row('rake', { flatDamage: 61, dotTickDamage: 34, costTenths: 400 }), cat)
    expect(rake.flatDamage).toBeCloseTo(67.1, 9)
    expect(rake.dotTickDamage).toBeCloseTo(39.27, 9)
    expect(rake.dotTickDamage * 3).toBeCloseTo(117.81, 9)
    // Ferocity 5/5: 40 − 5 = 35 Energy (§3.3)
    expect(rake.costTenths).toBe(350)
  })

  it('W3 (talent part): Savage Fury ×1.10 on Shred’s weapon share, Predatory Instincts 2.2× crits, Shredding Attacks −18', () => {
    const shred = withDruidTalents(row('shred', { weaponPercent: 1.55, flatDamage: 80, costTenths: 600 }), cat)
    expect(shred.weaponPercent).toBeCloseTo(1.705, 9)
    expect(shred.flatDamage).toBe(80)
    expect(shred.critMultiplier).toBeCloseTo(2.2, 9)
    expect(shred.costTenths).toBe(420)
    // 341.797 × 1.10 = 375.977; a crit 827.149 (W3)
    expect(341.797 * (shred.weaponPercent / 1.55)).toBeCloseTo(375.977, 3)
    expect(375.977 * shred.critMultiplier).toBeCloseTo(827.149, 3)
  })

  it('W6 (talent part): Genesis on Rip’s ticks, not Savage Fury; per combo point too', () => {
    const rip = withDruidTalents(row('rip', { kind: 'bleed', dotTickDamage: 15, dotTickPerComboPoint: 25.5, dotApCoefficientPerComboPoint: 0.01 }), cat)
    expect(rip.dotTickDamage).toBeCloseTo(15.75, 9)
    expect(rip.dotTickPerComboPoint).toBeCloseTo(26.775, 9)
    expect(rip.dotApCoefficientPerComboPoint).toBeCloseTo(0.0105, 9)
    // 5 CP at 1200 AP: (15 + 127.5 + 48) × 6 × 1.05 = 1200.15 (W6)
    expect(6 * (rip.dotTickDamage + 5 * rip.dotTickPerComboPoint! + 4 * rip.dotApCoefficientPerComboPoint! * 1200)).toBeCloseTo(1200.15, 6)
  })

  it('Primal Fury: a builder’s crit adds a combo point at 50% per rank; finishers and white swings get nothing', () => {
    expect(withDruidTalents(row('shred', {}), cat).critComboPointChance).toBe(1)
    expect(withDruidTalents(row('shred', {}), ranks('')).critComboPointChance).toBeUndefined()
    expect(withDruidTalents(row('ferociousBite', {}), cat).critComboPointChance).toBeUndefined()
  })

  it('costs: Ferocity and Shredding Attacks (§5.1), crit bonus only on the class mask', () => {
    const bear = ranks(BEAR_CODE)
    expect(costReduction('maul', bear)).toBe(5)
    expect(costReduction('mangle', bear)).toBe(5)
    expect(costReduction('lacerate', bear)).toBe(0) // the bear build has no Shredding Attacks
    expect(costReduction('shred', cat)).toBe(18)
    expect(abilityCritMultiplier('whiteSwing', cat)).toBe(CRIT_MULTIPLIER.melee)
    expect(abilityCritMultiplier('mangle', bear)).toBeCloseTo(2.2, 9)
  })
})

describe('worked examples without cat or bear abilities (druid.md §9)', () => {
  const derive = (block: StatBlock) => deriveStats(block, { profile: FOREVER, applyUnmeasured: true, level: 60 }, new DerivedStats())
  /** A block with the druid's class terms and one form's own and Predatory Strikes 3/3's effects. */
  function formBlock(form: 'cat' | 'bear', str: number, agi: number, flatAp: number): StatBlock {
    const b = new StatBlock()
    // Synthetic test inputs: the example's totals, not base stats.
    b.str = str
    b.agi = agi
    b.ap = flatAp
    b.baseAp = CLASS_BASE.druid.baseAp
    const bound = [...formEffects(FOREVER), ...DRUID_TALENT_EFFECTS['Predatory Strikes'](3, FOREVER)]
    for (const e of bound) {
      if (!e.when?.form?.includes(form) || e.kind !== 'stat') continue
      b[e.stat] += e.value
    }
    return b
  }

  it('W1: cat attack power 2 × 200 − 20 + 300 + 120 + 90 + 310 = 1200', () => {
    expect(derive(formBlock('cat', 200, 300, 310)).attackPower).toBe(1200)
  })

  it('W17: bear attack power 2 × 250 − 20 + 180 + 90 + 150 = 900 (no Agility term)', () => {
    expect(derive(formBlock('bear', 250, 300, 150)).attackPower).toBe(900)
  })

  it('W9: Furor re-entry, left cat at 37 Energy after 1.5 s in caster form: 52, 20.8, 0', () => {
    expect(furorCatEnergyTenths(5, 370, 1500)).toBe(520)
    expect(furorCatEnergyTenths(2, 370, 1500)).toBe(208)
    expect(furorCatEnergyTenths(0, 370, 1500)).toBe(0)
    // Capped at 20 per rank: 5/5 from a full bar after 3 s out
    expect(furorCatEnergyTenths(5, 1000, 3000)).toBe(1000)
  })

  it('W10: Omen of Clarity’s chance per landed hit is 3.33% in cat, 8.33% in bear, with a 10 s cooldown', () => {
    for (const [spec, chance] of [
      ['druid-feral-cat', 2 / 60],
      ['druid-feral-bear', 5 / 60],
    ] as const) {
      const ooc = buildPlan(bare(defaultConfig(spec))).plan.procs.find((p) => p.id === 'omenOfClarity')!
      expect(ooc.chance[0]).toBeCloseTo(chance, 12)
      expect(ooc.icdMs).toBe(10000)
    }
  })

  it('W11 (regeneration part): 15 power ticks of 20 Energy in 30 s, 300 Energy', () => {
    expect((30000 / 2000) * ENERGY_PER_TICK_TENTHS).toBe(3000)
    expect(MAX_ENERGY_TENTHS).toBe(1000)
  })
})

describe('the druid plan (druid.md §2, §7)', () => {
  it('fights in its form: the cat’s form weapon, AP and threat; the three forms for shapeshifts', () => {
    const { plan, sheet, blockers } = buildPlan(bare(defaultConfig('druid-feral-cat')))
    expect(blockers).toEqual([])
    expect(plan.forms!.map((f) => f.id)).toEqual(['caster', 'cat', 'bear'])
    expect(plan.form).toBe(FORM_INDEX.cat)
    expect(plan.stats).toBe(plan.forms![FORM_INDEX.cat].stats)
    const mh = plan.weapons[0]!
    expect([mh.speedSec, mh.twoHand, mh.flatDamage, mh.skill]).toEqual([1, false, 0, 300])
    expect(mh.min).toBeCloseTo(43.84, 9)
    // Cat: threat × 0.71 (§3.11)
    expect(plan.threatMult).toBeCloseTo(0.71, 12)
    expect(plan.forms![FORM_INDEX.bear].threatMult).toBeCloseTo(1.3, 12)
    expect(plan.forms![FORM_INDEX.caster].threatMult).toBe(1)
    // The caster form's main hand is the equipped two-hander (Manual Crowd Pummeler, §7.3)
    expect(plan.forms![FORM_INDEX.caster].mainHand?.speedSec).not.toBe(1)
    // The sheet is the cat's: Agility adds attack power; nothing is unknown (the D24 placeholders fill the gaps)
    expect(sheet.unknown).toEqual([])
    const catBlock = plan.forms![FORM_INDEX.cat].stats
    const casterBlock = plan.forms![FORM_INDEX.caster].stats
    expect(catBlock.apPerAgi).toBe(1)
    expect(casterBlock.apPerAgi).toBe(0)
    // Predatory Strikes 3/3 + Cat Form's 120 in cat, nothing in caster form
    expect(catBlock.ap - casterBlock.ap).toBe(210)
    expect(plan.energy).toEqual({ maxTenths: 1000, startTenths: 1000, tickTenths: 200 })
    expect(plan.shapeshift?.furorRank).toBe(5)
    expect(plan.freeCastAura).toBe(plan.auras.findIndex((a) => a.id === 'clearcasting'))
  })

  it('uses the D24 placeholder rows and base values, listed as an assumption', () => {
    const { sheet, assumptions } = buildPlan({ ...bare(defaultConfig('druid-feral-cat')), gear: {}, talents: '' })
    const row = DRUID_ROWS['horde-tauren']
    // Cat form, no gear or talents: the attributes are the row's.
    expect([sheet.strength, sheet.agility, sheet.stamina, sheet.intellect, sheet.spirit]).toEqual([row.str, row.agi, row.sta, row.int, row.spi])
    // AP: 2 × 70 − 20 + 55 + 120 = 295 (Tauren, Cat Form)
    expect(sheet.attackPower).toBe(295)
    // Crit 0.9 + 55 / 20 = 3.65%; dodge 0.9 + 55 / 20 = 3.65%; health (1483 + 20 + 52 × 10) × 1.05 (Endurance)
    expect(sheet.critPct).toBeCloseTo(DRUID_PLACEHOLDERS.baseCrit + 55 * 0.05, 9)
    expect(sheet.dodgePct).toBeCloseTo(DRUID_PLACEHOLDERS.baseDodge + 55 * 0.05, 9)
    expect(sheet.health).toBe(Math.floor((1483 + 20 + 52 * 10) * 1.05))
    expect(assumptions.map((a) => a.id)).toContain('druidBaseStats')
    expect(assumptions.map((a) => a.id)).not.toContain('unknownBaseAttributes')
    // The rows agree with the [C] race offsets: Night Elf −3 Str, +5 Agi, −1 Sta; Tauren +5, −5, +2, −5, +2.
    const classRow = DRUID_ROWS['alliance-skyborne-high-order']
    const ne = DRUID_ROWS['alliance-night-elf']
    expect([ne.str - classRow.str, ne.agi - classRow.agi, ne.sta - classRow.sta, ne.int - classRow.int, ne.spi - classRow.spi]).toEqual([-3, 5, -1, 0, 0])
    expect([row.str - classRow.str, row.agi - classRow.agi, row.sta - classRow.sta, row.int - classRow.int, row.spi - classRow.spi]).toEqual([5, -5, 2, -5, 2])
  })

  it('the bear’s Dire Bear armor: item armor × 4.6, and bonus armor × 4.6 in `forever` only [?] (OQ-8)', () => {
    const d = bare(defaultConfig('druid-feral-bear'))
    const forever = buildPlan(d).plan
    const classic = buildPlan({ ...d, rules: { ...d.rules, profile: 'classicEra' } }).plan
    expect(forever.stats.itemArmorPct).toBeCloseTo(3.6, 12)
    expect(forever.stats.bonusArmorPct).toBeCloseTo(3.6, 12)
    expect(classic.stats.bonusArmorPct).toBe(0)
    expect(forever.forms![FORM_INDEX.cat].stats.itemArmorPct).toBe(0)
    expect(forever.armor).toBeGreaterThan(classic.armor)
    // Heart of the Wild's Stamina and the form's health are the bear's alone
    expect(forever.stats.staMult).toBeCloseTo(1.2, 12)
    expect(forever.forms![FORM_INDEX.cat].stats.staMult).toBe(1)
    expect(forever.stats.health).toBe(1240)
    // The bear weapon: 2.5 s, one-handed rate for Forever's normalized rage (8.65 per swing [?])
    expect(forever.weapons[0]!.speedSec).toBe(2.5)
    expect(forever.weapons[0]!.twoHand).toBe(false)
    expect(buildPlan(d).assumptions.map((a) => a.id)).toEqual(expect.arrayContaining(['bearWhiteRage', 'bearArmor', 'formWeapon', 'omenOfClarity']))
  })

  it('Leader of the Pack from the build replaces the Buffs tab’s, so its crit counts once', () => {
    const d = defaultConfig('druid-feral-cat')
    expect(d.buffs.enabled).toContain('leaderOfThePack')
    const on = buildPlan(d).sheet.critPct
    const off = buildPlan({ ...d, buffs: { ...d.buffs, enabled: d.buffs.enabled.filter((id) => id !== 'leaderOfThePack') } }).sheet.critPct
    expect(on).toBeCloseTo(off, 12)
    // Without the talent, the Buffs tab's applies.
    const noTalent = { ...d, talents: '050022-5520002123032203051-05' }
    const lotp = ranks(noTalent.talents)
    expect(lotp.has('Leader of the Pack')).toBe(false)
  })

  it('adds an item’s “Attack Power in Cat, Bear, and Dire Bear forms” 1:1 in those forms only (§2.2, Q28)', () => {
    // No item in the data carries the stat yet, so the test gives the cat's neck +100 for a moment.
    const neck = defaultConfig('druid-feral-cat').gear.neck!.itemId
    const item = (itemJson as unknown as ItemData).items.find((i) => i.id === neck)!
    expect(item.stats.feralAttackPower ?? 0).toBe(0)
    const plans = () => ({
      cat: buildPlan(bare(defaultConfig('druid-feral-cat'))),
      bear: buildPlan(bare({ ...defaultConfig('druid-feral-bear'), gear: { ...defaultConfig('druid-feral-bear').gear, neck: { itemId: neck } } })),
      warrior: buildPlan(bare({ ...defaultConfig('warrior-fury'), gear: { ...defaultConfig('warrior-fury').gear, neck: { itemId: neck } } })),
    })
    const before = plans()
    let after: ReturnType<typeof plans>
    try {
      item.stats.feralAttackPower = 100
      after = plans()
    } finally {
      delete (item.stats as Partial<typeof item.stats>).feralAttackPower
    }
    const ap = (bundle: ReturnType<typeof buildPlan>, form: keyof typeof FORM_INDEX) => bundle.plan.forms![FORM_INDEX[form]].stats.ap
    for (const spec of ['cat', 'bear'] as const) {
      expect(ap(after[spec], 'cat') - ap(before[spec], 'cat'), spec).toBe(100)
      expect(ap(after[spec], 'bear') - ap(before[spec], 'bear'), spec).toBe(100)
      expect(ap(after[spec], 'caster') - ap(before[spec], 'caster'), spec).toBe(0)
    }
    // The sheet is the spec's form's: no Strength or talent scales it.
    expect(after.cat.sheet.attackPower - before.cat.sheet.attackPower).toBe(100)
    expect(after.bear.sheet.attackPower - before.bear.sheet.attackPower).toBe(100)
    // A warrior has no forms: it gets nothing.
    expect(after.warrior.plan.stats.ap).toBe(before.warrior.plan.stats.ap)
    expect(after.warrior.sheet.attackPower).toBe(before.warrior.sheet.attackPower)
  })

  it('Primal Fury’s rage is left out of a cat plan and always rolled in a bear plan (no shapeshifts)', () => {
    const cat = buildPlan(bare(defaultConfig('druid-feral-cat'))).plan
    const bear = buildPlan(bare(defaultConfig('druid-feral-bear'))).plan
    expect(cat.procs.map((p) => p.id)).not.toContain('primalFury')
    expect(bear.procs.find((p) => p.id === 'primalFury')).toMatchObject({ chance: [1, 1] })
    expect(bear.procs.find((p) => p.id === 'primalFury')?.forms).toBeUndefined()
  })
})

describe('druid defaults (druid.md §7)', () => {
  it('the cat: popular build, Tauren, the two-hander with +25 Agility, Agility enchants and Flank au Poivre', () => {
    const d = defaultConfig('druid-feral-cat')
    expect(d.race).toBe('horde-tauren')
    expect(d.talents).toBe('050022-5520002123032213051-05')
    expect(d.gear.mainHand).toEqual({ itemId: 9449, enchantId: 'twoHandAgility' }) // Manual Crowd Pummeler
    expect(d.gear.offHand).toBeUndefined()
    expect(d.gear.hands?.enchantId).toBe('gloveGreaterAgility')
    expect(d.gear.head?.enchantId).toBe('arcanumVoracityAgility')
    expect(d.buffs.enabled).toEqual(expect.arrayContaining(['elixirOfTheMongoose', 'elixirOfGreaterStrength', 'flankAuPoivre']))
    expect(d.buffs.enabled).not.toContain('mightyRagePotion')
    expect(BUFFS_BY_ID.get('flankAuPoivre')?.effects).toEqual([{ kind: 'stat', stat: 'agi', value: 20 }])
  })

  it('the bear: the proposed build, the tank consumables and threat gloves', () => {
    const d = defaultConfig('druid-feral-bear')
    expect(d.talents).toBe('050012-5523032120132210551-')
    expect(d.gear.mainHand?.enchantId).toBe('twoHandAgility')
    expect(d.gear.hands?.enchantId).toBe('gloveThreat')
    expect(d.buffs.enabled).toEqual(
      expect.arrayContaining(['elixirOfGreaterDefense', 'elixirOfFortitude', 'elixirOfTheMongoose', 'elixirOfGreaterStrength', 'smokedDesertDumplings', 'mightyRagePotion']),
    )
    expect(d.buffs.enabled).not.toContain('flankAuPoivre')
  })

  it('mana: base 1,244 plus Intellect, spirit regeneration 15 + Spirit / 5 per tick', () => {
    const { plan, sheet } = buildPlan(bare(defaultConfig('druid-feral-cat')))
    expect(plan.mana!.maxTenths).toBe(10 * sheet.mana!)
    expect(plan.mana!.regenTickTenths).toBe(spiritRegenTickTenths(sheet.spirit))
    expect(spiritRegenTickTenths(110)).toBe(370)
  })
})
