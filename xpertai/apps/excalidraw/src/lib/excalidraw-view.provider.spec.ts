jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: unknown) => target,
  renderRemoteReactIframeHtml: jest.fn()
}))

import {
  AGENT_WORKBENCH_FIXED_SLOT,
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
} from './constants.js'
import { ExcalidrawViewProvider } from './excalidraw-view.provider.js'

describe('ExcalidrawViewProvider selection assistant context', () => {
  it('declares assistant context and chat client commands', () => {
    const provider = new ExcalidrawViewProvider({} as never)
    const manifests = provider.getViewManifests(testContext(), AGENT_WORKBENCH_FIXED_SLOT)

    expect(manifests).toHaveLength(1)
    expect(manifests[0].clientCommands?.map((command) => command.key)).toEqual([
      ASSISTANT_CONTEXT_SET_COMMAND,
      ASSISTANT_CHAT_SEND_MESSAGE_COMMAND
    ])
  })

  it('declares only the supported workbench actions', () => {
    const provider = new ExcalidrawViewProvider({} as never)
    const manifests = provider.getViewManifests(testContext(), AGENT_WORKBENCH_FIXED_SLOT)

    expect(manifests[0].actions?.map((action) => action.key)).toEqual([
      'refresh',
      'create_drawing',
      'save_scene_version',
      'restore_version',
      'mark_reviewed',
      'mark_draft',
      'archive_drawing',
      'delete_drawing',
      'delete_version',
      'import_scene_file',
      'save_converted_mermaid_scene',
      'prepare_agent_draw_message'
    ])
  })
})

function testContext() {
  return {
    hostType: 'agent',
    hostId: 'assistant-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    locale: 'zh-Hans'
  } as never
}
