# Assembox Storage 数据库安装指南

> **版本**: v1.0.0
> **日期**: 2025-01-29
> **状态**: 生产就绪

---

## 📋 概述

本指南包含 Assembox Storage 数据库的完整安装步骤，包括：
- 全新安装
- 从旧版本升级

---

## 🚀 场景一：全新安装

### 适用情况
- 首次部署 Assembox Storage
- 数据库中没有任何 `ab_*` 表

### 安装步骤

#### 1. 准备工作

确认数据库连接信息：
```bash
# TiDB 连接信息
HOST=your_host
PORT=4000
USER=your_user
PASSWORD=your_password
DATABASE=your_database
```

#### 2. 执行建表脚本

```bash
# 方式1：使用 MySQL 客户端
mysql -h $HOST -P $PORT -u $USER -p $DATABASE < scripts/init-database-complete.sql

# 方式2：登录后执行
mysql -h $HOST -P $PORT -u $USER -p
USE $DATABASE;
source scripts/init-database-complete.sql;
```

#### 3. 验证安装

```sql
-- 检查表是否创建成功
SHOW TABLES LIKE 'ab_%';

-- 预期结果：
-- ab_module
-- ab_module_version
-- ab_component
-- ab_config
-- ab_config_history
-- ab_config_draft_history
```

#### 4. 检查双版本字段

```sql
-- 检查 ab_config 表的双版本字段
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ab_config'
  AND COLUMN_NAME LIKE '%oss%'
ORDER BY ORDINAL_POSITION;

-- 预期应该看到：
-- draft_oss_key
-- draft_content_hash
-- draft_size
-- draft_updated_at
-- draft_version
-- published_oss_key
-- published_content_hash
-- published_size
```

#### 5. 插入初始数据（可选）

```sql
-- 示例：创建一个测试模块
INSERT INTO ab_module (id, module_code, module_name, description, active_version_code) VALUES
(1, 'order', '订单模块', '订单管理模块', 'V1');

INSERT INTO ab_module_version (id, module_id, module_code, version_code, version_name, status) VALUES
(1, 1, 'order', 'V1', '第一版本', 'published');

INSERT INTO ab_component (id, version_id, module_code, version_code, component_code, component_name, component_type, category) VALUES
(1, 1, 'order', 'V1', 'order_model', '订单数据模型', 'model', 'model'),
(2, 1, 'order', 'V1', 'order_table', '订单列表表格', 'table', 'frontend');
```

---

## 🔄 场景二：从旧版本升级

### 适用情况
- 已有 `ab_config` 表但使用旧的单一 `oss_key` 字段
- 需要升级到双版本字段支持

### 升级步骤

#### 1. ⚠️ 备份数据（必做！）

```bash
# 备份整个数据库
mysqldump -h $HOST -P $PORT -u $USER -p $DATABASE > backup_$(date +%Y%m%d_%H%M%S).sql

# 或使用 TiDB 的备份工具
br backup full --pd "your_pd_addr" --storage "s3://backup/path/$(date +%Y%m%d)"
```

#### 2. 检查当前表结构

```sql
-- 检查是否有旧字段
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ab_config'
  AND COLUMN_NAME IN ('oss_key', 'content_hash', 'content_size');
```

如果返回 3 行，说明使用旧结构。

#### 3. 执行升级迁移脚本

```bash
# 执行迁移
mysql -h $HOST -P $PORT -u $USER -p $DATABASE < scripts/migrations/001_add_dual_version_fields.sql
mysql -h $HOST -P $PORT -u $USER -p $DATABASE < scripts/migrations/002_create_draft_history_table.sql
```

或使用一键升级脚本：

```bash
mysql -h $HOST -P $PORT -u $USER -p $DATABASE < scripts/migrations/upgrade_complete.sql
```

#### 4. 验证数据迁移

```sql
-- 检查数据迁移结果
SELECT
    id,
    status,
    draft_version,
    draft_oss_key IS NOT NULL AS has_draft,
    published_oss_key IS NOT NULL AS has_published
FROM ab_config
LIMIT 10;
```

**预期结果：**
- `status = 'draft'` 的记录应该有 `draft_oss_key` 和 `draft_version = 1`
- `status = 'published'` 的记录应该有 `published_oss_key`

#### 5. 验证功能

启动应用并测试：
```bash
cd projects/assembox-storage
npm run start:dev
```

