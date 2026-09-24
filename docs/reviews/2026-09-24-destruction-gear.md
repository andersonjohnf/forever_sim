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
