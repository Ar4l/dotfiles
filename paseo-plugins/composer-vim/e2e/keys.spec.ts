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
  for (const key of sequence.match(/<Esc>|<CR>|<C-r>|<Left>|<Right>|<S-Right>|[^]/g) ?? []) {
    const named = { "<Esc>": "Escape", "<CR>": "Enter", "<C-r>": "Control+r", "<Left>": "ArrowLeft", "<Right>": "ArrowRight", "<S-Right>": "Shift+ArrowRight" }[key];
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
    await expect(badge(page)).toHaveText("NORMAL  d");
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

  await test.step("9. Escape interrupts a running agent from normal mode only", async () => {
    await openAgent(page, "Slow");
    await keys(page, "go<CR>");
    await expect(sendButton(page, "Stop agent")).toBeVisible();
    const sent = Date.now();
    await keys(page, "next thing");
    await expect(sendButton(page, "Send and steer")).toBeVisible();

    // Insert mode, an operator that waits and visual mode each take one Escape for themselves.
    await keys(page, "<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    await keys(page, "d<Esc>v<Esc>");
    await expect(badge(page)).toHaveText("NORMAL");
    await page.waitForTimeout(1500);
    await expect(sendButton(page, "Send and steer")).toBeVisible();

    await keys(page, "<Esc>");
    await expect(sendButton(page, "Send message")).toBeVisible();
    expect(Date.now() - sent, "the agent was stopped, it did not finish").toBeLessThan(8000);
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

    await pick();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("composer-vim:off"))).toBe(null);
    await composer(page).click();
    await expect(badge(page)).toBeVisible();
  });

  await test.step("11. paste in normal mode lands before the block, and the browser's undo follows", async () => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
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
});
