#!/usr/bin/env python3
"""Ticket runs: one Paseo agent per ready sub-ticket of a Linear parent ticket.

  run_tickets.py start PARENT [--settings FILE] [name=value ...] [--dry-run | --watch]
  run_tickets.py check [PARENT] [--dry-run] [--start TICKET]
  run_tickets.py pause PARENT [--resume]
  run_tickets.py replace PARENT TICKET
  run_tickets.py list PARENT
  run_tickets.py remove PARENT

`start` stores a run and starts every ready ticket. A timer runs `check` every 10 minutes
for every stored run. Each run has one state file, which the Paseo plugin beside this script
draws. `start --dry-run` prints what the run would do and stores nothing. `start --watch`
stores a run that only reads: it draws the screen and never writes to Linear or Paseo.

The script reads Linear through `linear api` and Paseo through `paseo`. With `gh` it also
shows pull request states. It needs no package outside the standard library.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys

if sys.version_info < (3, 11):
    sys.exit("run_tickets.py needs Python 3.11 or newer")

import tomllib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

CHECK_MINUTES = 10
PLUGIN_ID = "ticket-runs"
CLOSED = ("completed", "canceled", "duplicate")
# A ticket that comes back gets a fresh agent this many times; after that it waits for you.
GIVE_BACK_LIMIT = 2
RUNNING = ("running", "initializing")
# A caller inside a Paseo agent would make every started agent its own subagent.
DROP_ENV = ("PASEO_AGENT_ID", "PASEO_AGENT_CWD", "PASEO_WORKSPACE_ID")

DEFAULT_PROMPT = """\
Work on Linear ticket {id} "{title}" ({url}), a sub-ticket of {parent}. It is assigned to me, which marks it as yours.

You run unattended in a ticket run on {parent}. Finish all the work you can
do alone before you stop.

I, the user, read only your last message, in the Paseo app, with no other
context. End this last turn with a summary: the ticket, its goal, where it
stands (PR link if any), and what blocks it, if anything. Focus on what's
important for me to know or decide.

Once your PR is open and its checks pass, ask me to merge it or to tell you
to merge. When I answer, read the PR's state with `gh pr view`, then finish
the ticket.

Ask me first for any write outside this repository (a push, PR, issue or
comment) and for any Linear write that was refused. Give its exact title and
text.

To give the ticket back, remove its assignee and say why.

Last check, once your ticket is closed and its PR, if any, is merged:
- the worktree holds no uncommitted or unpushed work;
- every question, promise and follow-up in this session is settled or
  recorded on a ticket.
