import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm'
import { LarkConversationBindingEntity } from './entities/lark-conversation-binding.entity.js'

const USER_ID_INDEX = 'plugin_lark_conversation_binding_user_id_idx'
const PRINCIPAL_KEY_INDEX = 'plugin_lark_conversation_binding_principal_key_idx'
const SCOPE_KEY_XPERT_UNIQUE_INDEX = 'plugin_lark_conversation_binding_scope_key_xpert_uq'

const REQUIRED_COLUMNS: Array<Pick<TableColumn, 'name' | 'type' | 'length' | 'isNullable'>> = [
	{ name: 'integrationId', type: 'varchar', length: '64', isNullable: true },
	{ name: 'principalKey', type: 'varchar', length: '255', isNullable: true },
	{ name: 'scopeKey', type: 'varchar', length: '255', isNullable: true },
	{ name: 'chatType', type: 'varchar', length: '32', isNullable: true },
	{ name: 'chatId', type: 'varchar', length: '128', isNullable: true },
	{ name: 'senderOpenId', type: 'varchar', length: '128', isNullable: true }
]

@Injectable()
export class LarkConversationBindingSchemaService {
	private readonly logger = new Logger(LarkConversationBindingSchemaService.name)

	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource
	) {}

	async ensureSchema(): Promise<void> {
		if (!this.dataSource?.isInitialized) {
			return
		}

		const queryRunner = this.dataSource.createQueryRunner()
		const actions: string[] = []

		try {
			await queryRunner.connect()

			let table = await this.loadTable(queryRunner)
			if (!table) {
				this.logger.warn(
					`[lark-bind] Table "${LarkConversationBindingEntity.tableName}" is missing, skip schema ensure.`
				)
				return
			}

			const existingColumns = new Set(table.columns.map((column) => column.name))
			for (const definition of REQUIRED_COLUMNS) {
				if (existingColumns.has(definition.name)) {
					continue
				}

				await queryRunner.addColumn(LarkConversationBindingEntity.tableName, new TableColumn(definition))
				existingColumns.add(definition.name)
				actions.push(`add column ${definition.name}`)
			}

			if (actions.length) {
				table = await this.loadTable(queryRunner)
			}
			if (!table) {
				return
			}

			const droppedLegacyUserIdUnique = await this.dropLegacyUserIdUniqueSemantics(
				queryRunner,
				table,
				actions
			)
			if (droppedLegacyUserIdUnique) {
				table = await this.loadTable(queryRunner)
			}
			if (!table) {
				return
			}

			if (!this.hasPlainIndex(table, ['userId'])) {
				await queryRunner.createIndex(
					LarkConversationBindingEntity.tableName,
					new TableIndex({
						name: USER_ID_INDEX,
						columnNames: ['userId']
					})
				)
				actions.push(`create index ${USER_ID_INDEX}`)
			}

			if (!this.hasAnyIndex(table, ['principalKey'])) {
				await queryRunner.createIndex(
					LarkConversationBindingEntity.tableName,
					new TableIndex({
						name: PRINCIPAL_KEY_INDEX,
						columnNames: ['principalKey']
					})
				)
				actions.push(`create index ${PRINCIPAL_KEY_INDEX}`)
			}

			if (!this.hasUniqueSemantics(table, ['scopeKey', 'xpertId'])) {
				await queryRunner.createIndex(
					LarkConversationBindingEntity.tableName,
					new TableIndex({
						name: SCOPE_KEY_XPERT_UNIQUE_INDEX,
						columnNames: ['scopeKey', 'xpertId'],
						isUnique: true
					})
				)
				actions.push(`create unique index ${SCOPE_KEY_XPERT_UNIQUE_INDEX}`)
			}

			if (actions.length) {
				this.logger.log(`[lark-bind] Ensured schema: ${actions.join(', ')}`)
			}
		} finally {
			await queryRunner.release()
		}
	}

	private async loadTable(queryRunner: QueryRunner): Promise<Table | undefined> {
		return (await queryRunner.getTable(LarkConversationBindingEntity.tableName)) ?? undefined
	}

	private async dropLegacyUserIdUniqueSemantics(
		queryRunner: QueryRunner,
		table: Table,
		actions: string[]
	): Promise<boolean> {
		let changed = false

		for (const index of table.indices) {
			if (!index.isUnique || !this.hasSameColumnSet(index.columnNames, ['userId'])) {
				continue
			}

			await queryRunner.dropIndex(LarkConversationBindingEntity.tableName, index)
			actions.push(`drop unique index ${index.name ?? '(unnamed-userId-index)'}`)
			changed = true
		}

		for (const unique of table.uniques) {
			if (!this.hasSameColumnSet(unique.columnNames, ['userId'])) {
				continue
			}

			await queryRunner.dropUniqueConstraint(LarkConversationBindingEntity.tableName, unique)
			actions.push(`drop unique constraint ${unique.name ?? '(unnamed-userId-constraint)'}`)
			changed = true
		}

		return changed
	}

	private hasPlainIndex(table: Table, columns: string[]): boolean {
		return table.indices.some(
			(index) => !index.isUnique && this.hasSameColumnSet(index.columnNames, columns)
		)
	}

	private hasAnyIndex(table: Table, columns: string[]): boolean {
		return table.indices.some((index) => this.hasSameColumnSet(index.columnNames, columns))
	}

	private hasUniqueSemantics(table: Table, columns: string[]): boolean {
		return (
			table.indices.some(
				(index) => index.isUnique && this.hasSameColumnSet(index.columnNames, columns)
			) ||
			table.uniques.some((unique) => this.hasSameColumnSet(unique.columnNames, columns))
		)
	}

	private hasSameColumnSet(actual: string[], expected: string[]): boolean {
		if (actual.length !== expected.length) {
			return false
		}

		const actualColumns = [...actual].sort()
		const expectedColumns = [...expected].sort()
		return actualColumns.every((column, index) => column === expectedColumns[index])
	}
}