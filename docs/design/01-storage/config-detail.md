# 配置详细设计

> **状态**: 设计中
> **更新日期**: 2025-01-30

---

## 1. 概述

### 1.1 配置定位

在 Assembox 中，**配置**是驱动低代码平台运行的核心数据。配置定义了数据模型、业务逻辑、页面布局等所有可定制内容。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              配置的作用                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  设计器 ──▶ 配置 ──▶ 运行时引擎 ──▶ 用户界面                                  │
│                                                                             │
│  配置是设计器的输出，是运行时引擎的输入                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 设计目标

| 目标 | 说明 |
|-----|------|
| 层级继承 | 支持 system → global → tenant 三级继承（可通过 `is_inheritable` 控制） |
| 缓存控制 | 支持按组件配置是否缓存（通过 `is_cacheable` 控制） |
| 类型安全 | 每种配置类型有明确的 Schema 定义 |
| 版本隔离 | 不同版本的配置完全隔离 |
| 草稿隔离 | 草稿和已发布配置分离存储，运行时只读已发布配置 |
| 快速读取 | 运行时高效加载配置 |

### 1.3 核心原则

1. **组件是最小继承单元** - 继承以完整组件为单位，不做字段级合并
2. **优先级覆盖** - tenant > global > system，找到即返回
3. **版本内分层** - 继承层级在版本内部划分
4. **索引与内容分离** - TiDB 存索引，OSS 存内容
5. **草稿与发布分离** - OSS 使用 `draft/` 和 `published/` 路径隔离
6. **组件特性控制** - 通过 `is_inheritable` 和 `is_cacheable` 控制组件行为

---

## 2. 配置层级体系

### 2.1 三层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              配置层级                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                       │
│  │   租户层        │  优先级最高，针对特定租户的定制配置                       │
│  │   (tenant)      │  存储：OSS _tenant_{code}.json                        │
│  └────────┬────────┘                                                       │
│           │ 如果租户层没有，则查找全局层                                      │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │   全局层        │  中间优先级，所有租户共享的扩展配置                       │
│  │   (global)      │  存储：OSS _global.json                               │
│  └────────┬────────┘                                                       │
│           │ 如果全局层没有，则查找系统层                                      │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │   系统层        │  最低优先级，系统预置的基础配置                          │
│  │   (system)      │  存储：OSS _system.json                               │
│  └─────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 层级用途

| 层级 | scope | 用途 | 可修改者 |
|-----|-------|------|---------|
| 系统层 | system | 系统预置的基础配置 | 平台开发者 |
| 全局层 | global | 所有租户共享的扩展配置 | 实施顾问 |
| 租户层 | tenant | 特定租户的定制配置 | 租户管理员 |

### 2.3 继承规则

**核心规则：以组件为单位继承，受 `is_inheritable` 属性控制**

```typescript
interface ComponentMeta {
    isInheritable: boolean;
    isCacheable: boolean;
}

// 继承查找算法
async function resolveConfig(ctx: {
    tenant: string;
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
}): Promise<ConfigContent> {
    // 1. 获取组件元信息
    const meta = await getComponentMeta(ctx);

    // 2. 根据 is_inheritable 决定查找范围
    if (!meta.isInheritable) {
        // 不支持继承，只查 system 层
        const systemConfig = await loadFromScope('system', null, ctx);
        if (systemConfig) return systemConfig;
        throw new Error(`Config not found: ${ctx.componentType}/${ctx.componentCode}`);
    }

    // 3. 支持继承，按优先级查找 (tenant > global > system)
    const tenantConfig = await loadFromScope('tenant', ctx.tenant, ctx);
    if (tenantConfig) return tenantConfig;

    const globalConfig = await loadFromScope('global', null, ctx);
    if (globalConfig) return globalConfig;

    const systemConfig = await loadFromScope('system', null, ctx);
    if (systemConfig) return systemConfig;

    throw new Error(`Config not found: ${ctx.componentType}/${ctx.componentCode}`);
}
```

### 2.4 继承场景示例

