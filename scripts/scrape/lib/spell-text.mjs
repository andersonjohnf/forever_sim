// Renders a spell's tooltip text (Spell.Description_lang) from the client tables: the `$s1`-
// style variables, `${…}` arithmetic, `$/1000;s1` scaling, `$@spelldesc…` inclusions and
// SpellDescriptionVariables. Pure functions, zero dependencies: callers pass parsed table rows
// (see SPELL_TEXT_TABLES) for one build and get plain strings back.
// See docs/data/items.md#effect-and-set-bonus-text for what is rendered and what isn't.
//
// Supported tokens (an optional spell id prefix, e.g. `$17669s1`, reads another spell):
//   $s1 $S1   effect points (a range "min to max" when the effect has a spread)
//   $m1 / $M1 minimum / maximum points
//   $o1       points × ticks over the duration          $t1  tick period in seconds
//   $d        duration ("15 sec", "2 min")               $a1  radius in yards
//   $h        proc chance                                $n   proc charges
//   $u        max stacks    $x1 chain targets    $i max targets    $r range
//   $q1 misc value         $e1 amplitude        $b1 points per resource
//   $proccooldown          the proc's internal cooldown in seconds
//   $/N;s1 $*N;s1          a token divided or multiplied by N
//   ${expr}.N              arithmetic over tokens (+ − × ÷, parentheses, $max/$min/$floor/
//                          $ceil/$abs/$round/$cond/$gt/$lt/$gte/$lte), N decimals
//   $<name>                a SpellDescriptionVariables variable of the spell
//   $gmale:female;         the first form      $lsingular:plural;  by the last number
//   $@spelldesc123 / $@spellname123 / $@auradesc123
// Anything else (`$?` player conditions, `$z`, unknown variables) is reported in `unrendered`
// and the caller falls back to a plain description.

/** Tables the renderer reads (both builds). */
export const SPELL_TEXT_TABLES = [
  "Spell",
  "SpellName",
  "SpellEffect",
  "SpellMisc",
  "SpellDuration",
  "SpellAuraOptions",
  "SpellRadius",
  "SpellRange",
  "SpellTargetRestrictions",
  "SpellDescriptionVariables",
  "SpellXDescriptionVariables",
];

/** Player level used for `$PL` in description variables (the sim is level 60). */
export const PLAYER_LEVEL = 60;

const rowsOf = (t) => (Array.isArray(t) ? t : (t?.rows ?? []));
const indexById = (t) => new Map(rowsOf(t).map((r) => [r.ID, r]));
/** First DifficultyID-0 row per SpellID. */
function firstBySpell(t) {
  const map = new Map();
  for (const r of rowsOf(t)) if (!r.DifficultyID && !map.has(r.SpellID)) map.set(r.SpellID, r);
  return map;
}

/** Build the lookups the renderer needs from SPELL_TEXT_TABLES (rows or parsed tables). */
export function createSpellTextContext(tables) {
  const t = (name) => tables[name];
  const effects = new Map();
  for (const e of rowsOf(t("SpellEffect"))) {
    if (e.DifficultyID) continue;
    if (!effects.has(e.SpellID)) effects.set(e.SpellID, new Map());
    effects.get(e.SpellID).set(e.EffectIndex, e);
  }
  const variables = indexById(t("SpellDescriptionVariables"));
  const descVars = new Map();
  for (const x of rowsOf(t("SpellXDescriptionVariables"))) {
    const v = variables.get(x.SpellDescriptionVariablesID);
    if (v) descVars.set(x.SpellID, parseVariables(v.Variables));
  }
  return {
    spell: indexById(t("Spell")),
    spellName: indexById(t("SpellName")),
    effects,
    misc: firstBySpell(t("SpellMisc")),
    duration: indexById(t("SpellDuration")),
    auraOptions: firstBySpell(t("SpellAuraOptions")),
    radius: indexById(t("SpellRadius")),
    range: indexById(t("SpellRange")),
    targets: firstBySpell(t("SpellTargetRestrictions")),
    descVars,
  };
}

