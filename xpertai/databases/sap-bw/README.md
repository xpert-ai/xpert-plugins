# @xpert-ai/plugin-sap-bw

SAP Business Warehouse database plugin for Xpert. It preserves the legacy
`sapbw` data-source identity and inherits the public typed XMLA transport,
catalog/cube discovery, selected-cube schema inspection, tabular description,
authentication, cookie, retry, timeout, language, and TLS behavior.

The plugin adds the SAP-specific `SAP_VARIABLES` rowset through
`SapBwRunner.discoverVariables()` and maps SAP BW measure types such as `CURR`,
`DEC`, `DATS`, and `TIMS` to the platform column contract.

Catalog discovery defaults to the standard `DBSCHEMA_CATALOGS` rowset.
For BW systems where this enumeration is too slow, set the data-source
option `catalog_discovery` to `cubes`. The runner then discovers
`MDSCHEMA_CUBES` and returns its distinct catalog names through `getCatalogs()`.
This mode lists only catalogs containing cubes accessible to the current
user; it does not fabricate catalogs or suppress transport errors.

The unit suite uses an in-memory HTTP boundary. A live integration check
requires an SAP BW XMLA endpoint and credentials.

MDX generation, SAP hierarchy semantics, variable serialization into MDX, and
multidimensional cellset materialization remain in `@xpert-ai/ocap-xmla`.
Those are semantic analytics responsibilities and are not duplicated in the
database runner.

This plugin introduces no persisted or global artifacts, so it does not require
a system artifact namespace. The `sapbw` key is the existing data-source
protocol identifier.
