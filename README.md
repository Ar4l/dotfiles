## Dotfiles

Set of configuration files, frequently used over ssh connections. Mainly
touches: 

- `kitty`: Terminal configuration (theme, font, keybinds)
- `tmux`: Terminal session management (`C-b`)

- `zsh`: Main terminal shell 
- `bash`: Fall-back terminal shell

- `nvim`: Main text editor (`\` &rarr; `Space`)
- `vim`: Fall-back text-editor

#### Install
These dotfiles assume you use [`kitty`](https://sw.kovidgoyal.net/kitty/binary/#binary-install). 
Configuration files are symlinked to their respective locations under
`$HOME`, using [stow](https://www.gnu.org/software/stow). 

```bash
$ git clone https://github.com/Ar4l/dotfiles
# Install dependencies & symlink to $HOME
$ make all
```

```bash 
# Reload
$ make restow
```

## SSH Features 
Servers often have different OS, packages, and tooling available. These dotfiles try to make use of existing ones, and download additional packages when needed. 

> [!WARNING]
> Very much a work-in-progress.

- [ ] TODO: By default, try installing `zsh` on the server for use as the login shell. Stored under `$HOME/bin/zsh` by default. Currently installs via homebrew, for use in docker container, which means it is not available under `/bin/zsh`

If docker is available on the server, assume that the server owners want me to work in a container. I provide a `dock` command, which spins up a `aral-pytorch` container and mounts `$HOME` directory in the container. 

1. Dotfiles are mounted under the container's `/root` (assuming root user), and the entire home is mounted under the `/workspace` directory as well for convenience. The `xterm-kitty` `infocmp` is added to the container.
2. It is possible to directly connect to a container on a host via ssh, but this requires port-forwarding – which I won't attempt as the university is not open about what ports are blocked by its firewall.

- [ ] TODO: `dock` defaults to `bash`, would be nice if I don't have to type `exec zsh` each time.
- [ ] TODO: kittens are not exposed properly within the docker container, as it installs to `.local`, but does not add it to the path.

## Roadmap 
Useful features I would like to have one day. 

- **Sync config over ssh** via `kitty`'s `ssh.conf`. 
  - [ ] This is a bit tricky as we don't know what applications are
    available on the host, and we may not have the required permissions
    to install them in a convenient manner. 

- **Mosh**: Roaming and reduced latency (perspectively speaking) 
  - [ ] [ProxyJump support](https://arc.net/l/quote/zayyucfl) 
  - [ ] [Integrate with kitty](https://github.com/kovidgoyal/kitty/discussions/6529): `mosh kitten run-shell`

## TODO 

- `C-hjkl` for changing windows anywhere; while also keeping the original application keybinds in case anything goes awry.
  - within `kitty`
  - within `tmux`
  - over ssh, within docker; see if `tmux` outside a container can work with `vim` inside a container. 
- `nvim`/`sniprun`: allow python snippets to run in markdown.
- `zsh`: export `TERM=xterm-256color` does not work on `ace`.
- `tmux`: swap v/h layout of pane with preceding pane: [SO](https://stackoverflow.com/questions/15439294/tmux-switch-the-split-style-of-two-adjacent-panes). Do not use the `-n` bindings to be able to use the same functionality in vim.
  - Or generalised for any direction: This [SO post](https://stackoverflow.com/a/70024796/340947)

- `install.sh`
  - [ ] install xclip on linux systems
  - [ ] set up `vim`/`nvim` clipboards so they work: 
    - [ ] on local machine and inside tmux
    - [ ] on host and inside tmux
    - [ ] inside docker container 

- `vim`
  - [ ] double check that we didn't lose any plugin confs
  - [ ] show slider bar
  - [ ] terminal colours
  - [ ] alt-delete to delete a word
  - [ ] Highlight copied selection akin to nvim
  - [ ] single line mouse scrolling. This is possible but not like the way I want.


## Notes

- `editorconfig` for sharing tab-style configurations across editors. Comes bundled with `nvim >= 0.9`, `vim >= 9.0.1799`.

<!--
# Dependencies

Following are the packages & software that must be installed on the
system. I do this manually using Homebrew.

+ git: my preferred vcs
+ vim: on days I relapse, I use vim for a while...
+ zsh: preferred shell of choice
+ bash: backup shell; I keep the config around for remote servers
+ pandoc: file format conversion cli; plays a cental role in my
  information management & publication system
+ stow: symlink management cli; required to manage files in this repo
+ starship: cross-shell prompt; I additionally remove all the emojis
  and make it look like the pure prompt (optional)
+ fzf: general purpose fuzzy finder; I also use it within vim (optional)
+ ripgrep: user-friendly alternative to grep; although I choose grep
  most of the time for its portability (optional)
+ fd: user-friendly alternative to find; this one I use more
  frequently because find's syntax is non-intuitive (optional)
+ bat: alternative to cat (optional)
+ glow: pretty-print markdown cli (optional)
+ aspell: spell checker (optional)
+ bib-tool: bibliography management cli (optional)
+ csvkit: csv manipulation cli (optional)
+ dvc: machine learning data & pipeline vcs (optional)
+ htop: alternative to top (optional)
+ tig: git tui; although most of the time I use vim-fugitive (optional)
+ tldr: cli cheatsheet (optional)
+ tmux: terminal multiplexer (optional)
+ tree: pretty-print directory structure (optional)
+ language servers:
  + python-language-server (pylsp)
  + bash-language-server
  + marksman (markdown)
  + texlab (latex)

Following are the GUI applications I use. I install them manually
using Homebrew Cask.

+ 1password: password manager
+ alfred: spotlight alternative
+ dash: documentation reader
+ hammerspoon: osx automation; primarily (under)utilised for window management
+ firefox: web browser of choice
+ fonts:
  + font-jetbrains-mono: proportional font of choice
  + font-source-code-pro: proportional font for life
+ karabiner-elements: keyboard manipulation; space cadet shifts, hyper
  key, capslock as control & the likes
+ mactex: full latex distribution for osx
+ logitech-camera-settings: for logitech webcam
+ logitech-options: for logitech mouse
+ nordvpn: vpn of choice
+ pdf-expert: pdf reader of choice; adds much needed split views which
  Preview does not have
+ spotify: music streaming service of choice
+ transmission: torrent client of choice
+ wezterm: terminal emulator of choice
+ docker: container management; I often use it to isolate my
  development environments (optional)
+ font-ibm-plex-serif: non-proportional font of choice (optional)
+ font-source-code-pro: ex proportional font of choice (optional)
-->
