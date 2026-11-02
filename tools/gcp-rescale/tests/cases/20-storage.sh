#!/bin/bash
# storage scale: size parsing, disk selection, online/offline grow, consent
# shellcheck source=/dev/null
. "$(dirname "$0")/../lib.sh"
sandbox
with_state qa-vm # --yes is only honored for instance overrides

# ---- size parsing, asserted on the captured --size argv
run 0 storage scale 512 --yes
logged 'disks resize qa-data --size=512GB'
run 0 storage scale 512G --yes
logged '--size=512GB'
run 0 storage scale 1T --yes
logged '--size=1024GB'
run 0 storage scale 512gb --yes
logged '--size=512GB'
run 1 storage scale abc --yes
haserr 'cannot parse size'
run 1 storage scale --yes
haserr 'usage: gcp-rescale storage scale'

# ---- disk selection
FAKE_VM=boot-only run 0 storage scale 512 --yes # no data disk: falls back to boot
logged 'disks resize qa-vm'
FAKE_VM=two-data run 1 storage scale 512 --yes
haserr 'multiple data disks'
run 1 storage scale 512 --disk nope --yes
haserr "no disk 'nope'"
FAKE_VM=scratch run 1 storage scale 512 --disk local-ssd-0 --yes
haserr 'local SSD'
FAKE_VM=regional run 1 storage scale 512 --yes
haserr 'regional disk'

# ---- grow semantics (qa-data is 10GB)
run 0 storage scale 10 --yes
has 'nothing to do'
notlogged 'disks resize'
run 1 storage scale 5 --yes
haserr 'can only grow'
run 0 storage scale 20 --yes
has 'Online resize'
sshlog growpart
sshlog resize2fs
sshlog xfs_growfs # the grow script ships both fs handlers; the branch runs in-guest
has 'filesystem grown'
FAKE_SSH=grow-fails run 0 storage scale 20 --yes
haserr 'in-guest grow failed'
FAKE_VM=terminated run 0 storage scale 20 --yes
has 'grow the filesystem after the next start'
check 'no ssh to a stopped VM' test ! -s "$SSH_LOG"
FAKE_VM=terminated run 0 storage scale 60 --disk qa-vm --yes
has 'self-grows on next start'
FAKE_FAIL='disks resize' run 1 storage scale 20 --yes
nosshlog growpart # gcloud failure must abort before the in-guest grow

# ---- dry-run
run 0 storage scale 20 --dry-run
has '+ gcloud compute disks resize'
notlogged 'disks resize'

# ---- consent, all three with no controlling terminal
NOTTY=1 run 1 storage scale 20
haserr 'interactive consent is required'
notlogged 'disks resize'
NOTTY=1 run 0 storage scale 20 --yes # --yes on an override proceeds
logged 'disks resize'
sandbox # back to the default target: --yes must NOT be honored
NOTTY=1 run 1 storage scale 20 --yes
haserr 'interactive consent is required'
notlogged 'disks resize'
