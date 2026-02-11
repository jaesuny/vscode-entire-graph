# Entire Graph for VS Code

Git commit graph with [Entire](https://entire.io) AI agent session data overlay.

See which commits were made by AI agents, inspect token usage, attribution ratios, and session summaries — all inside VS Code.

## Features

- **Git commit graph** — SVG branch/merge visualization with lane assignment
- **Entire checkpoint overlay** — commits with AI agent data get a badge showing the agent type
- **Detail panel** — click any commit to see git info + Entire metadata (tokens, attribution bar, summary)
- **Active session banner** — shows currently running AI agent sessions with elapsed time
- **Auto-refresh** — watches for new checkpoints and active session changes

## Requirements

- [Entire CLI](https://github.com/entireio/cli) installed and enabled in your repo (`entire enable`)
- VS Code 1.85+
- Git

## Usage

1. Open a repository with Entire enabled
2. Open the Command Palette (`Cmd+Shift+P`)
3. Run **Show Entire Graph**

## Development

```bash
npm install
npm run compile    # Build extension + webview
npm run watch      # Watch mode
npm run lint       # Type-check
```

Press **F5** in VS Code to launch the Extension Development Host.
