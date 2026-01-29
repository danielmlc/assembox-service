import { Entity, Column } from 'typeorm';
import { HasPrimaryFullEntity } from '@cs/nest-typeorm';

/**
 * 组件分类枚举
 */
export enum ComponentCategory {
  MODEL = 'model',
  SERVICE = 'service',
  FRONTEND = 'frontend',
}

/**
 * 组件注册表 (ab_component)
 * 统一管理所有配置单元（组件），是继承查找的基础
 */
@Entity('ab_component')
export class AbComponent extends HasPrimaryFullEntity {
  @Column({
    name: 'version_id',
    type: 'bigint',
    comment: '所属版本ID',
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
    comment: '组件代码',
  })
  componentCode: string;

  @Column({
    name: 'component_name',
    type: 'varchar',
    length: 200,
    comment: '组件名称',
  })
  componentName: string;

  @Column({
    name: 'component_type',
    type: 'varchar',
    length: 50,
    comment: '组件类型: model/logic/api/page/table/form/filter/export等',
  })
  componentType: string;

  @Column({
    name: 'category',
    type: 'varchar',
    length: 50,
    comment: '分类: model/service/frontend',
  })
  category: ComponentCategory;

  @Column({
    name: 'is_inheritable',
    type: 'tinyint',
    default: 1,
    comment: '是否支持继承，0=仅system层，1=支持三层继承',
  })
  isInheritable: boolean;

  @Column({
    name: 'is_cacheable',
    type: 'tinyint',
    default: 1,
    comment: '是否启用缓存，0=直接读库，1=走Redis缓存',
  })
  isCacheable: boolean;

  @Column({
    name: 'description',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '组件描述',
  })
  description?: string;
}
