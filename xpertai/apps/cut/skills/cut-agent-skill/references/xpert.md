# Xpert Cut Plugin entry

Install the Xpert plugin through its existing `.xpertai-plugin/plugin.json`
entry. It supplies Cut Runtime, Workbench, native Assistant tools and the
host-native MCP Publication capabilities. Keep normal Xpert installation,
authorization and template/resource updates.

The host supplies `cut.currentProject` and the mirrored cutProjectId,
cutRevision, cutSelectedClipId and cutDirty values. Native middleware may resolve
an omitted projectId to that selection. For another project, use its exact UUID.
Read the current project before mutations and preserve unsaved Workbench edits.
Use native Cut read tools and scoped Workspace Files paths/references. The
portable Agent plugin is not required for Xpert Assistant execution.