If anything is open, name it in your summary. Otherwise write the summary,
then archive your own workspace:
paseo workspace archive "$(paseo workspace ls --json | jq -r --arg c "$PASEO_AGENT_CWD" '.[] | select(.cwd==$c) | .workspaceId')"
"""

# Added to the prompt of an agent that starts in a workspace an earlier agent used.
CONTINUE = "\nAn earlier agent worked on this ticket in this folder. Read its commits and the ticket's comments, then continue.\n"

# Setting name -> default. None means "not set"; `start` fills in `dir`, `base` and `prompt`.
DEFAULTS = {
    "label": None,
    "prompt": None,
    "finish_prompt": None,
    "dir": None,
    "base": None,
    "agent": None,
    "mode": "auto",
    "wait_minutes": 60,
}

CHILDREN = """
query($id: String!, $after: String) {
  issue(id: $id) {
    identifier title url
    children(first: 40, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id identifier title url
        state { name type }
        assignee { id }
        labels(first: 50) { nodes { name } }
        children(first: 1, filter: { state: { type: { nin: ["completed", "canceled", "duplicate"] } } }) { nodes { identifier } }
        inverseRelations(first: 40) {
          pageInfo { hasNextPage endCursor }
          nodes { type issue { identifier state { type } } }
        }
      }
    }
  }
}
"""
MORE_RELATIONS = """
query($id: String!, $after: String) {
  issue(id: $id) { inverseRelations(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { type issue { identifier state { type } } } } }
}
"""
ASSIGN = """
mutation($id: String!, $assignee: String) {
  issueUpdate(id: $id, input: { assigneeId: $assignee }) { success }
}
"""


class Fail(Exception):
    """An error to show the user as one line."""


# ---------------------------------------------------------------- time and text

def now() -> datetime:
    fixed = os.environ.get("TICKET_RUNS_NOW")  # tests pin the clock
    return parse(fixed) if fixed else datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def next_check(moment: datetime) -> str:
    """The timer fires on the clock: every 10 minutes means :00, :10, :20."""
    slot = moment.replace(second=0, microsecond=0)
    return iso(slot + timedelta(minutes=CHECK_MINUTES - slot.minute % CHECK_MINUTES))


def short(text: str, limit: int = 300) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def first_line(text: str, limit: int = 160) -> str:
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return ""
    return short(lines[0], limit) + (" …" if len(lines) > 1 else "")


def tilde(path: str) -> str:
    home = str(Path.home())
    return "~" + path[len(home):] if path == home or path.startswith(home + "/") else path


def number(ticket_id: str) -> tuple[str, int]:
    team, _, digits = ticket_id.rpartition("-")
    return team, int(digits) if digits.isdigit() else 0


def span(minutes: int) -> str:
    if minutes and minutes % 60 == 0:
        hours = minutes // 60
        return f"{hours} hour" + ("" if hours == 1 else "s")
    return f"{minutes} minute" + ("" if minutes == 1 else "s")


# ---------------------------------------------------------------- tools

def tool(argv: list[str], *, cwd: str | None = None, timeout: int = 120, check: bool = True, name: str | None = None):
    env = {k: v for k, v in os.environ.items() if k not in DROP_ENV}
    try:
        result = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    except FileNotFoundError:
        raise Fail(f"{argv[0]} is not installed") from None
    except subprocess.TimeoutExpired:
        raise Fail(f"{argv[0]} gave no answer in {timeout} s") from None
    if check and result.returncode:
        raise Fail(f"{name or ' '.join(argv[:3])} failed: {short(result.stderr or result.stdout)}")
    return result


def paseo(*args: str):
    """Run a paseo command with --json and return the parsed answer."""
    cut = args.index("--") if "--" in args else len(args)  # after `--` paseo reads a prompt, not flags
    out = tool(["paseo", *args[:cut], "--json", *args[cut:]]).stdout
    start = min((i for i in (out.find("{"), out.find("[")) if i >= 0), default=-1)
    try:
        return json.loads(out[start:])
    except (ValueError, IndexError):
        raise Fail(f"paseo {' '.join(args[:2])} gave an unreadable answer: {short(out, 120)}") from None


def linear(query: str, variables: dict) -> dict:
    out = tool(["linear", "api", query, "--variables-json", json.dumps(variables)], name="linear api").stdout
    try:
        answer = json.loads(out)
    except ValueError:
        raise Fail(f"Linear gave an unreadable answer: {short(out, 120)}") from None
    if answer.get("errors") or not isinstance(answer.get("data"), dict):
        raise Fail(f"Linear refused: {short(json.dumps(answer.get('errors') or answer), 200)}")
    return answer["data"]


def viewer_id() -> str:
    return linear("query { viewer { id } }", {})["viewer"]["id"]


def read_linear(parent: str) -> tuple[dict, list[dict]]:
    """Return the parent and all its direct sub-tickets, with every blocking link."""
    children: list[dict] = []
    after = None
    while True:
        issue = linear(CHILDREN, {"id": parent, "after": after})["issue"]
        if not issue:
            raise Fail(f"Linear has no ticket {parent}")
        page = issue.pop("children")
        for child in page["nodes"]:
            links = child["inverseRelations"]
            while links["pageInfo"]["hasNextPage"]:
                more = linear(MORE_RELATIONS, {"id": child["identifier"], "after": links["pageInfo"]["endCursor"]})
                more = more["issue"]["inverseRelations"]
                links["nodes"] += more["nodes"]
                links["pageInfo"] = more["pageInfo"]
        children += page["nodes"]
        if not page["pageInfo"]["hasNextPage"]:
            return issue, children
        after = page["pageInfo"]["endCursor"]


def set_assignee(issue_uuid: str, assignee: str | None) -> None:
    answer = linear(ASSIGN, {"id": issue_uuid, "assignee": assignee})
    if not (answer.get("issueUpdate") or {}).get("success"):
        raise Fail("Linear did not change the assignee")


def pull_request(cwd: str) -> dict | None:
    """The pull request of the branch checked out in `cwd`, or None."""
    if not os.path.isdir(cwd):
        return None
    try:
        result = tool(["gh", "pr", "view", "--json", "number,state,url,statusCheckRollup"], cwd=cwd, timeout=60, check=False)
        if result.returncode:
            return None
        pr = json.loads(result.stdout)
    except (Fail, ValueError):
        return None
    failed = pending = False
    for item in pr.get("statusCheckRollup") or []:
        if item.get("__typename") == "StatusContext":
            failed |= item.get("state") in ("FAILURE", "ERROR")
            pending |= item.get("state") in ("PENDING", "EXPECTED")
        else:
            pending |= item.get("status") != "COMPLETED"
            failed |= item.get("conclusion") in ("FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE")
    checks = "failed" if failed else "running" if pending else "passed" if pr.get("statusCheckRollup") else "none"
    return {"number": pr["number"], "url": pr.get("url"), "state": pr["state"].lower(), "checks": checks}


# ---------------------------------------------------------------- settings

def script_dir() -> Path:
    return Path(__file__).resolve().parent


def find_settings(name: str) -> Path:
    for candidate in (Path(name).expanduser(), script_dir() / "settings" / name, script_dir() / "settings" / f"{name}.toml"):
        if candidate.is_file():
            return candidate.resolve()
    raise Fail(f"no settings file {name}")


def resolve_settings(file: str | None, pairs: list[str]) -> tuple[dict, str | None]:
    """Defaults, then the file, then the name=value pairs."""
    values = dict(DEFAULTS)
    source = None
    if file:
        path = find_settings(file)
        source = str(path)
        try:
            data = tomllib.loads(path.read_text())
        except tomllib.TOMLDecodeError as error:
            raise Fail(f"{path}: {error}") from None
        for name in data:
            if name not in DEFAULTS:
                raise Fail(f"{path}: unknown setting {name}")
        values.update(data)
    for pair in pairs:
        name, sep, value = pair.partition("=")
        if not sep or name not in DEFAULTS:
            raise Fail(f"unknown setting {name}" if sep else f"expected name=value, got {pair}")
        values[name] = value
    try:
        values["wait_minutes"] = int(values["wait_minutes"])
    except (TypeError, ValueError):
        raise Fail("wait_minutes must be a whole number") from None
    if values["wait_minutes"] < 0:
        raise Fail("wait_minutes must be 0 or more")
    for name, value in values.items():
        if name == "wait_minutes":
            continue
        if value is not None and not isinstance(value, str):
            raise Fail(f"{name} must be text")
        values[name] = value.strip("\n") if value and value.strip() else None
    values["mode"] = values["mode"] or DEFAULTS["mode"]
    values["prompt"] = values["prompt"] or DEFAULT_PROMPT
    return values, source


def agent_profile(name: str | None) -> dict:
    """The provider flags of a Paseo agent profile. `provider/model` names a model directly."""
    if name and "/" in name:
        return {"name": name, "flags": ["--provider", name]}
    home = Path(os.environ.get("PASEO_HOME") or Path.home() / ".paseo")
    try:
        profiles = json.loads((home / "config.json").read_text())["daemon"]["agentProfiles"]
    except (OSError, ValueError, KeyError):
        profiles = []
    chosen = next((p for p in profiles if not name or p.get("name") == name), None)
    if not chosen:
        raise Fail(f"Paseo has no agent profile {name}" if name else "Paseo has no agent profile")
    model = f"{chosen['provider']}/{chosen['model']}"
    flags = ["--provider", model]
    if chosen.get("thinkingOptionId"):
        flags += ["--thinking", chosen["thinkingOptionId"]]
    return {"name": f"{chosen.get('name') or model} ({model})", "flags": flags}


def git(cwd: str, *args: str, check: bool = True) -> str:
    return tool(["git", *args], cwd=cwd, check=check).stdout.strip()


def default_base(top: str) -> str:
    head = git(top, "symbolic-ref", "--short", "refs/remotes/origin/HEAD", check=False)
    if head:
        return head
    for ref in ("origin/main", "origin/master"):
        if git(top, "rev-parse", "--verify", "--quiet", ref, check=False):
            return ref
    branch = git(top, "symbolic-ref", "--short", "HEAD", check=False)
    if not branch:
        raise Fail(f"{top} has no default branch: set base")
    return branch


def describe(run: dict) -> list[dict]:
    """The run's settings in words, for Details and for `start --dry-run`."""
    s = run["settings"]
    label = f" that carries the label {s['label']}" if s["label"] else ""
    lines = [
        ("Starts", f"Every ready sub-ticket of {run['id']}{label}. A ticket added later waits {span(s['wait_minutes'])}. "
                   f"A ticket given back more than {GIVE_BACK_LIMIT} times waits for you."),
        ("Prompt", "The default brief." if s["prompt"] == DEFAULT_PROMPT else first_line(s["prompt"])),
        ("Agent", f"{run['agentName']}, mode {s['mode']}"),
        ("Folder", tilde(run["runDir"])),
        ("Branch", f"One per ticket, cut from {s['base']}."),
        ("After the last ticket", f"One agent starts with: {first_line(s['finish_prompt'])}" if s["finish_prompt"] else "Nothing starts."),
    ]
    if run.get("settingsFile"):
        lines.append(("Settings file", tilde(run["settingsFile"])))
    return [{"label": label, "text": text} for label, text in lines]


