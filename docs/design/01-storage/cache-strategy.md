# 缓存策略详细设计

> **状态**: 设计中
> **更新日期**: 2025-01-30

---

## 1. 概述

### 1.1 缓存定位

在 Assembox 存储架构中，Redis 缓存是**运行时性能**的关键：

```
┌─────────────┐     L1缓存      ┌─────────────┐     L2查询      ┌─────────────┐
│   渲染器     │ ─────────────▶ │   Redis     │ ─────────────▶ │   TiDB      │
│            │   命中率 >99%   │            │    miss时      │   (索引)    │
└─────────────┘                └─────────────┘                └─────────────┘
                                                                     │
                                                                     │ 获取内容
                                                                     ▼
                                                              ┌─────────────┐
                                                              │    OSS      │
                                                              │   (内容)    │
                                                              └─────────────┘
```

### 1.2 设计目标

| 目标 | 指标 |
|-----|------|
| 缓存命中率 | > 99% |
| 读取延迟 | < 10ms (缓存命中) |
| 缓存一致性 | 发布后 < 1s 生效 |
| 内存占用 | 可控、可预测 |

### 1.3 核心原则

1. **读多写少** - 配置变更频率低，缓存效益高
2. **主动失效** - 发布时精准删除，避免脏读
3. **分层缓存** - 不同数据类型不同 TTL
4. **降级容错** - 缓存故障时直接查库
5. **按需缓存** - 根据组件 `is_cacheable` 属性决定是否使用缓存

---

## 2. 缓存层次设计

> **重要**: 缓存仅适用于 `is_cacheable=1` 的组件。
> 对于 `is_cacheable=0` 的组件（如审批流配置、敏感配置等），将跳过缓存直接从数据库读取。

### 2.1 四层缓存结构

> **重要变更**: 引入快照机制后，L1 缓存 key 需要包含快照标识，确保快照切换时缓存自动失效。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Redis 缓存                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  L0: 快照缓存 (Snapshot)                         【新增】                     │
│      存储激活快照的 manifest 信息                                             │
│      Key: assembox:snapshot:{module}:{version}:{tenant}                     │
│      TTL: 10 分钟                                                           │
│      场景: 运行时获取激活快照，确定组件版本                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  L1: 已解析配置缓存 (Resolved Config)            【变更】                     │
│      存储租户实际使用的配置（已完成继承查找）                                    │
│      Key: assembox:resolved:{snapshot}:{tenant}:{module}:{version}:{type}:{code}
│      TTL: 1 小时                                                            │
│      场景: 运行时渲染器直接使用                                               │
│      **注意: key 包含 snapshot 标识，快照切换后自动使用新缓存**                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  L2: 原始配置缓存 (Raw Config)                                               │
│      存储从 OSS 加载的原始配置内容                                            │
│      Key: assembox:raw:{scope}:{tenant}:{module}:{version}:{type}:{code}    │
│      TTL: 30 分钟                                                           │
│      场景: 加速继承查找过程                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  L3: 元数据缓存 (Metadata)                                                   │
│      存储组件列表、版本信息等元数据                                            │
│      Key: assembox:meta:{type}:{identifier}                                 │
│      TTL: 10 分钟                                                           │
│      场景: 模块/版本/组件列表查询                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**快照对缓存的影响：**

| 场景 | 缓存行为 |
|-----|---------|
| 快照切换（回滚） | L1 key 包含快照号，自动使用新缓存，无需主动清除 |
| 打包发布新快照 | 清除 L0 快照缓存，L1 自动指向新快照 |
| 热修复 | 清除该组件的 L1/L2 缓存 |
| 灰度发布 | 不同租户 L0 返回不同快照，L1 自动隔离 |

### 2.2 缓存 Key 设计规范

