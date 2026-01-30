# 快照管理详细设计

> **状态**: 设计中
> **更新日期**: 2025-01-30

---

## 1. 概述

### 1.1 快照定位

快照（Snapshot）是 Assembox 存储层的**版本一致性保证机制**，解决组件独立发布带来的兼容性问题。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              问题场景                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   页面 V6 ──引用──▶ 模型 V5 (字段: name, age, address)                      │
│                           │                                                 │
│                           ▼ 模型被修改，删除 address 字段                    │
│                                                                             │
│   页面 V6 ──引用──▶ 模型 V6 (字段: name, age)  ← 页面报错！                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ 快照解决方案
┌─────────────────────────────────────────────────────────────────────────────┐
│                              快照机制                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Snapshot S003 锁定:                                                       │
│     - page/order_page    → publish_version: 6                              │
│     - model/order_model  → publish_version: 5                              │
│                                                                             │
│   运行时基于 S003 加载，页面 V6 始终配合模型 V5，保证兼容                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 设计目标

| 目标 | 指标 |
|-----|------|
| 版本一致性 | 快照内组件 100% 兼容 |
| 回滚速度 | < 1s（仅切换快照 ID） |
| 快照数量 | 每模块每月 5-10 个 |
| 存储开销 | 仅存 manifest，不复制 OSS 文件 |

### 1.3 核心概念

| 概念 | 说明 | 示例 |
|-----|------|------|
| 模块版本 (Version) | 大版本，对应代码分支 | V1, V2, V3 |
| 快照 (Snapshot) | 版本内的发布点，锁定组件状态 | S001, S002, S003 |
| 清单 (Manifest) | 快照包含的组件版本映射 | `{model:v5, page:v6}` |
| 激活快照 | 运行时使用的快照 | active_snapshot_id |
| 热修复 | 脱离快照的单组件发布 | hotfix_components |

---

## 2. 表结构设计

### 2.1 快照表 (ab_snapshot)

> 核心表，记录每次打包发布生成的快照

```sql
CREATE TABLE ab_snapshot (
    -- 主键
    id              BIGINT NOT NULL COMMENT '主键',

    -- 关联版本
    version_id      BIGINT NOT NULL COMMENT '模块版本ID',
    module_code     VARCHAR(100) NOT NULL COMMENT '模块代码（冗余）',
    version_code    VARCHAR(20) NOT NULL COMMENT '版本号（冗余）',

    -- 快照标识
    snapshot_code   VARCHAR(20) NOT NULL COMMENT '快照号: S001, S002...',
    snapshot_name   VARCHAR(200) COMMENT '快照名称',
    description     VARCHAR(500) COMMENT '快照说明',

    -- 快照清单（核心字段）
    manifest        JSON NOT NULL COMMENT '组件版本清单',

    -- 快照状态
    status          VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active/deprecated',

    -- 热修复记录
    hotfix_components JSON COMMENT '脱离快照单独发布的组件',

    -- 基准快照（用于计算变更）
    base_snapshot_id BIGINT COMMENT '基于哪个快照创建',

    -- 发布信息
    published_at    DATETIME NOT NULL COMMENT '发布时间',
    publisher_id    BIGINT COMMENT '发布人ID',
    publisher_name  VARCHAR(50) COMMENT '发布人姓名',

    -- Git 信息
    git_commit_id   VARCHAR(64) COMMENT 'Git commit ID',
    git_tag         VARCHAR(100) COMMENT 'Git tag',

    -- 统计信息
    component_count INT COMMENT '包含的组件数量',
    changed_count   INT COMMENT '本次变更的组件数量',

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

    PRIMARY KEY (id, version_id)
) COMMENT '配置快照表';
```

### 2.2 租户快照配置表 (ab_tenant_snapshot)

> 支持灰度发布，不同租户使用不同快照

```sql
CREATE TABLE ab_tenant_snapshot (
    -- 主键
    id              BIGINT NOT NULL COMMENT '主键',

    -- 租户信息
    tenant          VARCHAR(64) NOT NULL COMMENT '租户代码',

    -- 关联版本
    version_id      BIGINT NOT NULL COMMENT '模块版本ID',
    module_code     VARCHAR(100) NOT NULL COMMENT '模块代码（冗余）',
    version_code    VARCHAR(20) NOT NULL COMMENT '版本号（冗余）',

    -- 快照配置
    snapshot_id     BIGINT NOT NULL COMMENT '该租户使用的快照ID',
    snapshot_code   VARCHAR(20) NOT NULL COMMENT '快照号（冗余）',

    -- 配置来源
    source          VARCHAR(20) DEFAULT 'manual' COMMENT 'manual/grayscale/rollback',

    -- 生效时间
    effective_at    DATETIME COMMENT '生效时间（支持定时切换）',
    expired_at      DATETIME COMMENT '过期时间（灰度结束后自动切回）',

    -- 审计字段
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_id      BIGINT,
    creator_name    VARCHAR(50),
    modifier_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    modifier_id     BIGINT,
    modifier_name   VARCHAR(50),
    is_removed      TINYINT(1) DEFAULT 0,
    version         BIGINT DEFAULT 0,

    PRIMARY KEY (id, version_id, tenant)
) COMMENT '租户快照配置表（灰度发布用）';
```