```
场景：租户 T001 请求 order 模块 V1 版本的 order_table 表格配置

数据库中的配置记录:
┌──────────────┬───────────────┬─────────┬────────┐
│ comp_type    │ comp_code     │ scope   │ tenant │
├──────────────┼───────────────┼─────────┼────────┤
│ table        │ order_table   │ system  │ NULL   │  ← 系统层基础配置
│ table        │ order_table   │ global  │ NULL   │  ← 全局层覆盖
│ table        │ order_table   │ tenant  │ T001   │  ← T001租户覆盖
│ table        │ order_table   │ tenant  │ T002   │  ← T002租户覆盖
└──────────────┴───────────────┴─────────┴────────┘

T001 查找流程:
1. 查找 scope=tenant, tenant=T001 → 找到 → 返回T001配置 ✓

T003 查找流程（无租户配置）:
1. 查找 scope=tenant, tenant=T003 → 未找到
2. 查找 scope=global → 找到 → 返回全局配置 ✓

新租户 T999 查找流程（无租户和全局配置的组件）:
1. 查找 scope=tenant, tenant=T999 → 未找到
2. 查找 scope=global → 未找到
3. 查找 scope=system → 找到 → 返回系统配置 ✓
```

---

## 3. 配置结构定义

### 3.1 通用配置头

所有配置都包含以下通用字段：

```typescript
interface ConfigBase {
    /** Schema 版本标识 */
    $schema: string;
    
    /** 组件代码 */
    componentCode: string;
    
    /** 组件名称 */
    componentName: string;
    
    /** 组件描述 */
    description?: string;
}
```

### 3.2 数据模型配置 (model)

```json
{
    "$schema": "assembox/model/v1",
    "componentCode": "order_model",
    "componentName": "订单数据模型",
    "description": "订单模块的数据模型定义",
    "entities": {
        "order_main": {
            "entityName": "订单主表",
            "tableName": "t_order",
            "role": "main",
            "fields": [
                {
                    "fieldCode": "id",
                    "fieldName": "主键",
                    "fieldType": "bigint",
                    "primaryKey": true
                },
                {
                    "fieldCode": "order_no",
                    "fieldName": "订单号",
                    "fieldType": "string",
                    "length": 32,
                    "required": true
                }
            ]
        },
        "order_item": {
            "entityName": "订单明细",
            "tableName": "t_order_item",
            "role": "detail",
            "parentEntity": "order_main",
            "fields": [...]
        }
    }
}
```

### 3.3 表格配置 (table)

```json
{
    "$schema": "assembox/table/v1",
    "componentCode": "order_table",
    "componentName": "订单列表表格",
    "modelRef": "order_model",
    "entityRef": "order_main",
    "columns": [
        { "field": "order_no", "label": "订单号", "width": 150, "sortable": true },
        { "field": "amount", "label": "金额", "width": 100, "formatter": "currency" },
        { "field": "status", "label": "状态", "width": 80, "formatter": "dict:order_status" }
    ],
    "pagination": { 
        "pageSize": 20, 
        "pageSizes": [10, 20, 50, 100] 
    },
    "actions": [
        { "code": "add", "label": "新增", "type": "primary", "position": "toolbar" },
        { "code": "edit", "label": "编辑", "position": "row" },
        { "code": "delete", "label": "删除", "type": "danger", "position": "row", "confirm": "确定删除?" }
    ]
}
```

### 3.4 表单配置 (form)

```json
{
    "$schema": "assembox/form/v1",
    "componentCode": "order_form",
    "componentName": "订单编辑表单",
    "modelRef": "order_model",
    "entityRef": "order_main",
    "layout": {
        "type": "horizontal",
        "labelWidth": 100,
        "columns": 2
    },
    "fields": [
        { 
            "field": "order_no", 
            "label": "订单号", 
            "component": "input",
            "required": true,
            "rules": [
                { "type": "required", "message": "请输入订单号" },
                { "type": "pattern", "pattern": "^[A-Z0-9]+$", "message": "仅支持大写字母和数字" }
            ]
        },
        { 
            "field": "amount", 
            "label": "金额", 
            "component": "number",
            "props": { "precision": 2, "min": 0 }
        },
        { 
            "field": "status", 
            "label": "状态", 
            "component": "select",
            "props": { "dictCode": "order_status" }
        }
    ],
    "actions": [
        { "code": "submit", "label": "保存", "type": "submit", "buttonType": "primary" },
        { "code": "cancel", "label": "取消", "type": "cancel" }
    ]
}
```

