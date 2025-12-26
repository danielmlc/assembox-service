-- ============================================================
-- AseemBox 低代码平台 - 示例元数据
-- 为示例业务表配置元数据，用于演示低代码平台功能
-- 注意：ID 使用雪花算法生成，这里使用示例ID
-- 租户代码使用 'demo' 作为示例
-- ============================================================

-- 清理已有的示例数据（可选，谨慎使用）
-- DELETE FROM ab_action_definition WHERE tenant = 'demo';
-- DELETE FROM ab_relation_definition WHERE tenant = 'demo';
-- DELETE FROM ab_field_definition WHERE tenant = 'demo';
-- DELETE FROM ab_model_definition WHERE tenant = 'demo';

-- ============================================================
-- 1. 模型定义
-- ============================================================

-- 客户模型
INSERT INTO `ab_model_definition`
(`id`, `code`, `name`, `description`, `table_name`, `database_name`, `config`, `indexes`, `status`, `version_num`, `tenant`, `is_enable`)
VALUES
(1001, 'customer', '客户', '客户信息管理', 't_customer', NULL,
'{"enableSoftDelete": true, "enableVersion": true, "enableAudit": true, "enableTenant": true, "cacheStrategy": "read", "cacheTTL": 3600}',
'[{"name": "uk_customer_code_tenant", "columns": ["code", "tenant"], "unique": true}]',
'published', 1, 'demo', 1);

-- 产品模型
INSERT INTO `ab_model_definition`
(`id`, `code`, `name`, `description`, `table_name`, `database_name`, `config`, `indexes`, `status`, `version_num`, `tenant`, `is_enable`)
VALUES
(1002, 'product', '产品', '产品信息管理', 't_product', NULL,
'{"enableSoftDelete": true, "enableVersion": true, "enableAudit": true, "enableTenant": true, "cacheStrategy": "read", "cacheTTL": 3600}',
'[{"name": "uk_product_code_tenant", "columns": ["code", "tenant"], "unique": true}]',
'published', 1, 'demo', 1);

-- 订单模型
INSERT INTO `ab_model_definition`
(`id`, `code`, `name`, `description`, `table_name`, `database_name`, `config`, `indexes`, `status`, `version_num`, `tenant`, `is_enable`)
VALUES
(1003, 'order', '销售订单', '销售订单管理', 't_order', NULL,
'{"enableSoftDelete": true, "enableVersion": true, "enableAudit": true, "enableTenant": true, "cacheStrategy": "none", "cacheTTL": 0}',
'[{"name": "uk_order_no_tenant", "columns": ["order_no", "tenant"], "unique": true}]',
'published', 1, 'demo', 1);

-- 订单明细模型
INSERT INTO `ab_model_definition`
(`id`, `code`, `name`, `description`, `table_name`, `database_name`, `config`, `indexes`, `status`, `version_num`, `tenant`, `is_enable`)
VALUES
(1004, 'orderItem', '订单明细', '订单明细管理', 't_order_item', NULL,
'{"enableSoftDelete": true, "enableVersion": true, "enableAudit": true, "enableTenant": true, "cacheStrategy": "none", "cacheTTL": 0}',
NULL, 'published', 1, 'demo', 1);

-- ============================================================
-- 2. 字段定义
-- ============================================================