```typescript
// Key 前缀
const KEY_PREFIX = 'assembox';

// L0: 快照缓存 【新增】
function snapshotKey(
    moduleCode: string,
    versionCode: string,
    tenant: string
): string {
    return `${KEY_PREFIX}:snapshot:${moduleCode}:${versionCode}:${tenant}`;
}
// 示例: assembox:snapshot:order:V1:T001
// 示例: assembox:snapshot:order:V1:_default (默认快照)

// L1: 已解析配置 【变更：增加 snapshot 参数】
function resolvedConfigKey(
    snapshotCode: string,  // 新增：快照号
    tenant: string,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string
): string {
    return `${KEY_PREFIX}:resolved:${snapshotCode}:${tenant}:${moduleCode}:${versionCode}:${componentType}:${componentCode}`;
}
// 示例: assembox:resolved:S003:T001:order:V1:table:order_table
// 说明: 快照切换时（如 S003 -> S002），key 自动不同，无需主动清除

// L2: 原始配置（保持不变）
function rawConfigKey(
    scope: string,
    tenant: string | null,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string
): string {
    const scopePart = scope === 'tenant' ? `tenant:${tenant}` : scope;
    return `${KEY_PREFIX}:raw:${scopePart}:${moduleCode}:${versionCode}:${componentType}:${componentCode}`;
}
// 示例: assembox:raw:system:order:V1:model:order_model
// 示例: assembox:raw:tenant:T001:order:V1:form:order_form

// L3: 元数据
function metaKey(type: string, identifier: string): string {
    return `${KEY_PREFIX}:meta:${type}:${identifier}`;
}
// 示例: assembox:meta:components:order:V1:frontend
// 示例: assembox:meta:versions:order
// 示例: assembox:meta:modules:list
```

**快照缓存的优势：**

```
场景：从 S003 回滚到 S002

旧方案（无快照标识）:
  1. 切换激活快照 S003 -> S002
  2. 需要主动清除所有 L1 缓存
  3. 清除期间可能读到旧数据

新方案（带快照标识）:
  1. 切换激活快照 S003 -> S002
  2. L0 缓存自动失效，返回 S002
  3. L1 key 变为 assembox:resolved:S002:...（自动隔离）
  4. 无需主动清除，无脏读风险
```

### 2.3 TTL 策略

| 缓存层 | TTL | 说明 |
|-------|-----|------|
| L0 快照 | 10 分钟 | 快照信息，灰度切换时需快速生效 |
| L1 已解析配置 | 1 小时 | 高频读取，key 含快照号，切换自动隔离 |
| L2 原始配置 | 30 分钟 | 中频读取，辅助继承查找 |
| L3 元数据 | 10 分钟 | 低频变更，短 TTL 保证新鲜 |

---

## 3. 缓存读取流程

### 3.1 配置读取完整流程（基于快照）

