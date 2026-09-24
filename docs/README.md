# Docs

The doctrine and domain knowledge for forever_sim. The engine is written *against* these
documents: if the code and a doc disagree, one of them is a bug.

## Start here

| Doc | What it's for |
| --- | --- |
| [doctrine.md](doctrine.md) | Scope, **where numbers come from**, tagging, engineering rules, and the **review gate** |
| [ux.md](ux.md) | UX principles, layout, sections, states, and the **UX review checklist** |
| [reviews/](reviews/README.md) | Adversarial review logs, one per push |
| [milestones.md](milestones.md) | The plan and current status |
| [architecture.md](architecture.md) | App layout, data flow, engine design, testing, deployment |
| [decisions.md](decisions.md) | Log of significant decisions and their reasons |
| [glossary.md](glossary.md) | Quick definitions of WoW and project terms |
| [open-questions.md](open-questions.md) | **The guild's testing checklist**: every unverified assumption, grouped by how to test it |

## Data snapshot

| Doc | Dataset |
| --- | --- |
| [data/README.md](data/README.md) | Overview: datasets, `meta` envelope, rules, refresh steps |
| [data/spells.md](data/spells.md) | `src/data/spells/*.json`: warrior, druid and paladin spellbooks |
| [data/talents.md](data/talents.md) | `src/data/talents/*.json`: talent trees, popular builds, build-code format |
| [data/races.md](data/races.md) | `src/data/races/races.json`: races, class availability, racials |
| [data/items.md](data/items.md) | `src/data/items/pre-bis.json`: Rare items, required level 55–60 |

## Mechanics (shared by all classes)

| Doc | Covers |
| --- | --- |
| [mechanics/forever-system-changes.md](mechanics/forever-system-changes.md) | Every non-class Forever change that could affect a sim |
| [mechanics/combat-tables.md](mechanics/combat-tables.md) | Attack tables, weapon skill, glancing, hit caps, spell hit, boss → player |
| [mechanics/damage-and-timing.md](mechanics/damage-and-timing.md) | Armor, weapon damage and normalization, haste, swing timers, GCD, procs, DoTs |
| [mechanics/encounter.md](mechanics/encounter.md) | Default target model and encounter settings |
| [mechanics/character-stats.md](mechanics/character-stats.md) | Base stats, racials, stat conversions, the derived-stat pipeline |
| [mechanics/rage.md](mechanics/rage.md) | Rage generation and spending (warrior, bear) |
| [mechanics/threat.md](mechanics/threat.md) | Threat modifiers and per-ability threat |
| [mechanics/spells.md](mechanics/spells.md) | The caster core: spell hit, crit and resists, spell power and coefficients, cast times, channels, DoTs, mana, the caster buffs and debuffs |
| [mechanics/buffs-debuffs-consumables.md](mechanics/buffs-debuffs-consumables.md) | Raid buffs, target debuffs, consumables, enchants, default presets (world buffs are excluded) |

## Classes

| Doc | Specs |
| --- | --- |
| [classes/warrior.md](classes/warrior.md) | Arms, Fury (DPS) · Protection (TPS) |
| [classes/druid.md](classes/druid.md) | Feral cat (DPS) · Feral bear (TPS) |
| [classes/paladin.md](classes/paladin.md) | Retribution (DPS) · Protection (TPS) |

## Conventions for research docs

**One owner per topic.** The doc listed for a topic in the tables above owns its values. Other
docs give a one-line summary and link to the owner instead of restating numbers. If you find
two docs disagreeing, the owner wins; fix the other one.

Every mechanics and class doc follows the same shape: a summary and status line, **What the
sim needs**, the topic sections (every value tagged `[F]`/`[C]`/`[?]` with a source),
**WoW Forever deviations**, **Implementation notes**, **Worked examples** (these become unit
tests), **Open questions**, and **Sources**.
