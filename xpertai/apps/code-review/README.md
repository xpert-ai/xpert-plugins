# Code Review

Installable Xpert app for GitHub PR review in the right-hand Workbench panel. Built with Shadcn UI + Tailwind CSS. Includes immutable diff snapshots, private AI findings, viewed files, checks, repository policies, a review inbox, automatic GitHub App review comments, and explicit manual submission.

See [automatic PR review setup](docs/automation.mdx), [setup and usage](docs/index.mdx), [architecture](docs/architecture.mdx), and [validation](docs/verification.mdx).

## Marketplace cover

The first `appConfig.presentation.screenshots` entry is the [Chinese cover](assets/brand/code-review-overview-zh-v1.png), declared in `.xpertai-plugin/plugin.json` and included in the published package. It follows the Meetings brand-and-product composition, with the existing pull-request icon, the app's tagline, and an illustrative review interface using sample code.

The opaque 1600 × 900 cover is full bleed. Keep essential content inside the 5% top/side margins and above the bottom 30% reserved for the host's information overlay; do not bake the catalog nameplate into the image. Generated with the built-in imagegen tool using the [saved prompt](assets/brand/code-review-overview-zh-v1.prompt.txt).

```sh
pnpm --filter @xpert-ai/plugin-shadcn-ui build
pnpm exec nx run-many -t typecheck,test,build -p @xpert-ai/plugin-code-review
pnpm exec nx run @xpert-ai/plugin-code-review:verify:dist
```

Install with the platform `plugin:deploy:local` command. Initialize the application from the catalog with an existing model. Public PR reads need no connector; private repositories and GitHub submission require the scoped GitHub connector.
