# Tank results UI, T2 (2026-09-23)

For tank specs, the results show damage taken per second, how the boss's swings landed (below the
breakdown), and a character sheet with crit reduction and the boss's attack table, with a line
on crushing blows. A `?preview=<spec>` parameter shows an unfinished spec, but only in dev builds
and automated browsers. It's there so the tank e2e tests can run before Protection ships. The
commits are `4ebc293`..`9d5771e` on `main`, rebased onto the tank core.

## Full review (new work: UX, with a logic check)

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| TU1 | low | introduced | **The sheet's and the table's avoidance differ,** by the boss's 0.6-point skill, with no explanation. | fixed, `9d5771e` |
| TU2 | low | introduced | **"55.4% more avoidance" was ambiguous** (points or a relative increase?). | fixed, `9d5771e`: "Another 55.4 points of miss, dodge, parry or block…" |
| TU3 | low | introduced | **Better or worse was shown by colour alone.** | fixed, `eb7b694`: `Delta` says "better" or "worse" to screen readers |
| TU4 | low | introduced | **The damage-taken copy was incomplete.** | fixed, `9d5771e` |
| TU5 | low | introduced | **The sheet's labels clashed** (your crit and hit against the boss's). | fixed, `9d5771e`: "Normal hit", "Crit reduction (boss's crits)" |
| TU6 | low | introduced | **The landed section pushed the threat breakdown down.** | fixed, `90e2d41`: it moved below the breakdown |
| TU7 | low | introduced | **The lower-is-better path was untested.** | fixed, `eb7b694` |
| TU8 | low | introduced | **Stale milestones, and the branch was behind main.** | fixed: the lead rebased onto main; the milestones follow in the next batch (N2) |
| TU9 | nit | introduced | **A heading was read twice.** | fixed, `90e2d41` |
| TU10 | nit | introduced | **Crushing checked hits before the boss's level,** and "(Fight → Advanced)" wrapped. | fixed, `9d5771e` |

## Verification of the fixes and the rebase (D25)

Gate passes. Each fix has a test that fails when the fix is reverted. The lead's two conflict
resolutions (the ux.md Character sheet text, and the results panel's `defensive` and placeholder
logic) lose nothing from main. The `?preview=` gate still refuses unoffered specs for normal
visitors.

| # | Severity | Origin | Finding | Disposition |
| --- | --- | --- | --- | --- |
| N1 | low | introduced (the rebase) | **Three mechanics docs still say the tank results are "coming with T2".** | deferred to the next batch: remove the markers |
| N2 | low | introduced | **M3's bullet still says to enable the `fixme` tank tests.** They now run through `?preview=`. | deferred to the next batch |
| N3 | nit | introduced | **"A tank's add" in ux.md.** | deferred to the next batch |
| N4 | low | introduced | **The crit-reduction row's full width is untested.** | waived: layout only, and checked in screenshots |

Main after the fast-forward (`9d5771e`): lint ✓ · typecheck ✓ · unit ✓ (1131) · e2e ✓ (237).

## Verdict

**Ready to push: yes.**
