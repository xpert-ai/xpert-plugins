import { Injectable } from '@nestjs/common'
import { PersistentTaskStore } from './task.store.js'
import { Research } from './domain/research.js'
@Injectable()
export class ResearchService extends Research {
  constructor(store: PersistentTaskStore) { super(store) }
}
