# @xpert-ai/plugin-canvas

## 0.5.3

### Patch Changes

- 14cc9b6: Upgrade tldraw and its schema to 5.6.0, which fixes late font loads after an editor is closed. Bundle the matching official translation catalogs through the public assetUrls API so opening a canvas and switching languages no longer fetch translations from a CDN. Remove the Canvas dependency patches and align AI-created geometry and notes with the new schema. Requires Node.js 22.12 or later.

## 0.5.2

### Patch Changes

- bcafd42: Replace local SDK compatibility types and casts in Meetings, Notion Connector, XMLA, Cut and Canvas with published SDK / Contracts 3.26.2 contracts. Raise only these plugins' host requirements and pin their development SDK for reproducible validation.

## 0.5.1

### Patch Changes

- 4c0a7c6: Publish application covers using the platform's marketplace screenshot inheritance. Keep App overrides optional, synchronize portable manifest versions, and verify runtime/manifest screenshot metadata and bundled image assets before publishing.

## 0.5.0

### Minor Changes

- 88c1f06: Publish refreshed application cover images and SVG/PNG icons, including bundled branding assets and marketplace screenshot metadata.

## 0.4.6

### Patch Changes

- 7cc62cd: Expose the bundled applications in Xpert discovery with localized app descriptions, business categories, dedicated organization workspaces, and links to their Assistant templates. Keep portable and runtime metadata aligned, enable the Sites template for Xpert, and require compatible app configuration contracts.
