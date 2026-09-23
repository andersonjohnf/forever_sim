# Talents dataset

`src/data/talents/{warrior,druid,paladin}.json` hold the three WoW Forever talent trees of each
class, talent by talent, with the Forever tooltip of every rank next to the Classic Era one, the
grid position, the prerequisite arrows and the site's popular builds. Interfaces and the
build-code helpers are in [`src/data/talents/types.ts`](../../src/data/talents/types.ts); the
scraper is [`scripts/scrape/talents.mjs`](../../scripts/scrape/talents.mjs).

| | |
| --- | --- |
| Source pages | <https://foreverchanges.pro/talents/warrior>, [`/druid`](https://foreverchanges.pro/talents/druid), [`/paladin`](https://foreverchanges.pro/talents/paladin) |
| Forever build | `1.60.1.69913` (beta client; the site reads the `TraitNode` DB2 via wago.tools) |
| Classic build | `1.15.9.69722` (Classic Era client) |
| Scraped | 2026-09-22, 20:29–20:31 UTC (`meta.scrapedAt`, per class) |

## How the data was obtained

The talent calculator is server-rendered Next.js. The scraper fetches one page per class and:

1. **Decodes the RSC payload.** It JSON-decodes and concatenates every
   `self.__next_f.push([1,"…"])` string in the HTML, splits the stream into `<hex id>:<payload>`
   rows (`T` rows are length-prefixed in UTF-8 bytes; `X`/`C` stream-control rows are skipped)
   and resolves reference strings: `"$<id>:a:b"` paths (the stream's de-duplication, e.g.
   `"$1e:0:props:trees:0:talents:0"`, where `props` steps into a `["$", type, key, props]`
   element), `"$undefined"` (dropped), `"$$…"` (escaped literal). Lazy `"$L<id>"` children are
   followed only on demand, so a child that points back into its parent's props is not a cycle.
   The output is checked to contain no string starting with `$`.
2. **Reads the calculator props.** Exactly one object has `classSlug`, `trees` and `popular`:
   `trees[].talents[]` are the talent records, `popular[]` the builds.
3. **Cross-checks the text index.** The page also renders every talent as text
   ("Arms (17 talents)", then one `<li>` per talent with its rank count, 1-based tier and change
   tag). The scraper checks the count, ids, names, ranks, tiers and tags against the payload.
4. **Mirrors the calculator's rules.** The site's calculator chunk (`3jkwmmvkqw6lg.js`, module
   84892) defines which talents are placeable (tier 0–6, column 0–3, max rank > 0, first talent
   in a cell), resolves an arrow by the talent's `structure.reported_prerequisite` *name* within
   the same tree, requires the prerequisite at **max rank**, gates tier N behind 5·N points in
   lower tiers of the same tree, caps points at 51, and builds codes from the placeable talents
   sorted by tier then column. The scraper and `types.ts` implement exactly that.

Only the three talent pages are fetched (robots.txt disallows `/api/`, `/spell/`, `/search`,
`/admin`; none are requested). Requests are sequential, ≥1.5 s apart, with User-Agent
`forever_sim-scraper/0.1 (+https://github.com/andersonjohnf/forever_sim; one-time data snapshot)`.
Raw HTML is cached in `.cache/scrape/talents/<class>.html` with a `.meta.json` recording the
fetch time, which becomes `meta.scrapedAt`, so re-running from cache is byte-identical.

## Schema

```ts
interface TalentData {
  meta: { source; scrapedAt; foreverBuild; classicBuild; scraper };
  class: 'warrior' | 'druid' | 'paladin';
  rules: { maxPoints: 51; pointsPerTier: 5; maxTier: 6; maxCol: 3 };
  codeFormat: string;            // prose version of "Build codes" below
  popularBuilds: { tree; points: [n, n, n]; code }[];
  trees: { id; name; icon; index; clientTreeId; talents: Talent[] }[];   // index 0..2 = code segment
}
```