```typescript
interface LoadContext {
    tenant: string;
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
}

interface ComponentMeta {
    is_inheritable: boolean;
    is_cacheable: boolean;
}

interface SnapshotInfo {
    snapshotCode: string;
    manifest: SnapshotManifest;
}

// 【新增】获取激活快照（带 L0 缓存）
async function getActiveSnapshot(
    moduleCode: string,
    versionCode: string,
    tenant: string
): Promise<SnapshotInfo> {
    const l0Key = snapshotKey(moduleCode, versionCode, tenant);

    const cached = await redis.get(l0Key);
    if (cached) {
        metrics.increment('cache.l0.hit');
        return JSON.parse(cached);
    }
    metrics.increment('cache.l0.miss');

    // 1. 查询租户级快照配置（灰度发布场景）
    const tenantSnapshot = await db.queryOne(`
        SELECT s.snapshot_code, s.manifest
        FROM ab_tenant_snapshot ts
        JOIN ab_snapshot s ON ts.snapshot_id = s.id
        WHERE ts.module_code = ? AND ts.version_code = ? AND ts.tenant = ?
          AND ts.is_removed = 0
          AND (ts.effective_at IS NULL OR ts.effective_at <= NOW())
          AND (ts.expired_at IS NULL OR ts.expired_at > NOW())
    `, [moduleCode, versionCode, tenant]);

    let snapshotInfo: SnapshotInfo;

    if (tenantSnapshot) {
        snapshotInfo = {
            snapshotCode: tenantSnapshot.snapshot_code,
            manifest: tenantSnapshot.manifest,
        };
    } else {
        // 2. 使用版本级默认快照
        const version = await db.queryOne(`
            SELECT s.snapshot_code, s.manifest
            FROM ab_module_version v
            JOIN ab_snapshot s ON v.active_snapshot_id = s.id
            WHERE v.module_code = ? AND v.version_code = ?
              AND v.is_removed = 0
        `, [moduleCode, versionCode]);

        if (!version) {
            throw new NoActiveSnapshotError(moduleCode, versionCode);
        }

        snapshotInfo = {
            snapshotCode: version.snapshot_code,
            manifest: version.manifest,
        };
    }

    // 写入 L0 缓存
    await redis.setex(l0Key, TTL.L0_SNAPSHOT, JSON.stringify(snapshotInfo));

    return snapshotInfo;
}

// 获取组件元信息（带 L3 缓存）
async function getComponentMeta(
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string
): Promise<ComponentMeta> {
    const l3Key = metaKey('component', `${moduleCode}:${versionCode}:${componentType}:${componentCode}`);

    const cached = await redis.get(l3Key);
    if (cached) {
        return JSON.parse(cached);
    }

    const meta = await db.queryOne(`
        SELECT is_inheritable, is_cacheable
        FROM ab_component
        WHERE module_code = ? AND version_code = ?
          AND component_type = ? AND component_code = ?
          AND is_removed = 0
    `, [moduleCode, versionCode, componentType, componentCode]);

    if (meta) {
        await redis.setex(l3Key, TTL.L3_META, JSON.stringify(meta));
    }

    return meta || { is_inheritable: true, is_cacheable: true };
}

async function loadConfig(ctx: LoadContext): Promise<ConfigContent> {
    // Step 0: 获取激活快照 【新增】
    const snapshot = await getActiveSnapshot(
        ctx.moduleCode,
        ctx.versionCode,
        ctx.tenant
    );

    // Step 1: 获取组件元信息，检查是否启用缓存
    const meta = await getComponentMeta(
        ctx.moduleCode,
        ctx.versionCode,
        ctx.componentType,
        ctx.componentCode
    );

    // 如果组件不启用缓存，直接走数据库查询
    if (!meta.is_cacheable) {
        metrics.increment('cache.bypass');
        return await resolveConfigBySnapshot(ctx, snapshot, meta.is_inheritable);
    }

    // Step 2: 查询 L1 缓存（key 包含快照号）【变更】
    const l1Key = resolvedConfigKey(
        snapshot.snapshotCode,  // 使用快照号
        ctx.tenant,
        ctx.moduleCode,
        ctx.versionCode,
        ctx.componentType,
        ctx.componentCode
    );

    const cached = await redis.get(l1Key);
    if (cached) {
        metrics.increment('cache.l1.hit');
        return JSON.parse(cached);
    }
    metrics.increment('cache.l1.miss');

    // Step 3: 基于快照执行继承查找 【变更】
    const config = await resolveConfigBySnapshot(ctx, snapshot, meta.is_inheritable);

    // Step 4: 写入 L1 缓存
    await redis.setex(l1Key, TTL.L1_RESOLVED, JSON.stringify(config));

    return config;
}

// 【新增】基于快照的配置加载
async function resolveConfigBySnapshot(
    ctx: LoadContext,
    snapshot: SnapshotInfo,
    isInheritable: boolean
): Promise<ConfigContent> {
    const componentKey = `${ctx.componentType}/${ctx.componentCode}`;

    // 1. 从 manifest 获取基准配置信息
    const componentInfo = snapshot.manifest.components[componentKey];
    if (!componentInfo) {
        throw new ComponentNotFoundError(componentKey);
    }

    // 2. 检查热修复覆盖
    const hotfix = snapshot.manifest.hotfix_components?.[componentKey];
    const baseOssKey = hotfix?.publishedOssKey || componentInfo.publishedOssKey;

    // 3. 如果支持继承，按层级查找
    if (isInheritable) {
        // 先查租户层覆盖
        const tenantConfig = await loadRawConfig('tenant', ctx.tenant, ctx);
        if (tenantConfig) return tenantConfig;

        // 再查全局层覆盖
        const globalConfig = await loadRawConfig('global', null, ctx);
        if (globalConfig) return globalConfig;
    }

    // 4. 使用快照中记录的配置
    return await oss.getObject(baseOssKey);
}
```

### 3.2 继承查找流程（使用 L2 缓存）

