---
'@xpert-ai/plugin-wecom': patch
---

Fix WeCom long-connection auto-restore handling so status checks can restore restorable sessions after API restarts without recovering manually stopped sessions.

Keep WeCom callback text filtering compatible with local Xpert hosts that do not export `filterMessageText` from `@metad/contracts`.
