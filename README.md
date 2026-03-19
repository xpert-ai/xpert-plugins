# XpertAI Plugin Repository 🚀

Welcome to the official source code repository for plugins on the [XpertAI platform](https://github.com/xpert-ai/xpert).

This repository serves as the central hub for developing, sharing, and maintaining XpertAI plugins. The `xpertai/` directory contains officially maintained plugin projects, while partners and community contributors can create their own independent project folders at the root level.

For detailed plugin development and release guidelines, please visit our [official documentation](https://xpertai.cn/docs/plugin/).

## 📁 Repository Structure

```
xpert-plugins/
├── xpertai/           # Official plugin projects (managed with Nx)
├── <your-org>/       # Partner/community plugin directories
└── ...
```

- **`xpertai/`** - Officially maintained plugin projects, using Nx build tool for efficient monorepo management
- **`<your-org>/`** - Partner or community plugin directories. Create a top-level folder using your organization's English name

## 🚀 Getting Started

### For Official Plugin Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/xpert-ai/xpert-plugins.git
   cd xpert-plugins/xpertai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Explore available plugins**
   ```bash
   npx nx graph    # Visualize project dependency graph
   npx nx list     # List all projects and available commands
   ```

4. **Common commands**
   ```bash
   npx nx build <project>  # Build a specific plugin
   npx nx test <project>   # Run unit tests
   npx nx lint <project>   # Perform code linting
   ```

### For Creating Partner Plugins

1. **Create your organization directory**
   - Add a new directory named after your company/organization in the repository root
   - Example: `my-company/`

2. **Initialize your project**
   - Follow the [official documentation](https://xpertai.cn/docs/plugin/) for setup instructions
   - Reference existing projects in `xpertai/` for best practices
   - Use the [plugin starter template](https://github.com/xpert-ai/xpert-plugins-starter) for quick setup

3. **Document your plugin**
   - Include a README explaining the plugin's purpose, features, and usage
   - List dependencies and installation requirements
   - Provide examples and troubleshooting tips

## 🤝 Development & Contribution

### Before Contributing

- ✅ Follow coding standards in your project directory
- ✅ Ensure all local builds and tests pass
- ✅ Keep documentation up-to-date
- ✅ Comply with your organization's naming and branching conventions

### Pull Request Checklist

Before submitting a PR, please ensure:

- [ ] Code passes Lint, Test, and Build checks
- [ ] Documentation is updated (README, CHANGELOG, etc.)
- [ ] Commits follow conventional commit format
- [ ] PR description clearly explains changes
- [ ] For official plugins: discussed with the maintenance team first

### Code Review Process

- All PRs require review and approval
- CI/CD checks must pass before merge
- Major changes to official plugins require maintainer approval

## 📦 Plugin Release & Registration

1. **Build & Publish**
   - Follow the [official release guide](https://xpertai.cn/docs/plugin/)
   - Ensure version numbers follow semantic versioning

2. **Register Your Plugin**
   - Add metadata to the [plugin registry](https://github.com/xpert-ai/xpert-plugin-registry)
   - Provide complete information:
     - Plugin name and version
     - Description and features
     - Dependencies
     - Maintainer contact
     - License

3. **Keep it Updated**
   - Maintain accurate metadata as your plugin evolves
   - Update registry entries with new releases

## 💬 Support & Feedback

- **Platform Issues**: Contact XpertAI support or your enterprise customer success team
- **Repository Issues**: Create a [GitHub Issue](https://github.com/xpert-ai/xpert-plugins/issues) with detailed reproduction steps
- **Feature Requests**: Open an issue with the `enhancement` label
- **Questions**: Use GitHub Discussions for community Q&A

## 📄 License

Please refer to the LICENSE file for details.

## 🙏 Acknowledgments

Thank you for contributing to the XpertAI plugin ecosystem! Your help makes the platform more powerful and accessible for everyone.

---

**Need Help?** Check out our [documentation](https://xpertai.cn/docs/plugin/) or join our community discussions.
