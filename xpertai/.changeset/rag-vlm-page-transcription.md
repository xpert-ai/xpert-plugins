---
"@xpert-ai/plugin-rag-vlm": minor
---

Transcribe parser-provided PDF page images as Markdown with page provenance for host chunking. Preserve context parents, deduplicate image recognition across overlapping chunks, accept structured model text responses, and report individual image failures while retaining source text.

Require plugin SDK 3.15.18 or later. Deploy the companion host OCR chunking changes to apply text and token limits to page transcripts and preserve chunk ordering.
