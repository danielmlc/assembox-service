# 版本管理详细设计

> **状态**: 已完成
> **更新日期**: 2025-01-22

---

## 1. 概述

### 1.1 版本管理定位

版本管理是 Assembox 存储层的核心能力，包含：

- **模块版本生命周期** - 版本的创建、发布、废弃流程
- **草稿历史管理** - 设计过程中的版本历史与回退能力
- **配置版本历史** - 每次发布的配置快照与回滚能力
- **Git 版本控制** - 使用 Gitea 进行版本备份与审计（仅同步 published 状态的配置）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              版本管理                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │  模块版本管理    │    │  草稿历史管理    │    │  配置版本历史    │        │
│   │                 │    │                 │    │                 │        │
│   │  - 生命周期     │    │  - 保存归档     │    │  - 发布历史     │        │
│   │  - 创建/复制    │    │  - 草稿回退     │    │  - 版本回滚     │        │
│   │  - 多版本并存   │    │  - 版本对比     │    │  - 差异对比     │        │
│   └─────────────────┘    │  - 历史清理     │    └─────────────────┘        │
│                          └─────────────────┘                               │
│                                                                             │
│   ┌─────────────────┐                                                       │
│   │   Git版本控制   │                                                       │
│   │                 │                                                       │
│   │  - 分支管理     │                                                       │
│   │  - 异步同步     │                                                       │
│   │  - 灾难恢复     │                                                       │
│   └─────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心概念

| 概念 | 说明 |
|-----|------|
| 模块版本 (Module Version) | 模块的大版本，如 V1、V2，对应 Git 分支 |
| 草稿版本 (Draft Version) | 单个配置的草稿版本号，每次保存 +1，用于设计过程回退 |
| 配置版本 (Config Version) | 单个配置的发布版本号，每次发布 +1，用于生产环境回滚 |
| Git 分支 | 模块版本对应 Git 分支，格式 `{module}/{version}` |
| Git 标签 | 配置版本对应 Git 标签，用于精确定位历史 |

**版本层次关系：**

```
模块版本 (V1, V2, V3...)
    │
    └── 组件配置
            │
            ├── 草稿版本 (v1, v2, v3...) ← 每次保存递增，设计过程使用
            │
            └── 发布版本 (v1, v2, v3...) ← 每次发布递增，生产环境使用
```

---

## 2. 模块版本生命周期

### 2.1 版本状态

```
┌─────────┐     发布      ┌─────────────┐     废弃      ┌─────────────┐
│  draft  │ ───────────▶ │  published  │ ───────────▶ │ deprecated  │
│  草稿   │              │    已发布    │              │    已废弃    │
└─────────┘              └─────────────┘              └─────────────┘
     │                          │
     │                          │ 可回退到草稿
     │                          ▼
     └──────────────────────────┘
```

| 状态 | 说明 | 允许的操作 |
|-----|------|-----------|
| draft | 草稿状态，开发中 | 编辑、删除、发布 |
| published | 已发布，运行时可用 | 编辑（生成新配置版本）、废弃 |
| deprecated | 已废弃，不再使用 | 恢复到 published |

### 2.2 版本创建流程

```typescript
interface CreateVersionInput {
    moduleId: number;
    moduleCode: string;
    versionCode: string;         // 如 "V2"
    versionName?: string;
    description?: string;
    copyFromVersion?: string;    // 从哪个版本复制，如 "V1"
}

async function createVersion(input: CreateVersionInput): Promise<ModuleVersion> {
    // 1. 校验版本号格式和唯一性
    validateVersionCode(input.versionCode);
    await checkVersionUnique(input.moduleId, input.versionCode);

    // 2. 创建版本记录
    const version = await db.insert('ab_module_version', {
        module_id: input.moduleId,
        module_code: input.moduleCode,
        version_code: input.versionCode,
        version_name: input.versionName,
        description: input.description,
        status: 'draft',
        git_branch: `${input.moduleCode}/${input.versionCode}`
    });

    // 3. 如果指定了复制源，复制所有组件和配置
    if (input.copyFromVersion) {
        await copyVersionComponents(
            input.moduleCode,
            input.copyFromVersion,
            input.versionCode
        );
    }

    // 4. 创建 Git 分支（异步）
    await queueGitTask({
        type: 'create_branch',
        moduleCode: input.moduleCode,
        versionCode: input.versionCode,
        fromVersion: input.copyFromVersion
    });

    return version;
}
```

### 2.3 版本复制流程