```typescript
async function resolveConfig(
    ctx: LoadContext,
    isInheritable: boolean = true
): Promise<ConfigContent> {
    // 根据 is_inheritable 决定查找范围
    const scopes: Array<{ scope: string; tenant: string | null }> = isInheritable
        ? [
            { scope: 'tenant', tenant: ctx.tenant },
            { scope: 'global', tenant: null },
            { scope: 'system', tenant: null }
          ]
        : [
            { scope: 'system', tenant: null }  // 仅查 system 层
          ];

    for (const { scope, tenant } of scopes) {
        const config = await loadRawConfig(scope, tenant, ctx);
        if (config) {
            return config;
        }
    }

    throw new ConfigNotFoundError(ctx);
}

// 不走缓存的直接查询（用于 is_cacheable=0 的组件）
async function resolveConfigDirect(
    ctx: LoadContext,
    isInheritable: boolean
): Promise<ConfigContent> {
    const scopes: Array<{ scope: string; tenant: string | null }> = isInheritable
        ? [
            { scope: 'tenant', tenant: ctx.tenant },
            { scope: 'global', tenant: null },
            { scope: 'system', tenant: null }
          ]
        : [
            { scope: 'system', tenant: null }
          ];

    for (const { scope, tenant } of scopes) {
        // 直接查数据库，不经过 L2 缓存
        const configIndex = await db.query(`
            SELECT oss_key FROM ab_config
            WHERE module_code = ?
              AND version_code = ?
              AND component_type = ?
              AND component_code = ?
              AND scope = ?
              AND (scope != 'tenant' OR tenant = ?)
              AND status = 'published'
              AND is_removed = 0
        `, [ctx.moduleCode, ctx.versionCode, ctx.componentType, ctx.componentCode, scope, tenant]);

        if (configIndex) {
            // 从 OSS published 区加载内容
            const content = await oss.getObject(configIndex.oss_key);
            return content;
        }
    }

    throw new ConfigNotFoundError(ctx);
}

async function loadRawConfig(
    scope: string,
    tenant: string | null,
    ctx: LoadContext
): Promise<ConfigContent | null> {
    // Step 1: 查询 L2 缓存
    const l2Key = rawConfigKey(
        scope,
        tenant,
        ctx.moduleCode,
        ctx.versionCode,
        ctx.componentType,
        ctx.componentCode
    );

    const cached = await redis.get(l2Key);
    if (cached) {
        metrics.increment('cache.l2.hit');
        return cached === 'NULL' ? null : JSON.parse(cached);
    }
    metrics.increment('cache.l2.miss');

    // Step 2: 查询数据库获取 OSS Key
    const configIndex = await db.query(`
        SELECT oss_key FROM ab_config
        WHERE module_code = ?
          AND version_code = ?
          AND component_type = ?
          AND component_code = ?
          AND scope = ?
          AND (scope != 'tenant' OR tenant = ?)
          AND status = 'published'
          AND is_removed = 0
    `, [ctx.moduleCode, ctx.versionCode, ctx.componentType, ctx.componentCode, scope, tenant]);

    if (!configIndex) {
        // 缓存空结果，避免缓存穿透
        await redis.setex(l2Key, TTL.L2_RAW_NULL, 'NULL');
        return null;
    }

    // Step 3: 从 OSS 加载内容
    const content = await oss.getObject(configIndex.oss_key);

    // Step 4: 写入 L2 缓存
    await redis.setex(l2Key, TTL.L2_RAW, JSON.stringify(content));

    return content;
}
```

### 3.3 元数据查询（使用 L3 缓存）

```typescript
async function listComponents(
    moduleCode: string,
    versionCode: string,
    category: string
): Promise<Component[]> {
    // Step 1: 查询 L3 缓存
    const l3Key = metaKey('components', `${moduleCode}:${versionCode}:${category}`);

    const cached = await redis.get(l3Key);
    if (cached) {
        metrics.increment('cache.l3.hit');
        return JSON.parse(cached);
    }
    metrics.increment('cache.l3.miss');

    // Step 2: 查询数据库
    const components = await db.query(`
        SELECT component_code, component_name, component_type
        FROM ab_component
        WHERE module_code = ? AND version_code = ? AND category = ?
        AND is_removed = 0 AND is_enable = 1
        ORDER BY sort_code
    `, [moduleCode, versionCode, category]);

    // Step 3: 写入 L3 缓存
    await redis.setex(l3Key, TTL.L3_META, JSON.stringify(components));

    return components;
}
```

---

## 4. 缓存失效策略

### 4.1 失效触发场景

| 事件 | 失效范围 | 说明 |
|-----|---------|------|
| **打包发布（新快照）** | L0 快照缓存 | L1 key 含快照号，自动隔离，无需清除 |
| **快照回滚** | L0 快照缓存 | 同上，L1 自动指向旧快照 |
| **热修复发布** | L0 + L1 该组件 + L2 | 热修复更新快照的 hotfix_components |
| **灰度发布** | L0 灰度租户 | 灰度租户的快照缓存 |
| 发布租户层配置 | L1 该租户 + L2 该租户 | 仅影响该租户（继承覆盖） |
| 新增/删除组件 | L3 组件列表 | 元数据变更 |
| 版本切换 | L0/L1/L2/L3 该模块所有 | 全量失效 |

**快照机制带来的简化：**

| 场景 | 旧方案 | 新方案（快照） |
|-----|--------|--------------|
| 正常发布 | 清除所有 L1 缓存 | 仅清除 L0，L1 自动隔离 |
| 回滚 | 清除所有 L1 缓存 + 恢复 OSS | 仅清除 L0，秒级生效 |
| 灰度 | 无法实现 | 清除灰度租户 L0 即可 |

### 4.2 精准失效实现

