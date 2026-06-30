import { TableIndex } from 'typeorm'
import { WeComConversationBindingEntity } from './entities/wecom-conversation-binding.entity.js'
import { WeComConversationBindingSchemaService } from './wecom-conversation-binding-schema.service.js'

describe('WeComConversationBindingSchemaService', () => {
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
      service: new WeComConversationBindingSchemaService(dataSource as any),
      queryRunner
    }
  }

  it('drops legacy unique userId index and creates a plain userId index', async () => {
    const legacyIndex = {
      name: 'plugin_wecom_conversation_binding_user_id_uq',
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

    expect(queryRunner.dropIndex).toHaveBeenCalledWith(WeComConversationBindingEntity.tableName, legacyIndex)
    expect(queryRunner.createIndex).toHaveBeenCalledWith(
      WeComConversationBindingEntity.tableName,
      expect.objectContaining({
        name: 'plugin_wecom_conversation_binding_user_id_idx',
        columnNames: ['userId'],
        isUnique: false
      }) as TableIndex
    )
    expect(queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it('drops legacy unique userId constraint before creating the plain index', async () => {
    const legacyUnique = {
      name: 'plugin_wecom_conversation_binding_user_id_uq',
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
      WeComConversationBindingEntity.tableName,
      legacyUnique
    )
    expect(queryRunner.createIndex).toHaveBeenCalledWith(
      WeComConversationBindingEntity.tableName,
      expect.objectContaining({
        name: 'plugin_wecom_conversation_binding_user_id_idx',
        columnNames: ['userId'],
        isUnique: false
      }) as TableIndex
    )
  })
})
