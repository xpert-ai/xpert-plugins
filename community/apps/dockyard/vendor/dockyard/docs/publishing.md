# Releases and npm publishing

The npm package is `@wieslawsoltes/dockyard`. It has no runtime dependencies and uses typed ES module exports. The headless model entry point shares constructor identity with the root entry point. TypeScript consumers include `DOM` in `lib`, because the shared declarations also describe browser-facing APIs. The classic script bundle is a separate browser global asset.

## Prepare a release

1. Open a PR with the changes. Update `package.json`, `package-lock.json`, `src/index.js`, declaration/sample version text, `CHANGELOG.md` and `docs/release-notes.md` when releasing a new version.
2. Wait for Node 22/24 source and installed-consumer checks and the Node 24 Chromium interaction/HTTP/persistence checks, then merge the PR.
3. The main workflow builds one npm tarball and stages that same file in the Pages download. It archives the browser distribution, complete showcase and source ZIP, writes SHA-256 checksums, publishes GitHub Packages, and creates `v<version>` on GitHub.
4. The reusable npm job downloads the release tarball, checks its digest and installed consumers, and publishes those exact bytes with provenance.
5. Public verification checks SHA-512 integrity, the distribution tag, full npm install package index, provenance metadata, downloaded consumers and a fresh anonymous package-name installation. New registry metadata may take up to five minutes to propagate.

The workflow deploys the verified Pages artifact and checks its commit and public asset URLs. Generated builds and test reports are uploaded as artifacts; the workflow does not write commits to the source branch. Existing versioned release assets are retained unchanged. Commits using a version already released by another commit deploy the sample without republishing npm.

## Authentication

Set the repository secret `NPM_TOKEN` to a granular npm token with read/write publish access to the `@wieslawsoltes` scope and bypass two-factor authentication enabled. The publish step alone receives it as `NODE_AUTH_TOKEN`. Anonymous metadata/download/installation checks do not use it. The job uses the `npm` GitHub environment.

GitHub Packages uses the automatic `GITHUB_TOKEN`. npm trusted publishing can alternatively be configured for this repository and the invoking `ci.yml` workflow; the npm job uses npm 11 with `id-token: write`. A manually dispatched `npm-publish.yml` run has its own workflow identity.

## Retry safely

Rerun the failed npm job in the existing CI run, or manually run **Publish npm registry** with the existing release tag, optional expected commit SHA and `latest` or `next` tag. Identical existing npm bytes skip publication and repeat verification. Different bytes for an immutable version fail. Authentication and transport errors are never treated as proof that a version is absent.

The GitHub release tarball remains directly installable:

```sh
npm install https://github.com/wieslawsoltes/Dockyard/releases/download/v0.1.0/wieslawsoltes-dockyard-0.1.0.tgz
```
