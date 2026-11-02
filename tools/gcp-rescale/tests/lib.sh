# shellcheck shell=bash
# tests/lib.sh — harness for the offline suite; sourced by every case file.
# Runs under macOS /bin/bash 3.2: no mapfile, no declare -A, no ${v^^}.
#
# Lifecycle: `sandbox` once per case file (or again mid-file to discard state);
# the with_* seeders mutate the current sandbox; `run` resets only the shim
# logs and the capture file, never the sandbox.

TESTDIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLI="$TESTDIR/../bin/gcp-rescale"
FIXTURES="$TESTDIR/fixtures"
CASE_NAME=$(basename "$0" .sh)
export FIXTURES

PATH="$TESTDIR/shims:$PATH"
export PATH

if [ "$(uname)" = Darwin ] && [ "${BASH_VERSINFO[0]}" -ge 4 ]; then
  echo "warn: $CASE_NAME under bash $BASH_VERSION — the bash 3.2 coverage macOS provides" \
       "wants /bin/bash (use tests/run)" >&2
fi

PASS=0 FAIL=0 SB="" OUT="" ERR="" RC=0

_summary() {
  [ -n "$SB" ] && rm -rf "$SB"
  echo "$CASE_NAME: $PASS passed, $FAIL failed"
  [ "$FAIL" -eq 0 ] && exit 0
  exit 1
}
trap _summary EXIT

_ok() { PASS=$((PASS + 1)); }
_ko() { FAIL=$((FAIL + 1)); echo "  FAIL($CASE_NAME): $*" >&2; }

