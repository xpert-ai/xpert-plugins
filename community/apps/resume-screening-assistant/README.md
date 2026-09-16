# Resume Screening Assistant

简历初筛助手 Agentic App 插件。

## What It Provides

- Agent and Project view extensions for recruiter resume screening workflows.
- Remote component workbench for jobs, candidates, AI scores, review decisions, and retryable failures.
- Middleware tools for structured resume extraction, JD match scoring, and failure reporting.
- TypeORM entities for screening jobs and candidate resumes.
- Assistant template for resume extraction and JD matching.

See [docs/requirements.md](docs/requirements.md) for the first-version requirements and design.

## Building

From `community/`:

```sh
pnpm --filter @community/apps-resume-screening-assistant build
```

## Testing

From `community/`:

```sh
pnpm --filter @community/apps-resume-screening-assistant test
```

For plugin lifecycle validation from the repository root:

```sh
pnpm -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js \
  --workspace ./community/apps/resume-screening-assistant \
  --plugin @community/apps-resume-screening-assistant
```
