import { type Page, expect, test } from "@playwright/test";

// The fixture from run.sh: agents 1 to 4 in workspace alpha, agents 5 to 7 in workspace beta.
const [alpha, beta] = (process.env.MRU_WORKSPACES ?? "").split(",");

/** A place the switcher can land on: an agent by number, or beta's terminal tab. */
type Stop = number | "terminal";

const SELECTED = '[data-testid^="workspace-tab-"][aria-selected="true"]';
const workspaceOf = (stop: Stop) => (stop === "terminal" || stop > 4 ? beta : alpha);
const titleOf = (stop: Stop) => (stop === "terminal" ? /./ : `Agent ${stop}`);

/** What the plugin's list should hold, most recent first. Every step checks the app against it. */
let mru: Stop[] = [];

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mru-switcher") ?? "[]") as { key: string; title: string }[]);

/** Asserts the app shows `stop` and the plugin has recorded it as the most recent entry. */
async function arrive(page: Page, stop: Stop): Promise<void> {
  // An agent visit replaces the entry of its own workspace.
  const replaced = stop !== "terminal" && workspaceOf(stop) === beta ? "terminal" : null;
  mru = [stop, ...mru.filter((other) => other !== stop && other !== replaced)];

  await expect(page).toHaveURL(new RegExp(`/h/[^/]+/workspace/${workspaceOf(stop)}$`));
  const selected = page.locator(SELECTED).filter({ visible: true });
  if (stop === "terminal") {
    await expect(selected).toHaveAttribute("data-testid", /^workspace-tab-terminal_/);
  } else {
    await expect(selected).toHaveAttribute("data-testid", /^workspace-tab-agent_/);
    await expect(selected).toHaveAttribute("aria-label", `Agent ${stop}`);
  }
  // The plugin records a jump once it has landed, a little after the tab is selected.
  const front = async () => {
    const [entry] = await stored(page);
    return stop === "terminal" ? entry?.key.slice(0, 3) : `${entry?.key.slice(0, 6)} ${entry?.title}`;
  };
  await expect.poll(front).toBe(stop === "terminal" ? "ws:" : `agent: Agent ${stop}`);
  await expect.poll(async () => (await stored(page)).length).toBe(mru.length);
}

/** The daemon hands the plugin to the app a moment after the page loads. */
const pluginStarted = (page: Page) => page.waitForFunction(() => "__mruSwitcher" in window);

/** Opens a workspace from the sidebar. It shows whichever tab it had selected last. */
async function openWorkspace(page: Page, workspace: string): Promise<void> {
  await page.locator(`[data-testid^="sidebar-workspace-row-"][data-testid$=":${workspace}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${workspace}$`));
  const label = await page.locator(SELECTED).filter({ visible: true }).getAttribute("aria-label");
  const agent = /^Agent (\d)$/.exec(label ?? "");
  await arrive(page, agent ? Number(agent[1]) : "terminal");
}

async function clickAgent(page: Page, agent: number): Promise<void> {
  await openWorkspace(page, workspaceOf(agent));
  await page.locator(`[data-testid^="workspace-tab-agent_"][aria-label="Agent ${agent}"]`).filter({ visible: true }).click();
  await arrive(page, agent);
}

/** Holds Ctrl, taps Tab `tabs` times, runs `whileHeld`, releases, and asserts where that lands. */
async function ctrlTab(page: Page, tabs: number, whileHeld?: () => Promise<void>): Promise<void> {
  const target = mru[tabs % Math.min(7, mru.length)];
  await page.keyboard.down("Control");
  for (let i = 0; i < tabs; i++) await page.keyboard.press("Tab");
  await whileHeld?.();
  await page.keyboard.up("Control");
  await expect(page.getByTestId("mru-switcher")).toHaveCount(0);
  await arrive(page, target);
}

test("Ctrl+Tab switches between recently viewed tabs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.text().includes("[Plugins]")) errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator('[data-testid^="sidebar-workspace-row-"]')).toHaveCount(2);
  await pluginStarted(page);
  const overlay = page.getByTestId("mru-switcher");

  await test.step("1. toggles between the last two tabs", async () => {
    for (const agent of [1, 2, 3, 4, 5, 6, 7]) await clickAgent(page, agent);
    await ctrlTab(page, 1);
    expect(mru[0]).toBe(6);
    await ctrlTab(page, 1);
    expect(mru[0]).toBe(7);
  });

  await test.step("2. walks the list while Ctrl is held", async () => {
    await ctrlTab(page, 4, async () => {
      await expect(overlay.locator("> div")).toHaveText(mru.map(titleOf));
      await expect(overlay.locator('> div[aria-selected="true"]')).toHaveText("Agent 3");
      const box = await overlay.boundingBox();
      expect(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1400 && box.y + box.height <= 900).toBe(true);
    });
    expect(mru[0]).toBe(3);
    await ctrlTab(page, 6);
    expect(mru[0]).toBe(1); // the oldest entry
  });

  await test.step("3. Escape cancels", async () => {
    await page.keyboard.down("Control");
    await page.keyboard.press("Tab");
    await expect(overlay).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);
    await page.keyboard.up("Control");
    await page.waitForTimeout(500);
    await arrive(page, 1);
  });

  await test.step("4. works from the composer and from a terminal", async () => {
    const composer = page.getByTestId("message-input-root").filter({ visible: true }).locator("textarea");
    await composer.click();
    await composer.pressSequentially("draft");
    await ctrlTab(page, 1);
    expect(mru[0]).toBe(3);
    await ctrlTab(page, 1);
    await expect(composer).toHaveValue("draft"); // the Tab never reached the composer

    await openWorkspace(page, beta);
    await page.getByTestId("workspace-new-tab-button").filter({ visible: true }).click();
    await page.getByTestId("workspace-new-tab-menu-terminal").click();
    const terminal = page.locator(".xterm").filter({ visible: true });
    await terminal.click();
    await expect(terminal.locator("textarea")).toBeFocused();
    await arrive(page, "terminal");
    await ctrlTab(page, 2); // out of the terminal, into the other workspace
    expect(workspaceOf(mru[0])).toBe(alpha);
    await ctrlTab(page, 1); // and back to the terminal through its workspace entry
    expect(mru[0]).toBe("terminal");
  });

  await test.step("5. ten jumps leave floating panels in place", async () => {
    for (let i = 0; i < 10; i++) await ctrlTab(page, 3);
    // Navigation outside the app's own helper can stack hidden workspace decks, which
    // misplaces composer popovers (upstream docs/expo-router.md).
    await expect(page.locator('[data-testid^="workspace-deck-entry-"]')).toHaveCount(1);
    await page.getByTestId("combined-model-selector").filter({ visible: true }).click();
    const picker = page.getByTestId("combobox-desktop-container");
    await expect(picker).toBeVisible();
    const box = (await picker.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1400);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
  });

  await test.step("6. the list survives a reload", async () => {
    const before = mru[0];
    await page.reload();
    await pluginStarted(page);
    await expect(page.locator(SELECTED).filter({ visible: true })).toHaveAttribute("aria-label", titleOf(before));
    await ctrlTab(page, 1);
    expect(mru[1]).toBe(before);
  });

  expect(errors).toEqual([]);
});
