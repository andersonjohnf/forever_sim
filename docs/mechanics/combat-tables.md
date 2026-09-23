# Combat tables

How a level-60 player's attacks and spells land on a level-63 raid boss, and how the boss's
melee lands on a tank. Forever keeps Classic's attack-table *shape*: one roll for white
swings, glancing blows, crushing blows, defense 440 to be uncrittable. But its client
contradicts Classic Era on several numbers. The Forever client's own tooltips give a raid-boss
hit cap of **8% melee / 27% dual wield / 17% spells** (Classic Era: 9% / 28% / 16%) and boss
parry of **16.5%** (Classic Era: 14%). Its new weapon-skill panel computes weapon skill at
**0.04% per point** for hit, dodge, parry and crit, with a **25%** glancing penalty at
300 skill (Classic Era: 0.1–0.2% per point, 35%). None of this has been measured in game
yet: the beta is level-capped and its glancing damage is reported broken. So the engine
implements **two parameter profiles**, `forever` (the default, from client data) and
`classicEra` (the tested Classic Era table), behind one setting. A guild measurement can then
switch or patch it without code changes. Forever gear also carries **combat ratings** instead
of percentages, and one hit stat serves both the melee and spell tables. This doc consumes the
resulting percentages.

Status: researched 2026-09-22 · ruleset tags: [F] Forever · [C] Classic Era · [?] unverified
Client builds: Forever beta 1.60.1.69913 · Classic Era 1.15.9.69722

---

## What the sim needs

