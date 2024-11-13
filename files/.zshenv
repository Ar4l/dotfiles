# This file is read for non-interactive shells 

# source brew binaries on MacOS 
[[ -d /opt/homebrew/bin ]] && PATH=/opt/homebrew/bin/:$PATH

# source linuxbrew binaries 
[[ -d /home/linuxbrew/.linuxbrew/bin ]] && PATH=/home/linuxbrew/.linuxbrew/bin:$PATH

# nvim/Sniprun on MacOS requires cargo deps
[ -f $HOME/.cargo/env ] && . "$HOME/.cargo/env"


