import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { start, toggle } from "./client/web";

export default function contribute(client: PluginClientContext) {
  if (Platform.OS === "web") {
    client.addCommandCenterItem({
      id: "toggle",
      title: "Vim keys: turn off or on",
      icon: "Keyboard",
      context: "global",
      onSelect: toggle,
    });
  }
  return start();
}
