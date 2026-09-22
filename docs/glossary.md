# Glossary

Terms used across the docs and code. Mechanics are defined precisely in the linked docs;
this is the quick reference.

| Term | Meaning |
| --- | --- |
| **Forever** | WoW Forever, the Classic-based realm type this sim targets. Beta client builds `1.60.x`. |
| **Classic Era** | The 2019+ WoW Classic re-release (clients 1.13–1.15), our fallback ruleset. Not SoD/SoM. |
| **[F] / [C] / [?]** | Ruleset tags on documented values: Forever-verified / Classic Era / unverified. See [doctrine](doctrine.md#tagging). |
| **DPS / TPS** | Damage per second / threat per second, averaged over the fight. |
| **Pre-BiS** | Pre-raid best-in-slot: the best gear from dungeons, quests, crafting and reputation. Here, Rare items with required level 55–60. |
| **White hit** | An auto-attack swing. Resolved on the one-roll attack table; can glance. |
| **Yellow hit** | A special attack (e.g. Bloodthirst, Shred). Cannot glance; its roll structure is in [combat-tables](mechanics/combat-tables.md). |
| **Attack table** | The ordered list of outcomes (miss, dodge, parry, glancing, block, crit, hit) that one random roll selects from. |
| **Glancing blow** | A white hit against a higher-level target that deals reduced damage. |
| **Crushing blow** | A mob hit on a player that deals 150% damage; relevant for tanks. |
| **Weapon skill** | Skill with the equipped weapon type (300 at level 60 without bonuses). Changes miss, dodge, glancing and crit against bosses. |
| **Hit cap** | The +hit % beyond which more hit has no effect. |
| **On-next-swing** | Abilities (Heroic Strike, Cleave, Maul) that replace the next white swing. |
| **GCD** | Global cooldown: the minimum gap between most abilities. |
| **PPM** | Procs per minute. Proc chance scales with weapon speed: `chance = PPM × speed / 60`. |
| **Proc** | A chance-based triggered effect (Crusader, Flurry, Omen of Clarity, …). |
| **Execute phase** | The last 20% of the boss's health, when Execute and Hammer of Wrath become usable. |
| **Powershifting** | Druid technique: leave and re-enter cat form to regain energy via Furor/Wolfshead. |
| **Seal / Judgement** | Paladin self-buff that adds effects to melee swings; Judgement releases it at the target. |
| **World buffs** | Powerful buffs from world events and locations (Rallying Cry, Songflower, …). **Not available in Forever raids, so the sim excludes them** ([doctrine §1](doctrine.md#1-what-were-building)). |
| **APL** | Action priority list: the ordered, conditional rotation the engine follows. |
| **Iteration** | One simulated fight. Results average many iterations. |
| **RSC payload** | The data stream in foreverchanges.pro's server-rendered Next.js pages, which our scrapers parse. |
