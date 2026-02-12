import * as fs from "fs";
import * as path from "path";
import { execCmd, execGit, gitLog, gitShow, gitLsTree } from "./gitReader";
import type {
  GitCommit,
  ActiveSession,
  CommitDetail,
  EntireCheckpoint,
  EntireRepoInfo,
  EntireStatus,
  RootCheckpointMetadata,
  SessionGroup,
  SessionMetadata,
  TaskCheckpoint,
} from "./types";

const ORPHAN_REF = "entire/checkpoints/v1";

export class DataProvider {
  constructor(private cwd: string) {}

  /** Check if the entire CLI is installed. */
  async isCliInstalled(): Promise<boolean> {
    try {
      await execCmd("entire", ["--version"], this.cwd);
      return true;
    } catch {
      return false;
    }
  }

  /** Check if the repo has Entire enabled. */
  isRepoEnabled(): boolean {
    return fs.existsSync(path.join(this.cwd, ".entire", "settings.json"));
  }

  /** Check if the orphan branch exists. */
  async hasCheckpointBranch(): Promise<boolean> {
    try {
      await execGit(["rev-parse", "--verify", ORPHAN_REF], this.cwd);
      return true;
    } catch {
      return false;
    }
  }

  /** Determine the overall Entire status for this repo. */
  async getStatus(): Promise<EntireStatus> {
    if (!this.isRepoEnabled()) {
      return { state: "not-enabled" };
    }
    if (!(await this.hasCheckpointBranch())) {
      return { state: "no-checkpoints" };
    }
    return { state: "ready" };
  }

  /** Read repo-level Entire info from settings. */
  getRepoInfo(): EntireRepoInfo | undefined {
    try {
      const settingsPath = path.join(this.cwd, ".entire", "settings.json");
      const raw = fs.readFileSync(settingsPath, "utf-8");
      const data = JSON.parse(raw);
      return {
        strategy: data.strategy ?? "unknown",
        cliVersion: data.cli_version ?? "unknown",
      };
    } catch {
      return undefined;
    }
  }

  /** Parse git log output into structured commits. */
  async getCommits(maxCount = 200): Promise<GitCommit[]> {
    const raw = await gitLog(this.cwd, maxCount);
    const records = raw.split("\x01").filter((r) => r.trim());

    return records.map((record) => {
      const fields = record.trim().split("\x00");
      const [
        hash,
        abbreviatedHash,
        parentStr,
        author,
        authorEmail,
        date,
        subject,
        refStr,
        checkpointTrailer,
        attributionTrailer,
        sessionTrailer,
        agentTrailer,
      ] = fields;

      const parents = parentStr ? parentStr.split(" ").filter(Boolean) : [];
      const refs = refStr
        ? refStr.split(",").map((r) => r.trim()).filter(Boolean)
        : [];

      return {
        hash,
        abbreviatedHash,
        parents,
        author,
        authorEmail,
        date,
        subject,
        refs,
        entireCheckpointId: checkpointTrailer?.trim() || undefined,
        entireAttribution: attributionTrailer?.trim() || undefined,
        entireSessionId: sessionTrailer?.trim() || undefined,
        entireAgent: agentTrailer?.trim() || undefined,
      };
    });
  }

  /**
   * Group Entire-annotated commits by session ID.
   *
   * Code commits have Entire-Checkpoint but NOT Entire-Session.
   * The session_id lives in the orphan branch metadata.
   * We enrich each code commit with its session_id from the metadata.
   */
  async getSessions(maxCount = 200): Promise<SessionGroup[]> {
    const commits = await this.getCommits(maxCount);
    const entireCommits = commits.filter((c) => c.entireCheckpointId);

    // Enrich commits with session_id from orphan branch metadata
    for (const commit of entireCommits) {
      if (commit.entireSessionId) continue; // already has session info
      try {
        const cpId = commit.entireCheckpointId!;
        const shard = cpId.slice(0, 2);
        const rest = cpId.slice(2);
        const rootRaw = await gitShow(
          this.cwd,
          ORPHAN_REF,
          `${shard}/${rest}/metadata.json`
        );
        const root: RootCheckpointMetadata = JSON.parse(rootRaw);

        // Read first session metadata to get session_id and agent
        if (root.sessions.length > 0) {
          const metaPath = root.sessions[0].metadata.replace(/^\//, "");
          const sessRaw = await gitShow(this.cwd, ORPHAN_REF, metaPath);
          const sessMeta: SessionMetadata = JSON.parse(sessRaw);
          commit.entireSessionId = sessMeta.session_id;
          commit.entireAgent = commit.entireAgent || sessMeta.agent;
        }
      } catch {
        // Skip if metadata unavailable
      }
    }

    // Group by session_id
    const groupMap = new Map<string, GitCommit[]>();
    for (const commit of entireCommits) {
      const sid = commit.entireSessionId ?? `unknown-${commit.hash}`;
      const group = groupMap.get(sid) ?? [];
      group.push(commit);
      groupMap.set(sid, group);
    }

    const sessions: SessionGroup[] = [];
    for (const [sessionId, checkpoints] of groupMap) {
      const agent = checkpoints[0].entireAgent ?? "AI";
      const dates = checkpoints.map((c) => new Date(c.date).getTime());
      sessions.push({
        sessionId,
        agent,
        checkpoints,
        startedAt: new Date(Math.min(...dates)).toISOString(),
        lastActivityAt: new Date(Math.max(...dates)).toISOString(),
      });
    }

    // Sort sessions by most recent activity first
    sessions.sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime()
    );

    return sessions;
  }