- A setting `attackTableProfile: "forever" | "classicEra"` (default `"forever"`). Every
  number that differs between the two lives in one profile object ([§1](#1-rules-profiles)).
- **White swings (player → boss):** one roll over `miss → dodge → parry → glancing → block
  → crit → hit`, with later outcomes truncated when the running total reaches 100%
  ([§2](#2-melee-attack-table-white-swings)).
- **Special (yellow) attacks** ([§3](#3-special-yellow-attacks)) [C]: specials that deal weapon
  damage (Heroic Strike, Mortal Strike, Whirlwind, Overpower, Shred, …) make **one** roll over
  `miss → dodge → parry → block → crit → hit`, like a white swing without glancing. Specials
  without a weapon-damage effect ("melee spells": Bloodthirst, Execute, Shield Slam, Revenge)
  make **two**: `miss → dodge → parry → block → lands`, then crit on anything that landed.
  Specials never glance and never take the dual-wield penalty.
- **Weapon skill vs defense**, per profile: miss, dodge, parry, glancing chance, glancing
  damage and crit ([§4](#4-weapon-skill-vs-defense)).
- **Hit suppression** only in `classicEra`: the first `(def − skill − 10) × 0.2%` of +hit is
  ignored when defense − skill > 10 ([§4.3](#43-hit-suppression)).
- **Crit suppression vs a +3 boss:** a weapon-skill part (profile-dependent) plus 1.8% taken
  from crit gained through auras ([§4.4](#44-crit-suppression)).
- **Dual wield:** +19% miss on white swings from either hand. An off-hand swing made while
  Heroic Strike or Cleave is queued ignores it ([§5](#5-dual-wield-and-on-next-swing-queues)).
- **Expertise** (Forever only): by default [?] it subtracts `E` percentage points from the
  boss's dodge and parry chances, per the Forever tooltip wording (hypothesis A, applied per
  [D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22);
  `unmeasuredRatings: 'ignore'` turns it off). It is **not** TBC's 0.25%-per-point formula. The
  combat effect is unmeasured ([§7](#7-expertise-forever)).
- **Weapon skill:** 300 + item bonuses per weapon type (usually 300–302). No racial bonuses
  in Forever ([§4.1](#41-effects-per-point)).
- **Position:** behind the boss (the DPS default) removes parry and block; bosses dodge from
  any direction ([§2.4](#24-attacking-from-behind-vs-the-front)).
- **Boss → player (tanks):** one roll over `miss → dodge → parry → block → crit → crushing
  → hit`, driven by defense skill ([§8](#8-boss--player-tanks)).
- **Spells (generic):** base miss 17% vs +3; the hit cap and the 1% floor depend on the
  profile. Two rolls (hit, then crit ×1.5). Partial resists are averaged, and Holy is never
  partially resisted ([§9](#9-spell-hit-and-crit-generic)).
- All inputs arrive as **percentages**. Forever gear carries ratings (hit 10, crit 14,
  dodge 12, parry 15, block 5 per 1%; defense 1:1). The conversions are [F] as displayed and in
  the client's `combatratings.txt`, and [?] in combat; expertise's 10 per 1% is [F] only in that
  game table (no tooltip prints it) and [?] in combat. One hit %
  serves the melee **and** spell tables. Converting ratings is owned by
  [character-stats.md](character-stats.md) ([§10](#10-ratings)).

---

## 1. Rules profiles

Doctrine tier 1 (Forever client data) outranks tier 3 (Classic Era), so `forever` is the
default. But its values come from the client's **UI text and UI code**, not from measured
combat. So:

- Per [doctrine §2](../doctrine.md#2-where-numbers-come-from-non-negotiable) ("verbatim mirrors
  of client files are client data"), a value read from the client's UI code or strings is
  **[F] for what the client displays or computes** (tagged "[F] client UI" or "[F] tooltip"),
  and **[?] for the combat behaviour it implies** until measured: the server may disagree with
  the display. So every `forever` value that differs from Classic Era is tagged
  "[F] client UI / tooltip; [?] in combat", keeps its place as the profile's default (checkable
  client data may drive the `forever` profile), and is listed in
  [Open questions](#open-questions) with a test. Values the client shows unchanged from Classic
  Era carry Classic's measured behaviour ([C]).
- `classicEra` keeps the measured Classic Era table, by Magey et al. on the 1.13 client
  ([Attack table][magey-at]).
- When the guild measures a value (doctrine tier 2), change the `forever` profile entry and
  cite the test. Don't add a third profile.

Where the client UI comes from: Blizzard's shipped Lua for the Forever character sheet
(`Camelot/PaperDollFrameStats.lua`, `Camelot/SkillsFrame.lua`) as mirrored from build
1.60.1.69913 in [Gethe/wow-ui-source@forever][ui-forever], and the client's enUS
GlobalStrings as mirrored in [Ketho/BlizzardInterfaceResources@forever][gs-forever]. The
strings quoted below exist only in the Forever client. Classic Era 1.15.9 has generic engine
strings with no numbers ([era strings][gs-era]).

### 1.1 Profile parameters (player level 60 vs boss level 63, defense 315)

"@300" means with 300 weapon skill, the level-60 cap without bonuses.

| Parameter | `forever` (default) | `classicEra` |
| --- | --- | --- |
| Base miss, special / single-weapon white @300 | 8.0% [F] tooltip `CR_WARRIOR_HIT_CAP_TOOLTIP` ([gs][gs-forever]); in combat [C] (unchanged) | 8.0% [C] ([Magey][magey-at]) |
| Miss change per weapon-skill point | 0.04% [F] client UI `GetHitDodgeParryChance` ([SkillsFrame][ui-skills]); [?] in combat | 0.2% if def − skill > 10, else 0.1% [C] ([Magey][magey-at]) |
| Hit suppression | none [F] tooltip: raid-boss cap 8.00% / 27.00% ([gs][gs-forever]); [?] in combat | `(def − skill − 10) × 0.2%` when def − skill > 10 [C] ([Magey][magey-at]) |
| Dual-wield white miss penalty | +19% [F] tooltip (27% − 8%, [gs][gs-forever]); in combat [C] (unchanged) | +19% [C] ([Magey][magey-at]) |
| Boss dodge @300 | 6.5% [F] tooltip `CR_EXPERTISE_TOOLTIP` ([gs][gs-forever]); `BASE_ENEMY_DODGE_CHANCE[3] = 6.5` ([stats Lua][ui-stats]); in combat [C] (unchanged) | 6.5% [C] ([Magey][magey-at]) |
| Dodge change per skill point | 0.04% [F] client UI ([SkillsFrame][ui-skills]); [?] in combat | 0.1% [C] ([Magey][magey-at]) |
| Boss parry @300 (front only) | **16.5%** [F] tooltip `CR_EXPERTISE_TOOLTIP` ([gs][gs-forever]); [?] in combat | 14% [C] (Blizzard, via [Magey][magey-at]) |
| Parry change per skill point | 0.04% [F] client UI ([SkillsFrame][ui-skills]); [?] in combat | 0 [?] (not established, see [§4.1](#41-effects-per-point)) |
| Boss block (front only) | 5% [C] ([Magey][magey-at]) | 5% [C] ([Magey][magey-at]) |
| Glancing chance | `10% + 2% × (def − min(skill, 300))` = 40% [F] client UI `GetGlancingBlowChance` ([SkillsFrame][ui-skills]); in combat [C] (unchanged) | same, 40% [C] ([Magey][magey-at]) |
| Glancing damage @300 | ×0.65–0.85, mean **×0.75** (25% penalty) [F] client UI `GetGlancingBlowPenalty` ([SkillsFrame][ui-skills]); [?] in combat (and reported broken on the beta) | ×0.55–0.75, mean ×0.65 (35% penalty) [C] ([Magey][magey-at]) |
| Crit change per skill point vs boss | 0.04% [F] client UI `GetCriticalHitChance` ([SkillsFrame][ui-skills]); [?] in combat | 0.2%, with skill capped at 300 [C] ([Magey][magey-at]) |
| Aura-crit suppression vs +3 | 1.8% [?] (carried over from Classic Era; unverified in Forever) | 1.8% [C] ([Magey crit suppression][magey-crit]) |
| Spell miss vs +3 | 17% [F] client UI `spellMissChances = {4,5,6,17}` ([stats Lua][ui-stats]); in combat [C] (unchanged) | 17% [C] ([AMR][amr-hit]) |
| Spell miss floor | 0% [F] tooltip "To never miss Raid Bosses: 17.00% Spells" ([gs][gs-forever]); [?] in combat | 1% (hit cap 16%) [C] ([AMR][amr-hit]) |
| Expertise | subtracts `E` points from dodge and from parry [?] (the tooltip wording is [F]; the combat effect is unmeasured; applied by hypothesis with the `unmeasuredRatings` switch, D12; [§7](#7-expertise-forever)) | n/a (no source in Classic Era) |

---

## 2. Melee attack table: white swings

### 2.1 Order and truncation

A white swing makes **one** roll `r ∈ [0, 100)` against the ordered table [C]
([Magey][magey-at]; [Marrow §3.1][marrow-mech]):

```
miss → dodge → parry → glancing → block → crit → hit
```

Truncation: walk the list and give each outcome `min(p, 100 − running_total)`. `hit` gets
whatever is left, which may be 0. So when miss + dodge + parry + glancing + block + crit
exceeds 100%, crit is squeezed out first. Anything above this is wasted crit (the **white
crit cap**):

```
white_crit_cap = 100 − miss − dodge − parry − glancing − block
```

Each outcome is clamped at ≥ 0 before truncation (for example, miss after more +hit than
the cap). Mobs of lower level than the player never glance, so this doc only covers mobs at
or above the player's level.

### 2.2 Outcome formulas

Symbols: `S` weapon skill of the weapon swinging, `D` target defense (= 5 × target level;
315 for a boss), `d` level difference (3), `H` total +hit %, `C` character-sheet melee crit %,
`E` expertise %.

**`forever` profile** (formulas [F] client UI and values at `S = 300` [F] tooltip, as the
client computes them; [?] in combat wherever they differ from `classicEra`):

```
k         = 0.04 × (D − S − 5·d)          // 0 at S = 300 vs a boss; −0.6 at S = 315
miss      = max(0, missBase[d] + k + (dwPenalty ? 19 : 0) − H)
dodge     = max(0, dodgeBase[d] + k − E)
parry     = front ? max(0, parryBase[d] + k − E) : 0
glance    = 10 + 2 × (D − min(S, 300))        // 40 vs a boss, whatever S is
block     = front ? 5 : 0
critTable = C − 0.04 × (D − S) − (d ≥ 3 ? min(auraCrit, 1.8) : 0)
```

| `d` | `missBase` | `dodgeBase` | `parryBase` |
| --- | --- | --- | --- |
| 0 | 5.0 [F] tooltip ([gs][gs-forever]) | 5.0 [F] ([stats Lua][ui-stats]) | 5.0 [F] tooltip ([gs][gs-forever]) |
| 1 | 5.5 [C] ([Magey][magey-at]) | 5.5 [F] ([stats Lua][ui-stats]) | 5.5 [?] |
| 2 | 6.0 [C] ([Magey][magey-at]) | 6.0 [F] ([stats Lua][ui-stats]) | 6.0 [?] |
| 3 | 8.0 [F] tooltip ([gs][gs-forever]) | 6.5 [F] ([gs][gs-forever]) | 16.5 [F] tooltip ([gs][gs-forever]); [?] in combat |

The `+1`/`+2` rows only matter for trash; the sim's boss is always `d = 3`.

**`classicEra` profile** [C] ([Magey][magey-at]):

```
diff      = D − S
missBase  = 5 + (diff > 10 ? 0.2 : 0.1) × diff    // 8.0 at S = 300; 6.0 at S = 305
supp      = diff > 10 ? (diff − 10) × 0.2 : 0     // hit suppression, §4.3
miss      = max(0, missBase + (dwPenalty ? 19 : 0) − max(0, H − supp))
dodge     = max(0, 5 + 0.1 × diff)
parry     = front ? (d ≥ 3 ? 14 : 5 + 0.5 × d [?]) : 0   // +1/+2: Magey measured 5.75 / 6.55
glance    = 10 + 2 × (D − min(S, 300))
block     = front ? min(5, 5 + 0.1 × diff) : 0      // mobs never block more than 5%
critTable = C − 0.2 × (D − min(S, 300)) − (d ≥ 3 ? min(auraCrit, 1.8) : 0)
```

`auraCrit` is crit from auras: talents, `Equip:` crit on gear, buffs and consumables, but not
crit from Agility [C] ([Magey][magey-at]). At level 60 every modeled spec has at least 1.8%
of it, so in practice the full 1.8% always applies.

### 2.3 Glancing blows

- Only **white melee swings** by a player against a mob of **equal or higher level** can
  glance [C] ([Magey][magey-at]; [Marrow §3.2.2][marrow-mech]). Specials, ranged attacks
  and procs never glance [C].
- Chance vs a boss: **40%** in both profiles. Extra weapon skill above 300 does **not**
  lower it, because skill is capped at `5 × player level` in the chance formula [F]
  ([SkillsFrame][ui-skills]); [C] ([Magey][magey-at]).
- Damage: each glancing blow deals `uniform(low, high)` × the unmitigated hit.

`classicEra` [C] ([Magey][magey-at]):

```
diff = D − S
low  = clamp(1.30 − 0.05 × diff, 0.01, 0.91)
high = clamp(1.20 − 0.03 × diff, 0.20, 0.99)
```

`forever` [F] client UI (`GetGlancingBlowPenalty`, [SkillsFrame][ui-skills]); [?] in combat:

```
diff = D − S
low  = 1.30 − 0.05 × diff + (diff > 10 ? 0.10 : 0);  low  = clamp(low, 0.01, 0.91)
high = 1.20 − 0.03 × diff + (diff > 10 ? 0.10 : 0);  high = clamp(high, 0.20, 0.99)
```

The UI shows the mean penalty, `1 − (low + high)/2`. Because of the `+0.10` term, the
`forever` penalty is **not monotonic** in skill: 25% at 300, 9% at 304, then 15% at 305.
That looks like a UI bug or an unfinished design. It doesn't matter at 300 skill, which is
nearly everyone in Forever (weapon-skill racials are gone), but see
[Open questions](#open-questions). Magey reports that beta glancing *damage* against
higher-level mobs is currently broken, while the glancing *chance* is fine. His educated guess
for the fixed penalty is 25%, which matches the UI ([magey/forever-warrior#1][fw-1]).

### 2.4 Attacking from behind vs the front

| Outcome | From behind | From the front | Tag / source |
| --- | --- | --- | --- |
| Dodge | yes (mobs dodge from any direction) | yes | [F] tooltip `CR_DODGE_BASE_STAT_TOOLTIP` "For Creatures, Melee attacks may be Dodged from any direction" ([gs][gs-forever]); [C] ([Marrow §3.1][marrow-mech]) |
| Parry | no | yes | [F] tooltip `CR_PARRY_BASE_STAT_TOOLTIP` "Only Melee attacks from the front may be Parried" ([gs][gs-forever]); in combat [C] ([Marrow §3.1][marrow-mech]: from behind a mob can't parry or block) |
| Block | no | yes | [F] tooltip `STAT_BLOCK_VALUE_FLAT_TOOLTIP` "Only Melee and Ranged attacks from the front may be Blocked" ([gs][gs-forever]); in combat [C] ([marrow-mech]) |

- **Default:** DPS specs attack from behind. Tanks (Prot warrior, Prot paladin, bear) attack
  from the front, so their table includes parry and block, and every parry hastes the boss
  ([damage-and-timing.md](damage-and-timing.md#parry-haste)).
- **Which bosses parry or block.** Assume every boss can dodge, parry and block. Per-creature
  "cannot parry/block/dodge" flags are server-side and not in the client. No Forever raid boss
  data exists yet (raids unlock 2026-12-09), so they are encounter toggles
  ([encounter.md](encounter.md#encounter-settings)) [?].
- A blocked hit from a mob loses the mob's block value. That value isn't known for Classic
  Era or Forever, so the sim uses **0** (a block is treated as a normal hit, but still
  consumes the crit/hit slice) [?].

---

## 3. Special (yellow) attacks

Yellow attacks are instant and on-next-swing abilities: Heroic Strike, Cleave, Maul,
Bloodthirst, Mortal Strike, Shred, Holy Strike and so on.

- **Weapon-damage specials: one roll** [C]. Abilities whose client effect is weapon damage
  (effects 17, 58, 121 or 31: Heroic Strike, Cleave, Mortal Strike, Whirlwind, Overpower,
  Slam, Spearing Strike, Holy Strike, Shred, Claw, Maul, Mangle, …) roll once over
  `miss → dodge → parry → block → crit → hit`, truncated like the white table (§2.1) but with no
  glancing slice. So they can't be blocked and crit at once. Source: in 2020 the Classic
  community's log analysis (Fight Club #dps-tc, relayed in
  [WarriorSim issue #20][ws-issue20]) found that only Bloodthirst, Execute, Shield Slam and
  Revenge roll twice and "all other yellows should be single roll". WarriorSim implemented that
  before SoD ([commit 474f8b8][ws-singleroll], 2020-05-08; present in [180a3cc][ws-player]).
  Marrow's Classic compendium agrees in substance: "Yellow attacks function exactly like white
  attacks, except they cannot glance" ([Marrow §3.1][marrow-mech]).
- **"Melee spells": two rolls** [C] (same sources). Specials with no weapon-damage effect
  (Bloodthirst, Execute, Shield Slam, Revenge) roll 1 over `miss → dodge → parry → block →
  lands`, and roll 2 for crit on anything that landed, including blocked hits.
- Mapping other classes' non-weapon specials (Ferocious Bite, Swipe, Rake's initial hit, damage
  judgements) onto this split by effect type is an inference [?]; the class docs list them.
- **Bleed applications with no direct damage** (Rend) roll once for miss, dodge and parry;
  anything else lands the bleed, and there is no crit roll, since the application deals no
  damage ([warrior §3.1, §7](../classes/warrior.md#7-implementation-notes)). Whether its ticks
  crit is [damage-and-timing §4](damage-and-timing.md#4-dots-and-bleeds).
- *Not adopted:* two rolls for **every** special, the vanilla-era model on the
  [ZAM hit table][zam-hit] page (a forbidden, pre-Classic source). Nothing Classic Era supports
  it. With ~10% avoidance, it gives ~10% fewer yellow crits than one roll. Magey's Forever test
  plan asks whether crit is "still two-roll" ([magey/forever-warrior#1][fw-1]); that is a
  question, not evidence. See [Open questions](#open-questions).
- **No glancing.** Specials never glance [C] ([Marrow §3.1][marrow-mech]).
- **No dual-wield penalty.** Specials use the single-weapon miss chance even when dual
  wielding [C] ([AMR][amr-hit]; [Magey][magey-at]).
- Miss, dodge, parry, block and suppression use the same profile formulas as white swings
  ([§2.2](#22-outcome-formulas)). `classicEra` hit suppression applies to specials too, so
  the yellow hit cap is 9% at 300 skill.
- **Crit:** `critTable` from §2.2, plus ability-specific bonuses (e.g. Improved Overpower). For
  weapon-damage specials it is truncated like the white table, but with no glancing slice the
  yellow crit cap is `100 − miss − dodge − parry − block`, far above the white one. For melee
  spells, roll 2 isn't truncated by the roll-1 outcomes [C] ([ws-player]).
- **Defense type.** Each ability's client `DefenseType` picks its table [F] (per-spell values
  come from the class docs' own `SpellCategories` reads, e.g.
  [warrior §3.1](../classes/warrior.md#31-damage-abilities) and
  [paladin conventions](../classes/paladin.md#conventions-used-below), confirmed in the raw
  client files: [F] [client] (SpellCategories, 1.60.1.69913); [wowsims/forever spell data][wf-spelldata]
  reads the same):
  - `Melee`: the table above.
  - `Ranged`: miss, then block (front only), then crit roll 2. No dodge or parry, because
    creatures dodge and parry melee only [F] tooltips ([gs][gs-forever]).
  - `Magic`: the spell table ([§9](#9-spell-hit-and-crit-generic)).
  - `None`: always hits (may still crit if the ability says so).
  - Which abilities are unblockable, undodgeable and so on is owned by the class docs.

---

## 4. Weapon skill vs defense

### 4.1 Effects per point

| Effect | `forever` | `classicEra` |
| --- | --- | --- |
| Miss | −0.04% per point above 300 [F] client UI ([SkillsFrame][ui-skills]); [?] in combat | −0.2%/pt while def − skill > 10, −0.1%/pt at ≤ 10 [C] ([Magey][magey-at]) |
| Dodge | −0.04%/pt [F] client UI ([SkillsFrame][ui-skills]); [?] in combat | −0.1%/pt [C] ([Magey][magey-at]) |
| Parry | −0.04%/pt [F] client UI ([SkillsFrame][ui-skills]); [?] in combat | not established [?]: Magey measured 13.49% ±0.40 at 305 but 14.01% at +9 skill ([Magey][magey-at]); the profile keeps 14% flat |
| Block (mob) | none (capped at 5%) [C] ([Magey][magey-at]) | none [C] |
| Glancing chance | none: skill capped at 300 [F]/[C] | none [C] |
| Glancing damage | per the UI formula in [§2.3](#23-glancing-blows) [F] client UI; [?] in combat | per Beaza's formula [C] |
| Crit vs boss | +0.04%/pt, uncapped [F] client UI ([SkillsFrame][ui-skills]); [?] in combat | none above 300 (skill capped at 300 for crit vs mobs) [C] ([Magey][magey-at]) |
| Hit suppression | none [F] tooltip; [?] in combat | removed at def − skill ≤ 10, i.e. 305+ skill [C] |

**Is weapon skill now fixed at 300?** No, but 300 is the normal case at level 60.

- The base skill is `5 × level` = 300 [C]; [F] (the Forever skills panel caps glancing and
  crit at `UnitLevel × 5`, [SkillsFrame][ui-skills]).
- **Racials no longer give weapon skill.** They were removed or turned into crit (Human Sword
  Specialization, Orc Axe Specialization, Dwarf Mace Specialization) [F]
  ([foreverchanges racials][fc-racials]; [Blizzard Deep Dive][bz-deepdive]).
- **Items still can, in small amounts.** "Weapon skill still works as it always has, but
  items with weapon skill offer less of it per item" [F] ([bz-deepdive]). From the item diffs
  [F] ([foreverchanges items][fc-items]):
  - Huge Thorium Battleaxe: +10 two-handed axes → **+2**.
  - Servomechanic Sledgehammer: +7 two-handed maces → **+1**, plus +10 Expertise Rating.
  - Dwarven Tree Chopper: +2 two-handed axes → +6 Expertise Rating and no skill.
  - Hands of Thero-shan and Death's Sting keep +4 and +3 daggers.
  - The BlizzCon slide shows Edgemaster's Handguards at +1 instead of +7 [F]
    ([Warcraft Tavern][wt-skill]; [Output Lag][ol-stats]).
  - Most Classic pre-raid weapon-skill items (Edgemaster's Handguards, Mugger's Belt,
    Distracting Dagger, Obsidian Edged Blade, …) have **no Forever data yet**.
- The sim computes `skill = 300 + Σ item bonuses for that weapon type` per hand, and it will
  usually be 300–302. Talents that grant skill are class-doc territory.

### 4.2 Table vs a level-63 boss (defense 315)

"DW miss" is the white miss when dual wielding. "Hit cap" is the +hit that brings miss to 0.
Crit suppression assumes ≥ 1.8% aura crit.

**`forever`** ([F] as the client UI and tooltips compute it; [?] in combat where it differs from
`classicEra`; see [§1.1](#11-profile-parameters-player-level-60-vs-boss-level-63-defense-315)):

| Skill | Miss / yellow cap | DW miss / DW cap | Dodge | Parry (front) | Glance chance | Glance dmg (low–high, mean) | Crit suppression |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 300 | 8.00% | 27.00% | 6.50% | 16.50% | 40% | 0.65–0.85, 25% | 0.60 + 1.8 = **2.40%** |
| 305 | 7.80% | 26.80% | 6.30% | 16.30% | 40% | 0.80–0.90, 15% | 0.40 + 1.8 = 2.20% |
| 308 | 7.68% | 26.68% | 6.18% | 16.18% | 40% | 0.91–0.99, 5% | 0.28 + 1.8 = 2.08% |
| 310 | 7.60% | 26.60% | 6.10% | 16.10% | 40% | 0.91–0.99, 5% | 0.20 + 1.8 = 2.00% |
| 315 | 7.40% | 26.40% | 5.90% | 15.90% | 40% | 0.91–0.99, 5% | 0.00 + 1.8 = 1.80% |

**`classicEra`** [C] ([Magey][magey-at]; [Marrow table 3.2][marrow-mech]):

| Skill | Miss | Yellow hit cap | DW miss | DW hit cap | Dodge | Parry (front) | Glance chance | Glance dmg (low–high, mean) | Crit suppression |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 300 | 8.0% | 9.0% | 27.0% | 28.0% | 6.5% | 14% | 40% | 0.55–0.75, 35% | 3.0 + 1.8 = **4.8%** |
| 305 | 6.0% | 6.0% | 25.0% | 25.0% | 6.0% | 14% | 40% | 0.80–0.90, 15% | 4.8% |
| 308 | 5.7% | 5.7% | 24.7% | 24.7% | 5.7% | 14% | 40% | 0.91–0.99, 5% | 4.8% |
| 310 | 5.5% | 5.5% | 24.5% | 24.5% | 5.5% | 14% | 40% | 0.91–0.99, 5% | 4.8% |
| 315 | 5.0% | 5.0% | 24.0% | 24.0% | 5.0% | 14% | 40% | 0.91–0.99, 5% | 4.8% |

Magey's measured glancing penalties (Classic, 1.13): 35.12% at diff 15, 26.74% at 13, 14.82%
at 10, 5.12% at 7 ([Magey][magey-at]).

### 4.3 Hit suppression

`classicEra` only [C]. When target defense − weapon skill > 10, the first
`(def − skill − 10) × 0.2%` of +hit from gear and talents is ignored: 1.0% at 300 skill, 0.2%
at 304, none at 305+ (Blizzard, via [Magey][magey-at]). It applies to white and yellow
attacks and to both hands.

`forever`: none, [F] tooltip; [?] in combat. The Forever tooltips give raid-boss caps of 8.00%
melee and 27.00% dual wield ([gs][gs-forever]), which are the base miss chances with no
suppression. Magey lists "Hit suppression: is it still
`(TargetLevel*5 - AttackerSkill - 10) * 0.2%` … or is it gone?" as untested
([magey/forever-warrior#1][fw-1]). See [Open questions](#open-questions).

### 4.4 Crit suppression

Against a +3 boss, table crit = sheet crit − (skill part) − (aura part):

- **Skill part.** `classicEra`: `0.2% × (315 − min(skill, 300)) = 3.0%` at any skill ≥ 300
  [C] ([Magey][magey-at]). `forever`: `0.04% × (315 − skill)`, which is 0.6% at 300 [F] client
  UI ([SkillsFrame][ui-skills]); [?] in combat.
- **Aura part.** `min(auraCrit, 1.8%)`, where auraCrit is crit gained from auras (talents,
  gear `Equip:` crit, buffs, consumables). Measured ~1.8% ±0.17 over 60k hits [C]
  ([Magey crit suppression][magey-crit]). In `forever`, gear crit is a *rating*
  ([§10](#10-ratings)), so whether it still counts as "aura" crit is unknown. It
  doesn't matter at 60, where talents and buffs alone exceed 1.8% [?].
- Crit suppression applies to melee and ranged physical attacks (white and yellow), not to
  spells ([§9](#9-spell-hit-and-crit-generic)).

---

## 5. Dual wield and on-next-swing queues

- **Penalty.** While a character wields two weapons, every **white** swing from either hand
  has +19% miss [C] ([Magey][magey-at]: PTR data 2021 disproved the older `0.8 × miss + 20%`
  formula). Forever tooltip: raid-boss dual-wield cap 27.00% = 8% + 19% [F]
  ([gs][gs-forever]).
- **Specials** never take the penalty [C] ([AMR][amr-hit]).
- **Heroic Strike / Cleave queued.** While an on-next-swing ability is queued on the main
  hand, off-hand white swings use the single-weapon miss chance, with no +19%. Blizzard
  confirmed this for vanilla and TBC, and classified it "not a bug" for Classic in 2019 [C]
  ([Blizzard forum][bnet-hsq], linked from [magey/forever-warrior#2][fw-2]). Both profiles keep
  it. A third-party level-20 beta test found it still present in Forever: 5.19% off-hand miss
  while queued vs 18.27% unqueued (77 vs 394 swings, small sample, addon-based) [?]
  ([magey/forever-warrior#2][fw-2]); a guild repeat would make it [F]
  ([Open questions](#open-questions)).
  - Implement it as a flag on the off-hand swing: `dwPenalty = dualWielding &&
    !mainHandQueue.active`. The main-hand queued ability itself is a special (§3).
  - Forever adds off-hand-only hit (`CR_HIT_OFFHAND_MELEE_TOOLTIP`, from Dual Wield
    Specialization) [F] ([gs][gs-forever]). Talent values are in
    [classes/warrior.md](../classes/warrior.md).

---

## 6. Hit caps

Hit cap = the +hit % that brings miss to 0 on that table.

| Case | `forever` @300 | `classicEra` @300 | `classicEra` @305 | Source |
| --- | --- | --- | --- | --- |
| Specials; 2H or single-weapon white | **8%** | 9% | 6% | [F] tooltip [gs][gs-forever], [?] in combat; [C] [Magey][magey-at] |
| Dual-wield white | **27%** | 28% | 25% | [F] tooltip [gs][gs-forever], [?] in combat; [C] [Magey][magey-at] |
| Off-hand white while HS/Cleave is queued | 8% | 9% | 6% | [C] rule ([bnet-hsq]; [Magey][magey-at]); Forever: third-party test agrees [?] ([fw-2]) |
| Spells vs +3 | **17%** | 16% | 16% | [F] tooltip [gs][gs-forever], [?] in combat; [C] [AMR][amr-hit] |
| Melee vs an equal-level mob | 5% | 5% | – | [F] tooltip [gs][gs-forever]; [C] |
| Spells vs an equal-level mob | 4% | 3% | – | [F] tooltip [gs][gs-forever], [?] in combat; [C] (1% floor) |

**In rating terms** (10 Hit Rating = 1%, as displayed, [§10](#10-ratings)):

| Cap | `forever` @300 | `classicEra` @300 (for comparison) |
| --- | --- | --- |
| Specials / 2H white | **80** Hit Rating | 90 |
| Dual-wield white | **270** | 280 |
| Spells vs +3 | **170** | 160 |

**One hit stat for both tables.** In Forever, melee, ranged and spell hit are one stat on gear
[F] ([Blizzard Deep Dive][bz-deepdive]). The foreverchanges item data shows it: Classic items'
melee-hit and spell-hit lines both became the one "Hit Rating" stat [F]
([items dataset][items-ratings]). The client's CombatRatings rows for melee, ranged and spell hit
are all 10 per 1% as read by wowsims ([wf-cr], secondary; corroboration only). The sim
therefore feeds one gear hit % into §2, §3 and §9. Whether 10 rating really gives 1% in
**both** tables in combat vs a level-63 boss hasn't been measured [?]. Class talents may still
add hit to only one kind.

Worked hit-cap examples are in [Worked examples](#worked-examples) (WE-1, WE-2, WE-5).

---

## 7. Expertise (Forever)

What the Forever client **says** [F] (displayed text; not a measured combat effect):

- Blizzard: "Some items can reduce the chance for attacks to be parried or dodged"
  ([Blizzard Deep Dive][bz-deepdive]).
- Item tooltip: "Equip: Reduces chance to be Dodged or Parried by X.X%"
  (`TOOLTIP_ITEM_STAT_EXPERTISE_PCT_INCREASE`). Character sheet: "Increase the chance Melee
  attacks are not Dodged or Parried by X", listing raid-boss dodge 6.50% / parry 16.50%
  (`CR_EXPERTISE_TOOLTIP`) ([gs][gs-forever]).
- Conversion: **10 Expertise Rating = 1%**, [F] in the client's `combatratings.txt` and [?] in
  combat. The item tooltip template prints a percentage, but foreverchanges' item data shows only
  "+N Expertise Rating", so the ratio comes only from the game table ([§10](#10-ratings)).
  Sources in or near the pre-raid pool: Adaptive Combat Assistant +20 rating (2%), a Tier 1
  4-piece tank bonus of 12 rating (1.2%), and the Flask of Natural Precision at 5% (Hyjal
  zones only) [F] ([items dataset](../data/items.md#forevers-ratings-f-with-open-questions);
  [wowsims/forever#34][wf-34]).

What is **not known** [?]: what expertise does in combat.

- **Hypothesis A (sim default):** it subtracts `E` percentage points from the boss's dodge
  **and** from its parry, clamping each at 0, on melee attacks (white and yellow). This is the
  literal reading of the Forever tooltips. Per
  [D12](../decisions.md#d12-unmeasured-forever-ratings-apply-by-hypothesis-with-a-switch-2026-09-22)
  the `forever` profile applies it, and `unmeasuredRatings: 'ignore'` sets `E = 0`.
- **Hypothesis B:** it works like extra weapon skill. Forever replaced weapon skill with
  Expertise Rating on two low-level items at inconsistent ratios (Dwarven Tree Chopper
  "+2 two-handed axes" → "+6 Expertise Rating"; Servomechanic Sledgehammer "+7" → "+1 skill,
  +10 Expertise Rating") ([items dataset](../data/items.md#forevers-ratings-f-with-open-questions)),
  which hints that designers see it as a weapon-skill substitute.
- **Not adopted:** TBC's expertise model (2.5 rating per expertise point, 0.25% per point,
  floored). It's a forbidden ruleset, and the Forever client formats expertise directly as a
  percentage with one decimal. Also not adopted: the retail-derived `GetEnemyParryChance` in
  `Camelot/PaperDollFrame.lua`, which spends expertise on dodge first. Its
  `BASE_ENEMY_PARRY_CHANCE` table is retail's `{-1.5, 0, 1.5, 3}`, left over from the Mainline
  file, so it isn't Forever logic ([ui source][ui-forever]).
- At pre-raid levels (0–2%) the two hypotheses differ by well under 1% DPS for DPS specs,
  which attack from behind where only dodge matters. They matter more for tanks.

Classic Era has no expertise. In `classicEra` the stat is ignored.

---

## 8. Boss → player (tanks)

The boss's weapon skill is `5 × 63 = 315` [F] (`GetEnemySkillDifference`,
[stats Lua][ui-stats]); [C]. Let `Df` be the tank's total defense skill.

**One roll**, in this order [C]:

```
miss → dodge → parry → block → crit → crushing → hit
```

| Outcome | Formula vs a level-63 boss | Tag / source |
| --- | --- | --- |
| Miss | `5% + (Df − 315) × 0.04%` (clamped ≥ 0) | [F] client UI `GetEnemyChanceToMiss` ([stats Lua][ui-stats]); in combat [C] (unchanged; [Magey][magey-at] "target is a player") |
| Dodge | `sheetDodge − 0.6%` (the sheet assumes a level-60 attacker; each point of attacker skill above 300 costs 0.04%) | [C] ([Magey][magey-at]) |
| Parry (front, can parry) | `sheetParry − 0.6%` | [C] ([Magey][magey-at]) |
| Block (front, shield) | `sheetBlock − 0.6%` | [C] ([Magey][magey-at]) |
| Crit | `max(0, 5% + (315 − Df) × 0.04%)`: 5.6% at 300, **0 at 440 defense** | [F] client UI `GetEnemyCritChance` ([stats Lua][ui-stats]); tooltip "At 440 Defense, cannot be Critically Hit by Raid Bosses (-5.60% Critical Strike chance)" ([gs][gs-forever]); in combat [C] (the Classic rule, unchanged) |
| Crushing | `(315 − min(Df, 300)) × 2% − 15%` = **15%** vs a boss whatever your defense; only from attackers 3+ levels above | [F] client UI `GetEnemyCrushingBlowChance` ([stats Lua][ui-stats]); tooltip ([gs][gs-forever]); in combat [C] (the Classic rule, unchanged) |
| Hit | remainder | |

- **Multipliers:** creature crit ×2.0; crushing blow ×1.5 [F] tooltip
  `DEFAULT_STATDEFENSE_TOOLTIP` ([gs][gs-forever]); [C].
- **Block:** a blocked hit loses the tank's **block value**, down to a minimum of 0. Crushing
  blows and crits can't be blocked, because they're separate outcomes of the one roll [C].
  Block value = shield block value + Strength/20 [F] (`BLOCK_VALUE_PER_STRENGTH = 20`,
  [stats Lua][ui-stats]). The stat pipeline is in [character-stats.md](character-stats.md).
- **Truncation:** the same as §2.1. Crushing blows fall off the table once
  `miss + dodge + parry + block + crit ≥ 100%` vs the boss. At 440+ defense (crit 0) that's the
  classic "uncrushable" point: sheet dodge + parry + block + miss ≥ **102.4%**, because the
  boss's 315 skill costs 0.6% on each of the four [C].
- **Diminishing returns:** none on avoidance [C]. The Forever dodge/parry tooltips drop the
  engine's "(Before diminishing returns)" line that Classic Era's generic strings carry [F]
  ([gs][gs-forever] vs [era strings][gs-era]).
- **Direction:** a player can only dodge, parry or block attacks from the front [F]
  ([gs][gs-forever]). Tanks face the boss.
- **Bear form** can't parry or block (no parry skill in form; no shield) [C]. Class details
  are in [classes/druid.md](../classes/druid.md).
- **Parry haste** also applies to the tank: a parry hastens the tank's own next swing
  ([damage-and-timing.md](damage-and-timing.md#parry-haste)).
- **Armor:** the boss is level 63, so the mitigation constant is `400 + 85 × 63 = 5755`
  ([damage-and-timing.md](damage-and-timing.md#1-armor)).
- **Rage from damage taken** is in [rage.md](rage.md).
- **Converting defense rating:** 1 Defense rating = 1 defense skill in Forever [F]
  ([§10](#10-ratings)).

---

## 9. Spell hit and crit (generic)

Which paladin and druid effects use the spell table is owned by the class docs. This section
covers the generic table.

| Rule | Value | Tag / source |
| --- | --- | --- |
| Base spell miss vs level +0 / +1 / +2 / +3 | 4% / 5% / 6% / **17%** | [F] `spellMissChances = {4,5,6,17}` ([stats Lua][ui-stats]); [C] ([AMR][amr-hit]) |
| Floor ("always 1% miss") | `classicEra`: 1% (max 99% hit, cap 16% vs +3) | [C] ([AMR][amr-hit]) |
| | `forever`: 0% (tooltip "To never miss Raid Bosses: 17.00% Spells"; equal-level cap 4.00%) | [F] tooltip ([gs][gs-forever]); [?] in combat, see [Open questions](#open-questions) |
| Spell hit from gear | same hit % as melee (unified stat) | [F] ([Blizzard Deep Dive][bz-deepdive]) |
| Roll structure | roll 1 hit/miss; roll 2 crit on landed spells | [C] (the pre-SoD WarriorSim's `magicproc`: a miss roll, then a crit roll, [ws-player]) |
| Spell crit damage | ×1.5 ("Spell and Healing critical strikes are 50% more effective") | [F] tooltip `STAT_CRIT_BONUS` ([gs][gs-forever]); [C] |
| Spell crit suppression vs +3 | none | [C] (the pre-SoD WarriorSim applies none, [ws-player]). An SoD sim uses 2.1%; **not adopted**, see [Open questions](#open-questions) |
| Dodge / parry / block / glancing | never, for spells | [C] |

**Resistances (non-Holy schools)** [C]:

- **Binary spells** (spells with a non-damage effect, such as a slow or a debuff) either fully
  land or are fully resisted. Chance to resist =
  `miss + (1 − miss) × avgResist`.
- **Non-binary** (pure damage) spells can be partially resisted. A simple sim applies the
  **average** reduction: `damage × (1 − avgResist)`.
- `avgResist = 0.75 × R / (5 × casterLevel)` for caster level 60, where `R` = target
  resistance − spell penetration, plus the target's level-based resistance. The formula is
  [F] (`ExpectedSpellResistance`, [stats Lua][ui-stats]) and [C].
- Level-based resistance for a +3 boss: **24** (8 per level) [?]. That's WarriorSim's
  default target resistance for Classic ([WarriorSim][ws-repo]); other sources say ~15. This
  only affects nature/fire/shadow procs (e.g. item procs) in these specs.
- Resistance reduction caps at 75% (`R = 5 × level`) [C]; [F] ([Warcraft Tavern stats][wt-stats]).
- **Forever:** spell penetration can push a target **below 0** resistance ("Spell
  Vulnerability"), which increases the spell damage it takes [F] tooltip text
  `SPELL_PENETRATION_TOOLTIP` ([gs][gs-forever]); in combat [?], like negative armor
  ([damage-and-timing OQ 12](damage-and-timing.md#open-questions)). A negative `R` gives a
  negative `avgResist`, which increases damage.

**Holy:** there is no Holy resistance, so Holy damage is never partially resisted [C];
[F] (Holy isn't among the resistances, [Warcraft Tavern stats][wt-stats]). Holy spells still
roll spell hit and can miss [C].

---

## 10. Ratings

Forever rewrites Classic's percentage stats on items as **combat ratings**: Hit, Crit, Haste,
Expertise, Dodge, Parry, Block and Defense, plus new Armor Penetration and Health Regeneration
stats. The in-game item tooltips show them as percentages again [F] (`TOOLTIP_ITEM_STAT_*_PCT_*`
strings, [gs][gs-forever]). The foreverchanges item data gives the conversions for the old stats,
and the client's `combatratings.txt` game table agrees; neither varies with level:

| Rating | Per 1% (or per defense point) | Tooltip-ratio samples (items dataset) | Tag / source |
| --- | --- | --- | --- |
| Hit (one stat: melee = ranged = spell) | 10 | 152 | [F] as displayed ([items dataset][items-ratings]); [F] [client] (`combatratings.txt`, 1.60.1.69913) |
| Crit (one stat: melee = ranged = spell) | 14 | 349 | [F] as displayed |
| Dodge | 12 | 46 | [F] as displayed |
| Parry | 15 | 7 (plus one item at 21) | [F] as displayed |
| Block | 5 | 11 | [F] as displayed |
| Defense | 1 rating = 1 defense skill | 69 | [F] as displayed |
| Haste | 10 | – (new stat) | [F] client game table only ([client]); combat effect [?], applied by hypothesis (D12) |
| Expertise | 10 | – (new stat) | [F] client game table only ([client]); combat effect [?], applied by hypothesis (D12) |

- The first source is the item diffs: for every changed item whose Classic tooltip had one
  percentage stat and whose Forever tooltip has the rating instead, rating ÷ old value
  ([items dataset][items-ratings]; [foreverchanges items][fc-items]).
- The second is the client's `combatratings.txt` game table, read from the raw client files
  ([client], 1.60.1.69913; level-60 row in [`gametables.json`](../data/client.md#gametablesjson)). It has
  the same value at all 123 levels, and it is the only source for haste and expertise. wowsims'
  extraction of 2026-09-20 agrees ([wf-cr]).
- **In combat** [?]: whether 14 rating really adds exactly 1% crit against a level-63 boss,
  whether 10 hit rating is 1% in both the melee and the spell table, and whether 1 Defense
  Rating is exactly 1 defense skill have not been measured. The sim assumes the displayed
  conversions hold ([Open questions](#open-questions)).
- The stat pipeline ([character-stats.md](character-stats.md)) owns the conversions. This doc
  consumes the resulting percentages: hit % → §2/§3/§9, crit % → `C`, expertise % → `E`,
  defense → `Df`.

---

## WoW Forever deviations

| Topic | Classic Era | Forever | Tag / source |
| --- | --- | --- | --- |
| Hit/crit stats | separate melee, ranged and spell hit and crit | one hit stat and one crit stat for all attacks and spells; ratings on gear | [F] [Blizzard Deep Dive][bz-deepdive]; [items-ratings]; in combat [?] |
| Raid-boss hit cap @300 | 9% melee, 28% DW, 16% spell | **8% / 27% / 17%** | [F] tooltip [gs][gs-forever]; [?] in combat |
| Hit suppression | 1% at 300 skill | none implied | [F] tooltip; [?] in combat (untested, [fw-1]) |
| Weapon skill per point | 0.1–0.2% miss, 0.1% dodge, 0.2% crit (below 300 only) | 0.04% hit, dodge, parry and crit | [F] client UI [SkillsFrame][ui-skills]; [?] in combat |
| Weapon-skill sources | racials +5, Edgemaster's +7, etc. | racials give crit instead; Edgemaster's +1 | [F] [fc-racials]; [wt-skill] |
| Boss parry | 14% | **16.5%** | [F] tooltip [gs][gs-forever]; [?] in combat |
| Glancing damage @300 | 35% penalty | 25% penalty (UI formula); beta reported broken | [F] client UI [SkillsFrame][ui-skills]; [?] in combat; broken [?] (third-party, [fw-1]) |
| Crit suppression vs +3 | 4.8% | 0.6% skill part + 1.8% [?] | skill part [F] client UI, [?] in combat; aura part [?] |
| Expertise | none | new stat, displayed as dodge/parry reduction; 10 rating = 1% and the combat effect are [?] (applied by hypothesis, D12) | [F] [bz-deepdive]; [gs][gs-forever]; [items-ratings] |
| Stats on items | percentages ("+1% crit") | ratings (14 crit, 10 hit, 12 dodge, 15 parry, 5 block, 1 defense per unit) | [F] as displayed [items-ratings]; combat [?] |
| Spell 1% miss floor | yes | tooltip implies none | [F] tooltip [gs][gs-forever]; [?] in combat |
| Negative resistance | floored at 0 | allowed ("Spell Vulnerability") | [F] tooltip text [gs][gs-forever]; in combat [?] |
| HS/Cleave queue removes the OH DW penalty | yes | yes, kept from Classic; a third-party beta test agrees | [C]; Forever [?] [fw-2] |
| Defense 440 uncrittable; crushing 15% ×1.5; creature crit ×2 | yes | yes (unchanged) | [F] tooltip [gs][gs-forever]; in combat [C] |
| Glancing chance 40% | yes | yes (unchanged) | [F] client UI [SkillsFrame][ui-skills]; in combat [C] |
| Boss dodge 6.5% | yes | yes (unchanged) | [F] tooltip [gs][gs-forever]; in combat [C] |

No Forever change found for: the single-roll white table order, glancing only on white
swings, dodge from any direction vs parry/block from the front only, the +19% dual-wield
penalty, and the boss → player formulas.

---

## Implementation notes

**Profile object** (in `src/sim/core`, e.g. `attackTableProfiles.ts`), cited as
`// docs/mechanics/combat-tables.md#11-profile-parameters-...`:

```ts
interface AttackTableProfile {
  missBase: [number, number, number, number];     // by level diff 0..3, at skill = 5 × player level
  dodgeBase: [number, number, number, number];
  parryBase: [number, number, number, number];
  perPoint: { miss: number; dodge: number; parry: number; crit: number } | "classic";
  hitSuppression: boolean;
  glanceFormula: "classic" | "foreverUi";
  auraCritSuppression: number;                    // 1.8
  spellMissFloor: number;                         // 0 (forever) | 1 (classicEra)
  expertiseEnabled: boolean;
}
```

**White swing:**

```
function resolveWhite(attacker, target, hand, ctx):
  S   = weaponSkill(attacker, hand)
  dw  = attacker.dualWielding && !(hand == OFF && attacker.mainHandQueue.active)
  p   = outcomes(profile, S, target, attacker.hit(hand), attacker.crit, attacker.auraCrit,
                 attacker.expertise, front = ctx.front, dwPenalty = dw, white = true)
  r   = rng.uniform(0, 100)
  acc = 0
  for (o in [MISS, DODGE, PARRY, GLANCE, BLOCK, CRIT]):
     slice = clamp(p[o], 0, 100 - acc)
     if r < acc + slice: return o
     acc += slice
  return HIT
```

**Special (melee defense type):**

```
function resolveSpecial(attacker, target, ability, ctx):
  p = outcomes(..., dwPenalty = false, white = false)      // glance = 0
  p[CRIT] += ability.bonusCrit
  if ability.weaponDamage:                                 // one roll (§3)
    o = rollOne([MISS, DODGE, PARRY, BLOCK, CRIT], p)      // same truncating loop as white
    return {o == CRIT ? HIT : o, crit: o == CRIT}
  o = rollOne([MISS, DODGE, PARRY, BLOCK], p)              // "melee spell": roll 1
  if o in {MISS, DODGE, PARRY}: return {o}
  crit = rng.uniform(0,100) < clamp(p[CRIT], 0, 100)       // roll 2
  return {o == BLOCK ? BLOCK : HIT, crit}
```

`ability.weaponDamage` comes from the ability's client effects (17, 58, 121 or 31); the class
docs list it.

Edge cases:

- Clamp every slice at ≥ 0 **before** truncating. Excess +hit must not produce a negative
  miss that eats into dodge.
- `classicEra` crit suppression uses `min(S, 300)`. `forever` uses the raw `S`. Glancing
  chance uses `min(S, 300)` in both profiles.
- Glancing damage: draw `uniform(low, high)` per glancing blow. For expected-value checks,
  use the mean.
- Suppression and caps are computed per hand, because the hands can have different weapon
  skills.
- Integer rolls are fine: roll `0..9999` against slices in basis points (WarriorSim does
  this), but keep the slices as floats until the comparison.
- **Skipped:** mob block value (see §2.4), and "can't parry/block" boss flags (encounter
  toggles).

---

## Worked examples

All vs a level-63 boss (defense 315), player level 60. Percentages are exact under the stated
profile.

**WE-1: Fury white swing, dual wield, behind, 300 skill, 6% hit, sheet crit 25%, no queue**

| Outcome | `forever` | `classicEra` |
| --- | --- | --- |
| Miss | 8 + 19 − 6 = **21.00** | 8 + 19 − (6 − 1) = **22.00** |
| Dodge | 6.50 | 6.50 |
| Parry / Block | 0 / 0 (behind) | 0 / 0 |
| Glancing | 40.00 | 40.00 |
| Crit | 25 − 0.6 − 1.8 = **22.60** | 25 − 3.0 − 1.8 = **20.20** |
| Hit | 100 − 21 − 6.5 − 40 − 22.6 = **9.90** | **11.30** |

**WE-2: yellow specials, same character (behind)**

A weapon-damage special (e.g. Heroic Strike or Mortal Strike): one roll.

| | `forever` | `classicEra` |
| --- | --- | --- |
| Miss | 8 − 6 = **2.00** | 8 − (6 − 1) = **3.00** |
| Dodge | 6.50 | 6.50 |
| Crit (same roll, no glancing; cap 91.50 / 90.50) | **22.60** | **20.20** |
| Hit | 100 − 2 − 6.5 − 22.6 = **68.90** | **70.30** |

A melee spell (Bloodthirst): two rolls.

| | `forever` | `classicEra` |
| --- | --- | --- |
| Roll 1 lands | 100 − 2 − 6.5 = 91.50 | 90.50 |
| Roll 2 crit (of landed) | 22.60 | 20.20 |
| Crit (of all attempts) | 91.5 × 0.226 = **20.679** | 90.5 × 0.202 = **18.281** |

**WE-3: white crit cap and truncation (`forever`, 2H, behind, 300 skill, 8% hit, sheet crit 58%)**

miss 0, dodge 6.5, glance 40 → white crit cap = 100 − 0 − 6.5 − 40 = **53.50**. Table crit
= 58 − 2.4 = 55.6, truncated to **53.50**, so hit = **0**. Sheet crit beyond 53.5 + 2.4 =
**55.9%** is wasted on white swings but still counts for specials: a weapon-damage special's cap
is 100 − 0 − 6.5 = 93.5 (no glancing), and a melee spell's roll 2 isn't capped.

**WE-4: attacking from the front (tank-style), 1H + shield, 300 skill, 5% hit (50 rating), sheet crit 10%, expertise 1.2% (12 rating; hypothesis A, [§7](#7-expertise-forever))**

| Outcome | `forever` | `classicEra` (no expertise) |
| --- | --- | --- |
| Miss | 8 − 5 = 3.00 | 8 − (5 − 1) = 4.00 |
| Dodge | 6.5 − 1.2 = 5.30 | 6.50 |
| Parry | 16.5 − 1.2 = 15.30 | 14.00 |
| Glancing (white) | 40.00 | 40.00 |
| Block | 5.00 | 5.00 |
| Crit | 10 − 2.4 = 7.60 | 10 − 4.8 = 5.20 |
| Hit | **23.80** | **25.30** |

**WE-5: off-hand while Heroic Strike is queued (`forever`, DW, 300 skill, 6% hit)**

Off-hand white miss = 8 − 6 = **2.00%** while queued, and 8 + 19 − 6 = **21.00%** while not.
(`classicEra`: 3.00% / 22.00%.)

**WE-6: weapon skill 305 vs 300, 2H, 0% hit, behind**

| | `forever` 300 | `forever` 305 | `classicEra` 300 | `classicEra` 305 |
| --- | --- | --- | --- | --- |
| Miss | 8.00 | 7.80 | 8.00 | 6.00 |
| Dodge | 6.50 | 6.30 | 6.50 | 6.00 |
| Glance dmg mean | 0.75 | 0.85 | 0.65 | 0.85 |
| Crit suppression | 2.40 | 2.20 | 4.80 | 4.80 |

**WE-7: glancing damage range**

A 1,000-damage (pre-glance) white hit, glancing, 300 skill: `forever` draws uniform(650, 850),
mean 750. `classicEra` draws uniform(550, 750), mean 650. At 308 skill both profiles draw
uniform(910, 990), mean 950.

**WE-8: boss → warrior tank, front, 440 defense, sheet dodge 12.00, parry 14.00, block 20.00 (both profiles)**

| Outcome | Value |
| --- | --- |
| Miss | 5 + (440 − 315) × 0.04 = **10.00** |
| Dodge | 12 − 0.6 = **11.40** |
| Parry | 14 − 0.6 = **13.40** |
| Block | 20 − 0.6 = **19.40** |
| Crit | max(0, 5 + (315 − 440) × 0.04) = **0.00** |
| Crushing | **15.00** |
| Hit | 100 − 10 − 11.4 − 13.4 − 19.4 − 0 − 15 = **30.80** |

At 300 defense (same sheet dodge, parry and block), miss = 4.40 and crit = 5.60, and
crushing stays at 15.00.

**WE-9: uncrushable check**

440 defense, sheet dodge 12, parry 14, block 66 (e.g. with a block cooldown up): vs boss
10 + 11.4 + 13.4 + 65.4 = 100.2 ≥ 100, so crit = 0, crushing = 0, hit = 0.

**WE-10: spell vs boss, 3% hit (and 17% hit)**

3% hit: miss = 17 − 3 = **14.00** in both profiles. 17% hit: `forever` miss = **0.00**;
`classicEra` miss = **1.00** (floor). The crit roll (×1.5 damage) applies to landed spells only.

**WE-11: average partial resist, fire proc, R = 24 (level-based only), caster 60**

avgResist = 0.75 × 24 / 300 = **0.06**, so a 40-damage proc averages 37.6. Binary version
with 17% miss and 0% hit: resist chance = 0.17 + 0.83 × 0.06 = **0.2198**.

---

## Open questions

Each item names the test that would settle it. Items 1–5 and 7 are the `forever` profile's
client-UI values: [F] for what the client shows, [?] in combat until one of these tests settles
them (doctrine §2). The beta is capped at level 20 (rising to 30)
([wowsod.pro recap][wowsod]), so level-60 values can't be measured yet. The `+3`
relationship can be tested by any character against mobs 3 levels higher, whose defense is
`5 × level`. Magey's group is running exactly this sweep ([magey/forever-warrior#1][fw-1]);
adopt its results when they land.

1. **Hit suppression and the raid-boss hit cap** [?]. The tooltip says 8% / 27%; Classic Era
   has 9% / 28%. Test: a character with exactly 1% hit (e.g. a talent) vs +3 mobs, recording
   the white miss rate (expect 7% with no suppression, 8% with suppression). This needs a few
   thousand swings.
2. **Weapon skill per point** (0.04% vs Classic's 0.1–0.2%) [?]. There's no easy +skill
   source now. Magey suggests testing vs +2 mobs as a proxy for +5 skill.
3. **Boss parry 16.5% vs 14%** [?]. The client's other expertise string
   (`CR_RANGED_EXPERTISE_TOOLTIP`) still says 14.00%. Test: log white swings from the front vs
   +3 mobs, where parry is the one outcome that behind/front tests isolate cleanly.
4. **Glancing damage** [?]. The UI gives 25% at 300 skill; the beta currently deals the wrong
   amount (Magey). Also, is the `forever` formula's non-monotonic jump at 305 real? Test: once
   fixed, average glancing / average normal hit vs +3 mobs (~7k glances for ±1%).
5. **Crit suppression** [?]. The skill part (0.6% vs 3%) and the 1.8% aura part are both
   unverified in Forever. Test: white crit rate vs +3 mobs with known sheet crit (Magey's
   crit-suppression method, [magey-crit]).
6. **Special attack rolls** [?] for Forever. The default is the Classic Era split [C]: one roll
   for weapon-damage specials, two for melee spells (Bloodthirst, Execute, Shield Slam, Revenge).
   Open: does Forever keep it; and how do other classes' non-weapon specials (Ferocious Bite,
   Swipe, Rake's initial hit, damage judgements) map onto it? Test: Heroic
   Strike vs Bloodthirst crit rate from the front vs +3 mobs with a high avoidance total: one
   roll gives crits ÷ attempts ≈ table crit; two rolls give crits ÷ landed ≈ table crit.
7. **Spell miss floor** [?]. Does 17% spell hit give 0% miss (tooltip) or 1% (Classic Era)?
   Only testable at 60 with 17% hit; low priority for these specs.
8. **Level-based spell resistance** [?]. Classic sources say 24 (WarriorSim) or ~15 for a
   +3 boss. Affects only magic procs. Test: average damage of a fixed non-binary proc vs +3
   and +0 mobs.
9. **Spell crit suppression vs +3.** Classic Era sims apply none. The only source for a value
   (2.1%) is an SoD sim (`wowsims/sod` lineage, also copied into `wowsims/forever`'s TBC-based
   core); **refused** under the doctrine. Test: spell crit rate vs +3 mobs.
10. **Mob block value** [?]: modeled as 0.
11. **Boss "cannot parry/block" flags** [?]: server-side and unknown for Forever raid
    bosses; encounter toggles.
12. **Does rating crit count as "aura" crit for the 1.8% suppression?** [?] Moot at level 60.
13. **Classic Era parry vs weapon skill** [?]: Magey's data is ambiguous (13.49% at +5, 14.01%
    at +9). The `classicEra` profile keeps 14% flat.
14. **`forever` +1/+2 parry bases** (5.5 / 6.0) [?]: trash only.
15. **Expertise items.** foreverchanges shows "+X Expertise Rating" on a few items (Dwarven
    Tree Chopper +6, Servomechanic Sledgehammer +10, Adaptive Combat Assistant +20), while
    wowsims reports no item carrying the expertise stat index ([wf-34]). Recheck when the item
    snapshot is refreshed.
16. **What expertise does in combat** [?]: hypothesis A (dodge/parry −E points, the sim
    default per D12) vs hypothesis B (acts like weapon skill). Test at 60: with the Adaptive
    Combat Assistant (+20 rating = 2%; it requires level 60) on vs off, log dodges (from behind)
    and parries (from the front) vs +3 mobs. A predicts −2.0 points on each; B predicts a small
    change in miss and glancing too. Under the beta cap, the Dwarven Tree Chopper (+6 rating,
    item level 20, no level requirement in its Forever tooltip) predicts −0.6 points, which
    needs a much larger sample.
17. **Do the displayed rating conversions hold in combat?** [?] (14 crit / 10 hit / 12 dodge /
    15 parry / 5 block per 1%; 1 defense rating = 1 defense; and the game-table-only 10 haste and
    10 expertise per 1%.) Test: compare the character-sheet
    crit/hit/dodge/parry/block % before and after equipping a rating item. The sheet reads
    server values. Then spot-check the crit rate vs +3 mobs.
18. **Does one hit rating apply fully to the spell table?** [?] Test: a caster's resist rate
    vs +3 mobs with and without a hit-rating item. Only relevant for the paladin's spell-table
    effects.
19. **How much weapon skill does Forever pre-raid gear carry?** Most Classic weapon-skill
    pre-raid items have no Forever data yet ([items dataset][items-ratings]). Refresh the item
    snapshot as the server sends them.
20. **Negative resistance in combat** [?]: the "Spell Vulnerability" tooltip is client text;
    [damage-and-timing OQ 12](damage-and-timing.md#open-questions) has the matching armor test.
    Only magic procs and paladin Holy damage care.
21. **Heroic Strike queue and the off-hand penalty in Forever** [?]. A third-party beta test
    (77 queued vs 394 unqueued off-hand swings) found the Classic rule still in place
    ([fw-2]); both profiles keep it. Test: a guild repeat with ≥1,000 off-hand swings per state
    vs +3 mobs.

---

## Sources

| Ref | Source | Covers | Ruleset |
| --- | --- | --- | --- |
| [ui-forever] | Gethe/wow-ui-source, branch `forever` (1.60.1.69913), <https://github.com/Gethe/wow-ui-source/tree/forever> | Forever client Lua (character sheet, skills panel) | [F] client data (verbatim mirror): what the client displays or computes; combat behaviour [?] until measured |
| [ui-stats] | `Camelot/PaperDollFrameStats.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua> | enemy miss, crit and crushing vs defense; boss dodge base; spell miss by level; block value per Strength | [F] client data (verbatim mirror): what the client displays or computes; combat behaviour [?] until measured |
| [ui-skills] | `Camelot/SkillsFrame.lua`, <https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/SkillsFrame.lua> | weapon skill → hit/dodge/parry/crit, glancing chance and penalty | [F] client data (verbatim mirror): what the client displays or computes; combat behaviour [?] until measured |
| [gs-forever] | Ketho/BlizzardInterfaceResources `forever` GlobalStrings enUS, <https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua> | hit-cap, expertise, defense, crit, dodge, parry, block, armor-pen and spell-pen tooltips | [F] client data (verbatim mirror): what the client displays or computes; combat behaviour [?] until measured |
| [gs-era] | same repo, branch `classic_era`, <https://github.com/Ketho/BlizzardInterfaceResources/blob/classic_era/Resources/GlobalStrings/enUS.lua> | control: Classic Era 1.15.9 has none of the Forever tooltip numbers | [C] |
| [client] | Raw Forever client files (build 1.60.1.69913) read through the wago.tools API, [../data/client.md](../data/client.md#doc-claims-checked-against-the-raw-client) | `combatratings.txt`; per-spell `DefenseType` (SpellCategories) | [F] client data |
| [wf-cr] | wowsims/forever `assets/db_inputs/basestats/combatratings.txt` (commit c65434c), <https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats/combatratings.txt> | Forever CombatRatings game table | [?] secondary (corroborates the client file now read directly, [client]) |
| [wf-34] | wowsims/forever issue #34, <https://github.com/wowsims/forever/issues/34> | expertise sources and aura types in the Forever client | [?] secondary (their core is TBC-based; only the client findings are used) |
| [wf-spelldata] | wowsims/forever generated spell data, e.g. <https://github.com/wowsims/forever/blob/master/sim/warrior/spell_data_auto_gen.go> | per-spell DefenseType, GCD, effects | [?] secondary (corroboration of the class docs' own reads) |
| [fw-1] | magey/forever-warrior issue #1 "Attack table", <https://github.com/magey/forever-warrior/issues/1> | Forever test plan; glancing damage reported broken on beta; asks whether crit is still two-roll | [?] third-party (in progress) |
| [fw-2] | magey/forever-warrior issue #2, <https://github.com/magey/forever-warrior/issues/2> | HS/Cleave queue removes the OH DW penalty in Forever (beta test) | [?] third-party measurement |
| [bnet-hsq] | Blizzard forums, "Off-hand swings with HS/Cleave queued don't suffer DW miss penalty" (2019), <https://us.forums.blizzard.com/en/wow/t/off-hand-swings-with-hs-cleave-queued-dont-suffer-dw-miss-penalty/309417> | classified "not a bug" for Classic | [C] |
| [magey-at] | Magey et al., Classic warrior wiki "Attack table", <https://github.com/magey/classic-warrior/wiki/Attack-table> | miss, dodge, parry, block, glancing, crit, DW, hit suppression (1.13 tests plus Blizzard quotes) | [C] |
| [magey-crit] | Magey, "Crit aura suppression", <https://github.com/magey/classic-warrior/wiki/Crit-aura-suppression> | 1.8% aura-crit suppression vs +3 | [C] |
| [marrow-mech] | Marrow's Compendium of Dragonslaying, ch. 3, <https://bookdown.org/marrowwar/marrow_compendium/mechanics.html> | Classic white/yellow table, glancing, weapon skill table | [C] |
| [amr-hit] | Ask Mr. Robot, "Hit Rating and Hit Caps in WoW Classic" (2020), <https://forums.askmrrobot.com/t/hit-rating-and-hit-caps-in-wow-classic/8614> | Classic caps, dodge/parry/block vs boss, spell miss | [C] |
| [zam-hit] | ZAM wiki "Hit Table", <https://wow.allakhazam.com/wiki/Hit_Table_(WoW)> | two-roll specials, block + crit on specials | **Forbidden** (vanilla-era wiki); cited only to explain the refusal |
| [ws-repo] | GuybrushGit/WarriorSim `index.html` at pre-SoD commit `180a3cc` (2021-05-11), <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/index.html> | Classic warrior sim defaults (target resistance 24) | [C] (pre-SoD) |
| [ws-player] | WarriorSim `js/classes/player.js` at `180a3cc`, <https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js> | roll functions (`rollspell`: one roll for weapon spells, two for Bloodthirst and Execute; `magicproc`), glance, miss, crit suppression | [C] (pre-SoD) |
| [ws-issue20] | WarriorSim issue #20, "Special Attack Crit Rate lower than White Attack Crit Rate" (2020-05), <https://github.com/GuybrushGit/WarriorSim/issues/20> | relays the Fight Club #dps-tc log finding: only Bloodthirst, Execute, Shield Slam and Revenge roll twice | [C] (Classic 2020, community logs) |
| [ws-singleroll] | WarriorSim commit 474f8b8, "Weapon spells single roll" (2020-05-08), <https://github.com/GuybrushGit/WarriorSim/commit/474f8b8913> | implements the finding | [C] (pre-SoD) |
| [bz-deepdive] | Blizzard, "World of Warcraft: Forever Deep Dive Panel Recap", <https://news.blizzard.com/en-us/article/24303313/world-of-warcraft-forever-deep-dive-panel-recap> | unified hit/crit, weapon skill, expertise-like stat | [F] official |
| [fc-racials] | foreverchanges.pro racials, <https://foreverchanges.pro/racials> | weapon-skill racials → crit | [F] |
| [fc-items] | foreverchanges.pro items, <https://foreverchanges.pro/items> (changed.json) | rating values replacing Classic % stats | [F] |
| [wt-skill] | Warcraft Tavern, "Weapon Skills in World of Warcraft Forever", <https://www.warcrafttavern.com/forever/news/weapon-skills-in-world-of-warcraft-forever/> | Edgemaster's +1; racial changes | [F] reported |
| [wt-stats] | Warcraft Tavern, Forever stats guide, <https://www.warcrafttavern.com/forever/guides/stats/> | armor/resistance caps, no Holy resistance | [F] reported |
| [ol-stats] | Output Lag, Deep Dive stats coverage, <https://outputlag.com/news/world-of-warcraft-forever-unifies-hit-and-crit-stats-and-gives-healing-gear-bonus-damage/> | panel slide details | [F] reported |
| [wowsod] | wowsod.pro, "WoW Forever vs Classic: Every Key Change", <https://wowsod.pro/articles/wow-forever-vs-classic-every-key-change> | beta level cap 20→30 | [F] reported |
| [items-ratings] | This repo's items dataset, "Forever's ratings" ([../data/items.md](../data/items.md#forevers-ratings-f-with-open-questions)) | rating ÷ percent ratios over all 4,271 changed items; expertise items | [F] as displayed (from foreverchanges) |

[ui-forever]: https://github.com/Gethe/wow-ui-source/tree/forever
[ui-stats]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/PaperDollFrameStats.lua
[ui-skills]: https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_UIPanels_Game/Camelot/SkillsFrame.lua
[gs-forever]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[gs-era]: https://github.com/Ketho/BlizzardInterfaceResources/blob/classic_era/Resources/GlobalStrings/enUS.lua
[gs]: https://github.com/Ketho/BlizzardInterfaceResources/blob/forever/Resources/GlobalStrings/enUS.lua
[wf-cr]: https://github.com/wowsims/forever/blob/master/assets/db_inputs/basestats/combatratings.txt
[client]: ../data/client.md#doc-claims-checked-against-the-raw-client
[wf-34]: https://github.com/wowsims/forever/issues/34
[wf-spelldata]: https://github.com/wowsims/forever/blob/master/sim/warrior/spell_data_auto_gen.go
[fw-1]: https://github.com/magey/forever-warrior/issues/1
[fw-2]: https://github.com/magey/forever-warrior/issues/2
[magey-at]: https://github.com/magey/classic-warrior/wiki/Attack-table
[magey-crit]: https://github.com/magey/classic-warrior/wiki/Crit-aura-suppression
[marrow-mech]: https://bookdown.org/marrowwar/marrow_compendium/mechanics.html
[amr-hit]: https://forums.askmrrobot.com/t/hit-rating-and-hit-caps-in-wow-classic/8614
[zam-hit]: https://wow.allakhazam.com/wiki/Hit_Table_(WoW)
[ws-repo]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/index.html
[ws-player]: https://github.com/GuybrushGit/WarriorSim/blob/180a3cc/js/classes/player.js
[ws-issue20]: https://github.com/GuybrushGit/WarriorSim/issues/20
[ws-singleroll]: https://github.com/GuybrushGit/WarriorSim/commit/474f8b8913
[bnet-hsq]: https://us.forums.blizzard.com/en/wow/t/off-hand-swings-with-hs-cleave-queued-dont-suffer-dw-miss-penalty/309417
[bz-deepdive]: https://news.blizzard.com/en-us/article/24303313/world-of-warcraft-forever-deep-dive-panel-recap
[fc-racials]: https://foreverchanges.pro/racials
[fc-items]: https://foreverchanges.pro/items
[wt-skill]: https://www.warcrafttavern.com/forever/news/weapon-skills-in-world-of-warcraft-forever/
[wt-stats]: https://www.warcrafttavern.com/forever/guides/stats/
[ol-stats]: https://outputlag.com/news/world-of-warcraft-forever-unifies-hit-and-crit-stats-and-gives-healing-gear-bonus-damage/
[wowsod]: https://wowsod.pro/articles/wow-forever-vs-classic-every-key-change
[items-ratings]: ../data/items.md#forevers-ratings-f-with-open-questions