```typescript
async function copyVersionComponents(
    moduleCode: string,
    fromVersion: string,
    toVersion: string
): Promise<void> {
    // 1. 获取源版本的所有组件
    const components = await db.query(`
        SELECT * FROM ab_component
        WHERE module_code = ? AND version_code = ?
        AND is_removed = 0
    `, [moduleCode, fromVersion]);

    // 2. 复制组件记录
    for (const comp of components) {
        const newCompId = generateId();

        await db.insert('ab_component', {
            ...comp,
            id: newCompId,
            version_code: toVersion,
            created_at: new Date()
        });

        // 3. 复制该组件的所有配置（从 published 区复制到 draft 区）
        await copyComponentConfigs(comp.id, newCompId, moduleCode, toVersion);
    }
}

async function copyComponentConfigs(
    fromCompId: number,
    toCompId: number,
    moduleCode: string,
    toVersion: string
): Promise<void> {
    // 获取源组件的所有配置（包括 system/global/tenant）
    // 只复制已发布的配置（从 published 区）
    const configs = await db.query(`
        SELECT * FROM ab_config
        WHERE component_id = ? AND status = 'published'
        AND is_removed = 0
    `, [fromCompId]);

    for (const config of configs) {
        // 从 published 区复制到新版本的 draft 区
        // 原 OSS Key 格式: assembox/published/{module}/{version}/...
        // 新 OSS Key 格式: assembox/draft/{module}/{toVersion}/...
        const newOssKey = config.oss_key
            .replace('/published/', '/draft/')
            .replace(`/${config.version_code}/`, `/${toVersion}/`);

        await oss.copy(config.oss_key, newOssKey);

        // 创建新配置记录，状态为 draft
        await db.insert('ab_config', {
            ...config,
            id: generateId(),
            component_id: toCompId,
            version_code: toVersion,
            oss_key: newOssKey,
            status: 'draft',        // 复制后为草稿状态
            publish_version: 0,     // 发布版本重置
            created_at: new Date()
        });
    }
}
```

### 2.4 多版本并存

```
模块: order (订单模块)
│
├── V1 (published) ─────── 生产环境使用
│   ├── 租户 T001 使用 V1
│   └── 租户 T002 使用 V1
│
├── V2 (published) ─────── 灰度环境使用
│   └── 租户 T003 使用 V2 (灰度测试)
│
└── V3 (draft) ──────────── 开发中
    └── 开发团队编辑
```

**版本切换机制：**

```typescript
interface VersionSwitch {
    moduleId: number;
    tenantCode?: string;        // 可选，指定租户切换
    targetVersion: string;
}

async function switchVersion(input: VersionSwitch): Promise<void> {
    // 1. 校验目标版本状态
    const version = await getVersion(input.moduleId, input.targetVersion);
    if (version.status !== 'published') {
        throw new Error('只能切换到已发布的版本');
    }

    // 2. 更新模块的激活版本
    if (!input.tenantCode) {
        // 全局切换
        await db.update('ab_module', {
            id: input.moduleId,
            active_version_id: version.id,
            active_version_code: version.version_code
        });
    } else {
        // 租户级切换（存储在租户配置表中）
        await db.upsert('ab_tenant_module_version', {
            tenant_code: input.tenantCode,
            module_id: input.moduleId,
            version_code: input.targetVersion
        });
    }

    // 3. 清除相关缓存
    await invalidateVersionCache(input.moduleId, input.tenantCode);
}
```

---

## 3. 草稿历史管理

> **设计目标**：支持设计过程中的版本回退，让用户在编辑配置时可以随时回到之前的草稿版本。

### 3.1 草稿历史定位

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            配置编辑生命周期                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────┐     保存      ┌─────────┐     发布      ┌─────────────┐       │
│   │  编辑中  │ ───────────▶ │  草稿    │ ───────────▶ │   已发布    │       │
│   └─────────┘              └─────────┘              └─────────────┘       │
│        │                        │                         │                │
│        │                        │                         │                │
│        │                   ┌────┴────┐              ┌─────┴─────┐          │
│        │                   │ 草稿历史 │              │  发布历史  │          │
│        │                   │ v1→v2→v3│              │  v1→v2    │          │
│        │                   └─────────┘              └───────────┘          │
│        │                        │                         │                │
│        │                   设计过程回退              生产环境回滚            │
│        │                                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

| 对比项 | 草稿历史 | 发布历史 |
|-------|---------|---------|
| 记录表 | ab_config_draft_history | ab_config_history |
| 版本字段 | draft_version | publish_version |
| 触发时机 | 每次保存草稿 | 每次发布配置 |
| 存储路径 | OSS draft-history/ | OSS published/ + Gitea |
| 保留策略 | 按数量/时间清理 | 长期保留 |
| 使用场景 | 设计器回退、对比 | 生产回滚、审计 |

### 3.2 保存草稿流程

