import { execFile } from "child_process";

const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

/** Run an arbitrary command and return stdout. */
export function execCmd(
  cmd: string,
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: MAX_BUFFER }, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
}

export function execGit(
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`git ${args[0]} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Run git log with a custom format.
 * Returns raw stdout for the caller to parse.
 */
export function gitLog(cwd: string, maxCount = 200): Promise<string> {
  // Fields separated by \x00, records separated by \x01
  const format = [
    "%H",    // full hash
    "%h",    // abbreviated hash
    "%P",    // parent hashes (space-separated)
    "%an",   // author name
    "%ae",   // author email
    "%aI",   // author date ISO
    "%s",    // subject
    "%D",    // ref names
    "%(trailers:key=Entire-Checkpoint,valueonly,separator=%x20)",
    "%(trailers:key=Entire-Attribution,valueonly,separator=%x20)",
    "%(trailers:key=Entire-Session,valueonly,separator=%x20)",
    "%(trailers:key=Entire-Agent,valueonly,separator=%x20)",
  ].join("%x00");

  return execGit(
    [
      "log",
      `--format=${format}%x01`,
      "--all",
      "--not",
      "--glob=refs/heads/entire/*",
      `--max-count=${maxCount}`,
    ],
    cwd
  );
}

/**
 * Read a file from a specific git ref (e.g. orphan branch).
 */
export function gitShow(cwd: string, ref: string, path: string): Promise<string> {
  return execGit(["show", `${ref}:${path}`], cwd);
}

/**
 * List files/dirs matching a path pattern in a git tree.
 */
export function gitLsTree(cwd: string, ref: string, path: string): Promise<string> {
  return execGit(["ls-tree", "--name-only", ref, path], cwd);
}