# fresh $SB with XDG dirs, ssh config, fresh SKU cache; resets shim behaviour
sandbox() {
  [ -n "$SB" ] && rm -rf "$SB"
  SB=$(mktemp -d "${TMPDIR:-/tmp}/gcp-rescale-test.XXXXXX")
  export SB
  export XDG_CONFIG_HOME="$SB/config" XDG_STATE_HOME="$SB/state" XDG_CACHE_HOME="$SB/cache"
  export GCP_RESCALE_SSH_CONFIG="$SB/ssh_config"
  export SHIM_LOG="$SB/gcloud.log" SSH_LOG="$SB/ssh.log" CAPTURE="$SB/capture.yaml"
  export FAKE_VM=cpu FAKE_REGION=ok FAKE_SSH=ok FAKE_FAIL=""
  export NO_COLOR=1
  unset GCP_RESCALE_PYTHON GCP_RESCALE_NO_PROBE
  mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME/gcp-rescale"
  cp "$FIXTURES/skus.json" "$XDG_CACHE_HOME/gcp-rescale/skus.json" # cp stamps now = fresh
  with_sshcfg 'Host rem-dev' '  HostName 203.0.113.7' '  User aral' '  Port 22'
  : >"$SHIM_LOG"; : >"$SSH_LOG"; rm -f "$CAPTURE"
  # Safety, non-negotiable: a run against an unsandboxed path rewrites the real
  # ~/.ssh/config / known_hosts / state. Verify before anything can run the CLI.
  local v val
  for v in GCP_RESCALE_SSH_CONFIG XDG_STATE_HOME XDG_CONFIG_HOME XDG_CACHE_HOME; do
    eval "val=\${$v:-}"
    case "$val" in
      "$SB"/*) ;;
      *) echo "FATAL($CASE_NAME): $v='$val' escapes the sandbox" >&2; exit 99 ;;
    esac
  done
}

with_state() { # with_state <inst> [zone [project [user]]] — seed the `use` target
  mkdir -p "$XDG_STATE_HOME/gcp-rescale"
  printf '%s %s %s %s\n' "$1" "${2:-europe-west4-a}" "${3:-jetbrains-grazie}" "${4:-aral}" \
    >"$XDG_STATE_HOME/gcp-rescale/target"
}

with_config() { # with_config <line...> — seed the config file
  mkdir -p "$XDG_CONFIG_HOME/gcp-rescale"
  printf '%s\n' "$@" >"$XDG_CONFIG_HOME/gcp-rescale/config"
}

with_sshcfg() { # with_sshcfg <line...> — seed the sandboxed ssh config
  printf '%s\n' "$@" >"$GCP_RESCALE_SSH_CONFIG"
}

with_cache() { # with_cache fresh|stale|missing — steer live_prices' find -mtime -7
  case "$1" in
    fresh)   touch "$XDG_CACHE_HOME/gcp-rescale/skus.json" ;;
    stale)   touch -t 202501010000 "$XDG_CACHE_HOME/gcp-rescale/skus.json" ;;
    missing) rm -f "$XDG_CACHE_HOME/gcp-rescale/skus.json" ;;
  esac
}

# no controlling terminal, so the consent gate is deterministic instead of
# prompting the developer's terminal (setsid(1) is absent on macOS)
notty() { python3 -c 'import os,sys; os.setsid(); os.execvp(sys.argv[1], sys.argv[1:])' "$@"; }

run() { # run <expected_rc> <cli args...>; NOTTY=1 run … detaches from the tty first
  local expected=$1 rc=0
  shift
  : >"$SHIM_LOG"; : >"$SSH_LOG"; rm -f "$CAPTURE" "$SB"/failcount.*
  if [ "${NOTTY:-0}" = 1 ]; then
    OUT=$(notty "$CLI" "$@" </dev/null 2>"$SB/stderr") || rc=$?
  else
    OUT=$("$CLI" "$@" </dev/null 2>"$SB/stderr") || rc=$?
  fi
  RC=$rc
  ERR=$(cat "$SB/stderr" 2>/dev/null)
  if [ "$RC" -eq "$expected" ]; then
    _ok
  else
    _ko "rc=$RC (want $expected): gcp-rescale $* — stderr: $(printf '%s' "$ERR" | head -2 | tr '\n' ' ')"
  fi
}

unit() { # unit <expected_rc> <expr> — sources the CLI in a subshell (the guard
  # holds because $0 is '_', not the script), then evaluates a bash expression
  local expected=$1 rc=0
  shift
  OUT=$(/bin/bash -c '. "$1"; set +eu +o pipefail; shift; eval "$*"' _ "$CLI" "$@" \
        </dev/null 2>"$SB/stderr") || rc=$?
  RC=$rc
  ERR=$(cat "$SB/stderr" 2>/dev/null)
  if [ "$RC" -eq "$expected" ]; then _ok; else _ko "unit rc=$RC (want $expected): $*"; fi
}

has()      { case "$OUT" in *"$1"*) _ok ;; *) _ko "stdout lacks '$1'" ;; esac; }
lacks()    { case "$OUT" in *"$1"*) _ko "stdout has '$1'" ;; *) _ok ;; esac; }
haserr()   { case "$ERR" in *"$1"*) _ok ;; *) _ko "stderr lacks '$1' — got: $(printf '%s' "$ERR" | head -2 | tr '\n' ' ')" ;; esac; }
lackserr() { case "$ERR" in *"$1"*) _ko "stderr has '$1'" ;; *) _ok ;; esac; }

outmatch() { # outmatch <ERE> — some line of stdout matches
  if printf '%s\n' "$OUT" | grep -qE -- "$1"; then _ok; else _ko "stdout !~ /$1/"; fi
}

logged()    { if grep -qF -- "$1" "$SHIM_LOG" 2>/dev/null; then _ok; else _ko "gcloud log lacks '$1'"; fi; }
notlogged() { if grep -qF -- "$1" "$SHIM_LOG" 2>/dev/null; then _ko "gcloud log has '$1'"; else _ok; fi; }
sshlog()    { if grep -qF -- "$1" "$SSH_LOG" 2>/dev/null; then _ok; else _ko "ssh log lacks '$1'"; fi; }
nosshlog()  { if grep -qF -- "$1" "$SSH_LOG" 2>/dev/null; then _ko "ssh log has '$1'"; else _ok; fi; }

logged_n() { # logged_n <n> <substring> — exactly n matching gcloud calls
  local n
  n=$(grep -cF -- "$2" "$SHIM_LOG" 2>/dev/null) || n=0
  if [ "$n" -eq "$1" ]; then _ok; else _ko "'$2' logged $n times (want $1)"; fi
}

before() { # before <a> <b> — a's first gcloud log line precedes b's
  local a b
  a=$(grep -nF -- "$1" "$SHIM_LOG" 2>/dev/null | head -1 | cut -d: -f1)
  b=$(grep -nF -- "$2" "$SHIM_LOG" 2>/dev/null | head -1 | cut -d: -f1)
  if [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; then
    _ok
  else
    _ko "'$1' (line ${a:-none}) not before '$2' (line ${b:-none})"
  fi
}

yaml()    { if [ -f "$CAPTURE" ] && grep -qE -- "$1" "$CAPTURE"; then _ok; else _ko "capture lacks /$1/"; fi; }
yamlnot() { if [ -f "$CAPTURE" ] && grep -qE -- "$1" "$CAPTURE"; then _ko "capture has /$1/"; else _ok; fi; }
nocapture() { if [ -e "$CAPTURE" ]; then _ko "capture written: $(head -1 "$CAPTURE")"; else _ok; fi; }

check() { # check <desc> <command...> — generic escape hatch
  local d=$1
  shift
  if "$@" >/dev/null 2>&1; then _ok; else _ko "$d"; fi
}
