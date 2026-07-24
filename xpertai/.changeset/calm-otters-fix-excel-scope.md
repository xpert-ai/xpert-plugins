---
'@xpert-ai/plugin-office-editor': patch
---

Keep renamed XLSX worksheets valid by rewriting dependent cell formulas and defined names, while rejecting unsupported 3D references instead of producing broken workbooks.

Preserve the persisted workspace storage scope for subsequent Excel edits and Workbench saves so documents opened from another assistant do not move file versions across Xpert-owned artifact scopes.
