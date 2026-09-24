// Every doc citation with an anchor in the code, and every anchored link between the docs, resolves to a heading (CLAUDE.md, "Docs and code
// stay in sync"): the results panel's assumption links open the doc on GitHub at that anchor, and
// a renamed or renumbered heading, or a status emoji at its end, silently sends them to the top.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brokenCitations, brokenDocLinks, citedAnchors, docAnchors, docLinks, githubSlug } from "./doc-anchors.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

// Citations of docs that don't exist, on purpose: a test of the fallback link text.
const FICTIONAL = ["src/lib/docs.test.ts:14 docs/some-new-doc.md#x:"];

describe("GitHub's heading anchors", () => {
  // Each checked against the anchor github.com gave the same heading in this repo's docs.
  it.each([
    ["M1: Engine core ✅", "m1-engine-core-"],
    ["M5.7: The optimizer (D30) 🚧 top priority", "m57-the-optimizer-d30--top-priority"],
    ["Forever's ratings [F], with open questions", "forevers-ratings-f-with-open-questions"],
    ["8. Boss → player (tanks)", "8-boss--player-tanks"],
    ["11.4 Your demon's passives", "114-your-demons-passives"],
    ["D10: Pre-raid pool = Rare, required level 55–60 or item level ≥ 58 (2026-09-22)", "d10-pre-raid-pool--rare-required-level-5560-or-item-level--58-2026-09-22"],
    ["B16. Shred and Claw: flat bonus before or after the weapon %", "b16-shred-and-claw-flat-bonus-before-or-after-the-weapon-"],
  ])("%s → #%s", (heading, slug) => expect(githubSlug(heading)).toBe(slug));

  it("render the heading first, number repeats, skip code blocks and keep explicit ids", () => {
    const md = [
      "# Forever's ratings `[F]`, with open questions",
      "## Mangle’s *bear* **only** [link](x) snake_case_name ##",
      "## Dup",
      "```md",
      "## Not a heading",
      "```",
      "## Dup",
      '<a id="parry-haste"></a>',
    ].join("\n");
    expect([...docAnchors(md)]).toEqual([
      "forevers-ratings-f-with-open-questions",
      "mangles-bear-only-link-snake_case_name",
      "dup",
      "dup-1",
      "parry-haste",
    ]);
  });
});

describe("doc citations", () => {
  it("are found as paths, bare file names, GitHub URLs and doc-path constants", () => {
    const text = [
      "// docs/mechanics/rage.md#rage-from-damage-taken, and rage.md#forever-",
      "const DOC = 'docs/classes/paladin.md'",
      "docRef: `${DOC}#seals`, `${OTHER}#x`",
      "'https://github.com/andersonjohnf/forever_sim/blob/main/docs/ux.md#layout'",
    ].join("\n");
    const found = citedAnchors(text, new Map([["DOC", "docs/classes/paladin.md"]])).map((c) => `${c.file}#${c.anchor}`);
    expect(found).toEqual([
      "docs/mechanics/rage.md#rage-from-damage-taken",
      "rage.md#forever-",
      "docs/classes/paladin.md#seals",
      "null#x",
      "docs/ux.md#layout",
    ]);
  });

  it("in src/, scripts/ and e2e/ all open at a heading of their doc", () => {
    const broken = brokenCitations(ROOT, ["src", "scripts", "e2e"], { skip: (file) => file.startsWith("scripts/doc-anchors") })
      .filter((b) => !FICTIONAL.some((f) => b.startsWith(f)));
    expect(broken).toEqual([]);
  });
});

describe("the docs' own anchored links", () => {
  it("are found relative, within the doc, in angle brackets and in reference definitions, but not in code or off-site; a malformed escape is kept", () => {
    const md = [
      "See [client](client.md#what-it-did) and [seals](#seals), [up](../ux.md#layout \"Layout\").",
      "[odd](<rage.md#forever->) `[not](x.md#code)` [web](https://example.com/a.md#x)",
      "```",
      "[fenced](y.md#z)",
      "```",
      "[client]: ../data/client.md#doc-claims",
      "[bad](#50%zz)",
    ].join("\n");
    expect(docLinks(md).map((l) => `${l.line} ${l.file}#${l.anchor}`)).toEqual([
      "1 client.md#what-it-did",
      "1 #seals",
      "1 ../ux.md#layout",
      "2 rage.md#forever-",
      "6 ../data/client.md#doc-claims",
      "7 #50%zz",
    ]);
  });

  it("all open at a heading of their target", () => {
    expect(brokenDocLinks(ROOT)).toEqual([]);
  });
});
