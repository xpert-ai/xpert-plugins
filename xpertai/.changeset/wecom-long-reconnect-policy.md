---
'@xpert-ai/plugin-wecom': patch
---

Fix WeCom long-connection auto-restore policy so API restarts do not recover manually stopped sessions while explicit reconnects and valid configuration saves can start them again.
