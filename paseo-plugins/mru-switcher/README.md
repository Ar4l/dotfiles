# Recent tabs switcher for Paseo

Ctrl+Tab switches between the agent tabs and workspaces you viewed most recently, like
Arc or Alt+Tab.

- Tap Ctrl+Tab to return to the previous tab. Tap again to come back.
- Hold Ctrl and tap Tab to walk a list of the last seven. Release Ctrl to jump.
- Shift+Tab walks back. Escape closes the list and stays put.
- Move the pointer over a row to select it. Press a row to jump to it at once.

Each row shows the tab's title, its project and workspace, and what the agent is doing in
the app's own words and colours: Needs input, Failed, Working, Ready to review, Done.

The list holds 20 entries, lives in the window's `localStorage` and survives a reload.
An agent tab is one entry. Any other tab (terminal, file, browser) counts as its workspace.

## Cost

Nothing the switcher does grows with the number of agents or workspaces. The times are
from Ctrl up to the tab selected, in the rig below.

- A jump inside a workspace clicks the tab: 6 ms.
- A jump to another workspace clicks its sidebar row and the tab: 9 ms while the app has that workspace mounted.
- The app keeps the last 10 workspaces mounted. A jump to one outside those took 100 to 130 ms.
- Opening the list asks each listed agent's host for its status: at most seven requests.
- The plugin reads the DOM twice after a click or a shortcut, and every 30 ms during a jump. It runs no timer otherwise.

## Install

```sh
paseo plugin install ~/dotfiles/paseo-plugins/mru-switcher
```

`install.sh` does this on macOS. The daemon runs the plugin from this directory and needs
no `npm install`. It loads plugins only when `pluginsEnabled` is `true` in
`~/.paseo/config.json`. After an edit, run `paseo plugin reload mru-switcher`.

## App internals it leans on

Paseo 0.15.4 gives plugins no key bindings, tab events or navigation to an agent, so
`client/web.ts` reads the app's DOM and URL and clicks its controls. Rerun `e2e/run.sh`
after every Paseo upgrade; it fails when one of these changes.

| Internal | Used for |
| --- | --- |
| Path `/h/<server>/workspace/<workspace>` | Knowing which workspace is on screen |
| `workspace-tab-<tab>` with `aria-selected` and `aria-label` | The selected tab and its title; `agent_<id>` marks an agent tab; clicked to jump |
| `sidebar-workspace-row-<server>:<workspace>` | Clicked to jump to another workspace |
| `workspace-deck-entry-<server>:<workspace>` | Finding a workspace's tabs, mounted or on screen |
| `workspace-pane-*` | Picking the focused pane when panes are split |
| `workspace-header-subtitle`, `workspace-header-title` | The project and workspace names in the list |
| Path `/h/<server>/agent/<agent>` | The fallback jump: the app redirects it to the agent's workspace and selects its tab |
| `deriveAgentStateBucket`, `status-dot-color.ts` | The status rules in `client/mru.ts` and the colours in `client/overlay.ts` are copies |

Agent state comes from the plugin SDK (`getPaseoClient(serverId).agents`), which is public.
Drop the internals when Paseo ships a built-in switcher or plugin key bindings.

## How a jump works

A jump clicks what you would click. Inside a workspace that is the tab. For another
workspace it is the sidebar row and the tab in the same tick, so the app renders once.

A sidebar row opens its workspace on an unread agent when it has one, and showing an agent
marks it read. The tab click in the same tick keeps a mounted workspace from showing that
agent. A workspace that is not mounted has no tab to click yet, so the plugin first asks
the host for its unread agents (one request, 33 ms in the rig).

The jump falls back to the entry's URL (`history.pushState` plus a `popstate` event, which
Expo Router follows) in four cases:

- The tab was closed. The URL reopens it.
- The sidebar has no row for the workspace, for example while it is hidden.
- The workspace is not mounted and holds another unread agent, or its host does not answer in 250 ms.
- The click has not landed after 1.2 s.

The URL route took 125 ms in the rig and about a second in Paseo.app with 30 agents. It
unmounts every other workspace, so the next jump to each of them is slow once.

## Tests

```sh
npm install
npm run typecheck
npm test      # list and key logic, client/mru.test.ts
e2e/run.sh    # the released app in headless Chromium, about 50 s
```

`e2e/run.sh` boots a throwaway daemon in a temp home on a free port, installs the plugin,
seeds seven agents in two workspaces and runs `e2e/switcher.spec.ts`. It never touches
`~/.paseo` or the live daemon. It needs Paseo.app, and Playwright's Chromium
(`npx playwright install chromium`).

- The agents use the mock provider, which costs no tokens and exists only in development mode.
- Agent 2 takes ten seconds per reply, so the spec can catch it working and then unread.
- The `paseo` launcher pins `PASEO_NODE_ENV=production`, so the script starts the app's CLI entrypoint itself.
- The script starts the daemon with `nohup` and stops it on exit.
- `e2e/run.sh --keep` leaves the daemon up and prints its URL and the command that stops it.

## Not covered

- Paseo.app itself: the rig drives the app's bundle in Chromium, so check Ctrl+Tab by hand after an upgrade.
- Focus inside an embedded browser tab: the webview keeps its own key events.
- Mobile clients: the plugin does nothing there.
- Separate entries for terminal and file tabs.
- A workspace entry opens like its sidebar row, so it lands on the workspace's unread agent when it has one.
- An agent that turns unread between the host's answer and the jump is shown for a moment and marked read.
- An agent on an offline host shows no status.
