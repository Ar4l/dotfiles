# Alias definitions.
# See /usr/share/doc/bash-doc/examples in the bash-doc package.
if [ -f ~/.aliases ]; then
    . ~/.aliases
fi

#  settings 
HISTCONTROL=ignoreboth # no duplicates or lines starting with space in history
HISTSIZE=10000
HISTFILESIZE=2000

shopt -s histappend   # append to history file, don't overwrite it.
shopt -s checkwinsize # [default] check window size after each command
shopt -s autocd       # .. for cd ..
shopt -s cdspell      # check minor file spell errors
shopt -s dirspell     # check minor dir spell errors
shopt -s direxpand


# export neovim as EDITOR when available, fall back to vim
if [[ -x "$(command -v nvim)" ]]; then
  export EDITOR=nvim
else
  export EDITOR=vim
fi

# use vi mode keys 
# e.g. 
# EMACS   VIM
# Ctrl+A	0	    Move cursor to beginning of line.
# Ctrl+E	$	    Move cursor to end of line.
# Alt+B	  b	    Move cursor back one word.
# Alt+F	  w	    Move cursor right one word.
# Ctrl+B	h	    Move cursor back one character.
# Ctrl+F	l	    Move cursor right one character.
# Ctrl+P	k	    Move up in Bash command history.
# Ctrl+R	j	    Move down in Bash command history.
set -o vi 

export PAGER=less
export MANPAGER=$PAGER
# export LC_ALL=en_GB.UTF-8 # causes warnings on every server I connect to as they don't have the GB language pack
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_DATA_BIN="$HOME/.local/bin"

export RIPGREP_CONFIG_PATH="$HOME/.rgrc"

# # path: add personal binaries to path
paths=("$HOME/dotfiles/bin")
# paths+=("$HOME/.cargo/bin")

# for p in "${paths[@]}"; do
#   [[ -d "$p" ]] && PATH+=":$p"
# done

# ## prepend to path
# PATH="/usr/local/opt/coreutils/libexec/gnubin:$PATH"


# if [[ "$TERM" =~ 'dumb' ]]; then
#     source "$HOME/.bashrc.dumb"
# else

source "$HOME/.bashrc.dumb"
source "$HOME/.bashrc.xterm"

. "$HOME/.cargo/env"
