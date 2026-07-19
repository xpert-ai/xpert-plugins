# OpenCut attribution

Cut is an independent Xpert plugin whose editor data model, timeline interaction model, and browser export pipeline are adapted from OpenCut.

- Upstream: https://github.com/OpenCut-app/OpenCut
- Pinned tag: `pre-rewrite`
- Pinned commit: `238750c0250650f1254cf7a4738f8e8c8a0c268c`
- Upstream license: MIT (vendored beside this file)
- Reference paths: `apps/web/src/services/renderer/scene-exporter.ts`, `apps/web/src/timeline/`, and `apps/web/src/project/types.ts`
- Export dependency: MediaBunny `1.29.1`, matching the pinned upstream version without a semver range

The Xpert tenant model, Workspace Files integration, Agent middleware, host-event protocol, persistence entities, and compact project IR are original integration work. OpenCut source is not embedded as a server or iframe application.
