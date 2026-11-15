# Motion

Motion is an Xpert-native Agentic App for turning natural-language intent into animated HTML and launch-video compositions. Its product workflows and recipe intelligence continue to derive from [Motion Anything](https://github.com/nexu-io/motion-anything); native HyperFrames is the standard engine for new video projects.

It provides:

- Motion Assistant template for recipe routing and artifact creation.
- Motion middleware tools for recipe search, scoped project CRUD, versioning, exports, status updates, and failure reporting.
- Motion Workbench remote component with Projects, Motion Library, HTML Workbench, native HyperFrames storyboard/element editing, Legacy Video Composer, Versions, and Exports.
- HyperFrames SDK persistence/validation and Player preview, without embedding Studio.
- Structured six-scene product-intro generation, including a ready-to-customize Xpert AI launch-film template.
- Managed Queue + Sandbox Jobs production rendering through HyperFrames Producer.
- Imported upstream recipe/spec/template assets under `assets/upstream`, pinned by `UPSTREAM-BASELINE.md` with attribution preserved.
- Canvas/WebCodecs local preview and browser MP4 export for historical JSON video projects only.

## Video engine policy

| Project | Composition | Preview | Render |
|---|---|---|---|
| New video | Native HyperFrames HTML | `@hyperframes/player` | queued `@hyperframes/producer` Sandbox Action |
| Historical video | Legacy Motion JSON | Canvas | local WebCodecs compatibility export |

The Workbench uses `@hyperframes/sdk` + `@hyperframes/player`; the isolated Action uses `@hyperframes/producer`. HyperFrames Studio is not included. A null engine discriminator on an existing video row is treated as `legacy_canvas`, so projects are never migrated from content guessing.

Production rendering requires the platform profile `browser/video-playwright-1.61/v1` (Node 22, Chromium, FFmpeg), registered Sandbox Jobs and Workspace Files capabilities, Managed Queue, and a healthy `sandbox-browser` worker. The UI exposes the capability state and will not queue renders until these dependencies are ready.

## Package

```bash
pnpm --dir apps/motion build
pnpm --dir apps/motion typecheck
pnpm --dir apps/motion test
```

## Public Interfaces

- Package: `@xpert-ai/plugin-motion`
- Provider: `motion`
- View: `motion_workbench`
- Remote component: `motion-workbench`
- Assistant template: `Motion Assistant`
- Capabilities: `motion`, `motion-workbench`, `agent-motion`, `motion-library`, `motion-assistant-template`

## Middleware Tools

- `motion_search_recipes`
- `motion_get_recipe`
- `motion_create_project`
- `motion_create_product_intro`
- `motion_get_project`
- `motion_save_web_artifact`
- `motion_save_video_composition`
- `motion_save_hyperframes_composition`
- `motion_finalize_version`
- `motion_export_artifact`
- `motion_update_project_status`
- `motion_report_failure`

## Data Model

- `MotionProject`
- `MotionProjectVersion`
- `MotionStyle`
- `MotionExport`
- `MotionActionLog`

All records are scoped by tenant and organization. Production exports are written through platform Workspace Files with input checksum, Action/runtime evidence, progress, and failure details. Roll out the platform video runtime and worker pool before enabling server HD render in production.

### Evidence voice-over

Configure an authorized TTS `narrationModel` on the published `MotionMiddleware`. From an unedited evidence video draft, **Create voiced draft** reads the first fixed observation and creates a separate draft. The same exact text and evidence citations become the caption; the timeline uses the duration of the returned audio. The initial implementation accepts at most 600 text characters and 120 seconds of 24 kHz mono PCM. It does not generate new numerical claims or narrate the entire dataset.

A durable model operation is claimed once before calling the platform model runtime, which enforces access, budget and usage reporting. A repeated operation ID returns the same task. An interrupted or failed synthesis is not automatically repeated because provider billing may be uncertain. Saved WAV output is delivered through normal file access sessions; MP4 production uses the same immutable file as a verified Sandbox input. Retrying a render does not call the speech model again. The `motion.hyperframes-render` Action version is now `1.1.0`.

Both the source evidence and Project permissions are checked before synthesis, before delivery and before rendering. Changed source data or revoked access blocks new operations. Editing the generated composition invalidates its bound audio/render checksum; create a fresh evidence voice-over draft to change the narrated observation. A concurrent edit during synthesis is preserved, with the audio retained separately instead of overwriting the draft.
