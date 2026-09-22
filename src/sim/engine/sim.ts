// The event-driven engine (docs/architecture.md#engine-design-m1, decision D15).
//
// One Sim runs one plan, fight after fight. It is a single monomorphic class over typed arrays:
// the plan is flattened in the constructor, per-fight state is reset rather than reallocated,
// and the hot loop allocates nothing. Derived stats are recomputed only when an aura that
// changes attributes starts or ends. Rules come from the plan's profile; constants cite their
// doc in the pure reference functions (core/formulas.ts, core/attack-table.ts).
//
// M1 simulates white swings, procs, auras, rage, threat and boss melee. M2 adds abilities and a
// priority-list rotation on the hooks marked "M2".
import {
  bossSlices,
  meleeChances,
  spellMiss,
  thresholds,
  whiteSlices,
  averageResist,
} from '../core/attack-table'
import { armorReduction, parryHasteRemaining, rageConversion } from '../core/formulas'
import { EventQueue } from '../core/queue'
import { Rng, STREAM } from '../core/rng'
import { ACTION, HAND, TRIGGER, TRIGGER_COUNT, type Plan } from '../plan/types'
import { DerivedStats, deriveStats, StatBlock } from '../stats/stat-block'

/** Event kinds. */
const EV_MH = 1
const EV_OH = 2
const EV_BOSS = 3
const EV_AURA_EXPIRE = 4
const EV_BLEED_TICK = 5
const EV_PERIODIC_RAGE = 6
const EV_DAMAGE_TAKEN = 7

/** Breakdown columns per source. */
export const FIELD = {
  damage: 0,
  threat: 1,
  casts: 2,
  hits: 3,
  crits: 4,
  misses: 5,
  dodges: 6,
  parries: 7,
  glances: 8,
  blocks: 9,
} as const
export const FIELD_COUNT = 10

/** Source rows 0 and 1 are always the white swings of each hand. */
export const SOURCE_MAIN_HAND = 0
export const SOURCE_OFF_HAND = 1

/** Safety cap on one chain of extra attacks (damage-and-timing §5.4). */
const MAX_CHAIN = 10
const EXTRA_QUEUE = 16

/** Level-based resistance of a +3 boss for magic procs [?] (combat-tables §9). */
const BOSS_LEVEL_RESISTANCE_PER_LEVEL = 8

/** Threat per rage from a spell effect (threat.md#threat-from-healing-power-gains-and-buffs). */
const THREAT_PER_RAGE_TENTH = 0.5

export class Sim {
  readonly plan: Plan
  /** Totals per source × field, summed over every fight run. */
  readonly counters: Float64Array
  /** Last fight's results. */
  fightDamage = 0
  fightThreat = 0
  fightMs = 0
  /** Diagnostics summed over every fight run (tests and tuning). */
  totalRageGainedTenths = 0
  totalRageWastedTenths = 0
  /** Test hook: called for every white swing (source row, hand, time) and bleed tick (source, −1, time). */
  trace: ((source: number, hand: number, time: number) => void) | null = null

  private readonly q = new EventQueue(512)
  private readonly rngFight = new Rng()
  private readonly rngTable = new Rng()
  private readonly rngDamage = new Rng()
  private readonly rngProc = new Rng()
  private readonly rngBoss = new Rng()

  // Static inputs.
  private readonly base: StatBlock
  private readonly scratch = new StatBlock()
  private readonly derived = new DerivedStats()
  private readonly hasWeapon: Uint8Array
  private readonly wMin: Float64Array
  private readonly wMax: Float64Array
  private readonly wSpeedSec: Float64Array
  private readonly wFlat: Float64Array
  private readonly wHandMult: Float64Array
  private readonly wSkill: Float64Array
  private readonly wHitBonus: Float64Array
  private readonly wCritBonus: Float64Array
  private readonly wArmorPenPct: Float64Array
  private readonly wGlanceLow: Float64Array
  private readonly wGlanceHigh: Float64Array
  private readonly wTwoHand: Uint8Array
  /** Normalized white rage per landed swing, in tenths (profile `normalized`). */
  private readonly wNormRageTenths: Int32Array
  private readonly wRageMult: Float64Array
  private readonly dualWield: boolean
  private readonly normalizedRage: boolean
  private readonly avoidedRageShare: number
  private readonly rageConv: number
  private readonly staticPhysMult: number
  private readonly staticMagicMult: number
  private readonly bossLevelResist: number

