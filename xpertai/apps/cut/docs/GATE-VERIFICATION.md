# Cut gate verification

Run from `xpertai/`:

```bash
pnpm --filter @xpert-ai/plugin-cut build
pnpm --filter @xpert-ai/plugin-cut test
pnpm --filter @xpert-ai/plugin-cut test:e2e
pnpm --filter @xpert-ai/plugin-cut smoke:sandbox-action
pnpm --filter @xpert-ai/plugin-cut smoke:mcp-server
pnpm --filter @xpert-ai/plugin-cut prepack
```

`test:e2e` serves the built remote component inside an iframe, implements the Xpert remote-component host protocol, launches Chrome, and operates the visible Workbench. The export project is 1920×1080, 30 fps, and 30 seconds; MediaBunny receives 900 frames. The host records the transferred MP4 byte count from `cut_save_export_file`.

Expected gates:

- `iframeMediaLoad`: iframe image media fires its loaded state.
- `decodedAudioWaveform`: imported audio/video produces a decoded waveform.
- `localMediaIntelligence`: a real decoded WAV is analyzed in the browser, audio activity/silence evidence is persisted through the host action, and the evidence list refreshes.
- `classicToolRail`: OpenCut-style library and property rails remain interactive.
- `mediaDragDrop`: media can be dragged from the library to a compatible timeline track.
- `textToolAndUndo`: text creation participates in undo/redo.
- `clipboardWorkflow`: clip copy/paste/duplicate behavior remains deterministic.
- `bookmarkWorkflow`: timeline markers can be created and removed.
- `directCanvasTransform`: direct stage move/resize/rotate updates the selected clip transform.
- `timelineDrag1080p`: a pointer drag maps 96 px to a 2.000 s timeline move.
- `platformSaveReload`: the host persists the document and a forced reload retains 2.000 s.
- `agentHostEventIncrementalRefresh`: a host-forwarded `cut_apply_edit` completion adds the Agent-created split without a full page reload.
- `dirtyEditProtection`: a host event received over a dirty local copy shows conflict protection instead of overwriting.
- `agenticProposalReview`: an evidence-backed Agent proposal reaches Workbench, renders a deterministic diff and read-only timeline preview, supports per-item disable/enable, applies atomically, and safely reverts to its exact source snapshot.
- `localWhisperReviewDraft`: browser audio decode/resampling, the Worker bridge, chunk progress, and local-result persistence create a reviewable caption draft. The default gate uses a deterministic Worker double.
- `captionReviewCommit`: SRT import creates a draft, one cue can be edited, and reviewed cues commit as timeline text clips.
- `headlessRenderWorkflow`: Workbench exposes Sandbox Action/worker health, queues an immutable-revision MP4, polls queued/running/complete stages, and associates `resultExportId` with the persisted export.
- `export30SecondProject`: the 900-frame MP4 is encoded and transferred to the host file action.
- `exportAudioTrack`: an explicit unmuted audio-track clip is mixed into the MP4 when browser AAC encoding is available.

The latest verified run on 2026-07-16 passed all 19 gates and produced a 682,876-byte MP4 with 900 encoded frames and an explicit audio track. Browser-local audio evidence uses a real decoded WAV in the normal gate; deterministic shot-range construction is covered by unit tests, while a broader browser video-codec matrix remains future coverage. The registered `cut.render-mp4@1.0.0` Action also passes `pnpm smoke:sandbox-action`, producing an 18-frame, 11,961-byte MP4 with both video and audio tracks in real local Chrome. The optional real-runtime gate also passed with the Hugging Face JFK sample, `Xenova/whisper-tiny` Q4, the bundled ONNX Runtime WASM engine, model timestamps, and the same review-draft persistence path:

```bash
CUT_E2E_REAL_WHISPER=1 pnpm --filter @xpert-ai/plugin-cut test:e2e
```

This opt-in gate requires network access for first-run model download; it is not a hard dependency of normal CI.

The MCP unit suite uses linked in-memory MCP transports. The package smoke launches the built `dist/mcp-server.js` as a real child stdio process, verifies that stdout remains valid MCP protocol, asserts no unexpected stderr, checks that tool discovery returns exactly the four allowlisted `cut_ir_*` tools, and confirms a protocol-level create call returns a structured Cut IR v1 document. It does not require or contact the 4300 host, a database, project files, or the network.
