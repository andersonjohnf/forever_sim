// The gear search's candidates and rules (docs/optimizer.md#gear): pure, no fights, except the
// stat-weight perturbation's plan checks.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../defaults'
import { ENCHANTS } from '../effects/enchants'
import { itemFaction, isTwoHand } from '../equip'
import { buildPlan } from '../plan/build'
import type { GearSlot, SimConfig, SpecId } from '../types'
import { LATER_RAID_ITEMS, LATER_RAID_SETS, ONYXIA_ITEMS, PRE_RAID_MAX_ITEM_LEVEL } from './content'
import { describeGearChange } from './describe'
import {
  contentOf,
  describeSource,
  enchantFits,
  estimatedGain,
  type Gear,
  gearContext,
  type GearFilters,
  gearProblems,
  greedyGear,
  groupGears,
  ITEM_SETS,
  itemFieldValues,
  itemSource,
  POOL,
  type Rankings,
  rankList,
  SEARCHED_SLOTS,
  slotPool,
  type StatWeights,
  topEnchants,
  UNCONFIRMED_ENCHANTS,
  weighedEnchant,
  weighedItem,
  weighValues,
} from './gear'
import { gearPools, perturbPlan, weightDeltas } from './gear-search'
import { candidateKey, gearKey, setupCandidate } from './optimize'

const fixed = (config: SimConfig): SimConfig => ({ ...config, run: { mode: 'fixed', iterations: 0, seed: 1 } })
const setup = (spec: SpecId, race?: string) => fixed(defaultConfig(spec, race))
const item = (id: number) => POOL.get(id)!

/** Rankings without fights: an item's value is its item level plus its stats at these weights; enchants weighed, the rest unknown. */
function fakeRankings(config: SimConfig, filters: GearFilters = {}, weights: StatWeights = { str: 1, agi: 1, ap: 0.5, crit: 10, hit: 10 }): Rankings {
  const ctx = gearContext(config, filters)
  const items: Rankings['items'] = new Map()
  for (const [slot, pool] of gearPools(ctx))
    for (const i of pool) {
      const list = rankList(slot, i)
      if (!items.has(list)) items.set(list, new Map())
      items.get(list)!.set(i.id, i.itemLevel + weighValues(itemFieldValues(ctx, i), weights) / 100)
    }
  const excluded = new Set(filters.excludedEnchants ?? UNCONFIRMED_ENCHANTS)
  const enchants = new Map(ENCHANTS.filter((e) => !excluded.has(e.id)).map((e) => [e.id, weighedEnchant(e, ctx.profile) ? e.effects.reduce((n, x) => n + (x.kind === 'stat' ? x.value * (weights[x.stat] ?? 0) : 0), 0) : null]))
  return { items, enchants, weights }
}

function groups(config: SimConfig, group: Parameters<typeof groupGears>[1], filters: GearFilters = {}, gear: Gear = config.gear) {
  const ctx = gearContext(config, filters)
  return groupGears(ctx, group, gear, fakeRankings(config, filters), gearPools(ctx))
}

