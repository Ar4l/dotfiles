# Vim keys in the composer for Paseo

The box you write a message in takes Vim's keys: insert, normal and visual mode.

- A composer starts in insert mode and types as before. Escape or Ctrl+[ enters normal mode.
- A small label above the composer's right corner names the mode and the keys of a command under way.
- In normal mode the selected character is the block cursor.
- Enter sends in every mode. After a message is sent from normal mode the composer is back in insert mode.
- Each composer keeps its own mode, undo list and place.

The command-center item "Vim keys in the composer: turn off or on" switches the keys for
the window. The switch is `localStorage["composer-vim:off"]`.

Paseo has a setting for the file editor only: Settings → Editor → Vim keybindings. It has
no setting, issue or pull request for the composer as of 2026-11-16. The discussion
[Vim-style navigation and input modes](https://github.com/getpaseo/paseo/discussions/4983)
is about moving between panes, and leaves the composer out.

## Escape and a running agent

Paseo binds Escape to Interrupt agent. With this plugin Escape in the composer is Vim's in
every mode and never interrupts. The stop button still does, and so does Escape while the
focus is outside the composer or the keys are off. To free Escape everywhere, clear
Interrupt agent in Settings → Shortcuts.

## Keys

| Kind | Keys |
| --- | --- |
| Motions | `h j k l`, `w b e W B E`, `0 ^ $`, `gg G`, `f F t T ; ,`, `%`, `{ }`, the arrows, Home, End |
| Operators | `d c y` with a motion or a text object, `dd cc yy`, `D C Y`, `x X s S` |
| Text objects | `iw aw iW aW`, `i" a" i' a'` and backticks, `i( a( ib`, `i[ a[`, `i{ a{ iB`, `i< a<`, `ip ap` |
| Insert | `i a I A o O` |
| Changes | `p P`, `r`, `~`, `J`, `u`, Ctrl+R, `.` |
| Visual | `v V`, `o`, every motion and text object, `d x c s y p ~ u U J` |

A count works before a command, a motion and an operator: `3w`, `d2w`, `2dd`.

- `j` and `k` move by lines of the text, not by lines the composer wraps.
- `p` puts what Vim deleted or yanked last. The system clipboard stays with Cmd+C and Cmd+V.
- Paste in normal mode lands before the block.
- `u` undoes one command, or one stay in insert mode. Cmd+Z keeps working and undoes the same edits one by one.
- `.` repeats the last change made in normal mode. A change made in visual mode is not repeated.
- While the app lists commands or files, the arrows and Enter are the list's. Escape leaves insert mode and keeps the text.
- A click moves the block. A drag, or Shift with an arrow, starts visual mode.

## Install

```sh
paseo plugin install ~/dotfiles/paseo-plugins/composer-vim
```

`install.sh` does this on macOS. The daemon runs the plugin from this directory and needs
no `npm install`. It loads plugins only when `pluginsEnabled` is `true` in
`~/.paseo/config.json`. After an edit, run `paseo plugin reload composer-vim`.

## App internals it leans on

Paseo 0.15.4 gives plugins no key bindings and no access to the composer's text, so
`client/web.ts` listens for keys on the window and edits the composer's `<textarea>`. Rerun
`e2e/run.sh` after every Paseo upgrade. It fails when one of these changes.

| Internal | Used for |
| --- | --- |
| `message-input-root` around a `<textarea>` | Telling the composer from every other text field |
| The app skips its Escape shortcut while an element is `:popover-open` (`keyBelongsToDomPopover`) | Keeping Escape from the agent: the plugin holds an empty popover open while a composer has the focus |
| The composer follows `input` events from `document.execCommand("insertText")` | Writing an edit so that the app's draft and the browser's undo follow |
| `composer-autocomplete-popover` | Leaving the arrows to the list of commands or files |
| The composer empties its text after a send | Returning to insert mode |

`client/vim.ts` is the editor itself: a text, a cursor and keys, with no DOM. Drop the plugin
when Paseo ships Vim keys for the composer.

## Tests

```sh
npm install
npm run typecheck
npm test      # the editor, client/vim.test.ts
e2e/run.sh    # the released app in headless Chromium, about 45 s
```

`e2e/run.sh` boots a throwaway daemon in a temp home on a free port, installs the plugin,
starts two agents and runs `e2e/keys.spec.ts`. It never touches `~/.paseo` or the live
daemon. It uses Paseo.app when it is installed and the `paseo` on the path otherwise, and
needs Playwright's Chromium (`npx playwright install chromium`).

- The agents use the mock provider, which costs no tokens and exists only in development mode.
- The agent Slow takes ten seconds per reply, so the spec can press Escape while it works.
- The spec ran against the nix build of Paseo 0.15.4 on Linux on 2026-11-16, and not yet against Paseo.app.
- That build's web UI crashes at the root, so the spec rewrites one reference in the bundle the browser receives.
- `e2e/run.sh --keep` leaves the daemon up and prints its URL and the command that stops it.

## Not covered

- Paseo.app itself and physical key presses: check Escape, `dw` and Enter by hand after the install and after an upgrade.
- Search (`/ ? n *`), `:` commands, macros, marks, named registers, `>` and `<`, `gu`, `gU`, `g~`, `ge`, `gj`, `gk`.
- A count before `i`, `a`, `o` and `.` repeats nothing.
- An emoji counts as two characters for `h`, `l` and `x`.
- Input methods (Chinese, Japanese, dead keys): keys pressed while one composes are left alone, also in normal mode.
- Dictation: Escape does not cancel it while the composer has the focus. Dictated text can replace the block.
- Ctrl+[ on Windows and Linux desktops, where the app binds it to Previous workspace.
- A browser without the Popover API (before Safari 17, Firefox 125): Escape in the composer also interrupts.
- Mobile clients and touch keyboards: a composer never leaves insert mode there.
- The fullscreen composer and the New workspace composer: they use the same textarea, and the spec does not open them.
- Other text fields: the terminal, search boxes, the file editor.
