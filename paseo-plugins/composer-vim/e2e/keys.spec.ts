import { type Page, expect, test } from "@playwright/test";

// The fixture from run.sh: one workspace with the agents Quick, Slow and Pages. Slow takes
// ten seconds to answer a prompt. Pages has five turns of thirty messages each, more than the
// app loads at once, and each turn is folded behind "View turn details".
const workspace = process.env.VIM_WORKSPACE ?? "";

// The web UI bundled with the nix build of Paseo 0.15.4 reads BottomSheetModalInternalProvider
// from the @gorhom/bottom-sheet index, which does not export it, so the app crashes at the root.
// This rewrites that one reference in the response the browser receives. Paseo.app's bundle
// does not have it.
const BROKEN = "n.BottomSheetModalInternalProvider,{value:A,children:P}";
const FIXED = "r(3828).BottomSheetModalInternalProvider,{value:A,children:P}";

const composer = (page: Page) => page.locator("[data-testid='message-input-root'] textarea").filter({ visible: true });
const badge = (page: Page) => page.getByTestId("composer-vim-mode");
/** The composer's text with `[` and `]` around its selection: the block, or a visual selection. */
const text = (page: Page) =>
  composer(page).evaluate((area: HTMLTextAreaElement) => {
    const { value, selectionStart: s, selectionEnd: e } = area;
    return s === e ? `${value.slice(0, s)}|${value.slice(s)}` : `${value.slice(0, s)}[${value.slice(s, e)}]${value.slice(e)}`;
  });
/** Types keys one by one. `<Esc>` and `<CR>` are single keys. */
async function keys(page: Page, sequence: string): Promise<void> {
  for (const key of sequence.match(/<Esc>|<CR>|<S-CR>|<C-[a-z]>|<Left>|<Right>|<S-Right>|[^]/g) ?? []) {
    const named =
      { "<Esc>": "Escape", "<CR>": "Enter", "<S-CR>": "Shift+Enter", "<Left>": "ArrowLeft", "<Right>": "ArrowRight", "<S-Right>": "Shift+ArrowRight" }[key] ??
      (key.startsWith("<C-") ? `Control+${key[3]}` : undefined);
    if (named) await page.keyboard.press(named);
    else await page.keyboard.type(key);
  }
}
const openAgent = async (page: Page, title: string) => {
  await page.locator(`[data-testid^="workspace-tab-agent_"][aria-label="${title}"]`).filter({ visible: true }).click();
  await composer(page).click();
};
/** The thread on screen: its cursor with the text around it, what is highlighted, and where it is scrolled. */
const thread = (page: Page) =>
  page.evaluate(() => {
    const ranges = (name: string) => [...((CSS.highlights.get(name) as Iterable<Range> | undefined) ?? [])];
    const [block] = ranges("composer-vim-cursor");
    const node = block?.startContainer as Text | undefined;
    const scroll = [...document.querySelectorAll<HTMLElement>("[data-testid='agent-chat-scroll']")].find((s) => s.checkVisibility())!;
    return {
      /** `[x]` is the character under the block. */
      cursor: block && node ? `${node.data.slice(Math.max(0, block.startOffset - 12), block.startOffset)}[${block}]${node.data.slice(block.endOffset, block.endOffset + 12)}` : null,
      y: block ? Math.round(block.getBoundingClientRect().top) : null,
      visual: ranges("composer-vim-visual").join("|"),
      matches: ranges("composer-vim-search").length,
      focus: document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName,
      atBottom: scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 2,
      text: scroll.innerText,
    };
  });
/** A search past the page reads on for a while: the label says so until it is done. */
const searched = (page: Page) => expect(badge(page)).not.toContainText("searching", { timeout: 30_000 });
/** What the send button offers tells whether the agent is at work. */
const sendButton = (page: Page, label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true });

