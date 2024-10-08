install:
	./install.sh

stow:
	stow -v --no-folding --dir=files --target=${HOME} -S .

restow:
	stow -v --no-folding --dir=files --target=${HOME} -R .

delete:
	stow -v --dir=files --target=${HOME} -D .

simulate:
	stow -v --no-folding --dir=files --target=${HOME} -S .

all: 
	stow
	install 

ctags:
	find . -type f -not -path '*git*' | ctags --tag-relative=yes -L -

.PHONY: stow restow delete simulate ctags install 
