// Item and buff effects whose numbers come from the client data, tied to src/data/client
// (docs/data/client.md), and what the plan builder makes of them: Hand of Justice's and Ironfoe's
// chances and internal cooldowns per profile (damage-and-timing §5.2), Windfury Totem's internal cooldown
// (§5.4), and the weapons an Elemental Sharpening Stone fits and how two of them stack (buffs doc
// §3.6), with the stones' and oils' one group.
import { describe, expect, it } from 'vitest'
import enchantsJson from '@/data/client/enchants.json'
import itemsJson from '@/data/client/items.json'
import spellsJson from '@/data/client/spells.json'
import type { ClientItems, ClientSpells } from '@/data/client/types'
import itemJson from '@/data/items/pre-bis.json'
import type { ItemData, WeaponType } from '@/data/items/types'
import { defaultConfig } from '../defaults'
import { forSpecClass, presetBuffIds } from './presets'
import { buildPlan } from '../plan/build'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import type { RuleProfileId, SimConfig } from '../types'
import { BUFFS_BY_ID, ELEMENTAL_STONE_WEAPONS, TEMP_ENCHANT } from './buffs'
import { PROFICIENCY } from '../equip'
import { SPEC_IDS, SPEC_META } from '../specs'
import { HAND_OF_JUSTICE_ICD_MS, ITEM_EFFECTS } from './items'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientItems = (itemsJson as unknown as ClientItems).items
const enchants = (enchantsJson as unknown as { enchants: Record<string, { effect: number[]; effectArg: number[] }> }).enchants
const items = (itemJson as unknown as ItemData).items

/** SpellEffect: apply aura; SpellAuraName: dummy, weapon crit %; SpellItemEnchantment: equip spell. */
const APPLY_AURA = 6
const AURA_DUMMY = 4
const AURA_WEAPON_CRIT = 52
const ENCHANT_EQUIP_SPELL = 3
/** Proc mask: melee auto attack (0x4) and melee ability (0x10). */
const MELEE_HITS = 0x14

const withRules = (c: SimConfig, profile: RuleProfileId): SimConfig => ({ ...c, rules: { ...c.rules, profile } })
const procOf = (config: SimConfig, id: string) => buildPlan(config).plan.procs.find((p) => p.id === id)
const assumptionIds = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)

describe('Hand of Justice (spell 15600; damage-and-timing §5.2)', () => {
  const hoj = spells['15600']
  const config = (profile: RuleProfileId) => {
    const d = defaultConfig('warrior-fury')
    return withRules({ ...d, gear: { ...d.gear, trinket1: { itemId: 11815 } } }, profile)
  }

  it('Forever: ProcChance 3, "${$h/3}%", and 3× against Dwarves ($s2), so 1% against a boss; a 2 s internal cooldown', () => {
    expect(hoj.name).toBe('Hand of Justice')
    expect(hoj.auraOptions?.procTypeMask?.[0]).toBe(MELEE_HITS)
    const dwarves = hoj.effects.find((e) => e.effectIndex === 1)!
    expect(dwarves).toMatchObject({ effect: APPLY_AURA, effectAura: AURA_DUMMY, effectBasePointsF: 3 })
    expect(FOREVER.values.handOfJusticePct).toBe(hoj.auraOptions!.procChance! / dwarves.effectBasePointsF!)
    expect(HAND_OF_JUSTICE_ICD_MS).toBe(hoj.auraOptions!.procCategoryRecovery)
  })

  it('Classic Era: 2% (ProcChance 2 in 1.15.9, which src/data doesn’t carry), the same 2 s', () => {
    expect(CLASSIC_ERA.values.handOfJusticePct).toBe(2)
  })

  it('reaches the plan per profile, with its internal cooldown', () => {
    expect(typeof ITEM_EFFECTS[11815].effects).toBe('function')
    expect(procOf(config('forever'), 'handOfJustice')).toMatchObject({ chance: [0.01, 0.01], icdMs: 2000, hands: 3 })
    expect(procOf(config('classicEra'), 'handOfJustice')).toMatchObject({ chance: [0.02, 0.02], icdMs: 2000 })
  })

  it('isn’t one of the server-side proc rates the `procRates` assumption lists', () => {
    const d = defaultConfig('warrior-fury')
    const noEnchants = Object.fromEntries(Object.entries(d.gear).map(([slot, e]) => [slot, e && { itemId: e.itemId }]))
    // No Crusader and no PPM weapons: Hand of Justice alone.
    const gear = { ...noEnchants, mainHand: { itemId: 17016 }, offHand: { itemId: 18498 }, trinket1: { itemId: 11815 } }
    expect(procOf({ ...d, gear }, 'handOfJustice')).toBeDefined()
    expect(assumptionIds({ ...d, gear })).not.toContain('procRates')
    expect(assumptionIds(d)).toContain('procRates') // Crusader
  })
})

