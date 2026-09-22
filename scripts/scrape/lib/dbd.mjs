// Parser for WoWDBDefs .dbd definition files (https://github.com/wowdev/WoWDBDefs).
//
// A .dbd file has a COLUMNS block (column name -> type, optional foreign key) and one or
// more definition blocks. Each definition block lists the LAYOUT hashes and BUILDs it
// applies to, then the fields in file order:
//
//   COLUMNS
//   int ID
//   locstring Name_lang
//   int<SpellCategory::ID> Category
//
//   LAYOUT 2227014B
//   BUILD 1.60.1.69876, 1.60.1.69913
//   BUILD 1.15.0.52000-1.15.9.69722
//   $noninline,id$ID<32>
//   BaseProcRate
//   Flags<u16>[2]
//
// Format reference: https://github.com/wowdev/WoWDBDefs/blob/master/README.md

/** Parse a build string "a.b.c.d" into a comparable tuple. */
export function parseBuild(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s.trim());
  if (!m) throw new Error(`Bad build string ${JSON.stringify(s)}`);
  return m.slice(1).map(Number);
}

function compareBuild(a, b) {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** True when `build` (a.b.c.d) is covered by a BUILD entry ("x" or "x-y"). */
function buildMatches(entry, build) {
  const b = parseBuild(build);
  if (entry.includes("-")) {
    const [lo, hi] = entry.split("-").map(parseBuild);
    // Ranges only span builds of the same major.minor.patch.
    return compareBuild(b, lo) >= 0 && compareBuild(b, hi) <= 0 && b[0] === lo[0] && b[1] === lo[1] && b[2] === lo[2];
  }
  return compareBuild(parseBuild(entry), b) === 0;
}

/**
 * @returns {{
 *   columns: Map<string, {type: string, foreignTable: string|null, foreignColumn: string|null, verified: boolean}>,
 *   definitions: Array<{layouts: string[], builds: string[], comment: string|null, fields: Array<{
 *     name: string, id: boolean, noninline: boolean, relation: boolean,
 *     size: number|null, signed: boolean, arrayLength: number|null, type: string}>}>
 * }}
 */
export function parseDbd(text) {
  const lines = text.split(/\r?\n/);
  const columns = new Map();
  const definitions = [];
  let i = 0;
  if (lines[0]?.trim() !== "COLUMNS") throw new Error("DBD: expected COLUMNS header");
  i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") break;
    const m = /^(\w+)(?:<([\w:]+)::(\w+)>)?\s+(\w+)(\?)?(?:\s*\/\/.*)?$/.exec(line);
    if (!m) throw new Error(`DBD: bad column line ${JSON.stringify(line)}`);
    columns.set(m[4], { type: m[1], foreignTable: m[2] ?? null, foreignColumn: m[3] ?? null, verified: !m[5] });
  }
  let current = null;
  const flush = () => {
    if (current && (current.fields.length || current.layouts.length || current.builds.length)) definitions.push(current);
    current = null;
  };
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      flush();
      continue;
    }
    current ??= { layouts: [], builds: [], comment: null, fields: [] };
    if (line.startsWith("LAYOUT ")) {
      current.layouts.push(...line.slice(7).split(",").map((s) => s.trim().toUpperCase()));
    } else if (line.startsWith("BUILD ")) {
      current.builds.push(...line.slice(6).split(",").map((s) => s.trim()));
    } else if (line.startsWith("COMMENT ")) {
      current.comment = line.slice(8).trim();
    } else {
      const m = /^(?:\$([\w,]+)\$)?(\w+)(?:<(u?)(\d+)>)?(?:\[(\d+)\])?(?:\s*\/\/.*)?$/.exec(line);
      if (!m) throw new Error(`DBD: bad field line ${JSON.stringify(line)}`);
      const annotations = new Set((m[1] ?? "").split(",").filter(Boolean));
      const col = columns.get(m[2]);
      if (!col) throw new Error(`DBD: field ${m[2]} has no COLUMNS entry`);
      current.fields.push({
        name: m[2],
        id: annotations.has("id"),
        noninline: annotations.has("noninline"),
        relation: annotations.has("relation"),
        size: m[4] ? Number(m[4]) : null,
        signed: m[4] ? m[3] !== "u" : col.type === "int",
        arrayLength: m[5] ? Number(m[5]) : null,
        type: col.type,
      });
    }
  }
  flush();
  return { columns, definitions };
}

/**
 * Pick the definition for a file: the block whose LAYOUT list has `layoutHash` and whose
 * BUILD list covers `build`; else any block with the layout hash; else any block covering
 * the build. Returns { definition, matchedBy } or throws.
 */
export function findDefinition(dbd, { layoutHash, build }) {
  const hash = layoutHash.toUpperCase();
  const byLayout = dbd.definitions.filter((d) => d.layouts.includes(hash));
  const byBuild = (list) => list.filter((d) => d.builds.some((b) => buildMatches(b, build)));
  const both = byBuild(byLayout);
  if (both.length) return { definition: both[0], matchedBy: "layout+build" };
  if (byLayout.length) return { definition: byLayout[0], matchedBy: "layout" };
  const builds = byBuild(dbd.definitions);
  if (builds.length) return { definition: builds[0], matchedBy: "build" };
  throw new Error(`No definition for layout ${hash} / build ${build}`);
}
