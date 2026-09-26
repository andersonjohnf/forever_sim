// The release notes: what each release brought players, newest first (docs/architecture.md
// "Release notes"). Hand-written, not generated. Every push that brings player-facing changes adds
// an entry at the top, written by CLAUDE.md's "Release updates" rules (player terms, numbers when a
// result moves, no internals, no emoji), with the push's time. What's New shows a returning visitor
// the entries they haven't seen (src/app/whats-new.tsx), and Release history lists them all.
//
// No imports: the e2e fixtures read this file too (e2e/fixtures.ts).

/** One group of changes, labelled by who notices: "Tanks", a spec, "Your setup", "Fixes"… */
export interface ReleaseGroup {
  label: string
  items: string[]
}

export interface Release {
  /** Stable and unique, the release's date and its number that day: "2026-09-24.3". Never changed once pushed. */
  id: string
  /** When it went out: ISO 8601 with an offset ("Z" for UTC). */
  time: string
  groups: ReleaseGroup[]
}

/** Every release, newest first. */
export const RELEASES: readonly Release[] = [
  {
    id: '2026-09-26.1',
    time: '2026-09-26T04:14:00Z',
    groups: [
      {
        label: 'Tanks',
        items: [
          'Protection Warrior’s default talents take Deep Wounds and Improved Rend and keep the survival talents: about 1,000 to 985 TPS with the lower ranks below. The earlier build is a preset.',
          'Feral Bear −2% and Protection Paladin −1% TPS from the lower buff ranks.',
          'Protection Paladins can take a priest’s Power Infusion: one cast at the pull, about +1% TPS.',
        ],
      },
      {
        label: 'Warriors',
        items: [
          'Deep Wounds keeps rolling: a new crit adds its bleed to what’s left instead of restarting it.',
          'Rend grows with attack power; Fury weaves it in when rage is low.',
          'Unbridled Wrath procs from your auto attacks only, not Heroic Strike or Cleave.',
          'New defaults: Fury 13/38/0 with Precision and Improved Execute, Arms 35/16/0 opening with Overpower. Fury about 714 to 843 DPS, Arms 690 to 821.',
          'The popular 17/34/0 Fury and 37/14/0 Arms are talent presets.',
        ],
      },
      {
        label: 'Every spec',
        items: [
          'Abilities and buffs use the ranks trainable before Ahn’Qiraj (Battle Shout 115, Blessing of Might 112, casters’ top spells one rank down): most specs −1% to −5%, Frost and Arcane mages about −9%.',
          'Gift of Arthas joins Max consumables’ boss debuffs: +1% to +3% for physical damage.',
          'Windfury Totem’s attack power also reaches your next swing and abilities for a second.',
          'Casters’ Power Infusion is one cast a fight, at the pull (Arcane: as Arcane Power ends), not every 3 minutes.',
        ],
      },
      {
        label: 'Your setup',
        items: [
          'Item tooltips: hover an item in your gear or the picker, or tap its info button on a phone.',
          'Talent presets show each build’s point split.',
          'Skyborne warriors and hunters can be simulated.',
          'With reduced motion on, windows and menus only fade.',
        ],
      },
      {
        label: 'Fixes',
        items: ['A hunter with no ranged weapon is told the setup can’t be simulated, with a button to Gear.'],
      },
    ],
  },
  {
    id: '2026-09-25.2',
    time: '2026-09-25T21:33:00Z',
    groups: [
      {
        label: 'DPS specs',
        items: [
          'Every DPS spec’s Rotation tab is now a priority list: drag a row or use Move up and Move down, turn any step off, and change its settings in place. Your order is saved and travels in share links.',
          'Warlocks can pick Incinerate as their filler once it’s talented: a Demonology build with it gains about 3.9% (the default talents don’t take it).',
          'Searing Pain and Demonic Brand are simulated: Demonology with Demonic Brand is about +12%, on untested values, so the default talents stay for now.',
          'Rogue: Eviscerate gains 4% of attack power per combo point, up from 3%, and Instant and Deadly Poison gain from attack power, from a player’s in-game tests shared on Discord: Combat +1%, Assassination +2%, Subtlety +0.7%.',
        ],
      },
      {
        label: 'Your setup',
        items: [
          'On a desktop window 1440 px and wider, the character sheet and Your setup sit beside every tab, with your result beside Run again.',
          'Gear shows every slot at once, laid out as the game’s character pane; the item picker opens as a window.',
          'Rotation’s settings sit beside the priority list, and Buffs, Fight and Character show every setting.',
          'A new light theme: a navy toolbar and white panels. Tooltips follow your theme.',
          'Ctrl+Enter (⌘+Enter on a Mac) runs Simulate from anywhere.',
          'Weapon skill shows as one number, and both when your hands differ.',
          'Coming soon, in the menu, lists what’s planned.',
        ],
      },
      {
        label: 'Fixes',
        items: [
          'Opening Assumptions on a wide screen no longer adds blank page below the results.',
          'Moving a row with the keyboard no longer drops the first arrow press.',
          'Choice buttons, such as Demonic Sacrifice’s demons, fit on narrow phones.',
        ],
      },
    ],
  },
  {
    id: '2026-09-25.1',
    time: '2026-09-25T06:13:25Z',
    groups: [
      {
        label: 'Tanks',
        items: [
          'Sunder Armor’s threat drops to 206 plus a little from attack power, and Shield Slam’s “very high” threat is modelled: Protection Warrior about 1,240 to 1,000 TPS.',
          'Righteous Fury drops to +60% Holy threat and Holy Strike is a 10 s cooldown at 50% weapon damage; a new priority order and talents: Protection Paladin about 830 to 750 TPS.',
          'Mangle is now Primal Bite (same numbers), and Lacerate follows the new Sunder: Feral Bear about 1,120 to 1,130 TPS.',
          'Thorns scales with a raid Restoration druid’s spell power; a bear casting its own keeps the base damage.',
          'Undead Touch of the Grave is simulated: about +2% TPS for Undead tanks.',
        ],
      },
      {
        label: 'DPS specs',
        items: [
          'Warlock gear ranked by the sim: Destruction about 450 to 600 DPS, Affliction 400 to 510, Demonology 535 to 675.',
          'Arms: Bloodthrill’s Overpower chance doubles, from main-hand attacks only, +6.7%. Retribution: Vengeance, Crusade and its talents changed, −1.4%.',
          'Balance: Wrath’s base damage up 50%, +5%. Fire Mage: Ignite no longer double-dips, Hot Streak lasts 20 s, and new trinkets, +3%.',
          'Gear re-ranked by the sim: Elemental +9%, Shadow Priest +8%, Frost and Arcane +1%.',
          'Gnome Eureka! is now a 10% cost cut for every class, down from 15 to 50%.',
          'Undead Touch of the Grave is simulated: about +1 to 2.5% DPS, and +4% for Arcane Mages, each of whose missiles can proc it.',
        ],
      },
      {
        label: 'Your setup',
        items: [
          'Old share links and saved setups still load. Points in talents the game removed are refunded, with a note, and old default builds become today’s.',
          'If you have the sim open in an old tab, reload it.',
        ],
      },
      {
        label: 'Consumables',
        items: [
          'Wizard Oil back to +24 spell power; the new Major Frenzy Potion is in Max consumables for rogues, Enhancement Shamans, and Marksmanship and Survival Hunters.',
        ],
      },
    ],
  },
  {
    id: '2026-09-24.4',
    time: '2026-09-24T23:29:09Z',
    groups: [
      {
        label: 'Tanks',
        items: [
          'Pick a rotation style: Defensive, Balanced (the new default) or Max TPS, and reorder the priority list on the Rotation tab.',
          'Protection Warrior Balanced: Shield Block and 5 Sunders kept, no Thunder Clap or Demoralizing Shout: about +10% TPS for about 21% more damage taken.',
          'Feral Bear Balanced: +3% TPS and +3% DPS for under 1% more damage taken; Max TPS Mauls from 14 rage.',
          'Protection Paladin uses our lead theorycrafter’s talents: +1% TPS.',
        ],
      },
      {
        label: 'DPS specs',
        items: [
          'Horde Frost and Arcane Mages wear Mindfang (+8 to 9%); Alliance Fire Mages (+9%) and Dwarf Elemental Shamans (+13%) wear Sageclaw.',
          'Fire Mage gains from casting speed again, and Orc mages get Blood Fury’s spell power (+0.7 to 0.8%).',
          'Gnome Eureka! for every class (+0.4 to 2.2%), and Expansive Mind for mages, priests and rogues.',
          'Max consumables add Brilliant Wizard Oil for Warlocks, Shadow Priests and Balance Druids: Destruction +4.7%, Shadow +3.5%, Balance +5%.',
        ],
      },
      {
        label: 'Your setup',
        items: [
          'Gear and talents you never changed follow new defaults; your own changes are kept.',
          'Equip pre-raid best in slot is now a button on the Gear tab.',
          'Fight details show each ability’s casts, swings, procs or ticks a fight and its average hit.',
          'What’s new, and a Release history in the menu.',
        ],
      },
      {
        label: 'Fixes',
        items: [
          'Arms Whirlwind no longer stalls after Recklessness.',
          'Switching spec cancels a running sim, and a sim that gets stuck stops after a minute and offers a reload.',
          'Share links work with the tracking bits chat apps add.',
        ],
      },
      {
        label: 'Consumables',
        items: [
          'One stone or oil per weapon; potions, runes and explosives share cooldowns.',
          'Greater Stoneshield and the EZ-Thro Dark Bomb are simulated; no preset uses the bomb (it costs melee a little, and casters would need to stand within 15 yards).',
        ],
      },
    ],
  },
  {
    id: '2026-09-24.3',
    time: '2026-09-24T18:46:19Z',
    groups: [
      {
        label: 'Tanks',
        items: [
          'Protection Warrior about 980 to 1,130 TPS: a threat set that keeps about 90% of the old pre-raid best in slot set’s effective health.',
          'Feral Bear about 690 to 1,080 TPS: Lacerate’s threat, Idol of Brutality, new talents and a threat set.',
          'Protection Paladin about 425 to 820 TPS: spell damage enchants, Nightfin Soup and Wizard Oil, its own Judgement of the Crusader, and the full damage of Seal of Fury and Holy Strike.',
          'Hammer of the Righteous is simulated, as an option in place of Holy Strike.',
          'New default talents for Protection Paladin and Feral Bear.',
          'Lacerate makes the high threat its tooltip promises, and Idol of Brutality takes 2 rage off Maul, Swipe and Mangle.',
          'A raid druid’s Thorns now reaches every tank in the raid presets.',
          'Horde paladins get Horde pieces where the default gear is Alliance-only.',
        ],
      },
      {
        label: 'DPS specs',
        items: [
          'New: Marksmanship, Beast Mastery and Survival Hunters, with pets, ammo and quivers.',
          'New: Demonology Warlock, with the Imp out by default.',
          'Elemental Shaman +9.6% DPS: its raid preset brings Nightfin Soup and Brilliant Wizard Oil.',
          'Retribution +1.4% DPS: Holy Strike’s bonus damage now adds in full, as its tooltip reads.',
          'Fury’s Rotation tab is a priority list: drag a row, or use Move up and Move down, to change the order.',
        ],
      },
      {
        label: 'Everything else',
        items: [
          'Forever Sim now lives at sim.decades.gg and carries the Decades guild’s crest. Old links still open, shared setups included.',
          'About shows when this release went out and its build.',
          'On a phone, the result bar has a labelled Details button.',
        ],
      },
    ],
  },
  {
    id: '2026-09-24.2',
    time: '2026-09-24T11:05:44Z',
    groups: [
      {
        label: 'DPS specs',
        items: [
          'New: Enhancement and Elemental Shaman.',
          'New: Combat, Assassination and Subtlety Rogue.',
          'New: Fire, Frost and Arcane Mage.',
          'New: Destruction and Affliction Warlock.',
          'New: Shadow Priest and Balance Druid.',
          'Each starts on its spec’s common priority, with pre-raid best in slot gear.',
        ],
      },
      {
        label: 'Casters',
        items: [
          'A caster’s character sheet shows spell damage by school, spell hit and crit, casting speed and mana.',
          'Gear shows spell damage, spell hit, spell crit and spell penetration.',
          'Buffs lists only what helps a caster: melee-only buffs are left out.',
        ],
      },
    ],
  },
  {
    id: '2026-09-24.1',
    time: '2026-09-24T05:38:38Z',
    groups: [
      {
        label: 'Tanks',
        items: [
          'New: Protection Warrior, Protection Paladin and Feral Bear, with TPS and DPS side by side.',
          'Tank results show the damage you take and how the boss’s swings land on you.',
          'Each tank’s Rotation tab has a Priority choice: tank duties first, the default, or Max TPS.',
        ],
      },
      {
        label: 'DPS specs',
        items: [
          'New: Feral Cat and Retribution Paladin.',
          'Retribution’s results show its mana through the fight: what it spent, and what restored it.',
          'Feral Cat’s results count its Clearcasting procs.',
        ],
      },
      {
        label: 'Your setup',
        items: [
          'The spec switcher lists specs under their class.',
          'Each spec keeps its latest result while the page is open, so switching back brings it back.',
        ],
      },
    ],
  },
  {
    id: '2026-09-23.1',
    time: '2026-09-23T22:54:59Z',
    groups: [
      {
        label: 'Warriors',
        items: [
          'Simulate Fury and Arms Warriors at level 60, on WoW Forever’s own spell, talent, item and race data.',
          'Both start on the best rotation the sim found: Arms +6.1% and Fury +6.4% DPS over the common priority.',
        ],
      },
      {
        label: 'Your setup',
        items: [
          'Gear starts on pre-raid best in slot, with enchants and a searchable item picker.',
          'Buffs and consumables come in presets, from Self only to Max consumables.',
          'Share copies a link to your exact setup.',
          'Setups saves, loads and renames named setups, and moves them between browsers as codes or files.',
          'Your setup is kept in this browser between visits.',
        ],
      },
      {
        label: 'Results',
        items: [
          'DPS with its ± range, a breakdown by ability, cooldowns, uptimes and bleeds.',
          'Every result lists the assumptions it rests on that nobody has tested in game yet.',
          'Switch to Classic Era rules under Character, Advanced, to compare.',
        ],
      },
    ],
  },
]

