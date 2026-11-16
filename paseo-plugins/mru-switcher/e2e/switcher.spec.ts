import { type Page, expect, test } from "@playwright/test";

// The fixture from run.sh: agents 1 to 4 in workspace alpha, agents 5 to 7 in workspace beta.
// Agent 2 takes ten seconds to answer a prompt; the others answer at once.
const [alpha, beta] = (process.env.MRU_WORKSPACES ?? "").split(",");

/** A place the switcher can land on: an agent by number, or beta's terminal tab. */
type Stop = number | "terminal";

const SELECTED = '[data-testid^="workspace-tab-"][aria-selected="true"]';
const workspaceOf = (stop: Stop) => (stop === "terminal" || stop > 4 ? beta : alpha);
const titleOf = (stop: Stop) => (stop === "terminal" ? /./ : `Agent ${stop}`);
/** Project and workspace name, as the overlay labels an entry. */
const labelOf = (stop: Stop) => (workspaceOf(stop) === alpha ? "alpha / main" : "beta / main");
const agentTab = (page: Page, agent: number) =>
  page.locator(`[data-testid^="workspace-tab-agent_"][aria-label="Agent ${agent}"]`).filter({ visible: true });

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
  await agentTab(page, agent).click();
  await arrive(page, agent);
}

/** Holds Ctrl and taps Tab until the overlay is up, with the first entry behind the tab on screen selected. */
async function openOverlay(page: Page): Promise<void> {
  await page.keyboard.down("Control");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("mru-switcher")).toBeVisible();
}

/** The status the overlay shows for an agent, read from its host, without switching tabs. */
async function statusOf(page: Page, agent: number): Promise<string> {
  await openOverlay(page);
  // The overlay opens with the status it knew last and repaints when the host answers.
  await page.waitForTimeout(300);
  const row = page.getByTestId("mru-switcher").locator("> div").filter({ hasText: `Agent ${agent}` });
  const status = `${await row.getAttribute("data-status")}: ${await row.locator('[data-part="status"]').textContent()}`;
  await page.keyboard.press("Escape");
  await page.keyboard.up("Control");
  return status;
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
      await expect(overlay.locator('[data-part="title"]')).toHaveText(mru.map(titleOf));
      await expect(overlay.locator('[data-part="workspace"]')).toHaveText(mru.map(labelOf));
      await expect(overlay.locator('> div[data-status="done"]')).toHaveCount(7);
      await expect(overlay.locator('> div[aria-selected="true"] [data-part="title"]')).toHaveText("Agent 3");
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
    // A jump clicks the app's own controls, so both workspaces stay mounted and one is on
    // screen. The URL route would have unmounted the other.
    const decks = page.locator('[data-testid^="workspace-deck-entry-"]');
    await expect(decks).toHaveCount(2);
    await expect(decks.filter({ visible: true })).toHaveCount(1);
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

  await test.step("7. the pointer selects a row, and a press jumps to it", async () => {
    let target = mru[3];
    await openOverlay(page);
    let box = (await overlay.locator("> div").nth(3).boundingBox())!;
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.move(box.x + 60, box.y + box.height / 2);
    await expect(overlay.locator('> div[aria-selected="true"]')).toHaveAttribute("data-index", "3");
    await page.keyboard.up("Control");
    await arrive(page, target);

    target = mru[2];
    await openOverlay(page);
    box = (await overlay.locator("> div").nth(2).boundingBox())!;
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await expect(overlay).toHaveCount(0);
    await page.mouse.up();
    await page.keyboard.up("Control");
    await arrive(page, target);
  });

  await test.step("8. a closed tab reopens", async () => {
    await clickAgent(page, 3);
    await clickAgent(page, 4);
    const tab = agentTab(page, 3);
    const id = (await tab.getAttribute("data-testid"))!.slice("workspace-tab-agent_".length);
    await tab.hover();
    await page.getByTestId(`workspace-agent-close-${id}`).filter({ visible: true }).click();
    await expect(tab).toHaveCount(0);
    await ctrlTab(page, 1);
    expect(mru[0]).toBe(3);
  });

  await test.step("9. the list shows what each agent is doing", async () => {
    await clickAgent(page, 2);
    const composer = page.getByTestId("message-input-root").filter({ visible: true }).locator("textarea");
    await composer.fill("go");
    await composer.press("Enter");
    await clickAgent(page, 5);
    await expect.poll(() => statusOf(page, 2)).toBe("running: Working");
    // It finishes while another tab is on screen, which leaves it unread.
    await expect.poll(() => statusOf(page, 2), { timeout: 30_000 }).toBe("attention: Ready to review");
  });

  await test.step("10. a jump leaves the other agents of a workspace unread", async () => {
    const decks = page.locator('[data-testid^="workspace-deck-entry-"]');
    // Opening alpha from its sidebar row would show Agent 2, its unread agent, and mark it read.
    await clickAgent(page, 6);
    await ctrlTab(page, mru.indexOf(4));
    await expect(decks).toHaveCount(2); // through the clicks, not the URL
    expect(await statusOf(page, 2)).toBe("attention: Ready to review");

    // After a reload alpha is not mounted, so its tab cannot be clicked together with its row.
    await ctrlTab(page, 1);
    expect(mru[0]).toBe(6);
    await page.reload();
    await pluginStarted(page);
    await expect(agentTab(page, 6)).toHaveAttribute("aria-selected", "true");
    await ctrlTab(page, 1);
    expect(mru[0]).toBe(4);
    expect(await statusOf(page, 2)).toBe("attention: Ready to review");
  });

  expect(errors).toEqual([]);
});
