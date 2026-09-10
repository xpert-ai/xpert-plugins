# Agency Agents

One Xpert content plugin providing all role files from two pinned Agency Agents repositories. Install the plugin, browse templates, and create an independent expert draft. Roles use Chinese prompt bodies when available and otherwise fall back to English, without a language selection step. Configure models, tools and knowledge bases in Xpert.

Requires the Xpert catalog-provider extension (`kind: catalog`), summary/detail template endpoints and locale-aware source tracking delivered with this plugin. An older host supporting only eager `templates[]` is not compatible; the package version alone does not imply that a deployed host has this extension.

The package supplies prompts, not executable skills or external-service authorization. Installation creates no expert instances. Plugin upgrades do not modify existing instances. Explicit template synchronization replaces the draft using Xpert's existing behavior. Created pure-prompt experts remain independent of the plugin runtime.

## Sources and languages

`sources.lock.json` pins both upstream commits and every role file hash. `catalog/roles.json` records stable identities and explicit language/source mappings. Same-role adaptations can differ between repositories; no live translation occurs. Three reviewed Chinese-source files contain English prompt bodies, so their Chinese metadata is retained without advertising a Chinese prompt variant. All original files remain under `upstream/` for review.

## Maintenance

Run `npm run build`, `npm test`, and the repository's plugin-dev-harness lifecycle check. `npm run sync -- <source> <full-commit-sha>` previews upstream changes; add `--apply` to update the snapshot. Review mappings and language declarations before rebuilding. Unmapped files, duplicate identities, unavailable default languages and hash mismatches fail the build. Do not edit generated `dist/` files.

Published files contain the compiled catalog and bodies, plugin entrypoint, provenance and licenses. Upstream snapshots and maintenance scripts are not required at runtime. Preserve both upstream MIT licenses when redistributing.
