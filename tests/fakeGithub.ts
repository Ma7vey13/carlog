// In-memory stand-in for the part of the GitHub REST API the app uses (SPEC section 8).
// Behaves like the real one where it matters: an empty repository answers 409 to the Git Data API,
// a wrong token gets 401, and a non-fast-forward ref update gets 422.
// Used by unit tests (as `fetch`) and by Playwright (as a route handler).

import { createHash, randomBytes } from 'node:crypto';

interface Commit {
  tree: string;
  parents: string[];
  message: string;
}

export interface FakeResponse {
  status: number;
  body: unknown;
}

const json = (status: number, body: unknown): FakeResponse => ({ status, body });

export class FakeGitHub {
  readonly blobs = new Map<string, Uint8Array>();
  readonly trees = new Map<string, Map<string, string>>();
  readonly commits = new Map<string, Commit>();
  readonly refs = new Map<string, string>();
  /** Every request, for assertions (token is not recorded). */
  readonly log: Array<{ method: string; path: string }> = [];
  /** Lets a test sneak in another device's push right before a ref update. */
  beforeUpdateRef: (() => void) | null = null;

  constructor(
    readonly owner: string,
    readonly repo: string,
    public token: string,
    public isPrivate = true,
  ) {}

  private id(): string {
    return randomBytes(20).toString('hex');
  }

  private putBlob(bytes: Uint8Array): string {
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    this.blobs.set(sha, bytes);
    return sha;
  }

  /** Current files of a branch: path → bytes. */
  files(branch = 'main'): Map<string, Uint8Array> {
    const head = this.refs.get(branch);
    const out = new Map<string, Uint8Array>();
    if (!head) return out;
    for (const [path, sha] of this.trees.get(this.commits.get(head)!.tree)!) out.set(path, this.blobs.get(sha)!);
    return out;
  }

  /** Commits on a branch, newest first. */
  history(branch = 'main'): string[] {
    const out: string[] = [];
    let sha = this.refs.get(branch);
    while (sha) {
      const c = this.commits.get(sha)!;
      out.push(c.message);
      sha = c.parents[0];
    }
    return out;
  }

  handle(method: string, url: string, headers: Record<string, string | undefined>, bodyText: string | null): FakeResponse {
    const u = new URL(url, 'https://api.github.com');
    const prefix = `/repos/${this.owner}/${this.repo}`;
    this.log.push({ method, path: u.pathname });
    if ((headers.authorization ?? headers.Authorization) !== `Bearer ${this.token}`) return json(401, { message: 'Bad credentials' });
    if (!u.pathname.startsWith(prefix)) return json(404, { message: 'Not Found' });
    const path = u.pathname.slice(prefix.length);
    const body = bodyText ? (JSON.parse(bodyText) as Record<string, any>) : {};
    const empty = this.refs.size === 0;
    let m: RegExpExecArray | null;

    if (method === 'GET' && path === '') {
      return json(200, { private: this.isPrivate, default_branch: 'main', permissions: { push: true } });
    }
    if (method === 'GET' && (m = /^\/git\/ref\/heads\/(.+)$/.exec(path))) {
      if (empty) return json(409, { message: 'Git Repository is empty.' });
      const sha = this.refs.get(decodeURIComponent(m[1]!));
      return sha ? json(200, { object: { sha, type: 'commit' } }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = /^\/git\/commits\/(\w+)$/.exec(path))) {
      const c = this.commits.get(m[1]!);
      return c ? json(200, { sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message }) : json(404, {});
    }
    if (method === 'GET' && (m = /^\/git\/trees\/(\w+)$/.exec(path))) {
      const t = this.trees.get(m[1]!);
      if (!t) return json(404, {});
      const dirs = new Set<string>();
      for (const p of t.keys()) p.split('/').slice(0, -1).forEach((_, i, parts) => dirs.add(parts.slice(0, i + 1).join('/')));
      const tree = [...[...dirs].map((p) => ({ path: p, type: 'tree', sha: this.id() })), ...[...t].map(([p, sha]) => ({ path: p, type: 'blob', sha, mode: '100644' }))];
      return json(200, { sha: m[1], tree, truncated: false });
    }
    if (method === 'GET' && (m = /^\/git\/blobs\/(\w+)$/.exec(path))) {
      const b = this.blobs.get(m[1]!);
      return b ? json(200, { sha: m[1], content: Buffer.from(b).toString('base64'), encoding: 'base64' }) : json(404, {});
    }
    if (method === 'POST' && path === '/git/blobs') {
      if (empty) return json(409, { message: 'Git Repository is empty.' });
      return json(201, { sha: this.putBlob(new Uint8Array(Buffer.from(body.content as string, 'base64'))) });
    }
    if (method === 'POST' && path === '/git/trees') {
      if (empty) return json(409, { message: 'Git Repository is empty.' });
      const base = body.base_tree ? this.trees.get(body.base_tree as string) : new Map<string, string>();
      if (!base) return json(422, { message: 'base_tree not found' });
      const t = new Map(base);
      for (const e of body.tree as Array<{ path: string; sha: string }>) t.set(e.path, e.sha);
      const sha = this.id();
      this.trees.set(sha, t);
      return json(201, { sha });
    }
    if (method === 'POST' && path === '/git/commits') {
      if (empty) return json(409, { message: 'Git Repository is empty.' });
      const sha = this.id();
      this.commits.set(sha, { tree: body.tree as string, parents: body.parents as string[], message: body.message as string });
      return json(201, { sha });
    }
    if (method === 'PATCH' && (m = /^\/git\/refs\/heads\/(.+)$/.exec(path))) {
      this.beforeUpdateRef?.();
      this.beforeUpdateRef = null;
      const branch = decodeURIComponent(m[1]!);
      const current = this.refs.get(branch);
      const next = this.commits.get(body.sha as string);
      if (!current || !next) return json(422, { message: 'Reference does not exist' });
      if (!body.force && !next.parents.includes(current)) return json(422, { message: 'Update is not a fast forward' });
      this.refs.set(branch, body.sha as string);
      return json(200, { object: { sha: body.sha } });
    }
    if (method === 'PUT' && (m = /^\/contents\/(.+)$/.exec(path))) {
      const filePath = decodeURIComponent(m[1]!);
      const branch = (body.branch as string) || 'main';
      const head = this.refs.get(branch);
      if (head && this.trees.get(this.commits.get(head)!.tree)!.has(filePath)) return json(422, { message: '"sha" wasn\'t supplied.' });
      const blob = this.putBlob(new Uint8Array(Buffer.from(body.content as string, 'base64')));
      const t = new Map(head ? this.trees.get(this.commits.get(head)!.tree)! : []);
      t.set(filePath, blob);
      const tree = this.id();
      this.trees.set(tree, t);
      const commit = this.id();
      this.commits.set(commit, { tree, parents: head ? [head] : [], message: body.message as string });
      this.refs.set(branch, commit);
      return json(201, { content: { path: filePath, sha: blob }, commit: { sha: commit } });
    }
    return json(404, { message: `Fake GitHub: ${method} ${path} not implemented` });
  }

  /** A `fetch` for unit tests. */
  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const res = this.handle(init?.method ?? 'GET', url, headers, (init?.body as string | null) ?? null);
    return new Response(res.status === 204 ? null : JSON.stringify(res.body), { status: res.status, headers: { 'content-type': 'application/json' } });
  };
}