### 3.5 过滤器配置 (filter)

```json
{
    "$schema": "assembox/filter/v1",
    "componentCode": "order_filter",
    "componentName": "订单筛选器",
    "modelRef": "order_model",
    "entityRef": "order_main",
    "layout": {
        "columns": 4,
        "collapsed": true,
        "defaultExpand": 2
    },
    "fields": [
        { "field": "order_no", "label": "订单号", "component": "input", "operator": "like" },
        { "field": "status", "label": "状态", "component": "select", "operator": "eq" },
        { "field": "created_at", "label": "创建时间", "component": "daterange", "operator": "between" }
    ]
}
```

---

## 4. 配置加载服务

### 4.1 配置加载上下文

```typescript
interface LoadConfigContext {
    /** 租户代码 */
    tenant: string;
    /** 模块代码 */
    moduleCode: string;
    /** 版本代码 */
    versionCode: string;
    /** 组件类型 */
    componentType: string;
    /** 组件代码 */
    componentCode: string;
}
```

### 4.2 配置加载服务

```typescript
export class ConfigLoadService {
    private cache: CacheClient;
    private db: Database;
    private oss: OssClient;

    /**
     * 加载配置（支持继承特性和缓存特性控制）
     */
    async loadConfig(ctx: LoadConfigContext): Promise<ConfigContent> {
        // 1. 获取组件元信息
        const meta = await this.getComponentMeta(ctx);

        // 2. 根据 is_cacheable 决定是否查缓存
        if (meta.isCacheable) {
            const cacheKey = this.buildCacheKey(ctx);
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }

        // 3. 执行继承查找（根据 is_inheritable 决定范围）
        const config = await this.resolveConfig(ctx, meta.isInheritable);

        // 4. 根据 is_cacheable 决定是否写缓存
        if (meta.isCacheable) {
            const cacheKey = this.buildCacheKey(ctx);
            await this.cache.setex(cacheKey, 3600, JSON.stringify(config));
        }

        return config;
    }

    /**
     * 获取组件元信息
     */
    private async getComponentMeta(ctx: LoadConfigContext): Promise<ComponentMeta> {
        const component = await this.db.query(`
            SELECT is_inheritable, is_cacheable FROM ab_component
            WHERE module_code = ? AND version_code = ?
              AND component_type = ? AND component_code = ?
              AND is_removed = 0
        `, [ctx.moduleCode, ctx.versionCode, ctx.componentType, ctx.componentCode]);

        if (!component) {
            throw new ComponentNotFoundError(ctx);
        }

        return {
            isInheritable: component.is_inheritable === 1,
            isCacheable: component.is_cacheable === 1
        };
    }

    /**
     * 继承查找
     */
    private async resolveConfig(
        ctx: LoadConfigContext,
        isInheritable: boolean
    ): Promise<ConfigContent> {
        // 根据 is_inheritable 决定查找范围
        const scopes: Array<{ scope: string; tenant: string | null }> = isInheritable
            ? [
                { scope: 'tenant', tenant: ctx.tenant },
                { scope: 'global', tenant: null },
                { scope: 'system', tenant: null }
              ]
            : [
                { scope: 'system', tenant: null }  // 不支持继承，只查 system
              ];

        for (const { scope, tenant } of scopes) {
            const config = await this.loadFromScope(scope, tenant, ctx);
            if (config) {
                return config;
            }
        }

        throw new ConfigNotFoundError(ctx);
    }

    /**
     * 从指定层级加载
     * 只查询 status=published 的配置
     * OSS 读取 published 路径
     */
    private async loadFromScope(
        scope: string,
        tenant: string | null,
        ctx: LoadConfigContext
    ): Promise<ConfigContent | null> {
        // 查询数据库获取 OSS Key（只查 published 状态）
        const configIndex = await this.db.query(`
            SELECT published_oss_key FROM ab_config
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
            return null;
        }

        // 从 OSS published 路径加载内容
        const content = await this.oss.getObjectAsString(configIndex.published_oss_key);
        return JSON.parse(content);
    }

    private buildCacheKey(ctx: LoadConfigContext, snapshotCode: string): string {
        // 缓存 Key 包含快照标识，确保快照切换后缓存自动隔离
        return `assembox:resolved:${snapshotCode}:${ctx.tenant}:${ctx.moduleCode}:${ctx.versionCode}:${ctx.componentType}:${ctx.componentCode}`;
    }
}
```

### 4.3 批量加载

```typescript
/**
 * 批量加载配置
 * 用于页面初始化时一次性加载多个配置
 */
