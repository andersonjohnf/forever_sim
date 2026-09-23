// On-use consumables and items the rotation presses, against the Forever client data
// (docs/classes/warrior.md §5.2 rows 3, 16 and 17; docs/mechanics/buffs-debuffs-consumables.md
// §3.3, §3.5; docs/data/client.md), and the on-use trinket the sim deliberately leaves out.
import { describe, expect, it } from 'vitest'
import itemsJson from '@/data/client/items.json'
import spellsJson from '@/data/client/spells.json'
import type { ClientItems, ClientSpells } from '@/data/client/types'
import { DEMONIC_RUNE, JUJU_FLURRY, MAJOR_MANA_POTION, MIGHTY_RAGE_POTION } from './buffs'
import { ITEM_EFFECTS } from './items'
import type { OnUseSpec } from './types'

const spells = (spellsJson as unknown as ClientSpells).spells
const items = itemsJson as unknown as ClientItems

/** SpellEffectName and SpellAuraName codes (src/data/client/types.ts). */
const APPLY_AURA = 6
const ENERGIZE = 30
const AURA = { modStat: 29, attackSpeed: 9, allCrit: 290, meleeHaste: 319 }
/** ItemEffect trigger: on use. */
const ON_USE = 0

/** The item's use effect and its spell. */
function useOf(itemId: number, consumable: boolean) {
  const item = consumable ? items.consumables[String(itemId)] : items.items[String(itemId)]
  const effect = item.effects.find((e) => e.triggerType === ON_USE)!
  return { effect, spell: spells[String(effect.spellId)] }
}

/** Cooldown the item imposes on itself: its own, or its category's when that's longer. */
const cooldownOf = (e: { coolDownMSec: number; categoryCoolDownMSec: number }) => Math.max(e.coolDownMSec, e.categoryCoolDownMSec, 0)

function expectCast(use: OnUseSpec, spell: (typeof spells)[string]) {
  expect(use.gcdMs, 'no GCD: the spell has no start recovery').toBe(spell.cooldowns?.startRecoveryTime ?? 0)
  expect(use.aura?.durationMs).toBe(spell.duration?.duration)
}

describe('on-use consumables match src/data/client (buffs doc §3.3, §3.5)', () => {
  it('Mighty Rage Potion (13442 → 17528): 45–75 rage, +60 Strength for 20 s, 2 min potion cooldown', () => {
    const { effect, spell } = useOf(13442, true)
    expect(spell.name).toBe('Mighty Rage')
    expectCast(MIGHTY_RAGE_POTION, spell)
    expect(effect.spellCategoryId).toBe(4) // the potion category
    expect(MIGHTY_RAGE_POTION.cooldownMs).toBe(cooldownOf(effect))
    const energize = spell.effects.find((e) => e.effect === ENERGIZE && e.effectMiscValue?.[0] === 1)!
    // Variance 0.5 around 600 tenths: 600 × (1 ± 0.25), 450–750.
    expect(energize.effectBasePointsF).toBe(600)
    expect(energize.variance).toBe(0.5)
    const low = energize.effectBasePointsF! * (1 - energize.variance! / 2)
    expect([MIGHTY_RAGE_POTION.rageTenths, MIGHTY_RAGE_POTION.rageTenths + MIGHTY_RAGE_POTION.rageSpreadTenths]).toEqual([low, 750])
    const str = spell.effects.find((e) => e.effect === APPLY_AURA && e.effectAura === AURA.modStat)!
    expect(str.effectMiscValue?.[0] ?? 0, 'stat 0 = Strength').toBe(0)
    expect(MIGHTY_RAGE_POTION.aura?.mods).toEqual({ str: str.effectBasePointsF })
  })

  it('Major Mana Potion (13444 → 17531): 1,350–2,250 mana, no GCD, 2 min potion cooldown', () => {
    const { effect, spell } = useOf(13444, true)
    expect(spell.name).toBe('Restore Mana')
    expect(MAJOR_MANA_POTION.gcdMs).toBe(spell.cooldowns?.startRecoveryTime ?? 0)
    expect(MAJOR_MANA_POTION.aura).toBeNull()
    expect(effect.spellCategoryId).toBe(4) // the potion category, shared with the Mighty Rage Potion
    expect(MAJOR_MANA_POTION.cooldownMs).toBe(cooldownOf(effect))
    // Energize, power type 0 (mana): 1800 with variance 0.5, so 1800 × (1 ± 0.25), in tenths.
    const energize = spell.effects.find((e) => e.effect === ENERGIZE)!
    expect(energize.effectMiscValue?.[0] ?? 0, 'mana').toBe(0)
    const [low, high] = [energize.effectBasePointsF! * (1 - energize.variance! / 2), energize.effectBasePointsF! * (1 + energize.variance! / 2)]
    expect([MAJOR_MANA_POTION.manaTenths, MAJOR_MANA_POTION.manaTenths! + MAJOR_MANA_POTION.manaSpreadTenths!]).toEqual([10 * low, 10 * high])
    expect([low, high]).toEqual([1350, 2250])
    expect([MAJOR_MANA_POTION.rageTenths, MAJOR_MANA_POTION.rageSpreadTenths]).toEqual([0, 0])
  })

  it('Demonic Rune and Dark Rune (12662, 20520 → 16666, 27869): 900–1,500 mana, the rune category’s own 2 min cooldown', () => {
    for (const item of [12662, 20520]) {
      const { effect, spell } = useOf(item, true)
      expect(DEMONIC_RUNE.gcdMs).toBe(spell.cooldowns?.startRecoveryTime ?? 0)
      expect(effect.spellCategoryId).toBe(1153) // runes, apart from potions
      expect(DEMONIC_RUNE.cooldownMs).toBe(cooldownOf(effect))
      const energize = spell.effects.find((e) => e.effect === ENERGIZE)!
      expect(energize.effectMiscValue?.[0] ?? 0, 'mana').toBe(0)
      const low = energize.effectBasePointsF! * (1 - energize.variance! / 2)
      const high = energize.effectBasePointsF! * (1 + energize.variance! / 2)
      expect([DEMONIC_RUNE.manaTenths, DEMONIC_RUNE.manaTenths! + DEMONIC_RUNE.manaSpreadTenths!]).toEqual([10 * low, 10 * high])
      expect([low, high]).toEqual([900, 1500])
    }
    expect(DEMONIC_RUNE.aura).toBeNull()
  })

  it('Juju Flurry (12450 → 16322): +3% attack speed for 20 s, its own 60 s cooldown', () => {
    const { effect, spell } = useOf(12450, true)
    expect(spell.name).toBe('Juju Flurry')
    expectCast(JUJU_FLURRY, spell)
    expect(JUJU_FLURRY.cooldownMs).toBe(cooldownOf(effect))
    expect(JUJU_FLURRY.cooldownMs).toBe(60000)
    const haste = spell.effects.find((e) => e.effect === APPLY_AURA && e.effectAura === AURA.attackSpeed)!
    expect(JUJU_FLURRY.aura?.mods).toEqual({ haste: haste.effectBasePointsF })
    expect([JUJU_FLURRY.rageTenths, JUJU_FLURRY.rageSpreadTenths]).toEqual([0, 0])
  })
})

