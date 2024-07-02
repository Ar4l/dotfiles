# Install all dependencies

# Dependencies to be installed
deps='git zsh zsh-syntax-highlighting zsh-autosuggestions zsh-history-substring-search bash stow make fd fzf node pandoc glow pure starship tldr tmux tree coreutils btop'

# Determine OS
case $OSTYPE in 

  "linux-gnu"*) 
    # I'm making the assumption that I do not have sudo 
    # on any Linux machine, as this is typically a remote.

    if which conda > /dev/null; then # conda is not os/device-specific :)

      printf "Installing dependencies with conda: \033[90m$deps\033[0m"
      conda install -n base $deps

    elif which apt-get > /dev/null; then # Install to user (~/.local) with apt-get

      printf "Downloading dependencies with apt-get, installing with dpkg: \033[90m$deps\033[0m"

      apt-get download $deps
      # TODO; doesn't install all packages
      # E: Unable to locate package zsh-history-substring-search
      # E: Unable to locate package fd
      # E: Unable to locate package node <- DEFINITELY NOT NECESSARY
      # E: Unable to locate package glow
      # E: Unable to locate package pure
      # E: Unable to locate package starship
      # E: Unable to locate package btop

      # TODO: dpkg -x package.deb ~/.local for each downloaded package

      echo "export PATH=~/.local/bin:$PATH" >> $(find . -name .bashrc)
    fi
    ;;

  "darwin"*) # Mac OSX
    # Installation assuming homebrew is installed
    # Homebrew requires sudo once to be installed. See 
    # https://docs.brew.sh/Homebrew-on-Linux
    printf "Installing dependencies with homebrew: \033[90m$deps\033[0m"
    brew install $deps
    ;;

#   "freebsd"*)
#     # the ultimate OS 
#     ;;
# 
#   "cygwin")
#     # POSIX compatibility layer and Linux environment emulation for Windows
#     ;;
# 
#   "msys") 
#     # Lightweight shell and GNU utilities compiled for Windows (part of MinGW and Git Bash)
#     ;;
# 
#   "win32")
#     # not even gonna consider this one
#     ;;
  *)
  echo 'OS not supported (yet)'
  exit 1
  ;;

esac 


