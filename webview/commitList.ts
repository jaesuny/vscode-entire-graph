import type { SessionGroup, GitCommit } from "../src/types";

export function renderSessionList(
  container: HTMLElement,
  sessions: SessionGroup[],
  selectedCheckpointId: string | null,
  onCheckpointClick: (checkpointId: string) => void
): void {
  const list = document.createElement("div");
  list.className = "session-list";

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-icon">&#x1f916;</div>
      <div class="empty-title">No Entire sessions found</div>
      <div class="empty-desc">AI agent sessions will appear here once Entire captures checkpoints in this repository.</div>
    `;
    container.appendChild(empty);
    return;
  }

  for (const session of sessions) {
    list.appendChild(
      renderSessionGroup(session, selectedCheckpointId, onCheckpointClick)
    );
  }

  container.appendChild(list);
}

function renderSessionGroup(
  session: SessionGroup,
  selectedCheckpointId: string | null,
  onCheckpointClick: (checkpointId: string) => void
): HTMLElement {
  const group = document.createElement("div");
  group.className = "session-group";

  // Session header
  const header = document.createElement("div");
  header.className = "session-header";

  const agentBadge = document.createElement("span");
  agentBadge.className = "agent-badge";
  agentBadge.textContent = session.agent;

  const sessionId = document.createElement("span");
  sessionId.className = "session-id";
  sessionId.textContent = session.sessionId.slice(0, 7);

  const dateRange = document.createElement("span");
  dateRange.className = "session-date";
  dateRange.textContent = formatDateRange(session.startedAt, session.lastActivityAt);

  const count = document.createElement("span");
  count.className = "checkpoint-count";
  count.textContent = `${session.checkpoints.length} checkpoint${session.checkpoints.length !== 1 ? "s" : ""}`;

  header.appendChild(agentBadge);
  header.appendChild(sessionId);
  header.appendChild(dateRange);
  header.appendChild(count);

  group.appendChild(header);

  // Checkpoint list
  const checkpoints = document.createElement("div");
  checkpoints.className = "checkpoint-list";

  for (const commit of session.checkpoints) {
    const row = renderCheckpointRow(commit, selectedCheckpointId, onCheckpointClick);
    checkpoints.appendChild(row);
  }

  group.appendChild(checkpoints);
  return group;
}

function renderCheckpointRow(
  commit: GitCommit,
  selectedCheckpointId: string | null,
  onCheckpointClick: (checkpointId: string) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "checkpoint-row";
  if (commit.entireCheckpointId === selectedCheckpointId) {
    row.classList.add("selected");
  }

  // Timeline dot
  const dot = document.createElement("span");
  dot.className = "checkpoint-dot";

  // Info
  const info = document.createElement("div");
  info.className = "checkpoint-info";

  const message = document.createElement("span");
  message.className = "checkpoint-message";
  message.textContent = commit.subject;

  const meta = document.createElement("span");
  meta.className = "checkpoint-meta";

  const parts: string[] = [formatTime(commit.date)];
  if (commit.entireCheckpointId) {
    parts.push(commit.entireCheckpointId.slice(0, 8));
  }
  if (commit.entireAttribution) {
    parts.push(commit.entireAttribution);
  }
  meta.textContent = parts.join(" \u00b7 ");

  info.appendChild(message);
  info.appendChild(meta);

  // Commit hash link
  const hashSpan = document.createElement("span");
  hashSpan.className = "checkpoint-hash";
  hashSpan.textContent = commit.abbreviatedHash;
  hashSpan.title = commit.hash;

  row.appendChild(dot);
  row.appendChild(info);
  row.appendChild(hashSpan);

  if (commit.entireCheckpointId) {
    const cpId = commit.entireCheckpointId;
    row.addEventListener("click", () => onCheckpointClick(cpId));
  }

  return row;
}

function formatTime(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);

  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();

  if (sameDay) {
    return s.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return `${s.toLocaleDateString([], { month: "short", day: "numeric" })} – ${e.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}
