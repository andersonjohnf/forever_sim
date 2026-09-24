// Integrity checks over the generated snapshot in src/data (docs/data/README.md).
// These guard against scraper regressions, not against beta balance changes: they check
// structure and internal consistency, and avoid hard-coding values a new build may change.
import { describe, expect, it } from 'vitest'
import { TALENT_EFFECTS } from '@/sim/classes/warrior/talents'
import { defaultConfig, talentPresets } from '@/sim/defaults'
import { SPEC_IDS, SPEC_META } from '@/sim/specs'
import itemJson from './items/pre-bis.json'
import type { ItemData } from './items/types'
import raceJson from './races/races.json'
import type { RaceData } from './races/types'
import druidSpellJson from './spells/druid.json'
import paladinSpellJson from './spells/paladin.json'
import shamanSpellJson from './spells/shaman.json'
import rogueSpellJson from './spells/rogue.json'
import mageSpellJson from './spells/mage.json'
import warlockSpellJson from './spells/warlock.json'
import priestSpellJson from './spells/priest.json'
import hunterSpellJson from './spells/hunter.json'
import type { SpellBook } from './spells/types'
import warriorSpellJson from './spells/warrior.json'
import druidTalentJson from './talents/druid.json'
import paladinTalentJson from './talents/paladin.json'
import shamanTalentJson from './talents/shaman.json'
import rogueTalentJson from './talents/rogue.json'
import mageTalentJson from './talents/mage.json'
import warlockTalentJson from './talents/warlock.json'
import priestTalentJson from './talents/priest.json'
import hunterTalentJson from './talents/hunter.json'
import {
  decodeTalentCode,
  encodeTalentCode,
  pointsPerTree,
  type TalentData,
  talentsInCodeOrder,
  validateTalentBuild,
} from './talents/types'
import warriorTalentJson from './talents/warrior.json'
import storedBuildsJson from '../../scripts/scrape/stored-builds.json'

const spellBooks = {
  warrior: warriorSpellJson as unknown as SpellBook,
  druid: druidSpellJson as unknown as SpellBook,
  paladin: paladinSpellJson as unknown as SpellBook,
  shaman: shamanSpellJson as unknown as SpellBook,
  rogue: rogueSpellJson as unknown as SpellBook,
  mage: mageSpellJson as unknown as SpellBook,
  warlock: warlockSpellJson as unknown as SpellBook,
  priest: priestSpellJson as unknown as SpellBook,
  hunter: hunterSpellJson as unknown as SpellBook,
}
const talentData = {
  warrior: warriorTalentJson as unknown as TalentData,
  druid: druidTalentJson as unknown as TalentData,
  paladin: paladinTalentJson as unknown as TalentData,
  shaman: shamanTalentJson as unknown as TalentData,
  rogue: rogueTalentJson as unknown as TalentData,
  mage: mageTalentJson as unknown as TalentData,
  warlock: warlockTalentJson as unknown as TalentData,
  priest: priestTalentJson as unknown as TalentData,
  hunter: hunterTalentJson as unknown as TalentData,
}
const races = raceJson as unknown as RaceData
const items = itemJson as unknown as ItemData

const allDatasets: Record<string, { meta: { source: string; scrapedAt: string; foreverBuild: string } }> = {
  ...Object.fromEntries(Object.entries(spellBooks).map(([c, d]) => [`spells/${c}`, d])),
  ...Object.fromEntries(Object.entries(talentData).map(([c, d]) => [`talents/${c}`, d])),
  races,
  items,
}

