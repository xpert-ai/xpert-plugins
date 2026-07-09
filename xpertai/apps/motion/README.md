# Motion

Motion is an Xpert-native Agentic App for turning natural-language intent into animated HTML and launch-video compositions.

It provides:

- Motion Assistant template for recipe routing and artifact creation.
- Motion middleware tools for recipe search, scoped project CRUD, versioning, exports, status updates, and failure reporting.
- Motion Workbench remote component with Projects, Motion Library, HTML Workbench, Video Composer, Versions, and Exports tabs.
- Imported upstream recipe/spec/template assets under `assets/upstream` with attribution preserved.
- Browser-side MP4 export for JSON video compositions through WebCodecs.

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

All records are scoped by tenant and organization. Generated and exported files use the platform workspace files capability when it is available.