-- ---------- 客户模型字段 ----------
INSERT INTO `ab_field_definition`
(`id`, `model_id`, `code`, `name`, `description`, `field_type`, `db_type`, `constraints`, `validations`, `ui_config`, `sort_order`, `tenant`, `is_enable`)
VALUES
-- 主键
(2001, 1001, 'id', '主键', '客户主键ID', 'integer', 'bigint',
'{"required": true, "unique": true, "primaryKey": true, "autoIncrement": false}', NULL,
'{"component": "hidden", "visible": false, "editable": false, "sortable": true, "filterable": false}', 0, 'demo', 1),
-- 客户编码
(2002, 1001, 'code', '客户编码', '客户唯一编码', 'string', 'varchar(50)',
'{"required": true, "unique": true, "primaryKey": false, "length": 50}',
'[{"type": "required", "message": "客户编码不能为空"}, {"type": "maxLength", "value": 50, "message": "客户编码最大50个字符"}]',
'{"component": "input", "visible": true, "editable": true, "sortable": true, "filterable": true}', 1, 'demo', 1),
-- 客户名称
(2003, 1001, 'name', '客户名称', '客户显示名称', 'string', 'varchar(200)',
'{"required": true, "unique": false, "primaryKey": false, "length": 200}',
'[{"type": "required", "message": "客户名称不能为空"}]',
'{"component": "input", "visible": true, "editable": true, "sortable": true, "filterable": true}', 2, 'demo', 1),
-- 联系人
(2004, 1001, 'contactPerson', '联系人', '主要联系人姓名', 'string', 'varchar(100)',
'{"required": false, "unique": false, "primaryKey": false, "length": 100}', NULL,
'{"component": "input", "visible": true, "editable": true, "sortable": false, "filterable": true}', 3, 'demo', 1),
-- 电话
(2005, 1001, 'phone', '电话', '联系电话', 'string', 'varchar(20)',
'{"required": false, "unique": false, "primaryKey": false, "length": 20}',
'[{"type": "pattern", "pattern": "^1[3-9]\\\\d{9}$", "message": "请输入正确的手机号"}]',
'{"component": "input", "visible": true, "editable": true, "sortable": false, "filterable": true}', 4, 'demo', 1),
-- 邮箱
(2006, 1001, 'email', '邮箱', '电子邮箱', 'string', 'varchar(100)',
'{"required": false, "unique": false, "primaryKey": false, "length": 100}',
'[{"type": "email", "message": "请输入正确的邮箱地址"}]',
'{"component": "input", "visible": true, "editable": true, "sortable": false, "filterable": false}', 5, 'demo', 1),
-- 地址
(2007, 1001, 'address', '地址', '详细地址', 'string', 'varchar(500)',
'{"required": false, "unique": false, "primaryKey": false, "length": 500}', NULL,
'{"component": "textarea", "visible": true, "editable": true, "sortable": false, "filterable": false}', 6, 'demo', 1),
-- 状态
(2008, 1001, 'status', '状态', '客户状态', 'enum', 'varchar(20)',
'{"required": true, "unique": false, "primaryKey": false, "default": "active", "enum": ["active", "inactive"]}', NULL,
'{"component": "select", "props": {"options": [{"label": "启用", "value": "active"}, {"label": "禁用", "value": "inactive"}]}, "visible": true, "editable": true, "sortable": true, "filterable": true}', 7, 'demo', 1);

-- ---------- 产品模型字段 ----------
INSERT INTO `ab_field_definition`
(`id`, `model_id`, `code`, `name`, `description`, `field_type`, `db_type`, `constraints`, `validations`, `ui_config`, `sort_order`, `tenant`, `is_enable`)
VALUES
(2101, 1002, 'id', '主键', '产品主键ID', 'integer', 'bigint',
'{"required": true, "unique": true, "primaryKey": true, "autoIncrement": false}', NULL,
'{"component": "hidden", "visible": false, "editable": false, "sortable": true, "filterable": false}', 0, 'demo', 1),
(2102, 1002, 'code', '产品编码', '产品唯一编码', 'string', 'varchar(50)',
'{"required": true, "unique": true, "primaryKey": false, "length": 50}',
'[{"type": "required", "message": "产品编码不能为空"}]',
'{"component": "input", "visible": true, "editable": true, "sortable": true, "filterable": true}', 1, 'demo', 1),
(2103, 1002, 'name', '产品名称', '产品显示名称', 'string', 'varchar(200)',
'{"required": true, "unique": false, "primaryKey": false, "length": 200}',
'[{"type": "required", "message": "产品名称不能为空"}]',
'{"component": "input", "visible": true, "editable": true, "sortable": true, "filterable": true}', 2, 'demo', 1),
(2104, 1002, 'category', '产品分类', '产品所属分类', 'string', 'varchar(100)',
'{"required": false, "unique": false, "primaryKey": false, "length": 100}', NULL,
'{"component": "select", "visible": true, "editable": true, "sortable": true, "filterable": true}', 3, 'demo', 1),
(2105, 1002, 'unit', '单位', '计量单位', 'string', 'varchar(20)',
'{"required": false, "unique": false, "primaryKey": false, "length": 20}', NULL,
'{"component": "input", "visible": true, "editable": true, "sortable": false, "filterable": false}', 4, 'demo', 1),
(2106, 1002, 'price', '单价', '销售单价', 'decimal', 'decimal(12,2)',
'{"required": true, "unique": false, "primaryKey": false, "default": 0, "precision": 12, "scale": 2}',
'[{"type": "min", "min": 0, "message": "单价不能小于0"}]',
'{"component": "inputNumber", "props": {"precision": 2, "min": 0}, "visible": true, "editable": true, "sortable": true, "filterable": true}', 5, 'demo', 1),
(2107, 1002, 'cost', '成本', '产品成本', 'decimal', 'decimal(12,2)',
'{"required": false, "unique": false, "primaryKey": false, "default": 0, "precision": 12, "scale": 2}', NULL,
'{"component": "inputNumber", "props": {"precision": 2, "min": 0}, "visible": true, "editable": true, "sortable": false, "filterable": false}', 6, 'demo', 1),
(2108, 1002, 'stockQty', '库存数量', '当前库存', 'integer', 'int',
'{"required": false, "unique": false, "primaryKey": false, "default": 0}', NULL,
'{"component": "inputNumber", "props": {"precision": 0, "min": 0}, "visible": true, "editable": true, "sortable": true, "filterable": true}', 7, 'demo', 1),
(2109, 1002, 'description', '产品描述', '详细描述', 'text', 'text',
'{"required": false, "unique": false, "primaryKey": false}', NULL,
'{"component": "richtext", "visible": true, "editable": true, "sortable": false, "filterable": false}', 8, 'demo', 1),
(2110, 1002, 'status', '状态', '产品状态', 'enum', 'varchar(20)',
'{"required": true, "unique": false, "primaryKey": false, "default": "active", "enum": ["active", "inactive"]}', NULL,
'{"component": "select", "props": {"options": [{"label": "上架", "value": "active"}, {"label": "下架", "value": "inactive"}]}, "visible": true, "editable": true, "sortable": true, "filterable": true}', 9, 'demo', 1);

