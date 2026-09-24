# Client-data drift fix (2026-09-24)

The drift fix taught the client scraper's buffs-doc parser to read a §3 ID cell as a whole chain
(`6dc33ce0`), gave every generator `--check` and `npm run scrape:check`, and added a test that the
committed data agrees with what the docs decide (`f759664c`). It had a logic review by a fresh
reviewer at `f759664c`; this log records its findings and the fix round that answered them. The
change has no screens, so there was no UX review.

Range: `15d2fd53..f759664c` (review); fixes `8986daac..879d350a`
Reviewers: logic: a fresh reviewer who wrote neither commit (probes `cells.mjs` and `malformed.mjs`
in `.cache/probes/drift-review/` of its worktree). The fix round by its own agent, for a
verification pass by a fresh reviewer (D25).
Checks after the fixes: lint ✓ · typecheck ✓ · `npm test` ✓ (110 files, 2519 tests) ·
`npm run scrape:check` ✓ (exit 0, zero requests, `requests.jsonl` unchanged, no file under
`.cache/client` or `src` written). e2e not run: no screen changed.

## Logic findings

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| DR-1 | medium | introduced | `consumableChain` still dropped ids without a word: its `enchant` matches were case-sensitive, so `20750 → 25121 → Enchant 2627 → 25111` exited 0 and lost 2627 and 25111; and the spell steps between the item's spell and the enchant were discarded as "triggered" and never checked, so `20749 → 25122 → 25113 → enchant 2628` filed 25113 as triggered. | fixed in `8986daac`: the enchant step is read in any case, and a step mentioning an enchant that isn't `enchant N` is a problem; the middle steps come back as `triggeredSpellIds` (paired with the items like the item's spell), and `client.mjs` records a `docMismatches` entry when the item's spell doesn't reach one through `EffectTriggerSpell`. Both repros are in `docrefs.test.mjs`; with the doc temporarily rewritten to them, a generation gives Wizard Oil 2627 and 25111, and Brilliant Wizard Oil the mismatch for 25113 |
| DR-2 | low | introduced | `--check` wasn't write-free: it rewrote derived cache files (the parsed tables and game tables, `spells-left-out.json`), and `--check --claims` wrote `claims.md`. | fixed in `563fc16b`: the client source takes `readOnly`, set by every generator under `--check`; spells-client skips its left-out report; `--claims` with `--check` is a usage error. A run writes no file under `.cache/client` or `src` (checked against a marker) |
| DR-3 | low | introduced | Under `all.mjs --check`, `client.mjs` read the committed `src/data/{spells,talents,races,items}` rather than their fresh generation. | fixed in `563fc16b`: `all.mjs --check` passes a temporary `--fresh=<dir>`; steps 1–4 leave their fresh output there and `client.mjs` reads its inputs from it. With a spellbook trimmed by hand, `all.mjs --check` fails only the spells step, while `client.mjs --check` alone also fails the client data |
| DR-4 | low | introduced | The cache-backed test compared against the cache's "latest" pointer, so a `--refresh` for a new build would turn `npm test` red; the test was skipped only when the pointer file was absent. | fixed in `563fc16b`: `--check` defaults `--version` and `--dbdefs` to the build and WoWDBDefs commit the committed dataset records (`lib/output.mjs` `recordedSource`) and doesn't read the pointer (passes with it moved away); `--if-cached` skips when the cache has no directory for a recorded build (checked by moving the build's directory away) |
| DR-5 | low | introduced | In `client.mjs`, the early `if (errors.length) finish()` ran before `const written = {}`, and the TDZ ReferenceError hid the real errors; the test's report filter was case-sensitive. | fixed in `e87ab1bc`: `outDir` and `written` are declared with the output setup; `client.mjs --check --dbdefs=deadbeef` exits 1 with the offline fetcher's errors. The filter went with the test in `879d350a` (DR-8): the step prints the generators' whole output |
| DR-6 | low | introduced | `lib/claims.mjs`'s D19 claim filtered on `m.includes("→ spell")`, which now also matched the enchant-spell mismatch. | fixed in `8986daac`: it matches `doc says item N → spell` only; the triggered-spell message doesn't contain it either |
| DR-7 | low | introduced | client.md's "What the docs decide" table had no row for §4's `item N → S` cells (Annihilator, Rivenspike, Nightfall). | fixed in `8986daac`: a row for them, and the §3 paragraph lists each link the client checks and each shape that fails the run |
| DR-8 | low | introduced | The cache-backed half ran `all.mjs` inside vitest's parallel pool, competing with the goldens' timing checks. | fixed in `879d350a`: out of `npm test`; `test:full` runs `npm run scrape:check -- --if-cached` as its own step after the unit tests. The Full regression workflow (`regression.yml`) runs `test:full` with no cache, so the step prints that it skipped and exits 0; the cache-free half stays in `npm test` and runs in CI |
| DR-9 | low | pre-existing | Cells whose ids don't line up with their items were read silently (`A -> B` as two items, `13931 (x2)` as items 13931 and 2, `1 / 2 / 3 → 10 / 20` giving every item both spells), and a §1/§3/§4/§5 table with no recognisable ID column (`Item ID`) was skipped. | fixed in `8986daac`: each is a `problems` entry (an ASCII arrow, an items step that isn't a `/` list of ids, a spell step whose count is neither one nor the items', digits in a spell step's name, a §4 item cell that isn't `item N → S`, now read in any case), and so is a table with no ID column, except §1.3's camp buffs, which have no ids by design. The real doc still parses with no problems and the same 89 consumables |

## Left for later

- `ench. 2627` (the reviewer's probe) still reads as a spell step named "ench." giving spell 2627;
  the doc never abbreviates the enchant, and the client check would report the spell as missing
  from the item's effects.
- CLAUDE.md's command list still describes `test:full` as "lint, typecheck, every unit and e2e
  test"; the fix round doesn't edit CLAUDE.md, so the lead should add the `scrape:check` step.

## Verdict

Every finding is fixed. Ready to push once the verification pass of `8986daac..879d350a` passes.
