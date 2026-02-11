# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VS Code extension that visualizes git commit history with Entire AI agent session data overlay. Shows a git-graph-style commit graph with Entire checkpoint metadata (sessions, tasks, token usage, attribution) for each commit.

## Build & Development

```bash
npm run compile    # Build extension + webview via esbuild
npm run watch      # Watch mode for development
npm run lint       # Type-check both host (tsconfig.json) and webview (tsconfig.webview.json)
```

Press F5 in VS Code to launch the Extension Development Host.

## Architecture

- **Extension host** (`src/`): Node.js/CJS — registers the `entire-graph.show` command, manages the webview panel, reads git data
- **Webview** (`webview/`): Browser/IIFE — renders SVG graph, commit list, and detail panel
- **Communication**: Bidirectional `postMessage` between host and webview (typed via `HostMessage`/`WebviewMessage` in `src/types.ts`)
- **Build**: `esbuild.mjs` produces two bundles: `dist/extension.js` (CJS) and `dist/webview.js` (IIFE). CSS is copied from `webview/styles.css` to `dist/webview.css`.

### Data Flow

1. `gitReader.ts` runs `git log --format=<custom>` with `\x00` field and `\x01` record separators, including `%(trailers:key=Entire-*)` for checkpoint trailers
2. `dataProvider.ts` parses the raw output into `GitCommit[]`, enriched with Entire trailer fields
3. For detail views, reads metadata from the `entire/checkpoints/v1` orphan branch via `git show`
4. Active sessions are read directly from `.git/entire-sessions/*.json` on the filesystem
5. Auto-refresh via FileSystemWatcher on `.git/entire-sessions/` + 30s polling on orphan branch HEAD

### Cross-boundary Type Sharing

Webview files import types directly from `../src/types.ts`. This works because esbuild resolves and bundles the import at build time — the webview bundle (`dist/webview.js`) contains its own copy of the types.

## Key Files

- `src/extension.ts` — Entry point, command registration
- `src/entirePanel.ts` — Webview panel singleton, message dispatch, file watcher, polling
- `src/dataProvider.ts` — Git log parsing + Entire metadata reading from orphan branch
- `src/gitReader.ts` — Git command wrappers (`child_process.execFile`)
- `src/types.ts` — Shared types and message protocol (used by both host and webview)
- `webview/main.ts` — Webview entry point, layout, state management
- `webview/graph.ts` — SVG branch graph rendering (lane assignment algorithm)
- `webview/commitList.ts` — Commit row rendering with Entire badges
- `webview/detailPanel.ts` — Right-side detail panel (git info + Entire metadata)

## Entire Data Sources

- **Commit trailers**: `Entire-Checkpoint`, `Entire-Attribution`, `Entire-Session`, `Entire-Agent`
- **Orphan branch** (`entire/checkpoints/v1`): `<shard>/<rest>/metadata.json`, session metadata, task checkpoints. Shard = first 2 chars of checkpoint ID.
- **Active sessions**: `.git/entire-sessions/*.json` (filtered by `phase !== "ended"`)
