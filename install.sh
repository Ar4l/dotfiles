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
                # (tmux-resurrect + tmux-continuum are vendored under
                #  files/.tmux/plugins and stowed; no TPM needed)
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
  bat           # better cat
  dust          # better du
  gitui         # git TUI
  gh            # github CLI
  mosh          # ssh that survives roaming and sleep
  nmap          # network scanner

                # PACKAGE MANAGERS
  # conda       # TODO: may be worth adding seeing I saw some outrageous 2003 version
  pixi          # conda 2024 version
  uv            # pip 2024 version
  pipx          # installs python CLIs in isolated envs
  poetry        # python project manager

                # KUBERNETES
  helm          # k8s package manager
  kubectx       # switch k8s contexts and namespaces
  k9s           # k8s TUI

                # AI
  llama.cpp     # run LLMs locally
  ollama        # local LLM server
  opencode      # AI coding agent
  crush         # AI coding agent

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
  ripgrep       # better grep (reads defaults from ~/.rgrc)
  fd            # friendly find; .bashrc.xterm wires it into fzf
  fzf           # fuzzy find
  # glow        # CLI markdown renderer https://github.com/charmbracelet/glow
  # tldr        # shorter manpages

  zoxide        # better cd (requires fzf) https://github.com/ajeetdsouza/zoxide
  eza           # better ls
  ffmpeg        # audio/video converter
  yt-dlp        # video downloader
)

# Applications to install on a fresh Mac
casks=(
  karabiner-elements      # key remapping, for those dutch keyboards
  mactex                  # LaTeX compiler
  chai                    # keeps the mac awake
  claude-code             # AI coding agent
  codex                   # AI coding agent
  jupyter-notebook-viewer # quicklook for .ipynb
  macfuse                 # userspace filesystems (sshfs et al.)
  paseo                   # menubar pasteboard manager
  qlmarkdown              # quicklook for markdown
  skim                    # PDF reader, plays nice with LaTeX
  vscodium                # vscode without the telemetry
  warp                    # terminal
  yeti                    # menubar app
)

# Formulae that only build on macOS
darwin_programs=(
  macmon              # Apple Silicon hardware monitor
  terminal-notifier   # notifications from the CLI
)

# Formulae only needed on Linux
linux_programs=(
  glibc               # crt startup objects + headers; hosts without libc6-dev
                      # can't link otherwise. Must precede gcc: gcc's
                      # postinstall writes a specs file pointing at brew glibc
  gcc                 # servers often ship no compiler; nvim needs one to
                      # build tree-sitter parsers (macOS has clang via CLT)
)

## Onto the installation 
os_independent_homebrew_install() {

  echo "Installing Homebrew..."

  # Check if it's macOS or Linux, and install Homebrew accordingly
  case $OSTYPE in

    "linux-gnu"*)

      echo 'installing homebrew for linux'
      NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"  &&

      # Add to path in shells, unless already present (keeps reruns idempotent)
      # Starting conditional checks if the file actually exists,
      # necessary when working within docker containers with brew, on a server
      # which does not have brew
      # Skip stowed rc files (symlinks): they handle the brew PATH themselves,
      # and appending would write through the link into this repo
      shellenv_line='[ -e /home/linuxbrew/.linuxbrew/bin/brew ] && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"'
      grep -qxF "$shellenv_line" ~/.bashrc 2> /dev/null || [ -L ~/.bashrc ] || echo "$shellenv_line" >> ~/.bashrc
      grep -qxF "$shellenv_line" ~/.zshrc  2> /dev/null || [ -L ~/.zshrc  ] || echo "$shellenv_line" >> ~/.zshrc
      eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)" 
    ;;

    "darwin"*) 
      printf 'You need to install homebrew on macos manually! run:\n\n'
      echo 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
      exit 1

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

  # echo "installing stow"
  # according to the docs, this should work. In practice, it does not. 
  # https://github.com/aspiers/stow/blob/master/INSTALL.md
  
  # I also don't like the dependency on perl and modules. 
  # Perhaps https://github.com/RaphGL/Tuckr is better, as it 
  # compiles to a binary (w/o deps other than rust, on any platform).

  # curl -O https://ftp.gnu.org/gnu/stow/stow-2.4.1.tar.gz
  # tar -xzf stow-2.4.1.tar.gz 
  # cd stow-2.4.1

  # installation_path=~/.local
  # mkdir -p $installation_path
  # abs_installation_path=$(cd $installation_path; pwd)

  # ./configure --prefix=$abs_installation_path
  # make install

  echo "installing basic: ${basics[*]}"

  # TODO: installation from source
  echo 'not yet implemented: installing from source :)'
  exit 
fi 

# 2.2 Otherwise, brew exists so install all programs.
# One formula at a time: a single broken formula must not abort the rest
# (brew gives up on the whole batch), and reruns stay idempotent since brew
# no-ops on anything already installed.
programs=("${basics[@]}" "${programs[@]}")
[[ "$OSTYPE" == "linux-gnu"* ]] && programs+=("${linux_programs[@]}")
echo "installing all: ${programs[*]}"
failed=()
for formula in "${programs[@]}"; do
  brew install "$formula" > /dev/null || failed+=("$formula")
done
[ ${#failed[@]} -gt 0 ] && echo "FAILED to install: ${failed[*]}" >&2

echo 'run the following in case brew is not yet available in this shell'
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"'

# 2.3 Also set up said programs

# no longer necessary, this happens on vim startup
# vim +'PlugInstall --sync' +qall


# 2.4 Symlink the dotfiles into $HOME.
# This must happen in this script, not a later `make restow`: brew's bin
# dir (and thus stow) is only on PATH here, via the shellenv eval above.
echo "symlinking dotfiles into $HOME"
"$(dirname "$0")/link.sh"


# 2.5 jbcentral (JetBrains central-cli, no brew formula)
# proxies coding agents through JetBrains Central; run `central login` after.
# The installer names the binary `central` and puts it in ~/.local/bin,
# which may not be on PATH yet mid-install — check the path too.
command -v central &> /dev/null || [ -x "$HOME/.local/bin/central" ] ||
curl -fsSL https://central-cli.labs.jb.gg/install.sh | bash


# 3. And, if we're on mac, install the casks and mac-only formulae
if [[ "$OSTYPE" == "darwin"* ]]; then
  brew install ${casks[*]} ${darwin_programs[*]}
else
  # claude-code has no linuxbrew formula; use the native installer
  # (installs to ~/.local/bin, which may not be on PATH mid-install)
  command -v claude &> /dev/null || [ -x "$HOME/.local/bin/claude" ] ||
  curl -fsSL https://claude.ai/install.sh | bash
fi

# Surface brew failures in the exit status, after everything else has run
[ ${#failed[@]} -eq 0 ]

