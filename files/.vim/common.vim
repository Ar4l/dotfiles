" colours
set background=dark
silent! colorscheme slate     " when retrobox unavailable
silent! colorscheme retrobox  " when gruvbox unavailable
silent! colorscheme gruvbox 

syntax on                   " Turn on syntax highlighting.
set hidden                  " Allow hidden buffers (it's vim, cmon)

filetype plugin indent on   " figure out filetype on open
" use vim's ftplugins for broader file type support,
" also use them for appropriate indentation

"" KEYBINDINGS
" prefix        mode
" <map> (none)  normal, visual, select, and operator-pending
" n             normal
" v             visual (x) and select (s)
" more in :h map-overview

let mapleader = "\<Space>"                " Use space as leader key
let maplocalleader = "\\"
" space is the leader, not a motion
nnoremap <silent> <Space> <Nop>
vnoremap <silent> <Space> <Nop>
" reload with space + so
nmap <leader>so :source $MYVIMRC<cr>

" more useful buffer commands
" 1. when closing, switch to a different buffer in this window
" (like really???)
nmap <leader>q :bp<bar>sp<bar>bn<bar>bd<CR>
" 2. similarly for other buf-related commands
nnoremap <leader>w    :w<cr>
nnoremap <leader>wq   :wq<cr>
nnoremap <leader>wqa  :wqa<cr>

" 3. switch between buffers without having to type 
nmap <leader>n :bn<cr>
nmap <leader>p :bp<cr>

" add newline (above or) below with (shift) Enter in Normal mode
noremap <CR> o<esc>
noremap <S-CR> O<esc>j

" focus panes with ctrl-hjkl
noremap <C-h> <C-w>h
noremap <C-j> <C-w>j
noremap <C-k> <C-w>k
noremap <C-l> <C-w>l

" Yank rel path 
nmap yp :let @+ = expand('%')<cr>

" Yank abs path
nmap yP :let @+ = expand('%:p')<cr>

" move by display line when wrapped, unless j/k is given a count
nnoremap <expr> j v:count == 0 ? 'gj' : 'j'
nnoremap <expr> k v:count == 0 ? 'gk' : 'k'

" toggle folds
nnoremap <leader><tab> zA
 
 
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

set autowriteall      " Auto-save files

set scrolloff=3       " n lines to keep around the cursor
set sidescrolloff=3   " n columns, when 'wrap' is off

if has('balloonevalterm') " not included by default on MacOS, nor nvim
  set balloonevalterm " display info where mouse is pointing (no usage tho)
endif

set incsearch         " Search as you type with `?` or `/`
set hlsearch          " highlight matches; vim-cool auto-clears (nvim maps <Esc>)
set ignorecase        " ignore case when searching lowercase
set smartcase         " do not ignore case when capital letters present

set noswapfile        " I still don't know how useful these are?
set nobackup nowritebackup  " no backup files; autowrite saves plenty
set backupcopy=yes    " write files in place, preserving inode/watchers
set autowrite         " always write on close
set autoread          " read in a file when it was changed outside vim
set clipboard^=unnamed,unnamedplus  " share clipboards between vim and os

" persistent undo across sessions. nvim keeps it in its own state dir; vim's
" default scatters undo files next to the files themselves, so give it a
" state dir too (NOT under ~/.vim, which symlinks into the dotfiles repo)
if has('persistent_undo')
  if !has('nvim')
    set undodir=~/.local/state/vim/undo
    silent! call mkdir(expand('~/.local/state/vim/undo'), 'p')
  endif
  set undofile
endif

set nobreakindent     " don't visually indent wrapped lines
set linebreak         " break at word boundaries
set nojoinspaces      " when joining two lines, do not insert two spaces between
set autoindent        " copy indent from current line on newline

set nonumber            " Show line numbers.
set norelativenumber  " Don't do relative numbering, I can count (roughly)

set splitright        " open new v-splits on the right
set splitbelow        " open new h-splits below

set backspace=indent,eol,start    " Disable unintuitive delete key behaviour
set noerrorbells visualbell t_vb= " Disable audible bell because it's annoying.
" Unbind some useless/annoying default key bindings.
nmap Q <Nop> " 'Q' in normal mode enters Ex mode. You almost never want this.


" Automatic formatting options
" see :h fo-table for more details
" set formatoptions=t     " wrap text
set formatoptions=r     " insert comment leader after enter
" Disabled this so we can control whether to continue the comment explicitly
set formatoptions-=o	" do not continue comment when using o/O
silent! set formatoptions+=/    " do not insert comment leader after a // inline comment
set formatoptions+=q    " allow formatting with `gq`
set formatoptions+=n    " add numbers in numbered lists
set formatoptions+=l    " do not wrap a pre-existing long line on insert
set formatoptions+=1    " don't break after a one-letter word.
set formatoptions+=j    " remove comment leader when joining lines with `J`
silent! set formatoptions+=p    " don't break after period + single space (vim >= 8.2)
au Filetype * :setl fo-=o

"" OPTIONS
" never, ever modify the text when wrapping it.
set textwidth=0
" except in markdown
autocmd FileType markdown setlocal textwidth=70

" see :h sortmess for more info
set shortmess=a " short for shortmess=filmnrwx
set shortmess+=o
set shortmess+=O
set shortmess+=s
set shortmess+=t
set shortmess+=T
set shortmess+=W
set shortmess+=I  " Disable the default Vim startup message.
set shortmess+=A  " no swapfile ATTENTION prompts (swapfiles are off anyway)
silent! set shortmess+=c  " no ins-completion-menu messages

" auto expand command menus
set wildmenu
silent! set wildoptions=pum
set wildmode=longest:full
set wildmode+=full

set laststatus=2      " always show the statusline
set ruler             " show line/column in the statusline
silent! set belloff=all
set switchbuf=usetab  " reuse an existing window when jumping to a buffer
set infercase         " match case in keyword completion
silent! set modelineexpr  " allow expression options in modelines
set concealcursor=inc " keep text concealed under the cursor too
silent! set completeopt=menu,menuone,noselect

" fold sections in markdown (runtime ftplugin feature, vim and nvim)
let g:markdown_folding = 1

" don't render whitespace markers
set nolist

" fill the statuslines, vertical seps, and other special lines
set fillchars=diff:∙      " deleted lines of diff option
set fillchars+=fold:∙     " filling foldtext
set fillchars+=eob:       " eol below end of the buffer
set fillchars+=vert:┃     " vertical pane separator

" highlight current line when focused
set cursorline
augroup CursorLineControl
  autocmd!
  autocmd WinEnter * setlocal cursorline
  autocmd WinLeave * setlocal nocursorline
augroup END

" start UNfolded
set foldlevelstart=20

" Tab with 2 spaces, because I'm an adult who minds his indentation.
" Use editorconfig, which ships with vim >= 9.0.1799 and nvim >= 0.9.
set tabstop=4
set shiftwidth=4
set expandtab
set smarttab

if !has('nvim')
  silent! packadd editorconfig
endif


