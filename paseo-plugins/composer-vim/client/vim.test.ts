import assert from "node:assert/strict";
import { test } from "node:test";
import { type Vim, create, moveTo, press, puts, select, selection } from "./vim.ts";

/** Splits `dw<Esc>` into keys: one per character, and `<Esc>`, `<CR>`, `<C-r>` as one. */
const keysOf = (keys: string) =>
  (keys.match(/<Esc>|<CR>|<S-CR>|<BS>|<C-r>|[^]/g) ?? []).map((k) => ({ "<Esc>": "Escape", "<CR>": "Enter", "<BS>": "Backspace" })[k] ?? k);

/** A composer in normal mode. `|` in `text` marks the character under the cursor. */
function at(text: string): Vim {
  const cursor = text.indexOf("|");
  const vim = create(text.replace("|", ""), Math.max(cursor, 0));
  vim.mode = "normal";
  return vim;
}

/** Feeds keys. In insert mode a character is typed, as the browser would. */
function type(vim: Vim, keys: string): Vim {
  for (const key of keysOf(keys)) {
    const taken = press(vim, key);
    if (taken || vim.mode !== "insert") continue;
    const text = key === "Enter" ? "\n" : key.length === 1 ? key : "";
    vim.text = vim.text.slice(0, vim.cursor) + text + vim.text.slice(vim.cursor);
    vim.cursor += text.length;
  }
  return vim;
}

/** The text after `keys`, with `|` before the character under the cursor. */
function run(text: string, keys: string): string {
  const vim = type(at(text), keys);
  return `${vim.text.slice(0, vim.cursor)}|${vim.text.slice(vim.cursor)}`;
}

const cases = (name: string, table: [string, string, string][]) =>
  test(name, () => {
    for (const [text, keys, want] of table) assert.equal(run(text, keys), want, `${JSON.stringify(text)} ${keys}`);
  });

cases("motions on a line", [
  ["|foo bar", "l", "f|oo bar"],
  ["fo|o bar", "h", "f|oo bar"],
  ["|foo bar", "5h", "|foo bar"],
  ["|foo", "9l", "fo|o"],
  ["foo |bar", "0", "|foo bar"],
  ["  foo |bar", "^", "  |foo bar"],
  ["|foo bar", "$", "foo ba|r"],
  ["|foo bar baz", "w", "foo |bar baz"],
  ["|foo bar baz", "2w", "foo bar |baz"],
  ["|foo.bar", "w", "foo|.bar"],
  ["|foo.bar baz", "W", "foo.bar |baz"],
  ["foo bar |baz", "b", "foo |bar baz"],
  ["foo b|ar", "b", "foo |bar"],
  ["foo.bar |baz", "B", "|foo.bar baz"],
  ["|foo bar", "e", "fo|o bar"],
  ["fo|o bar", "e", "foo ba|r"],
  ["|foo, bar", "E", "foo|, bar"],
  ["|a(b)c", "fb", "a(|b)c"],
  ["|a(b)c", "tb", "a|(b)c"],
  ["a(b)|c", "Fa", "|a(b)c"],
  ["a(b)|c", "Ta", "a|(b)c"],
  ["|a.b.c.d", "f.;", "a.b|.c.d"],
  ["|a.b.c.d", "2f.,", "a|.b.c.d"],
  ["|a.b.c.d", "t.;", "a.|b.c.d"],
  ["|a.b", "fz", "|a.b"],
  ["a |(b [c] d) e", "%", "a (b [c] d|) e"],
  ["a (b [c] d|) e", "%", "a |(b [c] d) e"],
]);

