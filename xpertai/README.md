# Xpert Plugins Starter

[Learn more about this workspace setup and its capabilities](https://nx.dev/nx-api/js?utm_source=nx_project&amp;utm_medium=readme&amp;utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

## Setup

1. Install dependencies:

```sh
pnpm install
```

## Generate a plugin library

To create different types of plugins, you can replace 'packages' with different folder names to organize plugins into different libraries.

- models: for AI models
- tools: for AI tools
- agents: for AI agents
- databases: for databases
- integrations: for third-party service integrations
- middlewares: for agent middlewares
- packages: for general-purpose libraries

```sh
pnpm nx g @nx/js:lib packages/pkg1 --publishable --importPath=@my-org/pkg1 --bundler=tsc --unitTestRunner=jest --linter=eslint
```

## Run tasks

To build the library use:

```sh
pnpm nx build pkg1
```

To run any task with Nx use:

```sh
pnpm nx <target> <project-name>
```

These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Versioning and releasing

This workspace releases packages with **Changesets + GitHub Actions (OIDC trusted publishing)**.

```sh
pnpm dlx @changesets/cli add
```

Run the command above in `xpertai/` whenever a publishable plugin changes, then merge your PR into `main`.

Useful local checks:

```sh
pnpm dlx @changesets/cli status
```

### First-time publish (bootstrap)

For a brand-new package (for example `@xpert-ai/plugin-xxx` never published before), use this bootstrap flow:

1. Build and publish the first version once with a temporary npm token (run from repository root):
   ```sh
   cd xpertai
   pnpm exec nx run <nx-project-name>:build
   pnpm exec nx run <nx-project-name>:nx-release-publish --access public --otp=<your_2FA_otp_if_enabled>
   ```
2. In npm package settings, configure Trusted Publisher for this repository/workflow [New Package Checklist](../README.md#new-package-checklist-required)

Tip:
- If CI shows `ENEEDAUTH This command requires you to be logged in`, it usually means bootstrap (step 1) is still required for that package.

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/nx-api/js?utm_source=nx_project&amp;utm_medium=readme&amp;utm_campaign=nx_projects)
- [Learn about Nx on CI](https://nx.dev/ci/intro/ci-with-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Changesets documentation](https://github.com/changesets/changesets)
- [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:

- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
