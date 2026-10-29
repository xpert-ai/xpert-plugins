---
'@xpert-ai/plugin-spaces': minor
'@xpert-ai/plugin-markdown-editor': patch
---

Add governed Artifact references to Spaces, including version selection, share links, revocation, and localized artifact type labels. Keep references subject to source and project permissions, and require explicit confirmation for independent copies.

Require Plugin SDK and Contracts 3.29.0 for the Artifact Library capability and permission-checked export API. Bundle one React runtime in Spaces and Markdown Editor remote views.

Resolve React and React DOM declarations against each remote view's own type dependencies so shared UI icons, controls, and JSX use React 18 consistently in a workspace that also installs React 19.
