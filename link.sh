#!/bin/bash
# Symlink files/ into $HOME via stow.
# Used by `make stow`/`make restow` and by install.sh.
set -e
dotfiles_dir="$(cd "$(dirname "$0")" && pwd)"

# Plain restow first: succeeds on already-stowed machines without touching git
if stow -v --dir="$dotfiles_dir/files" --target="$HOME" -R . 2> /dev/null; then
  exit 0
fi

# Conflicts: a fresh machine ships real rc files (~/.bashrc, ~/.profile on
# Ubuntu; plus the ~/.zshrc install.sh's homebrew step may have created).
# Adopt the machine's files into the repo, then restore the repo's committed
# versions — the machine's originals are intentionally discarded.
# Refuse if files/ has uncommitted changes, as git restore would wipe them.
if [ -n "$(git -C "$dotfiles_dir" status --porcelain -- files)" ]; then
  echo 'stow found conflicts, but files/ has uncommitted changes;' >&2
  echo 'commit or stash them first, then rerun' >&2
  exit 1
fi
stow -v --dir="$dotfiles_dir/files" --target="$HOME" --adopt -R .
git -C "$dotfiles_dir" restore files
