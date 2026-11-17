// Vim's modal editing over a string and a cursor. No DOM: client/web.ts feeds it the keys
// and the textarea's text, and writes the result back.

export type Mode = "insert" | "normal" | "visual" | "visual-line";

interface Snapshot {
  text: string;
  /** Where the change that follows this text starts, as far as the cursor tells. */
  cursor: number;
}

/** A message of an agent thread: where its text starts and ends, and whether the user wrote it. */
export interface Message {
  start: number;
  end: number;
  own: boolean;
}

export interface Vim {
  mode: Mode;
  text: string;
  /** In insert mode the caret, between characters. Otherwise the character under the block. */
  cursor: number;
  /** The other end of a visual selection. */
  anchor: number;
  /** The keys of a command that is not complete yet: a count, an operator, `g`, `f`. */
  pending: string[];
  /** The column `j` and `k` aim for while they follow one another. */
  column: number | null;
  register: { text: string; linewise: boolean };
  /** The last `f`, `F`, `t` or `T`, for `;` and `,`. */
  find: { kind: string; char: string } | null;
  /** The last change, for `.`: its keys, and the text typed when it ended in insert mode. */
  dot: { keys: string[]; typed: string } | null;
  undo: Snapshot[];
  redo: Snapshot[];
  /** This stay in insert mode has its undo snapshot. */
  open: boolean;
  /** Where the command that entered insert mode left the text, to tell what was typed. */
  base: Snapshot | null;
  replaying: boolean;
  /** Set by a command that changes the text, so `.` can repeat it. */
  changed: boolean;
  /** The text is not the user's to change: the agent thread. Yanks, motions and searches work. */
  readonly: boolean;
  /** The pattern being typed after `/` or `?`, until Enter. */
  prompt: { forward: boolean; pattern: string } | null;
  /** The last search, for `n` and `N`. */
  searched: { pattern: string; forward: boolean } | null;
  /** The matches of the last search are shown, until Escape. */
  highlight: boolean;
  /** What the last key has to say: a search that wrapped or found nothing. */
  message: string | null;
  /** The last key searched, or moved to a message, and found none on that side of the cursor. */
  missed: "above" | "below" | null;
  /** The messages of the text, in order, when it is an agent thread: `{ }` and `[[ ]]` move between them, `im` and `am` take them. */
  messages: Message[] | null;
}

export function create(text = "", cursor = text.length): Vim {
  return {
    mode: "insert",
    text,
    cursor,
    anchor: cursor,
    pending: [],
    column: null,
    register: { text: "", linewise: false },
    find: null,
    dot: null,
    undo: [],
    redo: [],
    open: false,
    base: null,
    replaying: false,
    changed: false,
    readonly: false,
    prompt: null,
    searched: null,
    highlight: false,
    message: null,
    missed: null,
    messages: null,
  };
}

const UNDO_CAP = 200;
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead", "Process", "Unidentified"]);
const MORE = Symbol("more");
type More = typeof MORE;

// Lines. A line's end is the index of its "\n", or the text's length.
const lineStart = (t: string, p: number) => (p <= 0 ? 0 : t.lastIndexOf("\n", p - 1) + 1);
const lineEnd = (t: string, p: number) => {
  const i = t.indexOf("\n", p);
  return i < 0 ? t.length : i;
};
/** The last place the block can sit on a line: its last character, or the start of an empty line. */
const lastColumn = (t: string, p: number) => Math.max(lineStart(t, p), lineEnd(t, p) - 1);
const firstNonBlank = (t: string, p: number) => {
  let i = lineStart(t, p);
  const end = lineEnd(t, p);
  while (i < end && (t[i] === " " || t[i] === "\t")) i++;
  return i;
};
/** Start of the 1-based line `n`, or of the last line when the text has fewer. */
const lineNumbered = (t: string, n: number) => {
  let start = 0;
  for (let line = 1; line < n; line++) {
    const end = lineEnd(t, start);
    if (end >= t.length) break;
    start = end + 1;
  }
  return start;
};
const clamp = (t: string, p: number) => {
  const q = Math.min(Math.max(p, 0), t.length);
  return Math.min(Math.max(q, lineStart(t, q)), lastColumn(t, q));
};
/** Code units of the character at `p`: 0 at a line's end, 2 for a surrogate pair. */
const width = (t: string, p: number) => {
  if (p >= t.length || t[p] === "\n") return 0;
  const code = t.charCodeAt(p);
  return code >= 0xd800 && code <= 0xdbff && p + 1 < t.length ? 2 : 1;
};

// Words. 0 is blank, 1 a word character, 2 punctuation. A WORD (`W`) has no punctuation class.
const WORD = /[\p{L}\p{N}_]/u;
const kind = (c: string | undefined, big: boolean) => {
  if (c === undefined || /\s/.test(c)) return 0;
  return big || WORD.test(c) ? 1 : 2;
};
const emptyLine = (t: string, p: number) =>
  (p === t.length || t[p] === "\n") && (p === 0 || t[p - 1] === "\n");

function wordForward(t: string, p: number, big: boolean): number {
  const n = t.length;
  let i = p;
  const k = kind(t[i], big);
  if (k !== 0) while (i < n && kind(t[i], big) === k) i++;
  while (i < n && kind(t[i], big) === 0) {
    i++;
    if (emptyLine(t, i)) break;
  }
  return i;
}

function wordBack(t: string, p: number, big: boolean): number {
  let i = p;
  while (i > 0 && kind(t[i - 1], big) === 0) {
    i--;
    if (emptyLine(t, i)) return i;
  }
  if (i === 0) return 0;
  const k = kind(t[i - 1], big);
  while (i > 0 && kind(t[i - 1], big) === k) i--;
  return i;
}

