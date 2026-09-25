# The 1.60.1.70009 talent-tree migration (2026-09-24)

Build 1.60.1.70009 moved talent code positions, removed Improved Holy Strike and Crusade, renamed
two Feral Combat talents and swapped two Elemental ones. The migration (branch `build-70009`)
froze 1.60.1.69913's code order, gave setups a version that says which trees their code is on, and
maps a version-1 code onto today's trees by talent name, refunding what has no place there
([talents.md § Tree versions](../data/talents.md#tree-versions)). It had a full logic and UX review;
this log records the findings and the fix round that answered them.

Reviewers: the review by a fresh reviewer who wrote none of the migration; the fix round by its own
agent, for a verification pass by a fresh reviewer (D25). Probes: the review's
`.cache/probes/talent-migration-review/` in its worktree, the fix round's `.cache/probes/tm/` in its own.

## Findings

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| TM2-1 | medium | introduced | Old default links load crippled builds: the old Retribution default mapped by name to 8/8/19 with 16 points refunded (−26% DPS), and the old Protection default lost 5 points. Mapping by name is right for a player's own build, not for the sim's own. | fixed in `61cb9eda`: a successor table (`src/sim/config/talent-successors.ts`) runs before the name mapping, keyed by frozen build, class and exact code, for every code `stored-builds.json`'s `legacy` froze: a spec's default or a class preset, read from today's defaults and presets (so the paladin slice's default changes carry through), the same digits for a former default no preset keeps, or the name mapping where that keeps every point (Holy). The load says so in one line ("Your talents were the Retribution default on the game’s old trees; they’re now today’s default."), and nothing when the successor is what the name mapping gives (Elemental, the unchanged classes). Players' own builds keep the name mapping and its refunds; the gate cascade stays for legality. Tests: `talent-successors.test.ts` (every legacy code covered, each successor legal and of its own class, the Ret and Prot defaults, the popular preset, Holy and Elemental silent, a one-point-off build by name), `normalize.test.ts`, `follow-defaults.test.ts`, `setup-store.test.ts`, `follow-defaults.frozen.test.ts`, e2e `follow-defaults.spec.ts` |
| TM2-2 | medium | introduced | Pasting an old code into Talents gave a misleading error ("That isn't a Paladin code…"). | fixed in `61cb9eda`: `readBuildCode` reads a code that fails on today's trees but is legal on 1.60.1.69913's there, with the successor table, and the paste says "Pasted a code from the game’s older talent trees" with its refunds, its successor, or "Every talent kept its points on today’s trees." A code legal on both keeps today's reading; one legal on neither keeps today's reason. Tests: `logic.test.ts` ("pasting a code from the game’s older talent trees"), e2e `setup-talents.spec.ts` |
| TM2-3 | — | introduced | The Retribution default's placement on today's trees (3 points unspent). | owned by the paladin slice, which is changing `DEFAULT_TALENTS` in parallel; not changed here. The successor table reads the default, so its change carries through |
| TM2-4 | — | introduced | The Protection default's placement on today's trees. | owned by the paladin slice, as TM2-3 |
| TM2-5 | medium | introduced | The refund notice was too long to read in 10 s: every talent with its reason, and the whole sentence again for each spec in the automatic save's notice. | fixed in `61cb9eda`: one sentence naming the talents the game changed as the cause, and what to do ("…refunded 16 talent points: Improved Holy Strike and Crusade left the game, and 5 talents below them lost the points their rows need. Spend them again in Talents."); the automatic save says every spec's refunds in that one sentence, each talent named once; and a load's notice stays up for a slow reader's time (`noticeDuration`: 4 s + 1 s per 3 words, 10–30 s; ux.md's notice rules say so). The worst case, a visit that moved a Protection paladin's gear with two specs' refunds, stays 24 s; snapped at 390 px dark and 1280 px light, and the paste's notice at 390 px dark (`.cache/snaps/tm-refund-*.png`, `tm-paste-390-dark.png`). Tests: `talent-trees.test.ts` ("refundNotice"), `load-notice.test.ts`, `follow-defaults.test.ts` |
| TM2-6 | — | pre-existing | The unit tests the class slices own fail on `build-70009` (25 tests in 12 files: client data, the paladin, bear, Balance, shaman and warrior data and goldens). | tracked by the class slices; the fix round adds no failure (the same 25, in the same files, before and after) |
| TM2-7 | low | introduced | A tab of the old app, still open or cached, that loads a version-2 automatic save refuses it as a newer version and resets the specs. | waived: code shipped now can't change what an already-loaded old tab does. The release notes' draft asks players with the sim open in an old tab to reload it |
| TM2-8 | low | introduced | No test reached the "now N ranks" refund branch (a lowered max rank), nor a talent refunded twice in one notice. | fixed in `61cb9eda`: synthetic tests in `talent-trees.test.ts` ("mapByName: branches no build has needed yet") lower Unbridled Wrath to 3 ranks; the notice names a talent refunded for its ranks and then its row once, and `follow-defaults.test.ts` names Improved Holy Strike once across two specs |
| TM2-9 | — | — | Not in the fix round's brief. | for the lead to record |
| TM2-10 | — | — | Not in the fix round's brief. | for the lead to record |
| TM2-11 | — | — | Not in the fix round's brief. | for the lead to record |
| TM2-12 | — | pre-existing | Environment: a nested `node_modules` symlink broke Playwright and made Vite load React twice. | fixed by the lead (the environment, not the repo) |

## Checks

Lint and typecheck clean. Unit tests: every talent-tree, successor, normalize, follow-defaults,
setup-store, load-notice and paste test passes; the only failures are TM2-6's 25. E2e, on its own
port: follow-defaults, share-links, share-link-refusals, setups, setups-transfer, setup-talents,
paladin-protection, paladin-protection-rotation, retribution, notices, whats-new, setup-defaults and
shell-sharing, all passing.
