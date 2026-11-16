import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkNow, readStatus, replaceAgent, setPaused, startNow, tick } from "./server/runner";
import { checkRpc, pauseRpc, replaceAgentRpc, startRpc, statusRpc } from "./shared/status";

export default function contribute(server: PluginServerContext) {
  server.handle(statusRpc, () => readStatus());
  server.handle(pauseRpc, (input) => setPaused(input));
  server.handle(checkRpc, (input) => checkNow(input));
  server.handle(startRpc, (input) => startNow(input));
  server.handle(replaceAgentRpc, (input) => replaceAgent(input));
  tick("start");
  const timer = setInterval(() => tick("timer"), 30_000);
  return () => clearInterval(timer);
}
