# Destruction's sim-ranked gear (2026-09-24)

The change gave Destruction its own pre-raid list, ranked by the sim, in place of Wowhead's one Shadow
list for every warlock (GitHub issue #16; `e35b2abb`, `5812c214`). A fresh reviewer did the combined
logic and UX review (D27), with a paired same-seed harness of its own (`.cache/probes/destro-review/`
in its worktree). This log records its findings and the fix round that answered them.

Range: `f8229a77..5812c214` (review); fixes `44865242..` (this log's commit ends them).
Reviewers: logic and UX together: a fresh reviewer who wrote neither commit. The fix round by its own
agent. The fixes change data and docs, not engine logic, so under D27 they need no verification pass;
the new `kept` section in the item scraper is the one code change a reviewer may want to see.

**The reviewer's confirmed numbers** (paired, 20,000 fights on seed 2701): Destruction's default
opened at 586.0 DPS on its new list, and Demonology's at 534.2 on the guide's. On the same gear,
Demonology deals 663.7, 13% ahead. Affliction and Demonology each gain about 24% on Destruction's
set, and Mindfang alone is worth +41 to +50 to them. Mindfang or Sageclaw would add 8.9% to the Frost
mage, 8.1% to the Arcane mage and 7.0% to the Shadow Priest, whose lists never put them in a Troll's
hand; the Fire mage, Balance and Elemental already wear one. The Dreadgear figures reproduce as 4
pieces −20 to −31 DPS in the finished set, not the note's "−4 to −42".

**After the fixes** (20,000 fights on seed 2701):

| Spec | Before | After | Change |
| --- | --: | --: | --: |
| Destruction | 586.0 | 586.0 | list only: event items out, Ironbark Staff in, neither worn |
| Affliction | 402.0 | **502.5** | +25.0% |
| Demonology | 534.2 | **663.7** | +24.2% |
| Frost mage | 410.9 | **447.3** | +8.9% |
| Arcane mage | 402.2 | **434.8** | +8.1% |
| Shadow Priest | 523.3 | **559.7** | +7.0% |

Every other spec's default is unchanged (Fire mage 515.5, Elemental 368.6, Balance 426.1: their
Horde defaults already wore Mindfang).

Checks after the fixes: lint ✓ · typecheck ✓ · `npm test` ✓ (113 files, 2556 tests) ·
`npm run scrape:check` ✓ (zero requests) · e2e: the warlock, mage, priest and Demonology specs ✓ (updated for the new defaults in `3e8e4b0e`)
(27), and the whole suite 410 of 411, the one failure `results-states` "a run whose worker stops
answering", a fake-clock test that passes alone (twice) and that this change doesn't touch.

## Findings

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DG-1 | medium | introduced | Affliction and Demonology kept the guide's list, so the change put Destruction's default (586.0) above Demonology's (534.2), the reverse of warlock.md §6.3 and §11.6's order, though on the same gear Demonology leads by 13%. | fixed in `44865242`: both are ranked with Destruction's method (the same candidates and rules, the paired slot-by-slot search, alternatives ranked in the finished set, close calls on a 40,000-fight direct pair, the guide's pick keeping its place on a tie). Affliction 402.0 → 502.5, Demonology 534.2 → 663.7; the order Demonology > Destruction > Affliction holds. warlock.md §7.3 has each spec's swaps and the defaults table; goldens updated with history notes, and a test that each list beats the guide's by over 20%. The five items only the guide's list brought into the pool stay in it through a new `kept` section, so saved setups and share links keep them |
| DG-2 | medium | pre-existing | Frost, Arcane and Shadow never put Mindfang or Sageclaw in a Troll's hand (Frost and Arcane list only Sageclaw, the Alliance's; Shadow lists neither): +8.9%, +8.1% and +7.0% left on the table. | fixed in `48f1e02d`: Mindfang is Sageclaw's twin on the Frost and Arcane lists; Mindfang and Sageclaw take the Shadow list's rank 1, its guide picks moving to 2 and 3. The Fire mage's and Elemental's lists get the Sageclaw twin they lacked (an Alliance mage, a Dwarf shaman). The full sim ranking for the three would add 3 to 7% more (Frost 461.4, Arcane 464.3, Shadow 582.4 from the same search) but needs its new candidates' sources checked first: a known gap in the milestones |
| DG-3 | low | introduced | Mindfang's +94 is the derived caster-weapon rule's estimate, fitted on Rare weapons; Mindfang is Epic. The docs stated it as fact. | fixed in `44865242`, `48f1e02d`: tagged `[?]` in warlock.md §7.3 (twice), mage.md and priest.md; client.md's caster-weapon section says the Epic figure is an extrapolation, and its open questions gain "Epic caster weapons' spell power" with a guild tooltip check of Mindfang, Sageclaw or Ironbark Staff |
| DG-4 | low | introduced | Ironbark Staff (League of Arathor Exalted, +94 spell power, 2% spell crit) wasn't a candidate for an Alliance warlock; the note said Whiteout Staff "would lead the two-handers". | fixed in `44865242`: Ironbark Staff is two-hand rank 1 on all three warlock lists (paired, a Human: −12.9 / −13.9 / −11.9 DPS against the dagger and off hand; Lord Valthalak's −54.1 / −48.7 / −52.7); the note says Whiteout Staff would lead only a Horde warlock's two-handers |
| DG-5 | low | introduced | The Dreadgear 4- and 6-piece figures ("−4 to −42") didn't reproduce. | fixed in `44865242`: the final set's figures in the note and §7.3 (4 pieces −20 to −31, 5 −30, 6 −42), and each other warlock's |
| DG-6 | low | introduced | Sources written from memory (Mantle of the Timbermaw, Argent Shoulders, the Frostwolf and Stormpike cloth belts, Chains of the Lich, Staff of Balzaphon), and the last two drop only in the Scourge Invasion. | fixed in `44865242`: each note cites its Wowhead Classic item page, as does warlock.md's new [wh-items] source; items.md's Sources says event-only items aren't pre-raid, so the sim-ranked lists leave out the invasion's loot (Chains of the Lich and Staff of Balzaphon leave Destruction's list), and the Fire mage's guide list keeps its Staff of Balzaphon with a note. The links weren't fetched in this round (no network); a reviewer can open them |
| DG-7 | low | introduced | items.md didn't say that crafted items from raid materials (Bloodvine, Flarecore) count as pre-raid. | fixed in `44865242`: one sentence in items.md's Sources |
| DG-8 | low | introduced | Elixir of Fire Power (the only Fire elixir the Forever client links, about +4 DPS for Destruction `[?]`) was called a known gap but wasn't in the milestones. | known gap, this log's commit: in the milestones' known gaps |

## Found in the fix round

- **Items leaving the pool.** Ranking Affliction and Demonology left five items on no list (Deathmist
  Mask, Felcloth Robe and Pants, Band of the Unicorn, Inventor's Focal Sword), and the level rule
  doesn't keep them, so a saved setup or share link wearing one would have lost it on load ("An
  unknown item in the head slot was removed"). The item scraper now reads a `kept` section of
  `pre-raid-bis.json` (`meta.preRaidBis.kept`, typed, and covered by the data tests), which keeps
  them with no rank. Worth a reviewer's look, and worth `main`'s follow-the-defaults tables at merge:
  `main` has a `FORMER_GEAR` table and a frozen snapshot of the old defaults (`follow-defaults.ts`)
  that this branch doesn't; the warlocks' and casters' default gear changed.
- **Other missing faction twins** (known gap): Enhancement's Deathguard's Cloak (whose note names a
  Cape of the Black Baron source) and Knight-Lieutenant's Chain Greaves, and the hunters' Cloak of the
  Honor Guard.

## Verdict

Every finding is fixed or recorded as a known gap. Under D27, a data and docs fix round needs no
verification pass; the lead decides whether the `kept` scraper change and the four new defaults get a
quick check before the push.

## Verification pass (DV2)

A fresh verifier checked the fix round (`44865242..3489055e`) on the 1.60.1.69913 data, with probes of
its own (`.cache/probes/dg-verify/` in the fix round's worktree). Its findings are DV2-1 to DV2-8
below. The fixes were made on the 1.60.1.70009 branch (`build-70009`, with the caster gear work merged
in `49176ca9`), and every figure in this section is measured there unless it says otherwise. On
1.60.1.70009 the fix round's defaults give the same DPS as on 1.60.1.69913: the goldens didn't move,
and 20,000 fights on seed 2701 give Destruction 585.97, Affliction 502.51 and Demonology 663.66.

Fixes: `b87e8e81` (faction twins from the client), `ebe2579f` (the two caster procs), `ab90ff5d` (the
re-ranked slots, docs, goldens), `7a37f511` (an e2e word list).

### Step 6: faction twins come from the client

Two rounds in a row found faction twins wrong in the gear lists: the fix round's own notes named three
missing ones, and this pass found The Defilers' Ironbark Staff (DV2-1). So the mechanism was simplified
rather than patched a third time (CLAUDE.md step 6). **What was cut:** every hand-written twin. The 53
entries in `pre-raid-bis.json` that added "the Alliance counterpart" or "Alliance version" of a listed
item beside it are gone, as are the notes' twin claims ("Alliance only, no Horde twin"),
`INTERIM_GEAR`'s hand-listed second faction's items, and the app's own stat match (`twinKey` in
`faction-gear.ts`). **What replaced it:** the item scraper reads twins from the client. Two items are
twins when their client rows match on everything but their names, their price and what binds them to a
side or class (the reputation they need, the races and classes that may wear them, the faction flags,
the item set, whose bonuses are compared instead), with the same item effects (a use by its cooldowns).
A listed item's twins join the pool and take its list entries; `factionTwin`, a race change and the
interim sets read the same `twins`. It finds 213 pool items with a twin, in 99 groups. The owning doc is
[items.md "Faction twins"](../data/items.md#faction-twins).

The client also says four pairs the lists called twins aren't: the Alliance's Rank 7 to 10 silk has no
item set in Forever's rows (the mage lists now name those pieces on their own, at the Horde piece's
rank); Highlander's Mail Pauldrons and Greaves give a spell-crit 3-piece bonus where the Defilers' give
melee crit (Enhancement names the pauldrons on their own); and Knight-Lieutenant's Chain Greaves, on
Enhancement's list as Blood Guard's Mail Greaves' twin, is the hunter's, with other stats, so it left
that list (a shaman can't wear it).

### Findings

Severities: DV2-1 and DV2-4 as the verifier rated them; the others low, none breaking a promise the
docs make except DV2-6's and DV2-7's sourcing wording, which are fixed.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DV2-1 | medium | introduced | Ironbark Staff 20069 has a Horde twin, 20220 (The Defilers Exalted), whose ItemSparse row is identical but for the faction and price; the lists and warlock.md §7.3 said a Horde warlock can't have it. | fixed in `b87e8e81` by the step-6 simplification above: 20220 joins the pool and takes 20069's rank 1 on the three warlock lists, the Fire mage's and the Elemental shaman's. warlock.md §7.3's Horde two-hander and Whiteout Staff sentences, the lists' notes and `defaults.test.ts` are corrected. Tests: the scraper's `findTwins` cases, every one-faction listed item's twin at the same rank when the client has one, twins paired both ways with the same stats and effects |
| DV2-2 | low | introduced | Demonology §11.2, §11.6 and §11.7 still gave the guide list's figures (534.2, 476.6, +12.1%) as the default's. | fixed in `ab90ff5d`: the guide-list figures are labelled "on the guide's list", and the new default's are measured (675.0; without Q19's reading 605.2; the Succubus build 632.7) |
| DV2-3 | low | pre-existing | Demonology ranks 2nd of the 20 DPS specs, and 42 of its 78-DPS lead over Destruction rests on the Q19 `[?]`, as the bear's lead rests on untested threat. | open plausibility finding in the milestones' known gaps (`ab90ff5d`), remeasured: 2nd of 20 (675.0), 42 of its 77-DPS lead over Destruction (597.9) rests on Q19; without it the default would be the Succubus build, 632.7 |
| DV2-4 | medium | pre-existing | Known item effects modelled as zero (D29): Wrath of Cenarius's spell-damage proc and Draconic Infused Emblem's, worn by the Fire mage's and Elemental's defaults and ranked on the warlock lists; Eye of the Beast's use. | fixed in `ebe2579f`, `ab90ff5d`: both procs modelled from the client ([items.md](../data/items.md#modelled-item-effects)). Draconic Infused Emblem is an equip proc in Forever (1318931, a 100% chance, no cooldown), not Classic Era's 75 s use, so it's up from the first landed spell; the 100% against its tooltip's "chance" is `[?]`, shown in the results' assumptions and a known gap. Eye of the Beast stays known gap E7 (the aura model has no spell-hit buff). The slots they touch are re-ranked (below); items.md and each re-ranked list's note say effects the sim doesn't model count as zero, and the known gaps list them |
| DV2-5 | low | introduced | The item scraper's `kept` section keeps an item a list dropped, but nothing stops an id leaving the pool silently. | fixed in `b87e8e81`: the write path compares the pool with the committed one and fails when an id would leave it, unless it's kept or named in `REMOVED_ITEMS` with a reason (none so far) |
| DV2-6 | low | introduced | The Fire mage's guide list kept the event-only Staff of Balzaphon, and items.md's "left out like a raid drop" rule was worded for caster lists only. | fixed in `b87e8e81`: Staff of Balzaphon leaves the Fire mage's list (Lord Valthalak's Staff moves up; not worn). items.md's Sources say every list leaves event-only items out as it leaves out a raid drop, and the random-suffix rule is worded for every list (a base row with none of the stats the spec's list is for) |
| DV2-7 | low | introduced | The sim-ranked lists' new sources cite the live wowhead.com/classic pages ([wh-items]), which have been rewritten since Season of Mastery. | fixed in `ab90ff5d`: they cite Wayback Machine copies of the pre-Season of Mastery classic.wowhead.com pages, as the guides are cited. There was no network in this round, so each is a year-only timestamp (the copy nearest 2021), marked unchecked in warlock.md's Sources and in the known gaps |
| DV2-8 | low | introduced | The log said "Every other spec's default is unchanged"; eight specs' defaults change for some race. | corrected here: the fix round changed eight specs' defaults for some race: Destruction, Affliction and Demonology (their own lists) and Frost, Arcane and Shadow (Mindfang or Sageclaw) for every race, and the Fire mage and Elemental shaman for an Alliance character (Sageclaw, which their lists lacked). Balance's list named both daggers already |