cases("motions across lines", [
  ["on|e\ntwo\nthree", "j", "one\ntw|o\nthree"],
  ["one\ntw|o\nthree", "k", "on|e\ntwo\nthree"],
  ["long li|ne\nab\nlong line", "jj", "long line\nab\nlong li|ne"],
  ["|one\ntwo", "$j", "one\ntw|o"],
  ["one\n|two", "j", "one\n|two"],
  ["one\ntwo\n|three", "gg", "|one\ntwo\nthree"],
  ["|one\ntwo\n  three", "G", "one\ntwo\n  |three"],
  ["|one\ntwo\nthree", "2G", "one\n|two\nthree"],
  ["|one\ntwo\nthree", "3gg", "one\ntwo\n|three"],
  ["fo|o\nbar", "w", "foo\n|bar"],
  ["foo\n|bar", "b", "|foo\nbar"],
  ["|foo\n\nbar", "w", "foo\n|\nbar"],
  ["foo\n\n|bar", "b", "foo\n|\nbar"],
  ["|a\nb\n\nc\nd\n\ne", "}", "a\nb\n|\nc\nd\n\ne"],
  ["|a\nb\n\nc\nd\n\ne", "2}", "a\nb\n\nc\nd\n|\ne"],
  ["a\nb\n\nc\n|d", "{", "a\nb\n|\nc\nd"],
  ["a\nb\n\nc\n|d", "2{", "|a\nb\n\nc\nd"],
]);

cases("delete, change and yank", [
  ["|foo bar baz", "dw", "|bar baz"],
  ["|foo bar baz", "d2w", "|baz"],
  ["|foo bar baz", "2dw", "|baz"],
  ["foo |bar", "dw", "foo| "],
  ["|foo\nbar", "dw", "|\nbar"],
  ["foo b|ar baz", "db", "foo |ar baz"],
  ["|foo bar", "de", "| bar"],
  ["foo |bar baz", "d$", "foo| "],
  ["foo |bar baz", "D", "foo| "],
  ["foo |bar baz", "d0", "|bar baz"],
  ["|a(b)c", "dfb", "|)c"],
  ["|a(b)c", "dtb", "|b)c"],
  ["a |(b c) d", "d%", "a | d"],
  ["one\nt|wo\nthree", "dd", "one\n|three"],
  ["one\ntwo\nth|ree", "dd", "one\n|two"],
  ["on|e", "dd", "|"],
  ["|one\ntwo\nthree\nfour", "2dd", "|three\nfour"],
  ["|one\ntwo\nthree\nfour", "dj", "|three\nfour"],
  ["one\ntwo\n|three\nfour", "dk", "one\n|four"],
  ["one\n|two\nthree", "dG", "|one"],
  ["one\ntwo\n|three", "dgg", "|"],
  ["fo|o bar", "x", "fo| bar"],
  ["|foo bar", "3x", "| bar"],
  ["fo|o", "x", "f|o"],
  ["fo|o bar", "X", "f|o bar"],
  ["|foo bar", "cwx<Esc>", "|x bar"],
  ["|foo  bar", "cwx<Esc>", "|x  bar"],
  ["|a b", "cwx<Esc>", "|x b"],
  ["foo |bar baz", "Cx<Esc>", "foo |x"],
  ["one\nt|wo\nthree", "ccx<Esc>", "one\n|x\nthree"],
  ["one\nt|wo\nthree", "Sx<Esc>", "one\n|x\nthree"],
  ["fo|o", "sx<Esc>", "fo|x"],
  ["|foo bar", "ywP", "foo| foo bar"],
  ["foo |bar baz", "ywp", "foo bbar| ar baz"],
  ["one\nt|wo", "yyp", "one\ntwo\n|two"],
  ["one\nt|wo", "yyP", "one\n|two\ntwo"],
  ["one |two three", "YP", "one two thre|etwo three"],
  ["on|e\ntwo", "<S-CR>", "\n|one\ntwo"],
  ["one\n  t|wo", "<S-CR>", "one\n\n|  two"],
  ["|foo bar", "l l", "fo|o bar"],
  ["one\nt|wo\nthree", "ddp", "one\nthree\n|two"],
  ["|ab", "xp", "b|a"],
]);