/** "$name=expr" lines of a SpellDescriptionVariables row → Map(name → expr). */
function parseVariables(text) {
  const map = new Map();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = /^\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) map.set(m[1], m[2].trim());
  }
  return map;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * An effect's points as a signed { min, max }. Forever's layout stores the value in
 * EffectBasePointsF with a relative spread `Variance` (100 with 0.2 is 90 to 110). Classic Era
 * 1.15 keeps the old integer convention: min = EffectBasePoints + 1, max = EffectBasePoints +
 * EffectDieSides when EffectDieSides ≥ 1 (lib/item-stats.mjs rawEffectPoints reads the same).
 */
export function effectRange(e) {
  if (!e) return null;
  if (e.EffectBasePoints === undefined || e.EffectBasePointsF) {
    const v = e.EffectBasePointsF ?? 0;
    if (!e.Variance) return { min: v, max: v };
    // The tooltip rounds a spread's ends: 616 with 0.2 is "554 to 678" (Talisman of Arathor).
    const spread = (v * e.Variance) / 2;
    return { min: Math.round(v - spread), max: Math.round(v + spread) };
  }
  const bp = e.EffectBasePoints;
  const die = e.EffectDieSides ?? 0;
  return die >= 1 ? { min: bp + 1, max: bp + die } : { min: bp, max: bp };
}

/** Duration of a spell in ms (SpellMisc.DurationIndex → SpellDuration), or null. */
export function spellDurationMs(ctx, spellId) {
  const index = ctx.misc.get(spellId)?.DurationIndex;
  const d = index ? ctx.duration.get(index)?.Duration : null;
  return d && d > 0 ? d : null;
}

const round = (x, digits = 2) => Math.round(x * 10 ** digits) / 10 ** digits;

/** A number as a tooltip shows it: integers plain, else up to two decimals. */
export function formatNumber(x) {
  return String(round(x));
}

/** Duration text: "15 sec", "1 min", "1.5 min", "2 hrs". */
export function formatDuration(ms) {
  const s = ms / 1000;
  if (s < 60) return `${formatNumber(s)} sec`;
  if (s < 3600) return `${formatNumber(s / 60)} min`;
  const h = s / 3600;
  return `${formatNumber(h)} ${h === 1 ? "hour" : "hrs"}`;
}

/** Cooldown text as item tooltips print it: "2 Min", "1 Min 15 Sec", "30 Sec", "1 Hour". */
export function formatCooldown(ms) {
  let s = Math.round(ms / 1000);
  const parts = [];
  const h = Math.floor(s / 3600);
  if (h) parts.push(`${h} Hour${h === 1 ? "" : "s"}`);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (m) parts.push(`${m} Min`);
  s -= m * 60;
  if (s) parts.push(`${s} Sec`);
  return parts.join(" ") || "0 Sec";
}

/**
 * The numeric value of a variable of a spell: `{ min, max }` (signed), or null when the client
 * has no value for it. `letter` is the variable letter as written (case matters only for M).
 */