```typescript
// 【新增】打包发布时的缓存失效
interface SnapshotPublishEvent {
    moduleCode: string;
    versionCode: string;
    snapshotCode: string;
    affectedTenants?: string[];  // 灰度发布时指定
}

async function invalidateOnSnapshotPublish(event: SnapshotPublishEvent): Promise<void> {
    const keysToDelete: string[] = [];

    if (event.affectedTenants && event.affectedTenants.length > 0) {
        // 灰度发布：仅清除指定租户的 L0 缓存
        for (const tenant of event.affectedTenants) {
            const l0Key = snapshotKey(event.moduleCode, event.versionCode, tenant);
            keysToDelete.push(l0Key);
        }
    } else {
        // 全量发布：清除所有租户的 L0 缓存
        const pattern = `${KEY_PREFIX}:snapshot:${event.moduleCode}:${event.versionCode}:*`;
        const matchedKeys = await scanKeys(pattern);
        keysToDelete.push(...matchedKeys);
    }

    // 批量删除
    if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        metrics.increment('cache.l0.invalidate', keysToDelete.length);
    }

    // 注意：L1 缓存无需清除！
    // 因为 L1 key 包含 snapshotCode，新快照会使用新的 key
}

// 【新增】热修复时的缓存失效
interface HotfixEvent {
    moduleCode: string;
    versionCode: string;
    snapshotCode: string;
    componentType: string;
    componentCode: string;
}

async function invalidateOnHotfix(event: HotfixEvent): Promise<void> {
    const keysToDelete: string[] = [];

    // 1. 清除 L0 快照缓存（manifest 中的 hotfix_components 变了）
    const l0Pattern = `${KEY_PREFIX}:snapshot:${event.moduleCode}:${event.versionCode}:*`;
    const l0Keys = await scanKeys(l0Pattern);
    keysToDelete.push(...l0Keys);

    // 2. 清除该组件的 L1 缓存
    const l1Pattern = `${KEY_PREFIX}:resolved:${event.snapshotCode}:*:${event.moduleCode}:${event.versionCode}:${event.componentType}:${event.componentCode}`;
    const l1Keys = await scanKeys(l1Pattern);
    keysToDelete.push(...l1Keys);

    // 3. 清除 L2 原始配置缓存
    const l2Pattern = `${KEY_PREFIX}:raw:*:${event.moduleCode}:${event.versionCode}:${event.componentType}:${event.componentCode}`;
    const l2Keys = await scanKeys(l2Pattern);
    keysToDelete.push(...l2Keys);

    // 批量删除
    if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        metrics.increment('cache.hotfix.invalidate', keysToDelete.length);
    }
}

// 租户层配置发布（继承覆盖场景）
interface TenantConfigPublishEvent {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;
}

async function invalidateOnTenantConfigPublish(event: TenantConfigPublishEvent): Promise<void> {
    const keysToDelete: string[] = [];

    // 1. 失效 L2 原始配置缓存
    const l2Key = rawConfigKey(
        event.scope,
        event.tenant || null,
        event.moduleCode,
        event.versionCode,
        event.componentType,
        event.componentCode
    );
    keysToDelete.push(l2Key);

    // 2. 失效 L1 已解析配置缓存
    if (event.scope === 'system' || event.scope === 'global') {
        // 系统层/全局层变更，需要失效所有快照下所有租户的 L1 缓存
        const pattern = `${KEY_PREFIX}:resolved:*:*:${event.moduleCode}:${event.versionCode}:${event.componentType}:${event.componentCode}`;
        const matchedKeys = await scanKeys(pattern);
        keysToDelete.push(...matchedKeys);
    } else {
        // 租户层变更，失效该租户在所有快照下的 L1 缓存
        const pattern = `${KEY_PREFIX}:resolved:*:${event.tenant}:${event.moduleCode}:${event.versionCode}:${event.componentType}:${event.componentCode}`;
        const matchedKeys = await scanKeys(pattern);
        keysToDelete.push(...matchedKeys);
    }

    // 3. 批量删除
    if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        metrics.increment('cache.invalidate', keysToDelete.length);
    }
}

// 辅助函数：使用 SCAN 避免阻塞
async function scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
        const [nextCursor, matchedKeys] = await redis.scan(
            cursor,
            'MATCH', pattern,
            'COUNT', 100
        );
        cursor = nextCursor;
        keys.push(...matchedKeys);
    } while (cursor !== '0');

    return keys;
}
```

### 4.3 版本切换全量失效

