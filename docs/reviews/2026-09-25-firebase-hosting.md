# Review: Firebase Hosting beside GitHub Pages (D35), 2026-09-25

Scope: d4044bb5 (the hosting config, the deploy job and the docs), the fix commits cf131c1b,
4d106b5b (the site renamed forever-sim, user decision) and 97441685, and the cloud setup the lead ran
with the user's approval: a Workload Identity pool and provider for this repository's `main`, the
`forever-sim-deploy` service account with Firebase Hosting Admin and Service Usage Consumer, the
`firebase` GitHub environment limited to `main`, and the iam, iamcredentials and sts APIs enabled.
No UI changes, so no UX review; the verification pass loaded the 404 page in both themes at 390,
1280 and 1920 px.

## Review

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| FH-1 | high | introduced | iamcredentials, sts and iam were disabled in decades-prod, so the keyless sign-in would fail and the Firebase deploy with it. | Fixed: enabled (user approved). |
| FH-2 | medium | introduced | Hosting roles are project-wide, so the deploy account could change decades-web too. | Accepted by the user (the Decades umbrella), written in D35; only this repository's `main` can use the account, and the CLI is pinned to a major, as decades_app pins it. |
| FH-3 | low | introduced | A 404 under `/assets/` carries the immutable header; hosts drifting during the DNS move could cache a missing chunk. | D35's cutover checklist checks both hosts serve the same commit first. |
| FH-4 | low | introduced | Firebase's default 404 page breaks the CSP. | Fixed: a branded `public/404.html`. |
| FH-5 | low | introduced | D35 said Pages goes at the cutover, which would break the github.io redirect and allow a domain takeover in between. | Fixed: D35's cutover checklist, in order. |
| FH-6 | low | introduced | CLAUDE.md and the README said Firebase already serves the domain. | Fixed: reworded. |
| FH-7 | low | pre-existing | A manual run on another branch can cancel main's deploy; re-running an old run's Firebase job would publish a stale build. | No change: the job's `if`, the environment and the provider all stop another branch from deploying; re-run only the latest run (noted here). |
| FH-8 | low | introduced | Nothing tests the header config in a browser. | Waived: the reviewer's emulator probe ran the whole e2e suite under the header policy once; the unit test holds the config to the documented table. |

## Verification pass

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| V3-1 | low | introduced | The architecture table didn't list `/404.html`, and its own meta policy wasn't documented. | Fixed, 97441685. |
| V3-2 | low | pre-existing | A missing hashed asset caches its 404 for a year. | Known gap in the milestones. |
| V3-3 | info | introduced | Keeping Pages' custom domain after DNS moves only keeps GitHub's github.io redirect. | No change. |

The gate passes for the hosting work: nothing the fixes introduced at medium or worse. The first
deploy to `forever-sim` happens with this release; a failure there doesn't block Pages.