### 2.3 Manifest 结构定义

```typescript
interface SnapshotManifest {
    // 快照元信息
    snapshotCode: string;           // S003
    createdAt: string;              // ISO 时间
    baseSnapshotCode?: string;      // 基于哪个快照（用于计算变更）

    // 组件版本清单（核心）
    components: {
        [componentKey: string]: ComponentVersion;
        // key 格式: "{componentType}/{componentCode}"
        // 示例: "model/order_model", "table/order_table"
    };

    // 依赖关系
    dependencies: {
        [componentKey: string]: string[];
        // 示例: "page/order_page": ["model/order_model", "table/order_table"]
    };

    // 变更记录
    changesFromBase?: {
        added: string[];            // 新增的组件
        modified: string[];         // 修改的组件
        removed: string[];          // 删除的组件
    };

    // 校验信息
    checksum?: string;              // manifest 整体校验和
}

interface ComponentVersion {
    configId: number;               // ab_config.id
    publishVersion: number;         // 发布版本号
    publishedOssKey: string;        // OSS 存储路径
    contentHash: string;            // 内容 MD5
    scope: 'system' | 'global';     // 配置层级（manifest 只记录 system/global）
}
```

**Manifest 示例：**

```json
{
    "snapshotCode": "S003",
    "createdAt": "2025-01-30T10:30:00Z",
    "baseSnapshotCode": "S002",
    "components": {
        "model/order_model": {
            "configId": 1001,
            "publishVersion": 5,
            "publishedOssKey": "assembox/published/order/V1/model/order_model/_system.json",
            "contentHash": "a1b2c3d4e5f6...",
            "scope": "system"
        },
        "table/order_table": {
            "configId": 1002,
            "publishVersion": 3,
            "publishedOssKey": "assembox/published/order/V1/table/order_table/_system.json",
            "contentHash": "b2c3d4e5f6g7...",
            "scope": "system"
        },
        "form/order_form": {
            "configId": 1003,
            "publishVersion": 4,
            "publishedOssKey": "assembox/published/order/V1/form/order_form/_system.json",
            "contentHash": "c3d4e5f6g7h8...",
            "scope": "system"
        },
        "page/order_page": {
            "configId": 1004,
            "publishVersion": 6,
            "publishedOssKey": "assembox/published/order/V1/page/order_page/_system.json",
            "contentHash": "d4e5f6g7h8i9...",
            "scope": "system"
        }
    },
    "dependencies": {
        "page/order_page": ["model/order_model", "table/order_table", "form/order_form"],
        "table/order_table": ["model/order_model"],
        "form/order_form": ["model/order_model"]
    },
    "changesFromBase": {
        "added": [],
        "modified": ["table/order_table", "form/order_form"],
        "removed": []
    },
    "checksum": "sha256:abc123..."
}
```

---

## 3. 打包发布流程

### 3.1 发布请求

```typescript
interface PackagePublishRequest {
    versionId: number;              // 模块版本 ID
    componentIds: number[];         // 待发布的配置 ID 列表
    snapshotName?: string;          // 快照名称（可选）
    description?: string;           // 发布说明（可选）
    scheduleAt?: Date;              // 定时发布（可选）
}

interface PackagePublishResponse {
    snapshotId: number;
    snapshotCode: string;
    publishedCount: number;
    manifest: SnapshotManifest;
}
```

### 3.2 发布流程实现

