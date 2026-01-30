# OSS 操作规范

> **状态**: 设计中
> **更新日期**: 2025-01-30

---

## 1. 概述

### 1.1 OSS 定位

在 Assembox 存储架构中，OSS（对象存储服务）负责存储**配置内容**。数据库（TiDB）存储索引和元数据，OSS 存储实际的 JSON 配置文件。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              存储分工                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TiDB (索引层)                        OSS (内容层)                           │
│  ┌─────────────────────┐             ┌─────────────────────┐               │
│  │ • 模块/版本/组件元数据 │             │ • 配置 JSON 内容      │               │
│  │ • 配置索引 (oss_key) │  ────────▶  │ • 历史版本内容        │               │
│  │ • 发布状态           │             │ • 大文件存储          │               │
│  └─────────────────────┘             └─────────────────────┘               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 设计目标

| 目标 | 指标 |
|-----|------|
| 读取延迟 | < 100ms (P99) |
| 写入延迟 | < 200ms (P99) |
| 可用性 | 99.99% |
| 数据可靠性 | 99.999999999% |

### 1.3 核心原则

1. **幂等写入** - 相同内容写入相同路径，结果一致
2. **原子操作** - 单个对象操作保证原子性
3. **最终一致** - 批量操作采用最终一致性模型
4. **错误重试** - 关键操作自动重试

---

## 2. 存储路径规范

### 2.1 路径结构

> **核心设计**: 草稿和发布内容分离存储，运行时只读取 `published/` 路径

```
assembox/
│
├── draft/                                # 草稿区（设计器编辑用）
│   └── {module_code}/
│       └── {version_code}/
│           └── {component_type}/
│               └── {component_code}/
│                   ├── _system.json
│                   ├── _global.json
│                   └── _tenant_{code}.json
│
└── published/                            # 发布区（运行时读取）
    └── {module_code}/
        └── {version_code}/
            └── {component_type}/
                └── {component_code}/
                    ├── _system.json      # 系统层配置
                    ├── _global.json      # 全局层配置
                    └── _tenant_{code}.json # 租户层配置
```

**路径用途说明：**

| 路径 | 用途 | 读写方 |
|-----|------|-------|
| `draft/` | 草稿编辑 | 设计器读写 |
| `published/` | 运行时配置 | 运行时只读，发布时写入 |

### 2.2 路径生成规则

```typescript
type OssArea = 'draft' | 'published';

function generateConfigKey(params: {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;
}, area: OssArea): string {
    const { moduleCode, versionCode, componentType, componentCode, scope, tenant } = params;

    const scopeSuffix = scope === 'system'
        ? '_system'
        : scope === 'global'
            ? '_global'
            : `_tenant_${tenant}`;

    return `assembox/${area}/${moduleCode}/${versionCode}/${componentType}/${componentCode}/${scopeSuffix}.json`;
}

// 草稿路径示例 (设计器使用):
// assembox/draft/order/V1/model/order_model/_system.json
// assembox/draft/order/V1/table/order_table/_global.json

// 发布路径示例 (运行时使用):
// assembox/published/order/V1/model/order_model/_system.json
// assembox/published/order/V1/table/order_table/_global.json
// assembox/published/order/V1/form/order_form/_tenant_T001.json
```

### 2.3 组件目录前缀

```typescript
// 用于列举某个组件的所有层级配置
function generateComponentPrefix(params: {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
}, area: OssArea): string {
    const { moduleCode, versionCode, componentType, componentCode } = params;
    return `assembox/${area}/${moduleCode}/${versionCode}/${componentType}/${componentCode}/`;
}

// 运行时列举结果示例 (area='published'):
// - assembox/published/order/V1/table/order_table/_system.json
// - assembox/published/order/V1/table/order_table/_global.json
// - assembox/published/order/V1/table/order_table/_tenant_T001.json
// - assembox/published/order/V1/table/order_table/_tenant_T002.json

// 设计器列举结果示例 (area='draft'):
// - assembox/draft/order/V1/table/order_table/_system.json
```