-- ---------- 订单模型字段 ----------
INSERT INTO `ab_field_definition`
(`id`, `model_id`, `code`, `name`, `description`, `field_type`, `db_type`, `constraints`, `validations`, `ui_config`, `sort_order`, `tenant`, `is_enable`)
VALUES
(2201, 1003, 'id', '主键', '订单主键ID', 'integer', 'bigint',
'{"required": true, "unique": true, "primaryKey": true, "autoIncrement": false}', NULL,
'{"component": "hidden", "visible": false, "editable": false, "sortable": true, "filterable": false}', 0, 'demo', 1),
(2202, 1003, 'orderNo', '订单编号', '订单唯一编号', 'string', 'varchar(50)',
'{"required": true, "unique": true, "primaryKey": false, "length": 50}',
'[{"type": "required", "message": "订单编号不能为空"}]',
'{"component": "input", "visible": true, "editable": false, "sortable": true, "filterable": true}', 1, 'demo', 1),
(2203, 1003, 'customerId', '客户ID', '关联客户', 'integer', 'bigint',
'{"required": true, "unique": false, "primaryKey": false}',
'[{"type": "required", "message": "请选择客户"}]',
'{"component": "select", "props": {"remote": true, "model": "customer", "labelField": "name", "valueField": "id"}, "visible": true, "editable": true, "sortable": false, "filterable": true}', 2, 'demo', 1),
(2204, 1003, 'orderDate', '订单日期', '下单日期', 'date', 'date',
'{"required": true, "unique": false, "primaryKey": false}',
'[{"type": "required", "message": "请选择订单日期"}]',
'{"component": "datePicker", "visible": true, "editable": true, "sortable": true, "filterable": true}', 3, 'demo', 1),
(2205, 1003, 'totalAmount', '订单总额', '商品总金额', 'decimal', 'decimal(12,2)',
'{"required": true, "unique": false, "primaryKey": false, "default": 0, "precision": 12, "scale": 2}', NULL,
'{"component": "inputNumber", "props": {"precision": 2, "disabled": true}, "visible": true, "editable": false, "sortable": true, "filterable": false}', 4, 'demo', 1),
(2206, 1003, 'discountAmount', '折扣金额', '优惠金额', 'decimal', 'decimal(12,2)',
'{"required": false, "unique": false, "primaryKey": false, "default": 0, "precision": 12, "scale": 2}', NULL,
'{"component": "inputNumber", "props": {"precision": 2, "min": 0}, "visible": true, "editable": true, "sortable": false, "filterable": false}', 5, 'demo', 1),
(2207, 1003, 'finalAmount', '实付金额', '实际支付金额', 'decimal', 'decimal(12,2)',
'{"required": true, "unique": false, "primaryKey": false, "default": 0, "precision": 12, "scale": 2}', NULL,
'{"component": "inputNumber", "props": {"precision": 2, "disabled": true}, "visible": true, "editable": false, "sortable": true, "filterable": true}', 6, 'demo', 1),
(2208, 1003, 'status', '状态', '订单状态', 'enum', 'varchar(20)',
'{"required": true, "unique": false, "primaryKey": false, "default": "draft", "enum": ["draft", "confirmed", "shipped", "completed", "cancelled"]}', NULL,
'{"component": "select", "props": {"options": [{"label": "草稿", "value": "draft"}, {"label": "已确认", "value": "confirmed"}, {"label": "已发货", "value": "shipped"}, {"label": "已完成", "value": "completed"}, {"label": "已取消", "value": "cancelled"}]}, "visible": true, "editable": true, "sortable": true, "filterable": true}', 7, 'demo', 1),
(2209, 1003, 'remark', '备注', '订单备注', 'string', 'varchar(500)',
'{"required": false, "unique": false, "primaryKey": false, "length": 500}', NULL,
'{"component": "textarea", "visible": true, "editable": true, "sortable": false, "filterable": false}', 8, 'demo', 1);

