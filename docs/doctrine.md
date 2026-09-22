# Doctrine

The rules this project runs on. When code, a doc, or a contributor disagrees with this file,
this file wins, or it gets changed on purpose in a reviewed commit.

## 1. What we're building

A DPS/TPS simulator for **WoW Forever**, built for our guild. The bar is **the best Forever
sim we can build with the data we have**, with a clean, modern UX that works great on mobile
and desktop ([ux.md](ux.md)). [wowsims](https://github.com/wowsims) may support Forever one
day; that's never a reason for half measures, and the app doesn't describe itself as
temporary. Precision goes where it moves results ([§4](#4-engine)). Everything the user
touches is finished work.

| In scope | Out of scope (for now) |
| --- | --- |
| Level 60 characters vs a level 63 raid boss | Levelling, PvP |
| Warrior: Arms, Fury (DPS) · Protection (TPS) | Every other class |
| Druid: Feral cat (DPS) · Feral bear (TPS) | Balance (see [milestones](milestones.md#later)), Restoration |
| Paladin: Retribution (DPS) · Protection (TPS) | Holy |
| Pre-raid gear: Rare, required level 55–60 or item level ≥ 58 ([D10](decisions.md#d10-pre-raid-pool--rare-required-level-5560-or-item-level--58-2026-09-22)), plus any known pre-raid BiS item ([D11](decisions.md#d11-known-pre-raid-bis-items-are-always-in-the-pool-2026-09-22)) | Raid gear (easy to add later) |
| Single target, with light multi-target options | Full encounter scripting |
| Raid buffs, target debuffs, consumables, enchants | **World buffs**: not available in Forever raids (see below) |

**World buffs are excluded.** They are not available in WoW Forever raids, so the sim has
no world-buff toggles, no preset includes them, and no default assumes them. This covers
Rallying Cry of the Dragonslayer, Spirit of Zandalar, Songflower Serenade, Warchief's
Blessing, the Dire Maul tribute buffs, Darkmoon Faire fortunes, and any similar
zone-wide or event buff. This is a guild directive
([D8](decisions.md#d8-world-buffs-are-excluded-2026-09-22)). Revisit it only if Forever
itself changes.

Users choose **gear, buffs, and which abilities are used**. Every choice has a sensible default,
so someone who opens the page and clicks "Simulate" gets a meaningful number.

## 2. Where numbers come from (non-negotiable)

Rules come from four tiers. Use the highest tier that has an answer.

1. **WoW Forever, datamined**: [foreverchanges.pro](https://foreverchanges.pro) (beta client
   vs Classic Era diffs) and Forever client DB2 tables on [wago.tools](https://wago.tools)
   for builds `1.60.x`. **wago.tools is for people only:** its `robots.txt` disallows all
   automated access, so scripts and agents must never fetch it. A person may look a value up
   in a browser and cite the URL; docs mark such values "confirm on wago.tools" until a
   person has.
2. **WoW Forever, measured**: in-game tests on the Forever beta by the guild, recorded in
   the relevant doc with the build, date, method, and sample size. If a measurement
   contradicts a tooltip, the measurement wins; flag the conflict.
3. **Classic Era**: the 2019+ WoW Classic re-release, clients 1.13–1.15. This is the
   baseline foreverchanges diffs against (build `1.15.9.69722`). Use it wherever tiers 1–2
   are silent.
4. **Forbidden**: never use values from **Season of Discovery, Season of Mastery,
   original Vanilla** (2004–2006 live patches, private-server emulators such as
   vmangos/cmangos/Turtle WoW, or wiki text describing pre-1.12 behaviour), **TBC or
   later**, or **Retail**. If a forbidden source is the only one you can find, do not adopt
   the value. Record it as an open question, with how to verify it on the beta.

**Secondary Forever sources** include Wowhead news posts, streamer tooltip captures, and
community Forever sims such as [wowsims/forever](https://github.com/wowsims/forever) and
[ElliotWood/Forever](https://github.com/ElliotWood/Forever). They may be cited for
Forever-specific facts but are tagged **[?]** until client data or a guild measurement
confirms them. Never adopt a value they carried over from a forbidden ruleset: both are
built on wowsims code with Season of Discovery or TBC lineage.

Two more kinds of evidence are secondary and tagged **[?]**:

- **Third-party Forever measurements**, such as beta tests posted by other theorycrafters
  or community combat logs, until the guild reproduces them (tier 2 is *guild*
  measurement).
- **Forever client data read through a secondary source**, such as tables extracted in
  wowsims/forever, unless the same value appears on foreverchanges.pro. In that case, cite
  foreverchanges and tag it **[F]**.

**Mixed-lineage Classic sims are secondary too.** For example,
[wowsims/classic](https://github.com/wowsims/classic) describes itself as a Season of
Discovery sim and still contains SoD rune code. The same goes for tools with SoD or TBC
modes or ancestry (WarriorSim, LibThreatClassic2, Sixty Upgrades). A value supported only
by such a source is **[?]**, not **[C]**, until a genuine Classic Era source corroborates
it. Exception: code pinned to a commit from **before Season of Discovery launched
(2023-11-30)** is Classic Era and can back a **[C]** value.

**When secondary Forever evidence contradicts Classic Era,** the `forever` rule profile
adopts it only when it is client data a person can check (a spell attribute, a table
value). Tag it **[?]** and list it for confirmation. Anecdotal secondary evidence doesn't
override Classic Era in the default profile; it becomes an open question.

**Verbatim mirrors of client files are client data.** A mirror of the Forever client's UI code
or text strings is **[F]** for what the client *displays or computes*, such as a
character-sheet formula or a tooltip string. The combat behavior that implies is **[?]** until
measured: the server may disagree with the client's display.

**Tooltip values beat derived values.** When a Forever tooltip shows a number and a value
derived from raw client tables disagrees with it (e.g. per-level scaling), use the tooltip
number as **[F]** and record the derived one as an open question.

**Worked examples name their rule profile** (`forever` or `classicEra`) whenever the
profiles differ on anything the example uses.

Common traps: wowhead.com/classic mixes in SoD data and runes, `wowsims/sod` is an SoD sim,
many "vanilla" wiki pages describe behaviour that changed by 1.12, and warcraft.wiki.gg
often leads with current retail values.

### Tagging

Every value in `docs/` carries a tag and a source link:

- **[F]**: Forever-verified (tier 1 or 2)
- **[C]**: Classic Era (tier 3)
- **[?]**: unverified or assumed; must also appear in the doc's *Open questions*

Code that encodes a mechanic cites the doc section it came from. A comment such as
`// docs/mechanics/rage.md#rage-from-damage-dealt` is enough. If code and doc disagree,
fix one of them in the same change.

## 3. Data

- `src/data/**/*.json` is a **generated snapshot** of foreverchanges.pro, written by
  `scripts/scrape/*.mjs`. Hand-authored scraper inputs, such as the curated pre-raid BiS
  list, live next to the scrapers and cite their sources. Never hand-edit the output. Re-run the scraper (`npm run scrape`) and
  review the diff.
- Every dataset has a `meta` envelope recording its source URL, scrape time and client
  builds. The beta changes weekly, so always know which build a number came from.
- Corrections to scraped data (a mis-parsed tooltip, a value the guild measured) go in
  an explicit, documented override layer in the engine, each with a reason and a source.
  They never go in the JSON.
- Scrapers respect `robots.txt` (no `/api/`, `/spell/`, `/search`, `/admin`), run
  sequentially with delays, and cache raw responses under `.cache/scrape/`.
- Items with no Forever data yet ("missing" on foreverchanges) fall back to their Classic
  Era stats and are flagged in the UI.

## 4. Engine

- **Pure TypeScript** in `src/sim/`: no React, DOM, `Date.now()` or `Math.random()`.
  Randomness comes from a seeded RNG, so any run can be reproduced exactly from its
  config plus seed.
- **Discrete-event simulation** with integer-millisecond time. It runs in a Web Worker so
  the UI never blocks.
- **Model what moves the result.** Anything that changes DPS/TPS by more than ~0.5% is
  modelled. Anything smaller may be skipped, but the skip is written down in the relevant
  doc's implementation notes (e.g. spell batching, latency).
- **Tests come from the docs.** Every *Worked example* in `docs/mechanics` and
  `docs/classes` becomes a unit test. Fixed-seed "golden" runs guard against regressions.
- Report uncertainty honestly: show mean ± a confidence interval, and surface `[?]`
  assumptions that affect the current setup.

## 5. Defaults

Defaults describe a **typical guild raider in pre-raid gear** on a normal raid night, not a
theoretical maximum:

- the talent build is the most popular Forever build for the spec
- the gear is the spec's pre-raid BiS set ([D11](decisions.md#d11-known-pre-raid-bis-items-are-always-in-the-pool-2026-09-22))
- raid buffs for a typical raid composition, and common consumables. Buffs are keyed to
  composition, not faction: both factions have paladins and shamans in Forever
- never world buffs (they don't exist in Forever raids, see §1)
- a rotation that a real player can execute

The default for each setting is documented in the class doc that owns it.

## 6. Review gate (before every push)

Nothing is pushed until every change since the last push has passed an **adversarial logic
review** and an **adversarial UX review** by an independent reviewer, not the author. Every
finding is fixed or waived with a written reason, and the log is committed as
`docs/reviews/<YYYY-MM-DD>-<topic>.md`. The procedure and checklists are in
[CLAUDE.md](../CLAUDE.md#core-doctrine-adversarial-review-before-every-push) and
[ux.md](ux.md#ux-review-checklist).

## 7. Change management

- The beta client changes. When foreverchanges.pro updates, re-scrape, diff, and update any
  doc whose numbers moved (bump the build in its status line).
- Milestones live in [milestones.md](milestones.md). Significant decisions go in
  [decisions.md](decisions.md) with a date and the reasoning.
