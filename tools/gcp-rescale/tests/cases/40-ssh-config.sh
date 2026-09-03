#!/bin/bash
# ip / ssh-config sync, and both sides of the forget_host guard
# shellcheck source=/dev/null
. "$(dirname "$0")/../lib.sh"
sandbox

# `ip` rewrites only the Host rem-dev block's HostName
with_sshcfg 'Host other' '  HostName 1.2.3.4' \
            'Host rem-dev' '  HostName 10.9.9.9' '  User aral' '  IdentityFile ~/.ssh/id' \
            'Host tail' '  HostName 5.6.7.8'
cp "$GCP_RESCALE_SSH_CONFIG" "$SB/before"
run 0 ip
has 'Host rem-dev -> 203.0.113.7'
check 'HostName rewritten' grep -q '^  HostName 203.0.113.7$' "$GCP_RESCALE_SSH_CONFIG"
sed 's/HostName 203.0.113.7/HostName 10.9.9.9/' "$GCP_RESCALE_SSH_CONFIG" >"$SB/reverted"
check 'every other line byte-identical' diff -q "$SB/reverted" "$SB/before"
nosshlog 'ssh-keygen' # guard holds: sandboxed config is not ~/.ssh/config

# no Host block: warn + suggested stanza on stderr, file untouched
with_sshcfg 'Host other' '  HostName 1.2.3.4'
cp "$GCP_RESCALE_SSH_CONFIG" "$SB/before"
run 0 ip
haserr "no 'Host rem-dev' block"
haserr 'HostName 203.0.113.7' # the suggested stanza
check 'file unchanged' diff -q "$GCP_RESCALE_SSH_CONFIG" "$SB/before"

# instance override: never writes
with_state qa-vm
run 0 ip
has 'ssh config untouched (instance override active)'
check 'file unchanged under override' diff -q "$GCP_RESCALE_SSH_CONFIG" "$SB/before"
run 0 use default

# no external IP
FAKE_VM=noip run 1 ip
haserr 'no external IP'

# --dry-run prints the plan line and does not write
with_sshcfg 'Host rem-dev' '  HostName 10.9.9.9'
cp "$GCP_RESCALE_SSH_CONFIG" "$SB/before"
run 0 ip --dry-run
has '+ update'
check 'dry-run leaves the file alone' diff -q "$GCP_RESCALE_SSH_CONFIG" "$SB/before"

# forget_host's active branch: HOME relocated INTO the sandbox so the
# config-path equality holds against a fake home — never without relocating
sandbox
export HOME="$SB/home"
mkdir -p "$HOME/.ssh"
export GCP_RESCALE_SSH_CONFIG="$HOME/.ssh/config"
printf 'Host rem-dev\n  HostName 10.9.9.9\n' >"$GCP_RESCALE_SSH_CONFIG"
run 0 ip
sshlog 'ssh-keygen -R 10.9.9.9' # the stale entry is dropped
check 'HostName rewritten in the fake home' grep -q '^  HostName 203.0.113.7$' "$GCP_RESCALE_SSH_CONFIG"
