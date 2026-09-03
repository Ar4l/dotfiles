#!/bin/bash
# read-only commands: status, gpu list, storage list, cache freshness
# shellcheck source=/dev/null
. "$(dirname "$0")/../lib.sh"
sandbox

# ---- status
FAKE_VM=l4 run 0 status
has 'machine type:  g2-standard-8'
has 'preset: l4'
has 'in sync' # sandbox ssh config HostName matches the fake VM's IP
FAKE_VM=l4-spot run 0 status
has 'l4 (spot)'
FAKE_VM=scratch run 0 status # one VM covers all three disk roles
has 'boot 50GB'
has 'data 10GB (qa-data)'
has 'local-ssd 375GB (ephemeral)'
with_sshcfg 'Host rem-dev' '  HostName 10.9.9.9'
run 0 status
has 'out of sync'

# ---- gpu list
sandbox
run 0 gpu list
outmatch '^cpu +e2-standard-8'
outmatch '^l4 +g2-standard-8'
outmatch '^a100 +a2-highgpu-1g'
outmatch '^a100-80 +a2-ultragpu-1g'
outmatch '^h200 +a3-ultragpu-8g'
has 'blocked (no quota + needs gVNIC'
has 'up to x8' # L4 headroom 30 with FAKE_REGION=ok
outmatch '^cpu .*- +-$' # cpu row: SPOT/HR and QUOTA are both '-'
FAKE_REGION=noquota run 0 gpu list
has 'NO QUOTA'
FAKE_REGION=tight run 0 gpu list # limit 4, usage 4: headroom 0 is the only input reaching needs+
has 'needs +1'
run 0 gpu list europe-west1
has 'price scouting only'

# ---- cache freshness
run 0 gpu list
notlogged 'auth print-access-token' # fresh cache: catalog never contacted
with_cache stale
run 0 gpu list
logged 'auth print-access-token'
haserr 'live prices unavailable' # the token fetch fails under the shims
with_cache fresh
run 0 gpu list --refresh
logged 'auth print-access-token' # REFRESH=1 short-circuits the find -mtime test
haserr 'live prices unavailable'
with_cache missing
run 0 gpu list
haserr 'live prices unavailable'
has '0.90' # hardcoded l4 fallback price

# ---- storage list
sandbox
run 0 storage list
has '1.10' # data: 10G x 0.11 $/GiB/mo
has '5.50' # boot: 50G x 0.11
has '/mnt/data' # MOUNT resolved via the ssh probe
has '37%'
FAKE_VM=regional run 0 storage list
has '(regional)'
has '2.20' # 10G x 0.11 x 2: regional disks bill at exactly 2x
FAKE_VM=scratch run 0 storage list
has 'ephemeral'
GCP_RESCALE_NO_PROBE=1 run 0 storage list
lacks '/mnt/data'
check 'no ssh probe under GCP_RESCALE_NO_PROBE' test ! -s "$SSH_LOG"
FAKE_SSH=unreachable run 0 storage list # unreachable VM: MOUNT stays '-' without failing
lacks '/mnt/data'
FAKE_REGION=bogus run 1 storage list europe-nope