describe('on-use trinkets match src/data/client (warrior.md §5.2 row 3)', () => {
  it('Weakness Analyzer (272438 → 1291101): +5% crit for 20 s or until a crit, 90 s cooldown', () => {
    const use = ITEM_EFFECTS[272438].use!
    const { effect, spell } = useOf(272438, false)
    expect(spell.name).toBe('Analyzing Weaknesses')
    expectCast(use, spell)
    expect(use.cooldownMs).toBe(effect.coolDownMSec)
    expect(use.cooldownMs).toBe(90000)
    // The 20 s it shares with category 1141 ("Burst Trinket") is shorter, and no other simulated trinket is in it.
    expect([effect.spellCategoryId, effect.categoryCoolDownMSec]).toEqual([1141, 20000])
    const crit = spell.effects.find((e) => e.effect === APPLY_AURA && e.effectAura === AURA.allCrit)!
    // All crit (aura 290): attacks and spells alike (combat-tables §9).
    expect(use.aura?.mods).toEqual({ crit: crit.effectBasePointsF, spellCrit: crit.effectBasePointsF })
    // One proc charge: the tooltip says a non-periodic crit you deal uses it.
    expect(spell.auraOptions?.procCharges).toBe(1)
    expect(use.aura?.critCharges).toBe(1)
  })

  it('Manual Crowd Pummeler (9449 → 13494): +50% attack speed for 30 s, a 3 min cooldown, 3 charges (druid.md §7.3)', () => {
    const use = ITEM_EFFECTS[9449].use!
    const { effect, spell } = useOf(9449, false)
    expect(spell.name).toBe('Haste')
    expectCast(use, spell)
    expect([use.cooldownMs, use.charges]).toEqual([effect.coolDownMSec, effect.charges])
    expect([use.cooldownMs, use.charges]).toEqual([180000, 3])
    const haste = spell.effects.find((e) => e.effect === APPLY_AURA && e.effectAura === AURA.meleeHaste)!
    expect(use.aura?.mods).toEqual({ haste: haste.effectBasePointsF })
    expect([use.rageTenths, use.rageSpreadTenths]).toEqual([0, 0])
  })

  it('Diamond Flask (20130) isn’t simulated, or in the pool: Forever replaced its +75 Strength use (warrior.md §7, Q30)', () => {
    expect(ITEM_EFFECTS[20130]).toBeUndefined()
    // Off the pre-raid lists, the only reason it was in the pool, so the client data has no row for
    // it; its item effects are checked on real client rows in scripts/scrape/lib/item-stats.test.mjs.
    expect(items.items['20130']).toBeUndefined()
    // Forever's use spell (which warrior.md Q30 cites) is a 5 s heal ("CHUG! CHUG! CHUG! CHUG!"),
    // with no Strength aura.
    const spell = spells['363881']
    expect(spell.name).toBe('CHUG! CHUG! CHUG! CHUG!')
    expect(spell.effects.some((e) => e.effect === APPLY_AURA && e.effectAura === AURA.modStat)).toBe(false)
    expect(spell.duration?.duration).toBe(5000)
  })
})
