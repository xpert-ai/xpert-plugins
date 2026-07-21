# Presentation Studio

Create polished, editable presentations with an AI collaborator and a full visual studio inside Xpert.

Presentation Studio helps you move from source material and a rough brief to a presentation that people can review, refine, present, export, and share. It combines an Agent that understands presentation structure with a native editing Workbench, real-time collaboration, explicit versions, and production-ready output.

## From idea to finished deck

Ask Presentation Studio to build a presentation from a report, project brief, meeting notes, structured data, or an outline. The Assistant can:

- choose a visual theme and suitable layouts for each page;
- turn source material into a clear presentation narrative;
- create, reorder, and revise slides;
- adapt content to the goal, audience, presenter, and requested page count;
- connect images and other media already available in the Xpert workspace;
- validate copy length, required fields, media references, and layout constraints;
- export the result as HTML, PDF, or PPTX.

You can also open an existing deck and ask the Assistant to work on the current presentation or selected slide. The Workbench shares the active deck, slide, and editing context with the Agent, so follow-up requests can target what you are viewing instead of creating a disconnected document.

## A real presentation studio

Presentation Studio is more than a one-time slide generator. Its full-screen Workbench provides:

- a slide navigator with direct page selection and organization;
- a high-fidelity central canvas;
- inline text editing and movable editable elements;
- a design inspector generated from each layout's supported controls;
- slide-specific colors, ranges, toggles, selections, and media controls;
- undo and redo for local editing;
- version, export, asset, and validation panels;
- presentation playback and fit-to-screen controls.

The interface inherits Xpert theme variables, keeps each panel independently scrollable, and loads only the theme runtime required by the active deck.

## 14 themes and 1,190 layouts

The plugin includes 14 DashiAI theme packs and 1,190 presentation layouts. The two additional packs are **Bright Circular Business** (`theme13`) and **Olive Architecture Proposal** (`theme14`). Layouts cover common presentation roles such as:

- title and section covers;
- agendas and chapter navigation;
- key metrics and comparison cards;
- timelines, roadmaps, and process flows;
- product, team, strategy, and project summaries;
- image, video, chart, and mixed-media pages;
- conclusions, calls to action, and closing pages.

Each deck uses one coherent theme. The Agent searches the catalog by page role and inspects the selected layout contract before filling content, reducing broken compositions and unsupported properties.

## Generate a theme from your own template

Choose **Deck → Generate theme from template** in the Workbench, enter a theme name, explicitly select the source contract, and upload a React project/archive, HTML page/archive, PPTX, PDF, an image ZIP containing 8–30 pages, or a mixed archive. Uploading only stores the source in Workspace Files as a scoped **Prepared** theme; it does not start a background job. Presentation Studio opens its built-in `dashi-theme-generator` workflow and authoring archive directly; no `skillsMiddleware` or separately installed Skill is required. In chat, the Assistant can also prepare 8–30 explicitly attached image files without joining their paths.

The generator advances through **Analyzing → Generating → Validating**, inventories the source, selects an explicit adapter, extracts Style DNA, and builds real editable modules instead of using screenshots as slide backgrounds. Registration requires 76–96 layouts, at least eight evidence-backed observed modules, eight Style-DNA-derived modules, nine structure families, and successful capability, palette, owned-render, canvas/control, render-contract, and full-layout quality gates. A failed gate leaves the theme unavailable with its concrete error; only a package registered from the Validating stage becomes selectable like a built-in theme and works in the Workbench and HTML/PDF/PPTX export.

## Collaborate with people and Agents

Multiple people can edit the same working deck in real time. Presentation Studio shows connected collaborators, live pointers, text selections, active slides, and the element or control another collaborator is editing.

Agents participate in the same collaboration model. When an Agent adds a slide, changes text, adjusts a control, or works on a media element, it appears as an Agent collaborator with its current operation and target. Human and Agent updates use the same authoritative collaborative document instead of overwriting each other's work.

Presence is temporary and does not become part of the presentation content or version history.

## Working copies and versions

Editing updates the live working copy. Presentation Studio does not create a new immutable version for every keystroke, collaboration event, playback action, or export.

