import { HasPrimaryFullEntity } from '@cs/nest-typeorm';
import { Entity, Column } from 'typeorm';

/**
 * 版本状态枚举
 */
export enum VersionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
}

/**
 * 模块版本表 (ab_module_version)
 * 每个模块可以有多个版本，对应不同的代码分支
 */
@Entity('ab_module_version')
export class AbModuleVersion extends HasPrimaryFullEntity {
  @Column({
    name: 'module_id',
    type: 'bigint',
    comment: '模块ID',
  })
  moduleId: string;

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
    comment: '版本号，如 V1、V2、V3',
  })
  versionCode: string;

  @Column({
    name: 'version_name',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: '版本名称',
  })
  versionName?: string;

  @Column({
    name: 'description',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '版本说明',
  })
  description?: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: VersionStatus.DRAFT,
    comment: '版本状态: draft/published/deprecated',
  })
  status: VersionStatus;

  @Column({
    name: 'published_at',
    type: 'datetime',
    nullable: true,
    comment: '首次发布时间',
  })
  publishedAt?: Date;

  @Column({
    name: 'git_branch',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Git分支名称，格式: {module_code}/{version_code}',
  })
  gitBranch?: string;
}
