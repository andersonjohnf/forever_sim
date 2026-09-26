# Known gaps and follow-ups

The low findings that break no promise the docs make, each with its reason, and the follow-ups
agreed but not yet scheduled
([CLAUDE.md](../CLAUDE.md#core-doctrine-adversarial-review-before-every-push), steps 4 and 7;
[doctrine §6](doctrine.md#6-review-gate-before-every-push)). A review sends a finding here instead
of fixing it only when it's low and breaks no promise in [ux.md](ux.md), the doctrine or a mechanics
or class doc. **When an entry is fixed, delete it here** and name the fixing commit in that
review's log under [reviews/](reviews/). The milestones are in [milestones.md](milestones.md).

- **Item tooltips, three pre-existing lows (review VT-2, VT-3, VT-4).** Closing the picker with
  Escape while the mouse rests on another slot can leave two tooltips open (the returned slot's focus
  one and the hovered one); the next Escape closes both. One probe saw the phone picker's sheet
  refuse to drag down from its handle while a tooltip was pinned; a second couldn't reproduce it (a
  drag starting on the tooltip scrolls it instead, by design). On a phone card the info
  control shortens the item's name by 32 px (moving it to the slot's line would restore it).
- **The phone's item picker closes without its exit slide (review QC-4, pre-existing, low).** The
  Gear tab mounts the picker only while picking (`gear-section.tsx`, `{picking && <ItemPicker …/>}`),
  so its drawer unmounts before vaul's slide-out plays; the enchant picker slides out as it should.
  No doc promises the exit slide. The fix keeps the picker mounted and drives `open` from `picking`.
- **An Escape during a tooltip's fade-out is spent on it (review VF-3, pre-existing, low).** In the
  100 ms a closing tooltip fades, its layer still takes Escape, so a press then closes nothing more
  and the next one closes the picker. Rare: the press must land inside those 100 ms.
- **A missing hashed asset caches its 404 for a year on Firebase Hosting** (review V3-2, low): `/assets/**` carries the immutable header on every response. Hashed names are never reused, so only a browser that asked for a chunk a later deploy removed, and then a rollback restored, would keep a broken cache. A `404` rule can't target status codes in `firebase.json`; revisit if a rollback ever needs it.
- **What's New and pasted links (WQ-2, WQ-4).** A refused link pasted while What's New is open drops
  the opening link's held "Loaded" notice, though the opening link did load; no e2e test pastes a link
  while a notice is held (the review's probe covered both). Rare.
- **A flaky spec-switch test (EM-7).** `e2e/results-keyed.spec.ts` "cancels on a spec switch" can see
  the Fury run finish before the switch under heavy load.

- **The auto-save error isn't held behind What's New (WV-4).** On a load whose first save fails,
  "Your changes aren't being kept" shows over What's New at once and can run out its 10 s unread.

- **Breakdown shares that can't happen (CM-4).** A no-damage strike (Sunder Armor) shows "0.0% crit"
  and a proc that can't be avoided (Seal of Fury) "0.0% avoided"; leave such a share out, as Faerie
  Fire's row shows only "missed".

- **The shared consumables run ahead of every priority list (TM-5).** EZ-Thro Dark Bomb and Greater
  Stoneshield Potion, when picked in Buffs, run before any row of Fury's or a tank's list
  (`withSharedConsumables`), and the Rotation tab shows no row for them. The buffs doc says so;
  the tanks' and Fury's priority-list docs don't yet. Both are off by default.

- **A pasted code legal on both talent trees reads as today's, silently (TMV-6).** A code that's a
  legal build on today's trees and on 1.60.1.69913's keeps today's reading with no notice, even
  when the two readings differ (`2-4530513321301541-502`: Divine Strength 2 today, Improved Holy
  Strike 2 then). Low: the paste is still a legal build, a setup's own version says which trees its
  code is on, and only a code copied from the older trees and never loaded since can hit it; a
  notice would need the two readings compared on every paste
  ([talents.md § Tree versions](data/talents.md#tree-versions)).

Found while building. Each should go to the owning doc or `open-questions.md` when its
slice is worked:
- **The DPS specs' Rotation intros say "with a first quick search; they aren't tuned yet"** (tank
  integration review TU-9): process jargon, which the tanks' intros replaced with "hasn't been fully
  tuned yet". The rogues, warlocks, Shadow Priest, hunters, Elemental and Balance still carry it, with
  their e2e tests; ux.md's intro rule for them changes with it.
- **The warrior's interim gear** (T4 review): Adaptive Combat Assistant's use (a 450 absorb every
  90 s, 90–110 Nature damage when it breaks) isn't simulated, about +1.7 TPS (0.15%) and −5 damage
  taken a second (T4R-3); the greedy EHP search never revisits a swap, so Dal'Rend's Sacred Charge
  could return for +1.3 TPS at 90.5% EHP (T4R-2, waived: it keeps an EHP margin, and O4 replaces
  the set); gear cards show "+20 Expertise" with no percentage and no D12 flag, though the results'
  assumptions list it (T4R-8).
- **Spell-hit casts roll only the plain spell miss** (issue #9): Curse of the Elements, the
  moonkin's and the cat's Faerie Fire and Vampiric Embrace (`cast` abilities with `spellHit`) are
  binary debuffs, but the engine's `cast` rolls neither the boss's average resistance nor the
  school's own hit (Shadow Focus for Vampiric Embrace). castSpell and the bear's spell-table Faerie
  Fire do both. Fixing it needs each ability's school on its row and moves the warlock, Balance
  and cat goldens: a Curse of the Elements resisted 6% of the time costs a GCD and 200 mana to
  recast, well under 0.1% of DPS.
- **The pet's ranged hit and crit share has no test** (Demonology verification DV3-1): every
  default setup has no ranged hit or crit bonus, so a test with a ranged plan's bonuses would pin it.
- **A race change doesn't remember a slot it blocked** (gear-defaults verification FV-5): `changeRace`
  (`src/features/character/faction-gear.ts`) moves the slots that follow the defaults with
  `followDefaults`, but unlike a load it doesn't keep a slot a Unique rule or a two-hander blocked in
  `following`, so that slot becomes the player's at the next save. Practically unreachable: the
  factions' defaults differ only in single-slot PvP armour and one-handed caster main hands, which
  no Unique rule or two-hander blocks.
- **The Fire mage still does slightly best at exactly ×1.000 casting speed** (engine-issues
  verification EV-4): at 600 s (Human, unlimited mana, 4,000 fights) ×1.000 gives 570.55 ±0.46,
  ×1.0005 569.28 ±0.44 and ×1.002 569.69 ±0.44, 1–1.3 DPS (≤0.3%) the verifier also saw. It isn't
  idle: the waits a hair above ×1.000 total 61 ms a fight (39 for Pyroblast's tick, 22 for Fire
  Blast), and the casts take the same time. At ×1.000 the mage casts about one more spell a fight
  (+0.9 Scorch, +0.26 Fire Blast); Scorch goes one Fireball early there, because COND 44 counts a
  Scorch landing the same millisecond Fire Vulnerability ends as too late, which it is (the expiry
  wins that tie): counting it in time costs ×1.000 3.5 DPS (567.09). Whether the rest is a real
  edge of the exact 1.5 s grid (a player with no casting speed lines up the same, less their
  latency) or a tie still broken in the mage's favour wasn't settled in the time given. The
  default Fire mage is at ×1.000 outside Berserking, so its headline may read up to 0.3% high
  against a hair more casting speed: well inside D27's first-pass tolerance.
- **A DPS spec's "Setup changed" badge wraps to two lines** in the phone bar at 360 px (phone
  bar verification VF7, pre-existing). The bar stays 65 px and nothing overlaps.
- **The Protection paladin's threat review lows** (T2; the review in `.cache/probes/tank-review-paladin`),
  each under 2% of TPS, kept as they are until an in-game test or the optimizer settles them:
  - **P9:** Holy Shield's 20% more threat multiplies Righteous Fury's (×2.28, not ×2.1, with Righteous
    Fury's +90% then; ×1.92, not ×1.8, since 1.60.1.70009's +60%) and its
    damage never misses: both [?] lean high, about −1.9% and −3.4% the other way (in-game test T6,
    paladin.md OQ 16).
  - **P10:** Consecration's ticks miss at the spell rate (14% against a boss); never missing would be
    +1.8% (in-game test T7, OQ 18).
  - **P11:** the talent variants: T2's fix round compared about 45 builds within the survival floor
    (paladin.md "The interim talents"), Sanctified Judgement, Vindication, Benediction and Holy
    Conduit among them, but not Improved Seals, which needs five Holy points first; the optimizer
    (O1) searches them all.
  - **P12:** mana-gain threat (Shield Specialization, Improved Seal of Fury, the potion) skips the
    Threat gloves' 1.02 (sim.ts's mana threat); about 0.1%.
  - **A6 (resolved: modelled with a `[?]` default):** Undead's Touch of the Grave is simulated for
    every Undead class: 5% of maximum health as Shadow damage a proc, the client's 5% or 10% chance
    and 1 s cooldown, never missing or critting, with damage threat and its heal's healing threat
    ([character-stats](mechanics/character-stats.md#touch-of-the-grave)). +2.3% of a Protection
    paladin's TPS as Undead; the default race is Human, so no default moves.
  - **A7:** Eye for an Eye (Holy damage × Righteous Fury [?]) isn't simulated; no default build
    takes it.
  - **A10 (survival only):** Seal of Fury's absorb isn't taken off the hit it absorbs (~20 damage,
    about −5 damage taken a second), Force of Will's 51-damage cut (~5% [?]) isn't simulated, and
    Templar's Bulwark and Divine Protection aren't used.
  - **A11:** mana-gain threat doesn't take the global multiplier [?] (+0.1%).
- **Interim Protection paladin gear** (T2; T2R-2's fix): the Lamellar PvP pieces are Alliance's with
  no Horde twin, so a Horde paladin wears the Horde picks measured for those slots (the Premier
  Scaled pieces, Champion's Vindication, and Plate of the Shaman King), 794.0 TPS against Alliance's
  823.6 (−3.6%, all of it the gear), both within the floor (91.9% and 90.4% of v1's). Premier Scaled Gauntlets would give Horde
  813.0, but the slot lists can't hand one faction a different glove while B76 holds; the Optimizer
  (O2) takes it. The
  threat set leaves the boss 4.4% crit chance (defense 330, v1's 433) and about a third more damage
  taken than v1's preset (905 a second against 681 in C3's setup), within the user's effective-health
  floor. The optimizer (O2) replaces the set; D30's survival constraint for it is the class doc's
  floor, and its crit-immune switch the crit.
- **Caster food across the caster presets** (T2 review T2R-6, pre-existing, low): Brilliant Wizard
  Oil is in every caster's Max consumables since the consumables review (CR-6), but Nightfin Soup is
  in Elemental's Standard raid, the mages' Max and the Protection paladin's presets only, in no
  warlock, Shadow Priest or Balance preset ([buffs §6.3](mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset)).
  It's a Buffs switch those specs can turn on; the optimizer (O2) or a presets pass aligns it.
- **Consumables left for later** (consumables review, 2026-09-24, and its verification pass CV-7):
  EZ-Thro Dark Bomb is in no caster's or hunter's Max consumables. Its range is 15 yd
  (`SpellRange` 15), and a caster or hunter stands at 30 yd or more, so throwing it means moving in,
  which the sim doesn't model; the sim throws it from where you stand. Measured without that cost
  (Max consumables, seed 12345, 2,000 fights), the casters are mixed, a Fire mage +0.63% and
  Affliction and Elemental +0.24% while Destruction −0.21%, Shadow −0.33% and Demonology −0.45%
  lose, and the hunters gain (Marksmanship +0.89%, Survival +0.85%, Beast Mastery +0.51%). Every melee
  spec loses (a Feral cat −0.8%, an upper bound), and whether a druid can throw it in a form is open
  (buffs doc open question 21) ([buffs §6.3](mechanics/buffs-debuffs-consumables.md#63-consumables-by-spec-and-preset)).
  The Sapper, Dense Dynamite and the other explosives aren't in the catalogue; one entry per cooldown category means a tank's
  Stoneshield-then-rage-potion pairing isn't simulated, and simulating an item with a longer cooldown
  of its own beside another of its category needs an alternation model ([buffs doc](mechanics/buffs-debuffs-consumables.md#on-use-items-and-cooldown-categories)).
- **Hammer of the Righteous's extra targets** (its effect 1, 120 to 3 chain targets, and the other 3
  targets' weapon damage) wait for M6, as does Consecration's 12 to every enemy.
- **Crit from auras and the paladin (GR9, not a bug):** against a +3 boss the first 1.8% of crit from
  auras is suppressed (combat-tables §4.4), and v1's Protection paladin had none, so its first +2%
  crit from gear or buffs gave +0.2%. The interim build's Conviction (+5%) is past it.
- **A tank's phone bar grows 16 px** (65 to 81) while the "Setup changed" or "…%" badge row
  shows (details review DR9, pre-existing). It pushes nothing out of view; the badge could sit
  on the TPS row instead.
- **The optimizer (O1):** `WorkerPool.fightRunner` runs real workers only in a browser: a unit
  test drives it against stub workers (its plan sending and cache mirror), and O3's e2e tests are
  the first to run it for real.
- **Encounter settings the contract lacks:** `biome`, `extraTargetUptimePct` and
  `bossExtraDtps` ([encounter.md](mechanics/encounter.md#encounter-settings)).
- **Engine choices where the docs are silent (made in M1):**
  - Incoming damage for DPS players arrives as one hit every 2 s.
  - The boss first swings at t = 0.
  - Elemental Sharpening Stones stack: +2% crit to all melee attacks per stone [?]
    ([buffs §3.6](mechanics/buffs-debuffs-consumables.md#36-weapon-enhancements-temporary)).
- **Data gaps:**
  - Forever shields have no block value in the client; a Classic Era fallback shield's block
    value counts, flagged (`classicShieldBlockValue`).
  - Base health (warrior 1,689, paladin 1,381, druid 1,483) and base parry and block (5%) are
    D24 placeholders; warrior base dodge is 0 [C]. OQ-5 still needs a TPS estimate for the
    parry and block placeholders.
- **The buffs doc says Hyjal flasks are "added automatically"** but not which flask.
- **Bundle size:** 1.78 MB (300 KB gzipped) after M1.5c, mostly item data. Consider
  lazy-loading talents per class, and slimming item fields the app doesn't read.
- **Fury's `btOverExecuteAp` default is a fixed 2220** (W11 at Execute cost 15). Rotation
  options have one default per spec, not per build, so an Improved Execute build has to set
  2434 itself. A per-build default needs an API in `sim/index.ts` and the Rotation UI.
- **Cleave isn't built yet,** so W21's Cleave costs (Improved Cleave, Raging Blows) are
  untested.
- **Subtlety rogue (R1, first pass under D27):** Preparation isn't simulated (one more
  Premeditation in a fight of 2 min or more), there's no Stealth opener (Ambush or Premeditation
  before the pull), and with Backstab chosen as the builder from the front or without a main-hand
  dagger, the Rotation tab doesn't say that Hemorrhage builds instead
  ([rogue.md §5.3, §6.3](classes/rogue.md#63-subtlety-shipped)).
- **The Classic Era profile's rogue finishers use Forever's attack-power shares** (the 2026-09-25
  rogue attack-power review, RG-5, pre-existing): the rogue's abilities aren't split by profile, as
  the poisons are, so under Classic Era Eviscerate gains the 4% of attack power a point that a
  player's tests shared on Discord found [?] (Classic Era sims'
  3%); Rupture's measured shares match Classic Era sims', so only Eviscerate differs. Low: the Classic Era profile is a comparison, and splitting the
  rows needs a per-profile ability table ([rogue.md §3.4, §3.5](classes/rogue.md#34-eviscerate-r9-31016)).
- ~~Snap can't capture a finished run~~: `--click Simulate` now waits for the result, and
  `--click "Show results and details"` opens the phone's results sheet.
- **Arms tuning findings:** re-measured and adopted in M2.5a. The Arms defaults are now the best
  rotation found ([warrior.md §5.3](classes/warrior.md#tuning-the-defaults-m25a)): +37.0 DPS
  (+6.1%, 610.3 → 647.3) over the old ones. Of the old findings, Rend's 3 s refresh is adopted;
  Heroic Strike from 55, the Whirlwind dance and Spearing Strike from 40 lost to better changes.
  Recklessness and the Mighty Rage Potion follow the execute phase, so the defaults hold at every
  fight length and execute phase measured, but one: **still open,** in a 30 s fight with no
  execute phase the old defaults are 2.4% ahead, from their Heroic Strike. Without a phase,
  Heroic Strike from 90 beats off at every length (+0.1% to +2.2%); taking it needs a switch's
  default to follow the Fight tab's execute phase. 30 s fights with a 5–8% phase trail them by
  0.6–1.6% too, from Mortal Strike in a phase of one or two GCDs (M2.5a's V1).
- **Fury tuning, small losses and a lead left open** (M2.5b, warrior.md §5.2). Heroic Strike's
  cancel costs 0.1–0.4% in 30–60 s fights without an execute phase, and Whirlwind at 0.5 s and
  Recklessness's 16 s clock under 0.1% in 30 s fights with a 10–20% phase; the whole package
  still wins by 5.5–9.6% there. Pooling rage for the phase (no Heroic Strike in the 20 s before it)
  measured +0.11% in the default setup; it needs a setting of its own and short-fight checks, so
  it's left for later.
- **The Rotation tab's section headings wrap at 390** beside "Advanced · N changed" when several
  thresholds are changed; readable, nothing clipped (FU12 in
  [Fury's review](reviews/2026-09-23-fury-rotation.md)).
- **Fury's Recklessness clock at 17 s** beat 16 s without an execute phase on one seed (+0.09% at
  180 s, +0.38% at 30 s); it needs D23's full process before it's adopted.
- **Arms in Berserker Stance doesn't wait for Recklessness before its potion;** the wait is
  unmeasured for it (warrior.md §6.2, FL4).
- **Retribution against Undead or Demons in long fights:** the re-tuned defaults trail the first
  round's by 0.14–0.63% at 180 s with a 20% phase and at 300 s with 10–20%, where Exorcism from 40%
  was ahead; 40% loses everywhere else, and a reserve tied to the execute phase lost too
  ([paladin.md](classes/paladin.md#tuning-the-defaults-c2)). A threshold that follows the fight's
  length needs D23's full process.
- **The paladin's mana plan** (`paladinManaPlan`) has no test pinning how mp5 and Reverence
  feed the plan; the engine side is tested (CV3 in
  [the paladin foundation's review](reviews/2026-09-23-paladin-foundation.md)).
- **The Shadow Priest's gaps** (K4, [priest.md](classes/priest.md#9-open-questions)):
  - **The caster enchants aren't in its defaults** (Arcanum of Focus, the +30 Spell Power weapon),
    though the catalogue has them, and Brilliant Mana Oil isn't in the catalogue: the priest's
    enchants are Greater Stats and Minor Haste only (priest.md §7.4). Brilliant Wizard Oil is in its Max
    consumables since the consumables review, in no Standard raid. A few percent of DPS.
  - **Shadowfiend** waits for the pet core (H1): its mana is left out (priest.md §5).
  - **Item effects the sim doesn't model on the priest's list:** Briarwood Reed's zone-bound spell
    power and Eye of the Beast's on-use +7% spell hit (priest.md §7.5).
- **The ranged and pet core's gaps** (H1, [ranged-and-pets.md](mechanics/ranged-and-pets.md#open-questions)):
  H2 closed them (ammo and quivers in the pool and their Gear slots, the `hunter` class, the ranged
  sheet, the pets' labelled rows).
- **The hunter's first-pass gaps** (H2, [hunter.md](classes/hunter.md#11-open-questions)):
  - **No scope** in the enchant catalogue (Sniper Scope's +7 damage, Biznicks 247x128 Accurascope's
    +3% hit).
  - **Melee weaving and Summon Hawk** aren't simulated, and the pet is a cat only (no Wolf's Furious
    Howl or other families); Multi-Shot's extra targets wait for M6.
  - **The Survival tree leans to melee in Forever** (Mongoose Bite, Lacerate, Predator's Edge,
    Strider Kick): the sim's Survival hunter shoots, with only its ranged talents. The result's
    `hunterNoMelee` note names only Raptor Strike, not these (HN6; the doc and this list say so).
  - **The Rotation tab's fixed rows don't follow the talents:** Trueshot Aura reads "With the
    talent" and Pet "Cat, or none with Lone Wolf" on every build (HN3; the runs are right, only
    the rows' wording is static).
  - **Rapid Recuperation and Resourcefulness aren't simulated or named in hunter.md §4** (HN4):
    Forever's mana-while-casting talents. A permanent 50% share leaves the 180 s defaults unchanged;
    they matter in long fights.
  - **Survival's default spends 5 points in Improved Arcane Shot** with Arcane Shot off (HN5):
    Improved Stings 3, Rapid Killing 2, Improved Arcane Shot 1 sims 2.0% higher, within D27's ±5%;
    D23's tuning picks the build.
  - **"Wait for Auto Shot" isn't dimmed** while Shared cooldown is "Neither" (HN8), and **Battle
    Shout stays on, unmarked, for a Lone Wolf hunter** with no pet to reach (HN10): both do nothing
    then, and cost nothing; marking Battle Shout needs the talents in `buffUnusedReason`.
  - **The ranged sheet shows no spell crit** (HN12), which Serpent Sting's ticks use [?]
    (hunter.md OQ-H1).
  - **Blackhand's Breadth's use and Dwarven Hand Cannon's chance on hit** aren't simulated (HN13,
    about 0.6% of DPS); both are flagged in the assumptions, as other items' effects are.
  - **The pet's inherited attack power counts Hunter's Mark** (H3's second verification, DV2-2),
    which in game is on the boss and may not reach the sheet the scaling aura reads: about 0.2% of
    Beast Mastery's and Survival's damage (hunter.md §6).
  - **Battle Shout reaches the cat** (DV2-7), Classic Era's rule, though Forever testers report pets
    can't receive external buffs: 4.4% of Beast Mastery's damage (hunter.md §6, the core's OQ-8).
- **The Demonology warlock's first-pass gaps** (H3, [warlock.md §11.7](classes/warlock.md#117-open-questions);
  [its review](reviews/2026-09-24-demonology.md)):
  - **The demon's spells take your Shadow Vulnerability** (DM2), whose aura 270 is damage taken from
    you alone: with the Succubus out, Lash of Pain gets +16% (Improved Shadow Bolt 4/5) for about a
    quarter of the fight, about +0.4 DPS (under 0.1%); the default Imp's Firebolt is Fire and takes
    none of it. It needs an aura flag for "from the caster only" that pet damage skips, with its test
    (DM12's last).
  - **"Voidwalker" touches its button's borders at 390 px** in the Demonic Sacrifice choice (DM9,
    pre-existing, Destruction too): wrap the four choices 2 × 2 at phone width, or pad the button.
  - **The default Imp build rests on Q19** [?] (DV2, D30): it's the sim's best found build, 6% ahead
    of the Succubus only through Improved Imp's hidden effect read as Firebolt's cast time. The
    optimizer (O4) confirms it on a fresh seed, and an in-game Firebolt test settles Q19. Demonic Pact
    leaves one point free in its tree, which went from Improved Sayaad to Improved Shadow Bolt 4/5
    (DV2-4, +0.4%); Improved Sayaad's other 2 points still do nothing with the Imp, for O4's talent
    search.
- **The caster core's gaps** (K1, [spells.md](mechanics/spells.md#open-questions)):
  - **The paladin doesn't get Curse of the Elements** though the buffs doc's presets list it for
    them (§6.2): K1 left every shipped result unchanged, as its brief required. It's +10% on every
    Holy hit, so a few percent of Retribution's DPS where a raid has a second warlock; the entry
    is ready (`curseOfTheElements`), and giving it to the paladin is one line and a golden update.
  - **Nightfall's Spell Vulnerability isn't a Buffs entry:** its proc rate is server-side, and a
    static entry needs an uptime (spells.md OQ-S10).
  - **The mana and spell damage entries go to classes, not specs:** the caster core's own entries
    and the melee's go by spec (`forSpecs`, `SpecMeta.caster`), and Arcane Brilliance, Blessing
    of Wisdom, the mana potions and the spell damage elixirs by class (`forClasses`). K6 gave them
    to every caster spec too (`forCasterSpecs`), so the Balance druid has them and its Feral specs
    don't ([druid §11.6](classes/druid.md#116-defaults)).
  - **The Enhancement shaman is on the core** since K5: its Lightning Bolt is hasted and its
    Nature-, Frost- and Fire-only spell damage lines count; its default result and golden didn't
    move ([shaman.md](classes/shaman.md#enhancement-on-the-core)).
- **The Elemental shaman's first-pass gaps** (K5, [shaman.md](classes/shaman.md#elemental-open-questions)):
  - **Caster enchants** (Spell Power on the weapon, Arcanum of Focus) are in the catalogue but not
    its defaults, and Zandalar Signet of Mojo waits on Zandalar: about 50 spell damage, roughly +5%
    for an Elemental shaman; the mages have the same gap ([mage.md](classes/mage.md)) (E9). Nightfin
    Soup and Brilliant Wizard Oil are in its Standard raid since T2.
  - **Eye of the Beast's use** (+7% spell hit for 20 s) needs a spell-hit aura mod (E7).
  - **Alliance gear**: the pre-raid list's honor mail is Horde's, and the Alliance's honor chain has
    no spell power, so a Dwarf is 3.3% behind (E8; its main hand is Sageclaw).
- **A paladin with no main hand:** its judgements and Hammer of Wrath show 0.0% crit, since the
  special-attack table is built only for a held weapon (RV6 in
  [Retribution's review](reviews/2026-09-23-retribution.md)).
- **The load warning for a buff nobody provides** says "needs a paladin in the raid" to a
  paladin, where the Buffs tab says "another" (RM3).
- **Switching a tank's priority keeps a value you set,** so Max TPS can silently keep a duty you
  turned on under Tank duties first; only its "Changed" mark shows it (PU11 in
  [Warrior Protection's review](reviews/2026-09-23-warrior-protection.md)).
- **Without a main hand, notes about swings that never happen still show** (`foreverWhiteRage`,
  the off hand's notes for Fury; PW6).
- **Two flat-damage-range fields:** `flatDamageRange` (0 to a range, Ferocious Bite) and
  Protection's `flatSpread` (± around the client's base) do similar jobs; merging them waits for a
  slice that can re-snapshot both.
- **The spec switcher's separators** sit inside each labelled class group from the second class
  on, so a screen reader reads them as part of that group (CF1).
- **The bear's review lows** ([its log](reviews/2026-09-24-feral-bear.md)): per-class wording of
  the white-threat note ("stance or form"); Max TPS results naming "your" roar when it's off; the
  bear's swings table listing 0% parry and block; Enrage's damage-taken figure (0.16% vs 0.14%);
  setup-store tests for a known but hidden spec.
- **The bear threat review's lows** (M5.6, `.cache/probes/tank-review-bear/report.md`; in-game
  tests decide them, so the model keeps its Forever reading until then):
  - **BR7, rage from hits divides by the bear's maximum health.** Rage from hits taken is 46% of the
    bear's rage, and Forever's rule (`10 × damage before mitigation ÷ max health`,
    [rage.md](mechanics/rage.md#forever-)) divides by health that Dire Bear Form's +1,240 and Heart
    of the Wild raise, so a bear gets less rage a hit than a warrior of the same gear; the evidence
    for bears is 33 low-level hits [?]. ±20% rage moves TPS about ±10%. In-game test G3: 30+ hits at
    two maximum-health levels, fit rage = k × damage ÷ max health.
  - **BR8, the bear's white rage uses the one-handed rate** (8.65 a landed swing; the two-handed
    11.25 would be +0.8% to +2.4% TPS) [?] ([rage.md](mechanics/rage.md#bear-druid-rage)). In-game
    test G4: 30+ auto attacks in Dire Bear Form.
  - **BR9, spell 414647** (20% weapon damage, server-triggered) may be Lacerate's hit; the model
    follows the tooltip's 10% a stack already there (druid.md Q16). In-game test G5.
- **The shaman's review lows** ([its log](reviews/2026-09-24-enhancement-shaman.md)): Rockbiter
  with Windfury Totem (+3.6%, untried by the first pass); the imbue help's +653 AP against 783.6
  with Elemental Weapons; derived Dwarf and Skyborne base rows; the inferred 16361 link;
  source-tag drift when the client data is regenerated from the cache.
- **The Elemental's review lows** ([its log](reviews/2026-09-24-elemental-shaman.md)): Mana Tide and
  Mana Spring share the water totem slot; Totemic Focus should make Mana Tide cost 45; two notes
  repeat that casting speed doesn't shorten the GCD; a stale comment range; Totem of the Storm's
  card shows no stats.
- **Caster enchants in the casters' defaults:** the catalogue has weapon Spell Power, Arcanum of
  Focus, Nightfin Soup and the wizard oils (T2), but only the warlock's and the Protection paladin's
  enchant defaults use the enchants, and only the Elemental shaman's and the Protection paladin's
  Standard raids the food and oil (buffs doc §6.3, §6.4). The mages, the priest and the Elemental
  shaman lack the enchants, roughly +5% each; the optimizer (O2) will pick them.
- **A flaky e2e test:** `tank-results.spec.ts`'s "the results sheet has damage taken and the boss's
  table, inside the screen" (phone) fails about 1 run in 15, on main as well; it passes on rerun.
  Find the timing it depends on.
- **Bearweaving:** rage from damage taken divides by the maximum health of the form the fight
  started in, which only holds while no rotation shifts into bear to take hits. A cat that did
  would gain about 47% too much; divide by the current form's health first
  ([druid.md §2.8](classes/druid.md#28-shapeshifting-furor-wolfshead-helm-powershifting-mana),
  BV3 in [the druid foundation's review](reviews/2026-09-23-druid-foundation.md)).
- **Multi-target isn't simulated** until [M6](milestones.md#m6-multi-target-). The Fight tab's Enemies
  control is hidden until then; `extraTargets` stays in the config
  ([encounter.md §4](mechanics/encounter.md)).
- **About's "Game data" rows** show the spellbook and talent builds from `warrior.json` only;
  list the build per dataset once another class's data is re-scraped.
- **Items:** 18320 Demonheart Spaulders may not be obtainable; PvP rank requirements show as
  numbers (the rank title depends on faction); whether a bear-form armor multiplier applies
  to stat-50 bonus armor is open (M4). Fallback shields carry `classicShieldBlockValue`,
  and Forever shields have no innate block value in the client (M3).
- **Pushes** happen at every stable state (D25); the deploy and Full regression runs are watched
  to green after each.
- **Deferred from the first-release review** (FV5, FV6, FV7 in
  [its log](reviews/2026-09-23-first-release.md#final-verification-of-the-third-pass-fixes)):
  - The character sheet shows only the main hand's crit, so Weaponmaster on an off-hand axe
    doesn't show there, though the sim applies it.
  - `Field`'s help text has no id, so it isn't in any control's `aria-describedby`.
  - Bad input in a number field gives no feedback: "abc" reverts and 99999 clamps silently
    (UX15).
  - A setup's name field takes more than 60 characters and says so only at Save; a live count
    would be clearer (QC1).
  - Each arrow key press between the sticky section tabs scrolls the page up by about 360 px
    (390) or 420 px (1280), because the tabs lie inside the top scroll padding. Peeking at a tab
    without choosing it loses your place.
- **The Destruction gear review's gaps** ([its log](reviews/2026-09-24-destruction-gear.md)):
  - **Sim-ranked lists for Frost, Arcane and Shadow** (DG-2). They wear their guide lists with Mindfang /
    Sageclaw added at rank 1. The same search as the warlocks' (warlock.md §7.3) finds more: Frost
    447.3 → 461.4 DPS (+3.2%), Arcane 434.8 → 464.3 (+6.8%), Shadow 559.7 → 582.4 (+4.1%), 20,000
    fights on seed 2701. Before those lists ship, the new candidates' Classic Era sources need
    checking (Frost Runed Headdress, Wand of Arcane Potency, Simone's Cultivating Hammer, and the
    staves Whiteout Staff and Crackling Staff). So does Leggings of Torment's, third on Affliction's
    legs: its note names a Dungeon Set 2 summoned boss from its id's block, with a Wowhead Classic link.
    The Fire mage's, Balance's and Elemental's guide lists haven't been searched either; their verification
    passes (DV2-4, GV-3, GV-4) re-ranked only the slots whose items changed, among each list's own items.
    Off the lists, Elemental Focus Band and Maiden's Circle would add +3.2 and +2.6 DPS in the Fire mage's
    second ring, and Draconic Infused Emblem +9.6 in the Shadow Priest's second trinket, +10.8 in the Frost
    mage's and +9.1 in the Arcane mage's (1.60.1.70009, 20,000 fights on seed 2701; GV-3).
  - **Elixir of Fire Power** (DG-8, [warlock.md §7.4](classes/warlock.md#74-enchants-and-consumables)):
    the only Fire elixir the Forever client links (+10 Fire spell damage) isn't in the catalogue; about
    +4 DPS for Destruction `[?]`, if it stacks with Shadow Power.
  - **Open plausibility finding (DV2-3, the Destruction gear verification, 2026-09-24): Demonology's
    lead rests on a [?].** On 1.60.1.70009 with the procs modelled, Demonology is 2nd of the 20 DPS
    specs (675.0 DPS, 20,000 fights on seed 2701), 77 ahead of Destruction (597.9). **42 of that lead
    rests on Q19** ([warlock.md §11.6](classes/warlock.md#116-defaults)), the sim's reading of Improved
    Imp's hidden effect as Firebolt's cast time: without it the Imp default falls to 605.2, and the
    default would be the Succubus build, 632.7, 35 ahead of Destruction. The model stays as it is until
    an in-game Q19 test (Firebolt's cast bar with Improved Imp 0/3 and 3/3) settles it.
  - **Item effects the sim doesn't model count as zero** in the lists' rankings (DV2-4,
    [items.md](data/items.md#modelled-item-effects)); the ones on the caster lists: Eye of the Beast's +7%
    spell hit use (E7, [shaman.md](classes/shaman.md)), Burst of Knowledge's and Second Wind's mana
    uses, Robe of the Archmage's mana use, Robe of the Void's pet heal, Energetic Rod's mana proc,
    Briarwood Reed's area-only +15 spell power, Freezing Band's when-struck proc and the Rank 7 silk
    handwraps' Mana Shield bonus. The mana ones matter only when a caster runs dry; Eye of the Beast's
    is about +0.6% for the specs that wear it.
  - **Draconic Infused Emblem's chance** `[?]`: the Forever client gives its proc (1318931) a 100%
    chance with no cooldown, so it's up from the first landed spell, though its tooltip says "Chance
    on harmful spellcast" (both readings argued in [items.md](data/items.md#modelled-item-effects)). It
    leads every warlock's, the Fire mage's, Elemental's and Balance's trinkets: +9.7 to +11.9 DPS over
    the next-ranked trinket (Balance +16.1 over Eye of the Beast, whose use counts as zero). At a lower
    chance it's worth less, and it **breaks even near a 12% chance** for Destruction, the Fire mage and
    Elemental and near 17% for Affliction and Demonology (paired, 20,000 fights on seed 2701; GV-5).
    Shown in the results' assumptions (`draconicEmblemChance`). Test: the buff's uptime on a target
    dummy over a few minutes of casting.
  - **The archived item citations' dates** (DV2-7): the sim-ranked lists' Wowhead Classic item links
    are Wayback Machine copies of the pre-Season of Mastery classic.wowhead.com pages, cited with a
    mid-2021 timestamp (`/web/20210601000000/`, the copy nearest June 2021; GV-7) because the review
    rounds had no network. Each copy's date wants checking, and pinning to a snapshot from before
    November 2021.
  - **Items that lost their Forever rows in 1.60.1.70009** (Spirit of Aquementas, Hardened Stone Band,
    Tempestria's Frozen Necklace) use Classic Era stats. The Shadow Priest's and Elemental's off hands
    were re-ranked (DV2-4); no list has the other two now (Hardened Stone Band left the Protection
    paladin's as Elemental Invasion loot, GV-6).
  - **A race change across builds** (GV-1): race changes swap stat twins the scraper reads from the
    client, and a Forever row never matches a Classic Era one, so the hunters' Rank 10 chain helm pair,
    Lieutenant Commander's Chain Helmet (a Forever row) and Champion's Chain Headguard (no Forever row:
    Classic Era's), no longer swap as the app's old stat match did. The one such pair in the pool; a
    hunter keeps the helm, and the notice says so.
  - **Arcane's and Frost's Alliance legs** (GV-4): Knight-Captain's Silk Legguards and Skyshroud
    Leggings tie within the interval for a Human (Skyshroud +0.3 in Frost, −0.1 in Arcane, 40,000
    fights), so the guide's order stands.
- **The casters' main-hand ranks** (FU-11, the final pre-release review for 1.60.1.70009,
  pre-existing, low):
  - **Two ranked lists in one picker, unlabelled.** A caster's main-hand picker shows two "Best in
    slot" items and two "#2"s, the two-hand list's and the main-hand list's, without saying which
    list each belongs to.
  - **Frost's two-hand ranking fails the D29 plausibility check.** It puts Rod of the Ogre Magi
    (23 spell power) as best in slot and Staff of Jordan as #2, while Ironbark Staff (94 spell power,
    +28 crit, item level 65) is unranked.
  - **The fix:** label each rank with its list, and rank the Frost and Arcane two-handers by sim.
    Queued with the gear search ([O2](milestones.md#m57-the-optimizer-d30--top-priority)); low because it's the
    picker's ranking, not a result, and the picker still offers every item.

- **From the priority-list reviews (M5.65 A2, 2026-09-25), low, waived for the release:**
  - **A demon's Shadow damage takes your Shadow Vulnerability** (LB-1): Demonic Brand's Shadow hits
    and the Succubus's Lash of Pain are multiplied by Improved Shadow Bolt's debuff, which is Shadow
    damage taken *from you* (warlock.md §4). About +0.4% on a Demonic Brand build and +3% on Lash of
    Pain; no default has a Shadow-damage demon out. The fix flags caster-only school-taken auras in
    the plan (`effects/types.ts`, `plan/types.ts`, `plan/build.ts`) and gives pets a product without
    them, which changes the plan format and so every warlock fingerprint: done with the next engine
    slice that re-snapshots them anyway.
  - **The warlock Filler row's icon is fixed** (UB-3, LB-5's icon half): Demonology shows Shadow
    Bolt while its setting is Incinerate, and Destruction without the talent shows Incinerate. The
    note under the setting says which is cast. An icon that follows the setup needs `AplRow` and
    the list's renderer.
  - **Arrow presses during a row's 200 ms move animation are dropped** (UB-10, pre-existing, dnd-kit):
    four presses 30 ms apart move three places; what's announced stays right.
  - **The Felhunter's `demonOut` assumption says Master Demonologist is up** (pre-existing): the
    Felhunter has none.
  - **A warlock marks every worn on-use item as pressed** (pre-existing), so none is ever listed as
    not simulated; check against the other casters' on-use handling.
- **A raid druid's Thorns takes a warrior tank's all-damage multiplier (PIV-3, pre-existing).** The
  druid's Thorns is another player's spell, so the Power Infusion round kept your school damage
  auras off it (`othersSpell`), but it still takes `magicMult`, which carries your stance's damage:
  Defensive Stance's ×0.9 lowers it by 10%, about 2.2 TPS (0.22%) in the warrior's default setup
  (`src/sim/engine/sim.ts`, the non-physical branch of the spell damage roll, "nor does another
  player's"). Any all-damage multiplier in the plan's `damageMult` reaches it the same way. Low:
  under a quarter of a percent, and the fix needs `magicMult` split into what's yours
  and what isn't, which also decides an item's spell (buffs doc §3.7); it goes with that split
  ([buffs "Thorns on the tank"](mechanics/buffs-debuffs-consumables.md#12-threat-defense-and-mana)).
