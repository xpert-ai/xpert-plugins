import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RAGFlowIntegrationStrategy } from './ragflow-integration.strategy.js';
import { RAGFlowKnowledgeStrategy } from './ragflow-knowledge.strategy.js';
import { RAGFlowController } from './ragflow.controller.js';
import { RAGFlowService } from './ragflow.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [RAGFlowController],
  providers: [
    RAGFlowService,
    RAGFlowIntegrationStrategy,
    RAGFlowKnowledgeStrategy,
  ],
  exports: [],
})
export class IntegrationRAGFlowModule {}