cases("text objects", [
  ["foo b|ar baz", "diw", "foo | baz"],
  ["foo b|ar baz", "daw", "foo |baz"],
  ["foo ba|r", "daw", "fo|o"],
  ["foo.b|ar baz", "diW", "| baz"],
  ['say "he|llo there" now', 'di"', 'say "|" now'],
  ['say "he|llo there" now', 'da"', "say |now"],
  ['|say "hello" now', 'ci"x<Esc>', 'say "|x" now'],
  ["it's 'o|k'", "di'", "it's '|'"],
  ['|a "b" c "d"', 'di"', 'a "|" c "d"'],
  ['a "b" |c "d"', 'di"', 'a "b" c "|"'],
  ["f(a, |b) c", "di(", "f(|) c"],
  ["f(a, |b) c", "da(", "f| c"],
  ["f(a, (|b)) c", "2l", "f(a, (b)|) c"],
  ["f(a, (b|)) c", "dib", "f(a, (|)) c"],
  ["x [a |b] y", "di]", "x [|] y"],
  ["x {a |b} y", "ciBz<Esc>", "x {|z} y"],
  ["x <a |b> y", "da<", "x | y"],
  ["f(\n  |a,\n  b\n)", "di(", "f(|)"],
  ["a\n\nb|1\nb2\n\nc", "dip", "a\n\n|\nc"],
  ["a\n\nb|1\nb2\n\nc", "dap", "a\n\n|c"],
  ["no |pair", "di(", "no |pair"],
]);

cases("surround", [
  ['say "he|llo" now', 'ds"', "say |hello now"],
  ["f(a, |b) c", "ds(", "f|a, b c"],
  ["f( a, |b ) c", "ds(", "f|a, b c"],
  ["f( a, |b ) c", "ds)", "f| a, b  c"],
  ["f(a, |b) c", "dsb", "f|a, b c"],
  ['say "he|llo" now', "cs\"'", "say |'hello' now"],
  ['say "he|llo" now', 'cs")', "say |(hello) now"],
  ['say "he|llo" now', 'cs"(', "say |( hello ) now"],
  ["x [a |b] y", "cs]}", "x |{a b} y"],
  ["x [a |b] y", "csr>", "x |<a b> y"],
  ["a *b|old* c", "ds*", "a |bold c"],
  ["a *b|old* c", "cs*_", "a |_bold_ c"],
  ["say he|llo now", 'ysiw"', 'say |"hello" now'],
  ["say he|llo now", "ysiw)", "say |(hello) now"],
  ["say he|llo now", "ysiw(", "say |( hello ) now"],
  ["say he|llo now", "ysiw`", "say |`hello` now"],
  ["say he|llo now", "ysiwb", "say |(hello) now"],
  ["say |hello now", "ysw]", "say |[hello] now"],
  ["say |hello now", "ys2w*", "say |*hello now*"],
  ["say |hello now", "ys$'", "say |'hello now'"],
  ["  say hel|lo", "yss)", "  |(say hello)"],
  ["a (b|) c", 'ysi("', 'a (|"b") c'],
  ["say |hello now", 'veS"', 'say |"hello" now'],
  ["one\nt|wo\nthree", "VS}", "one\n|{\ntwo\n}\nthree"],
  ["one |two three four", 'ysiw"3w.', 'one "two" |"three" four'],
  ['say "he|llo" now', 'ds"u', 'say |"hello" now'],
  ["no |pair", 'ds"', "no |pair"],
  ["say he|llo", "ysiwx", "say he|llo"],
]);

cases("insert mode", [
  ["fo|o", "ix<Esc>", "fo|xo"],
  ["fo|o", "ax<Esc>", "foo|x"],
  ["  fo|o", "Ix<Esc>", "  |xfoo"],
  ["|foo", "Ax<Esc>", "foo|x"],
  ["|", "ax<Esc>", "|x"],
  ["on|e\ntwo", "ox<Esc>", "one\n|x\ntwo"],
  ["one\nt|wo", "Ox<Esc>", "one\n|x\ntwo"],
  ["  - on|e", "ox<Esc>", "  - one\n  |x"],
  ["fo|o", "i<Esc>", "f|oo"],
  ["|foo", "i<Esc>", "|foo"],
]);

