# Meetings

A meeting notes app in the right-hand plugin View of Xpert Desktop. It provides a meeting library, dual-track recording, personal notes, and minutes backed by transcript evidence. Desktop and ChatKit provide the conversation pane and Assistant navigation.

## File storage

User-facing files live at the **Assistant workspace root**, outside `sessions/`:

```text
meetings/<creation-date-title-meeting-uuid>/
  summary.md                 # Final minutes; Tiptap edits update this same file
  notes.md                   # Personal notes in Markdown
  transcript.md              # Readable transcript with timestamps and audio tracks
  transcript.json            # Structured transcript
  meeting.json               # Title, dates, and status; no internal scope or task identifiers
  stages/0001.md             # Stage summary
  history/summary-1.md        # Original AI-generated minutes
  history/summary-1.json
```

A meeting keeps its initially assigned folder when renamed. Meetings with the same title have different UUIDs. Files are written through the host-authorized Workspace Files capability; the host selects the `xperts` or `user-xperts` catalog and applies Assistant workspace permissions. Each meeting belongs to the Assistant that created it. Other Assistants do not automatically move or read its records.

Existing meetings are backfilled idempotently when their original Assistant loads the library or details. Background tasks and Tiptap projections keep the files updated. Synchronization failures preserve content and expose a retry action. Separately edited workspace files are not silently overwritten. Collaborative editing takes place in Meetings' Tiptap editor; the generic file editor does not currently synchronize changes back into Yjs.

The private plugin directory below holds recording buffers, internal state, recovery copies, and synchronization receipts. It is not mounted wholesale into the Files View. Migration preserves existing files. `workspace-files.json` records the stable folder and per-file checksums so synchronization can resume after failures or restarts.

**Meetings adds no business database tables.** It reuses the platform's plugin registry, Assistants, workspaces, Managed Queue, and Collaboration capabilities. Business content is stored in files. Yjs state and updates use the platform's existing collaboration storage, without plugin-specific tables or a separate WebSocket service.

```text
<dataDirectory>/<sha256(tenant, organization, user)>/<meeting-uuid>/
  meeting.json                 # Metadata, transcript checkpoints, document sequences, deletion tombstone
  notes.md                     # Markdown projection of Tiptap personal notes
  summary.md                   # Markdown projection of the editable summary
  documents/<kind>.initial.json # Idempotent migration seed; the platform persists subsequent CRDT state
  audio/microphone/<seq>.wav    # Audio awaiting processing
  audio/microphone/<seq>.json   # Sequence, time range, and SHA-256
  audio/system/<seq>.wav
  audio/system/<seq>.json
  transcript.json              # Completed transcript export; retry checkpoints live in meeting.json
  summaries/<version>.json     # AI history, evidence, input version, and structured summary
  summaries/<version>.md       # AI-generated Markdown history
  assistant/<operation>.input.json # Immutable stage or final input snapshot
  assistant/<operation>.output.json # Structured stage or final result
  assistant/<operation>.md      # Stage history, not official minutes
  processing/                  # Queue processing lock target
```

Directories use mode `0700` and files use `0600`. File locks protect read-modify-write operations; temporary files are fsynced and atomically replaced. Paths are derived only from trusted request scope. APIs do not accept owner or filesystem path fields. Records are isolated by user and organization and checked against their owning Assistant. On first open, a document migrates to platform Yjs. Its Markdown is then written only through CRDT projection, and the legacy overwrite-style notes API rejects further writes. Background processing does not overwrite personal notes or collaboratively edited summaries.

The server directory requires a persistent volume. Multiple workers must share a filesystem that supports POSIX file locking and atomic rename. Do not use public/static directories, ephemeral container layers, or object-storage mounts. Back up the entire directory. The initial search implementation scans meeting records and is intended for personal meeting collections; it has no separate full-text index.

Desktop caches audio under Electron's `userData/audio-capture`. Chunks and manifests use AES-256-GCM encryption, with random keys wrapped by the operating system's `safeStorage`. The cache is scoped to API, tenant, organization, user, Assistant, and View. Unacknowledged chunks remain on disk; successful completion acknowledgement clears the cache. After a crash, Retry upload resends persisted chunks. Pending local uploads do not expire automatically.

The server deletes audio after minutes are successfully generated. Failed audio is retained for 7 days by default, configurable from 1 to 30 days, and cleaned up when its owner loads the meeting library. This is not a global scheduled cleanup SLA. Deleting a meeting writes a tombstone before clearing content to prevent late uploads or queued work from resurrecting it. Backup and provider-side retention are outside the plugin's control.

## Installation and integration

Requirements: Xpert SDK/contracts 3.19+, working Managed Queue and `platform.collaboration` capabilities, and authorized language and speech-to-text models in the business organization. Recording requires macOS 15+, Desktop with the native audio bridge, and ChatKit UI with the generic client-command bridge. Workspace synchronization requires the platform's `VolumeSubtreeClient` to preserve `ENOENT` for missing files; localized error text must not determine file existence.

Deliver the corresponding changes across all three repositories. Installing this plugin alone on an older Desktop does not add native recording support.