  // Procs, flattened.
  private readonly pTrigger: Int32Array
  private readonly pChance: Float64Array // [proc × 2]
  private readonly pHands: Int32Array
  private readonly pIcd: Float64Array
  private readonly pAction: Int32Array
  private readonly pAmount: Float64Array
  private readonly pA: Float64Array
  private readonly pB: Float64Array
  private readonly pSchool: Int32Array
  private readonly pSource: Int32Array
  private readonly pChainBit: Int32Array
  private readonly pBleedSlot: Int32Array
  private readonly triggerLists: Int32Array[]

  // Auras, flattened.
  private readonly aDuration: Float64Array
  private readonly aMaxStacks: Int32Array
  private readonly aCharges: Int32Array
  private readonly aStr: Float64Array
  private readonly aAgi: Float64Array
  private readonly aAp: Float64Array
  private readonly aCrit: Float64Array
  private readonly aHaste: Float64Array
  private readonly aDamage: Float64Array
  private readonly aStatful: Uint8Array
  private readonly chargeAuras: Int32Array

  // Per-fight state.
  private now = 0
  private fightEnd = 0
  private rage = 0
  private readonly maxRage: number
  private readonly swingMs = new Float64Array(2)
  private readonly nextSwingAt = new Float64Array(2)
  private readonly swingGen = new Int32Array(2)
  private bossNextAt = 0
  private bossGen = 0
  private bossSwingMs = 0
  private readonly procReadyAt: Float64Array
  private readonly auraActive: Uint8Array
  private readonly auraStacks: Int32Array
  private readonly auraCharges: Int32Array
  private readonly auraGen: Int32Array
  private readonly bleedTicksLeft: Int32Array
  private readonly bleedGen: Int32Array
  private readonly bleedProc: Int32Array
  private dynStr = 0
  private dynAgi = 0
  private dynAp = 0
  private dynCrit = 0
  private auraHasteMult = 1

  // Derived per hand, refreshed on stat changes.
  private ap = 0
  private readonly critPct = new Float64Array(2)
  private readonly thrWhite = new Float64Array(12)
  private readonly thrBoss = new Float64Array(6)
  private readonly armorFactor = new Float64Array(2)
  private physMult = 1
  private magicMult = 1
  private hasteMult = 1
  private blockValue = 0
  private spellMissPct = 0

  // Extra-attack FIFO and the chain mask of the attack being resolved.
  private readonly exSource = new Int32Array(EXTRA_QUEUE)
  private readonly exBonusAp = new Float64Array(EXTRA_QUEUE)
  private readonly exMask = new Int32Array(EXTRA_QUEUE)
  private exHead = 0
  private exCount = 0
  private chainMask = 0

