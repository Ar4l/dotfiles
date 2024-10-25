#!/bin/bash
# Install all dependencies

# SUMMARY 
#
# 1. Install Kitty terminal emulator, it has decent graphics support.
#    I need its kittens, regardless of client/host.
#
# 2.2   Install programs for the terminal, using brew
#       By keeping my configuration to a minimum, I do not worry about duplicates.
#       This avoids the pain of outdated software I'm not allowed to update.
#
# 2.1   If brew is not available, install the bare minimum from source.
#       i.e. bash, tmux, git, stow
#
# 2.3   Potential commands to set up those programs (e.g. vim's plugins)
#
# 3. If not on a server: install applications (casks) for the OS 


# 1. Install Kitty 

[ ! -e "/Applications/kitty.app" ]  &&    # MacOS
[ ! -e "$HOME/.local/kitty.app" ]   &&    # Linux
echo 'installing kitty'             &&
curl -L https://sw.kovidgoyal.net/kitty/installer.sh | sh /dev/stdin 


# 2. Install programs 

basics=(        # BASICS
  tmux          # shell server to persist sessions
  coreutils     # basic text utilities 'expected to exist on every OS' https://www.gnu.org/software/coreutils/
  git           # cmon who is running machines w/o git 
  bash          # you'd be surprised who hasn't updated their bash since 1990

                # DOTFILES
  stow          # stashes my dotfiles
  make          # provides shorter commands for stashing
)

programs=(
                # SHELL TOOLING
  starship      # extensive cross-shell prompt https://starship.rs/
  walk          # file browser
  tree          # basic file tree 
  btop          # monitor procs 

                # PACKAGE MANAGERS
  # conda       # TODO: may be worth adding seeing I saw some outrageous 2003 version
  pixi          # conda 2024 version
  uv            # pip 2024 version

                # EDITORS
  vim           # the only editor you need
  neovim        # a second editor if you must

                # ZSH 
  zsh           # better bash
  pure          # minimal zsh prompt https://github.com/sindresorhus/pure
  zsh-syntax-highlighting 
  zsh-autosuggestions 
  zsh-history-substring-search 

                # MISC
  pandoc        # document converter
  git-lfs       # large file storage with git 
  # fd          # friendly find
  # fzf         # fuzzy find 
  # glow        # CLI markdown renderer https://github.com/charmbracelet/glow
  # tldr        # shorter manpages
)

casks=(
  rectangle     # window management TODO: add keybindings
)

## Onto the installation 
os_independent_homebrew_install() {

  echo "Installing Homebrew..."

  # Check if it's macOS or Linux, and install Homebrew accordingly
  case $OSTYPE in

    "linux-gnu"*)

      echo 'installing homebrew for linux'
      NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"  &&

      # Add to path in shells
      # Starting conditional checks if the file actually exists,
      # necessary when working within docker containers with brew, on a server
      # which does not have brew
      echo '[ -e /home/linuxbrew/.linuxbrew/bin/brew ] && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
      echo '[ -e /home/linuxbrew/.linuxbrew/bin/brew ] && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.zshrc
      eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)" 
    ;;

    "darwin"*) 
      printf 'You need to install homebrew on macos manually! run:\n\n'
      echo 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
      exit 

      # (echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> ~/.bashrc &&
      # (echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> ~/.zshrc  &&
      # eval "$(/opt/homebrew/bin/brew shellenv)"
    ;;
    *)
      echo 'OS NOT SUPPORTED'
    ;;
  esac
}


# Try to install brew if it does not exist
if ! command -v brew &> /dev/null ; then
  os_independent_homebrew_install
fi


# 2.1 If brew does not exist, install basic packages from source
if ! command -v brew &> /dev/null; then  
  echo "installing basic: ${basics[*]}"

  # TODO: installation from source
  echo 'not yet implemented: installing from source :)'
  exit 
fi 

# 2.2 Otherwise, brew exists so install all programs
programs=("${basics[@]}" "${programs[@]}")
echo "installing all: ${programs[*]}"
brew install ${programs[*]} > /dev/null

echo 'run the following in case brew is not yet available in this shell'
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"'

# 2.3 Also set up said programs 

# no longer necessary, this happens on vim startup 
# vim +'PlugInstall --sync' +qall


# 3. And, if we're on mac, install the casks
if [[ "$OSTYPE" == "darwin"* ]]; then
  brew install ${casks[*]}
fi

