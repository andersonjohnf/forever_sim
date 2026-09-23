// Deterministic JSON for committed datasets: 2-space indentation, object keys sorted
// (integer-like keys numerically, then the rest by code point; a top-level `meta` stays
// first), arrays of primitives on one line, trailing newline.

const isPrimitive = (v) => v === null || typeof v !== "object";

/**
 * Locale-independent text order for everything the generators sort: case-insensitive first
 * (String#toLowerCase is locale-independent), then by UTF-16 code unit. Never `localeCompare` or
 * `Intl.Collator`: they follow the machine's locale (LANG, LC_ALL), so two machines could write
 * different bytes (docs/data/README.md#rules).
 */
export function compareText(a, b) {
  const x = String(a).toLowerCase();
  const y = String(b).toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareKeys(a, b) {
  const na = /^-?\d+$/.test(a);
  const nb = /^-?\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function scalar(v, path) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`non-finite number at ${path}`);
    return Object.is(v, -0) ? "0" : JSON.stringify(v);
  }
  if (v === undefined) throw new Error(`undefined at ${path}`);
  return JSON.stringify(v);
}

function write(v, indent, path, top) {
  if (isPrimitive(v)) return scalar(v, path);
  const pad = "  ".repeat(indent + 1);
  const end = "  ".repeat(indent);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.every(isPrimitive)) return `[${v.map((x, i) => scalar(x, `${path}[${i}]`)).join(", ")}]`;
    return `[\n${v.map((x, i) => pad + write(x, indent + 1, `${path}[${i}]`, false)).join(",\n")}\n${end}]`;
  }
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort(compareKeys);
  if (top && keys.includes("meta")) keys.splice(0, keys.length, "meta", ...keys.filter((k) => k !== "meta"));
  if (keys.length === 0) return "{}";
  return `{\n${keys.map((k) => `${pad}${JSON.stringify(k)}: ${write(v[k], indent + 1, `${path}.${k}`, false)}`).join(",\n")}\n${end}}`;
}

export function stableStringify(value) {
  return `${write(value, 0, "$", true)}\n`;
}
