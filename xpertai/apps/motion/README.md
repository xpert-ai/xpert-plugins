# Motion

Motion is an Xpert-native Agentic App for turning natural-language intent into animated HTML and launch-video compositions. Its product workflows and recipe intelligence continue to derive from [Motion Anything](https://github.com/nexu-io/motion-anything); native HyperFrames is the standard engine for new video projects.

It provides:

- Motion Assistant template for recipe routing and artifact creation.
- Motion middleware tools for recipe search, scoped project CRUD, versioning, exports, status updates, and failure reporting.
- Motion Workbench remote component with Projects, Motion Library, HTML Workbench, native HyperFrames Composer, Legacy Video Composer, Versions, and Exports.
- HyperFrames SDK persistence/validation and Player preview, without embedding Studio.
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
pnpm --dir /Users/xpertai/GitHub/os/xpert-plugins/xpertai/apps/motion build
pnpm --dir /Users/xpertai/GitHub/os/xpert-plugins/xpertai/apps/motion typecheck
pnpm --dir /Users/xpertai/GitHub/os/xpert-plugins/xpertai/apps/motion test
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
