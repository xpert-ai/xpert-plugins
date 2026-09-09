---
'@xpert-ai/plugin-community-wechat': patch
---

Fix inbound image/file processing and queued workspace file sends by resolving Workspace Files through a fresh scoped runtime API for each operation. Preserve tenant, organization, Project, and personal Xpert ownership when replaying queued file references. Require Plugin SDK 3.18.0 or later for the scoped runtime contract.
