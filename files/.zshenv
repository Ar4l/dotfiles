# This file is read for non-interactive shells 

# source brew binaries on MacOS 
[[ -d /opt/homebrew/bin ]] && PATH=/opt/homebrew/bin/:$PATH

# source linuxbrew binaries
[[ -d /home/linuxbrew/.linuxbrew/bin ]] && PATH=/home/linuxbrew/.linuxbrew/bin:$PATH

# user-local binaries (claude and central install here on Linux)
[[ -d $HOME/.local/bin ]] && PATH=$HOME/.local/bin:$PATH

# nvim/Sniprun on MacOS requires cargo deps
[ -f $HOME/.cargo/env ] && . "$HOME/.cargo/env"

# Opt out of feynman's bundled PostHog telemetry (defaults on, exports to
# us.i.posthog.com). Deliberately NOT PI_OTEL_DISABLED, and not
# ~/.pi/agent/settings.json: pi-otel reads both itself, so either would also
# disable a self-hosted pi-otel elsewhere. Only feynman reads FEYNMAN_TELEMETRY.
export FEYNMAN_TELEMETRY=0


# Agent tokens, read from untracked key files. Here, not in
# .zshrc, so non-interactive shells such as the Claude Code Bash tool get it.
[ -r "$HOME/.config/linear/api_key" ] && export LINEAR_API_KEY="$(cat "$HOME/.config/linear/api_key")"
export LINEAR_TEAM_ID=EVAL
[ -r "$HOME/.config/pusk/token" ] && export PUSK_API_TOKEN="$(cat "$HOME/.config/pusk/token")"
