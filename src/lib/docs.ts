// Links from the app into the docs on GitHub, where the About sheet points too. A doc ref is a
// repo path with an optional anchor, e.g. "docs/mechanics/rage.md#rage-from-damage-taken".

export const REPO_URL = 'https://github.com/andersonjohnf/forever_sim'

/** The doc on GitHub, at its section when the ref has an anchor. */
export const docUrl = (ref: string) => `${REPO_URL}/blob/main/${ref.replace(/^\/+/, '')}`

const TITLES: Record<string, string> = {
  'docs/mechanics/combat-tables.md': 'Combat tables',
  'docs/mechanics/damage-and-timing.md': 'Damage and timing',
  'docs/mechanics/rage.md': 'Rage',
  'docs/mechanics/threat.md': 'Threat',
  'docs/mechanics/character-stats.md': 'Character stats',
  'docs/mechanics/buffs-debuffs-consumables.md': 'Buffs and consumables',
  'docs/mechanics/encounter.md': 'Encounter',
  'docs/mechanics/forever-system-changes.md': 'Forever system changes',
  'docs/classes/warrior.md': 'Warrior',
  'docs/classes/druid.md': 'Druid',
  'docs/classes/paladin.md': 'Paladin',
  'docs/decisions.md': 'Decisions',
  'docs/milestones.md': 'Milestones',
  'docs/open-questions.md': 'Open questions',
}

/** A short name for the doc a ref points into ("Rage", "Combat tables"), for link text. */
export function docTitle(ref: string): string {
  const path = ref.split('#')[0]
  const known = TITLES[path]
  if (known) return known
  const base = (path.split('/').at(-1) ?? path).replace(/\.md$/, '').replace(/[-_]+/g, ' ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}