```sh
# From xpertai/ (the official Nx workspace)
corepack pnpm install --frozen-lockfile
corepack pnpm exec nx run @xpert-ai/plugin-meetings:build
corepack pnpm exec nx run @xpert-ai/plugin-meetings:typecheck
corepack pnpm exec nx run @xpert-ai/plugin-meetings:test
corepack pnpm exec nx run @xpert-ai/plugin-meetings:verify:dist

# From the xpert-plugins root, after installing and building the harness as documented
node plugin-dev-harness/dist/index.js --workspace ./xpertai/apps/meetings --plugin @xpert-ai/plugin-meetings
```

1. Authenticate normally through the platform's `tools/scripts/local-plugin-cli.mjs` and use `createRequestHeaders`. The plugin declares `level=system`; install it at **tenant scope** in the Default tenant.
2. Set `dataDirectory` to a private persistent directory and `silenceSeconds` to the stage-summary silence interval, defaulting to 10 seconds. Summaries use the published Meetings Assistant's primary model. Legacy `summaryCopilotId` and `summaryModel` settings are accepted for compatibility but are not used for model calls.
3. After restarting, verify the plugin's actual `loadStatus=loaded`. Switch to the business **organization scope** to initialize the Meetings marketplace app. Initialization creates a dedicated workspace and Assistant.
4. Select a primary model with tool calling and an available `speech2text` model, then publish the Assistant. For an existing instance, update it from the template in Studio, confirm its local model settings, and publish it in place, preserving its Assistant ID and slug. The Workbench View is activated by the `meetings.notes` feature contributed by the `meetings.tools` middleware.
5. Build the corresponding `chatkit-js/packages/chatkit-ui` and use that build for Desktop's ChatKit URL. During development, run `corepack pnpm dev:ui -- --port 5174 --strictPort` in the chosen checkout and use `http://localhost:5174`. Preserve other running instances.
6. Run `corepack pnpm build` in `xpert/apps/desktop`. The build compiles a universal arm64/x86_64 Swift helper and packages it outside asar. Verify actual macOS permission attribution in the signed app before release.
7. Open the Assistant's Meetings View, start recording manually, grant microphone and system-audio permissions, and confirm activity on both tracks before validating post-meeting processing.

For direct audio input, configure `inlineTranscription` with a Tongyi provider that supports Qwen inline audio, an authorized copilot, and `qwen3-asr-flash`. The plugin submits bounded WAV batches as Base64 through the platform's scoped model runtime. The server uses existing provider credentials, so no public audio URL is needed. This setting takes precedence over the Assistant's speech model; removing it restores the default STT service path. The platform still enforces account, organization, and model access. Administrator-configured models must be accessible to the business organization using the plugin.

URL-based providers such as Paraformer require a provider-accessible URL from platform FileStorage. Do not expose the private Meetings directory as public static content. The corresponding Xpert STT change removes temporary files after the model call; older APIs do not include that cleanup. The Qwen Base64 path creates no public temporary file. Base64 is an encoding, not encryption, and the provider receives the audio content.

Summarization runs in the published Assistant through `AssistantTaskRuntimeCapability`, reusing normal conversations, messages, execution records, and streamed output. The model reads the task's evidence and submits a structured result. The server validates scope, execution identity, exact quotations, and idempotency before writing Markdown.

Configuration example with placeholders only:

```json
{
  "dataDirectory": "/private/persistent/meetings",
  "silenceSeconds": 10,
  "silenceThresholdDb": -50,
  "inlineTranscription": {
    "copilotId": "<authorized-speech-copilot-uuid>",
    "model": "qwen3-asr-flash"
  },
  "failedAudioRetentionDays": 7
}
```

## Recording availability and permissions

Recording is available only in Xpert Desktop on macOS 15 or later. In a browser or a host without the audio-capture capability, the recording dialog explains how to open a supported Desktop and disables Start recording. Existing meetings remain available for viewing and editing.

If Desktop reports `audio_permission_denied`, the dialog directs users to macOS System Settings → Privacy & Security to allow Microphone and Screen & System Audio Recording for Xpert Desktop. The meeting title is preserved so users can retry. A transport failure gets a separate connection message, rather than being classified as an OS permission denial. All messages support Chinese and English.

## Capabilities and limits

