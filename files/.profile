
# (zsh handoff lives in .bashrc: bash login shells exec zsh when available)

# nvim/Sniprun on MacOS requires cargo deps
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