  /** Load full detail for a checkpoint. */
  async getCommitDetailByCheckpoint(checkpointId: string): Promise<CommitDetail> {
    const commits = await this.getCommits();
    const commit = commits.find((c) => c.entireCheckpointId === checkpointId);
    if (!commit) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    let checkpoint: EntireCheckpoint | undefined;
    try {
      checkpoint = await this.getCheckpointDetail(checkpointId);
    } catch {
      // Checkpoint data may not be available
    }

    return { commit, checkpoint };
  }

  /** Read checkpoint metadata from the orphan branch. */
  async getCheckpointDetail(checkpointId: string): Promise<EntireCheckpoint> {
    const shard = checkpointId.slice(0, 2);
    const rest = checkpointId.slice(2);
    const basePath = `${shard}/${rest}`;

    // Read root metadata
    const rootRaw = await gitShow(this.cwd, ORPHAN_REF, `${basePath}/metadata.json`);
    const root: RootCheckpointMetadata = JSON.parse(rootRaw);

    // Read session metadata for each session
    const sessions: SessionMetadata[] = [];
    for (const sess of root.sessions) {
      try {
        // metadata path starts with /, strip it
        const metaPath = sess.metadata.startsWith("/")
          ? sess.metadata.slice(1)
          : sess.metadata;
        const sessRaw = await gitShow(this.cwd, ORPHAN_REF, metaPath);
        sessions.push(JSON.parse(sessRaw));
      } catch {
        // Skip unreadable sessions
      }
    }

    // Read task checkpoints
    const tasks = await this.getTaskCheckpoints(checkpointId);

    return {
      checkpoint_id: root.checkpoint_id,
      strategy: root.strategy,
      branch: root.branch,
      sessions,
      tasks,
    };
  }

  /** Discover and read task checkpoint files. */
  private async getTaskCheckpoints(checkpointId: string): Promise<TaskCheckpoint[]> {
    const shard = checkpointId.slice(0, 2);
    const rest = checkpointId.slice(2);
    const tasksPath = `${shard}/${rest}/tasks`;

    try {
      const lsOutput = await gitLsTree(this.cwd, ORPHAN_REF, `${tasksPath}/`);
      const taskDirs = lsOutput.trim().split("\n").filter(Boolean);

      const tasks: TaskCheckpoint[] = [];
      for (const dir of taskDirs) {
        // dir is like "3a/96b1501cdd/tasks/toolu_xxx"
        const dirName = dir.trim();
        try {
          const raw = await gitShow(
            this.cwd,
            ORPHAN_REF,
            `${dirName}/checkpoint.json`
          );
          tasks.push(JSON.parse(raw));
        } catch {
          // Skip unreadable tasks
        }
      }
      return tasks;
    } catch {
      return [];
    }
  }

  /** Read active sessions from .git/entire-sessions/. */
  async getActiveSessions(): Promise<ActiveSession[]> {
    const sessionsDir = path.join(this.cwd, ".git", "entire-sessions");

    try {
      const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
      const sessions: ActiveSession[] = [];

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(sessionsDir, file), "utf-8");
          const data = JSON.parse(raw);
          // Only include active (non-ended) sessions
          if (data.phase !== "ended") {
            sessions.push({
              session_id: data.session_id,
              agent_type: data.agent_type,
              first_prompt: data.first_prompt || "",
              transcript_path: data.transcript_path || "",
              started_at: data.started_at,
              ended_at: data.ended_at,
              phase: data.phase,
              checkpoint_count: data.checkpoint_count ?? 0,
            });
          }
        } catch {
          // Skip unreadable session files
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }
}
