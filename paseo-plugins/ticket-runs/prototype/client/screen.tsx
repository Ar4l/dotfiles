import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Loading, Modal, ScrollView, useToast } from "@getpaseo/plugin/client/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType, type TextStyle, type ViewStyle } from "react-native";
import { checkRpc, pauseRpc, replaceAgentRpc, startRpc, type Health, type Run, type Ticket } from "../shared/status";
import {
  STATUS_KEY,
  dependencyTree,
  groupsOf,
  needsYouCount,
  orderedRuns,
  rememberRun,
  rememberedRun,
  rowDetail,
  statusMark,
  useStatus,
  type Group,
  type Tone,
  type TreeNode,
} from "./data";
import { clock, span } from "./time";

/** A group with more rows than this starts collapsed. Applies to "Needs you" and "Blocked". */
const OPEN_UP_TO = 10;
const MAIN_MAX_WIDTH = 860;
const DETAILS_WIDTH = 340;
/** Pane width from which the details sit beside the list; below it they open as a sheet. */
const SIDE_DETAILS_FROM = 980;

/** Whether the details column was last shown; kept while the app runs. */
let detailsShown = false;

type Colors = PluginTheme["colors"];

function toneColor(c: Colors, tone: Tone): string {
  if (tone === "success") return c.statusSuccess;
  if (tone === "warning") return c.statusWarning;
  if (tone === "danger") return c.statusDanger;
  return c.foregroundMuted;
}

function makeStyles(c: Colors, compact: boolean) {
  const view = <T extends Record<string, ViewStyle>>(styles: T) => styles;
  const text = <T extends Record<string, TextStyle>>(styles: T) => styles;
  const inset = compact ? 8 : 10;
  return {
    ...view({
      screen: { flex: 1, backgroundColor: c.surface0 },
      content: {
        width: "100%",
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 28,
        paddingHorizontal: compact ? 8 : 24,
        paddingTop: compact ? 10 : 18,
        paddingBottom: 48,
      },
      main: { flex: 1, minWidth: 0, gap: compact ? 12 : 14 },
      tabs: { flexGrow: 0 },
      tabsContent: { gap: 4, paddingHorizontal: compact ? 4 : 0 },
      tab: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: compact ? 32 : 28,
        paddingHorizontal: 12,
        borderRadius: 16,
      },
      head: { gap: 4, paddingHorizontal: inset },
      headTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
      headButtons: { flexDirection: "row", alignItems: "center", gap: 2 },
      healthLine: { flexDirection: "row", alignItems: "center", gap: 6 },
      iconButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
      pressed: { backgroundColor: c.surface2 },
      dim: { opacity: 0.5 },
      group: { gap: 0 },
      groupHead: {
        paddingHorizontal: inset,
        paddingVertical: compact ? 8 : 0,
        minHeight: 32,
        justifyContent: "center",
        gap: 2,
        borderRadius: 6,
        backgroundColor: c.surface1,
      },
      groupHeadLine: { flexDirection: "row", alignItems: "center", gap: 8 },
      row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: compact ? 48 : 36,
        paddingVertical: compact ? 6 : 0,
        paddingLeft: inset,
        paddingRight: compact ? 2 : 4,
      },
      rowBody: { flex: 1, minWidth: 0, gap: 1 },
      rowLine: { flexDirection: "row", alignItems: "center", gap: 8 },
      markSlot: { width: 16, alignItems: "center" },
      divider: { height: 1, backgroundColor: c.border, marginLeft: inset, opacity: 0.6 },
      more: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
      textButton: {
        height: 26,
        paddingHorizontal: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: c.border,
        justifyContent: "center",
        marginRight: compact ? 6 : 2,
      },
      details: { width: DETAILS_WIDTH, gap: 24, paddingLeft: 24, borderLeftWidth: 1, borderLeftColor: c.border },
      detailsSheet: { gap: 24 },
      section: { gap: 8 },
      treeRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 26 },
      treeChildren: { marginLeft: 7, paddingLeft: 9, borderLeftWidth: 1, borderLeftColor: c.border },
      recentRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 30, borderRadius: 6 },
      rules: { gap: 6 },
      modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
      button: {
        alignItems: "center",
        justifyContent: "center",
        height: 40,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.border,
        flexGrow: compact ? 1 : 0,
      },
      buttonPrimary: { backgroundColor: c.accent, borderColor: c.accent },
      message: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
    }),
    ...text({
      tabText: { color: c.foregroundMuted, fontSize: 13 },
      tabTextSelected: { color: c.foreground },
      title: { flex: 1, color: c.foreground, fontSize: compact ? 17 : 18, fontWeight: "500", paddingTop: 4 },
      healthText: { flexShrink: 1, color: c.foregroundMuted, fontSize: 13 },
      healthError: { color: c.foregroundMuted, fontSize: 13, paddingLeft: 20 },
      groupLabel: { color: c.foreground, fontSize: 13, fontWeight: "500" },
      groupCount: { color: c.foregroundMuted, fontSize: 13, fontVariant: ["tabular-nums"] },
      groupSummary: { flex: 1, color: c.foregroundMuted, fontSize: 13 },
      rowId: { width: compact ? 66 : 74, color: c.foregroundMuted, fontSize: 13, fontVariant: ["tabular-nums"] },
      rowTitle: { flex: 1, minWidth: 0, color: c.foreground, fontSize: compact ? 15 : 14 },
      rowDetail: { flexShrink: 0, maxWidth: "55%", color: c.foregroundMuted, fontSize: 13, textAlign: "right" },
      rowDetailBelow: { color: c.foregroundMuted, fontSize: 13, paddingLeft: 24 },
      textButtonText: { color: c.foreground, fontSize: 13 },
      sectionLabel: { color: c.foregroundMuted, fontSize: 13 },
      treeId: { color: c.foregroundMuted, fontSize: 12, fontVariant: ["tabular-nums"] },
      treeTitle: { flex: 1, minWidth: 0, color: c.foreground, fontSize: 13 },
      small: { color: c.foreground, fontSize: 13, lineHeight: 19 },
      smallMuted: { color: c.foregroundMuted, fontSize: 13, lineHeight: 19 },
      body: { color: c.foreground, fontSize: 15, lineHeight: 21 },
      buttonText: { color: c.foreground, fontSize: 13 },
      buttonPrimaryText: { color: c.accentForeground, fontWeight: "500" },
    }),
  };
}