```typescript
interface SaveDraftInput {
    configId: number;
    content: object;
    saverId: number;
    changeSummary?: string;  // 可选的变更摘要
    saveSource?: 'manual' | 'auto_save' | 'import';
}

async function saveDraft(input: SaveDraftInput): Promise<void> {
    const config = await getConfig(input.configId);
    const contentStr = JSON.stringify(input.content, null, 2);

    // 1. 归档当前草稿到历史（如果存在）
    if (config.draft_oss_key && config.draft_version > 0) {
        const historyOssKey = generateDraftHistoryOssKey(config, config.draft_version);

        // 复制当前草稿到历史目录
        await oss.copy(config.draft_oss_key, historyOssKey);

        // 记录到草稿历史表
        await db.insert('ab_config_draft_history', {
            config_id: input.configId,
            component_id: config.component_id,
            draft_version: config.draft_version,
            draft_oss_key: historyOssKey,
            content_hash: config.draft_content_hash,
            content_size: config.draft_size,
            change_summary: input.changeSummary,
            saved_at: config.draft_updated_at,
            saver_id: config.modifier_id,
            saver_name: config.modifier_name,
            save_source: input.saveSource || 'manual'
        });
    }

    // 2. 保存新草稿到当前位置
    const draftOssKey = config.draft_oss_key || generateOssKey(config, 'draft');
    await oss.put(draftOssKey, contentStr);

    // 3. 更新配置记录
    const newDraftVersion = config.draft_version + 1;
    await db.update('ab_config', {
        id: input.configId,
        draft_oss_key: draftOssKey,
        draft_content_hash: md5(contentStr),
        draft_size: contentStr.length,
        draft_updated_at: new Date(),
        draft_version: newDraftVersion,
        modifier_id: input.saverId,
    });

    // 4. 异步清理过期历史
    await queueHistoryCleanup(input.configId);
}

function generateDraftHistoryOssKey(config: ConfigInfo, version: number): string {
    const scopeSuffix = config.scope === 'system'
        ? '_system'
        : config.scope === 'global'
            ? '_global'
            : `_tenant_${config.tenant}`;

    return `assembox/draft-history/${config.moduleCode}/${config.versionCode}/${config.componentType}/${config.componentCode}/${scopeSuffix}_v${version}.json`;
}
```

### 3.3 查询草稿历史

```typescript
interface DraftHistoryItem {
    id: number;
    draftVersion: number;
    savedAt: Date;
    saverName: string;
    contentSize: number;
    contentHash: string;
    changeSummary?: string;
    saveSource: string;
}

/**
 * 查询配置的草稿历史列表
 */
async function getDraftHistoryList(
    configId: number,
    options: { limit?: number; offset?: number } = {}
): Promise<{ items: DraftHistoryItem[]; total: number }> {
    const { limit = 50, offset = 0 } = options;

    const [items, total] = await Promise.all([
        db.query(`
            SELECT id, draft_version, saved_at, saver_name, content_size,
                   content_hash, change_summary, save_source
            FROM ab_config_draft_history
            WHERE config_id = ? AND is_removed = 0
            ORDER BY draft_version DESC
            LIMIT ? OFFSET ?
        `, [configId, limit, offset]),

        db.count(`
            SELECT COUNT(*) FROM ab_config_draft_history
            WHERE config_id = ? AND is_removed = 0
        `, [configId])
    ]);

    return { items, total };
}

/**
 * 获取指定版本的草稿内容
 */
async function getDraftHistoryContent(configId: number, draftVersion: number): Promise<object> {
    const history = await db.query(`
        SELECT draft_oss_key FROM ab_config_draft_history
        WHERE config_id = ? AND draft_version = ? AND is_removed = 0
    `, [configId, draftVersion]);

    if (!history) {
        throw new Error(`草稿版本 v${draftVersion} 不存在`);
    }

    const content = await oss.get(history.draft_oss_key);
    return JSON.parse(content);
}
```

### 3.4 草稿版本回退

```typescript
interface RollbackToDraftInput {
    configId: number;
    targetVersion: number;
    operatorId: number;
}

/**
 * 回退到指定的草稿版本
 * 注意：回退会创建一个新的草稿版本，而不是删除后续版本
 */
async function rollbackToDraftVersion(input: RollbackToDraftInput): Promise<void> {
    // 1. 获取目标版本历史
    const history = await db.query(`
        SELECT * FROM ab_config_draft_history
        WHERE config_id = ? AND draft_version = ? AND is_removed = 0
    `, [input.configId, input.targetVersion]);

    if (!history) {
        throw new Error(`草稿版本 v${input.targetVersion} 不存在`);
    }

    // 2. 获取历史内容
    const content = await oss.get(history.draft_oss_key);

    // 3. 保存为新草稿（会自动归档当前版本）
    await saveDraft({
        configId: input.configId,
        content: JSON.parse(content),
        saverId: input.operatorId,
        changeSummary: `回退到 v${input.targetVersion}`,
        saveSource: 'manual'
    });
}
```

