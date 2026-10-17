---
"@xpert-ai/plugin-mysql": patch
"@xpert-ai/plugin-saic-doris": patch
---

Add the SAIC Doris native provider with 24 tools, a schema resource, per-toolset platform/manual connections, compatibility regression fixtures and MCP documentation.

Expose the same 24 tools through the SAIC Doris agent middleware with independent platform/manual connection settings and per-call actor authorization, allowing digital experts to use the plugin directly without an MCP publication.

Include the SAIC Supply-chain Configuration Assistant template with a connected chat trigger, required SAIC Doris middleware, configuration guidance and starter questions, without embedding model or database bindings.

Retain the SDK's ordinary Toolset registration and ship the portable resource manifest for the existing host-native MCP installation path, preserving middleware, templates and publication bindings. Add ClawXpert-style context compression and execution safeguards to newly created assistants, without todo or web middleware. Keep the template independent of a sandbox by omitting sandbox activation and the file, image and skills middleware.

Export a shared Doris connection factory, isolate Doris read/INSERT behavior from MySQL and StarRocks, retain Stream Load receipt evidence, and constrain credential-bearing redirects. Use the published SDK ^3.21.0 without an independent native registration patch. Release these two workspace packages together so the SAIC dependency includes the new Doris entrypoint.

Use the SDK SQL lexer to recognize SELECT/WITH after ordinary comments, preserving Doris pagination and explain support as well as SAIC exact row counts and return limits.

Declare the connection configuration tab title in the provider schema, allowing MCP service pages to edit the existing binding with conditional fields, datasource selection and masked passwords.

Validate saved connections through the native provider configuration hook using the same rules as invocation, rejecting incomplete connections and invalid numeric ranges without disclosing credentials.
