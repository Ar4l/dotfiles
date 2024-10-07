
call plug#begin()
" The default plugin directory will be as follows:
"   - Vim (Linux/macOS): '~/.vim/plugged'
"   - Vim (Windows): '~/vimfiles/plugged'
"   - Neovim (Linux/macOS/Windows): stdpath('data') . '/plugged'
" You can specify a custom plugin directory by passing it as the argument
"   - e.g. `call plug#begin('~/.vim/plugged')`
"   - Avoid using standard Vim directory names like 'plugin'

" Essentials
Plug 'morhetz/gruvbox'	  " Proper groovy 
Plug 'tpope/vim-sensible' " Better defaults
Plug 'preservim/nerdtree' " Actual file browser

" " Autocompletion
" Plug 'prabirshrestha/asyncomplete.vim' 			" auto completions please
" Plug 'prabirshrestha/vim-lsp'					" language server to provide them
" Plug 'prabirshrestha/asyncomplete-lsp.vim'		" link ls to completions 
" Plug 'mattn/vim-lsp-settings'					" install LS for open file 

" Other
Plug 'junegunn/vim-easy-align'					" Easy alignment as it should be
Plug 'mileszs/ack.vim'                  " for the day I learn how to use ack
" Plug 'ctrlpvim/ctrlp.vim'
" Plug 'easymotion/vim-easymotion'

" Kitty integration
Plug 'NikoKS/kitty-vim-tmux-navigator' 			" Navigation with Ctrl+hjkl
Plug 'sainnhe/gruvbox-material'					" match with kitty (easy on eyes)

" Aru's recommendations
Plug 'tpope/vim-eunuch'         " vim sugar for UNIX 
Plug 'tpope/vim-obsession'      " manage sessions
Plug 'tpope/vim-surround'       " ysiw] to [surround]
Plug 'tpope/vim-endwise'        " end if-like structs
Plug 'tpope/vim-repeat'         " make . better 
Plug 'tpope/vim-apathy'         " set 'path' option for file
Plug 'tpope/vim-fugitive'       " git integration with :G
Plug 'tpope/vim-git'            " not git

Plug 'tpope/vim-dispatch'       " no clue, something backend
Plug 'tpope/vim-markdown'       " better markdown support
Plug 'tpope/vim-vinegar'        " more effin keybinds for file nav

" todo 
Plug 'tpope/vim-unimpaired'     " bunch of complementary mappings
" Plug 'tpope/vim-abolish'        " working with word variant{,s}
" Plug 'tpope/vim-projectionist'  " templates? why is this pope so weird
" Plug 'tpope/vim-rsi'            " emacs key bidnings?
" Plug 'wincent/ferret'           " multi-file find & replace (who needs a vim plugin for this?)
" Plug 'wincent/pinnacle'         " manipulate :highlight groups?
" Plug 'jpalardy/vim-slime'       " i read emacs and lisp and wanted to die

Plug 'tpope/vim-sleuth'         " get shiftwidth from current file
Plug 'tpope/vim-commentary'     " comment w gcc

Plug 'wincent/terminus'         " better term: mouse, cursor, focus
Plug 'wincent/loupe'            " better search, <leader>n for highlights
Plug 'junegunn/fzf.vim'         " fzf-vim integration

Plug 'lervag/vimtex'            " tex support

if isdirectory('/usr/local/opt/fzf')
  Plug '/usr/local/opt/fzf'
else
  " fzf does not exist on the device so install it
  Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
endif

call plug#end()

" colorscheme
colorscheme gruvbox

" NERDTree (I prefer its layout over netrw)
nnoremap <leader>b :NERDTreeToggle<CR>

"" OLD (FROM ARU)
" vimtex
let g:vimtex_fold_enabled = 1 " turn on folding in tex files
let g:vimtex_bib_fold_enabled = 1 " turn on folding in bib files

" fzf 
nmap <leader>t :Files<cr>
nmap <leader><leader> :Buffers<cr>
nmap <leader>h :Helptags<cr>
nmap <leader>l :BLines<cr>
nmap <leader>. :BTags<cr>

" NOTE: stolen from fzf.vim README
" Preview window is hidden by default. You can toggle it with ctrl-/.
" It will show on the right with 50% width, but if the width is smaller
" than 70 columns, it will show above the candidate list
let g:fzf_vim = {}
let g:fzf_vim.preview_window = []

" markdown
let g:markdown_folding = 1

" ferret
let g:FerretMap = 0 " do not create keybindings

" vim-easy-align 
vmap <Enter> <Plug>(EasyAlign)
nmap ga <Plug>(EasyAlign)

" vim-slime 
" let g:slime_target = 'tmux'
" let g:slime_bracketed_paste = 1
" end vim-slime}}}
" end pack 

" turn on signcolumn permanently
" this shows things like vcs, fold markers, etc.
" set signcolumn=auto
" end settings }}}

