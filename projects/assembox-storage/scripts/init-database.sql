-- Assembox 存储层数据库初始化脚本
-- 基于存储层设计文档创建

-- 1. 模块表 (ab_module)
CREATE TABLE IF NOT EXISTS ab_module (
    -- 主键
    id              BIGINT NOT NULL COMMENT '主键',

    -- 模块标识
    module_code     VARCHAR(100) NOT NULL COMMENT '模块代码',
    module_name     VARCHAR(200) NOT NULL COMMENT '模块名称',
    description     VARCHAR(500) COMMENT '模块描述',

    -- 当前激活版本
    active_version_id   BIGINT COMMENT '当前激活版本ID',
    active_version_code VARCHAR(20) COMMENT '当前激活版本号',

    -- 审计字段 (BaseEntity)
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_id      BIGINT,
    creator_name    VARCHAR(50),
    modifier_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    modifier_id     BIGINT,
    modifier_name   VARCHAR(50),
    is_removed      TINYINT(1) DEFAULT 0,
    version         BIGINT DEFAULT 0,

    -- 启用/排序 (HasEnableEntity)
    sort_code       INT,
    is_enable       TINYINT(1) DEFAULT 1,

    PRIMARY KEY (id)
) COMMENT '模块定义表';

-- 2. 模块版本表 (ab_module_version)
CREATE TABLE IF NOT EXISTS ab_module_version (
    -- 主键
    id              BIGINT NOT NULL COMMENT '主键',

    -- 关联模块
    module_id       BIGINT NOT NULL COMMENT '模块ID',
    module_code     VARCHAR(100) NOT NULL COMMENT '模块代码（冗余）',

    -- 版本信息
    version_code    VARCHAR(20) NOT NULL COMMENT '版本号，如 V1、V2、V3',
    version_name    VARCHAR(100) COMMENT '版本名称',
    description     VARCHAR(500) COMMENT '版本说明',

    -- 版本状态
    status          VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft/published/deprecated',
    published_at    DATETIME COMMENT '首次发布时间',

    -- 关联代码分支
    git_branch      VARCHAR(100) COMMENT 'Git分支名称，格式: {module_code}/{version_code}',

    -- 审计字段
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_id      BIGINT,
    creator_name    VARCHAR(50),
    modifier_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    modifier_id     BIGINT,
    modifier_name   VARCHAR(50),
    is_removed      TINYINT(1) DEFAULT 0,
    version         BIGINT DEFAULT 0,

    sort_code       INT,
    is_enable       TINYINT(1) DEFAULT 1,

    PRIMARY KEY (id)
) COMMENT '模块版本表';

-- 3. 组件注册表 (ab_component)
CREATE TABLE IF NOT EXISTS ab_component (
    -- 主键
    id              BIGINT NOT NULL COMMENT '主键',

    -- 关联版本
    version_id      BIGINT NOT NULL COMMENT '所属版本ID',
    module_code     VARCHAR(100) NOT NULL COMMENT '模块代码（冗余）',
    version_code    VARCHAR(20) NOT NULL COMMENT '版本号（冗余）',

    -- 组件标识
    component_code  VARCHAR(100) NOT NULL COMMENT '组件代码',
    component_name  VARCHAR(200) NOT NULL COMMENT '组件名称',
    component_type  VARCHAR(50) NOT NULL COMMENT '组件类型',

    -- 组件分类（用于UI展示和管理）
    category        VARCHAR(50) NOT NULL COMMENT '分类: model/service/frontend',

    -- 组件特性
    is_inheritable  TINYINT(1) DEFAULT 1 COMMENT '是否支持继承，0=仅system层，1=支持三层继承',
    is_cacheable    TINYINT(1) DEFAULT 1 COMMENT '是否启用缓存，0=直接读库，1=走Redis缓存',

    -- 组件说明
    description     VARCHAR(500) COMMENT '组件描述',

    -- 审计字段
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_id      BIGINT,
    creator_name    VARCHAR(50),
    modifier_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    modifier_id     BIGINT,
    modifier_name   VARCHAR(50),
    is_removed      TINYINT(1) DEFAULT 0,
    version         BIGINT DEFAULT 0,

    sort_code       INT,
    is_enable       TINYINT(1) DEFAULT 1,

    PRIMARY KEY (id)
) COMMENT '组件注册表';

