// Parser for client game tables (gametables/*.txt): tab-separated text, a header row of
// column names, then one row per index (usually "Level"). Values are numbers.

/** @returns {{ columns: string[], rows: Array<Record<string, number>> }} */
export function parseGameTable(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0].split("\t").map((c) => c.trim());
  const rows = lines.slice(1).map((line, i) => {
    const cells = line.split("\t");
    if (cells.length !== columns.length) {
      throw new Error(`game table row ${i + 1}: ${cells.length} cells, header has ${columns.length}`);
    }
    const row = {};
    columns.forEach((c, k) => {
      const v = Number(cells[k]);
      if (!Number.isFinite(v)) throw new Error(`game table row ${i + 1}, column ${c}: not a number (${cells[k]})`);
      row[c] = v;
    });
    return row;
  });
  return { columns, rows };
}
