# Sites

Sites is a data-xpert Agentic App plugin that creates, saves, deploys, and inspects hosted site projects from an Assistant.

## Features

- Sites project records with `.openai/hosting.json`-style hosting metadata.
- Saved deployable versions before production publishing.
- Production deployment URLs served by the plugin at `/api/xpert-sites/:slug`.
- Long-lived anonymous `previewUrl` share links served by the plugin at `/api/xpert-sites/share/:shareLinkId`.
- Access modes: `admins_only`, `workspace_all`, and `custom`.
- Public preview link revocation, optional expiration, and access-count metadata.
- Hosted environment values with secret masking in Workbench data.
- Assistant middleware tools and a Sites Builder assistant template.

## Local Development

```sh
pnpm --filter @xpert-ai/plugin-sites build
pnpm --filter @xpert-ai/plugin-sites test
```

Local deployments default to:

```text
http://localhost:3000/api/xpert-sites/<site-slug>
```

In production, Sites derives this base from the xpert-pro backend `API_BASE_URL`
environment variable and appends `/api/xpert-sites`.
