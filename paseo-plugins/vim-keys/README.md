# Vim keys for Paseo: the composer, the thread and the app

The box you write a message in takes Vim's keys: insert, normal and visual mode. From normal
mode Ctrl+K moves the keys to the agent thread above it, which Vim reads and searches, and
keys such as `gt` and Ctrl+L move between tabs, panes and workspaces.

- A composer starts in insert mode and types as before. Escape or Ctrl+[ enters normal mode.
- A label left of the context window meter names the mode: green INSERT, blue NORMAL, purple VISUAL.
- The label also shows the keys of a command under way.
- In normal mode the cursor is a blue block: the selected character, or a block caret on an empty line.
- Enter sends in every mode. After a message is sent from normal mode the composer is back in insert mode.
- Each composer keeps its own mode, undo list and place.

The command-center item "Vim keys: turn off or on" switches all of these keys for the
window. The switch is `localStorage["vim-keys:off"]`.

Paseo has a setting for the file editor only: Settings → Editor → Vim keybindings. It has
no setting, issue or pull request for the composer as of 2026-11-16. The discussion
[Vim-style navigation and input modes](https://github.com/getpaseo/paseo/discussions/4983)
is about moving between panes, and leaves the composer out.

## Escape and a running agent

Paseo binds Escape to Interrupt agent. With this plugin Escape in the composer and in the
thread is Vim's in every mode and never interrupts. The stop button still does, and so does
Escape while the focus is elsewhere or the keys are off. To free Escape everywhere, clear
Interrupt agent in Settings → Shortcuts.

## Keys

`client/vim.ts` is a small editor written for this plugin, not Vim. It knows the keys
below and nothing else, and reads no vimrc.

| Kind | Keys |
| --- | --- |
| Motions | `h j k l`, `w b e W B E`, `0 ^ $`, `gg G`, `f F t T ; ,`, `%`, `( )`, `{ }`, the arrows, Home, End |
| Search | `/ ? n N * #`, also after an operator and in visual mode |
| Operators | `d c y` with a motion or a text object, `dd cc yy`, `D C Y`, `x X s S` |
| Text objects | `iw aw iW aW`, `i" a" i' a'` and backticks, `i( a( ib`, `i[ a[`, `i{ a{ iB`, `i< a<`, `ip ap` |
| Insert | `i a I A o O` |
| Changes | `p P`, `r`, `~`, `J`, `u`, Ctrl+R, `.` |
| Visual | `v V`, Space as `v`, `o`, every motion and text object, `d x c s y p ~ u U J S` |
| Surround | `ds`, `cs`, `ys` with a motion or a text object, `yss`, `S` in visual mode |

A count works before a command, a motion and an operator: `3w`, `d2w`, `2dd`.

- `u` undoes one command, or one stay in insert mode. Cmd+Z keeps working and undoes the same edits one by one.
- `.` repeats the last change made in normal mode. A change made in visual mode is not repeated.
- While the app lists commands or files, the arrows and Enter are the list's. Escape leaves insert mode and keeps the text.
- A click moves the block. A drag, or Shift with an arrow, starts visual mode.
- Space in normal mode starts visual mode, unlike the Vim config, where it is the leader. After an operator, `f`, `t` or `r` it is a space.
- Space in visual mode does nothing, as in the config.
- `( )` move by sentence. One ends at `.`, `!` or `?` before a blank, and a paragraph and the empty line before it each start one, as in Vim.
- Cmd+V in normal mode lands before the block.
- A search in the composer moves the block and draws no matches. Enter ends the pattern and sends nothing.

## The thread

Ctrl+K in normal mode moves the keys to the thread above the composer, as `<C-k>` moves to
the window above in the Vim config. The cursor is the same blue block, and the label by the
context window meter keeps naming the mode.

| Kind | Keys |
| --- | --- |
| Leave | Ctrl+J returns to the composer. `i a I A o O` return and start to insert. A click leaves too |
| Move | `h l`, `w b e W B E`, `0 ^ $`, `gg G`, `f F t T ; ,`, `%`, `( )` by sentence, and `j k` by the lines of the page |
| Between messages | `{ }` move to the message before and after, the user's or the agent's. `[[ ]]` move to the user's only |
| Scroll | Ctrl+D, Ctrl+U, Ctrl+F, Ctrl+B, Ctrl+E, Ctrl+Y, `zt zz zb`, `H M L` |
| Select and yank | `v V`, Space, `o`, the text objects, `im` for a message and `am` for a turn, `y` with a motion, `yy`, `Y`, and Cmd+C in visual mode |
| Search | `/ ? n N * #` |
| Open | Enter presses what the cursor is on: "View turn details", a tool call, a link |

- The text is all the thread shows, in reading order: messages, their times, tool calls, the line under a turn.
- A paragraph, a list item and a table cell are one line each, however often the page wraps them.
- A key that would change the text does nothing. A yank lands on the system clipboard, where the composer's `p` finds it.
- `( )` stop at every sentence and at the start of every line, so at each paragraph, list item and tool call. They pass over the empty lines.
- `scrolloff` is 3 lines, as in the config.
- A cursor that moves up stops the app from following a reply as it grows. `G` follows again.
- `gg` goes to the top of what the app has loaded. The app then fetches the messages before it.

### Messages

The thread stays one text, so a search and a selection cross messages. `{ }` and `[[ ]]`
are the coarse steps through it: `[[` finds the last question, `}` the reply to it.

- A move lands on the first line of a message. A message that is not in view from start to end is scrolled to the top.
- `{ }` pass over tool calls, times and the line under a turn.
- A folded turn shows its last reply only, so `{ }` stop at that one. Enter on "View turn details" unfolds the rest.
- A turn is a message of the user and all that follows up to their next one. `yam` yanks it with its tool calls, `yim` one message alone.
- `im` takes nothing on a tool call, a time or the line under a turn.
- A move past the page has the app fetch older messages, as a search does. At the thread's start the label says "no earlier message".
- A count applies to messages on the page: `3[[` past the page finds the next one.
- In visual mode and after `y`, a move reaches the messages on the page only. `am` takes the part of a turn the page holds.

### Search

- `ignorecase` with `smartcase`, as in the config: `/zebra` finds `Zebra`, `/Zebra` does not find `zebra`.
- Matches are highlighted until Escape, and the view moves to the match while the pattern is typed.
- A pattern is Vim's, turned into a JavaScript one: `\( \) \| \+ \? \{ \}`, `\< \>`, `\v`, `\c`, `\C`. A pattern JavaScript rejects is searched as plain text.
- The label says when a search wrapped or found nothing.

A search covers the whole thread, which the page does not hold. The app loads the latest
messages only, and of a thread over 100 rows it draws the rows near the view. So when the
next match is not on the page, the search reads on a screen at a time and has the app fetch
older messages. The label says "searching older messages" meanwhile, and any key stops it.
In a thread of 70 turns each step to the next match took under a second, and "Pattern not
found" took three.

- Folded text is not searched: a turn behind "View turn details", the body of a tool call. Enter unfolds it.
- A search downward that wraps starts again at the top of what is loaded, not at the thread's first message.
- A count applies to matches on the page: `3n` past the page finds the next one.
- Cmd+F is still the app's Find, for plain text in user and assistant messages.

## Around the app

In normal mode, in a composer or a thread, these keys move around the app. Each presses the
app's own shortcut for it, so it does what that shortcut does.

| Keys | Does | The app's shortcut in Paseo.app |
| --- | --- | --- |
| Ctrl+H, Ctrl+J, Ctrl+K, Ctrl+L, or Ctrl+W then `h j k l` | Focus the pane on that side | Cmd+Shift+Arrow |
| `gt`, `gT` | The next and the previous tab | Alt+Shift+] and Alt+Shift+[, from Paseo 0.16.0 Cmd+Shift+] and Cmd+Shift+[ |
| `3gt` | Tab 3 | Cmd+Alt+3 |
| `]w`, `[w` | The next and the previous workspace | Cmd+] and Cmd+[ |
| Ctrl+W `v`, Ctrl+W `s` | Split the pane to the right, and down | Cmd+\ and Cmd+Shift+\ |

- The thread is the window above its composer: Ctrl+K from a composer goes to its thread, and from there to the pane above. Ctrl+J from a thread goes to its composer.
- Normal mode comes along: a composer that gets the focus this way is in normal mode.
- With no pane on that side nothing moves.
- A pane without a composer, such as a new tab, still takes Ctrl+H, J, K, L and Ctrl+W. A terminal keeps every key: leave it with the app's own shortcut.
- The label shows a command that waits for its next key: `NORMAL ]`.
- A shortcut changed in Settings → Shortcuts is pressed as changed, and one that was cleared there does nothing.
- Closing a tab or a pane has no key here: closing a tab archives its agent.

## What it takes from the Vim config

These follow `files/.vim/common.vim` and the Neovim config, where they apply to one box of text.

| Config | In the composer |
| --- | --- |
| `clipboard^=unnamed,unnamedplus` | A yank or a delete lands on the system clipboard, and `p` puts what the clipboard holds |
| `j` and `k` as `gj` and `gk` without a count | They move by the lines the composer wraps; with a count, by lines of text |
| `<C-h> <C-j> <C-k> <C-l>` move between windows | They move between panes, and between a composer and its thread |
| `incsearch`, `hlsearch`, `ignorecase`, `smartcase`, `scrolloff=3` | The thread's search and scrolling follow them |
| Escape clears the matches (Neovim), as vim-cool does | Escape in normal mode hides the thread's matches |
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
paseo plugin install ~/dotfiles/paseo-plugins/vim-keys
```

`install.sh` does this on macOS. The daemon runs the plugin from this directory and needs
no `npm install`. It loads plugins only when `pluginsEnabled` is `true` in
`~/.paseo/config.json`. After an edit, run `paseo plugin reload vim-keys`.

## App internals it leans on

Paseo 0.15.4 gives plugins no key bindings and no access to the composer's text or the
thread's. So `client/web.ts` listens for keys on the window and edits the composer's
`<textarea>`, and `client/thread.ts` reads the thread's text off the page. Rerun `e2e/run.sh`
after every Paseo upgrade. It fails when one of these changes.

| Internal | Used for |
| --- | --- |
| `message-input-root` around a `<textarea>` | Telling the composer from every other text field |
| The app skips its Escape shortcut while an element is `:popover-open` (`keyBelongsToDomPopover`) | Keeping Escape from the agent: the plugin holds an empty popover open while a composer has the focus |
| The composer follows `input` events from `document.execCommand("insertText")` | Writing an edit so that the app's draft and the browser's undo follow |
| `context-window-meter` | Placing the mode's label. Without it the label sits above the composer's right corner |
| `composer-autocomplete-popover` | Leaving the arrows to the list of commands or files |
| The composer empties its text after a send | Returning to insert mode |
| `agent-chat-scroll` inside `workspace-pane-*` | Finding the thread that belongs to a composer, and scrolling it |
| The app leaves plain keys alone while a text field has the focus (`keyboard/focus-scope.ts`) | In the thread the focus is in a hidden read-only field, so Escape, `?` and Space are not the app's |
| `user-message` and `assistant-message` around a message | Where a message starts and ends, and which is the user's, for `{ }`, `[[ ]]`, `im` and `am` |
| `user-message-trailing-row` inside the user's message | Keeping the time and the buttons under that message out of `im` |
| `data-history-row-id` on a row, and `data-index` on a row drawn only near the view | Parting rows with an empty line. Knowing that a match or a message may lie past rows that are not drawn |
| `load-older-history-spinner` | Waiting for the older messages a search or a move to a message asked for |
| The app stops following a reply after a `wheel` event upward on the thread | A scroll upward comes with such an event, or the app scrolls back down |
| A button around "View turn details" and around a tool call | Enter |
| The app's key listener answers a key event a script made (`dispatchEvent`) | Every key in "Around the app" |
| The ids and keys of the app's shortcuts (`keyboard/keyboard-shortcuts.ts`), listed in `client/keys.ts` | Pressing the shortcut of a pane, tab or workspace action |
| `localStorage["@paseo:keyboard-shortcut-overrides"]` | Pressing a shortcut as it was changed in Settings |
| The app moves between panes only while no text field has the focus, then focuses the pane it chose | The focus leaves the composer before the shortcut is pressed |

The browser does the rest: `caret-shape: block` draws the block on an empty line,
`Selection.modify` finds the wrapped lines, and `navigator.clipboard` is the clipboard. The
thread's cursor, selection and matches are CSS highlights (`CSS.highlights`), which colour
text and leave the page as it is.
Drop the plugin when Paseo ships Vim keys for the composer.

## Tests

```sh
npm install
npm run typecheck
npm test      # the editor, client/vim.test.ts
e2e/run.sh    # the app's shortcuts, then the released app in headless Chromium, about a minute
```

`e2e/run.sh` first runs `e2e/bindings.mjs`. Paseo.app binds other keys than a browser, and the
spec below runs in a browser. So the check fetches the shortcut code of the installed Paseo
version from GitHub and gives it the key event the plugin makes for each action in
`client/keys.ts`. It fails unless the app resolves each to that action, in Paseo.app and in a browser.

`e2e/run.sh` boots a throwaway daemon in a temp home on a free port, installs the plugin,
starts four agents in two workspaces and runs `e2e/keys.spec.ts`. It never touches `~/.paseo` or the live
daemon. It uses Paseo.app when it is installed and the `paseo` on the path otherwise, and
needs Playwright's Chromium (`npx playwright install chromium`).

- The agents use the mock provider, which costs no tokens and exists only in development mode.
- The agent Slow takes ten seconds per reply, so the spec can press Escape while it works.
- The agent Pages has five turns of thirty messages. The app loads its last turns only, so the spec's search has to fetch the first. The spec then reloads the page, and `[[` has to fetch them again.
- The spec's browser says it is a Mac: off a Mac the app binds Ctrl+K and has no shortcut for a pane.
- In a browser the app's shortcuts for a workspace and a numbered tab are Alt+], Alt+[ and Alt+Shift+3. The spec presses those. Paseo.app's own are never pressed: `e2e/bindings.mjs` covers them.
- Paseo 0.16.0 was not run in a browser. `e2e/bindings.mjs` passes on its shortcut code: in Paseo.app it moved the next and the previous tab to Cmd+Shift+] and Cmd+Shift+[ under new ids, which `client/keys.ts` lists.
- Paseo 0.16.0's source has the same test ids. Its key listener moved to `keyboard/internal/sources/dom.web.ts`, keeps the popover rule, and hides a key the app takes from every later listener (read on 2026-11-16).
- A thread long enough for the app to draw it in part was searched by hand on 2026-11-16: 70 turns, up and down through every match. The spec has no such thread, as it takes three minutes to build. `[[` was not tried in one.
- The spec ran on 2026-11-16 against the nix build of Paseo 0.15.4 on Linux, in Chromium 151, and against Paseo.app 0.15.4 on a Mac.
- That build's web UI crashes at the root, so the spec rewrites one reference in the bundle the browser receives.
- The spec grants itself the clipboard. Paseo.app decides on its own whether `p` may read it.
- `e2e/run.sh --keep` leaves the daemon up and prints its URL and the command that stops it.

## Not covered

- Paseo.app itself and physical key presses: check Escape, `dw`, `p` after a copy elsewhere, and Enter by hand after an install or an upgrade.
- Pressing Paseo.app's own shortcuts in the app: `e2e/bindings.mjs` checks them against the app's code only. Check `gt`, `]w` and `3gt` by hand after an upgrade.
- A shortcut changed in Settings → Shortcuts: the code reads it, and no test has changed one.
- The rest of the config: every mapping on the leader, and plugins for files, Git, completion and search.
- `:` commands, macros, marks, named registers, `>` and `<`, `gu`, `gU`, `g~`, `ge`, block-wise visual mode, replace mode.
- A search's offset (`/foo/e`), its history, and Vim's pattern atoms beyond those listed above.
- In the thread: a click or a drag does not move the cursor, it leaves the thread.
- In the thread: the cursor is not drawn on an empty line, where `w` and `b` stop.
- In the thread: a reply with a fenced code block or a table. The mock agent writes none, so the rig has not shown one.
- The thread of a terminal, a file or a browser tab: only an agent's thread is read.
- Windows and Linux desktops: there the app binds Ctrl+K, Ctrl+D, Ctrl+B, Ctrl+E and Ctrl+F, and those keys stay the app's. It has no shortcut for a pane there, so Ctrl+H and Ctrl+L do nothing.
- A browser without the CSS Custom Highlight API: the thread's keys work and nothing is drawn.
- vim-surround's tags (`t`), its word and sentence targets, and `ySS`.
- A count before `i`, `a`, `o` and `.` repeats nothing.
- `j` and `k` count their column in characters, so in a proportional font the block shifts sideways between lines.
- In the composer, `j` and `k` in visual mode and after an operator move by lines of text, as in the config.
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
