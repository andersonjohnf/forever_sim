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
| Warrior: Arms, Fury (DPS) · Protection (TPS) | Healers (Holy, Discipline, Restoration) |
| Druid: Feral cat (DPS) · Feral bear (TPS) · Balance (DPS, [D27](decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)) | |
| Paladin: Retribution (DPS) · Protection (TPS) | |
| Every other DPS spec ([D27](decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)): Rogue, Hunter, Mage, Warlock, Shadow Priest, Elemental and Enhancement Shaman | |
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

1. **WoW Forever, datamined**: the Forever beta client's own files (DB2 tables and game
   tables) for builds `1.60.x` (product `wow_classic_beta`), fetched through the
   [wago.tools](https://wago.tools) API and parsed with
   [WoWDBDefs](https://github.com/wowdev/WoWDBDefs). Every dataset in `src/data` comes from
   them ([D17](decisions.md#d17-retire-foreverchangespro-as-a-data-source-2026-09-22)).
   **Scripts may use wago.tools only through its documented API**
   ([wago.tools/apis](https://wago.tools/apis)): `/api/builds…`, `/api/files`,
   `/api/info/{fdid}` and `/api/casc/{fdid}`, the last of which serves raw client files.
   Requests go one at a time, are cached, carry our User-Agent, and happen once per build.
   Nothing else on the site is API: its pages and the table pages' CSV export stay off-limits
   to automation under its `robots.txt`
   ([D16](decisions.md#d16-use-the-wagotools-api-with-attribution-2026-09-22)). wago.tools is
   credited with its logo, per its [branding guidelines](https://wago.tools/branding).
   **Server hotfixes are out of reach:** the raw client files don't carry them, and the
   documented API has no hotfix endpoint. A value that only a hotfix could explain is
   flagged **[?]** and listed as an open question, never guessed
   ([client.md § Hotfix caveat](data/client.md#hotfix-caveat)).
2. **WoW Forever, measured**: in-game tests on the Forever beta by the user or guild members,
   recorded in the relevant doc with the build, date, method, and sample size. If a
   measurement contradicts a tooltip, the measurement wins; flag the conflict. So far the only
   one is the user's level-20 paladin test
   ([D37](decisions.md#d37-only-sourced-values-2026-09-26)); a test shared by someone else is a
   third-party measurement (below), not tier 2.
3. **Classic Era**: the 2019+ WoW Classic re-release, clients 1.13–1.15. Its client
   (product `wow_classic_era`, build `1.15.9.69722`), read through the same API, is the
   baseline the datasets compare Forever against. Use it wherever tiers 1–2 are silent.
4. **Forbidden**: never use values from **Season of Discovery, Season of Mastery,
   original Vanilla** (2004–2006 live patches, private-server emulators such as
   vmangos/cmangos/Turtle WoW, or wiki text describing pre-1.12 behaviour), **TBC or
   later**, or **Retail**. If a forbidden source is the only one you can find, do not adopt
   the value. Record it as an open question, with how to verify it on the beta. **One
   exception ([D24](decisions.md#d24-small-assumptions-dont-gate-features-2026-09-23)):** a
   value Classic Era kept unchanged from 1.12 (class base attributes, base health), found only
   in an emulator database, may stand in when no tier 1–3 source has it and it agrees with the
   [C] values around it. It's tagged `[?]` as a placeholder, never cited as evidence, listed in
   the open questions with its estimated effect and in the results' assumptions, and replaced as
   soon as a tier 1–3 source has it.
   **Season of Discovery, scoped ([D37](decisions.md#d37-only-sourced-values-2026-09-26),
   replacing [D36](decisions.md#d36-what-we-take-from-warriorsim-2026-09-25)'s exception):**
   where the Forever client carries a Season of Discovery spell (the same spell ID, absent
   from Classic before SoD), **Blizzard's own** SoD client data or patch notes for that spell
   may supply its values. Nothing else from SoD may: a value from another sim's SoD code, a
   wiki or a guide stays forbidden, and a rescaled or "closest analog" SoD value is still
   invented. Such a value is tagged `[?]` with the spell ID and the Blizzard source, and listed
   in the open questions.

**Secondary Forever sources** include Wowhead news posts, streamer tooltip captures, and
community Forever sims such as [wowsims/forever](https://github.com/wowsims/forever) and
[ElliotWood/Forever](https://github.com/ElliotWood/Forever). They may be cited for
Forever-specific facts but are tagged **[?]** until client data or a tier 2 measurement
confirms them. Never adopt a value they carried over from a forbidden ruleset: both are
built on wowsims code with Season of Discovery or TBC lineage.

Two more kinds of evidence are secondary and tagged **[?]**:

- **Third-party Forever measurements**, such as beta tests posted by other theorycrafters,
  a player's in-game tests shared on Discord, or community combat logs, until the user or a
  guild member reproduces them (tier 2). Label them by where they came from ("a player's
  tests shared on Discord"), never as a guild test.
- **Forever client data read through a secondary source**, such as tables extracted in
  wowsims/forever, until the same value is read from the client files (tier 1). Then cite
  the client table and build, and tag it **[F]**.

**Mixed-lineage Classic sims are secondary too.** For example,
[wowsims/classic](https://github.com/wowsims/classic) describes itself as a Season of
Discovery sim and still contains SoD rune code. The same goes for tools with SoD or TBC
modes or ancestry (WarriorSim, LibThreatClassic2, Sixty Upgrades). A value supported only
by such a source is **[?]**, not **[C]**, until a genuine Classic Era source corroborates
it. Exception: code pinned to a commit from **before Season of Discovery launched
(2023-11-30)** is Classic Era and can back a **[C]** value.

**Other sims are never authoritative**
([D37](decisions.md#d37-only-sourced-values-2026-09-26)). wowsims classic and SoD, WarriorSim,
LibThreatClassic2 and the Warcraft Logs threat configs are unconfirmed data we may consider: a
lead to check against the client, Classic Era or a measurement, never a source that sets a value
on its own. Many of their constants cite nothing (their bear and most warrior threat terms among
them). Where one is kept for want of anything better, as Maul's ×1.75 is, its provenance is
stated plainly in the owning doc and it stays **[?]**.

**The user's offhand numbers are never evidence or targets**
([D37](decisions.md#d37-only-sourced-values-2026-09-26)). A number said in passing ("bears do
about 800–900 TPS") is a feel, not a measurement. No value moves to close a gap to it; a gap no
cited mechanic explains is an open question.

**When secondary Forever evidence contradicts Classic Era,** the `forever` rule profile
adopts it in two cases:
- It's client data a person can check (a spell attribute, a table value).
- It's a server-side rule the client can't hold, such as rage from white hits or from damage
  taken, and a **reproducible analysis of public beta combat logs** supports it. That needs
  raw logs anyone can re-run, a documented method, and many independent characters
  ([D22](decisions.md#d22-reproducible-log-analyses-can-set-server-side-forever-defaults-2026-09-23)).

Either way, tag it **[?]** and list it for confirmation. Anecdotes, and one tester's fit to their
own logs, don't override Classic Era in the default profile; they become open questions.

**Verbatim mirrors of client files are client data.** A mirror of the Forever client's UI code
or text strings is **[F]** for what the client *displays or computes*, such as a
character-sheet formula or a tooltip string. The combat behavior that implies is **[?]** until
measured: the server may disagree with the client's display.

**Tooltip values beat derived values.** When a Forever tooltip shows a number and a value
derived from raw client tables disagrees with it (e.g. per-level scaling), use the tooltip
number as **[F]** and record the derived one as an open question.

**Every described effect has a default, and no default is invented**
([D29](decisions.md#d29-same-threat-words-same-threat-presets-geared-for-what-they-measure-2026-09-24),
narrowed by [D37](decisions.md#d37-only-sourced-values-2026-09-26)). Leaving a described effect
out models it as zero, which is rarely the most accurate reading; making a number up is worse.
So:
- An effect a tooltip, a talent's text, the client's defined meaning or observed play
  describes gets a default, and it's an allowed source's value **used as is**, one of:
  - the same ability's Classic Era value;
  - a similar known value, unchanged: never rescaled by a ratio we chose (by rank, level, cost
    or anything else);
  - Blizzard's own Season of Discovery client data or patch notes, for a spell Forever reuses
    from SoD (tier 4's scoped exception);
  - client data, with the meaning the client defines for it;
  - a measurement: a D22 log analysis or a tier 2 test.
- **No invented multipliers, ratios, scalings or fitted terms.** A coefficient chosen to make a
  result look right, or fitted to one tester's numbers, is not a default.
- **An undescribed client dummy effect models as zero.** A dummy aura or effect with no
  tooltip, talent text or defined client meaning has nothing to default from; giving it a
  meaning by analogy is invention. The zero is tagged **[?]** and listed as an open question.
- Every such default is tagged **[?]**, listed in the doc's open questions and shown in the
  results' assumptions, until a tier 1–2 source replaces it.
- The tier 4 rule still holds: a default is never copied from a forbidden source.

**The same threat wording means the same threat on every tank** (D29). "A high amount of threat"
on a bear's or a paladin's ability is the bonus the warrior's abilities with those words carry,
used as is, never rescaled (D37). The wording table in
[threat.md](mechanics/threat.md) maps each phrase to its value.

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

- `src/data/**/*.json` is a **generated snapshot** of the Forever and Classic Era client
  files, written by `scripts/scrape/*.mjs`. Hand-authored scraper inputs, such as the curated
  pre-raid BiS list, live next to the scrapers and cite their sources. Never hand-edit the
  output. Re-run the scrapers (`npm run scrape`) and review the diff; for a new build,
  `npm run scrape -- --version=<build> --diff` also reports what changed against the
  committed data ([data/README.md](data/README.md#refreshing)).
- Every dataset has a `meta` envelope recording its source URL, scrape time, client builds
  and the files it read. The beta changes weekly, so always know which build a number came
  from.
- Corrections to scraped data (a mis-rendered tooltip, a value measured in-game) go in
  an explicit, documented override layer in the engine, each with a reason and a source.
  They never go in the JSON.
- Scrapers call only wago.tools' documented API (tier 1 above) and GitHub for WoWDBDefs, run
  sequentially with delays, and cache raw responses under `.cache/client/`. From a warm
  cache they regenerate every dataset byte for byte with no requests.
- Items with no row in the Forever client fall back to their Classic Era stats and are
  flagged in the UI
  ([D6](decisions.md#d6-items-with-no-forever-data-use-classic-era-stats-flagged-2026-09-22-confirmed-by-the-guild),
  [items.md](data/items.md#items-with-no-forever-data-d6)).

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
theoretical maximum. The exception is the rotation: it's the best one we've found that a real
player can execute (D23). The defaults are:

- the talent build is the spec's documented default in its class doc, a build a typical
  raider runs. The defaults began as the most popular Forever builds in September 2026. It suits
  the spec's role as its players actually play it: a tank talents for the balanced approach,
  threat and damage with the mitigation that matters, like the Balanced rotation
  ([D28](decisions.md#d28-three-tank-rotations-defensive-balanced-and-max-tps-2026-09-24)),
  never for pure defense
- the gear is **real pre-raid BiS for the spec**, the set its players would wear, **geared for
  what the spec measures** (D29): its
  headline metric (TPS for tanks, DPS otherwise), using the stats its damage and threat scale
  with, checked against the sim's stat weights. A Protection paladin's Holy threat scales with
  spell power, so its set leans to spell damage. Pre-raid guides
  ([D11](decisions.md#d11-known-pre-raid-bis-items-are-always-in-the-pool-2026-09-22)) supply
  candidates; their survival picks (resistances, defense, stamina) don't make a preset. The
  tanks' sets are like for like: the same phase and item level range, all built for threat. No
  preset item may have lost its stats: an armor-only item is a data bug until shown otherwise
- raid buffs for a typical raid composition, and common consumables. Buffs are keyed to
  composition, not faction: both factions have paladins and shamans in Forever
- never world buffs (they don't exist in Forever raids, see §1)
- the best-performing rotation we've found that a real player can execute. When we find a
  better one, it becomes the default, without asking first
  ([D23](decisions.md#d23-the-default-rotation-is-the-best-one-weve-found-2026-09-23)). Specs
  added under [D27](decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)
  start from the common priority with a quick first-pass search, until the tuning milestone

The default for each setting is documented in the class doc that owns it.

## 6. Review gate (before every push)

Nothing is pushed until every change since the last push has passed an **adversarial logic
review** and an **adversarial UX review** by an independent reviewer, not the author. Every
finding is fixed or waived with a written reason, and the log is committed as
`docs/reviews/<YYYY-MM-DD>-<topic>.md`.
- **Fixes get one verification pass** by a fresh reviewer, scoped to the fix commits: it
  confirms the fixes and looks for regressions they introduced. New work always gets the full
  reviews.
- **Each finding says whether the change introduced it.** A pre-existing low finding that
  breaks no promise the docs make may go to the [known gaps](known-gaps.md) instead of being
  fixed then.
- **An area that draws new findings two rounds running** is simplified, not patched again
  ([D20](decisions.md#d20-review-new-work-in-full-verify-the-fixes-2026-09-23)).
- **New specs until the tuning milestone** get one combined logic and UX review; high and
  medium findings are fixed, lows go to the [known gaps](known-gaps.md), and only engine fixes get a
  verification pass ([D27](decisions.md#d27-land-every-dps-spec-first-in-a-9010-mode-tune-later-2026-09-24)).

- **Plausibility is part of the logic review** (D29). A reviewer compares the headline with
  the other specs and with what the class's players expect. An outlier, such as a tank below
  most DPS specs' threat or one tank at twice another, is a finding until a cited mechanic
  explains it or a sourced correction removes it; "every formula matches its doc" doesn't close
  it. What neither closes becomes an open question: a gap is never a reason to move a value
  ([D37](decisions.md#d37-only-sourced-values-2026-09-26)). A gear preset gets the same
  scrutiny: stat weights, and each slot against the pool's best.
- **Invented values are findings** (D37). Any multiplier, ratio, scaling or fitted term that no
  allowed source gives, and any undescribed client dummy given a meaning by analogy, is a
  finding however plausible the result it produces.

The procedure and checklists are in
[CLAUDE.md](../CLAUDE.md#core-doctrine-adversarial-review-before-every-push) and
[ux.md](ux.md#ux-review-checklist).

## 7. Change management

- The beta client changes. When wago.tools lists a new `wow_classic_beta` build, re-scrape
  with `npm run scrape -- --version=<build> --diff`, review the diffs, and update any doc
  whose numbers moved (bump the build in its status line).
- Milestones live in [milestones.md](milestones.md), and the known gaps in
  [known-gaps.md](known-gaps.md). Significant decisions go in
  [decisions.md](decisions.md) with a date and the reasoning.
