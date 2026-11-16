import { start } from "./client/web";

// The plugin API has no key bindings or tab events, so there is nothing to contribute: the
// switcher lives in client/web.ts and this returns its cleanup.
export default function contribute() {
  return start();
}
