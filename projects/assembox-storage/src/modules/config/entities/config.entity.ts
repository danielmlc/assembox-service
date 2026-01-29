import { Entity, Column } from 'typeorm';
import { HasPrimaryFullEntity } from '@cs/nest-typeorm';

/**
 * 配置层级枚举
 */
export enum ConfigScope {
  SYSTEM = 'system',
  GLOBAL = 'global',
  TENANT = 'tenant',
}

/**
 * 配置状态枚举
 */
export enum ConfigStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

/**
 * 配置索引表 (ab_config)
 * 存储各层级的配置索引，指向OSS中的实际内容
 */
@Entity('ab_config')
export class AbConfig extends HasPrimaryFullEntity {
  @Column({
    name: 'component_id',
    type: 'bigint',
    comment: '组件ID',
  })
  componentId: string;

  @Column({
    name: 'version_id',
    type: 'bigint',
    comment: '版本ID（冗余）',
  })
  versionId: string;

  @Column({
    name: 'module_code',
    type: 'varchar',
    length: 100,
    comment: '模块代码（冗余）',
  })
  moduleCode: string;

  @Column({
    name: 'version_code',
    type: 'varchar',
    length: 20,
    comment: '版本号（冗余）',
  })
  versionCode: string;

  @Column({
    name: 'component_code',
    type: 'varchar',
    length: 100,
    comment: '组件代码（冗余）',
  })
  componentCode: string;

  @Column({
    name: 'component_type',
    type: 'varchar',
    length: 50,
    comment: '组件类型（冗余）',
  })
  componentType: string;

  @Column({
    name: 'scope',
    type: 'varchar',
    length: 20,
    comment: '配置层级: system/global/tenant',
  })
  scope: ConfigScope;

  @Column({
    name: 'tenant',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: 'scope=tenant时必填',
  })
  tenant?: string;

  @Column({
    name: 'oss_key',
    type: 'varchar',
    length: 500,
    comment: 'OSS存储key',
  })
  ossKey: string;

  @Column({
    name: 'content_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '内容MD5哈希，用于变更检测',
  })
  contentHash?: string;

  @Column({
    name: 'content_size',
    type: 'int',
    nullable: true,
    comment: '内容大小(字节)',
  })
  contentSize?: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: ConfigStatus.DRAFT,
    comment: '发布状态: draft/published',
  })
  status: ConfigStatus;

  @Column({
    name: 'publish_version',
    type: 'int',
    default: 0,
    comment: '发布版本号（每次发布+1）',
  })
  publishVersion: number;

  @Column({
    name: 'published_at',
    type: 'datetime',
    nullable: true,
    comment: '最后发布时间',
  })
  publishedAt?: Date;
}