# ---------------------------------------------------------------- state files

def state_dir(args) -> Path:
    base = args.state_dir or os.environ.get("TICKET_RUNS_STATE")
    if not base:
        base = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state") / "ticket-runs"
    path = Path(base).expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


class Lock:
    """One command at a time per state folder: the timer and a button never overlap."""

    def __init__(self, folder: Path):
        self.path = folder / "lock"

    def __enter__(self):
        self.handle = open(self.path, "w")
        fcntl.flock(self.handle, fcntl.LOCK_EX)

    def __exit__(self, *_):
        self.handle.close()


def load(folder: Path, run_id: str) -> dict:
    path = folder / f"{run_id}.json"
    if not path.is_file():
        raise Fail(f"no run {run_id}: start it with `run_tickets.py start {run_id}`")
    return json.loads(path.read_text())


def save(folder: Path, run: dict) -> None:
    path = folder / f"{run['id']}.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(run, indent=1) + "\n")
    tmp.replace(path)


def run_ids(folder: Path) -> list[str]:
    return sorted(p.stem for p in folder.glob("*.json"))


def log(folder: Path, text: str) -> None:
    line = f"{iso(now())} {text}"
    print(line, flush=True)
    with open(folder / "log", "a") as handle:
        handle.write(line + "\n")


