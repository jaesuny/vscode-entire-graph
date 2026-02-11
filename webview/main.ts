import "./styles.css";
import type { HostMessage, WebviewMessage, GitCommit, ActiveSession } from "../src/types";
import { renderCommitList } from "./commitList";
import { renderDetailPanel, clearDetailPanel } from "./detailPanel";
import { renderGraph } from "./graph";

interface VsCodeApi {
  postMessage(msg: WebviewMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

let commits: GitCommit[] = [];
let activeSessions: ActiveSession[] = [];
let selectedHash: string | null = null;

function render() {
  const root = document.getElementById("root")!;
  root.innerHTML = "";

  // Active session banner
  if (activeSessions.length > 0) {
    root.appendChild(renderActiveBanner(activeSessions));
  }

  // Empty state
  if (commits.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-icon">&#x1f4ca;</div>
      <div class="empty-title">No commits found</div>
      <div class="empty-desc">This repository has no commit history yet, or git is not available.</div>
    `;
    root.appendChild(empty);
    return;
  }

  // Check if any commit has Entire data
  const hasEntireData = commits.some((c) => c.entireCheckpointId);
  if (!hasEntireData) {
    const notice = document.createElement("div");
    notice.className = "notice-bar";
    notice.textContent = "No Entire checkpoints found. Commits are shown without AI session data.";
    root.appendChild(notice);
  }

  // Main content: graph + list + detail
  const main = document.createElement("div");
  main.className = "main-layout";

  const leftPane = document.createElement("div");
  leftPane.className = "left-pane";

  // Graph + commit list container
  const graphListContainer = document.createElement("div");
  graphListContainer.className = "graph-list-container";

  const graphCol = document.createElement("div");
  graphCol.className = "graph-column";
  renderGraph(graphCol, commits);

  const listCol = document.createElement("div");
  listCol.className = "list-column";
  renderCommitList(listCol, commits, selectedHash, onCommitClick);

  graphListContainer.appendChild(graphCol);
  graphListContainer.appendChild(listCol);
  leftPane.appendChild(graphListContainer);

  const detailPane = document.createElement("div");
  detailPane.className = "detail-pane";
  detailPane.id = "detail-pane";
  if (!selectedHash) {
    clearDetailPanel(detailPane);
  }

  main.appendChild(leftPane);
  main.appendChild(detailPane);
  root.appendChild(main);
}

function onCommitClick(hash: string) {
  selectedHash = hash;
  render();
  vscode.postMessage({ type: "requestDetail", hash });
}

function renderActiveBanner(sessions: ActiveSession[]): HTMLElement {
  const banner = document.createElement("div");
  banner.className = "active-banner";

  for (const session of sessions) {
    const elapsed = getElapsed(session.started_at);
    const prompt =
      session.first_prompt.length > 60
        ? session.first_prompt.slice(0, 60) + "..."
        : session.first_prompt;
    const line = document.createElement("div");
    line.className = "active-session-line";
    line.innerHTML = `<span class="active-dot"></span> Active: "${escapeHtml(prompt)}" · ${escapeHtml(session.agent_type)} · ${elapsed}`;
    banner.appendChild(line);
  }
  return banner;
}

function getElapsed(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - start) / 60000);
  if (diffMin < 1) return "<1m";
  if (diffMin < 60) return `${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}h ${m}m`;
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// Message handler
window.addEventListener("message", (event) => {
  const msg = event.data as HostMessage;
  switch (msg.type) {
    case "initialData":
      commits = msg.commits;
      activeSessions = msg.activeSessions;
      render();
      break;
    case "commitDetail": {
      const pane = document.getElementById("detail-pane");
      if (pane) {
        renderDetailPanel(pane, msg.detail);
      }
      break;
    }
    case "activeSessions":
      activeSessions = msg.sessions;
      render();
      break;
    case "error":
      console.error("Extension error:", msg.message);
      break;
  }
});
