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
    id: 'priority-lists',
    title: 'Every rotation as a priority list',
    when: 'Next update',
    items: [
      'Every spec’s Rotation tab becomes a priority list, as Fury’s and the tanks’ already are: drag a row, or use Move up and Move down, to play the order you play.',
      'Turn any step off, and change its settings in place.',
      'Warlocks can pick Incinerate as their filler when it’s talented, and Searing Pain works with Demonic Brand.',
    ],
  },
  {
    id: 'optimizer',
    title: 'The Optimizer',
    when: 'Planned',
    items: [
      'Tell it what you’re after, DPS, TPS, Defense or Balanced, and it finds your best talents, gear and rotation settings by simulating them.',
      'Gear is searched slot by slot from the pre-raid pool, enchants included, within the item levels, sources and faction you pick, leaving the slots you lock alone.',
      'Tanks can ask for an effective health floor, crit immunity or crush immunity.',
      'It has its own screen in the menu, and a Find the best button on Talents, Gear and Rotation. It says how long a search will take before it starts, and you can cancel it.',
      'Every spec’s defaults then come from the Optimizer’s results.',
    ],
  },
  {
    id: 'multi-target',
    title: 'Multi-target',
    when: 'Planned',
    items: [
      'Fight up to 5 enemies at once.',
      'Cleave, Whirlwind, Sweeping Strikes and Thunder Clap for warriors, Swipe for bears, and Consecration for paladins.',
      'Results add up damage and threat across the enemies, and split them by enemy.',
    ],
  },
  {
    id: 'stat-boosts',
    title: 'Stat boosts',
    when: 'Planned',
    items: [
      'See how your spec scales with gear that isn’t out yet: add up to 100% to the stats from your items, or a set amount of any one stat, and compare.',
    ],
  },
  {
    id: 'analysis',
    title: 'Analysis tools',
    when: 'Planned',
    items: [
      'Stat weights for your setup.',
      'Compare two items, or two talent builds, side by side.',
      'A chart of how your DPS spreads across fights, and a timeline of each fight.',
    ],
  },
  {
    id: 'validation',
    title: 'Checked against the game',
    when: 'Planned',
    items: [
      'The sim’s numbers compared with the guild’s logs and target dummy tests, and its best guesses replaced with measured values.',
      'Every spec’s rotation tuned to the tanks’ standard.',
    ],
  },
  {
    id: 'raid-gear',
    title: 'Raid gear',
    when: 'Later',
    items: ['Epic items from the raids in the gear picker.'],
  },
]
