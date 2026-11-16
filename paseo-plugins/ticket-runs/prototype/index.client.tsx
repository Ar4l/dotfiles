import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon, SidebarRow } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { rememberedRun, summarize, useStatus } from "./client/data";
import { TicketRunsScreen } from "./client/screen";

const TITLE = "Ticket runs (prototype)";

function TicketRunsItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  const c = theme.colors;
  const status = useStatus(15_000);
  const summary = status.data ? summarize(status.data) : null;
  const trailing =
    summary && (summary.alert || summary.needsYou > 0) ? (
      <View
        accessible
        accessibilityLabel={[
          summary.alert === "failed" ? "a check failed" : summary.alert === "stale" ? "a run is stale" : null,
          summary.needsYou > 0 ? `${summary.needsYou} tickets need you` : null,
        ]
          .filter(Boolean)
          .join(", ")}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 8 }}
      >
        {summary.alert ? (
          <Icon name="TriangleAlert" size={14} color={summary.alert === "failed" ? c.statusDanger : c.statusWarning} />
        ) : null}
        {summary.needsYou > 0 ? (
          <Text style={{ color: c.statusWarning, fontSize: 13, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
            {summary.needsYou}
          </Text>
        ) : null}
      </View>
    ) : undefined;
  return (
    <SidebarRow
      icon="ListChecks"
      label={TITLE}
      active={currentScreen?.screenId === "runs"}
      onPress={() => {
        const run = rememberedRun();
        openScreen({ screenId: "runs", params: run ? { run } : undefined });
      }}
      trailing={trailing}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "runs", title: TITLE, Component: TicketRunsScreen });
  client.addSidebarHeaderItem({ id: "runs", title: TITLE, Component: TicketRunsItem });
  return () => {};
}
