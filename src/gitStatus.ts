import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SavedWorkspace } from './types';

export interface GitInfo {
  branch: string;
  dirty: boolean;
  remoteUrl?: string;
}

interface CachedEntry {
  value: GitInfo | null;
  fetchedAt: number;
  inFlight?: Promise<GitInfo | null>;
}

const TTL_MS = 30_000;

/**
 * Asynchronous, memoized reader for git branch + dirty status of each saved
 * workspace. Reads are fire-and-forget; the cache emits a change event once a
 * background read finishes so the tree view can rerender with the fresh info.
 */
export class GitStatusCache implements vscode.Disposable {
  private readonly cache = new Map<string, CachedEntry>();
  private readonly watchers = new Map<string, fs.FSWatcher>();
  // Debounce timers are kept on the instance (not in the watcher closure)
  // so that `dispose()` and `invalidate()` can cancel them. A timer that
  // fires after dispose would otherwise call `fire()` on a disposed
  // EventEmitter; one that fires after a fresh refresh would wipe the
  // freshly cached entry.
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private disposed = false;

  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  /**
   * Returns the cached info for an entry if it is fresh, otherwise starts a
   * background refresh and returns the stale value (or null). The caller is
   * expected to subscribe to `onDidChange` to rerender when the read lands.
   */
  public get(entry: SavedWorkspace): GitInfo | null {
    const key = entry.path;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.fetchedAt < TTL_MS) {
      return cached.value;
    }
    if (!cached?.inFlight) {
      this.refresh(entry).catch(() => undefined);
    }
    return cached?.value ?? null;
  }

  public invalidate(pathOrNothing?: string): void {
    if (pathOrNothing) {
      this.cache.delete(pathOrNothing);
      const w = this.watchers.get(pathOrNothing);
      if (w) {
        w.close();
        this.watchers.delete(pathOrNothing);
      }
      this.clearDebounceTimer(pathOrNothing);
    } else {
      this.cache.clear();
      for (const w of this.watchers.values()) {
        w.close();
      }
      this.watchers.clear();
      for (const t of this.debounceTimers.values()) {
        clearTimeout(t);
      }
      this.debounceTimers.clear();
    }
    this.onDidChangeEmitter.fire();
  }

  private clearDebounceTimer(entryKey: string): void {
    const t = this.debounceTimers.get(entryKey);
    if (t) {
      clearTimeout(t);
      this.debounceTimers.delete(entryKey);
    }
  }

  public async refresh(entry: SavedWorkspace): Promise<GitInfo | null> {
    const key = entry.path;
    const existing = this.cache.get(key);
    if (existing?.inFlight) {
      return existing.inFlight;
    }
    const promise = this.read(entry).then(
      (value) => {
        this.cache.set(key, { value, fetchedAt: Date.now() });
        this.onDidChangeEmitter.fire();
        return value;
      },
      () => {
        this.cache.set(key, { value: null, fetchedAt: Date.now() });
        this.onDidChangeEmitter.fire();
        return null;
      }
    );
    this.cache.set(key, {
      value: existing?.value ?? null,
      fetchedAt: existing?.fetchedAt ?? 0,
      inFlight: promise
    });
    return promise;
  }

  private async read(entry: SavedWorkspace): Promise<GitInfo | null> {
    const repoDir = resolveRepoDir(entry);
    if (!repoDir) {
      return null;
    }
    const gitDir = await resolveGitDir(repoDir);
    if (!gitDir) {
      return null;
    }
    // Branch detection is done by reading `<gitdir>/HEAD` directly, not by
    // shelling out. This avoids PATH issues with the bundled `git` CLI on
    // some platforms (extension host on Windows frequently starts with a
    // different PATH than the user's terminal) and is faster than spawning
    // a subprocess. The `git` CLI is still used for dirty state and remote
    // URL resolution, where it is acceptable to degrade to "no info" on
    // failure.
    const [headParsed, dirty, rawRemote] = await Promise.all([
      readHead(gitDir),
      runGit(['status', '--porcelain'], repoDir),
      readRemoteUrl(gitDir)
    ]);
    if (!headParsed) {
      return null;
    }
    this.ensureHeadWatcher(entry.path, gitDir);
    return {
      branch: headParsed,
      dirty: (dirty ?? '').trim().length > 0,
      remoteUrl: rawRemote ?? undefined
    };
  }

  /**
   * Sets up a filesystem watch on `<repoDir>/.git/HEAD` so the cache is
   * invalidated as soon as the user switches branches via the CLI (or any
   * other tool). Multiple watchers per entry are deduplicated. Best-effort:
   * if the watch fails (e.g. worktree gitdir file indirection, non-standard
   * layout), we silently fall back to the TTL-based refresh.
   */
  private ensureHeadWatcher(entryKey: string, gitDir: string): void {
    if (this.watchers.has(entryKey)) {
      return;
    }
    const headPath = path.join(gitDir, 'HEAD');
    try {
      if (!fs.existsSync(headPath)) {
        return;
      }
      // Debounce: rebases, pulls and multi-step checkouts can write HEAD
      // several times in quick succession (including momentarily detached
      // states). Wait until the filesystem settles before re-reading so we
      // don't cache a transient SHA as the current branch.
      const watcher = fs.watch(headPath, { persistent: false }, () => {
        this.clearDebounceTimer(entryKey);
        if (this.disposed) {
          return;
        }
        this.debounceTimers.set(
          entryKey,
          setTimeout(() => {
            this.debounceTimers.delete(entryKey);
            if (this.disposed) {
              return;
            }
            this.cache.delete(entryKey);
            this.onDidChangeEmitter.fire();
          }, 500)
        );
      });
      watcher.on('error', () => {
        this.clearDebounceTimer(entryKey);
        watcher.close();
        this.watchers.delete(entryKey);
      });
      this.watchers.set(entryKey, watcher);
    } catch {
      // Best-effort; fall back to TTL refresh.
    }
  }

  public dispose(): void {
    this.disposed = true;
    for (const w of this.watchers.values()) {
      w.close();
    }
    this.watchers.clear();
    for (const t of this.debounceTimers.values()) {
      clearTimeout(t);
    }
    this.debounceTimers.clear();
    this.onDidChangeEmitter.dispose();
  }
}