-- ---------- 订单明细模型字段 ----------
INSERT INTO `ab_field_definition`
(`id`, `model_id`, `code`, `name`, `description`, `field_type`, `db_type`, `constraints`, `validations`, `ui_config`, `sort_order`, `tenant`, `is_enable`)
VALUES
(2301, 1004, 'id', '主键', '明细主键ID', 'integer', 'bigint',
'{"required": true, "unique": true, "primaryKey": true, "autoIncrement": false}', NULL,
'{"component": "hidden", "visible": false, "editable": false, "sortable": true, "filterable": false}', 0, 'demo', 1),
(2302, 1004, 'orderId', '订单ID', '关联订单', 'integer', 'bigint',
'{"required": true, "unique": false, "primaryKey": false}',
'[{"type": "required", "message": "订单ID不能为空"}]',
'{"component": "hidden", "visible": false, "editable": false, "sortable": false, "filterable": true}', 1, 'demo', 1),
(2303, 1004, 'productId', '产品ID', '关联产品', 'integer', 'bigint',
'{"required": true, "unique": false, "primaryKey": false}',
'[{"type": "required", "message": "请选择产品"}]',
'{"component": "select", "props": {"remote": true, "model": "product", "labelField": "name", "valueField": "id"}, "visible": true, "editable": true, "sortable": false, "filterable": true}', 2, 'demo', 1),
(2304, 1004, 'productName', '产品名称', '产品名称（冗余）', 'string', 'varchar(200)',
'{"required": true, "unique": false, "primaryKey": false, "length": 200}', NULL,
'{"component": "input", "props": {"disabled": true}, "visible": true, "editable": false, "sortable": false, "filterable": true}', 3, 'demo', 1),
(2305, 1004, 'quantity', '数量', '购买数量', 'integer', 'int',
'{"required": true, "unique": false, "primaryKey": false, "default": 1}',
'[{"type": "min", "min": 1, "message": "数量至少为1"}]',
'{"component": "inputNumber", "props": {"precision": 0, "min": 1}, "visible": true, "editable": true, "sortable": true, "filterable": false}', 4, 'demo', 1),
(2306, 1004, 'unitPrice', '单价', '产品单价', 'decimal', 'decimal(12,2)',
'{"required": true, "unique": false, "primaryKey": false, "precision": 12, "scale": 2}', NULL,
'{"component": "inputNumber", "props": {"precision": 2, "min": 0}, "visible": true, "editable": true, "sortable": true, "filterable": false}', 5, 'demo', 1),
(2307, 1004, 'amount', '金额', '小计金额', 'decimal', 'decimal(12,2)',
'{"required": true, "unique": false, "primaryKey": false, "precision": 12, "scale": 2}', NULL,
'{"component": "inputNumber", "props": {"precision": 2, "disabled": true}, "visible": true, "editable": false, "sortable": true, "filterable": false}', 6, 'demo', 1);

-- ============================================================
-- 3. 关联定义
-- ============================================================

