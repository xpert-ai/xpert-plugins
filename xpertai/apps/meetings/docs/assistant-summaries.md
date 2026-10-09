# Silence-triggered summaries and final meeting minutes

## User flow

1. The user starts recording in the right-hand plugin View. Both audio tracks are transcribed continuously.
2. When microphone and system audio are both quiet for at least `silenceSeconds` (10 seconds by default), and new nonempty transcript text is available, that text is sent as a Markdown blockquote to the meeting's dedicated Meetings Assistant conversation.
3. The Assistant displays a stage summary. The View shows the completed-stage count and an Open meeting conversation action. A recording started on the current page automatically opens its first task conversation while preserving the plugin View. Navigating away from the meeting disables automatic return.
4. The user can ask follow-up questions in the same conversation. Plugin tasks run sequentially and wait while the conversation is processing a human message.
5. After recording ends, uploads finish and the transcript is refined. The unsent final segment is submitted in the same conversation. The final task reads the entire refined transcript and personal notes, combining previous stage results into overall minutes. Original evidence takes precedence over stage interpretations.
6. A successful final submission writes `summary.md` and `summaries/<version>.md` for Tiptap display, editing, and export. Stage results remain history and are not presented as official minutes.

## Silence semantics and latency

- The server detects silence from 20 ms RMS frames of 24 kHz PCM. `silenceThresholdDb` defaults to -50 dBFS and supports -80 to -20. This is audio-energy detection, not speaker identification or semantic VAD.
- Both tracks must be quiet. Speech, music, or significant background noise on either track delays the trigger. Continuous silence does not repeatedly send empty messages.
- The boundary uses the minimum contiguous uploaded-and-transcribed watermark across both tracks. Network disconnection, missing chunks, and ASR queueing do not count as silence.
- Recording uploads approximately 5-second chunks. The 10-second setting measures silence on the audio timeline; visible summaries also depend on upload, ASR, queue, and model latency. A summary is not guaranteed to appear at exactly 10 seconds.
- `silenceSeconds` supports 1–300 seconds and is fixed when a meeting is created. Configuration changes apply to new meetings.

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| Desktop | Trusted user activation, microphone/system capture, encrypted cache, and delivery |
| Plugin | Audio activity detection, ASR, stage watermarks, input snapshots, serialized/idempotent tasks, evidence validation, and minutes files |
| Platform Assistant runtime | Published models and tools, conversations and messages, execution admission, status, and streamed output |
| ChatKit / Workbench | Actual Assistant conversation rendering and navigation to the same conversation through the public command |
| Tiptap and platform Collaboration | Human editing and Markdown projection, with authorization extension points for future shared meetings |

## Consistency and files

Each meeting stores one `conversationId`. Each stage/final task has stable `operationId`, `executionId`, and `clientMessageId` values. `meeting.json` is the source of truth for the outbox and progress; the queue carries only trusted scope and meeting ID. Redelivery reuses those identities and immutable prompts instead of creating another message.

Task input is stored in `assistant/<operation>.input.json`, including source versions, complete evidence, and quoted passages. The Agent returns content judgments and `evidenceId` values. The server determines meeting ownership, original quotations, version, and destination files. Only the bound execution may submit; model-provided paths or owner IDs cannot select a write destination.

A successful stage does not complete the meeting, and a successful platform execution does not prove that minutes exist. A valid domain result must be submitted before activating the final version. Unknown execution states remain subject to reconciliation rather than being inferred successful. An in-flight stage settles before the final task starts. Failed history is retained, and final summarization still uses the complete original transcript. The existing retry action can retry final processing.

Quoted transcript text is untrusted meeting data, not executable instructions. Current meetings are isolated by tenant, organization, and user. Future shared access must extend scope resolution and document authorization centrally, not merely frontend visibility. Meetings adds no business tables and reuses existing conversation, execution, queue, and collaboration storage.

Once a collaborative summary document exists, regenerated AI versions are stored in history without overwriting the document being edited. Personal notes remain independent.

User-facing files live at the Assistant workspace root under `meetings/<date-title-meeting-uuid>/`, outside `sessions/`. Final `summary.md`, `notes.md`, transcripts, stage summaries, and AI history share one stable folder. Tiptap/Yjs remains authoritative for collaborative documents; workspace Markdown and private recovery copies are rebuildable projections.

Projection uses the host-provided workspace catalog and the creating Assistant. It does not infer paths or scope from model parameters. The final submission tool returns `saved: true` and the complete relative file path only after workspace synchronization succeeds. If content is committed but file synchronization fails, it returns `contentSaved: true, saved: false`; the View offers a separate file synchronization action.

Existing meetings are backfilled on authorized access. Migration failure neither deletes source content nor creates another meeting or conversation.

## Platform dependencies and verification

The first background turn must acquire the conversation execution lock through `ChatExecutionAdmissionService`. `AssistantTaskRuntimeService` must not mark a new conversation busy before admission, or it will reject its own start as a concurrency conflict. Startup failure must also settle the precreated execution as failed.

Unit coverage includes dual-track silence, watermark gaps, skipping silent ASR input, duplicate dispatch, restart recovery, sequential stages, final-tail and full-meeting evidence, rejection of foreign users or incorrect executions, idempotent file writes, and completed executions with no domain result.

Run `scripts/live-assistant.mjs <platform-root> <private-context.json> <private-output-dir> <synthetic.wav>` against an authorized platform. Synthetic 24 kHz mono PCM input exercises two silence-triggered stages, conversation reuse, the final tail, and Markdown minutes. Keep raw receipts, account identifiers, and credentials in a private directory outside the repository.
