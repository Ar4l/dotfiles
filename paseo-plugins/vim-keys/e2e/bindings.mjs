// Checks the shortcuts in client/keys.ts against the app's own shortcut code.
//
//   node e2e/bindings.mjs <folder with the app's keyboard-shortcuts.ts>
//
// The spec runs in a browser, where the app binds other keys than in Paseo.app. So for both,
// this gives the key event the plugin would make for each action to the function the app
// resolves a key with, and fails unless the app's answer is that action.
import { BINDINGS, eventInit } from "../client/keys.ts";

const { resolveKeyboardShortcut } = await import(`${process.argv[2]}/keyboard-shortcuts.ts`);

/** The app's action and payload for each of the plugin's. Tab 3 stands for a numbered tab. */
const WANT = {
  "pane-left": ["workspace.pane.focus.left"],
  "pane-down": ["workspace.pane.focus.down"],
  "pane-up": ["workspace.pane.focus.up"],
  "pane-right": ["workspace.pane.focus.right"],
  "tab-next": ["workspace.tab.navigate.relative", { delta: 1 }],
  "tab-previous": ["workspace.tab.navigate.relative", { delta: -1 }],
  "tab-index": ["workspace.tab.navigate.index", { index: 3 }],
  "workspace-next": ["workspace.navigate.relative", { delta: 1 }],
  "workspace-previous": ["workspace.navigate.relative", { delta: -1 }],
  "split-right": ["workspace.pane.split.right"],
  "split-down": ["workspace.pane.split.down"],
};
const say = (action, payload) => (payload ? `${action} ${JSON.stringify(payload)}` : action);

const wrong = [];
for (const desktop of [true, false]) {
  for (const [action, bindings] of Object.entries(BINDINGS)) {
    const want = say(...WANT[action]);
    // As replay() in client/app.ts: the first shortcut the app answers is the one pressed.
    let got = "none of its shortcuts answers";
    for (const [, keys] of bindings) {
      const { match } = resolveKeyboardShortcut({
        event: { ...eventInit(keys, 3), repeat: false },
        // The plugin presses a shortcut for a pane with the focus outside a text field. Paseo
        // 0.16.0 renamed `isDesktop`.
        context: { isMac: true, isDesktop: desktop, usesDesktopBindings: desktop, focusScope: "other", commandCenterOpen: false },
        chordState: { candidateIndices: [], step: 0, timeoutId: null },
        onChordReset() {},
      });
      if (!match) continue;
      got = `${keys} is ${say(match.action, match.payload)}`;
      if (say(match.action, match.payload) === want) got = null;
      break;
    }
    if (got) wrong.push(`${desktop ? "Paseo.app" : "a browser"}: ${action} should be ${want}, and ${got}`);
  }
}
if (wrong.length) {
  console.error(`The app's shortcuts differ from client/keys.ts on a Mac:\n  ${wrong.join("\n  ")}`);
  process.exit(1);
}
console.log(`The app answers all ${Object.keys(BINDINGS).length} shortcuts of client/keys.ts, in Paseo.app and in a browser on a Mac.`);
