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
