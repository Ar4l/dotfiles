#!/usr/bin/env bash
# End-to-end check of the Vim keys: the released app bundle in headless Chromium against a
# throwaway daemon with mock agents in two workspaces. The live daemon and ~/.paseo are never touched.
#
#   e2e/run.sh          run the spec, then stop the daemon and delete its home
#   e2e/run.sh --keep   leave the daemon running afterwards, to open the rig in a browser
set -euo pipefail

keep=${1:-}
plugin=$(cd "$(dirname "$0")/.." && pwd)
resources=${PASEO_RESOURCES:-/Applications/Paseo.app/Contents/Resources}
home=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/paseo-vim-e2e.XXXXXX")" && pwd -P)
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')

# Development mode shows the mock provider, which spends no tokens. PASEO_AGENT_* are dropped
# so the CLI does not act as the agent that started this script.
cli=(env -u PASEO_AGENT_ID -u PASEO_AGENT_CWD -u PASEO_WORKSPACE_ID PASEO_HOME="$home" PASEO_NODE_ENV=development)
if [[ -d $resources ]]; then
  # Paseo.app: its launcher (bin/paseo) pins production mode, so start the same entrypoint.
  cli+=(ELECTRON_RUN_AS_NODE=1 PASEO_CLI="$resources/bin/paseo"
    "$resources/../Frameworks/Paseo Helper.app/Contents/MacOS/Paseo Helper" --disable-warning=DEP0040
    "$resources/app.asar.unpacked/dist/daemon/node-entrypoint-runner.js" node-script
    "$resources/app.asar/node_modules/@getpaseo/cli/dist/index.js")
  stop="$resources/bin/paseo"
else
  # Linux: the nix build's `paseo`, which serves the same web UI.
  cli+=(paseo)
  stop=paseo
fi
paseo() { "${cli[@]}" "$@"; }

finish() {
  status=$?
  if [[ $keep == --keep ]]; then
    echo "Rig left running at http://127.0.0.1:$port/ with home $home. Stop it with:"
    echo "  $stop daemon stop --home $home"
    echo "VIM_BASE=http://127.0.0.1:$port VIM_WORKSPACE=${workspace:-} VIM_OUTPUT=$home/test-results"
  else
    paseo daemon stop --home "$home" >/dev/null 2>&1 || true
    if [[ $status != 0 ]]; then
      echo "Failed: logs and traces are in $home"
    elif [[ $home == */paseo-vim-e2e.* ]]; then
      rm -rf -- "$home"
    fi
  fi
  exit "$status"
}
trap finish EXIT

paseo daemon config set --home "$home" daemon.listen "127.0.0.1:$port" >/dev/null
paseo daemon config set --home "$home" features.webUi.enabled true >/dev/null
paseo daemon config set --home "$home" pluginsEnabled true >/dev/null
grep -q "127.0.0.1:$port" "$home/config.json" || { echo "The config did not land in $home"; exit 1; }

# nohup and no job control: with --keep the daemon outlives this script and its shell.
nohup "${cli[@]}" daemon run --home "$home" >"$home/daemon.out" 2>&1 &
for _ in $(seq 60); do
  curl -sf -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 1
done
curl -sf -o /dev/null "http://127.0.0.1:$port/" || { echo "The daemon did not serve the web UI"; exit 1; }

paseo --home "$home" plugin install "$plugin" >/dev/null
for _ in $(seq 30); do
  paseo --home "$home" plugin ls | grep -q "vim-keys  *running" && break
  sleep 1
done
paseo --home "$home" plugin ls | grep -q "vim-keys  *running" || { echo "The plugin did not start"; exit 1; }

# A workspace with three agents. "Slow" takes ten seconds per reply, so the spec can
# interrupt it; "Quick" answers at once.
repo="$home/repos/alpha"
mkdir -p "$repo"
git -C "$repo" init -q
git -C "$repo" -c user.name=e2e -c user.email=e2e@example.invalid -c commit.gpgsign=false \
  commit -q --allow-empty -m init
workspace=$(paseo --home "$home" workspace create --isolation local --path "$repo" -q)
paseo --home "$home" run --provider mock --mode load-test --model e2e-fast-stream \
  --workspace "$workspace" --title Quick -q hello >/dev/null
paseo --home "$home" run --provider mock --mode load-test --model ten-second-stream \
  --workspace "$workspace" --title Slow -q hello >/dev/null
# "Pages" has five turns of thirty messages, and its Nth prompt ends in the Nth of these
# words. The app loads the last turns only, so a search for "aardvark" has to fetch more.
pages=$(paseo --home "$home" run --provider mock --mode load-test --model e2e-fast-stream \
  --workspace "$workspace" --title Pages -q "emit 30 assistant messages before synthetic user message aardvark")
for word in badger cougar dingo egret; do
  paseo --home "$home" send "$pages" "emit 30 assistant messages before synthetic user message $word" >/dev/null
done

# A second workspace, for the keys that move between workspaces.
other="$home/repos/beta"
mkdir -p "$other"
git -C "$other" init -q
git -C "$other" -c user.name=e2e -c user.email=e2e@example.invalid -c commit.gpgsign=false \
  commit -q --allow-empty -m init
beta=$(paseo --home "$home" workspace create --isolation local --path "$other" -q)
paseo --home "$home" run --provider mock --mode load-test --model e2e-fast-stream \
  --workspace "$beta" --title Other -q hello >/dev/null

cd "$plugin"
[[ -d node_modules/@playwright/test ]] || npm install
VIM_BASE="http://127.0.0.1:$port" VIM_WORKSPACE="$workspace" VIM_OUTPUT="$home/test-results" \
  npx playwright test -c e2e/playwright.config.ts