```typescript
class SnapshotPublishService {

    /**
     * 打包发布：生成快照 + 批量发布组件
     */
    async packagePublish(
        req: PackagePublishRequest,
        publisherId: number
    ): Promise<PackagePublishResponse> {

        // 1. 参数校验
        await this.validateRequest(req);

        // 2. 获取版本信息
        const version = await this.versionRepo.findById(req.versionId);
        if (!version) {
            throw new VersionNotFoundError(req.versionId);
        }

        // 3. 开启事务
        return await this.db.transaction(async (tx) => {

            // 4. 生成快照号
            const snapshotCode = await this.generateSnapshotCode(req.versionId, tx);

            // 5. 构建初始 manifest（发布前）
            const manifest = await this.buildManifest(
                req.versionId,
                req.componentIds,
                version.active_snapshot_id,
                tx
            );

            // 6. 创建快照记录
            const snapshot = await this.snapshotRepo.create({
                version_id: req.versionId,
                module_code: version.module_code,
                version_code: version.version_code,
                snapshot_code: snapshotCode,
                snapshot_name: req.snapshotName,
                description: req.description,
                manifest: manifest,
                status: 'active',
                base_snapshot_id: version.active_snapshot_id,
                published_at: new Date(),
                publisher_id: publisherId,
                component_count: Object.keys(manifest.components).length,
                changed_count: req.componentIds.length,
            }, tx);

            // 7. 批量发布组件
            for (const configId of req.componentIds) {
                await this.publishSingleConfig(configId, snapshot.id, tx);
            }

            // 8. 更新 manifest 中的 OSS key（发布后才有）
            const updatedManifest = await this.updateManifestOssKeys(
                manifest,
                req.componentIds,
                tx
            );
            await this.snapshotRepo.updateManifest(snapshot.id, updatedManifest, tx);

            // 9. 激活快照
            await this.versionRepo.update(req.versionId, {
                active_snapshot_id: snapshot.id,
                active_snapshot_code: snapshotCode,
                latest_snapshot_id: snapshot.id,
                latest_snapshot_code: snapshotCode,
            }, tx);

            return {
                snapshotId: snapshot.id,
                snapshotCode: snapshotCode,
                publishedCount: req.componentIds.length,
                manifest: updatedManifest,
            };
        });
    }

    /**
     * 生成快照号：S001, S002, S003...
     */
    private async generateSnapshotCode(
        versionId: number,
        tx?: Transaction
    ): Promise<string> {
        const lastSnapshot = await this.snapshotRepo.findLatest(versionId, tx);

        if (!lastSnapshot) {
            return 'S001';
        }

        // 解析当前最大编号
        const match = lastSnapshot.snapshot_code.match(/S(\d+)/);
        const currentNum = match ? parseInt(match[1], 10) : 0;

        return `S${String(currentNum + 1).padStart(3, '0')}`;
    }

    /**
     * 构建 Manifest
     */
    private async buildManifest(
        versionId: number,
        publishingConfigIds: number[],
        baseSnapshotId: number | null,
        tx?: Transaction
    ): Promise<SnapshotManifest> {
        // 获取该版本所有组件的当前状态
        const configs = await this.configRepo.findByVersion(versionId, tx);

        // 获取基准快照的 manifest
        let baseManifest: SnapshotManifest | null = null;
        if (baseSnapshotId) {
            const baseSnapshot = await this.snapshotRepo.findById(baseSnapshotId, tx);
            baseManifest = baseSnapshot?.manifest;
        }

        const components: Record<string, ComponentVersion> = {};
        const publishingSet = new Set(publishingConfigIds);

        for (const config of configs) {
            const key = `${config.component_type}/${config.component_code}`;

            // 只记录 system 和 global 层的配置（tenant 层运行时继承查找）
            if (config.scope === 'tenant') {
                continue;
            }

            const isPublishing = publishingSet.has(config.id);

            components[key] = {
                configId: config.id,
                publishVersion: isPublishing
                    ? config.publish_version + 1
                    : config.publish_version,
                publishedOssKey: isPublishing
                    ? ''  // 发布后更新
                    : config.published_oss_key,
                contentHash: isPublishing
                    ? ''  // 发布后更新
                    : config.published_content_hash,
                scope: config.scope as 'system' | 'global',
            };
        }

        // 分析依赖关系
        const dependencies = await this.analyzeDependencies(versionId, tx);

        // 计算变更
        const changes = this.calculateChanges(components, baseManifest, publishingSet);

        return {
            snapshotCode: '',  // 后续填充
            createdAt: new Date().toISOString(),
            baseSnapshotCode: baseManifest?.snapshotCode,
            components,
            dependencies,
            changesFromBase: changes,
        };
    }

    /**
     * 发布单个配置
     */
    private async publishSingleConfig(
        configId: number,
        snapshotId: number,
        tx: Transaction
    ): Promise<void> {
        const config = await this.configRepo.findById(configId, tx);

        if (!config.draft_oss_key) {
            throw new NoDraftError(configId);
        }

        // 1. 从草稿区复制到发布区
        const publishedOssKey = this.generatePublishedOssKey(config);
        await this.oss.copy(config.draft_oss_key, publishedOssKey);

        // 2. 计算内容哈希
        const content = await this.oss.get(publishedOssKey);
        const contentHash = this.crypto.md5(content);

        // 3. 更新配置记录
        await this.configRepo.update(configId, {
            published_oss_key: publishedOssKey,
            published_content_hash: contentHash,
            published_size: content.length,
            status: 'published',
            publish_version: config.publish_version + 1,
            published_at: new Date(),
        }, tx);

        // 4. 记录发布历史
        await this.configHistoryRepo.create({
            config_id: configId,
            component_id: config.component_id,
            publish_version: config.publish_version + 1,
            published_oss_key: publishedOssKey,
            content_hash: contentHash,
            snapshot_id: snapshotId,
            published_at: new Date(),
        }, tx);
    }
}
```

### 3.3 后置处理（异步）