describe('Ironfoe (item 11684 → spell 1301046; damage-and-timing §5.2)', () => {
  const aura = spells['1301046']
  /** SpellEffect: extra attacks; SpellAuraName: proc trigger spell; ItemEffect trigger: on equip. */
  const EXTRA_ATTACKS = 19
  const AURA_PROC_TRIGGER_SPELL = 42
  const ON_EQUIP = 1
  const fury = defaultConfig('warrior-fury')

  it('Forever: an equip aura, ProcChance 6 with Orcs "$s2 times as likely" ($s2 = 2), read as 3% [?]; a 100 ms internal cooldown', () => {
    // The item's effect is the equip aura, not Classic Era's chance on hit (15494, trigger 2).
    expect(clientItems['11684'].effects).toEqual([expect.objectContaining({ id: 99055, spellId: 1301046, triggerType: ON_EQUIP })])
    expect(aura.name).toBe('Fury of Forgewright')
    expect(aura.auraOptions?.procTypeMask?.[0]).toBe(MELEE_HITS)
    const trigger = aura.effects.find((e) => e.effectIndex === 0)!
    expect(trigger).toMatchObject({ effect: APPLY_AURA, effectAura: AURA_PROC_TRIGGER_SPELL, effectTriggerSpell: 15494 })
    expect(spells['15494'].effects.find((e) => e.effect === EXTRA_ATTACKS)?.effectBasePointsF).toBe(2)
    expect(ITEM_EFFECTS[11684].effects).toBeTypeOf('function')
    const orcs = aura.effects.find((e) => e.effectIndex === 1)!
    expect(orcs).toMatchObject({ effect: APPLY_AURA, effectAura: AURA_DUMMY, effectBasePointsF: 2 })
    // Hand of Justice's reading: ProcChance is the favoured race's chance, ÷ $s2 for anyone else.
    expect(FOREVER.values.ironfoe).toEqual({ chance: { pct: aura.auraOptions!.procChance! / orcs.effectBasePointsF! }, icdMs: aura.auraOptions!.procCategoryRecovery })
    expect(FOREVER.values.ironfoe.chance).toEqual({ pct: 3 })
  })

  // TL1: why the chance is read as Hand of Justice's, and why the mask's second word is the one hint about hands.
  it('is otherwise a clone of Hand of Justice’s 15600, bar the mask’s second word, 0x20 (C37)', () => {
    const hoj = spells['15600']
    expect(aura.misc).toEqual(hoj.misc)
    expect(aura.levels).toEqual(hoj.levels)
    const shape = (spell: typeof hoj) => spell.effects.map((e) => [e.effectIndex, e.effect, e.effectAura, e.implicitTarget])
    expect(shape(aura)).toEqual(shape(hoj))
    // Its race dummy still names Hand of Justice's extra attack (15601), a leftover of the copy.
    expect(aura.effects.find((e) => e.effectIndex === 1)?.effectTriggerSpell).toBe(15601)
    expect(hoj.effects.find((e) => e.effectIndex === 1)?.effectTriggerSpell).toBe(15601)
    expect(hoj.auraOptions?.procTypeMask).toEqual([MELEE_HITS, 0])
    expect(aura.auraOptions?.procTypeMask).toEqual([MELEE_HITS, 0x20])
  })

  it('reaches the plan per profile from Ironfoe’s own hits: 3% with its cooldown in `forever`, 0.8 PPM in `classicEra`', () => {
    expect(fury.gear.mainHand?.itemId).toBe(11684)
    expect(fury.gear.offHand?.itemId).toBeDefined()
    // Hands bit 1 is the main hand alone: the off hand's sword doesn't roll it.
    expect(procOf(fury, 'ironfoe')).toMatchObject({ chance: [0.03, 0.03], hands: 1, icdMs: 100, amount: 2 })
    const speed = buildPlan(fury).plan.weapons[0]!.speedSec
    const classic = procOf(withRules(fury, 'classicEra'), 'ironfoe')!
    expect(classic).toMatchObject({ hands: 1, icdMs: 0, amount: 2 })
    expect(classic.chance[0]).toBeCloseTo((0.8 * speed) / 60, 12)
    expect(CLASSIC_ERA.values.ironfoe).toEqual({ chance: { ppm: 0.8 }, icdMs: 0 })
  })

  it('isn’t one of the server-side proc rates the `procRates` assumption lists', () => {
    const noEnchants = Object.fromEntries(Object.entries(fury.gear).map(([slot, e]) => [slot, e && { itemId: e.itemId }]))
    const config = { ...fury, gear: noEnchants }
    expect(procOf(config, 'ironfoe')).toBeDefined()
    expect(assumptionIds(config)).not.toContain('procRates')
    expect(buildPlan(fury).assumptions.find((a) => a.id === 'procRates')?.text).not.toContain('Ironfoe')
  })

  it('surfaces its [?] reading in `forever` only (damage-and-timing OQ 15)', () => {
    expect(assumptionIds(fury)).toContain('ironfoeChance')
    expect(assumptionIds(withRules(fury, 'classicEra'))).not.toContain('ironfoeChance')
    expect(assumptionIds({ ...fury, gear: { ...fury.gear, mainHand: { itemId: 17016 } } })).not.toContain('ironfoeChance')
  })

  // C37 lists every spell whose mask has 0x20 in its second word: checked in the raw tables when
  // they're cached locally (.cache/client/<build>/tables, from `npm run scrape:client`).
  const AURA_OPTIONS = import.meta.glob<string>(['/.cache/client/1.60.1.69913/tables/SpellAuraOptions.ndjson', '/.cache/client/1.15.9.69722/tables/SpellAuraOptions.ndjson'], {
    query: '?raw',
    import: 'default',
  })
  it.skipIf(Object.keys(AURA_OPTIONS).length !== 2)('0x20 in the mask’s second word is on eight Forever-new item procs only, and on none in Classic Era (cached locally)', async () => {
    const with0x20 = async (build: string) => {
      const raw = await AURA_OPTIONS[`/.cache/client/${build}/tables/SpellAuraOptions.ndjson`]()
      // The first line is the parser's header, then one row per line.
      const rows = raw.split('\n').slice(1).filter(Boolean).map((line) => JSON.parse(line) as { SpellID: number; ProcTypeMask?: number[] })
      return rows.filter((r) => ((r.ProcTypeMask?.[1] ?? 0) & 0x20) !== 0).map((r) => r.SpellID).sort((a, b) => a - b)
    }
    // Adaptation, Dreadfrost Saber, Iceblade Hacker, Warblade of Caer Darrow, Fury of Forgewright
    // (Ironfoe), Forge Blast, Holy Smite and Lash of the Dark Rider.
    expect(await with0x20('1.60.1.69913')).toEqual([1253389, 1294939, 1298413, 1298500, 1301046, 1312176, 1312330, 1315077])
    expect(await with0x20('1.15.9.69722')).toEqual([])
  })
})

