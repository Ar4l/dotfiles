#!/bin/bash
# dispatch: flags, usage, the `use` target state machine, config overrides
# shellcheck source=/dev/null
. "$(dirname "$0")/../lib.sh"
sandbox

run 0 --help
has 'usage: gcp-rescale'

run 0 --version
outmatch '^gcp-rescale [0-9]+\.[0-9]+\.[0-9]+$'

run 1
has 'usage: gcp-rescale'

run 1 frobnicate
has 'usage: gcp-rescale'

run 1 --frobnicate
haserr 'unknown flag'

run 1 status --disk
haserr '--disk needs a value'

run 1 gpu
has 'usage: gcp-rescale'

run 1 storage
has 'usage: gcp-rescale'

# no state file: no target banner, `use` shows the default
run 0 status
lackserr '[target:'
run 0 use
has 'target: aral-rem-dev'
lacks 'reset with'

# `use qa-vm` fills the three defaults and banners every other command
run 0 use qa-vm
has 'target: qa-vm (europe-west4-a, jetbrains-grazie, ssh as aral)'
check 'defaults persisted' grep -q '^qa-vm europe-west4-a jetbrains-grazie aral$' "$XDG_STATE_HOME/gcp-rescale/target"
run 0 status
haserr '[target: qa-vm (europe-west4-a, jetbrains-grazie)]'
run 0 use
has 'reset with: gcp-rescale use default'

# all four fields persist; `use default` and `use <default-name>` both reset
run 0 use qa-vm z1 p1 u1
check 'all four persisted' grep -q '^qa-vm z1 p1 u1$' "$XDG_STATE_HOME/gcp-rescale/target"
run 0 use default
has 'target reset: aral-rem-dev'
check 'state file removed' test ! -f "$XDG_STATE_HOME/gcp-rescale/target"
run 0 use qa-vm
run 0 use aral-rem-dev
check 'use <default-name> removes the state file' test ! -f "$XDG_STATE_HOME/gcp-rescale/target"

# a config file overriding DEFAULT_INSTANCE takes effect
with_config 'DEFAULT_INSTANCE="team-vm"' 'DEF_USER="teammate"'
run 0 use
has 'target: team-vm'
has 'ssh as teammate'
