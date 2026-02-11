import * as fs from "fs";
import * as path from "path";
import { gitLog, gitShow, gitLsTree } from "./gitReader";
import type {
  GitCommit,
  ActiveSession,
  CommitDetail,
  EntireCheckpoint,
  RootCheckpointMetadata,
  SessionMetadata,
  TaskCheckpoint,
} from "./types";

const ORPHAN_REF = "entire/checkpoints/v1";

export class DataProvider {
  constructor(private cwd: string) {}

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

  /** Load full detail for a commit, including Entire checkpoint if present. */
  async getCommitDetail(hash: string): Promise<CommitDetail> {
    const commits = await this.getCommits();
    const commit = commits.find((c) => c.hash === hash || c.abbreviatedHash === hash);
    if (!commit) {
      throw new Error(`Commit ${hash} not found`);
    }

    let checkpoint: EntireCheckpoint | undefined;
    if (commit.entireCheckpointId) {
      try {
        checkpoint = await this.getCheckpointDetail(commit.entireCheckpointId);
      } catch {
        // Checkpoint data may not be available
      }
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
