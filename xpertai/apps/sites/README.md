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

The Workbench gives you a product view of projects, versions, deployments, access, environment values, and previews. You can review a version before it becomes the active deployment instead of publishing every Agent change immediately.

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

Artifact links can follow the latest deployment content or remain tied to a controlled published result, depending on the product flow. The platform manages link identity, authorization, expiration, revocation, and access auditing.

## Access and sharing

Choose who can open a deployment:

| Access | Use |
| --- | --- |
| **Admins only** | Private administration and early review. |
| **Workspace** | Internal sites for members of the current workspace. |
| **Custom audience** | A limited set of approved people or groups. |
| **Public link** | Anyone on the web who has the link. |

Public publishing always requires explicit confirmation. Sites does not construct public URLs, store public tokens, or expose a plugin-specific hosting endpoint. Xpert Artifacts generates and authorizes the final link.

Revoking a link immediately removes that public access path without deleting the internal project or its saved versions.

## Typical workflow

1. Describe the site's purpose, audience, content, and preferred visual direction.
2. Let the Assistant create source files in `/workspace/sites/<slug>/`.
3. Review the project in the Sites Workbench and request revisions.
4. Save an immutable version when the content is ready for review.
5. Deploy the approved version with the appropriate access mode.
6. Copy the Artifact link for internal or external sharing.
7. Save a new version for later updates; keep earlier versions available for traceability.

## Workspace content and environment values

Site source remains in the Xpert workspace. Deployment output is stored through Workspace Files and referenced by an immutable Artifact version.

The Workbench can manage environment-value metadata for a project and masks values marked as secret. Static published pages must not embed platform credentials or private environment values. Use environment records as deployment configuration metadata, not as a way to expose secrets to browser JavaScript.

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
- Browser interactions can use client-side JavaScript and `localStorage` when appropriate.
- Connectors are used only when they are available to the Assistant and authorized by the user.
- Custom domains and multi-route dynamic application hosting are not part of the current version.
- Public deployment shares the generated site only; the originating conversation and workspace remain private.

## Powered by Xpert platform capabilities

Sites uses Workspace Files for portable deployment content and Xpert Artifacts for immutable versions, secure preview, governed links, expiration, revocation, and access logs. The result is a publishing workflow that stays connected to the Agent and Workbench without giving the generated page access to platform credentials.
