" Vim is based on Vi. Setting `nocompatible` switches from the default
" Vi-compatibility mode and enables useful Vim functionality. This
" configuration option turns out not to be necessary for the file named
" '~/.vimrc', because Vim automatically enters nocompatible mode if that file
" is present. But we're including it here just in case this config file is
" loaded some other way (e.g. saved as `foo`, and then Vim started with
" `vim -u foo`).
set nocompatible

" SETTINGS
syntax on             " Turn on syntax highlighting.
set hidden            " Allow hidden buffers (it's vim, cmon)

" this was here before, I'm leaving it in for now
" if (empty($TMUX))           " If not inside TMUX
"   "For Neovim > 0.1.5 and Vim > patch 7.4.1799 < https://github.com/vim/vim/commit/61be73bb0f965a895bfb064ea3e55476ac175162 >
"   "Based on Vim patch 7.4.1770 (`guicolors` option) < https://github.com/vim/vim/commit/8a633e3427b47286869aa4b96f2bfc1fe65b25cd >
"   " < https://github.com/neovim/neovim/wiki/Following-HEAD#20160511 >
"
" endif

if (has("termguicolors")) " If this vim version supports it,
  set termguicolors       " use a full 24-bit color theme (16M colours)
endif


if has('mouse')
  set mouse=a               " mouse support has existed for abt a decade

  " set ttymouse=sgr          " escape seqs to use for mouse handling
  " this is set to sgr by default, I presume it matches the current $TERM.

  " scroll single lines instead
  " This does not work as intended, as it assumes focus
  " there may be a way to 1) detect the window the mouse is hovering over,
  " and 2) send keys to that window; but I leave that for another afternoon.
  " map <ScrollWheelUp> <C-Y>
  " map <ScrollWheelDown> <C-E>
endif

set scrolloff=4 " n lines to keep around the cursor

if has('balloonevalterm') " not included by default on MacOS, nor nvim
  set balloonevalterm " display info where mouse is pointing (no usage tho)
endif

set incsearch         " Search as you type with `?` or `/`
set ignorecase        " ignore case when searching lowercase
set smartcase         " do not ignore case when capital letters present

set noswapfile        " I still don't know how useful these are?
set autowrite         " always write on close
set autoread          " read in a file when it was changed outside vim
set clipboard^=unnamed,unnamedplus  " share clipboards between vim and os

set breakindent       " visualy indent wrapped lines
set linebreak         " break at word boundaries
set nojoinspaces      " when joining two lines, do not insert two spaces between
set autoindent        " copy indent from current line on newline

set number            " Show line numbers.
set norelativenumber  " Don't do relative numbering, I can count (roughly)

set splitright        " open new v-splits on the right
set splitbelow        " open new h-splits below

set backspace=indent,eol,start    " Disable unintuitive delete key behaviour
set noerrorbells visualbell t_vb= " Disable audible bell because it's annoying.
" Unbind some useless/annoying default key bindings.
nmap Q <Nop> " 'Q' in normal mode enters Ex mode. You almost never want this.

"" OPTIONS
" Automatic formatting options
" see :h fo-table for more details
" set formatoptions=t     " wrap text
set formatoptions=r     " insert comment leader after enter
set formatoptions-=o    " insert comment leader after o/O
" Disabled this so we can control whether to continue the comment explicitly
set formatoptions+=/    " do not insert comment leader after a // inline comment
set formatoptions+=q    " allow formatting with `gq`
set formatoptions+=n    " add numbers in numbered lists
set formatoptions+=l    " do not wrap a pre-existing long line on insert
set formatoptions+=1    " don't break after a one-letter word.
set formatoptions+=j    " remove comment leader when joining lines with `J`

" never, ever modify the text when wrapping it.
set textwidth=0

" see :h sortmess for more info
set shortmess=a " short for shortmess=filmnrwx
set shortmess+=o
set shortmess+=O
set shortmess+=s
set shortmess+=t
set shortmess+=T
set shortmess+=W
set shortmess+=I
set shortmess+=I  " Disable the default Vim startup message.


" auto expand command menus
set wildmenu
set wildoptions=pum
set wildmode=longest:full
set wildmode+=full

" show hidden spaces & indicate long lines
set list
set listchars=nbsp:⦸
set listchars+=extends:»
set listchars+=precedes:«
set listchars+=tab:▷⋯
set listchars+=trail:•

set fillchars=diff:∙
set fillchars+=fold:∙
set fillchars+=eob: 
set fillchars+=vert:┃

" start UNfolded
set foldlevelstart=20