function variableValue(ctx, spellId, letter, index) {
  const e = ctx.effects.get(spellId)?.get(index - 1);
  const one = (v) => (v === null || v === undefined ? null : { min: v, max: v });
  switch (letter) {
    case "s":
    case "S":
    case "m":
    case "M": {
      const r = effectRange(e);
      if (!r) return null;
      if (letter === "m") return one(r.min);
      if (letter === "M") return one(r.max);
      return r;
    }
    case "o":
    case "O": {
      const r = effectRange(e);
      const duration = spellDurationMs(ctx, spellId);
      if (!r || !duration) return null;
      const ticks = e.EffectAuraPeriod > 0 ? Math.floor(duration / e.EffectAuraPeriod) : 1;
      return { min: r.min * ticks, max: r.max * ticks };
    }
    case "t":
    case "T":
      return e?.EffectAuraPeriod > 0 ? one(e.EffectAuraPeriod / 1000) : null;
    case "a":
    case "A": {
      const index2 = e?.EffectRadiusIndex?.find?.((x) => x > 0);
      return index2 ? one(ctx.radius.get(index2)?.Radius ?? null) : null;
    }
    case "x":
    case "X":
      return e ? one(e.EffectChainTargets) : null;
    case "q":
    case "Q":
      return e ? one(e.EffectMiscValue?.[0] ?? null) : null;
    case "e":
    case "E":
      return e ? one(e.EffectAmplitude) : null;
    case "b":
    case "B":
      return e ? one(e.EffectPointsPerResource) : null;
    case "h":
    case "H":
      return one(ctx.auraOptions.get(spellId)?.ProcChance ?? null);
    case "n":
    case "N":
      return one(ctx.auraOptions.get(spellId)?.ProcCharges ?? null);
    case "u":
    case "U":
      return one(ctx.auraOptions.get(spellId)?.CumulativeAura ?? null);
    case "i":
    case "I":
      return one(ctx.targets.get(spellId)?.MaxTargets ?? null);
    case "r":
    case "R": {
      const index2 = ctx.misc.get(spellId)?.RangeIndex;
      return one(index2 ? (ctx.range.get(index2)?.RangeMax?.[0] ?? null) : null);
    }
    case "proccooldown": {
      const ms = ctx.auraOptions.get(spellId)?.ProcCategoryRecovery;
      return ms > 0 ? one(ms / 1000) : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** `$<spell id?><variable><index?>`, e.g. $s1, $17669s1, $d, $21970d1, $proccooldown. */
const TOKEN = /^\$(\d*)(proccooldown|[sSmMoOtTdDaAhHnNxXuUeEqQbBiIrR])([1-3]?)/;
/** `$/1000;s1`, `$*2;17669s1`: a scale, then the token without its `$`. */
const SCALE = /^\$([/*])(-?\d+(?:\.\d+)?);(\d*)(proccooldown|[sSmMoOtTdDaAhHnNxXuUeEqQbBiIrR])([1-3]?)/;

/**
 * Render a spell's description. Returns { text, unrendered } where `unrendered` lists every
 * token that couldn't be resolved (empty when the text is complete). `field` picks the column
 * (Description_lang or AuraDescription_lang).
 */
export function renderSpellText(ctx, spellId, { field = "Description_lang", depth = 0 } = {}) {
  const raw = ctx.spell.get(spellId)?.[field] ?? "";
  const unrendered = [];
  const state = { lastNumber: null };
  const text = renderString(ctx, spellId, raw, unrendered, state, depth);
  return { text: cleanText(text), unrendered };
}

function cleanText(s) {
  return s
    .replace(/\|c[0-9a-fA-F]{8}/g, "")
    .replace(/\|r/g, "")
    .replace(/\|n/g, " ")
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function renderString(ctx, spellId, raw, unrendered, state, depth) {
  let out = "";
  let i = 0;
  const emit = (value, decimals = null) => {
    if (value === null) return;
    const lo = Math.abs(value.min);
    const hi = Math.abs(value.max);
    const f = (x) => (decimals === null ? formatNumber(x) : x.toFixed(decimals));
    state.lastNumber = hi;
    out += round(lo) === round(hi) ? f(lo) : `${f(Math.min(lo, hi))} to ${f(Math.max(lo, hi))}`;
  };
  while (i < raw.length) {
    const ch = raw[i];
    if (ch !== "$") {
      out += ch;
      i++;
      continue;
    }
    const rest = raw.slice(i);
    // ${expression}.N
    if (rest.startsWith("${")) {
      const end = matchingBrace(raw, i + 1);
      if (end < 0) {
        unrendered.push(rest.slice(0, 12));
        out += rest;
        break;
      }
      const expr = raw.slice(i + 2, end);
      let j = end + 1;
      let decimals = null;
      const dm = /^\.(\d)/.exec(raw.slice(j));
      if (dm) {
        decimals = Number(dm[1]);
        j += dm[0].length;
      }
      const v = evaluate(ctx, spellId, expr, depth);
      if (v === null || !Number.isFinite(v)) unrendered.push(`\${${expr}}`);
      else {
        state.lastNumber = Math.abs(v);
        out += decimals === null ? formatNumber(Math.abs(v)) : Math.abs(v).toFixed(decimals);
      }
      i = j;
      continue;
    }
    // $@spelldesc123, $@spellname123, $@auradesc123
    const at = /^\$@(spelldesc|spellname|auradesc)(\d+)/.exec(rest);
    if (at) {
      const id = Number(at[2]);
      if (depth > 3 || (!ctx.spell.has(id) && at[1] !== "spellname")) unrendered.push(at[0]);
      else if (at[1] === "spellname") {
        const name = ctx.spellName.get(id)?.Name_lang;
        if (name) out += name;
        else unrendered.push(at[0]);
      } else {
        const inner = renderSpellText(ctx, id, { field: at[1] === "auradesc" ? "AuraDescription_lang" : "Description_lang", depth: depth + 1 });
        unrendered.push(...inner.unrendered);
        out += inner.text;
      }
      i += at[0].length;
      continue;
    }
    // $gmale:female; and $lsingular:plural;
    const choice = /^\$([gGlL])([^:;]*):([^;]*);/.exec(rest);
    if (choice) {
      const lower = choice[1].toLowerCase();
      out += lower === "g" ? choice[2] : state.lastNumber === 1 ? choice[2] : choice[3];
      i += choice[0].length;
      continue;
    }
    // $<variable>
    const named = /^\$<([A-Za-z_][A-Za-z0-9_]*)>/.exec(rest);
    if (named) {
      const v = variable(ctx, spellId, named[1], depth);
      if (v === null || !Number.isFinite(v)) unrendered.push(named[0]);
      else {
        state.lastNumber = Math.abs(v);
        out += formatNumber(Math.abs(v));
      }
      i += named[0].length;
      continue;
    }
    // $/1000;s1, $*2;17669s1
    const scale = SCALE.exec(rest);
    if (scale) {
      const v = tokenValue(ctx, spellId, [null, scale[3], scale[4], scale[5]]);
      const k = Number(scale[2]);
      if (v === null || typeof v === "string" || k === 0) unrendered.push(scale[0]);
      else emit(scale[1] === "/" ? { min: v.min / k, max: v.max / k } : { min: v.min * k, max: v.max * k });
      i += scale[0].length;
      continue;
    }
    const tok = TOKEN.exec(rest);
    if (tok) {
      const v = tokenValue(ctx, spellId, tok);
      if (v === null) unrendered.push(tok[0]);
      else if (typeof v === "string") out += v;
      else emit(v);
      i += tok[0].length;
      continue;
    }
    // Anything else ($?s123[...][...], $z, unknown letters) can't be rendered here.
    const unknown = /^\$(\?[^\s[]*|[A-Za-z]+\d*)?/.exec(rest)[0] || "$";
    unrendered.push(unknown);
    out += unknown;
    i += unknown.length;
  }
  return out;
}

/** A $-token's value: { min, max }, a string (durations), or null. */
function tokenValue(ctx, spellId, tok) {
  const id = tok[1] ? Number(tok[1]) : spellId;
  const letter = tok[2];
  const index = tok[3] ? Number(tok[3]) : 1;
  if (letter === "d" || letter === "D") {
    const ms = spellDurationMs(ctx, id);
    return ms === null ? null : formatDuration(ms);
  }
  return variableValue(ctx, id, letter, index);
}

function matchingBrace(s, open) {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === "{") depth++;
    else if (s[k] === "}" && --depth === 0) return k;
  }
  return -1;
}

/** A SpellDescriptionVariables variable, evaluated (numbers only). */
function variable(ctx, spellId, name, depth) {
  const expr = ctx.descVars.get(spellId)?.get(name);
  if (expr === undefined || depth > 6) return null;
  // A variable is either ${…} or a bare expression.
  const inner = /^\$\{([\s\S]*)\}$/.exec(expr.trim());
  return evaluate(ctx, spellId, inner ? inner[1] : expr, depth + 1);
}

// ---------------------------------------------------------------------------
// Expressions: ${ … }
// ---------------------------------------------------------------------------

const FUNCTIONS = {
  max: (a, b) => Math.max(a, b),
  min: (a, b) => Math.min(a, b),
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  abs: (a) => Math.abs(a),
  round: (a) => Math.round(a),
  cond: (c, a, b) => (c ? a : b),
  gt: (a, b) => (a > b ? 1 : 0),
  lt: (a, b) => (a < b ? 1 : 0),
  gte: (a, b) => (a >= b ? 1 : 0),
  lte: (a, b) => (a <= b ? 1 : 0),
};

/**
 * Evaluate a `${…}` expression. Tokens are signed (so `${$m1/-1000}` turns a negative value
 * positive); a range contributes its minimum. Returns null when any part can't be resolved.
 */
export function evaluate(ctx, spellId, expr, depth = 0) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const rest = expr.slice(i);
    const ws = /^\s+/.exec(rest);
    if (ws) {
      i += ws[0].length;
      continue;
    }
    const num = /^\d+(?:\.\d+)?|^\.\d+/.exec(rest);
    if (num) {
      tokens.push({ type: "num", value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    if ("+-*/(),".includes(rest[0])) {
      tokens.push({ type: "op", value: rest[0] });
      i++;
      continue;
    }
    const fn = /^\$(max|min|floor|ceil|abs|round|cond|gt|lt|gte|lte)\s*\(/.exec(rest);
    if (fn) {
      tokens.push({ type: "fn", value: fn[1] });
      i += fn[0].length - 1; // leave "(" for the parser
      continue;
    }
    const pl = /^\$(PL|pl)\b/.exec(rest);
    if (pl) {
      tokens.push({ type: "num", value: PLAYER_LEVEL });
      i += pl[0].length;
      continue;
    }
    const named = /^\$<([A-Za-z_][A-Za-z0-9_]*)>/.exec(rest);
    if (named) {
      const v = variable(ctx, spellId, named[1], depth);
      if (v === null) return null;
      tokens.push({ type: "num", value: v });
      i += named[0].length;
      continue;
    }
    const tok = TOKEN.exec(rest);
    if (tok && tok[2] !== "d" && tok[2] !== "D") {
      const v = tokenValue(ctx, spellId, tok);
      if (v === null || typeof v === "string") return null;
      tokens.push({ type: "num", value: v.min });
      i += tok[0].length;
      continue;
    }
    if (tok) {
      // $d inside an expression: the duration in seconds.
      const ms = spellDurationMs(ctx, tok[1] ? Number(tok[1]) : spellId);
      if (ms === null) return null;
      tokens.push({ type: "num", value: ms / 1000 });
      i += tok[0].length;
      continue;
    }
    return null;
  }
  let p = 0;
  const peek = () => tokens[p];
  const take = () => tokens[p++];
  const isOp = (v) => peek()?.type === "op" && peek().value === v;
  function expression() {
    let v = term();
    while (v !== null && (isOp("+") || isOp("-"))) {
      const op = take().value;
      const r = term();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function term() {
    let v = unary();
    while (v !== null && (isOp("*") || isOp("/"))) {
      const op = take().value;
      const r = unary();
      if (r === null) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function unary() {
    if (isOp("-")) {
      take();
      const v = unary();
      return v === null ? null : -v;
    }
    if (isOp("+")) {
      take();
      return unary();
    }
    return primary();
  }
  function primary() {
    const t = take();
    if (!t) return null;
    if (t.type === "num") return t.value;
    if (t.type === "op" && t.value === "(") {
      const v = expression();
      if (!isOp(")")) return null;
      take();
      return v;
    }
    if (t.type === "fn") {
      if (!isOp("(")) return null;
      take();
      const args = [];
      if (!isOp(")")) {
        for (;;) {
          const a = expression();
          if (a === null) return null;
          args.push(a);
          if (isOp(",")) {
            take();
            continue;
          }
          break;
        }
      }
      if (!isOp(")")) return null;
      take();
      return FUNCTIONS[t.value](...args);
    }
    return null;
  }
  const v = expression();
  return p === tokens.length ? v : null;
}
