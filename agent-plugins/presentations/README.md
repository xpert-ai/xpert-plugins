# Presentations

Independent portable Agent plugin for a complete editable PPTX workflow:
author a JSON deck, generate native text/images/tables/charts and speaker notes,
inspect content, render every slide, review PNGs, deliver, then read a saved
browser-edited file and make a conservative text change into a new copy.

No MCP server, account connection or native server module is needed. The plugin
declares SandboxShell, SandboxFile and ViewImageMiddleware. Install the host
runtime using `node tools/presentations-runtime/install.mjs`, then import/publish
this portable package with the existing Agent plugin quickstart installer.

The Skill uses a platform-owned, pinned open-source runtime. It does not copy
the Codex Presentations Skill, scripts, templates or proprietary artifact-tool.
Only the plugin's display icon is reused from Codex; see [icon provenance](assets/README.md).
The two built-in themes are original JSON/native layouts. Archives contain
only source resources; no node_modules, venvs or machine-specific paths.

V1 supports local `.pptx`, local PNG/JPEG, native bar/line/pie charts, basic
tables, slide notes and exact single-run text replacement. The platform's
existing PPTX editor provides browser editing/save/download; chart data editing
there is outside this plugin. Google Slides, `.ppt`, complex template editing,
animations and full-fidelity roundtripping are outside v1.

The accompanying host changes in Xpert and PRO connect the editor's binary save
callback in both conversation files and artifact tabs, and read PptxGenJS chart
category caches for the existing browser preview. Upgrade these host changes
alongside the runtime and portable package to obtain the full browser loop.

See [authoring](skills/presentations/references/authoring.md),
[editing](skills/presentations/references/editing.md), and
[acceptance](docs/ACCEPTANCE.md).

## Explicit final-file presentation

Version 1.0.2 uses the platform SandboxFile `present_files` tool after generation
and verification. Its only input is `paths`; the Agent selects the final files,
and the host validates and archives immutable versions before emitting cards.
File writes and Shell operations only record file changes. Directory names and
extensions no longer select deliverables automatically. Existing files and
explicitly requested previews may also be presented. Re-present after edits;
older message cards stay pinned to their saved versions.

Requires the updated Xpert/PRO host with `present_files`; no new sandbox package
is needed. Existing conversations pin plugin versions: reselect this version to
load its new skill instructions. Historical output cards remain available.
