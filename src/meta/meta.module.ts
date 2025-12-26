import { Module } from '@nestjs/common';
import { EntityRegistModule } from '@cs/nest-typeorm';
import {
  ModelDefinitionEntity,
  FieldDefinitionEntity,
  RelationDefinitionEntity,
  ActionDefinitionEntity,
} from './entities';
import {
  ModelService,
  ModelRepository,
  FieldService,
  FieldRepository,
  RelationService,
  RelationRepository,
  ActionService,
  ActionRepository,
  MetaCacheService,
} from './services';
import { MetaController } from './controllers';

/**
 * 元数据管理模块
 * 负责模型、字段、关联、操作的定义与管理
 */
@Module({
  imports: [
    EntityRegistModule.forRepos([
      {
        entity: ModelDefinitionEntity,
        repository: ModelRepository,
        connectionName: 'default',
      },
      {
        entity: FieldDefinitionEntity,
        repository: FieldRepository,
        connectionName: 'default',
      },
      {
        entity: RelationDefinitionEntity,
        repository: RelationRepository,
        connectionName: 'default',
      },
      {
        entity: ActionDefinitionEntity,
        repository: ActionRepository,
        connectionName: 'default',
      },
    ]),
  ],
  controllers: [MetaController],
  providers: [
    // Services
    ModelService,
    FieldService,
    RelationService,
    ActionService,
    MetaCacheService,
  ],
  exports: [
    ModelService,
    FieldService,
    RelationService,
    ActionService,
    MetaCacheService,
  ],
})
export class MetaModule {}
