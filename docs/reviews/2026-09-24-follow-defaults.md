# Gear follows the defaults (2026-09-24)

Range: ee171d2a..7a7da8ee (the slice: d55fedae, 580ccf6a, 3f367228; fixes: a46dae34, 5da1784b, 7a7da8ee)
Reviewers: combined logic and UX: a fresh reviewer who didn't write the change. Fixes: the fix agent;
their verification pass is still to come.
Checks (fix round): lint ✓ · typecheck ✓ · unit ✓ (two timing benchmarks failed under machine load and
pass alone) · e2e ✓ (follow-defaults, gear-rules, setup-gear, setups, setups-transfer, share-links,
share-link-refusals, setup-character, paladin-protection, setup-defaults, setup-talents: 101 passed)
Screens (fix round): Gear matching and 17-slots-differ, Talents default and custom, at 390 px dark and
1280 px light (`.cache/snaps/fd/`)

## Findings

| # | Origin | Severity | Finding | Disposition |
| --- | --- | --- | --- | --- |
| FD-1 | introduced | high | `legacyFollowing` matched old saves against the live defaults (`defaultTalents`, `defaultGearFor`, `preRaidListGear`), so a save holding a default stopped migrating once that default changed. The Protection paladin's default is about to change, and today's `-0530513321301551-50215` wasn't among the former builds. | Fixed in a46dae34: the migration reads only a frozen snapshot, `src/app/legacy-defaults.ts` (every spec's talents, default race, and for every legal race its default gear and v1's pick, as deployed at ee171d2a), generated once by `scripts/freeze-legacy-defaults.mjs` from that commit's source, beside the hand-kept former-default tables, with `-0530513321301551-50215` listed explicitly. A shape test, and a mocked default change under which an ee171d2a save still migrates. The reviewer's probe over every pushed build gives the same result as before. architecture.md's "frozen" is now true. |
| FD-2 | introduced | low–medium | A `#s=` link replaces a spec's setup, yet the defaults notice said "Anything you changed yourself is kept". | Fixed in 5da1784b: `useDefaultsNotice` reads the link before it loads and leaves its spec out; with nothing else moved there's no notice. e2e for a link of the moved spec and of another spec. |
| FD-3 | introduced | low | A former default that is still a preset (`2-4530513321301551-502`, "Protection popular build") is moved too, even if the player chose the preset on purpose. | Waived: the two cases can't be told apart in a save from before `following`, and moving the untouched default is the point of the slice. The notice is softened (5da1784b): "Gear and talents you changed yourself are kept." |
| FD-4 | introduced | low | A slot a Unique rule or a two-hander kept from its default kept its old item, and the next save marked it as the player's for good. | Fixed in 5da1784b: `followDefaults` reports blocked slots; the store remembers what each held and keeps it in `following` while it does, so the next load retries. A change to the slot, or a replaced setup, makes it the player's. Unit tests. The race change's own blocked slots aren't kept this way (see below). |
| FD-5 | introduced | low | With storage too full for the save after the load, every visit migrated and announced again. | Fixed in 5da1784b: the notice records a digest of the move in its own key, `forever-sim:defaults-notice` (try/caught), and the same move isn't announced twice. Unit tests, with nearly full and blocked storage. |
| FD-6 | introduced | low | ux.md said share links, codes and saved setups are "never moved", but once loaded their default parts follow. | Fixed in 5da1784b: they "are loaded exactly as they are; after that, anything in them that is the default follows it" (ux.md and architecture.md). |
| FD-7 | introduced | low (UX) | The primary "Equip pre-raid best in slot" replaced up to 17 slots in one tap with no undo, and in the matching state it was a full-width button that did nothing. | Fixed in 7a7da8ee. D21 rules out an Undo toast, so the line says what the button replaces ("… Equipping it replaces all 17.", or "that slot"). In the matching state only the status shows, with no button. Focus moves to the status line as the button goes. The button stays 44 px. e2e at 390 and 1280 px. |
| FD-8 | introduced | low (UX gap) | The Talents tab had no line like Gear's saying the build is the default. | Fixed in 7a7da8ee: "Using the default build." with a check, in muted text, while the build is the default. e2e. |

## Left for the verification pass

- ~~Every pushed build from 2ee9cb28 to ee171d2a migrates fully. The earlier pushed build decd4c8c
  (M2.4i) doesn't …~~ Corrected by the verification pass (FV-4): every pushed build from 5166211e
  up migrates fully. f3d8b19e and decd4c8c fail only for the druid and paladin specs, which those
  builds didn't offer (`AVAILABLE`), so no save of theirs can hold those specs. Closed as
  unreachable.
- `changeRace` also uses `followDefaults`; a slot blocked there isn't remembered, so it becomes the
  player's at the next save (FD-4 covers the load only). Now in the milestones' known gaps (FV-5).

## Verdict

Ready to push: not yet. The fix commits need their verification pass (FD-1, FD-4 and FD-5 changed
load logic).

## Verification pass

A fresh reviewer's verification pass of a46dae34..7a7da8ee cleared the gate: every FD finding is
fixed or waived, and the fixes introduced nothing at medium or worse. Its five lows were answered in
a later round (c4656736, 617363ec, b0cdb0cf), for a quick fresh check of those commits.

Checks after the lows' fixes: lint ✓ · typecheck ✓ · `npm test` ✓ (117 files, 2588 tests) · e2e ✓
(gear-rules, follow-defaults, app: 37 passed). Screens: Gear after Remove all gear at 390 px dark and
1280 px light ("… Equipping it fills all 17.", the number kept on the line with "all").

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| FV-1 | low | introduced (FD-7) | Two differing slots read "Equipping it replaces all 2", and after Remove all gear the line said equipping *replaces* slots that held nothing. | fixed in c4656736: `equipEffect` (default-set.ts) says "that slot", "both" or "all N", "fills" for empty slots, and "fills 2 empty slots and replaces the other 3" for a mix; unit tests for each, the Gear e2e expects "fills all N" after Remove all gear, ux.md "Gear" gives the wording |
| FV-2 | low | introduced (FD-1) | `follow-defaults.frozen.test.ts` guarded FD-1 only through the paladin, whose `FORMER_GEAR` would recognise its gear even if `legacyFollowing` read live gear. | fixed in 617363ec: a Fury case (no `FORMER_GEAR`) mocks `defaultConfig` and `preRaidListGear` to a new helm, so its ee171d2a gear is recognised from the snapshot alone. With `legacyFollowing` temporarily reading live gear, the Fury case fails (the paladin's passes) |
| FV-3 | low | introduced (FD-2/FD-3) | `defaults-notice.ts`'s comment quoted the notice's old copy. | fixed in 617363ec: it quotes "Gear and talents you changed yourself are kept." |
| FV-4 | low | introduced (the log) | The leftover item said decd4c8c's saves don't migrate. Every pushed build from 5166211e up migrates fully; f3d8b19e and decd4c8c fail only for druid and paladin specs, which those builds didn't offer (`AVAILABLE`). | fixed: the item above is corrected and closed as unreachable |
| FV-5 | low | introduced (FD-4) | `changeRace` (`faction-gear.ts`) doesn't remember a slot its `followDefaults` blocked, so it becomes the player's at the next save. | known gap (b0cdb0cf, milestones.md): practically unreachable, since the factions' defaults differ only in non-unique PvP armour, which no Unique rule or two-hander blocks |
