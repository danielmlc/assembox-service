# Assembox Storage 双版本功能迁移指南

> **版本**: v1.0.0
> **日期**: 2025-01-29
> **状态**: 待测试

---

## 📋 概述

本次更新实现了配置草稿和已发布版本的双版本隔离机制，并添加了完整的草稿历史管理功能。

### 主要变更

1. **ab_config 表新增双版本字段**
   - 草稿字段: `draft_oss_key`, `draft_content_hash`, `draft_size`, `draft_updated_at`, `draft_version`
   - 发布字段: `published_oss_key`, `published_content_hash`, `published_size`

2. **新增 ab_config_draft_history 表**
   - 记录每次保存的草稿历史
   - 支持草稿版本回退和对比

3. **OSS 存储结构调整**
   - 新增 `draft-history/` 目录
   - 完全隔离草稿、草稿历史、发布内容

4. **新增 API 接口**
   - 草稿历史查询、恢复、对比、清理

---

## 🚀 迁移步骤

### 前置准备

1. **备份数据库**

```bash
# TiDB 备份
mysqldump -h your_host -u your_user -p your_database > backup_$(date +%Y%m%d).sql

# 或使用 TiDB 的备份工具
br backup full --pd "your_pd_addr" --storage "s3://backup/path"
```

2. **备份 OSS 数据**

```bash
# 备份 assembox/ 目录下的所有数据
# 具体命令根据你的 OSS 提供商而定
```

3. **停止应用服务**

```bash
# 停止 assembox-storage 服务
npm run stop
# 或
pm2 stop assembox-storage
```

---

### 步骤 1: 执行数据库迁移

#### 1.1 添加双版本字段

```bash
# 连接到 TiDB
mysql -h your_host -u your_user -p your_database

# 执行迁移脚本 001
source scripts/migrations/001_add_dual_version_fields.sql
```

**验证:**

```sql
-- 检查字段是否添加成功
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'your_database'
  AND TABLE_NAME = 'ab_config'
  AND COLUMN_NAME IN (
      'draft_oss_key',
      'draft_content_hash',
      'draft_size',
      'draft_updated_at',
      'draft_version',
      'published_oss_key',
      'published_content_hash',
      'published_size'
  );
```

#### 1.2 创建草稿历史表

```sql
-- 执行迁移脚本 002
source scripts/migrations/002_create_draft_history_table.sql
```

**验证:**

```sql
-- 检查表是否创建成功
SHOW TABLES LIKE 'ab_config_draft_history';

-- 检查索引
SHOW INDEX FROM ab_config_draft_history;
```

---

### 步骤 2: 验证数据迁移

```sql
-- 验证数据迁移结果
SELECT
    id,
    status,
    draft_version,
    draft_oss_key IS NOT NULL AS has_draft,
    published_oss_key IS NOT NULL AS has_published,
    oss_key AS old_oss_key
FROM ab_config
LIMIT 10;
```

**预期结果:**

- `status = 'draft'` 的记录应该有 `draft_oss_key` 和 `draft_version = 1`
- `status = 'published'` 的记录应该有 `published_oss_key`

---

### 步骤 3: 清理旧字段（可选）

⚠️ **警告**: 删除字段前请确认新功能运行正常！

```sql
-- 删除旧字段
ALTER TABLE ab_config DROP COLUMN oss_key;
ALTER TABLE ab_config DROP COLUMN content_hash;
ALTER TABLE ab_config DROP COLUMN content_size;
```

---

### 步骤 4: 重启应用服务

```bash
# 启动服务
npm run start:prod
# 或
pm2 start assembox-storage
```

---

### 步骤 5: 验证功能

#### 5.1 测试草稿保存

```bash
curl -X POST http://localhost:3000/api/assembox/configs/draft \
  -H "Content-Type: application/json" \
  -d '{
    "componentId": "component_123",
    "moduleCode": "order",
    "versionCode": "V1",
    "componentType": "table",
    "componentCode": "order_table",
    "scope": "system",
    "content": {
      "columns": [
        { "field": "id", "label": "ID" }
      ]
    }
  }'
```

**预期:**
- 草稿保存到 `assembox/draft/` 目录
- `draft_version` = 1
- 数据库记录新增草稿字段

#### 5.2 测试草稿归档

再次保存同一配置：

```bash
curl -X POST http://localhost:3000/api/assembox/configs/draft \
  -H "Content-Type: application/json" \
  -d '{
    "componentId": "component_123",
    "moduleCode": "order",
    "versionCode": "V1",
    "componentType": "table",
    "componentCode": "order_table",
    "scope": "system",
    "content": {
      "columns": [
        { "field": "id", "label": "ID" },
        { "field": "name", "label": "名称" }
      ]
    }
  }'
```

