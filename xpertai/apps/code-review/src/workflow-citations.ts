import { stripVTControlCharacters } from 'node:util'
import type { z } from 'zod/v3'
import type { GitHub } from './github.js'
import type { workflowCompletionSchema, workflowJobSchema } from './workflow-contract.js'

/** Keep physical line positions, including blanks, when paging or resolving citations. */
export function physicalLines(content: string) {
  if (!content) return []
  const lines = content.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines.map(line => line.endsWith('\r') ? line.slice(0, -1) : line)
}

export function jobLogLines(log: { content: string; truncated: boolean }) {
  const lines = physicalLines(log.content)
  if (log.truncated && !log.content.endsWith('\n')) lines.pop()
  return lines.map(stripVTControlCharacters)
}

function resolveQuote(lines: string[], ref: { quote: string; line?: number }, label: string) {
  if (ref.line && lines[ref.line - 1]?.includes(ref.quote)) return { line: ref.line, quote: ref.quote }
  const index = lines.findIndex(text => text.includes(ref.quote))
  if (index < 0) throw new Error(`Citation for ${label} was not found. Re-read the tool output and copy a literal fragment of one line.`)
  if (lines.some((text, i) => i > index && text.includes(ref.quote))) {
    throw new Error(`Citation for ${label} matches multiple lines. Supply the printed one-based line or a unique excerpt.`)
  }
  return { line: index + 1, quote: ref.quote }
}

type Finding = z.infer<typeof workflowCompletionSchema>['findings'][number]
type Job = z.infer<typeof workflowJobSchema>

export async function verifyWorkflowCitations(
  finding: Finding, job: Job, github: GitHub, repo: { owner: string; repository: string }, sha: string
) {
  const refs = finding.citations
  const steps = job.steps.filter(step => ['failure', 'timed_out', 'cancelled'].includes(step.conclusion ?? ''))
    .map(({ number, name }) => ({ number, name }))
  const lines = refs.log.length ? jobLogLines(await github.jobLog(repo.owner, repo.repository, job.id)) : []
  const log = refs.log.map(ref => resolveQuote(lines, ref, `job ${job.id} raw log`))
  const source: { path: string; line: number; quote: string }[] = []
  for (const path of new Set(refs.source.map(ref => ref.path))) {
    const text = physicalLines(await github.source(repo, sha, path, 8 * 1024 * 1024))
    for (const ref of refs.source.filter(ref => ref.path === path)) {
      source.push({ path, ...resolveQuote(text, ref, path) })
    }
  }
  return { steps, log, source, ...(refs.limitation ? { limitation: refs.limitation } : {}) }
}

/** Candidate source context, not a mapping between GitHub step numbers and YAML positions. */
export async function workflowSourceContext(
  github: GitHub, repo: { owner: string; repository: string }, sha: string, paths: string[], jobs: Job[]
) {
  const names = jobs.flatMap(job => job.steps.filter(step => step.conclusion === 'failure' || step.conclusion === 'timed_out')
    .map(step => step.name)).filter(Boolean)
  const result = []
  for (const path of [...new Set(paths)].slice(0, 12)) {
    try {
      const lines = physicalLines(await github.source(repo, sha, path))
      const selected = new Set<number>()
      for (let i = 0; i < lines.length && selected.size < 32; i++) {
        if (!names.some(name => lines[i].includes(name))) continue
        for (let j = i; j < Math.min(i + 6, lines.length); j++) selected.add(j)
      }
      result.push({ path, lines: [...selected].map(i => ({ line: i + 1, text: lines[i].slice(0, 450) })) })
    } catch {
      // Failure to preview one reusable workflow must not hide job logs or other source files.
      result.push({ path, lines: [], previewUnavailable: true })
    }
  }
  return result
}
