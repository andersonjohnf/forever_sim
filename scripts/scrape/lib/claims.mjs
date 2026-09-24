// Checks the values the research docs read from wago.tools DB2 pages and marked for a person
// to confirm in a browser (docs/open-questions.md "Route D", rows D1–D23), plus the client
// game-table values the docs knew only from a secondary extraction. Each check reads the raw
// client files (Forever, and Classic Era for the "(Classic …)" halves) and reports whether
// the doc's value matches.
//
// Used by scripts/scrape/client.mjs --claims; the markdown it returns is copied into
// docs/data/client.md ("Doc claims checked against the raw client").

import { createSpellIndex, effectPoints, SPELL_TABLES } from "./spells.mjs";

const OK = "matches";
const DIFF = "differs";
const PART = "partly";

export async function checkClaims(ctx) {
  const { gt, spells: F, source, baseline, talents, consumables, itemEffectsByItem, version, baselineVersion } = ctx;
  const t = { ...ctx.t };
  for (const n of ["RaceStat", "CharBaseInfo", "SpellShapeshiftForm"]) t[n] = await source.table(n);
  const ct = {};
  for (const n of [...SPELL_TABLES, "ChrClasses", "PlayerExpectedStat", "SpellItemEnchantment", "SpellDescriptionVariables", "CharBaseInfo"]) {
    ct[n] = await baseline.table(n);
  }
  const C = createSpellIndex(ct, { lenient: true });

  const f = (id) => F.get(id);
  const c = (id) => C.get(id);
  const eff = (rec, i) => rec?.effects.find((e) => e.effectIndex === i) ?? null;
  const pts = (e) => (e ? effectPoints(e) : null);
  const byAura = (rec, aura) => rec?.effects.find((e) => e.effectAura === aura) ?? null;
  const byType = (rec, type) => rec?.effects.find((e) => e.effect === type) ?? null;
  const attr = (rec, i) => (rec?.misc?.attributes?.[i] ?? 0) >>> 0;
  const has = (value, bit) => ((value >>> 0) & bit) !== 0;
  const cd = (rec) => Math.max(rec?.cooldowns?.recoveryTime ?? 0, rec?.cooldowns?.categoryRecoveryTime ?? 0);
  const talent = (cls, name) => talents.classes[cls].talents.find((x) => x.name === name) ?? null;
  const curve = (tal, i) => tal?.rankEffects.find((e) => e.effectIndex === i)?.values ?? null;
  const list = (a) => (a ? a.join("/") : "none");
  const hex = (n) => `0x${(n >>> 0).toString(16).toUpperCase()}`;

  const rows = [];
  /** @param {string} id  Route D row; @param {string} claim  the doc's value; fn returns [status, actual] */
  function claim(id, claimText, fn) {
    let status;
    let actual;
    try {
      [status, actual] = fn();
    } catch (e) {
      status = DIFF;
      actual = `check failed: ${e.message}`;
    }
    rows.push({ id, claim: claimText, status, actual });
  }
  const verdict = (ok, actual) => [ok ? OK : DIFF, actual];

  // ---------------------------------------------------------------- D1 PPM
  claim("D1", "SpellProcsPerMinute 454–463 = 1–10 PPM in both builds; 479 = 2.3 in Forever only", () => {
    const fr = t.SpellProcsPerMinute.rows.map((r) => `${r.ID}:${r.BaseProcRate}`);
    const cr = ct.SpellProcsPerMinute.rows.map((r) => `${r.ID}:${r.BaseProcRate}`);
    const want = Array.from({ length: 10 }, (_, k) => `${454 + k}:${k + 1}`);
    const ok = JSON.stringify(fr) === JSON.stringify([...want, "479:2.3"]) && JSON.stringify(cr) === JSON.stringify(want);
    return verdict(ok, `Forever ${fr.length} rows (${fr.at(-1)}); Classic ${cr.length} rows; every row has Flags 1`);
  });
  claim("D1", "No SpellAuraOptions row references a PPM id (Forever)", () => {
    const n = t.SpellAuraOptions.rows.filter((r) => r.SpellProcsPerMinuteID !== 0).length;
    const nc = ct.SpellAuraOptions.rows.filter((r) => r.SpellProcsPerMinuteID !== 0).length;
    return verdict(n === 0, `${n} Forever rows (${nc} in Classic Era); SpellProcsPerMinuteMod is empty in both`);
  });

  // ---------------------------------------------------------------- D2 warrior DPS core
  claim("D2", "Bloodthirst 23894 = 0.35 × AP + 48", () => {
    const s = f(23894);
    const d = byType(s, 2);
    const dummy = byType(s, 3);
    return verdict(pts(d) === 48 && pts(dummy) === 35, `SCHOOL_DAMAGE ${pts(d)}, DUMMY ${pts(dummy)} (% of AP); Classic 23894 SCHOOL_DAMAGE ${pts(byType(c(23894), 2))}`);
  });
  claim("D2", "Flurry buff 12966: base 30, 15,000 ms; talent curve 5–25", () => {
    const s = f(12966);
    const v = curve(talent("warrior", "Flurry"), 0);
    return verdict(pts(eff(s, 0)) === 30 && s.duration?.duration === 15000 && list(v) === "5/10/15/20/25", `buff aura ${eff(s, 0).effectAura} = ${pts(eff(s, 0))}, ${s.duration?.duration} ms, ${s.auraOptions?.procCharges} charges, proc mask ${hex(s.auraOptions?.procTypeMask[0])}; talent 12319 curve ${list(v)}`);
  });
  claim("D2", "Dual Wield Specialization curves 5–25 / 20–100 / 2–10 and a hit aura (54) with no hand restriction", () => {
    const tal = talent("warrior", "Dual Wield Specialization");
    const s = f(23584);
    const hit = byAura(s, 54);
    const ok = list(curve(tal, 0)) === "5/10/15/20/25" && list(curve(tal, 1)) === "20/40/60/80/100" && list(curve(tal, 2)) === "2/4/6/8/10" && hit?.effectIndex === 2;
    return verdict(ok, `curves ${list(curve(tal, 0))} · ${list(curve(tal, 1))} · ${list(curve(tal, 2))}; effect 2 is aura 54 with no per-effect restriction (the spell as a whole requires a one-handed weapon, SpellEquippedItems subclass mask ${s.equippedItems?.equippedItemSubclass})`);
  });
  claim("D2", "Unbridled Wrath curve 12–60; energize 12964 = 10 tenths; proc mask auto attack only", () => {
    const v = curve(talent("warrior", "Unbridled Wrath"), 0);
    const en = eff(f(12964), 0);
    const mask = f(12322).auraOptions?.procTypeMask[0];
    return verdict(list(v) === "12/24/36/48/60" && pts(en) === 10 && mask === 4, `curve ${list(v)}; 12964 ENERGIZE ${pts(en)} (power ${en.effectMiscValue[0]}); proc mask ${hex(mask)} (melee auto attack)`);
  });
  claim("D2", "Weaponmaster sword 12281 ProcCategoryRecovery 200 (both builds); axe 12700 aura 290", () => {
    const fs = f(12281).auraOptions?.procCategoryRecovery;
    const cs = c(12281)?.auraOptions?.procCategoryRecovery;
    const axe = eff(f(12700), 0)?.effectAura;
    return verdict(fs === 200 && cs === 200 && axe === 290, `12281 ICD ${fs} ms (Classic ${cs}), proc chance ${f(12281).auraOptions?.procChance}, mask ${hex(f(12281).auraOptions?.procTypeMask[0])}, triggers ${eff(f(12281), 0).effectTriggerSpell}; 12700 aura ${axe} (Classic ${eff(c(12700), 0)?.effectAura})`);
  });

  // ---------------------------------------------------------------- D3 rage energize
  const energize = (id) => pts(byType(f(id), 30));
  claim("D3", "Bloodrage 2687 = 100, and 29131 = 10 per 1,000 ms for 10 s", () => {
    const p = eff(f(29131), 0);
    return verdict(energize(2687) === 100 && pts(p) === 10 && p.effectAuraPeriod === 1000 && f(29131).duration?.duration === 10000, `2687 ENERGIZE ${energize(2687)}; 29131 aura ${p.effectAura} ${pts(p)} every ${p.effectAuraPeriod} ms for ${f(29131).duration?.duration} ms`);
  });
  claim("D3", "Charge 11578 = 150", () => verdict(energize(11578) === 150, `ENERGIZE ${energize(11578)}`));
  claim("D3", "Mighty Rage Potion 17528 = 600, variance 0.5, 20 s", () => {
    const e = byType(f(17528), 30);
    return verdict(pts(e) === 600 && e.variance === 0.5 && f(17528).duration?.duration === 20000, `ENERGIZE ${pts(e)}, variance ${e.variance}, ${f(17528).duration?.duration} ms (+${pts(byAura(f(17528), 29))} Str); Classic ${pts(byType(c(17528), 30))} min`);
  });
  claim("D3", "Shield Specialization 1310318 = 50 (Classic 23602 = 10)", () => verdict(energize(1310318) === 50 && pts(byType(c(23602), 30)) === 10, `Forever ${energize(1310318)}; Classic 23602 ${pts(byType(c(23602), 30))}`));
  claim("D3", "Master of Defense → 23602 = 50", () => verdict(energize(23602) === 50, `23602 "${F.name(23602)}" ENERGIZE ${energize(23602)}`));
  claim("D3", "Enrage 5229 = 100 + 20/s", () => {
    const p = byAura(f(5229), 24);
    return verdict(energize(5229) === 100 && pts(p) === 20 && p.effectAuraPeriod === 1000, `ENERGIZE ${energize(5229)}; periodic ${pts(p)} per ${p.effectAuraPeriod} ms`);
  });
  claim("D3", "Furor 17057 = 100", () => verdict(energize(17057) === 100, `ENERGIZE ${energize(17057)}`));
  claim("D3", "Primal Fury 16959 = 50", () => verdict(energize(16959) === 50, `ENERGIZE ${energize(16959)}`));
  claim("D3", "Natural Reaction 417053 = 50", () => verdict(energize(417053) === 50, `ENERGIZE ${energize(417053)}`));
  claim("D3", "Heroic Strike 25286 +157", () => {
    const e = byType(f(25286), 17);
    return verdict(pts(e) === 157, `WEAPON_DAMAGE_NOSCHOOL (17) ${pts(e)}`);
  });

  // ---------------------------------------------------------------- D4 Sunder threat
  claim("D4", "Sunder Armor THREAT effect by rank: 1 / 405 / 608 / 810 / 1013 (11597); Classic has none", () => {
    const ids = [7386, 7405, 8380, 11596, 11597];
    const v = ids.map((id) => pts(byType(f(id), 63)));
    const classic = ids.map((id) => byType(c(id), 63)).filter(Boolean).length;
    return verdict(list(v) === "1/405/608/810/1013" && classic === 0, `${ids.join("/")}: ${list(v)}; armor ${ids.map((id) => pts(byAura(f(id), 22))).join("/")}; Classic THREAT effects: ${classic}`);
  });

  // ---------------------------------------------------------------- D5 base stats
  const pes = (cls) => t.PlayerExpectedStat.rows.find((r) => r.Level === 60 && r.ClassID === cls && r.ContentSetID === 0);
  claim("D5", "PlayerExpectedStat level 60 BaseMana 1512 (paladin), 1244 (druid)", () => verdict(pes(2).BaseMana === 1512 && pes(11).BaseMana === 1244, `paladin ${pes(2).BaseMana}, druid ${pes(11).BaseMana}; basemp.txt ${gt.baseMana.rows.find((r) => r.Level === 60)?.Paladin} / ${gt.baseMana.rows.find((r) => r.Level === 60)?.Druid}`));
  claim("D5", "CritPerAgility 0.0005 / 0.000506 / 0.0005 (warrior / paladin / druid); SpellCritPerIntellect 0.000167", () =>
    verdict(pes(1).CritPerAgility === 0.0005 && pes(2).CritPerAgility === 0.000506 && pes(11).CritPerAgility === 0.0005 && pes(2).SpellCritPerIntellect === 0.000167 && pes(11).SpellCritPerIntellect === 0.000167, `${pes(1).CritPerAgility} / ${pes(2).CritPerAgility} / ${pes(11).CritPerAgility}; spell crit per Int paladin ${pes(2).SpellCritPerIntellect}, druid ${pes(11).SpellCritPerIntellect}`),
  );
  claim("D5", "Two unnamed PlayerExpectedStat columns read 10 and 287 at level 60", () => {
    const vals = [1, 2, 11].map((k) => `${pes(k).Field_1_60_1_69876_005}/${pes(k).Field_1_60_1_69876_006}`);
    return verdict(vals.every((v) => v === "10/287"), `warrior, paladin, druid: ${vals.join(", ")} (same for every class)`);
  });
  claim("D5", "PlayerExpectedStat is absent from 1.15.9", () => verdict(!ct.PlayerExpectedStat.present, ct.PlayerExpectedStat.present ? "present" : `not in the ${baselineVersion} file list`));
  claim("D5", "ChrClasses AttackPowerPerStrength 2, AttackPowerPerAgility 0, ArmorTypeMask 127 / 2303 / 2343; all zero in 1.15.9", () => {
    const row = (tb, id) => tb.byId.get(id);
    const fv = [1, 2, 11].map((id) => `${row(t.ChrClasses, id).AttackPowerPerStrength}/${row(t.ChrClasses, id).AttackPowerPerAgility}/${row(t.ChrClasses, id).ArmorTypeMask}`);
    const cv = [1, 2, 11].map((id) => `${row(ct.ChrClasses, id).AttackPowerPerStrength}/${row(ct.ChrClasses, id).AttackPowerPerAgility}/${row(ct.ChrClasses, id).ArmorTypeMask}`);
    return verdict(fv.join(",") === "2/0/127,2/0/2303,2/0/2343" && cv.every((v) => v === "0/0/0"), `warrior, paladin, druid (AP/Str, AP/Agi, armor mask): ${fv.join(", ")}; Classic ${cv.join(", ")}`);
  });

  // ---------------------------------------------------------------- D6 cat
  claim("D6", "Shred 9830 flat 80 / 155%", () => verdict(pts(byType(f(9830), 58)) === 80 && pts(byType(f(9830), 31)) === 155, `WEAPON_DAMAGE ${pts(byType(f(9830), 58))}, WEAPON_PERCENT_DAMAGE ${pts(byType(f(9830), 31))} (Classic ${pts(byType(c(9830), 31))}%)`));
  claim("D6", "Claw 9850 115 / 110%", () => verdict(pts(byType(f(9850), 58)) === 115 && pts(byType(f(9850), 31)) === 110, `${pts(byType(f(9850), 58))} / ${pts(byType(f(9850), 31))}% (Classic has no percent effect)`));
  claim("D6", "Rake 9904 61 / 34 per 3 s", () => {
    const p = byAura(f(9904), 3);
    return verdict(pts(byType(f(9904), 2)) === 61 && pts(p) === 34 && p.effectAuraPeriod === 3000, `${pts(byType(f(9904), 2))} + ${pts(p)} every ${p.effectAuraPeriod} ms for ${f(9904).duration?.duration} ms`);
  });
  claim("D6", "Rip 9896 15 + 25.5 per CP (Classic 16+1 / 28); 1.15.9 SpellDescriptionVariables 865 $ticks=6, $mult=1.0", () => {
    const p = byAura(f(9896), 3);
    const cp = byAura(c(9896), 3);
    const sdv = ct.SpellDescriptionVariables.byId.get(865)?.Variables ?? "";
    const ok = pts(p) === 15 && p.effectPointsPerResource === 25.5 && pts(cp) === 17 && cp.effectPointsPerResource === 28 && /\$\{6\}/.test(sdv) && /\$\{1\.0\}/.test(sdv);
    return verdict(ok, `Forever ${pts(p)} + ${p.effectPointsPerResource}/CP every ${p.effectAuraPeriod} ms; Classic ${cp.effectBasePoints}+${cp.effectDieSides} / ${cp.effectPointsPerResource}; SDV 865 "${sdv.replace(/\r?\n/g, "; ")}" (6 ticks and ×1.0 unless SoD rune 436895 is known)`);
  });
  claim("D6", "Ferocious Bite 31018 base 82, variance 0.7317, 147 per CP, dummy 270", () => {
    const d = byType(f(31018), 2);
    return verdict(pts(d) === 82 && Math.abs(d.variance - 0.7317) < 1e-4 && d.effectPointsPerResource === 147 && pts(byType(f(31018), 3)) === 270, `${pts(d)}, variance ${d.variance}, ${d.effectPointsPerResource}/CP, DUMMY ${pts(byType(f(31018), 3))}`);
  });
  claim("D6", "Tiger's Fury 5217 15%, 30,000 ms, no GCD", () => {
    const s = f(5217);
    return verdict(pts(eff(s, 0)) === 15 && s.cooldowns?.recoveryTime === 30000 && !s.cooldowns?.startRecoveryTime, `aura ${eff(s, 0).effectAura} = ${pts(eff(s, 0))}, recovery ${s.cooldowns?.recoveryTime} ms, GCD ${s.cooldowns?.startRecoveryTime ?? 0}, lasts ${s.duration?.duration} ms`);
  });

  // ---------------------------------------------------------------- D7 Ret coefficients
  claim("D7", "SoC proc 20424 70% weapon, 0.29", () => verdict(pts(byType(f(20424), 31)) === 70 && byType(f(20424), 31).effectBonusCoefficient === 0.29, `WEAPON_PERCENT_DAMAGE ${pts(byType(f(20424), 31))}, SP ${byType(f(20424), 31).effectBonusCoefficient}`));
  claim("D7", "JoC 20966 0.429; JoR 20286 0.5; SoR proc 25713 0.1", () => {
    const v = [20966, 20286, 25713].map((id) => byType(f(id), 2).effectBonusCoefficient);
    return verdict(list(v) === "0.429/0.5/0.1", `SP coefficients ${list(v)}`);
  });
  claim("D7", "Holy Strike 10333 effect 121 (+93) then 31 (40%), 0.429", () => {
    const s = f(10333);
    return verdict(pts(eff(s, 0)) === 93 && eff(s, 0).effect === 121 && eff(s, 1).effect === 31 && pts(eff(s, 1)) === 40 && eff(s, 0).effectBonusCoefficient === 0.429, `e0 ${eff(s, 0).effect} ${pts(eff(s, 0))} (variance ${eff(s, 0).variance}, +${eff(s, 0).effectRealPointsPerLevel}/level), e1 ${eff(s, 1).effect} ${pts(eff(s, 1))}%, SP ${eff(s, 0).effectBonusCoefficient}`);
  });
  claim("D7", "Consecration 1280349 12 + 27 at 0.095", () => {
    const s = f(1280349);
    return verdict(pts(eff(s, 0)) === 12 && pts(eff(s, 1)) === 27 && eff(s, 1).effectBonusCoefficient === 0.095, `${pts(eff(s, 0))} + ${pts(eff(s, 1))} (SP ${eff(s, 1).effectBonusCoefficient})`);
  });
  claim("D7", "Vengeance 20050 5 stacks, 30 s", () => verdict(f(20050).auraOptions?.cumulativeAura === 5 && f(20050).duration?.duration === 30000, `${f(20050).auraOptions?.cumulativeAura} stacks, ${f(20050).duration?.duration} ms, +${pts(eff(f(20050), 0))}% per stack (curve ${list(curve(talent("paladin", "Vengeance"), 0))})`));
  claim("D7", "Two-Handed 20111 / One-Handed 20196 Weapon Specialization: Physical only", () => {
    const m = [20111, 20196].map((id) => byAura(f(id), 79)?.effectMiscValue[0]);
    return verdict(m.every((x) => x === 1), `aura 79 school mask ${list(m)} (1 = Physical)`);
  });
  claim("D7", "Improved Seals 20224 spell masks", () => {
    const e = eff(f(20224), 0);
    return verdict(e.effectAura === 108 && e.effectSpellClassMask.some(Boolean), `aura 108 (${pts(e)}%, curve ${list(curve(talent("paladin", "Improved Seals"), 0))}), mask ${e.effectSpellClassMask.join(",")}`);
  });

  // ---------------------------------------------------------------- D8 rage talents
  const tv = (cls, name, i = 0) => list(curve(talent(cls, name), i));
  claim("D8", "Boundless Rage 1310236 aura 418 = 100/200/300", () => verdict(tv("warrior", "Boundless Rage") === "100/200/300" && eff(f(1310236), 0).effectAura === 418, `aura ${eff(f(1310236), 0).effectAura}, curve ${tv("warrior", "Boundless Rage")}`));
  claim("D8", "Improved Bloodrage 25/50", () => verdict(tv("warrior", "Improved Bloodrage") === "25/50", tv("warrior", "Improved Bloodrage")));
  claim("D8", "Shield Specialization 20…100", () => verdict(tv("warrior", "Shield Specialization", 1) === "20/40/60/80/100", `block ${tv("warrior", "Shield Specialization", 0)}; rage chance ${tv("warrior", "Shield Specialization", 1)}`));
  claim("D8", "Master of Defense 50/100", () => verdict(tv("warrior", "Master of Defense") === "50/100", tv("warrior", "Master of Defense")));
  claim("D8", "Improved Tactical Mastery 12295 = 3/6/9/12/15; Tactical Mastery 1310185 dummy 10", () => verdict(tv("warrior", "Improved Tactical Mastery") === "3/6/9/12/15" && pts(eff(f(1310185), 0)) === 10, `${tv("warrior", "Improved Tactical Mastery")}; 1310185 DUMMY aura ${pts(eff(f(1310185), 0))}`));
  claim("D8", "Furor 20…100", () => verdict(tv("druid", "Furor") === "20/40/60/80/100", `${tv("druid", "Furor", 0)} and ${tv("druid", "Furor", 1)}`));
  claim("D8", "Natural Reaction 417051", () => verdict(talent("druid", "Natural Reaction")?.spellId === 417051, `spell ${talent("druid", "Natural Reaction")?.spellId}, curves ${tv("druid", "Natural Reaction", 0)} · ${tv("druid", "Natural Reaction", 1)}`));

  // ---------------------------------------------------------------- D9 warrior timing
  claim("D9", "Slam 15 s cooldown on every rank", () => {
    const ids = [1240193, 1464, 8820, 11604, 11605];
    const v = ids.map((id) => cd(f(id)) / 1000);
    return verdict(v.every((x) => x === 15), `${ids.join("/")}: ${list(v)} s (category ${f(11605).categories?.category}), cast ${f(11605).castTime?.base} ms`);
  });
  claim("D9", "Stance swap 1.0 s shared, off the GCD", () => {
    const ids = [2457, 71, 2458];
    const v = ids.map((id) => `${f(id).categories?.category}:${f(id).cooldowns?.categoryRecoveryTime}:${f(id).cooldowns?.startRecoveryTime}`);
    return verdict(v.every((x) => x === "47:1000:0"), `category:recovery:GCD ${v.join(", ")}`);
  });
  claim("D9", "Racial StartRecoveryTime 0", () => {
    const ids = [20572, 20554, 1259799, 1259813, 20594];
    const v = ids.map((id) => `${F.name(id)} ${f(id).cooldowns?.startRecoveryTime ?? 0}`);
    return [ids.slice(0, 4).every((id) => !f(id).cooldowns?.startRecoveryTime) ? (f(20594).cooldowns?.startRecoveryTime ? PART : OK) : DIFF, `${v.join(", ")} (ms)`];
  });
  claim("D9", "Thunder Clap defense type 1, usable in Defensive Stance", () => {
    const s = f(11581);
    return verdict(s.categories?.defenseType === 1 && has(s.shapeshift?.shapeshiftMask[0], 1 << 17), `defense type ${s.categories?.defenseType}; stance mask ${hex(s.shapeshift?.shapeshiftMask[0])} (Battle + Defensive)`);
  });
  claim("D9", "Overpower window 1282733 = 5,000 ms; second cost power type 4, stacking to 3", () => {
    const w = f(1282733);
    const p = f(11585).power;
    return verdict(w.duration?.duration === 5000 && w.auraOptions?.cumulativeAura === 3 && p[1]?.powerType === 4, `window ${w.duration?.duration} ms, ${w.auraOptions?.cumulativeAura} stacks; Overpower 11585 costs ${p.map((x) => `type ${x.powerType} ${x.manaCost}`).join(" + ")}`);
  });
  claim("D9", "Bloodthrill proc mask 4; Enrage proc mask 0x222A8", () => verdict(f(1289682).auraOptions?.procTypeMask[0] === 4 && f(12317).auraOptions?.procTypeMask[0] === 0x222a8, `Bloodthrill ${hex(f(1289682).auraOptions?.procTypeMask[0])}; Enrage ${hex(f(12317).auraOptions?.procTypeMask[0])} (${f(12317).auraOptions?.procChance}%)`));
  claim("D9", "Berserker Stance aura 290 (Classic 52) plus an empty aura 166", () => {
    const e = byAura(f(7381), 166);
    return verdict(byAura(f(7381), 290) && byAura(c(7381), 52) && e && !pts(e), `Forever 7381 auras ${f(7381).effects.map((x) => `${x.effectAura}=${pts(x)}`).join(", ")}; Classic ${c(7381).effects.map((x) => `${x.effectAura}=${pts(x)}`).join(", ")}`);
  });
  claim("D9", "Recklessness has its own recovery", () => verdict(f(1719).cooldowns?.recoveryTime === 1800000 && !f(1719).categories?.category, `recovery ${f(1719).cooldowns?.recoveryTime} ms, category ${f(1719).categories?.category ?? 0}`));
  claim("D9", "Improved Slam spells 1310196–1310200", () => {
    const ids = [1310196, 1310197, 1310198, 1310199, 1310200];
    return verdict(ids.every((id) => F.name(id) === "Slam"), ids.map((id) => `${id} ${F.name(id)} ${f(id)?.nameSubtext}`).join(", "));
  });
  claim("D9", "Battle Shout 25289 base 139 + 0.6/level", () => {
    const e = eff(f(25289), 0);
    return verdict(pts(e) === 139 && e.effectRealPointsPerLevel === 0.6, `aura ${e.effectAura} ${pts(e)} + ${e.effectRealPointsPerLevel}/level (levels ${f(25289).levels?.baseLevel}–${f(25289).levels?.maxLevel}, so 139 at 60)`);
  });
  claim("D9", "Weapon-damage effect types: 121 for Mortal Strike, Overpower, Whirlwind, Spearing Strike; 17 for Heroic Strike, Cleave, Slam", () => {
    const n = [21553, 11585, 1680, 1310222].map((id) => (byType(f(id), 121) ? 121 : 0));
    const s = [25286, 20569, 11605].map((id) => (byType(f(id), 17) ? 17 : 0));
    return verdict(n.every((x) => x === 121) && s.every((x) => x === 17), `normalized ${list(n)}; non-normalized ${list(s)}`);
  });
  claim("D9", "Focused Rage and Impale class masks", () => verdict(eff(f(29787), 0).effectSpellClassMask.some(Boolean) && eff(f(16493), 0).effectSpellClassMask.some(Boolean), `Focused Rage aura 107 (cost ${pts(eff(f(29787), 0))}) mask ${eff(f(29787), 0).effectSpellClassMask}; Impale aura 108 mask ${eff(f(16493), 0).effectSpellClassMask}`));
  claim("D9", "Deep Wounds 12721 has no name", () => {
    const inEffect = t.SpellEffect.rows.some((r) => r.SpellID === 12721);
    return [F.exists(12721) ? DIFF : OK, `no SpellName row${inEffect ? "" : ", and no SpellEffect/SpellMisc rows either (not encrypted: the id is absent)"}; the Forever bleed is 412609`];
  });
  claim("D9", "Victory Rush dummy 15", () => verdict(pts(byType(f(402927), 3)) === 15, `402927 DUMMY ${pts(byType(f(402927), 3))}`));

  // ---------------------------------------------------------------- D10 racials
  const racialChecks = [
    [20597, "+2% crit, aura 290", (s) => byAura(s, 290) && pts(byAura(s, 290)) === 2],
    [20598, "exists", (s) => !!s],
    [20572, "+10% AP, RAP, SP; 15 s", (s) => pts(byAura(s, 166)) === 10 && pts(byAura(s, 167)) === 10 && pts(byAura(s, 317)) === 10 && s.duration?.duration === 15000],
    [20574, "exists", (s) => !!s],
    [1259719, "exists", (s) => !!s],
    [1259721, "exists", (s) => !!s],
    [20594, "exists", (s) => !!s],
    [20582, "exists", (s) => !!s],
    [1259799, "+10%, 15 s", (s) => pts(byAura(s, 290)) === 10 && s.duration?.duration === 15000],
    [1259802, "exists", (s) => !!s],
    [1259813, "15 s", (s) => s.duration?.duration === 15000],
    [1260189, "exists", (s) => !!s],
    [20550, "+5% HP; +1% hit via auras 54 and 55", (s) => pts(byAura(s, 133)) === 5 && pts(byAura(s, 54)) === 1 && pts(byAura(s, 55)) === 1],
    [20554, "10 s, no cost", (s) => s.duration?.duration === 10000 && s.power.length === 0],
    [20557, "exists", (s) => !!s],
  ];
  for (const [id, text, test] of racialChecks) {
    claim("D10", `Racial ${id} ${text}`, () => {
      const s = f(id);
      return verdict(!!s && test(s), s ? `"${s.name}": ${s.effects.map((e) => `${e.effectAura ? `aura ${e.effectAura}` : `effect ${e.effect}`} ${pts(e)}`).join(", ")}${s.duration ? `; ${s.duration.duration} ms` : ""}${s.cooldowns?.recoveryTime ? `; cooldown ${s.cooldowns.recoveryTime / 1000} s` : ""}` : "not in client");
    });
  }

  // ---------------------------------------------------------------- D11 race/class pairs
  claim("D11", "CharBaseInfo: 56 race/class pairs including Undead paladin; High Order Skyborne = race 95, Windshaper = 96", () => {
    const rows = t.CharBaseInfo.rows;
    const undeadPaladin = rows.some((r) => r.RaceID === 5 && r.ClassID === 2);
    const names = [95, 96].map((id) => t.ChrRaces.byId.get(id)?.Name_lang);
    return verdict(rows.length === 56 && undeadPaladin && names[0] === "High Order Skyborne" && names[1] === "Windshaper Skyborne", `${rows.length} pairs (Classic Era ${ct.CharBaseInfo.rows.length}); Undead paladin ${undeadPaladin ? "present" : "absent"}; 95 = ${names[0]}, 96 = ${names[1]}`);
  });

  // ---------------------------------------------------------------- D12 Windfury
  claim("D12", "Forever: 10612 is a party dummy aura, 20% proc into 10610 (+246 AP, 1 extra attack); 10611 absent", () => {
    const p = f(10612);
    const e = eff(p, 0);
    const w = f(10610);
    const ok = e.effect === 35 && e.effectAura === 4 && p.auraOptions?.procChance === 20 && pts(e) === 10610 && pts(byAura(w, 99)) === 246 && byType(w, 19) && !F.exists(10611);
    return verdict(ok, `10612 AREA_AURA_PARTY aura 4, points ${pts(e)} (= the proc spell id), proc ${p.auraOptions?.procChance}% on mask ${hex(p.auraOptions?.procTypeMask[0])} with ProcCategoryRecovery ${p.auraOptions?.procCategoryRecovery} ms; 10610 +${pts(byAura(w, 99))} AP and EXTRA_ATTACKS ${pts(byType(w, 19))}, ${w.auraOptions?.procCharges} charges, ${w.duration?.duration} ms; 10611 ${F.exists(10611) ? "present" : "absent"}`);
  });
  claim("D12", "Classic: 10612 pulses 10611 every 5 s → enchant 564 (10 s)", () => {
    const p = eff(c(10612), 0);
    const e = byType(c(10611), 92);
    const fe = t.SpellItemEnchantment.byId.get(564);
    return [p.effectTriggerSpell === 10611 && p.effectAuraPeriod === 5000 && e?.effectMiscValue[0] === 564 ? PART : DIFF, `10612 periodic trigger ${p.effectTriggerSpell} every ${p.effectAuraPeriod} ms; 10611 ENCHANT_HELD_ITEM ${e?.effectMiscValue[0]}; the Classic SpellItemEnchantment layout has no Duration column (Forever's row for 564 says ${fe?.Duration} s)`];
  });

  // ---------------------------------------------------------------- D13 consumables
  const cons = (itemId) => consumables[itemId]?.effects[0] ?? null;
  claim("D13", "Cooldown categories: elixirs 79, potions 4, runes 1153, explosives 24, Blasted Lands 103 (3,600 s)", () => {
    const want = { 13452: [79, 3000], 13442: [4, 120000], 12662: [1153, 120000], 10646: [24, 60000], 8410: [103, 3600000] };
    const got = Object.entries(want).map(([item, [cat, ms]]) => [cons(item)?.spellCategoryId === cat && cons(item)?.categoryCoolDownMSec === ms, `${item}: ${cons(item)?.spellCategoryId} (${cons(item)?.categoryCoolDownMSec / 1000} s)`]);
    return verdict(got.every(([ok]) => ok), got.map(([, s]) => s).join("; "));
  });
  claim("D13", "Frenzy potions: aura 13 (school mask 1), no cooldown category", () => {
    const ids = [1251937, 1251938, 1251940];
    const auras = ids.map((id) => `${pts(byAura(f(id), 13))}/${byAura(f(id), 13)?.effectMiscValue[0]}`);
    const cats = ids.map((id) => `${f(id).categories?.category ?? 0}/${f(id).cooldowns?.categoryRecoveryTime ?? 0}`);
    const itemCats = [250941, 250942, 250943].map((i) => cons(i)?.spellCategoryId ?? 0);
    const aurasOk = ids.every((id) => byAura(f(id), 13)?.effectMiscValue[0] === 1);
    const categorised = ids.some((id) => f(id).categories?.category);
    if (!aurasOk) return [DIFF, `aura 13 = ${auras.join(", ")}`];
    if (!categorised) return [OK, `aura 13 = ${auras.join(", ")}; no category on the items (${list(itemCats)}) or the spells`];
    return [PART, `aura 13 = ${auras.join(", ")} (points/school mask) matches. But while the item effects carry no category (${list(itemCats)}), the potion spells ${ids.join("/")} are in SpellCategories category ${cats.join(", ")} (category/recovery ms): the potion category with its 2-minute shared cooldown`];
  });
  claim("D13", "All-crit aura (290) on Leader of the Pack 24932 and Mongoose 17538", () => verdict(pts(byAura(f(24932), 290)) === 3 && pts(byAura(f(17538), 290)) === 2, `24932 aura 290 = ${pts(byAura(f(24932), 290))}; 17538 aura 290 = ${pts(byAura(f(17538), 290))}`));
  claim("D13", "Hyjal flasks = dummy + zero-valued aura", () => {
    const ids = [1293741, 1293740, 1293742, 1293743];
    const desc = ids.map((id) => `${id}: dummy ${pts(byAura(f(id), 4))} + ${f(id).effects.filter((e) => e.effectAura && e.effectAura !== 4 && e.effectAura !== 29).map((e) => `aura ${e.effectAura}=${pts(e)}`).join(", ")}`);
    const ok = ids.every((id) => byAura(f(id), 4) && f(id).effects.some((e) => e.effectAura && ![4, 29].includes(e.effectAura) && pts(e) === 0));
    return verdict(ok, `${desc.join("; ")} (1293743 is the Swiftness flask's spell but is named "${F.name(1293743)}")`);
  });

  // ---------------------------------------------------------------- D14 periodic crit
  const PERIODIC_CAN_CRIT = 0x200; // Attributes[8]
  claim("D14", "PERIODIC_CAN_CRIT (Attributes[8] 0x200) set on Rend 11574, Rake 9904, Rip 9896, Pounce bleed 9826, Lacerate 1235827", () => {
    const ids = [11574, 9904, 9896, 9826, 1235827];
    return verdict(ids.every((id) => has(attr(f(id), 8), PERIODIC_CAN_CRIT)), ids.map((id) => `${id} ${hex(attr(f(id), 8))}`).join(", "));
  });
  claim("D14", "Not set on Deep Wounds and Consecration 20924 / 1280349", () => {
    const ids = [412609, 20924, 1280349];
    return verdict(ids.every((id) => !has(attr(f(id), 8), PERIODIC_CAN_CRIT)), ids.map((id) => `${id} ${hex(attr(f(id), 8))}`).join(", "));
  });
  claim("D14", "Forever's Deep Wounds bleed is 412609 (4 ticks, 3 s)", () => {
    const s = f(412609);
    const e = byAura(s, 226);
    return verdict(e?.effectAuraPeriod === 3000 && s.duration?.duration === 12000, `"${s.name}" aura ${e?.effectAura} every ${e?.effectAuraPeriod} ms for ${s.duration?.duration} ms = ${s.duration?.duration / e?.effectAuraPeriod} ticks; talent 12834 triggers it server-side (no trigger in data)`);
  });

  // ---------------------------------------------------------------- D15 threat auras
  const threatAura = (id) => pts(byAura(f(id), 10));
  claim("D15", "Battle 21156 −20, Berserker 7381 −20, Defensive 7376 +30", () => verdict(threatAura(21156) === -20 && threatAura(7381) === -20 && threatAura(7376) === 30, `${threatAura(21156)} / ${threatAura(7381)} / ${threatAura(7376)}`));
  claim("D15", "Bear Passive2 21178 +30; Cat 3025 −29", () => verdict(threatAura(21178) === 30 && threatAura(3025) === -29, `${threatAura(21178)} / ${threatAura(3025)}`));
  claim("D15", "Defiance 12792 curve 5/10/15", () => verdict(tv("warrior", "Defiance") === "5/10/15", tv("warrior", "Defiance")));
  claim("D15", "Righteous Fury 25780 = 90 (Classic 59+1), school mask 2", () => {
    const fe = byAura(f(25780), 10);
    const ce = byAura(c(25780), 10);
    return verdict(pts(fe) === 90 && fe.effectMiscValue[0] === 2 && ce.effectBasePoints === 59 && pts(ce) === 60, `Forever ${pts(fe)} on school mask ${fe.effectMiscValue[0]} (×${1 + pts(fe) / 100}); Classic ${ce.effectBasePoints}+${ce.effectDieSides}`);
  });
  claim("D15", "Improved Righteous Fury 20468 −2/−4/−6 (curve 82954)", () => {
    const tal = talent("paladin", "Improved Righteous Fury");
    return verdict(list(curve(tal, 0)) === "-2/-4/-6" && tal.rankEffects[0]?.curveId === 82954, `curve ${tal.rankEffects[0]?.curveId}: ${list(curve(tal, 0))}`);
  });
  claim("D15", "Instrument of Law 1311085 10/20", () => verdict(tv("paladin", "Instrument of Law", 1) === "10/20", `${tv("paladin", "Instrument of Law", 1)} (effect 1); effect 0 ${tv("paladin", "Instrument of Law", 0)}`));
  claim("D15", "Iron Creed 1311034 aura 108, modifier 2, 5…25", () => {
    const e = eff(f(1311034), 0);
    return verdict(e.effectAura === 108 && e.effectMiscValue[0] === 2 && tv("paladin", "Iron Creed") === "5/10/15/20/25", `aura ${e.effectAura}, modifier ${e.effectMiscValue[0]}, curve ${tv("paladin", "Iron Creed")}`);
  });
  claim("D15", "Salvation 1038 / 25895 −30", () => verdict(threatAura(1038) === -30 && threatAura(25895) === -30, `${threatAura(1038)} / ${threatAura(25895)}`));
  claim("D15", "Feral Instinct 16947 (Classic: aura 107 on mask 0x2000000)", () => {
    const ce = byAura(c(16947), 107);
    return verdict(ce?.effectSpellClassMask[0] === 0x2000000, `Classic aura 107 mask ${hex(ce?.effectSpellClassMask[0])}; Forever 16947 is aura 107 (misc 3) on mask ${hex(eff(f(16947), 0).effectSpellClassMask[0])} and aura 108 on ${eff(f(16947), 1).effectSpellClassMask.join(",")}`);
  });

  // ---------------------------------------------------------------- D16 bear and forms
  claim("D16", "Mangle 407995 / 1238069 / 1238070 / 1238073 = 26/38/59/77, 20 rage, 6 s, shapeshift mask 144", () => {
    const ids = [407995, 1238069, 1238070, 1238073];
    const v = ids.map((id) => pts(byType(f(id), 58)));
    const ok = list(v) === "26/38/59/77" && ids.every((id) => f(id).power[0]?.manaCost === 200 && cd(f(id)) === 6000 && f(id).shapeshift?.shapeshiftMask[0] === 144);
    return verdict(ok, `${list(v)} + ${pts(byType(f(407995), 31))}% weapon; 200 (tenths) rage; ${cd(f(407995))} ms; mask ${f(407995).shapeshift?.shapeshiftMask[0]}`);
  });
  claim("D16", "Lacerate 1235827 15 per 3 s, 5 stacks", () => {
    const e = byAura(f(1235827), 3);
    return verdict(pts(e) === 15 && e.effectAuraPeriod === 3000 && f(1235827).auraOptions?.cumulativeAura === 5, `${pts(e)} per ${e.effectAuraPeriod} ms, ${f(1235827).auraOptions?.cumulativeAura} stacks, ${f(1235827).duration?.duration} ms`);
  });
  claim("D16", "Cat 3025: AP 12 + 2/level from 6; Faerie Fire cost −100%, CD +6,000, GCD −500; aura 598 = 100 on Agility", () => {
    const s = f(3025);
    const ap = byAura(s, 99);
    const mods = s.effects.filter((e) => e.effectAura === 107 || e.effectAura === 108).map((e) => `${e.effectAura}/${e.effectMiscValue[0]}=${pts(e)}`);
    const a598 = byAura(s, 598);
    const ok = pts(ap) === 12 && ap.effectRealPointsPerLevel === 2 && s.levels?.baseLevel === 6 && mods.join(",") === "108/14=-100,107/11=6000,107/21=-500" && pts(a598) === 100 && a598.effectMiscValue[0] === 1;
    return verdict(ok, `AP ${pts(ap)} + ${ap.effectRealPointsPerLevel}/level from ${s.levels?.baseLevel}; modifiers (aura/op=value) ${mods.join(", ")}; aura 598 = ${pts(a598)} on stat ${a598.effectMiscValue[0]}`);
  });
  claim("D16", "Forms 1/5/8 = 1,000/2,500/2,500 ms, variance 0.4; cat StartRecoveryTime 1,000", () => {
    const v = [1, 5, 8].map((id) => `${t.SpellShapeshiftForm.byId.get(id).CombatRoundTime}/${t.SpellShapeshiftForm.byId.get(id).DamageVariance}`);
    return verdict(v.join(",") === "1000/0.4,2500/0.4,2500/0.4" && f(9830).cooldowns?.startRecoveryTime === 1000, `${v.join(", ")} (swing ms/variance); Shred GCD ${f(9830).cooldowns?.startRecoveryTime} ms`);
  });
  claim("D16", "Berserk 417141 masks, 180,000 ms", () => verdict(f(417141).cooldowns?.recoveryTime === 180000 && f(417141).effects.some((e) => e.effectSpellClassMask.some(Boolean)), `recovery ${f(417141).cooldowns?.recoveryTime} ms, ${f(417141).duration?.duration} ms; ${f(417141).effects.map((e) => `aura ${e.effectAura}/${e.effectMiscValue[0]}=${pts(e)}`).join(", ")}`));
  claim("D16", "Omen of Clarity 16864 ProcCategoryRecovery 10,000", () => verdict(f(16864).auraOptions?.procCategoryRecovery === 10000, `${f(16864).auraOptions?.procCategoryRecovery} ms`));
  claim("D16", "Cower 9892 −1200 − 1/level", () => {
    const e = byType(f(9892), 63);
    return verdict(pts(e) === -1200 && e.effectRealPointsPerLevel === -1, `THREAT ${pts(e)} ${e.effectRealPointsPerLevel}/level (levels ${f(9892).levels?.baseLevel}–${f(9892).levels?.maxLevel})`);
  });
  claim("D16", "SpellLevels 3025 base 6 (Classic 20), 1178 10–40, 9635 40–70", () => {
    const lv = (s) => `${s.levels?.baseLevel}–${s.levels?.maxLevel}`;
    return verdict(f(3025).levels?.baseLevel === 6 && c(3025).levels?.baseLevel === 20 && lv(f(1178)) === "10–40" && lv(f(9635)) === "40–70", `3025 ${f(3025).levels?.baseLevel} (Classic ${c(3025).levels?.baseLevel}); 1178 ${lv(f(1178))}; 9635 ${lv(f(9635))}`);
  });

  // ---------------------------------------------------------------- D17 feral talents
  claim("D17", "Genesis, Savage Fury, Predatory Instincts, Nature's Reach (auras 54/55), Nature's Majesty, Naturalist (aura 79): values and class masks", () => {
    const parts = [
      `Genesis ${tv("druid", "Genesis", 0)} · ${tv("druid", "Genesis", 1)}`,
      `Savage Fury ${tv("druid", "Savage Fury", 0)} · ${tv("druid", "Savage Fury", 1)} (mask ${eff(f(16998), 0).effectSpellClassMask[0]})`,
      `Predatory Instincts ${tv("druid", "Predatory Instincts")}`,
      `Nature's Reach auras ${[byAura(f(16819), 54), byAura(f(16819), 55)].map((e) => e?.effectAura).join("/")} ${tv("druid", "Nature's Reach", 1)}`,
      `Nature's Majesty aura ${eff(f(1223082), 0).effectAura} ${tv("druid", "Nature's Majesty")}`,
      `Naturalist aura 79 ${tv("druid", "Naturalist", 1)}`,
    ];
    const ok = byAura(f(16819), 54) && byAura(f(16819), 55) && byAura(f(17069), 79);
    return verdict(ok, parts.join("; "));
  });
  claim("D17", "King of the Jungle 20/40/60 plus a hidden 5/10/15", () => verdict(tv("druid", "King of the Jungle", 0) === "20/40/60" && tv("druid", "King of the Jungle", 1) === "5/10/15", `${tv("druid", "King of the Jungle", 0)} and ${tv("druid", "King of the Jungle", 1)} (the tooltip shows only the first)`));

  // ---------------------------------------------------------------- D18 paladin
  const NO_ACTIVE_DEFENSE = 0x200000; // Attributes[0]
  const ALWAYS_HIT = 0x40000; // Attributes[3]
  const flags = (id) => `${id} def ${f(id).categories?.defenseType ?? 0}${has(attr(f(id), 0), NO_ACTIVE_DEFENSE) ? " NAD" : ""}${has(attr(f(id), 3), ALWAYS_HIT) ? " AH" : ""}`;
  claim("D18", "Judgements are melee class with No Active Defense; debuff judgements (JotC 20303) Always Hit and 40 s; JoC 20966/20968", () => {
    const dmg = [20966, 20286, 20414];
    const debuff = [20303, 20355, 20346];
    const nad = [...dmg, ...debuff].every((id) => f(id).categories?.defenseType === 2 && has(attr(f(id), 0), NO_ACTIVE_DEFENSE));
    const ah = debuff.every((id) => has(attr(f(id), 3), ALWAYS_HIT) && f(id).duration?.duration === 40000);
    const jocAh = has(attr(f(20966), 3), ALWAYS_HIT);
    return [nad && ah ? (jocAh ? PART : OK) : DIFF, `${[...dmg, 20968, ...debuff].map(flags).join("; ")} (def 2 = melee, NAD = Attr0 0x200000, AH = Attr3 0x40000); debuff judgements last ${f(20303).duration?.duration} ms. JoC's damage spell 20966 also carries Always Hit, so unlike JoR and JoF it can't miss`];
  });
  claim("D18", "SoR and SoF proc attributes (25713, 20418)", () => verdict([25713, 20418].every((id) => has(attr(f(id), 0), NO_ACTIVE_DEFENSE) && has(attr(f(id), 3), ALWAYS_HIT)), `${flags(25713)}; ${flags(20418)}`));
  claim("D18", "SoC 1 s ICD (20920); seal proc masks 0x4 (damage) vs 0x14 (utility)", () => {
    const dmg = [20920, 20293, 20423].map((id) => f(id).auraOptions?.procTypeMask[0]);
    const util = [20357, 20349, 20164].map((id) => f(id).auraOptions?.procTypeMask[0]);
    return verdict(f(20920).auraOptions?.procCategoryRecovery === 1000 && dmg.every((m) => m === 4) && util.every((m) => m === 0x14), `SoC ICD ${f(20920).auraOptions?.procCategoryRecovery} ms; SoC/SoR/SoF ${dmg.map(hex).join("/")}; SoW/SoL/SoJ ${util.map(hex).join("/")}`);
  });
  claim("D18", "Holy Strike and HotR category 2404 (12 s / 6 s); Holy Strike SpellMisc school 2", () => verdict(f(10333).categories?.category === 2404 && f(407632).categories?.category === 2404 && cd(f(10333)) === 12000 && cd(f(407632)) === 6000 && f(10333).misc?.schoolMask === 2, `10333 ${f(10333).categories?.category} ${cd(f(10333))} ms school ${f(10333).misc?.schoolMask}; 407632 ${f(407632).categories?.category} ${cd(f(407632))} ms`));
  claim("D18", "Holy Shield 20928 4 charges, 0.08", () => verdict(f(20928).auraOptions?.procCharges === 4 && byAura(f(20928), 43)?.effectBonusCoefficient === 0.08, `${f(20928).auraOptions?.procCharges} charges, block +${pts(byAura(f(20928), 51))}%, ${pts(byAura(f(20928), 43))} damage at ${byAura(f(20928), 43)?.effectBonusCoefficient}`));
  claim("D18", "SoF 20418 35 at 0.1; JoF 20414 0.45", () => verdict(pts(eff(f(20418), 0)) === 35 && eff(f(20418), 0).effectBonusCoefficient === 0.1 && eff(f(20414), 0).effectBonusCoefficient === 0.45, `20418 ${pts(eff(f(20418), 0))} at ${eff(f(20418), 0).effectBonusCoefficient}; 20414 ${pts(eff(f(20414), 0))} (variance ${eff(f(20414), 0).variance}, +${eff(f(20414), 0).effectRealPointsPerLevel}/level) at ${eff(f(20414), 0).effectBonusCoefficient}`));
  claim("D18", "SotC 20308 +2.4/level", () => verdict(byAura(f(20308), 99)?.effectRealPointsPerLevel === 2.4, `aura 99 ${pts(byAura(f(20308), 99))} + ${byAura(f(20308), 99)?.effectRealPointsPerLevel}/level (levels ${f(20308).levels?.baseLevel}–${f(20308).levels?.maxLevel})`));
  claim("D18", "JoF scripted value 1607 + 42.3/level, coefficient 0.18", () => {
    const e = eff(f(20414), 2);
    return verdict(pts(e) === 1607 && e.effectRealPointsPerLevel === 42.3 && e.effectBonusCoefficient === 0.18, `20414 effect 2 DUMMY ${pts(e)} + ${e.effectRealPointsPerLevel}/level at ${e.effectBonusCoefficient} (the SoF aura 20423 carries 1607 + ${eff(f(20423), 0).effectRealPointsPerLevel}/level)`);
  });

  // ---------------------------------------------------------------- D19 item → spell
  claim("D19", "The item → buff spell ids in buffs §3 (and §4 item procs)", () => {
    const docs = Object.values(consumables).filter((x) => x.doc.spellIds.length);
    const bad = docs.filter((x) => x.docMismatches.some((m) => m.startsWith(`doc says item ${x.id} → spell `)));
    return [bad.length === 0 ? OK : PART, `${docs.length - bad.length} of ${docs.length} match. ${bad.map((x) => `${x.doc.name} ${x.id}: the item casts ${x.effects.map((e) => e.spellId).join(", ")}${x.id === 13810 ? `, which triggers ${eff(f(18124), 1)?.effectTriggerSpell} (the doc's buff id, reached through the trigger)` : ""}`).join("; ")}`];
  });
  claim("D19", "Distilled Firewater → 17038; Smoked Desert Dumplings → 1248401 (the Well Fed family)", () => {
    const a = cons(246948)?.spellId;
    const b = cons(20452)?.spellId;
    return verdict(a === 17038 && b === 1248401, `246948 → ${a} ("${F.name(a)}"); 20452 → ${b} ("${F.name(b)}", which grants Well Fed ${eff(f(b), 1)?.effectTriggerSpell} after ${eff(f(b), 1)?.effectAuraPeriod} ms)`);
  });

  // ---------------------------------------------------------------- D20 enchants and minor consumables
  const enchantSpell = (id) => t.SpellItemEnchantment.byId.get(id)?.EffectArg[0];
  claim("D20", "Enchant 2618 → spell 19989 (+9 Agi); enchant 925 → spell 13930 (+2 defense)", () => verdict(enchantSpell(2618) === 19989 && pts(eff(f(19989), 0)) === 9 && enchantSpell(925) === 13930 && pts(eff(f(13930), 0)) === 2, `2618 "${t.SpellItemEnchantment.byId.get(2618).Name_lang}" → ${enchantSpell(2618)} (+${pts(eff(f(19989), 0))}); 925 "${t.SpellItemEnchantment.byId.get(925).Name_lang}" → ${enchantSpell(925)} (+${pts(eff(f(13930), 0))} skill ${eff(f(13930), 0).effectMiscValue[0]})`));
  claim("D20", "Rivenspike 17315 −100 per stack", () => verdict(pts(byAura(f(17315), 22)) === -100, `${pts(byAura(f(17315), 22))} × ${f(17315).auraOptions?.cumulativeAura} stacks`));
  claim("D20", "Consecrated Sharpening Stone reads 99 (28893)", () => verdict(pts(eff(f(28893), 0)) === 99, `28893 "${F.name(28893)}" ${f(28893).effects.map((e) => `aura ${e.effectAura}=${pts(e)}`).join(", ")}`));
  claim("D20", "Gift of Arthas 11374 +8", () => verdict(pts(byAura(f(11374), 14)) === 8, `aura 14 +${pts(byAura(f(11374), 14))} (school mask ${byAura(f(11374), 14).effectMiscValue[0]})`));
  claim("D20", "Blood Pact 11767 = 49 + 0.5/level", () => verdict(pts(eff(f(11767), 0)) === 49 && eff(f(11767), 0).effectRealPointsPerLevel === 0.5, `${pts(eff(f(11767), 0))} + ${eff(f(11767), 0).effectRealPointsPerLevel}/level (levels ${f(11767).levels?.baseLevel}–${f(11767).levels?.maxLevel})`));
  claim("D20", "Trueshot Aura r5 = 50", () => verdict(pts(eff(f(20906), 0)) === 50, `20906 aura ${eff(f(20906), 0).effectAura} = ${pts(eff(f(20906), 0))}`));

  // ---------------------------------------------------------------- D21 world buffs
  claim("D21", "22888, 15366, 16609 are dummy auras in Forever", () => {
    const ids = [22888, 15366, 16609];
    return verdict(ids.every((id) => f(id).effects.every((e) => e.effectAura === 4)), `${ids.map((id) => `${id}: ${f(id).effects.length} × aura 4`).join("; ")} (Classic: real auras ${ids.map((id) => c(id).effects.map((e) => e.effectAura).join("/")).join("; ")})`);
  });

  // ---------------------------------------------------------------- D22 threat items
  claim("D22", "Gloves – Threat 2613 → 25063 (+2); Cloak – Subtlety 2621 → 25070 (−2)", () => verdict(enchantSpell(2613) === 25063 && threatAura(25063) === 2 && enchantSpell(2621) === 25070 && threatAura(25070) === -2, `2613 → ${enchantSpell(2613)} (${threatAura(25063)}); 2621 → ${enchantSpell(2621)} (${threatAura(25070)})`));
  claim("D22", "Fetish of the Sand Reaver 26400 −70, 20 s, CD 180 s; Eye of Diminution 28862 −35, 20 s, CD 120 s", () => {
    const fe = itemEffectsByItem.get(21647)?.[0];
    const ee = itemEffectsByItem.get(23001)?.[0];
    return verdict(threatAura(26400) === -70 && f(26400).duration?.duration === 20000 && fe?.CoolDownMSec === 180000 && threatAura(28862) === -35 && f(28862).duration?.duration === 20000 && ee?.CoolDownMSec === 120000, `26400 ${threatAura(26400)}, ${f(26400).duration?.duration} ms, item 21647 CD ${fe?.CoolDownMSec} ms; 28862 ${threatAura(28862)}, ${f(28862).duration?.duration} ms, item 23001 CD ${ee?.CoolDownMSec} ms`);
  });
  claim("D22", "Increase/Decrease Threat All 01–04 linked to items 278540, 279493, 278929, 278299, 14576, 13959, 18308", () => {
    const items = [278540, 279493, 278929, 278299, 14576, 13959, 18308];
    const links = items.map((i) => `${i} → ${(itemEffectsByItem.get(i) ?? []).map((e) => F.name(e.SpellID)).filter((n) => /Threat All/.test(n ?? "")).join(", ") || "none"}`);
    return verdict(links.every((l) => !l.endsWith("none")), `${links.join("; ")} (none of these items has an ItemSparse row in this build)`);
  });
  claim("D22", "Enhanced Sunder Armor 23561", () => verdict(F.exists(23561), `aura ${eff(f(23561), 0).effectAura} +${pts(eff(f(23561), 0))}% on mask ${eff(f(23561), 0).effectSpellClassMask[0]} (Sunder Armor's)`));

  // ---------------------------------------------------------------- D23 taunts
  claim("D23", "Taunt 355 and Growl 6795: effect 114 + aura 11, 3 s", () => verdict([355, 6795].every((id) => byType(f(id), 114) && byAura(f(id), 11) && f(id).duration?.duration === 3000), [355, 6795].map((id) => `${id} ${f(id).effects.map((e) => e.effectAura || e.effect).join("+")} ${f(id).duration?.duration} ms`).join("; ")));
  claim("D23", "Mocking Blow 20560 aura 11, 6 s; Challenging Shout 1161 and Roar 5209 6 s", () => verdict(byAura(f(20560), 11) && [20560, 1161, 5209].every((id) => f(id).duration?.duration === 6000), [20560, 1161, 5209].map((id) => `${id} ${f(id).duration?.duration} ms`).join("; ")));

  // ---------------------------------------------------------------- C27 (Route D first)
  claim("C27", "Demoralizing Shout 11556 / Roar 9898: −1.4 per level from 54 / 52 would give about −204.4 / −204.2 at 60 if MaxLevel doesn't cap it", () => {
    const at60 = (id) => {
      const s = f(id);
      const e = byAura(s, 99);
      const lvl = Math.min(60, s.levels?.maxLevel || 60) - s.levels?.spellLevel;
      return { v: Math.round((pts(e) + e.effectRealPointsPerLevel * lvl) * 10) / 10, e, s };
    };
    const a = at60(11556);
    const b = at60(9898);
    return verdict(a.v === -204.4 && b.v === -204.2, `11556 ${pts(a.e)} ${a.e.effectRealPointsPerLevel}/level, SpellLevels ${a.s.levels?.spellLevel}–${a.s.levels?.maxLevel} → ${a.v} at 60; 9898 ${pts(b.e)} ${b.e.effectRealPointsPerLevel}/level, ${b.s.levels?.spellLevel}–${b.s.levels?.maxLevel} → ${b.v} at 60. MaxLevel doesn't cap the term below 60; whether the server applies it is still a Route C question`);
  });

  // ---------------------------------------------------------------- game tables (secondary-sourced in the docs)
  const cr = gt.combatRatings.rows;
  const cr60 = cr.find((r) => r.Level === 60);
  claim("GT", "CombatRatings: 14 crit, 10 hit, 12 dodge, 15 parry, 5 block, defense 1:1, haste 10, expertise 10, armor penetration 10 per 1%, the same at every level (known only via wowsims)", () => {
    const want = { "Crit - Melee": 14, "Hit - Melee": 10, Dodge: 12, Parry: 15, Block: 5, "Defense Skill": 1, "Haste - Melee": 10, Expertise: 10, "Armor Penetration": 10 };
    const same = cr.every((r) => Object.keys(want).every((k) => r[k] === cr60[k]));
    return verdict(Object.entries(want).every(([k, v]) => cr60[k] === v) && same, `${Object.keys(want).map((k) => `${k} ${cr60[k]}`).join(", ")}; identical for levels 1–${cr.length}`);
  });
  claim("GT", "ArmorMitigationByLvl: 1,059 at level 60, 7,765 at 120, runs to 123 (a retail leftover)", () => {
    const a = gt.armorMitigation.rows;
    const at = (l) => a.find((r) => r.Level === l)?.Constant;
    return verdict(at(60) === 1059 && at(120) === 7765 && a.length === 123, `60: ${at(60)}, 63: ${at(63)}, 120: ${at(120)}; ${a.length} levels`);
  });
  claim("GT", "The beta ships CombatRatings and ArmorMitigationByLvl but no base-crit, base-HP or regen tables", () => [gt.baseMana.present || gt.hpPerStamina.present ? PART : OK, `true for crit and regen (no chancetomeleecrit*, chancetospellcrit*, regen* or octbasehp* files in the build's file list); but it also ships basemp.txt (base mana, the same values as PlayerExpectedStat.BaseMana) and hppersta.txt (${gt.hpPerStamina.rows?.find((r) => r.Level === 60)?.Health} HP per Stamina at 60)`]);
  claim("GT", "RaceStat: one row per race, a single unnamed field, 0 everywhere", () => {
    const rows = t.RaceStat?.rows ?? [];
    return verdict(rows.length > 0 && rows.every((r) => Object.entries(r).every(([k, v]) => k === "ID" || k === "ChrRacesID" || v === 0)), `${rows.length} rows (ChrRacesID + Field_1_60_1_69876_002), all 0`);
  });

  // ---------------------------------------------------------------- markdown
  const counts = { [OK]: 0, [PART]: 0, [DIFF]: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const esc = (s) => String(s).replace(/\|/g, "\\|");
  const mark = { [OK]: "matches", [PART]: "**partly**", [DIFF]: "**differs**" };
  const md = [
    `Checked against build \`${version}\` (Forever) and \`${baselineVersion}\` (Classic Era) raw client files: ${rows.length} claims, ${counts[OK]} match, ${counts[PART]} partly, ${counts[DIFF]} differ.`,
    "",
    "| Row | Doc claim | Result | Raw client value |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.id} | ${esc(r.claim)} | ${mark[r.status]} | ${esc(r.actual)} |`),
    "",
  ].join("\n");
  return { rows, counts, markdown: md, summary: `${rows.length} claims: ${counts[OK]} match, ${counts[PART]} partly, ${counts[DIFF]} differ` };
}