describe('the pool a slot takes', () => {
  it('holds what the class can wear or wield', () => {
    const mage = gearContext(setup('mage-fire'))
    expect(slotPool(mage, 'chest').every((i) => i.armorType === 'cloth' || i.armorType === null)).toBe(true)
    expect(slotPool(mage, 'offHand').some((i) => i.itemClass === 'Weapon' || i.slot === 'shield')).toBe(false)
    const rogue = gearContext(setup('rogue-combat'))
    expect(slotPool(rogue, 'mainHand').some(isTwoHand)).toBe(false)
    expect(slotPool(rogue, 'offHand').some((i) => i.slot === 'shield')).toBe(false)
    expect(slotPool(rogue, 'offHand').filter((i) => i.itemClass === 'Weapon').length).toBeGreaterThan(20)
    // A druid can't dual wield or use a shield: its off hand holds only held-in-off-hand items.
    const druid = gearContext(setup('druid-balance'))
    expect(slotPool(druid, 'offHand').every((i) => i.slot === 'heldInOffHand')).toBe(true)
    // Relics go in the ranged slot of the classes that have them.
    expect(slotPool(druid, 'ranged').every((i) => i.itemSubclass === 'Idol')).toBe(true)
  })

  it('holds only the faction’s items', () => {
    const human = gearContext(setup('warrior-fury', 'alliance-human'))
    const orc = gearContext(setup('warrior-fury', 'horde-orc'))
    for (const slot of SEARCHED_SLOTS) {
      expect(slotPool(human, slot).some((i) => itemFaction(i) === 'Horde')).toBe(false)
      expect(slotPool(orc, slot).some((i) => itemFaction(i) === 'Alliance')).toBe(false)
    }
    // Knight-Lieutenant's Plate Greaves is the Alliance's PvP item.
    expect(slotPool(human, 'feet').some((i) => i.id === 23287)).toBe(true)
    expect(slotPool(orc, 'feet').some((i) => i.id === 23287)).toBe(false)
  })

  it('keeps to the item level range and the sources', () => {
    const config = setup('warrior-fury')
    const ranged = gearContext(config, { itemLevel: { min: 60, max: 63 } })
    for (const slot of SEARCHED_SLOTS) expect(slotPool(ranged, slot).every((i) => i.itemLevel >= 60 && i.itemLevel <= 63)).toBe(true)
    expect(slotPool(ranged, 'head').length).toBeGreaterThan(0)
    const pvp = gearContext(config, { sources: ['pvp'] })
    expect(slotPool(pvp, 'legs').length).toBeGreaterThan(0)
    for (const slot of SEARCHED_SLOTS) expect(slotPool(pvp, slot).every((i) => itemSource(i) === 'pvp')).toBe(true)
    // Rank requirements, battleground reputations and names are PvP; Theramore's standing is a reputation.
    expect(itemSource(item(23287))).toBe('pvp')
    expect(itemSource(item(271908))).toBe('reputation')
    expect(itemSource(item(12640))).toBe('other')
  })

  it('keeps a shield tank on a one-hander and a shield', () => {
    const ctx = gearContext(setup('warrior-protection'))
    expect(slotPool(ctx, 'mainHand').some(isTwoHand)).toBe(false)
    expect(slotPool(ctx, 'offHand').every((i) => i.slot === 'shield')).toBe(true)
    const config = setup('warrior-protection')
    for (const g of groups(config, 'weapons')) {
      expect(isTwoHand(item(g.mainHand!.itemId))).toBe(false)
      expect(item(g.offHand!.itemId).slot).toBe('shield')
    }
  })
})