### 3.5 草稿版本对比

```typescript
interface DraftVersionDiff {
    fromVersion: number;
    toVersion: number;
    changes: {
        path: string;           // JSON 路径，如 "columns[0].width"
        type: 'added' | 'removed' | 'modified';
        oldValue?: any;
        newValue?: any;
    }[];
    summary: {
        added: number;
        removed: number;
        modified: number;
    };
}

/**
 * 对比两个草稿版本
 */
async function compareDraftVersions(
    configId: number,
    fromVersion: number,
    toVersion: number
): Promise<DraftVersionDiff> {
    // 获取两个版本的内容
    const [fromContent, toContent] = await Promise.all([
        getDraftHistoryContent(configId, fromVersion),
        getDraftHistoryContent(configId, toVersion)
    ]);

    // JSON 深度对比
    const changes = deepDiff(fromContent, toContent);

    return {
        fromVersion,
        toVersion,
        changes,
        summary: {
            added: changes.filter(c => c.type === 'added').length,
            removed: changes.filter(c => c.type === 'removed').length,
            modified: changes.filter(c => c.type === 'modified').length
        }
    };
}

/**
 * 对比当前草稿与指定历史版本
 */
async function compareDraftWithHistory(
    configId: number,
    historyVersion: number
): Promise<DraftVersionDiff> {
    const config = await getConfig(configId);

    const [historyContent, currentContent] = await Promise.all([
        getDraftHistoryContent(configId, historyVersion),
        oss.get(config.draft_oss_key).then(JSON.parse)
    ]);

    const changes = deepDiff(historyContent, currentContent);

    return {
        fromVersion: historyVersion,
        toVersion: config.draft_version,
        changes,
        summary: {
            added: changes.filter(c => c.type === 'added').length,
            removed: changes.filter(c => c.type === 'removed').length,
            modified: changes.filter(c => c.type === 'modified').length
        }
    };
}
```

### 3.6 草稿历史清理

> **清理策略**：为避免草稿历史无限增长，需要定期清理过期的历史版本。

```typescript
interface DraftHistoryCleanupPolicy {
    maxVersions: number;           // 最多保留版本数，默认 50
    maxDays: number;               // 最多保留天数，默认 30
    keepPublishedBase: boolean;    // 是否保留发布前的最后一个草稿，默认 true
}

const DEFAULT_CLEANUP_POLICY: DraftHistoryCleanupPolicy = {
    maxVersions: 50,
    maxDays: 30,
    keepPublishedBase: true
};

/**
 * 清理配置的草稿历史
 */
async function cleanupDraftHistory(
    configId: number,
    policy: DraftHistoryCleanupPolicy = DEFAULT_CLEANUP_POLICY
): Promise<{ deleted: number }> {
    // 1. 获取需要保留的版本（发布前的基准版本）
    let protectedVersions: number[] = [];
    if (policy.keepPublishedBase) {
        const publishHistory = await db.query(`
            SELECT draft_version FROM ab_config_history
            WHERE config_id = ? AND is_removed = 0
            ORDER BY publish_version
        `, [configId]);
        // 保留每次发布前的草稿版本
        protectedVersions = publishHistory.map(h => h.draft_version).filter(Boolean);
    }

    // 2. 按版本数清理（保留最新的 maxVersions 个）
    const versionExcess = await db.query(`
        SELECT id, draft_oss_key, draft_version
        FROM ab_config_draft_history
        WHERE config_id = ? AND is_removed = 0
        ORDER BY draft_version DESC
        LIMIT 999999 OFFSET ?
    `, [configId, policy.maxVersions]);

    // 3. 按时间清理（超过 maxDays 天的）
    const timeExcess = await db.query(`
        SELECT id, draft_oss_key, draft_version
        FROM ab_config_draft_history
        WHERE config_id = ? AND is_removed = 0
        AND saved_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [configId, policy.maxDays]);

    // 4. 合并待删除列表，排除受保护版本
    const toDeleteMap = new Map<number, { id: number; ossKey: string }>();
    for (const item of [...versionExcess, ...timeExcess]) {
        if (!protectedVersions.includes(item.draft_version)) {
            toDeleteMap.set(item.id, { id: item.id, ossKey: item.draft_oss_key });
        }
    }

    // 5. 执行删除
    let deleted = 0;
    for (const item of toDeleteMap.values()) {
        try {
            // 软删除数据库记录
            await db.update('ab_config_draft_history', {
                id: item.id,
                is_removed: 1
            });
            // 删除 OSS 文件（可选，也可保留一段时间后再物理删除）
            await oss.delete(item.ossKey);
            deleted++;
        } catch (error) {
            console.error(`Failed to delete draft history ${item.id}:`, error);
        }
    }

    return { deleted };
}

