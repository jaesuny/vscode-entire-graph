import type { GitCommit } from "../src/types";

export function renderCommitList(
  container: HTMLElement,
  commits: GitCommit[],
  selectedHash: string | null,
  onCommitClick: (hash: string) => void
): void {
  const table = document.createElement("div");
  table.className = "commit-table";

  for (const commit of commits) {
    const row = document.createElement("div");
    row.className = "commit-row";
    if (commit.hash === selectedHash) {
      row.classList.add("selected");
    }
    row.addEventListener("click", () => onCommitClick(commit.hash));

    // Commit info column
    const info = document.createElement("div");
    info.className = "commit-info";

    const hashSpan = document.createElement("span");
    hashSpan.className = "commit-hash";
    hashSpan.textContent = commit.abbreviatedHash;

    const msgSpan = document.createElement("span");
    msgSpan.className = "commit-message";
    msgSpan.textContent = commit.subject;

    // Ref badges
    const refsContainer = document.createElement("span");
    refsContainer.className = "commit-refs";
    for (const ref of commit.refs) {
      // Skip Entire orphan branch refs
      if (ref.includes("entire/checkpoints")) continue;
      const badge = document.createElement("span");
      badge.className = "ref-badge";
      badge.textContent = ref.replace("HEAD -> ", "");
      refsContainer.appendChild(badge);
    }

    info.appendChild(hashSpan);
    if (refsContainer.children.length > 0) {
      info.appendChild(refsContainer);
    }
    info.appendChild(msgSpan);

    // Date column
    const dateSpan = document.createElement("span");
    dateSpan.className = "commit-date";
    dateSpan.textContent = formatRelativeDate(commit.date);

    // Entire badge column
    const entireCol = document.createElement("div");
    entireCol.className = "commit-entire";
    if (commit.entireCheckpointId) {
      const badge = document.createElement("span");
      badge.className = "entire-badge";
      badge.title = `Checkpoint: ${commit.entireCheckpointId}`;
      badge.textContent = commit.entireAgent || "AI";
      entireCol.appendChild(badge);
    }

    row.appendChild(info);
    row.appendChild(dateSpan);
    row.appendChild(entireCol);
    table.appendChild(row);
  }

  container.appendChild(table);
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