describe.each(Object.entries(allDatasets))('%s', (_name, data) => {
  it('has a meta envelope tied to a Forever build', () => {
    // Every dataset comes from the client files through the wago.tools API (decisions D16, D17).
    expect(data.meta.source).toMatch(/^https:\/\/wago\.tools\/api\//)
    expect(Number.isNaN(Date.parse(data.meta.scrapedAt))).toBe(false)
    expect(data.meta.foreverBuild).toMatch(/^1\.60\.\d+\.\d+$/)
  })
})

// The client spellbooks (docs/data/spells.md). Counts pin this build's books: a new build that
// adds or drops a spell fails here on purpose, so the change gets looked at and documented.
// The rogue's 22 are its Poisons tab: Forever moved the Poisons skill line out of the class lines
// (a profession-like category), so its book has none (docs/classes/rogue.md#1-wow-forever-changes).
// The warlock's 22 are Curse of Agony, Curse of Shadow and Curse of Doom (Forever's Banes replace
// two, docs/classes/warlock.md#1-wow-forever-changes), Dark Pact, and the conjured stones and mounts.
const BOOK_SIZES = { warrior: [42, 0], druid: [60, 1], paladin: [56, 3], shaman: [56, 5], rogue: [35, 22], mage: [61, 1], warlock: [55, 22], priest: [56, 0], hunter: [86, 2] } as const

describe.each(Object.entries(spellBooks))('spells/%s', (cls, book) => {
  const all = book.spells.flatMap((s) => s.ranks)

  it('has this build’s spells, with counts that add up', () => {
    expect(book.class).toBe(cls)
    expect([book.spells.length, book.missing.length]).toEqual(BOOK_SIZES[cls as keyof typeof BOOK_SIZES])
    expect(book.counts.total).toBe(book.spells.length)
    expect(book.counts.notInForever).toBe(book.missing.length)
    const by = (st: string) => book.spells.filter((s) => s.status === st).length
    expect(book.counts.new).toBe(by('new'))
    expect(book.counts.changed).toBe(book.spells.filter((s) => !['same', 'new', 'talent'].includes(s.status)).length)
    expect(book.counts.differentFromClassic).toBe(book.counts.new + book.counts.changed)
    expect(book.tabs.reduce((n, t) => n + t.spellCount, 0)).toBe(book.spells.length)
    for (const t of book.tabs) expect(book.spells.filter((s) => s.tab === t.name), t.name).toHaveLength(t.spellCount)
  })

  it('gives every spell a unique id, and every Forever rank a rendered tooltip, an icon and a cast time', () => {
    expect(new Set(book.spells.map((s) => s.id)).size).toBe(book.spells.length)
    for (const spell of book.spells) {
      expect(spell.id, spell.name).toBe(`${cls}-${spell.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`)
      expect(spell.ranks.some((r) => r.forever), spell.name).toBe(true)
      for (const rank of spell.ranks) expect(rank.forever ?? rank.classic, spell.name).toBeTruthy()
    }
    for (const r of all.flatMap((p) => (p.forever ? [p.forever] : []))) {
      expect(r.text, `${r.spellId}`).toBeTruthy()
      expect(r.text, `${r.spellId}`).not.toMatch(/\$/)
      expect(r.icon, `${r.spellId}`).toMatch(/^[a-z0-9_-]+$/)
      expect(r.castTime, `${r.spellId}`).not.toBeNull()
    }
  })

  it('keeps training levels, except on spells that come only with a talent point', () => {
    for (const s of book.spells) {
      const levels = s.ranks.flatMap((p) => (p.forever ? [p.forever.level] : []))
      if (s.grantedByTalent) expect(levels.every((l) => l === null), s.name).toBe(true)
      else expect(levels.every((l) => typeof l === 'number' && l >= 1 && l <= 60), s.name).toBe(true)
      if (!s.grantedByTalent) expect(s.level, s.name).toBe(Math.min(...(levels as number[])))
    }
  })

  it('lists every active Forever talent as a talent spell of its tree', () => {
    const active = talentData[cls as keyof typeof talentData].trees.flatMap((t) => t.talents.filter((x) => !x.passive).map((x) => [x.name, t.name]))
    // The shaman's spellbook tab (its skill line) is "Elemental Combat"; its talent tree, "Elemental".
    // The priest's Shadow talents that are spells sit in its "Shadow Magic" tab (Mind Flay, Vampiric
    // Embrace) or a tab of their own named "Shadow" (Shadowform, Silence); its talent tree, "Shadow".
    const tree = (tab: string) => (cls === 'shaman' && tab === 'Elemental Combat' ? 'Elemental' : cls === 'priest' && tab === 'Shadow Magic' ? 'Shadow' : tab)
    const talentSpells = book.spells.filter((s) => s.isTalent).map((s) => [s.name, tree(s.tab)])
    expect(talentSpells.sort()).toEqual(active.sort())
    for (const s of book.spells.filter((x) => x.isTalent)) expect(s.status, s.name).toBe('talent')
  })

  it('compares with Classic Era spells only, never Season of Discovery ones', () => {
    // docs/data/spells.md#classic-era-baseline: the 1.15 client's SoD spells have ids from 400,000.
    const classicIds = [...all.flatMap((p) => (p.classic ? [p.classic.spellId] : [])), ...book.missing.map((m) => m.classic?.spellId ?? 0)]
    expect(classicIds.filter((id) => id >= 400000)).toEqual([])
    for (const s of book.spells) if (s.status === 'new') expect(s.classic, s.name).toBeNull()
  })
})

// Every build code the repo stores or documents, with the ranks by talent name each decoded to when
// it was written: scripts/scrape/stored-builds.json, the one list the talent scraper checks too
// (docs/data/talents.md#build-codes-verified). Share links and saved setups store codes, so a code
// must keep meaning the same build. If a doc changes a build, change it there too.
type StoredBuilds = Record<keyof typeof talentData, Record<string, { note: string; ranks: [string, string, string] }>>
const STORED_BUILDS = Object.fromEntries(
  (Object.keys(talentData) as (keyof typeof talentData)[]).map((cls) => [
    cls,
    Object.fromEntries(Object.entries((storedBuildsJson as unknown as StoredBuilds)[cls]).map(([code, b]) => [code, b.ranks])),
  ]),
) as Record<keyof typeof talentData, Record<string, [string, string, string]>>

// Every position of every build code: the talent and max rank each digit stands for, per tree in
// code order (tier, then column). Share links and saved setups store codes, so a position may never
// change meaning; a new talent may only be appended at the end of a tree. The talent scraper refuses
// a build that moves one (--accept-code-changes overrides it once the app handles the change).
const CODE_ORDER: Record<keyof typeof talentData, Record<string, string>> = {
  warrior: {
    Arms: 'Improved Heroic Strike 3, Deflection 5, Improved Rend 3, Improved Charge 2, Improved Tactical Mastery 5, Improved Overpower 2, Anger Management 1, Deep Wounds 3, Spearing Strike 1, Two-Handed Weapon Specialization 3, Impale 2, Bloodthrill 5, Sweeping Strikes 1, Weaponmaster 5, Improved Slam 2, Improved Hamstring 3, Mortal Strike 1',
    Fury: 'Booming Voice 5, Cruelty 5, Iron Will 5, Unbridled Wrath 5, Improved Cleave 3, Piercing Howl 1, Blood Craze 3, Boundless Rage 3, Dual Wield Specialization 5, Raging Blows 1, Enrage 5, Improved Execute 2, Precision 3, Death Wish 1, Improved Intercept 2, Improved Berserker Rage 2, Flurry 5, Bloodthirst 1',
    Protection: 'Shield Specialization 5, Anticipation 5, Improved Bloodrage 2, Toughness 5, Improved Thunder Clap 3, Last Stand 1, Master of Defense 2, Improved Revenge 3, Defiance 3, Improved Sunder Armor 3, Improved Disarm 3, Vanguard 1, Improved Shield Wall 2, Concussion Blow 1, Improved Shield Bash 2, Bastion 5, Focused Rage 3, Shield Slam 1',
  },
  druid: {
    Balance: "Improved Wrath 5, Genesis 5, Moonglow 3, Improved Moonfire 2, Nature's Majesty 2, Nature's Reach 2, Improved Entangling Roots 3, Nature's Splendor 1, Insect Swarm 1, Vengeance 5, Improved Starfire 5, Overgrowth 2, Nature's Grace 1, Eclipse 3, Moonfury 5, Moonkin Form 1",
    'Feral Combat': 'Ferocity 5, Heart of the Wild 5, Feral Swiftness 2, Feral Instinct 3, Brutal Impact 2, Thick Hide 3, Savage Fury 2, Feral Charge 1, Sharpened Claws 2, Shredding Attacks 3, Mangle 1, Predatory Strikes 3, Primal Fury 2, Predatory Instincts 2, Leader of the Pack 1, King of the Jungle 3, Natural Reaction 5, Rend and Tear 5, Berserk 1',
    Restoration: "Nature's Focus 5, Furor 5, Naturalist 5, Subtlety 3, Natural Shapeshifter 3, Reflection 3, Gift of Nature 5, Gift of the Earthmother 1, Tranquil Spirit 5, Improved Rejuvenation 3, Swiftmend 1, Nature's Swiftness 1, Living Spirit 3, Improved Tranquility 2, Improved Regrowth 5, Wild Growth 1",
  },
  paladin: {
    Holy: "Improved Holy Strike 2, Divine Strength 5, Divine Intellect 5, Healing Light 3, Spiritual Focus 2, Improved Seals 3, Unyielding Faith 2, Voice of Truth 1, Reverence 3, Purifying Power 2, Infusion of Light 2, Illumination 5, Divine Favor 1, Divine Precision 3, Holy Shock 1, Consecrated Ground 2, Holy Power 5, Light's Vigil 1",
    Protection: "Toughness 5, Redoubt 5, Precision 3, Guardian's Favor 2, Anticipation 5, Improved Seal of Fury 1, Improved Righteous Fury 3, Shield Specialization 3, Sacred Duty 2, Swift Judgement 1, One-Handed Weapon Specialization 3, Improved Hammer of Justice 3, Templar's Bulwark 1, Reckoning 5, Iron Creed 5, Holy Shield 1",
    Retribution: 'Deflection 5, Benediction 5, Improved Judgement 2, Holy Conduit 2, Conviction 5, Vindication 3, Sanctified Judgement 3, Seal of Command 1, Pursuit of Justice 2, Eye for an Eye 2, Sacred Arbiter 1, Crusade 2, Two-Handed Weapon Specialization 3, Vengeance 3, Repentance 1, Champion of the Light 3, Instrument of Law 2, Twist of Light 1',
  },
  shaman: {
    Elemental: 'Convection 5, Concussion 5, Elemental Warding 3, Reverberation 5, Call of Flame 3, Elemental Devastation 3, Elemental Focus 1, Elemental Fury 5, Improved Fire Nova 2, Eye of the Storm 3, Call of Thunder 1, Elemental Reach 2, Lightning Overload 3, Earthbound 1, Elemental Alacrity 3, Lava Burst 1',
    Enhancement: "Earth's Grasp 2, Thundering Strikes 5, Ancestral Knowledge 5, Guardian Totems 2, Mental Dexterity 3, Improved Ghost Wolf 2, Improved Lightning Shield 3, Elemental Weapons 3, Shamanistic Focus 1, Anticipation 3, Toughness 5, Flurry 5, Stormstrike 1, Spirit Weapons 1, Mental Quickness 2, Improved Stormstrike 2, Maelstrom Weapon 5, Rage of the Farseer 1",
    Restoration: "Improved Healing Wave 5, Totemic Focus 5, Mindfulness 3, Natural Grace 3, Tidal Focus 5, Improved Reincarnation 2, Ancestral Healing 3, Healing Focus 3, Water Shield 1, Tidal Mastery 5, Restorative Totems 5, Mana Tide Totem 1, Healing Way 3, Nature's Swiftness 1, Purification 5, Riptide 1",
  },
  priest: {
    Discipline: 'Power in Light 5, Wand Specialization 2, Twin Disciplines 5, Silent Resolve 3, Holy Precision 3, Improved Power Word: Shield 3, Martyrdom 2, Mental Agility 3, Inner Focus 1, Meditation 3, Improved Inner Fire 3, Mental Strength 5, Soul Warding 1, Improved Mana Burn 2, Penance 1, Renewed Hope 5, Divine Aegis 3, Power Infusion 1',
    Holy: 'Twilight Focus 3, Improved Renew 3, Holy Specialization 5, Spell Warding 5, Divine Fury 5, Holy Nova 1, Blessed Recovery 3, Inspiration 3, Holy Reach 2, Improved Healing 3, Searing Light 2, Binding Heal 1, Litany of Light 2, Spirit of Redemption 1, Spiritual Guidance 5, Spiritual Healing 3, Prayer of Mending 1',
    Shadow: 'Shadow Focus 5, Blackout 5, Spirit Tap 5, Shadow Affinity 3, Improved Shadow Word: Pain 2, Shadow Reach 2, Improved Mind Blast 5, Improved Psychic Scream 2, Mind Flay 1, Improved Mind Flay 2, Improved Fade 2, Vampiric Embrace 1, Shadow Weaving 3, Silence 1, Devouring Contagion 2, Early Demise 2, Darkness 5, Shadowform 1',
  },
  rogue: {
    Assassination: 'Improved Gouge 3, Remorseless Attacks 2, Malice 5, Ruthlessness 3, Murder 2, Improved Slice and Dice 3, Relentless Strikes 1, Improved Expose Armor 2, Lethality 5, Vile Poisons 5, Cold Blood 1, Improved Poisons 5, Vigor 2, Mutilate 1, Improved Kidney Shot 2, Seal Fate 5, Venom 1',
    Combat: 'Improved Eviscerate 3, Improved Sinister Strike 2, Lightning Reflexes 5, Puncturing Wounds 3, Deflection 3, Precision 3, Endurance 2, Riposte 1, Improved Sprint 2, Improved Kick 2, Flawless Execution 1, Dual Wield Specialization 5, Blade Flurry 1, Hack and Slash 5, Weapon Expertise 2, Aggression 3, Adrenaline Rush 1',
    Subtlety: 'Camouflage 5, Master of Deception 3, Opportunity 2, Setup 3, Elusiveness 2, Dirty Tricks 2, Improved Ambush 3, Initiative 3, Ghostly Strike 1, Improved Distract 2, Heightened Senses 2, Premeditation 1, Serrated Blades 3, Dirty Deeds 2, Preparation 1, Hemorrhage 1, Quietus 5, Cutthroat 5, Thousand Cuts 1',
  },
  mage: {
    Arcane: 'Wand Specialization 2, Arcane Focus 5, Improved Channeling 5, Arcane Subtlety 2, Magic Absorption 2, Arcane Concentration 5, Arcane Resilience 2, Arcane Geometry 2, Arcane Impact 3, Arcane Blast 1, Arcane Shielding 2, Improved Counterspell 2, Arcane Meditation 3, Missile Barrage 1, Presence of Mind 1, Arcane Mind 5, Arcane Instability 3, Arcane Power 1',
    Fire: 'Wake of Fire 2, Incineration 3, Improved Fireball 5, Ignite 5, Flame Throwing 2, Impact 3, Burning Soul 3, Improved Flamestrike 3, Pyroblast 1, Improved Scorch 3, Improved Fire Ward 2, Hot Streak 1, Master of Elements 3, Critical Mass 3, Blast Wave 1, Fire Power 5, Combustion 1',
    Frost: "Frost Warding 2, Improved Frostbolt 5, Elemental Precision 5, Ice Shards 5, Permafrost 3, Improved Frost Nova 2, Frostbite 3, Piercing Ice 3, Frost Channeling 3, Ice Lance 1, Improved Blizzard 3, Arctic Reach 2, Ice Block 1, Shatter 3, Improved Cone of Cold 3, Cold Snap 1, Fingers of Frost 2, Winter's Chill 5, Ice Barrier 1",
  },
  warlock: {
    Affliction: 'Improved Life Tap 2, Suppression 5, Improved Corruption 5, Malediction 5, Soul Harvesting 2, Improved Drains 3, Improved Bane of Agony 2, Fel Concentration 3, Amplify Curse 1, Pandemic 3, Malevolence 5, Nightfall 2, Curse of Exhaustion 1, Siphon Life 1, Soul Siphon 3, Shadow Mastery 5, Wrack 1',
    Demonology: 'Improved Health Funnel 2, Improved Imp 3, Demonic Embrace 5, Unholy Power 5, Demonic Aegis 2, Improved Voidwalker 3, Fel Vitality 3, Demonic Energies 2, Improved Sayaad 3, Demonic Sacrifice 1, Master Summoner 2, Decimation 2, Fel Domination 1, Demonic Brand 3, Improved Felhunter 3, Soul Link 1, Demonic Knowledge 3, Master Demonologist 5, Demonic Pact 1',
    Destruction: 'Destructive Reach 2, Improved Shadow Bolt 5, Bane 5, Molten Skin 5, Cataclysm 3, Aftermath 5, Ruin 5, Shadowburn 1, Intensity 3, Agonizing Flames 3, Conflagrate 1, Pyroclasm 2, Bane of Havoc 1, Fire and Brimstone 3, Shadow and Flame 5, Incinerate 1',
  },
  hunter: {
    'Beast Mastery': 'Deadly Aspects 5, Endurance Training 5, Focused Fire 2, Improved Aspect of the Monkey 3, Pathfinding 2, Improved Revive Pet 2, Bestial Swiftness 1, Unleashed Fury 5, Improved Mend Pet 2, Ferocity 5, Summon Hawk 1, Spirit Bond 2, Intimidation 1, Bestial Discipline 2, Frenzy 5, Bestial Wrath 1',
    Marksmanship: 'Hawk Eye 3, Improved Concussive Shot 5, Lethal Attacks 5, Improved Stings 3, Efficiency 5, Careful Aim 5, Rapid Killing 2, Improved Arcane Shot 5, Lone Wolf 1, Trueshot Aura 1, Mortal Shots 5, Rapid Recuperation 2, Barrage 3, Scatter Shot 1, Ranged Weapon Specialization 5, Sniper Shot 1',
    Survival: "Improved Tracking 5, Deflection 5, Entrapment 5, Savage Strikes 2, Survivalist 5, Improved Wing Clip 3, Clever Traps 2, Surefooted 3, Deterrence 1, Survival Tactics 2, Predator's Edge 5, Counterattack 1, Resourcefulness 2, Expose Prey 2, Survivalist's Discipline 2, Strider Kick 1, Lightning Reflexes 5, Lacerating Strikes 1",
  },
}

/** Ranks by talent name, per tree, in code order: "Name rank, Name rank". */
function describeBuild(data: TalentData, code: string): string[] {
  const ranks = decodeTalentCode(data, code)
  return talentsInCodeOrder(data).map((talents) =>
    talents
      .filter((t) => ranks[t.id])
      .map((t) => `${t.name} ${ranks[t.id]}`)
      .join(', '),
  )
}

describe.each(Object.entries(talentData))('talents/%s', (cls, data) => {
  const all = data.trees.flatMap((t) => t.talents)
  const byId = new Map(all.map((t) => [t.id, t]))

  it('places every talent in a unique tree cell on the 4-column grid', () => {
    for (const tree of data.trees) {
      const cells = tree.talents.map((t) => `${t.tier},${t.col}`)
      expect(new Set(cells).size, tree.name).toBe(cells.length)
      for (const t of tree.talents) {
        expect(t.col, t.name).toBeGreaterThanOrEqual(0)
        expect(t.col, t.name).toBeLessThanOrEqual(data.rules.maxCol)
        expect(t.tier, t.name).toBeLessThanOrEqual(data.rules.maxTier)
      }
    }
  })

  it('names every talent once per class (the engine keys on names)', () => {
    expect(new Set(all.map((t) => t.name)).size).toBe(all.length)
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length)
  })

  it('gives every rank a Forever text and points arrows at max ranks in the same tree', () => {
    for (const t of all) {
      expect(t.ranks.forever, t.name).toHaveLength(t.maxRank)
      for (const text of t.ranks.forever) expect(text, t.name).toMatch(/\w/)
      if (t.ranks.classic) expect(t.ranks.classic.length, t.name).toBe(t.classic?.maxRank)
      if (!t.prerequisite) continue
      const pre = byId.get(t.prerequisite.talentId)
      expect(pre?.tree, t.name).toBe(t.tree)
      expect(t.prerequisite.rank, t.name).toBe(pre?.maxRank)
      expect(pre!.tier, t.name).toBeLessThanOrEqual(t.tier)
    }
  })

  it('keeps `order` equal to the build-code position', () => {
    for (const talents of talentsInCodeOrder(data)) talents.forEach((t, i) => expect(t.order, t.name).toBe(i))
  })

  it('keeps every build-code position: the same talent and max rank, tree by tree', () => {
    const order = talentsInCodeOrder(data)
    const actual = Object.fromEntries(data.trees.map((tree, i) => [tree.name, order[i].map((t) => `${t.name} ${t.maxRank}`).join(', ')]))
    expect(actual).toEqual(CODE_ORDER[cls as keyof typeof talentData])
  })

  it.each(Object.entries(STORED_BUILDS[cls as keyof typeof talentData]))(
    'build %s is legal, round-trips and decodes to the ranks it was written with',
    (code, expected) => {
      const ranks = decodeTalentCode(data, code)
      expect(validateTalentBuild(data, ranks)).toEqual([])
      expect(pointsPerTree(data, ranks).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(data.rules.maxPoints)
      expect(encodeTalentCode(data, ranks)).toBe(code)
      expect(describeBuild(data, code)).toEqual(expected)
    },
  )
})

describe('talent presets and defaults', () => {
  it('are all stored builds, so their meaning is pinned above', () => {
    for (const spec of SPEC_IDS) {
      const { classId } = SPEC_META[spec]
      expect(Object.keys(STORED_BUILDS[classId]), spec).toContain(defaultConfig(spec).talents)
    }
    for (const classId of ['warrior', 'druid', 'paladin', 'shaman', 'rogue', 'mage', 'warlock', 'priest', 'hunter'] as const) {
      const presets = talentPresets(classId)
      expect(presets.length, classId).toBeGreaterThan(0)
      expect(new Set(presets.map((p) => p.name)).size, classId).toBe(presets.length)
      expect(new Set(presets.map((p) => p.code)).size, classId).toBe(presets.length)
      for (const p of presets) expect(Object.keys(STORED_BUILDS[classId]), p.name).toContain(p.code)
    }
  })
})

// Talent names are an engine contract: src/sim keys talent effects and rules on names
// ('Unbridled Wrath', 'Improved Execute'), so every name it uses must exist in the class's data.
// Names are read from TALENT_EFFECTS and from the source of src/sim: `talents.has('…')`,
// `talents.get('…')` and `rank(talents, '…')`. Files under src/sim/classes/<class>/ belong to
// that class; any other file's names must exist in some class.
const SIM_SOURCES = import.meta.glob<string>(['../sim/**/*.ts', '!../sim/**/*.test.ts'], { query: '?raw', import: 'default', eager: true })
const NAME_USES = [/\btalents\.(?:has|get)\(\s*(['"])(.+?)\1/g, /\brank\(\s*talents\s*,\s*(['"])(.+?)\1/g]

describe('talent names the engine keys on', () => {
  const uses: { file: string; cls: keyof typeof talentData | null; name: string }[] = []
  for (const [file, source] of Object.entries(SIM_SOURCES)) {
    const cls = (/\/classes\/(warrior|druid|paladin|shaman|rogue|mage|warlock|priest)\//.exec(file)?.[1] ?? null) as keyof typeof talentData | null
    for (const re of NAME_USES) for (const m of source.matchAll(re)) uses.push({ file, cls, name: m[2] })
  }
  for (const name of Object.keys(TALENT_EFFECTS)) uses.push({ file: '../sim/classes/warrior/talents.ts (TALENT_EFFECTS)', cls: 'warrior', name })

  it('finds the names (guards the scan itself)', () => {
    const names = new Set(uses.map((u) => u.name))
    for (const name of ['Unbridled Wrath', 'Improved Execute', 'Flurry', 'Bloodthirst', 'Anger Management']) expect(names).toContain(name)
  })

  it('exist in the talent data', () => {
    const namesOf = (cls: keyof typeof talentData) => new Set(talentData[cls].trees.flatMap((t) => t.talents.map((x) => x.name)))
    const missing = uses.filter((u) =>
      u.cls ? !namesOf(u.cls).has(u.name) : !(['warrior', 'druid', 'paladin', 'shaman', 'rogue', 'mage', 'warlock', 'priest', 'hunter'] as const).some((c) => namesOf(c).has(u.name)),
    )
    expect(missing).toEqual([])
  })
})

// Race ids are a storage contract: saved setups and share links keep them (docs/data/races.md).
const RACE_IDS = [
  'horde-orc',
  'horde-undead',
  'horde-tauren',
  'horde-troll',
  'horde-skyborne-windshaper',
  'alliance-human',
  'alliance-dwarf',
  'alliance-night-elf',
  'alliance-gnome',
  'alliance-skyborne-high-order',
]
// Every race id the app's source mentions (engine, defaults, features), tests included.
const APP_SOURCES = import.meta.glob<string>(['../sim/**/*.ts', '../features/**/*.{ts,tsx}', '../app/**/*.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })

describe('races', () => {
  const pairs = (side: 'forever' | 'classic') => races.races.flatMap((r) => (r.classes[side] ?? []).map((c) => `${r.id}/${c}`))

  it('keeps the race ids saved setups store, in the picker order', () => {
    expect(races.races.map((r) => r.id)).toEqual(RACE_IDS)
  })

  it('has every race id the app uses', () => {
    const used = new Set<string>()
    for (const source of Object.values(APP_SOURCES)) for (const m of source.matchAll(/['"`]((?:horde|alliance)-[a-z-]+)['"`]/g)) used.add(m[1])
    expect(used.size, 'the scan finds the ids').toBeGreaterThan(5)
    expect([...used].filter((id) => !RACE_IDS.includes(id))).toEqual([])
  })

  it('has the client’s 56 race/class pairs (Classic Era 40), and availability that agrees with them', () => {
    expect(pairs('forever')).toHaveLength(56)
    expect(pairs('classic')).toHaveLength(40)
    for (const [cls, sides] of Object.entries(races.simClassAvailability)) {
      expect(sides.forever, cls).toEqual(races.races.filter((r) => r.classes.forever.includes(cls as never)).map((r) => r.id))
      expect(sides.classic, cls).toEqual(races.races.filter((r) => r.classes.classic?.includes(cls as never)).map((r) => r.id))
    }
    // The simulated classes' races (docs/data/races.md#race-and-class-availability).
    expect(races.simClassAvailability.paladin.forever).toEqual(['horde-undead', 'alliance-human', 'alliance-dwarf'])
    expect(races.simClassAvailability.druid.forever).toEqual(['horde-tauren', 'horde-skyborne-windshaper', 'alliance-night-elf', 'alliance-skyborne-high-order'])
    expect(races.simClassAvailability.warrior.forever).toEqual(RACE_IDS)
    // docs/classes/shaman.md#races: Dwarf shamans are new in Forever; the client has no Undead shaman.
    expect(races.simClassAvailability.shaman.forever).toEqual(['horde-orc', 'horde-tauren', 'horde-troll', 'horde-skyborne-windshaper', 'alliance-dwarf'])
    // docs/classes/mage.md#races: Orc and High Order Skyborne mages are new in Forever.
    expect(races.simClassAvailability.mage.forever).toEqual(['horde-orc', 'horde-undead', 'horde-troll', 'alliance-human', 'alliance-gnome', 'alliance-skyborne-high-order'])
    for (const r of races.races) {
      expect(r.classes.addedInForever, r.id).toEqual(r.classes.forever.filter((c) => !r.classes.classic?.includes(c)))
      expect(r.newInForever, r.id).toBe(r.classes.classic === null)
    }
    expect(races.newCombos.map((c) => `${c.raceId}/${c.class}`).sort()).toEqual(
      pairs('forever').filter((p) => !pairs('classic').includes(p) && !p.includes('skyborne')).sort(),
    )
  })

  it('gives every race four racials with a tooltip, an icon and a Forever spell', () => {
    for (const r of races.races) {
      expect(r.racials, r.id).toHaveLength(4)
      expect(new Set(r.racials.map((x) => x.id)).size, r.id).toBe(4)
      for (const x of r.racials) {
        expect(x.forever, x.id).toBeTruthy()
        expect(x.forever, x.id).not.toMatch(/\$/)
        expect(x.icon, x.id).toMatch(/^[a-z0-9_-]+$/)
        expect(x.spellIds.length, x.id).toBeGreaterThan(0)
        expect(x.races, x.id).toContain(r.id)
        if (x.foreverByClass) expect(Object.keys(x.foreverByClass).sort(), x.id).toEqual([...r.classes.forever].sort())
      }
    }
  })

  it('shares a racial between races only as one and the same racial', () => {
    const byId = new Map<string, string>()
    for (const r of races.races)
      for (const x of r.racials) {
        const { races: holders, ...rest } = x
        const key = JSON.stringify(rest)
        if (byId.has(x.id)) expect(key, x.id).toBe(byId.get(x.id))
        else byId.set(x.id, key)
        for (const h of holders) expect(races.races.find((o) => o.id === h)?.racials.some((y) => y.id === x.id), `${x.id} in ${h}`).toBe(true)
      }
  })

  it('compares with the race’s Classic Era racials', () => {
    for (const r of races.races)
      for (const x of r.racials) {
        if (r.newInForever) expect(x.classic.status, x.id).toBe('absent')
        expect(x.classicSpellId !== null, x.id).toBe(x.classic.status === 'verified')
        if (x.classicSpellId !== null) expect(x.classicSpellId, x.id).toBeLessThan(400000)
        expect(x.changeLabel, x.id).toBe({ added: 'New', moved: 'New', modified: 'Changed', unchanged: 'Unchanged' }[x.changeKind])
      }
  })

  it('offers every simulated class to at least one race per faction', () => {
    for (const cls of ['warrior', 'druid', 'paladin', 'shaman', 'mage', 'priest', 'hunter']) {
      const factions = new Set(
        races.races.filter((r) => r.classes.forever.includes(cls as never)).map((r) => r.faction),
      )
      expect([...factions].sort(), cls).toEqual(['Alliance', 'Horde'])
    }
  })
})

describe('items/pre-bis', () => {
  const { meta } = items
  const byId = new Map(items.items.map((i) => [i.id, i]))
  // docs/data/items.md#pre-raid-bis-lists: items a list dropped stay in the pool, with no rank.
  const kept = new Set(meta.preRaidBis.kept)

  it('matches its recorded counts', () => {
    expect(items.items).toHaveLength(meta.counts.items)
    expect(new Set(items.items.map((i) => i.id)).size).toBe(items.items.length)
    for (const tab of ['new', 'changed', 'unchanged', 'missing'] as const)
      expect(items.items.filter((i) => i.tab === tab), tab).toHaveLength(meta.counts.byTab[tab])
    expect(Object.keys(items.sets)).toHaveLength(meta.counts.sets)
    expect(items.items.filter((i) => i.statsFrom === 'forever')).toHaveLength(meta.counts.statsFrom.forever)
  })

  it('is Rare equippable gear, apart from listed pre-raid BiS items (decisions D11)', () => {
    for (const item of items.items) {
      // docs/data/items.md#ammo-and-quivers: arrows, bullets, quivers and ammo pouches have their own rule.
      const supply = item.slot === 'ammo' || item.slot === 'quiver'
      if (item.preRaidBis.length === 0 && !supply && !kept.has(item.id)) expect(item.quality, item.name).toBe(3)
      expect(item.slot, item.name).toBeTruthy()
      expect(item.equipSlots.length, item.name).toBeGreaterThan(0)
      expect(item.icon, item.name).toMatch(/^[a-z0-9_-]+$/)
    }
  })

  it('contains every item on the curated pre-raid BiS list (decisions D11)', () => {
    const bis = meta.preRaidBis
    expect(bis.notInData).toEqual([])
    // A kept item (a list dropped it) is in the pool with no rank.
    for (const id of bis.kept) expect(byId.get(id)?.preRaidBis, String(id)).toEqual([])
    expect(bis.inPool).toBe(bis.listedItems)
    const tagged = items.items.filter((i) => i.preRaidBis.length > 0)
    expect(tagged).toHaveLength(bis.listedItems)
  })

  it('matches its recorded filter (decisions D10)', () => {
    const { qualities, reqLevel, minItemLevel, excludedItemIds, excludedNamePattern } = meta.filter
    const junk = new RegExp(excludedNamePattern, 'i')
    for (const item of items.items) {
      expect(excludedItemIds[String(item.id)], item.name).toBeUndefined()
      expect(junk.test(item.name), item.name).toBe(false)
      if (item.preRaidBis.length > 0 || kept.has(item.id)) continue // listed and kept items join at any quality or level
      if (item.slot === 'ammo' || item.slot === 'quiver') {
        // docs/data/items.md#ammo-and-quivers: the supplies' own quality and required-level rule.
        expect(meta.filter.supplies.qualities, item.name).toContain(item.quality)
        expect(item.reqLevel >= meta.filter.supplies.reqLevel[0] && item.reqLevel <= meta.filter.supplies.reqLevel[1], item.name).toBe(true)
        continue
      }
      const levelOk =
        (item.reqLevel >= reqLevel[0] && item.reqLevel <= reqLevel[1]) ||
        (minItemLevel !== null && item.itemLevel >= minItemLevel)
      expect(qualities, item.name).toContain(item.quality)
      expect(levelOk, `${item.name} ilvl ${item.itemLevel} req ${item.reqLevel}`).toBe(true)
    }
  })

  it('never contains Season of Discovery items (decisions D6)', () => {
    // Only Forever-new items (a Forever row, no Classic Era row) may have ids past original Classic.
    const suspicious = items.items.filter((i) => i.tab !== 'new' && i.id >= meta.filter.maxClassicItemId)
    expect(suspicious.map((i) => `${i.id} ${i.name}`)).toEqual([])
    expect(meta.filter.maxClassicItemId).toBe(25000)
  })

  it('flags items without a Forever row as using Classic Era stats (decisions D6, D17)', () => {
    for (const item of items.items) {
      expect(item.statsFrom, item.name).toBe(item.foreverData ? 'forever' : 'classic')
      expect(item.foreverSource, item.name).toBe(item.foreverData ? 'client' : null)
      expect(item.tab === 'missing', item.name).toBe(!item.foreverData)
      expect(item.classic !== null, item.name).toBe(item.tab === 'changed')
      if (item.classicShieldBlockValue !== undefined) {
        expect(item.slot, item.name).toBe('shield')
        expect(item.statsFrom, item.name).toBe('classic')
      }
    }
  })

  it('leaves out the items no client build has a row for, and lists them', () => {
    expect(meta.noClientRow.length).toBeGreaterThan(0)
    for (const { id, name } of meta.noClientRow) expect(byId.has(id), name).toBe(false)
  })

  it('has no drop sources (the client Encounter Journal is empty)', () => {
    for (const item of items.items) expect(item.source, item.name).toBeNull()
  })

  it('resolves every set and its bonuses', () => {
    for (const item of items.items) {
      if (item.setId) expect(items.sets[item.setId], `${item.name} → ${item.setId}`).toBeDefined()
    }
    for (const [id, set] of Object.entries(items.sets)) {
      expect(set.name, id).toBeTruthy()
      expect(set.bonusesFrom, set.name).not.toBeNull()
      expect(set.size, set.name).toBe(set.itemIds.length)
      expect(set.bonuses.length, set.name).toBeGreaterThan(0)
      for (const b of set.bonuses) {
        expect(b.text, `${set.name} (${b.pieces})`).toBeTruthy()
        expect(b.text, `${set.name} (${b.pieces})`).not.toMatch(/\$/)
      }
    }
  })

  it('renders every effect line without leftover variables', () => {
    for (const item of items.items) {
      for (const e of [...item.procs, ...item.useEffects, ...item.otherEquip]) {
        expect(e.raw, item.name).toMatch(/^(Use|Equip|Chance on hit): \S/)
        expect(e.raw, item.name).not.toMatch(/\$/)
      }
    }
    const { fallback, fallbackSpells } = meta.descriptionCoverage
    expect(fallbackSpells.reduce((n, s) => n + s.usedBy.length, 0)).toBe(fallback)
  })
})
