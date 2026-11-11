#!/bin/bash
# Add a swapfile on a Linux box that ships without swap (GCP images do).
# Without swap the kernel cannot page out idle agent and container memory:
# under pressure it evicts file cache instead and the box thrashes for
# minutes before the OOM killer fires.
# Safe to rerun. Invoked via `make swap`, not by `make all`: it needs sudo.
#
# SWAP_FILE and SWAP_SIZE override the defaults. The file lives on /home
# because the boot disk is too small to hold it.

set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
  echo 'macOS manages its own swap; nothing to do'
  exit 0
fi

file=${SWAP_FILE:-/home/swapfile}
size=${SWAP_SIZE:-8G}

if swapon --show=NAME --noheadings | grep -qx "$file"; then
  echo "swap already active on $file"
else
  if [ ! -f "$file" ]; then
    # fallocate, not dd: instant on ext4, and swapon accepts the result there
    sudo fallocate -l "$size" "$file"
    sudo chmod 600 "$file"
    sudo mkswap "$file"
  fi
  sudo swapon "$file"
fi

# Survive reboots. nofail: /home is a secondary disk that may be absent.
grep -qE "^$file[[:space:]]" /etc/fstab ||
  echo "$file none swap sw,nofail 0 0" | sudo tee -a /etc/fstab > /dev/null

swapon --show