**验证:**

```sql
-- 检查草稿历史
SELECT * FROM ab_config_draft_history
WHERE config_id = 'config_123'
ORDER BY draft_version DESC;

-- 应该有 2 条记录，draft_version 分别为 1 和 2
```

#### 5.3 测试草稿历史查询

```bash
curl http://localhost:3000/api/assembox/configs/config_123/draft-history?limit=10
```

**预期返回:**

```json
{
  "data": [
    {
      "id": "history_2",
      "draftVersion": 2,
      "savedAt": "2025-01-29T10:30:00Z",
      "contentHash": "abc123..."
    },
    {
      "id": "history_1",
      "draftVersion": 1,
      "savedAt": "2025-01-29T10:00:00Z",
      "contentHash": "def456..."
    }
  ]
}
```

#### 5.4 测试草稿恢复

```bash
curl -X POST http://localhost:3000/api/assembox/configs/config_123/draft-history/restore \
  -H "Content-Type: application/json" \
  -d '{"targetVersion": 1}'
```

**验证:**
- 当前草稿恢复到版本1的内容
- `draft_version` 递增到 3

#### 5.5 测试发布流程

```bash
curl -X POST http://localhost:3000/api/assembox/configs/publish \
  -H "Content-Type: application/json" \
  -d '{"configId": "config_123"}'
```

**验证:**

```sql
-- 检查发布字段已填充
SELECT
    id,
    status,
    publish_version,
    draft_oss_key,
    published_oss_key,
    published_content_hash
FROM ab_config
WHERE id = 'config_123';
```

---

## 🔍 故障排查

### 问题 1: 迁移脚本执行失败

**症状**: SQL 执行报错

**解决方案:**
1. 检查数据库连接是否正常
2. 确认表 `ab_config` 存在
3. 检查字段是否已存在（可能已执行过）
4. 查看具体错误信息

### 问题 2: 数据迁移结果不正确

**症状**: `draft_oss_key` 或 `published_oss_key` 为空

**解决方案:**

```sql
-- 手动修复数据
UPDATE ab_config
SET
    draft_oss_key = oss_key,
    draft_content_hash = content_hash,
    draft_size = content_size,
    draft_version = 1
WHERE status = 'draft' AND draft_oss_key IS NULL;

UPDATE ab_config
SET
    published_oss_key = oss_key,
    published_content_hash = content_hash,
    published_size = content_size
WHERE status = 'published' AND published_oss_key IS NULL;
```

### 问题 3: 草稿归档失败

**症状**: 保存草稿时没有创建历史记录

**排查:**
1. 检查 OSS 写入权限
2. 查看应用日志: `tail -f logs/web.log`
3. 确认 `draft-history/` 目录可写

### 问题 4: API 返回错误

**症状**: 调用新 API 接口返回 404 或 500

**解决方案:**
1. 确认服务已重启
2. 检查 Controller 是否正确注册
3. 查看路由是否正确

---

## 📊 回滚方案

如果迁移后出现问题，按以下步骤回滚：

### 1. 回滚数据库

```sql
-- 删除新添加的表
DROP TABLE IF EXISTS ab_config_draft_history;

-- 删除新添加的字段
ALTER TABLE ab_config
DROP COLUMN draft_oss_key,
DROP COLUMN draft_content_hash,
DROP COLUMN draft_size,
DROP COLUMN draft_updated_at,
DROP COLUMN draft_version,
DROP COLUMN published_oss_key,
DROP COLUMN published_content_hash,
DROP COLUMN published_size;
```

### 2. 恢复数据

```bash
# 从备份恢复
mysql -h your_host -u your_user -p your_database < backup_20250129.sql
```

### 3. 回滚代码版本

```bash
git checkout <previous_commit_hash>
npm install
npm run build
npm run start:prod
```

---

## ✅ 验收标准

迁移成功的标准：

- [ ] 数据库字段添加成功
- [ ] 草稿历史表创建成功
- [ ] 旧数据迁移正确
- [ ] 草稿保存功能正常
- [ ] 草稿自动归档功能正常
- [ ] 草稿历史查询功能正常
- [ ] 草稿恢复功能正常
- [ ] 发布功能正常
- [ ] 无应用错误日志

---

## 📞 技术支持

如遇到问题，请联系：
- **开发者**: Claude
- **文档**: docs/design/01-storage/overview.md
- **GitHub Issues**: https://github.com/danielmlc/assembox-service/issues

---

## 📝 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2025-01-29 | v1.0.0 | 初始版本，完成双版本功能和草稿历史管理 |
