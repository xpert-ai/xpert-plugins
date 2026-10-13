# @xpert-ai/plugin-docx-editor

## 0.5.6

### Patch Changes

- 853dab2: Ship an atomic, repeatable PostgreSQL migration that converts legacy DOCX project and document references to UUID in place, preserving existing documents, versions, snapshots, operations, indexes, nullability, and foreign keys. Run the packaged migration before schema synchronization when upgrading an existing installation; invalid values or unsupported dependencies abort without changing data. Read runtime plugin level and artifact namespace from package.json.

## 0.5.5

### Patch Changes

- 7cc62cd: Expose the bundled applications in Xpert discovery with localized app descriptions, business categories, dedicated organization workspaces, and links to their Assistant templates. Keep portable and runtime metadata aligned, enable the Sites template for Xpert, and require compatible app configuration contracts.