function wordEnd(t: string, p: number, big: boolean): number {
  const n = t.length;
  let i = p + 1;
  while (i < n && kind(t[i], big) === 0) i++;
  if (i >= n) return Math.max(0, n - 1);
  const k = kind(t[i], big);
  while (i + 1 < n && kind(t[i + 1], big) === k) i++;
  return i;
}

/** The next empty line in direction `dir`, or the end of the text. */
function paragraph(t: string, p: number, dir: 1 | -1): number {
  const inside = (i: number) => (dir === 1 ? i < t.length : i > 0);
  let i = p;
  while (inside(i) && emptyLine(t, i)) i += dir;
  while (inside(i) && !emptyLine(t, i)) i += dir;
  return i;
}

const OPEN = "([{";
const CLOSE = ")]}";

function matchPair(t: string, p: number): number | null {
  const end = lineEnd(t, p);
  let i = p;
  while (i < end && !OPEN.includes(t[i]) && !CLOSE.includes(t[i])) i++;
  if (i >= end) return null;
  const forward = OPEN.includes(t[i]);
  const other = forward ? CLOSE[OPEN.indexOf(t[i])] : OPEN[CLOSE.indexOf(t[i])];
  let depth = 0;
  for (let j = i; j >= 0 && j < t.length; j += forward ? 1 : -1) {
    if (t[j] === t[i]) depth++;
    else if (t[j] === other && --depth === 0) return j;
  }
  return null;
}

function findChar(t: string, p: number, how: string, char: string, count: number, again: boolean): number | null {
  const start = lineStart(t, p);
  const end = lineEnd(t, p);
  const forward = how === "f" || how === "t";
  // A repeated `t` would find the character it already stands before.
  let i = p + (again && how === "t" ? 1 : again && how === "T" ? -1 : 0);
  for (let k = 0; k < count; k++) {
    i = forward ? t.indexOf(char, i + 1) : i > 0 ? t.lastIndexOf(char, i - 1) : -1;
    if (i < start || i >= end) return null;
  }
  return how === "t" ? i - 1 : how === "T" ? i + 1 : i;
}

type Range = { start: number; end: number; linewise?: boolean };

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A Vim pattern as a JavaScript one. Vim's default is "magic": `( ) | + ? {` stand for
 * themselves until a backslash precedes them, and `\v` turns that around for the rest.
 * `\<` and `\>` are the ends of a word.
 * `ignorecase` with `smartcase`: a capital letter makes the search match case, and `\c` or
 * `\C` decide it outright. A pattern JavaScript rejects is searched as plain text.
 */
export function regexp(source: string): RegExp {
  let body = "";
  let very = false;
  let braces = 0;
  let fold = !/\p{Lu}/u.test(source.replace(/\\./g, ""));
  for (let i = 0; i < source.length; i++) {
    const escaped = source[i] === "\\" && i + 1 < source.length;
    const c = escaped ? source[++i] : source[i];
    // Magic: an operator needs its backslash. Very magic: a backslash takes its meaning away.
    const active = escaped !== very || (c === "}" && braces > 0);
    if (escaped && c === "v") very = true;
    else if (escaped && (c === "c" || c === "C")) fold = c === "c";
    else if (c === "<" || c === ">") body += active ? "\\b" : c;
    else if (c === "=") body += active ? "?" : c;
    else if ("(){}|+?".includes(c)) {
      if (active) braces += c === "{" ? 1 : c === "}" ? -1 : 0;
      body += active ? c : `\\${c}`;
    } else body += escaped || c === "\\" ? `\\${c}` : c;
  }
  const flags = fold ? "gim" : "gm";
  try {
    return new RegExp(body, flags);
  } catch {
    return new RegExp(literal(source), flags);
  }
}

type Match = { start: number; end: number };
const MATCH_CAP = 5000;
let found: { text: string; source: string; matches: Match[] } | null = null;

/** Where a pattern matches, in order. Empty matches do not count. */
function matchesOf(text: string, source: string): Match[] {
  if (found?.text === text && found.source === source) return found.matches;
  const matches: Match[] = [];
  const pattern = regexp(source);
  for (let m = pattern.exec(text); m && matches.length < MATCH_CAP; m = pattern.exec(text)) {
    if (m[0].length === 0) pattern.lastIndex++;
    else matches.push({ start: m.index, end: m.index + m[0].length });
  }
  found = { text, source, matches };
  return matches;
}

/** The `count`th match after `from`, or before it, around the ends of the text. */
function seek(text: string, source: string, from: number, forward: boolean, count: number): (Match & { wrapped: boolean }) | null {
  const matches = matchesOf(text, source);
  if (matches.length === 0) return null;
  // The first match in the direction of travel.
  let first = forward ? matches.findIndex((m) => m.start > from) : -1;
  if (!forward) for (let k = matches.length - 1; k >= 0 && first < 0; k--) if (matches[k].start < from) first = k;
  const step = forward ? count - 1 : 1 - count;
  const index = (first < 0 ? (forward ? 0 : matches.length - 1) : first) + step;
  const wrapped = first < 0 || index < 0 || index >= matches.length;
  return { ...matches[((index % matches.length) + matches.length) % matches.length], wrapped };
}

/** The matches to highlight: those of the pattern being typed, or of the last search. */
export function matches(vim: Vim): Match[] {
  const source = vim.prompt ? vim.prompt.pattern : vim.highlight ? vim.searched?.pattern : undefined;
  return source ? matchesOf(vim.text, source) : [];
}