# ---------------------------------------------------------------- one check

def held(child: dict, label: str | None) -> tuple[str, list[str]] | None:
    """Why an open ticket is not ready, or None when it is."""
    blockers = sorted(
        {
            link["issue"]["identifier"]
            for link in child["inverseRelations"]["nodes"]
            if link["type"] == "blocks" and link["issue"]["state"]["type"] not in CLOSED
        },
        key=number,
    )
    if blockers:
        return "blocked", blockers
    if child["children"]["nodes"]:
        return "sub_tickets", []
    if child["assignee"]:
        return "assigned_no_agent", []
    if label and label not in {node["name"] for node in child["labels"]["nodes"]}:
        return "no_label", []
    return None


def learn_agents(run: dict, agents: list[dict], children: list[dict], moment: str) -> None:
    """Keep the record of the run's agents: which ticket each works on and since when.

    `paseo ls` filters by label but prints no labels, so a new agent's ticket is found by
    asking per ticket. The answer is kept, so each agent costs this once.
    """
    known = run["memory"]["agents"]
    listed = {agent["id"] for agent in agents}
    for gone in set(known) - listed:
        del known[gone]
    new = [agent for agent in agents if agent["id"] not in known]
    if new:
        def labelled(ticket: str) -> tuple[str, set[str]]:
            found = paseo("ls", "-g", "--label", f"run={run['id']}", "--label", f"ticket={ticket}")
            return ticket, {agent["id"] for agent in found}

        def times(agent: dict) -> dict:
            return paseo("inspect", agent["id"])

        ids = [child["identifier"] for child in sorted(children, key=lambda c: c["state"]["type"] in CLOSED)]
        guessed = []
        for agent in new:
            match = re.match(r"[A-Za-z][A-Za-z0-9]*-\d+", agent.get("name") or "")
            if match and match.group().upper() in ids and match.group().upper() not in guessed:
                guessed.append(match.group().upper())
        ticket_of: dict[str, str] = {}
        with ThreadPoolExecutor(8) as pool:
            for batch in (guessed, [ticket for ticket in ids if ticket not in guessed]):
                if all(agent["id"] in ticket_of for agent in new):
                    break
                for ticket, found in pool.map(labelled, batch):
                    for agent_id in found:
                        ticket_of.setdefault(agent_id, ticket)
            for agent, detail in zip(new, pool.map(times, new)):
                known[agent["id"]] = {
                    "ticket": ticket_of.get(agent["id"]),
                    "status": agent["status"],
                    "since": detail.get("UpdatedAt") or moment,
                    "created": detail.get("CreatedAt") or moment,
                }
    for agent in agents:
        record = known[agent["id"]]
        if record["status"] != agent["status"]:
            record["status"] = agent["status"]
            record["since"] = moment


def workspace_of(run: dict, ticket: str, agents: list[dict], workspaces: list[dict]) -> str | None:
    """The workspace a ticket already has: the one this script made, or its latest agent's."""
    by_id = {w["workspaceId"]: w for w in workspaces}
    recorded = run["memory"]["workspaces"].get(ticket)
    if recorded in by_id:
        return recorded
    by_cwd = {w["cwd"]: w["workspaceId"] for w in workspaces}
    for agent in reversed(agents):
        found = by_cwd.get(os.path.expanduser(agent["cwd"]))
        if found:
            return found
    return None


def launch(run: dict, key: str, title: str, slug: str, prompt: str, labels: list[str], agents: list[dict], workspaces: list[dict], keep) -> str:
    """Start one agent in the workspace of `key`, creating the workspace when it has none."""
    s = run["settings"]
    if not run.get("projectId"):
        raise Fail(f"the run has no Paseo project: run `start {run['id']}` again")
    workspace = workspace_of(run, key, agents, workspaces)
    if workspace:
        prompt += CONTINUE
    else:
        created = paseo(
            "workspace", "create", "--isolation", "worktree", "--project", run["projectId"], "--path", run["runDir"],
            "--worktree-slug", slug, "--base", s["base"], "--title", title,
        )
        workspace = created["workspaceId"]
        run["memory"]["workspaces"][key] = workspace
        keep()
    flags = agent_profile(s["agent"])["flags"]
    label_flags = [flag for label in labels for flag in ("--label", label)]
    started = paseo("run", "--workspace", workspace, *flags, "--mode", s["mode"], "--title", title, *label_flags, "--no-wait", "--", prompt)
    return started["agentId"]


def fill(prompt: str, run: dict, child: dict | None) -> str:
    values = {"{parent}": run["id"]}
    if child:
        values |= {"{id}": child["identifier"], "{title}": child["title"], "{url}": child["url"]}
    return re.sub("|".join(map(re.escape, values)), lambda match: values[match.group()], prompt)