describe('Windfury Totem’s internal cooldown (spell 10612; damage-and-timing §5.4)', () => {
  const d = defaultConfig('warrior-fury')
  const config = (profile: RuleProfileId) => withRules({ ...d, buffs: { raid: ['shaman'], enabled: ['windfuryTotem'] } }, profile)

  it('is the Forever client’s ProcCategoryRecovery 100 in `forever`, and none in `classicEra`', () => {
    expect(spells['10612'].auraOptions).toMatchObject({ procChance: 20, procCategoryRecovery: 100 })
    expect(FOREVER.values.windfuryIcdMs).toBe(100)
    expect(procOf(config('forever'), 'windfury')!.icdMs).toBe(100)
    expect(procOf(config('classicEra'), 'windfury')!.icdMs).toBe(0)
  })

  it('surfaces as an assumption only where it applies', () => {
    expect(assumptionIds(config('forever'))).toContain('windfuryIcd')
    expect(assumptionIds(config('classicEra'))).not.toContain('windfuryIcd')
    expect(assumptionIds(config('forever'))).toContain('extraAttackChains')
  })
})

describe('Elemental Sharpening Stone (item 18262 → 22756 → enchant 2506 → 22755; buffs doc §3.6)', () => {
  /** Weapon subclass (item class 2) → weapon type, checked against the item data below. */
  const SUBCLASS: Record<number, WeaponType | null> = {
    0: 'axe',
    1: 'axe',
    2: 'bow',
    3: 'gun',
    4: 'mace',
    5: 'mace',
    6: 'polearm',
    7: 'sword',
    8: 'sword',
    9: null, // obsolete
    10: 'staff',
    11: null, // exotic
    12: null, // exotic
    13: 'fist',
    14: null, // miscellaneous
    15: 'dagger',
    16: 'thrown',
    17: null, // spear
    18: 'crossbow',
    19: 'wand',
    20: null, // fishing pole
  }

  it('maps weapon subclasses the way the item data does', () => {
    let checked = 0
    for (const item of items) {
      const row = clientItems[String(item.id)]?.item
      if (!item.weaponType || !row || row.classId !== 2) continue
      expect(SUBCLASS[row.subclassId], item.name).toBe(item.weaponType)
      checked++
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('fits every weapon type in the client’s SpellEquippedItems mask 42483', () => {
    const typesOf = (mask: number) => [...new Set(Object.entries(SUBCLASS).flatMap(([bit, type]) => (mask & (1 << Number(bit)) && type ? [type] : [])))].sort()
    for (const id of ['22756', '22755']) {
      expect(spells[id].equippedItems).toMatchObject({ equippedItemClass: 2, equippedItemSubclass: 42483 })
      expect(typesOf(spells[id].equippedItems!.equippedItemSubclass!)).toEqual([...ELEMENTAL_STONE_WEAPONS].sort())
    }
    const effects = BUFFS_BY_ID.get('elementalSharpeningStone')!.effects
    expect(Array.isArray(effects) && effects[0]).toMatchObject({ kind: 'tempEnchant', crit: 2, weapons: [...ELEMENTAL_STONE_WEAPONS] })
  })

  it('is an equip spell of the weapon: aura 52 (+2% melee crit) on the warrior', () => {
    expect(spells['22756'].effects[0].effectMiscValue?.[0]).toBe(2506)
    expect(enchants['2506']).toMatchObject({ effect: [ENCHANT_EQUIP_SPELL, 0, 0], effectArg: [22755, 0, 0] })
    expect(spells['22755'].effects[0]).toMatchObject({ effect: APPLY_AURA, effectAura: AURA_WEAPON_CRIT, effectBasePointsF: 2, implicitTarget: [1, 0] })
  })

  it('goes on a mace too, and two stones stack: +4% crit for Fury’s mace and sword [?]', () => {
    const d = defaultConfig('warrior-fury')
    const buffs = (extra: string[]) => ({ raid: d.buffs.raid, enabled: [...d.buffs.enabled.filter((b) => b !== 'denseSharpeningStone'), ...extra] })
    const fury = (extra: string[]) => buildPlan({ ...d, buffs: buffs(extra) })
    // Ironfoe (mace) and Mirah's Song (sword).
    const typeOf = (id: number | undefined) => items.find((i) => i.id === id)?.weaponType
    expect([typeOf(d.gear.mainHand?.itemId), typeOf(d.gear.offHand?.itemId)]).toEqual(['mace', 'sword'])
    const none = fury([])
    const both = fury(['elementalSharpeningStone'])
    expect(both.sheet.critPct - none.sheet.critPct).toBeCloseTo(4, 9)
    expect(both.assumptions.map((a) => a.id)).toContain('elementalStone')
    // The Max preset picks it over the dense stone on both weapons.
    const max = buildPlan({ ...d, buffs: { raid: d.buffs.raid, enabled: presetBuffIds('max', 'warrior-fury', d.buffs.raid) } })
    expect(max.sheet.critPct - buildPlan({ ...d, buffs: { raid: d.buffs.raid, enabled: presetBuffIds('max', 'warrior-fury', d.buffs.raid).filter((b) => b !== 'elementalSharpeningStone') } }).sheet.critPct).toBeCloseTo(4, 9)
    // One stone on a two-hander: +2%, and nothing to assume.
    const arms = defaultConfig('warrior-arms')
    const one = buildPlan({ ...arms, buffs: { raid: arms.buffs.raid, enabled: [...arms.buffs.enabled, 'elementalSharpeningStone'] } })
    expect(one.sheet.critPct - buildPlan(arms).sheet.critPct).toBeCloseTo(2, 9)
    expect(one.assumptions.map((a) => a.id)).not.toContain('elementalStone')
  })
})

describe('one stone or oil a weapon (buffs doc §3.6)', () => {
  it('puts the stones and the wizard oils in one group, and the Max preset’s Elemental stone replaces the dense one', () => {
    for (const id of ['denseSharpeningStone', 'elementalSharpeningStone', 'wizardOil', 'brilliantWizardOil']) expect(BUFFS_BY_ID.get(id)!.exclusiveGroup, id).toBe(TEMP_ENCHANT)
    for (const spec of ['warrior-fury', 'warrior-arms', 'warrior-protection', 'paladin-retribution'] as const) {
      const max = presetBuffIds('max', spec, defaultConfig(spec).buffs.raid)
      expect(max, spec).toContain('elementalSharpeningStone')
      expect(max, spec).not.toContain('denseSharpeningStone')
    }
    const paladin = presetBuffIds('max', 'paladin-protection', defaultConfig('paladin-protection').buffs.raid)
    expect(paladin).toContain('brilliantWizardOil')
    expect(paladin).not.toContain('wizardOil')
  })

  it('no class that can use an oil dual-wields, so an oil is always its only weapon’s', () => {
    for (const id of ['wizardOil', 'brilliantWizardOil']) {
      for (const spec of SPEC_IDS) {
        if (!forSpecClass(BUFFS_BY_ID.get(id)!, spec)) continue
        expect(PROFICIENCY[SPEC_META[spec].classId].dualWield, `${id}: ${spec}`).toBe(false)
      }
    }
  })
})

describe('other assumptions this slice surfaces', () => {
  it('the rotation’s instant reactions, wherever a rotation runs (damage-and-timing §3.6)', () => {
    expect(assumptionIds(defaultConfig('warrior-fury'))).toContain('reactionTime')
    expect(assumptionIds(defaultConfig('warrior-arms'))).toContain('reactionTime')
    const note = buildPlan(defaultConfig('warrior-fury')).assumptions.find((a) => a.id === 'reactionTime')!
    expect(note.docRef).toBe('docs/mechanics/damage-and-timing.md#36-server-tick-and-spell-batching')
  })

  it('the fight’s timing, known exactly, wherever a line is timed to the phase or the end (warrior.md §5.2 notes)', () => {
    const fury = defaultConfig('warrior-fury')
    const note = (config: SimConfig) => buildPlan(config).assumptions.find((a) => a.id === 'knownFightTimings')
    expect(note(fury)).toMatchObject({ docRef: 'docs/classes/warrior.md#52-fury-dual-wield', text: expect.stringContaining('worth about 1.4%') })
    expect(note(defaultConfig('warrior-arms'))?.text).toContain('0.02–0.28%')
    // Without Death Wish (and so the racial's sync with it), Recklessness and the potion, nothing is.
    const untimed = { 'warrior.fury.deathWish.enabled': false, 'warrior.fury.recklessness.enabled': false, 'warrior.fury.ragePotion.enabled': false }
    expect(note({ ...fury, rotation: untimed })).toBeUndefined()
    expect(note({ ...fury, rotation: { ...untimed, 'warrior.fury.ragePotion.enabled': true } })).toBeDefined()
  })

  it('negative armor, and the floor at −2,750 once armor goes past it (damage-and-timing §1.1)', () => {
    const d = defaultConfig('warrior-fury')
    const debuffs = ['sunderArmor', 'faerieFire', 'curseOfRecklessness', 'armorShatter']
    const note = (bossArmor: number) =>
      buildPlan({ ...d, buffs: { raid: d.buffs.raid, enabled: debuffs }, fight: { ...d.fight, bossArmor } }).assumptions.find((a) => a.id === 'negativeArmor')?.text
    // 3,731 − 3,755 = −24: below zero, above the floor.
    expect(note(3731)).toBe('The boss’s armor is below zero after debuffs, which increases your damage, as the Forever tooltip says; unmeasured in combat.')
    // 500 − 3,755 = −3,255: past the floor.
    expect(note(500)).toContain('below −2,750 (here −3,255) the sim holds it at −2,750, which doubles your physical damage')
    expect(note(5000)).toBeUndefined()
  })

  it('magic procs crit (combat-tables §9)', () => {
    const d = defaultConfig('warrior-fury')
    const gear = { ...d.gear, mainHand: { itemId: d.gear.mainHand!.itemId, enchantId: 'fieryWeapon' } }
    const text = buildPlan({ ...d, gear }).assumptions.find((a) => a.id === 'magicProcs')!.text
    expect(text).toContain('spell crit chance for 150% damage')
  })
})
