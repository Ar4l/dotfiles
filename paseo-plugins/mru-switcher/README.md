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
An agent leaves the list when it is archived or deleted. Closing an agent's tab archives it.

## Cost

The list is capped at 20 entries and the overlay at seven, whatever the number of agents,
workspaces and hosts. The times are from Ctrl up to the tab selected, in the rig below.

- A jump inside a workspace clicks the tab: 4 to 6 ms.
- A jump to another workspace asks the app to open the agent: 3 to 9 ms while the app has that workspace mounted.
- The app keeps a workspace mounted for 10 minutes after you leave it, and at most 10 of them.
- A jump to a workspace the app has dropped took 42 to 49 ms.
- A tap asks one host for one agent's status. Drawing the list asks for the other six. No status is asked twice in a second.
- The plugin reads the DOM 150 ms and 1 s after a pointer release, a history change, or the release of a named or modified key.
- During a jump it reads the DOM every 30 ms. It runs no timer otherwise.
- A read is a few selector queries over the document. One took 12 µs with 1,470 elements mounted, and grows with that number.
- A listed agent whose tab is missing from a mounted workspace costs one status request after each burst of clicks or keys.

## Cards layout (experimental, off by default)

The overlay can draw the recent tabs as a row of cards, each with a small picture of its
workspace above the title. A split workspace shows its panes, and the panes the tab is not
in are dimmed. Keys, hover and press work as in the list.

Turn it on with the command-center item "Recent tabs: switch between list and cards", or
set `localStorage["mru-switcher:layout"]` to `cards`. The item switches without a message.
The next Ctrl+Tab shows the result.

Plugins have no screenshot API, so the picture is a copy of the workspace's DOM
(`cloneNode`), scaled down with a CSS transform. The plugin takes the copy one second after
your last click or shortcut, when the browser is idle. It keeps copies in memory for the
seven listed entries only, and never writes them to storage.

- A card is empty until its tab has been on screen for a second. Copies do not survive a reload.
- A picture shows the tab a second after your last click on it, not what the agent wrote since.
- Terminals are blank: xterm draws on a canvas, and a copied canvas is empty.
- Browser tabs, iframes and videos are left out of the copy.
- Seven cards share the window's width, so each is about 160 px wide in a 1400 px window.

The costs below are from the rig with seven cards, six of them with a picture, about 5,800
copied elements in all.

- Taking a copy of a workspace of 1,100 elements: 1 to 2 ms, or 2 to 4 ms at 4x CPU throttle.
- The cards appear in the first frame. The pictures follow one per frame: all six after 110 to 130 ms, 400 ms at 4x.
- A frame that adds a picture took 17 to 26 ms, or 25 to 68 ms at 4x. A Tab pressed then waits that long.
- A jump after the cards were drawn is 10 ms slower than from the list (17 ms at 4x): the copies leave the document.
- A quick Ctrl+Tab never draws the overlay and costs what it costs with the list.
- With the layout off, the only extra work is reading the `localStorage` key after a click and when the list opens.

## Install

```sh
paseo plugin install ~/dotfiles/paseo-plugins/mru-switcher
```

`install.sh` does this on macOS. The daemon runs the plugin from this directory and needs
no `npm install`. It loads plugins only when `pluginsEnabled` is `true` in
`~/.paseo/config.json`. After an edit, run `paseo plugin reload mru-switcher`.

## App internals it leans on

Paseo 0.15.4 gives plugins no key bindings, tab events or navigation to an agent, so
`client/web.ts` reads the app's DOM and URL, clicks its tabs and raises one of its window
events. Rerun `e2e/run.sh` after every Paseo upgrade. It fails when one of these changes.
In the app, a renamed test id shows as a Ctrl+Tab that does nothing.