/** Where the id of the newest release this browser has seen is kept. */
export const LAST_SEEN_RELEASE_KEY = 'forever-sim:last-seen-release'

/**
 * Keys only an earlier visit leaves: the automatic save (src/app/setup-store.ts) and the named
 * setups (src/app/saved-setups.ts). Written as literals, since this file imports nothing;
 * releases.test.ts holds them to those files' keys.
 */
export const EARLIER_VISIT_KEYS = ['forever-sim:setup', 'forever-sim:saved-setups'] as const

const RELEASE_ID = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/

/**
 * Orders two release ids: by their date, then by the day's number, numerically ("…24.10" after
 * "…24.9"). Negative when `a` is older, positive when newer, NaN when either isn't a release id.
 */
export function compareReleaseIds(a: string, b: string): number {
  const x = RELEASE_ID.exec(a)
  const y = RELEASE_ID.exec(b)
  if (!x || !y) return Number.NaN
  if (x[1] !== y[1]) return x[1] < y[1] ? -1 : 1
  return Number(x[2]) - Number(y[2])
}

/**
 * The releases newer than `seenId`, newest first. None for a first visit (no id) or an id the list
 * doesn't have (it can't be placed, so the whole history isn't dumped on the visitor).
 */
export function releasesSince(seenId: string | null, releases: readonly Release[] = RELEASES): Release[] {
  if (seenId === null) return []
  const at = releases.findIndex((r) => r.id === seenId)
  return at < 0 ? [] : releases.slice(0, at)
}

type ReleaseStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * What What's New shows on this load (docs/ux.md "What's new"): the releases since the one this
 * browser last saw. Stores the newest id as it goes, so a release is shown once, whether or not it's
 * dismissed.
 *
 * - No id stored: a first visit shows nothing. But a browser with an automatic save or named setups
 *   (EARLIER_VISIT_KEYS) was here before What's New shipped, so it's treated as having seen the
 *   release before the newest, and shown the newest alone. Call this before anything writes the
 *   automatic save on this load, or a first visit would pass for an earlier one.
 * - An id the list doesn't know shows nothing. It's replaced by the newest only if it sorts older
 *   (or isn't a release id at all): a newer one, from a later release a newer tab has seen, is kept,
 *   so going back to that release doesn't show it again.
 * - Storage that can't be read shows nothing (it couldn't remember that it had); storage that can't
 *   be written still shows what's new this time, except to an earlier visitor with no stored id,
 *   who'd otherwise see it on every load.
 */
export function checkReleases(storage: ReleaseStorage | null, releases: readonly Release[] = RELEASES): Release[] {
  const newest = releases[0]?.id
  if (!storage || !newest) return []
  let seen: string | null
  let earlierVisit = false
  try {
    seen = storage.getItem(LAST_SEEN_RELEASE_KEY)
    if (seen === null) earlierVisit = EARLIER_VISIT_KEYS.some((key) => storage.getItem(key) !== null)
  } catch {
    return []
  }
  const known = seen !== null && releases.some((r) => r.id === seen)
  // NaN for a junk id, which isn't newer, so it's replaced.
  const unknownNewer = seen !== null && !known && compareReleaseIds(seen, newest) > 0
  let stored = false
  if (seen !== newest && !unknownNewer) {
    try {
      storage.setItem(LAST_SEEN_RELEASE_KEY, newest)
      stored = true
    } catch {
      // Full or blocked: shown now, and maybe again next time.
    }
  }
  // An earlier visitor with no id is shown the newest only once it's stored, or full storage would
  // show it on every load (review finding WV-2).
  if (seen === null) return earlierVisit && stored ? releases.slice(0, 1) : []
  return releasesSince(seen, releases)
}
