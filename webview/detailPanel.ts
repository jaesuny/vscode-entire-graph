import type { CommitDetail, SessionMetadata, TaskCheckpoint } from "../src/types";

export function clearDetailPanel(container: HTMLElement): void {
  container.innerHTML = `<div class="detail-empty">Select a commit to view details</div>`;
}

export function renderDetailPanel(container: HTMLElement, detail: CommitDetail): void {
  container.innerHTML = "";
  const { commit, checkpoint } = detail;

  // ── Git Info ──
  const gitSection = section("Commit");
  gitSection.appendChild(field("Hash", commit.hash, true));
  gitSection.appendChild(field("Author", `${commit.author} <${commit.authorEmail}>`));
  gitSection.appendChild(field("Date", new Date(commit.date).toLocaleString()));
  gitSection.appendChild(field("Message", commit.subject));
  if (commit.parents.length > 0) {
    gitSection.appendChild(field("Parents", commit.parents.map(p => p.slice(0, 7)).join(", "), true));
  }
  if (commit.refs.length > 0) {
    gitSection.appendChild(field("Refs", commit.refs.join(", ")));
  }
  container.appendChild(gitSection);

  if (!checkpoint) {
    if (commit.entireCheckpointId) {
      const errSection = section("Entire");
      const msg = document.createElement("div");
      msg.className = "detail-empty";
      msg.style.paddingTop = "8px";
      msg.textContent = "Checkpoint data could not be loaded";
      errSection.appendChild(msg);
      container.appendChild(errSection);
    }
    return;
  }

  // ── Entire Checkpoint ──
  const cpSection = section("Entire Checkpoint");
  cpSection.appendChild(field("ID", checkpoint.checkpoint_id, true));
  cpSection.appendChild(field("Strategy", checkpoint.strategy));
  cpSection.appendChild(field("Branch", checkpoint.branch));
  container.appendChild(cpSection);

  // ── Sessions ──
  for (let i = 0; i < checkpoint.sessions.length; i++) {
    const sess = checkpoint.sessions[i];
    const sessSection = section(`Session ${i + 1}`);
    renderSession(sessSection, sess);
    container.appendChild(sessSection);
  }

  // ── Tasks (collapsible) ──
  if (checkpoint.tasks.length > 0) {
    const taskSection = section(`Sub-agents (${checkpoint.tasks.length})`);

    const toggle = document.createElement("span");
    toggle.className = "task-toggle";
    toggle.textContent = " [show]";
    const h3 = taskSection.querySelector("h3")!;
    h3.appendChild(toggle);

    const taskList = document.createElement("div");
    taskList.style.display = "none";
    for (const task of checkpoint.tasks) {
      taskList.appendChild(renderTask(task));
    }
    taskSection.appendChild(taskList);

    toggle.addEventListener("click", () => {
      const visible = taskList.style.display !== "none";
      taskList.style.display = visible ? "none" : "block";
      toggle.textContent = visible ? " [show]" : " [hide]";
    });

    container.appendChild(taskSection);
  }
}

function renderSession(container: HTMLElement, sess: SessionMetadata): void {
  container.appendChild(field("Agent", sess.agent));
  container.appendChild(field("Session", sess.session_id, true));
  container.appendChild(field("Created", new Date(sess.created_at).toLocaleString()));

  if (sess.is_task && sess.tool_use_id) {
    container.appendChild(field("Task", sess.tool_use_id, true));
  }

  // Token usage
  if (sess.token_usage) {
    const { input_tokens, output_tokens } = sess.token_usage;
    const total = input_tokens + output_tokens;
    const tokenDiv = document.createElement("div");
    tokenDiv.className = "detail-field";
    tokenDiv.innerHTML = `
      <span class="detail-label">Tokens</span>
      <span class="detail-value">
        ${formatNumber(input_tokens)} in / ${formatNumber(output_tokens)} out
        (${formatNumber(total)} total)
      </span>
    `;
    container.appendChild(tokenDiv);
  }

  // Attribution
  if (sess.initial_attribution) {
    const attr = sess.initial_attribution;
    const attrContainer = document.createElement("div");
    attrContainer.style.marginTop = "6px";

    const bar = document.createElement("div");
    bar.className = "attribution-bar";

    const agentPart = document.createElement("div");
    agentPart.className = "attribution-agent";
    agentPart.style.width = `${attr.agent_percentage}%`;
    agentPart.title = `Agent: ${attr.agent_percentage}%`;

    const humanPart = document.createElement("div");
    humanPart.className = "attribution-human";
    humanPart.style.width = `${attr.human_percentage}%`;
    humanPart.title = `Human: ${attr.human_percentage}%`;

    bar.appendChild(agentPart);
    bar.appendChild(humanPart);
    attrContainer.appendChild(bar);

    const label = document.createElement("div");
    label.className = "attribution-label";
    label.textContent = `Agent ${attr.agent_percentage}% (${attr.agent_lines}/${attr.total_lines} lines)`;
    attrContainer.appendChild(label);

    container.appendChild(attrContainer);
  }

  // Summary
  if (sess.summary) {
    const summaryDiv = document.createElement("div");
    summaryDiv.style.marginTop = "8px";

    if (sess.summary.intent) {
      const intentBlock = document.createElement("div");
      intentBlock.className = "summary-text";
      intentBlock.style.marginBottom = "4px";
      intentBlock.innerHTML = `<strong>Intent:</strong> ${escapeHtml(sess.summary.intent)}`;
      summaryDiv.appendChild(intentBlock);
    }

    if (sess.summary.outcome) {
      const outcomeBlock = document.createElement("div");
      outcomeBlock.className = "summary-text";
      outcomeBlock.innerHTML = `<strong>Outcome:</strong> ${escapeHtml(sess.summary.outcome)}`;
      summaryDiv.appendChild(outcomeBlock);
    }

    container.appendChild(summaryDiv);
  }
}

function renderTask(task: TaskCheckpoint): HTMLElement {
  const div = document.createElement("div");
  div.className = "task-item";
  div.innerHTML = `
    <div><strong>Agent:</strong> <code>${escapeHtml(task.agent_id)}</code></div>
    <div style="font-size:11px;color:var(--vscode-descriptionForeground)">
      ${escapeHtml(task.tool_use_id)}
    </div>
  `;
  return div;
}

function section(title: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "detail-section";
  const h3 = document.createElement("h3");
  h3.textContent = title;
  div.appendChild(h3);
  return div;
}

function field(label: string, value: string, mono = false): HTMLElement {
  const div = document.createElement("div");
  div.className = "detail-field";
  div.innerHTML = `
    <span class="detail-label">${escapeHtml(label)}</span>
    <span class="detail-value${mono ? " mono" : ""}">${escapeHtml(value)}</span>
  `;
  return div;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function escapeHtml(s: string): string {
  const div = document.createElement("span");
  div.textContent = s;
  return div.innerHTML;
}
