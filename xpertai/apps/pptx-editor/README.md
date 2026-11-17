# PPTX Editor

Native PPTX file and resource editor for Xpert. Includes slide navigation, editable objects,
speaker notes, PPTX-preserving saves, presentation mode and Spaces integration.

Spaces owns resource identity, permissions, immutable file versions and atomic saves.
Platform collaboration sessions carry presence and new-version notifications. The plugin
uses the same PPTX file, not a separate independently saved presentation copy.

- [Usage and current status](docs/index.mdx)
- [Architecture](docs/architecture.mdx)
- [Verification and acceptance](docs/verification.mdx)

Local validation: `corepack pnpm run typecheck`, `corepack pnpm run build`,
`corepack pnpm test`, `corepack pnpm run verify:dist`.

Requires the corresponding Xpert SDK/contracts, Spaces and browser SDK changes; this is
a coordinated source release, not a plugin compatible with an unchanged registry SDK.

Local acceptance on 2026-11-15 passed Cloud/ChatKit cross-host saves, refresh, notes,
conflict preservation, close autosave and WPS Office 12.1.29182 reopen of a 20-slide deck.
See `docs/verification.mdx` for the evidence boundary and remaining fidelity limits.
