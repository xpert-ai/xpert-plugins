import { Injectable } from '@nestjs/common'
import { CrmMetadataService } from './crm-metadata.service'
import { CrmRecordService } from './crm-record.service'
import type { CrmScope } from './types'

@Injectable()
export class CrmSeedService {
  constructor(
    private readonly metadataService: CrmMetadataService,
    private readonly recordService: CrmRecordService
  ) {}

  async ensureWorkspace(scope: CrmScope) {
    await this.metadataService.ensureDefaultSchema(scope)
    const existingRecords = await this.recordService.countRecords(scope)
    if (existingRecords > 0) {
      return
    }

    const acme = await this.recordService.createRecord(scope, {
      objectKey: 'company',
      source: 'seed',
      values: {
        name: 'Acme Robotics',
        domain: 'https://acme.example',
        industry: 'Manufacturing',
        status: 'customer',
        owner: 'Alex Chen'
      }
    })
    const northwind = await this.recordService.createRecord(scope, {
      objectKey: 'company',
      source: 'seed',
      values: {
        name: 'Northwind Cloud',
        domain: 'https://northwind.example',
        industry: 'Cloud infrastructure',
        status: 'active',
        owner: 'Mia Wang'
      }
    })

    await this.recordService.createRecord(scope, {
      objectKey: 'person',
      source: 'seed',
      values: {
        firstName: 'Iris',
        lastName: 'Lin',
        email: 'iris.lin@acme.example',
        phone: '+86 138 0000 1234',
        companyId: acme.id,
        title: 'VP Operations'
      }
    })
    await this.recordService.createRecord(scope, {
      objectKey: 'person',
      source: 'seed',
      values: {
        firstName: 'Noah',
        lastName: 'Zhang',
        email: 'noah.zhang@northwind.example',
        phone: '+86 139 0000 5678',
        companyId: northwind.id,
        title: 'Head of Data'
      }
    })
    await this.recordService.createRecord(scope, {
      objectKey: 'opportunity',
      source: 'seed',
      values: {
        name: 'Acme factory AI rollout',
        companyId: acme.id,
        stage: 'proposal',
        amount: 260000,
        closeDate: '2026-07-31',
        owner: 'Alex Chen'
      }
    })
    await this.recordService.createRecord(scope, {
      objectKey: 'opportunity',
      source: 'seed',
      values: {
        name: 'Northwind data workspace',
        companyId: northwind.id,
        stage: 'discovery',
        amount: 98000,
        closeDate: '2026-08-15',
        owner: 'Mia Wang'
      }
    })
    await this.recordService.createRecord(scope, {
      objectKey: 'task',
      source: 'seed',
      values: {
        title: 'Prepare Acme executive follow-up',
        status: 'open',
        dueDate: '2026-06-24',
        recordId: acme.id
      }
    })
    await this.recordService.createRecord(scope, {
      objectKey: 'note',
      source: 'seed',
      values: {
        title: 'CRM native prototype note',
        content: 'This note demonstrates the Xpert-native CRM activity and note direction.',
        recordId: acme.id
      }
    })
  }
}