/**
 * 定时任务：批量清理所有配置的草稿历史
 */
async function batchCleanupDraftHistory(): Promise<void> {
    const configs = await db.query(`
        SELECT DISTINCT config_id FROM ab_config_draft_history
        WHERE is_removed = 0
    `);

    for (const { config_id } of configs) {
        await cleanupDraftHistory(config_id);
    }
}
```

### 3.7 设计器集成

设计器前端需要提供以下功能：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              设计器界面                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  工具栏                                                              │   │
│   │  [保存] [发布] [历史记录 ▾]                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│                         ┌───────────────────────┐                          │
│                         │     历史记录面板       │                          │
│                         ├───────────────────────┤                          │
│                         │ ○ v5 - 当前版本        │                          │
│                         │ ○ v4 - 10分钟前       │                          │
│                         │ ○ v3 - 1小时前        │                          │
│                         │ ○ v2 - 昨天 15:30     │                          │
│                         │ ○ v1 - 昨天 10:00     │                          │
│                         ├───────────────────────┤                          │
│                         │ [对比选中版本] [回退]  │                          │
│                         └───────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**设计器 API 调用示例：**

```typescript
// 1. 获取历史列表
const history = await api.getDraftHistory(configId);

// 2. 预览历史版本
const content = await api.getDraftHistoryContent(configId, version);

// 3. 对比两个版本
const diff = await api.compareDraftVersions(configId, fromVersion, toVersion);

// 4. 回退到历史版本
await api.rollbackToDraftVersion(configId, targetVersion);
```

---

## 4. 配置版本历史（发布历史）

### 4.1 发布版本记录

每次发布配置时，`publish_version` 递增，并记录到历史表：

```typescript
async function publishConfig(configId: number, publisherId: number): Promise<void> {
    const config = await getConfig(configId);

    // 1. 递增发布版本号
    const newVersion = config.publish_version + 1;

    // 2. 更新配置状态
    await db.update('ab_config', {
        id: configId,
        status: 'published',
        publish_version: newVersion,
        published_at: new Date()
    });

    // 3. 记录发布历史
    await db.insert('ab_config_history', {
        config_id: configId,
        component_id: config.component_id,
        publish_version: newVersion,
        oss_key: config.oss_key,
        content_hash: config.content_hash,
        published_at: new Date(),
        publisher_id: publisherId
    });

    // 4. 异步同步到 Git
    await queueGitTask({
        type: 'publish',
        ...config,
        publishVersion: newVersion
    });

    // 5. 清除缓存
    await invalidateConfigCache(config);
}
```

### 4.2 版本回滚

```typescript
interface RollbackInput {
    configId: number;
    targetVersion: number;
    operatorId: number;
}

async function rollbackConfig(input: RollbackInput): Promise<void> {
    // 1. 获取历史版本记录
    const history = await db.query(`
        SELECT * FROM ab_config_history
        WHERE config_id = ? AND publish_version = ?
    `, [input.configId, input.targetVersion]);

    if (!history) {
        throw new Error(`版本 v${input.targetVersion} 不存在`);
    }

    // 2. 从 OSS 获取历史内容（或从 Git 恢复）
    let content: string;
    try {
        content = await oss.getObject(history.oss_key);
    } catch {
        // OSS 中不存在，从 Git 恢复
        content = await restoreFromGit(history);
    }

    // 3. 生成新的 OSS Key 并上传
    const config = await getConfig(input.configId);
    const newOssKey = generateOssKey(config);
    await oss.putObject(newOssKey, content);

    // 4. 更新配置记录
    const newVersion = config.publish_version + 1;
    await db.update('ab_config', {
        id: input.configId,
        oss_key: newOssKey,
        content_hash: md5(content),
        publish_version: newVersion,
        published_at: new Date()
    });

    // 5. 记录回滚历史
    await db.insert('ab_config_history', {
        config_id: input.configId,
        component_id: config.component_id,
        publish_version: newVersion,
        oss_key: newOssKey,
        rollback_from: config.publish_version,
        rollback_to: input.targetVersion,
        published_at: new Date(),
        publisher_id: input.operatorId
    });

    // 6. 同步到 Git
    await queueGitTask({
        type: 'rollback',
        ...config,
        publishVersion: newVersion,
        rollbackTo: input.targetVersion
    });

    // 7. 清除缓存
    await invalidateConfigCache(config);
}
```

### 4.3 版本对比

```typescript
interface VersionDiff {
    fromVersion: number;
    toVersion: number;
    changes: {
        path: string;
        type: 'added' | 'removed' | 'modified';
        oldValue?: any;
        newValue?: any;
    }[];
}