```typescript
async function invalidateOnVersionSwitch(
    moduleCode: string,
    oldVersionCode: string,
    newVersionCode: string
): Promise<void> {
    // 失效旧版本的所有缓存
    const patterns = [
        `${KEY_PREFIX}:resolved:*:${moduleCode}:${oldVersionCode}:*`,
        `${KEY_PREFIX}:raw:*:${moduleCode}:${oldVersionCode}:*`,
        `${KEY_PREFIX}:meta:*:${moduleCode}:${oldVersionCode}:*`
    ];

    for (const pattern of patterns) {
        const keys = await scanKeys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    }

    // 预热新版本的热点配置（可选）
    await warmupVersion(moduleCode, newVersionCode);
}
```

---

## 5. 缓存预热

### 5.1 预热时机

| 场景 | 预热内容 |
|-----|---------|
| 服务启动 | 热点模块的系统层配置 |
| 版本发布 | 新版本的所有系统层配置 |
| 版本切换 | 目标版本的热点配置 |

### 5.2 预热实现

```typescript
interface WarmupConfig {
    moduleCode: string;
    versionCode: string;
    hotTenants?: string[];  // 热点租户列表
}

async function warmupVersion(
    moduleCode: string,
    versionCode: string,
    hotTenants: string[] = []
): Promise<WarmupReport> {
    const report: WarmupReport = {
        total: 0,
        success: 0,
        failed: 0,
        duration: 0
    };

    const startTime = Date.now();

    // 1. 获取版本下所有组件
    const components = await db.query(`
        SELECT component_type, component_code
        FROM ab_component
        WHERE module_code = ? AND version_code = ?
        AND is_removed = 0 AND is_enable = 1
    `, [moduleCode, versionCode]);

    report.total = components.length * (1 + hotTenants.length);

    // 2. 预热系统层配置
    for (const comp of components) {
        try {
            await loadConfig({
                tenant: '_system',  // 特殊租户标识，用于系统层
                moduleCode,
                versionCode,
                componentType: comp.component_type,
                componentCode: comp.component_code
            });
            report.success++;
        } catch {
            report.failed++;
        }
    }

    // 3. 预热热点租户配置
    for (const tenant of hotTenants) {
        for (const comp of components) {
            try {
                await loadConfig({
                    tenant,
                    moduleCode,
                    versionCode,
                    componentType: comp.component_type,
                    componentCode: comp.component_code
                });
                report.success++;
            } catch {
                report.failed++;
            }
        }
    }

    report.duration = Date.now() - startTime;
    return report;
}
```

### 5.3 启动预热

```typescript
async function warmupOnStartup(): Promise<void> {
    // 从配置获取需要预热的模块
    const hotModules = config.get<WarmupConfig[]>('cache.warmup.modules', []);

    for (const module of hotModules) {
        const report = await warmupVersion(
            module.moduleCode,
            module.versionCode,
            module.hotTenants
        );

        logger.info('Cache warmup completed', {
            module: module.moduleCode,
            version: module.versionCode,
            ...report
        });
    }
}
```

---

## 6. 缓存穿透/击穿/雪崩防护

### 6.1 缓存穿透防护

**问题**: 查询不存在的配置，每次都穿透到数据库

**解决**: 缓存空结果

```typescript
// 在 loadRawConfig 中已实现
if (!configIndex) {
    // 缓存空结果，TTL 较短
    await redis.setex(l2Key, TTL.L2_RAW_NULL, 'NULL');
    return null;
}

// TTL 配置
const TTL = {
    L0_SNAPSHOT: 600,       // 10分钟（快照缓存）
    L1_RESOLVED: 3600,      // 1小时
    L2_RAW: 1800,           // 30分钟
    L2_RAW_NULL: 300,       // 5分钟（空结果）
    L3_META: 600            // 10分钟
};
```

### 6.2 缓存击穿防护

**问题**: 热点 key 过期瞬间，大量请求同时查库

**解决**: 分布式锁 + 双重检查

