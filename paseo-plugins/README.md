# Paseo plugins

Each folder is a plugin for [Paseo](https://paseo.sh). A Paseo daemon runs a plugin
straight from this checkout, with no build step and no `npm install`.

| Plugin | Does | Install on |
| --- | --- | --- |
| [`mru-switcher`](mru-switcher/README.md) | Ctrl+Tab switches between the tabs you viewed last | the Mac |
| [`ticket-runs`](ticket-runs/README.md) | One agent per ready Linear sub-ticket, and a screen that shows them | every machine whose daemon the app connects to |

## Install

`install.sh` installs the plugins a machine needs. By hand, on the machine whose daemon
should serve the plugin:

```sh
git -C ~/dotfiles pull
paseo plugin install ~/dotfiles/paseo-plugins/<name>
paseo plugin ls                # the plugin shows as "running"
```

- A daemon loads plugins only when `pluginsEnabled` is `true` in `~/.paseo/config.json`.
  Plugins run unsandboxed, so `install.sh` leaves that switch to you: Settings > Plugins.
- The app shows a plugin's screen and sidebar row for the machine you are looking at. Install
  `ticket-runs` on every machine, or its sidebar row goes when you open another machine's workspace.
- `ticket-runs` also has a timer, on the machine that holds the runs. `make restow` links
  its units and `systemctl --user enable --now ticket-runs.timer` starts it.
- Enable a unit by its name. Given a path, systemd writes an absolute link into
  `~/.config/systemd/user`, and `make restow` then stops with "not owned by stow".

## Update and remove

```sh
git -C ~/dotfiles pull && paseo plugin reload <name>   # after any change to a plugin
paseo plugin logs <name>                               # when it shows as "failed"
paseo plugin remove <name>                             # the folder stays
```

A reload is enough: a restart of the daemon stops every agent on the machine.

## Work on a plugin

```sh
cd ~/dotfiles/paseo-plugins/<name>
npm install          # packages for the typecheck and tests only; git ignores node_modules
npm run typecheck
npm test
```

- A plugin has `paseo-plugin.json`, `index.client.tsx` for the app, `index.server.ts` for the
  daemon, and the folders `client/`, `server/` and `shared/`.
- The installed SDK decides what a plugin can call: `node_modules/@getpaseo/plugin`, pinned
  to the Paseo version in `package.json`. Paseo's public docs describe newer calls.
- Each plugin's README says how it was tested and what to rerun after a Paseo upgrade.
