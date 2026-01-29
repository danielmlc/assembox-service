import { HasPrimaryFullEntity } from '@cs/nest-typeorm';
import { Entity, Column } from 'typeorm';

/**
 * 模块表 (ab_module)
 * 最小配置管理单元
 */
@Entity('ab_module')
export class AbModule extends HasPrimaryFullEntity {
  @Column({
    name: 'module_code',
    type: 'varchar',
    length: 100,
    comment: '模块代码',
  })
  moduleCode: string;

  @Column({
    name: 'module_name',
    type: 'varchar',
    length: 200,
    comment: '模块名称',
  })
  moduleName: string;

  @Column({
    name: 'description',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '模块描述',
  })
  description?: string;

  @Column({
    name: 'active_version_id',
    type: 'bigint',
    nullable: true,
    comment: '当前激活版本ID',
  })
  activeVersionId?: string;

  @Column({
    name: 'active_version_code',
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: '当前激活版本号',
  })
  activeVersionCode?: string;
}