async function compareVersions(
    configId: number,
    fromVersion: number,
    toVersion: number
): Promise<VersionDiff> {
    // 1. 获取两个版本的内容
    const [fromHistory, toHistory] = await Promise.all([
        getConfigHistory(configId, fromVersion),
        getConfigHistory(configId, toVersion)
    ]);

    const [fromContent, toContent] = await Promise.all([
        oss.getObject(fromHistory.oss_key),
        oss.getObject(toHistory.oss_key)
    ]);

    // 2. JSON 深度对比
    const changes = deepDiff(
        JSON.parse(fromContent),
        JSON.parse(toContent)
    );

    return {
        fromVersion,
        toVersion,
        changes
    };
}
```

---

## 5. Git 版本控制

### 5.1 Git 在版本管理中的定位

```
┌─────────────┐     主存储      ┌─────────────┐
│    TiDB     │ ◀────────────▶ │    OSS      │
│   (索引)    │                │   (内容)    │
└─────────────┘                └─────────────┘
                                      │
                                      │ 异步备份
                                      ▼
                              ┌─────────────┐
                              │   Gitea     │
                              │  (版本历史) │
                              └─────────────┘
```

**核心职责：**

| 职责 | 说明 |
|-----|------|
| 版本历史 | 记录每次发布的配置快照（仅 published 状态） |
| 变更追溯 | 查看配置的修改历史和差异 |
| 灾难恢复 | 从 Git 仓库恢复配置数据到 OSS published 区 |
| 审计日志 | 记录谁在什么时间发布了什么 |

> **重要**: Git 仅同步已发布（published）的配置内容，草稿（draft）不会同步到 Git。
> 这确保 Git 中的内容始终是生产可用的配置版本。

**设计原则：**

1. **异步同步** - 不阻塞主流程，发布成功后异步推送
2. **最终一致** - Git 同步失败不影响业务，后台重试
3. **单向流动** - OSS → Git，Git 仅用于读取历史
4. **分支隔离** - 模块版本对应 Git 分支

### 5.2 仓库结构

```
Gitea 组织: assembox
│
└── assembox-configs          # 配置仓库（单仓库）
    │
    ├── main                  # 默认分支（仅初始化用）
    │
    ├── order/V1              # 订单模块 V1
    ├── order/V2              # 订单模块 V2
    │
    ├── product/V1            # 商品模块 V1
    │
    └── user/V1               # 用户模块 V1
```

**分支命名规范：**

```
{module_code}/{version_code}

示例:
- order/V1
- order/V2
- product/V1
```

**分支内目录结构：**

```
分支: order/V1
│
├── model/
│   └── order_model/
│       └── _system.json
│
├── table/
│   └── order_table/
│       ├── _system.json
│       ├── _global.json
│       └── _tenant_T001.json
│
├── form/
│   └── order_form/
│       ├── _system.json
│       └── _tenant_T001.json
│
└── page/
    └── order_list/
        └── _system.json
```

### 5.3 同步机制

**同步时机：**

| 事件 | 是否同步 | 说明 |
|-----|---------|------|
| 保存草稿 | 否 | 草稿仅存 TiDB + OSS draft 区 |
| **发布配置** | **是** | 从 OSS published 区异步推送到 Git |
| **回滚配置** | **是** | 记录回滚操作 |
| **创建新版本** | **是** | 创建新分支（空分支或从源版本复制） |
| 删除已发布配置 | 是 | 删除文件并提交 |

> Git 同步的数据来源是 OSS 的 **published 区**，确保 Git 中只有已发布的配置。

**异步同步流程：**

```
┌──────────┐     ① 发布成功     ┌──────────┐
│  服务层   │ ─────────────────▶ │  消息队列 │
│          │                    │ (Redis)  │
└──────────┘                    └────┬─────┘
                                     │
                                     │ ② 消费消息
                                     ▼
                               ┌──────────┐
                               │ Git同步   │
                               │  Worker  │
                               └────┬─────┘
                                     │
                                     │ ③ 推送到 Gitea
                                     ▼
                               ┌──────────┐
                               │  Gitea   │
                               └──────────┘
```

### 5.4 消息队列设计

```typescript
// 同步任务消息结构
interface GitSyncTask {
    taskId: string;
    type: 'publish' | 'rollback' | 'delete' | 'create_branch';

    // 配置信息
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;

    // OSS 信息
    ossKey: string;

    // 发布信息
    publishVersion: number;
    publisherId: number;
    publisherName: string;
    publishedAt: string;

    // 重试信息
    retryCount: number;
    maxRetries: number;
    createdAt: string;
}