### The re-ranked slots (DV2-4, and 1.60.1.70009's lost rows)

Spirit of Aquementas, Hardened Stone Band and Tempestria's Frozen Necklace lost their Forever rows in
1.60.1.70009 and use Classic Era stats (the same numbers, bar Hardened Stone Band's Defense now a skill,
not a rating). D29 says no preset item may have lost its stats, so the slots that wear one by default
were ranked again, with the slots the modelled procs touch. The warlocks' sim-ranked lists are ranked
among their candidates as §7.3 describes; the guide lists among their own items (a full search of
those is a known gap). Paired, in each default set, 20,000 fights on seed 2701:

| Spec | Slots re-ranked | New default picks | DPS before → after |
| --- | --- | --- | --: |
| Destruction | trinkets, rings | Draconic Infused Emblem and Royal Seal of Eldre'Thalas (Briarwood Reed third); Wrath of Cenarius third ring | 586.0 → **597.9** |
| Affliction | trinkets (rings checked, unchanged) | Draconic Infused Emblem and Royal Seal | 502.5 → **512.7** |
| Demonology | trinkets (rings checked, unchanged) | Draconic Infused Emblem and Royal Seal | 663.7 → **675.0** |
| Fire mage | rings, trinkets | Flaming Band for Wrath of Cenarius; the trinkets stay | 542.1 → **544.7** |
| Elemental | rings, trinkets, off hand | Wrath of Cenarius and Elemental Focus Band; Draconic Infused Emblem and Royal Seal; Therazane's Touch | 381.7 → **401.1** |
| Shadow Priest | off hand (Spirit of Aquementas) | Tome of Shadow Force | 559.7 → **565.7** |

