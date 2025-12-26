-- ============================================================
-- AseemBox 低代码平台 - 元数据表初始化脚本
-- ============================================================

-- 1. 模型定义表
CREATE TABLE IF NOT EXISTS `ab_model_definition` (
  `id` bigint NOT NULL COMMENT '主键',
  `code` varchar(100) NOT NULL COMMENT '模型代码',
  `name` varchar(200) NOT NULL COMMENT '模型名称',
  `description` varchar(500) DEFAULT NULL COMMENT '模型描述',
  `table_name` varchar(100) NOT NULL COMMENT '物理表名',
  `database_name` varchar(100) DEFAULT NULL COMMENT '数据库名',
  `config` json NOT NULL COMMENT '模型配置（JSON）',
  `indexes` json DEFAULT NULL COMMENT '索引定义（JSON）',
  `status` varchar(20) NOT NULL DEFAULT 'draft' COMMENT '模型状态：draft, published, deprecated',
  `version_num` int NOT NULL DEFAULT 1 COMMENT '模型版本号',
  `published_at` datetime DEFAULT NULL COMMENT '发布时间',
  `tenant` varchar(64) NOT NULL COMMENT '租户代码',
  -- 基础字段 (BaseEntity)
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `creator_id` bigint DEFAULT NULL COMMENT '创建用户主键',
  `creator_name` varchar(50) DEFAULT NULL COMMENT '添加人',
  `modifier_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '上次修改时间',
  `modifier_id` bigint DEFAULT NULL COMMENT '修改用户主键',
  `modifier_name` varchar(50) DEFAULT NULL COMMENT '修改人',
  `is_removed` tinyint DEFAULT 0 COMMENT '删除标识',
  `version` bigint DEFAULT NULL COMMENT '版本号',
  -- 扩展字段 (HasEnableEntity)
  `sort_code` int DEFAULT NULL COMMENT '排序',
  `is_enable` tinyint DEFAULT 1 COMMENT '启用',
  PRIMARY KEY (`id`),
  KEY `idx_model_code_tenant` (`code`, `tenant`),
  KEY `idx_model_status` (`status`),
  KEY `idx_model_tenant` (`tenant`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型定义表';

-- 2. 字段定义表
CREATE TABLE IF NOT EXISTS `ab_field_definition` (
  `id` bigint NOT NULL COMMENT '主键',
  `model_id` bigint NOT NULL COMMENT '关联的模型ID',
  `code` varchar(100) NOT NULL COMMENT '字段代码',
  `name` varchar(200) NOT NULL COMMENT '字段名称',
  `description` varchar(500) DEFAULT NULL COMMENT '字段描述',
  `field_type` varchar(50) NOT NULL COMMENT '字段类型',
  `db_type` varchar(100) NOT NULL COMMENT '数据库类型',
  `constraints` json NOT NULL COMMENT '字段约束（JSON）',
  `validations` json DEFAULT NULL COMMENT '验证规则（JSON）',
  `ui_config` json DEFAULT NULL COMMENT 'UI配置（JSON）',
  `computed_config` json DEFAULT NULL COMMENT '计算字段配置（JSON）',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序顺序',
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
  `sort_code` int DEFAULT NULL COMMENT '排序',
  `is_enable` tinyint DEFAULT 1 COMMENT '启用',
  PRIMARY KEY (`id`),
  KEY `idx_field_model` (`model_id`),
  KEY `idx_field_code_model` (`code`, `model_id`),
  KEY `idx_field_tenant` (`tenant`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字段定义表';

-- 3. 关联定义表
CREATE TABLE IF NOT EXISTS `ab_relation_definition` (
  `id` bigint NOT NULL COMMENT '主键',
  `code` varchar(100) NOT NULL COMMENT '关联代码',
  `name` varchar(200) NOT NULL COMMENT '关联名称',
  `description` varchar(500) DEFAULT NULL COMMENT '关联描述',
  `source_model_id` bigint NOT NULL COMMENT '源模型ID',
  `source_model_code` varchar(100) NOT NULL COMMENT '源模型代码',
  `target_model_id` bigint NOT NULL COMMENT '目标模型ID',
  `target_model_code` varchar(100) NOT NULL COMMENT '目标模型代码',
  `relation_type` varchar(50) NOT NULL COMMENT '关联类型',
  `join_config` json NOT NULL COMMENT 'JOIN配置（JSON）',
  `include_fields` json DEFAULT NULL COMMENT '包含的目标字段（JSON）',
  `field_aliases` json DEFAULT NULL COMMENT '字段别名映射（JSON）',
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
  `sort_code` int DEFAULT NULL COMMENT '排序',
  `is_enable` tinyint DEFAULT 1 COMMENT '启用',
  PRIMARY KEY (`id`),
  KEY `idx_relation_source_model` (`source_model_id`),
  KEY `idx_relation_target_model` (`target_model_id`),
  KEY `idx_relation_code` (`code`, `source_model_id`),
  KEY `idx_relation_tenant` (`tenant`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='关联定义表';

-- 4. 操作定义表
CREATE TABLE IF NOT EXISTS `ab_action_definition` (
  `id` bigint NOT NULL COMMENT '主键',
  `model_id` bigint NOT NULL COMMENT '关联的模型ID',
  `code` varchar(100) NOT NULL COMMENT '操作代码',
  `name` varchar(200) NOT NULL COMMENT '操作名称',
  `description` varchar(500) DEFAULT NULL COMMENT '操作描述',
  `action_type` varchar(50) NOT NULL COMMENT '操作类型',
  `permissions` json DEFAULT NULL COMMENT '权限代码列表（JSON）',
  `hooks` json DEFAULT NULL COMMENT '钩子配置（JSON）',
  `query_config` json DEFAULT NULL COMMENT '查询配置（JSON）',
  `mutation_config` json DEFAULT NULL COMMENT '变更配置（JSON）',
  `custom_config` json DEFAULT NULL COMMENT '自定义操作配置（JSON）',
  `is_enabled` tinyint NOT NULL DEFAULT 1 COMMENT '是否启用',
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
  `sort_code` int DEFAULT NULL COMMENT '排序',
  `is_enable` tinyint DEFAULT 1 COMMENT '启用',
  PRIMARY KEY (`id`),
  KEY `idx_action_model` (`model_id`),
  KEY `idx_action_code_model` (`code`, `model_id`),
  KEY `idx_action_tenant` (`tenant`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作定义表';
