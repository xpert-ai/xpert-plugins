import { TableIndex } from 'typeorm'
import { DingTalkConversationBindingEntity } from './entities/dingtalk-conversation-binding.entity.js'
import { DingTalkConversationBindingSchemaService } from './dingtalk-conversation-binding-schema.service.js'

describe('DingTalkConversationBindingSchemaService', () => {
  function createFixture(tables: any[]) {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      getTable: jest.fn().mockImplementation(async () => tables.shift() ?? null),
      dropIndex: jest.fn().mockResolvedValue(undefined),
      dropUniqueConstraint: jest.fn().mockResolvedValue(undefined),
      createIndex: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined)
    }
    const dataSource = {
      isInitialized: true,
      createQueryRunner: jest.fn(() => queryRunner)
    }

    return {
      service: new DingTalkConversationBindingSchemaService(dataSource as any),
      queryRunner
    }
  }

  it('drops legacy unique userId index and creates a plain userId index', async () => {
    const legacyIndex = {
      name: 'plugin_dingtalk_conversation_binding_user_id_uq',
      columnNames: ['userId'],
      isUnique: true
    }
    const { service, queryRunner } = createFixture([
      {
        indices: [legacyIndex],
        uniques: []
      },
      {
        indices: [],
        uniques: []
      }
    ])

    await service.ensureSchema()

    expect(queryRunner.dropIndex).toHaveBeenCalledWith(DingTalkConversationBindingEntity.tableName, legacyIndex)
    expect(queryRunner.createIndex).toHaveBeenCalledWith(
      DingTalkConversationBindingEntity.tableName,
      expect.objectContaining({
        name: 'plugin_dingtalk_conversation_binding_user_id_idx',
        columnNames: ['userId'],
        isUnique: false
      }) as TableIndex
    )
    expect(queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it('drops legacy unique userId constraint before creating the plain index', async () => {
    const legacyUnique = {
      name: 'plugin_dingtalk_conversation_binding_user_id_uq',
      columnNames: ['userId']
    }
    const { service, queryRunner } = createFixture([
      {
        indices: [],
        uniques: [legacyUnique]
      },
      {
        indices: [],
        uniques: []
      }
    ])

    await service.ensureSchema()

    expect(queryRunner.dropUniqueConstraint).toHaveBeenCalledWith(
      DingTalkConversationBindingEntity.tableName,
      legacyUnique
    )
    expect(queryRunner.createIndex).toHaveBeenCalledWith(
      DingTalkConversationBindingEntity.tableName,
      expect.objectContaining({
        name: 'plugin_dingtalk_conversation_binding_user_id_idx',
        columnNames: ['userId'],
        isUnique: false
      }) as TableIndex
    )
  })
})