  constructor(plan: Plan) {
    this.plan = plan
    this.base = new StatBlock().copyFrom(plan.stats)
    this.counters = new Float64Array(plan.sources.length * FIELD_COUNT)

    const w = plan.weapons
    this.hasWeapon = new Uint8Array(2)
    this.wMin = new Float64Array(2)
    this.wMax = new Float64Array(2)
    this.wSpeedSec = new Float64Array(2)
    this.wFlat = new Float64Array(2)
    this.wHandMult = new Float64Array(2)
    this.wSkill = new Float64Array(2)
    this.wHitBonus = new Float64Array(2)
    this.wCritBonus = new Float64Array(2)
    this.wArmorPenPct = new Float64Array(2)
    this.wGlanceLow = new Float64Array(2)
    this.wGlanceHigh = new Float64Array(2)
    this.wTwoHand = new Uint8Array(2)
    this.wNormRageTenths = new Int32Array(2)
    this.wRageMult = new Float64Array(2)
    const rage = plan.profile.rage
    for (let h = 0; h < 2; h++) {
      const weapon = w[h]
      if (!weapon) continue
      this.hasWeapon[h] = 1
      this.wMin[h] = weapon.min
      this.wMax[h] = weapon.max
      this.wSpeedSec[h] = weapon.speedSec
      this.wFlat[h] = weapon.flatDamage
      this.wHandMult[h] = weapon.handMult
      this.wSkill[h] = weapon.skill
      this.wHitBonus[h] = weapon.hitBonus
      this.wCritBonus[h] = weapon.critBonus
      this.wArmorPenPct[h] = weapon.armorPenPct
      this.wGlanceLow[h] = weapon.glanceLow
      this.wGlanceHigh[h] = weapon.glanceHigh
      this.wTwoHand[h] = weapon.twoHand ? 1 : 0
      this.wRageMult[h] = weapon.rageMult
      // docs/mechanics/rage.md#forever-normalized-rage-per-swing-: k × base speed (× off-hand base), floored to tenths
      const k = weapon.twoHand ? rage.normalizedTwoHand : rage.normalizedOneHand
      const offBase = h === HAND.off ? rage.offHandBase : 1
      this.wNormRageTenths[h] = Math.floor(k * weapon.speedSec * offBase * weapon.rageMult * 10 + 1e-9)
    }
    this.dualWield = w[HAND.main] !== null && w[HAND.off] !== null
    this.normalizedRage = rage.white === 'normalized'
    this.avoidedRageShare = rage.avoidedWhiteShare
    this.rageConv = rageConversion(plan.playerLevel)
    this.staticPhysMult = plan.damageMult * plan.physicalMult
    this.staticMagicMult = plan.damageMult
    this.bossLevelResist = BOSS_LEVEL_RESISTANCE_PER_LEVEL * Math.max(0, plan.fight.targetLevel - plan.playerLevel)
    this.maxRage = plan.rage.maxTenths

    const procs = plan.procs
    const np = procs.length
    this.pTrigger = new Int32Array(np)
    this.pChance = new Float64Array(np * 2)
    this.pHands = new Int32Array(np)
    this.pIcd = new Float64Array(np)
    this.pAction = new Int32Array(np)
    this.pAmount = new Float64Array(np)
    this.pA = new Float64Array(np)
    this.pB = new Float64Array(np)
    this.pSchool = new Int32Array(np)
    this.pSource = new Int32Array(np)
    this.pChainBit = new Int32Array(np)
    this.pBleedSlot = new Int32Array(np).fill(-1)
    this.procReadyAt = new Float64Array(np)
    let bleeds = 0
    for (let i = 0; i < np; i++) {
      const p = procs[i]
      this.pTrigger[i] = p.trigger
      this.pChance[2 * i] = p.chance[0]
      this.pChance[2 * i + 1] = p.chance[1]
      this.pHands[i] = p.hands
      this.pIcd[i] = p.icdMs
      this.pAction[i] = p.action
      this.pAmount[i] = p.amount
      this.pA[i] = p.a
      this.pB[i] = p.b
      this.pSchool[i] = p.school
      this.pSource[i] = p.source
      this.pChainBit[i] = p.chainBit
      if (p.action === ACTION.weaponBleed) this.pBleedSlot[i] = bleeds++
    }
    this.bleedTicksLeft = new Int32Array(bleeds)
    this.bleedGen = new Int32Array(bleeds)
    this.bleedProc = new Int32Array(bleeds)
    for (let i = 0; i < np; i++) if (this.pBleedSlot[i] >= 0) this.bleedProc[this.pBleedSlot[i]] = i
    this.triggerLists = []
    for (let t = 0; t < TRIGGER_COUNT; t++) this.triggerLists.push(Int32Array.from(plan.triggers[t] ?? []))

    const auras = plan.auras
    const na = auras.length
    this.aDuration = new Float64Array(na)
    this.aMaxStacks = new Int32Array(na)
    this.aCharges = new Int32Array(na)
    this.aStr = new Float64Array(na)
    this.aAgi = new Float64Array(na)
    this.aAp = new Float64Array(na)
    this.aCrit = new Float64Array(na)
    this.aHaste = new Float64Array(na)
    this.aDamage = new Float64Array(na)
    this.aStatful = new Uint8Array(na)
    this.auraActive = new Uint8Array(na)
    this.auraStacks = new Int32Array(na)
    this.auraCharges = new Int32Array(na)
    this.auraGen = new Int32Array(na)
    const chargeAuras: number[] = []
    for (let i = 0; i < na; i++) {
      const a = auras[i]
      this.aDuration[i] = a.durationMs
      this.aMaxStacks[i] = Math.max(1, a.maxStacks)
      this.aCharges[i] = a.whiteSwingCharges
      this.aStr[i] = a.str
      this.aAgi[i] = a.agi
      this.aAp[i] = a.ap
      this.aCrit[i] = a.crit
      this.aHaste[i] = a.haste
      this.aDamage[i] = a.damage
      this.aStatful[i] = a.str || a.agi || a.ap || a.crit ? 1 : 0
      if (a.whiteSwingCharges > 0) chargeAuras.push(i)
    }
    this.chargeAuras = Int32Array.from(chargeAuras)
  }

  // ------------------------------------------------------------------------------------------
  // Fight loop
  // ------------------------------------------------------------------------------------------

