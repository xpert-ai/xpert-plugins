# Story Studio Architecture

## Decision

Story Studio is an independently designed Xpert-native implementation of the
story-to-video business workflow.

The plugin owns story-production domain state. It does not own authentication,
model credentials, arbitrary provider code execution, general-purpose canvas
editing, or final non-linear video editing.

## Business loop

```text
source documents
  -> source chapters and evidence
  -> story events
  -> adaptation plan versions
  -> episodes and sections
  -> asset bible
  -> shots and storyboards
  -> media generation requests and candidates
  -> human selection
  -> browser-side ordered clip preview
  -> versioned StoryCutHandoff v1
  -> Cut project or review proposal
  -> human-reviewed final non-linear editing
```

The Assistant coordinates work. Agent middleware tools remain deterministic and
persist only bounded, reviewable changes. Humans approve adaptation plans,
episodes, assets, storyboards, selected media, and the final Cut timeline.

## Platform boundaries

| Concern | Owner |
| --- | --- |
| Identity and authorization | Xpert host |
| Story projects and production records | Story Studio |
| Long-running source extraction | Managed Queue |
| Source and generated files | Workspace Files |
| Agent memory | Platform memory middleware |
| Seedance video generation | Configured Volcengine `seedream_aigc` Toolset |
| General visual planning | Canvas, through Assistant capabilities |
| Ordered selected-video preview | Story Studio Workbench |
| Final timeline editing and export | Cut, through Assistant tools and Workspace files |

No Story Studio service may import a private Canvas, Cut, or model-plugin service.
Cross-plugin orchestration uses declared capabilities, Assistant middleware
tools, and portable Workspace file references.

## Confirmed implementation

- Namespace: `story_studio`
- Package: `@xpert-ai/plugin-story-studio`
- Targets: `data-xpert`, `xpert`
- UI: React remote Workbench
- Persistence: TypeORM plugin entities
- Production document: source materials, story beats, timed episodes, asset
  bible, characters, ordered scenes, shots, dialogue, camera, bounded timing,
  candidates, selected evidence
- Agent surface: native Agent middleware
- Preview: the Workbench plays selected, scoped Workspace MP4 grants in shot
  order without creating a derived file; original clip audio remains audible.
- Concurrency: optimistic integer revision
- Scope: tenant required; organization, workspace, host project, Assistant, and
  conversation captured when available
- Seedance boundary: the Assistant calls the configured Volcengine Toolset;
  Story Studio validates completed task status, MP4 bytes, tenant scope,
  revision, exact scene/shot ids, copies the result into a durable Story Studio
  Workspace folder, and persists an allowlisted receipt through
  `story_attach_generated_video`.
- Cut boundary: Story Studio freezes exactly one scoped Workspace MP4 per
  ordered shot into `StoryCutHandoff v1`. Cut validates file size, MIME type,
  SHA-256, timing, and target mode. Initial delivery creates the Cut timeline;
  later deliveries create evidence-backed proposals without mutating that
  timeline. Cut returns a receipt that Story Studio records with optimistic
  handoff revision checks.

## Remaining capability gates

The following contracts must be confirmed before their milestone starts:

1. Durable source extraction and chunk/evidence descriptors for uploaded files.
2. Seedance image-to-video and its Workspace receipt are complete. Other
   image/audio providers remain cross-plugin orchestration.
3. Optional Canvas handoff format for high-level production planning.

## Milestones

1. Foundation: project lifecycle, revision, audit, Workbench, Assistant. Complete.
2. Story intake: reviewed source records complete for text; uploaded-file
   extraction and chapter evidence remain.
3. Writing: story plan, ordered beats, timed episode script, review surfaces.
   Complete for the coherent demo vertical slice.
4. Production: structured characters, shots, storyboards, timing, consistency
   review. Complete for the coherent production-document vertical slice.
5. Media: candidate records, Seedance Toolset dependency, completed-video
   attachment, provider receipts, selection, secure Workspace grants, and
   browser sequence preview complete.
6. Delivery: `StoryCutHandoff v1` is complete. Composition, subtitles, audio
   mixing, effects, and final export remain Cut responsibilities.