/** Where Enter would take the pattern being typed, for `incsearch`. */
export function peek(vim: Vim): Match | null {
  if (!vim.prompt?.pattern) return null;
  return seek(vim.text, vim.prompt.pattern, vim.cursor, vim.prompt.forward, 1);
}

export const notFound = (source: string) => `Pattern not found: ${source}`;

/** Moves to a match of the last search and says so when the search wrapped or failed. */
function search(vim: Vim, forward: boolean, count: number, from = vim.cursor): Motion | null {
  const source = vim.searched?.pattern;
  if (!source) return null;
  vim.highlight = true;
  const match = seek(vim.text, source, from, forward, count);
  if (!match || match.wrapped) vim.missed = forward ? "below" : "above";
  if (!match) vim.message = notFound(source);
  else if (match.wrapped) vim.message = forward ? "hit BOTTOM, continuing at TOP" : "hit TOP, continuing at BOTTOM";
  return match && { to: match.start };
}

/** Moves to the start of the `count`th message after the cursor or before it, or of the last one there is. `own`: the user's only. */
function toMessage(vim: Vim, forward: boolean, count: number, own: boolean): Motion | null {
  const starts = (vim.messages ?? []).filter((m) => m.own || !own).map((m) => m.start);
  const side = forward ? starts.filter((s) => s > vim.cursor) : starts.filter((s) => s < vim.cursor).reverse();
  if (side.length === 0) vim.missed = forward ? "below" : "above";
  return side.length === 0 ? null : { to: side[Math.min(count, side.length) - 1] };
}

function wordObject(t: string, p: number, around: boolean, big: boolean): Range | null {
  const s = lineStart(t, p);
  const e = lineEnd(t, p);
  if (p >= e) return null;
  const k = kind(t[p], big);
  let a = p;
  let b = p + 1;
  while (a > s && kind(t[a - 1], big) === k) a--;
  while (b < e && kind(t[b], big) === k) b++;
  if (around && k === 0) {
    const next = kind(t[b], big);
    while (b < e && kind(t[b], big) === next) b++;
  } else if (around) {
    const word = b;
    while (b < e && kind(t[b], big) === 0) b++;
    if (b === word) while (a > s && kind(t[a - 1], big) === 0) a--;
  }
  return { start: a, end: b };
}

function quoteObject(t: string, p: number, quote: string, around: boolean): Range | null {
  const s = lineStart(t, p);
  const e = lineEnd(t, p);
  const at: number[] = [];
  for (let i = s; i < e; i++) if (t[i] === quote && t[i - 1] !== "\\") at.push(i);
  // Quotes pair up from the start of the line. An apostrophe before the cursor breaks that,
  // so the quotes on either side of the cursor are the second guess.
  let pair: [number, number] | null = null;
  for (let k = 0; k + 1 < at.length && !pair; k += 2) if (p <= at[k + 1]) pair = [at[k], at[k + 1]];
  const before = at.filter((i) => i < p).pop();
  const after = at.find((i) => i > p);
  if (!pair && before !== undefined && after !== undefined) pair = [before, after];
  if (!pair) return null;
  if (!around) return { start: pair[0] + 1, end: pair[1] };
  let b = pair[1] + 1;
  while (b < e && t[b] === " ") b++;
  return { start: pair[0], end: b };
}

function bracketObject(t: string, p: number, open: string, close: string, around: boolean): Range | null {
  let depth = 0;
  let a = -1;
  for (let i = p; i >= 0; i--) {
    if (t[i] === close && i !== p) depth++;
    else if (t[i] === open && depth-- === 0) {
      a = i;
      break;
    }
  }
  if (a < 0) return null;
  depth = 0;
  for (let i = a; i < t.length; i++) {
    if (t[i] === open) depth++;
    else if (t[i] === close && --depth === 0) return around ? { start: a, end: i + 1 } : { start: a + 1, end: i };
  }
  return null;
}

function paragraphObject(t: string, p: number, around: boolean): Range {
  const blank = emptyLine(t, lineStart(t, p));
  const same = (q: number) => emptyLine(t, lineStart(t, q)) === blank;
  let a = lineStart(t, p);
  let b = lineEnd(t, p);
  while (a > 0 && same(a - 1)) a = lineStart(t, a - 1);
  while (b < t.length && same(b + 1)) b = lineEnd(t, b + 1);
  if (around && !blank) while (b < t.length && emptyLine(t, b + 1)) b = lineEnd(t, b + 1);
  return { start: a, end: b + 1, linewise: true };
}

/** `im`: the message under the cursor. `am`: its turn, from the user's message to the one before their next. */
function messageObject(t: string, p: number, around: boolean, messages: Message[]): Range | null {
  const inner = messages.find((m) => p >= m.start && p < m.end);
  if (!around) return inner ? { start: inner.start, end: inner.end, linewise: true } : null;
  const own = messages.filter((m) => m.own);
  const start = own.filter((m) => m.start <= p).pop()?.start ?? 0;
  let end = own.find((m) => m.start > p)?.start ?? t.length;
  while (end > start && t[end - 1] === "\n") end--;
  return { start, end, linewise: true };
}

const BRACKETS: Record<string, [string, string]> = {
  "(": ["(", ")"],
  ")": ["(", ")"],
  b: ["(", ")"],
  "[": ["[", "]"],
  "]": ["[", "]"],
  "{": ["{", "}"],
  "}": ["{", "}"],
  B: ["{", "}"],
  "<": ["<", ">"],
  ">": ["<", ">"],
};

function textObject(t: string, p: number, around: boolean, key: string, messages: Message[] | null): Range | null {
  if (key === "m") return messages && messageObject(t, p, around, messages);
  if (key === "w" || key === "W") return wordObject(t, p, around, key === "W");
  if (key === '"' || key === "'" || key === "`") return quoteObject(t, p, key, around);
  if (key === "p") return paragraphObject(t, p, around);
  const pair = BRACKETS[key];
  return pair ? bracketObject(t, p, pair[0], pair[1], around) : null;
}

