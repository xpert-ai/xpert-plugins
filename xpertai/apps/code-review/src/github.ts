import { z } from 'zod/v3'
import { fileSchema, ReviewError, shaSchema, type PullRef, type Snapshot, type Finding } from './domain.js'

const person = z.object({ login: z.string() })
const pull = z.object({ title: z.string(), body: z.string().nullable(), html_url: z.string(), state: z.string(), user: person,
  base: z.object({ sha: shaSchema }), head: z.object({ sha: shaSchema }), changed_files: z.number() })
const comment = z.object({ id: z.number(), body: z.string(), html_url: z.string(), user: person })
const check = z.object({ id: z.number(), name: z.string(), status: z.string(), conclusion: z.string().nullable(), html_url: z.string().nullable() })
const issue = z.object({ number: z.number(), title: z.string(), html_url: z.string(), state: z.string(), user: person })
export class GitHub {
  constructor(private readonly token?: string, private readonly transport: typeof fetch = fetch) {}
  async request(path: string, body?: object): Promise<unknown> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new ReviewError('invalid_github_path')
    const response = await this.transport(`https://api.github.com${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Xpert-Code-Review', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    if (!response.ok) throw new ReviewError(response.status === 404 ? 'pull_request_not_found' : response.status === 401 ? 'github_auth_required' : response.status === 403 || response.status === 429 ? 'github_access_or_rate_limit' : 'github_request_failed')
    return response.json()
  }
  private path(ref: PullRef) { return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}` }
  async inbox(filter: 'requested' | 'authored', page: number) {
    if (!this.token) throw new ReviewError('github_auth_required')
    const user = person.parse(await this.request('/user'))
    const qualifier = filter === 'authored' ? `author:${user.login}` : `review-requested:${user.login}`
    const data = z.object({ total_count: z.number(), items: z.array(issue) }).parse(await this.request(`/search/issues?q=${encodeURIComponent(`is:pr is:open ${qualifier}`)}&sort=updated&per_page=20&page=${page}`))
    return { items: data.items.map(p => ({ number: p.number, title: p.title, url: p.html_url, author: p.user.login })), total: data.total_count, page, pageSize: 20 }
  }
  async head(ref: PullRef) { return pull.parse(await this.request(`${this.path(ref)}/pulls/${ref.number}`)).head.sha }
  async state(ref: PullRef) {
    return z.object({ state: z.string(), draft: z.boolean(), head: z.object({ sha: shaSchema }),
      base: z.object({ ref: z.string() }), user: z.object({ type: z.string() }) })
      .parse(await this.request(`${this.path(ref)}/pulls/${ref.number}`))
  }
  async source(ref: PullRef, sha: string, path: string) {
    shaSchema.parse(sha)
    if (path.startsWith('/') || path.split('/').some(s => !s || s === '.' || s === '..') || path.includes('\\')) throw new ReviewError('invalid_file')
    const file = z.object({ type: z.literal('file'), encoding: z.literal('base64'), size: z.number().max(1024 * 1024), content: z.string() })
      .parse(await this.request(`${this.path(ref)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`))
    const content = Buffer.from(file.content, 'base64').toString('utf8')
    if (content.includes('\u0000')) throw new ReviewError('binary_file')
    return content
  }
  async snapshot(ref: PullRef): Promise<Snapshot> {
    const base = this.path(ref), pr = pull.parse(await this.request(`${base}/pulls/${ref.number}`))
    const files: Snapshot['files'] = []
    for (let page = 1; page <= 30; page++) {
      const batch = z.array(fileSchema).parse(await this.request(`${base}/pulls/${ref.number}/files?per_page=100&page=${page}`))
      files.push(...batch)
      if (batch.length < 100) break
    }
    const warnings: string[] = []
    if (files.length < pr.changed_files) warnings.push('files_truncated')
    if (files.some(f => !f.patch)) warnings.push('diff_unavailable_for_some_files')
    const comments = z.array(comment).parse(await this.request(`${base}/issues/${ref.number}/comments?per_page=100`))
    if (comments.length === 100) warnings.push('comments_truncated')
    let checks: Snapshot['checks'] = []
    try {
      const data = z.object({ check_runs: z.array(check), total_count: z.number() }).parse(await this.request(`${base}/commits/${pr.head.sha}/check-runs?per_page=100`))
      checks = data.check_runs.map(c => ({ id: c.id, name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url }))
      if (data.total_count > checks.length) warnings.push('checks_truncated')
    } catch (error) { if (!(error instanceof ReviewError)) throw error; warnings.push('checks_unavailable') }
    if (await this.head(ref) !== pr.head.sha) throw new ReviewError('revision_changed_during_fetch')
    return { title: pr.title, body: pr.body, url: pr.html_url, state: pr.state, author: pr.user.login,
      baseSha: pr.base.sha, headSha: pr.head.sha, files, comments: comments.map(c => ({ id: c.id, body: c.body, url: c.html_url, author: c.user.login })),
      checks, warnings, fetchedAt: new Date().toISOString() }
  }
  async submit(ref: PullRef, headSha: string, body: string, event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES', findings: Finding[]) {
    if (!this.token) throw new ReviewError('github_auth_required')
    if (await this.head(ref) !== headSha) throw new ReviewError('stale_revision')
    return z.object({ id: z.number(), html_url: z.string(), state: z.string() }).parse(await this.request(`${this.path(ref)}/pulls/${ref.number}/reviews`, {
      commit_id: headSha, body, event, comments: findings.map(f => ({ path: f.path, side: f.side, line: f.line, body: `[${f.priority}] ${f.title}\n\n${f.body}` }))
    }))
  }
}