def check_run(run: dict, *, dry: bool, start_now: str | None = None, keep=lambda: None, note=lambda text: None) -> None:
    """Read Linear and Paseo, start what is due, and rewrite the run's tickets and health.

    Raises Fail when Linear or Paseo gives no usable answer; then nothing was started.
    """
    moment = iso(now())
    settings, memory = run["settings"], run["memory"]
    reads_only = dry or run.get("watch") or run.get("paused")
    me = viewer_id()
    parent, children = read_linear(run["id"])
    agents = paseo("ls", "-g", "--label", f"run={run['id']}")
    workspaces = paseo("workspace", "ls")
    run["title"], run["url"] = parent["title"], parent["url"]
    run["agentName"] = agent_profile(settings["agent"])["name"]

    learn_agents(run, agents, children, moment)
    of_ticket: dict[str, list[dict]] = {}
    for agent in agents:
        ticket = memory["agents"][agent["id"]]["ticket"]
        if ticket:
            of_ticket.setdefault(ticket, []).append(agent)
    for group in of_ticket.values():
        group.sort(key=lambda agent: memory["agents"][agent["id"]]["created"])

    by_id = {child["identifier"]: child for child in children}
    open_children = [child for child in children if child["state"]["type"] not in CLOSED]
    memory["firstCheckAt"] = memory.get("firstCheckAt") or moment
    memory["firstSeen"] = {t: at for t, at in memory["firstSeen"].items() if t in by_id}
    open_ids = {child["identifier"] for child in open_children}
    memory["returns"] = {t: n for t, n in memory.setdefault("returns", {}).items() if t in open_ids}
    for child in open_children:
        memory["firstSeen"].setdefault(child["identifier"], moment)
    if start_now:
        if start_now not in by_id:
            raise Fail(f"{start_now} is not a sub-ticket of {run['id']}")
        memory["firstSeen"][start_now] = memory["firstCheckAt"]

    # The script's record against Linear and Paseo: a ticket it assigned that has no agent is free again.
    for ticket in list(memory["assigned"]):
        child = by_id.get(ticket)
        mine = child and child["state"]["type"] not in CLOSED and child["assignee"] and child["assignee"]["id"] == me
        if not mine:
            del memory["assigned"][ticket]
        elif not of_ticket.get(ticket):
            if not reads_only:
                set_assignee(child["id"], None)
                del memory["assigned"][ticket]
                note(f"unassigned {ticket}: it has no agent")
            child["assignee"] = None

    def record(child: dict, state: str, **more) -> dict:
        ticket = child["identifier"]
        reason = held(child, None)
        return {
            "id": ticket,
            "title": child["title"],
            "url": child["url"],
            "state": state,
            "linearState": child["state"]["name"],
            "agentId": None,
            "pr": None,
            "at": None,
            "addedAt": memory["firstSeen"].get(ticket),
            "reason": None,
            "blockedBy": reason[1] if reason else [],
            "error": None,
        } | more

    def since(agent: dict) -> str:
        return memory["agents"][agent["id"]]["since"]

    tickets: list[dict] = []
    due: list[tuple[dict, dict]] = []
    idle: list[tuple[dict, dict]] = []
    for child in sorted(open_children, key=lambda c: number(c["identifier"])):
        ticket = child["identifier"]
        mine = of_ticket.get(ticket, [])
        running = [agent for agent in mine if agent["status"] in RUNNING]
        reason = held(child, settings["label"])
        if running:
            row = record(child, "working", agentId=running[-1]["id"], at=since(running[-1]))
        elif reason is None and mine and memory["returns"].get(ticket, 0) >= GIVE_BACK_LIMIT:
            # Given back once more than the limit allows: no further agent starts by itself.
            row = record(child, "idle", agentId=mine[-1]["id"], at=since(mine[-1]), reason="given_back")
            idle.append((row, mine[-1]))
        elif reason is None:
            first = memory["firstSeen"][ticket]
            starts = parse(first) + timedelta(minutes=settings["wait_minutes"])
            if first > memory["firstCheckAt"] and starts > parse(moment):
                row = record(child, "waiting", at=iso(starts))
            else:
                row = record(child, "waiting")
                due.append((child, row))
        elif mine:
            row = record(child, "idle", agentId=mine[-1]["id"], at=since(mine[-1]))
            idle.append((row, mine[-1]))
        else:
            row = record(child, "not_started", reason=reason[0])
        tickets.append(row)
    for child in children:
        running = [agent for agent in of_ticket.get(child["identifier"], []) if agent["status"] in RUNNING]
        if child["state"]["type"] in CLOSED and running:
            tickets.append(record(child, "closed_agent_running", agentId=running[-1]["id"], at=since(running[-1])))

    started: list[str] = []
    memory["errors"] = {}
    for child, row in due:
        ticket = child["identifier"]
        if reads_only:
            continue
        try:
            set_assignee(child["id"], me)
            memory["assigned"][ticket] = moment
            keep()
            try:
                title = f"{ticket} {child['title']}"
                labels = [f"run={run['id']}", f"ticket={ticket}"]
                agent_id = launch(run, ticket, title, ticket.lower(), fill(settings["prompt"], run, child), labels, of_ticket.get(ticket, []), workspaces, keep)
            except Fail:
                try:
                    set_assignee(child["id"], None)
                    del memory["assigned"][ticket]
                except Fail:
                    pass  # the next check frees it
                raise
        except Fail as error:
            memory["errors"][ticket] = str(error)
            row |= {"state": "could_not_start", "error": str(error), "at": moment}
            note(f"could not start {ticket}: {error}")
            continue
        memory["agents"][agent_id] = {"ticket": ticket, "status": "running", "since": moment, "created": moment}
        row |= {"state": "working", "agentId": agent_id, "at": moment}
        if of_ticket.get(ticket):
            memory["returns"][ticket] = memory["returns"].get(ticket, 0) + 1
        run["recent"] = [{"id": ticket, "title": child["title"], "startedAt": moment, "agentId": agent_id}, *run["recent"]][:5]
        started.append(ticket)
        keep()

    with ThreadPoolExecutor(8) as pool:
        requests = pool.map(lambda pair: pull_request(os.path.expanduser(pair[1]["cwd"])), idle)
        for (row, _), pr in zip(idle, requests):
            row["pr"] = pr
            if pr and pr["state"] == "open" and pr["checks"] in ("passed", "failed"):
                row["state"] = "ready_to_merge" if pr["checks"] == "passed" else "checks_failed"

    finishing = False
    if open_children:
        memory["openSeen"] = True
    elif memory.get("openSeen"):
        finishing = bool(settings["finish_prompt"])
        if not reads_only:
            if finishing:
                title = f"{run['id']} finished"
                agent_id = launch(run, run["id"], title, f"{run['id'].lower()}-done", fill(settings["finish_prompt"], run, None), [f"run={run['id']}"], [], workspaces, keep)
                memory["agents"][agent_id] = {"ticket": None, "status": "running", "since": moment, "created": moment}
                run["recent"] = [{"id": run["id"], "title": "Agent for the finished run", "startedAt": moment, "agentId": agent_id}, *run["recent"]][:5]
            memory["openSeen"] = False

    would = [child["identifier"] for child, _ in due] + (["the agent for the finished run"] if finishing else [])
    if reads_only:
        result = f"would start {', '.join(would)}" if would else "nothing to start"
    else:
        done = started + (["the agent for the finished run"] if finishing else [])
        failed = len(memory["errors"])
        result = f"started {', '.join(done)}" if done else "nothing to start"
        result += f", {failed} could not start" if failed else ""
    run["tickets"] = tickets
    run["what"] = describe(run)
    run["health"] = {
        "state": "finished" if not open_children else "paused_by_user" if run.get("paused") else "ok",
        "dryRun": bool(dry or run.get("watch")),
        "checkedAt": moment,
        "nextCheckAt": next_check(now()),
        "lastResult": result,
        "error": None,
    }


