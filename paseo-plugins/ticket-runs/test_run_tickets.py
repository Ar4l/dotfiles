"""Tests of run_tickets.py against stand-ins for `linear`, `paseo` and `gh`.

    python3 -m unittest test_run_tickets -v      (from this folder)

testdata/fake_cli.py answers in the shapes the real tools print. testdata/recorded.json is one
parent ticket with 88 sub-tickets and 36 agents as the real tools reported it on 2026-11-16.
No test touches Linear, Paseo or GitHub.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "run_tickets.py"
FAKE = HERE / "testdata" / "fake_cli.py"
T0 = "2026-03-02T09:03:00Z"
STATES = {"backlog": "Backlog", "unstarted": "Todo", "started": "In Progress", "completed": "Done", "canceled": "Canceled"}
WRITES = ("issueUpdate", "paseo run", "paseo workspace create", "paseo project create", "paseo project rename", "paseo plugin reload")

sys.path.insert(0, str(HERE))
import run_tickets  # noqa: E402


def ticket(n, state="unstarted", assignee=None, labels=(), blocked_by=(), subs=()):
    """A sub-ticket in the shape `linear api` returns it. `blocked_by` lists (number, state type)."""
    return {
        "id": f"issue-{n}",
        "identifier": f"TEST-{n}",
        "title": f"Ticket {n}",
        "url": f"https://linear.example/TEST-{n}",
        "state": {"name": STATES[state], "type": state},
        "assignee": {"id": assignee} if assignee else None,
        "labels": {"nodes": [{"name": name} for name in labels]},
        "children": {"nodes": [{"identifier": f"TEST-{sub}"} for sub in subs]},
        "inverseRelations": {"nodes": [{"type": "blocks", "issue": {"identifier": f"TEST-{b}", "state": {"type": kind}}} for b, kind in blocked_by]},
    }


def agent(n, ticket_n, status="idle", archived=False):
    return {
        "id": f"agent-{n}",
        "name": f"TEST-{ticket_n} Ticket {ticket_n}",
        "status": status,
        "cwd": f"~/paseo/worktrees/test-{ticket_n}",
        "labels": {"run": "TEST-1", "ticket": f"TEST-{ticket_n}"},
        "created": f"2026-03-01T0{n}:00:00Z",
        "updated": f"2026-03-01T0{n}:30:00Z",
        "archived": archived,
    }


def workspace(ticket_n):
    return {"workspaceId": f"wks_{ticket_n}", "project": "TEST-1 Mock parent", "name": f"TEST-{ticket_n} Ticket {ticket_n}",
            "isolation": "worktree", "cwd": f"~/paseo/worktrees/test-{ticket_n}", "background": False}


def small_world():
    """TEST-11 is ready, 12 waits for 11, 13 belongs to someone else, 14 is done, 15 has an open sub-ticket."""
    return {
        "me": "user-me",
        "parent": {"identifier": "TEST-1", "title": "Mock parent", "url": "https://linear.example/TEST-1"},
        "children": [
            ticket(11),
            ticket(12, blocked_by=[(11, "unstarted")]),
            ticket(13, state="started", assignee="user-2"),
            ticket(14, state="completed"),
            ticket(15, subs=[151]),
        ],
        "agents": [],
        "workspaces": [],
        "projects": [],
        "prs": {},
    }


class Case(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ticket-runs-test."))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.world_file = self.tmp / "world.json"
        self.state_dir = self.tmp / "state"
        self.repo = self.home / "repo"
        (self.repo / "sub").mkdir(parents=True)
        self.bin.mkdir()
        for name in ("linear", "paseo", "gh"):
            self.install(name)
        for name in ("git", "sh", "env"):
            (self.bin / name).symlink_to(shutil.which(name))
        (self.home / ".paseo").mkdir()
        (self.home / ".paseo" / "config.json").write_text(json.dumps({"daemon": {"agentProfiles": [
            {"name": "first", "provider": "mock", "model": "one", "thinkingOptionId": "high"},
            {"name": "second", "provider": "mock", "model": "two"},
        ]}}))
        self.env = {
            "HOME": str(self.home),
            "PATH": str(self.bin),
            "FAKE_WORLD": str(self.world_file),
            "TICKET_RUNS_STATE": str(self.state_dir),
            "TICKET_RUNS_NOW": T0,
            "PASEO_AGENT_ID": "caller",  # the script must not hand this to paseo
            "GIT_CONFIG_GLOBAL": "/dev/null",
        }
        git = ["git", "-C", str(self.repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false"]
        subprocess.run([*git, "init", "-q", "-b", "main"], check=True, env=self.env)
        (self.repo / "sub" / "file").write_text("x\n")
        subprocess.run([*git, "add", "."], check=True, env=self.env)
        subprocess.run([*git, "commit", "-q", "-m", "init"], check=True, env=self.env)
        self.put(small_world())

    def install(self, name):
        path = self.bin / name
        path.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{FAKE}" {name} "$@"\n')
        path.chmod(0o755)

    def put(self, world):
        self.world_file.write_text(json.dumps(world))

    def world(self):
        return json.loads(self.world_file.read_text())

    def edit(self, change):
        world = self.world()
        change(world)
        self.put(world)

    def child(self, world, n):
        return next(c for c in world["children"] if c["identifier"] == f"TEST-{n}")

    def close(self, n):
        def change(world):
            self.child(world, n)["state"] = {"name": "Done", "type": "completed"}
            for c in world["children"]:
                for link in c["inverseRelations"]["nodes"]:
                    if link["issue"]["identifier"] == f"TEST-{n}":
                        link["issue"]["state"]["type"] = "completed"
        self.edit(change)

    def script(self, *args, now=None, cwd=None, ok=True):
        env = self.env | ({"TICKET_RUNS_NOW": now} if now else {})
        result = subprocess.run([sys.executable, str(SCRIPT), *args], cwd=cwd or self.repo / "sub", env=env, text=True, capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return result

    def calls(self):
        path = Path(str(self.world_file) + ".calls")
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def writes(self):
        return [call for call in self.calls() if any(word in " ".join(call) for word in WRITES)]

    def forget_calls(self):
        Path(str(self.world_file) + ".calls").unlink(missing_ok=True)

    def state(self, run="TEST-1"):
        return json.loads((self.state_dir / f"{run}.json").read_text())

    def states(self, run="TEST-1"):
        return {t["id"]: t["state"] for t in self.state(run)["tickets"]}

    def row(self, n, run="TEST-1"):
        return next(t for t in self.state(run)["tickets"] if t["id"] == f"TEST-{n}")


class Start(Case):
    def test_start_without_a_settings_file(self):
        self.script("start", "TEST-1")
        world, state = self.world(), self.state()
        # Every ready ticket starts: 11 only.
        self.assertEqual(self.states(), {"TEST-11": "working", "TEST-12": "not_started", "TEST-13": "not_started", "TEST-15": "not_started"})
        self.assertEqual(self.child(world, 11)["assignee"], {"id": "user-me"})
        self.assertEqual([c["identifier"] for c in world["children"] if c["assignee"] == {"id": "user-me"}], ["TEST-11"])
        # The run has its own detached worktree and its own Paseo project, named after the parent.
        worktree = self.home / "worktrees" / "test-1"
        self.assertTrue((worktree / "sub" / "file").is_file())
        self.assertEqual(world["projects"], [{"projectId": "prj_new1", "name": "TEST-1 Mock parent", "kind": "git", "path": str(worktree / "sub")}])
        # The flags of § Tick step 2 of the old skill.
        create = next(call for call in self.calls() if call[:3] == ["paseo", "workspace", "create"])
        self.assertEqual(create[3:-1], ["--isolation", "worktree", "--project", "prj_new1", "--path", str(worktree / "sub"),
                                        "--worktree-slug", "test-11", "--base", "main", "--title", "TEST-11 Ticket 11"])
        run = next(call for call in self.calls() if call[:2] == ["paseo", "run"])
        self.assertEqual(run[2:-3], ["--workspace", "wks_new1", "--provider", "mock/one", "--thinking", "high", "--mode", "auto",
                                     "--title", "TEST-11 Ticket 11", "--label", "run=TEST-1", "--label", "ticket=TEST-11", "--no-wait"])
        prompt = world["agents"][0]["prompt"]
        self.assertTrue(prompt.startswith('Work on Linear ticket TEST-11 "Ticket 11" (https://linear.example/TEST-11), a sub-ticket of TEST-1. '
                                          "It is assigned to me, which marks it as yours.\n"))
        self.assertIn("To give the ticket back, remove its assignee and say why.", prompt)
        self.assertNotIn("{", prompt.replace("$(", "").replace("${", ""))
        self.assertNotIn("An earlier agent", prompt)
        # How the run works closes every prompt: no label and a wait of 1 hour here.
        self.assertTrue(prompt.endswith(
            "\n\nHow the ticket run works: every sub-ticket of TEST-1 that has no assignee and no open blocker gets its own agent and workspace.\n"
            "- That covers any sub-ticket you file, 1 hour after you file it.\n"
            "- Tickets that TEST-11 blocks start once TEST-11 closes.\n"
            "- This workspace is for TEST-11 only. Start a second session here to hand off when your context runs long, "
            f"or for a part that waits on me: `{SCRIPT} session TEST-1 TEST-11 BRIEF_FILE`. For anything else, use subagents.\n"))
        # The state file carries what the screen needs.
        self.assertEqual(state["health"] | {"nextCheckAt": None}, {"state": "ok", "dryRun": False, "checkedAt": T0, "nextCheckAt": None,
                                                                    "lastResult": "started TEST-11", "error": None})
        self.assertEqual(state["health"]["nextCheckAt"], "2026-03-02T09:10:00Z")
        self.assertEqual(state["recent"], [{"id": "TEST-11", "title": "Ticket 11", "startedAt": T0, "agentId": "agent-new1"}])
        self.assertEqual(self.row(12)["blockedBy"], ["TEST-11"])
        self.assertEqual([self.row(n)["reason"] for n in (12, 13, 15)], ["blocked", "assigned_no_agent", "sub_tickets"])
        self.assertEqual(state["script"], str(SCRIPT))
        self.assertEqual([line["label"] for line in state["what"]], ["Starts", "Prompt", "Agent", "Folder", "Branch", "After the last ticket"])

    def test_start_again_reuses_worktree_and_project(self):
        self.script("start", "TEST-1")
        self.forget_calls()
        self.script("start", "TEST-1", "wait_minutes=5")
        self.assertEqual(self.writes(), [])
        self.assertEqual(len(self.world()["projects"]), 1)
        self.assertEqual(self.state()["settings"]["wait_minutes"], 5)

    def test_settings_file_then_pairs(self):
        file = self.tmp / "kind.toml"
        file.write_text('label = "go"\nagent = "second"\nwait_minutes = 30\nprompt = """\nDo {id} of {parent}: {title} at {url}.\nSecond line.\n"""\nfinish_prompt = "Wrap up {parent}."\n')
        self.edit(lambda w: self.child(w, 11)["labels"]["nodes"].append({"name": "go"}))
        self.edit(lambda w: w["children"].append(ticket(16)))
        self.script("start", "TEST-1", "--settings", str(file), "wait_minutes=7", "mode=plan")
        state = self.state()
        self.assertEqual({k: state["settings"][k] for k in ("label", "agent", "wait_minutes", "mode", "base")},
                         {"label": "go", "agent": "second", "wait_minutes": 7, "mode": "plan", "base": "main"})
        self.assertEqual(self.states()["TEST-16"], "not_started")
        self.assertEqual(self.row(16)["reason"], "no_label")
        run = next(call for call in self.calls() if call[:2] == ["paseo", "run"])
        self.assertEqual(run[4:8], ["--provider", "mock/two", "--mode", "plan"])
        prompt = self.world()["agents"][0]["prompt"]
        self.assertTrue(prompt.startswith("Do TEST-11 of TEST-1: Ticket 11 at https://linear.example/TEST-11.\nSecond line.\n\nHow the ticket run works: "))
        # The run's label and wait are named, and a wait of 0 is left out.
        self.assertIn("every sub-ticket of TEST-1 that carries the label `go` and has no assignee and no open blocker gets", prompt)
        self.assertIn("- That covers any sub-ticket you file, 7 minutes after you file it. Without the label it waits for me.\n", prompt)
        self.script("start", "TEST-1", "--settings", str(file), "wait_minutes=0", "--dry-run")
        self.assertIn("- That covers any sub-ticket you file. Without the label", run_tickets.how_the_run_works({"id": "TEST-1", "script": str(SCRIPT), "settings": {"label": "go", "wait_minutes": 0}}, "TEST-11"))
        what = {line["label"]: line["text"] for line in state["what"]}
        self.assertEqual(what["Starts"], "Every ready sub-ticket of TEST-1 that carries the label go. A ticket added later waits 7 minutes. "
                                         "A ticket given back more than 2 times waits for you.")
        self.assertEqual(what["Prompt"], "Do {id} of {parent}: {title} at {url}. …")
        self.assertEqual(what["Agent"], "second (mock/two), mode plan")
        self.assertEqual(what["After the last ticket"], "One agent starts with: Wrap up {parent}.")
        self.assertEqual(what["Settings file"], "~" + str(file)[len(str(self.home)):] if str(file).startswith(str(self.home)) else str(file))

    def test_unknown_setting_stops_start(self):
        file = self.tmp / "bad.toml"
        file.write_text('labels = "go"\n')
        for args in (["--settings", str(file)], ["labels=go"], ["wait_minutes=soon"]):
            result = self.script("start", "TEST-1", *args, ok=False)
            self.assertEqual(result.returncode, 1)
        self.assertIn("unknown setting labels", self.script("start", "TEST-1", "labels=go", ok=False).stderr)
        self.assertEqual(self.writes(), [])
        self.assertFalse(self.state_dir.exists() and list(self.state_dir.glob("*.json")))

    def test_dry_run_prints_and_stores_nothing(self):
        result = self.script("start", "TEST-1", "--dry-run")
        self.assertIn("What the run does", result.stdout)
        self.assertIn("Would start now · 1\n  TEST-11  Ticket 11", result.stdout)
        self.assertIn("Blocked · 3", result.stdout)
        self.assertEqual(self.writes(), [])
        self.assertFalse(self.state_dir.exists())
        self.assertFalse((self.home / "worktrees").exists())

    def test_settings_files_in_the_repo_hold_known_names(self):
        files = sorted((HERE / "settings").glob("*.toml"))
        self.assertIn("example.toml", [f.name for f in files])
        for file in files:
            values, _ = run_tickets.resolve_settings(str(file), [])
            self.assertTrue(values["prompt"], file.name)
        # The example sets every setting, so it cannot fall behind the script.
        self.assertEqual(set(tomllib.loads((HERE / "settings" / "example.toml").read_text())), set(run_tickets.DEFAULTS))


class Rules(Case):
    def test_ticket_added_later_waits_an_hour(self):
        self.script("start", "TEST-1")
        self.edit(lambda w: w["children"].append(ticket(16)))
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual((self.row(16)["state"], self.row(16)["at"], self.row(16)["addedAt"]), ("waiting", "2026-03-02T10:10:00Z", "2026-03-02T09:10:00Z"))
        self.script("check", now="2026-03-02T10:00:00Z")
        self.assertEqual(self.states()["TEST-16"], "waiting")
        self.script("check", now="2026-03-02T10:10:00Z")
        self.assertEqual(self.states()["TEST-16"], "working")
        self.assertEqual(self.state()["health"]["lastResult"], "started TEST-16")

    def test_start_now_skips_the_wait(self):
        self.script("start", "TEST-1")
        self.edit(lambda w: w["children"].append(ticket(16)))
        self.script("check", now="2026-03-02T09:10:00Z")
        self.script("check", "TEST-1", "--start", "TEST-16", now="2026-03-02T09:11:00Z")
        self.assertEqual(self.states()["TEST-16"], "working")
        self.assertEqual(self.script("check", "TEST-1", "--start", "TEST-99", ok=False).returncode, 1)

    def test_unblocked_ticket_starts_at_the_next_check(self):
        self.script("start", "TEST-1")
        self.close(11)
        self.edit(lambda w: w["agents"][0].update(status="idle"))
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual(self.states()["TEST-12"], "working")
        self.assertNotIn("TEST-11", self.states())

    def test_one_agent_at_a_time_per_ticket(self):
        self.script("start", "TEST-1")
        # The agent gives the ticket back while it still runs: nothing starts.
        self.edit(lambda w: self.child(w, 11).update(assignee=None))
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual(len(self.world()["agents"]), 1)
        self.assertEqual(self.states()["TEST-11"], "working")

    def test_ticket_given_back_gets_a_fresh_agent_in_its_workspace(self):
        self.script("start", "TEST-1")

        def give_back(world):
            self.child(world, 11)["assignee"] = None
            world["agents"][0]["status"] = "idle"
        self.edit(give_back)
        self.forget_calls()
        self.script("check", now="2026-03-02T09:10:00Z")
        world = self.world()
        self.assertEqual([a["cwd"] for a in world["agents"]], ["~/paseo/worktrees/test-11"] * 2)
        self.assertEqual(len(world["workspaces"]), 1)
        self.assertIn("An earlier agent worked on this ticket in this folder.", world["agents"][1]["prompt"])
        self.assertEqual(self.child(world, 11)["assignee"], {"id": "user-me"})
        self.assertEqual(self.row(11)["agentId"], "agent-new2")

    def test_ticket_given_back_a_third_time_waits_for_you(self):
        self.script("start", "TEST-1")

        def give_back(world):
            self.child(world, 11)["assignee"] = None
            for a in world["agents"]:
                a["status"] = "idle"
        for minute, agents in ((10, 2), (20, 3), (30, 3), (40, 3)):
            self.edit(give_back)
            self.script("check", now=f"2026-03-02T09:{minute}:00Z")
            self.assertEqual(len(self.world()["agents"]), agents)
        row = self.row(11)
        self.assertEqual((row["state"], row["reason"], row["agentId"]), ("idle", "given_back", "agent-new3"))
        self.assertIsNone(self.child(self.world(), 11)["assignee"])
        self.assertEqual(self.state()["health"]["lastResult"], "nothing to start")
        # You decide: "Replace agent" starts another one and takes the ticket again.
        self.script("replace", "TEST-1", "TEST-11", now="2026-03-02T09:45:00Z")
        self.assertEqual((len(self.world()["agents"]), self.row(11)["state"]), (4, "working"))
        self.assertEqual(self.child(self.world(), 11)["assignee"], {"id": "user-me"})
        # A ticket that closes is forgotten: reopened, it counts from zero.
        self.close(11)
        self.edit(lambda w: [a.update(status="idle") for a in w["agents"]])
        self.script("check", now="2026-03-02T09:50:00Z")
        self.assertEqual(self.state()["memory"]["returns"], {})

    def test_idle_agent_of_an_open_ticket_needs_you(self):
        self.script("start", "TEST-1")
        self.edit(lambda w: w["agents"][0].update(status="idle"))
        self.script("check", now="2026-03-02T09:20:00Z")
        row = self.row(11)
        self.assertEqual((row["state"], row["linearState"], row["at"], row["pr"]), ("idle", "Todo", "2026-03-02T09:20:00Z", None))
        self.assertEqual(self.state()["health"]["lastResult"], "nothing to start")

    def test_pull_request_states(self):
        checks = {"passed": [{"__typename": "CheckRun", "status": "COMPLETED", "conclusion": "SUCCESS"}, {"__typename": "CheckRun", "status": "COMPLETED", "conclusion": "SKIPPED"}],
                  "failed": [{"__typename": "CheckRun", "status": "COMPLETED", "conclusion": "FAILURE"}, {"__typename": "CheckRun", "status": "IN_PROGRESS", "conclusion": ""}],
                  "running": [{"__typename": "StatusContext", "state": "PENDING"}]}

        def change(world):
            world["children"] += [ticket(n, state="started", assignee="user-me") for n in (21, 22, 23, 24)]
            world["agents"] += [agent(i + 1, n) for i, n in enumerate((21, 22, 23, 24))]
            world["workspaces"] += [workspace(n) for n in (21, 22, 23, 24)]
            for n, kind, state in ((21, "passed", "OPEN"), (22, "failed", "OPEN"), (23, "running", "OPEN"), (24, "passed", "MERGED")):
                os.makedirs(self.home / "paseo/worktrees" / f"test-{n}")
                world["prs"][f"~/paseo/worktrees/test-{n}"] = {"number": n, "state": state, "url": f"https://github.example/pull/{n}", "statusCheckRollup": checks[kind]}
        self.edit(change)
        self.script("start", "TEST-1")
        self.assertEqual([self.row(n)["state"] for n in (21, 22, 23, 24)], ["ready_to_merge", "checks_failed", "idle", "idle"])
        self.assertEqual(self.row(21)["pr"], {"number": 21, "url": "https://github.example/pull/21", "state": "open", "checks": "passed"})
        self.assertEqual([(self.row(n)["pr"]["state"], self.row(n)["pr"]["checks"]) for n in (23, 24)], [("open", "running"), ("merged", "passed")])
        self.assertEqual(self.row(21)["at"], "2026-03-01T01:30:00Z")
        # Without gh a row shows no pull request.
        (self.bin / "gh").unlink()
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual([(self.row(n)["state"], self.row(n)["pr"]) for n in (21, 22)], [("idle", None)] * 2)

    def test_closed_ticket_shows_only_while_its_agent_runs(self):
        self.script("start", "TEST-1")
        self.close(11)
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual(self.states()["TEST-11"], "closed_agent_running")
        self.edit(lambda w: w["agents"][0].update(status="idle"))
        self.script("check", now="2026-03-02T09:20:00Z")
        self.assertNotIn("TEST-11", self.states())

    def test_failed_start_frees_the_ticket_and_retries(self):
        self.edit(lambda w: w.update(fail={"paseo run": "Provider is not available"}))
        result = self.script("start", "TEST-1")
        row = self.row(11)
        self.assertEqual(row["state"], "could_not_start")
        self.assertIn("Provider is not available", row["error"])
        self.assertIsNone(self.child(self.world(), 11)["assignee"])
        self.assertEqual(self.state()["health"]["lastResult"], "nothing to start, 1 could not start")
        self.assertIn("could not start TEST-11", result.stdout)
        # The next check tries again in the workspace the first try made.
        self.edit(lambda w: w.pop("fail"))
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual(self.states()["TEST-11"], "working")
        self.assertEqual(len(self.world()["workspaces"]), 1)

    def test_ticket_the_script_assigned_without_an_agent_is_unassigned(self):
        self.script("start", "TEST-1")
        self.edit(lambda w: w["agents"][0].update(archived=True, status="closed"))
        self.edit(lambda w: w.update(fail={"paseo run": "down"}))
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertIsNone(self.child(self.world(), 11)["assignee"])
        # A ticket someone else assigned stays theirs.
        self.assertEqual(self.child(self.world(), 13)["assignee"], {"id": "user-2"})

    def test_failed_answer_starts_nothing_and_shows(self):
        self.script("start", "TEST-1", "--watch")
        for prefix, words in (("linear api", "linear api failed: Linear is down"), ("paseo ls", "paseo ls -g failed: Linear is down")):
            self.edit(lambda w: w.update(fail={prefix: "Linear is down"}))
            self.forget_calls()
            result = self.script("check", ok=False, now="2026-03-02T09:10:00Z")
            self.assertEqual(result.returncode, 1)
            health = self.state()["health"]
            self.assertEqual((health["state"], health["error"], health["checkedAt"]), ("failed", words, "2026-03-02T09:10:00Z"))
            self.assertEqual(self.writes(), [])
            # The tickets of the last good check stay on the screen.
            self.assertEqual(self.states()["TEST-11"], "waiting")
        self.edit(lambda w: w.pop("fail"))
        self.script("check", now="2026-03-02T09:20:00Z")
        self.assertEqual(self.state()["health"]["state"], "ok")

    def test_unreadable_answer_fails_the_check(self):
        self.script("start", "TEST-1", "--watch")
        (self.bin / "linear").write_text("#!/bin/sh\necho '<html>502</html>'\n")
        self.assertEqual(self.script("check", ok=False).returncode, 1)
        self.assertIn("unreadable answer", self.state()["health"]["error"])

    def test_dry_run_check_and_watched_run_write_nothing(self):
        self.script("start", "TEST-1", "--watch")
        state = self.state()
        self.assertEqual((self.states()["TEST-11"], self.row(11)["at"]), ("waiting", None))
        self.assertEqual((state["health"]["dryRun"], state["health"]["lastResult"], state["projectId"]), (True, "would start TEST-11", None))
        self.assertEqual(self.script("check", "TEST-1", "--start", "TEST-11", ok=False).returncode, 1)
        self.assertEqual(self.script("replace", "TEST-1", "TEST-11", ok=False).returncode, 1)
        self.assertEqual(self.writes(), [])
        self.assertFalse((self.home / "worktrees").exists())
        self.assertIn("TEST-1 dry run: would start TEST-11", (self.state_dir / "log").read_text())
        # A plain start makes the run real; `check --dry-run` still writes nothing.
        self.edit(lambda w: w.update(fail={"paseo run": "down"}))
        self.script("start", "TEST-1")
        self.edit(lambda w: w.pop("fail"))
        self.forget_calls()
        self.script("check", "--dry-run", now="2026-03-02T09:10:00Z")
        self.assertEqual(self.writes(), [])
        self.assertEqual(self.state()["health"]["lastResult"], "would start TEST-11")

    def test_pause_and_resume(self):
        self.script("start", "TEST-1", "--watch")
        self.script("start", "TEST-1", "wait_minutes=0")
        self.script("pause", "TEST-1")
        self.assertEqual(self.state()["health"]["state"], "paused_by_user")
        self.edit(lambda w: w["children"].append(ticket(16)))
        self.forget_calls()
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual(self.writes(), [])
        self.assertEqual((self.states()["TEST-16"], self.state()["health"]["state"]), ("waiting", "paused_by_user"))
        self.script("pause", "TEST-1", "--resume")
        self.script("check", now="2026-03-02T09:20:00Z")
        self.assertEqual((self.states()["TEST-16"], self.state()["health"]["state"]), ("working", "ok"))

    def test_last_ticket_closed_starts_the_finish_agent_once(self):
        self.edit(lambda w: w.update(children=[ticket(11), ticket(14, state="completed")]))
        self.script("start", "TEST-1", "finish_prompt=Wrap up {parent}.")
        self.close(11)
        self.edit(lambda w: w["agents"][0].update(status="idle"))
        self.script("check", now="2026-03-02T09:10:00Z")
        world, state = self.world(), self.state()
        self.assertEqual((state["health"]["state"], state["health"]["lastResult"], state["tickets"]), ("finished", "started the agent for the finished run", []))
        self.assertEqual((world["agents"][1]["prompt"], world["agents"][1]["labels"], world["agents"][1]["cwd"]),
                         ("Wrap up TEST-1.", {"run": "TEST-1"}, "~/paseo/worktrees/test-1-done"))
        self.script("check", now="2026-03-02T09:20:00Z")
        self.assertEqual(len(self.world()["agents"]), 2)
        # A ticket added later makes the run active again.
        self.edit(lambda w: w["children"].append(ticket(16)))
        self.script("check", now="2026-03-02T09:30:00Z")
        self.assertEqual((self.state()["health"]["state"], self.states()["TEST-16"]), ("ok", "waiting"))

    def test_no_finish_prompt_starts_nothing(self):
        self.edit(lambda w: w.update(children=[ticket(11)]))
        self.script("start", "TEST-1")
        self.close(11)
        self.edit(lambda w: w["agents"][0].update(status="idle"))
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual((len(self.world()["agents"]), self.state()["health"]["state"]), (1, "finished"))

    def test_replace_starts_a_new_agent_in_the_same_workspace(self):
        self.script("start", "TEST-1")
        self.assertIn("is running", self.script("replace", "TEST-1", "TEST-11", ok=False).stderr)
        self.edit(lambda w: w["agents"][0].update(status="idle"))
        self.script("replace", "TEST-1", "TEST-11", now="2026-03-02T09:15:00Z")
        world = self.world()
        self.assertEqual([(a["cwd"], a["status"], a["archived"]) for a in world["agents"]], [("~/paseo/worktrees/test-11", "idle", False), ("~/paseo/worktrees/test-11", "running", False)])
        self.assertEqual(len(world["workspaces"]), 1)
        self.assertEqual((self.row(11)["state"], self.row(11)["agentId"]), ("working", "agent-new2"))
        self.assertEqual(self.script("replace", "TEST-1", "TEST-14", ok=False).returncode, 1)

    def test_session_starts_one_more_agent_in_the_tickets_workspace(self):
        self.script("start", "TEST-1")
        note = self.tmp / "brief.md"
        note.write_text("Finish the {id} docs.\n")
        self.forget_calls()
        out = self.script("session", "TEST-1", "TEST-11", str(note), "--title", "docs", now="2026-03-02T09:15:00Z").stdout
        self.assertIn("TEST-1 started another session on TEST-11: agent-new2", out)
        self.assertIn("archive the workspace only when every session in it is done", out)
        world = self.world()
        # Both sessions run in the one workspace, and the new one carries the labels the run reads.
        self.assertEqual([(a["cwd"], a["status"]) for a in world["agents"]], [("~/paseo/worktrees/test-11", "running")] * 2)
        self.assertEqual(len(world["workspaces"]), 1)
        self.assertEqual((world["agents"][1]["name"], world["agents"][1]["labels"]), ("TEST-11 docs", {"run": "TEST-1", "ticket": "TEST-11"}))
        self.assertEqual([call[:2] for call in self.writes()], [["paseo", "run"]])
        prompt = world["agents"][1]["prompt"]
        self.assertTrue(prompt.startswith('Another session on Linear ticket TEST-11 "Ticket 11" (https://linear.example/TEST-11) hands you part of its work, '
                                          "in the same workspace. Its brief for you:\n\nFinish the {id} docs.\n\nWhat follows"))
        self.assertIn("\n\nWork on Linear ticket TEST-11 ", prompt)
        self.assertIn("How the ticket run works: ", prompt)
        self.assertNotIn("An earlier agent", prompt)
        # The next check shows the ticket as working, on the new session.
        self.script("check", now="2026-03-02T09:20:00Z")
        self.assertEqual((self.row(11)["state"], self.row(11)["agentId"]), ("working", "agent-new2"))
        self.assertEqual(self.child(self.world(), 11)["assignee"], {"id": "user-me"})
        # No session for a ticket without a workspace, a closed ticket, or an empty brief.
        self.assertIn("has no workspace yet", self.script("session", "TEST-1", "TEST-12", str(note), ok=False).stderr)
        self.assertIn("not an open sub-ticket", self.script("session", "TEST-1", "TEST-14", str(note), ok=False).stderr)
        note.write_text("\n")
        self.assertIn("the brief is empty", self.script("session", "TEST-1", "TEST-11", str(note), ok=False).stderr)
        self.assertIn("cannot read the brief", self.script("session", "TEST-1", "TEST-11", str(self.tmp / "none.md"), ok=False).stderr)

    def test_list_and_remove(self):
        self.script("start", "TEST-1")
        listing = self.script("list", "TEST-1").stdout
        for words in ("worktree     ~/worktrees/test-1", "project      prj_new1  TEST-1 Mock parent", "workspace    wks_new1  ~/paseo/worktrees/test-11", "agent        agent-new1  running"):
            self.assertIn(words, listing)
        removed = self.script("remove", "TEST-1").stdout
        self.assertIn("agent        agent-new1", removed)
        self.assertFalse((self.state_dir / "TEST-1.json").exists())
        self.assertTrue((self.home / "worktrees" / "test-1").is_dir())
        self.assertEqual(self.script("check", "TEST-1", ok=False).returncode, 1)
        self.script("check")

    def test_check_reloads_a_failed_plugin(self):
        self.script("start", "TEST-1")
        self.edit(lambda w: w.update(plugins=[{"id": "ticket-runs", "status": "failed"}, {"id": "other", "status": "failed"}]))
        self.script("check", "--dry-run")
        self.assertEqual(self.world()["plugins"][0]["status"], "failed")
        self.script("check")
        self.assertEqual([p["status"] for p in self.world()["plugins"]], ["running", "failed"])

    def test_paseo_calls_drop_the_callers_agent(self):
        (self.bin / "paseo").write_text(f'#!/bin/sh\n[ -z "$PASEO_AGENT_ID" ] || {{ echo "called as an agent" >&2; exit 1; }}\nexec "{sys.executable}" "{FAKE}" paseo "$@"\n')
        self.script("start", "TEST-1")
        self.assertEqual(self.states()["TEST-11"], "working")


class Recorded(Case):
    """The ready rule on one real parent: 88 sub-tickets, 36 agents, one ticket with 70 blocking links."""

    def setUp(self):
        super().setUp()
        self.recorded = json.loads((HERE / "testdata" / "recorded.json").read_text())
        self.put({k: v for k, v in self.recorded.items() if k not in ("expected", "$comment")})
        (self.home / "worktrees/test-230/sub").mkdir(parents=True)
        for recorded in self.recorded["agents"]:
            os.makedirs(os.path.join(self.home, recorded["cwd"][2:]), exist_ok=True)

    def said(self, row):
        """A state file row in the words of the independent rule."""
        if row["blockedBy"]:
            return "blocked by " + ", ".join(row["blockedBy"])
        by_state = {"waiting": "ready", "not_started": {"assigned_no_agent": "assigned", "sub_tickets": "has open sub-tickets", "no_label": "no label go"}.get(row["reason"])}
        return by_state.get(row["state"], "assigned")

    def test_ready_rule_matches_the_independent_rule(self):
        for key, pairs in (("label", ["label=go"]), ("no_label", [])):
            self.script("start", "TEST-230", "--watch", *pairs)
            state = self.state("TEST-230")
            self.assertEqual({t["id"]: self.said(t) for t in state["tickets"]}, self.recorded["expected"][key])
            self.assertEqual(self.writes(), [])
        self.assertEqual(state["projectId"], "prj_01")
        # Agents are found by their labels `run=` and `ticket=`; each open ticket shows its latest one.
        agents = state["memory"]["agents"]
        self.assertEqual(len(agents), 36)
        self.assertEqual({a["id"]: a["labels"].get("ticket") for a in self.recorded["agents"]}, {i: a["ticket"] for i, a in agents.items()})
        shown = [t for t in state["tickets"] if t["agentId"]]
        self.assertEqual(len(shown), 30)
        self.assertEqual(sum(1 for t in shown if t["pr"]), 9)
        counts = {name: sum(1 for t in state["tickets"] if t["state"] == name) for name in {t["state"] for t in state["tickets"]}}
        self.assertEqual(counts, {"ready_to_merge": 8, "checks_failed": 1, "idle": 21, "not_started": 33})
        # The second check asks Paseo for nothing per agent: the record holds each agent's ticket.
        self.forget_calls()
        self.script("check", now="2026-03-02T09:10:00Z")
        self.assertEqual([call[:2] for call in self.calls() if call[0] == "paseo"], [["paseo", "ls"], ["paseo", "workspace"], ["paseo", "plugin"]])


if __name__ == "__main__":
    unittest.main()
