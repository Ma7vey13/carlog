// Minimal GitHub REST client for carlog-data (SPEC section 8): Git Data API for one-commit pushes,
// Contents API only for the very first file of an empty repository (DECISIONS D-008).
// The token goes only into the Authorization header — never into URLs, logs or error texts.

import { base64ToBytes, bytesToBase64 } from '../core/crypto';

export const API = 'https://api.github.com';

export type GitHubErrorKind = 'auth' | 'forbidden' | 'not_found' | 'empty' | 'conflict' | 'rate' | 'network' | 'other';

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<GitHubErrorKind, string> = {
  auth: 'Токен истёк или неверен',
  forbidden: 'У токена нет доступа к репозиторию данных (нужны права Contents: Read and write)',
  not_found: 'Репозиторий не найден или токен к нему не допущен',
  empty: 'Репозиторий данных пуст',
  conflict: 'Данные на GitHub изменились во время отправки',
  rate: 'GitHub временно ограничил число запросов — попробуйте через несколько минут',
  network: 'Нет связи с GitHub',
  other: 'GitHub ответил ошибкой',
};

export interface RepoInfo {
  private: boolean;
  canPush: boolean;
  defaultBranch: string;
}

export interface TreeEntry {
  path: string;
  sha: string;
  type: 'blob' | 'tree' | 'commit';
}

export type FetchFn = typeof fetch;

export class GitHub {
  constructor(
    readonly owner: string,
    readonly repo: string,
    private readonly token: string,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${API}/repos/${this.owner}/${this.repo}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : null,
        cache: 'no-store',
      });
    } catch {
      throw new GitHubError('network', 0, MESSAGES.network);
    }
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

    const kind: GitHubErrorKind =
      res.status === 401
        ? 'auth'
        : res.status === 403 || res.status === 429
          ? res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429
            ? 'rate'
            : 'forbidden'
          : res.status === 404
            ? 'not_found'
            : res.status === 409
              ? 'empty'
              : res.status === 422
                ? 'conflict'
                : 'other';
    throw new GitHubError(kind, res.status, `${MESSAGES[kind]} (код ${res.status})`);
  }

  async repoInfo(): Promise<RepoInfo> {
    const r = await this.call<{ private: boolean; default_branch: string; permissions?: { push?: boolean } }>('GET', '');
    return { private: r.private, canPush: r.permissions?.push ?? false, defaultBranch: r.default_branch || 'main' };
  }

  /** Commit sha the branch points to; null for an empty repository. */
  async head(branch: string): Promise<string | null> {
    try {
      const r = await this.call<{ object: { sha: string } }>('GET', `/git/ref/heads/${encodeURIComponent(branch)}`);
      return r.object.sha;
    } catch (err) {
      if (err instanceof GitHubError && (err.kind === 'empty' || err.kind === 'not_found')) return null;
      throw err;
    }
  }

  async commitTree(commitSha: string): Promise<string> {
    return (await this.call<{ tree: { sha: string } }>('GET', `/git/commits/${commitSha}`)).tree.sha;
  }

  async tree(treeSha: string): Promise<TreeEntry[]> {
    const r = await this.call<{ tree: TreeEntry[]; truncated?: boolean }>('GET', `/git/trees/${treeSha}?recursive=1`);
    return r.tree;
  }

  async blob(sha: string): Promise<Uint8Array> {
    const r = await this.call<{ content: string; encoding: string }>('GET', `/git/blobs/${sha}`);
    return base64ToBytes(r.content);
  }

  async createBlob(bytes: Uint8Array): Promise<string> {
    return (await this.call<{ sha: string }>('POST', '/git/blobs', { content: bytesToBase64(bytes), encoding: 'base64' })).sha;
  }

  async createTree(baseTree: string | null, entries: Array<{ path: string; sha: string }>): Promise<string> {
    const body = {
      ...(baseTree ? { base_tree: baseTree } : {}),
      tree: entries.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: e.sha })),
    };
    return (await this.call<{ sha: string }>('POST', '/git/trees', body)).sha;
  }

  async createCommit(message: string, tree: string, parents: string[]): Promise<string> {
    return (await this.call<{ sha: string }>('POST', '/git/commits', { message, tree, parents })).sha;
  }

  /** Fast-forward only; a GitHubError 'conflict' means another device pushed first. */
  async updateRef(branch: string, sha: string): Promise<void> {
    await this.call('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false });
  }

  /** Creates a file with the Contents API — works on an empty repository (creates the branch). */
  async createFile(path: string, bytes: Uint8Array, message: string, branch: string): Promise<string> {
    const r = await this.call<{ commit: { sha: string } }>('PUT', `/contents/${path}`, { message, content: bytesToBase64(bytes), branch });
    return r.commit.sha;
  }
}

/** "Ma7vey13/carlog-data" or a github.com URL → owner and repo. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(input.trim());
  return m ? { owner: m[1]!, repo: m[2]! } : null;
}

/** Fine-grained tokens start with github_pat_; classic ones with ghp_. */
export function looksLikeToken(token: string): boolean {
  return /^(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,})$/.test(token.trim());
}
