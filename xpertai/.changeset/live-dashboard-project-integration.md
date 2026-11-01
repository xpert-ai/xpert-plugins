---
'@xpert-ai/plugin-live-dashboard': minor
---

Add project selection to the Live Dashboard View and synchronize it with the Assistant ChatKit project through the existing authorized host navigation. Use a two-column Project → Dashboard picker with independent search and pagination, a persistent active-project highlight, and New dashboard in the dashboard column header. Search all authorized dashboard display titles, including editor drafts, without exposing them to members. Keep publication and refresh as primary toolbar actions; move secondary actions and version history into More, with a compact draft/published badge. Search and paginate projects available to the current user and Assistant; isolate dashboard lists and clear stale targets on project changes.

Keep the original dashboard authoring, version history, publication and sharing workflow inside the selected Project. Add the Live Dashboard project type and a project-required authoring Assistant template. Editors use revision-protected drafts, members consume published versions, and managers explicitly publish or share. Do not add a separate Project dashboard host or a plugin-specific delivery/review workflow.

Use protected Artifact content while keeping Project membership and authenticated share audiences cumulative. Sharing never grants Project membership, draft access or source-data permissions. Keep exact published-version and draft targets synchronized with the Assistant.

Requires the companion platform release providing protected Artifact content and draft publication authorization. Release that platform/SDK first and update the SDK dependency and lockfile before publishing this plugin.