def check_stored(folder: Path, run_id: str, *, dry: bool, start_now: str | None = None) -> bool:
    """Check one stored run and write its state file. Returns False when the check failed."""
    run = load(folder, run_id)
    try:
        if start_now and (dry or run.get("watch") or run.get("paused")):
            raise Fail(f"{run_id} starts nothing now: it is paused or only watched")
        check_run(run, dry=dry, start_now=start_now, keep=lambda: save(folder, run), note=lambda text: log(folder, f"{run_id} {text}"))
    except Fail as error:
        run["health"] = {"dryRun": bool(dry or run.get("watch")), "lastResult": None} | (run.get("health") or {}) | {
            "state": "failed",
            "checkedAt": iso(now()),
            "nextCheckAt": next_check(now()),
            "error": str(error),
        }
        save(folder, run)
        log(folder, f"{run_id} check failed: {error}")
        return False
    save(folder, run)
    log(folder, f"{run_id} {'dry run: ' if run['health']['dryRun'] else ''}{run['health']['lastResult']}")
    return True


def reload_failed_plugin(folder: Path, dry: bool) -> None:
    """Paseo leaves a plugin whose process died in state `failed`; a reload brings it back."""
    try:
        failed = any(p.get("id") == PLUGIN_ID and p.get("status") == "failed" for p in paseo("plugin", "ls"))
        if failed and not dry:
            tool(["paseo", "plugin", "reload", PLUGIN_ID])
        if failed:
            log(folder, f"plugin {PLUGIN_ID} had failed: {'would reload it' if dry else 'reloaded it'}")
    except Fail as error:
        log(folder, f"plugin check failed: {error}")


# ---------------------------------------------------------------- commands

