---
'@xpert-ai/plugin-db-studio': patch
---

Route database change approval and execution through ChatKit human review. Validate the frozen plan, permissions, policy revision, and expiry before review and again on approval; reject malformed decisions and avoid replaying completed or uncertain writes. Replace direct workbench approval controls with chat review and receipt refresh actions.

Provide localized review summaries and structured execution sections from the plugin. Requires the ChatKit release supporting optional HITL display metadata; older clients retain the original description and arguments.
