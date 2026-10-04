#!/bin/bash
# gpu scale: refusals, the atomic shape patch (Bug 1), sequencing, rollback,
# the driver install (Bug 2), post_start
# shellcheck source=/dev/null
. "$(dirname "$0")/../lib.sh"
sandbox
with_state qa-vm # --yes is only honored for instance overrides

# ---- pre-mutation refusals
run 1 gpu scale
haserr 'usage: gcp-rescale gpu scale'
run 1 gpu scale warp9
haserr "unknown preset 'warp9'"
run 1 gpu scale h200
haserr 'gVNIC'
run 1 gpu scale h100 # one representative of the shared h100|b200|gb200|gb300 arm
haserr 'not available in'
run 1 gpu scale cpu --spot
haserr '--spot only makes sense'
FAKE_VM=l4 run 0 gpu scale l4 --yes
has 'nothing to do'
notlogged 'update-from-file'
notlogged 'instances stop'
FAKE_VM=l4-spot run 0 gpu scale l4 --yes # same type, different provisioning: proceeds
logged 'update-from-file'
FAKE_VM=scratch run 1 gpu scale l4 --yes
haserr 'local SSD(s) attached'
FAKE_VM=stopping run 1 gpu scale l4 --yes
haserr 'wait for it to settle'
FAKE_FAIL='machine-types describe' run 1 gpu scale l4 --yes
haserr 'not offered in'
FAKE_REGION=tight run 1 gpu scale l4x2 --yes
haserr 'insufficient NVIDIA_L4_GPUS'
FAKE_REGION=noquota run 1 gpu scale l4 --spot --yes
haserr 'PREEMPTIBLE_NVIDIA_L4_GPUS'

# ---- Bug 1 regression: one atomic update-from-file, asserted on the patched YAML
run 0 gpu scale l4x2 --yes # FAKE_VM=cpu: e2-standard-8 -> g2-standard-24
yaml 'machineType: .*/machineTypes/g2-standard-24'
yamlnot 'guestAccelerators:'
yamlnot 'interface:'
yaml '^  onHostMaintenance: TERMINATE'
yaml '^  provisioningModel: STANDARD'
yaml '^  preemptible: false'
yaml '^name:' # guards the (?ms)-ate-the-file regression
check 'capture is a whole export (>=20 lines)' test "$(wc -l <"$CAPTURE")" -ge 20
logged_n 1 'update-from-file'
notlogged 'set-machine-type'
notlogged 'set-scheduling'
notlogged 'disks resize' # boot is already 50GB
has 'done: qa-vm = l4x2'
has 'GPU 0: NVIDIA L4' # nvidia-smi -L output surfaces

# the GCP_RESCALE_PYTHON seam: a logging interpreter shim is honored
cat >"$SB/pyshim" <<'PYSHIM'
#!/bin/bash
echo "pyshim $*" >>"$SHIM_LOG"
exec python3 "$@"
PYSHIM
chmod +x "$SB/pyshim"
GCP_RESCALE_PYTHON="$SB/pyshim" run 0 gpu scale l4x2 --yes
logged 'pyshim'
check 'patch invoked with the file + three shape args' \
  grep -qE 'pyshim - .*/instance\.yaml g2-standard-24 STANDARD TERMINATE' "$SHIM_LOG"
yaml 'machineType: .*/machineTypes/g2-standard-24' # and the patch still lands

run 0 gpu scale l4x2 --spot --yes
yaml '^  provisioningModel: SPOT'
yaml '^  preemptible: true'
yaml '^  instanceTerminationAction: STOP'
yaml '^  automaticRestart: false'
FAKE_VM=l4 run 0 gpu scale cpu --yes
yaml 'machineType: .*/machineTypes/e2-standard-8'
yaml '^  onHostMaintenance: MIGRATE'

# ---- sequencing and side steps
FAKE_VM=cpu-small run 0 gpu scale l4 --yes # 10GB boot + GPU target: one-time boot grow
has 'grow boot disk 10->50GB (one-time)'
logged 'disks resize qa-vm --size=50GB'
before 'disks resize' 'update-from-file'
run 0 gpu scale l4x2 --yes
before 'instances stop' 'update-from-file'
before 'update-from-file' 'instances start'
FAKE_SSH=no-tmux run 0 gpu scale l4x2 --yes
has 'nothing to save'
FAKE_SSH=tmux-no-resurrect run 0 gpu scale l4x2 --yes
haserr 'tmux-resurrect is not installed'
FAKE_SSH=save-fails run 1 gpu scale l4x2 --yes
haserr 'tmux-resurrect save FAILED'
notlogged 'instances stop' # aborts with the VM still running

