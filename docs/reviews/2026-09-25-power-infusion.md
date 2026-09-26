# Review: Power Infusion for Protection Paladin and casters (2026-09-25)

Scope: the user's request, "Power Infusion for Prot Pally as an optional buff, one cast on pull if
enabled, and for any spell DPS spec". The feature commit 6fa60127; the fix round 012b812e, 605dc736,
dac5cecf, e42a78a4; the verification fixes e6cf2bcb, 980e40ac, 28c8f743; the lead's PV fixes in
the merge b78293ea. One fresh reviewer did the logic and UX review together (a small feature), then
two verification passes and a quick check.

Power Infusion was already a caster Buffs entry pressed on cooldown; it now reaches the Protection
paladin too, and every spec gets one cast a fight: at the pull, or for an Arcane mage as its Arcane
Power ends (user decision, PIV-5). Off in every preset. Client 10060 (Forever = Classic Era): +20%
damage done for every magic school and +20% healing, 15 s, 3 min, no mana cut.

## Review (logic and UX)

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| PI-1 | medium | introduced | Arcane Power and Power Infusion stacked ×1.56. | Fixed, 012b812e: `yieldsTo`, PI yields to Arcane Power. Its source tag corrected by PIV-1. |
| PI-2 | low | introduced | PI multiplied a raid druid's Thorns on the paladin. | Fixed, 605dc736: `othersSpell`. |
| PI-3 | low | introduced | The doc didn't say pet damage doesn't gain. | Fixed, dac5cecf, with a test. |
| PI-4 | low | introduced | A stale comment. | Fixed, e42a78a4. |
| PI-5 | low | introduced | The once-only test covered two specs. | Fixed, dac5cecf: every spec, both profiles. |
| PI-6 | info | introduced | Casters now get one cast a fight, not one every 3 minutes. | Told the user; the release entry says so. |

## Verification pass 1

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| PIV-1 | medium | introduced by 012b812e | The yield rule was tagged [C], but no 2019+ Classic Era source supports it; every source traces to the 1.10.2 and 1.12.0 patch notes, which the doctrine forbids as evidence. | Fixed, e6cf2bcb: a D24 [?] placeholder whose origin is stated as not evidence; 0% error in every default setup. Guild checklist A9. |
| PIV-2 | low | introduced | `aEnds` holds one yielding aura per outranking aura. | Fixed, e6cf2bcb: the constructor throws on a second, with a test. |
| PIV-3 | low | pre-existing | A raid druid's Thorns takes a warrior tank's stance multiplier (0.22% TPS). | Known gap (docs/known-gaps.md): needs `magicMult` split. |
| PIV-4 | low | pre-existing | Two buffs open questions missing from the guild checklist. | Fixed, 980e40ac: A9, B81. |
| PIV-5 | — | user decision | An Arcane mage's PI did nothing at the pull. | Fixed, 28c8f743: it lands as Arcane Power ends: +1.58%. |

## Verification pass 2

Gate passes: nothing the fixes introduced at medium or worse. One cast in 20,000 of 20,000 fights,
at 15 s for Arcane; never recast at 180 s; the 33 changed fingerprints are exactly the setups with
both spells.

| id | severity | origin | finding | disposition |
|---|---|---|---|---|
| PV-1 | low | introduced | The Buffs summary still said "at the pull" for an Arcane mage. | Fixed in b78293ea: the summary leaves the timing to the Rotation row. |
| PV-2 | low | introduced | Missing commas in the Arcane help. | Fixed in b78293ea. |
| PV-3 | low | pre-existing | Doc lines gave only "once, at the pull". | Fixed in b78293ea: they name the Arcane case. |

The PV fixes and the reduced-motion rule (baf4c4bc, from the tooltips' VV-1) got a quick check; see
the tooltips log.
