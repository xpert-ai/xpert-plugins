# Code Review

Installable Xpert app for GitHub PR review in the right-hand Workbench panel. Built with Shadcn UI + Tailwind CSS. Includes immutable diff snapshots, private AI findings, viewed files, checks, repository policies, a review inbox, automatic GitHub App review comments, and explicit manual submission.

See [automatic PR review setup](docs/automation.mdx), [setup and usage](docs/index.mdx), [architecture](docs/architecture.mdx), and [validation](docs/verification.mdx).

```sh
pnpm --filter @xpert-ai/plugin-shadcn-ui build
pnpm exec nx run-many -t typecheck,test,build -p @xpert-ai/plugin-code-review
pnpm exec nx run @xpert-ai/plugin-code-review:verify:dist
```

Install with the platform `plugin:deploy:local` command. Initialize the application from the catalog with an existing model. Public PR reads need no connector; private repositories and GitHub submission require the scoped GitHub connector.
