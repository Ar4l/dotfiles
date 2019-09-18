" vim-abolish
call aru#defer#defer('call aru#plugins#abolish()')

" vim-javascript
let g:jsx_ext_required = 0

" vim-test
nmap <silent> t<C-n> :TestNearest<CR>
nmap <silent> t<C-f> :TestFile<CR>
nmap <silent> t<C-s> :TestSuite<CR>
nmap <silent> t<C-l> :TestLast<CR>
nmap <silent> t<C-g> :TestVisit<CR>

let test#strategy = "vtr"

" tmux-runner
let g:VtrUseVtrMaps = 1

"vimtex
let g:tex_flavor = 'latex'

"tex-conceal
let g:tex_conceal="abdgm"