  /** Runs fight number `index` (its randomness depends only on the plan's seed and `index`). */
  runFight(index: number): void {
    const plan = this.plan
    const seed = plan.seed
    this.rngFight.seed(seed, index, STREAM.fight)
    this.rngTable.seed(seed, index, STREAM.table)
    this.rngDamage.seed(seed, index, STREAM.damage)
    this.rngProc.seed(seed, index, STREAM.proc)
    this.rngBoss.seed(seed, index, STREAM.boss)

    // docs/mechanics/encounter.md#implementation-notes: L_i = round(L × (1 + v × (2u − 1)))
    const f = plan.fight
    const u = this.rngFight.next()
    this.fightEnd = Math.round(f.durationMs * (1 + f.variation * (2 * u - 1)))
    this.reset()

    const q = this.q
    // docs/mechanics/damage-and-timing.md#31-haste: main hand at 0, off hand at half its swing [?]
    if (this.hasWeapon[HAND.main]) this.scheduleSwing(HAND.main, 0)
    if (this.dualWield) this.scheduleSwing(HAND.off, Math.round(0.5 * this.swingMs[HAND.off]))
    if (f.bossSwing) {
      this.bossSwingMs = Math.round(f.bossSwing.speedSec * 1000)
      this.bossNextAt = 0
      q.push(0, EV_BOSS, 0, this.bossGen)
    }
    if (f.damageTakenPerHit > 0) q.push(f.damageTakenIntervalMs, EV_DAMAGE_TAKEN, 0, 0)
    const periodic = plan.periodicRage
    for (let i = 0; i < periodic.length; i++) q.push(periodic[i].periodMs, EV_PERIODIC_RAGE, i, 0)

    const end = this.fightEnd
    while (q.pop()) {
      const t = q.time
      if (t >= end) break
      this.now = t
      const data = q.data
      switch (q.kind) {
        case EV_MH:
          if (q.gen === this.swingGen[HAND.main]) this.onSwingTimer(HAND.main)
          break
        case EV_OH:
          if (q.gen === this.swingGen[HAND.off]) this.onSwingTimer(HAND.off)
          break
        case EV_BOSS:
          if (q.gen === this.bossGen) {
            this.onBossSwing()
            // Extra attacks granted by defensive procs (e.g. Reckoning, M5) swing now too.
            if (this.exCount > 0) this.drainExtraAttacks()
          }
          break
        case EV_AURA_EXPIRE:
          if (q.gen === this.auraGen[data] && this.auraActive[data]) this.removeAura(data)
          break
        case EV_BLEED_TICK:
          if (q.gen === this.bleedGen[data]) this.onBleedTick(data)
          break
        case EV_PERIODIC_RAGE: {
          const p = periodic[data]
          this.gainRage(p.tenths, -1)
          q.push(t + p.periodMs, EV_PERIODIC_RAGE, data, 0)
          break
        }
        case EV_DAMAGE_TAKEN:
          this.takeDamage(f.damageTakenPerHit, f.damageTakenPerHit)
          if (this.exCount > 0) this.drainExtraAttacks()
          q.push(t + f.damageTakenIntervalMs, EV_DAMAGE_TAKEN, 0, 0)
          break
      }
    }
    this.fightMs = end
  }

  /** A snapshot of the fight-start state, for tests: derived stats, tables and multipliers. */
  inspect() {
    this.reset()
    return {
      attackPower: this.ap,
      crit: Array.from(this.critPct),
      whiteThresholds: [Array.from(this.thrWhite.subarray(0, 6)), Array.from(this.thrWhite.subarray(6, 12))],
      bossThresholds: Array.from(this.thrBoss),
      armorFactor: Array.from(this.armorFactor),
      swingMs: Array.from(this.swingMs),
      physMult: this.physMult,
      maxRage: this.maxRage,
      blockValue: this.blockValue,
    }
  }

  private reset(): void {
    this.q.clear()
    this.now = 0
    this.rage = 0
    this.fightDamage = 0
    this.fightThreat = 0
    this.swingGen[0]++
    this.swingGen[1]++
    this.bossGen++
    this.procReadyAt.fill(0)
    for (let i = 0; i < this.auraActive.length; i++) {
      this.auraActive[i] = 0
      this.auraStacks[i] = 0
      this.auraCharges[i] = 0
      this.auraGen[i]++
    }
    for (let i = 0; i < this.bleedTicksLeft.length; i++) {
      this.bleedTicksLeft[i] = 0
      this.bleedGen[i]++
    }
    this.dynStr = 0
    this.dynAgi = 0
    this.dynAp = 0
    this.dynCrit = 0
    this.auraHasteMult = 1
    this.exHead = 0
    this.exCount = 0
    this.chainMask = 0
    this.recomputeStats()
    this.recomputeMultipliers()
  }

  // ------------------------------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------------------------------

