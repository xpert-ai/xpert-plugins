# Sites

Turn a request into a polished, hosted website without leaving Xpert.

Sites is an Agentic App for creating, reviewing, versioning, publishing, and sharing static web experiences. Describe the site you need, let the Sites Assistant build the files in the Xpert workspace, inspect the result in the Workbench, and publish a controlled deployment through Xpert Artifacts.

## What you can create

Sites works well for self-contained web experiences such as:

- landing pages and campaign pages;
- team portals and onboarding hubs;
- enablement and resource centers;
- product, project, and launch pages;
- event planning hubs and schedules;
- idea intake and prioritization boards;
- lightweight dashboards and status pages;
- portfolios, reports, and interactive explainers.

The Sites Assistant can start from your prompt, files, notes, and links available in the conversation. When real source material is not provided, templates use clearly editable example content rather than presenting invented data as discovered company information.

## Build with an Agent, stay in control

Ask the Sites Assistant to create or revise a site in natural language. It can:

- create a Sites project and organize its source files;
- generate static HTML, CSS, and JavaScript;
- inspect project metadata and existing versions;
- save a reviewable immutable version;
- deploy an approved version;
- update access settings;
- publish or revoke an Artifact link;
- report deployment status and actionable failures.

The Shadcn UI + Tailwind Workbench occupies the right panel beneath host tabs and provides projects, previews, versions and publishing settings. Generation and revision requests use the existing conversation on the left. You can review a version before it becomes the active deployment instead of publishing every Agent change immediately.

## Start from proven templates

Sites includes ready-to-adapt starting points for common internal and external experiences, including:

- employee onboarding hubs;
- sales or team enablement centers;
- company pulse dashboards;
- event planning hubs;
- idea intake workspaces;
- launch calendars.

Templates are starting points, not locked themes. Ask the Agent to change the information architecture, visual direction, content, interactions, or audience while preserving a deployable static result.

## Versions and deployments

Sites separates editing, saving, and publishing:

1. A **project** identifies the website and its source location.
2. A **version** is an immutable, reviewable snapshot of the deployable site.
3. A **deployment** publishes one approved version with an access policy.
4. An **Artifact Link** provides the platform-managed URL used to open or share that deployment.

Creating or editing files does not silently replace a published site. Save a new version, inspect it, and deploy it when it is ready.

Each deployment link is pinned to the explicitly published immutable version; saving or restoring a draft does not move it. The platform manages link identity, authorization, expiration, revocation, and access auditing.

## Access and sharing

Choose who can open a deployment:

| Access | Use |
| --- | --- |
| **Only me** | Owner-only preview and early review. |
| **Workspace** | Internal sites for members of the current workspace. |
| **Custom audience** | Explicitly selected user IDs. |
| **Public link** | Anyone on the web who has the link. |

Public publishing always requires explicit confirmation. Sites does not construct public URLs, store public tokens, or expose a plugin-specific hosting endpoint. Xpert Artifacts generates and authorizes the final link.

Revoking a link immediately removes that public access path without deleting the internal project or its saved versions.

## Typical workflow

1. Describe the site's purpose, audience, content, and preferred visual direction.
2. Let the Assistant create source files in `sites/<slug>/` relative to the active sandbox working directory.
3. Review the project in the Sites Workbench and request revisions.
4. Save an immutable version when the content is ready for review.
5. Deploy the approved version with the appropriate access mode.
6. Copy the Artifact link for internal or external sharing.
7. Save a new version for later updates; keep earlier versions available for traceability.

## Workspace content and environment values

Site source remains in the Xpert workspace. Deployment output is stored through Workspace Files and referenced by an immutable Artifact version.

Deployment files follow the Assistant's configured workspace data scope: `shared` uses its shared volume, while `user` uses the authenticated user's isolated volume. The host resolves and authorizes that scope; Sites preserves the returned file reference. Deployment link access is configured separately.

Environment configuration remains a middleware capability; it is not shown in the static-site Workbench. Secret values are encrypted using the configured `environmentEncryptionKey` and are never returned to the view. Static published pages must not embed platform credentials or private environment values. Use environment records as deployment configuration metadata, not as a way to expose secrets to browser JavaScript.

## Best for

- teams that want to publish useful web experiences directly from an Agent conversation;
- internal hubs that need controlled workspace or custom access;
- lightweight interactive tools that can run entirely in the browser;
- repeatable publishing workflows with reviewable versions;
- public pages that need a revocable, audited platform link;
- users who want hosted results without setting up a separate frontend project and hosting pipeline.

## Current product boundaries

Sites currently publishes static, self-contained web content: a root `index.html` with optional CSS, JavaScript, and packaged assets.

- Server routes, databases, workers, and arbitrary backend runtimes are not part of the current deployment model.
- Client-side JavaScript runs in an opaque-origin sandbox without browser storage or network API access. Use in-memory state for local interactions.
- Connectors are used only when they are available to the Assistant and authorized by the user.
- Custom domains and multi-route dynamic application hosting are not part of the current version.
- Public deployment shares the generated site only; the originating conversation and workspace remain private.

## Powered by Xpert platform capabilities

Sites uses Workspace Files for portable deployment content and Xpert Artifacts for immutable versions, secure preview, governed links, expiration, revocation, and access logs. The result is a publishing workflow that stays connected to the Agent and Workbench without giving the generated page access to platform credentials.

## Development and acceptance

Build the repository-local `@xpert-ai/plugin-shadcn-ui` package, then run Nx `typecheck`, `build`, and `test` for `@xpert-ai/plugin-sites`. `verify:dist` checks generated remote-component freshness. Run `plugin-dev-harness` with this package directory as its workspace.

The Workbench sends selection and tab state through the declared `workbench.navigation.open` command. Embedded ChatKit needs host navigation persistence support to restore them after a browser reload. Completed tool events refresh metadata, with visible-view polling as a fallback; unchanged preview documents are retained.

Acceptance covers creation through the existing Assistant and model, saved preview, device sizing, private publication, restoring a new draft while retaining the published version, and reloading the selected tab. External GitHub posting is unrelated to this plugin.
