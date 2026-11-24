import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { TaskStore } from './domain/research.js'
import { ResearchTaskEntity } from './task.entity.js'
import { ResearchError, scopeSchema } from './domain/contracts.js'
import type { Scope, Task } from './domain/contracts.js'

@Injectable()
export class PersistentTaskStore implements TaskStore {
  constructor(@InjectRepository(ResearchTaskEntity) private readonly repo: Repository<ResearchTaskEntity>) {}
  async get(scope: Scope,id: string) {
    const row=await this.repo.findOneBy({...scopeSchema.parse(scope),id})
    return row?JSON.parse(row.payloadJson) as Task:null
  }
  async findRequest(scope: Scope,requestKey: string) {
    const row=await this.repo.findOneBy({...scopeSchema.parse(scope),requestKey})
    return row?JSON.parse(row.payloadJson) as Task:null
  }
  async insert(scope: Scope,task: Task) {
    try {
      await this.repo.insert({...scopeSchema.parse(scope),id:task.id,requestKey:task.requestKey,
        revision:task.revision,updatedAt:task.updatedAt,payloadJson:JSON.stringify(task)})
    } catch(error) {
      // Duplicate requests are safe to retry; connectivity/schema failures must remain visible.
      if(error instanceof Error && /unique|duplicate/i.test(error.message))throw new ResearchError('request_conflict')
      throw error
    }
  }
  async replace(scope: Scope,task: Task,expectedRevision: number) {
    const result=await this.repo.update({...scopeSchema.parse(scope),id:task.id,revision:expectedRevision},
      {revision:task.revision,updatedAt:task.updatedAt,payloadJson:JSON.stringify(task)})
    if(result.affected!==1)throw new ResearchError('conflict')
  }
  async list(scope: Scope,offset: number,limit: number) {
    const [rows,total]=await this.repo.findAndCount({where:scopeSchema.parse(scope),order:{updatedAt:'DESC',id:'DESC'},skip:offset,take:limit})
    return {items:rows.map(r=>JSON.parse(r.payloadJson) as Task),total}
  }
}
