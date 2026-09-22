# Races dataset

`src/data/races/races.json` holds the ten WoW Forever races: faction, which classes each can be
in Forever and in Classic Era, and every racial with its Forever text next to the Classic one.
Interfaces and two small helpers (`racesForClass`, `racialEffectForClass`) are in
[`src/data/races/types.ts`](../../src/data/races/types.ts); the scraper is
[`scripts/scrape/races.mjs`](../../scripts/scrape/races.mjs).

| | |
| --- | --- |
| Source page | <https://foreverchanges.pro/racials> (the site nav's "Races"; the talent pages link to it as "Racials") |
| Forever build | `1.60.1.69913` (racial texts from the beta client's `SkillLineAbility` DB2 via wago.tools) |
| Classic baseline | Wowhead Classic pages, not a pinned client build, so `meta.classicBuild` is `null` |
| Class lists | Community report collected by the site (research block dated 2026-09-14; Wowhead news and Blizzard's panel recap) |
| Scraped | 2026-09-22, 20:31 UTC (`meta.scrapedAt`) |

## How the data was obtained

The scraper fetches `/racials` once, decodes the RSC payload with the helpers exported by
`scripts/scrape/talents.mjs` (see [talents.md](talents.md#how-the-data-was-obtained)) and reads
the props of the racials component: `races[]` (profile, classes, abilities, removals),
`matrix[]` (classes per race plus the classes `added` in Forever), `newCombos[]` and a
`research` block with sources, coverage and reported removals. It mirrors the component's
display rules (from its chunk `43xh32le3akj5.js`): the Forever text is `unranked_effect`
(else rank 1), the Classic text is shown only when the Classic status is `verified`, and an
ability tagged `reported` whose Classic status is `not_listed`/`absent` is displayed as New.
It then cross-checks every race and racial against the page's server-rendered text index
(names, order, tag, Forever text and "Classic: …" line, which the page omits when identical).

Classic class lists are the Forever list minus the site's `added` markers. The scraper also
compares them with the well-known Classic Era race/class table and fails if they disagree; they
all agree, and no Classic combination was removed. Same fetch rules as the talents scraper
(robots.txt respected, sequential requests ≥1.5 s apart, descriptive User-Agent, raw HTML cached
in `.cache/scrape/races/`).

## Schema

```ts
interface RaceData {
  meta: { source; scrapedAt; foreverBuild; classicBuild: null; scraper };
  research: { updatedAt; sources: { id; url; label; status }[]; coverage; notes: string[] };
  classOrder: ClassSlug[];                 // site order: warrior, hunter, mage, rogue, priest, warlock, paladin, druid, shaman
  simClassAvailability: Record<'warrior' | 'druid' | 'paladin', { forever: raceId[]; classic: raceId[] }>;
  newCombos: { raceId; race; faction; class }[];   // existing races' new class options
  races: Race[];
}
interface Race {
  id; name; baseName; faction: 'Horde' | 'Alliance'; icon; newInForever: boolean;
  classes: { forever; classic: ClassSlug[] | null; addedInForever; removedInForever };
  classAvailabilityStatus; compatibilityConflicts; reportedRemovals: { name; status; sources }[];
  racials: Racial[]; sources;
}
interface Racial {
  id; name; icon;
  changeKind;        // reported_change_kind verbatim: added | modified | unchanged | reported
  displayKind;       // the site's tag logic: added | modified | moved | unchanged | null
  changeLabel;       // the tag the page shows: "New" | "Changed" | "Unchanged"
  passive; tooltip;  // tooltip: { castTime?, cooldown?, range?, resourceCost? } for actives
  forever;           // Forever effect text
  foreverByClass;    // { warrior: "…", … } when the text is written per class, else null
  classic: { status: 'verified' | 'not_listed' | 'absent'; name; text; otherRaces: { race; text }[] };
  classicSpellId;    // Classic spell id from the Wowhead Classic link (null when new)
  races;             // race ids sharing it (Skyborne share three)
  evidenceStatus; comparisonStatus; discoveredAt; notes: { type; reported; existing?; sources }[]; sources;
}
```

The site gives no prose change summary for racials; the change is the `changeLabel` plus the
Forever/Classic texts side by side, with `notes` where a secondary source disagrees or adds
detail. Spell ids: only Classic ones exist (`classicSpellId`, 23 of 37 racials); the site
publishes no Forever spell ids for racials.

## Counts

10 races (5 Horde, 5 Alliance, including two new Skyborne variants), 37 unique racials
(40 race/racial pairs: Walk on Air, Wind Blessed and Elemental Insight are shared by both
Skyborne), 56 race/class pairs. By tag: 17 Changed, 6 Unchanged, 14 New (6 `added`: the five
Skyborne racials and Gnome's Eureka!; 8 `reported`: new racials of existing races, taken from
community reports and client data). Eleven Classic racials are reported removed.

## Race and class availability

"**new**" marks a combination unavailable in Classic.

| Race | Faction | Forever classes | New in Forever | Warrior | Druid | Paladin |
|---|---|---|---|---|---|---|
| Orc | Horde | warrior, hunter, mage, rogue, warlock, shaman | mage | yes | — | — |
| Undead | Horde | warrior, mage, rogue, priest, warlock, paladin | paladin | yes | — | **new** |
| Tauren | Horde | warrior, hunter, druid, shaman | — | yes | yes | — |
| Troll | Horde | warrior, hunter, mage, rogue, priest, warlock, shaman | warlock | yes | — | — |
| Skyborne (Windshaper) | Horde | warrior, hunter, rogue, druid, shaman | whole race | **new** | **new** | — |
| Human | Alliance | warrior, hunter, mage, rogue, priest, warlock, paladin | hunter | yes | — | yes |
| Dwarf | Alliance | warrior, hunter, rogue, priest, paladin, shaman | shaman | yes | — | yes |
| Night Elf | Alliance | warrior, hunter, rogue, priest, druid | — | yes | yes | — |
| Gnome | Alliance | warrior, mage, rogue, priest, warlock | priest | yes | — | — |
| Skyborne (High Order) | Alliance | warrior, hunter, mage, rogue, druid | whole race | **new** | **new** | — |

For the simulated classes (`simClassAvailability`):

| Class | Forever | Classic | Change |
| --- | --- | --- | --- |
| Warrior | all 10 races | 8 | + both Skyborne |
| Druid | Tauren, Night Elf, Skyborne (Windshaper), Skyborne (High Order) | Tauren, Night Elf | + both Skyborne |
| Paladin | Human, Dwarf, Undead | Human, Dwarf | + Undead: **Horde paladins** |

No Classic race/class combination is removed. Other new pairs: Human hunter, Dwarf shaman,
Gnome priest, Orc mage, Troll warlock.

## What matters for the sim

Combat-relevant racials for warriors, feral druids and paladins (full texts below):

- **Human** (warrior, paladin): Sword Specialization is now +2% crit with swords (was +5
  skill); Human Mace Specialization is reported removed. New Will to Survive breaks stuns.
- **Dwarf** (warrior, paladin): gains Mace Specialization, +1% crit with maces. Stoneform now
  reduces physical damage taken by 10% for 8 s instead of adding 10% armor, a tank cooldown.
- **Orc** (warrior): Axe Specialization is +1% crit with axes (was +5 skill). Blood Fury is +10%
  attack power and spell power for 15 s, 2 min cooldown, with no healing penalty (was +25% base
  AP).
- **Troll** (warrior): Berserking is a flat +10% attack and casting speed, 3 min cooldown; the
  text gives no duration (Classic: 10 s, 10–30% by health).
- **Tauren** (warrior, druid): Endurance adds +1% hit to +5% health.
- **Night Elf** (warrior, druid): new Elune's Light, +10% crit for 15 s, 3 min cooldown;
  Quickness adds 2% movement speed to +1% dodge.
- **Gnome** (warrior): Expansive Mind is +5% maximum rage for warriors; new Eureka!: the next 3
  damaging abilities cost 40% less rage and deal 10% more damage, 2 min cooldown.
- **Undead** (warrior, paladin): new Touch of the Grave, 5% chance on hit to drain health (up to
  5% of max health) for warriors and paladins.
- **Skyborne** (warrior, druid): Wind Blessed +1% melee, ranged and spell haste; Elemental
  Insight +5% damage against Elementals.

## Racials by race

Site tag and Forever text as the page shows them; active racials show cast time and cooldown.
"Reported removed" lists Classic racials the site's sources say Forever drops.

### Orc (Horde)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Axe Specialization | Changed | Increases your critical strike chance with all spells and abilities by 1% while you have an axe or a two-handed axe equipped. | Skill with Axes and Two-Handed Axes increased by 5. |
| Blood Fury _(Instant, 2 min cooldown)_ | Changed | Increases Attack Power and Spell Power by 10% for 15 sec. | Instant, 2 min cooldown. Increases base melee attack power by 25% for 15 sec and reduces healing effects on you by 50% for 25 sec. |
| Shatter Curse _(Instant, 3 min cooldown)_ | New | Instantly removes and grants immunity to all Curses and Banes, and reduces all Magical damage taken by 15% for 8 sec. | — (not an Orc racial in Classic) |
| Hardiness | Changed | Duration of Stun effects on you reduced by 20%. | Chance to resist Stun effects increased by an additional 25%. |

Reported removed: Command.

### Undead (Horde)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Will of the Forsaken _(Instant, 2 min cooldown)_ | Changed | Instantly removes all Charm, Fear and Sleep effects. | Instant, 2 min cooldown. Provides immunity to Charm, Fear and Sleep while active. May also be used while already afflicted by Charm, Fear or Sleep. Lasts 5 sec. |
| Cannibalize _(Instant, 2 min cooldown)_ | Changed | When activated, regenerates 7% of total Health and 7% of total Mana every 2 sec for 10 sec. Only works on Humanoid or Undead corpses within 5 yds. Any movement, action, or damage taken while Cannibalizing will cancel the effect. | Instant, 2 min cooldown. When activated, regenerates 7% of total health every 2 sec for 10 sec. Only works on Humanoid or Undead corpses within 5 yds. Any movement, action, or damage taken while Cannibalizing will cancel the effect. |
| Underwater Breathing | Unchanged | Underwater breath lasts 300% longer than normal. | Underwater breath lasts 300% longer than normal. |
| Touch of the Grave | New | Warrior, Paladin, Rogue: Your spells and attacks have a 5% chance to drain Health from the target, up to 5% of your maximum Health. / Priest, Mage, Warlock: Your spells and attacks have a 10% chance to drain Health from the target, up to 5% of your maximum Health. | — (not an Undead racial in Classic) |

Reported removed: Shadow Resistance.

### Tauren (Horde)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Cultivation _(Instant, 1 hr cooldown)_ | Changed | Cultivate a nearby herb, growing a duplicate you can harvest without requiring Herbalism skill. Each herb may only be cultivated once. | Herbalism skill increased by 15. |
| War Stomp _(0.5 sec cast, 2 min cooldown)_ | Unchanged | Stuns up to 5 enemies within 8 yds for 2 sec. | 0.5 sec cast, 2 min cooldown. Stuns up to 5 enemies within 8 yds for 2 sec. |
| Plainsrunning | New | Gain 1% increased movement speed every 5 sec spent moving, up to a maximum of 30% increase. Taking damage or standing still will reduce this effect. | — (not a Tauren racial in Classic) |
| Endurance | Changed | Total Health increased by 5% and chance to hit increased by 1%. | Total Health increased by 5%. |

Reported removed: Nature Resistance.

### Troll (Horde)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Berserking _(Instant, 3 min cooldown)_ | Changed | Increases your spellcasting and attack speed by 10%. | Instant, 3 min cooldown. Increases your casting and attack speed by 10% to 30%. At full health the speed increase is 10% with a greater effect up to 30% if you are badly hurt when you activate Berserking. Lasts 10 sec. |
| Rapid Regeneration _(Channeled, 3 min cooldown)_ | New | Regenerate 50% of your maximum Health over 6 sec. Any movement, action, or damage taken will cancel the effect. | — (not a Troll racial in Classic) |
| Beast Slaying | Unchanged | Damage dealt versus Beasts increased by 5%. | Damage dealt versus Beasts increased by 5%. |
| Regeneration | Changed | Health regeneration rate increased by 10%. In addition, 10% of total Health regeneration will continue during combat. | Health regeneration rate increased by 10%. 10% of total Health regeneration may continue during combat. |

Reported removed: Bow Specialization, Throwing Specialization.

### Skyborne (Windshaper) (Horde)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Walk on Air _(Instant, 2 min cooldown)_ | New | Glide downward through the air for 10 sec while controlling your direction of travel. | — (race new in Forever) |
| Skysight _(0.5 sec cast, 2 min cooldown)_ | New | Attempt to draw power from a convergence of elements and receive its blessing, increasing your movement and mounted movement speeds by 10%. Lasts 30 sec if no elemental convergence is nearby, and 15 min if one is found. | — (race new in Forever) |
| Wind Blessed | New | Increases your spellcasting, melee, and ranged Haste by 1%. | — (race new in Forever) |
| Elemental Insight | New | Damage dealt versus Elementals increased by 5%. | — (race new in Forever) |

### Human (Alliance)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Will to Survive _(Instant, 3 min cooldown)_ | New | Instantly removes all Stun effects. | — (not a Human racial in Classic) |
| Perception _(Instant, 3 min cooldown)_ | Unchanged | Dramatically increases stealth detection for 20 sec. | Instant, 3 min cooldown. Dramatically increases stealth detection for 20 sec. |
| Sword Specialization | Changed | Increases your critical strike chance with all spells and attacks by 2% while you have a sword or two-handed sword equipped. | Skill with Swords and Two-Handed Swords increased by 5. |
| The Human Spirit | Unchanged | Spirit increased by 5%. | Spirit increased by 5%. |

Reported removed: Diplomacy, Mace Specialization.

### Dwarf (Alliance)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Stoneform _(Instant, 3 min cooldown)_ | Changed | Instantly removes and grants immunity to all Bleed, Poison, and Disease effects, and reduces all Physical damage taken by 10% for 8 sec. | Instant, 3 min cooldown. While active, grants immunity to Bleed, Poison, and Disease effects. In addition, Armor increased by 10%. Lasts 8 sec. |
| Find Treasure _(Instant)_ | Unchanged | Allows the dwarf to sense nearby treasure, making it appear on the minimap. Lasts until cancelled. | Instant. Allows the dwarf to sense nearby treasure, making it appear on the minimap. Lasts until cancelled. |
| Mace Specialization | New | Increases your critical strike chance with all spells and attacks by 1% while you have a mace or two-handed mace equipped. | — (was Human: Skill with Maces and Two-Handed Maces increased by 5.) |
| Big Game Hunter | New | Damage dealt versus Beasts increased by 5%. | — (not a Dwarf racial in Classic) |

Reported removed: Frost Resistance, Gun Specialization.

### Night Elf (Alliance)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Elune's Light _(Instant, 3 min cooldown)_ | New | Increases your critical strike chance with all spells and attacks by 10% for 15 sec. | — (not a Night Elf racial in Classic) |
| Shadowmeld _(Instant, 10 sec cooldown)_ | Changed | Activate to slip into the shadows, reducing the chance for enemies to detect your presence. Lasts until cancelled or upon moving. Using this ability in combat discourages enemies from attacking you, but increases the cooldown to 2 min. | Instant, 10 sec cooldown. Activate to slip into the shadows, reducing the chance for enemies to detect your presence. Lasts until cancelled or upon moving. Night Elf Rogues and Druids with Shadowmeld are more difficult to detect while stealthed or prowling. |
| Quickness | Changed | Dodge chance increased by 1% and movement speed increased by 2%. Night Elf Rogues and Druids are harder to detect in Stealth as if they were 1 level higher. | Dodge chance increased by 1%. |
| Wisp Spirit | Changed | Transform into a wisp upon death, increasing movement speed by 75%. | Transform into a wisp upon death, increasing speed by 50%. |

Reported removed: Nature Resistance.

Notes: Shadowmeld: additional_report — reported "Threat returns when the effect ends if enemies remain in combat.".

### Gnome (Alliance)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Expansive Mind | Changed | Priest, Mage, Warlock: Maximum Mana increased by 5%. / Rogue: Maximum Energy increased by 5%. / Warrior: Maximum Rage increased by 5%. | Intelligence increased by 5%. |
| Eureka! _(Instant, 2 min cooldown)_ | New | Rogue: Your next 3 damaging abilities have their Energy cost reduced by 20% and deal 10% more damage. / Warlock, Mage: Your next 3 damaging abilities have their Mana cost reduced by 50% and deal 10% more damage. / Priest: Your next 3 damaging or healing abilities have their Mana cost reduced by 15% and deal 10% more damage or healing. / Warrior: Your next 3 damaging abilities have their Rage cost reduced by 40% and deal 10% more damage. | — (not a Gnome racial in Classic) |
| Escape Artist _(Instant, 2 min cooldown)_ | Changed | Instantly escape the effects of any movement impairing effect and gain immunity to those effects for 3 sec. | 0.5 sec cast, 1 min cooldown. Escape the effects of any immobilization or movement speed reduction effect. |
| Engineering Specialization | Changed | Your gnomish ingenuity reduces the rate of engineering devices failing or backfiring when you use them by 20%. | Engineering skill increased by 15. |

Reported removed: Arcane Resistance.

Notes: Escape Artist: conflict — reported "Removes roots and movement slows." vs "Brief immunity to Roots and Snares.".

### Skyborne (High Order) (Alliance)

| Racial | Site tag | Forever | Classic |
|---|---|---|---|
| Walk on Air _(Instant, 2 min cooldown)_ | New | Glide downward through the air for 10 sec while controlling your direction of travel. | — (race new in Forever) |
| Read Ley Line _(2 sec cast, 2 min cooldown)_ | New | Attempt to tap into the power of a nearby ley line, increasing your Health and Mana regeneration by 100%. Lasts 15 sec if no ley line is nearby, and 15 min if one is found. | — (race new in Forever) |
| Wind Blessed | New | Increases your spellcasting, melee, and ranged Haste by 1%. | — (race new in Forever) |
| Elemental Insight | New | Damage dealt versus Elementals increased by 5%. | — (race new in Forever) |


## Caveats

- **Class lists are reported, not datamined.** Every race's `classAvailabilityStatus` is
  `reported_compatibility`: the site follows a community report (research block updated
  2026-09-14). Its notes say another source lists 57 race/class pairs where it has 56, and
  `coverage.conflictingAdditionalPair` is 1, but no race carries a `compatibilityConflicts`
  entry, so the disputed pair is unknown. Confirm unusual pairs (Undead paladin) in the beta.
- **Removals are secondary reports** (`secondary_report_not_directly_verified`), not client
  data.
- **`reported` racials** have Forever text from the client but no Classic counterpart for that
  race; Mace Specialization notes the Human original in `classic.otherRaces`.
- **Open notes.** Escape Artist: a report says "removes roots and movement slows" where the site
  has "brief immunity to Roots and Snares". Shadowmeld: a report adds that threat returns when
  it ends.
- **Numbers are tooltip text.** The sim has to parse effects such as Berserking's missing
  duration or Blood Fury's AP basis (all AP vs base AP) and should verify them in game.
- **Skyborne** have no Classic baseline (`classic.status: "absent"`), and their character art
  on the site is a placeholder.
- **`meta.classicBuild` is `null`** because the Classic texts come from Wowhead Classic rather
  than a pinned client build (the talent and spell datasets use `1.15.9.69722`).

## Re-running

```sh
node scripts/scrape/races.mjs            # from .cache/scrape/races/ if present
node scripts/scrape/races.mjs --refresh  # re-fetch /racials
```

It prints the race, racial and pair counts and each simulated class's Forever vs Classic races,
and exits 1 (still writing the JSON for inspection) if any check fails: an unexpected payload
field, a race missing from the class matrix, Classic classes that disagree with the Classic
reference table, an inconsistent shared racial, or a race/racial that disagrees with the page's
text index.