  /** Re-derives stats after an attribute aura changes (character-stats.md#derived-stat-pipeline). */
  private recomputeStats(): void {
    const plan = this.plan
    const s = this.scratch.copyFrom(this.base)
    s.str += this.dynStr
    s.agi += this.dynAgi
    s.ap += this.dynAp
    s.crit += this.dynCrit
    const d = deriveStats(s, { profile: plan.profile, applyUnmeasured: plan.applyUnmeasured, level: plan.playerLevel }, this.derived)
    this.ap = d.attackPower
    this.blockValue = d.blockValue
    this.spellMissPct = spellMiss(plan.profile, plan.playerLevel, plan.fight.targetLevel, d.spellHit)
    const f = plan.fight
    for (let h = 0; h < 2; h++) {
      if (!this.hasWeapon[h]) continue
      const sheetCrit = d.crit + this.wCritBonus[h]
      this.critPct[h] = sheetCrit
      // docs/mechanics/combat-tables.md#2-melee-attack-table-white-swings
      const ch = meleeChances(
        plan.profile,
        {
          attackerLevel: plan.playerLevel,
          targetLevel: f.targetLevel,
          skill: this.wSkill[h],
          hit: d.hit + this.wHitBonus[h],
          sheetCrit,
          auraCrit: d.auraCrit + this.wCritBonus[h],
          expertise: d.expertise,
          front: f.front,
          canDodge: f.bossCanDodge,
          canParry: f.bossCanParry,
          canBlock: f.bossCanBlock,
        },
        true,
        this.dualWield,
      )
      thresholds(whiteSlices(ch), this.thrWhite.subarray(6 * h, 6 * h + 6))
      // docs/mechanics/damage-and-timing.md#12-armor-reduction-debuffs-and-penetration: flat reductions, then % ignored
      let armor = f.targetArmor - d.armorPen
      if (armor > 0) armor *= 1 - this.wArmorPenPct[h]
      this.armorFactor[h] = 1 - armorReduction(armor, plan.playerLevel, plan.profile)
    }
    if (f.bossSwing) {
      // docs/mechanics/combat-tables.md#8-boss--player-tanks
      thresholds(
        bossSlices({
          playerLevel: plan.playerLevel,
          bossLevel: f.targetLevel,
          defense: d.defense,
          dodge: d.dodge,
          parry: d.parry,
          block: d.block,
          canCrush: f.bossSwing.canCrush,
        }),
        this.thrBoss,
      )
    }
    this.hasteMult = d.hasteMult * this.auraHasteMult
    this.updateSwingSpeeds()
  }

  /** Damage and haste multipliers from auras (multiplicative, damage-and-timing §2.4 and §3.1). */
  private recomputeMultipliers(): void {
    let haste = 1
    let damage = 1
    for (let i = 0; i < this.auraActive.length; i++) {
      if (!this.auraActive[i]) continue
      const stacks = this.auraStacks[i]
      if (this.aHaste[i]) haste *= 1 + (this.aHaste[i] * stacks) / 100
      if (this.aDamage[i]) damage *= 1 + (this.aDamage[i] * stacks) / 100
    }
    this.auraHasteMult = haste
    this.physMult = this.staticPhysMult * damage
    this.magicMult = this.staticMagicMult
    this.hasteMult = this.derived.hasteMult * haste
    this.updateSwingSpeeds()
  }

  /** New swing speeds apply from the next swing; the running timer isn't rescaled [?] (damage-and-timing §3.1). */
  private updateSwingSpeeds(): void {
    for (let h = 0; h < 2; h++) {
      if (this.hasWeapon[h]) this.swingMs[h] = Math.round((this.wSpeedSec[h] * 1000) / this.hasteMult)
    }
  }

  // ------------------------------------------------------------------------------------------
  // White swings
  // ------------------------------------------------------------------------------------------

  private scheduleSwing(hand: number, at: number): void {
    this.nextSwingAt[hand] = at
    this.q.push(at, hand === HAND.main ? EV_MH : EV_OH, 0, ++this.swingGen[hand])
  }

  private onSwingTimer(hand: number): void {
    this.chainMask = 0
    // M2: a queued on-next-swing ability (Heroic Strike, Cleave) replaces a main-hand swing here,
    // and lifts the dual-wield penalty from the off hand while queued.
    this.whiteSwing(hand, hand === HAND.main ? SOURCE_MAIN_HAND : SOURCE_OFF_HAND, 0)
    this.scheduleSwing(hand, this.now + this.swingMs[hand])
    if (this.exCount > 0) this.drainExtraAttacks()
  }