async function batchLoadConfigs(
    tenant: string,
    moduleCode: string,
    versionCode: string,
    components: Array<{ type: string; code: string }>
): Promise<Map<string, ConfigContent>> {
    const results = new Map<string, ConfigContent>();
    
    await Promise.all(components.map(async ({ type, code }) => {
        try {
            const config = await configLoadService.loadConfig({
                tenant,
                moduleCode,
                versionCode,
                componentType: type,
                componentCode: code
            });
            results.set(`${type}/${code}`, config);
        } catch (error) {
            console.error(`Failed to load ${type}/${code}:`, error);
        }
    }));

    return results;
}
```

---

## 5. 配置保存服务

### 5.1 保存流程

**保存草稿流程：**

```
┌──────────┐     ①校验      ┌──────────┐     ②保存索引    ┌──────────┐
│  设计器   │ ───────────▶ │  服务层   │ ───────────────▶ │   TiDB   │
└──────────┘               └────┬─────┘                  │ status=  │
                                │                        │  draft   │
                                │ ③上传内容               └──────────┘
                                ▼
                           ┌──────────┐
                           │   OSS    │  draft/ 路径
                           └──────────┘
```

**发布流程：**

```
┌──────────┐     ①发布      ┌──────────┐     ②复制内容    ┌──────────┐
│  设计器   │ ───────────▶ │  服务层   │ ───────────────▶ │   OSS    │
└──────────┘               └────┬─────┘                  │ draft/ → │
                                │                        │published/│
                                │ ③更新状态               └──────────┘
                                ▼
                           ┌──────────┐
                           │   TiDB   │  status=published
                           └──────────┘
```

### 5.2 保存服务

```typescript
export class ConfigSaveService {
    private db: Database;
    private oss: OssClient;
    private validator: ConfigValidator;
    private pathGenerator: OssPathGenerator;

    /**
     * 保存草稿配置
     * 草稿保存到 OSS draft/ 路径
     */
    async saveDraftConfig(params: SaveConfigParams): Promise<SaveResult> {
        const { moduleCode, versionCode, componentType, componentCode, scope, tenant, content } = params;

        // 1. 校验是否可以在该 scope 创建配置
        await this.validateScope(moduleCode, versionCode, componentType, componentCode, scope);

        // 2. 校验配置内容
        const validationResult = await this.validator.validate(componentType, content);
        if (!validationResult.valid) {
            throw new ConfigValidationError(validationResult.errors);
        }

        // 3. 生成草稿 OSS Key
        const draftOssKey = this.pathGenerator.generateConfigKey({
            moduleCode, versionCode, componentType, componentCode, scope, tenant
        }, 'draft');

        // 4. 序列化并计算哈希
        const jsonContent = JSON.stringify(content, null, 2);
        const contentHash = md5(jsonContent);
        const contentSize = Buffer.byteLength(jsonContent, 'utf-8');

        // 5. 上传到 OSS draft 路径
        await this.oss.putObject(draftOssKey, jsonContent, {
            contentType: 'application/json',
            metadata: { 'x-content-hash': contentHash }
        });

        // 6. 更新数据库索引（oss_key 指向 draft 路径）
        await this.db.upsert('ab_config', {
            moduleCode,
            versionCode,
            componentType,
            componentCode,
            scope,
            tenant,
            ossKey: draftOssKey,
            contentHash,
            contentSize,
            status: 'draft',
            modifiedAt: new Date()
        });

        return { ossKey: draftOssKey, contentHash, contentSize };
    }