type Styles = ReturnType<(typeof makeStyles)>;
/** `null` until the user toggles the group. */
type Toggle = boolean | null;
/** Key of the action in flight, such as "pause:TEST-230". */
type Busy = string | null;
type RpcResult = unknown;
type MaybeTicket = Ticket | null;

interface Ui {
  c: Colors;
  s: Styles;
  compact: boolean;
  /** Milliseconds since the epoch at the last status fetch. */
  now: number;
}
const UiContext = createContext<Ui | null>(null);
function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("UiContext is missing");
  return ui;
}

/** React Native Web adds `hovered`; native platforms report `pressed` only. */
function isActive(state: PressableStateCallbackType): boolean {
  return state.pressed || (state as { hovered?: boolean }).hovered === true;
}

interface IconButtonProps {
  icon: string;
  /** Names the button for assistive technology; the button shows no text. */
  label: string;
  onPress(): void;
  disabled?: boolean;
  /** Draws the button as switched on. */
  active?: boolean;
}

function IconButton({ icon, label, onPress, disabled, active }: IconButtonProps) {
  const { c, s } = useUi();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={(state) => [s.iconButton, (active || isActive(state)) && s.pressed, disabled && s.dim]}
    >
      <Icon name={icon} size={16} color={active ? c.foreground : c.foregroundMuted} />
    </Pressable>
  );
}

function runAlert(run: Run): Tone | null {
  if (run.health.state === "failed") return "danger";
  if (run.health.state === "stale") return "warning";
  return null;
}