  /**
   * Resolves one white swing: roll the table, deal damage, gain rage, fire procs
   * (combat-tables §2, damage-and-timing §2, rage.md, threat.md).
   */
  private whiteSwing(hand: number, source: number, bonusAp: number): void {
    // Flurry-style charges: every white swing uses one before its own crit can refresh them.
    const charged = this.chargeAuras
    for (let i = 0; i < charged.length; i++) {
      const a = charged[i]
      if (this.auraActive[a] && --this.auraCharges[a] <= 0) this.removeAura(a)
    }

    const c = this.counters
    const row = source * FIELD_COUNT
    c[row + FIELD.casts]++
    if (this.trace !== null) this.trace(source, hand, this.now)
    const r = this.rngTable.roll100()
    const o = 6 * hand
    const th = this.thrWhite
    if (r < th[o]) {
      c[row + FIELD.misses]++
      return
    }
    if (r < th[o + 2]) {
      const dodged = r < th[o + 1]
      c[row + (dodged ? FIELD.dodges : FIELD.parries)]++
      // docs/mechanics/rage.md#rage-from-damage-dealt: Classic gives 75% of the would-be damage; Forever 0
      if (!this.normalizedRage && this.avoidedRageShare > 0) {
        const wouldBe = this.whiteDamage(hand, bonusAp)
        this.gainRage(this.whiteDamageRageTenths(hand, this.avoidedRageShare * wouldBe), -1)
      }
      if (!dodged) this.onBossParried()
      return
    }
    let damage = this.whiteDamage(hand, bonusAp)
    let crit = false
    if (r < th[o + 3]) {
      // docs/mechanics/combat-tables.md#23-glancing-blows
      damage *= this.rngDamage.uniform(this.wGlanceLow[hand], this.wGlanceHigh[hand])
      c[row + FIELD.glances]++
    } else if (r < th[o + 4]) {
      // Mob block value is 0 [?] (combat-tables §2.4): a block is a normal hit in its own slice.
      c[row + FIELD.blocks]++
    } else if (r < th[o + 5]) {
      damage *= 2 // docs/mechanics/damage-and-timing.md#25-crit-glancing-crushing-and-block-multipliers
      crit = true
      c[row + FIELD.crits]++
    } else {
      c[row + FIELD.hits]++
    }
    this.dealDamage(source, damage)
    if (this.normalizedRage) this.gainRage(this.wNormRageTenths[hand], -1)
    else this.gainRage(this.whiteDamageRageTenths(hand, damage), -1)
    this.fireProcs(TRIGGER.whiteLanded, hand)
    this.fireProcs(TRIGGER.meleeLanded, hand)
    if (crit) this.fireProcs(TRIGGER.meleeCrit, hand)
  }

  /** A landed white swing's damage before the outcome multiplier (damage-and-timing §2.6, steps 1–4). */
  private whiteDamage(hand: number, bonusAp: number): number {
    const weaponRoll = this.rngDamage.uniform(this.wMin[hand], this.wMax[hand])
    return (
      (weaponRoll + this.wFlat[hand] + ((this.ap + bonusAp) / 14) * this.wSpeedSec[hand]) *
      this.wHandMult[hand] *
      this.physMult *
      this.armorFactor[hand]
    )
  }

  /** Classic Era white-hit rage, 7.5 × damage / c, × this hand's multiplier (rage.md). */
  private whiteDamageRageTenths(hand: number, damage: number): number {
    const rage = ((7.5 * damage) / this.rageConv) * this.wRageMult[hand]
    return Math.floor(rage * 10 + 1e-9)
  }

  private drainExtraAttacks(): void {
    let chain = 0
    while (this.exCount > 0 && chain < MAX_CHAIN) {
      const i = this.exHead
      this.exHead = (this.exHead + 1) % EXTRA_QUEUE
      this.exCount--
      this.chainMask = this.exMask[i]
      // docs/mechanics/damage-and-timing.md#33-swing-reset-rules: the main hand swings now and restarts its timer
      this.whiteSwing(HAND.main, this.exSource[i], this.exBonusAp[i])
      chain++
    }
    this.exCount = 0
    this.exHead = 0
    this.chainMask = 0
    this.scheduleSwing(HAND.main, this.now + this.swingMs[HAND.main])
  }

  private dealDamage(source: number, damage: number): void {
    const threat = damage * this.plan.threatMult
    const row = source * FIELD_COUNT
    this.counters[row + FIELD.damage] += damage
    this.counters[row + FIELD.threat] += threat
    this.fightDamage += damage
    this.fightThreat += threat
  }

  // ------------------------------------------------------------------------------------------
  // Procs and auras
  // ------------------------------------------------------------------------------------------