cases("small changes", [
  ["fo|o", "rx", "fo|x"],
  ["|foo", "3rx", "xx|x"],
  ["fo|o", "3rx", "fo|o"],
  ["|foo", "~", "F|oo"],
  ["|foo bar", "4~", "FOO |bar"],
  ["on|e\ntwo", "J", "one| two"],
  ["one\n   two\nthree", "3J", "one two| three"],
  ["on|e\n\ntwo", "J", "on|e\ntwo"],
  ["only", "J", "|only"],
]);

cases("visual mode", [
  ["|foo bar baz", "vd", "|oo bar baz"],
  ["|foo bar baz", "ved", "| bar baz"],
  ["foo |bar baz", "vbd", "|ar baz"],
  ["foo |bar baz", "vey", "foo |bar baz"],
  ["foo |bar baz", "veyP", "foo ba|rbar baz"],
  ["|foo bar baz", "vwox", "|ar baz"],
  ["foo b|ar baz", "viwd", "foo | baz"],
  ["f(a, |b) c", "vi(cx<Esc>", "f(|x) c"],
  ["one\nt|wo\nthree", "Vd", "one\n|three"],
  ["o|ne\ntwo\nthree", "Vjd", "|three"],
  ["o|ne\ntwo\nthree", "vjd", "o|o\nthree"],
  ["one\nt|wo\nthree", "Vcx<Esc>", "one\n|x\nthree"],
  ["|foo bar", "ve~", "|FOO bar"],
  ["|Foo Bar", "v$u", "|foo bar"],
  ["|foo", "VU", "|FOO"],
  ["|one\ntwo\nthree", "VjJ", "one| two\nthree"],
  ["|foo bar", "yiwwviwp", "foo fo|o"],
  ["|one\ntwo", "yyjVp", "one\n|one"],
  ["|foo bar", "v<Esc>x", "|oo bar"],
  ["|foo bar", "vVvd", "|oo bar"],
  ["a\n\nb|1\nb2\n\nc", "vipd", "a\n\n|\nc"],
]);

cases("undo, redo and repeat", [
  ["|foo bar baz", "dwdwu", "|bar baz"],
  ["foo bar |baz", "dbu", "foo |bar baz"],
  ["foo |bar", "x$u", "foo |bar"],
  ["|foo bar baz", "dwdwuu", "|foo bar baz"],
  ["|foo bar baz", "dwdwuu<C-r>", "|bar baz"],
  ["|foo bar baz", "dwu<C-r><C-r>", "|bar baz"],
  ["|foo bar baz", "dw2u", "|foo bar baz"],
  ["|foo bar", "cwlong word<Esc>u", "|foo bar"],
  ["|foo", "Abar<Esc>u", "fo|o"],
  ["|foo", "A<Esc>u", "fo|o"],
  ["|foo", "Abar<Esc>0u<C-r>", "foo|bar"],
  ["|foo bar baz", "dw.", "|baz"],
  ["|a b c d", "dw2.", "|c d"],
  ["|foo bar baz", "cwx<Esc>w.", "x |x baz"],
  ["|one\ntwo", "A!<Esc>j.", "one!\ntwo|!"],
  ["|one\ntwo\nthree", "dd.", "|three"],
  ["|abc", "x..", "|"],
  ["|foo bar baz", "dwvd.", "|baz"],
  ["|foo", "ix<Esc>u.", "|xfoo"],
  ["|ab", "ywu", "|ab"],
]);

test("keys that are not Vim's go to the app", () => {
  const vim = at("|foo");
  for (const key of ["Enter", "Tab", "ArrowLeft", "F5", "Shift"]) assert.equal(press(vim, key), false, key);
  for (const key of ["z", "Q", "#", "d", "Escape"]) assert.equal(press(vim, key), true, key);
  assert.equal(vim.text, "foo");
});