-- 4. 配置索引表 (ab_config)
CREATE TABLE IF NOT EXISTS ab_config (
    -- 主键
    id              BIGINT NOT NULL COMMENT '主键',

    -- 关联组件
    component_id    BIGINT NOT NULL COMMENT '组件ID',
    version_id      BIGINT NOT NULL COMMENT '版本ID（冗余）',
    module_code     VARCHAR(100) NOT NULL COMMENT '模块代码（冗余）',
    version_code    VARCHAR(20) NOT NULL COMMENT '版本号（冗余）',
    component_code  VARCHAR(100) NOT NULL COMMENT '组件代码（冗余）',
    component_type  VARCHAR(50) NOT NULL COMMENT '组件类型（冗余）',

    -- 配置层级
    scope           VARCHAR(20) NOT NULL COMMENT 'system/global/tenant',
    tenant          VARCHAR(64) COMMENT 'scope=tenant时必填',

    -- OSS存储
    oss_key         VARCHAR(500) NOT NULL COMMENT 'OSS存储key',
    content_hash    VARCHAR(64) COMMENT '内容MD5哈希，用于变更检测',
    content_size    INT COMMENT '内容大小(字节)',

    -- 发布状态
    status          VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft/published',
    publish_version INT NOT NULL DEFAULT 0 COMMENT '发布版本号（每次发布+1）',
    published_at    DATETIME COMMENT '最后发布时间',

    -- 审计字段
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_id      BIGINT,
    creator_name    VARCHAR(50),
    modifier_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    modifier_id     BIGINT,
    modifier_name   VARCHAR(50),
    is_removed      TINYINT(1) DEFAULT 0,
    version         BIGINT DEFAULT 0,

    sort_code       INT,
    is_enable       TINYINT(1) DEFAULT 1,

    PRIMARY KEY (id)
) COMMENT '配置索引表';

-- 5. 配置发布历史表 (ab_config_history)
CREATE TABLE IF NOT EXISTS ab_config_history (
    -- 主键
    id              BIGINT NOT NULL COMMENT '主键',

    -- 关联配置
    config_id       BIGINT NOT NULL COMMENT '配置ID',
    component_id    BIGINT NOT NULL COMMENT '组件ID',

    -- 发布信息
    publish_version INT NOT NULL COMMENT '发布版本号',
    oss_key         VARCHAR(500) NOT NULL COMMENT '历史版本OSS key',
    content_hash    VARCHAR(64) COMMENT '内容哈希',

    -- Git信息
    git_commit_id   VARCHAR(64) COMMENT 'Git commit ID',

    -- 发布人
    published_at    DATETIME NOT NULL,
    publisher_id    BIGINT,
    publisher_name  VARCHAR(50),

    -- 审计字段
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_removed      TINYINT(1) DEFAULT 0,

    PRIMARY KEY (id)
) COMMENT '配置发布历史表';

-- 创建索引（根据查询需求逐步添加）
-- 注意：初始不定义索引，根据实际查询需求添加

-- 示例索引（按需启用）:
-- CREATE INDEX idx_module_code ON ab_module(module_code);
-- CREATE INDEX idx_version_module ON ab_module_version(module_id, version_code);
-- CREATE INDEX idx_component_version ON ab_component(version_id, component_code);
-- CREATE INDEX idx_config_component ON ab_config(component_id, scope, tenant);
-- CREATE INDEX idx_config_fullkey ON ab_config(module_code, version_code, component_type, component_code, scope, status);
-- CREATE INDEX idx_history_config ON ab_config_history(config_id, publish_version);
