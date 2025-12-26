import { Entity, Column, Index } from 'typeorm';
import { HasPrimaryFullEntity, registerEntity } from '@cs/nest-typeorm';
import { ModelStatus, CacheStrategy } from '../../shared/constants/aseembox.constants';

/**
 * 模型配置 JSON 结构
 */
interface ModelConfigJson {
  enableSoftDelete: boolean;
  enableVersion: boolean;
  enableAudit: boolean;
  enableTenant: boolean;
  cacheStrategy: CacheStrategy;
  cacheTTL?: number;
}

/**
 * 索引定义 JSON 结构
 */
interface IndexDefinitionJson {
  name: string;
  columns: string[];
  unique: boolean;
}

/**
 * 模型定义实体
 * 存储低代码平台的模型元数据
 */
@Entity('ab_model_definition')
@Index('idx_model_code_tenant', ['code', 'tenant'])
@Index('idx_model_status', ['status'])
export class ModelDefinitionEntity extends HasPrimaryFullEntity {
  @Column({
    name: 'code',
    comment: '模型代码',
    type: 'varchar',
    length: 100,
  })
  code: string;

  @Column({
    name: 'name',
    comment: '模型名称',
    type: 'varchar',
    length: 200,
  })
  name: string;

  @Column({
    name: 'description',
    comment: '模型描述',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  description?: string;

  @Column({
    name: 'table_name',
    comment: '物理表名',
    type: 'varchar',
    length: 100,
  })
  tableName: string;

  @Column({
    name: 'database_name',
    comment: '数据库名',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  databaseName?: string;

  @Column({
    name: 'config',
    comment: '模型配置（JSON）',
    type: 'json',
  })
  config: ModelConfigJson;

  @Column({
    name: 'indexes',
    comment: '索引定义（JSON）',
    type: 'json',
    nullable: true,
  })
  indexes?: IndexDefinitionJson[];

  @Column({
    name: 'status',
    comment: '模型状态：draft, published, deprecated',
    type: 'varchar',
    length: 20,
    default: ModelStatus.DRAFT,
  })
  status: ModelStatus;

  @Column({
    name: 'version_num',
    comment: '模型版本号',
    type: 'int',
    default: 1,
  })
  versionNum: number;

  @Column({
    name: 'published_at',
    comment: '发布时间',
    type: 'datetime',
    nullable: true,
  })
  publishedAt?: Date;

  @Column({
    name: 'tenant',
    comment: '租户代码',
    type: 'varchar',
    length: 64,
  })
  tenant: string;
}

registerEntity({
  entity: ModelDefinitionEntity,
  connectionName: 'default',
});
