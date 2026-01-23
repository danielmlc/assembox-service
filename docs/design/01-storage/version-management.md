# 版本管理详细设计

> **状态**: 已完成
> **更新日期**: 2025-01-22

---

## 1. 概述

### 1.1 版本管理定位

版本管理是 Assembox 存储层的核心能力，包含：

- **模块版本生命周期** - 版本的创建、发布、废弃流程
- **配置版本历史** - 每次发布的配置快照与回滚能力
- **Git 版本控制** - 使用 Gitea 进行版本备份与审计（仅同步 published 状态的配置）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              版本管理                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │  模块版本管理    │    │  配置版本历史    │    │   Git版本控制   │        │
│   │                 │    │                 │    │                 │        │
│   │  - 生命周期     │    │  - 发布历史     │    │  - 分支管理     │        │
│   │  - 创建/复制    │    │  - 版本回滚     │    │  - 异步同步     │        │
│   │  - 多版本并存   │    │  - 差异对比     │    │  - 灾难恢复     │        │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心概念

| 概念 | 说明 |
|-----|------|
| 模块版本 (Module Version) | 模块的大版本，如 V1、V2，对应 Git 分支 |
| 配置版本 (Config Version) | 单个配置的发布版本号，每次发布 +1 |
| Git 分支 | 模块版本对应 Git 分支，格式 `{module}/{version}` |
| Git 标签 | 配置版本对应 Git 标签，用于精确定位历史 |

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

## 3. 配置版本历史

### 3.1 发布版本记录

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

### 3.2 版本回滚

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

### 3.3 版本对比

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

## 4. Git 版本控制

### 4.1 Git 在版本管理中的定位

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

### 4.2 仓库结构

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

### 4.3 同步机制

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

### 4.4 消息队列设计

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

## 5. Git 操作实现

### 5.1 初始化仓库

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

### 5.2 创建新版本分支

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

### 5.3 发布配置同步

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

## 6. 历史查询与恢复

### 6.1 查看配置历史

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

### 6.2 恢复历史版本

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

## 7. 错误处理与重试

### 7.1 重试策略

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

### 7.2 常见错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| 网络超时 | 重试 |
| 认证失败 | 告警 + 停止重试 |
| 分支不存在 | 自动创建分支后重试 |
| 合并冲突 | 强制覆盖（OSS 为准） |
| 磁盘空间不足 | 告警 + 清理旧数据 |

---

## 8. 灾难恢复

### 8.1 从 Git 恢复到 OSS

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

### 8.2 一致性校验

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

## 9. 监控与告警

### 9.1 监控指标

| 指标 | 说明 | 告警阈值 |
|-----|------|---------|
| sync_queue_length | 待同步队列长度 | > 1000 |
| sync_lag_seconds | 同步延迟（秒） | > 300 |
| sync_failure_rate | 同步失败率 | > 5% |
| dead_letter_count | 死信队列数量 | > 10 |
| git_push_duration | 推送耗时 | > 30s |

### 9.2 健康检查

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

## 10. 配置项

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

## 11. 相关文档

- [存储层概览](./overview.md)
- [缓存策略详细设计](./cache-strategy.md)
- [配置详细设计](./config-detail.md)
