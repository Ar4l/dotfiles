import { type PluginClientContext, getPaseoClient } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { start, toggleCards } from "./client/web";

export default function contribute(client: PluginClientContext) {
  if (Platform.OS === "web") {
    client.addCommandCenterItem({
      id: "toggle-cards",
      title: "Recent tabs: switch between list and cards",
      icon: "LayoutGrid",
      context: "global",
      onSelect: toggleCards,
    });
  }
  return start(getPaseoClient);
}
