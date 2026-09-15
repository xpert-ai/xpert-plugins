---
"@xpert-ai/plugin-markitdown": minor
---

Add knowledge document conversion through platform-managed Sandbox Jobs and the document/python-3.12/v1 Runtime, including PDF, Word, PowerPoint, HTML and text formats. Preserve embedded images for shared image understanding and report bounded conversion errors and missing scan pages.

This version changes installation from organization scope to system scope. Administrators must preserve organization bootstrap settings, remove legacy organization installations and install the new system plugin. Requires plugin SDK 3.15.18 or later and a host with the document Python Runtime and trusted knowledge file scope. Existing agent CLI skills remain available; organization-specific pip settings can be retained on each agent's middleware configuration.