A version is created only when you explicitly choose **Save version** or ask the Agent to save or finalize one. You can then review version history and restore an earlier snapshot without overwriting the original history.

This keeps everyday collaboration fast while preserving meaningful review milestones.

## Export and share

Choose the format that matches how the presentation will be used:

| Format | Best for |
| --- | --- |
| **HTML** | Self-contained browser playback, review, and external sharing. |
| **PDF** | Stable review copies, handouts, and document delivery. |
| **PPTX** | PowerPoint-compatible delivery with editable text, shapes, and images where possible. |

Complex visual effects may be flattened in PPTX while editable text is restored on top. Export reports identify font substitutions, overflow, unsupported elements, or screenshot fallbacks when they occur.

HTML exports can be published through Xpert Artifacts. Public sharing is always an explicit user action. The shared Artifact contains the presentation output only; it does not expose the conversation, workspace, collaboration session, or platform credentials.

In production, PDF and PPTX run as short-lived jobs in the Xpert Sandbox browser pool. Xpert's shared Browser Runtime supplies Playwright, Chromium, fonts, and the generic Runner Host; this plugin publishes only the versioned `presentation.export` Sandbox Action Bundle. Xpert registers `browser/playwright-1.61/v1` automatically. PDF/PPTX capability detection is enabled by default and shows an actionable warning when the Action, Runtime artifact, Provider, or worker is unavailable; HTML remains available independently.

The OSS base deployment intentionally does not start a Sandbox Runtime worker and does not mount the Docker socket. A compatible Provider distribution may supply its own worker deployment. Xpert Pro packages the Docker Provider and its worker overlay, including the immutable Runtime artifact lock, so end users do not configure a Provider, profile, image, `CHROME_PATH`, or feature switch.

`exportBackend: local` and `chromiumExecutablePath`/`CHROME_PATH` are deprecated development and test compatibility options. Production always uses `exportBackend: sandbox-job`; it never launches or downloads Chromium in the API container.

## Typical workflow

1. Optionally upload an external template and let the Assistant generate and register a reusable theme.
2. Describe the goal, audience, presenter, source material, and desired length.
3. Let the Assistant create the deck structure and select layouts.
4. Review the result in the Workbench and edit text, design controls, media, and slide order.
5. Collaborate with teammates or ask the Agent to refine the current slide.
6. Save a version at a meaningful review milestone.
7. Export to HTML, PDF, or PPTX.
8. Publish an HTML Artifact link when the presentation needs to be shared externally.

## Best for

- project proposals and executive updates;
- annual, quarterly, and monthly business reviews;
- product launches and strategy presentations;
- research, analysis, and data storytelling;
- training material and internal enablement;
- sales, consulting, and customer-facing decks;
- teams that want AI assistance without giving up direct editing and review.

## Content and privacy

- Decks, versions, exports, and assets remain scoped to the current Xpert tenant and organization.
- Media is referenced through Workspace Files instead of being copied into Agent tool results.
- Collaboration sessions are short-lived and limited to one user and one deck.
- Public Artifact links are never created silently.
- User text is written only into known layout fields; it is not treated as arbitrary HTML.

## Included technology and licensing

Presentation Studio keeps the DashiAI PPT Skill base pinned at commit `69ac66443e36e11cfca4a7f30721dc71a4278d28` and synchronizes the installed Dashi PPT 0.4.0 `theme13`/`theme14` sources, evidence, metadata, and runtimes. The resulting catalog contains 14 themes and 1,190 layouts. The bundled `dashi-theme-generator` method and authoring project produce portable, validated custom-theme packages. Upstream attribution, source, integrity metadata, and third-party notices are included with the plugin.

Presentation fonts are not committed as binary files inside the vendored upstream source. The plugin pins the required OFL-1.1 Fontsource packages as runtime dependencies, detects the families used by the selected theme, and stages only that theme's font pack into the render job. HTML export then embeds the WOFF2 data and generated license inventory into the self-contained file. This keeps Git history and the plugin source package smaller without adding a CDN request or changing offline export behavior.

Presentation Studio is licensed under AGPL-3.0. See [Third-Party Notices](./THIRD_PARTY_NOTICES.md) for attribution and license details.
