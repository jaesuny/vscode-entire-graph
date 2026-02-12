import "./styles.css";
import type {
  HostMessage,
  WebviewMessage,
  SessionGroup,
  ActiveSession,
  EntireStatus,
  EntireRepoInfo,
} from "../src/types";
import { renderSessionList } from "./commitList";
import { renderDetailPanel, clearDetailPanel } from "./detailPanel";

interface VsCodeApi {
  postMessage(msg: WebviewMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

let status: EntireStatus = { state: "ready" };
let repoInfo: EntireRepoInfo | undefined;
let sessions: SessionGroup[] = [];
let activeSessions: ActiveSession[] = [];
let selectedCheckpointId: string | null = null;

function render() {
  const root = document.getElementById("root")!;
  root.innerHTML = "";

  // Show setup screens for non-ready states
  if (status.state !== "ready") {
    root.appendChild(renderStatusScreen(status, repoInfo));
    return;
  }

  // Active session banner
  if (activeSessions.length > 0) {
    root.appendChild(renderActiveBanner(activeSessions));
  }

  // Main content: session list + detail
  const main = document.createElement("div");
  main.className = "main-layout";

  const leftPane = document.createElement("div");
  leftPane.className = "left-pane";
  renderSessionList(leftPane, sessions, selectedCheckpointId, onCheckpointClick);

  const detailPane = document.createElement("div");
  detailPane.className = "detail-pane";
  detailPane.id = "detail-pane";
  if (!selectedCheckpointId) {
    clearDetailPanel(detailPane);
  }

  main.appendChild(leftPane);
  main.appendChild(detailPane);
  root.appendChild(main);
}

function renderStatusScreen(
  status: EntireStatus,
  info?: EntireRepoInfo
): HTMLElement {
  const container = document.createElement("div");
  container.className = "status-screen";

  switch (status.state) {
    case "cli-not-found":
      container.innerHTML = `
        <div class="status-icon">&#x2699;</div>
        <div class="status-title">Entire CLI not found</div>
        <div class="status-desc">
          Install the Entire CLI to capture AI agent sessions.
        </div>
        <div class="status-steps">
          <div class="status-step">
            <span class="step-number">1</span>
            <span>Install: <code>brew install entireio/tap/entire</code></span>
          </div>
          <div class="status-step">
            <span class="step-number">2</span>
            <span>Enable in your repo: <code>entire enable</code></span>
          </div>
        </div>
        <a class="status-link" href="https://github.com/entireio/cli">
          View on GitHub
        </a>
      `;
      break;

    case "not-enabled":
      container.innerHTML = `
        <div class="status-icon">&#x1f4c1;</div>
        <div class="status-title">Entire not enabled</div>
        <div class="status-desc">
          This repository doesn't have Entire enabled yet. Run the command below to start capturing AI agent sessions.
        </div>
        <div class="status-steps">
          <div class="status-step">
            <span class="step-number">1</span>
            <span>Run: <code>entire enable</code></span>
          </div>
          <div class="status-step">
            <span class="step-number">2</span>
            <span>Start an AI coding session (Claude Code, etc.)</span>
          </div>
        </div>
      `;
      break;

    case "no-checkpoints":
      container.innerHTML = `
        <div class="status-icon">&#x23f3;</div>
        <div class="status-title">No checkpoints yet</div>
        <div class="status-desc">
          Entire is enabled${info ? ` (${escapeHtml(info.strategy)})` : ""} but no checkpoints have been captured yet.
          Start an AI coding session and make some commits.
        </div>
        <div class="status-steps">
          <div class="status-step">
            <span class="step-number">1</span>
            <span>Start an AI agent session (Claude Code, Gemini CLI, etc.)</span>
          </div>
          <div class="status-step">
            <span class="step-number">2</span>
            <span>Make commits — Entire will capture checkpoints automatically</span>
          </div>
        </div>
      `;
      break;
  }

  return container;
}

function onCheckpointClick(checkpointId: string) {
  selectedCheckpointId = checkpointId;
  render();
  vscode.postMessage({ type: "requestDetail", checkpointId });
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
    line.innerHTML = `<span class="active-dot"></span> Active: "${escapeHtml(prompt)}" &middot; ${escapeHtml(session.agent_type)} &middot; ${elapsed}`;
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
      status = msg.status;
      repoInfo = msg.repoInfo;
      sessions = msg.sessions;
      activeSessions = msg.activeSessions;
      render();
      break;
    case "checkpointDetail": {
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