// Redis 队列 Key
const QUEUE_KEY = 'assembox:git-sync:queue';
const RETRY_KEY = 'assembox:git-sync:retry';
const DEAD_LETTER_KEY = 'assembox:git-sync:dead-letter';
```

---

## 6. Git 操作实现

### 6.1 初始化仓库

```typescript
async function initRepository(): Promise<void> {
    const repoPath = '/data/assembox-configs';

    if (!await fs.exists(repoPath)) {
        await git.clone({
            fs,
            http,
            dir: repoPath,
            url: 'https://gitea.example.com/assembox/assembox-configs.git',
            ref: 'main',
            singleBranch: false,
            depth: 1
        });
    }
}
```

### 6.2 创建新版本分支

```typescript
async function createVersionBranch(
    moduleCode: string,
    versionCode: string,
    fromVersion?: string
): Promise<void> {
    const branchName = `${moduleCode}/${versionCode}`;
    const repoPath = '/data/assembox-configs';

    const baseBranch = fromVersion
        ? `${moduleCode}/${fromVersion}`
        : 'main';

    await git.checkout({ fs, dir: repoPath, ref: baseBranch });
    await git.pull({ fs, http, dir: repoPath, ref: baseBranch });
    await git.branch({ fs, dir: repoPath, ref: branchName, checkout: true });
    await git.push({ fs, http, dir: repoPath, remote: 'origin', ref: branchName });
}
```

### 6.3 发布配置同步

```typescript
async function syncPublish(task: GitSyncTask): Promise<string> {
    const repoPath = '/data/assembox-configs';
    const branchName = `${task.moduleCode}/${task.versionCode}`;

    // 1. 切换分支并拉取最新
    await git.checkout({ fs, dir: repoPath, ref: branchName });
    await git.pull({ fs, http, dir: repoPath, ref: branchName });

    // 2. 从 OSS published 区下载内容并写入文件
    // ossKey 格式: assembox/published/{module}/{version}/...
    const content = await oss.getObject(task.ossKey);
    const filePath = buildFilePath(task);
    await fs.writeFile(filePath, JSON.stringify(content, null, 2));

    // 3. 提交并推送
    await git.add({ fs, dir: repoPath, filepath: filePath });
    const commitHash = await git.commit({
        fs,
        dir: repoPath,
        message: buildCommitMessage(task),
        author: { name: task.publisherName, email: `${task.publisherId}@assembox.user` }
    });

    // 4. 打标签
    await git.tag({ fs, dir: repoPath, ref: buildTagName(task), object: commitHash });

    // 5. 推送
    await git.push({ fs, http, dir: repoPath, remote: 'origin', ref: branchName });

    return commitHash;
}

function buildCommitMessage(task: GitSyncTask): string {
    const scopeLabel = task.scope === 'tenant' ? `tenant:${task.tenant}` : task.scope;
    return `[${scopeLabel}] publish: ${task.componentType}/${task.componentCode} (v${task.publishVersion})`;
}

function buildTagName(task: GitSyncTask): string {
    const scopeSuffix = task.scope === 'tenant' ? `_tenant_${task.tenant}` : `_${task.scope}`;
    return `${task.componentType}/${task.componentCode}${scopeSuffix}/v${task.publishVersion}`;
}
```

---

## 7. 历史查询与恢复

### 7.1 查看配置历史

```typescript
async function getConfigHistory(
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    scope: string,
    tenant?: string
): Promise<ConfigHistory[]> {
    const repoPath = '/data/assembox-configs';
    const branchName = `${moduleCode}/${versionCode}`;
    const filePath = buildFilePath({ moduleCode, versionCode, componentType, componentCode, scope, tenant });

    const commits = await git.log({
        fs,
        dir: repoPath,
        ref: branchName,
        filepath: filePath
    });

    return commits.map(commit => ({
        commitHash: commit.oid,
        publishVersion: extractVersionFromMessage(commit.commit.message),
        publisherName: commit.commit.author.name,
        publishedAt: new Date(commit.commit.author.timestamp * 1000),
        message: commit.commit.message
    }));
}
```

### 7.2 恢复历史版本

```typescript
async function restoreFromHistory(
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    scope: string,
    tenant: string | undefined,
    targetVersion: number
): Promise<{ ossKey: string; content: object }> {
    const targetTag = buildTagName({ componentType, componentCode, scope, tenant, publishVersion: targetVersion });
    const filePath = buildFilePath({ moduleCode, versionCode, componentType, componentCode, scope, tenant });

    // 从 Git 获取历史内容
    const content = await getFileAtRef('/data/assembox-configs', targetTag, filePath);

    if (!content) {
        throw new Error(`Version v${targetVersion} not found`);
    }

    // 上传到 OSS
    const newOssKey = generateOssKey({ moduleCode, versionCode, componentType, componentCode, scope, tenant });
    await oss.putObject(newOssKey, content);

    return { ossKey: newOssKey, content: JSON.parse(content) };
}
```

---

## 8. 错误处理与重试

### 8.1 重试策略

```typescript
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 300000,
    backoffMultiplier: 2
};