  /** Rolls every proc on this trigger (damage-and-timing §5). `hand` is −1 for non-attack triggers. */
  private fireProcs(trigger: number, hand: number): void {
    const list = this.triggerLists[trigger]
    for (let k = 0; k < list.length; k++) {
      const p = list[k]
      if (hand >= 0 && (this.pHands[p] & (1 << hand)) === 0) continue
      if (this.procReadyAt[p] > this.now) continue
      const chance = this.pChance[2 * p + (hand > 0 ? hand : 0)]
      if (chance < 1 && this.rngProc.next() >= chance) continue
      if (this.pIcd[p] > 0) this.procReadyAt[p] = this.now + this.pIcd[p]
      this.doAction(p)
    }
  }

  private doAction(p: number): void {
    switch (this.pAction[p]) {
      case ACTION.extraAttacks: {
        const bit = this.pChainBit[p]
        // A source can't proc from its own chain of extra attacks (damage-and-timing §5.4).
        if (this.chainMask & bit || !this.hasWeapon[HAND.main]) return
        const n = this.pAmount[p]
        for (let k = 0; k < n && this.exCount < EXTRA_QUEUE; k++) {
          const slot = (this.exHead + this.exCount) % EXTRA_QUEUE
          this.exSource[slot] = this.pSource[p]
          this.exBonusAp[slot] = this.pA[p]
          this.exMask[slot] = this.chainMask | bit
          this.exCount++
        }
        return
      }
      case ACTION.aura:
        this.applyAura(this.pAmount[p])
        return
      case ACTION.rage:
        this.gainRage(this.pAmount[p], this.pSource[p])
        return
      case ACTION.spellDamage:
        this.spellProc(p)
        return
      case ACTION.weaponBleed: {
        const slot = this.pBleedSlot[p]
        // Refresh restarts the ticks; old damage doesn't roll over (warrior.md §2.5).
        this.bleedTicksLeft[slot] = this.pAmount[p]
        this.q.push(this.now + this.pB[p], EV_BLEED_TICK, slot, ++this.bleedGen[slot])
        this.counters[this.pSource[p] * FIELD_COUNT + FIELD.casts]++
        return
      }
    }
  }

  private applyAura(a: number): void {
    const wasActive = this.auraActive[a] === 1
    const oldStacks = this.auraStacks[a]
    const stacks = wasActive ? Math.min(oldStacks + 1, this.aMaxStacks[a]) : 1
    this.auraActive[a] = 1
    this.auraStacks[a] = stacks
    this.auraCharges[a] = this.aCharges[a]
    this.q.push(this.now + this.aDuration[a], EV_AURA_EXPIRE, a, ++this.auraGen[a])
    if (stacks !== oldStacks || !wasActive) this.auraChanged(a, stacks - (wasActive ? oldStacks : 0))
  }

  private removeAura(a: number): void {
    const stacks = this.auraStacks[a]
    this.auraActive[a] = 0
    this.auraStacks[a] = 0
    this.auraCharges[a] = 0
    this.auraGen[a]++
    this.auraChanged(a, -stacks)
  }

  private auraChanged(a: number, deltaStacks: number): void {
    if (this.aStatful[a]) {
      this.dynStr += this.aStr[a] * deltaStacks
      this.dynAgi += this.aAgi[a] * deltaStacks
      this.dynAp += this.aAp[a] * deltaStacks
      this.dynCrit += this.aCrit[a] * deltaStacks
      this.recomputeStats()
    }
    if (this.aHaste[a] || this.aDamage[a]) this.recomputeMultipliers()
  }

  /** A magic proc: spell hit roll, average partial resist, no crit [?] (combat-tables §9). */
  private spellProc(p: number): void {
    const row = this.pSource[p] * FIELD_COUNT
    const c = this.counters
    c[row + FIELD.casts]++
    if (this.rngProc.roll100() < this.spellMissPct) {
      c[row + FIELD.misses]++
      return
    }
    const holy = this.pSchool[p] === 5
    const resist = holy ? 0 : averageResist(this.bossLevelResist, this.plan.playerLevel)
    const damage = this.rngDamage.uniform(this.pA[p], this.pB[p]) * (1 - resist) * this.magicMult
    c[row + FIELD.hits]++
    this.dealDamage(this.pSource[p], damage)
  }

  /** Deep Wounds-style bleed tick: share × main-hand average swing / ticks, current AP, no armor (warrior.md §2.5). */
  private onBleedTick(slot: number): void {
    const p = this.bleedProc[slot]
    const ticks = this.pAmount[p]
    const h = HAND.main
    const average = this.hasWeapon[h]
      ? (this.wMin[h] + this.wMax[h]) / 2 + this.wFlat[h] + (this.ap / 14) * this.wSpeedSec[h]
      : 0
    const damage = ((this.pA[p] * average) / ticks) * this.physMult
    const row = this.pSource[p] * FIELD_COUNT
    this.counters[row + FIELD.hits]++
    if (this.trace !== null) this.trace(this.pSource[p], -1, this.now)
    this.dealDamage(this.pSource[p], damage)
    if (--this.bleedTicksLeft[slot] > 0) this.q.push(this.now + this.pB[p], EV_BLEED_TICK, slot, this.bleedGen[slot])
  }

