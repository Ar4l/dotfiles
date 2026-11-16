import { type PluginClientContext, getPaseoClient } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { reopenClosed, start, toggleCards } from "./client/web";

export default function contribute(client: PluginClientContext) {
  if (Platform.OS === "web") {
    client.addCommandCenterItem({
      id: "reopen-closed",
      title: "Reopen closed agent tab",
      icon: "Undo2",
      context: "global",
      onSelect: reopenClosed,
    });
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