// vim-surround. An opening bracket puts a space inside; a closing one, or its letter, does not.
const SURROUND: Record<string, [string, string]> = {
  "(": ["( ", " )"],
  ")": ["(", ")"],
  b: ["(", ")"],
  "[": ["[ ", " ]"],
  "]": ["[", "]"],
  r: ["[", "]"],
  "{": ["{ ", " }"],
  "}": ["{", "}"],
  B: ["{", "}"],
  "<": ["<", ">"],
  ">": ["<", ">"],
  a: ["<", ">"],
};
const PLAIN = /^[^\p{L}\p{N}\s]$/u;
/** What `char` puts around a text: a bracket pair, or any other punctuation mark twice. */
const surroundWith = (char: string): [string, string] | null => SURROUND[char] ?? (PLAIN.test(char) ? [char, char] : null);

/** The delimiters around the cursor that `char` names: where the opening and the closing one are. */
function surrounding(t: string, p: number, char: string): [number, number] | null {
  const pair = SURROUND[char];
  if (pair) {
    const found = bracketObject(t, p, pair[0][0], pair[1].slice(-1), true);
    return found && [found.start, found.end - 1];
  }
  const found = PLAIN.test(char) ? quoteObject(t, p, char, false) : null;
  return found && [found.start - 1, found.end];
}

/** `ds` with no `by`, `cs` with one. */
function resurround(vim: Vim, char: string, by: string | null): void {
  const at = surrounding(vim.text, vim.cursor, char);
  const pair = by === null ? ["", ""] : surroundWith(by);
  if (!at || !pair) return;
  checkpoint(vim);
  const t = vim.text;
  const inner = t.slice(at[0] + 1, at[1]);
  vim.text = t.slice(0, at[0]) + pair[0] + ("([{".includes(char) ? inner.trim() : inner) + pair[1] + t.slice(at[1] + 1);
  vim.cursor = clamp(vim.text, at[0]);
}

/** `ys` and visual `S`: puts `char` around a range. Blanks at its end stay outside. */
function surround(vim: Vim, range: Range, char: string): void {
  const pair = surroundWith(char);
  const t = vim.text;
  const start = range.linewise ? lineStart(t, range.start) : range.start;
  let end = range.linewise ? lineEnd(t, Math.max(start, range.end - 1)) : range.end;
  if (!range.linewise) while (end > start && /\s/.test(t[end - 1])) end--;
  if (!pair || start === end) return;
  checkpoint(vim);
  const [open, close] = range.linewise ? [`${pair[0].trim()}\n`, `\n${pair[1].trim()}`] : pair;
  vim.text = t.slice(0, start) + open + t.slice(start, end) + close + t.slice(end);
  vim.cursor = clamp(vim.text, start);
}

interface Motion {
  to: number;
  linewise?: boolean;
  /** The character at `to` belongs to what an operator acts on. */
  inclusive?: boolean;
  column?: number;
}

