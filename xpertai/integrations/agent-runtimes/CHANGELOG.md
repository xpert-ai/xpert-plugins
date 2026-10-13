# @xpert-ai/plugin-agent-runtimes

## 0.3.0

### Minor Changes

- 31084f6: Capture public Qwen, Codex and OpenCode activity through the optional host recorder. Preserve stable tool identity, source checkpoints, truncation diagnostics and finalization order. Emit one direct execution resource card and retain independent file deliveries.
- cb067a0: Add managed Computer runtimes for CodeBuddy 2.161.1, Kimi Code 2.1.1 and
  Claude Code 2.1.63. Reuse checkpointed single-prompt execution, scoped recovery,
  cancellation, explicit file delivery and public coding activity. Verify native
  terminal receipts instead of treating a completion sentence as success.
  Kimi tool outcomes remain unknown when the protocol omits them.

  Requires the accompanying host CLI profiles and SDK prompt-argument transport;
  release together with the contracts/plugin-sdk 3.20.0 host update.

- 31084f6: Add Computer execution for Codex 0.159.2 using the host-managed JSONL task transport. Checkpoint before dispatch, inspect without replay, require final protocol and process-exit evidence, export explicitly requested files, and persist results before cleanup. Preserve the existing non-Computer App Server adapter.
- 31084f6: Add a Qwen Code 0.24.7 Computer Runtime with structured result verification,
  checkpointed recovery, cancellation and explicit artifact delivery. Share the
  Computer JSONL lifecycle with Codex while keeping provider result parsing separate.

### Patch Changes

- 31084f6: Preserve concrete Qwen/Codex completion failure diagnostics before Computer
  cleanup and return them through invocation errors. Keep recovered intermediate
  permission failures as diagnostic facts instead of overriding a successful final
  CLI receipt. Continue requiring verified protocol completion and process exit 0.
- 31084f6: Report OpenCode activity and actual assistant-message start time from the matching submitted run, without inventing percentages or treating admission as execution. Preserve task-specific requirements for complete code evidence and JSON-encoded review reports in the result envelope.