function Tabs({ runs, selected, onSelect }: { runs: Run[]; selected: string; onSelect(id: string): void }) {
  const { c, s } = useUi();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={s.tabsContent}>
      {runs.map((run) => {
        const isSelected = run.id === selected;
        const alert = runAlert(run);
        const count = needsYouCount(run);
        const finished = run.health.state === "finished";
        return (
          <Pressable
            key={run.id}
            accessibilityRole="tab"
            accessibilityLabel={`${run.id} ${run.title}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(run.id)}
            style={(state) => [s.tab, (isSelected || isActive(state)) && s.pressed, finished && s.dim]}
          >
            {alert ? <Icon name="TriangleAlert" size={12} color={toneColor(c, alert)} /> : null}
            <Text style={[s.tabText, isSelected && s.tabTextSelected]}>
              {run.id}
              {count > 0 ? ` · ${count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function healthView(health: Health, now: number): { icon: string; tone: Tone; text: string; strong: boolean } {
  const at = health.checkedAt ? clock(health.checkedAt, now) : null;
  switch (health.state) {
    case "ok":
      return {
        icon: "CircleCheck",
        tone: "success",
        text: [
          at ? `checked ${at}` : "not checked yet",
          health.nextCheckAt ? `next ${clock(health.nextCheckAt, now)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        strong: false,
      };
    case "paused_by_user":
      return { icon: "CirclePause", tone: "warning", text: "paused by you", strong: true };
    case "failed":
      return { icon: "CircleX", tone: "danger", text: "last check failed", strong: true };
    case "stale":
      return {
        icon: "TriangleAlert",
        tone: "warning",
        text: at ? `stale · no check since ${at}` : "stale · never checked",
        strong: true,
      };
    case "finished":
      return { icon: "CheckCheck", tone: "muted", text: "finished", strong: false };
  }
}

function HealthLine({ health }: { health: Health }) {
  const { c, s, now } = useUi();
  const view = healthView(health, now);
  const color = toneColor(c, view.tone);
  return (
    <View style={{ gap: 2 }}>
      <View style={s.healthLine}>
        <Icon name={view.icon} size={14} color={color} />
        <Text style={[s.healthText, view.strong && { color }]} numberOfLines={1}>
          {view.text}
        </Text>
      </View>
      {health.state === "failed" && health.error ? (
        <Text style={s.healthError} numberOfLines={2}>
          {health.error}
        </Text>
      ) : null}
    </View>
  );
}

interface TicketActions {
  busy: Busy;
  open?: (agentId: string) => void;
  start(ticket: Ticket): void;
  askReplaceAgent(ticket: Ticket): void;
}

function canReplaceAgent(ticket: Ticket): boolean {
  return ticket.state === "idle_no_pr" || ticket.state === "checks_failed";
}

interface TicketRowProps {
  ticket: Ticket;
  group: Group;
  actions: TicketActions;
  /** Keep the width of "⋮" free, so details line up with rows of the group that have it. */
  reserveMore: boolean;
}

/** One ticket: mark, id, title and a short detail, on one line where the width allows. */
function TicketRow({ ticket, group, actions, reserveMore }: TicketRowProps) {
  const { c, s, compact, now } = useUi();
  const mark = statusMark(ticket);
  const agentId = ticket.agentId;
  const onOpen = agentId && actions.open ? () => actions.open?.(agentId) : undefined;
  const canReplace = canReplaceAgent(ticket);
  const detail = (
    <Text style={compact ? s.rowDetailBelow : s.rowDetail} numberOfLines={ticket.state === "could_not_start" && compact ? 2 : 1}>
      {rowDetail(ticket, now, (iso) => clock(iso, now)).map((segment, index) => (
        <Text key={index} style={segment.tone ? { color: toneColor(c, segment.tone) } : undefined}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
  const body = (
    <>
      <View style={s.rowBody}>
        <View style={s.rowLine}>
          <View style={s.markSlot}>
            <Icon name={mark.icon} size={14} color={toneColor(c, mark.tone)} />
          </View>
          <Text style={s.rowId} numberOfLines={1}>
            {ticket.id}
          </Text>
          <Text style={s.rowTitle} numberOfLines={1}>
            {ticket.title}
          </Text>
          {compact ? null : detail}
        </View>
        {compact ? detail : null}
      </View>
      {group.startNow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Start ${ticket.id} now`}
          disabled={actions.busy === `start:${ticket.id}`}
          onPress={() => actions.start(ticket)}
          hitSlop={6}
          style={(state) => [s.textButton, isActive(state) && s.pressed]}
        >
          <Text style={s.textButtonText}>Start now</Text>
        </Pressable>
      ) : null}
      {canReplace ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Replace the agent of ${ticket.id}`}
          onPress={() => actions.askReplaceAgent(ticket)}
          hitSlop={6}
          style={(state) => [s.more, isActive(state) && s.pressed]}
        >
          <Icon name="EllipsisVertical" size={16} color={c.foregroundMuted} />
        </Pressable>
      ) : reserveMore ? (
        <View style={s.more} />
      ) : null}
    </>
  );
  if (!onOpen) return <View style={s.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open the agent of ${ticket.id}`}
      onPress={onOpen}
      style={(state) => [s.row, isActive(state) && s.pressed]}
    >
      {body}
    </Pressable>
  );
}

function GroupView({ group, actions }: { group: Group; actions: TicketActions }) {
  const { c, s, compact } = useUi();
  const [toggled, setToggled] = useState<Toggle>(null);
  const collapsible = group.key === "needs_you" || group.key === "blocked";
  const open = toggled ?? !(collapsible && group.tickets.length > OPEN_UP_TO);
  // On compact layouts the detail sits under the title, so nothing has to line up.
  const reserveMore = !compact && group.tickets.some(canReplaceAgent);
  return (
    <View style={s.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.label}, ${group.tickets.length}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setToggled(!open)}
        style={(state) => [s.groupHead, isActive(state) && s.pressed]}
      >
        <View style={s.groupHeadLine}>
          <View style={s.markSlot}>
            <Icon name={group.mark.icon} size={14} color={toneColor(c, group.mark.tone)} />
          </View>
          <Text style={s.groupLabel}>{group.label}</Text>
          <Text style={s.groupCount}>{group.tickets.length}</Text>
          {group.summary && !compact ? (
            <Text style={s.groupSummary} numberOfLines={1}>
              {group.summary}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={c.foregroundMuted} />
        </View>
        {group.summary && compact ? (
          <Text style={[s.groupSummary, { flex: 0, paddingLeft: 24 }]} numberOfLines={2}>
            {group.summary}
          </Text>
        ) : null}
      </Pressable>
      {open
        ? group.tickets.map((ticket, index) => (
            <View key={ticket.id}>
              {index > 0 ? <View style={s.divider} /> : null}
              <TicketRow ticket={ticket} group={group} actions={actions} reserveMore={reserveMore} />
            </View>
          ))
        : null}
    </View>
  );
}

function Tree({ nodes }: { nodes: TreeNode[] }) {
  const { c, s } = useUi();
  return (
    <>
      {nodes.map((node) => {
        const mark = node.ticket ? statusMark(node.ticket) : { icon: "CircleDashed", tone: "muted" as const };
        return (
          <View key={node.id}>
            <View style={s.treeRow}>
              <Icon name={mark.icon} size={14} color={toneColor(c, mark.tone)} />
              <Text style={s.treeId}>{node.id}</Text>
              <Text style={[s.treeTitle, !node.ticket && { color: c.foregroundMuted }]} numberOfLines={1}>
                {node.ticket ? node.ticket.title : "not in this run"}
              </Text>
            </View>
            {node.children.length > 0 ? (
              <View style={s.treeChildren}>
                <Tree nodes={node.children} />
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

function DetailsSection({ label, children }: { label: string; children: ReactNode }) {
  const { s } = useUi();
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** Metadata of a run: what unblocks what, the start rules, and the latest starts. */
function Details({ run, actions }: { run: Run; actions: TicketActions }) {
  const { s, now } = useUi();
  const { health, rules } = run;
  const tree = useMemo(() => dependencyTree(run), [run]);
  const checkTimes = [
    health.checkedAt ? `last ${clock(health.checkedAt, now)}` : null,
    health.state === "paused_by_user" ? "paused" : health.nextCheckAt ? `next ${clock(health.nextCheckAt, now)}` : null,
  ].filter(Boolean);
  return (
    <>
      <DetailsSection label="Dependencies">
        {tree.length > 0 ? (
          <View>
            <Tree nodes={tree} />
          </View>
        ) : (
          <Text style={s.smallMuted}>No open ticket blocks another.</Text>
        )}
      </DetailsSection>
      <DetailsSection label="How tickets start">
        <View style={s.rules}>
          <Text style={s.small}>When a run starts, every ready ticket starts.</Text>
          <Text style={s.small}>A ticket added later waits {span(rules.newTicketWaitMin)}.</Text>
          <Text style={s.small}>A ticket that gets unblocked or given back starts at the next check.</Text>
          <Text style={s.small}>One agent at a time per ticket.</Text>
          <Text style={s.smallMuted}>
            Checks run every {span(rules.checkEveryMin)}
            {checkTimes.length > 0 ? `\n${checkTimes.join(" · ")}` : ""}
          </Text>
        </View>
      </DetailsSection>
      {run.recent.length > 0 ? (
        <DetailsSection label="Recently started">
          <View>
            {run.recent.map((start) => {
              const agentId = start.agentId;
              const line = (
                <>
                  <Text style={s.treeId}>{start.id}</Text>
                  <Text style={s.treeTitle} numberOfLines={1}>
                    {start.title}
                  </Text>
                  <Text style={s.treeId}>{clock(start.startedAt, now)}</Text>
                </>
              );
              return agentId && actions.open ? (
                <Pressable
                  key={start.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open the agent of ${start.id}`}
                  onPress={() => actions.open?.(agentId)}
                  style={(state) => [s.recentRow, isActive(state) && s.pressed]}
                >
                  {line}
                </Pressable>
              ) : (
                <View key={start.id} style={s.recentRow}>
                  {line}
                </View>
              );
            })}
          </View>
        </DetailsSection>
      ) : null}
    </>
  );
}

export function TicketRunsScreen({ theme, layout, navigation, params }: PluginScreenProps) {
  const c = theme.colors;
  const compact = layout.compact;
  const status = useStatus(5000);
  const setPaused = useRpc(pauseRpc);
  const checkNow = useRpc(checkRpc);
  const startNow = useRpc(startRpc);
  const replaceAgent = useRpc(replaceAgentRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const [replaceTarget, setReplaceTarget] = useState<MaybeTicket>(null);
  const [detailsOpen, setDetailsOpen] = useState(detailsShown);
  const [chosen, setChosen] = useState(params.run ?? rememberedRun());
  const [width, setWidth] = useState(0);
  const s = useMemo(() => makeStyles(c, compact), [c, compact]);
  const ui = useMemo<Ui>(
    () => ({ c, s, compact, now: status.dataUpdatedAt || Date.now() }),
    [c, s, compact, status.dataUpdatedAt],
  );
  const sideDetails = !compact && width >= SIDE_DETAILS_FROM;

  const runs = status.data ? orderedRuns(status.data) : [];
  const run = runs.find((r) => r.id === chosen) ?? runs[0];

  function selectRun(runId: string) {
    rememberRun(runId);
    setChosen(runId);
  }

  function toggleDetails() {
    detailsShown = !detailsOpen;
    setDetailsOpen(detailsShown);
  }

  async function act(key: string, call: () => Promise<RpcResult>, done?: string) {
    setBusy(key);
    try {
      await call();
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      if (done) toast.show(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  function confirmReplaceAgent() {
    if (!run || !replaceTarget) return;
    const ticket = replaceTarget;
    setReplaceTarget(null);
    void act(
      `replace:${ticket.id}`,
      () => replaceAgent({ runId: run.id, ticketId: ticket.id }),
      `Replace agent requested for ${ticket.id} (prototype)`,
    );
  }

  const actions: TicketActions = {
    busy,
    open: navigation ? (agentId) => navigation.openAgent({ agentId }) : undefined,
    start: (ticket) =>
      run && act(`start:${ticket.id}`, () => startNow({ runId: run.id, ticketId: ticket.id }), `Started ${ticket.id}`),
    askReplaceAgent: setReplaceTarget,
  };

  let content: ReactNode;
  if (status.isError) {
    content = (
      <View style={s.message}>
        <Icon name="CircleX" size={20} color={c.statusDanger} />
        <Text style={s.body}>Ticket runs did not load</Text>
        <Text style={s.smallMuted}>{status.error instanceof Error ? status.error.message : String(status.error)}</Text>
      </View>
    );
  } else if (!status.data) {
    content = <Loading />;
  } else if (!run) {
    content = (
      <View style={s.message}>
        <Text style={s.smallMuted}>No runs</Text>
      </View>
    );
  } else {
    const paused = run.health.state === "paused_by_user";
    const finished = run.health.state === "finished";
    const groups = groupsOf(run);
    const showSide = sideDetails && detailsOpen;
    content = (
      <ScrollView
        style={s.screen}
        contentContainerStyle={[s.content, { maxWidth: MAIN_MAX_WIDTH + (showSide ? DETAILS_WIDTH + 28 : 0) + 48 }]}
      >
        <View style={s.main}>
          {runs.length > 1 ? <Tabs runs={runs} selected={run.id} onSelect={selectRun} /> : null}
          <View style={s.head}>
            <View style={s.headTop}>
              <Text style={s.title} numberOfLines={2}>
                {runs.length > 1 ? run.title : `${run.id} ${run.title}`}
              </Text>
              <View style={s.headButtons}>
                {finished ? null : (
                  <>
                    <IconButton
                      icon={paused ? "Play" : "Pause"}
                      label={`${paused ? "Resume" : "Pause"} ${run.id}`}
                      disabled={busy === `pause:${run.id}`}
                      onPress={() => act(`pause:${run.id}`, () => setPaused({ runId: run.id, paused: !paused }))}
                    />
                    <IconButton
                      icon="RefreshCw"
                      label={`Check ${run.id} now`}
                      disabled={busy === `check:${run.id}`}
                      onPress={() => act(`check:${run.id}`, () => checkNow({ runId: run.id }), `Checked ${run.id}`)}
                    />
                  </>
                )}
                <IconButton icon="PanelRight" label="Details" active={detailsOpen} onPress={toggleDetails} />
              </View>
            </View>
            <HealthLine health={run.health} />
          </View>
          {groups.map((group) => (
            <GroupView key={`${run.id}:${group.key}`} group={group} actions={actions} />
          ))}
          {groups.length === 0 ? <Text style={[s.smallMuted, s.head]}>No open tickets</Text> : null}
        </View>
        {showSide ? (
          <View style={s.details}>
            <Details run={run} actions={actions} />
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <UiContext.Provider value={ui}>
      <View style={s.screen} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {content}
      </View>
      <Modal
        title="Details"
        icon={<Icon name="PanelRight" size={18} color={c.foreground} />}
        open={detailsOpen && !sideDetails && run !== undefined}
        onOpenChange={(open) => {
          if (!open && detailsOpen) toggleDetails();
        }}
      >
        <Modal.Content contentContainerStyle={{ padding: 20, gap: 24 }}>
          {run ? (
            <UiContext.Provider value={ui}>
              <Details run={run} actions={actions} />
            </UiContext.Provider>
          ) : null}
        </Modal.Content>
      </Modal>
      <Modal
        title="Replace agent"
        icon={<Icon name="Bot" size={18} color={c.foreground} />}
        open={replaceTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null);
        }}
      >
        <Modal.Content>
          {replaceTarget ? (
            <UiContext.Provider value={ui}>
              <Text style={s.body}>
                {replaceTarget.id} {replaceTarget.title}
              </Text>
              <Text style={s.smallMuted}>
                Use this when the agent stopped or went off track. A new agent continues the ticket in the same
                workspace. The old session stays in the list.
              </Text>
              <View style={s.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  onPress={() => setReplaceTarget(null)}
                  style={(state) => [s.button, isActive(state) && s.pressed]}
                >
                  <Text style={s.buttonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Replace agent"
                  onPress={confirmReplaceAgent}
                  style={(state) => [s.button, s.buttonPrimary, isActive(state) && s.dim]}
                >
                  <Text style={[s.buttonText, s.buttonPrimaryText]}>Replace agent</Text>
                </Pressable>
              </View>
            </UiContext.Provider>
          ) : null}
        </Modal.Content>
      </Modal>
    </UiContext.Provider>
  );
}
