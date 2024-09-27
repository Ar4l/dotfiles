#!/bin/bash
# Install all dependencies

# Dependencies to be installed
#  tmux 		# shell server to persist sessions
#  coreutils 	# basic text utilities 'expected to exist on every OS' https://www.gnu.org/software/coreutils/
#  git 		# cmon who is running machines w/o git 
#  bash 		# bash???
#  starship 	# extensive cross-shell prompt https://starship.rs/
#
#  stow 
#  make 
#  vim      # the only editor you need
#  neovim   # a second editor if you must
#  tree 
#  btop
#  
#  zsh 
#  pure 		# minimal zsh prompt https://github.com/sindresorhus/pure
#  zsh-syntax-highlighting 
#  zsh-autosuggestions 
#  zsh-history-substring-search 
#  
#  fd 		# friendly find
#  fzf		# fuzzy find 
#  glow		# CLI markdown renderer https://github.com/charmbracelet/glow
#  tldr 		# shorter manpages


programs='
  tmux 
  coreutils 
  git 
  bash 
  starship 
  stow 
  make 
  vim 
	neovim 
  tree 
  btop 
  zsh 
  pure 
  zsh-syntax-highlighting 
  zsh-autosuggestions 
  zsh-history-substring-search 
  fd 
  fzf 
  glow 
  tldr 
'

# Determine OS
case $OSTYPE in

  "linux-gnu"*)

    # try installin brew if it does not yet exist; 
    if ! command -v brew > /dev/null; then
      NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" 
      (echo; echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"') >> ~/.bashrc
      eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
    fi

    if command -v brew > /dev/null; then
      printf "Installing dependencies with homebrew: \033[90m$programs\033[0m" 
      brew install $programs 
      # source /home/linuxbrew/.linuxbrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh &&
      # source /home/linuxbrew/.linuxbrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh &&
      # source /home/linuxbrew/.linuxbrew/share/zsh-history-substring-search/zsh-history-substring-search.zsh &&
      # eval "$(starship init bash)" &&
      # echo 'autoload -U promptinit; promptinit; prompt pure' >> ~/.zshrc &&
      # eval "$(fzf --bash)" &&
      # source <(fzf --zsh) 
			# vim plugins
			curl -fLo ~/.vim/autoload/plug.vim --create-dirs \
  		  https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
			vim +'PlugInstall --sync' +qall
      ln -s /home/linuxbrew/.linuxbrew/bin/zsh /bin/zsh

    elif command -v conda > /dev/null; then # conda is not os/device-specific :)

      printf "Installing dependencies with conda: \033[90m$programs\033[0m\n"
      conda install -n base $programs

    elif command -v apt-get > /dev/null; then # Install to user (~/.local) with apt-get

      apt-get update # update package index
      printf "Downloading dependencies with apt-get into $(pwd)/programs, installing with dpkg: \033[90m$programs\033[0m\n"

      mkdir -p programs
      cd programs

      for program in $programs; do

        # fetch recursive dependencies
        dependencies=$(apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts --no-breaks --no-replaces --no-enhances $program | grep "^\w" | sort -u)

        for dependency in $dependencies; do 

          # do not install existing programs
          if command -v $dependency > /dev/null; then 
            echo "$dependency already installed"
            continue
          fi 

          if apt-get download -qqq $dependency; then # quietly download

            deb_file=$(ls ${dependency}*.deb)

            echo "installing $deb_file to ~/.local"
            dpkg -x $deb_file ~/.local
            rm $deb_file

          else
            printf "\033[1mapt-get could not find $dependency\033[0m\n"
          fi
        done 
      done

      echo "export PATH=~/.local/usr/bin:~/.local/bin:$PATH" >> $(find . -name .bashrc)
	 export PATH=~/.local/usr/bin:~/.local/bin:$PATH
    fi
    ;;

  "darwin"*) # Mac OSX
    # Installation assuming homebrew is installed
    # Homebrew requires sudo once to be installed. See
    # https://docs.brew.sh/Homebrew-on-Linux
    printf "Installing dependencies with homebrew: \033[90m$programs\033[0m"
    brew install $programs
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