| Internal | Used for |
| --- | --- |
| Path `/h/<server>/workspace/<workspace>` | Knowing which workspace is on screen |
| `workspace-tab-<tab>` with `aria-selected` and `aria-label` | The selected tab and its title; `agent_<id>` marks an agent tab; clicked to jump |
| Window event `paseo:web-notification-click` with `{ serverId, agentId }` | Opening an agent: the app raises it for a click on a notification |
| `sidebar-workspace-row-<server>:<workspace>` | Clicked to jump to a workspace entry |
| `workspace-deck-entry-<server>:<workspace>` | Finding a workspace's tabs, mounted or on screen; copied for a card's picture |
| `workspace-pane-*` | Telling the panes of a split apart; dimming the other panes in a picture |
| Styles set by class names (React Native Web) | A copy of a workspace looks the same outside the app's tree |
| `workspace-header-subtitle`, `workspace-header-title` | The project and workspace names in the list |
| Path `/h/<server>/agent/<agent>` | The last resort when the app does not take the event |
| `deriveAgentStateBucket`, `status-dot-color.ts` | The status rules in `client/mru.ts` and the light and dark dot colours in `client/overlay.ts` are copies |

Agent state comes from the plugin SDK (`getPaseoClient(serverId).agents`), which is public.
Drop the internals when Paseo ships a built-in switcher or plugin key bindings.

## How a jump works

A jump to a tab of the workspace on screen clicks that tab.

Any other jump to an agent dispatches `paseo:web-notification-click` on `window`. The app
shows the agent's workspace, selects its tab and focuses its pane. The other workspaces
stay mounted and their unread agents stay unread. The app cancels the event when it takes
it. When it does not, the plugin pushes the agent's URL (`history.pushState` plus a
`popstate` event, which Expo Router follows). The URL route is slower and unmounts every
other workspace.

A jump to a workspace entry clicks its sidebar row, or pushes the workspace URL when the
sidebar has no row for it.

With split panes, the tab on screen is the selected tab of the pane that holds the keyboard
focus. When the focus is outside the panes, it is the tab the plugin recorded last.

The plugin asks the host about an agent before it draws the list, and when the agent's tab
is missing from a mounted workspace. An agent that is archived or deleted leaves the list.
One that leaves while the list is drawn reads Gone, and a jump to it does nothing.

## Tests

```sh
npm install
npm run typecheck
npm test      # list and key logic, client/mru.test.ts
e2e/run.sh    # the released app in headless Chromium, about 50 s
```

`e2e/run.sh` boots a throwaway daemon in a temp home on a free port, installs the plugin,
seeds seven agents in two workspaces and runs `e2e/switcher.spec.ts`. It never touches
`~/.paseo` or the live daemon. The spec covers one host at desktop width. It needs Paseo.app, and Playwright's Chromium
(`npx playwright install chromium`).

- The agents use the mock provider, which costs no tokens and exists only in development mode.
- Agent 2 takes ten seconds per reply, so the spec can catch it working and then unread.
- The `paseo` launcher pins `PASEO_NODE_ENV=production`, so the script starts the app's CLI entrypoint itself.
- The script starts the daemon with `nohup` and stops it on exit.
- The spec archives an agent with the rig's own CLI, to play a change made outside the window.
- `e2e/run.sh --keep` leaves the daemon up and prints its URL and the command that stops it.

## Not covered

- Paseo.app itself: the rig drives the app's bundle in Chromium, so check Ctrl+Tab by hand after an upgrade.
- The narrow layout: it has no tab strip, so the plugin records nothing and Ctrl+Tab does nothing.
- Several hosts: the rig has one. Each host that serves the plugin restarts the switcher when it loads it.
- An offline host: its agents show no status, and the app decides what a jump to one shows.
- Focus inside an embedded browser tab: the webview keeps its own key events.
- Mobile clients: the plugin does nothing there.
- Separate entries for terminal and file tabs.
- A workspace entry opens like its sidebar row, so it lands on the workspace's unread agent when it has one.
- A tap released before the host answers can reopen an agent archived from another window or the CLI.
- Two windows share one list in `localStorage`. The window that wrote last wins.
- The cards layout in Paseo.app and in Safari. Each host that serves the plugin adds its own command-center item.
