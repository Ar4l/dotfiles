#!/usr/bin/env bash

# LOCAL ADDITION (not part of upstream tmux-resurrect).
# "claude continue strategy"
#
# Restores a Claude Code pane by resuming the most recent chat for the pane's
# working directory (claude --continue). The original launch flags are otherwise
# dropped (e.g. --resume <path> would conflict with --continue), but
# --dangerously-skip-permissions is preserved when the pane was launched with it.
#
# Wired up via:
#   set -g @resurrect-processes 'ssh "~claude"'
#   set -g @resurrect-strategy-claude 'continue'

ORIGINAL_COMMAND="$1"
# DIRECTORY="$2"  # unused; resurrect restores the cwd before running this

main() {
	local restore="claude --continue"
	case "$ORIGINAL_COMMAND" in
		*--dangerously-skip-permissions*)
			restore="$restore --dangerously-skip-permissions"
			;;
	esac
	echo "$restore"
}
main
