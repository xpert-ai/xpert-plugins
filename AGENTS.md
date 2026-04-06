# General Guidelines for working with plugins workspace

- After developing or modifying any plugin, validate it by following `plugin-dev-harness/README.md` and run the plugin lifecycle test through `plugin-dev-harness` before considering the work complete.

- Never guess types, categories, or payload meaning from names, display text, localized copy, sample data, or incidental field combinations. Logic that depends on machine-readable distinctions must use explicit typed fields defined in shared contracts, such as discriminated unions or a stable `type`.
- If the required discriminator or type is missing, do not invent one locally and do not hard-code heuristic detection. Add the type to the shared contract first, or pause and confirm the new type before implementing downstream filtering, routing, rendering, or business logic.