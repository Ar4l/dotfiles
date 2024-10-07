
# For ssh hosts only!
# Use the locally downloaded zsh as the login shell 
# if zsh was originally not available on this server. 
# Assumes sh is the default login shell.
[ -f $HOME/bin/zsh ] && exec $HOME/bin/zsh -l

# nvim/Sniprun on MacOS requires cargo deps
[-f $HOME/.cargo/env ] && . "$HOME/.cargo/env"
