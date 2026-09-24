# App issues: GitHub #1, #5, #6 and #8 (part 3) (2026-09-24)

The app-issues slice (`f08c418e`..`1b3801da`): worker respawns bounded and their failures worded
for players (#1), the run under way keyed by spec (#5), a share link read from its fragment's `s`
parameter (#6), the item picker's faction filter pinned for the other faction's item, and the
automatic save's keys and tab validated on load (#8). A fresh reviewer who wrote none of it did the
combined logic and UX review, with probes (a 404 worker, a runtime error in a fresh worker, a
cancelled run's hung worker, background runs, stored saves from a newer version). The fix round
below answers it, with one user decision: a spec switch cancels a run in progress (AR-2).

Severities are the fix round's reading of the review; the review's own ranking stands where it
differs.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| AR-1 | low | introduced | A runtime error while a fresh worker built its plan was reported as "The simulation couldn't start. Reload the page…", since the worker hadn't answered yet; reloading can't fix an engine error. | fixed in `8791cbcb`: the worker posts `ready` once its script has loaded and run, and only a failure before that is a failure to start. Its handling moved to `src/worker/handler.ts`, which catches a plan `new Sim` can't build and answers that plan's chunks with `type: 'error'`. Tests: pool.test.ts (a failure after `ready` says "stopped unexpectedly"), handler.test.ts (a bad plan, a good one after it), and an e2e with a worker that throws on its plan (no Reload button, retry advice) |
| AR-2 | low (a design question, settled by the user) | introduced | A run left going on another spec was out of sight: no way to see or cancel it from the spec showing, and announcements about it arrived under the other spec. | **user decision: cancel on switch.** Fixed in `7f4c24ad`: the sim store subscribes to the setup's spec and cancels at once on any switch (switcher, shared link, saved setup); cancel sets the state itself, so nothing renders the run as under way under the other spec. `runSpec`, the per-spec `running` check and the other-spec announcements are gone; results stay keyed per spec and land under their own. ux.md "Running" and architecture.md (Data flow) follow. Tests: sim-store.test.ts; results-keyed.spec.ts (held workers, slowed warm workers, the phone bar) |
| AR-3 | low | introduced | "Fury Warrior's run failed: … Switch back to it for details." was awkward and pointed somewhere the player hadn't chosen to go. | fixed in `7f4c24ad` by AR-2's decision: the copy, and the background run it described, are gone |
| AR-4 | low | introduced | `SECTION_IDS` and the `Section` type, and App.tsx's tab list, were three lists that could drift: a tab added to one wouldn't be restored, or would open with no content. | fixed in `cadd9e07`: `SECTION_IDS` is `as const` and `Section` is derived from it; App.tsx builds its tabs from `SECTION_IDS` through a `Record<Section, …>`, so a missing or extra tab fails the typecheck |
| AR-5 | low | pre-existing | A save whose current `config.spec` this version doesn't know (a newer version's, in another tab) was normalized into a Fury setup, which then replaced the player's own stored Fury setup. | fixed in `cadd9e07`: the merge ignores an unknown current config and opens the default spec on `bySpec[defaultSpec]`, or its defaults with none. ux.md#persistence-and-sharing says so. Test: setup-store.test.ts (the probe's case, and a round trip through Arms) |
| AR-6 | low | introduced | ux.md said every next Simulate "starts afresh with new workers", which isn't what the pool does. And a cancelled run left its chunks running: a worker that hung on one then failed the next run with the hang message (the reviewer's probe). With spec switches now cancelling runs, cancels are common. | fixed in `8791cbcb`: ux.md reads "The next Simulate replaces any worker that failed." The driver tells its executor when a run is cancelled with chunks in flight (`abandon`), and the pool terminates the workers still busy with them; the next run replaces them, and an idle worker stays warm. Tests: pool.test.ts (the probe's scenario, and an idle worker kept), driver.test.ts (`abandon` called once, only with chunks in flight). architecture.md (Workers) follows |
| AR-7 | low | introduced | The #1 e2e covered only a worker script that throws; a deploy actually serves the 404 page (`text/html`), which fails differently. | fixed in `89ea3990`: results-states.spec.ts serves a 404 `text/html` worker; the run says to reload, and the test drops only its own expected 404s from the fixture's problems |
| AR-8 | low | introduced | "Reload the page" gave no way to do it; on a phone, finding the browser's reload is awkward. | fixed in `89ea3990`: a "Reload page" button (44 px) in the alert when the message is `WORKER_START_MESSAGE`, in the desktop panel and the phone's results sheet (the bar is itself a button, so it says "Failed" and its sheet has the button). e2e: desktop and phone, the button's height, and a click that reloads with the setup kept. ux.md "Error" follows |
| AR-9 | low | introduced | "A simulation worker stopped unexpectedly." talked about the app's internals (ux.md checklist item 2). | fixed in `8791cbcb`: "The simulation stopped unexpectedly."; ux.md follows |
| AR-10 | low | introduced | A page whose worker script is gone could never simulate until reloaded, however often Simulate was pressed. | fixed in `8791cbcb`: once fresh workers have failed to start in two runs in a row with none starting since (`START_FAILURES_BEFORE_FALLBACK`), the pool is `unstartable` and `executorFor` runs later runs on the page's own thread. Tests: pool.test.ts (two runs, not two workers; a start resets; hangs and crashes don't count), executor-fallback.test.ts (via `simulate`), and the AR-7 e2e (the third run gives a result with no worker asked for). architecture.md (Workers) and ux.md "Error" follow |