function resolveRepoDir(entry: SavedWorkspace): string | null {
  if (entry.kind === 'folder') {
    return entry.path;
  }
  return path.dirname(entry.path);
}

/**
 * Walks up from `dir` looking for a `.git` entry, then resolves it to the
 * real git directory. `.git` may be either a directory (normal repo) or a
 * file containing `gitdir: <path>` (linked worktrees, submodules). The
 * returned path is absolute and has `HEAD`, `config`, etc. at its root.
 */
async function resolveGitDir(dir: string): Promise<string | null> {
  let current = dir;
  for (let i = 0; i < 20; i++) {
    const gitPath = path.join(current, '.git');
    try {
      const stat = await fs.promises.stat(gitPath);
      if (stat.isDirectory()) {
        return gitPath;
      }
      if (stat.isFile()) {
        const content = await fs.promises.readFile(gitPath, 'utf8');
        const match = /^gitdir:\s*(.+)$/m.exec(content);
        if (match) {
          const target = match[1].trim();
          return path.isAbsolute(target) ? target : path.resolve(current, target);
        }
        return null;
      }
    } catch {
      // Not present here; walk up.
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return null;
}

/**
 * For a linked worktree, `<gitDir>/commondir` contains the relative path to
 * the main repository's git directory (where `config`, `refs/heads`, etc.
 * live). For a normal repository the file is absent and the git directory
 * is already the common directory. Returns an absolute path.
 */
async function resolveCommonDir(gitDir: string): Promise<string> {
  try {
    const raw = (await fs.promises.readFile(path.join(gitDir, 'commondir'), 'utf8')).trim();
    if (raw.length === 0) {
      return gitDir;
    }
    return path.isAbsolute(raw) ? raw : path.resolve(gitDir, raw);
  } catch {
    return gitDir;
  }
}

/**
 * Reads `<gitDir>/HEAD` and returns a human-readable label for the current
 * checkout. For a branch, returns the branch name (e.g. `main`). For a
 * detached HEAD (raw SHA), returns `@<short-sha>`. Returns null only if the
 * file cannot be read or is malformed — i.e. we never return the literal
 * string `HEAD` anymore.
 */
async function readHead(gitDir: string): Promise<string | null> {
  try {
    const raw = (await fs.promises.readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();
    const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(raw);
    if (ref) {
      return ref[1].trim();
    }
    const sha = /^([0-9a-f]{7,40})$/i.exec(raw);
    if (sha) {
      return `@${sha[1].slice(0, 7)}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads the URL of the preferred remote (`origin`, else the first defined
 * remote) by parsing `<commonDir>/config` directly. This is independent of
 * the `git` CLI on PATH, mirroring the file-based HEAD reader. Falls back to
 * `null` on any parse or IO error (no remote info shown in the tooltip).
 *
 * For linked worktrees, `gitDir` points at `<main>/.git/worktrees/<name>`
 * which does NOT contain a `config` file — the config with `[remote ...]`
 * sections lives in the main repository. The `commondir` file inside a
 * worktree gitdir points to that common directory.
 */
async function readRemoteUrl(gitDir: string): Promise<string | null> {
  const commonDir = await resolveCommonDir(gitDir);
  let content: string;
  try {
    content = await fs.promises.readFile(path.join(commonDir, 'config'), 'utf8');
  } catch {
    return null;
  }
  // Walk the git-config INI, tracking the current section. Section headers
  // look like `[remote "origin"]`. Lines like `\turl = https://...` belong
  // to the last seen section. We capture `origin` first, else the first
  // remote we encounter, so `origin` takes precedence when present.
  const remotes = new Map<string, string>();
  let firstRemoteName: string | null = null;
  let currentRemote: string | null = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }
    const sectionMatch = /^\[([^\]"]+)(?:\s+"([^"]*)")?\]$/.exec(line);
    if (sectionMatch) {
      if (sectionMatch[1] === 'remote' && sectionMatch[2]) {
        currentRemote = sectionMatch[2];
        if (firstRemoteName === null) {
          firstRemoteName = currentRemote;
        }
      } else {
        currentRemote = null;
      }
      continue;
    }
    if (currentRemote === null) {
      continue;
    }
    const kv = /^url\s*=\s*(.+)$/.exec(line);
    if (kv && !remotes.has(currentRemote)) {
      remotes.set(currentRemote, kv[1].trim());
    }
  }
  const preferred = remotes.get('origin') ?? (firstRemoteName ? remotes.get(firstRemoteName) : undefined);
  return preferred ? toHttpUrl(preferred) : null;
}

/**
 * Normalizes common SSH remote forms (`git@host:org/repo.git`,
 * `ssh://git@host/org/repo.git`) into browsable `https://` URLs and strips
 * trailing `.git`. Returns the original string if it does not look like a
 * supported remote form.
 */
function toHttpUrl(raw: string): string {
  let url = raw;
  // Negative lookahead (?!\w+:\/\/) avoids matching ssh:// URLs with a port
  // like `ssh://git@github.com:22/org/repo.git`, which otherwise parse as
  // SCP-like and produce `https://github.com/22/org/repo`.
  const scpLike = /^(?!\w+:\/\/)([^@]+)@([^:]+):(.+)$/.exec(url);
  if (scpLike) {
    url = `https://${scpLike[2]}/${scpLike[3]}`;
  } else if (url.startsWith('ssh://')) {
    const rest = url.slice('ssh://'.length);
    const atIdx = rest.indexOf('@');
    const hostPath = atIdx >= 0 ? rest.slice(atIdx + 1) : rest;
    // Strip an optional SSH port (e.g. github.com:22/org/repo → github.com/org/repo)
    // so the resulting https:// URL is browsable.
    const withoutPort = hostPath.replace(/^([^/:]+):\d+(\/.*)$/, '$1$2');
    url = `https://${withoutPort}`;
  } else if (url.startsWith('git://')) {
    url = 'https://' + url.slice('git://'.length);
  }
  if (url.endsWith('.git')) {
    url = url.slice(0, -'.git'.length);
  }
  return url;
}

function runGit(args: string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    exec(`git ${args.map(shellQuote).join(' ')}`, { cwd, timeout: 2_000 }, (err, stdout) => {
      if (err) {
        resolve(null);
      } else {
        resolve(stdout);
      }
    });
  });
}

function shellQuote(arg: string): string {
  if (/^[a-zA-Z0-9_\-./]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
