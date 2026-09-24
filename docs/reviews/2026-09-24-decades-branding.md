# Decades branding (2026-09-24)

The app carries the Decades guild's light branding ([ux.md#brand](../ux.md#brand)): the brand
tokens, the guild's lettering and logo files (`7e60bdd1`), the header's lockup and About's "Made by
Decades" (`a222783d`), and the docs (`367766ee`). The fix round (`bdf8893e`, `e16a0c66`) answers
the review below. `7bd112c0` adds the footer's "An app by Decades" at the user's request.

Range: `8553d5b9..` the head of this branch
Reviewers: a combined logic and UX review by a fresh reviewer who didn't write the change.
Checks: lint ✓ · typecheck ✓ · unit ✓ · e2e ✓ (`npm run test:full`, after the rebase onto main)
Screens reviewed: the header (320, 360, 390 and 1280 px, with the widest spec names at 320),
the header on hover and focus, About's top and its Decades section (390 and 1280 px), and the
footer (320, 360, 390 and 1280 px), each in light and dark.

## User decisions

These stand as decided, and the review didn't reopen them:

- **The light-mode logo is recoloured:** the guild's drawing in ink (#070710) and the light
  theme's gold, since the guild's own white and #c4a75e gold file is 2.3:1 on white.
- **The whole header lockup links to decades.gg in a new tab,** "Forever Sim" included: the guild
  wants the traffic.
- Added in the fix round: the header's byline reads **"Decades"** rather than "by Decades", and
  the footer adds **"An app by Decades"** to the right of the wago.tools credit.

## Findings

Each was introduced by this change.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| BR-1 | medium | At 320 px the header scrolled sideways for Marksmanship Hunter (339 px), Beast Mastery (338), Assassination Rogue (334) and Enhancement Shaman (332): the crest adds about 46 px. | fixed in `bdf8893e`: the switcher gives way (`min-w-0`, each line truncating as a safety net), and below 360 px the row's edge and gaps tighten and the crest and More reach into the edge (12 px freed; "Marksmanship" needed 11). Every shipped name now fits whole at 320 px, with every target 44 px. |
| BR-2 | low | The lockup's hover fill stuck after a tap on touch: `has-[a:hover]:bg-muted` isn't wrapped in `(hover: hover)`. | fixed in `bdf8893e`: `hover:` on the lockup (Tailwind wraps it in the media query); an e2e taps it on a phone and expects no fill. |
| BR-3 | low | On hover in light, the muted byline dropped to 4.35:1 on the hover fill. | fixed in `bdf8893e`: on hover it takes the text colour, as a ghost button's does. Measured: 18.2:1 light and 17.0:1 dark on the hover fill; at rest 4.74:1 and 7.68:1. An e2e checks it. |
| BR-4 | low | About's links disagreed: decades.gg opened a new tab and said so, and the repository, the open-questions doc and wago.tools didn't, though ux.md says doc links open a new tab. | fixed in `e16a0c66`: every About link opens a new tab with `rel="noopener"` and "(opens in a new tab)". `shell-focus.spec.ts` checks all four names, targets and 44 px. The footer's wago.tools link is unchanged: leaving the page from its end loses nothing. |
| BR-5 | low | ux.md principle 5 named only the gold as the brand's exception to neutral surfaces, but the dark theme's surfaces lean toward the guild's ink navy. | fixed in `bdf8893e`: principle 5 names both exceptions, as the Brand section does. |
| BR-6 | low | A screen reader heard the link ("by Decades: decades.gg…") before the page's heading, and sighted desktop users had no hint that the name was a link to another site. | fixed in `bdf8893e`: the name comes first in the DOM (`order-last` keeps the crest first on screen, and the link's `::after` still covers the lockup), and the link's `title` is "decades.gg (opens in a new tab)". An e2e checks the order. |
| BR-7 | low | The byline was 11 px, under the app's one type scale. | fixed in `bdf8893e`: `text-xs` (12 px). The lockup still fits at every width (checked at 640 and 660 px with the widest names). |
| BR-8 | low | About's line "Community first: we invest in our players." reads as marketing in a tool's About sheet. | waived: user decision. It's the guild's own positioning, and the guild keeps it. |
| BR-9 | low | No test covered the header at 320 px or the widest spec names. | fixed in `bdf8893e`: an e2e walks every spec at 320 px (no sideways scroll, no name truncated, 44 px targets), and the brand tests run at 320 px as well as 390 and 1280. |
| BR-10 | low | About never named the game in full, which the guild's content guide asks for ("World of Warcraft: Forever"). | fixed in `e16a0c66`: the description line, About's first mention of the game, gives the full name, and the page's meta and Open Graph descriptions share it. ux.md#brand notes that "WoW Forever" is the accepted short form after that. |

## The footer's credit (user request, `7bd112c0`)

"An app by" and the Decades mark sit beside "Game data from" and wago.tools' logo: the same muted
12 px lead-in (4.74:1 light, 7.68:1 dark), then a 44 px link holding a 24 px mark, as tall as
wago.tools' logo. The guild's full logo stacks its wordmark under the crest and can't be read at
24 px, so the mark is the crest with "DECADES" beside it in the guild's lettering (19.8:1 light,
19.0:1 dark; the hourglass 3.7:1 and 8.5:1). The two sit side by side on a wide screen and one
under the other on a phone. wago.tools' credit is unchanged (D16). It's new work in the fix
round, so the verification pass covers it as well as the fixes.

## Verdict

**Ready to push: not yet.** The fixes and the footer's credit need a verification pass by a fresh
reviewer, scoped to `bdf8893e..7bd112c0`.