```typescript
class SnapshotPostProcessor {

    /**
     * 发布完成后的异步处理
     */
    async onPublishComplete(
        snapshotId: number,
        versionId: number
    ): Promise<void> {
        const snapshot = await this.snapshotRepo.findById(snapshotId);
        const version = await this.versionRepo.findById(versionId);

        // 1. 清除缓存
        await this.clearCache(version.module_code, version.version_code);

        // 2. 同步到 Gitea
        await this.syncToGitea(snapshot, version);

        // 3. 发送通知
        await this.sendNotification(snapshot);
    }

    /**
     * 清除相关缓存
     */
    private async clearCache(
        moduleCode: string,
        versionCode: string
    ): Promise<void> {
        const patterns = [
            `assembox:resolved:*:${moduleCode}:${versionCode}:*`,
            `assembox:raw:*:${moduleCode}:${versionCode}:*`,
            `assembox:snapshot:${moduleCode}:${versionCode}`,
        ];

        for (const pattern of patterns) {
            const keys = await this.redis.scanKeys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        }
    }

    /**
     * 同步到 Gitea
     */
    private async syncToGitea(
        snapshot: Snapshot,
        version: ModuleVersion
    ): Promise<void> {
        const tag = `${version.module_code}/${version.version_code}/${snapshot.snapshot_code}`;

        await this.gitea.createCommit({
            branch: version.git_branch,
            message: `[snapshot] ${snapshot.snapshot_code}: ${snapshot.description || 'Package publish'}`,
            files: [{
                path: `manifest/${snapshot.snapshot_code}.json`,
                content: JSON.stringify(snapshot.manifest, null, 2),
            }],
        });

        await this.gitea.createTag({
            name: tag,
            message: snapshot.description,
        });

        // 更新快照的 Git 信息
        await this.snapshotRepo.update(snapshot.id, {
            git_tag: tag,
            git_commit_id: await this.gitea.getLatestCommitId(version.git_branch),
        });
    }
}
```

---

## 4. 运行时加载

### 4.1 获取激活快照

```typescript
class SnapshotLoader {

    /**
     * 获取租户的激活快照
     */
    async getActiveSnapshot(
        moduleCode: string,
        versionCode: string,
        tenant: string
    ): Promise<Snapshot> {
        // 1. 尝试从缓存获取
        const cacheKey = `assembox:snapshot:${moduleCode}:${versionCode}:${tenant}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        // 2. 查询租户级快照配置
        const tenantSnapshot = await this.tenantSnapshotRepo.findByTenant(
            moduleCode,
            versionCode,
            tenant
        );

        let snapshot: Snapshot;

        if (tenantSnapshot && this.isEffective(tenantSnapshot)) {
            // 使用租户级配置的快照
            snapshot = await this.snapshotRepo.findById(tenantSnapshot.snapshot_id);
        } else {
            // 使用版本级默认快照
            const version = await this.versionRepo.findByCode(moduleCode, versionCode);
            snapshot = await this.snapshotRepo.findById(version.active_snapshot_id);
        }

        // 3. 写入缓存
        await this.redis.setex(cacheKey, 600, JSON.stringify(snapshot));

        return snapshot;
    }

    /**
     * 检查租户快照配置是否生效
     */
    private isEffective(config: TenantSnapshot): boolean {
        const now = new Date();

        if (config.effective_at && config.effective_at > now) {
            return false;  // 未到生效时间
        }

        if (config.expired_at && config.expired_at < now) {
            return false;  // 已过期
        }

        return true;
    }
}
```

### 4.2 基于快照加载配置

```typescript
class ConfigLoader {

    /**
     * 基于快照加载配置
     */
    async loadConfig(ctx: LoadContext): Promise<ConfigContent> {
        // 1. 获取激活快照
        const snapshot = await this.snapshotLoader.getActiveSnapshot(
            ctx.moduleCode,
            ctx.versionCode,
            ctx.tenant
        );

        // 2. 从 manifest 获取组件信息
        const componentKey = `${ctx.componentType}/${ctx.componentCode}`;
        const componentInfo = snapshot.manifest.components[componentKey];

        if (!componentInfo) {
            throw new ComponentNotFoundError(componentKey);
        }

        // 3. 检查热修复覆盖
        const hotfix = snapshot.hotfix_components?.[componentKey];

        // 4. 确定使用的 OSS key
        const ossKey = hotfix?.publishedOssKey || componentInfo.publishedOssKey;

        // 5. 按层级继承查找（tenant 层可能覆盖）
        return await this.loadWithInheritance(ctx, ossKey, componentInfo);
    }