def new_run(args, parent: dict, settings: dict, source: str | None) -> dict:
    """The record of a run, before its worktree and project exist."""
    folder = Path(settings["dir"] or os.getcwd()).expanduser().resolve()
    if not folder.is_dir():
        raise Fail(f"{folder} is not a folder")
    top = git(str(folder), "rev-parse", "--show-toplevel", check=False)
    if not top:
        raise Fail(f"{folder} is not inside a git checkout: set dir")
    settings["dir"] = str(folder)
    settings["base"] = settings["base"] or default_base(top)
    worktree = Path.home() / "worktrees" / parent["identifier"].lower()
    return {
        "version": 1,
        "id": parent["identifier"],
        "title": parent["title"],
        "url": parent["url"],
        "script": str(Path(__file__).resolve()),
        "settings": settings,
        "settingsFile": source,
        "checkout": top,
        "worktree": str(worktree),
        "runDir": str(worktree / folder.relative_to(top)),
        "projectId": None,
        "agentName": agent_profile(settings["agent"])["name"],
        "startedAt": iso(now()),
        "watch": bool(args.watch),
        "paused": False,
        "health": None,
        "what": [],
        "tickets": [],
        "recent": [],
        "memory": {"firstCheckAt": None, "firstSeen": {}, "assigned": {}, "agents": {}, "workspaces": {}, "errors": {}, "returns": {}, "openSeen": False},
    }


def find_project(run: dict) -> str | None:
    return next((p["projectId"] for p in paseo("project", "ls") if p["path"] == run["runDir"]), None)


def make_home(run: dict) -> None:
    """Give the run its worktree and its Paseo project; both are reused when they exist."""
    if not os.path.isdir(run["worktree"]):
        if git(run["checkout"], "remote", check=False):
            git(run["checkout"], "fetch", "origin")
        os.makedirs(os.path.dirname(run["worktree"]), exist_ok=True)
        git(run["checkout"], "worktree", "add", "--detach", run["worktree"], run["settings"]["base"])
    if not os.path.isdir(run["runDir"]):
        raise Fail(f"{run['runDir']} does not exist at {run['settings']['base']}")
    run["projectId"] = find_project(run)
    if not run["projectId"]:
        run["projectId"] = paseo("project", "create", run["runDir"])["projectId"]
        paseo("project", "rename", run["projectId"], f"{run['id']} {run['title']}")


def report(run: dict) -> None:
    groups = [
        ("Would start now" if run["health"]["dryRun"] or run.get("paused") else "Starting soon", ("waiting",)),
        ("Working", ("working",)),
        ("Needs you", ("ready_to_merge", "checks_failed", "idle", "closed_agent_running", "could_not_start")),
        ("Blocked", ("not_started",)),
    ]
    for label, states in groups:
        rows = [t for t in run["tickets"] if t["state"] in states]
        print(f"{label} · {len(rows)}")
        if states == ("waiting",) or states == ("working",):
            for t in rows:
                later = f"  (starts {t['at']})" if t["state"] == "waiting" and t["at"] else ""
                print(f"  {t['id']}  {t['title']}{later}")


def cmd_start(args) -> int:
    settings, source = resolve_settings(args.settings, args.pairs)
    parent = linear("query($id: String!) { issue(id: $id) { identifier title url } }", {"id": args.parent})["issue"]
    if not parent:
        raise Fail(f"Linear has no ticket {args.parent}")
    run = new_run(args, parent, settings, source)
    if args.dry_run:
        run["projectId"] = find_project(run)
        check_run(run, dry=True)
        print(f"{run['id']} {run['title']}\n\nWhat the run does")
        for line in run["what"]:
            print(f"  {line['label']}: {line['text']}")
        print()
        report(run)
        return 0
    folder = state_dir(args)
    with Lock(folder):
        path = folder / f"{run['id']}.json"
        if path.is_file():
            old = json.loads(path.read_text())
            run["memory"] = old["memory"] | {"firstCheckAt": None}
            run["recent"] = old.get("recent", [])
            run["paused"] = bool(old.get("paused")) and not args.watch
        if args.watch:
            run["projectId"] = find_project(run)
        else:
            make_home(run)
        save(folder, run)
        log(folder, f"{run['id']} {'watching' if args.watch else 'started'} with {tilde(source) if source else 'the default settings'}")
        ok = check_stored(folder, run["id"], dry=False)
    return 0 if ok else 1


def cmd_check(args) -> int:
    folder = state_dir(args)
    if args.start and not args.parent:
        raise Fail("--start needs the run: check PARENT --start TICKET")
    with Lock(folder):
        ids = [args.parent] if args.parent else run_ids(folder)
        results = [check_stored(folder, run_id, dry=args.dry_run, start_now=args.start) for run_id in ids]
        if not args.parent:
            reload_failed_plugin(folder, args.dry_run)
    return 0 if all(results) else 1


def cmd_pause(args) -> int:
    folder = state_dir(args)
    with Lock(folder):
        run = load(folder, args.parent)
        run["paused"] = not args.resume
        if run.get("health") and run["health"]["state"] in ("ok", "paused_by_user"):
            run["health"]["state"] = "paused_by_user" if run["paused"] else "ok"
        save(folder, run)
        log(folder, f"{run['id']} {'paused' if run['paused'] else 'resumed'}")
    return 0