```typescript
async function loadConfigWithLock(ctx: LoadContext): Promise<ConfigContent> {
    const l1Key = resolvedConfigKey(
        ctx.tenant,
        ctx.moduleCode,
        ctx.versionCode,
        ctx.componentType,
        ctx.componentCode
    );

    // 第一次检查缓存
    let cached = await redis.get(l1Key);
    if (cached) {
        return JSON.parse(cached);
    }

    // 获取分布式锁
    const lockKey = `${l1Key}:lock`;
    const lockValue = generateLockValue();
    const acquired = await redis.set(lockKey, lockValue, 'NX', 'EX', 10);

    if (!acquired) {
        // 未获取到锁，等待后重试
        await sleep(50);
        cached = await redis.get(l1Key);
        if (cached) {
            return JSON.parse(cached);
        }
        // 仍然没有，直接查询（降级）
    }

    try {
        // 第二次检查缓存（双重检查）
        cached = await redis.get(l1Key);
        if (cached) {
            return JSON.parse(cached);
        }

        // 执行查询
        const config = await resolveConfig(ctx);

        // 写入缓存
        await redis.setex(l1Key, TTL.L1_RESOLVED, JSON.stringify(config));

        return config;
    } finally {
        // 释放锁
        await releaseLock(lockKey, lockValue);
    }
}

async function releaseLock(key: string, value: string): Promise<void> {
    // 使用 Lua 脚本保证原子性
    const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `;
    await redis.eval(script, 1, key, value);
}
```

### 6.3 缓存雪崩防护

**问题**: 大量 key 同时过期，瞬间压垮数据库

**解决**: TTL 随机化 + 预热

```typescript
// TTL 随机化
function randomizedTTL(baseTTL: number): number {
    // 在基础 TTL 上增加 0-20% 的随机偏移
    const jitter = Math.random() * 0.2;
    return Math.floor(baseTTL * (1 + jitter));
}

// 使用随机化 TTL
await redis.setex(l1Key, randomizedTTL(TTL.L1_RESOLVED), JSON.stringify(config));
```

---

## 7. 降级与容错

### 7.1 Redis 不可用时降级

```typescript
class CacheClient {
    private redis: Redis;
    private isHealthy: boolean = true;
    private lastHealthCheck: number = 0;

    async get(key: string): Promise<string | null> {
        if (!this.isHealthy) {
            // Redis 不健康，跳过缓存
            if (Date.now() - this.lastHealthCheck > 5000) {
                // 每 5 秒重试一次
                await this.healthCheck();
            }
            return null;
        }

        try {
            return await this.redis.get(key);
        } catch (error) {
            this.isHealthy = false;
            this.lastHealthCheck = Date.now();
            metrics.increment('cache.error');
            logger.error('Redis get failed', { key, error });
            return null;
        }
    }

    async setex(key: string, ttl: number, value: string): Promise<void> {
        if (!this.isHealthy) {
            return;  // 静默失败
        }

        try {
            await this.redis.setex(key, ttl, value);
        } catch (error) {
            this.isHealthy = false;
            this.lastHealthCheck = Date.now();
            metrics.increment('cache.error');
            logger.error('Redis setex failed', { key, error });
        }
    }

    private async healthCheck(): Promise<void> {
        try {
            await this.redis.ping();
            this.isHealthy = true;
            logger.info('Redis connection restored');
        } catch {
            this.isHealthy = false;
        }
        this.lastHealthCheck = Date.now();
    }
}
```

### 7.2 本地缓存兜底

```typescript
import LRU from 'lru-cache';

class HybridCache {
    private redis: CacheClient;
    private local: LRU<string, string>;

    constructor() {
        this.redis = new CacheClient();
        this.local = new LRU({
            max: 1000,                    // 最多缓存 1000 个 key
            ttl: 60 * 1000,              // 本地缓存 1 分钟
            updateAgeOnGet: true
        });
    }

    async get(key: string): Promise<string | null> {
        // 1. 先查本地缓存
        const localValue = this.local.get(key);
        if (localValue) {
            metrics.increment('cache.local.hit');
            return localValue;
        }

        // 2. 查 Redis
        const redisValue = await this.redis.get(key);
        if (redisValue) {
            // 回填本地缓存
            this.local.set(key, redisValue);
            return redisValue;
        }

        return null;
    }

    async setex(key: string, ttl: number, value: string): Promise<void> {
        // 同时写入 Redis 和本地
        this.local.set(key, value);
        await this.redis.setex(key, ttl, value);
    }

    async del(...keys: string[]): Promise<void> {
        // 同时删除 Redis 和本地
        for (const key of keys) {
            this.local.delete(key);
        }
        await this.redis.del(...keys);
    }
}
```

---

## 8. 监控指标

### 8.1 核心指标

| 指标 | 说明 | 告警阈值 |
|-----|------|---------|
| cache.l0.hit_rate | L0 快照缓存命中率 | < 90% |
| cache.l1.hit_rate | L1 命中率 | < 95% |
| cache.l2.hit_rate | L2 命中率 | < 80% |
| cache.latency.p99 | 缓存操作 P99 延迟 | > 50ms |
| cache.error.rate | 缓存错误率 | > 1% |
| cache.memory.usage | Redis 内存使用率 | > 80% |
| cache.keys.count | 缓存 key 数量 | 仅监控 |
| cache.bypass | 缓存绕过次数（is_cacheable=0） | 仅监控 |
| cache.l0.invalidate | L0 快照缓存失效次数 | 仅监控 |
| cache.hotfix.invalidate | 热修复缓存失效次数 | > 5次/天 |

### 8.2 监控实现

```typescript
class CacheMetrics {
    private hits = { l0: 0, l1: 0, l2: 0, l3: 0 };
    private misses = { l0: 0, l1: 0, l2: 0, l3: 0 };
    private bypasses = 0;  // is_cacheable=0 导致的缓存绕过
    private invalidations = { l0: 0, hotfix: 0 };  // 快照相关失效

