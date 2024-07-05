#!/bin/bash
# Install all dependencies

# Dependencies to be installed
deps='git zsh zsh-syntax-highlighting zsh-autosuggestions zsh-history-substring-search bash stow make fd fzf node pandoc glow pure starship tldr tmux tree coreutils btop'

# Determine OS
case $OSTYPE in

  "linux-gnu"*)
    # I'm making the assumption that I do not have sudo
    # on any Linux machine, as this is typically a remote.

    if which conda > /dev/null; then # conda is not os/device-specific :)

      printf "Installing dependencies with conda: \033[90m$deps\033[0m\n"
      conda install -n base $deps

    elif which apt-get > /dev/null; then # Install to user (~/.local) with apt-get

      printf "Downloading dependencies with apt-get, installing with dpkg: \033[90m$deps\033[0m\n"

	 for dependency in $deps; do
	   if apt-get download -q $dependency; then # quietly download
		 deb_file=$(ls ${dependency}*.deb)
		 echo $deb_file
		 dpkg -x $deb_file ~/.local
		 rm $deb_file
	   else
		 printf "\033[1mapt-get could not find $dependency\033[0m\n"
		fi
	 done

      echo "export PATH=~/.local/usr/bin:~/.local/bin:$PATH" >> $(find . -name .bashrc)
	 export PATH=~/.local/usr/bin:~/.local/bin:$PATH
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
  echo "OS not supported (yet): $OSTYPE"
  exit 1
  ;;

esac

