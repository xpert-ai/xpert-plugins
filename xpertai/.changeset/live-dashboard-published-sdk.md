---
'@xpert-ai/plugin-live-dashboard': patch
---

Build Live Dashboard with published SDK and contracts 3.27.0, replacing the local
Artifact document network-policy backport with the released browser runtime.

Allow scripts, styles and fonts from the declared HTTPS origins in both the viewer
and HTML preflight, and reject saves when required online resources fail to load.
Discover missing query contracts before previews, preserve actionable diagnostics,
and bound repeated or concurrent failed previews so the Agent cannot loop indefinitely.
