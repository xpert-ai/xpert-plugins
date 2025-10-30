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

1. Complete the plugin packaging and release process according to the official guide: <https://xpertai.cn/docs/plugin/>.
2. After releasing your plugin, you can register its metadata in the registry repository: <https://github.com/xpert-ai/xpert-plugin-registry>.
3. When registering, please provide complete metadata (plugin name, version, description, dependencies, maintainer contact, etc.) and keep the information up to date.

## Support and Feedback

- For issues with the official platform: contact XpertAI support channels or your enterprise customer success contact.
- For repository maintenance issues: create an issue in the GitHub Issues section, describing the situation and steps to reproduce.

Thank you for contributing to the XpertAI plugin ecosystem!
