# Story Studio

Story Studio is an Xpert-native Agentic App for turning source stories into
reviewable adaptation plans, episodes, assets, storyboards, generated-media
candidates, and an editing handoff.

The current implementation includes:

- system-level plugin metadata with the stable `story_studio` artifact namespace;
- tenant- and organization-scoped story projects;
- revision-safe project mutations and audit records;
- strict Agent middleware tools for project lifecycle, production documents,
  completed Seedance media attachment, and bounded long-running render waits;
- a declared `@xpert-ai/plugin-volcengine` / `seedream_aigc` Assistant
  dependency for Seedance 2.0 image-to-video generation and Workspace output;
- structured source materials, story beats, timed episode scripts, character /
  location / prop assets, scenes, shots, dialogue, camera direction, media
  candidates, selection evidence, and total-duration validation;
- character-bound voice references, exact dialogue speakers and dialogue types,
  per-shot sound effects, and Seedance 2.0 synchronized audio generation;
- Managed Queue + Sandbox Jobs production rendering on the platform
  `browser/video-playwright-1.61/v1` profile;
- MP4 output through Workspace Files, registered as an immutable binary
  Artifact version; authenticated playback keeps the scoped Workspace URL so
  the browser receives `video/mp4`;
- a Story Studio Assistant template;
- a React Workbench with eight clickable review stages, project creation,
  search, production review, explicit light/dark themes, Seedance media review,
  and versioned Cut handoff;
- a strict `StoryCutHandoff v1` boundary: the first delivery creates a Cut
  project and editable timeline; later Story revisions create a review proposal
  and never overwrite the Cut timeline;
- an original built-in case, **朱门账影**, that loads three consistent visual
  frames into scoped Workspace Files and renders them as a 15-second vertical
  animatic.

## How the eight stages work

1. **Project** sets format, aspect ratio, duration, audience, and ownership.
2. **Sources** imports and reviews story evidence; later stages should only use
   reviewed source material.
3. **Story plan** turns the evidence into a logline, theme, tone, and ordered
   dramatic beats.
4. **Episode script** expands the beats into timed, production-ready scenes and
   dialogue.
5. **Asset bible** records stable character, location, prop, and style anchors
   plus their reference candidates.
6. **Storyboard** converts the script into ordered shots with composition,
   action, camera, dialogue, duration, and preview frames.
7. **Media generation** sends selected storyboard frames to Seedance, waits
   within a bounded query window, stores completed Workspace MP4s with
   allowlisted provider receipts, and explicitly selects the source used by
   each shot. Dialogue shots use a bound public voice reference when available;
   every generation keeps `generate_audio=true`.
8. **Cut handoff** requires exactly one selected Workspace MP4 per ordered shot,
   freezes paths, checksums, timing, aspect ratio, dimensions, and frame rate in
   `StoryCutHandoff v1`, then asks Cut to create either the initial editable
   project or a reviewable proposal.

Use **Load visual demo** in the Workbench to create the complete **朱门账影**
case. Its story, prompts, and generated images are original Story Studio assets.

The built-in renderer produces an optional deterministic storyboard/animatic
MP4 from reviewed shots and selected Workspace media. Seedance and Cut remain
cross-plugin Assistant handoffs: Story Studio declares both plugins, accepts
only completed scoped Workspace MP4s through `story_attach_generated_video`,
and exchanges a portable contract through Agent tools. It never imports private
provider or Cut services and never stores model credentials.

## Development

Run tasks from the `xpertai` workspace:

```bash
corepack pnpm nx build @xpert-ai/plugin-story-studio
corepack pnpm nx test @xpert-ai/plugin-story-studio
corepack pnpm nx typecheck @xpert-ai/plugin-story-studio
corepack pnpm nx test:e2e @xpert-ai/plugin-story-studio
corepack pnpm --dir apps/story-studio prepack
```

The E2E target uses the platform's shared Remote View Preview Host and the real
built Workbench assets. Set `WORKBENCH_E2E_SCREENSHOT` to an absolute path to
capture repeatable visual evidence.

After build and tests, validate the plugin lifecycle through
`plugin-dev-harness`. Use the platform `plugin:deploy:local` flow for an
installed-platform check; do not copy files into plugin staging directories.

Production rendering requires Workspace Files, Artifacts, Managed Queue, a
healthy `sandbox-browser` worker, and the platform Browser Video runtime. The
server checks all capabilities before it creates a render record.