# ---- rollback
FAKE_FAIL='update-from-file:1' run 1 gpu scale l4x2 --yes
haserr 'resize failed — rolling back to e2-standard-8'
yaml 'machineType: .*/machineTypes/e2-standard-8' # the second capture restores the original
logged 'instances start' # rolled back and restarted
FAKE_VM=terminated FAKE_FAIL='update-from-file:1' run 1 gpu scale l4x2 --yes
has 'VM left stopped'
notlogged 'instances start'
FAKE_FAIL='update-from-file' run 1 gpu scale l4x2 --yes # both patches fail
haserr 'rollback failed too'
haserr 'set-machine-type' # the manual recovery commands
haserr 'instances start'
FAKE_FAIL='instances start' run 1 gpu scale l4x2 --yes # rollback labelled "start"
haserr 'start failed — rolling back'
haserr 'rollback start failed'
FAKE_FAIL='instances export' run 1 gpu scale l4x2 --yes
nocapture # the earlier of the two apply_shape bail-outs
FAKE_VM=cpu-small FAKE_FAIL='disks resize' run 1 gpu scale l4 --yes
haserr 'boot disk resize failed — rolling back'
before 'disks resize' 'update-from-file' # no shape change before the failed grow

# ---- Bug 2 regression: driver keyed off the loaded module, not ubuntu-drivers
FAKE_SSH=nvidia-missing run 0 gpu scale l4 --yes
sshlog '/proc/driver/nvidia/version'
# shellcheck disable=SC2016 # literal on purpose: $v expands remotely, keyed off the loaded module
sshlog 'nvidia-utils-$v-server'
FAKE_SSH=ok run 0 gpu scale l4 --yes
nosshlog 'apt-get' # driver already present: no install

# ---- driver failure modes, one per branch
FAKE_SSH=driver-install-fails run 0 gpu scale l4 --yes
has 'driver installed but not loaded — rebooting once'
logged 'instances reset'
FAKE_SSH=nvidia-mismatch run 0 gpu scale l4 --yes
has 'module/library mismatch'
logged 'instances reset'
FAKE_FAIL='instances reset' FAKE_SSH=nvidia-mismatch run 0 gpu scale l4 --yes
haserr 'GPU driver install failed' # the Step 2 fix: a failed reboot is not success
haserr 're-run: gcp-rescale gpu scale' # recovery advice routes back through the fixed path
lackserr 'ubuntu-drivers install --gpgpu' # never advise the command that caused Bug 2

# ---- post_start, inventory, dry-run
FAKE_SSH=panes run 0 gpu scale l4x2 --yes
has 'Will resume:  main:0.0 claude'
has 'Will resume:  main:0.1 vim'
has 'Will NOT restart automatically:  main:1.0 python'
lacks 'main:1.1 zsh' # idle shells are skipped
FAKE_SSH=tmux-kick-fails run 0 gpu scale l4x2 --yes
haserr 'could not kick tmux restore'
run 0 gpu scale l4x2 --dry-run
has '(dry-run: consent skipped'
has 're-run: gcp-rescale gpu scale' # the dry-run driver step carries the fixed advice too
lacks 'ubuntu-drivers install --gpgpu'
has '+ gcloud compute instances stop'
has '+ gcloud compute instances update-from-file'
has '+ gcloud compute instances start'
notlogged 'instances stop'
notlogged 'instances start'
notlogged 'update-from-file'
nocapture

# ---- poll_ip / wait_for_ssh caller branches (post_start's handling, not the loops)
unit 0 'poll_ip() { return 1; }; DRY_RUN=0; VM_IP=""; post_start 0 x'
haserr 'no external IP appeared within 60s'
unit 0 'poll_ip() { echo 198.51.100.99; }; wait_for_ssh() { return 1; }; DRY_RUN=0; VM_IP=""; post_start 0 x'
haserr "sshd didn't answer within 180s"
