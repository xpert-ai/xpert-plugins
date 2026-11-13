---
'@xpert-ai/plugin-analytics-data-xpert': minor
'@xpert-ai/plugin-analytics-files': minor
---

Validate source-specific authority before delegating dataset analysis to a group. Data Xpert checks the current human's data-administrator and binding permissions through its authenticated qualification endpoint. File datasets require management of the source Project and access to the exact declared file. Qualification reads no business rows and does not replace each later query's caller permissions.
