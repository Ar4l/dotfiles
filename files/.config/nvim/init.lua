-- use settings defined in vimrc as a base
vim.cmd([[
set runtimepath^=~/.vim runtimepath+=~/.vim/after
let &packpath = &runtimepath
source ~/.vim/common.vim
]])

vim.opt.hlsearch = true
vim.opt.incsearch = true
vim.opt.laststatus = 2
vim.opt.belloff = "all"
vim.opt.shortmess = vim.opt.shortmess + "A"
vim.opt.shortmess = vim.opt.shortmess + "I"
vim.opt.shortmess = vim.opt.shortmess + "O"
vim.opt.shortmess = vim.opt.shortmess + "T"
vim.opt.shortmess = vim.opt.shortmess + "W"
vim.opt.shortmess = vim.opt.shortmess + "a"
vim.opt.shortmess = vim.opt.shortmess + "c"
vim.opt.shortmess = vim.opt.shortmess + "o"
vim.opt.shortmess = vim.opt.shortmess + "s"
vim.opt.shortmess = vim.opt.shortmess + "t"
vim.opt.backspace = "indent,start,eol"
vim.opt.clipboard = vim.opt.clipboard + "unnamedplus"
vim.opt.autoindent = true
vim.opt.autowrite = true
vim.opt.autoread = true
vim.opt.backupcopy = "yes"
vim.opt.backup = false
vim.opt.writebackup = false
vim.opt.joinspaces = false
vim.opt.swapfile = false
vim.opt.undofile = true
vim.opt.sidescrolloff = 3
vim.opt.scrolloff = 3
vim.opt.shiftround = false
vim.opt.splitbelow = true
vim.opt.splitright = true
vim.opt.switchbuf = "usetab"
vim.opt.wildmenu = true
vim.opt.wildoptions = "pum"
vim.opt.wildmode = "longest:full,full"
-- vim.opt.fillchars = {
--   diff = "∙", -- BULLET OPERATOR (U+2219, UTF-8: E2 88 99)
--   eob = " ", -- NO-BREAK SPACE (U+00A0, UTF-8: C2 A0) to suppress ~ at EndOfBuffer
--   fold = "·", -- MIDDLE DOT (U+00B7, UTF-8: C2 B7)
--   vert = "┃", -- BOX DRAWINGS HEAVY VERTICAL (U+2503, UTF-8: E2 94 83)
-- }

-- fold using treesitter expressions
vim.opt.foldmethod = 'expr'
vim.opt.foldexpr = "v:lua.vim.treesitter.foldexpr()"
vim.opt.foldtext = "v:lua.vim.treesitter.foldtext()"

vim.opt.foldlevelstart = 99
vim.opt.linebreak = true
vim.opt.breakindent = false
vim.opt.smarttab = true

vim.opt.formatoptions = vim.opt.formatoptions + "n"
vim.opt.formatoptions = vim.opt.formatoptions + "1"
vim.opt.formatoptions = vim.opt.formatoptions + "j"
vim.opt.formatoptions = vim.opt.formatoptions + "p"

vim.opt.modelineexpr = true
vim.opt.concealcursor = vim.opt.concealcursor + "i"
vim.opt.concealcursor = vim.opt.concealcursor + "n"
vim.opt.concealcursor = vim.opt.concealcursor + "c"
vim.opt.cursorline = true
vim.opt.ruler = true
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.infercase = true

-- vim.opt.textwidth = 70   -- hardwrap sentences at given length
-- vim.opt.expandtab = true -- use spaces to indent (not tabs)
vim.opt.tabstop = 4      -- width of a tab
vim.opt.shiftwidth = 4   -- width when shifting text
vim.opt.termguicolors = true
-- vim.opt.spellfile = "~/.vim/spell/en.utf-8.add"
-- vim.opt.spelllang = "en"

vim.opt.mouse = "a"
vim.opt.mousescroll = 'ver:1,hor:1'

vim.opt.completeopt = vim.opt.completeopt + "menu"
vim.opt.completeopt = vim.opt.completeopt + "menuone"
vim.opt.completeopt = vim.opt.completeopt + "noselect"

vim.opt.list = false
-- vim.opt.listchars = {
--   nbsp = "⦸",
--   extends = "»",
--   precedes = "«",
--   tab = "▷⋯",
--   trail = "•",
--   space = "·",
-- }
vim.wo.signcolumn = "yes"
vim.opt.number = false
vim.opt.relativenumber = false
vim.g.markdown_folding = true

-- UI tweaks
vim.opt.pumblend = 10
vim.opt.pumheight = 10
vim.opt.winblend = 10

