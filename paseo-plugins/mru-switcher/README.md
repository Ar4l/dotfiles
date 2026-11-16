# Recent tabs switcher for Paseo

Ctrl+Tab switches between the agent tabs and workspaces you viewed most recently, like
Arc or Alt+Tab.

- Tap Ctrl+Tab to return to the previous tab. Tap again to come back.
- Hold Ctrl and tap Tab to walk a list of the last seven. Release Ctrl to jump.
- Shift+Tab walks back. Escape closes the list and stays put.

The list holds 20 entries, lives in the window's `localStorage` and survives a reload.
An agent tab is one entry. Any other tab (terminal, file, browser) counts as its workspace.

## Install

```sh
paseo plugin install ~/dotfiles/paseo-plugins/mru-switcher
```

`install.sh` does this on macOS. The daemon runs the plugin from this directory and needs
no `npm install`. It loads plugins only when `pluginsEnabled` is `true` in
`~/.paseo/config.json`. After an edit, run `paseo plugin reload mru-switcher`.

## App internals it leans on

Paseo 0.15.4 gives plugins no key bindings, tab events or navigation to an agent, so
`client/web.ts` reads the app's DOM and URL. Rerun `e2e/run.sh` after every Paseo upgrade;
it fails when one of these changes.

| Internal | Used for |
| --- | --- |
| Path `/h/<server>/workspace/<workspace>` | Knowing which workspace is on screen |
| `[data-testid^="workspace-tab-"][aria-selected="true"]` | The selected tab; `agent_<id>` marks an agent tab |
| Path `/h/<server>/agent/<agent>` | Jumping: the app redirects it to the agent's workspace and selects its tab |
| `workspace-deck-entry-<server>:<workspace>` | Ignoring the old screen while the URL has changed and the screen has not |
| `workspace-pane-*` | Picking the focused pane when panes are split |

A jump is `history.pushState` to the entry's path plus a `popstate` event, which Expo
Router follows. Drop the internals when Paseo ships a built-in switcher or plugin key
bindings.

## Tests

```sh
npm install
npm run typecheck
npm test      # list and key logic, client/mru.test.ts
e2e/run.sh    # the released app in headless Chromium, about 30 s
```

`e2e/run.sh` boots a throwaway daemon in a temp home on a free port, installs the plugin,
seeds seven agents in two workspaces and runs `e2e/switcher.spec.ts`. It never touches
`~/.paseo` or the live daemon. It needs Paseo.app, and Playwright's Chromium
(`npx playwright install chromium`).

- The agents use the mock provider, which costs no tokens and exists only in development mode.
- The `paseo` launcher pins `PASEO_NODE_ENV=production`, so the script starts the app's CLI entrypoint itself.
- The script starts the daemon with `nohup` and stops it on exit.
- `e2e/run.sh --keep` leaves the daemon up and prints its URL and the command that stops it.

## Not covered

- Paseo.app itself: the rig drives the app's bundle in Chromium, so check Ctrl+Tab by hand after an upgrade.
- Focus inside an embedded browser tab: the webview keeps its own key events.
- Mobile clients: the plugin does nothing there.
- Separate entries for terminal and file tabs.