describe('the default pool: pre-raid gear and the launch raids (D30, 2026-09-25)', () => {
  const fury = setup('warrior-fury')
  const inDefault = (id: number, slot: GearSlot, config = fury) => slotPool(gearContext(config), slot).some((i) => i.id === id)
  const withLater = (id: number, slot: GearSlot, config = fury) => slotPool(gearContext(config, { laterRaids: true }), slot).some((i) => i.id === id)

  it('leaves the later raids out unless the player opts in', () => {
    // The O2 review's picks (O2L-1): Ahn'Qiraj's and Zul'Gurub's Rares, above item level 63 and on no list.
    for (const [id, slot] of [
      [21809, 'neck'], // Fury of the Forgotten Swarm, 71
      [21490, 'feet'], // Slime Kickers, 73
      [20216, 'waist'], // Belt of Preserved Heads, 70
      [22714, 'hands'], // Sacrificial Gauntlets, 68
    ] as const) {
      expect(contentOf(item(id)).content).toBe('later')
      expect(inDefault(id, slot)).toBe(false)
      expect(withLater(id, slot)).toBe(true)
    }
    expect(inDefault(21495, 'legs', setup('warrior-protection'))).toBe(false) // Legplates of the Qiraji Command
    // A Zul'Gurub neck at item level 60, which the item-level line can't see.
    expect(contentOf(item(19615))).toEqual({ content: 'later', raid: "Zul'Gurub" })
    expect(inDefault(19615, 'neck')).toBe(false)
    // A piece of a Zul'Gurub set.
    expect(contentOf(item(19898)).raid).toBe("Zul'Gurub") // Seal of Jin
  })

  it('keeps every pre-raid list item, Forever-new items and non-raid items up to item level 63', () => {
    // Earthstrike is item level 66, and on a list.
    expect(item(21180).itemLevel).toBeGreaterThan(PRE_RAID_MAX_ITEM_LEVEL)
    expect(contentOf(item(21180)).content).toBe('pre-raid')
    expect(inDefault(21180, 'trinket1')).toBe(true)
    // Adaptive Combat Assistant (65) and Stalwart Watcher's Signet (68) are new in Forever: the launch game's.
    expect(contentOf(item(272437)).content).toBe('forever-new')
    expect(inDefault(272437, 'trinket1', setup('warrior-protection'))).toBe(true)
    expect(inDefault(275975, 'finger1', setup('warrior-protection'))).toBe(true)
    // Non-raid items at 63 or below: a dungeon drop, a PvP rank piece.
    expect(contentOf(item(12640)).content).toBe('pre-raid') // Lionheart Helm, listed
    expect(inDefault(23287, 'feet')).toBe(true) // Knight-Lieutenant's Plate Greaves
    // Every item in the default pool is pre-raid, Forever-new or a launch raid's.
    for (const slot of SEARCHED_SLOTS) for (const i of slotPool(gearContext(fury), slot)) expect(contentOf(i).content).not.toBe('later')
  })

  it('knows its curated items by the names the pool gives them', () => {
    for (const [id, { name }] of LATER_RAID_ITEMS) expect(item(id)?.name).toBe(name)
    const setNames = new Set(Object.values(ITEM_SETS).map((s) => s.name))
    for (const name of LATER_RAID_SETS.keys()) expect(setNames.has(name)).toBe(true)
    // Onyxia drops Epics, which the pool (D10's Rares and the lists) doesn't take: none is in it today.
    for (const id of ONYXIA_ITEMS.keys()) expect(POOL.has(id)).toBe(false)
    // One would be a launch raid's.
    expect(contentOf({ ...item(12640), id: 17068 })).toEqual({ content: 'launch-raid', raid: 'Onyxia' })
  })

  it('labels each piece’s source', () => {
    expect(describeSource({ ...item(12640), id: 17068 })).toBe('launch raid: Onyxia')
    expect(describeSource(item(21809))).toBe('later content (item level 71, on no pre-raid list), from the gear the search started from')
    expect(describeSource(item(21809), { laterRaids: true })).toBe('later content (item level 71, on no pre-raid list), opted in')
    expect(describeSource(item(19615), { laterRaids: true })).toBe("later raid: Zul'Gurub, opted in")
    expect(describeSource(item(275975))).toBe('Forever-new; reputation (The Watchers, Honored)')
    expect(describeSource(item(23287))).toBe('PvP rank 7')
    expect(describeSource(item(12640))).toBeNull()
  })
})

