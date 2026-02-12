# Entire Graph for VS Code

Visualize [Entire](https://entire.io) AI agent sessions inside VS Code.

Browse sessions, inspect checkpoints, see token usage and attribution — all without leaving your editor.

## Features

- **Session-centric view** — commits grouped by AI agent session, not git topology
- **Checkpoint details** — click any checkpoint to see token usage, attribution bar, summary, and sub-agents
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
