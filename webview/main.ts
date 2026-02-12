import "./styles.css";
import type { HostMessage, WebviewMessage, SessionGroup, ActiveSession } from "../src/types";
import { renderSessionList } from "./commitList";
import { renderDetailPanel, clearDetailPanel } from "./detailPanel";

interface VsCodeApi {
  postMessage(msg: WebviewMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

let sessions: SessionGroup[] = [];
let activeSessions: ActiveSession[] = [];
let selectedCheckpointId: string | null = null;

function render() {
  const root = document.getElementById("root")!;
  root.innerHTML = "";

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
