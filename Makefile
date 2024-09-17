# install-cask:
# 	brew instal --cask 1password karabiner-elements alfred logitech-camera-settings logitech-options firefox nordvpn pdf-expert font-source-code-pro spotify transmission hammerspoon iterm2-beta vlc

install:
	./install.sh

stow:
	stow -v --dir=files --target=${HOME} -S .

restow:
	stow -v --dir=files --target=${HOME} -R .

delete:
	stow -v --dir=files --target=${HOME} -D .

simulate:
	stow --no -v --dir=files --target=${HOME} -S .

all: 
	stow
	install 

ctags:
	find . -type f -not -path '*git*' | ctags --tag-relative=yes -L -

.PHONY: stow restow delete simulate ctags install 
