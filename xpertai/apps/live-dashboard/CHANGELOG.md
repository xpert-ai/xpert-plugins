# @xpert-ai/plugin-live-dashboard

## 0.1.3

### Patch Changes

- b025616: Allow LiveDashboard to initialize when legacy hosts omit optional middleware configuration, while retaining strict validation of explicit invalid options and provider lists.

## 0.1.2

### Patch Changes

- 1056034: Preserve the Project navigation target when opening dashboards, switching versions, and following Assistant tool results. Revalidate data source sharing compatibility before publishing a new version followed by an active team share, preserving the previous published version and link when a draft contains private or unavailable dependencies.

## 0.1.1

### Patch Changes

- 19ac008: Publish the first patch release of Live Dashboard and the analytics providers through the GitHub Actions `release-plugin.yml` trusted publisher after the manual npm 0.1.0 bootstrap release.

  Ship the packages from the xpertai workspace with repository metadata for trusted publishing, published SDK/contracts 3.25.0, and the published Data Analytics renderer. Clean builds resolve the required runtime capabilities without local platform or cross-workspace links.
