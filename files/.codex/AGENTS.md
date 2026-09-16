# Global Codex instructions

## Imported Claude memory

- Claude memory files are mirrored under `~/.codex/memory/claude/`.
- When working inside a Git repository, identify it with `git rev-parse --path-format=absolute --git-common-dir` from the working directory. The main checkout and linked worktrees share this directory.
- For `/home/aral/dotfiles/.git`, read `~/.codex/memory/claude/dotfiles/MEMORY.md` and follow its links when relevant.
- For `/home/aral/jetbrains-ai-ml/.git`, read `~/.codex/memory/claude/jetbrains-ai-ml/MEMORY.md` and follow its links when relevant.
- Treat these as user/project context. If a memory conflicts with the user's current request or newer repository state, prefer the current request and verified state.

## mattpocock-skills

- The plugin's skills are exposed via symlinks in `~/.agents/skills/` (stable link `~/.agents/mattpocock-skills-plugin`). Invoke explicitly, e.g. `$wayfinder`, `$grill-with-docs`, `$to-tickets`.