-- 订单 -> 客户 (多对一)
INSERT INTO `ab_relation_definition`
(`id`, `code`, `name`, `description`, `source_model_id`, `source_model_code`, `target_model_id`, `target_model_code`, `relation_type`, `join_config`, `include_fields`, `field_aliases`, `tenant`, `is_enable`)
VALUES
(3001, 'orderCustomer', '订单客户', '订单关联的客户信息', 1003, 'order', 1001, 'customer', 'many-to-one',
'{"sourceField": "customer_id", "targetField": "id", "joinType": "LEFT"}',
'["name", "phone", "contactPerson"]',
'{"name": "customerName", "phone": "customerPhone", "contactPerson": "customerContact"}',
'demo', 1);

-- 订单明细 -> 订单 (多对一)
INSERT INTO `ab_relation_definition`
(`id`, `code`, `name`, `description`, `source_model_id`, `source_model_code`, `target_model_id`, `target_model_code`, `relation_type`, `join_config`, `include_fields`, `field_aliases`, `tenant`, `is_enable`)
VALUES
(3002, 'orderItemOrder', '明细订单', '订单明细关联的订单信息', 1004, 'orderItem', 1003, 'order', 'many-to-one',
'{"sourceField": "order_id", "targetField": "id", "joinType": "LEFT"}',
'["orderNo", "status"]',
'{"orderNo": "orderNumber", "status": "orderStatus"}',
'demo', 1);

-- 订单明细 -> 产品 (多对一)
INSERT INTO `ab_relation_definition`
(`id`, `code`, `name`, `description`, `source_model_id`, `source_model_code`, `target_model_id`, `target_model_code`, `relation_type`, `join_config`, `include_fields`, `field_aliases`, `tenant`, `is_enable`)
VALUES
(3003, 'orderItemProduct', '明细产品', '订单明细关联的产品信息', 1004, 'orderItem', 1002, 'product', 'many-to-one',
'{"sourceField": "product_id", "targetField": "id", "joinType": "LEFT"}',
'["code", "category", "unit"]',
'{"code": "productCode", "category": "productCategory", "unit": "productUnit"}',
'demo', 1);

-- 订单 -> 订单明细 (一对多)
INSERT INTO `ab_relation_definition`
(`id`, `code`, `name`, `description`, `source_model_id`, `source_model_code`, `target_model_id`, `target_model_code`, `relation_type`, `join_config`, `include_fields`, `field_aliases`, `tenant`, `is_enable`)
VALUES
(3004, 'orderItems', '订单明细', '订单包含的明细列表', 1003, 'order', 1004, 'orderItem', 'one-to-many',
'{"sourceField": "id", "targetField": "order_id", "joinType": "LEFT"}',
'["productName", "quantity", "unitPrice", "amount"]',
NULL,
'demo', 1);

-- ============================================================
-- 4. 操作定义
-- ============================================================

-- ---------- 客户模型操作 ----------
INSERT INTO `ab_action_definition`
(`id`, `model_id`, `code`, `name`, `description`, `action_type`, `permissions`, `hooks`, `query_config`, `is_enabled`, `tenant`, `is_enable`)
VALUES
(4001, 1001, 'query', '查询客户', '查询客户列表', 'query', '["customer:read"]', NULL,
'{"defaultPageSize": 20, "maxPageSize": 100, "allowedFields": ["id", "code", "name", "contactPerson", "phone", "email", "status"]}',
1, 'demo', 1),
(4002, 1001, 'create', '创建客户', '新增客户信息', 'create', '["customer:create"]',
'{"beforeExecute": [{"pluginCode": "id-generator", "method": "generateId", "async": false, "order": 1}], "afterExecute": [{"pluginCode": "audit-fields", "method": "setCreateFields", "async": false, "order": 1}]}',
NULL, 1, 'demo', 1),
(4003, 1001, 'update', '更新客户', '修改客户信息', 'update', '["customer:update"]',
'{"beforeExecute": [{"pluginCode": "audit-fields", "method": "setUpdateFields", "async": false, "order": 1}]}',
NULL, 1, 'demo', 1),
(4004, 1001, 'delete', '删除客户', '删除客户（软删除）', 'delete', '["customer:delete"]', NULL, NULL, 1, 'demo', 1);

