#!/usr/bin/env bash
# End-to-end check of the switcher: the released app bundle in headless Chromium against a
# throwaway daemon with seven mock agents. The live daemon and ~/.paseo are never touched.
#
#   e2e/run.sh          run the spec, then stop the daemon and delete its home
#   e2e/run.sh --keep   leave the daemon running afterwards, to open the rig in a browser
set -euo pipefail

keep=${1:-}
plugin=$(cd "$(dirname "$0")/.." && pwd)
resources=${PASEO_RESOURCES:-/Applications/Paseo.app/Contents/Resources}
home=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/paseo-mru-e2e.XXXXXX")" && pwd -P)
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')

# The released launcher (bin/paseo) pins PASEO_NODE_ENV=production, which hides the mock
# provider, so this starts the same entrypoint in development mode. PASEO_AGENT_* are
# dropped so the CLI does not act as the agent that started this script.
cli=(env -u PASEO_AGENT_ID -u PASEO_AGENT_CWD -u PASEO_WORKSPACE_ID
  PASEO_HOME="$home" PASEO_NODE_ENV=development ELECTRON_RUN_AS_NODE=1 PASEO_CLI="$resources/bin/paseo"
  "$resources/../Frameworks/Paseo Helper.app/Contents/MacOS/Paseo Helper" --disable-warning=DEP0040
  "$resources/app.asar.unpacked/dist/daemon/node-entrypoint-runner.js" node-script
  "$resources/app.asar/node_modules/@getpaseo/cli/dist/index.js")
paseo() { "${cli[@]}" "$@"; }

finish() {
  status=$?
  if [[ $keep == --keep ]]; then
    echo "Rig left running at http://127.0.0.1:$port/ with home $home. Stop it with:"
    echo "  $resources/bin/paseo daemon stop --home $home && rm -rf $home"
  else
    paseo daemon stop --home "$home" >/dev/null 2>&1 || true
    if [[ $status == 0 ]]; then rm -rf "$home"; else echo "Failed: logs and traces are in $home"; fi
  fi
  exit "$status"
}
trap finish EXIT

paseo daemon config set --home "$home" daemon.listen "127.0.0.1:$port" >/dev/null
paseo daemon config set --home "$home" features.webUi.enabled true >/dev/null
paseo daemon config set --home "$home" pluginsEnabled true >/dev/null
grep -q "127.0.0.1:$port" "$home/config.json" || { echo "The config did not land in $home"; exit 1; }

# The daemon serves the desktop app's own renderer bundle (app-dist) as its web UI.
# nohup and no job control: with --keep the daemon outlives this script and its shell.
nohup "${cli[@]}" daemon run --home "$home" >"$home/daemon.out" 2>&1 &
for _ in $(seq 60); do
  curl -sf -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 1
done
curl -sf -o /dev/null "http://127.0.0.1:$port/" || { echo "The daemon did not serve the web UI"; exit 1; }

paseo --home "$home" plugin install "$plugin" >/dev/null
for _ in $(seq 30); do
  paseo --home "$home" plugin ls | grep -q "mru-switcher  *running" && break
  sleep 1
done
paseo --home "$home" plugin ls | grep -q "mru-switcher  *running" || { echo "The plugin did not start"; exit 1; }

# Two workspaces: agents 1 to 4 in alpha, 5 to 7 in beta. The mock provider spends no tokens.
# Agent 2 takes ten seconds per reply, so the spec can catch it at work.
workspaces=()
agent=0
slow=
for fixture in alpha:4 beta:3; do
  repo="$home/repos/${fixture%:*}"
  mkdir -p "$repo"
  git -C "$repo" init -q
  git -C "$repo" -c user.name=e2e -c user.email=e2e@example.invalid -c commit.gpgsign=false \
    commit -q --allow-empty -m init
  workspace=$(paseo --home "$home" workspace create --isolation local --path "$repo" -q)
  workspaces+=("$workspace")
  for _ in $(seq "${fixture#*:}"); do
    agent=$((agent + 1))
    if [[ $agent == 2 ]]; then
      slow=$(paseo --home "$home" run --provider mock --mode load-test --model ten-second-stream \
        --workspace "$workspace" --title "Agent $agent" --no-wait -q hello)
    else
      paseo --home "$home" run --provider mock --mode load-test --model e2e-fast-stream \
        --workspace "$workspace" --title "Agent $agent" -q hello >/dev/null
    fi
  done
done
paseo --home "$home" wait "$slow" --timeout 60 >/dev/null

cd "$plugin"
[[ -d node_modules/@playwright/test ]] || npm install
MRU_BASE="http://127.0.0.1:$port" MRU_WORKSPACES="${workspaces[0]},${workspaces[1]}" \
  MRU_OUTPUT="$home/test-results" npx playwright test -c e2e/playwright.config.ts