    /**
     * 带继承的配置加载
     */
    private async loadWithInheritance(
        ctx: LoadContext,
        baseOssKey: string,
        componentInfo: ComponentVersion
    ): Promise<ConfigContent> {
        // 1. 检查组件是否支持继承
        const component = await this.componentRepo.findByCode(
            ctx.moduleCode,
            ctx.versionCode,
            ctx.componentType,
            ctx.componentCode
        );

        if (!component.is_inheritable) {
            // 不支持继承，直接返回 system 层配置
            return await this.oss.get(baseOssKey);
        }

        // 2. 按优先级查找：tenant > global > system
        // 先查租户层
        const tenantConfig = await this.configRepo.findPublished(
            ctx.moduleCode,
            ctx.versionCode,
            ctx.componentType,
            ctx.componentCode,
            'tenant',
            ctx.tenant
        );

        if (tenantConfig?.published_oss_key) {
            return await this.oss.get(tenantConfig.published_oss_key);
        }

        // 再查全局层
        const globalConfig = await this.configRepo.findPublished(
            ctx.moduleCode,
            ctx.versionCode,
            ctx.componentType,
            ctx.componentCode,
            'global',
            null
        );

        if (globalConfig?.published_oss_key) {
            return await this.oss.get(globalConfig.published_oss_key);
        }

        // 使用 system 层（快照中记录的）
        return await this.oss.get(baseOssKey);
    }
}
```

---

## 5. 快照回滚

### 5.1 回滚实现

```typescript
class SnapshotRollbackService {

    /**
     * 回滚到指定快照
     */
    async rollbackToSnapshot(
        versionId: number,
        targetSnapshotCode: string,
        operatorId: number
    ): Promise<RollbackResult> {
        // 1. 查找目标快照
        const targetSnapshot = await this.snapshotRepo.findByCode(
            versionId,
            targetSnapshotCode
        );

        if (!targetSnapshot) {
            throw new SnapshotNotFoundError(targetSnapshotCode);
        }

        if (targetSnapshot.status === 'deprecated') {
            throw new SnapshotDeprecatedError(targetSnapshotCode);
        }

        // 2. 获取当前快照信息
        const version = await this.versionRepo.findById(versionId);
        const currentSnapshotCode = version.active_snapshot_code;

        if (currentSnapshotCode === targetSnapshotCode) {
            throw new AlreadyActiveError(targetSnapshotCode);
        }

        // 3. 切换激活快照
        await this.versionRepo.update(versionId, {
            active_snapshot_id: targetSnapshot.id,
            active_snapshot_code: targetSnapshot.snapshot_code,
        });

        // 4. 记录回滚操作
        await this.auditLogRepo.create({
            action: 'snapshot_rollback',
            target_type: 'module_version',
            target_id: versionId,
            operator_id: operatorId,
            details: {
                from_snapshot: currentSnapshotCode,
                to_snapshot: targetSnapshotCode,
            },
        });

        // 5. 清除缓存
        await this.clearCache(version.module_code, version.version_code);

        // 6. 同步到 Gitea
        await this.gitea.createCommit({
            branch: version.git_branch,
            message: `[rollback] ${currentSnapshotCode} -> ${targetSnapshotCode}`,
        });

        return {
            success: true,
            fromSnapshot: currentSnapshotCode,
            toSnapshot: targetSnapshotCode,
        };
    }

    /**
     * 批量回滚（多租户）
     */
    async rollbackTenants(
        versionId: number,
        tenants: string[],
        targetSnapshotCode: string,
        operatorId: number
    ): Promise<BatchRollbackResult> {
        const targetSnapshot = await this.snapshotRepo.findByCode(
            versionId,
            targetSnapshotCode
        );

        if (!targetSnapshot) {
            throw new SnapshotNotFoundError(targetSnapshotCode);
        }

        const results: TenantRollbackResult[] = [];

        for (const tenant of tenants) {
            try {
                await this.tenantSnapshotRepo.upsert({
                    tenant,
                    version_id: versionId,
                    snapshot_id: targetSnapshot.id,
                    snapshot_code: targetSnapshotCode,
                    source: 'rollback',
                });

                results.push({ tenant, success: true });
            } catch (error) {
                results.push({ tenant, success: false, error: error.message });
            }
        }

        // 清除相关缓存
        for (const tenant of tenants) {
            await this.clearTenantCache(
                targetSnapshot.module_code,
                targetSnapshot.version_code,
                tenant
            );
        }

        return {
            totalCount: tenants.length,
            successCount: results.filter(r => r.success).length,
            results,
        };
    }
}
```

---

## 6. 热修复

### 6.1 热修复发布

```typescript
class HotfixService {

