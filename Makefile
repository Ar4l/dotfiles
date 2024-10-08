stow:
	stow -v --dir=files --target=${HOME} -S .

restow:
	stow -v --dir=files --target=${HOME} -R .

delete:
	stow -v --dir=files --target=${HOME} -D .

simulate:
	stow -v --dir=files --target=${HOME} -S .

install:
	./install.sh

all: install restow

.PHONY: stow restow delete simulate all 
