# XpertAI Plugin Repository

This is the source code repository for plugins on the [XpertAI platform](https://github.com/xpert-ai/xpert). The `xpertai/` folder contains officially maintained plugin projects. Partners or community contributors can create independent project folders in the root directory according to their company or organization, and maintain their own plugin code within. For plugin development and release processes, please refer to the official documentation: <https://xpertai.cn/docs/plugin/>.

## Repository Structure

- `xpertai/`: Official plugin projects, managed with the Nx build tool for multiple plugin packages.
- `<your-org>/`: Partner or community contributor plugin directories (example). Please create a top-level directory using your company or organization’s English name, and maintain plugin projects within.

## Getting Started

1. Clone the repository and enter the root directory.
2. To view or participate in official plugin development:
    - Enter `xpertai/` and run `npm install` to install dependencies.
    - Use `npx nx graph` or `npx nx list` to explore current plugins and tasks.
    - Common commands:
      - `npx nx build <project>` to build a plugin.
      - `npx nx test <project>` to run unit tests.
      - `npx nx lint <project>` to perform code linting.
3. To create a new partner plugin:
    - Add a new `<your-org>/` (your company/organization’s English name) directory in the repository root.
    - Refer to the [official documentation](https://xpertai.cn/docs/plugin/) or the sample projects in `xpertai/` to initialize your project structure.
    - You can also use the plugin project template repository to get started quickly: <https://github.com/xpert-ai/xpert-plugins-starter>.
    - It is recommended to provide a README or documentation explaining the plugin’s purpose, dependencies, and usage.

## Development and Contribution Process

- Please follow the coding, testing, and release standards in your project directory, and ensure local builds and tests pass before submitting.
- Before submitting a Pull Request, please ensure:
  - Your code passes necessary Lint, Test, and Build checks.
  - Relevant documentation is updated (such as plugin README, CHANGELOG, etc.).
  - You comply with your organization’s internal naming and branching conventions, as well as those of this repository.
- For changes to public files or official plugins, please communicate with the maintenance team first to ensure alignment.

## Plugin Release and Registration

### Release Workflow (Validated)

This repository uses `.github/workflows/release-plugin.yml` to release plugins in each workspace (`xpertai`, `community`) with **Changesets + OIDC trusted publishing**.

1. Before release, run plugin tests first (follow `plugin-dev-harness/README.md`).
2. Enter the target workspace and create a changeset:
   - For `xpertai`: `cd xpertai && pnpm exec changeset add`
   - For `community`: `cd community && pnpm exec changeset add`
3. Check pending release plan locally:
   - `pnpm exec changeset status`
4. Submit PR with both code changes and `.changeset/*.md`, then merge into `main`.
5. Workflow will create or update the release PR (`changeset-release/main`) with version bumps.
6. Merge the release PR into `main`; workflow then publishes changed packages to npm.

Notes:
- If logs show `No changesets found`, the merged commit did not contain a valid `.changeset/*.md` for that workspace.
- If logs show `ENEEDAUTH`, verify npm Trusted Publisher settings for that package.

### New Package Checklist (Required)

When creating a new publishable package, ensure `package.json` includes at least:

```json
{
  "name": "@xpert-ai/plugin-xxx",
  "version": "0.0.1",
  "repository": {
    "type": "git",
    "url": "https://github.com/xpert-ai/xpert-plugins"
  }
}
```

Important:
- `repository.url` must match the GitHub repository used by provenance/OIDC (recommended exact value: `https://github.com/xpert-ai/xpert-plugins`).
- If this field is missing or empty, npm may reject publish with provenance error (`E422`).
- Trusted Publisher is configured per npm package. A brand-new package may require one bootstrap publish before switching to OIDC-only publishing.

After releasing your plugin, register/update plugin metadata in: <https://github.com/xpert-ai/xpert-plugin-registry>.

## Support and Feedback

- For issues with the official platform: contact XpertAI support channels or your enterprise customer success contact.
- For repository maintenance issues: create an issue in the GitHub Issues section, describing the situation and steps to reproduce.

Thank you for contributing to the XpertAI plugin ecosystem!
