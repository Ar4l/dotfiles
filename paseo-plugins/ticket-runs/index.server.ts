import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkNow, readStatus, replaceAgent, setPaused, startNow } from "./server/runner";
import { checkRpc, pauseRpc, replaceAgentRpc, startRpc, statusRpc } from "./shared/status";

/** The plugin draws the state files of run_tickets.py and calls that script; it holds no rules. */
export default function contribute(server: PluginServerContext) {
  server.handle(statusRpc, () => readStatus());
  server.handle(pauseRpc, (input) => setPaused(input));
  server.handle(checkRpc, (input) => checkNow(input));
  server.handle(startRpc, (input) => startNow(input));
  server.handle(replaceAgentRpc, (input) => replaceAgent(input));
  return () => {};
}
