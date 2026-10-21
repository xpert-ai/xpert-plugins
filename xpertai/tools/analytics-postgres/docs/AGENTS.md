# PostgreSQL analytics documentation

This Mintlify project documents the provider under `xpertai/tools/analytics-postgres`.
Use MDX pages with YAML frontmatter and keep `docs.json` navigation synchronized.

- Distinguish the platform Dataset/Binding contract, this SQL provider, and the PostgreSQL database driver.
- Use the explicit provider ID `postgres.sql` and operation version 1.
- Explain parameter binding, declared field types, partial results and current-viewer authorization.
- Keep credentials, machine paths and private acceptance evidence out of documentation.
- Separate unit/lifecycle checks from real database and product acceptance.
- Include new pages in navigation and verify they ship in the package.
