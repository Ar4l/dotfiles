" colours
set background=dark
colorscheme retrobox " when gruvbox unavailable
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
nmap <CR> o<esc>
nmap <S-CR> O<esc>j


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
set formatoptions+=/    " do not insert comment leader after a // inline comment
set formatoptions+=q    " allow formatting with `gq`
set formatoptions+=n    " add numbers in numbered lists
set formatoptions+=l    " do not wrap a pre-existing long line on insert
set formatoptions+=1    " don't break after a one-letter word.
set formatoptions+=j    " remove comment leader when joining lines with `J`
au Filetype * :setl fo-=o

"" OPTIONS
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
set listchars=nbsp:⦸        " non-breakable space
set listchars+=extends:»    " line spanning past right margin
set listchars+=precedes:«   " line spanning past left margin
set listchars+=tab:▷⋯       " tabs
" set listchars+=trail:•

" fill the statuslines, vertical seps, and other special lines
set fillchars=diff:∙      " deleted lines of diff option
set fillchars+=fold:∙     " filling foldtext
set fillchars+=eob:       " eol below end of the buffer
set fillchars+=vert:┃     " vertical pane separator

" start UNfolded
set foldlevelstart=20

" Tab with 2 spaces, because I'm an adult who minds his indentation.
" Use editorconfig, which ships with vim >= 9.0.1799 and nvim >= 0.9.
set softtabstop=2
set shiftwidth=2
set noexpandtab
set smarttab
if !has('nvim')
  packadd editorconfig
endif

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