No warlock list has the three items that lost their rows. Hardened Stone Band is only the Protection
paladin's rank-3 ring (not worn: it wears its interim set), left for the paladin's slice (known gaps).
The "before" figures for the Fire mage and Elemental already model the procs. On the goldens' seed
(1,000 fights on 12345) the procs and the re-rank together move the Fire mage 514.50 → 543.10 and
Elemental 370.30 → 401.07 (TPS 264.16 → 284.89), the Shadow Priest 559.43 → 565.39, Affliction
503.79 → 514.05, Destruction 585.96 → 597.86 and Demonology 664.19 → 675.56. The goldens are
re-snapshotted with history notes.

**Cross-spec order** (the 20 DPS specs' defaults, 20,000 fights on seed 2701): Fury 713.2,
**Demonology 675.0**, Arms 647.2, Retribution 631.6, **Destruction 597.9**, Combat 580.3, Feral 568.2,
**Shadow 565.7**, Beast Mastery 557.1, Enhancement 555.8, **Fire 544.7**, Assassination 524.1,
**Affliction 512.7**, Subtlety 504.7, Marksmanship 501.0, Survival 462.4, Frost 447.3, Arcane 434.8,
Balance 426.1, **Elemental 401.1**. The casters this pass changed gain 1% (Shadow) to 8% (Elemental) on
what they dealt before it; the warlocks' order (Demonology > Destruction > Affliction) holds, and
Elemental stays last, 25 below Balance.

### Found in this pass

- **Draconic Infused Emblem's chance** (`[?]`): the client's 100% makes it the best trinket for every
  caster that ranks it (+9.6 to +14.4 DPS over the next). A known gap with a guild test (its uptime).
- **Elemental Invasion loot**: Elemental's rank-1 belt, Sash of the Windreaver, drops from an
  Elemental Invasion boss; whether that counts as event-only is a known gap, undecided.
- **Off-list items that beat the guide lists' picks**: Elemental Focus Band and Maiden's Circle in the
  Fire mage's rings (+3.2, +2.6), Draconic Infused Emblem in the Shadow Priest's trinkets (+9.6):
  added to the known gap on searching the guide lists.

Checks: lint ✓ · typecheck ✓ · `npm test`: every failure is one the 1.60.1.70009 data brings on its
own, on the branch before these fixes too (26: the talent trees still at 1.60.1.69913, and the engine
constants and client tests awaiting the new build), and none new · `npm run scrape:check` ✓ (zero
requests) · e2e: the whole suite ✓ (462 of 462, the warlock, mage, priest, Demonology and Elemental specs among them).

### Verdict

Every DV2 finding is fixed or recorded as a known gap. This pass changed engine logic (the two item
procs and their assumption) and the step-6 mechanism, so it needs a verification pass of its own,
scoped to `b87e8e81..`: the twin rule, the procs, and the re-ranked defaults.

## Verification pass (GV)

A fresh verifier checked the DV2 fixes (`b87e8e81..`) on the 1.60.1.70009 branch, with probes of its
own (`.cache/probes/gear70009-verify/` in the caster gear worktree). Its findings are GV-1 to GV-11
below. The fixes were made after merging `build-70009` (main, the 1.60.1.70009 data and the talent
migration) and the caster gear branch (`a9a08bdc`: main's hand-written Sageclaw and Mindfang entries,
EM-6, gave way to the derived twins). Every figure is 20,000 fights on seed 2701 unless it says
otherwise.

Fixes: `0ddbbb58` (the two tiers of twin, GV-1, GV-2, GV-10, GV-11), `e9a2cb70` (the re-ranks and the
docs, GV-3 to GV-9).

### Step 6: two tiers of twin

This was the third round in a row with faction-twin problems (the fix round's missing twins, DV2-1's
Ironbark Staff, and now GV-1), so the mechanism was **narrowed rather than patched** (CLAUDE.md step 6;
decided by the lead). DV2's client-exact twins (set bonuses must match) had become the race change's
match too, and lost 138 swaps the app made before: every Rank 7 to 10 leather, satin and silk piece
(the Alliance's have no item set in Forever's rows) and the Highlander's and Defiler's mail (other set
bonuses). **What was cut:** the race change's use of the list twins. **What each tier now uses:**

- **List ranks** keep the exact client twins (`twins`): a twin takes a list's rank only when its set
  bonuses match, since a piece without its set isn't worth the same (GV-4 shows by how much).
- **Race changes** get their own match (`statTwins`): the same client key with the set's bonuses left
  out, which the scraper writes beside `twins`. `raceChangeTwin` takes the exact twin first, else the
  stat twin, and the notice says when the set bonus differs ("…, with the same stats but not the same
  set bonus"). That's the match the app made before step 6, read from the client: over the pool it gives
  the old match's piece for 768 of its 774 (item, class) swaps, a different one for 4 (Defiler's Mail
  Greaves now takes its exact twin, Highlander's Chain Greaves), and drops 2 (below).

The owning doc is [items.md "Faction twins"](../data/items.md#faction-twins).

### Findings

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| GV-1 | unrated in the fix brief (it drove the step-6 narrowing) | introduced | The race change used DV2's client-exact twins and lost 138 swaps: the Rank 7 to 10 leather, satin and silk, the Highlander's and Defiler's mail. Repros: a Combat rogue (Orc) with 23257 and 22864 going Human kept both; a Shadow Priest's 23288 going Horde; Enhancement's 20203 going Dwarf. | fixed in `0ddbbb58` by the step-6 narrowing above. Tests: the three repros swap (to 23312 and 23284, 22869, 20056) with `setDiffers`; stat twins contain every twin and pair both ways with the same stats and effects; the notice's set-bonus line (unit and e2e) |
| GV-2 | medium | introduced | `PriceRandomValue` (the vendor price's random part) wasn't a free column, so Forever's "Premier" PvP pairs and its Theramore and Darkspear rewards weren't twins. | fixed in `0ddbbb58`: 433 pool items have a twin, in 207 groups (213 in 99 before); Seal of the Expedition / Darkspear Warding Pendant and Theramore Signet / Insurgent's Band pair. items.md's counts updated. Test: `twinKey` lets the price's random part differ. None of them is on a list, so no default moves |
| GV-3 | medium | introduced | With Draconic Infused Emblem modelled, Balance's list still ranked it third, behind Eye of the Beast (the Emblem +16.1 over it). | fixed in `e9a2cb70`: Balance's trinkets re-ranked among the list's own items: Emblem, Briarwood Reed, Eye of the Beast; 426.1 → **442.2** (a Night Elf 443.5). druid.md, the note and the golden updated. Frost's and Arcane's off-list Emblem (+10.8, +9.1 in a Troll's second trinket) join Shadow's in the known gap on searching the guide lists |
| GV-4 | medium | introduced | D29: the Alliance's Rank 7 to 10 silk was listed "at the Horde piece's rank", but without the 2-piece set bonus it loses to alternatives: Fire hands, Inferno Gloves +7.05 over Knight-Lieutenant's Silk Handwraps; Frost and Arcane head, Spellweaver's Turban +6.25 and +5.73 over Lieutenant Commander's Silk Cowl. | fixed in `e9a2cb70`: each Alliance piece ranked on its own by paired runs in a Human's default set. Fire: the handwraps fall to rank 4, so a Human wears Inferno Gloves (538.2 → **545.2**); the mantle keeps rank 1, the cowl 2, the legguards 3. Frost and Arcane: the Turban beats the Horde cowl too (a Troll +5.7, set bonus counted), so the head is re-ranked among the list's own items: Turban, then both cowls, then Sorcerer's Crown. Troll 447.3 → **453.0** (Frost), 434.8 → **440.5** (Arcane); Human 435.6 → **441.9**, 427.1 → **432.8**. The Alliance walkers keep rank 1, and the legguards tie Skyshroud Leggings within the interval (+0.3 Frost, −0.1 Arcane for Skyshroud, 40,000 fights), so the guide's order stands; a known gap says so |
| GV-5 | low | introduced | Draconic Infused Emblem's 100% reading was stated one-sidedly, its range was off (+9.6 to +14.4), and its break-even wasn't given. | fixed in `e9a2cb70`: items.md "Modelled item effects" argues both readings (the client's proc row against the tooltip's "chance"; Classic Era's use averaged +20) and the known gap gives the lead, +9.7 (Elemental, after GV-6) to +11.9 (Destruction) over the next trinket (Balance +16.1 over Eye of the Beast), and the break-even: about 12% for Destruction, the Fire mage and Elemental, 17% for Affliction and Demonology (paired at 5 to 100%) |
| GV-6 | low | pre-existing | Sash of the Windreaver, Elemental's rank-1 belt, is Elemental Invasion loot, which the event-only rule didn't name. | fixed in `e9a2cb70`: items.md "Sources" says loot from a boss that appears only during a world event or an invasion is event-only. The sash leaves Elemental's list (Ban'thok Sash moves up: 401.1 → **400.9**, within the interval), and by the same rule Hardened Stone Band (Avalanchion's) leaves the Protection paladin's (rank 3, not worn); both stay in the pool as kept items. Elemental's mana worked example (4,975 mana, Spirit 188) and its tests follow the belt |
| GV-7 | low | introduced | The year-only archive links (`/web/2021/`) resolve to the copy nearest the start of 2021, not mid-2021. | fixed in `e9a2cb70`: `/web/20210601000000/` in warlock.md and the lists' notes; the known gap (the copies' dates are unchecked, no network) stays |
| GV-8 | low | pre-existing | shaman.md E8 said a Dwarf takes "about 15% less". | fixed in `e9a2cb70`: a Dwarf measures **387.5** against an Orc's 400.9, −3.3% (after GV-6; the verifier's 387.4 and 400.9 were before it) |
| GV-9 | low | pre-existing | Enhancement's rank-1 cloak, Deathguard's Cloak (20068), had a Baron Rivendare source note; it's The Defilers' Exalted reward. | fixed in `e9a2cb70`: its note, and the hunters' Cloak of the Honor Guard's ("League of Arathor / The Defilers"), name their one faction; the known gap that doubted its id goes |
| GV-10 | low | introduced | items.md didn't say that twins include class twins (one side's pieces for different classes) and quest twins (a quest's reward choices). | fixed in `0ddbbb58`: "Faction twins" says so, with examples, and that the app picks among them by faction and class |
| GV-11 | low | introduced | The pool-leaving check (DV2-5) was inline in `items-client.mjs`, untested. | fixed in `0ddbbb58`: `itemsLeavingPool` in `lib/item-pool.mjs`, with a unit test |

### Found in this pass

- **The hunters' Rank 10 chain helms** (a known gap, low): Lieutenant Commander's Chain Helmet has a
  Forever row and Champion's Chain Headguard only Classic Era's, and a Forever row never matches a
  Classic Era one, so they no longer swap as the app's old match did. The one such pair among the
  pool's 774 old swaps; the notice says the helm is kept.
- **Main's EM-6 twin entries at merge**: main had added Sageclaw and Mindfang by hand beside each
  other on the Elemental, Fire, Frost and Arcane lists; the merge drops them (the derived twins give the
  same ranks) and keeps main's corrected item notes (PQ2).

**The caster defaults after these fixes** (20,000 fights on seed 2701, the default race first):

| Spec | Default race | Alliance / Horde |
| --- | --: | --: |
| Destruction | Orc 597.9 | Human 592.4 |
| Affliction | Orc 512.7 | Human 506.8 |
| Demonology | Orc 675.0 | Human 668.3 |
| Fire mage | Troll 544.7 | Human **545.2** |
| Frost mage | Troll **453.0** | Human **441.9** |
| Arcane mage | Troll **440.5** | Human **432.8** |
| Shadow Priest | Troll 565.7 | Human 566.1 |
| Elemental | Orc **400.9** | Dwarf **387.5** |
| Balance | Tauren **442.2** | Night Elf **443.5** |

Bold: moved by this round. The cross-spec order holds: Elemental stays the lowest DPS default, Balance
moves level with the Arcane mage, and the warlocks' order is unchanged.

Checks: lint ✓ · typecheck ✓ · `npm test`: 24 failures, all in the 1.60.1.70009 engine and client
tests awaiting the new build (the paladin, bear, warrior, Eureka!, Balance-spell and shaman-data client
tests and the paladin goldens), each failing already at the merge commit `a9a08bdc` before these fixes,
none new · `npm run scrape:check` ✓ (zero requests) · e2e: the
warlock, mage, priest, Demonology, Elemental, shaman, Balance, setup-character, gear-rules,
setup-defaults and follow-defaults specs ✓ (71).

### Verdict

Every GV finding is fixed or recorded as a known gap. GV-1's fix changed the race change's logic and
the scraper's twin output, and GV-3, GV-4 and GV-6 moved defaults, so a verification pass scoped to
`0ddbbb58..` should confirm them: the two tiers, the notice, and the re-ranked slots.

## Verification pass (GC)

A fresh verifier checked the GV fixes (`0ddbbb58..`) on the integrated 1.60.1.70009 branch, with the
caster verification's probes (the race change's round trip over the pool, set splits, and the Frenzy
potion at other fight lengths). It found nothing at medium or worse; six lows, dispositions below.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| GC-1 | low (breaks ux.md "Character") | introduced (step 6) | The Defiler's Fortitude split on a race change: a Horde Enhancement shaman wearing 20203, 20195 and 20199 who went Dwarf got the greaves as Highlander's Chain Greaves (20050, The Highlander's Determination, their exact twin), the other two as The Highlander's Fortitude (set 470). The way back gave Defiler's Chain Greaves (20154), so the 3/3 bonus was lost silently. | fixed in `10963c67`: `raceChangeTwin` ranks the stat twins by the set name that ends the same way, then the exact twin, the item name that ends the same way, and the lower id; `setDiffers` is "not an exact twin". Over the pool only the four 20199 swaps (warrior, paladin, hunter, shaman) change, to 20051 with `setDiffers`, and no (item, class) round trip is asymmetric (8 were). items.md "Two tiers" says why the set comes first. Tests: 20199 ↔ 20051 for each mail class; the 3/3 set through `changeRace` and back; a round trip over every faction-bound item each class can wear |
| GC-2 | low | introduced (step 6) | The count read "768 of the old match's 770"; it's 768 of 774 (768 same, 4 different, 2 dropped). | fixed: this log's step-6 text and the helms note say 774. items.md, rewritten in `10963c67`, gives the count after GC-1: the same piece for 772 of 774, 768 before GC-1, and the 2 dropped helms |
| GC-3 | low | introduced (MC-3) | §6.3's Frenzy potion choice for Enhancement, Marksmanship and Survival holds only at a 3 min fight; at 5 min the Major Mana Potion wins, and "it never runs short" is wrong. | fixed in `e9663c28`: the table says it's measured at the default 3 min fight, and a paragraph gives the 5 min flip (seed 12345, 20,000 paired fights): Enhancement −0.85%, Marksmanship −2.41%, Survival −3.37% with the Frenzy potion. The presets stay, as the default fight is 3 min. shaman.md's Consumables row repeats "it never runs short"; it's a class doc, left to the class-doc figure pass |
| GC-4 | low | introduced (MC-5) | Q36 recorded that the client flags Deep Wound's tick "ignore caster damage modifiers", yet the results' `deepWounds` assumption didn't say the sim applies them. | fixed in `79257a1c`: the assumption says Death Wish, Enrage and Two-Handed Weapon Specialization raise its ticks though the Forever client flags the tick to ignore them; its comment cites warrior.md §2.5 and Q36. No engine change |
| GC-5 | low | pre-existing | character-stats.md's racial table said Eureka!'s "cut rounded down"; the engine rounds the reduced cost. | fixed in `909845b6`: "the cost rounded down" |
| GC-6 | low | introduced | Class-doc headline figures (owned by the class-doc figure pass). | refreshed in the class-doc figure pass |

Checks: lint ✓ · typecheck ✓ · `npm test` ✓ (3,011) · e2e: setup-character, gear-rules and shaman
specs ✓ (16).

### Verdict (GC)

Every GC finding has a disposition. GC-1 changed the race change's logic, so a quick fresh check of
`10963c67` should confirm it: the pool's round trips and the swap notice for the Fortitude set.