  // ------------------------------------------------------------------------------------------
  // Rage
  // ------------------------------------------------------------------------------------------

  /** Adds rage in tenths, capped. `source` ≥ 0 marks an energize: 5 threat per rage gained (threat.md). */
  private gainRage(tenths: number, source: number): void {
    if (tenths <= 0) return
    const gained = Math.min(tenths, this.maxRage - this.rage)
    this.rage += gained
    this.totalRageGainedTenths += gained
    this.totalRageWastedTenths += tenths - gained
    if (source >= 0 && gained > 0) {
      const threat = gained * THREAT_PER_RAGE_TENTH
      this.counters[source * FIELD_COUNT + FIELD.threat] += threat
      this.fightThreat += threat
    }
    // M2: rage changes are a decision point for the rotation.
  }

  // ------------------------------------------------------------------------------------------
  // Boss melee and damage taken
  // ------------------------------------------------------------------------------------------

  /** The boss parried the player: parry haste on the boss's pending swing (damage-and-timing §3.4). */
  private onBossParried(): void {
    const boss = this.plan.fight.bossSwing
    if (!boss || !boss.parryHaste) return
    const remaining = this.bossNextAt - this.now
    const after = Math.round(parryHasteRemaining(remaining, this.bossSwingMs))
    if (after !== remaining) {
      this.bossNextAt = this.now + after
      this.q.push(this.bossNextAt, EV_BOSS, 0, ++this.bossGen)
    }
  }

  /** One boss swing on the tank (combat-tables §8, encounter §5). */
  private onBossSwing(): void {
    const boss = this.plan.fight.bossSwing!
    const rng = this.rngBoss
    const r = rng.roll100()
    const raw = rng.uniform(boss.minDamage, boss.maxDamage)
    const th = this.thrBoss
    this.bossNextAt = this.now + this.bossSwingMs
    this.q.push(this.bossNextAt, EV_BOSS, 0, ++this.bossGen)
    if (r < th[0]) return // miss
    if (r < th[2]) {
      this.fireProcs(TRIGGER.dodgeParry, -1)
      if (r >= th[1]) this.onPlayerParried()
      return
    }
    // docs/mechanics/damage-and-timing.md#26-order-of-operations-physical-direct-hit, boss → tank
    const mitigated = raw * (1 - armorReduction(this.plan.armor, this.plan.fight.targetLevel, this.plan.profile)) * this.plan.damageTakenMult
    let lost: number
    let preArmor = raw
    if (r < th[3]) {
      lost = Math.max(0, mitigated - this.blockValue)
      preArmor = mitigated > 0 ? raw * (lost / mitigated) : 0
      this.fireProcs(TRIGGER.block, -1)
    } else if (r < th[4]) {
      lost = mitigated * 2
      preArmor = raw * 2
    } else if (r < th[5]) {
      lost = mitigated * 1.5
      preArmor = raw * 1.5
    } else {
      lost = mitigated
    }
    this.takeDamage(lost, preArmor)
  }

  /** The tank parried: parry haste on its own main-hand swing (damage-and-timing §3.4). */
  private onPlayerParried(): void {
    if (!this.hasWeapon[HAND.main]) return
    const remaining = this.nextSwingAt[HAND.main] - this.now
    const after = Math.round(parryHasteRemaining(remaining, this.swingMs[HAND.main]))
    if (after !== remaining) this.scheduleSwing(HAND.main, this.now + after)
  }

  /** Health lost to an attack: rage from damage taken, then damage-taken procs (rage.md implementation notes). */
  private takeDamage(healthLost: number, preArmor: number): void {
    if (healthLost <= 0) return
    const plan = this.plan
    let rage: number
    switch (plan.rage.damageTakenModel) {
      case 'forever':
        rage = (1.5 * healthLost) / this.rageConv
        break
      case 'classic':
        rage = (2.5 * healthLost) / this.rageConv
        break
      case 'foreverHp':
        rage = plan.rage.maxHealth > 0 ? (10 * healthLost) / plan.rage.maxHealth : 0
        break
      case 'foreverHpPreArmor':
        rage = plan.rage.maxHealth > 0 ? (10 * preArmor) / plan.rage.maxHealth : 0
        break
    }
    this.gainRage(Math.floor(rage * 10 + 1e-9), -1)
    this.fireProcs(TRIGGER.damageTaken, -1)
  }
}