-- ---------- 产品模型操作 ----------
INSERT INTO `ab_action_definition`
(`id`, `model_id`, `code`, `name`, `description`, `action_type`, `permissions`, `hooks`, `query_config`, `is_enabled`, `tenant`, `is_enable`)
VALUES
(4101, 1002, 'query', '查询产品', '查询产品列表', 'query', '["product:read"]', NULL,
'{"defaultPageSize": 20, "maxPageSize": 100, "allowedFields": ["id", "code", "name", "category", "unit", "price", "stockQty", "status"]}',
1, 'demo', 1),
(4102, 1002, 'create', '创建产品', '新增产品信息', 'create', '["product:create"]',
'{"beforeExecute": [{"pluginCode": "id-generator", "method": "generateId", "async": false, "order": 1}], "afterExecute": [{"pluginCode": "audit-fields", "method": "setCreateFields", "async": false, "order": 1}]}',
NULL, 1, 'demo', 1),
(4103, 1002, 'update', '更新产品', '修改产品信息', 'update', '["product:update"]',
'{"beforeExecute": [{"pluginCode": "audit-fields", "method": "setUpdateFields", "async": false, "order": 1}]}',
NULL, 1, 'demo', 1),
(4104, 1002, 'delete', '删除产品', '删除产品（软删除）', 'delete', '["product:delete"]', NULL, NULL, 1, 'demo', 1);

-- ---------- 订单模型操作 ----------
INSERT INTO `ab_action_definition`
(`id`, `model_id`, `code`, `name`, `description`, `action_type`, `permissions`, `hooks`, `query_config`, `is_enabled`, `tenant`, `is_enable`)
VALUES
(4201, 1003, 'query', '查询订单', '查询订单列表', 'query', '["order:read"]', NULL,
'{"defaultPageSize": 20, "maxPageSize": 100, "allowedFields": ["id", "orderNo", "customerId", "orderDate", "totalAmount", "finalAmount", "status"]}',
1, 'demo', 1),
(4202, 1003, 'create', '创建订单', '新增销售订单', 'create', '["order:create"]',
'{"beforeExecute": [{"pluginCode": "id-generator", "method": "generateId", "async": false, "order": 1}], "afterExecute": [{"pluginCode": "audit-fields", "method": "setCreateFields", "async": false, "order": 1}, {"pluginCode": "data-event", "method": "publishCreate", "async": true, "order": 2}]}',
NULL, 1, 'demo', 1),
(4203, 1003, 'update', '更新订单', '修改订单信息', 'update', '["order:update"]',
'{"beforeExecute": [{"pluginCode": "audit-fields", "method": "setUpdateFields", "async": false, "order": 1}], "afterExecute": [{"pluginCode": "data-event", "method": "publishUpdate", "async": true, "order": 1}]}',
NULL, 1, 'demo', 1),
(4204, 1003, 'delete', '删除订单', '删除订单（软删除）', 'delete', '["order:delete"]', NULL, NULL, 1, 'demo', 1);

-- ---------- 订单明细模型操作 ----------
INSERT INTO `ab_action_definition`
(`id`, `model_id`, `code`, `name`, `description`, `action_type`, `permissions`, `hooks`, `query_config`, `is_enabled`, `tenant`, `is_enable`)
VALUES
(4301, 1004, 'query', '查询订单明细', '查询订单明细列表', 'query', '["orderItem:read"]', NULL,
'{"defaultPageSize": 50, "maxPageSize": 200, "allowedFields": ["id", "orderId", "productId", "productName", "quantity", "unitPrice", "amount"]}',
1, 'demo', 1),
(4302, 1004, 'create', '创建订单明细', '新增订单明细', 'create', '["orderItem:create"]',
'{"beforeExecute": [{"pluginCode": "id-generator", "method": "generateId", "async": false, "order": 1}], "afterExecute": [{"pluginCode": "audit-fields", "method": "setCreateFields", "async": false, "order": 1}]}',
NULL, 1, 'demo', 1),
(4303, 1004, 'update', '更新订单明细', '修改订单明细', 'update', '["orderItem:update"]',
'{"beforeExecute": [{"pluginCode": "audit-fields", "method": "setUpdateFields", "async": false, "order": 1}]}',
NULL, 1, 'demo', 1),
(4304, 1004, 'delete', '删除订单明细', '删除订单明细', 'delete', '["orderItem:delete"]', NULL, NULL, 1, 'demo', 1);
