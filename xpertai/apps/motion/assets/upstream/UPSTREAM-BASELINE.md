# Motion Anything upstream baseline

- Repository: `https://github.com/nexu-io/motion-anything`
- Branch: `main`
- Verified commit: `b016900d9ee92fc2d3e4dc520359cc8999d2ed4e`
- Commit date: `2026-07-07T14:45:45+08:00`
- Verified by Xpert Motion: `2026-07-18`
- License: Apache-2.0; third-party attributions remain in `ATTRIBUTION.md` and the corresponding license files.

## Imported capability baseline

The vendored recipe tree and application data are byte-compared with the verified commit:

- 403 recipe records and 1,171 recipe files.
- 4 interaction triggers and 13 motion verbs.
- Six keyframe tracks: opacity, x, y, scale, rotate, and blur.
- 59 design-system packs, 58 HyperFrames video-template references, 112 HTML templates, 2,680 icons, and 230 portable skills reported by upstream.
- Latest legacy video engine, HTML capture, and WebCodecs export modules are retained as implementation references.

The upstream standalone video editor HTML and its vendored browser encoders are intentionally not copied. Xpert Motion has an existing typed Legacy Canvas/WebCodecs implementation for historical projects, and that path is compatibility-only. New video projects use native HyperFrames composition source with the public SDK, Player, and Producer.

## Product mapping

- Continue deriving Motion product workflows, recipe intelligence, component-level editing, restraint guidance, versioning, and agent routing from Motion Anything.
- Treat HyperFrames as the standard composition and production-render contract for newly created video projects.
- Do not embed HyperFrames Studio. The Workbench integrates the SDK and Player; the isolated platform video runtime invokes Producer.
- Re-check this baseline before adopting future Motion Anything features. Preserve attribution and classify changes as product/workflow, HyperFrames-native, or legacy-compatibility before implementation.