async function processWithRetry(task: GitSyncTask): Promise<void> {
    try {
        await syncPublish(task);
        await updateSyncStatus(task.taskId, 'success');
    } catch (error) {
        task.retryCount++;

        if (task.retryCount >= task.maxRetries) {
            await redis.lpush(DEAD_LETTER_KEY, JSON.stringify({ ...task, error: error.message }));
            await sendAlert({ type: 'git_sync_failed', task, error: error.message });
        } else {
            const delay = Math.min(
                DEFAULT_RETRY_CONFIG.baseDelayMs * Math.pow(2, task.retryCount),
                DEFAULT_RETRY_CONFIG.maxDelayMs
            );
            await redis.zadd(RETRY_KEY, Date.now() + delay, JSON.stringify(task));
        }
    }
}
```

### 8.2 常见错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| 网络超时 | 重试 |
| 认证失败 | 告警 + 停止重试 |
| 分支不存在 | 自动创建分支后重试 |
| 合并冲突 | 强制覆盖（OSS 为准） |
| 磁盘空间不足 | 告警 + 清理旧数据 |

---

## 9. 灾难恢复

### 9.1 从 Git 恢复到 OSS

> Git 中存储的是已发布配置，恢复时应恢复到 OSS 的 **published 区**。

```typescript
async function recoverFromGit(moduleCode: string, versionCode: string): Promise<RecoveryReport> {
    const repoPath = '/data/assembox-configs';
    const branchName = `${moduleCode}/${versionCode}`;

    await git.checkout({ fs, dir: repoPath, ref: branchName });

    const files = await glob('**/*.json', { cwd: repoPath });
    const report = { total: files.length, success: 0, failed: 0, errors: [] };

    for (const file of files) {
        try {
            const content = await fs.readFile(path.join(repoPath, file), 'utf-8');
            // 恢复到 OSS published 区
            const ossKey = `assembox/published/${moduleCode}/${versionCode}/${file}`;
            await oss.putObject(ossKey, content);
            report.success++;
        } catch (error) {
            report.failed++;
            report.errors.push({ file, error: error.message });
        }
    }

    return report;
}
```

### 9.2 一致性校验

```typescript
async function checkConsistency(moduleCode: string, versionCode: string): Promise<ConsistencyReport> {
    const ossConfigs = await listOssConfigs(moduleCode, versionCode);
    const gitConfigs = await listGitConfigs(moduleCode, versionCode);

    return {
        totalConfigs: Math.max(ossConfigs.length, gitConfigs.length),
        consistent: 0,
        inconsistent: 0,
        missingInGit: [],
        missingInOss: [],
        contentMismatch: []
    };
}
```

---

## 10. 监控与告警

### 10.1 监控指标

| 指标 | 说明 | 告警阈值 |
|-----|------|---------|
| sync_queue_length | 待同步队列长度 | > 1000 |
| sync_lag_seconds | 同步延迟（秒） | > 300 |
| sync_failure_rate | 同步失败率 | > 5% |
| dead_letter_count | 死信队列数量 | > 10 |
| git_push_duration | 推送耗时 | > 30s |

### 10.2 健康检查

```typescript
async function checkHealth(): Promise<GitSyncHealth> {
    const [queueLength, retryLength, deadLetterCount] = await Promise.all([
        redis.llen(QUEUE_KEY),
        redis.zcard(RETRY_KEY),
        redis.llen(DEAD_LETTER_KEY)
    ]);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (deadLetterCount > 10) status = 'unhealthy';
    else if (queueLength > 500) status = 'degraded';

    return { status, queueLength, retryQueueLength: retryLength, deadLetterCount };
}
```

---

## 11. 配置项

```yaml
# config/version.yaml

version:
  # 模块版本配置
  module:
    maxVersionsPerModule: 10
    allowDeprecatedAccess: false

  # Git 配置
  git:
    repository:
      url: "https://gitea.example.com/assembox/assembox-configs.git"
      localPath: "/data/assembox-configs"
    auth:
      type: "token"
      token: "${GITEA_TOKEN}"
    sync:
      enabled: true
      workers: 3
      batchSize: 10
    retry:
      maxRetries: 5
      baseDelayMs: 1000
      maxDelayMs: 300000

  # 监控配置
  monitoring:
    healthCheckIntervalMs: 60000
    alertThresholds:
      queueLength: 1000
      syncLagSeconds: 300
```

---

## 12. 相关文档

- [存储层概览](./overview.md)
- [缓存策略详细设计](./cache-strategy.md)
- [配置详细设计](./config-detail.md)
