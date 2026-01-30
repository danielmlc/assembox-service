import { Entity, Column, PrimaryColumn } from 'typeorm';
import { registerEntity } from '@cs/nest-typeorm';

/**
 * 常用字段示例表实体
 * 该表位于 test 数据库（连接名：common）
 * 具有复合主键：(id, tenant, order_id)
 */
@Entity('common_fields_demo')
export class CommonFieldsDemo {
  @PrimaryColumn({
    name: 'id',
    type: 'bigint',
    comment: '主键',
  })
  id!: string;

  @PrimaryColumn({
    name: 'tenant',
    type: 'varchar',
    length: 50,
    comment: '租户编码',
  })
  tenant!: string;

  @PrimaryColumn({
    name: 'order_id',
    type: 'bigint',
    comment: '单据主键',
  })
  orderId!: string;

  @Column({
    name: 'code',
    type: 'varchar',
    length: 50,
    comment: '编码',
  })
  code!: string;

  @Column({
    name: 'name',
    type: 'varchar',
    length: 100,
    comment: '名称',
  })
  name!: string;

  @Column({
    name: 'sort_code',
    type: 'int',
    default: 0,
    nullable: true,
    comment: '排序码',
  })
  sortCode?: number;

  @Column({
    name: 'is_enable',
    type: 'tinyint',
    default: 1,
    nullable: true,
    comment: '启用状态：0-禁用，1-启用',
  })
  isEnable?: number;

  @Column({
    name: 'org_id',
    type: 'bigint',
    nullable: true,
    comment: '组织机构ID',
  })
  orgId?: string;

  @Column({
    name: 'remark',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '备注',
  })
  remark?: string;
}

// 注册实体到 common 数据库连接
registerEntity({
  entity: CommonFieldsDemo,
  connectionName: 'common',
});
