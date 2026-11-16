import { execFileSync } from "node:child_process";
import { type Page, expect, test } from "@playwright/test";

// The fixture from run.sh: agents 1 to 4 in workspace alpha, agents 5 to 7 in workspace beta.
// Agent 2 takes ten seconds to answer a prompt; the others answer at once.
const [alpha, beta] = (process.env.MRU_WORKSPACES ?? "").split(",");
/** Runs the rig's `paseo` CLI. */
const paseo = (...args: string[]) => {
  const [command, ...prefix] = JSON.parse(process.env.MRU_PASEO ?? "[]") as string[];
  return execFileSync(command, [...prefix, ...args], { encoding: "utf8" });
};

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

/** Closes an agent's tab, which archives the agent, and returns the agent's id. */
async function closeTab(page: Page, agent: number): Promise<string> {
  const tab = agentTab(page, agent);
  const id = (await tab.getAttribute("data-testid"))!.slice("workspace-tab-agent_".length);
  await tab.hover();
  await page.getByTestId(`workspace-agent-close-${id}`).filter({ visible: true }).click();
  await expect(tab).toHaveCount(0);
  return id;
}

/** The titles of the closed tabs Cmd+Shift+T can reopen, the one closed last first. */
const closedTabs = (page: Page) =>
  page.evaluate(() =>
    (JSON.parse(localStorage.getItem("mru-switcher:closed") ?? "[]") as { title: string }[]).map(({ title }) => title),
  );

