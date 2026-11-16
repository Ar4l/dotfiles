import { type Page, expect, test } from "@playwright/test";

// The fixture from run.sh: one workspace with the agents Quick and Slow. Slow takes ten
// seconds to answer a prompt.
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
  for (const key of sequence.match(/<Esc>|<CR>|<S-CR>|<C-r>|<Left>|<Right>|<S-Right>|[^]/g) ?? []) {
    const named = { "<Esc>": "Escape", "<CR>": "Enter", "<S-CR>": "Shift+Enter", "<C-r>": "Control+r", "<Left>": "ArrowLeft", "<Right>": "ArrowRight", "<S-Right>": "Shift+ArrowRight" }[key];
    if (named) await page.keyboard.press(named);
    else await page.keyboard.type(key);
  }
}
const openAgent = async (page: Page, title: string) => {
  await page.locator(`[data-testid^="workspace-tab-agent_"][aria-label="${title}"]`).filter({ visible: true }).click();
  await composer(page).click();
};
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
});