测试保存草稿功能：
```bash
curl -X POST http://localhost:3000/api/assembox/configs/draft \
  -H "Content-Type: application/json" \
  -d '{
    "componentId": "component_test",
    "moduleCode": "order",
    "versionCode": "V1",
    "componentType": "table",
    "componentCode": "order_table",
    "scope": "system",
    "content": {"test": "data"}
  }'
```

---

## 🔧 场景三：回滚到旧版本

### 如果升级后出现问题

#### 1. 停止应用

```bash
# 停止 assembox-storage 服务
pm2 stop assembox-storage
# 或
npm run stop
```

#### 2. 回滚数据库

```sql
-- 删除新添加的字段
ALTER TABLE ab_config DROP COLUMN draft_oss_key;
ALTER TABLE ab_config DROP COLUMN draft_content_hash;
ALTER TABLE ab_config DROP COLUMN draft_size;
ALTER TABLE ab_config DROP COLUMN draft_updated_at;
ALTER TABLE ab_config DROP COLUMN draft_version;
ALTER TABLE ab_config DROP COLUMN published_oss_key;
ALTER TABLE ab_config DROP COLUMN published_content_hash;
ALTER TABLE ab_config DROP COLUMN published_size;

-- 删除新表
DROP TABLE IF EXISTS ab_config_draft_history;
```

#### 3. 恢复备份

```bash
# 从备份恢复
mysql -h $HOST -P $PORT -u $USER -p $DATABASE < backup_20250129.sql
```

#### 4. 回滚代码版本

```bash
git checkout <previous_commit_hash>
npm install
npm run build
npm run start:prod
```

---

## 📊 表结构说明

### 核心表

| 表名 | 说明 | 主要字段 |
|------|------|---------|
| `ab_module` | 模块定义 | module_code, module_name, active_version_code |
| `ab_module_version` | 模块版本 | module_id, version_code, status, git_branch |
| `ab_component` | 组件注册表 | version_id, component_code, component_type, is_inheritable, is_cacheable |
| `ab_config` | 配置索引表 | ⭐ **draft_oss_key, published_oss_key** (双版本字段) |
| `ab_config_history` | 配置发布历史 | config_id, publish_version, published_oss_key |
| `ab_config_draft_history` | 配置草稿历史 | config_id, draft_version, draft_oss_key |

### 关键设计

#### 双版本字段（ab_config 表）

```sql
-- 草稿字段（设计器编辑用）
draft_oss_key          -- 草稿内容路径
draft_content_hash     -- 草稿内容哈希
draft_size             -- 草稿大小
draft_updated_at       -- 草稿更新时间
draft_version          -- 草稿版本号（每次保存+1）

-- 发布字段（运行时读取用）
published_oss_key      -- 已发布内容路径
published_content_hash -- 已发布内容哈希
published_size         -- 已发布内容大小
```

#### OSS 存储结构

```
assembox/
├── draft/                    # 当前草稿（设计器编辑）
├── draft-history/            # 草稿历史（版本回退）
└── published/                # 已发布（运行时读取）
```

---

## ✅ 验收标准

安装成功的标准：

- [ ] 所有 6 个表创建成功
- [ ] `ab_config` 表包含完整的双版本字段
- [ ] `ab_config_draft_history` 表创建成功
- [ ] 所有索引创建成功
- [ ] 应用启动无错误
- [ ] 保存草稿功能正常
- [ ] 草稿自动归档功能正常
- [ ] 发布功能正常

---

## 🐛 常见问题

### Q1: 执行 SQL 报错 "Table already exists"

**原因：** 表已存在
**解决：**
- 如果是全新安装，先删除旧表：`DROP TABLE IF EXISTS ab_xxx;`
- 如果是升级，使用迁移脚本而不是初始化脚本

### Q2: 字段已存在错误

**原因：** 已执行过部分迁移
**解决：** 检查字段是否存在，选择性执行迁移

```sql
-- 检查字段是否存在
SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ab_config'
  AND COLUMN_NAME = 'draft_oss_key';
```

### Q3: 字符集或排序规则问题

**解决：** 在建表语句中指定字符集

```sql
CREATE TABLE IF NOT EXISTS ab_config (
    ...
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '配置索引表';
```

---

## 📞 技术支持

- **文档**: [docs/design/01-storage/overview.md](../../docs/design/01-storage/overview.md)
- **迁移指南**: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
- **GitHub Issues**: https://github.com/danielmlc/assembox-service/issues

---

**祝安装顺利！** 🎉
