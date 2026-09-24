// The build-code guard (L10): every position of a code keeps its talent and max rank against the
// committed dataset, whether or not a stored code uses it (docs/data/talents.md#build-codes-verified).
import { describe, expect, it } from "vitest";
import warrior from "../../../src/data/talents/warrior.json";
import frozen from "../../../src/data/talents/frozen.json";
import { FROZEN_TALENT_FIELDS, codeOrder, codePositionChanges, decodeByName, describeRanks, frozenAsData, validate } from "./build-codes.mjs";

const clone = () => JSON.parse(JSON.stringify(warrior));
const talent = (data, name) => data.trees.flatMap((t) => t.talents).find((t) => t.name === name);

describe("codePositionChanges", () => {
  it("finds nothing between a dataset and itself", () => {
    expect(codePositionChanges(warrior, clone())).toEqual({ changed: [], appended: [] });
  });

  it("flags a position no stored code uses (Improved Hamstring, Arms 16) when its max rank changes", () => {
    const next = clone();
    talent(next, "Improved Hamstring").maxRank = 2;
    expect(codePositionChanges(warrior, next).changed).toEqual(["Arms position 16: Improved Hamstring (max 3) → Improved Hamstring (max 2)"]);
  });

  it("flags a reorder: two talents trading cells shift every position between them", () => {
    const next = clone();
    const a = talent(next, "Improved Charge");
    const b = talent(next, "Deflection");
    [a.tier, a.col, b.tier, b.col] = [b.tier, b.col, a.tier, a.col];
    expect(codePositionChanges(warrior, next).changed).toEqual([
      "Arms position 2: Deflection (max 5) → Improved Charge (max 2)",
      "Arms position 4: Improved Charge (max 2) → Deflection (max 5)",
    ]);
  });

  it("flags a removed position, and lets a talent be appended at the end of a tree", () => {
    const removed = clone();
    removed.trees[0].talents = removed.trees[0].talents.filter((t) => t.name !== "Mortal Strike");
    expect(codePositionChanges(warrior, removed).changed).toEqual(["Arms position 17: Mortal Strike (max 1) → nothing"]);
    const appended = clone();
    appended.trees[2].talents.push({ ...talent(appended, "Shield Slam"), id: "warrior-protection-new", name: "New Talent", tier: 9, col: 0 });
    expect(codePositionChanges(warrior, appended)).toEqual({ changed: [], appended: ["Protection position 19: New Talent (max 1)"] });
  });
});

describe("decoding", () => {
  const fury = "30305013002-050530035150010051-";

  it("describes a code by talent name per tree, as stored-builds.json lists it", () => {
    expect(describeRanks(warrior, fury)[2]).toBe("");
    expect(describeRanks(warrior, fury)[0]).toBe("Improved Heroic Strike 3, Improved Rend 3, Improved Tactical Mastery 5, Anger Management 1, Deep Wounds 3, Impale 2");
    expect(decodeByName(warrior, fury)["Fury/Bloodthirst"]).toBe(1);
    expect(validate(warrior, fury)).toEqual([]);
    expect(codeOrder(warrior).map((t) => t.length)).toEqual([17, 18, 18]);
  });

  it("refuses a digit above a talent's max rank", () => {
    expect(() => decodeByName(warrior, "4")).toThrow(/Improved Heroic Strike: rank 4 > 3/);
  });
});

describe("frozen orders (docs/data/talents.md#tree-versions)", () => {
  it("decode a code written on 1.60.1.69913's trees as it was written, whatever today's trees hold", () => {
    const paladin = frozenAsData(frozen.builds["1.60.1.69913"].classes.paladin);
    const retribution = "250003-503-052052310012330321";
    expect(describeRanks(paladin, retribution)[0]).toBe("Improved Holy Strike 2, Divine Strength 5, Improved Seals 3");
    expect(decodeByName(paladin, retribution)["Retribution/Crusade"]).toBe(2);
    expect(codeOrder(paladin).map((t) => t.length)).toEqual([18, 16, 18]);
    expect(FROZEN_TALENT_FIELDS).toEqual(frozen.meta.talentFields);
  });
});