    /**
     * 热修复：单组件发布，不生成新快照
     */
    async hotfixPublish(
        configId: number,
        publisherId: number,
        reason: string
    ): Promise<HotfixResult> {
        const config = await this.configRepo.findById(configId);
        const version = await this.versionRepo.findById(config.version_id);
        const snapshot = await this.snapshotRepo.findById(version.active_snapshot_id);

        // 1. 发布组件
        const publishedOssKey = this.generatePublishedOssKey(config);
        await this.oss.copy(config.draft_oss_key, publishedOssKey);

        const content = await this.oss.get(publishedOssKey);
        const contentHash = this.crypto.md5(content);

        await this.configRepo.update(configId, {
            published_oss_key: publishedOssKey,
            published_content_hash: contentHash,
            published_size: content.length,
            status: 'published',
            publish_version: config.publish_version + 1,
            published_at: new Date(),
        });

        // 2. 更新快照的 hotfix_components
        const componentKey = `${config.component_type}/${config.component_code}`;
        const hotfixComponents = snapshot.hotfix_components || {};

        hotfixComponents[componentKey] = {
            configId: configId,
            publishVersion: config.publish_version + 1,
            publishedOssKey: publishedOssKey,
            contentHash: contentHash,
            hotfixAt: new Date().toISOString(),
            hotfixBy: publisherId,
            reason: reason,
        };

        await this.snapshotRepo.update(snapshot.id, {
            hotfix_components: hotfixComponents,
        });

        // 3. 记录发布历史
        await this.configHistoryRepo.create({
            config_id: configId,
            component_id: config.component_id,
            publish_version: config.publish_version + 1,
            published_oss_key: publishedOssKey,
            content_hash: contentHash,
            is_hotfix: true,
            hotfix_reason: reason,
            published_at: new Date(),
        });

        // 4. 清除缓存
        await this.clearComponentCache(config);

        // 5. 同步到 Gitea
        await this.gitea.createCommit({
            branch: version.git_branch,
            message: `[hotfix] ${componentKey} (v${config.publish_version + 1}): ${reason}`,
        });

        return {
            success: true,
            componentKey,
            publishVersion: config.publish_version + 1,
            snapshotCode: snapshot.snapshot_code,
        };
    }

    /**
     * 合并热修复到新快照
     */
    async mergeHotfixesToSnapshot(
        snapshotId: number
    ): Promise<void> {
        const snapshot = await this.snapshotRepo.findById(snapshotId);

        if (!snapshot.hotfix_components) {
            return;  // 没有热修复
        }

        // 将热修复合并到 manifest
        const manifest = { ...snapshot.manifest };

        for (const [componentKey, hotfix] of Object.entries(snapshot.hotfix_components)) {
            manifest.components[componentKey] = {
                configId: hotfix.configId,
                publishVersion: hotfix.publishVersion,
                publishedOssKey: hotfix.publishedOssKey,
                contentHash: hotfix.contentHash,
                scope: manifest.components[componentKey]?.scope || 'system',
            };
        }

        // 更新快照
        await this.snapshotRepo.update(snapshotId, {
            manifest: manifest,
            hotfix_components: null,  // 清空热修复记录
        });
    }
}
```

---

## 7. 灰度发布

### 7.1 灰度策略

```typescript
interface GrayscaleConfig {
    versionId: number;
    targetSnapshotId: number;       // 要灰度的新快照
    baseSnapshotId: number;         // 基准快照（灰度前）
    tenants: string[];              // 灰度租户列表
    percentage?: number;            // 按比例灰度（可选）
    effectiveAt?: Date;             // 生效时间
    expiredAt?: Date;               // 灰度结束时间
}

class GrayscaleService {

    /**
     * 创建灰度发布
     */
    async createGrayscale(
        config: GrayscaleConfig,
        operatorId: number
    ): Promise<GrayscaleResult> {
        const targetSnapshot = await this.snapshotRepo.findById(config.targetSnapshotId);
        const version = await this.versionRepo.findById(config.versionId);

        // 1. 确定灰度租户
        let tenants = config.tenants;
        if (config.percentage) {
            // 按比例随机选择租户
            const allTenants = await this.tenantRepo.findByModule(version.module_code);
            tenants = this.selectByPercentage(allTenants, config.percentage);
        }

        // 2. 创建租户快照配置
        for (const tenant of tenants) {
            await this.tenantSnapshotRepo.create({
                tenant,
                version_id: config.versionId,
                module_code: version.module_code,
                version_code: version.version_code,
                snapshot_id: config.targetSnapshotId,
                snapshot_code: targetSnapshot.snapshot_code,
                source: 'grayscale',
                effective_at: config.effectiveAt,
                expired_at: config.expiredAt,
            });
        }

        // 3. 清除相关缓存
        for (const tenant of tenants) {
            await this.clearTenantCache(
                version.module_code,
                version.version_code,
                tenant
            );
        }

        // 4. 记录灰度操作
        await this.grayscaleLogRepo.create({
            version_id: config.versionId,
            target_snapshot_id: config.targetSnapshotId,
            base_snapshot_id: config.baseSnapshotId,
            tenant_count: tenants.length,
            tenants: tenants,
            effective_at: config.effectiveAt,
            expired_at: config.expiredAt,
            operator_id: operatorId,
        });

        return {
            success: true,
            tenantCount: tenants.length,
            tenants,
        };
    }

