import { Entity, Column, Index } from 'typeorm';
import { HasPrimaryFullEntity, registerEntity } from '@cs/nest-typeorm';
import { RelationType } from '../../shared/constants/aseembox.constants';
import { JoinConfig } from '../../shared/interfaces';

/**
 * 关联定义实体
 * 存储模型间的关联关系元数据
 */
@Entity('ab_relation_definition')
@Index('idx_relation_source_model', ['sourceModelId'])
@Index('idx_relation_target_model', ['targetModelId'])
@Index('idx_relation_code', ['code', 'sourceModelId'])
export class RelationDefinitionEntity extends HasPrimaryFullEntity {
  @Column({
    name: 'code',
    comment: '关联代码',
    type: 'varchar',
    length: 100,
  })
  code: string;

  @Column({
    name: 'name',
    comment: '关联名称',
    type: 'varchar',
    length: 200,
  })
  name: string;

  @Column({
    name: 'description',
    comment: '关联描述',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  description?: string;

  @Column({
    name: 'source_model_id',
    comment: '源模型ID',
    type: 'bigint',
  })
  sourceModelId: string;

  @Column({
    name: 'source_model_code',
    comment: '源模型代码',
    type: 'varchar',
    length: 100,
  })
  sourceModelCode: string;

  @Column({
    name: 'target_model_id',
    comment: '目标模型ID',
    type: 'bigint',
  })
  targetModelId: string;

  @Column({
    name: 'target_model_code',
    comment: '目标模型代码',
    type: 'varchar',
    length: 100,
  })
  targetModelCode: string;

  @Column({
    name: 'relation_type',
    comment: '关联类型',
    type: 'varchar',
    length: 50,
  })
  type: RelationType;

  @Column({
    name: 'join_config',
    comment: 'JOIN配置（JSON）',
    type: 'json',
  })
  joinConfig: JoinConfig;

  @Column({
    name: 'include_fields',
    comment: '包含的目标字段（JSON）',
    type: 'json',
    nullable: true,
  })
  includeFields?: string[];

  @Column({
    name: 'field_aliases',
    comment: '字段别名映射（JSON）',
    type: 'json',
    nullable: true,
  })
  fieldAliases?: Record<string, string>;

  @Column({
    name: 'tenant',
    comment: '租户代码',
    type: 'varchar',
    length: 64,
  })
  tenant: string;
}

registerEntity({
  entity: RelationDefinitionEntity,
  connectionName: 'default',
});
