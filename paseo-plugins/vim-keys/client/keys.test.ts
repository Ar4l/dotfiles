import assert from "node:assert/strict";
import { test } from "node:test";
import { eventInit, navigate } from "./keys.ts";

test("keys for windows, tabs and workspaces", () => {
  const table: [string[], ReturnType<typeof navigate>][] = [
    [["<C-h>"], { action: "pane-left" }],
    [["<C-j>"], { action: "pane-down" }],
    [["<C-k>"], { action: "pane-up" }],
    [["<C-l>"], { action: "pane-right" }],
    [["<C-w>"], "more"],
    [["<C-w>", "l"], { action: "pane-right" }],
    [["<C-w>", "<C-k>"], { action: "pane-up" }],
    [["<C-w>", "v"], { action: "split-right" }],
    [["<C-w>", "s"], { action: "split-down" }],
    [["<C-w>", "x"], null],
    [["g", "t"], { action: "tab-next" }],
    [["g", "T"], { action: "tab-previous" }],
    [["3", "g", "t"], { action: "tab-index", index: 3 }],
    [["1", "2", "g", "t"], { action: "tab-index", index: 12 }],
    // Space is the editor's: it starts a selection.
    [["<Space>"], null],
    [["<Space>", "n"], null],
    [["]"], "more"],
    [["]", "w"], { action: "workspace-next" }],
    [["[", "w"], { action: "workspace-previous" }],
    // The editor's own: `g` waits for `gg`, an operator waits for its motion.
    [["g"], null],
    [["g", "g"], null],
    [["d", "<Space>"], null],
    [["f", "]"], null],
    [["0"], null],
    [["w"], null],
  ];
  for (const [keys, want] of table) assert.deepEqual(navigate(keys), want, keys.join(" "));
});

test("the app's shortcuts as key events", () => {
  const base = { bubbles: true, cancelable: true };
  assert.deepEqual(eventInit("Cmd+Shift+ArrowLeft"), { ...base, key: "ArrowLeft", code: "ArrowLeft", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true });
  assert.deepEqual(eventInit("Alt+Shift+]"), { ...base, key: "}", code: "BracketRight", metaKey: false, ctrlKey: false, altKey: true, shiftKey: true });
  assert.deepEqual(eventInit("Cmd+["), { ...base, key: "[", code: "BracketLeft", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false });
  assert.deepEqual(eventInit("Cmd+K"), { ...base, key: "k", code: "KeyK", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false });
  assert.deepEqual(eventInit("Cmd+Shift+\\"), { ...base, key: "|", code: "Backslash", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true });
  assert.deepEqual(eventInit("Cmd+Alt+Digit", 4), { ...base, key: "4", code: "Digit4", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false });
  assert.equal(eventInit("Cmd+Alt+Digit"), null);
  assert.equal(eventInit("Cmd+Alt+Digit", 12), null);
  assert.equal(eventInit("Mod+K"), null);
});
