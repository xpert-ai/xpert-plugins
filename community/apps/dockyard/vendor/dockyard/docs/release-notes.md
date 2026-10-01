# Dockyard 0.1.0

First public npm release of the dependency-free docking component:

```sh
npm install @wieslawsoltes/dockyard@0.1.0
```

Use ES modules from `@wieslawsoltes/dockyard`, headless layout models from `@wieslawsoltes/dockyard/model`, and styles from `@wieslawsoltes/dockyard/styles.css`. TypeScript declarations and the standalone browser distribution are included.

The release pipeline validates Node 22/24, installed-package behavior and TypeScript, Chromium interactions, HTTP entry points and persistence. It publishes immutable npm/browser/showcase/source archives with SHA-256 checksums, GitHub Packages and a provenance-enabled public npm package, then verifies the public download and a fresh installation.

The [live Dockyard demo](https://wieslawsoltes.github.io/Dockyard/) and existing compatibility documentation remain available. This release preserves the existing AvalonDock-style browser API and its documented platform boundaries.
