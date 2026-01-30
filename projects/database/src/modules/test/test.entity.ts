import { Entity, Column } from 'typeorm';
import { HasPrimaryFullEntity, registerEntity } from '@cs/nest-typeorm';

/**
 * 测试实体 - 用于验证数据库工具的标准方法
 * 继承 HasPrimaryFullEntity 获得完整的基础字段
 */
@Entity('test_records')
export class TestRecord extends HasPrimaryFullEntity {
  @Column({
    name: 'title',
    comment: '标题',
    type: 'varchar',
    length: 200,
  })
  title = '';

  @Column({
    name: 'content',
    comment: '内容',
    type: 'text',
    nullable: true,
  })
  content?: string;

  @Column({
    name: 'status',
    comment: '状态：active-活跃, inactive-非活跃, pending-待处理',
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status = 'active';

  @Column({
    name: 'priority',
    comment: '优先级：1-低, 2-中, 3-高',
    type: 'tinyint',
    default: 1,
  })
  priority = 1;

  @Column({
    name: 'score',
    comment: '评分',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  score?: number;

  @Column({
    name: 'tags',
    comment: '标签，JSON格式',
    type: 'json',
    nullable: true,
  })
  tags?: string[];

  @Column({
    name: 'metadata',
    comment: '元数据，JSON格式',
    type: 'json',
    nullable: true,
  })
  metadata?: Record<string, any>;

  @Column({
    name: 'due_date',
    comment: '到期时间',
    type: 'datetime',
    nullable: true,
  })
  dueDate?: Date;

  @Column({
    name: 'view_count',
    comment: '查看次数',
    type: 'int',
    default: 0,
  })
  viewCount = 0;

  @Column({
    name: 'is_featured',
    comment: '是否特色',
    type: 'tinyint',
    default: false,
  })
  isFeatured = false;
}

registerEntity({
  entity: TestRecord,
  connectionName: 'default', // 使用默认连接，可根据需要修改
});