/** `undefined` when `key` starts no motion, `null` when the motion has nowhere to go. */
function motion(
  vim: Vim,
  key: string,
  next: () => string | undefined,
  count: number,
  counted: boolean,
  operator: string | null,
): Motion | null | undefined | More {
  const t = vim.text;
  const p = vim.cursor;
  switch (key) {
    case "h":
    case "Backspace":
      return { to: Math.max(lineStart(t, p), p - count) };
    case "l":
      return { to: Math.min(lineEnd(t, p), p + count) };
    case "j":
    case "k": {
      const column = vim.column ?? p - lineStart(t, p);
      let line = lineStart(t, p);
      for (let k = 0; k < count; k++) {
        const end = lineEnd(t, line);
        if (key === "j" && end < t.length) line = end + 1;
        else if (key === "k" && line > 0) line = lineStart(t, line - 1);
        else if (k === 0) return null;
      }
      return { to: Math.min(line + column, lastColumn(t, line)), linewise: true, column };
    }
    case "w":
    case "W": {
      const big = key === "W";
      // `cw` on a word changes to the word's end and keeps the blanks after it.
      if (operator === "c" && kind(t[p], big) !== 0) {
        let q = p - 1;
        for (let k = 0; k < count; k++) q = wordEnd(t, q, big);
        return { to: q, inclusive: true };
      }
      let q = p;
      for (let k = 0; k < count; k++) q = wordForward(t, q, big);
      if (operator) {
        // An operator stops at the end of the line the last word is on.
        let r = q;
        while (r > p && (t[r - 1] === " " || t[r - 1] === "\t")) r--;
        if (r - 1 > p && t[r - 1] === "\n") q = r - 1;
      }
      return { to: q };
    }
    case "b":
    case "B": {
      let q = p;
      for (let k = 0; k < count; k++) q = wordBack(t, q, key === "B");
      return { to: q };
    }
    case "e":
    case "E": {
      let q = p;
      for (let k = 0; k < count; k++) q = wordEnd(t, q, key === "E");
      return { to: q, inclusive: true };
    }
    case "0":
      return { to: lineStart(t, p) };
    case "^":
      return { to: firstNonBlank(t, p) };
    case "$": {
      let line = p;
      for (let k = 1; k < count && lineEnd(t, line) < t.length; k++) line = lineEnd(t, line) + 1;
      return { to: lastColumn(t, line), inclusive: true, column: Number.MAX_SAFE_INTEGER };
    }
    case "g": {
      const second = next();
      if (second === undefined) return MORE;
      if (second !== "g") return null;
      return { to: firstNonBlank(t, lineNumbered(t, counted ? count : 1)), linewise: true };
    }
    case "G":
      return { to: firstNonBlank(t, counted ? lineNumbered(t, count) : t.length), linewise: true };
    case "f":
    case "F":
    case "t":
    case "T": {
      const char = next();
      if (char === undefined) return MORE;
      if (char.length !== 1) return null;
      vim.find = { kind: key, char };
      const q = findChar(t, p, key, char, count, false);
      return q === null ? null : { to: q, inclusive: key === "f" || key === "t" };
    }
    case ";":
    case ",": {
      if (!vim.find) return null;
      const flipped = { f: "F", F: "f", t: "T", T: "t" }[vim.find.kind] as string;
      const how = key === ";" ? vim.find.kind : flipped;
      const q = findChar(t, p, how, vim.find.char, count, true);
      return q === null ? null : { to: q, inclusive: how === "f" || how === "t" };
    }
    case "%": {
      const q = matchPair(t, p);
      return q === null ? null : { to: q, inclusive: true };
    }
    case "/":
    case "?": {
      let typed = "";
      for (let k = next(); k !== "Enter"; k = next()) {
        if (k === undefined) {
          vim.prompt = { forward: key === "/", pattern: typed };
          return MORE;
        }
        typed += k;
      }
      // Enter on an empty pattern repeats the last one.
      if (typed) vim.searched = { pattern: typed, forward: key === "/" };
      else if (vim.searched) vim.searched = { ...vim.searched, forward: key === "/" };
      return search(vim, key === "/", count);
    }
    case "n":
    case "N":
      return vim.searched ? search(vim, (key === "n") === vim.searched.forward, count) : null;
    case "*":
    case "#": {
      // The word under the cursor, or the next one on the line.
      const end = lineEnd(t, p);
      let a = p;
      while (a < end && !WORD.test(t[a])) a++;
      if (a >= end) return null;
      let b = a;
      while (a > lineStart(t, p) && WORD.test(t[a - 1])) a--;
      while (b < end && WORD.test(t[b])) b++;
      vim.searched = { pattern: `\\c\\<${literal(t.slice(a, b))}\\>`, forward: key === "*" };
      return search(vim, key === "*", count, a);
    }
    case "[":
    case "]": {
      // `[[` and `]]`, between the user's messages. A text without messages has no such key.
      if (!vim.messages) return undefined;
      const second = next();
      if (second === undefined) return MORE;
      return second === key ? toMessage(vim, key === "]", count, true) : null;
    }
    case "{":
    case "}": {
      if (vim.messages) return toMessage(vim, key === "}", count, false);
      let q = p;
      for (let k = 0; k < count; k++) q = paragraph(t, q, key === "}" ? 1 : -1);
      return { to: q };
    }
    default:
      return undefined;
  }
}

/** Saves the text for `u`. Every command that changes the text or enters insert mode calls it first. */
function checkpoint(vim: Vim): void {
  vim.undo.push({ text: vim.text, cursor: vim.cursor });
  if (vim.undo.length > UNDO_CAP) vim.undo.shift();
  vim.redo = [];
  vim.changed = true;
}

function insert(vim: Vim, cursor: number): void {
  vim.mode = "insert";
  vim.cursor = cursor;
  vim.open = true;
  vim.base = { text: vim.text, cursor };
}

function operate(vim: Vim, operator: string, range: Range): void {
  const t = vim.text;
  const { start, linewise } = range;
  // A linewise range runs from the start of its first line to the end of its last one.
  const end = linewise ? lineEnd(t, Math.max(start, range.end - 1)) : range.end;
  const s = linewise ? lineStart(t, start) : start;
  if (s === end && !linewise && operator !== "c") return;
  vim.register = { text: t.slice(s, end) + (linewise ? "\n" : ""), linewise: Boolean(linewise) };
  if (operator === "y") {
    if (!linewise) vim.cursor = s;
    else if (s < lineStart(t, vim.cursor)) vim.cursor = clamp(t, s + vim.cursor - lineStart(t, vim.cursor));
    return;
  }
  checkpoint(vim);
  if (operator === "c") {
    vim.text = t.slice(0, s) + t.slice(end);
    insert(vim, s);
    return;
  }
  if (!linewise) {
    vim.text = t.slice(0, s) + t.slice(end);
    vim.cursor = clamp(vim.text, s);
    return;
  }
  // Deleting lines takes one line break with them: the one after, or the one before the last line.
  if (end < t.length) vim.text = t.slice(0, s) + t.slice(end + 1);
  else vim.text = t.slice(0, Math.max(0, s - 1));
  vim.cursor = firstNonBlank(vim.text, Math.min(s, vim.text.length));
}

function paste(vim: Vim, before: boolean, count: number): void {
  if (!vim.register.text) return;
  checkpoint(vim);
  const t = vim.text;
  const p = vim.cursor;
  const s = vim.register.text.repeat(count);
  if (vim.register.linewise && before) {
    const at = lineStart(t, p);
    vim.text = t.slice(0, at) + s + t.slice(at);
    vim.cursor = firstNonBlank(vim.text, at);
  } else if (vim.register.linewise) {
    const at = lineEnd(t, p);
    vim.text = `${t.slice(0, at)}\n${s.slice(0, -1)}${t.slice(at)}`;
    vim.cursor = firstNonBlank(vim.text, at + 1);
  } else {
    const at = before ? p : p + width(t, p);
    vim.text = t.slice(0, at) + s + t.slice(at);
    vim.cursor = s.includes("\n") ? at : at + s.length - 1;
  }
}

