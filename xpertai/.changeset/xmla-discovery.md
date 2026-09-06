---
'@xpert-ai/plugin-xmla': patch
'@xpert-ai/plugin-sap-bw': patch
---

Complete the XMLA database migration with typed Discover and tabular Execute
support, catalog and cube schemas, SOAP fault handling, SAP BW variable
discovery, and SAP BW measure type mapping. Add an opt-in SAP BW catalog
discovery mode derived from accessible cubes for systems with slow
DBSCHEMA_CATALOGS enumeration. Make both packages buildable and packable from
their own package directories while preserving the XMLA-first Nx build order.
Bundle the XMLA runtime into SAP BW so local source-code staging never leaks a
`workspace:*` dependency into the host's npm installation step.
