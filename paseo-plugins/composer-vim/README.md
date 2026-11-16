# Vim keys in the composer for Paseo

The box you write a message in takes Vim's keys: insert, normal and visual mode.

- A composer starts in insert mode and types as before. Escape or Ctrl+[ enters normal mode.
- A label left of the context window meter names the mode: green INSERT, blue NORMAL, purple VISUAL.
- The label also shows the keys of a command under way.
- In normal mode the cursor is a blue block: the selected character, or a block caret on an empty line.
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

`client/vim.ts` is a small editor written for this plugin, not Vim. It knows the keys
below and nothing else, and reads no vimrc.

| Kind | Keys |
| --- | --- |
| Motions | `h j k l`, `w b e W B E`, `0 ^ $`, `gg G`, `f F t T ; ,`, `%`, `{ }`, the arrows, Home, End |
| Operators | `d c y` with a motion or a text object, `dd cc yy`, `D C Y`, `x X s S` |
| Text objects | `iw aw iW aW`, `i" a" i' a'` and backticks, `i( a( ib`, `i[ a[`, `i{ a{ iB`, `i< a<`, `ip ap` |
| Insert | `i a I A o O` |
| Changes | `p P`, `r`, `~`, `J`, `u`, Ctrl+R, `.` |
| Visual | `v V`, `o`, every motion and text object, `d x c s y p ~ u U J S` |
| Surround | `ds`, `cs`, `ys` with a motion or a text object, `yss`, `S` in visual mode |

A count works before a command, a motion and an operator: `3w`, `d2w`, `2dd`.

- `u` undoes one command, or one stay in insert mode. Cmd+Z keeps working and undoes the same edits one by one.
- `.` repeats the last change made in normal mode. A change made in visual mode is not repeated.
- While the app lists commands or files, the arrows and Enter are the list's. Escape leaves insert mode and keeps the text.
- A click moves the block. A drag, or Shift with an arrow, starts visual mode.
- Cmd+V in normal mode lands before the block.

## What it takes from the Vim config

These follow `files/.vim/common.vim` and the Neovim config, where they apply to one box of text.

| Config | In the composer |
| --- | --- |
| `clipboard^=unnamed,unnamedplus` | A yank or a delete lands on the system clipboard, and `p` puts what the clipboard holds |
| `j` and `k` as `gj` and `gk` without a count | They move by the lines the composer wraps; with a count, by lines of text |
| Space is the leader | Space moves nowhere |
| Shift+Enter is `O<Esc>j` | An empty line above, the cursor stays on its line |
| vim-surround, with vim-repeat | `ds"`, `cs"'`, `ysiw)`, `yss]`, visual `S`, and `.` repeats them |
| Neovim's `Y` | `y$` |
| `autoindent`, `nojoinspaces` | `o` and `O` keep the indent; `J` joins with one space |

- Enter sends the message. The config's Enter, an empty line below, is not taken.
- An opening bracket surrounds with a space inside, a closing one or `b B r a` without, as in vim-surround.
- Clipboard text that ends with a line break is put as lines.
- `p` waits up to 300 ms for the clipboard, then puts what Vim yanked last.

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
| `context-window-meter` | Placing the mode's label. Without it the label sits above the composer's right corner |
| `composer-autocomplete-popover` | Leaving the arrows to the list of commands or files |
| The composer empties its text after a send | Returning to insert mode |

The browser does the rest: `caret-shape: block` draws the block on an empty line,
`Selection.modify` finds the wrapped lines, and `navigator.clipboard` is the clipboard.
Drop the plugin when Paseo ships Vim keys for the composer.

## Tests

```sh
npm install
npm run typecheck
npm test      # the editor, client/vim.test.ts
e2e/run.sh    # the released app in headless Chromium, about a minute
```

`e2e/run.sh` boots a throwaway daemon in a temp home on a free port, installs the plugin,
starts two agents and runs `e2e/keys.spec.ts`. It never touches `~/.paseo` or the live
daemon. It uses Paseo.app when it is installed and the `paseo` on the path otherwise, and
needs Playwright's Chromium (`npx playwright install chromium`).

- The agents use the mock provider, which costs no tokens and exists only in development mode.
- The agent Slow takes ten seconds per reply, so the spec can press Escape while it works.
- The spec ran against the nix build of Paseo 0.15.4 on Linux on 2026-11-16, in Chromium 151, and not yet against Paseo.app.
- That build's web UI crashes at the root, so the spec rewrites one reference in the bundle the browser receives.
- The spec grants itself the clipboard. Paseo.app decides on its own whether `p` may read it.
- `e2e/run.sh --keep` leaves the daemon up and prints its URL and the command that stops it.

## Not covered

- Paseo.app itself and physical key presses: check Escape, `dw`, `p` after a copy elsewhere, and Enter by hand after an install or an upgrade.
- The rest of the config: mappings on the leader, windows and buffers, and plugins for files, Git, completion and search.
- Search (`/ ? n *`), `:` commands, macros, marks, named registers, `>` and `<`, `gu`, `gU`, `g~`, `ge`, block-wise visual mode, replace mode.
- vim-surround's tags (`t`), its word and sentence targets, and `ySS`.
- A count before `i`, `a`, `o` and `.` repeats nothing.
- `j` and `k` count their column in characters, so in a proportional font the block shifts sideways between lines.
- `j` and `k` in visual mode and after an operator move by lines of text, as in the config.
- A browser whose `Selection.modify` skips text fields: `j` and `k` move by lines of text.
- A browser without `caret-shape`: an empty line shows a thin caret in normal mode, and the label tells the mode.
- A browser that refuses the clipboard: `p` puts what Vim yanked last, and a yank stays inside Vim.
- An emoji counts as two characters for `h`, `l` and `x`.
- Input methods (Chinese, Japanese, dead keys): keys pressed while one composes are left alone, also in normal mode.
- Dictation: Escape does not cancel it while the composer has the focus. Dictated text can replace the block.
- Ctrl+[ on Windows and Linux desktops, where the app binds it to Previous workspace.
- A browser without the Popover API: Escape in the composer also interrupts.
- Mobile clients and touch keyboards: a composer never leaves insert mode there.
- The fullscreen composer and the New workspace composer: they use the same textarea, and the spec does not open them.
- Other text fields: the terminal, search boxes, the file editor.