-- Keybindings
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"
vim.keymap.set("n", "<leader><tab>", "zA")

vim.keymap.set({ "n", "v" }, "<Space>", "<Nop>", { silent = true })

-- Remap for dealing with word wrap
vim.keymap.set("n", "k", "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
vim.keymap.set("n", "j", "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })

-- Clear hlsearch with <esc> in normal mode
vim.keymap.set("n", "<Esc>", "<cmd>nohlsearch<cr>")

vim.keymap.set("t", "<Esc><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({

  { 
    -- ai code completions baby
    'ggml-org/llama.vim',

    -- see opts with :help llama_config
    init = function()

      -- Change colors (doesn't seem to fucking work)
      -- No clue where this came from; same as sniprun fg 
      vim.api.nvim_set_hl(0, "llama_hl_hint", {fg = "#a79a84", ctermfg=209})
      -- Gruvbox Material Dark Medium: grey0 
      vim.api.nvim_set_hl(0, "llama_hl_info", {fg = "#7c6f64", ctermfg=119})
    end,
  },

  {                     
    -- Useful plugin to show you pending keybinds.
    "folke/which-key.nvim",
    event = "VimEnter", -- Sets the loading event to 'VimEnter'
    config = function() -- This is the function that runs, AFTER loading
      vim.o.timeoutlen = 500
      require("which-key").setup()

      -- Document existing key chains
      require("which-key").register({
        ["<leader>c"] = { name = "[C]ode", _ = "which_key_ignore" },
        ["<leader>d"] = { name = "[D]ocument", _ = "which_key_ignore" },
        ["<leader>r"] = { name = "[R]ename", _ = "which_key_ignore" },
        ["<leader>s"] = { name = "[S]earch", _ = "which_key_ignore" },
        ["<leader>w"] = { name = "[W]orkspace", _ = "which_key_ignore" },
      })
    end,
  },

  { "lewis6991/gitsigns.nvim", opts = {} },

  -- navigation within kitty/tmux 
  { 'NikoKS/kitty-vim-tmux-navigator', lazy = false },
  -- themes
  { "ellisonleao/gruvbox.nvim", priority = 1000 , config = true, opts = ...},
  { "sainnhe/gruvbox-material", priority = 1000},

  {
    "olimorris/persisted.nvim",
    lazy = false, -- make sure the plugin is always loaded at startup
    config = function() 
      require("persisted").setup({ -- default settings on github, except for autoload

        autostart = true, -- Automatically start the plugin on load?
        autoload = true, -- Automatically load the plugin on load?

        -- Function to determine if a session should be saved
        ---@type fun(): boolean
        should_save = function()
          return true
        end,

        save_dir = vim.fn.expand(vim.fn.stdpath("data") .. "/sessions/"), -- Directory where session files are saved

        follow_cwd = true, -- Change the session file to match any change in the cwd?
        use_git_branch = false, -- Include the git branch in the session file name?
        autoload = true, -- Automatically load the session for the cwd on Neovim startup?

        -- Function to run when `autoload = true` but there is no session to load
        ---@type fun(): any
        on_autoload_no_session = function() end,

        allowed_dirs = {}, -- Table of dirs that the plugin will start and autoload from
        ignored_dirs = {}, -- Table of dirs that are ignored for starting and autoloading

        telescope = {
          mappings = { -- Mappings for managing sessions in Telescope
            copy_session = "<C-c>",
            change_branch = "<C-b>",
            delete_session = "<C-d>",
          },
          icons = { -- icons displayed in the Telescope picker
            selected = " ",
            dir = "  ",
            branch = " ",
          },
        },
				
				-- when switching sessions, automatically save this one 
				vim.api.nvim_create_autocmd("User", {
					pattern = "PersistedTelescopeLoadPre",
					callback = function(session)
						-- Save the currently loaded session using the global variable
						require("persisted").save({ session = vim.g.persisted_loaded_session })
				
						-- Delete all of the open buffers
						vim.api.nvim_input("<ESC>:%bd!<CR>")
					end,
				})
      })
    end,
  },

  {
    "michaelb/sniprun",
    branch = "master",

    build = "sh install.sh",
    -- do 'sh install.sh 1' if you want to force compile locally
    -- (instead of fetching a binary from the github release). Requires Rust >= 1.65

    config = function()
      require("sniprun").setup({


        selected_interpreters = { "Python3_fifo" },     --# use those instead of the default for the current filetype
        repl_enable = {},               --# enable REPL-like behavior for the given interpreters
        repl_disable = {},              --# disable REPL-like behavior for the given interpreters

        interpreter_options = {         --# interpreter-specific options, see doc / :SnipInfo <name>

          --# use the interpreter name as key
          GFM_original = {
            use_on_filetypes = {"markdown.pandoc"}    --# the 'use_on_filetypes' configuration key is
                                                      --# available for every interpreter
          },
          Python3_original = {
              error_truncate = "auto"         --# Truncate runtime errors 'long', 'short' or 'auto'
                                              --# the hint is available for every interpreter
                                              --# but may not be always respected
          }
        },      

        --# you can combo different display modes as desired and with the 'Ok' or 'Err' suffix
        --# to filter only sucessful runs (or errored-out runs respectively)
        display = {
          "Classic",                    --# display results in the command-line  area
          "VirtualTextOk",              --# display ok results as virtual text (multiline is shortened)

          -- "VirtualText",             --# display results as virtual text
          -- "TempFloatingWindow",      --# display results in a floating window
          -- "LongTempFloatingWindow",  --# same as above, but only long results. To use with VirtualText[Ok/Err]
          -- "Terminal",                --# display results in a vertical split
          -- "TerminalWithCode",        --# display results and code history in a vertical split
          -- "NvimNotify",              --# display with the nvim-notify plugin
          -- "Api"                      --# return output to a programming interface
        },

        live_display = { "VirtualTextOk" }, --# display mode used in live_mode

        display_options = {
          terminal_scrollback = vim.o.scrollback, --# change terminal display scrollback lines
          terminal_line_number = false,   --# whether show line number in terminal window
          terminal_signcolumn = false,    --# whether show signcolumn in terminal window
          terminal_position = "vertical", --# or "horizontal", to open as horizontal split instead of vertical split
          terminal_width = 45,          --# change the terminal display option width (if vertical)
          terminal_height = 20,         --# change the terminal display option height (if horizontal)
          notification_timeout = 5      --# timeout for nvim_notify output
        },

        --# You can use the same keys to customize whether a sniprun producing
        --# no output should display nothing or '(no output)'
        show_no_output = {
          "Classic",
          "TempFloatingWindow",  --# implies LongTempFloatingWindow, which has no effect on its own
        },

        --# customize highlight groups (setting this overrides colorscheme)
        --# any parameters of nvim_set_hl() can be passed as-is
        snipruncolors = {

          -- Virtual text is displayed inline 
          -- Floating window is displayed in a floating window
          SniprunVirtualTextOk   =  {bg="#32302f", fg="#a79a84", ctermbg="Gray", ctermfg="White"},
          SniprunFloatingWinOk   =  {fg="#66eeff", ctermfg="Cyan"},
          SniprunVirtualTextErr  =  {bg="#881515", fg="#000000", ctermbg="DarkRed", ctermfg="Black"},
          SniprunFloatingWinErr  =  {fg="#881515", ctermfg="DarkRed", bold=true},
        },

        live_mode_toggle='off',      --# live mode toggle, see Usage - Running for more info   

        --# miscellaneous compatibility/adjustement settings
        ansi_escape = true,         --# Remove ANSI escapes (usually color) from outputs
        inline_messages = false,    --# boolean toggle for a one-line way to display output
                                    --# to workaround sniprun not being able to display anything

        borders = 'single',         --# display borders around floating windows
                                    --# possible values are 'none', 'single', 'double', or 'shadow'
            
      })

			-- run a single line
      vim.api.nvim_set_keymap('v', '<leader>r', '<Plug>SnipRun', {silent = true})
      vim.api.nvim_set_keymap('n', '<leader>r', '<Plug>SnipRun', {silent = true})

		-- hard reset with space+R
      vim.api.nvim_set_keymap('n', '<leader>R', '<Plug>SnipReplMemoryClean <Plug>SnipReset <Plug>SnipClose', {silent = true})
		-- run above
      vim.api.nvim_set_keymap('n', '<leader>k', '<Esc>k$vgg0<Plug>SnipRun <C-o>j', {silent = true})
		-- run next para and move down
      vim.api.nvim_set_keymap('n', '<leader>j', '<Esc>vap<Plug>SnipRun }', {silent = true})
		-- space-f + movement (h,j,k, }, {, ...) to run the selection
      vim.api.nvim_set_keymap('n', '<leader>f', '<Plug>SnipRunOperator', {silent = true})

      -- enable running the following languages in markdown
      vim.g.markdown_fenced_languages = { 'python', 'bash', 'rust', "javascript", "typescript", "lua" }

    end,
  },

  { "meain/vim-printer" },  -- # <leader> p to quickly insert a print statement

  {
    "nvim-lualine/lualine.nvim",
    dependencies = {
      -- "nvim-tree/nvim-web-devicons",
    },
    config = function()
      require("lualine").setup({
        options = {
          theme = "auto",
        },
        sections = {
          lualine_a = { "mode" },
          lualine_b = { { "filename", path = 3 } }, -- relative path
          lualine_c = { "filetype" },
          lualine_x = { "branch", "diff", "diagnostics" },
          lualine_y = { "progress" },
          lualine_z = { "location" },
        },
        extensions = { "quickfix", "fugitive", "man", "nvim-tree" },
      })
    end,
  },

  { -- Fuzzy Finder (files, lsp, etc)
    "nvim-telescope/telescope.nvim",
    event = "VimEnter",
    branch = "0.1.x",
    dependencies = {
      "nvim-lua/plenary.nvim",
      { -- If encountering errors, see telescope-fzf-native README for install instructions
        "nvim-telescope/telescope-fzf-native.nvim",

        -- `build` is used to run some command when the plugin is installed/updated.
        -- This is only run then, not every time Neovim starts up.
        build = "make",

        -- `cond` is a condition used to determine whether this plugin should be
        -- installed and loaded.
        cond = function()
          return vim.fn.executable("make") == 1
        end,
      },
      { "nvim-telescope/telescope-ui-select.nvim" },

      -- Useful for getting pretty icons, but requires special font.
      --  If you already have a Nerd Font, or terminal set up with fallback fonts
      --  you can enable this
      -- { 'nvim-tree/nvim-web-devicons' }
    },
    config = function()
      -- Telescope is a fuzzy finder that comes with a lot of different things that
      -- it can fuzzy find! It's more than just a "file finder", it can search
      -- many different aspects of Neovim, your workspace, LSP, and more!
      --
      -- The easiest way to use telescope, is to start by doing something like:
      --  :Telescope help_tags
      --
      -- After running this command, a window will open up and you're able to
      -- type in the prompt window. You'll see a list of help_tags options and
      -- a corresponding preview of the help.
      --
      -- Two important keymaps to use while in telescope are:
      --  - Insert mode: <c-/>
      --  - Normal mode: ?
      --
      -- This opens a window that shows you all of the keymaps for the current
      -- telescope picker. This is really useful to discover what Telescope can
      -- do as well as how to actually do it!

      -- [[ Configure Telescope ]]
      -- See `:help telescope` and `:help telescope.setup()`
      require("telescope").setup({
        -- You can put your default mappings / updates / etc. in here
        --  All the info you're looking for is in `:help telescope.setup()`
        --
        -- defaults = {
        --   mappings = {
        --     i = { ['<c-enter>'] = 'to_fuzzy_refine' },
        --   },
        -- },
        -- pickers = {}
        extensions = {
          ["ui-select"] = {
            require("telescope.themes").get_dropdown(),
          },
        },
      })

      -- Enable telescope extensions, if they are installed
      pcall(require("telescope").load_extension, "fzf")
      pcall(require("telescope").load_extension, "ui-select")

      -- See `:help telescope.builtin`
      local builtin = require("telescope.builtin")
      vim.keymap.set("n", "<leader>sh", builtin.help_tags, { desc = "[S]earch [H]elp" })
      vim.keymap.set("n", "<leader>sk", builtin.keymaps, { desc = "[S]earch [K]eymaps" })
      vim.keymap.set("n", "<leader>sf", builtin.find_files, { desc = "[S]earch [F]iles" })
      vim.keymap.set("n", "<leader>ss", builtin.builtin, { desc = "[S]earch [S]elect Telescope" })
      vim.keymap.set("n", "<leader>sw", builtin.grep_string, { desc = "[S]earch current [W]ord" })
      vim.keymap.set("n", "<leader>sg", builtin.live_grep, { desc = "[S]earch by [G]rep" })
      vim.keymap.set("n", "<leader>sd", builtin.diagnostics, { desc = "[S]earch [D]iagnostics" })
      vim.keymap.set("n", "<leader>sr", builtin.resume, { desc = "[S]earch [R]esume" })
      vim.keymap.set("n", "<leader>s.", builtin.oldfiles, { desc = '[S]earch Recent Files ("." for repeat)' })
      vim.keymap.set("n", "<leader><leader>", builtin.buffers, { desc = "[ ] Find existing buffers" })

      -- Slightly advanced example of overriding default behavior and theme
      vim.keymap.set("n", "<leader>/", function()
        -- You can pass additional configuration to telescope to change theme, layout, etc.
        builtin.current_buffer_fuzzy_find(require("telescope.themes").get_dropdown({
          winblend = 10,
          previewer = false,
        }))
      end, { desc = "[/] Fuzzily search in current buffer" })

      -- Also possible to pass additional configuration options.
      --  See `:help telescope.builtin.live_grep()` for information about particular keys
      vim.keymap.set("n", "<leader>s/", function()
        builtin.live_grep({
          grep_open_files = true,
          prompt_title = "Live Grep in Open Files",
        })
      end, { desc = "[S]earch [/] in Open Files" })

      -- Shortcut for searching your neovim configuration files
      vim.keymap.set("n", "<leader>sn", function()
        builtin.find_files({ cwd = vim.fn.stdpath("config") })
      end, { desc = "[S]earch [N]eovim files" })
    end,
  },

  { -- LSP Configuration & Plugins
    "neovim/nvim-lspconfig",
    dependencies = {
      -- Automatically install LSPs and related tools to stdpath for neovim
      "williamboman/mason.nvim",
      "williamboman/mason-lspconfig.nvim",
      "WhoIsSethDaniel/mason-tool-installer.nvim",

      -- Useful status updates for LSP.
      -- NOTE: `opts = {}` is the same as calling `require('fidget').setup({})`
      { "j-hui/fidget.nvim", opts = {} },
    },
    config = function()
      -- Brief Aside: **What is LSP?**
      --
      -- LSP is an acronym you've probably heard, but might not understand what it is.
      --
      -- LSP stands for Language Server Protocol. It's a protocol that helps editors
      -- and language tooling communicate in a standardized fashion.
      --
      -- In general, you have a "server" which is some tool built to understand a particular
      -- language (such as `gopls`, `lua_ls`, `rust_analyzer`, etc). These Language Servers
      -- (sometimes called LSP servers, but that's kind of like ATM Machine) are standalone
      -- processes that communicate with some "client" - in this case, Neovim!
      --
      -- LSP provides Neovim with features like:
      --  - Go to definition
      --  - Find references
      --  - Autocompletion
      --  - Symbol Search
      --  - and more!
      --
      -- Thus, Language Servers are external tools that must be installed separately from
      -- Neovim. This is where `mason` and related plugins come into play.
      --
      -- If you're wondering about lsp vs treesitter, you can check out the wonderfully
      -- and elegantly composed help section, `:help lsp-vs-treesitter`

      --  This function gets run when an LSP attaches to a particular buffer.
      --    That is to say, every time a new file is opened that is associated with
      --    an lsp (for example, opening `main.rs` is associated with `rust_analyzer`) this
      --    function will be executed to configure the current buffer
      vim.api.nvim_create_autocmd("LspAttach", {
        group = vim.api.nvim_create_augroup("kickstart-lsp-attach", { clear = true }),
        callback = function(event)
          -- NOTE: Remember that lua is a real programming language, and as such it is possible
          -- to define small helper and utility functions so you don't have to repeat yourself
          -- many times.
          --
          -- In this case, we create a function that lets us more easily define mappings specific
          -- for LSP related items. It sets the mode, buffer and description for us each time.
          local map = function(keys, func, desc)
            vim.keymap.set("n", keys, func, { buffer = event.buf, desc = "LSP: " .. desc })
          end

          -- Jump to the definition of the word under your cursor.
          --  This is where a variable was first declared, or where a function is defined, etc.
          --  To jump back, press <C-T>.
          map("gd", require("telescope.builtin").lsp_definitions, "[G]oto [D]efinition")

          -- Find references for the word under your cursor.
          map("gr", require("telescope.builtin").lsp_references, "[G]oto [R]eferences")

          -- Jump to the implementation of the word under your cursor.
          --  Useful when your language has ways of declaring types without an actual implementation.
          map("gI", require("telescope.builtin").lsp_implementations, "[G]oto [I]mplementation")

          -- Jump to the type of the word under your cursor.
          --  Useful when you're not sure what type a variable is and you want to see
          --  the definition of its *type*, not where it was *defined*.
          map("<leader>D", require("telescope.builtin").lsp_type_definitions, "Type [D]efinition")

          -- Fuzzy find all the symbols in your current document.
          --  Symbols are things like variables, functions, types, etc.
          map("<leader>ds", require("telescope.builtin").lsp_document_symbols, "[D]ocument [S]ymbols")

          -- Fuzzy find all the symbols in your current workspace
          --  Similar to document symbols, except searches over your whole project.
          map("<leader>ws", require("telescope.builtin").lsp_dynamic_workspace_symbols, "[W]orkspace [S]ymbols")

          -- Rename the variable under your cursor
          --  Most Language Servers support renaming across files, etc.
          map("<leader>rn", vim.lsp.buf.rename, "[R]e[n]ame")

          -- Execute a code action, usually your cursor needs to be on top of an error
          -- or a suggestion from your LSP for this to activate.
          map("<leader>ca", vim.lsp.buf.code_action, "[C]ode [A]ction")

          -- Opens a popup that displays documentation about the word under your cursor
          --  See `:help K` for why this keymap
          map("K", vim.lsp.buf.hover, "Hover Documentation")

          -- WARN: This is not Goto Definition, this is Goto Declaration.
          --  For example, in C this would take you to the header
          map("gD", vim.lsp.buf.declaration, "[G]oto [D]eclaration")

          -- The following two autocommands are used to highlight references of the
          -- word under your cursor when your cursor rests there for a little while.
          --    See `:help CursorHold` for information about when this is executed
          --
          -- When you move your cursor, the highlights will be cleared (the second autocommand).
          local client = vim.lsp.get_client_by_id(event.data.client_id)
          if client and client.server_capabilities.documentHighlightProvider then
            vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
              buffer = event.buf,
              callback = vim.lsp.buf.document_highlight,
            })

            vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
              buffer = event.buf,
              callback = vim.lsp.buf.clear_references,
            })
          end
        end,
      })

      -- LSP servers and clients are able to communicate to each other what features they support.
      --  By default, Neovim doesn't support everything that is in the LSP Specification.
      --  When you add nvim-cmp, luasnip, etc. Neovim now has *more* capabilities.
      --  So, we create new capabilities with nvim cmp, and then broadcast that to the servers.
      local capabilities = vim.lsp.protocol.make_client_capabilities()
      capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

      -- Enable the following language servers
      --  Feel free to add/remove any LSPs that you want here. They will automatically be installed.
      --
      --  Add any additional override configuration in the following tables. Available keys are:
      --  - cmd (table): Override the default command used to start the server
      --  - filetypes (table): Override the default list of associated filetypes for the server
      --  - capabilities (table): Override fields in capabilities. Can be used to disable certain LSP features.
      --  - settings (table): Override the default settings passed when initializing the server.
      --        For example, to see the options for `lua_ls`, you could go to: https://luals.github.io/wiki/settings/
      local servers = {
        -- clangd = {},
        -- gopls = {},
        -- pyright = {
        --   -- NOTE: fix lag in python files, taken from <https://youtu.be/hp7FFr9oM1k?si=f-mY0WCFr2CP3266&t=698>
        --   capabilities = {
        --     workspace = {
        --       didChangeWatchedFiles = {
        --         dynamicRegistration = false,
        --       },
        --     },
        --   },
        -- },

        marksman = {
          filetypes = { "markdown", "quarto" },
        },
        -- rust_analyzer = {},
        -- ... etc. See `:help lspconfig-all` for a list of all the pre-configured LSPs
        --
        -- Some languages (like typescript) have entire language plugins that can be useful:
        --    https://github.com/pmizio/typescript-tools.nvim
        --
        -- But for many setups, the LSP (`tsserver`) will work just fine
        -- tsserver = {},
        --

        lua_ls = {
          -- cmd = {...},
          -- filetypes { ...},
          -- capabilities = {},
          settings = {
            Lua = {
              runtime = { version = "LuaJIT" },
              workspace = {
                checkThirdParty = false,
                -- Tells lua_ls where to find all the Lua files that you have loaded
                -- for your neovim configuration.
                library = {
                  "${3rd}/luv/library",
                  unpack(vim.api.nvim_get_runtime_file("", true)),
                },
                -- If lua_ls is really slow on your computer, you can try this instead:
                -- library = { vim.env.VIMRUNTIME },
              },
              completion = {
                callSnippet = "Replace",
              },
              -- You can toggle below to ignore Lua_LS's noisy `missing-fields` warnings
              -- diagnostics = { disable = { 'missing-fields' } },
            },
          },
        },
      }

      -- Ensure the servers and tools above are installed
      --  To check the current status of installed tools and/or manually install
      --  other tools, you can run
      --    :Mason
      --
      --  You can press `g?` for help in this menu
      require("mason").setup()

      -- You can add other tools here that you want Mason to install
      -- for you, so that they are available from within Neovim.
      local ensure_installed = vim.tbl_keys(servers or {})
      vim.list_extend(ensure_installed, {
        "stylua", -- Used to format lua code
      })
      require("mason-tool-installer").setup({ ensure_installed = ensure_installed })

      require("mason-lspconfig").setup({
        handlers = {
          function(server_name)
            local server = servers[server_name] or {}
            -- This handles overriding only values explicitly passed
            -- by the server configuration above. Useful when disabling
            -- certain features of an LSP (for example, turning off formatting for tsserver)
            server.capabilities = vim.tbl_deep_extend("force", {}, capabilities, server.capabilities or {})
            require("lspconfig")[server_name].setup(server)
          end,
        },
      })
    end,
  },

  { -- Autoformat
    "stevearc/conform.nvim",
    enabled = false,
    opts = {
      notify_on_error = false,
      format_on_save = {
        timeout_ms = 500,
        lsp_fallback = true,
      },
      formatters_by_ft = {
        lua = { "stylua" },
        python = { "black" },
        -- Conform can also run multiple formatters sequentially
        -- python = { "isort", "black" },
        --
        -- You can use a sub-list to tell conform to run *until* a formatter
        -- is found.
        -- javascript = { { "prettierd", "prettier" } },
      },
    },
  },

  { -- Autocompletion
    "hrsh7th/nvim-cmp",
    event = "InsertEnter",
    dependencies = {
      -- Snippet Engine & its associated nvim-cmp source
      {
        "L3MON4D3/LuaSnip",
        build = (function()
          -- Build Step is needed for regex support in snippets
          -- This step is not supported in many windows environments
          -- Remove the below condition to re-enable on windows
          if vim.fn.has("win32") == 1 or vim.fn.executable("make") == 0 then
            return
          end
          return "make install_jsregexp"
        end)(),
      },
      "saadparwaiz1/cmp_luasnip",

      -- Adds other completion capabilities.
      --  nvim-cmp does not ship with all sources by default. They are split
      --  into multiple repos for maintenance purposes.
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-path",

      -- If you want to add a bunch of pre-configured snippets,
      --    you can use this plugin to help you. It even has snippets
      --    for various frameworks/libraries/etc. but you will have to
      --    set up the ones that are useful for you.
      -- 'rafamadriz/friendly-snippets',
    },
    config = function()
      -- See `:help cmp`
      local cmp = require("cmp")
      local luasnip = require("luasnip")
      luasnip.config.setup({})

      cmp.setup({
        snippet = {
          expand = function(args)
            luasnip.lsp_expand(args.body)
          end,
        },
        completion = { completeopt = "menu,menuone,noinsert" },

        -- For an understanding of why these mappings were
        -- chosen, you will need to read `:help ins-completion`
        --
        -- No, but seriously. Please read `:help ins-completion`, it is really good!
        mapping = cmp.mapping.preset.insert({
          -- Select the [n]ext item
          ["<C-n>"] = cmp.mapping.select_next_item(),
          -- Select the [p]revious item
          ["<C-p>"] = cmp.mapping.select_prev_item(),

          -- Accept ([y]es) the completion.
          --  This will auto-import if your LSP supports it.
          --  This will expand snippets if the LSP sent a snippet.
          ["<C-y>"] = cmp.mapping.confirm({ select = true }),

          -- Manually trigger a completion from nvim-cmp.
          --  Generally you don't need this, because nvim-cmp will display
          --  completions whenever it has completion options available.
          ["<C-Space>"] = cmp.mapping.complete({}),

          -- Think of <c-l> as moving to the right of your snippet expansion.
          --  So if you have a snippet that's like:
          --  function $name($args)
          --    $body
          --  end
          --
          -- <c-l> will move you to the right of each of the expansion locations.
          -- <c-h> is similar, except moving you backwards.
          ["<C-l>"] = cmp.mapping(function()
            if luasnip.expand_or_locally_jumpable() then
              luasnip.expand_or_jump()
            end
          end, { "i", "s" }),
          ["<C-h>"] = cmp.mapping(function()
            if luasnip.locally_jumpable(-1) then
              luasnip.jump(-1)
            end
          end, { "i", "s" }),
        }),
        sources = {
          { name = "nvim_lsp" },
          { name = "luasnip" },
          { name = "path" },
        },
      })
    end,
  },

  "tpope/vim-commentary",
  "tpope/vim-unimpaired",
  "tpope/vim-surround",
  "tpope/vim-rsi",
  "tpope/vim-vinegar",
  "tpope/vim-fugitive",
  "tpope/vim-eunuch",
  "tpope/vim-dispatch",
  "tpope/vim-abolish",

  {
    "wincent/loupe",
    init = function()
      vim.g.LoupeClearHighlightMap = 0 -- do not create mapping, we do this ourselves
      vim.g.LoupeCenterResults = 0     -- do not center result
    end,
  },
  "wincent/pinnacle",

  {
    "lukas-reineke/indent-blankline.nvim",
    main = "ibl",
    opts = {},
    config = function()
      require("ibl").setup()
    end,
  },

  {
    "junegunn/vim-easy-align",
    config = function()
      vim.keymap.set("v", "<Enter>", "<Plug>(LiveEasyAlign)")
      vim.keymap.set("n", "ga", "<Plug>(LiveEasyAlign)")
    end,
  },

  { -- Highlight, edit, and navigate code
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    config = function()
      -- [[ Configure Treesitter ]] See `:help nvim-treesitter`

      ---@diagnostic disable-next-line: missing-fields
      require("nvim-treesitter.configs").setup({
        ensure_installed = { "bash", "c", "html", "lua", "markdown", "vim", "vimdoc", "python" },
        -- Autoinstall languages that are not installed
        auto_install = true,
        highlight = { enable = true },
        indent = { enable = true },
      })

      -- There are additional nvim-treesitter modules that you can use to interact
      -- with nvim-treesitter. You should go explore a few and see what interests you:
      --
      --    - Incremental selection: Included, see `:help nvim-treesitter-incremental-selection-mod`
      --    - Show your current context: https://github.com/nvim-treesitter/nvim-treesitter-context
      --    - Treesitter + textobjects: https://github.com/nvim-treesitter/nvim-treesitter-textobjects
    end,
  },

  {
    "nvim-tree/nvim-tree.lua",
    init = function()
      -- disable netrw
      vim.g.loaded_netrw = 1
      vim.g.loaded_netrwPlugin = 1
    end,
    config = function()
      require("nvim-tree").setup()

      vim.keymap.set("n", "<leader>b", ":NvimTreeToggle<cr>")
    end,
  },

  -- Aru left no documentation for this, and I can't find it
  -- {
  --   dir = "vim.diagnostics",
  --   init = function()
  --     local opts = { noremap = true, silent = true }
  --   vim.keymap.set("n", "<leader>e", vim.diagnostic.open_float, opts)
  --     vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
  --     vim.keymap.set("n", "]d", vim.diagnostic.goto_next, opts)
  --     vim.keymap.set("n", "<leader>q", vim.diagnostic.setloclist, opts)
  --     vim.diagnostic.config({
  --       float = { border = "rounded" },
  --       -- only show signs, underline & virtual text for errors
  --       signs = { severity = vim.diagnostic.severity.ERROR },
  --       underline = { severity = vim.diagnostic.severity.ERROR },
  --       virtual_text = { severity = vim.diagnostic.severity.ERROR },
  --     })
  --     -- better diagnostics signs (taken from wincent)
  --     local signs = { Error = "✖", Warn = "⚠", Hint = "➤", Info = "ℹ" }
  --     for type, icon in pairs(signs) do
  --       local hl = "DiagnosticSign" .. type
  --       vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = hl })
  --     end
  --   end,
  -- },

  {
    "echasnovski/mini.nvim",
    priority = 1000,
    config = function()
      vim.cmd.colorscheme("minischeme")
    end,
  },
})

