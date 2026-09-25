// The consumables every rotation uses on cooldown (buffs doc "On-use items and cooldown
// categories", §3.5, §3.7; classes/shared-consumables.ts): Greater Stoneshield Potion's armor on a
// tank, through the boss's swings, and EZ-Thro Dark Bomb's Fire damage on the spell table, its
// 60 s explosive cooldown and its 1 s throw that stops your swings. The buffs doc's worked examples
// 11 and 12.
import { describe, expect, it } from 'vitest'
import { armorReduction, bossHitHealthLost } from '../core/formulas'
import { defaultConfig, FULL_RAID } from '../defaults'
import { EZ_THRO_DARK_BOMB, GREATER_STONESHIELD_POTION, MAJOR_FRENZY_POTION } from '../effects/buffs'
import { presetBuffIds } from '../effects/presets'
import { buildPlan } from '../plan/build'
import { COND, SCHOOL, type Plan } from '../plan/types'
import { FOREVER } from '../rules/profiles'
import { emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import type { SimConfig, SpecId } from '../types'
import { CHUNK_SIZE, runChunk } from './chunk'
import { BOSS_OUTCOME, FIELD, FIELD_COUNT, Sim } from './sim'
import { rotationOff, timeline } from './test-helpers'

/** A spec's default setup with only these buffs, a fight of exactly 180 s. */
function config(spec: SpecId, enabled: string[], patch: Partial<SimConfig> = {}): SimConfig {
  const d = defaultConfig(spec)
  return { ...d, buffs: { raid: d.buffs.raid, enabled }, fight: { ...d.fight, durationVariationPct: 0 }, run: { mode: 'fixed', iterations: 1000, seed: 7 }, ...patch }
}

function aggregate(plan: Plan, fights: number) {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

/** Each fight's landed plain hits from the boss: [health lost, size before mitigation]. */
function hitsTaken(plan: Plan, fights: number): [number, number][] {
  const sim = new Sim(plan)
  const out: [number, number][] = []
  sim.swingTakenTrace = (o, lost, pre) => {
    if (o === BOSS_OUTCOME.hit) out.push([lost, pre])
  }
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return out
}

describe('Greater Stoneshield Potion (buffs doc §3.5)', () => {
  /** A Protection warrior tank with no rotation of its own, swings of exactly 5,000: only the potion is used. */
  const tank = (enabled: string[]) =>
    config('warrior-protection', enabled, {
      rotation: rotationOff('warrior-protection'),
      fight: { ...defaultConfig('warrior-protection').fight, durationVariationPct: 0, boss: { ...defaultConfig('warrior-protection').fight.boss, damageMin: 5000, damageMax: 5000 } },
    })

  it('is drunk at the pull and again as its 2 min cooldown ends, so its +2,000 armor is up all fight', () => {
    const { plan } = buildPlan(tank(['greaterStoneshieldPotion']))
    const a = plan.abilities.findIndex((x) => x.id === GREATER_STONESHIELD_POTION.id)
    expect(a).toBeGreaterThanOrEqual(0)
    const aura = plan.auras[plan.abilities[a].aura]
    expect([aura.durationMs, aura.armor]).toEqual([120000, 2000])
    expect(timeline(plan).uses[a]).toEqual([0, 120000])
    const agg = aggregate(plan, 50)
    expect(agg.auraUpMs[plan.abilities[a].aura]).toBe(50 * 180000)
  })

  it('lasts 120 s: with its cooldown stretched to 170 s, it’s down from 120 s to 170 s', () => {
    const { plan } = buildPlan(tank(['greaterStoneshieldPotion']))
    const a = plan.abilities.findIndex((x) => x.id === GREATER_STONESHIELD_POTION.id)
    plan.abilities[a].cooldownMs = 170000
    expect(timeline(plan).uses[a]).toEqual([0, 170000])
    expect(aggregate(plan, 10).auraUpMs[plan.abilities[a].aura]).toBe(10 * (120000 + 10000))
  })

  it('makes each of the boss’s hits cost what 2,000 more armor leaves, and lowers the tank’s damage taken (worked example 11)', () => {
    const without = buildPlan(tank([]))
    const withPotion = buildPlan(tank(['greaterStoneshieldPotion']))
    const armor = without.plan.armor
    expect(withPotion.plan.armor).toBe(armor)
    // Defensive Stance's −10% damage taken; no block value on a plain hit.
    const hit = (a: number) => bossHitHealthLost(5000, 'hit', armorReduction(a, 63, FOREVER), 0.9, 0)
    const hits = hitsTaken(withPotion.plan, 20)
    expect(hits.length).toBeGreaterThan(100)
    for (const [lost, pre] of hits) {
      expect(pre).toBe(5000)
      expect(lost).toBeCloseTo(hit(armor + 2000), 9)
    }
    for (const [lost] of hitsTaken(without.plan, 5)) expect(lost).toBeCloseTo(hit(armor), 9)
    const dtps = (bundle: typeof without) => toResult(bundle, aggregate(bundle.plan, 400), 0).tank!.dtps.mean
    expect(dtps(withPotion)).toBeLessThan(dtps(without) * 0.92)
    // Worked example 11: 6,000 armor against a level-63 boss's 5,000 hit, in Defensive Stance.
    expect(armorReduction(6000, 63, FOREVER)).toBeCloseTo(0.510421, 6)
    expect(hit(6000)).toBeCloseTo(2203.1, 1)
    expect(hit(8000)).toBeCloseTo(1882.8, 1)
  })

  it('is bonus armor, which Forever’s Dire Bear Form multiplies by 4.6 (docs/classes/druid.md §4.7) [?]', () => {
    const bear = (enabled: string[]) =>
      buildPlan(
        config('druid-feral-bear', enabled, {
          rotation: rotationOff('druid-feral-bear'),
          fight: { ...defaultConfig('druid-feral-bear').fight, durationVariationPct: 0, boss: { ...defaultConfig('druid-feral-bear').fight.boss, damageMin: 5000, damageMax: 5000 } },
        }),
      ).plan
    const plain = hitsTaken(bear([]), 3)
    const potion = hitsTaken(bear(['greaterStoneshieldPotion']), 3)
    const armor = bear([]).armor
    const ratio = (1 - armorReduction(armor + 2000 * 4.6, 63, FOREVER)) / (1 - armorReduction(armor, 63, FOREVER))
    expect(potion[0][0] / plain[0][0]).toBeCloseTo(ratio, 9)
  })
})

describe('EZ-Thro Dark Bomb (buffs doc §3.7)', () => {
  const fury = (enabled: string[]) => buildPlan(config('warrior-fury', enabled)).plan

  it('is a 1 s spell on the explosive category’s 60 s cooldown', () => {
    const plan = fury(['ezThroDarkBomb'])
    const a = plan.abilities.findIndex((x) => x.id === EZ_THRO_DARK_BOMB.id)
    expect(plan.abilities[a]).toMatchObject({ kind: 'spell', castMs: 1000, gcdMs: 1000, castStopsSwings: true, cooldownMs: 60000 })
  })

  it.each(['warrior-fury', 'druid-feral-bear', 'shaman-enhancement'] as const)(
    '%s throws it 3 times in a 180 s fight: just after its first main-hand swing, then on cooldown, whatever the swing timer (step 6 of review QC-1)',
    (spec) => {
      const plan = buildPlan(config(spec, ['ezThroDarkBomb'])).plan
      const a = plan.abilities.findIndex((x) => x.id === EZ_THRO_DARK_BOMB.id)
      const line = plan.rotation.find((e) => e.ability === a)!
      expect(line.conditions).toEqual([{ code: COND.mainHandSwung, a: 0, b: 0 }])
      for (let fight = 0; fight < 20; fight++) {
        const { uses, swings } = timeline(plan, fight)
        const throws = uses[a]
        expect(throws.length, `${spec} fight ${fight}`).toBe(3)
        // Not before the pull's first swing (white, or an on-next-swing ability's), which it would
        // cancel (review CV-5), and no later than the next GCD after it.
        const mainSwings = [...swings[0], ...plan.abilities.flatMap((x, b) => (x.kind === 'onNextSwing' ? uses[b] : []))]
        const first = Math.min(...mainSwings)
        expect(throws[0]).toBeGreaterThanOrEqual(first)
        expect(throws[0] - first).toBeLessThanOrEqual(1500)
        for (let i = 1; i < throws.length; i++) {
          // The explosive category's 60 s from the cast's end, then at most a GCD's wait: no wait for a swing.
          expect(throws[i] - throws[i - 1]).toBeGreaterThanOrEqual(61000)
          expect(throws[i] - throws[i - 1]).toBeLessThanOrEqual(61000 + 1500)
        }
        // Neither hand swings during a throw: they start again from full as it lands.
        for (const t of throws) for (const hand of swings) expect(hand.filter((x) => x > t && x < t + 1000)).toEqual([])
      }
    },
  )

  it('holds your off-GCD abilities too while it’s thrown, as Hammer of Wrath’s cast does (review CV-6)', () => {
    // A Fire mage throws it at the pull, where Greater Stoneshield, off the GCD and after it in the
    // list, is ready too.
    const plan = buildPlan(config('mage-fire', ['ezThroDarkBomb', 'greaterStoneshieldPotion'])).plan
    const a = plan.abilities.findIndex((x) => x.id === EZ_THRO_DARK_BOMB.id)
    expect(plan.abilities[a].castHoldsOffGcd).toBe(true)
    /** Uses of the other abilities from a throw's start, after it, until it lands, over 20 fights. */
    const during = () => {
      const sim = new Sim(plan)
      const out: string[] = []
      let landsAt = -Infinity
      sim.castTrace = (b, time) => {
        if (b === a) landsAt = time + 1000
        else if (time < landsAt) out.push(`${plan.abilities[b].id}@${time}`)
      }
      for (let fight = 0; fight < 20; fight++) {
        landsAt = -Infinity
        sim.runFight(fight)
      }
      return out
    }
    expect(during()).toEqual([])
    // Without the hold, an off-GCD line (the potion) would go during it.
    plan.abilities[a].castHoldsOffGcd = false
    expect(during().length).toBeGreaterThan(0)
  })

  it('rolls spell hit with the boss’s average Fire resistance whole, then spell crit at ×1.5, for 225–675 (worked example 12)', () => {
    const plan = fury(['ezThroDarkBomb'])
    const row = plan.sources.findIndex((s) => s.id === EZ_THRO_DARK_BOMB.id)
    const sim = new Sim(plan)
    const start = sim.inspect()
    const damages: number[] = []
    sim.damageTrace = (s, damage) => {
      if (s === row) damages.push(damage)
    }
    const fights = 3000
    for (let i = 0; i < fights; i++) sim.runFight(i)
    const count = (field: number) => sim.counters[row * FIELD_COUNT + field]
    const casts = count(FIELD.casts)
    expect(casts).toBe(3 * fights)
    const resist = 1 - start.resistFactor[SCHOOL.fire]
    expect(resist).toBeCloseTo((0.75 * 24) / 300, 9)
    const failPct = start.spellMiss + (100 - start.spellMiss) * resist
    const share = (n: number, of: number, pct: number) => {
      const p = pct / 100
      expect(Math.abs(n / of - p), `${n}/${of} vs ${p}`).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / of))
    }
    share(count(FIELD.misses), casts, failPct)
    const landed = casts - count(FIELD.misses)
    share(count(FIELD.crits), landed, start.spellCrit)
    // A landed bomb takes no partial resist: its damage is its roll × the Fire multipliers, ×1.5 on a crit.
    const mult = start.schoolDamage[SCHOOL.fire] * start.schoolTaken[SCHOOL.fire]
    for (const d of damages) {
      const roll = d / mult
      const plain = roll >= 225 - 1e-9 && roll <= 675 + 1e-9
      const crit = roll >= 337.5 - 1e-9 && roll <= 1012.5 + 1e-9
      expect(plain || crit, `${d}`).toBe(true)
    }
    // Worked example 12: no spell hit, 5% spell crit.
    const fail = 17 + (100 - 17) * 0.06
    expect(fail).toBeCloseTo(21.98, 9)
    expect(((100 - fail) / 100) * 450 * (1 + 0.5 * 0.05)).toBeCloseTo(359.87, 2)
  })

  it('gets none of a Fire mage’s class talents: no Elemental Precision, Critical Mass, Combustion or Ignite (review CV-4) [?]', () => {
    // The mage casts nothing but Combustion, which goes up at the pull; one crit would end it here,
    // so any bomb crit that used its charge would show as Combustion going down.
    const rotation = { ...rotationOff('mage-fire'), 'mage.fire.combustion.enabled': true }
    const plan = buildPlan(config('mage-fire', ['ezThroDarkBomb'], { rotation })).plan
    const keep = new Set([EZ_THRO_DARK_BOMB.id, 'combustion'])
    plan.rotation = plan.rotation.filter((e) => keep.has(plan.abilities[e.ability].id))
    expect(plan.rotation.length).toBe(2)
    plan.prepull = { ...plan.prepull, casts: [] }
    const combustion = plan.auras.findIndex((x) => x.id === 'combustion')
    expect(combustion).toBeGreaterThanOrEqual(0)
    plan.auras[combustion].critCharges = 1
    // The talents are in the plan: Critical Mass's +6% Fire crit and Elemental Precision's Fire hit.
    expect(plan.schools!.crit[SCHOOL.fire]).toBe(6)
    expect(plan.schools!.hit![SCHOOL.fire]).toBeGreaterThan(0)
    const row = plan.sources.findIndex((s) => s.id === EZ_THRO_DARK_BOMB.id)
    const ignite = plan.sources.findIndex((s) => s.id === 'ignite')
    expect(ignite).toBeGreaterThanOrEqual(0)
    const sim = new Sim(plan)
    const start = sim.inspect()
    const fights = 3000
    for (let i = 0; i < fights; i++) sim.runFight(i)
    const count = (field: number) => sim.counters[row * FIELD_COUNT + field]
    const casts = count(FIELD.casts)
    expect(casts).toBe(3 * fights)
    const share = (n: number, of: number, pct: number) => {
      const p = pct / 100
      expect(Math.abs(n / of - p), `${n}/${of} vs ${p}`).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / of))
    }
    // Your spell hit and crit only, not the Fire school's, nor Combustion's +10%.
    share(count(FIELD.misses), casts, start.spellMiss + (100 - start.spellMiss) * (1 - start.resistFactor[SCHOOL.fire]))
    const crits = count(FIELD.crits)
    share(crits, casts - count(FIELD.misses), start.spellCrit)
    expect(crits).toBeGreaterThan(500)
    // Its crits feed no Ignite, and use none of Combustion's charges: it stays up all fight from when
    // the mage casts it, as the first throw lands (the throw holds it, review CV-6).
    expect(sim.counters[ignite * FIELD_COUNT + FIELD.casts]).toBe(0)
    const agg = aggregate(plan, 200)
    expect(agg.auraUpMs[combustion]).toBe(200 * (180000 - 1000))
  })

  it('is used by every spec’s rotation, and its row counts in the results', () => {
    for (const spec of ['mage-fire', 'rogue-combat', 'druid-feral-bear', 'paladin-protection', 'hunter-marksmanship'] as const) {
      const bundle = buildPlan(config(spec, ['ezThroDarkBomb']))
      expect(bundle.assumptions.find((x) => x.id === 'onUseConsumables')?.text ?? '', spec).not.toContain('EZ-Thro')
      // Its [?] rules are listed (buffs doc §3.7).
      expect(bundle.assumptions.map((x) => x.id), spec).toContain('explosiveThrow')
      // …in this spec's words: what its throw holds, and when it's thrown (review CV-2).
      const rules = bundle.assumptions.find((x) => x.id === 'explosiveThrow')!.text
      const holds = spec === 'mage-fire' ? 'holds your next cast' : spec === 'hunter-marksmanship' ? 'holds your Auto Shot' : 'stops your melee swings'
      expect(rules, spec).toContain(`Its 1 s throw ${holds}`)
      expect(rules, spec).toContain(spec === 'mage-fire' || spec === 'hunter-marksmanship' ? 'from the pull, from within its 15 yd range' : 'the first just after your first main-hand swing, the rest as it’s ready')
      expect(rules, spec).not.toMatch(/stops your swings/)
      const result = toResult(bundle, aggregate(bundle.plan, 20), 0)
      const row = result.abilities.find((x) => x.id === EZ_THRO_DARK_BOMB.id)
      // A melee spec's first throw waits for its first main-hand swing; a caster or a hunter, who doesn't swing, throws when it's ready.
      const line = bundle.plan.rotation.find((e) => bundle.plan.abilities[e.ability].id === EZ_THRO_DARK_BOMB.id)!
      const swings = spec !== 'mage-fire' && spec !== 'hunter-marksmanship'
      expect(line.conditions, spec).toEqual(swings ? [{ code: COND.mainHandSwung, a: 0, b: 0 }] : [])
      // Three throws each 3 min fight, a bear's too, whose GCD is rarely free (review QC-1).
      expect(row?.casts, spec).toBe(60)
      expect(row!.damage, spec).toBeGreaterThan(0)
    }
  })
})