    hit(level: 'l0' | 'l1' | 'l2' | 'l3'): void {
        this.hits[level]++;
    }

    miss(level: 'l0' | 'l1' | 'l2' | 'l3'): void {
        this.misses[level]++;
    }

    bypass(): void {
        this.bypasses++;
    }

    invalidate(type: 'l0' | 'hotfix'): void {
        this.invalidations[type]++;
    }

    getHitRate(level: 'l0' | 'l1' | 'l2' | 'l3'): number {
        const total = this.hits[level] + this.misses[level];
        return total === 0 ? 1 : this.hits[level] / total;
    }

    async collectAndReport(): Promise<void> {
        // 收集 Redis 信息
        const info = await redis.info('memory');
        const usedMemory = parseInfoValue(info, 'used_memory');
        const maxMemory = parseInfoValue(info, 'maxmemory');

        // 上报指标
        await prometheus.gauge('cache_hit_rate', {
            level: 'l1',
            value: this.getHitRate('l1')
        });

        await prometheus.gauge('cache_memory_usage', {
            value: usedMemory / maxMemory
        });

        await prometheus.counter('cache_bypass_total', {
            value: this.bypasses
        });

        // 重置计数器
        this.hits = { l1: 0, l2: 0, l3: 0 };
        this.misses = { l1: 0, l2: 0, l3: 0 };
        this.bypasses = 0;
    }
}
```

---

## 9. 内存管理

### 9.1 内存预估

```
单个配置大小估算:
- 小型配置 (filter): ~2KB
- 中型配置 (form/table): ~10KB
- 大型配置 (page): ~50KB
- 平均: ~15KB

内存占用预估 (中型规模):
- 组件数: 7,500
- 租户数: 100
- L1 缓存: 7,500 × 100 × 15KB = 11.25GB (理论最大值)
- 实际热点比例: ~10%
- 实际占用: ~1.1GB
```

### 9.2 内存控制策略

```yaml
# Redis 配置
maxmemory: 4gb
maxmemory-policy: allkeys-lru

# 应用层配置
cache:
  l1:
    maxKeys: 100000
    ttl: 3600
  l2:
    maxKeys: 50000
    ttl: 1800
  l3:
    maxKeys: 10000
    ttl: 600
```

### 9.3 大 Value 处理

```typescript
const MAX_CACHE_SIZE = 512 * 1024;  // 512KB

async function setWithSizeCheck(
    key: string,
    value: string,
    ttl: number
): Promise<void> {
    if (value.length > MAX_CACHE_SIZE) {
        // 大 Value 不缓存，记录日志
        logger.warn('Value too large for cache', {
            key,
            size: value.length,
            limit: MAX_CACHE_SIZE
        });
        return;
    }

    await redis.setex(key, ttl, value);
}
```

---

## 10. 配置项

```yaml
# config/cache.yaml

cache:
  # Redis 连接配置
  redis:
    host: "redis.example.com"
    port: 6379
    password: "${REDIS_PASSWORD}"
    db: 0
    cluster: false

  # TTL 配置（秒）
  ttl:
    l1Resolved: 3600      # 1小时
    l2Raw: 1800           # 30分钟
    l2RawNull: 300        # 5分钟
    l3Meta: 600           # 10分钟

  # 预热配置
  warmup:
    enabled: true
    onStartup: true
    modules:
      - moduleCode: "order"
        versionCode: "V1"
        hotTenants: ["T001", "T002"]

  # 本地缓存配置
  local:
    enabled: true
    maxSize: 1000
    ttl: 60000            # 1分钟

  # 监控配置
  monitoring:
    reportIntervalMs: 60000
    hitRateAlertThreshold: 0.95
```

---

## 11. 相关文档

- [存储层概览](./overview.md)
- [快照管理详细设计](./snapshot-management.md)
- [配置继承与合并](./overview.md#6-配置设计)
- [版本管理详细设计](./version-management.md)
