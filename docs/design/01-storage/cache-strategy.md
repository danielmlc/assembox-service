# 缓存策略详细设计

> **状态**: 设计中
> **更新日期**: 2025-01-22

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

### 2.1 三层缓存结构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Redis 缓存                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  L1: 已解析配置缓存 (Resolved Config)                                        │
│      存储租户实际使用的配置（已完成继承查找）                                    │
│      Key: assembox:resolved:{tenant}:{module}:{version}:{type}:{code}       │
│      TTL: 1 小时                                                            │
│      场景: 运行时渲染器直接使用                                               │
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

### 2.2 缓存 Key 设计规范

```typescript
// Key 前缀
const KEY_PREFIX = 'assembox';

// L1: 已解析配置
function resolvedConfigKey(
    tenant: string,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string
): string {
    return `${KEY_PREFIX}:resolved:${tenant}:${moduleCode}:${versionCode}:${componentType}:${componentCode}`;
}
// 示例: assembox:resolved:T001:order:V1:table:order_table

// L2: 原始配置
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

### 2.3 TTL 策略

| 缓存层 | TTL | 说明 |
|-------|-----|------|
| L1 已解析配置 | 1 小时 | 高频读取，主动失效为主 |
| L2 原始配置 | 30 分钟 | 中频读取，辅助继承查找 |
| L3 元数据 | 10 分钟 | 低频变更，短 TTL 保证新鲜 |

---

## 3. 缓存读取流程

### 3.1 配置读取完整流程

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
    // Step 0: 获取组件元信息，检查是否启用缓存
    const meta = await getComponentMeta(
        ctx.moduleCode,
        ctx.versionCode,
        ctx.componentType,
        ctx.componentCode
    );

    // 如果组件不启用缓存，直接走数据库查询
    if (!meta.is_cacheable) {
        metrics.increment('cache.bypass');
        return await resolveConfigDirect(ctx, meta.is_inheritable);
    }

    // Step 1: 查询 L1 缓存（已解析配置）
    const l1Key = resolvedConfigKey(
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

    // Step 2: 执行继承查找
    const config = await resolveConfig(ctx, meta.is_inheritable);

    // Step 3: 写入 L1 缓存
    await redis.setex(l1Key, TTL.L1_RESOLVED, JSON.stringify(config));

    return config;
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
| 发布系统层配置 | L1 所有租户 + L2 system | 影响所有租户 |
| 发布全局层配置 | L1 所有租户 + L2 global | 影响未覆盖的租户 |
| 发布租户层配置 | L1 该租户 + L2 该租户 | 仅影响该租户 |
| 新增/删除组件 | L3 组件列表 | 元数据变更 |
| 版本切换 | L1/L2/L3 该模块所有 | 全量失效 |

### 4.2 精准失效实现

```typescript
interface PublishEvent {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;
}

async function invalidateOnPublish(event: PublishEvent): Promise<void> {
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
        // 系统层/全局层变更，需要失效所有租户的 L1 缓存
        // 使用 SCAN 找到匹配的 keys
        const pattern = `${KEY_PREFIX}:resolved:*:${event.moduleCode}:${event.versionCode}:${event.componentType}:${event.componentCode}`;
        const matchedKeys = await scanKeys(pattern);
        keysToDelete.push(...matchedKeys);
    } else {
        // 租户层变更，仅失效该租户的 L1 缓存
        const l1Key = resolvedConfigKey(
            event.tenant!,
            event.moduleCode,
            event.versionCode,
            event.componentType,
            event.componentCode
        );
        keysToDelete.push(l1Key);
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
| cache.l1.hit_rate | L1 命中率 | < 95% |
| cache.l2.hit_rate | L2 命中率 | < 80% |
| cache.latency.p99 | 缓存操作 P99 延迟 | > 50ms |
| cache.error.rate | 缓存错误率 | > 1% |
| cache.memory.usage | Redis 内存使用率 | > 80% |
| cache.keys.count | 缓存 key 数量 | 仅监控 |
| cache.bypass | 缓存绕过次数（is_cacheable=0） | 仅监控 |

### 8.2 监控实现

```typescript
class CacheMetrics {
    private hits = { l1: 0, l2: 0, l3: 0 };
    private misses = { l1: 0, l2: 0, l3: 0 };
    private bypasses = 0;  // is_cacheable=0 导致的缓存绕过

    hit(level: 'l1' | 'l2' | 'l3'): void {
        this.hits[level]++;
    }

    miss(level: 'l1' | 'l2' | 'l3'): void {
        this.misses[level]++;
    }

    bypass(): void {
        this.bypasses++;
    }

    getHitRate(level: 'l1' | 'l2' | 'l3'): number {
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
- [配置继承与合并](./overview.md#5-配置继承与合并)
- [Gitea 版本管理](./gitea-version.md)