- `desktop.audio.capture.start/stop/state/retry` are host client commands. Starting requires trusted user activation, the current Assistant, plugin provenance, and a manifest allowlist. The iframe has no audio permissions, direct API credentials, or browser persistence.
- View actions: `capture.event` (created/started/stopped), `capture.chunk` (file transport), `notes`, `edit`, `retry`, `delete`, `export`, `document.session/update/sync`, and `workspace.sync`. UUIDs, sequence numbers, and SHA-256 provide idempotency. Sealed recordings reject additional audio.
- Automatic summary tools: `meetings_summary_context` and `meetings_summary_submit`. Only the authorized task execution can submit a stage result or final minutes. Ordinary follow-up questions do not overwrite official minutes.
- Read-only Agent tools: `meetings_search`, `meetings_get`, and `meetings_transcript`. The model cannot start recording, send email, create external tasks, or share meetings automatically.
- Microphone and system audio are independent tracks, not inferred speaker identities. During recording, transcription processes approximately 5-second chunks. After recording, up to 12 adjacent chunks, normally about 60 seconds, are combined for contextual refinement. Live text is a draft. Stage summaries cite live text; final minutes cite the refined full transcript. Timestamps identify segments, not individual words.
- Summary quotations must be exact substrings of existing transcript segments. Unspecified owners and dates remain null. Human edits to suggested actions may go beyond the original AI extraction; evidence remains available for comparison.
- Recording lasts at most 4 hours and cannot be paused. Track loss, sleep, exit, scope changes, and disk errors stop capture.
- Personal notes and summaries use Tiptap and Yjs with headings, emphasis, lists, quotations, undo/redo, and presence. Changes are batched after 300 ms and marked saved only after platform acknowledgement. Unacknowledged edits stay in memory and are retried; users can download a Markdown draft before leaving. Document save failures do not block stopping a recording. Unacknowledged input may be lost if the app is forcibly terminated.
- The library is paginated. Details contain a bounded full transcript, displayed in groups of 40 segments; Agent transcript queries use server-side pagination.
- There is no calendar dependency. Calendar integration, meeting-member authorization, multi-user calls, and external action execution are future work. Current Meetings APIs and collaborative documents are accessible only to the meeting owner; multiple windows of the same account can synchronize. Projected files follow existing Assistant workspace permissions, which the plugin does not modify.

## Preview and integration scripts

```sh
# From xpertai/
corepack pnpm exec nx run @xpert-ai/plugin-meetings:preview
# http://127.0.0.1:4417
```

The preview loads the production React/CSS build for library and recording layouts. Tiptap editing requires real platform Collaboration; the static adapter does not simulate successful saves. Recordings, transcripts, and people in the preview are **synthetic**, and no microphone is used. Set `MEETINGS_PREVIEW_LOCALE=en-US MEETINGS_PREVIEW_THEME=dark` for an English dark preview. The View name, Workbench menu, and page title use host locale with an English fallback. See the [implementation plan](docs/development-plan.md).

Run the live API smoke script with `scripts/live-smoke.mjs <platform-root> <private-context.json> <private-output-dir> <synthetic.wav>`. The private context contains the current account's authorized `organizationId` and `assistantId`, plus an optional `apiUrl`. Keep context and receipts outside the source tree. Input must be synthetic 24 kHz mono 16-bit PCM WAV. The script creates an explicitly labeled test meeting and retains receipts. It exits 0 only when transcription and minutes are ready, or 2 if preliminary business checks pass but model processing fails.

For collaboration, use `scripts/live-collaboration.mjs <platform-root> <private-context.json> <private-output-dir>`. It verifies two-client convergence, duplicate updates, reconnects, presence, and Markdown export through authorized View APIs and the platform WebSocket.

For workspace files, use `scripts/live-workspace.mjs <platform-root> <private-context.json> <private-output-dir>`. It checks existing-record backfill, Markdown/JSON consistency, new meetings, Yjs projection, stable folders, and temporary test-meeting cleanup. Legacy JSON-only summaries are converted to Markdown from stored history without new model calls.

See [live transcription and collaboration](docs/realtime-collaboration.md) for architecture and future multi-user boundaries, and [Assistant summaries](docs/assistant-summaries.md) for silence-triggered stages and final minutes.

## Generic audio capture protocol

The plugin registers View callbacks through `delivery.eventAction` and `delivery.chunkAction`, passing the meeting ID and title as opaque `delivery.context`. Desktop owns audio capture and reliable delivery; Meetings business rules remain in the plugin. Trusted activation is carried by top-level `userActivated` on the ChatKit command envelope and cannot be forged through the plugin payload.

The host generates `captureId`. The plugin maps it to a meeting and persists association and event receipts at `captures/<assistant-hash>/<captureId>/binding.json` under the private user directory. Reopening a View resolves the association by `captureId`. Delivery is at least once; stable `eventId`, chunk sequence, and checksum prevent duplicate effects. A failed queue write does not acknowledge the stopped event, and retries never reopen devices. Startup failure can deliver a zero-chunk stopped event without a preceding started event. Deletion tombstones prevent late delivery from resurrecting records.

The plugin boundary validates the public v1 wire contract with strict schemas. Contract verification uses the actual Desktop controller/delivery implementation, synthetic native events, and temporary directories without opening a microphone or contacting a live API:

```sh
# From xpertai/
corepack pnpm exec nx run @xpert-ai/plugin-meetings:build
corepack pnpm exec nx run @xpert-ai/plugin-meetings:verify:desktop -- /path/to/xpert
# Chrome must be installed, or set MEETINGS_CHROME_PATH to its executable
corepack pnpm exec nx run @xpert-ai/plugin-meetings:verify:capture-feedback
```

This does not replace signed-app permission checks, real model calls, long recordings, or offline-recovery acceptance.