describe('Major Frenzy Potion (buffs doc §3.5)', () => {
  it('is drunk at the pull and again as the potions’ 2 min cooldown ends: +80 attack power and ranged attack power for 30 s each time', () => {
    for (const spec of ['rogue-combat', 'hunter-marksmanship', 'warrior-fury'] as const) {
      const { plan } = buildPlan(config(spec, ['majorFrenzyPotion'], { rotation: rotationOff(spec) }))
      const a = plan.abilities.findIndex((x) => x.id === MAJOR_FRENZY_POTION.id)
      expect(a, spec).toBeGreaterThanOrEqual(0)
      expect(plan.abilities[a].gcdMs, spec).toBe(0)
      const aura = plan.auras[plan.abilities[a].aura]
      expect([aura.durationMs, aura.ap, aura.rap], spec).toEqual([30000, 80, 80])
      expect(timeline(plan).uses[a], spec).toEqual([0, 120000])
      expect(aggregate(plan, 20).auraUpMs[plan.abilities[a].aura], spec).toBe(20 * 60000)
    }
  })

  it('is in Max consumables where it beats the spec’s potion: the rogues’, and in place of the Major Mana Potion the Enhancement shaman’s and the Marksmanship and Survival hunters’ (buffs doc §6.3)', () => {
    const max = (spec: SpecId) => presetBuffIds('max', spec, FULL_RAID)
    for (const spec of ['rogue-combat', 'rogue-assassination', 'rogue-subtlety', 'shaman-enhancement', 'hunter-marksmanship', 'hunter-survival'] as const) {
      expect(max(spec), spec).toContain('majorFrenzyPotion')
      expect(max(spec), spec).not.toContain('majorManaPotion')
      expect(presetBuffIds('raid', spec, FULL_RAID), spec).not.toContain('majorFrenzyPotion')
    }
    // Each of the others keeps its potion: the rage potion's rage, or the mana.
    const kept: [SpecId, string][] = [
      ['hunter-beast-mastery', 'majorManaPotion'],
      ['warrior-fury', 'mightyRagePotion'],
      ['warrior-arms', 'mightyRagePotion'],
      ['warrior-protection', 'mightyRagePotion'],
      ['druid-feral-cat', 'mightyRagePotion'],
      ['druid-feral-bear', 'mightyRagePotion'],
      ['paladin-retribution', 'majorManaPotion'],
      ['paladin-protection', 'majorManaPotion'],
    ]
    for (const [spec, potion] of kept) {
      expect(max(spec), spec).toContain(potion)
      expect(max(spec), spec).not.toContain('majorFrenzyPotion')
    }
  })
})
