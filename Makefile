# brew-installed stow lives here on Linux, and is otherwise only on PATH
# inside install.sh (via its shellenv eval); harmless where the dir is absent
export PATH := /home/linuxbrew/.linuxbrew/bin:$(PATH)

stow: restow

restow:
	./link.sh

delete:
	stow -v --dir=files --target=${HOME} -D .

simulate:
	stow -n -v --dir=files --target=${HOME} -R .

install:
	./install.sh

# headless-unlockable gnome-keyring for CLIs that store tokens (central etc.);
# separate from `all` because it needs sudo once
keyring:
	./keyring.sh

all: install restow

.PHONY: stow restow delete simulate install keyring all