def cmd_replace(args) -> int:
    folder = state_dir(args)
    with Lock(folder):
        run = load(folder, args.parent)
        if run.get("watch"):
            raise Fail(f"{run['id']} is only watched: it starts nothing")
        me = viewer_id()
        _, children = read_linear(run["id"])
        child = next((c for c in children if c["identifier"] == args.ticket), None)
        if not child or child["state"]["type"] in CLOSED:
            raise Fail(f"{args.ticket} is not an open sub-ticket of {run['id']}")
        agents = paseo("ls", "-g", "--label", f"run={run['id']}", "--label", f"ticket={args.ticket}")
        if any(agent["status"] in RUNNING for agent in agents):
            raise Fail(f"an agent of {args.ticket} is running")
        if not child["assignee"]:
            set_assignee(child["id"], me)
            run["memory"]["assigned"][args.ticket] = iso(now())
            save(folder, run)
        title = f"{args.ticket} {child['title']}"
        labels = [f"run={run['id']}", f"ticket={args.ticket}"]
        agent_id = launch(run, args.ticket, title, args.ticket.lower(), fill(run["settings"]["prompt"], run, child), labels, agents, paseo("workspace", "ls"), lambda: save(folder, run))
        moment = iso(now())
        run["memory"]["agents"][agent_id] = {"ticket": args.ticket, "status": "running", "since": moment, "created": moment}
        run["recent"] = [{"id": args.ticket, "title": child["title"], "startedAt": moment, "agentId": agent_id}, *run["recent"]][:5]
        save(folder, run)
        log(folder, f"{run['id']} replaced the agent of {args.ticket}")
        check_stored(folder, run["id"], dry=False)
    return 0


def created(run: dict) -> list[str]:
    """Every workspace, agent and worktree of a run, one per line."""
    lines = [f"state file   {run['_file']}", f"worktree     {tilde(run['worktree'])}"]
    project = next((p for p in paseo("project", "ls") if p["projectId"] == run.get("projectId")), None)
    if project:
        lines.append(f"project      {project['projectId']}  {project['name']}")
    agents = paseo("ls", "-g", "-a", "--label", f"run={run['id']}")
    cwds = {os.path.expanduser(agent["cwd"]) for agent in agents}
    recorded = set(run["memory"]["workspaces"].values())
    for w in paseo("workspace", "ls"):
        if w["workspaceId"] in recorded or w["cwd"] in cwds or (project and w["project"] == project["name"]):
            lines.append(f"workspace    {w['workspaceId']}  {tilde(w['cwd'])}  {w['name']}")
    for agent in agents:
        lines.append(f"agent        {agent['id']}  {agent['status']:8}  {agent['name']}")
    return lines


def cmd_list(args) -> int:
    folder = state_dir(args)
    run = load(folder, args.parent) | {"_file": tilde(str(folder / f"{args.parent}.json"))}
    print("\n".join(created(run)))
    return 0


def cmd_remove(args) -> int:
    folder = state_dir(args)
    with Lock(folder):
        run = load(folder, args.parent) | {"_file": tilde(str(folder / f"{args.parent}.json"))}
        try:
            lines = created(run)
        except Fail:
            lines = []
        (folder / f"{args.parent}.json").unlink()
        log(folder, f"{args.parent} removed")
    if lines[1:]:
        print("The run is gone. These stay until you remove them in Paseo and git:")
        print("\n".join(lines[1:]))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--state-dir", help="folder of the state files (default: ~/.local/state/ticket-runs)")
    commands = parser.add_subparsers(dest="command", required=True)

    start = commands.add_parser("start", help="store a run and start every ready ticket")
    start.add_argument("parent")
    start.add_argument("pairs", nargs="*", metavar="name=value")
    start.add_argument("--settings", metavar="FILE", help="a TOML file, or the name of one in settings/")
    mode = start.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="print what the run would do; store nothing")
    mode.add_argument("--watch", action="store_true", help="store a run that reads only and never starts an agent")
    start.set_defaults(run=cmd_start)

    check = commands.add_parser("check", help="check one run, or every run")
    check.add_argument("parent", nargs="?")
    check.add_argument("--dry-run", action="store_true", help="read and write the state file; change nothing in Linear or Paseo")
    check.add_argument("--start", metavar="TICKET", help="start this ticket without its wait")
    check.set_defaults(run=cmd_check)

    pause = commands.add_parser("pause", help="stop a run from starting agents; --resume lets it start again")
    pause.add_argument("parent")
    pause.add_argument("--resume", action="store_true")
    pause.set_defaults(run=cmd_pause)

    replace = commands.add_parser("replace", help="start a new agent for a ticket in its workspace")
    replace.add_argument("parent")
    replace.add_argument("ticket")
    replace.set_defaults(run=cmd_replace)

    listing = commands.add_parser("list", help="print every workspace, agent and worktree of a run")
    listing.add_argument("parent")
    listing.set_defaults(run=cmd_list)

    remove = commands.add_parser("remove", help="end a run: delete its state file")
    remove.add_argument("parent")
    remove.set_defaults(run=cmd_remove)

    args = parser.parse_args(argv)
    try:
        return args.run(args)
    except Fail as error:
        print(f"ticket runs: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