    /**
     * 校验 scope 是否允许
     * is_inheritable=0 的组件只能在 system 层创建配置
     */
    private async validateScope(
        moduleCode: string,
        versionCode: string,
        componentType: string,
        componentCode: string,
        scope: string
    ): Promise<void> {
        const component = await this.db.query(`
            SELECT is_inheritable FROM ab_component
            WHERE module_code = ? AND version_code = ?
              AND component_type = ? AND component_code = ?
              AND is_removed = 0
        `, [moduleCode, versionCode, componentType, componentCode]);

        if (component && component.is_inheritable === 0 && scope !== 'system') {
            throw new Error('This component does not support inheritance, can only create config in system scope');
        }
    }

    /**
     * 发布配置
     * 将 draft/ 内容复制到 published/ 路径
     */
    async publishConfig(params: PublishConfigParams): Promise<void> {
        const { configId, publisherId, publisherName } = params;

        // 1. 获取配置信息
        const config = await this.db.findById('ab_config', configId);
        if (!config) {
            throw new ConfigNotFoundError({ id: configId });
        }

        // 2. 生成 published OSS Key
        const publishedOssKey = config.oss_key.replace('/draft/', '/published/');

        // 3. 复制草稿到发布路径
        await this.oss.copyObject(config.oss_key, publishedOssKey);

        // 4. 递增发布版本号
        const publishVersion = config.publish_version + 1;

        // 5. 更新发布状态（oss_key 改为指向 published 路径）
        await this.db.update('ab_config', configId, {
            status: 'published',
            ossKey: publishedOssKey,
            publishVersion,
            publishedAt: new Date(),
            publisherId,
            publisherName
        });

        // 6. 记录发布历史
        await this.db.insert('ab_config_history', {
            configId,
            componentId: config.component_id,
            publishVersion,
            ossKey: publishedOssKey,
            contentHash: config.content_hash,
            gitCommitId: null, // 异步同步到 Git
            publishedAt: new Date(),
            publisherId,
            publisherName
        });

        // 7. 清除缓存（只有 is_cacheable=1 的组件需要清缓存）
        await this.invalidateCache(config);

        // 8. 异步同步到 Git
        await this.publishToGit(config, publishVersion);
    }
}
```

---

## 6. 配置校验

### 6.1 校验流程

```typescript
export class ConfigValidator {
    private schemaRegistry: Map<string, JSONSchema>;
    private validators: Map<string, ComponentValidator>;

