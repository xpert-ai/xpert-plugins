# @xpert-ai/plugin-xmla

XMLA database plugin for Xpert. It supports the read-only XMLA data-source
contract used by the platform:

- raw SOAP requests through `runQuery()`;
- typed XMLA `Discover` and tabular `Execute` helpers;
- catalog discovery through `DBSCHEMA_CATALOGS`;
- cube discovery through `MDSCHEMA_CUBES`;
- dimension and measure columns for a selected cube;
- rowset XSD type conversion and SOAP/provider fault parsing;
- basic-auth bootstrap, cookie reuse, one-time 401 retry, custom headers,
  request timeouts, and opt-in certificate-verification bypass.

Configuration accepts `host`, `port`, `path`, `username`, `password`,
`use_ssl`, `disable_reject_cert`, `data_source_info`, `language`, and
`query_timeout`. `data_source_info` is added to XMLA metadata and execute
property lists, while `language` is sent as `Accept-Language`.

The test suite uses a typed HTTP boundary and does not contact a live XMLA
server. External runtime verification requires an XMLA endpoint and credentials.

Build or package this plugin from the `xpertai` pnpm workspace. `pnpm pack`
runs the package build first so the archive cannot silently reuse stale `dist`
output:

```bash
pnpm exec nx build @xpert-ai/plugin-xmla
pnpm --filter @xpert-ai/plugin-xmla pack
```

The semantic analytics layer remains in `@xpert-ai/ocap-xmla`: MDX AST/query
generation, multidimensional cellset materialization, semantic-model caching,
and member navigation are application concerns rather than database-runner
contracts. This plugin intentionally owns the transport and protocol metadata
boundary so those concerns are not duplicated.

This plugin introduces no persisted or global artifacts, so it does not require
a system artifact namespace. The `xmla` key is the existing data-source
protocol identifier.
