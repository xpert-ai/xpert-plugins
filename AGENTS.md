# General Guidelines for working with plugins workspace

- After developing or modifying any plugin, validate it by following `plugin-dev-harness/README.md` and run the plugin lifecycle test through `plugin-dev-harness` before considering the work complete.

- Never guess types, categories, or payload meaning from names, display text, localized copy, sample data, or incidental field combinations. Logic that depends on machine-readable distinctions must use explicit typed fields defined in shared contracts, such as discriminated unions or a stable `type`.
- If the required discriminator or type is missing, do not invent one locally and do not hard-code heuristic detection. Add the type to the shared contract first, or pause and confirm the new type before implementing downstream filtering, routing, rendering, or business logic.

## Local Xpert Plugin Installation

- For community plugin work, keep platform connection settings in `community/.env`, using `community/env.example` as the template. Before installing or reinstalling a plugin into a local Xpert backend, source that file instead of discovering organization IDs, tenant IDs, or tokens from the database.
- Required install settings are usually `XPERT_API_URL`, `XPERT_TOKEN`, and either `XPERT_ORG_ID` for organization-scoped installs or `XPERT_INSTALL_SCOPE=global` for system/global installs. Never commit real tokens or local secrets.
- Prefer the Xpert host scripts when they match the install scope:
  - `pnpm plugin:reinstall:local --workspace-path <plugin-dir> --org-id "$XPERT_ORG_ID" --token "$XPERT_TOKEN" --api-url "$XPERT_API_URL"`
  - `pnpm plugin:install:local --workspace-path <plugin-dir> --org-id "$XPERT_ORG_ID" --token "$XPERT_TOKEN" --api-url "$XPERT_API_URL"`
- Current local Xpert hosts may reject `--org-id global` because parts of the backend treat `organization-id` as a UUID. For plugins whose `meta.level` is `system`, install into global scope by calling `POST /api/plugin` with a super-admin bearer token and no `organization-id` / `x-scope-level` headers, unless the host script has been fixed.
- Do not mint temporary JWTs from local database records or `JWT_SECRET` when `XPERT_TOKEN` is provided. If `XPERT_TOKEN` or the needed organization scope is missing, ask the user to populate `community/.env` first; only use a generated localhost token as an explicit local-dev fallback.
- When installing a plugin that needs to call back into data-xpert, pass plugin config explicitly, for example `{"dataXpert":{"apiBaseUrl":"http://localhost:3000/","defaultResourceId":"sales-ontology"}}`.
