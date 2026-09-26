// Coming soon: what's planned, for players, in the order it's coming (docs/ux.md "Coming soon").
// Hand-written from docs/milestones.md's agreed milestones, in CLAUDE.md's "Release updates" voice:
// player terms, no internals, no emoji, and nothing promised that isn't agreed. When a release ships
// a milestone's work, its lines move to that release's entry in releases.ts and leave here.
//
// No imports, as releases.ts: the e2e fixtures may read it.

/** When a milestone is coming: in the next update, planned after it, or later still. */
export type RoadmapWhen = 'Next update' | 'Planned' | 'Later'

export interface RoadmapEntry {
  /** Stable and unique, for keys and tests. */
  id: string
  /** The milestone's name, as a player would say it. */
  title: string
  when: RoadmapWhen
  /** What it brings, one player-facing sentence each. */
  items: string[]
}

/** Every agreed milestone, in the order they're coming: the next update first, "Later" last. */
export const ROADMAP: readonly RoadmapEntry[] = [
  {
    id: 'sharper-numbers',
    title: 'Sharper numbers across the board',
    when: 'Next update',
    items: [
      'Values the sim estimated to fill gaps are replaced with ones from the game’s data, Classic, or tests in the game, used as they are, and what’s still unconfirmed is listed in your results’ assumptions.',
      'Seal of Fury deals its flat damage per hit, as its tooltip says, with no extra from weapon speed.',
      'Judgement of the Crusader adds each Holy hit’s share of its bonus, as beta logs and an in-game test show; the “All of it” setting goes.',
      'Protection Paladin’s defaults are re-tuned to match.',
      'Protection Warrior’s Shield Slam and Sunder Armor make the threat Forever gives them.',
      'The bear’s Lacerate makes the same threat as Sunder Armor, and its Primal Bite and rage follow the game’s data.',
      'Revenge, Thunder Clap, Rend, Arcane Shot, Serpent Sting, Unbridled Wrath and off-hand rage use the game’s data and combat logs.',
      'Casters’ epic weapons, Improved Imp, Maelstrom Weapon, Earth Shock and Thorns are checked against the game’s data the same way.',
      'Each class’s Dungeon Set 2 joins the gear, and the bear’s helm is picked again.',
      'Each hit’s damage is rounded down, as the game does.',
    ],
  },
  {
    id: 'multi-target',
    title: 'Multi-target',
    when: 'Planned',
    items: [
      'Fight up to 5 enemies at once, and set how long the extra ones are up.',
      'Each enemy keeps its own debuffs, bleeds and threat.',
      'Cleave, Whirlwind, Sweeping Strikes and Thunder Clap for warriors, Swipe for bears, and Consecration for paladins.',
      'Results add up damage and threat across the enemies, and split them by enemy.',
    ],
  },
  {
    id: 'optimizer',
    title: 'The Optimizer',
    when: 'Planned',
    items: [
      'Tell it what you’re after (DPS, TPS, Defense or Balanced), and it finds your best talents, gear and rotation settings by simulating them.',
      'Gear is searched slot by slot from the pre-raid pool, enchants included, within the item levels, sources and faction you pick, leaving the slots you lock alone.',
      'Keep or rule out talents, or ask for a minimum in a tree; tanks can also ask for an effective health floor, crit immunity or crush immunity.',
      'Every option runs the same fights, the clear losers drop out early, and the winner is checked again on fresh fights, so a lucky run doesn’t win.',
      'It has its own screen in the menu, and a Find the best button on Talents, Gear and Rotation. It says how long a search will take before it starts, and you can cancel it.',
      'Searches have a set limit, so none runs forever, and on a phone a search fits the time you pick.',
      'The top results show their DPS, TPS and damage taken, and one tap applies the one you want.',
      'Every spec’s defaults then come from the Optimizer’s results.',
    ],
  },
  {
    id: 'stat-boosts',
    title: 'Stat boosts',
    when: 'Planned',
    items: [
      'See how your spec scales with gear that isn’t out yet: add up to 100% to the stats from your items, or a set amount of any one stat, and compare.',
      'It covers every stat items carry, the tanks’ block and avoidance included, and the percent makes weapons hit harder too, as better weapons would.',
      'Off unless you turn it on, and the results say when a boost is on.',
    ],
  },
  {
    id: 'analysis',
    title: 'Analysis tools',
    when: 'Planned',
    items: [
      'Stat weights measured by the sim for your exact setup.',
      'Compare two items, or two talent builds, side by side.',
      'A chart of how your DPS spreads across fights, a timeline of each fight, and a combat log.',
    ],
  },
  {
    id: 'validation',
    title: 'Checked against the game',
    when: 'Planned',
    items: [
      'The sim’s numbers compared with beta logs and target dummy tests in the game, and its unconfirmed values replaced with measured ones.',
      'Every spec’s rotation tuned as carefully as the tanks’ are.',
    ],
  },
  {
    id: 'raid-gear',
    title: 'Raid gear',
    when: 'Later',
    items: ['Epic items from the raids in the gear picker and the Optimizer.'],
  },
]
