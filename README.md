# claude-mods

Small Claude Code mods, shipped as plugins from one marketplace.

| Plugin | What it does |
| --- | --- |
| `status-hud` | A bar above the prompt: current activity, 5-hour limit, weekly limit and context window. |
| `Cache` | A status-line countdown (`Cache ⏱ 52:10`) of the 1 hour prompt-cache window, counted from the last reply. |

## Install

In Claude Code:

```
/plugin marketplace add hymleong/claude-mods
/plugin install status-hud@claude-mods
/plugin install Cache@claude-mods
/reload-plugins
```

Each plugin installs and updates on its own. Mods need a recent Claude Code build that supports hooks modules.

## Notes

- `Cache` keeps its data on your machine only (in Claude Code's plugin store). It does not send anything anywhere.
- To update later: `claude plugin marketplace update claude-mods`, then `claude plugin update <name>@claude-mods`.