    /**
     * 结束灰度（全量发布或回滚）
     */
    async finishGrayscale(
        versionId: number,
        action: 'promote' | 'rollback',
        operatorId: number
    ): Promise<void> {
        const grayscale = await this.grayscaleLogRepo.findActive(versionId);

        if (!grayscale) {
            throw new NoActiveGrayscaleError(versionId);
        }

        if (action === 'promote') {
            // 全量发布：更新版本的激活快照
            await this.versionRepo.update(versionId, {
                active_snapshot_id: grayscale.target_snapshot_id,
                active_snapshot_code: grayscale.target_snapshot_code,
            });
        }

        // 清理租户快照配置
        await this.tenantSnapshotRepo.deleteByGrayscale(grayscale.id);

        // 清除所有缓存
        const version = await this.versionRepo.findById(versionId);
        await this.clearAllCache(version.module_code, version.version_code);

        // 更新灰度记录
        await this.grayscaleLogRepo.update(grayscale.id, {
            status: action === 'promote' ? 'promoted' : 'rolled_back',
            finished_at: new Date(),
            finish_operator_id: operatorId,
        });
    }
}
```

---

## 8. 依赖分析

### 8.1 依赖关系模型

```typescript
interface DependencyInfo {
    componentKey: string;           // 组件标识
    dependsOn: string[];            // 依赖的组件
    dependedBy: string[];           // 被哪些组件依赖
}

interface DependencyGraph {
    nodes: Map<string, DependencyInfo>;
    edges: Array<{ from: string; to: string }>;
}
```

### 8.2 依赖分析实现

```typescript
class DependencyAnalyzer {

    // 组件类型对应的引用字段
    private readonly REF_FIELDS: Record<string, string[]> = {
        'page': ['modelRef', 'tableRef', 'formRef', 'filterRef', 'apiRef'],
        'table': ['modelRef'],
        'form': ['modelRef'],
        'filter': ['modelRef'],
        'api': ['modelRef', 'logicRef'],
        'logic': ['modelRef', 'apiRef'],
    };

    /**
     * 分析版本内的依赖关系
     */
    async analyzeDependencies(
        versionId: number
    ): Promise<Record<string, string[]>> {
        const configs = await this.configRepo.findByVersion(versionId);
        const dependencies: Record<string, string[]> = {};

        for (const config of configs) {
            const componentKey = `${config.component_type}/${config.component_code}`;
            const refFields = this.REF_FIELDS[config.component_type] || [];

            if (refFields.length === 0) {
                continue;
            }

            // 获取配置内容
            const content = await this.oss.get(config.published_oss_key || config.draft_oss_key);
            const configObj = JSON.parse(content);

            // 提取引用
            const deps: string[] = [];
            for (const field of refFields) {
                const ref = configObj[field];
                if (ref) {
                    // 推断被引用组件的类型
                    const refType = this.inferRefType(field);
                    deps.push(`${refType}/${ref}`);
                }
            }

            if (deps.length > 0) {
                dependencies[componentKey] = deps;
            }
        }

        return dependencies;
    }

    /**
     * 推断引用类型
     */
    private inferRefType(field: string): string {
        const mapping: Record<string, string> = {
            'modelRef': 'model',
            'tableRef': 'table',
            'formRef': 'form',
            'filterRef': 'filter',
            'apiRef': 'api',
            'logicRef': 'logic',
        };
        return mapping[field] || 'unknown';
    }

    /**
     * 获取组件的影响范围
     */
    async getImpactScope(
        versionId: number,
        componentKey: string
    ): Promise<string[]> {
        const dependencies = await this.analyzeDependencies(versionId);

        // 反向构建依赖图
        const reverseDeps: Record<string, string[]> = {};
        for (const [key, deps] of Object.entries(dependencies)) {
            for (const dep of deps) {
                if (!reverseDeps[dep]) {
                    reverseDeps[dep] = [];
                }
                reverseDeps[dep].push(key);
            }
        }

        // BFS 查找所有受影响的组件
        const impacted = new Set<string>();
        const queue = [componentKey];

        while (queue.length > 0) {
            const current = queue.shift()!;
            const dependents = reverseDeps[current] || [];

            for (const dep of dependents) {
                if (!impacted.has(dep)) {
                    impacted.add(dep);
                    queue.push(dep);
                }
            }
        }

        return Array.from(impacted);
    }

    /**
     * 检查依赖兼容性
     */
    async checkCompatibility(
        versionId: number,
        changedComponents: string[]
    ): Promise<CompatibilityReport> {
        const issues: CompatibilityIssue[] = [];

        for (const componentKey of changedComponents) {
            // 获取受影响的组件
            const impacted = await this.getImpactScope(versionId, componentKey);

            for (const impactedKey of impacted) {
                // 检查是否在本次发布中
                if (!changedComponents.includes(impactedKey)) {
                    issues.push({
                        type: 'missing_update',
                        source: componentKey,
                        target: impactedKey,
                        message: `组件 ${impactedKey} 依赖 ${componentKey}，但未包含在本次发布中`,
                    });
                }
            }
        }

        return {
            compatible: issues.length === 0,
            issues,
        };
    }
}
```

---

## 9. 快照清理策略

### 9.1 清理规则

```typescript
interface CleanupPolicy {
    // 保留最近 N 个快照
    keepRecentCount: number;        // 默认: 10

    // 保留最近 N 天的快照
    keepRecentDays: number;         // 默认: 90

    // 保留所有激活的快照
    keepActive: boolean;            // 默认: true