/** Whether the host holds an agent as archived. */
const archived = (page: Page, agentId: string) =>
  page.evaluate(async (id) => {
    type Host = (serverId: string) => {
      agents: { ref(id: string): { refresh(): Promise<{ agent: { archivedAt?: unknown } } | null> } };
    };
    const [host] = (window as unknown as { __mruSwitcher: { hosts: Set<Host> } }).__mruSwitcher.hosts;
    const found = await host(location.pathname.split("/")[2]).agents.ref(id).refresh();
    return Boolean(found?.agent.archivedAt);
  }, agentId);

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
  // The dot carries the status word as its tooltip.
  const status = `${await row.getAttribute("data-status")}: ${await row.locator("span").first().getAttribute("title")}`;
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
      // Beside the dot: how long ago each agent got its last prompt. The rig prompted them all just now.
      await expect(overlay.locator('[data-part="status"]')).toHaveText(mru.map(() => /^(just now|\d+m ago)$/));
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
    // A jump clicks a tab or asks the app to open the agent, so both workspaces stay mounted
    // and one is on screen. The URL route would have unmounted the other.
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

  await test.step("8. a closed tab leaves the list", async () => {
    await clickAgent(page, 3);
    await clickAgent(page, 4);
    const tab = agentTab(page, 3);
    await closeTab(page, 3);
    mru = mru.filter((stop) => stop !== 3);
    await expect.poll(async () => (await stored(page)).length).toBe(mru.length);
    await ctrlTab(page, 1); // to the tab viewed before Agent 3
    await expect(tab).toHaveCount(0);
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
    await expect(decks).toHaveCount(2); // not through the URL
    expect(await statusOf(page, 2)).toBe("attention: Ready to review");

    // After a reload alpha is not mounted.
    await ctrlTab(page, 1);
    expect(mru[0]).toBe(6);
    await page.reload();
    await pluginStarted(page);
    await expect(agentTab(page, 6)).toHaveAttribute("aria-selected", "true");
    await expect(decks).toHaveCount(1);
    await ctrlTab(page, 1);
    expect(mru[0]).toBe(4);
    await expect(decks).toHaveCount(2);
    expect(await statusOf(page, 2)).toBe("attention: Ready to review");
  });

  await test.step("11. the cards layout shows a split workspace as two panes", async () => {
    // The flag is a command-center item. It changes only how the overlay is drawn.
    await page.getByTestId("sidebar-search").click();
    const panel = page.getByTestId("command-center-panel");
    await panel.getByTestId("command-center-input").fill("Recent tabs");
    await panel.getByRole("button", { name: /^Recent tabs: switch between list and cards/ }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("mru-switcher:layout"))).toBe("cards");

    // Agent 4 moves into a second pane, to the right of the others.
    const panes = page.locator('[data-testid^="workspace-pane-"]').filter({ visible: true });
    await page.getByTestId("workspace-split-pane-menu").filter({ visible: true }).first().click();
    await page.getByTestId("workspace-split-pane-right").click();
    await expect(panes).toHaveCount(2);
    await agentTab(page, 4).click();
    await page.keyboard.press("Meta+Alt+Shift+ArrowRight");
    await expect(panes.last().locator('[aria-label="Agent 4"]')).toHaveCount(1);
    // A preview is taken a second after the last click on a tab.
    for (const agent of [4, 1]) {
      await agentTab(page, agent).click();
      await page.waitForTimeout(1500);
    }

    const cards = overlay.locator("> div");
    const cardOf = (agent: number) =>
      cards.filter({ has: page.locator(`[data-part="title"]:text-is("Agent ${agent}")`) });
    await openOverlay(page);
    await expect(overlay).toHaveAttribute("data-layout", "cards");
    await expect(cards).toHaveCount(6); // Agent 3 was archived
    await expect(cardOf(4)).toHaveAttribute("aria-selected", "true");
    for (const [agent, focused] of [[1, 0], [4, 1]]) {
      const copied = cardOf(agent).locator('[data-part="preview"] [data-pane]');
      await expect(copied).toHaveCount(2);
      await expect(copied.nth(focused)).toHaveAttribute("data-pane", "focused");
      await expect(copied.nth(1 - focused)).toHaveAttribute("data-pane", "");
    }
    const box = (await overlay.boundingBox())!;
    expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1400 && box.y + box.height <= 900).toBe(true);
    await page.keyboard.up("Control");
    await expect(overlay).toHaveCount(0);
    await expect.poll(async () => (await stored(page))[0]?.title).toBe("Agent 4");
    await expect(panes.last().locator("textarea").filter({ visible: true })).toBeFocused();

    // With the focus outside both panes, the tab recorded last still counts as the one on screen.
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.keyboard.press("Shift");
    await page.waitForTimeout(500);
    expect((await stored(page))[0]?.title).toBe("Agent 4");

    // A press on a card's preview jumps, here to the other workspace.
    await openOverlay(page);
    const card = (await cardOf(6).boundingBox())!;
    await page.mouse.move(card.x + 20, card.y + 20);
    await page.mouse.down();
    await expect(overlay).toHaveCount(0);
    await page.mouse.up();
    await page.keyboard.up("Control");
    await expect(page).toHaveURL(new RegExp(`/workspace/${beta}$`));
    await expect(agentTab(page, 6)).toHaveAttribute("aria-selected", "true");
    await expect.poll(async () => (await stored(page))[0]?.title).toBe("Agent 6");
  });

  await test.step("12. an agent archived elsewhere reads Gone and cannot be jumped to", async () => {
    // After a reload alpha is not mounted, so only its host knows that Agent 1 was archived.
    await page.reload();
    await pluginStarted(page);
    await expect(agentTab(page, 6)).toHaveAttribute("aria-selected", "true");
    const entry = (await stored(page)).find(({ title }) => title === "Agent 1")!;
    paseo("archive", entry.key.split("/")[1]);

    await openOverlay(page);
    const card = overlay.locator("> div").filter({ hasText: "Agent 1" });
    await expect(card).toHaveAttribute("data-status", "gone");
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await expect(overlay).toHaveCount(0);
    await page.mouse.up();
    await page.keyboard.up("Control");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(new RegExp(`/workspace/${beta}$`));
    await expect(agentTab(page, 6)).toHaveAttribute("aria-selected", "true");
    expect((await stored(page)).map(({ title }) => title)).not.toContain("Agent 1");
  });

  await test.step("13. Cmd+Shift+T reopens the tabs closed last, one per press", async () => {
    const terminals = page.locator('[data-testid^="workspace-tab-terminal_"]').filter({ visible: true });
    const callout = page.getByText("This agent is archived").filter({ visible: true });
    const reopen = () => page.keyboard.press("Meta+Shift+KeyT");
    // Agent 3's tab was closed in step 8. Agent 1 was archived by the CLI, which is not a closed tab.
    expect(await closedTabs(page)).toEqual(["Agent 3"]);

    // The app's New terminal holds the key until it is moved: the plugin leaves it alone.
    let count = await terminals.count();
    await reopen();
    await expect(terminals).toHaveCount(++count);
    expect(await closedTabs(page)).toEqual(["Agent 3"]);

    // Settings → Shortcuts writes this override. The app reads it when it starts.
    await page.evaluate(() =>
      localStorage.setItem(
        "@paseo:keyboard-shortcut-overrides",
        JSON.stringify({ "workspace-terminal-new-cmd-shift-t-mac": "Ctrl+Shift+T" }),
      ),
    );
    await page.reload();
    await pluginStarted(page);
    await expect(agentTab(page, 6)).toHaveCount(1);
    const five = await closeTab(page, 5);
    const seven = await closeTab(page, 7);
    await expect.poll(() => closedTabs(page)).toEqual(["Agent 7", "Agent 5", "Agent 3"]);
    await expect.poll(() => archived(page, five)).toBe(true);
    await expect.poll(() => archived(page, seven)).toBe(true);

    // Two quick presses reopen two tabs and land on the second.
    await reopen();
    await reopen();
    await expect(agentTab(page, 7)).toHaveCount(1);
    await expect(agentTab(page, 5)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => archived(page, five)).toBe(false);
    await expect.poll(() => archived(page, seven)).toBe(false);
    await expect(callout).toHaveCount(0);
    await expect.poll(() => closedTabs(page)).toEqual(["Agent 3"]);
    await expect(terminals).toHaveCount(count);

    // The third is in the other workspace, which the reload left unmounted.
    await reopen();
    await expect(page).toHaveURL(new RegExp(`/workspace/${alpha}$`));
    await expect(agentTab(page, 3)).toHaveAttribute("aria-selected", "true");
    const three = (await agentTab(page, 3).getAttribute("data-testid"))!.slice("workspace-tab-agent_".length);
    await expect.poll(() => archived(page, three)).toBe(false);
    await expect(callout).toHaveCount(0);
    expect(await closedTabs(page)).toEqual([]);

    // With nothing left to reopen the key does nothing, and New terminal has its new key.
    const tabs = page.locator('[data-testid^="workspace-tab-"]').filter({ visible: true });
    count = await tabs.count();
    await reopen();
    await page.waitForTimeout(500);
    await expect(tabs).toHaveCount(count);
    await expect(agentTab(page, 3)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Control+Shift+KeyT");
    await expect(tabs).toHaveCount(count + 1);

    // The narrow layout draws a menu in place of the tabs. No tab counts as closed.
    await page.setViewportSize({ width: 500, height: 900 });
    await expect(page.getByTestId("workspace-tab-switcher-trigger").filter({ visible: true })).toHaveCount(1);
    await page.keyboard.press("Shift");
    await page.waitForTimeout(1200);
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(agentTab(page, 3)).toHaveCount(1);
    await page.keyboard.press("Shift");
    await page.waitForTimeout(1200);
    expect(await closedTabs(page)).toEqual([]);

    // The command-center item does what the key does. Alt+Shift+W closes a tab outside Paseo.app.
    await agentTab(page, 4).click();
    const four = (await agentTab(page, 4).getAttribute("data-testid"))!.slice("workspace-tab-agent_".length);
    await page.keyboard.press("Alt+Shift+KeyW");
    await expect(agentTab(page, 4)).toHaveCount(0);
    await expect.poll(() => archived(page, four)).toBe(true);
    await page.getByTestId("sidebar-search").click();
    const panel = page.getByTestId("command-center-panel");
    await panel.getByTestId("command-center-input").fill("Reopen closed");
    await panel.getByRole("button", { name: /^Reopen closed agent tab/ }).click();
    await expect(agentTab(page, 4)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => archived(page, four)).toBe(false);
    await expect(callout).toHaveCount(0);
  });

  expect(errors).toEqual([]);
});