describe('the rules a gear set keeps', () => {
  const config = setup('warrior-fury')
  const ctx = gearContext(config)

  it('flags a broken Unique or Unique-Equipped rule', () => {
    // Don Julio's Band is Unique: two copies break it.
    expect(gearProblems(ctx, { ...config.gear, finger1: { itemId: 19325 }, finger2: { itemId: 19325 } }).join()).toMatch(/Unique/)
    // Two of the Watcher's Signets share a Unique-Equipped group of one.
    expect(gearProblems(ctx, { ...config.gear, finger1: { itemId: 275968 }, finger2: { itemId: 275971 } }).join()).toMatch(/Unique/)
    // The rings step never pairs them.
    for (const g of groups(config, 'rings')) {
      expect(gearProblems(ctx, g)).toEqual([])
      const [a, b] = [item(g.finger1!.itemId), item(g.finger2!.itemId)]
      if (a.id === b.id) expect(a.unique || a.uniqueEquipped).toBeFalsy()
      if (a.uniqueEquipped?.group && a.uniqueEquipped.max === 1) expect(b.uniqueEquipped?.group).not.toBe(a.uniqueEquipped.group)
    }
  })

  it('races a two-hander against a main and an off hand', () => {
    const gears = groups(config, 'weapons')
    const two = gears.filter((g) => isTwoHand(item(g.mainHand!.itemId)))
    const dual = gears.filter((g) => !isTwoHand(item(g.mainHand!.itemId)) && g.offHand)
    expect(two.length).toBeGreaterThan(0)
    expect(dual.length).toBeGreaterThan(0)
    for (const g of two) expect(g.offHand).toBeUndefined()
    // A two-hander with an off hand is illegal.
    const twoHander = two[0].mainHand!
    expect(gearProblems(ctx, { ...config.gear, mainHand: twoHander })).toContain('a two-hander leaves the off hand empty')
    // The two-handers take only enchants that fit them, the one-handers never a two-hander's.
    for (const g of gears)
      for (const slot of ['mainHand', 'offHand'] as const) {
        const e = g[slot]?.enchantId
        if (e) expect(enchantFits(ENCHANTS.find((x) => x.id === e)!, slot, item(g[slot]!.itemId))).toBe(true)
      }
  })

  it('checks the hands’ rules only when a hand changes', () => {
    // A Protection warrior set up with a two-hander breaks the shield rule, but its head can still be searched.
    const prot = setup('warrior-protection')
    const twoHander = [...POOL.values()].find((i) => isTwoHand(i) && i.weaponType === 'sword')!
    const broken: Gear = { ...prot.gear, mainHand: { itemId: twoHander.id } }
    delete broken.offHand
    const protCtx = gearContext(prot)
    expect(gearProblems(protCtx, broken)).toContain('a shield tank keeps a one-hander and a shield')
    expect(gearProblems(protCtx, { ...broken, head: { itemId: 12640 } }, broken)).toEqual([])
    expect(groups(prot, 'head', {}, broken).length).toBeGreaterThan(0)
  })

  it('leaves locked slots as they are', () => {
    const locked = (slots: GearSlot[]) => ({ locked: slots })
    expect(groups(config, 'head', locked(['head']))).toEqual([])
    for (const g of groups(config, 'weapons', locked(['mainHand']))) expect(g.mainHand).toEqual(config.gear.mainHand)
    for (const g of groups(config, 'rings', locked(['finger1']))) expect(g.finger1).toEqual(config.gear.finger1)
    for (const g of groups(config, 'sets', locked(['mainHand', 'offHand']))) {
      expect(g.mainHand).toEqual(config.gear.mainHand)
      expect(g.offHand).toEqual(config.gear.offHand)
    }
    const ctxLocked = gearContext(config, locked(['head', 'trinket1']))
    const greedy = greedyGear(ctxLocked, config.gear, fakeRankings(config, locked(['head', 'trinket1'])), gearPools(ctxLocked))
    expect(greedy.head).toEqual(config.gear.head)
    expect(greedy.trinket1).toEqual(config.gear.trinket1)
  })

  it('keeps every step’s gear legal and new', () => {
    for (const group of ['head', 'rings', 'trinkets', 'weapons', 'ranged', 'sets'] as const) {
      const gears = groups(config, group)
      expect(gears.length).toBeGreaterThan(0)
      expect(new Set(gears.map(gearKey)).size).toBe(gears.length)
      for (const g of gears) {
        expect(gearKey(g)).not.toBe(gearKey(config.gear))
        expect(gearProblems(ctx, g, config.gear)).toEqual([])
      }
    }
  })
})

describe('enchants with their slot', () => {
  const config = setup('warrior-fury')

  it('tries each top item with its top enchants, and the current item with its own', () => {
    const gears = groups(config, 'hands')
    const byItem = new Map<number, Set<string | undefined>>()
    for (const g of gears) byItem.set(g.hands!.itemId, (byItem.get(g.hands!.itemId) ?? new Set()).add(g.hands!.enchantId))
    // Each item with more than one enchant: an item and its enchants race together.
    expect([...byItem.values()].some((s) => s.size > 1)).toBe(true)
    // The strongest Strength enchant at these weights, and the threat and haste gloves, whose value is unknown to the weights.
    const all = new Set(gears.map((g) => g.hands!.enchantId))
    expect(all.has('gloveSuperiorStrength')).toBe(true)
    expect(all.has('gloveThreat')).toBe(true)
    expect(all.has('gloveMinorHaste')).toBe(true)
  })

  it('leaves out the unconfirmed shoulder enchants unless told', () => {
    const shoulderEnchants = (filters: GearFilters) => new Set(groups(config, 'shoulder', filters).map((g) => g.shoulder?.enchantId))
    for (const id of UNCONFIRMED_ENCHANTS) expect(shoulderEnchants({}).has(id)).toBe(false)
    expect(shoulderEnchants({ excludedEnchants: [] }).has('zandalarSignetOfMight')).toBe(true)
  })

  it('puts a shield’s enchants only on shields', () => {
    const prot = setup('warrior-protection')
    const rankings = fakeRankings(prot)
    const shield = item(prot.gear.offHand!.itemId)
    expect(topEnchants(rankings, 'offHand', shield, 9).every((e) => e === undefined || ENCHANTS.find((x) => x.id === e)!.requires === 'shield' || !ENCHANTS.find((x) => x.id === e)!.requires)).toBe(true)
    const dagger = [...POOL.values()].find((i) => i.weaponType === 'dagger')!
    expect(topEnchants(rankings, 'offHand', dagger, 9).some((e) => e?.startsWith('shield'))).toBe(false)
  })
})

