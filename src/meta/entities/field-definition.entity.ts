import { Entity, Column, Index } from 'typeorm';
import { HasPrimaryFullEntity, registerEntity } from '@cs/nest-typeorm';
import { FieldType } from '../../shared/constants/aseembox.constants';
import { FieldConstraints, ValidationRule, FieldUIConfig, ComputedFieldConfig } from '../../shared/interfaces';

/**
 * 字段定义实体
 * 存储模型的字段元数据
 */
@Entity('ab_field_definition')
@Index('idx_field_model', ['modelId'])
@Index('idx_field_code_model', ['code', 'modelId'])
export class FieldDefinitionEntity extends HasPrimaryFullEntity {
  @Column({
    name: 'model_id',
    comment: '关联的模型ID',
    type: 'bigint',
  })
  modelId: string;

  @Column({
    name: 'code',
    comment: '字段代码',
    type: 'varchar',
    length: 100,
  })
  code: string;

  @Column({
    name: 'name',
    comment: '字段名称',
    type: 'varchar',
    length: 200,
  })
  name: string;

  @Column({
    name: 'description',
    comment: '字段描述',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  description?: string;

  @Column({
    name: 'field_type',
    comment: '字段类型',
    type: 'varchar',
    length: 50,
  })
  type: FieldType;

  @Column({
    name: 'db_type',
    comment: '数据库类型',
    type: 'varchar',
    length: 100,
  })
  dbType: string;

  @Column({
    name: 'constraints',
    comment: '字段约束（JSON）',
    type: 'json',
  })
  constraints: FieldConstraints;

  @Column({
    name: 'validations',
    comment: '验证规则（JSON）',
    type: 'json',
    nullable: true,
  })
  validations?: ValidationRule[];

  @Column({
    name: 'ui_config',
    comment: 'UI配置（JSON）',
    type: 'json',
    nullable: true,
  })
  ui?: FieldUIConfig;

  @Column({
    name: 'computed_config',
    comment: '计算字段配置（JSON）',
    type: 'json',
    nullable: true,
  })
  computed?: ComputedFieldConfig;

  @Column({
    name: 'sort_order',
    comment: '排序顺序',
    type: 'int',
    default: 0,
  })
  sortOrder: number;

  @Column({
    name: 'tenant',
    comment: '租户代码',
    type: 'varchar',
    length: 64,
  })
  tenant: string;
}

registerEntity({
  entity: FieldDefinitionEntity,
  connectionName: 'default',
});