function join(vim: Vim, from: number, lines: number): void {
  let at = lineEnd(vim.text, from);
  if (at >= vim.text.length) return;
  checkpoint(vim);
  for (let k = 0; k < lines && at < vim.text.length; k++) {
    const t = vim.text;
    let rest = at + 1;
    while (t[rest] === " " || t[rest] === "\t") rest++;
    const gap = rest >= t.length || t[rest] === "\n" || at === lineStart(t, at) || /\s/.test(t[at - 1]) ? "" : " ";
    vim.text = t.slice(0, at) + gap + t.slice(rest);
    vim.cursor = clamp(vim.text, at);
    at = lineEnd(vim.text, at);
  }
}

function switchCase(vim: Vim, start: number, end: number, how: "~" | "u" | "U"): void {
  if (start === end) return;
  checkpoint(vim);
  const swap = (c: string) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());
  const part = vim.text.slice(start, end);
  const next = how === "u" ? part.toLowerCase() : how === "U" ? part.toUpperCase() : [...part].map(swap).join("");
  vim.text = vim.text.slice(0, start) + next + vim.text.slice(end);
}

function restore(vim: Vim, from: Snapshot[], to: Snapshot[], count: number): void {
  for (let k = 0; k < count; k++) {
    const snapshot = from.pop();
    if (!snapshot) break;
    to.push({ text: vim.text, cursor: vim.cursor });
    // The cursor goes to where the change starts, as in Vim. Repeated text leaves several
    // places where it may start: the one nearest the snapshot's cursor is it.
    const [a, b] = [vim.text, snapshot.text];
    const short = Math.min(a.length, b.length);
    let head = 0;
    while (head < short && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < short && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
    vim.text = b;
    vim.cursor = clamp(b, Math.min(Math.max(snapshot.cursor, Math.min(short - tail, head)), head));
  }
}

/** What a visual mode has selected. */
function selected(vim: Vim): Range {
  const a = Math.min(vim.anchor, vim.cursor);
  const b = Math.max(vim.anchor, vim.cursor);
  return { start: a, end: b + width(vim.text, b), linewise: vim.mode === "visual-line" };
}

/** The range of the textarea to select so that it shows the cursor: `[start, end, backward]`. */
export function selection(vim: Vim): [number, number, boolean] {
  const t = vim.text;
  if (vim.mode === "insert") return [vim.cursor, vim.cursor, false];
  if (vim.mode === "normal") return [vim.cursor, vim.cursor + width(t, vim.cursor), false];
  const { start, end } = selected(vim);
  const backward = vim.cursor < vim.anchor;
  return vim.mode === "visual" ? [start, end, backward] : [lineStart(t, start), lineEnd(t, Math.max(start, end - 1)), backward];
}

/** Puts the cursor on `at`, for a move the textarea measured: one by wrapped lines. */
export function moveTo(vim: Vim, at: number): void {
  vim.cursor = clamp(vim.text, at);
  vim.column = null;
}

/** `key` would put the register now: `p` or `P` after nothing but a count. */
export const puts = (vim: Vim, key: string) =>
  vim.mode !== "insert" && (key === "p" || key === "P") && vim.pending.every((k) => /^[0-9]$/.test(k));

/** Takes a selection the user made with the pointer or the arrow keys. */
export function select(vim: Vim, start: number, end: number, backward: boolean): void {
  const [s, e] = selection(vim);
  if (start === s && end === e) return;
  vim.column = null;
  if (vim.mode === "insert") {
    vim.cursor = end;
    return;
  }
  vim.pending = [];
  vim.mode = start === end ? "normal" : "visual";
  vim.anchor = backward ? end - 1 : start;
  vim.cursor = start === end ? clamp(vim.text, start) : backward ? start : end - 1;
}

/** `moved` is a motion, which keeps the column `j` and `k` aim for. `pass` leaves the key to the app. */
type Outcome = "done" | "moved" | "pass" | More;

// One key for two.
const ALIAS: Record<string, string[]> = {
  x: ["d", "l"],
  Delete: ["d", "l"],
  X: ["d", "h"],
  s: ["c", "l"],
  S: ["c", "c"],
  D: ["d", "$"],
  C: ["c", "$"],
  Y: ["y", "$"],
};

function command(vim: Vim, keys: string[]): Outcome {
  let i = 0;
  const next = () => keys[i++];
  const readCount = () => {
    let digits = "";
    while (i < keys.length && /^[0-9]$/.test(keys[i]) && (digits || keys[i] !== "0")) digits += keys[i++];
    return digits ? Math.min(Number(digits), 9999) : null;
  };
  const first = readCount();
  let key = next();
  if (key === undefined) return MORE;
  const visual = vim.mode !== "normal";
  const t = vim.text;
  const p = vim.cursor;
  const count = first ?? 1;

  if (!visual && ALIAS[key]) {
    keys = [...keys.slice(0, i - 1), ...ALIAS[key], ...keys.slice(i)];
    i -= 1;
    key = next();
  }

  if (visual) {
    const range = selected(vim);
    const leave = () => {
      vim.mode = "normal";
      vim.cursor = clamp(vim.text, vim.cursor);
    };
    switch (key) {
      case "v":
      case "V": {
        const mode = key === "v" ? "visual" : "visual-line";
        if (vim.mode === mode) leave();
        else vim.mode = mode;
        return "done";
      }
      case "o":
        [vim.anchor, vim.cursor] = [vim.cursor, vim.anchor];
        return "done";
      case "S": {
        const char = next();
        if (char === undefined) return MORE;
        vim.mode = "normal";
        vim.cursor = range.start;
        surround(vim, range, char);
        return "done";
      }
      case "<S-CR>":
        return "done";
      case "i":
      case "a": {
        const object = next();
        if (object === undefined) return MORE;
        const found = textObject(t, p, key === "a", object, vim.messages);
        if (!found || found.start === found.end) return "done";
        if (found.linewise) vim.mode = "visual-line";
        vim.anchor = found.start;
        vim.cursor = Math.max(found.start, found.end - 1);
        return "done";
      }
      case "d":
      case "x":
      case "Delete":
      case "c":
      case "s":
      case "y":
        vim.mode = "normal";
        vim.cursor = range.start;
        operate(vim, key === "y" ? "y" : key === "c" || key === "s" ? "c" : "d", range);
        return "done";
      case "~":
      case "u":
      case "U": {
        const end = range.linewise ? lineEnd(t, Math.max(range.start, range.end - 1)) : range.end;
        const start = range.linewise ? lineStart(t, range.start) : range.start;
        vim.mode = "normal";
        switchCase(vim, start, end, key);
        vim.cursor = clamp(vim.text, start);
        return "done";
      }
      case "J": {
        const lines = t.slice(range.start, range.end).split("\n").length - 1;
        vim.mode = "normal";
        join(vim, range.start, Math.max(1, lines));
        return "done";
      }
      case "p":
      case "P": {
        const put = vim.register;
        if (!put.text) return "done";
        const start = range.linewise ? lineStart(t, range.start) : range.start;
        const end = range.linewise ? lineEnd(t, Math.max(range.start, range.end - 1)) : range.end;
        checkpoint(vim);
        vim.register = { text: t.slice(start, end) + (range.linewise ? "\n" : ""), linewise: Boolean(range.linewise) };
        const text = range.linewise ? put.text.replace(/\n$/, "") : put.linewise ? `\n${put.text}` : put.text;
        vim.text = t.slice(0, start) + text + t.slice(end);
        vim.mode = "normal";
        vim.cursor = clamp(vim.text, put.linewise ? start + (range.linewise ? 0 : 1) : start + text.length - 1);
        return "done";
      }
    }
    const moved = motion(vim, key, next, count, first !== null, null);
    if (moved === MORE) return MORE;
    if (moved) {
      vim.cursor = clamp(t, moved.to);
      vim.column = moved.column ?? null;
      return "moved";
    }
    return key.length === 1 || moved === null ? "done" : "pass";
  }

  if (key === "d" || key === "c" || key === "y") {
    const second = readCount();
    const target = next();
    if (target === undefined) return MORE;
    const total = count * (second ?? 1);
    if (target === "s" && second === null && key !== "y") {
      const char = next();
      const by = key === "c" ? next() : null;
      if (char === undefined || (key === "c" && by === undefined)) return MORE;
      resurround(vim, char, by);
      return "done";
    }
    if (target === "s" && second === null) {
      const inner = readCount();
      const what = next();
      if (what === undefined) return MORE;
      let range: Range | null;
      if (what === "s") range = { start: firstNonBlank(t, p), end: lineEnd(t, p) };
      else if (what === "i" || what === "a") {
        const object = next();
        if (object === undefined) return MORE;
        range = textObject(t, p, what === "a", object, vim.messages);
      } else {
        const moved = motion(vim, what, next, total * (inner ?? 1), first !== null || inner !== null, "y");
        if (moved === MORE) return MORE;
        const far = moved ? Math.max(p, moved.to) : 0;
        range = moved ? { start: Math.min(p, moved.to), end: moved.linewise ? far + 1 : far + (moved.inclusive ? width(t, far) : 0), linewise: moved.linewise } : null;
      }
      const char = next();
      if (char === undefined) return MORE;
      if (range) surround(vim, range, char);
      return "done";
    }
    if (target === key) {
      let last = p;
      for (let k = 1; k < total && lineEnd(t, last) < t.length; k++) last = lineEnd(t, last) + 1;
      operate(vim, key, { start: p, end: lineEnd(t, last) + 1, linewise: true });
      return "done";
    }
    if (target === "i" || target === "a") {
      const object = next();
      if (object === undefined) return MORE;
      const found = textObject(t, p, target === "a", object, vim.messages);
      if (found) operate(vim, key, found);
      return "done";
    }
    const moved = motion(vim, target, next, total, first !== null || second !== null, key);
    if (moved === MORE) return MORE;
    if (!moved) return moved === undefined && target.length > 1 ? "pass" : "done";
    const start = Math.min(p, moved.to);
    const far = Math.max(p, moved.to);
    operate(vim, key, { start, end: moved.linewise ? far + 1 : far + (moved.inclusive ? width(t, far) : 0), linewise: moved.linewise });
    return "done";
  }

  switch (key) {
    case "i":
    case "a":
    case "I":
    case "A": {
      checkpoint(vim);
      const at = { i: p, a: p + width(t, p), I: firstNonBlank(t, p), A: lineEnd(t, p) }[key];
      insert(vim, at);
      return "done";
    }
    case "o":
    case "O": {
      checkpoint(vim);
      const indent = t.slice(lineStart(t, p), firstNonBlank(t, p));
      const at = key === "o" ? lineEnd(t, p) : lineStart(t, p);
      vim.text = key === "o" ? `${t.slice(0, at)}\n${indent}${t.slice(at)}` : `${t.slice(0, at)}${indent}\n${t.slice(at)}`;
      insert(vim, at + indent.length + (key === "o" ? 1 : 0));
      return "done";
    }
    case "v":
    case "V":
      vim.mode = key === "v" ? "visual" : "visual-line";
      vim.anchor = p;
      return "done";
    case "<S-CR>": {
      // `O<Esc>j`: an empty line above, and the cursor back at the start of its line.
      checkpoint(vim);
      const at = lineStart(t, p);
      vim.text = `${t.slice(0, at)}\n${t.slice(at)}`;
      vim.cursor = clamp(vim.text, at + 1);
      return "done";
    }
    case "p":
    case "P":
      paste(vim, key === "P", count);
      return "done";
    case "r": {
      const char = next();
      if (char === undefined) return MORE;
      if (char.length !== 1 || p + count > lineEnd(t, p)) return "done";
      checkpoint(vim);
      vim.text = t.slice(0, p) + char.repeat(count) + t.slice(p + count);
      vim.cursor = p + count - 1;
      return "done";
    }
    case "~": {
      const end = Math.min(lineEnd(t, p), p + count);
      switchCase(vim, p, end, "~");
      vim.cursor = clamp(vim.text, end);
      return "done";
    }
    case "J":
      join(vim, p, Math.max(1, count - 1));
      return "done";
    case "u":
      restore(vim, vim.undo, vim.redo, count);
      return "done";
    case "<C-r>":
      restore(vim, vim.redo, vim.undo, count);
      return "done";
    case ".": {
      const dot = vim.dot;
      if (!dot || vim.replaying) return "done";
      vim.replaying = true;
      vim.pending = [];
      for (const k of dot.keys) press(vim, k);
      if (vim.mode === "insert") {
        vim.text = vim.text.slice(0, vim.cursor) + dot.typed + vim.text.slice(vim.cursor);
        vim.cursor += dot.typed.length;
        press(vim, "Escape");
      }
      vim.replaying = false;
      vim.changed = false;
      return "done";
    }
  }

  const moved = motion(vim, key, next, count, first !== null, null);
  if (moved === MORE) return MORE;
  if (moved) {
    vim.cursor = clamp(t, moved.to);
    vim.column = moved.column ?? null;
    return "moved";
  }
  // A character with no command does nothing. Enter, Tab and the arrows stay the app's.
  return key.length === 1 || moved === null ? "done" : "pass";
}

/** What was typed between two texts: the part of `after` that `before` lacks. */
function typed(before: string, after: string): string {
  let a = 0;
  while (a < before.length && a < after.length && before[a] === after[a]) a++;
  let b = 0;
  while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
  return after.slice(a, after.length - b);
}

/**
 * Feeds one key. Set `vim.text` and the cursor from the textarea first. Returns true when
 * Vim took the key, and false when the key is the app's to handle.
 *
 * A key is `event.key`, or `<C-r>` for Ctrl+R.
 */
export function press(vim: Vim, key: string): boolean {
  if (MODIFIERS.has(key)) return false;
  if (vim.mode === "insert") {
    if (key !== "Escape") {
      // The first key of a stay in insert mode that no command started.
      if (!vim.open) {
        checkpoint(vim);
        vim.open = true;
        vim.base = null;
      }
      // Enter sends the message, and the next one starts from an empty composer.
      if (key === "Enter") vim.open = false;
      return false;
    }
    const last = vim.undo[vim.undo.length - 1];
    if (vim.open && last) last.cursor = Math.min(last.cursor, vim.cursor);
    if (vim.open && last?.text === vim.text) vim.undo.pop();
    if (vim.base && vim.dot && !vim.replaying) vim.dot.typed = typed(vim.base.text, vim.text);
    vim.open = false;
    vim.base = null;
    vim.mode = "normal";
    vim.column = null;
    // Leaving insert mode steps onto the character before the caret.
    vim.cursor = clamp(vim.text, Math.max(lineStart(vim.text, vim.cursor), vim.cursor - 1));
    return true;
  }

  vim.message = null;
  vim.missed = null;
  if (key === "Escape") {
    // As in the Neovim config, Escape with nothing under way also hides the matches.
    if (vim.pending.length === 0 && vim.mode === "normal") vim.highlight = false;
    vim.pending = [];
    vim.prompt = null;
    vim.mode = "normal";
    vim.cursor = clamp(vim.text, vim.cursor);
    return true;
  }

  vim.cursor = vim.mode === "normal" ? clamp(vim.text, vim.cursor) : Math.min(vim.cursor, vim.text.length);
  if (vim.prompt) {
    // A pattern is being typed. Backspace takes its last character, and the `/` after that.
    if (key === "Backspace") vim.pending.pop();
    else if (key.length > 1 && key !== "Enter") return true;
    if (key === "Backspace" && vim.prompt.pattern === "") {
      vim.pending = [];
      vim.prompt = null;
      return true;
    }
  }
  // Space starts a selection, as `v` does. After an operator, `f` or `r` it is a space.
  if (key === " " && vim.mode === "normal" && vim.pending.length === 0) key = "v";
  if (!vim.prompt || key !== "Backspace") vim.pending.push(key);
  vim.prompt = null;
  vim.changed = false;
  const keys = vim.pending;
  const normal = vim.mode === "normal";
  const before = vim.readonly ? { ...vim, undo: [...vim.undo], redo: [...vim.redo] } : null;
  const outcome = command(vim, keys);
  if (before && (vim.text !== before.text || (vim.mode as Mode) === "insert")) {
    // The text is not ours to change: the key is taken and does nothing.
    Object.assign(vim, before, { pending: [], prompt: null });
    return true;
  }
  if (outcome === MORE) return true;
  vim.pending = [];
  // A change starts at the cursor before it or after it, whichever comes first: `u` returns there.
  const last = vim.undo[vim.undo.length - 1];
  if (vim.changed && last) last.cursor = Math.min(last.cursor, vim.cursor);
  if (outcome !== "moved") vim.column = null;
  if (vim.changed && normal && !vim.replaying) vim.dot = { keys, typed: "" };
  return outcome !== "pass";
}