describe('sets raced together', () => {
  const config = setup('warrior-fury')

  it('swaps a set’s pieces in together, so its bonus can show', () => {
    // Dal'Rend's Arms: Dal'Rend's Sacred Charge and Tribal Guardian, +50 attack power for the two.
    const gears = groups(config, 'sets')
    const dalrend = gears.find((g) => g.mainHand?.itemId === 12940 || g.offHand?.itemId === 12940)
    expect(dalrend).toBeDefined()
    expect(new Set([dalrend!.mainHand?.itemId, dalrend!.offHand?.itemId])).toEqual(new Set([12939, 12940]))
    // The estimate counts the bonus: 50 attack power at 0.5 a point.
    const ctx = gearContext(config)
    const rankings = fakeRankings(config)
    const pieces = estimatedGain(ctx, config.gear, dalrend!, rankings)
    const withoutBonus = estimatedGain(ctx, config.gear, dalrend!, { ...rankings, weights: { ...rankings.weights, ap: 0 } })
    expect(pieces - withoutBonus).toBeCloseTo(25, 6)
  })

  it('names what changed, with PvP and reputation pieces’ sources', () => {
    const next: Gear = { ...config.gear, legs: { itemId: 23301 }, finger2: { itemId: 271908 } }
    const changes = describeGearChange(config.gear, next)
    expect(changes.find((c) => c.startsWith('Finger 2:'))).toMatch(/Theramore Signet \[Forever-new; reputation \(Theramore Expeditionary Force, Honored\)\]/)
    expect(changes.join('\n')).toMatch(/PvP rank/)
  })
})

describe('stat weights', () => {
  it('prices flat stats, and leaves weapons, relics and modelled effects to a swap', () => {
    const ctx = gearContext(setup('warrior-fury'))
    expect(weighedItem(ctx, item(12640))).toBe(true) // Lionheart Helm
    expect(weighedItem(ctx, item(11815))).toBe(false) // Hand of Justice's proc
    expect(weighedItem(ctx, item(12940))).toBe(false) // a weapon
    expect(itemFieldValues(ctx, item(12640)).get('str')).toBe(item(12640).stats.strength)
    // Every weighed field has a positive change to measure it with.
    const deltas = weightDeltas(ctx, gearPools(ctx))
    expect(deltas.str).toBeGreaterThan(0)
    expect(Object.values(deltas).every((d) => d! >= 1)).toBe(true)
  })

  it('raises a field in the plan and what the plan derives from it', () => {
    const config = setup('warrior-protection')
    const plan = buildPlan(config).plan
    const up = perturbPlan(plan, 'sta', 10, config)
    expect(up.stats.sta).toBe(plan.stats.sta + 10)
    expect(up.rage.maxHealth).toBeGreaterThan(plan.rage.maxHealth + 100)
    expect(up.armor).toBe(plan.armor)
    const armored = perturbPlan(plan, 'itemArmor', 100, config)
    expect(armored.armor).toBeGreaterThan(plan.armor + 99)
    // The original plan is untouched.
    expect(buildPlan(config).plan.stats.sta).toBe(plan.stats.sta)
  })
})

describe('a candidate with gear', () => {
  it('is the setup only with the setup’s gear', () => {
    const config = setup('warrior-fury')
    const base = setupCandidate(config)
    expect(candidateKey(config, { ...base, gear: config.gear })).toBe(candidateKey(config, base))
    expect(candidateKey(config, { ...base, gear: { ...config.gear, head: { itemId: 12640 } } })).not.toBe(candidateKey(config, base))
  })
})
