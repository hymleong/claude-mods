# claude-mods

Small Claude Code mods, shipped as plugins from one marketplace.

| Plugin | What it does |
| --- | --- |
| `status-hud` | A bar above the prompt: current activity, 5-hour limit, weekly limit and context window. |
| `Cache` | A status-line countdown (`Cache ⏱ 52:10`) of the 1 hour prompt-cache window, counted from the last reply. |
| `workbench` | A side pane (`/workbench`) with Git review, several real PowerShell terminals, and a live monitor of the servers listening on localhost. |

## Install

In Claude Code:

```
/plugin marketplace add hymleong/claude-mods
/plugin install status-hud@claude-mods
/plugin install Cache@claude-mods
/plugin install workbench@claude-mods
/reload-plugins
```

Each plugin installs and updates on its own. Mods need a recent Claude Code build that supports hooks modules.

## workbench

`/workbench` opens the pane. It has three views:

- **Git**: changes, staged and unstaged, with per-file diffs; stage, unstage and commit; fetch, pull and push. Also a file browser with search and a simple editor, the commit graph, and the branch's pull requests and Actions runs. PRs and Actions use the [GitHub CLI](https://cli.github.com) if it is installed.
- **Terminals**: real PowerShell sessions. Variables, functions and the folder you `cd` into carry over between commands, and several sessions can run at once. Each command and its output is shown as a block with its exit status and how long it took. The input line has ↑/↓ history, Tab completion and Ctrl+C. Scripts found in the project (`package.json`, Makefile, justfile, Cargo, Go, compose, .NET, Django) run with one click.
- **Ports**: what is listening on this machine, dev servers first. It shows the framework, page title and response time, and links each port to the terminal that started it. You can open a port in the browser or stop its process.

`/workbench` also takes a view name (`git`, `files`, `history`, `prs`, `actions`, `term`, `ports`), `new` for a new terminal, or `run <script>`.

It needs only git and PowerShell: pwsh (PowerShell 7) is preferred, with Windows PowerShell as the fallback. There is no other app or service to install. Programs that wait for typed answers (`Read-Host`, password prompts, vim, ssh) cannot run in a pane terminal, because Claude Code gives plugins no way to send keystrokes to a running program.

Options, under `/plugin` → workbench: **Shell** (which PowerShell to run) and **Load PowerShell profile**.

## Notes

- `Cache` keeps its data on your machine only (in Claude Code's plugin store). It does not send anything anywhere.
- To update later: `claude plugin marketplace update claude-mods`, then `claude plugin update <name>@claude-mods`.

## License

MIT, see [LICENSE](LICENSE).
