# Install all dependencies

# Dependencies to be installed
deps='git zsh zsh-syntax-highlighting zsh-autosuggestions zsh-history-substring-search bash stow make fd fzf node pandoc glow pure starship tldr tmux tree coreutils'

# Determine OS
case $OSTYPE in 

  "linux-gnu"*) 
    # if we have conda, let's just install everything through there, because it's not device-specific
    if which conda > /dev/null; then
      printf "Installing dependencies with conda: \033[90m$deps\033[0m"
      conda install -n base $deps

    else 
      echo 'Conda not available!!!'
      exit 1
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