| `Talent` field | Meaning |
| --- | --- |
| `id` | Site id, e.g. `calc-warrior-arms-mortal-strike`. Opaque: some lack the `calc-` prefix (`warrior-bloodthirst`). |
| `name`, `icon` | Forever name; Blizzard icon file name. |
| `tree` | Tree id (`"Arms"`, `"Feral Combat"`, …). |
| `tier`, `col` | **0-based** grid cell (tier 0 = top row, col 0..3). The site's prose and index use 1-based tiers. |
| `order` | Position of the talent's digit in its tree's build-code segment; `-1` if not in the Forever tree. |
| `maxRank` | Forever max rank. |
| `prerequisite` | `{ talentId, rank }` for an arrow into this talent; `rank` is always the prerequisite's max rank. |
| `inForeverTree` | `calculator_eligible && !context_only`. **True for all 156 talents in this snapshot** (see Caveats). |
| `changeKind` | Site's `reported_change_kind`: `added`, `modified`, `moved`, `unchanged`. |
| `summary`, `changes` | Site's one-line summary and bullet list, verbatim. |
| `passive`, `tooltip` | Passive flag; for active talents the tooltip header (`resourceCost`, `range`, `castTime`, `cooldown`, `requirements`). |
| `previousName` | Classic name when renamed/replaced (e.g. Bastion ← One-Handed Weapon Specialization). |
| `ranks.forever` / `ranks.classic` | Tooltip text per rank, index 0 = rank 1. `classic` is null for new talents. `foreverEstimated` appears only if the site has estimates (none now). |
| `classic` | Matched Classic talent: `name`, `maxRank`, 0-based `tier`, `matchStatus` (`same_name` / `same_spell`), Classic `prerequisite` name. Null for new talents. |
| `classicSpellId` | Rank-1 Classic spell id, from the Wowhead Classic source link. |
| `evidenceStatus`, `comparisonStatus`, `discoveredAt`, `sources` | Provenance, verbatim (all `client_data` / `client` / `2026-09-18` here). |

Talents are listed per tree in `order` (tier, then column); context-only records, if a future
scrape has any, follow with `order: -1`.

## Counts

| Class | Trees (talents) | New | Changed | Moved only | Same as Classic | Arrows | Popular builds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Warrior | Arms 17, Fury 18, Protection 18 = 53 | 9 | 36 | 1 | 7 | 8 | 3 |
| Druid | Balance 16, Feral Combat 19, Restoration 16 = 51 | 13 | 34 | 2 | 2 | 8 | 3 |
| Paladin | Holy 18, Protection 16, Retribution 18 = 52 | 20 | 25 | 4 | 3 | 7 | 3 |

Every talent has a unique (tree, tier, col) and an `order`; the page's "(N talents)" headings
match. Client tree ids: warrior 161/164/163, druid 283/281/282, paladin 382/383/381.

## Build codes (verified)

