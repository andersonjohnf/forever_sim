// Download layer for client files: wago.tools API (builds, file list, raw files by
// FileDataID) plus WoWDBDefs from GitHub. Generic over product and build, so the same
// code reads wow_classic_beta (Forever) and wow_classic_era (Classic Era).
//
// Cache layout (all under .cache/client/, git-ignored):
//   builds/<product>_latest.json             /api/builds/<product>/latest
//   <version>/api/builds.json                /api/builds (the build list, once per requested build)
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

/**
 * A client build version as wago.tools writes it ("1.60.1.69913": four dot-separated numbers).
 * A version names cache directories and goes into request URLs, and it comes from the command
 * line or from wago.tools' own answer, so anything else ("../..", "1.60&x=") is refused.
 */
export function assertBuildVersion(version) {
  if (typeof version !== "string" || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,7}$/.test(version)) {
    throw new Error(`Not a client build version: ${JSON.stringify(version)} (expected e.g. 1.60.1.69913)`);
  }
  return version;
}

/** A WoWDBDefs commit: a full 40-hex-digit SHA, which also names cache directories. */
export function assertCommitSha(sha) {
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Not a WoWDBDefs commit SHA: ${JSON.stringify(sha)}`);
  return sha;
}

export function createClientSource({ fetcher, cacheDir, version, dbdefsSha }) {
  assertBuildVersion(version);
  assertCommitSha(dbdefsSha);
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
  if (!/^[a-z0-9_]+$/.test(product)) throw new Error(`Not a wago.tools product: ${JSON.stringify(product)}`);
  const body = await fetcher.get(`${WAGO}/api/builds/${product}/latest`, `builds/${product}_latest.json`);
  const latest = JSON.parse(body.toString("utf8"));
  assertBuildVersion(latest?.version);
  return latest;
}

/**
 * A build's wago.tools record ({ product, version, created_at, … }), read from the build list
 * (`/api/builds`, every product's builds). The list is cached per requested build
 * (<version>/api/builds.json), so it is fetched once per build and always lists that build, and
 * the date a dataset records doesn't depend on which build the cache holds as "latest". Null
 * when wago.tools doesn't list the build.
 */
export async function buildRecord(fetcher, product, version) {
  assertBuildVersion(version);
  const body = await fetcher.get(`${WAGO}/api/builds`, `${version}/api/builds.json`);
  const all = JSON.parse(body.toString("utf8"));
  const list = Array.isArray(all) ? all : (all[product] ?? []);
  return list.find((b) => b.version === version && (b.product ?? product) === product) ?? null;
}

/** A build's creation date on wago.tools, YYYY-MM-DD (null when the list doesn't have it). */
export async function buildDate(fetcher, product, version) {
  return (await buildRecord(fetcher, product, version))?.created_at?.slice(0, 10) ?? null;
}

/** The WoWDBDefs commit to use: pinned, else the cached/latest head of master. */
export async function wowDbDefsCommit(fetcher, pinned) {
  if (pinned) return assertCommitSha(pinned);
  const body = await fetcher.get(`https://api.github.com/repos/${DBDEFS_REPO}/commits/master`, "github/wowdbdefs_head.json");
  return assertCommitSha(JSON.parse(body.toString("utf8")).sha);
}
