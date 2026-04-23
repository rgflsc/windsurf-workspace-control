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
    } else {
      this.cache.clear();
    }
    this.onDidChangeEmitter.fire();
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
    if (!hasGitDir(repoDir)) {
      return null;
    }
    const [branch, dirty, rawRemote] = await Promise.all([
      runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir),
      runGit(['status', '--porcelain'], repoDir),
      readRemoteUrl(repoDir)
    ]);
    if (branch === null) {
      return null;
    }
    return {
      branch: branch.trim() || 'HEAD',
      dirty: (dirty ?? '').trim().length > 0,
      remoteUrl: rawRemote ?? undefined
    };
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

function resolveRepoDir(entry: SavedWorkspace): string | null {
  if (entry.kind === 'folder') {
    return entry.path;
  }
  return path.dirname(entry.path);
}

function hasGitDir(dir: string): boolean {
  let current = dir;
  for (let i = 0; i < 20; i++) {
    try {
      const gitPath = path.join(current, '.git');
      if (fs.existsSync(gitPath)) {
        return true;
      }
    } catch {
      return false;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
  return false;
}

/**
 * Reads the URL of the preferred remote (`origin`, else the first defined
 * remote). Asks git first so submodules and worktrees resolve correctly; falls
 * back to reading `.git/config` directly for repos where the `git` CLI is not
 * on PATH.
 */
async function readRemoteUrl(repoDir: string): Promise<string | null> {
  const origin = await runGit(['remote', 'get-url', 'origin'], repoDir);
  if (origin !== null) {
    const trimmed = origin.trim();
    if (trimmed.length > 0) {
      return toHttpUrl(trimmed);
    }
  }
  const firstRemote = await runGit(['remote'], repoDir);
  if (firstRemote !== null) {
    const name = firstRemote.trim().split(/\s+/).find((n) => n.length > 0);
    if (name) {
      const url = await runGit(['remote', 'get-url', name], repoDir);
      if (url !== null && url.trim().length > 0) {
        return toHttpUrl(url.trim());
      }
    }
  }
  return null;
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
    url = `https://${hostPath}`;
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
