import type { GitCommit } from "../src/types";

const ROW_HEIGHT = 28;
const LANE_WIDTH = 16;
const NODE_RADIUS = 4;
const PADDING_LEFT = 12;

const COLORS = [
  "var(--vscode-charts-blue, #2196f3)",
  "var(--vscode-charts-green, #4caf50)",
  "var(--vscode-charts-red, #f44336)",
  "var(--vscode-charts-yellow, #ff9800)",
  "var(--vscode-charts-purple, #9c27b0)",
  "var(--vscode-charts-orange, #ff5722)",
];

interface LaneInfo {
  lane: number;
  color: string;
}

export function renderGraph(container: HTMLElement, commits: GitCommit[]): void {
  if (commits.length === 0) return;

  // Build hash → index map
  const indexMap = new Map<string, number>();
  commits.forEach((c, i) => indexMap.set(c.hash, i));

  // Assign lanes to commits
  const lanes = assignLanes(commits, indexMap);

  const maxLane = Math.max(0, ...Array.from(lanes.values()).map((l) => l.lane));
  const svgWidth = PADDING_LEFT + (maxLane + 1) * LANE_WIDTH + PADDING_LEFT;
  const svgHeight = commits.length * ROW_HEIGHT;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", String(svgWidth));
  svg.setAttribute("height", String(svgHeight));
  svg.style.display = "block";

  // Draw edges first (behind nodes)
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const info = lanes.get(commit.hash);
    if (!info) continue;

    const cx = laneX(info.lane);
    const cy = rowY(i);

    for (const parentHash of commit.parents) {
      const parentIdx = indexMap.get(parentHash);
      if (parentIdx === undefined) continue;

      const parentInfo = lanes.get(parentHash);
      if (!parentInfo) continue;

      const px = laneX(parentInfo.lane);
      const py = rowY(parentIdx);

      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", edgePath(cx, cy, px, py));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", info.color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-opacity", "0.7");
      svg.appendChild(path);
    }
  }

  // Draw nodes
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const info = lanes.get(commit.hash);
    if (!info) continue;

    const cx = laneX(info.lane);
    const cy = rowY(i);
    const hasEntire = !!commit.entireCheckpointId;

    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", String(NODE_RADIUS));

    if (hasEntire) {
      circle.setAttribute("fill", info.color);
      circle.setAttribute("stroke", info.color);
    } else {
      circle.setAttribute("fill", "var(--vscode-editor-background, #1e1e1e)");
      circle.setAttribute("stroke", info.color);
    }
    circle.setAttribute("stroke-width", "2");
    svg.appendChild(circle);
  }

  container.appendChild(svg);
}

function assignLanes(
  commits: GitCommit[],
  indexMap: Map<string, number>
): Map<string, LaneInfo> {
  const result = new Map<string, LaneInfo>();
  // Track which lane is reserved by which "branch" (identified by the hash that started it)
  const activeLanes: (string | null)[] = [];
  let colorIdx = 0;

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];

    // Check if this commit continues an existing lane (is a parent of a previously seen commit)
    let assignedLane = -1;
    let assignedColor = "";

    // Find if any active lane points to this commit
    for (let l = 0; l < activeLanes.length; l++) {
      if (activeLanes[l] === commit.hash) {
        assignedLane = l;
        // Inherit color from the child that reserved this lane
        const existing = result.get(commit.hash);
        if (existing) {
          assignedColor = existing.color;
        }
        break;
      }
    }

    if (assignedLane === -1) {
      // New branch head — find first free lane
      assignedLane = activeLanes.indexOf(null);
      if (assignedLane === -1) {
        assignedLane = activeLanes.length;
        activeLanes.push(null);
      }
      assignedColor = COLORS[colorIdx % COLORS.length];
      colorIdx++;
    }

    if (!assignedColor) {
      assignedColor = COLORS[colorIdx % COLORS.length];
      colorIdx++;
    }

    result.set(commit.hash, { lane: assignedLane, color: assignedColor });

    // Update lane reservations for parents
    const parents = commit.parents.filter((p) => indexMap.has(p));

    if (parents.length === 0) {
      // Root commit — free the lane
      activeLanes[assignedLane] = null;
    } else {
      // First parent continues in the same lane
      activeLanes[assignedLane] = parents[0];
      if (!result.has(parents[0])) {
        result.set(parents[0], { lane: assignedLane, color: assignedColor });
      }

      // Additional parents (merges) get their own lanes
      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p];
        if (result.has(parentHash)) continue; // Already has a lane assigned

        // Find existing lane for this parent, or allocate new
        let parentLane = activeLanes.indexOf(parentHash);
        if (parentLane === -1) {
          parentLane = activeLanes.indexOf(null);
          if (parentLane === -1) {
            parentLane = activeLanes.length;
            activeLanes.push(null);
          }
          activeLanes[parentLane] = parentHash;
        }

        const pColor = COLORS[colorIdx % COLORS.length];
        colorIdx++;
        result.set(parentHash, { lane: parentLane, color: pColor });
      }
    }
  }

  return result;
}

function laneX(lane: number): number {
  return PADDING_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
}

function rowY(index: number): number {
  return index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) {
    // Straight vertical line
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  // Curved path for branch/merge
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}