test("Vim keys in the composer", async ({ page }) => {
  await page.route("**/_expo/static/js/web/index-*.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(BROKEN, FIXED) });
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  // The daemon hands the plugin to the app a moment after the page loads.
  await page.waitForFunction(() => "__composerVim" in window);
  await page.locator(`[data-testid^="sidebar-workspace-row-"][data-testid$=":${workspace}"]`).click();

  await test.step("1. a composer starts in insert mode and types as before", async () => {
    await openAgent(page, "Quick");
    await expect(badge(page)).toHaveText("INSERT");
    await keys(page, "hello brave world");
    expect(await text(page)).toBe("hello brave world|");
  });

  await test.step("2. Escape enters normal mode with the block on a character", async () => {
    await keys(page, "<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    expect(await text(page)).toBe("hello brave worl[d]");
  });

  await test.step("3. motions, operators, undo and redo edit the text the app holds", async () => {
    await keys(page, "bdw");
    expect(await text(page)).toBe("hello brave[ ]");
    await keys(page, "0cwHi<Esc>");
    expect(await text(page)).toBe("H[i] brave ");
    await keys(page, "u");
    expect(await text(page)).toBe("[h]ello brave ");
    await keys(page, "u");
    expect(await text(page)).toBe("hello brave [w]orld");
    await keys(page, "<C-r>");
    expect(await text(page)).toBe("hello brave[ ]");
    // `.` repeats the last change, which is still `cwHi`.
    await keys(page, "u.");
    expect(await text(page)).toBe("hello brave H[i]");
    await keys(page, "u");
  });

  await test.step("4. a letter with no command types nothing, and an operator shows while it waits", async () => {
    await keys(page, "zqd");
    await expect(badge(page)).toHaveText("NORMAL d");
    await keys(page, "<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    expect(await text(page)).toBe("hello brave [w]orld");
  });

  await test.step("5. the arrow keys move the block and Shift with an arrow selects", async () => {
    await keys(page, "0<Right><Right><Left>");
    expect(await text(page)).toBe("h[e]llo brave world");
    await keys(page, "<S-Right>");
    await expect(badge(page)).toHaveText("VISUAL");
    expect(await text(page)).toBe("h[el]lo brave world");
    await keys(page, "<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
  });

  await test.step("6. a click moves the block and visual mode selects a text object", async () => {
    await composer(page).evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(7, 7));
    await expect.poll(() => text(page)).toBe("hello b[r]ave world");
    await keys(page, "viw");
    await expect(badge(page)).toHaveText("VISUAL");
    expect(await text(page)).toBe("hello [brave] world");
    await keys(page, "cbig<Esc>");
    expect(await text(page)).toBe("hello bi[g] world");
  });

  await test.step("7. Escape leaves insert mode while the app lists commands, and keeps the text", async () => {
    // The app's own Escape would empty a composer that starts with a slash command.
    const list = page.getByTestId("composer-autocomplete-popover");
    await keys(page, "S/he");
    await expect(list).toBeVisible();
    await keys(page, "<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    expect(await text(page)).toBe("/h[e]");
    await keys(page, "0");
    await expect(list).toBeHidden();
  });

  await test.step("8. Enter sends from normal mode and the empty composer is in insert mode", async () => {
    await keys(page, "ccone two<Esc>0");
    expect(await text(page)).toBe("[o]ne two");
    await keys(page, "<CR>");
    await expect(page.getByText("one two", { exact: true }).last()).toBeVisible();
    await expect(badge(page)).toHaveText("INSERT");
    expect(await text(page)).toBe("|");
  });

  let sent = 0;
  await test.step("9. Escape in the composer leaves a running agent alone, in every mode", async () => {
    await openAgent(page, "Slow");
    await keys(page, "go<CR>");
    await expect(sendButton(page, "Stop agent")).toBeVisible();
    sent = Date.now();
    await keys(page, "next thing");
    await expect(sendButton(page, "Send and steer")).toBeVisible();

    // Insert mode, an operator that waits, visual mode, and normal mode twice.
    await keys(page, "<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    await keys(page, "d<Esc>v<Esc><Esc><Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    await page.waitForTimeout(1500);
    await expect(sendButton(page, "Send and steer")).toBeVisible();
    expect(await text(page)).toBe("next thin[g]");
  });

  await test.step("10. the command-center item turns the keys off and on", async () => {
    const pick = async () => {
      await page.getByTestId("sidebar-search").click();
      const panel = page.getByTestId("command-center-panel");
      await panel.getByTestId("command-center-input").fill("Vim keys");
      await panel.getByRole("button", { name: /^Vim keys in the composer/ }).click();
    };
    await pick();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("composer-vim:off"))).toBe("1");
    await composer(page).click();
    await expect(badge(page)).toBeHidden();
    await composer(page).evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(0, 0));
    await keys(page, "<Esc>dw ");
    expect(await text(page)).toBe("dw |next thing");
    // With the keys off Escape is the app's again, and stops Slow before its ten seconds are up.
    await expect(sendButton(page, "Send message")).toBeVisible();
    expect(Date.now() - sent, "the agent was stopped, it did not finish").toBeLessThan(9000);

    await pick();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("composer-vim:off"))).toBe(null);
    await composer(page).click();
    await expect(badge(page)).toBeVisible();
  });

  await test.step("11. paste in normal mode lands before the block, and the browser's undo follows", async () => {
    await page.evaluate(() => navigator.clipboard.writeText("XY "));
    await keys(page, "<Esc>0");
    expect(await text(page)).toBe("[d]w next thing");
    await page.keyboard.press("ControlOrMeta+v");
    await expect.poll(() => text(page)).toBe("XY [d]w next thing");
    await keys(page, "dw");
    expect(await text(page)).toBe("XY [n]ext thing");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await text(page)).replace(/[[\]|]/g, "")).toBe("XY dw next thing");
  });

  await test.step("12. the label sits left of the context meter, in the mode's colour", async () => {
    const colour = () => badge(page).evaluate((label) => getComputedStyle(label).backgroundColor);
    await keys(page, "<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    const label = (await badge(page).boundingBox())!;
    const meter = (await page.getByTestId("context-window-meter").filter({ visible: true }).boundingBox())!;
    expect(label.x + label.width).toBeLessThanOrEqual(meter.x);
    expect(meter.x - (label.x + label.width)).toBeLessThan(20);
    expect(Math.abs(label.y + label.height / 2 - (meter.y + meter.height / 2))).toBeLessThan(2);
    expect(await colour()).toBe("rgb(37, 99, 235)");
    await keys(page, "v");
    expect(await colour()).toBe("rgb(147, 51, 234)");
    await keys(page, "<Esc>i");
    expect(await colour()).toBe("rgb(21, 128, 61)");
    await keys(page, "<Esc>");
  });

  await test.step("13. an empty line shows a block caret in normal mode and a line in insert mode", async () => {
    const caret = () => composer(page).evaluate((area) => getComputedStyle(area).getPropertyValue("caret-shape"));
    await keys(page, "ggdG");
    expect(await text(page)).toBe("|");
    await expect(composer(page)).toHaveAttribute("data-composer-vim", "normal");
    expect(await caret()).toBe("block");
    await keys(page, "i");
    await expect(composer(page)).toHaveAttribute("data-composer-vim", "insert");
    expect(await caret()).not.toBe("block");
    await keys(page, "<Esc>");
  });

  await test.step("14. j and k move by wrapped lines and keep their column; a count moves by lines of text", async () => {
    const long = "one two three four five six seven eight nine ten ".repeat(4).trim();
    await composer(page).fill(`${long}\nab\n${long}`);
    const second = long.length + 4;
    const at = () => composer(page).evaluate((area: HTMLTextAreaElement) => area.selectionStart);
    await keys(page, "<Esc>gg05l");
    expect(await at()).toBe(5);
    // The first line of text wraps: one `j` stays inside it.
    await keys(page, "j");
    const wrapped = await at();
    expect(wrapped).toBeGreaterThan(40);
    expect(wrapped).toBeLessThan(long.length);
    // Through the short line "ab" and on to the same column of the next line.
    while ((await at()) < long.length) await keys(page, "j");
    expect(await at()).toBe(long.length + 2);
    await keys(page, "j");
    expect(await at()).toBe(second + 5);
    await keys(page, "kk");
    expect(await at()).toBeLessThan(long.length);
    await keys(page, "gg05l2j");
    expect(await at()).toBe(second + 5);
  });

  await test.step("15. yank and put share the system clipboard", async () => {
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await composer(page).fill("alpha beta");
    await keys(page, "<Esc>0yiw");
    await expect.poll(clipboard).toBe("alpha");
    await page.evaluate(() => navigator.clipboard.writeText("ZZ"));
    await keys(page, "$p");
    await expect.poll(() => text(page)).toBe("alpha betaZ[Z]");
    // Text that ends with a line break is put as a line.
    await page.evaluate(() => navigator.clipboard.writeText("line\n"));
    await keys(page, "Px");
    await expect.poll(() => text(page)).toBe("[i]ne\nalpha betaZZ");
    await expect.poll(clipboard).toBe("l");
  });

  await test.step("16. surround, and Shift+Enter for an empty line above", async () => {
    await keys(page, 'jwysiw"');
    expect(await text(page)).toBe('ine\nalpha ["]betaZZ"');
    await keys(page, 'cs")');
    expect(await text(page)).toBe("ine\nalpha [(]betaZZ)");
    await keys(page, "<S-CR>");
    expect(await text(page)).toBe("ine\n\n[a]lpha (betaZZ)");
    await expect(badge(page)).toHaveText("NORMAL");
  });

  await test.step("16b. a search moves in the composer, and its Enter does not send", async () => {
    await keys(page, "gg/beta");
    await expect(badge(page)).toHaveText("NORMAL /beta");
    await keys(page, "<CR>");
    expect(await text(page)).toBe("ine\n\nalpha ([b]etaZZ)");
    await keys(page, "?in<CR>");
    expect(await text(page)).toBe("[i]ne\n\nalpha (betaZZ)");
    await keys(page, "/nothing<CR>");
    await expect(badge(page)).toHaveText("NORMAL Pattern not found: nothing");
    await keys(page, "<Esc>");
  });

  await test.step("17. Ctrl+K moves the keys to the thread, Ctrl+J and i bring them back", async () => {
    await openAgent(page, "Quick");
    // In insert mode Ctrl+K stays the browser's.
    await keys(page, "<C-k>");
    expect((await thread(page)).focus).toBe("TEXTAREA");
    await keys(page, "<Esc><C-k>");
    await expect.poll(async () => (await thread(page)).focus).toBe("composer-vim-thread");
    await expect(badge(page)).toHaveText("NORMAL");
    expect((await thread(page)).cursor).not.toBeNull();
    await keys(page, "<C-j>");
    expect((await thread(page)).focus).toBe("TEXTAREA");
    expect((await thread(page)).cursor).toBeNull();
    await expect(badge(page)).toHaveText("NORMAL");
    await keys(page, "<C-k>i");
    expect((await thread(page)).focus).toBe("TEXTAREA");
    await expect(badge(page)).toHaveText("INSERT");
    await keys(page, "<Esc>");
  });

  await test.step("18. the thread takes motions, and j and k move by the lines of the page", async () => {
    await keys(page, "<C-k>gg");
    expect((await thread(page)).cursor).toBe("[h]ello");
    await keys(page, "/one two<CR>");
    expect((await thread(page)).cursor).toBe("[o]ne two");
    await keys(page, "w");
    expect((await thread(page)).cursor).toBe("one [t]wo");
    await keys(page, "$");
    expect((await thread(page)).cursor).toBe("one tw[o]");
    // The reply's long paragraph wraps: j and k stay inside it.
    await keys(page, "/I'll take<CR>");
    const top = (await thread(page)).y!;
    await keys(page, "j");
    const below = await thread(page);
    expect(below.y).toBeGreaterThan(top);
    expect(below.cursor).not.toContain("I'll take");
    await keys(page, "k");
    expect((await thread(page)).y).toBe(top);
    await keys(page, "2j");
    expect((await thread(page)).y).toBeGreaterThan(below.y!);
    // A change does nothing, and the composer below keeps its text.
    await keys(page, "ddxrZ");
    expect((await thread(page)).text).toContain("I'll take a look");
    await expect(badge(page)).toHaveText("NORMAL");
  });

  await test.step("19. visual mode selects in the thread and a yank lands on the clipboard", async () => {
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await keys(page, "?one two<CR>wyiw");
    await expect.poll(clipboard).toBe("two");
    await keys(page, "0ve");
    await expect(badge(page)).toHaveText("VISUAL");
    expect((await thread(page)).visual).toBe("one");
    await keys(page, "y");
    await expect.poll(clipboard).toBe("one");
    await expect(badge(page)).toHaveText("NORMAL");
    await keys(page, "V");
    await expect(badge(page)).toHaveText("V-LINE");
    expect((await thread(page)).visual).toBe("one two");
    // Cmd+C copies what visual mode shows.
    await page.keyboard.press("ControlOrMeta+c");
    await expect.poll(clipboard).toBe("one two\n");
    await keys(page, "<Esc>");
    // What the thread yanked, the composer puts.
    await keys(page, "yiw<C-j>p");
    await expect.poll(() => text(page)).toBe("on[e]");
    await keys(page, "dd");
  });

  await test.step("20. a search shows its matches while it is typed, wraps, and Escape hides them", async () => {
    await keys(page, "<C-k>gg/cycle");
    await expect(badge(page)).toHaveText("NORMAL /cycle");
    // smartcase: "cycle" finds both headings "Cycle 1".
    expect((await thread(page)).matches).toBe(2);
    expect((await thread(page)).cursor).toBeNull();
    await keys(page, "<CR>");
    await expect(badge(page)).toHaveText("NORMAL");
    const first = await thread(page);
    expect(first.cursor).toBe("[C]ycle 1");
    await keys(page, "n");
    expect((await thread(page)).y).toBeGreaterThan(first.y!);
    await keys(page, "n");
    await searched(page);
    await expect(badge(page)).toHaveText("NORMAL hit BOTTOM, continuing at TOP");
    expect((await thread(page)).y).toBe(first.y);
    await keys(page, "/Cycle 2<CR>");
    await searched(page);
    await expect(badge(page)).toHaveText("NORMAL Pattern not found: Cycle 2");
    await keys(page, "<Esc>");
    expect((await thread(page)).matches).toBe(0);
    await expect(badge(page)).toHaveText("NORMAL");
    // Escape and Backspace leave a pattern being typed.
    await keys(page, "/hel<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    expect((await thread(page)).cursor).toBe("[C]ycle 1");
  });

  await test.step("21. a search upward loads older messages, and Enter unfolds a turn", async () => {
    await openAgent(page, "Pages");
    await keys(page, "<Esc><C-k>");
    await expect.poll(async () => (await thread(page)).focus).toBe("composer-vim-thread");
    // The app has loaded the last turns only.
    expect((await thread(page)).text).not.toContain("aardvark");
    await keys(page, "?aardvark<CR>");
    await searched(page);
    expect((await thread(page)).cursor).toBe("ser message [a]ardvark");
    await expect(badge(page)).toHaveText("NORMAL");
    // Down again past the turns in between, and around from the last one.
    await keys(page, "/egret<CR>");
    await searched(page);
    expect((await thread(page)).cursor).toBe("ser message [e]gret");
    await keys(page, "/aardvark<CR>");
    await searched(page);
    await expect(badge(page)).toHaveText("NORMAL hit BOTTOM, continuing at TOP");
    expect((await thread(page)).cursor).toBe("ser message [a]ardvark");

    // The first turn shows its messages. The next one is folded until Enter is pressed on it.
    const shown = async () => (await thread(page)).text.split("pre-echo message 7").length - 1;
    const before = await shown();
    await keys(page, "/View turn<CR>");
    await searched(page);
    expect((await thread(page)).cursor).toBe("[V]iew turn det");
    await keys(page, "<CR>");
    await expect.poll(shown).toBe(before + 1);
    // G returns to the end, where the app follows the thread again.
    await keys(page, "G");
    await expect.poll(async () => (await thread(page)).atBottom).toBe(true);
    await keys(page, "<C-j>");
  });

  await test.step("22. Escape, ? and Space in the thread leave a running agent and the app alone", async () => {
    await openAgent(page, "Slow");
    await keys(page, "<Esc>ccagain<CR>");
    await expect(sendButton(page, "Stop agent")).toBeVisible();
    await keys(page, "<Esc><C-k>");
    await expect.poll(async () => (await thread(page)).focus).toBe("composer-vim-thread");
    await keys(page, "<Esc><Esc>v<Esc>?<Esc> k");
    await page.waitForTimeout(1500);
    await expect(sendButton(page, "Stop agent")).toBeVisible();
    await expect(page.getByTestId("keyboard-shortcuts-dialog")).toHaveCount(0);
    // The cursor moved up, so the app no longer pulls the view down as the reply grows.
    const { y, cursor } = await thread(page);
    await page.waitForTimeout(1200);
    expect(await thread(page)).toMatchObject({ y, cursor, atBottom: false });
    await keys(page, "G<C-j>");
  });
});
