#!/usr/bin/env python3
"""Stand-in for `linear`, `paseo` and `gh` in the tests.

    fake_cli.py <linear|paseo|gh> <the tool's arguments>

It answers from the world file named by $FAKE_WORLD in the shapes the real tools print
(recorded on Paseo 0.15.4, linear-cli 2.6.0 and gh, 2026-11-16), applies writes to that
file, and appends every call to $FAKE_WORLD.calls as one JSON line.
"""
import fcntl
import json
import os
import sys

WORLD = os.environ["FAKE_WORLD"]
CLOSED = ("completed", "canceled", "duplicate")
CHILD_PAGE = 40
LINK_PAGE = 40


def expand(path):
    return os.path.expanduser(path)


def fail(message, code=1):
    print(message, file=sys.stderr)
    sys.exit(code)


def out(value):
    print(json.dumps(value, indent=2))


def flag(args, name, default=None):
    return args[args.index(name) + 1] if name in args else default


def flags(args, name):
    return [args[i + 1] for i, arg in enumerate(args) if arg == name]


def links_page(child, after, size):
    nodes = child["inverseRelations"]["nodes"]
    start = int(after or 0)
    end = start + size
    return {"pageInfo": {"hasNextPage": end < len(nodes), "endCursor": str(end)}, "nodes": nodes[start:end]}


def linear(world, args):
    if args[0] != "api":
        fail(f"fake linear: unknown command {args[0]}")
    query = args[1]
    variables = json.loads(flag(args, "--variables-json", "{}"))
    if "viewer" in query:
        return out({"data": {"viewer": {"id": world["me"]}}})
    if "issueUpdate" in query:
        child = next((c for c in world["children"] if c["id"] == variables["id"]), None)
        if not child:
            return out({"data": None, "errors": [{"message": "Entity not found: Issue"}]})
        child["assignee"] = {"id": variables["assignee"]} if variables["assignee"] else None
        return out({"data": {"issueUpdate": {"success": True}}})
    if variables.get("id") == world["parent"]["identifier"]:
        issue = dict(world["parent"])
        if "children(" in query:
            start = int(variables.get("after") or 0)
            end = start + CHILD_PAGE
            nodes = []
            for child in world["children"][start:end]:
                open_subs = [n for n in child["children"]["nodes"]]
                nodes.append(child | {"children": {"nodes": open_subs[:1]}, "inverseRelations": links_page(child, None, LINK_PAGE)})
            issue["children"] = {"pageInfo": {"hasNextPage": end < len(world["children"]), "endCursor": str(end)}, "nodes": nodes}
        return out({"data": {"issue": issue}})
    child = next((c for c in world["children"] if c["identifier"] == variables.get("id")), None)
    if child and "inverseRelations" in query:
        return out({"data": {"issue": {"inverseRelations": links_page(child, variables.get("after"), 100)}}})
    out({"data": {"issue": None}})


def agent_row(agent):
    return {
        "id": agent["id"],
        "shortId": agent["id"][:7],
        "name": agent["name"],
        "provider": agent.get("provider", "mock/model"),
        "thinking": "auto",
        "status": agent["status"],
        "cwd": agent["cwd"],
        "created": "1 hour ago",
    }