---

## 3. OSS 客户端接口

### 3.1 核心接口定义

```typescript
export interface OssClient {
    /** 上传对象 */
    putObject(key: string, content: Buffer | string, options?: PutOptions): Promise<PutResult>;

    /** 获取对象 */
    getObject(key: string): Promise<Buffer>;

    /** 获取对象（字符串） */
    getObjectAsString(key: string): Promise<string>;

    /** 检查对象是否存在 */
    headObject(key: string): Promise<ObjectMeta | null>;

    /** 删除对象 */
    deleteObject(key: string): Promise<void>;

    /** 批量删除对象 */
    deleteObjects(keys: string[]): Promise<DeleteResult>;

    /** 列举对象 */
    listObjects(prefix: string, options?: ListOptions): Promise<ListResult>;

    /** 复制对象 */
    copyObject(sourceKey: string, targetKey: string): Promise<void>;
}

interface PutOptions {
    contentType?: string;
    metadata?: Record<string, string>;
}

interface PutResult {
    etag: string;
    versionId?: string;
}

interface ObjectMeta {
    size: number;
    lastModified: Date;
    etag: string;
    contentType: string;
    metadata: Record<string, string>;
}
```

---

## 4. 配置读写服务

### 4.1 保存草稿配置

```typescript
/**
 * 保存草稿配置（设计器调用）
 * 草稿保存到 draft/ 路径
 */
async function saveDraftConfig(params: {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;
    content: object;
}): Promise<SaveResult> {
    // 草稿保存到 draft 路径
    const ossKey = generateConfigKey(params, 'draft');
    const jsonContent = JSON.stringify(params.content, null, 2);
    const contentHash = md5(jsonContent);
    const contentSize = Buffer.byteLength(jsonContent, 'utf-8');

    // 幂等性检查：内容未变化则跳过
    const existingMeta = await ossClient.headObject(ossKey);
    if (existingMeta?.metadata?.['x-content-hash'] === contentHash) {
        return { ossKey, contentHash, contentSize, skipped: true };
    }

    // 上传到 OSS draft 路径
    await ossClient.putObject(ossKey, jsonContent, {
        contentType: 'application/json',
        metadata: { 'x-content-hash': contentHash }
    });

    return { ossKey, contentHash, contentSize, skipped: false };
}

/**
 * 发布配置
 * 将 draft/ 内容复制到 published/ 路径
 */
async function publishConfig(params: {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;
}): Promise<PublishResult> {
    const draftKey = generateConfigKey(params, 'draft');
    const publishedKey = generateConfigKey(params, 'published');

    // 检查草稿是否存在
    const draftMeta = await ossClient.headObject(draftKey);
    if (!draftMeta) {
        throw new Error('Draft not found');
    }

    // 复制草稿到发布路径
    await ossClient.copyObject(draftKey, publishedKey);

    return {
        draftKey,
        publishedKey,
        contentHash: draftMeta.metadata?.['x-content-hash'],
        contentSize: draftMeta.size
    };
}
```

### 4.2 加载配置

```typescript
async function loadConfig(ossKey: string): Promise<object> {
    const jsonString = await ossClient.getObjectAsString(ossKey);
    return JSON.parse(jsonString);
}

/**
 * 加载草稿配置（设计器用）
 */
async function loadDraftConfig(params: {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;
}): Promise<object | null> {
    const ossKey = generateConfigKey(params, 'draft');
    try {
        return await loadConfig(ossKey);
    } catch (error) {
        if (error.code === 'NOT_FOUND') return null;
        throw error;
    }
}

/**
 * 加载已发布配置（运行时用）
 */
async function loadPublishedConfig(params: {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;
}): Promise<object | null> {
    const ossKey = generateConfigKey(params, 'published');
    try {
        return await loadConfig(ossKey);
    } catch (error) {
        if (error.code === 'NOT_FOUND') return null;
        throw error;
    }
}

/**
 * 批量加载组件所有层级配置（运行时用）
 * 只加载 published 路径
 */
async function loadComponentConfigs(params: {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
}): Promise<ComponentConfigs> {
    // 只查询 published 路径
    const prefix = generateComponentPrefix(params, 'published');
    const listResult = await ossClient.listObjects(prefix);

    const configs: ComponentConfigs = {
        system: null,
        global: null,
        tenants: new Map()
    };

    // 并行加载所有配置
    await Promise.all(listResult.objects.map(async (obj) => {
        const content = await loadConfig(obj.key);
        const keyInfo = parseConfigKey(obj.key);

        if (keyInfo?.scope === 'system') configs.system = content;
        else if (keyInfo?.scope === 'global') configs.global = content;
        else if (keyInfo?.scope === 'tenant') configs.tenants.set(keyInfo.tenant!, content);
    }));

    return configs;
}
```

