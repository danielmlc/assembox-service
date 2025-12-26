import { Entity, Column, Index } from 'typeorm';
import { HasPrimaryFullEntity, registerEntity } from '@cs/nest-typeorm';
import { ActionType } from '../../shared/constants/aseembox.constants';
import {
  HookConfig,
  QueryActionConfig,
  MutationActionConfig,
  CustomActionConfig,
} from '../../shared/interfaces';

/**
 * 钩子配置 JSON 结构
 */
interface HooksJson {
  beforeExecute?: HookConfig[];
  afterExecute?: HookConfig[];
  onError?: HookConfig[];
}

/**
 * 操作定义实体
 * 存储模型的操作（Action）元数据
 */
@Entity('ab_action_definition')
@Index('idx_action_model', ['modelId'])
@Index('idx_action_code_model', ['code', 'modelId'])
export class ActionDefinitionEntity extends HasPrimaryFullEntity {
  @Column({
    name: 'model_id',
    comment: '关联的模型ID',
    type: 'bigint',
  })
  modelId: string;

  @Column({
    name: 'code',
    comment: '操作代码',
    type: 'varchar',
    length: 100,
  })
  code: string;

  @Column({
    name: 'name',
    comment: '操作名称',
    type: 'varchar',
    length: 200,
  })
  name: string;

  @Column({
    name: 'description',
    comment: '操作描述',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  description?: string;

  @Column({
    name: 'action_type',
    comment: '操作类型',
    type: 'varchar',
    length: 50,
  })
  type: ActionType;

  @Column({
    name: 'permissions',
    comment: '权限代码列表（JSON）',
    type: 'json',
    nullable: true,
  })
  permissions?: string[];

  @Column({
    name: 'hooks',
    comment: '钩子配置（JSON）',
    type: 'json',
    nullable: true,
  })
  hooks?: HooksJson;

  @Column({
    name: 'query_config',
    comment: '查询配置（JSON）',
    type: 'json',
    nullable: true,
  })
  queryConfig?: QueryActionConfig;

  @Column({
    name: 'mutation_config',
    comment: '变更配置（JSON）',
    type: 'json',
    nullable: true,
  })
  mutationConfig?: MutationActionConfig;

  @Column({
    name: 'custom_config',
    comment: '自定义操作配置（JSON）',
    type: 'json',
    nullable: true,
  })
  customConfig?: CustomActionConfig;

  @Column({
    name: 'is_enabled',
    comment: '是否启用',
    type: 'tinyint',
    default: true,
  })
  enabled: boolean;

  @Column({
    name: 'tenant',
    comment: '租户代码',
    type: 'varchar',
    length: 64,
  })
  tenant: string;
}

registerEntity({
  entity: ActionDefinitionEntity,
  connectionName: 'default',
});