def paseo(world, args):
    cut = args.index("--") if "--" in args else len(args)  # what follows `--` is the prompt
    if "--json" not in args[:cut] and args[:2] != ["plugin", "reload"]:
        return print("AGENT ID  STATUS  (a table: the caller did not pass --json)")
    args = [a for a in args[:cut] if a != "--json"] + args[cut:]
    if args[0] == "ls":
        wanted = dict(pair.split("=", 1) for pair in flags(args, "--label"))
        rows = [
            agent_row(a)
            for a in world["agents"]
            if ("-a" in args or not a.get("archived")) and all(a["labels"].get(k) == v for k, v in wanted.items())
        ]
        return out(rows)
    if args[0] == "inspect":
        agent = next((a for a in world["agents"] if a["id"] == args[1]), None)
        if not agent:
            fail(f"Agent not found: {args[1]}")
        return out({"Id": agent["id"], "Name": agent["name"], "Status": agent["status"], "Archived": bool(agent.get("archived")),
                    "Cwd": expand(agent["cwd"]), "CreatedAt": agent["created"], "UpdatedAt": agent["updated"]})
    if args[:2] == ["workspace", "ls"]:
        return out([w | {"cwd": expand(w["cwd"])} for w in world["workspaces"]])
    if args[:2] == ["workspace", "create"]:
        project = next((p for p in world["projects"] if p["projectId"] == flag(args, "--project")), None)
        if not project:
            fail("Project not found")
        slug = flag(args, "--worktree-slug")
        taken = {w["cwd"] for w in world["workspaces"]} | set(world.get("usedWorktrees", []))
        cwd, n = f"~/paseo/worktrees/{slug}", 0
        while cwd in taken:
            n += 1
            cwd = f"~/paseo/worktrees/{slug}-{n}"
        os.makedirs(expand(cwd), exist_ok=True)
        workspace = {"workspaceId": f"wks_new{len(world['workspaces']) + 1}", "project": project["name"], "name": flag(args, "--title"),
                     "isolation": flag(args, "--isolation"), "cwd": cwd, "background": False}
        world["workspaces"].append(workspace)
        return out(workspace | {"cwd": expand(cwd)})
    if args[0] == "run":
        workspace = next((w for w in world["workspaces"] if w["workspaceId"] == flag(args, "--workspace")), None)
        if not workspace:
            fail("Workspace not found")
        print(f"Using workspace {workspace['workspaceId']}", file=sys.stderr)
        now = os.environ.get("TICKET_RUNS_NOW", "2026-01-01T00:00:00Z")
        agent = {"id": f"agent-new{len(world['agents']) + 1}", "name": flag(args, "--title"), "status": "running", "cwd": workspace["cwd"],
                 "labels": dict(pair.split("=", 1) for pair in flags(args, "--label")), "created": now, "updated": now, "archived": False,
                 "provider": flag(args, "--provider"), "prompt": args[args.index("--") + 1]}
        world["agents"].append(agent)
        return out({"agentId": agent["id"], "status": "running", "provider": agent["provider"].split("/")[0], "cwd": expand(agent["cwd"]), "title": agent["name"]})
    if args[:2] == ["project", "ls"]:
        return out([p | {"path": expand(p["path"])} for p in world["projects"]])
    if args[:2] == ["project", "create"]:
        project = {"projectId": f"prj_new{len(world['projects']) + 1}", "name": os.path.basename(args[2]), "kind": "git", "path": args[2]}
        world["projects"].append(project)
        return out(project)
    if args[:2] == ["project", "rename"]:
        project = next(p for p in world["projects"] if p["projectId"] == args[2])
        project["name"] = args[3]
        return out({"projectId": project["projectId"], "name": project["name"]})
    if args[:2] == ["plugin", "ls"]:
        return out(world.get("plugins", []))
    if args[:2] == ["plugin", "reload"]:
        for plugin in world.get("plugins", []):
            if plugin["id"] == args[2]:
                plugin["status"] = "running"
        return print(f"Reloaded {args[2]}")
    fail(f"fake paseo: unknown command {' '.join(args[:2])}")


def gh(world, args):
    if args[:2] != ["pr", "view"]:
        fail(f"fake gh: unknown command {' '.join(args[:2])}")
    here = os.getcwd()
    for cwd, pr in world.get("prs", {}).items():
        if os.path.realpath(expand(cwd)) == os.path.realpath(here):
            return out(pr)
    fail('no pull requests found for branch "branch"')


def main():
    tool, args = sys.argv[1], sys.argv[2:]
    with open(WORLD + ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with open(WORLD) as handle:
            world = json.load(handle)
        with open(WORLD + ".calls", "a") as calls:
            calls.write(json.dumps([tool, *args]) + "\n")
        # "fail": {"paseo run": "text"} makes every call that starts with those words fail.
        for prefix, message in world.get("fail", {}).items():
            if " ".join([tool, *args]).startswith(prefix):
                fail(message)
        before = json.dumps(world)
        {"linear": linear, "paseo": paseo, "gh": gh}[tool](world, args)
        if json.dumps(world) != before:
            with open(WORLD + ".tmp", "w") as handle:
                json.dump(world, handle)
            os.replace(WORLD + ".tmp", WORLD)


if __name__ == "__main__":
    main()