### 4.3 版本回滚

> **说明**: 历史版本存储在 Git 中（异步同步），回滚时从 Git 恢复到 OSS published 路径

```typescript
/**
 * 从 Git 历史版本恢复到 OSS
 * 用于版本回滚场景
 */
async function restoreFromGitHistory(params: {
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    scope: 'system' | 'global' | 'tenant';
    tenant?: string;
    targetPublishVersion: number;
}): Promise<void> {
    // 1. 从 Git 获取历史版本内容
    const gitContent = await gitService.getFileAtVersion(
        params.moduleCode,
        params.versionCode,
        params.componentType,
        params.componentCode,
        params.scope,
        params.tenant,
        params.targetPublishVersion
    );

    if (!gitContent) {
        throw new Error(`Version v${params.targetPublishVersion} not found in Git`);
    }

    // 2. 写入到 OSS published 路径
    const publishedKey = generateConfigKey(params, 'published');
    await ossClient.putObject(publishedKey, gitContent, {
        contentType: 'application/json',
        metadata: { 'x-content-hash': md5(gitContent) }
    });

    // 3. 同时更新 draft 路径（保持一致）
    const draftKey = generateConfigKey(params, 'draft');
    await ossClient.putObject(draftKey, gitContent, {
        contentType: 'application/json',
        metadata: { 'x-content-hash': md5(gitContent) }
    });
}
```

---

## 5. 错误处理与重试

### 5.1 错误类型

```typescript
enum OssErrorCode {
    NOT_FOUND = 'NOT_FOUND',           // 对象不存在
    ACCESS_DENIED = 'ACCESS_DENIED',   // 访问被拒绝
    TIMEOUT = 'TIMEOUT',               // 请求超时
    NETWORK_ERROR = 'NETWORK_ERROR',   // 网络错误
    SERVER_ERROR = 'SERVER_ERROR',     // 服务端错误
    THROTTLED = 'THROTTLED',           // 请求限流
    UNKNOWN = 'UNKNOWN'                // 未知错误
}

class OssError extends Error {
    constructor(
        public code: OssErrorCode,
        message: string,
        public originalError?: Error
    ) {
        super(message);
    }

    get retryable(): boolean {
        return [OssErrorCode.TIMEOUT, OssErrorCode.NETWORK_ERROR, 
                OssErrorCode.SERVER_ERROR, OssErrorCode.THROTTLED].includes(this.code);
    }
}
```

### 5.2 重试策略

```typescript
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitter: true
};

async function withRetry<T>(
    operation: () => Promise<T>,
    config = DEFAULT_RETRY_CONFIG
): Promise<T> {
    let lastError: OssError | null = null;
    let delay = config.initialDelayMs;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = convertToOssError(error);
            
            if (!lastError.retryable || attempt >= config.maxRetries) {
                throw lastError;
            }

            await sleep(delay);
            delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
            if (config.jitter) delay *= (0.5 + Math.random());
        }
    }
    throw lastError;
}
```

---

## 6. 批量操作

### 6.1 批量上传