-- See `:help vim.highlight.on_yank()`
local highlight_group = vim.api.nvim_create_augroup("YankHighlight", { clear = true })
vim.api.nvim_create_autocmd("TextYankPost", {
  callback = function()
    vim.highlight.on_yank()
  end,
  group = highlight_group,
  pattern = "*",
})

vim.o.background = "dark" -- or "light" for light mode
-- let g:gruvbox_material_background = 'soft' but in lua 
-- vim.g.gruvbox_material_background = "normal" -- default
vim.g.gruvbox_material_foreground = "soft" -- default
vim.g.gruvbox_underline = '0'
vim.g.gruvbox_contrast_light = 'medium'
vim.g.gruvbox_italicize_strings = '0'
vim.g.gruvbox_improved_strings = '1'
vim.g.gruvbox_improved_warnings = '1'
vim.g.gruvbox_transparent_bg = '1'
vim.cmd([[set wrap!]])

-- Let's put a soft visual indicator that we're in nvim and not vim
-- i.e. gruvbox-material instead of gruvbox
vim.cmd([[colorscheme gruvbox-material]])

-- Dont show fucking lsp messages unless they are errors 
-- because I don't agree with your arbitrary rules that 
-- differ per lsp client.
vim.diagnostic.config({
  -- only show signs, underline & virtual text for errors
  signs = { severity = vim.diagnostic.severity.ERROR },
  underline = { severity = vim.diagnostic.severity.ERROR },
  virtual_text = { severity = vim.diagnostic.severity.ERROR },
})

