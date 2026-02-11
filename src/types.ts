// ── Git Data ──

export interface GitCommit {
  hash: string;
  abbreviatedHash: string;
  parents: string[];
  author: string;
  authorEmail: string;
  date: string; // ISO 8601
  subject: string;
  /** Refs like branch names, tags */
  refs: string[];
  /** Entire trailers parsed from commit */
  entireCheckpointId?: string;
  entireAttribution?: string;
  entireSessionId?: string;
  entireAgent?: string;
}

// ── Entire Data ──

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface Attribution {
  agent_percentage: number;
  human_percentage: number;
  agent_lines: number;
  total_lines: number;
}

export interface SessionSummary {
  intent: string;
  outcome: string;
}

/** Root metadata from the orphan branch */
export interface RootCheckpointMetadata {
  cli_version: string;
  checkpoint_id: string;
  strategy: string;
  branch: string;
  checkpoints_count: number;
  files_touched: string[] | null;
  sessions: Array<{
    metadata: string;
    transcript: string;
    context: string;
    content_hash: string;
    prompt: string;
  }>;
}

/** Per-session metadata from the orphan branch */
export interface SessionMetadata {
  cli_version: string;
  checkpoint_id: string;
  session_id: string;
  strategy: string;
  created_at: string;
  branch: string;
  checkpoints_count: number;
  files_touched: string[] | null;
  agent: string;
  is_task: boolean;
  tool_use_id?: string;
  token_usage?: TokenUsage;
  initial_attribution?: Attribution;
  summary?: SessionSummary;
}

export interface TaskCheckpoint {
  session_id: string;
  tool_use_id: string;
  checkpoint_uuid: string;
  agent_id: string;
}

/** Combined checkpoint data for display */
export interface EntireCheckpoint {
  checkpoint_id: string;
  strategy: string;
  branch: string;
  sessions: SessionMetadata[];
  tasks: TaskCheckpoint[];
}

export interface ActiveSession {
  session_id: string;
  agent_type: string;
  first_prompt: string;
  transcript_path: string;
  started_at: string;
  ended_at?: string;
  phase: string;
  checkpoint_count: number;
}

// ── Commit Detail (combined git + entire) ──

export interface CommitDetail {
  commit: GitCommit;
  checkpoint?: EntireCheckpoint;
}

// ── Message Protocol (webview ↔ host) ──

export type WebviewMessage =
  | { type: "requestDetail"; hash: string }
  | { type: "refresh" };

export type HostMessage =
  | { type: "initialData"; commits: GitCommit[]; activeSessions: ActiveSession[] }
  | { type: "commitDetail"; detail: CommitDetail }
  | { type: "activeSessions"; sessions: ActiveSession[] }
  | { type: "error"; message: string };
