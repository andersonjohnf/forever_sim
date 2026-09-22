// Download layer for client files: wago.tools API (builds, file list, raw files by
// FileDataID) plus WoWDBDefs from GitHub. Generic over product and build, so the same
// code reads wow_classic_beta (Forever) and wow_classic_era (Classic Era).
//
// Cache layout (all under .cache/client/, git-ignored):
//   builds/<product>_latest.json             /api/builds/<product>/latest
//   <version>/api/files.json                 /api/files?version=<version>&format=json
//   <version>/casc/<fdid>.bin                /api/casc/<fdid>?version=<version>
//   <version>/tables/<Table>.ndjson          parsed DB2: line 1 = meta, then one row per line
//   <version>/gametables/<name>.json         parsed game table
//   github/wowdbdefs/<sha>/...               manifest.json and definitions/<Table>.dbd
//   requests.jsonl                           one line per network request

import fs from "node:fs";
import path from "node:path";
import { parseDbd, findDefinition } from "./dbd.mjs";
import { readDb2, peekDb2 } from "./db2.mjs";
import { parseGameTable } from "./gametable.mjs";

const WAGO = "https://wago.tools";
const DBDEFS_REPO = "wowdev/WoWDBDefs";
/** Bump when the parser's output changes, so cached parsed tables are rebuilt. */
export const PARSER_VERSION = 2;

export function createClientSource({ fetcher, cacheDir, version, dbdefsSha }) {
  const manifestCache = { value: null };
  const dbdCache = new Map();
  const tableCache = new Map();
  let fileList = null;

  async function manifest() {
    if (!manifestCache.value) {
      const body = await fetcher.get(
        `https://raw.githubusercontent.com/${DBDEFS_REPO}/${dbdefsSha}/manifest.json`,
        `github/wowdbdefs/${dbdefsSha}/manifest.json`,
      );
      manifestCache.value = new Map(JSON.parse(body.toString("utf8")).map((e) => [e.tableName, e]));
    }
    return manifestCache.value;
  }

  async function files() {
    if (!fileList) {
      const body = await fetcher.get(`${WAGO}/api/files?version=${version}&format=json`, `${version}/api/files.json`);
      fileList = JSON.parse(body.toString("utf8"));
    }
    return fileList;
  }

  /** FileDataID of a file by its path in the build's file list (lower case), or null. */
  async function fdidByName(name) {
    const list = await files();
    const lower = name.toLowerCase();
    for (const [fdid, n] of Object.entries(list)) if (n === lower) return Number(fdid);
    return null;
  }

  async function hasFile(fdid) {
    return Object.hasOwn(await files(), String(fdid));
  }

  async function casc(fdid) {
    return fetcher.get(`${WAGO}/api/casc/${fdid}?version=${version}`, `${version}/casc/${fdid}.bin`);
  }

  function cascMeta(fdid) {
    return fetcher.cachedMeta(`${version}/casc/${fdid}.bin`);
  }

  async function dbd(table) {
    if (!dbdCache.has(table)) {
      const body = await fetcher.get(
        `https://raw.githubusercontent.com/${DBDEFS_REPO}/${dbdefsSha}/definitions/${table}.dbd`,
        `github/wowdbdefs/${dbdefsSha}/definitions/${table}.dbd`,
      );
      dbdCache.set(table, parseDbd(body.toString("utf8")));
    }
    return dbdCache.get(table);
  }

  /**
   * Download and parse one DB2 table. Returns
   *   { table, fdid, present, rows, byId, header, sections, storage, definition, matchedBy, warnings }
   * `present: false` (and no rows) when the build doesn't ship the file.
   */
  async function table(name) {
    if (tableCache.has(name)) return tableCache.get(name);
    const entry = (await manifest()).get(name);
    if (!entry?.db2FileDataID) throw new Error(`WoWDBDefs manifest has no db2FileDataID for ${name}`);
    const fdid = entry.db2FileDataID;
    if (!(await hasFile(fdid))) {
      const result = { table: name, fdid, present: false, rows: [], byId: new Map(), warnings: [] };
      tableCache.set(name, result);
      return result;
    }
    const buf = await casc(fdid);
    const defs = await dbd(name);
    const peek = peekDb2(buf);
    const { definition, matchedBy } = findDefinition(defs, { layoutHash: peek.layoutHash, build: version });
    const parsed = readDb2(buf, definition);
    const result = {
      table: name,
      fdid,
      present: true,
      bytes: buf.length,
      ...parsed,
      definition,
      matchedBy,
      byId: new Map(parsed.rows.map((r) => [r.ID, r])),
    };
    writeParsedCache(result);
    tableCache.set(name, result);
    return result;
  }

  function writeParsedCache(t) {
    const file = path.join(cacheDir, version, "tables", `${t.table}.ndjson`);
    const meta = {
      table: t.table,
      fdid: t.fdid,
      version,
      parserVersion: PARSER_VERSION,
      wowDbDefs: dbdefsSha,
      layoutHash: t.header.layoutHashHex,
      tableHash: t.header.tableHashHex,
      schemaString: t.header.schemaString ?? null,
      matchedBy: t.matchedBy,
      recordCount: t.header.recordCount,
      rows: t.rows.length,
      sections: t.sections,
      storage: t.storage,
      warnings: t.warnings,
    };
    if (fs.existsSync(file)) {
      const first = fs.readFileSync(file, "utf8").split("\n", 1)[0];
      try {
        const old = JSON.parse(first);
        if (old.parserVersion === PARSER_VERSION && old.wowDbDefs === dbdefsSha && old.rows === t.rows.length) return;
      } catch {
        // rewrite
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(file, "w");
    fs.writeSync(fd, `${JSON.stringify(meta)}\n`);
    let chunk = "";
    for (const row of t.rows) {
      chunk += `${JSON.stringify(row)}\n`;
      if (chunk.length > 1 << 20) {
        fs.writeSync(fd, chunk);
        chunk = "";
      }
    }
    fs.writeSync(fd, chunk);
    fs.closeSync(fd);
  }

  /** Download and parse a game table by path, e.g. "gametables/combatratings.txt". */
  async function gameTable(fileName) {
    const fdid = await fdidByName(fileName);
    if (!fdid) return { file: fileName, fdid: null, present: false };
    const buf = await casc(fdid);
    const parsed = parseGameTable(buf.toString("utf8"));
    const out = path.join(cacheDir, version, "gametables", `${path.basename(fileName, ".txt")}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify({ file: fileName, fdid, ...parsed })}\n`);
    return { file: fileName, fdid, present: true, ...parsed };
  }

  return { manifest, files, fdidByName, hasFile, casc, cascMeta, dbd, table, gameTable, version, dbdefsSha };
}

/** Latest build of a product (cached; `--refresh` re-asks). */
export async function latestBuild(fetcher, product) {
  const body = await fetcher.get(`${WAGO}/api/builds/${product}/latest`, `builds/${product}_latest.json`);
  return JSON.parse(body.toString("utf8"));
}

/** The WoWDBDefs commit to use: pinned, else the cached/latest head of master. */
export async function wowDbDefsCommit(fetcher, pinned) {
  if (pinned) return pinned;
  const body = await fetcher.get(`https://api.github.com/repos/${DBDEFS_REPO}/commits/master`, "github/wowdbdefs_head.json");
  return JSON.parse(body.toString("utf8")).sha;
}
