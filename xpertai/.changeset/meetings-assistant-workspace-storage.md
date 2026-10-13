---
"@xpert-ai/plugin-meetings": minor
---

Store meeting manifests, audio, capture receipts and processing checkpoints in the owning Assistant's user-isolated workspace through WorkspaceFilesRuntimeCapability.appData(). Remove the independent dataDirectory setting and use host-managed cross-instance locks and atomic writes. Require a host with WorkspaceFilesRuntimeCapability.appData(); old plugin-directory data is not migrated. Return explicit missing-meeting and workspace-configuration errors.