" statusline
set laststatus=2    " Always show status line (1 for only 1 file)
set statusline=\
set statusline+=%<
set statusline+=%{aru#statusline_fileprefix()}
set statusline+=%t
set statusline+=\
set statusline+=%([%{aru#statusline_ft()}%{aru#statusline_fenc()}%R%M]%)
set statusline+=%=
set statusline+=\
set statusline+=%l:%L:%P
set statusline+=\

" Tab with 2 spaces, because I'm an adult who minds his indentation.
" Use editorconfig, which ships with vim >= 9.0.1799 and nvim >= 0.9.
set softtabstop=2
set shiftwidth=2
set noexpandtab
set smarttab
if !has('nvim')
  packadd editorconfig
endif

" figure out filetype on open
filetype plugin indent on

" colours
set background=dark

" AUTOCOMMANDS
if !has('nvim')
  " Open new windows in a vsplit instead of default hsplit
  " TODO: this overrides NERDTreeToggle, which should always be left.
  augroup VSplitWindow
    autocmd!
    autocmd WinNew * wincmd H
  augroup END

  augroup FileTypeSpecific
    autocmd!
    " enable spelling in git commits
    autocmd FileType gitcommit setlocal spell
    " use default indenting for manpages and vim help
    " this below does nothing
    " autocmd FileType man,help let b:EditorConfig_disable = 1
  augroup END
endif

"" KEYBINDINGS
" prefix        mode
" <map> (none)  normal, visual, select, and operator-pending
" n             normal
" v             visual (x) and select (s)
" more in :h map-overview

let mapleader = "\<Space>"                " Use space as leader key
" reload with space + so
nmap <leader>so :source $MYVIMRC<cr>

" disable highlights on esc
" consider using romainl/vim-cool to solve this issue
map <ESC> :noh<cr>

nnoremap <leader>w   :w<cr>
nnoremap <leader>q   :q<cr>
nnoremap <leader>wq  :wq<cr>
nnoremap <leader>wqa :wqa<cr>

" Escape in terminal actually escapes the terminal
tnoremap <Esc> <C-\><C-n>

" " nmap j gj
" " nmap k gk
" if v:count == 0
"   nmap j gj
"   nmap k gk
" endif
" nmap <leader>q :quit<cr>




"" Old stuff, may remove later
"" Fix the cursor to not blink (doesn't work; maybe kitty overrides)
"" let &t_SI = "\e[6 q"
"" let &t_EI = "\e[2 q"
""
"" " reset the cursor on start (for older versions of vim, usually not required)
"" augroup myCmds
"" au!
"" autocmd VimEnter * silent !echo -ne "\e[2 q"
"" augroup END
"" " Disable highlights when escape is pressed
"
"
"" OLD (FROM ARU)
"" " autocommands {{{
"" function! AruWindowAutocmds() abort
""   augroup AruWindow
""     autocmd!
""     autocmd VimResized * wincmd =
""   augroup END
"" endfunction
"" call AruWindowAutocmds()
"
"" function! AruHelptagsAutocmds() abort
""   augroup AruHelptags
""     autocmd!
""     autocmd VimEnter * helptags ALL
""   augroup END
"" endfunction
"" call AruHelptagsAutocmds()
""
"" " end autocommands }}}
"
"
"" " styled and colored underline support
"" NOTE: currently breaks rendering completely
"" let &t_au = "\e[58:5:%dm"
"" let &t_8u = "\e[58:2:%lu:%lu:%lum"
"" let &t_us = "\e[4:2m"
"" let &t_cs = "\e[4:3m"
"" let &t_ds = "\e[4:4m"
"" let &t_ds = "\e[4:5m"
"" let &t_ce = "\e[4:0m"
"" " strikethrough
"" let &t_ts = "\e[9m"
"" let &t_te = "\e[29m"
"" " truecolor support
"" let &t_8f = "\e[38:2:%lu:%lu:%lum"
"" let &t_8b = "\e[48:2:%lu:%lu:%lum"
"" let &t_rf = "\e]10;?\e\\"
"" let &t_rb = "\e]11;?\e\\"
"" " bracketed paste
"" let &t_be = "\e[?2004h"
"" let &t_bd = "\e[?2004l"
"" let &t_ps = "\e[200~"
"" let &t_pe = "\e[201~"
"" " cursor control
"" let &t_rc = "\e[?12$p"
"" let &t_sh = "\e[%d q"
"" let &t_rs = "\ep$q q\e\\"
"" let &t_si = "\e[5 q"
"" let &t_sr = "\e[3 q"
"" let &t_ei = "\e[1 q"
"" let &t_vs = "\e[?12l"
"" " focus tracking
"" let &t_fe = "\e[?1004h"
"" let &t_fd = "\e[?1004l"
"" execute "set <focusgained>=\<esc>[i"
"" execute "set <focuslost>=\<esc>[o"
"" " window title
"" let &t_st = "\e[22;2t"
"" let &t_rt = "\e[23;2t"

