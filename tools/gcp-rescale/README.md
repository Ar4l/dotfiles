# gcp-rescale

One-command GPU and disk scaling for a GCP dev VM.

```
gcp-rescale gpu scale <preset> [--spot]           resize between CPU/GPU shapes
gcp-rescale storage scale <size> [--disk NAME]    grow a persistent disk online
gcp-rescale status | gpu list | storage list | ip | use
```

GCP requires the VM to be stopped to change machine type, so a resize kills every
process. This tool automates the whole cycle behind one consent prompt: save tmux
state (tmux-resurrect), stop, atomically patch the shape, start, repoint
`~/.ssh/config` at the new IP, restore sessions, and install the NVIDIA driver if
it is missing. See the script header for details; `gcp-rescale --help` for usage.

## Install

```sh
uv tool install gcp-rescale     # or: uvx gcp-rescale, pipx install gcp-rescale, pip install gcp-rescale
```

The PyPI package wraps the bash script in a tiny Python entry point whose only
jobs are to locate the script inside the wheel and to hand the script a
known-good interpreter as `GCP_RESCALE_PYTHON` (uv guarantees an interpreter for
the wrapper, but does not put it on `PATH` for child processes). Runtime
dependencies are the same either way: `bash`, `gcloud`, `ssh`, `python3` ≥ 3.9.

**On this dotfiles checkout** the repo's `bin/` sits *ahead* of `~/.local/bin`
on `PATH`, so an installed copy is shadowed by `bin/gcp-rescale` (a symlink into
this module). That is a feature — the checkout stays authoritative on the dev
machine — but it will confuse you if you're testing the published package here:
use `uvx --from dist/*.whl gcp-rescale` to run an artifact unambiguously.

Teammates point the tool at their own VM by overriding `DEFAULT_INSTANCE` /
`DEF_ZONE` / `DEF_PROJECT` / `DEF_USER` / `SSH_ALIAS` in
`~/.config/gcp-rescale/config`, once.

## Tests

```sh
make test          # from the repo root; or ./tests/run from this directory
```

~290 offline assertions covering every reachable branch. No network, no gcloud,
no real ssh: `tests/shims/` fakes `gcloud`/`ssh`/`ssh-keygen` on `PATH`, and the
sandbox (`tests/lib.sh`) relocates every path the tool writes
(`XDG_{CONFIG,STATE,CACHE}_HOME`, `GCP_RESCALE_SSH_CONFIG`) into a temp dir —
with a hard safety assertion before any case can run. Each case file is
individually runnable: `/bin/bash tests/cases/30-gpu.sh`.

The suite runs under macOS `/bin/bash` 3.2 on purpose (CI also runs Linux bash);
`tests/run` execs each case with `/bin/bash` explicitly.

The design split, from the 2026-08-31 live QA campaign that found both original
bugs: **shim tests lock in what we send; the live test confirms GCP accepts
it.** Both bugs lived precisely in that gap — no mock would have caught them,
but both now have exact offline-regressable artifacts:

- *Atomic shape patch* (Bug 1): machine type and scheduling must move in **one**
  `instances update-from-file`; sequential `set-scheduling`/`set-machine-type`
  deadlock both ways. The fake gcloud captures the patched YAML; the suite
  asserts on it.
- *Driver version pinning* (Bug 2): `ubuntu-drivers --gpgpu` installs a headless
  driver with no `nvidia-smi`; the fix keys `nvidia-utils-<v>-server` off the
  *loaded* module. The fake ssh logs the command string; the suite asserts the
  literal `nvidia-utils-$v-server` (the `$v` expands remotely — that the number
  resolves correctly is live-only).

### Deliberately not covered offline

- The **loop bodies** of `poll_ip` (60s) and `wait_for_ssh` (180s): both bound
  on `SECONDS` (wall time), so instant-sleep shims would busy-spin for the full
  real duration. The shims answer on the first poll instead; the *caller*
  branches (post_start's warnings) are covered by redefining the pollers.
- The billing-catalog HTTP fetch and SKU pruning: network. The consuming logic
  is covered through a fixture cache; the fake `gcloud auth print-access-token`
  always fails, so tests can never reach the real API.
- `h200` beyond its refusal, regional-disk resize by hand, spot preemption
  recovery, real tmux-resurrect restore, real driver installs: live-only or out
  of scope.

### Live test

```sh
GCP_RESCALE_LIVE=1 tests/live    # ~$1, ~15 min, real GCP
```

Creates a throwaway `gcp-rescale-ci-*` VM (never touches `aral-rem-dev`; asserts
its config and describe-output are unchanged afterwards), walks one GPU rung
(`l4 --spot`) plus both storage paths with canary files on both disks, and tears
everything down in an EXIT trap. `ZONE_RESOURCE_POOL_EXHAUSTED` is reported as a
SKIP, not a failure — on-demand L4 capacity in the zone genuinely comes and
goes. **Run it before tagging a release**; CI cannot reach GCP.

## Releasing

1. Bump `VERSION` in `bin/gcp-rescale` *and* `version` in `pyproject.toml`
   (CI fails the release if either disagrees with the tag).
2. `GCP_RESCALE_LIVE=1 tests/live` — green or consciously skipped.
3. `git tag gcp-rescale-v0.1.0 && git push origin gcp-rescale-v0.1.0`

The release workflow re-runs the offline suite, builds with `uv build`,
smoke-tests the built wheel (`uvx --from dist/*.whl gcp-rescale --version`),
creates a GitHub Release with the artifacts, and publishes to PyPI via Trusted
Publishing (OIDC — no token stored anywhere).

One-time prerequisite: create a PyPI *pending publisher* for project
`gcp-rescale` (owner `Ar4l`, repo `dotfiles`, workflow
`gcp-rescale-release.yml`) at pypi.org/manage/account/publishing. Until then the
publish step fails; everything before it (tests, build, smoke, GitHub Release)
still works.
