# Review: Sourced values (M5.668/M5.669) (2026-09-26)

Scope: the values audit (D37/D38) across seven slices, each on its own worktree branch, each reviewed
by a fresh logic reviewer and a fresh UX reviewer against docs/doctrine.md and the owning
mechanics/class docs, with a verification pass (or several) on each fix round, per CLAUDE.md's gate.

- **Slice A** — rules (D37/D38: the fallback order, other-sims wording, rogue AP-share relabel,
  Coming soon). Branch `worktree-agent-a0e61e66ca58de28a`. Merged as 91f08d07 (with follow-on
  fixes 7ef9ff1e, ad060826 on main).
- **Slice B1** — warrior threat (Shield Slam +254, Sunder Armor 206 flat, boss parry). Branch
  `worktree-agent-abb03b238fd604c5e`. Merged as d659aa3f.
- **Slice B2** — AP terms and procs (Rend, Serpent Sting crits, Unbridled Wrath, off-hand rage,
  Revenge/shot-scaling rows). Branch `worktree-agent-aeb1ca635b671388b`. Merged as 826ef23a.
- **Slice C** — bear (Lacerate flat, Primal Bite, bear white rage, raid Thorns spell damage,
  preset guard). Branch `worktree-agent-affa9f6e97e23ca17`. Merged as dfbd6ab6.
- **Slice D** — paladin beta-log check (Seal of Righteousness, Seal of Fury absorb, Judgement of
  the Crusader/Command, Hammer of the Righteous, Holy Strike). Branch
  `worktree-agent-a8e9b5f72544ce380`. Merged as 3902037d.
- **Slice E** — casters/setup (Earth Shock ×2, Whiteout Staff, Classic-sourced caster spell power,
  Demonology default, Maelstrom Weapon, race-change off-hand handling). Branch
  `worktree-agent-afeb9b45a86d35a85`. Merged as fa57b2b3.
- **Slice F** — Dungeon Set 2 pieces restricted to their class, removal notices (links, codes,
  saved setups, autosave), bear head Shadowcraft Cap for Darkmantle Cap. Branch
  `worktree-agent-a4a77102629cc7e1b`. Merged as 40c8a9fd.

Each review's own file is under the scratchpad (`reviews/<slice>-{logic,ux,verify*}.md`); commit
hashes below are read from `git log --oneline` on main and matched to the ids each commit's
subject names.

## Slice A — rules (D37/D38)

### Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| AL-1 | high | introduced (relabel exposes it) | Rogue's shipped AP shares (Eviscerate 4%, Rupture 1/2/3%, poisons) rest on one player's unreplicated Discord test, which four doctrine/D22 rules forbid as a default. | Dispositioned to the user: recorded as an open doctrine conflict in rogue.md Q3/Q16, kept as is (no value changed). |
| AL-2 | medium | introduced | "The user's own in-game tests" was silently widened to "the user or guild members" in several docs. | Partly: kept "the user or guild members" wording but aligned D37's phrasing across builder.md/milestones.md. |
| AL-3 | medium | introduced | Doctrine had no rule for a described effect with no allowed-source value at all (old "reasoned estimate" removed, no replacement). | Fixed: doctrine §2 gets a fallback (closest similar known value, else zero, never reasoned). |
| AL-4 | medium | introduced | §2 let other sims set values, contradicting the new "other sims are never authoritative" rule. | Fixed: sims can corroborate/point to a source, never set one alone. |
| AL-5 | medium | introduced (D37 makes it non-compliant) | Deep Wounds "rolls" rests on WarriorSim's SoD code; no M5.669 slice re-checks it. | Fixed: scheduled as M5.669 B3 (e916b95d, after AV-2 flagged it going to known gaps instead). |
| AL-6 | medium | introduced | Coming soon claimed Forever gives Shield Slam's threat; it's actually Classic Era's [C]. | Fixed: roadmap wording corrected. |
| AL-7 | low | introduced | Tagging rule conflicted with keeping [C]/[F] tags on tier 1–3 values. | Fixed: only a stand-in value is [?]. |
| AL-8 | low | pre-existing (in scope) | Leftover "guild"/"guild test" wording implying organized guild testing that isn't coming. | Fixed (one instance missed, see AV-6). |
| AL-9 | low | introduced (missed relabel) | subtlety.test.ts still tagged Deadly Poison's share [F]. | Fixed. |
| AL-10 | low | introduced | AP-share assumption row didn't show for every plan using Eviscerate/Rupture without the qualifying talents. | Fixed: row added whenever the plan uses a share-bearing finisher. |
| AL-11 | low | introduced | "M6 after M5.7" user decision recorded only in milestones.md, not D30. | Fixed: D30 amendment + roadmap order test. |
| AL-12 | low | introduced | User's Holy Strike test unit ("27 threat") likely meant damage. | Fixed: reworded "27 damage". |

### UX review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| AU-1 | low | introduced | Poison AP-share text implied Instant Poison was also measured on Deadly Poison V, and didn't flag it as unrepeated. | Fixed. |
| AU-2 | low | introduced | Finisher-talents text mixed plural "tests" with singular "the test's numbers", contradicting "Untested." | Fixed. |
| AU-3 | low | introduced | First Coming-soon bullet ran 4 lines at 390px, used doctrine jargon and "Classic" not "Classic Era". | Fixed. |
| AU-4 | low | introduced | Coming-soon bullets didn't say whose spec they touched; one mislabelled Enhancement/druid changes as "Casters'". | Fixed. |