```typescript
async function batchSave(
    configs: SaveConfigParams[],
    concurrency: number = 10
): Promise<BatchSaveResult> {
    const limit = pLimit(concurrency);
    const results: SaveResult[] = [];
    const errors: Array<{ params: SaveConfigParams; error: Error }> = [];

    await Promise.all(configs.map(params => 
        limit(async () => {
            try {
                results.push(await saveConfig(params));
            } catch (error) {
                errors.push({ params, error: error as Error });
            }
        })
    ));

    return { results, errors };
}
```

### 6.2 批量导出

```typescript
async function exportModule(params: {
    moduleCode: string;
    versionCode: string;
    outputDir: string;
    area?: OssArea;  // 默认 'published'
    scopes?: ('system' | 'global' | 'tenant')[];
}): Promise<ExportResult> {
    const area = params.area || 'published';
    const prefix = `assembox/${area}/${params.moduleCode}/${params.versionCode}/`;
    const allObjects = await listAllObjects(prefix);

    let success = 0, failed = 0;
    for (const obj of allObjects) {
        try {
            const content = await ossClient.getObjectAsString(obj.key);
            // 导出时去掉 area 前缀，保持目录结构干净
            const relativePath = obj.key.replace(`assembox/${area}/`, '');
            const localPath = buildLocalPath(params.outputDir, relativePath);
            await fs.writeFile(localPath, content);
            success++;
        } catch {
            failed++;
        }
    }

    return { total: allObjects.length, success, failed };
}
```

---

## 7. 大文件处理

### 7.1 配置大小限制

| 组件类型 | 最大大小 |
|---------|--------|
| model | 1MB |
| logic | 512KB |
| api | 256KB |
| page | 512KB |
| table | 256KB |
| form | 256KB |
| filter | 128KB |
| export | 512KB |
| 默认 | 1MB |

### 7.2 分片上传

```typescript
// 超过 5MB 使用分片上传
async function uploadLargeFile(key: string, content: Buffer): Promise<void> {
    const partSize = 5 * 1024 * 1024; // 5MB
    
    if (content.length < partSize) {
        await ossClient.putObject(key, content);
        return;
    }

    const { uploadId } = await ossClient.initMultipartUpload(key);
    const parts = [];
    
    try {
        for (let i = 0; i * partSize < content.length; i++) {
            const part = content.slice(i * partSize, (i + 1) * partSize);
            const result = await ossClient.uploadPart(key, uploadId, i + 1, part);
            parts.push({ number: i + 1, etag: result.etag });
        }
        await ossClient.completeMultipartUpload(key, uploadId, parts);
    } catch (error) {
        await ossClient.abortMultipartUpload(key, uploadId);
        throw error;
    }
}
```

---

## 8. 监控指标

| 指标 | 说明 | 告警阈值 |
|-----|------|---------| 
| oss.request.latency | 请求延迟 | P99 > 500ms |
| oss.request.error_rate | 错误率 | > 1% |
| oss.retry.count | 重试次数 | 重试率 > 5% |
| oss.upload.size | 上传大小 | 仅监控 |

---

## 9. 设计决策记录

| 问题 | 决策 | 说明 |
|-----|------|------|
| 路径结构 | draft/published 分离 | 草稿和发布内容隔离，运行时只读 published |
| scope 位置 | scope 放末尾 | 便于前缀匹配列举所有层级 |
| 文件命名 | 下划线前缀 | `_system.json`, `_global.json` |
| 内容哈希 | MD5 存元数据 | 用于幂等写入检测 |
| 历史版本 | Git 存储 | 发布时异步同步到 Git，回滚从 Git 恢复 |
| 重试策略 | 指数退避 + 抖动 | 避免请求风暴 |

---

## 10. 相关文档

| 文档 | 说明 |
|-----|------|
| [存储层总体设计](./overview.md) | 存储层架构总览 |
| [配置详细设计](./config-detail.md) | 配置结构和继承规则 |
| [缓存策略详细设计](./cache-strategy.md) | 缓存读写和失效策略 |