    /**
     * 校验配置
     */
    async validate(
        componentType: string,
        content: unknown
    ): Promise<ValidationResult> {
        const errors: ValidationError[] = [];

        // 1. Schema 校验
        const schema = this.schemaRegistry.get(componentType);
        if (schema) {
            const schemaErrors = this.validateSchema(content, schema);
            errors.push(...schemaErrors);
        }

        // 2. 业务规则校验
        const validator = this.validators.get(componentType);
        if (validator && errors.length === 0) {
            const businessErrors = await validator.validate(content);
            errors.push(...businessErrors);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
```

### 6.2 引用校验

```typescript
// 校验模型引用是否有效
async function validateModelRef(
    modelRef: string,
    ctx: ValidationContext
): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const model = await componentService.findByCode(
        ctx.moduleCode,
        ctx.versionCode,
        'model',
        modelRef
    );

    if (!model) {
        errors.push({
            path: '/modelRef',
            message: `Referenced model '${modelRef}' does not exist`,
            code: 'MODEL_NOT_FOUND'
        });
    }

    return errors;
}

// 校验字段引用是否有效
async function validateFieldRef(
    entityRef: string,
    fieldCode: string,
    ctx: ValidationContext
): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const modelConfig = await loadModelConfig(ctx);
    const entity = modelConfig?.entities?.[entityRef];

    if (!entity) {
        errors.push({
            path: '/entityRef',
            message: `Entity '${entityRef}' not found`,
            code: 'ENTITY_NOT_FOUND'
        });
        return errors;
    }

    const field = entity.fields?.find((f: any) => f.fieldCode === fieldCode);
    if (!field) {
        errors.push({
            path: `/fields/${fieldCode}`,
            message: `Field '${fieldCode}' not found in entity '${entityRef}'`,
            code: 'FIELD_NOT_FOUND'
        });
    }

    return errors;
}
```

---

## 7. 特殊场景处理

### 7.1 配置依赖

```typescript
// 加载配置及其依赖
async function loadConfigWithDependencies(
    ctx: LoadConfigContext
): Promise<ConfigWithDeps> {
    const config = await configLoadService.loadConfig(ctx);
    const deps: Map<string, ConfigContent> = new Map();

    // 加载模型依赖
    if (config.modelRef) {
        const modelConfig = await configLoadService.loadConfig({
            ...ctx,
            componentType: 'model',
            componentCode: config.modelRef
        });
        deps.set(`model/${config.modelRef}`, modelConfig);
    }

    // 加载 API 依赖
    if (config.apiRef) {
        const apiConfig = await configLoadService.loadConfig({
            ...ctx,
            componentType: 'api',
            componentCode: config.apiRef
        });
        deps.set(`api/${config.apiRef}`, apiConfig);
    }

    return { config, dependencies: deps };
}
```

### 7.2 配置预览

```typescript
// 预览配置（不保存）
async function previewConfig(params: {
    tenant: string;
    moduleCode: string;
    versionCode: string;
    componentType: string;
    componentCode: string;
    draftContent: object;
}): Promise<PreviewResult> {
    // 1. 校验草稿内容
    const validationResult = await configValidator.validate(
        params.componentType,
        params.draftContent
    );

    if (!validationResult.valid) {
        return { success: false, errors: validationResult.errors };
    }

    // 2. 加载依赖配置
    const dependencies = await loadDependencies(params);

    // 3. 返回预览数据
    return {
        success: true,
        config: params.draftContent,
        dependencies,
        renderable: true
    };
}
```

### 7.3 配置比对

```typescript
// 比对两个版本的配置差异
async function diffConfigs(
    configId: number,
    version1: number,
    version2: number
): Promise<ConfigDiff[]> {
    const history1 = await loadConfigHistory(configId, version1);
    const history2 = await loadConfigHistory(configId, version2);

    const content1 = await loadConfigFromOss(history1.ossKey);
    const content2 = await loadConfigFromOss(history2.ossKey);

    return generateDiff(content1, content2);
}
```

---

## 8. 设计决策记录

| 问题 | 决策 | 说明 |
|-----|------|------|
| 继承粒度 | 组件级 | 以完整组件为单位，不做字段级合并 |
| 继承策略 | 优先级覆盖 | tenant > global > system，找到即返回 |
| 继承控制 | is_inheritable 属性 | 0=仅system层，1=支持三层继承 |
| 缓存控制 | is_cacheable 属性 | 0=不缓存直接读库，1=走Redis缓存 |
| 草稿隔离 | draft/published 分离 | 草稿和发布内容存储在不同 OSS 路径 |
| 运行时读取 | 只读 published | 运行时只查 status=published，只读 published 路径 |
| 配置格式 | JSON | 便于存储、解析和版本对比 |
| Schema 版本 | URI 格式 | `assembox/{type}/v{version}` |
| 索引存储 | TiDB | 支持事务和快速查询 |
| 内容存储 | OSS | 海量存储，按需读取 |

---

## 9. 相关文档

| 文档 | 说明 |
|-----|------|
| [存储层总体设计](./overview.md) | 存储层架构总览 |
| [组件类型扩展规范](./component-types.md) | 组件类型定义和扩展 |
| [OSS操作规范](./oss-operations.md) | OSS 存储和读写规范 |
| [缓存策略详细设计](./cache-strategy.md) | 缓存读写和失效策略 |
