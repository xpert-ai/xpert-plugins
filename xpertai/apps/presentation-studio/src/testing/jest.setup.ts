jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'XPERT_PLUGIN_CONFIG_RESOLVER',
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  SYSTEM_GLOBAL_SCOPE: 'system:global',
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  ArtifactsRuntimeCapability: { id: 'platform.artifacts' },
  CollaborationRuntimeCapability: { id: 'platform.collaboration' },
  CollaborationDocumentProvider: () => <T extends object>(target: T) => target,
  AgentMiddlewareStrategy: () => <T extends object>(target: T) => target,
  ViewExtensionProvider: () => <T extends object>(target: T) => target,
  XpertServerPlugin: () => <T extends object>(target: T) => target,
  PluginJobProcessor: () => <T extends object>(target: T) => target,
  RequestContext: { getOrganizationId: () => null, currentUser: () => null, currentUserId: () => null },
  renderRemoteReactIframeHtml: () => '<html><body><div id="root"></div></body></html>'
}))
