# Code Review

Installable Xpert app for GitHub PR review in the right-hand Workbench panel. Built with Shadcn UI + Tailwind CSS. Includes immutable diff snapshots, private AI findings, viewed files, checks, repository policies, a review inbox, automatic GitHub App review comments, and explicit manual submission.

See [automatic PR review setup](docs/automation.mdx), [setup and usage](docs/index.mdx), [architecture](docs/architecture.mdx), and [validation](docs/verification.mdx).

## Marketplace cover

The first `appConfig.presentation.screenshots` entry is the [Chinese cover](assets/brand/code-review-overview-zh-v1.png), declared in `.xpertai-plugin/plugin.json` and included in the published package. It follows the Meetings brand-and-product composition, with the existing pull-request icon, the app's tagline, and an illustrative review interface using sample code.

The opaque 1600 × 900 cover is full bleed. Keep essential content inside the 5% top/side margins and above the bottom 30% reserved for the host's information overlay; do not bake the catalog nameplate into the image. Generated with the built-in imagegen tool using the [saved prompt](assets/brand/code-review-overview-zh-v1.prompt.txt).

## Build and test

Code Review requires published `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk`
3.25.0 or newer for the Project Pipeline API. Development dependencies are pinned
to 3.25.0 in the workspace lockfile. No adjacent platform checkout or local SDK
link is required.

From the repository's `xpertai/` directory:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec nx build @xpert-ai/plugin-code-review
corepack pnpm exec nx run-many -t typecheck,test,verify:dist -p @xpert-ai/plugin-code-review --parallel=1
```

Set `XPERT_PIPELINE_TEST_DATABASE_URL` to a dedicated PostgreSQL test database
whose name starts with `xpert_pipeline_test_` to run persistence, scope enforcement,
and delivery tests. Without it, those tests are skipped. Tests create isolated
schemas and remove them on completion. Verify the built plugin's lifecycle
locally by following [`plugin-dev-harness`](../../../plugin-dev-harness/README.md).

Install with the platform `plugin:deploy:local` command. Initialize the application from the catalog with an existing model. Public PR reads need no connector; private repositories and GitHub submission require the scoped GitHub connector.
