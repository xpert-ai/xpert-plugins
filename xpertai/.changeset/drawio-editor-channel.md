---
'@xpert-ai/plugin-drawio': patch
---

Fix communication with the bound draw.io editor in opaque sandboxed views. Validate the editor window and message origin, use export/xml for host-initiated scene reads, and accept supported XML save responses. Include the updated workbench bundle and editor-channel regression tests.