    // 保留有租户使用的快照
    keepInUse: boolean;             // 默认: true

    // 保留有 Git tag 的快照
    keepTagged: boolean;            // 默认: true
}
```

### 9.2 清理实现

```typescript
class SnapshotCleanupService {

    private readonly DEFAULT_POLICY: CleanupPolicy = {
        keepRecentCount: 10,
        keepRecentDays: 90,
        keepActive: true,
        keepInUse: true,
        keepTagged: true,
    };

    /**
     * 执行快照清理
     */
    async cleanup(
        versionId: number,
        policy: Partial<CleanupPolicy> = {}
    ): Promise<CleanupResult> {
        const mergedPolicy = { ...this.DEFAULT_POLICY, ...policy };
        const version = await this.versionRepo.findById(versionId);

        // 1. 获取所有快照
        const snapshots = await this.snapshotRepo.findByVersion(versionId);

        // 2. 确定要保留的快照
        const keepSet = new Set<number>();

        // 2.1 保留最近 N 个
        const recentSnapshots = snapshots
            .sort((a, b) => b.published_at.getTime() - a.published_at.getTime())
            .slice(0, mergedPolicy.keepRecentCount);
        recentSnapshots.forEach(s => keepSet.add(s.id));

        // 2.2 保留最近 N 天
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - mergedPolicy.keepRecentDays);
        snapshots
            .filter(s => s.published_at > cutoffDate)
            .forEach(s => keepSet.add(s.id));

        // 2.3 保留激活的快照
        if (mergedPolicy.keepActive) {
            if (version.active_snapshot_id) {
                keepSet.add(version.active_snapshot_id);
            }
            if (version.latest_snapshot_id) {
                keepSet.add(version.latest_snapshot_id);
            }
        }

        // 2.4 保留有租户使用的快照
        if (mergedPolicy.keepInUse) {
            const inUseSnapshots = await this.tenantSnapshotRepo
                .findDistinctSnapshotIds(versionId);
            inUseSnapshots.forEach(id => keepSet.add(id));
        }

        // 2.5 保留有 Git tag 的快照
        if (mergedPolicy.keepTagged) {
            snapshots
                .filter(s => s.git_tag)
                .forEach(s => keepSet.add(s.id));
        }

        // 3. 标记待清理的快照
        const toCleanup = snapshots.filter(s => !keepSet.has(s.id));

        // 4. 执行清理（软删除）
        const cleanedIds: number[] = [];
        for (const snapshot of toCleanup) {
            await this.snapshotRepo.update(snapshot.id, {
                status: 'deprecated',
                is_removed: true,
            });
            cleanedIds.push(snapshot.id);
        }

        return {
            totalCount: snapshots.length,
            keptCount: keepSet.size,
            cleanedCount: cleanedIds.length,
            cleanedIds,
        };
    }

    /**
     * 定时清理任务
     */
    @Scheduled('0 3 * * *')  // 每天凌晨 3 点
    async scheduledCleanup(): Promise<void> {
        const versions = await this.versionRepo.findAllPublished();

        for (const version of versions) {
            try {
                const result = await this.cleanup(version.id);
                this.logger.info('Snapshot cleanup completed', {
                    versionId: version.id,
                    ...result,
                });
            } catch (error) {
                this.logger.error('Snapshot cleanup failed', {
                    versionId: version.id,
                    error,
                });
            }
        }
    }
}
```

---

## 10. 监控与告警

### 10.1 监控指标

| 指标 | 说明 | 告警阈值 |
|-----|------|---------|
| snapshot.publish.count | 快照发布次数 | 仅监控 |
| snapshot.publish.duration | 打包发布耗时 | > 30s |
| snapshot.rollback.count | 快照回滚次数 | > 3次/天 |
| snapshot.hotfix.count | 热修复次数 | > 5次/天 |
| snapshot.load.duration | 快照加载耗时 | > 100ms |
| snapshot.cache.hit_rate | 快照缓存命中率 | < 90% |

### 10.2 告警规则

```yaml
alerts:
  - name: snapshot_publish_slow
    condition: snapshot.publish.duration > 30000
    severity: warning
    message: "快照发布耗时超过 30 秒"

  - name: snapshot_rollback_frequent
    condition: sum(snapshot.rollback.count)[24h] > 3
    severity: warning
    message: "24小时内快照回滚超过 3 次，请检查发布质量"

  - name: snapshot_hotfix_frequent
    condition: sum(snapshot.hotfix.count)[24h] > 5
    severity: warning
    message: "24小时内热修复超过 5 次，建议打包发布新快照"

  - name: snapshot_load_slow
    condition: percentile(snapshot.load.duration, 99) > 100
    severity: warning
    message: "快照加载 P99 延迟超过 100ms"
```

---

## 11. 相关文档

- [存储层概览](./overview.md)
- [缓存策略详细设计](./cache-strategy.md)
- [版本管理详细设计](./version-management.md)
- [配置详细设计](./config-detail.md)
