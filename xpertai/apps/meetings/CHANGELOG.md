# @xpert-ai/plugin-meetings

## 0.3.0

### Minor Changes

- 850f975: Store meeting manifests, audio, capture receipts and processing checkpoints in the owning Assistant's user-isolated workspace through WorkspaceFilesRuntimeCapability.appData(). Remove the independent dataDirectory setting and use host-managed cross-instance locks and atomic writes. Require a host with WorkspaceFilesRuntimeCapability.appData(); old plugin-directory data is not migrated. Return explicit missing-meeting and workspace-configuration errors.

### Patch Changes

- 850f975: Read runtime version, plugin level, and artifact namespace from package.json so released packages report the metadata expected by rolling API restarts.

## 0.2.1

### Patch Changes

- c15c39c: Preserve recording startup, input, permission, and transcription failure codes through meeting processing and show actionable recovery feedback. Keep retained meeting views in sync with conversation context changes without falsely reporting an account switch, and allow enough Assistant workflow steps to finish meeting summaries.

  Compact the meeting header with progressive disclosure for workspace synchronization and export options. Add paginated meeting browsing with restored search and page state, and refresh rows by meeting ID while preserving content, focus, and scroll position. Animate only changed rows and respect reduced-motion preferences.

## 0.2.0

### Minor Changes

- 7de20bb: Support browser recording through the host audio-capture bridge, with microphone-only or optional shared audio tracks and silence-triggered summaries based on the selected tracks. Requires the corresponding browser audio-capture host and client-command support.

  Refresh the meeting library and detail views, align typography with host theme tokens, and include branded plugin assets. Improve live transcript polling and capture feedback, show saved notes when the collaborative editor cannot connect, and allow manual reconnection. Handle empty collaborative documents and avoid redundant writes for unchanged document snapshots.

### Patch Changes

- f7cf61a: Add the Meetings Agentic App with Desktop recording controls, dual-track live transcription, configurable silence-triggered Assistant summaries, and final meeting minutes. Provide Tiptap/Yjs notes and summaries, history and evidence-linked follow-up tools, and per-meeting Markdown/JSON folders at the Assistant workspace root. Includes existing-record migration, file conflict protection, and integration checks; requires the corresponding Desktop, ChatKit, Assistant task runtime, and workspace file error fixes.

  Publish from the official apps workspace. Localize the View name and provide actionable recording feedback for unsupported hosts, denied audio permissions, and unavailable Desktop connections. Keep recording errors visible in the dialog and preserve the meeting title for retry.

- 42c94b3: Explain Desktop microphone signing, permission-check, and system-audio consent failures separately in English and Chinese, without treating a host command rejection as proof of missing OS permissions.
