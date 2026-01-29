import { Entity, Column, CreateDateColumn } from 'typeorm';
import { HasPrimaryEntity } from '@cs/nest-typeorm';

/**
 * 配置发布历史表 (ab_config_history)
 * 记录每次配置发布的历史版本
 */
@Entity('ab_config_history')
export class AbConfigHistory extends HasPrimaryEntity {
  @Column({
    name: 'config_id',
    type: 'bigint',
    comment: '配置ID',
  })
  configId: string;

  @Column({
    name: 'component_id',
    type: 'bigint',
    comment: '组件ID',
  })
  componentId: string;

  @Column({
    name: 'publish_version',
    type: 'int',
    comment: '发布版本号',
  })
  publishVersion: number;

  @Column({
    name: 'oss_key',
    type: 'varchar',
    length: 500,
    comment: '历史版本OSS key',
  })
  ossKey: string;

  @Column({
    name: 'content_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '内容哈希',
  })
  contentHash?: string;

  @Column({
    name: 'git_commit_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: 'Git commit ID（预留）',
  })
  gitCommitId?: string;

  @Column({
    name: 'published_at',
    type: 'datetime',
    comment: '发布时间',
  })
  publishedAt: Date;

  @Column({
    name: 'publisher_id',
    type: 'bigint',
    nullable: true,
    comment: '发布人ID',
  })
  publisherId?: string;

  @Column({
    name: 'publisher_name',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '发布人姓名',
  })
  publisherName?: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;

  @Column({
    name: 'is_removed',
    type: 'tinyint',
    default: 0,
    comment: '删除标识',
  })
  isRemoved: boolean;
}