### Verification pass 1 (fix round 7a4bdfe5..8a318421 area / rogue relabel)

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| AV-1 | medium | introduced | The "other sims never set a value alone" rule still contradicted the new "kept for want of anything better" fallback and Maul ×1.75. | Fixed: one five-step fallback order (bb3dc30c). |
| AV-2 | medium | introduced | AL-5 (Deep Wounds) went to known-gaps instead of being fixed/waived, breaking gate step 4 (it's a ~14% DPS swing). | Fixed: scheduled as M5.669 B3 (e916b95d). |
| AV-3 | low | introduced | `rogueFinisherAp` text always named Rupture, even on plans that don't use it. | Fixed: per-plan text (51608ed0). |
| AV-4 | low | pre-existing, breaks doc | `classicEra` kept the Forever player's AP shares, contradicting "classicEra swaps in Classic Era's own values". | Fixed (51608ed0). |
| AV-5 | low | introduced | Coming-soon overpromised "the bear's preset gets a new helm" ahead of slice F's result. | Fixed: reworded (1a654848). |
| AV-6 | low | pre-existing | One "guild confirms the content" pointer (buffs-debuffs-consumables.md) missed AL-8's sweep. | Fixed (1a654848). |

### Verification pass 2 (fix round bb3dc30c, 51608ed0, e916b95d, 1a654848, 6870896f)

**Gate step 6 triggered:** three rounds running found new problems in the fallback/other-sims
wording (AL-2/3/4/7 → AV-1 → AV2-2/3/4). Simplified per CLAUDE.md step 6: doctrine §2's numbered
fallback order became the **one canonical statement**; every other doc (CLAUDE.md, builder.md,
reviewer.md, README, D22/D24/D29/D37, the milestones intro) now points to it in one line rather
than paraphrasing it, with a verbatim one-liner in CLAUDE.md/builder.md guarded by a unit test
(`src/app/fallback-order.test.ts`). Recorded here and in doctrine.md/CLAUDE.md itself (5aa5db2e).

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| AV2-1 | medium | introduced (6870896f) | Coming soon/milestones put H and I (unrelated audit-fix work) inside the "Next update" group, ballooning it to 19 bullets. | Fixed: new milestone M5.671 "Audit fixes"; boss melee split into its own slice J (d9dd0242). |
| AV2-2 | medium | introduced (bb3dc30c) | Doctrine §6/reviewer.md/D29/milestones still defined "invented"/"default" as allowed-source-only, contradicting the step-4 sim fallback (Maul, Felstriker, rogue shares would all be findings). | Fixed: gate step 6 rewrite (5aa5db2e). |
| AV2-3 | low | introduced (bb3dc30c) | D22's "single-tester fits can't override an allowed value" read as if a fit *could* set a non-allowed default. | Fixed (5aa5db2e). |
| AV2-4 | low | pre-existing | D24's 1.12 emulator stand-in had no place in the fallback order (would literally fall to zero). | Fixed: named as the order's one exception (5aa5db2e). |
| AV2-5 | low | introduced (6870896f) | D38 missing owning-doc links on 5 items; two items dropped part of the user's call. | Fixed (d9dd0242). |
| AV2-6 | low | introduced (6870896f) | D38's intro implied the user confirmed the exact 5-step order/ranking, which the ledger doesn't show. | Fixed: reworded as the lead's synthesis (5aa5db2e). |
| AV2-7 | low | introduced (6870896f) | Coming-soon copy: named Ragnaros (not yet planned), dropped HotR's "3×", contradicted the fallback steps. | Fixed (d9dd0242). |
| AV2-8 | low | pre-existing | `rogueFinisherTalents` always named Rupture/Serrated Blades even on plans without Rupture. | Fixed (f5b8dbcb, 24b899a2). |
| AV2-9 | low | introduced (51608ed0) | `classicEra` two-finisher sentence used singular "is the share" for a plural subject. | Fixed (f5b8dbcb; still incomplete — see AV3-2). |
| AV2-10 | low | pre-existing | warrior.md's Fury gap cited a "guild test" that isn't planned. | Fixed (8f124804). |

### Verification pass 3 (gate step 6 wording pass; fix round 5aa5db2e, d9dd0242, f5b8dbcb, 8f124804, 24b899a2)

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| AV3-1 | medium | introduced (d9dd0242) | Splitting boss melee into slice J silently dropped Ragnaros from the user's "Golemagg and Ragnaros" call; no milestone scheduled it. | Fixed: user's call restated as Golemagg in this build (ad060826); Ragnaros not scheduled — resolved by the user's own scoping. |
| AV3-2 | low | introduced (f5b8dbcb, incomplete AV2-9 fix) | Two-finisher `classicEra` sentence still ended with singular "doesn't give it". | Fixed (7ef9ff1e). |
| AV3-3 | low | introduced (d9dd0242) | M5.669 intro said "ships A to F and J" but omitted slice D (paladin) from the list. | Fixed (ad060826). |
| AV3-4 | low | introduced (d9dd0242) | Coming-soon "Audit fixes" title named an internal process; overstated gear-preset scope; omitted the hunter melee-only crit change. | Fixed (7ef9ff1e). |
| AV3-5 | low | pre-existing (8d1845dc) | D29's body still had pre-D37 "reasoned estimate"/"closest allowed analog" language under its amended header. | Fixed (ad060826). |
| AV3-6 | low | pre-existing | Stale "reasoned estimate" label on Thorns' healer spell damage. | Fixed: closed by slice C's Thorns-313 merge (dfbd6ab6/3d3432d0). |
| AV3-7 | low | pre-existing | Two smaller wording clashes with the fallback order (CLAUDE.md step 2's "zero" plausibility wording; "closest analog" called "invented"). | Fixed (ad060826). |

## Slice B1 — warrior threat

### Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| B1L-1 | low | introduced | Shield Slam's Forever 254 tagged [C] instead of [?] (it stands in for an unknown Forever value); "very high" extra and Sunder's AP term left untagged. | Fixed (7a4bdfe5), with 2 leftover instances — see B1V-1. |
| B1L-2 | low | introduced | Percentage deltas worded against the wrong baseline (loss vs gain swapped). | Fixed (b9a88e9c). |
| B1L-3 | low | introduced | Method/sample misdescribed ("threat-API test series" vs. an aggro-rip threshold series); thin Heroic Strike sample overstated. | Fixed (10b45a2e), with a citation gap — see B1V-2. |
| B1L-4 | low | introduced (cross-slice) | threat.md claimed Lacerate follows Sunder, but the doc/code disagreed with each other and with slice C's flat-206 Lacerate. | Fixed for the comment part (7edaf139); resolved fully once slice C merged. |
| B1L-5 | low | introduced | Stale +475/0.05×AP values left as current in optimizer.md and D26; no changelog bullet for the re-snapshot. | Fixed (2c78db8d). |
| B1L-6 | low | introduced | D28's tank checkpoint wasn't updated after the warrior's −7.6% TPS move. | Fixed (d0fc3f3c). |
| B1L-7 | low | introduced | Boss-parry "beta logs read nearer 14%, from the front" stated too firmly; no reproducible write-up for the front-only filter. | Fixed: front-filter called unverified, "about 2.5%" (eb73f0b8). |

### Verification pass (fix round 7a4bdfe5..8a318421)

**Gate passes.** No engine change in the fix round (comments/copy/one test regex only).

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| B1V-1 | low | introduced (7a4bdfe5, incomplete B1L-1 fix) | warrior.md Q34 and protection.test.ts still tagged Shield Slam 254 [C]. | Fixed (16838ceb). |
| B1V-2 | low | pre-existing, exposed by 10b45a2e | Revenge r5's per-ability row cited "(Magey)" while the method note now says the value is Resultsmayvary's. | Fixed (16838ceb). |
| B1V-3 | info | pre-existing (BU-2) | D37 (cited throughout B1's fix commits) doesn't exist on B1's branch yet — merge-order dependency. | Resolved by merge order: slice A (D37/D38, 91f08d07) merged before slice B1 (d659aa3f). |

## Slice B2 — AP terms and procs

### Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| B2L-1 | medium | introduced | Serpent Sting ×2 default rests on a D22 analysis, but hunter.md never named/linked the logs (D22 requires public, named, reproducible logs). | Fixed: hunter.md Sources links every log set + method (7821d57e). |
| B2L-2 | medium | introduced | Several docs/a code comment still claimed Rend's ticks add 0.02×AP after the engine dropped it. | Fixed: 0.02×AP restored as a WarriorSim [?] stand-in, docs and code agree (2549991c). |
| B2L-3 | low | introduced | Advanced-log "level" field mis-cited as the character's level in 4 cases. | Fixed: level claims dropped (7821d57e). |
| B2L-4 | low | introduced | Unbridled Wrath pooling excluded two testers at the wrong assumed rank. | Fixed: re-pooled at 7.2%, CI given (7821d57e). |
| B2L-5 | low | introduced | Heroic Strike/Cleave proc-count disagreed between two doc sections. | Fixed: one count, one window (7821d57e). |
| B2L-6 | low | introduced | Off-hand-rage method rested on an unverified "no hand flag" premise; one log link missing. | Fixed: miss-flag cross-check cited, link added (7821d57e). |
| B2L-7 | low | pre-existing, now measured | Thunder Clap crits at 0.3% in logs vs. 10.4% white-swing rate; engine still rolls the special-attack crit. | Waived to known-gaps: Defensive-only impact, noted as Q33 (7821d57e). |
| B2L-8 | low | introduced | `REND_AP_PER_TICK` config table had no production user (dead code path). | Fixed: no-AP-term test now varies AP mid-fight (2549991c). |
| B2L-9 | low | introduced/pre-existing | Garbled hunter.md sentence; stale ×1.5→×1.65 example; Mortal Shots wrongly implied on specs without it. | Fixed (7821d57e), with a regression — see B2V-2. |
| B2L-10 | info | D29 flag | AP scaling play shows on Rend/Revenge/Thunder Clap/Arcane Shot/Serpent Sting modelled as zero per D37 (no client AP term); flagged in open questions. | No action needed; tracked as B82/B83/B86/B87. |
| B2L-11 | info | merge | Trivial merge conflict with B1 (Sources wording); open-question id collision with the casters branch (E). | Fixed: renumbered to B86/B87 on merge (7821d57e). |

### Verification pass (fix commits 2549991c, 7821d57e)

**Gate passes for the fixes.** One pre-existing medium surfaced and needed fixing under step 4.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| B2V-1 | low | introduced (7821d57e) | New `shotScaling` row gave Marksmanship the base Serpent Sting tick, ignoring Improved Stings 3/3. | Fixed: the shot rows follow the build (6de063ba). |
| B2V-2 | low | introduced (7821d57e, overcorrected B2L-9) | `serpentStingCrits` row said "double" damage for every hunter; Marksmanship's Mortal Shots crits are ×2.3. | Fixed (6de063ba). |
| B2V-3 | **medium** | pre-existing (539f067be, 2026-09-24), newly contradicted | Hunter Rotation help quoted rank 9's Serpent Sting damage (555) instead of the engine's rank 8 (415/498 w/ Improved Stings). | Fixed: the help quotes rank 8 (6de063ba). |
| B2V-4 | low | introduced (7821d57e) / pre-existing | Forever-only rows (Revenge damage, shot scaling, Unbridled Wrath's measured rate, Serpent Sting crits) also showed under the `classicEra` profile, where they don't apply. | Fixed: gated by profile, same pattern as Rend's row (per commit 826ef23a's message "Forever-only rows gated by profile"). |
| B2V-5 | info | merge order | "D37" cited unlinked; not defined on B2's own branch. | Resolved by merge order (slice A merged before B2). |

### Slice B1 + B2 combined UX review (B-ux.md)

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| BU-1 | medium | B2 introduced | Revenge window row stated the base 109–133 as the default tank's damage, ignoring Improved Revenge 3/3 (×1.6). | Fixed: own row, follows Improved Revenge's rank (2549991c/7821d57e). |
| BU-2 | medium | B1 introduced (merge-order) | Bear's Lacerate row and warrior's Sunder row valued the same "high amount of threat" wording differently, breaking CLAUDE.md's same-wording rule; depends on merging D37 and the druid slice first. | Resolved by merge order: A and C merged before B1/B2; wording reconciled in slice C (CU-2). |
| BU-3 | medium | B2 introduced | Rend dance kept on by default for a gain (+0.11%) too small for a default run to show, with its rationale ("gains from AP") removed from the help. | Fixed: help says "adds about 1.4%" after Rend's AP term was restored (2549991c). |
| BU-4 | medium (D29) | B2 introduced | Rend/Revenge/Arcane Shot/Serpent Sting all modelled AP scaling that beta logs show as zero, contradicting D29 "an effect play shows exists gets a default." | Dispositioned by the lead: Rend takes the WarriorSim 0.02 stand-in (step 4); the others stay at step 5 (unmeasured), each row says so. |
| BU-5 | low | B1 introduced | Shield Slam help chained two colons, reading as an internal note. | Fixed (8a318421). |
| BU-6 | low | B1 introduced | "so the sim adds nothing for it" read as Shield Slam getting no threat at all. | Fixed (8a318421). |
| BU-7 | low | pre-existing | Sunder row's "(below)" pointed the wrong way relative to heading order. | Fixed (8a318421). |
| BU-8 | low | B2 introduced | Unbridled Wrath row read the sim's 12% choice as fact; ran 11 lines at 390px. | Fixed: shorter, reader's-spec-only loss (7821d57e). |
| BU-9 | low | B2 introduced | Beta-log phrasing drifted across rows ("from other players", "beta logs", "beta logs of low-level mobs"). | Fixed: one phrase, "low-level beta logs" (7821d57e). |
| BU-10 | low | B2 introduced | Arcane Shot/Serpent Sting scaling sentence appended to the (differently-linked) resist row. | Fixed: own row, own link (7821d57e). |
| BU-11 | info | B1 + B2 | Release entry needs to correct the earlier-pushed "Rend grows with attack power" claim and list both specs' TPS deltas. | For the lead: releases.ts entry at push. |

## Slice C — Feral bear

### Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| CL-1 | medium | introduced | Primal Bite ×1.5 rests on a weaker analog than claimed: Forever's spell (rank 4, level 60) is a reworked, renamed-id version of the SoD spell the hotfix describes, not "the same spell". | Fixed: reverted to ×1 (user decision; the ×1.5 kept as a recorded, declined alternative) (9b6828ed). |
| CL-2 | medium | introduced | Same SoD hotfix applied inconsistently: adopted for Primal Bite's multiplier, declined for Lacerate's own 3.33× analog in favour of the user's flat-206 call. | Dispositioned by the user: flat 206 kept, SoD's 3.33× recorded as weighed and declined (9b6828ed, 3dd90297). |
| CL-3 | low | introduced | paladin.md still stated the old Thorns 200/+15.6 TPS figure as current. | Fixed: dated as history, current 313/47 figure added (3d3432d0). |
| CL-4 | low | introduced | Re-snapshots taken without the usual dated changelog bullet. | Fixed (d7b74730). |
| CL-5 | low | introduced | Raid Thorns' caster spell damage modelled as 0 (an effect the dev notes describe as existing) — the D29 "never zero for a described effect" pattern. | Fixed: 313 [?] from a pre-raid Restoration set, derivation documented (3d3432d0) — see CU-3. |
| CL-6 | low | introduced | New Energy [F] tags cited an unscraped client table with no data-integrity guard. | Fixed: pinned test added (e6f77691). |
| CL-7 | low | pre-existing | Stale "guild test G2" wording; open question mislabelled bear-form level. | Fixed (e6f77691). |
| CL-8 | low | introduced | Bear rage sample undisclosed as Bear Form only (no Dire Bear swings in it). | Fixed: doc discloses Bear Form only, Dire Bear assumed the same (e6f77691). |

### UX review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| CU-1 | medium | introduced | Bear preset help/summaries quoted pre-slice TPS numbers, drifted past the warrior's own re-measure tolerance. | Fixed: re-measured, new `bear-presets.test.ts` guard (f6d638f0). |
| CU-2 | medium | introduced | Lacerate text claimed equality with the warrior's Sunder Armor, which gets an AP share Lacerate doesn't. | Fixed: wording says the bear doesn't get the AP share (9b6828ed). |
| CU-3 | medium (D29) | introduced | Raid Thorns' caster spell damage modelled as 0 despite being a described effect. | **Fixed: Thorns at 313 spell damage, from research on Forever healing gear (a pre-raid Restoration set)** (3d3432d0). |
| CU-4 | low | introduced | "crits no more" bear-rage wording read as "no more crits". | Fixed: "a crit or glancing blow the same" (9b6828ed). |
| CU-5 | low | introduced | Both Thorns rows read as if neither carried spell damage, once they both dealt 22. | Fixed as a side effect of 3d3432d0 (no commit named CU-5 directly; recorded here per C-verify.md). |
| CU-6 | low | introduced | Primal Bite sentence was a garden-path construction. | Fixed: removed along with the ×1.5 revert (9b6828ed). |
| CU-7 | low | introduced | Trailing comma dropped after `docRef` in the assumptions registry (style only). | Fixed (9b6828ed). |

### Verification pass (fix commits 9b6828ed, 3d3432d0, f6d638f0, e6f77691, d7b74730, 3dd90297)

**Gate passes.** Every CL/CU finding fixed or dispositioned.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| CV-1 | low | introduced by 3d3432d0 | Raid Thorns assumption hard-codes 22/0.08/47/313 with no test pinning them to the constants (same stale-number risk CU-1 caught). | Fixed (a2ce9fa3). |
| CV-2 | low | introduced by 3d3432d0 | catalogue.test.ts's whole-number rounding allowance widened to every entry, not just Thorns. | Fixed (a2ce9fa3). |
| CV-3 | low | pre-existing | Under `classicEra`, results still showed the Forever-specific Thorns assumption text (313 SP) instead of Classic's flat 18. | Fixed (a2ce9fa3). |

## Slice D — paladin beta-log check

### Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| DL-1 | medium | introduced | Seal of Righteousness's 0.2×SP fit rank 1–4 logs but not rank 8, where the client's own aura+proc coefficients sum to 0.1, not 0.2 (~−7% TPS on that option). | Fixed: 0.1 at rank 8, aura+proc breakdown documented (910096c1). |
| DL-2 | low, breaks D37 | pre-existing (30s), restated | Seal of Fury's absorb used a made-up 30s duration instead of the client's Light's Fury aura (10s); replace/50%/timing rules stated as untested when the logs already show them. | Fixed: 10s from client id 1310927, replace rule and 50%/timing tagged as measured (415e313d). |
| DL-3 | low | introduced | paladin.md claimed logged JoC misses reflect "the melee special table" for mobs of every level; the same logs show judgement misses (30%) diverging sharply from Holy Strike (11%) and white swings (6%). | Fixed: claim removed, observed rates stated, table left open (a3a2f374). |
| DL-4 | low | introduced | User's Holy Strike test (36, then 43 with Seal of Fury) wasn't reconciled with the model's predicted 42; nothing lets Seal of Fury raise Holy Strike, but the doc waved it off as roll noise. | Fixed: both gaps added to OQ 5 with a supporting test (a3a2f374). |
| DL-5 | low | introduced | threat.md's Hammer of the Righteous row still said "attack power counted" after the default flipped to weapon-only. | Fixed (1f725e10). |
| DL-6 | low | introduced | New absorb engine path (partial absorb, stand-in `EV_DAMAGE_TAKEN`, expiry-with-remainder) had no test coverage; two stale comments. | Fixed: synthetic test added for all three paths (1f725e10). |
| DL-7 | low, for the user | pre-existing, relabelled | Mana-threat's 0.5/mana value traces to LibThreatClassic2 alone, a lineage D37 doesn't list as a source (unlike the user's explicit Maul exception). | Fixed (relabelled, put beside Maul as a Classic Era threat library's value) (ae9ef7ab). |
| DL-8 | info | introduced | Flipping HotR's default silently changes what a saved setup with the old implicit "with attack power" behaviour does. | Fixed: version-bump repair notice (1a1c8d26). |

### UX review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| DU-1 | medium | introduced | Holy Strike wording ("50% of a normalized swing, 81–105 and 0.429×SP together") read as three separate additive parts, not one halved sum. | Fixed: halving stated first, in help and assumption alike (75a37f36). |
| DU-2 | low | introduced | ux.md's wide-layout paragraph was stale after Prot's Advanced tab shrank to fit 1440×900. | Fixed: paragraph rewritten (75a37f36). |
| DU-3 | low | introduced | A link/code/Load carrying the old "All of it" JotC setting, or the old HotR default, silently changed behaviour with no notice. | Fixed: repair notices added, gated by a config version bump (1a1c8d26). |
| DU-4 | low | introduced | HotR help used "3 times" twice for different quantities; had a sentence fragment. | Fixed (75a37f36). |
| DU-5 | low | introduced | Caveats uneven: Holy Strike said "untested at level 60"; Seal of Fury/JotC didn't, despite the same evidentiary gap. | Fixed: same caveat everywhere (75a37f36). |
| DU-6 | low | introduced | Mana-threat text used jargon ("a threat library's value") and read oddly on a Prot paladin's own result. | Fixed (ae9ef7ab). |
| DU-7 | low | introduced | Seal of Fury's "adds nothing" line read as internal data-table talk. | Fixed (75a37f36). |
| DU-8 | low | introduced | Seal help's "about as much threat with a one-hander" claim wasn't re-measured against the DL-1 fix. | Fixed: re-measured and pinned (910096c1). |
| DU-9 | low | introduced | Seal of Command's JotC share (0.29) wasn't distinguished from Holy Strike's 0.429 share in the assumption text. | Fixed: names which 0.429 and which 0.29 (75a37f36). |

### Verification pass (fix commits 910096c1, 415e313d, a3a2f374, 1f725e10, ae9ef7ab, 1a1c8d26, 75a37f36)

**Gate passes.** Every DL/DU finding fixed.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| DV-1 | low | introduced (1a1c8d26) | HotR's repair notice fired even when Hammer of the Righteous can't be used (no 1H weapon, etc.), reporting a change that moves nothing. | Fixed: notice only when the plan actually casts it (77fdc2e4). |
| DV-2 | low | introduced (ae9ef7ab) | paladin.md paraphrased the fallback order instead of citing doctrine §2 (gate step 6's rule from slice A). | Fixed: cites doctrine §2, no paraphrase (77fdc2e4). |
| DV-3 | low | introduced (75a37f36) | `jotcSealOfCommand` text's "outside its 70%" read as contradicting Holy Strike's "inside the half" for the same 0.429 figure. | Fixed: clarifies which 0.429 (77fdc2e4). |
| DV-4 | info | introduced (1a1c8d26) | Config-version bump blast radius (older tabs refuse newer links/codes). | No action: confirmed safe/expected, same as the prior 1→2 bump. |
| DV-5 | info | introduced (1a1c8d26) | Release entry needs to name both the "All of it" removal and HotR's new weapon-only default. | For the lead: releases.ts entry at push. |

## Slice E — casters/setup

### Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| EL-1 | medium | introduced | Earth Shock ×2 has no tier 1–2 source (LTC2/wowsims only) and dropped the wording table's own "no tier 1–2 value" qualifier that would otherwise give it Lacerate's flat-206 treatment. | Fixed: kept ×2 by explicit user decision (D38), wording table's qualifier restored (7b56c197). |
| EL-2 | medium | introduced (exposed by the swap) | Whiteout Staff beats the shipped presets for every Horde caster default by the sim's own weights, breaking D29's pre-raid-BiS rule. | Fixed: Whiteout Staff added as a candidate and now defaults on every Horde caster (1fe17ea3, e2e ff47f638). |
| EL-3 | medium | introduced | Epic caster weapons' Classic-sourced spell power carried no results-assumption flag, though doctrine requires disclosing a [?] value. | Fixed: `classicStats` flag + assumption row (95ca6b7f). |
| EL-4 | low | introduced | Scraper guard missed the case of a Classic Era row with no spell stat at all (would silently give 0 SP). | Fixed (95ca6b7f). |
| EL-5 | low | introduced | Rare-fitted extrapolation rule wasn't restricted from silently applying to Uncommon weapons too. | Fixed: restricted to quality 3 (95ca6b7f). |
| EL-6 | low | introduced | Demonology's default spent 3 points on Improved Imp while sacrificing the Imp, for no DPS gain. | Fixed: points moved to Demonic Embrace 5/5 (d0015ee9). |
| EL-7 | low | pre-existing | Maelstrom Weapon's 50% is an undescribed client dummy given a meaning with no D37 source naming it. | Fixed (docs): stated plainly as a D37 question (9bcb190f); later closed as a user decision (D38 #26) — see EV-3. |
| EL-8 | info | introduced | Plausibility note: Epic vs. same-item-level Rare caster weapons' spell power split suggests Forever re-itemized Epics; caster headlines move 5–8%. | No action; B82 kept High. |

### UX review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| EU-1 | medium | introduced (exposes pre-existing gap) | Race-change notice omitted the off hand both ways and undercounted changed slots. | Fixed: `defaulted`/`cleared` lists, accurate count (33862556). |
| EU-2 | medium | introduced | Classic-sourced spell power (Sageclaw/Mindfang/Ironbark) had no flag anywhere in Gear/picker/tooltip. | Fixed: "Classic stats" badge (9c7d30a8). |
| EU-3 | medium | pre-existing (now on 9 caster defaults) | Locked off-hand slot dimmed at `opacity-60`, measuring 2.5–3.4:1 contrast — below AA and against ux.md's own explicit rule. | Fixed: dims by colour, not opacity (aa3a452e). |
| EU-4 | low | introduced | Troll Fire mage's main-hand picker listed Mindfang and the equipped Whiteout Staff both "BiS", with no way to tell which the sim prefers. | Fixed: the worn two-hander sorts first (444c8c09). |
| EU-5 | low | introduced | Earth Shock's threat assumption showed on DPS-only results, where no threat number is shown. | Fixed: row says it doesn't affect a DPS result (4b8ed8c2). |
| EU-6 | low | introduced | Improved Imp row showed a bare, unlabelled "(−1000 at your rank)" number. | Fixed: number dropped (0814b32f). |
| EU-7 | low | pre-existing | `gear-rules.spec.ts` timed out once under parallel load (flake, unrelated to the branch). | Known gap (817c7384). |

### Verification pass 1 (logic fix round: 7b56c197, 9bcb196f, 95ca6b7f, d0015ee9, 1fe17ea3, ff47f638)

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| EV-1 | low, breaks ux.md | introduced (1fe17ea3) | A cross-faction race change adds/clears the off hand without naming it in the notice (same root cause as EU-1, newly reachable via Whiteout Staff). | Fixed (33862556). |
| EV-2 | low (hazard, nothing wrong yet) | introduced (1fe17ea3) extends a pre-existing conflation | `GearSource: 'pvp'` lumps PvP-rank rewards with battleground-reputation rewards; a future PvP-gear-removal slice filtering on it would wrongly drop Whiteout/Mindfang etc. | Noted for the queued slice's brief; no code change required now. |
| EV-3 | low (docs) | introduced (9bcb156f) | Maelstrom Weapon docs still called the 50% "a question for the user" after the user had already decided it (D38 #26). | Fixed (057eaa23). |

### Verification pass 2 (UX fix round: 33862556, 9c7d30a8, aa3a452e, 444c8c09, 4b8ed8c2, 0814b32f, 817c7384, 057eaa23)

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| EV2-1 | medium | introduced (1fe17ea3), made visible by 33862556 | Cross-faction race change stripped a caster's own custom one-hander's off hand, because the default off hand was only empty due to the Horde default's two-hander. | Fixed: off hand follows the main hand actually worn (bd20a836) — see the step 6 note below. |
| EV2-2 | low | introduced (33862556) | Race-change title used "Swapped" for a fill and "Changed" for the same kind of move, depending on direction. | Fixed: one template, "Changed N slots for {faction} gear" (a0925333). |

### Verification pass 3 (gate step 6: bd20a836, a0925333)

**Gate passes.** Nothing medium or worse remained. **Step 6 simplification:** the off-hand
follow logic had drawn new problems for two rounds running (EU-1 → EV-1 → EV2-1). Simplified to
one rule: **the default off hand is derived from the main hand actually worn**, replacing the
earlier "follows the spec's default" logic (bd20a836's message: "gate step 6: the default off
hand follows the main hand worn, by one rule"). Recorded in ux.md and items.md.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| EV3-1 | low | introduced (bd20a836, docs) | ux.md/items.md described the new off-hand rule in a way that didn't match the actual behaviour for a player who picks a one-hander after a two-hander emptied the slot (it stays empty, not auto-filled). | Fixed: wording says the off hand follows only while it holds the default beside the main hand worn (0f2fb9e8). |
| EV3-2 | low | introduced (bd20a836, behaviour) | Regression in the other direction from EV2-1: a Horde caster's own one-hander with an (inherited) empty off hand, switched to Alliance, now keeps the off hand empty instead of filling it with the Alliance default item. | **Waived: this is the rule the simplification chose; no code change needed (reason recorded in E-verify3.md).** |
| EV3-3 | low | introduced (bd20a836) | Changes which gear follows defaults for existing production saves: a Feral Cat with a custom one-hander and an empty off hand now gets Tome of Knowledge (the cat's pre-raid off-hand list item) on first load, rather than staying empty. | **Waived: rare, and announced via the normal "Updated to the new default gear" notice; no code change needed.** |

## Slice F — Dungeon Set 2 + bear head

### Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| FL-1 | medium | introduced | The bear's head-only re-pick (Darkmantle Cap → Shadowcraft Cap) leaves TPS on the table: a joint head+feet re-pick (Eye of Rend + Defiler's/Highlander's boots) reaches further above the D29 90% floor at more TPS, DPS and EH. | Fixed in slice J: Eye of Rend with Defiler's (Highlander's) Leather Boots, re-picked together on the new boss (78cb267b). |
| FL-2 | low | introduced | Removal rule's stated reason was wrong ("a quest only rogues can take") — Dungeon Set 2's upgrade quests are shared, only the reward differs by class. | Fixed (e9a32924), but overcorrected — see FV-1. |
| FL-3 | low | introduced | A player's own cross-class Dungeon Set 2 piece was silently dropped from the autosave with no notice. | Fixed: folded into the FU-1 fix (c8cdad72). |
| FL-4 | low | pre-existing | druid.md §7.3a's "Default" results row was stale even before this slice's own further drift. | Fixed in slice J: §7.3a re-measured with the re-pick (78cb267b). |

### UX review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| FU-1 | medium | introduced | A visit (autosave) silently emptied a player's own other-class quest piece (bear's own head, cat's own Darkmantle, etc.) with no notice at all — breaks ux.md's "a notice names what changed out of sight". | Fixed: `questRemovals` surfaced in the visit notice (c8cdad72). |
| FU-2 | low | introduced | Removal-notice verb agreement broke for plural item names ("Spaulders comes from…"). | Fixed (c8cdad72). |
| FU-3 | low | introduced | Multiple same-class removals repeated the full sentence, then hid the rest behind "3 other parts changed too." | Fixed: grouped into one sentence per quest class (c8cdad72). |
| FU-4 | low | introduced | Picker's empty search for a removed default (e.g. "darkmantle") gave no reason why nothing matched. | Known gap (b4e03ee2). |
| FU-5 | low | introduced | Removal notice said what was removed but not what to do next. | Fixed: "Choose another in Gear." (c8cdad72). |
| FU-6 | low | introduced | An armor-type mismatch (e.g. a mage loading a leather item) got the quest-only reason instead of the more direct armor-type reason. | Fixed (c8cdad72). |

### Verification pass (fix commits e9a32924, c8cdad72, b4e03ee2)

**Gate passes.** Nothing the fixes introduced was medium or worse.

| id | fixed? | disposition |
|---|---|---|
| FL-1 | deferred | Deferred at the time; fixed in slice J (78cb267b). |
| FL-4 | deferred | Deferred with FL-1; fixed in slice J (78cb267b). |
| FL-2 | fixed, with a new low | See FV-1. |
| FL-3 / FU-1 | fixed | c8cdad72. |
| FU-2, FU-3, FU-5, FU-6 | fixed | c8cdad72. |
| FU-4 | known gap | b4e03ee2. |

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| FV-1 | low | introduced (e9a32924) | FL-2's fix overcorrected: the cited wiki source doesn't actually show the upgrade quests as shared — each class has its own quest id, only the outcome (the class's own reward) looked shared. | Fixed: reworded to what the source shows (each class takes its own version) (e77374f7). |
| FV-2 | low | introduced (c8cdad72) | The combined notice title ("Gear and talents changed for Feral (Bear) Druid and Retribution Paladin") can overclaim when the gear removal and the talent refund actually belong to different specs. | **Waived: the description names each spec's change correctly, so no promise breaks; reason recorded in F-verify.md.** |

## Slice J — boss melee from logs, the bear's head and feet, the user's tests

Golemagg's melee from a Classic Era log (2,200–3,200 every 2.0 s), the bear's joint head-and-feet
re-pick (FL-1), the user's Maul, Judgement of Fury and Redoubt tests in the docs. Branch
`worktree-agent-a0fa2162b6fa10c6b`, rebased once on fa57b2b3; merged as 2f1b4803. Maul's extra 3 rage
was not added: the user confirmed the test bear had Ferocity 3/5, which explains it.

### Logic review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| JL-1 | medium | introduced | Bear Max TPS "Maul from 16" didn't clear D23 against Balanced's 20 (tied, −0.5% DPS). | Fixed: back to 20; Max TPS plays as Balanced and says so (5eb6aaf2). |
| JL-2 | medium | introduced | Lacerate-off help and druid.md Q15 quoted the old boss's −14%/−16%. | Fixed: −7%/−11% from a measured constant a test re-measures (3b4d0eb5). |
| JL-3 | medium | introduced | Returning tanks silently kept the old 4,500–5,500 boss, shown as "changed". | Fixed: a save before version 4 at exactly the old default moves on load and the notice says so; CONFIG_VERSION 4 (e8e0aaa1). |
| JL-4 | medium | introduced | gear-search test's `?? config.gear` fallback made its shield assertion vacuous. | Fixed: starts from a weak main hand and requires a weapons change (d63a8141); residual gap JV-2. |
| JL-5 | low | introduced | Warrior Defensive Heroic Strike 76 was tuned on the old boss; 95 clears D23. | Fixed: 95 (5bbb8534). |
| JL-6 | low | introduced | The user's Judgement of Fury test brackets 12–35 hidden threat a judgement; the sim models zero. | Kept at zero for this update, as an open question for the user: the bracket rests on the 110% rule and the variants reach 81; a few TPS either way. |
| JL-7 | low | introduced | doctrine.md and CLAUDE.md named the paladin test as the user's only test. | Fixed (ff899e86, f2fb64d4); wording tightened in JV-4. |
| JL-8 | low | introduced | encounter.md §5's armor factors (0.418 vs 0.4244) unexplained; Curse of Recklessness possibly counted twice. | Fixed: explained; no double count (e37099b7); overreach corrected in JV-1. |
| JL-9 | low | introduced | The Golemagg report link is a TODO. | Waived: the user deferred it (2026-09-26); in known gaps. |
| JL-10 | low | introduced | Player-facing "the user's in-game test"; Coming soon said "logs". | Fixed (6914eb8f). |
| JL-11 | low | introduced | Warrior Max TPS help said "more rage on threat" for a later Heroic Strike. | Fixed: direction words from the thresholds (5bbb8534). |
| JL-12 | low | surfaced | Defiler's boots listed as "not simulated" for a run-speed effect. | Fixed: movement-only equip spells aren't flagged (3eb8199a). |
| JL-13 | low | pre-existing | The bear preset still wears PvP-rank and Darkmoon pieces; FL-1 measured with them. | Known gap: M5.671's preset pass, then re-run FL-1's search (728e08b5). |

### UX review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| JU-1 | medium | introduced | Returning visitor keeps the old boss; Fight shows "1 changed". | Fixed with JL-3 (e8e0aaa1). |
| JU-2 | medium | introduced | Warrior Max TPS help "85 rage rather than 84%" read as a typo and as more rage spent. | Fixed with JL-11 (5bbb8534). |
| JU-3 | low | introduced | Bear "±0.0% TPS" read as a confidence interval; repeated sentence. | Fixed with JL-1 (5eb6aaf2). |
| JU-4 | low | introduced | Assumption wording "the user's in-game test". | Fixed with JL-10 (6914eb8f). |
| JU-5 | low | introduced | Rotation intros claimed tuning the new boss hadn't had. | Fixed: Defensive quick-checked, wording true (5bbb8534). |
| JU-6 | low | pre-existing, now visible | "Effect not simulated" badge on the bear's boots. | Fixed with JL-12 (3eb8199a). |

### Verification pass (7d8d678f..728e08b5)

Every finding fixed or soundly dispositioned; nothing introduced at medium or worse; every default
headline identical before and after the round except the warrior's Defensive.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| JV-1 | low | introduced (e37099b7) | encounter.md said more about Magma Splash than the client shows. | Fixed: stated as the client shows it; the gap isn't a whole stack (ab0efb36). |
| JV-2 | low | introduced (JL-4 fix) | The gear-search test catches the shield rule only incidentally. | Known gap: assert on the weapons step's candidates (ab0efb36). |
| JV-3 | low | introduced (e8e0aaa1) | architecture.md said links are "never migrated" beside the new migration. | Fixed (ab0efb36). |
| JV-4 | low | introduced (ff899e86) | doctrine §2 read as if the user's tests weren't the guild's; paladin.md's "one guild test". | Fixed (ab0efb36). |

## Merge verification (D25)

One pass over every merge since the last push (A, C, B1, B2, F, D, E, J) and the lead's commits
between them. No merge broke engine logic, loading, notices or a snapshot: each snapshot re-taken in
a merge reproduces its pre-merge value with the named change reverted; old v1–v3 saves, links and
codes load with every notice right; from the E merge to main only the three tanks move (Warrior
914.8 → 866.0 TPS, Bear 1,089.0 → 991.7, Paladin 700.8), every DPS spec identical. The J merge
needed the client data regenerated for the spells its docs cite (0e6c8ac9).

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| MV-1 | medium | introduced (A's Coming soon against D) | Coming soon and M5.671 still promised Hammer of the Righteous's tooltip reading, which D shipped; M5.671 also listed B2's and E's shipped labels. | Fixed: the release entry says it; the shipped items leave M5.671 and Coming soon (release commit). |
| MV-2 | medium | introduced (A's line against F) | "Every class's Dungeon Set 2 joins the gear" wasn't what F shipped. | Fixed: the release entry and milestones say each piece is its own class's only, others removed with a notice (release commit). |
| MV-3 | low | introduced (J against F) | A visit that removes a piece and moves the boss melee titled only the move, and could miss the removal's spec. | Fixed: "Gear removed and defaults updated for …", every spec either touches (9f4fa4ae). |
| MV-4 | low | pre-existing | A Load spells out two changes; an old paladin's removal can fold into "other parts changed". | Known gap. |
| MV-5 | low | pre-existing | Planned tests still labelled "guild test Tn". | Fixed: in-game test Tn (9f4fa4ae). |
| MV-6 | low | introduced (J) | `export { fightEquipEffects }` sat between a JSDoc and its function. | Fixed (9f4fa4ae). |
| MV-7 | low | introduced (B2) | Rend's comment cited "D37's fallback, step 4". | Fixed: doctrine §2's step 4 (9f4fa4ae). |
| MV-8 | info | tooling | Stored headline baselines differ from fresh runs by ≤0.1%. | Noted: compare runs from the same session. |

The lead's own low fixes (e77374f7, 16838ceb, a2ce9fa3, 6de063ba, 77fdc2e4, 0f2fb9e8, ad060826,
7ef9ff1e, f2fb64d4, ab0efb36) were quick-checked in this pass and introduce nothing. The fixes above
(9f4fa4ae and the release commit) are one-line copy, doc and title changes; their quick check is below.

## Release check (5fb5d98b, 9f4fa4ae, 14ab66c5)

The LICENSE (all rights reserved, the user's decision), the MV fixes and the release entry, Coming
soon and milestones. Every MV finding fixed as its disposition says; every number in the entry
matches origin/main against main at 5,000 fights.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| RV-1 | medium | introduced (14ab66c5) | Ticking M5.668 and M5.669 changed their anchors; two links broke and `npm test` failed. | Fixed (4e637ee3). |
| RV-2 | medium | introduced (14ab66c5) | "Maul's threat is confirmed by an in-game test" overstated a test that brackets it. | Fixed: the entry gives the bracket, 1.7 to 2.25, which fits 1.75 (4e637ee3). |
| RV-3 | low | introduced | The Demonology line blamed the Succubus build for the drop; Whiteout Staff sat in it. | Fixed: Improved Imp's part named; Whiteout Staff with the caster weapons (4e637ee3). |
| RV-4 | low | introduced | milestones.md linked this log before it existed. | Fixed: this log. |
| RV-5 | low | introduced (MV-5 fix) | "a in-game test candidate". | Fixed (4e637ee3). |
| RV-6 | low | introduced (MV-3 fix) | The notice's JSDoc didn't name the new title. | Fixed (4e637ee3). |
| RV-7 | low | introduced | Heroic Strike, the boots' factions and Hammer of the Righteous's old reading unclear in the entry. | Fixed (4e637ee3). |
| RV-8 | info | n/a | The entry's time was a placeholder. | Set to the push's time. |
| RV-9 | info | n/a | Serpent Sting's crits left out. | Added (4e637ee3). |


### Verification of the release fixes (4e637ee3)

Every RV finding fixed; nothing introduced at medium or worse.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| RV2-1 | low | introduced | The Demonology line put its whole drop on Improved Imp and the Succubus build; about half is the weapons, and "adds damage" was vague. | Fixed: names the weapons and the Imp's faster Firebolt. |
| RV2-2 | low | introduced | "Crit for double" isn't Marksmanship's ×2.3 with Mortal Shots. | Fixed: "crit like shots". |
| RV2-3 | info | introduced | "Times its damage" assumes a multiplier the one pull can't tell from a flat bonus. | Kept: a fair summary; the docs state the caveat. |
| RV2-4 | info | pre-existing | "Every spec either touches" isn't true past two specs ("and N other specs"). | Fixed: "the specs either touches". |
