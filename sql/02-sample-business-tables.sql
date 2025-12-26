-- ============================================================
-- AseemBox 低代码平台 - 示例业务表
-- 这些是预埋的业务表，用于演示低代码平台的功能
-- ============================================================

-- 1. 客户表
CREATE TABLE IF NOT EXISTS `t_customer` (
  `id` bigint NOT NULL COMMENT '主键',
  `code` varchar(50) NOT NULL COMMENT '客户编码',
  `name` varchar(200) NOT NULL COMMENT '客户名称',
  `contact_person` varchar(100) DEFAULT NULL COMMENT '联系人',
  `phone` varchar(20) DEFAULT NULL COMMENT '电话',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `address` varchar(500) DEFAULT NULL COMMENT '地址',
  `status` varchar(20) NOT NULL DEFAULT 'active' COMMENT '状态：active, inactive',
  `tenant` varchar(64) NOT NULL COMMENT '租户代码',
  -- 基础字段
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `creator_id` bigint DEFAULT NULL COMMENT '创建用户主键',
  `creator_name` varchar(50) DEFAULT NULL COMMENT '添加人',
  `modifier_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '上次修改时间',
  `modifier_id` bigint DEFAULT NULL COMMENT '修改用户主键',
  `modifier_name` varchar(50) DEFAULT NULL COMMENT '修改人',
  `is_removed` tinyint DEFAULT 0 COMMENT '删除标识',
  `version` bigint DEFAULT NULL COMMENT '版本号',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customer_code_tenant` (`code`, `tenant`),
  KEY `idx_customer_tenant` (`tenant`),
  KEY `idx_customer_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户表';

-- 2. 产品表
CREATE TABLE IF NOT EXISTS `t_product` (
  `id` bigint NOT NULL COMMENT '主键',
  `code` varchar(50) NOT NULL COMMENT '产品编码',
  `name` varchar(200) NOT NULL COMMENT '产品名称',
  `category` varchar(100) DEFAULT NULL COMMENT '产品分类',
  `unit` varchar(20) DEFAULT NULL COMMENT '单位',
  `price` decimal(12,2) NOT NULL DEFAULT 0 COMMENT '单价',
  `cost` decimal(12,2) DEFAULT 0 COMMENT '成本',
  `stock_qty` int DEFAULT 0 COMMENT '库存数量',
  `description` text DEFAULT NULL COMMENT '产品描述',
  `status` varchar(20) NOT NULL DEFAULT 'active' COMMENT '状态：active, inactive',
  `tenant` varchar(64) NOT NULL COMMENT '租户代码',
  -- 基础字段
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `creator_id` bigint DEFAULT NULL COMMENT '创建用户主键',
  `creator_name` varchar(50) DEFAULT NULL COMMENT '添加人',
  `modifier_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '上次修改时间',
  `modifier_id` bigint DEFAULT NULL COMMENT '修改用户主键',
  `modifier_name` varchar(50) DEFAULT NULL COMMENT '修改人',
  `is_removed` tinyint DEFAULT 0 COMMENT '删除标识',
  `version` bigint DEFAULT NULL COMMENT '版本号',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_code_tenant` (`code`, `tenant`),
  KEY `idx_product_tenant` (`tenant`),
  KEY `idx_product_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品表';

-- 3. 订单表
CREATE TABLE IF NOT EXISTS `t_order` (
  `id` bigint NOT NULL COMMENT '主键',
  `order_no` varchar(50) NOT NULL COMMENT '订单编号',
  `customer_id` bigint NOT NULL COMMENT '客户ID',
  `order_date` date NOT NULL COMMENT '订单日期',
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0 COMMENT '订单总额',
  `discount_amount` decimal(12,2) DEFAULT 0 COMMENT '折扣金额',
  `final_amount` decimal(12,2) NOT NULL DEFAULT 0 COMMENT '实付金额',
  `status` varchar(20) NOT NULL DEFAULT 'draft' COMMENT '状态：draft, confirmed, shipped, completed, cancelled',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `tenant` varchar(64) NOT NULL COMMENT '租户代码',
  -- 基础字段
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `creator_id` bigint DEFAULT NULL COMMENT '创建用户主键',
  `creator_name` varchar(50) DEFAULT NULL COMMENT '添加人',
  `modifier_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '上次修改时间',
  `modifier_id` bigint DEFAULT NULL COMMENT '修改用户主键',
  `modifier_name` varchar(50) DEFAULT NULL COMMENT '修改人',
  `is_removed` tinyint DEFAULT 0 COMMENT '删除标识',
  `version` bigint DEFAULT NULL COMMENT '版本号',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no_tenant` (`order_no`, `tenant`),
  KEY `idx_order_customer` (`customer_id`),
  KEY `idx_order_tenant` (`tenant`),
  KEY `idx_order_date` (`order_date`),
  KEY `idx_order_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- 4. 订单明细表
CREATE TABLE IF NOT EXISTS `t_order_item` (
  `id` bigint NOT NULL COMMENT '主键',
  `order_id` bigint NOT NULL COMMENT '订单ID',
  `product_id` bigint NOT NULL COMMENT '产品ID',
  `product_name` varchar(200) NOT NULL COMMENT '产品名称（冗余）',
  `quantity` int NOT NULL DEFAULT 1 COMMENT '数量',
  `unit_price` decimal(12,2) NOT NULL COMMENT '单价',
  `amount` decimal(12,2) NOT NULL COMMENT '金额',
  `tenant` varchar(64) NOT NULL COMMENT '租户代码',
  -- 基础字段
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `creator_id` bigint DEFAULT NULL COMMENT '创建用户主键',
  `creator_name` varchar(50) DEFAULT NULL COMMENT '添加人',
  `modifier_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '上次修改时间',
  `modifier_id` bigint DEFAULT NULL COMMENT '修改用户主键',
  `modifier_name` varchar(50) DEFAULT NULL COMMENT '修改人',
  `is_removed` tinyint DEFAULT 0 COMMENT '删除标识',
  `version` bigint DEFAULT NULL COMMENT '版本号',
  PRIMARY KEY (`id`),
  KEY `idx_order_item_order` (`order_id`),
  KEY `idx_order_item_product` (`product_id`),
  KEY `idx_order_item_tenant` (`tenant`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单明细表';
