# # [[ -r "/usr/local/etc/profile.d/bash_completion.sh" ]] && . "/usr/local/etc/profile.d/bash_completion.sh"
# [[ -f $HOME/.bashrc ]] && source $HOME/.bashrc

# nvim/Sniprun on MacOS requires cargo deps
[ -f $HOME/.cargo/env ] && . "$HOME/.cargo/env"