test("Enter drops an unfinished command and stays the app's", () => {
  const vim = at("|foo bar");
  press(vim, "d");
  assert.equal(press(vim, "Enter"), false);
  assert.deepEqual(vim.pending, []);
  press(vim, "w");
  assert.equal(vim.text, "foo bar");
});

test("a modifier key leaves an unfinished command alone", () => {
  const vim = at("|foo bar");
  for (const key of ["d", "Shift", "$"]) press(vim, key);
  assert.equal(vim.text, "");
});

test("Escape is Vim's in every mode", () => {
  const vim = create("foo");
  assert.equal(press(vim, "Escape"), true, "insert");
  assert.equal(vim.mode, "normal");
  assert.equal(press(vim, "Escape"), true, "normal");
  press(vim, "d");
  assert.equal(press(vim, "Escape"), true, "an operator waits for its motion");
  assert.deepEqual(vim.pending, []);
  press(vim, "v");
  assert.equal(press(vim, "Escape"), true, "visual");
  assert.equal(vim.mode, "normal");
});

test("a composer starts in insert mode and types on its own", () => {
  const vim = type(create(), "hello");
  assert.equal(vim.mode, "insert");
  assert.equal(vim.text, "hello");
  type(vim, "<Esc>u");
  assert.equal(vim.text, "", "one stay in insert mode is one undo");
  type(vim, "<C-r>");
  assert.equal(vim.text, "hello");
});

test("the textarea's selection shows the cursor", () => {
  assert.deepEqual(selection(at("fo|o bar")), [2, 3, false], "normal: the character under the block");
  assert.deepEqual(selection(at("foo\n|\nbar")), [4, 4, false], "an empty line has no character");
  assert.deepEqual(selection(at("|😀 x")), [0, 2, false], "an emoji is two code units");
  assert.deepEqual(selection(type(at("fo|o bar"), "ve")), [2, 7, false]);
  assert.deepEqual(selection(type(at("foo b|ar"), "vb")), [4, 6, true]);
  assert.deepEqual(selection(type(at("one\nt|wo\nthree"), "V")), [4, 7, false]);
  assert.deepEqual(selection(type(at("fo|o"), "i")), [2, 2, false]);
});

test("a selection made with the pointer becomes the cursor or a visual selection", () => {
  const vim = at("|foo bar baz");
  select(vim, 4, 4, false);
  assert.equal(vim.cursor, 4, "a click moves the block");
  select(vim, 11, 11, false);
  assert.equal(vim.cursor, 10, "a click past the line's end lands on its last character");
  select(vim, 4, 7, false);
  assert.deepEqual([vim.mode, vim.anchor, vim.cursor], ["visual", 4, 6], "a drag selects");
  type(vim, "d");
  assert.equal(vim.text, "foo  baz");
  select(vim, 0, 3, true);
  assert.deepEqual([vim.mode, vim.anchor, vim.cursor], ["visual", 2, 0], "a drag to the left");
  select(vim, 1, 1, false);
  assert.equal(vim.mode, "normal", "a click ends the selection");
});

test("a put after nothing but a count waits for the clipboard", () => {
  const vim = at("|foo");
  assert.equal(puts(vim, "p"), true);
  assert.equal(puts(type(at("|foo"), "3"), "P"), true);
  assert.equal(puts(type(at("|foo"), "v"), "p"), true);
  assert.equal(puts(type(at("|foo"), "d"), "p"), false, "dp is no put");
  assert.equal(puts(type(at("|foo"), "f"), "p"), false, "fp finds a p");
  assert.equal(puts(create("foo"), "p"), false, "insert mode types it");
});

test("a move the textarea measured lands on a character", () => {
  const vim = at("|one\ntwo");
  moveTo(vim, 3);
  assert.equal(vim.cursor, 2, "not on the line break");
  moveTo(vim, 99);
  assert.equal(vim.cursor, 6);
});

test("j and k keep their column through a selection that did not move", () => {
  const vim = type(at("long li|ne\nab\nlong line"), "j");
  select(vim, ...selection(vim));
  type(vim, "j");
  assert.equal(vim.cursor, 20);
});