A build code is a Wowhead-style string with **three `-`-separated segments, one per tree in
`trees` order**. A segment has one decimal digit per Forever-tree talent, its rank
(0..`maxRank`), with talents **sorted by tier, then column** (the talent's `order`). Trailing
zeros in a segment are trimmed; empty segments are kept, so the site always emits two dashes:
`30305213132515201-05050103-`. The site's calculator reads it from the URL:
`/talents/<class>?b=<code>&l=<level>&o=<order>&tl=<n>` (`l` level, default 60; `o` levelling
order, one character per point from `0-9a-zA-Z_~` indexing the three trees' talents
concatenated in code order; `tl` points from the Talented legacy perk, 0–5, which change the
level at which points arrive but never the 51-point cap).

`decodeTalentCode(data, code)` returns `{ [talentId]: rank }`; `encodeTalentCode(data, ranks)`
is its inverse; `validateTalentBuild(data, ranks)` lists rule violations (unknown or
out-of-tree talent, rank range, >51 points, 5·tier gate, prerequisite at max rank).

**Proof.** All nine popular builds (three per class) decode under this order with no violations:
points per tree equal the site's `points`, totals ≤ 51, every tier gate and arrow holds, the
named tree's tier-7 talent is taken (Mortal Strike, Bloodthirst, Shield Slam; Moonkin Form,
Berserk, Wild Growth; Light's Vigil, Holy Shield, Twist of Light) and re-encoding reproduces the
code byte for byte. As controls, column-major order and alphabetical order each break all nine
builds. The scraper re-runs these checks every time and exits non-zero on any failure.

Worked decodes, one per class (each entry is `order` Talent rank/max):

**Warrior, Arms 37/14/0: `30305213132515201-05050103-`**

- `30305213132515201` → Arms: 0 Improved Heroic Strike 3/3, 2 Improved Rend 3/3,
  4 Improved Tactical Mastery 5/5, 5 Improved Overpower 2/2, 6 Anger Management 1/1,
  7 Deep Wounds 3/3, 8 Spearing Strike 1/1, 9 Two-Handed Weapon Specialization 3/3,
  10 Impale 2/2, 11 Bloodthrill 5/5, 12 Sweeping Strikes 1/1, 13 Weaponmaster 5/5,
  14 Improved Slam 2/2, 16 Mortal Strike 1/1 (digits at 1, 3 and 15 are 0: Deflection,
  Improved Charge, Improved Hamstring).
- `05050103` → Fury: 1 Cruelty 5/5, 3 Unbridled Wrath 5/5, 5 Piercing Howl 1/1,
  7 Boundless Rage 3/3.
- empty → Protection: no points.

**Druid, Feral Combat 9/37/5: `050022-5520002123032213051-05`**

- `050022` → Balance: 1 Genesis 5/5, 4 Nature's Majesty 2/2, 5 Nature's Reach 2/2.
- `5520002123032213051` → Feral Combat: 0 Ferocity 5/5, 1 Heart of the Wild 5/5,
  2 Feral Swiftness 2/2, 6 Savage Fury 2/2, 7 Feral Charge 1/1, 8 Sharpened Claws 2/2,
  9 Shredding Attacks 3/3, 11 Predatory Strikes 3/3, 12 Primal Fury 2/2,
  13 Predatory Instincts 2/2, 14 Leader of the Pack 1/1, 15 King of the Jungle 3/3,
  17 Rend and Tear 5/5, 18 Berserk 1/1.
- `05` → Restoration: 1 Furor 5/5.

**Paladin, Retribution 10/8/33: `250003-503-052052310012330321`**

- `250003` → Holy: 0 Improved Holy Strike 2/2, 1 Divine Strength 5/5, 5 Improved Seals 3/3.
- `503` → Protection: 0 Toughness 5/5, 2 Precision 3/3.
- `052052310012330321` → Retribution: 1 Benediction 5/5, 2 Improved Judgement 2/2,
  4 Conviction 5/5, 5 Vindication 2/3, 6 Sanctified Judgement 3/3, 7 Seal of Command 1/1,
  10 Sacred Arbiter 1/1, 11 Crusade 2/2, 12 Two-Handed Weapon Specialization 3/3,
  13 Vengeance 3/3, 15 Champion of the Light 3/3, 16 Instrument of Law 2/2,
  17 Twist of Light 1/1.

The other popular builds: Fury `30305013002-050530035150010051-` (17/34/0), Protection warrior
`05-05-552001233201210531` (5/5/36), Balance `5532220115501351-05-` (41/5/0), Restoration
`05302001-05-5050035103113251` (11/5/35), Holy `005320213225131051-5032-05` (36/10/5),
Protection paladin `2-4530513321301551-502` (2/42/7).

## Prerequisite arrows

The site resolves an arrow from the talent's reported prerequisite name; the prerequisite must
be at **max rank**. All arrows point down except Holy Shock → Divine Precision, which is
**horizontal** (both tier 5), so code that assumes a prerequisite sits in a lower tier is wrong.

| Class | Arrows (prerequisite → talent) |
| --- | --- |
| Warrior | Improved Tactical Mastery → Anger Management; Improved Rend → Deep Wounds; Sweeping Strikes → Mortal Strike; Enrage → Flurry; Death Wish → Bloodthirst; Improved Bloodrage → Last Stand; Shield Specialization → Master of Defense; Concussion Blow → Shield Slam |
| Druid | Improved Moonfire → Vengeance; Savage Fury → Mangle; Sharpened Claws → Primal Fury; Predatory Strikes → Rend and Tear; Leader of the Pack → Berserk; Naturalist → Nature's Swiftness; Improved Rejuvenation → Improved Regrowth; Living Spirit → Wild Growth |
| Paladin | Reverence → Illumination; Holy Shock → Divine Precision; Holy Shock → Light's Vigil; Redoubt → Shield Specialization; Improved Seal of Fury → Swift Judgement; Templar's Bulwark → Holy Shield; Sanctified Judgement → Vengeance |

## Changes at a glance

Tier·Col is 1-based here to match the game UI. "Changed" rows quote the site's summary; the full
Forever and Classic texts of every rank are in the JSON. New-talent rows show the max-rank
Forever text (the site's own summaries of new talents are sometimes fragments).

### Warrior

Arms 17, Fury 18, Protection 18 (53 talents): 9 new, 36 changed, 1 moved only, 7 same as Classic.

**New in Forever**

| Tree | Tier·Col | Talent | Ranks | Effect at max rank |
|---|---|---|---|---|
| Arms | 4·1 | Spearing Strike | 1 | A brutal attack that deals 40% weapon damage. Deals an additional 80% weapon damage against Giants, Dragonkin, and mounted targets. Mounted targets are dismounted. |
| Arms | 5·1 | Bloodthrill | 5 | Your melee attacks against targets afflicted by your Rend have a 10% chance to activate your Overpower ability for 1 attack on your current target. Lasts 6 sec. |
| Arms | 5·3 | Weaponmaster | 5 | Gives your melee weapon attacks a benefit depending on the weapon. Axe/Polearm: Increases your critical strike chance by 5%. Mace/Staff: Your attacks ignore 15% of your… |
| Fury | 3·4 | Boundless Rage | 3 | Increases your maximum Rage by 30. |
| Fury | 4·2 | Raging Blows | 1 | Causes your Whirlwind to also strike with your off-hand weapon, and reduces the Rage cost of your Cleave ability by 2. |
| Fury | 5·1 | Precision | 3 | Improves your chance to hit by 3%. |
| Protection | 3·2 | Master of Defense (needs Shield Specialization) | 2 | Grants you a 100% chance to generate 5 Rage when you Dodge or Parry while a shield is equipped. |
| Protection | 4·3 | Vanguard | 1 | Your Charge ability is now usable while in Defensive Stance. |
| Protection | 6·3 | Focused Rage | 3 | Reduces the Rage cost of your offensive abilities by 3. |

**Changed or moved** (site summary, verbatim; tiers in the prose are 1-based)

| Tree | Tier·Col | Talent | Summary |
|---|---|---|---|
| Arms | 1·1 | Improved Heroic Strike | Same numbers, reworded. |
| Arms | 1·3 | Improved Rend | 12% instead of 15%. |
| Arms | 2·1 | Improved Charge | Same numbers, reworded. |
| Arms | 2·2 | Improved Tactical Mastery | Replaces Tactical Mastery. |
| Arms | 2·4 | Improved Overpower | Moved from tier 3 to tier 2. |
| Arms | 3·2 | Anger Management | Effect rewritten. |
| Arms | 3·3 | Deep Wounds | Same numbers, reworded. |
| Arms | 4·2 | Two-Handed Weapon Specialization | 3 ranks (Classic: 5). |
| Arms | 4·3 | Impale | No longer requires Deep Wounds. Effect rewritten. |
| Arms | 6·1 | Improved Slam | 2 ranks (Classic: 5). Moved from Fury to Arms. Effect rewritten. |
| Fury | 1·2 | Booming Voice | Effect rewritten. |
| Fury | 1·3 | Cruelty | Same numbers, reworded. |
| Fury | 2·2 | Iron Will | Moved from Protection to Fury. Effect rewritten. |
| Fury | 2·3 | Unbridled Wrath | Numbers and wording changed. |
| Fury | 3·1 | Improved Cleave | Effect rewritten. |
| Fury | 3·2 | Piercing Howl | Same numbers, reworded. |
| Fury | 3·3 | Blood Craze | Effect rewritten. |
| Fury | 4·1 | Dual Wield Specialization | Effect rewritten. |
| Fury | 4·3 | Enrage | Effect rewritten. |
| Fury | 4·4 | Improved Execute | Moved from column 2 to column 4. 3 instead of 2. |
| Fury | 5·2 | Death Wish | 5% instead of 20%, reworded. |
| Fury | 6·1 | Improved Berserker Rage | Effect rewritten. |
| Fury | 6·3 | Flurry | Rank 5: 25% instead of 30%, reworded. |
| Fury | 7·2 | Bloodthirst | Effect rewritten. |
| Protection | 1·2 | Shield Specialization | Rank 5: 5 instead of 1, reworded. |
| Protection | 1·3 | Anticipation | Rank 5: 20 instead of 10. |
| Protection | 2·1 | Improved Bloodrage | Rank 2: 50% instead of 5, reworded. |
| Protection | 2·4 | Improved Thunder Clap | Moved from Arms to Protection. Rank 3: 6 instead of 4, reworded. |
| Protection | 3·1 | Last Stand | Same numbers, reworded. |
| Protection | 3·3 | Improved Revenge | Effect rewritten. |
| Protection | 3·4 | Defiance | 3 ranks (Classic: 5). Effect rewritten. |
| Protection | 4·1 | Improved Sunder Armor | Same numbers, reworded. |
| Protection | 4·2 | Improved Disarm | Rank 3: 20 secs instead of 3 secs, reworded. |
| Protection | 5·1 | Improved Shield Wall | Rank 2: 11.0 min instead of 5 secs, reworded. |
| Protection | 5·2 | Concussion Blow | Same numbers, reworded. |
| Protection | 5·4 | Bastion | Replaces One-Handed Weapon Specialization. Moved from tier 6 to tier 5. |
| Protection | 7·2 | Shield Slam | 421 to 439 instead of 225 to 235, reworded. |

**Same as Classic:** Deflection, Sweeping Strikes, Improved Hamstring, Mortal Strike, Improved Intercept, Toughness, Improved Shield Bash.

### Druid

Balance 16, Feral Combat 19, Restoration 16 (51 talents): 13 new, 34 changed, 2 moved only, 2 same as Classic.

**New in Forever**

| Tree | Tier·Col | Talent | Ranks | Effect at max rank |
|---|---|---|---|---|
| Balance | 1·3 | Genesis | 5 | Increases the periodic damage and healing done by your spells and abilities by 5%. |
| Balance | 2·3 | Nature's Majesty | 2 | Increases your critical strike chance with spells and melee attacks by 4%. |
| Balance | 3·3 | Nature's Splendor | 1 | Increases the duration of your Moonfire and Rejuvenation spells by 3 sec, your Regrowth spell by 6 sec, and your Insect Swarm spell by 2 sec. |
| Balance | 5·3 | Eclipse | 3 | Your Wrath spell reduces the cast time of your next 2 Starfire spells by 0.50 sec. Stores up to 4 charges. Lasts 15 sec. |
| Feral Combat | 4·2 | Mangle (needs Savage Fury) | 1 | Mangle the target for 100% normal damage plus 26. |
| Feral Combat | 5·1 | Predatory Instincts | 2 | Increases the critical strike damage bonus of your melee abilities by 20%. |
| Feral Combat | 5·4 | King of the Jungle | 3 | Tiger's Fury now instantly grants you 60 Energy. |
| Feral Combat | 6·1 | Natural Reaction | 5 | Increases your dodge chance by 5%, and gives you a 100% chance to gain 5 Rage each time you dodge. |
| Feral Combat | 6·3 | Rend and Tear (needs Predatory Strikes) | 5 | Increases damage done by your melee abilities on Bleeding targets by 10%. |
| Feral Combat | 7·2 | Berserk (needs Leader of the Pack) | 1 | Requires Cat Form, Bear Form, Dire Bear Form Causes your Mangle ability to strike up to 3 targets, removes its cooldown, and increases the critical strike chance of your… |
| Restoration | 3·4 | Gift of the Earthmother | 1 | Reduces the global cooldown by 0.5 seconds on your Rejuvenation, Swiftmend, and Wild Growth spells. |
| Restoration | 5·2 | Living Spirit | 3 | Increases your Spirit by 15%. |
| Restoration | 7·2 | Wild Growth (needs Living Spirit) | 1 | Heals the target and their party for 280 over 7 sec. Party members must be within 43.5 yards of target. The amount healed is applied quickly at first, and slows down as… |

**Changed or moved** (site summary, verbatim; tiers in the prose are 1-based)

| Tree | Tier·Col | Talent | Summary |
|---|---|---|---|
| Balance | 1·2 | Improved Wrath | Moved from column 1 to column 2. Numbers and wording changed. |
| Balance | 2·1 | Moonglow | Moved from tier 5 to tier 2. Effect rewritten. |
| Balance | 2·2 | Improved Moonfire | 2 ranks (Classic: 5). Rank 2: 10% instead of 4%. |
| Balance | 2·4 | Nature's Reach | Moved from tier 3 to tier 2. Effect rewritten. |
| Balance | 3·1 | Improved Entangling Roots | Moved from tier 2 to tier 3. Effect rewritten. |
| Balance | 4·1 | Insect Swarm | Moved from Restoration to Balance. 48 instead of 66, reworded. |
| Balance | 4·2 | Vengeance | Same numbers, reworded. |
| Balance | 4·3 | Improved Starfire | Same numbers, reworded. |
| Balance | 5·1 | Overgrowth | Replaces Improved Nature's Grasp. 2 ranks (Classic: 4). Moved from tier 1 to tier 5. No longer requires Nature's Grasp. |
| Balance | 5·2 | Nature's Grace | Effect rewritten. |
| Balance | 6·2 | Moonfury | No longer requires Nature's Grace. Same numbers, reworded. |
| Balance | 7·2 | Moonkin Form | Numbers and wording changed. |
| Feral Combat | 1·2 | Ferocity | Same numbers, reworded. |
| Feral Combat | 1·3 | Heart of the Wild | Moved from tier 6 to tier 1. No longer requires Predatory Strikes. Rank 5: 10% instead of 20%, 10% instead of 20%, reworded. |
| Feral Combat | 2·1 | Feral Swiftness | Renamed from Feline Swiftness. Moved from tier 3 to tier 2. Same numbers, reworded. |
| Feral Combat | 2·2 | Feral Instinct | 3 ranks (Classic: 5). Moved from column 1 to column 2. Effect rewritten. |
| Feral Combat | 2·3 | Brutal Impact | Moved from column 2 to column 3. Numbers and wording changed. |
| Feral Combat | 2·4 | Thick Hide | 3 ranks (Classic: 5). Moved from column 3 to column 4. Effect rewritten. |
| Feral Combat | 3·2 | Savage Fury | Moved from tier 5 to tier 3. Rank 2: 10% instead of 20%, reworded. |
| Feral Combat | 3·3 | Feral Charge | Moved from column 2 to column 3. Effect rewritten. |
| Feral Combat | 3·4 | Sharpened Claws | 2 ranks (Classic: 3). Moved from column 3 to column 4. Rank 2: 6% instead of 4%, reworded. |
| Feral Combat | 4·1 | Shredding Attacks | Replaces Improved Shred. 3 ranks (Classic: 2). |
| Feral Combat | 4·3 | Predatory Strikes | Moved from column 2 to column 3. Same numbers, reworded. |
| Feral Combat | 4·4 | Primal Fury | Effect rewritten. |
| Feral Combat | 5·2 | Leader of the Pack | Moved from tier 7 to tier 5. Same numbers, reworded. |
| Restoration | 1·2 | Nature's Focus | Moved from tier 2 to tier 1. Same numbers, reworded. |
| Restoration | 1·3 | Furor | Effect rewritten. |
| Restoration | 2·1 | Naturalist | Renamed from Improved Healing Touch. Numbers and wording changed. |
| Restoration | 2·2 | Subtlety | 3 ranks (Classic: 5). Moved from tier 3 to tier 2. Rank 3: 30% instead of 12%, reworded. |
| Restoration | 2·3 | Natural Shapeshifter | Moved from Balance to Restoration. |
| Restoration | 3·2 | Reflection | Rank 3: 50% instead of 15%. |
| Restoration | 3·3 | Gift of Nature | Moved from tier 5 to tier 3. No longer requires Insect Swarm. Same numbers, reworded. |
| Restoration | 4·3 | Improved Rejuvenation | Moved from column 4 to column 3. |
| Restoration | 4·4 | Swiftmend | Moved from tier 7 to tier 4. No longer requires Tranquil Spirit. Effect rewritten. |
| Restoration | 5·4 | Improved Tranquility | Numbers and wording changed. |
| Restoration | 6·3 | Improved Regrowth | Requires Improved Rejuvenation. |

**Same as Classic:** Tranquil Spirit, Nature's Swiftness.

### Paladin

Holy 18, Protection 16, Retribution 18 (52 talents): 20 new, 25 changed, 4 moved only, 3 same as Classic.

**New in Forever**

| Tree | Tier·Col | Talent | Ranks | Effect at max rank |
|---|---|---|---|---|
| Holy | 1·1 | Improved Holy Strike | 2 | Reduces the cooldown of your Holy Strike ability by 2 sec. |
| Holy | 3·1 | Voice of Truth | 1 | Grants you immunity to Silence and Interrupt effects. Lasts 6 sec. |
| Holy | 3·2 | Reverence | 3 | Allows 30% of your Mana regeneration to continue while casting. |
| Holy | 3·3 | Purifying Power | 2 | Reduces the mana cost of your Cleanse and Purify spells by 20% and reduces the cooldown of your Exorcism and Holy Wrath spells by 33%. |
| Holy | 4·1 | Infusion of Light | 2 | Your Holy Shock and Flash of Light critical hits reduce the cast time of your next Holy Light cast within 15 sec by 1.0 sec. |
| Holy | 5·1 | Divine Precision (needs Holy Shock) | 3 | Improves your chance to hit with Holy spells by 18%. |
| Holy | 5·3 | Consecrated Ground | 2 | Gives your Holy spells 10% increased damage against the first 4 enemies that enter your Consecration. |
| Holy | 7·2 | Light's Vigil (needs Holy Shock) | 1 | Applies Light's Vigil to the target for 30 sec. Your next Holy Shock cast on them triggers no cooldown and causes friendly targets to heal their party for 315 to 333, or… |
| Protection | 3·1 | Improved Seal of Fury | 1 | When Seal of Fury's shield is fully absorbed, restore 0 Mana, increased by 15% per level the attacker is above you, up to 45%. |
| Protection | 3·4 | Sacred Duty | 2 | Increases your total Stamina by 4% and reduces the cooldown of your Divine Shield, Divine Protection, and Templar's Bulwark spells by 60 sec. |
| Protection | 4·1 | Swift Judgement (needs Improved Seal of Fury) | 1 | Finishes the remaining cooldown on your Judgement ability and reduces the Mana cost of your next Judgement by 100%. |
| Protection | 5·2 | Templar's Bulwark | 1 | When activated, this ability grants you an absorb shield equal to 100% of your maximum health for 8 sec. Applies Forbearance for 1 min. Cannot be cast while Forbearance… |
| Protection | 6·3 | Iron Creed | 5 | Increases the threat generated by your Holy Strike ability 25%. While Righteous Fury is active, Holy Strike also reduces your damage taken by 10% for 6 sec. |
| Retribution | 2·2 | Holy Conduit | 2 | Reduces the mana cost of your Consecration, Holy Wrath, Exorcism, and Hammer of Wrath spells by 40%. |
| Retribution | 3·2 | Sanctified Judgement | 3 | Gives your Judgement ability a 100% chance to return 60% of the Mana cost of the judged seal. |
| Retribution | 4·3 | Sacred Arbiter | 1 | Increases the damage of your Holy Strike ability by 10% and causes it to refresh all Judgement effects on the target. |
| Retribution | 4·4 | Crusade | 2 | Increases all damage dealt by 2%. Increased by an additional 2% against Demon and Undead targets. |
| Retribution | 6·2 | Champion of the Light | 3 | Increases your spell damage and healing by up to 100% of your Intellect. |
| Retribution | 6·3 | Instrument of Law | 2 | Reduces the cast time of your Hammer of Wrath by 1.0 sec, and reduces all threat you generate by 20% while Righteous Fury is not active. |
| Retribution | 7·2 | Twist of Light | 1 | When you replace your Seal of Command, Seal of Righteousness, Seal of Fury, or Seal of Justice with a different Seal, gain an Echo. Your next melee attack applies the re… |

**Changed or moved** (site summary, verbatim; tiers in the prose are 1-based)

| Tree | Tier·Col | Talent | Summary |
|---|---|---|---|
| Holy | 2·1 | Healing Light | Moved from tier 3 to tier 2. Same numbers, reworded. |
| Holy | 2·2 | Spiritual Focus | 2 ranks (Classic: 5). Rank 2: 70% instead of 28%, reworded. |
| Holy | 2·3 | Improved Seals | Replaces Improved Seal of Righteousness. 3 ranks (Classic: 5). |
| Holy | 2·4 | Unyielding Faith | Moved from tier 3 to tier 2. Effect rewritten. |
| Holy | 4·2 | Illumination | Requires Reverence. Numbers and wording changed. |
| Holy | 4·3 | Divine Favor | Moved from tier 5 to tier 4. No longer requires Illumination. |
| Holy | 5·2 | Holy Shock | Moved from tier 7 to tier 5. No longer requires Divine Favor. 129 to 139 instead of 204 to 220, 110 to 118 instead of 204 to 220. |
| Holy | 6·3 | Holy Power | Numbers and wording changed. |
| Protection | 1·2 | Toughness | Moved from tier 2 to tier 1. |
| Protection | 1·3 | Redoubt | Effect rewritten. |
| Protection | 2·1 | Precision | Effect rewritten. |
| Protection | 2·2 | Guardian's Favor | Same numbers, reworded. |
| Protection | 2·4 | Anticipation | Moved from tier 3 to tier 2. Rank 5: 20 instead of 10. |
| Protection | 3·2 | Improved Righteous Fury | Effect rewritten. |
| Protection | 3·3 | Shield Specialization | Effect rewritten. |
| Protection | 4·2 | One-Handed Weapon Specialization | 3 ranks (Classic: 5). Moved from tier 6 to tier 4. Rank 3: 10% instead of 6%. |
| Protection | 4·3 | Improved Hammer of Justice | Moved from column 2 to column 3. |
| Protection | 5·3 | Reckoning | Numbers and wording changed. |
| Protection | 7·2 | Holy Shield | Requires Templar's Bulwark (Classic: Blessing of Sanctuary). 20% instead of 30%, 110 instead of 65. |
| Retribution | 1·2 | Deflection | Moved from tier 2 to tier 1. |
| Retribution | 1·3 | Benediction | Effect rewritten. |
| Retribution | 2·1 | Improved Judgement | Same numbers, reworded. |
| Retribution | 2·3 | Conviction | Moved from tier 3 to tier 2. Same numbers, reworded. |
| Retribution | 3·1 | Vindication | Effect rewritten. |
| Retribution | 3·4 | Pursuit of Justice | Rank 2: 15% instead of 8%, reworded. |
| Retribution | 4·1 | Eye for an Eye | Rank 2: 10% instead of 30%, reworded. |
| Retribution | 5·1 | Two-Handed Weapon Specialization | Rank 3: 9% instead of 6%. |
| Retribution | 5·2 | Vengeance | 3 ranks (Classic: 5). Moved from tier 6 to tier 5. Requires Sanctified Judgement (Classic: Conviction). Effect rewritten. |
| Retribution | 5·3 | Repentance | Moved from tier 7 to tier 5. |

**Same as Classic:** Divine Strength, Divine Intellect, Seal of Command.



## Caveats

- **Beta data.** Client build 1.60.1.69913, captured 2026-09-22, five days into the beta.
  Blizzard will keep tuning before the 2026-11-04 launch; re-scrape and diff.
- **No removed talents here.** Every record on these pages is `calculator_eligible` and not
  `context_only`, so all 156 talents are in the Forever trees (`inForeverTree: true`,
  `order ≥ 0`). The pages carry no records for Classic talents dropped in Forever, so this
  snapshot cannot list them; `classic` only covers talents that were kept, renamed or replaced.
  The scraper still handles context-only records (`order: -1`) if a later scrape has them.
- **Tooltip text is raw client data.** Some values look unresolved or mis-scaled, e.g. Improved
  Shield Wall "by 11.0 min", Improved Seal of Fury "restore 0 Mana", Wild Growth "within
  43.5 yards", Improved Bloodrage "50% instead of 5". Check suspicious numbers in game before
  the engine relies on them, and put corrections in the override layer.
- **One prerequisite the site doesn't show.** The client makes Nature's Splendor (druid Balance)
  require Nature's Majesty (a `TraitEdge` of type 3, "required for availability"); the scraped
  tree has no arrow there. [F] [client](client.md#talentsjson) (TraitEdge, 1.60.1.69913)
- **Summaries are machine-written.** "Same numbers, reworded" and "Effect rewritten" are the
  site's diff labels, not balance notes. Some new-talent summaries are cut
  (Eclipse: "17 sec. Stores up to 4 charges."). Use `ranks.forever`.
- **Talent names can collide across classes and trees** (Precision is Fury and paladin
  Protection; Deflection, Toughness, Anticipation, Vengeance, Shield Specialization and
  Two-Handed Weapon Specialization exist in two classes). Key by `id`.
- **Popular builds** are the site's picks and change over time; they validate the code format,
  they are not recommendations.
- **Level cap and points.** `rules.maxPoints` is 51 at level 60. The site's Talented legacy
  perk (`tl`) only shifts when points arrive while levelling.

## Re-running

```sh
node scripts/scrape/talents.mjs            # from .cache/scrape/talents/ if present
node scripts/scrape/talents.mjs --refresh  # re-fetch the three pages
```

It prints per-tree counts and each popular build's decode, and exits 1 (still writing the JSON
for inspection) if any check fails: an unexpected field in the payload, a count or tag that
disagrees with the page's text index, a duplicate cell, an unresolvable arrow, a build that
does not decode cleanly, or a leftover `$` reference. `scripts/scrape/races.mjs` imports its RSC
helpers from this script.
