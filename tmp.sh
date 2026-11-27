#!/bin/bash
# Put /tmp on disk on a Linux box that ships it in RAM (Ubuntu 26.04 does:
# a tmpfs sized at half the memory). Scratch files then cost disk, not
# memory, and survive a reboot; systemd's own cleaner still deletes what
# nobody touched for 10 days (/usr/lib/tmpfiles.d/tmp.conf).
# Safe to rerun. Invoked via `make tmp`, not by `make all`: it needs sudo.
# Takes effect at the next boot: the live /tmp holds running programs'
# files and sockets, so it is not swapped under them.
#
# TMP_DIR overrides the folder. It lives on /home because the boot disk is
# too small to hold it.

set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
  echo 'macOS keeps /tmp on disk already; nothing to do'
  exit 0
fi

dir=${TMP_DIR:-/home/tmp}

# 1777: everyone may write, only the owner may delete (the sticky bit)
sudo install -d -m 1777 -o root -g root "$dir"

# An fstab line for /tmp outranks systemd's stock tmp.mount, so nothing is
# masked. No nofail, as for /nix: a boot without this disk has to stop
# rather than fill the boot disk through a bare /tmp.
if grep -qE "^[^#[:space:]]+[[:space:]]+/tmp[[:space:]]" /etc/fstab; then
  echo '/etc/fstab already has a line for /tmp:'
else
  echo "$dir /tmp none bind,nosuid,nodev 0 0" | sudo tee -a /etc/fstab > /dev/null
  echo 'added to /etc/fstab:'
fi
grep -E "^[^#[:space:]]+[[:space:]]+/tmp[[:space:]]" /etc/fstab

sudo findmnt --verify --tab-file /etc/fstab > /dev/null 2>&1 ||
  { echo '/etc/fstab does not verify; fix it before rebooting' >&2; exit 1; }

if [ "$(findmnt -no SOURCE /tmp)" = tmpfs ]; then
  echo '/tmp is still in RAM; reboot to switch'
else
  findmnt -o TARGET,SOURCE,OPTIONS /tmp
fi