Also fixed, from the review's run: the "a run whose worker stops answering ends after a minute"
e2e was flaky under load, since the page clock ran on real time between the worker starting and
`runFor`, leaving about a second of slack. It now installs the clock at a fixed time and pauses
it before the run (`89ea3990`); repeated six times, green.

Checks after the fix round: lint, typecheck, `npm test` (119 files; two single-core throughput
benchmarks missed their floor under a machine load of 18 to 27 and pass alone), and the
results-states, results-keyed, app, share-links, share-link-refusals, gear-rules and setups e2e
specs (111 tests), all green. Screens: the start-error alert with its Reload button (1280 light,
and the 390 dark bar and sheet) and a spec switch mid-run (Fury running, Arms after the switch,
back on Fury) at 1280 light and 390 dark.

Verdict: pending a verification pass by a fresh reviewer, scoped to `8791cbcb`..`cadd9e07`
(AR-1, AR-6 and AR-10 changed the run layer; AR-2 changed the run state).

## Verification pass (8791cbcb..cadd9e07)

A fresh reviewer confirmed AR-1 to AR-10 fixed and the user's cancel-on-switch decision in place:
every path that changes spec (the switcher, a shared link, a saved setup, the phone bar) cancels
synchronously, and no frame shows a run under the other spec. The page-thread fallback matches the
workers exactly (713.7 ± 1.8 DPS, 2,250 fights). **The gate passes:** nothing the fixes introduced
is medium or worse. The severities above are corrected to the original review's (AV-4).

| id | sev | origin | finding | disposition |
| --- | --- | --- | --- | --- |
| AV-1 | low | AR-10 | After the fallback, the page never tries workers again until a reload, and nothing says a reload restores full speed. | waived: ux.md documents "until a reload"; it takes two failed starts in a row, and the fallback gives the same results |
| AV-2 | low | AR-6 + cancel on switch | "An idle worker stays warm" rarely holds: the driver keeps every worker busy, so a cancel usually replaces the whole pool. Bounded: one respawn a run, from the HTTP cache. | fixed by the lead: architecture.md and pool.ts say a cancel normally replaces the pool |
| AV-3 | low | AR-10 | `localExecutor` has no `abandon`, so up to 2 queued chunks of a cancelled run still run on the page after a switch (~0.6 s at most). | waived: fallback mode only, and bounded |
| AV-4 | low | the log | The table's severities were the fixer's. | fixed by the lead: corrected above |
