# 配置服务设计

> **状态**: 已完成
> **更新日期**: 2025-01-24
> **架构说明**: 在新架构下，配置服务专注于配置 CRUD 和版本管理，发布流程移交给 PublishModule

---

## 1. 概述

### 1.1 职责定义

配置服务（ConfigModule）负责管理 Assembox 平台的页面配置和组件配置，包括：

- **配置 CRUD**: 配置的创建、读取、更新、删除
- **版本管理**: 配置版本历史、回滚
- **配置继承**: 三层配置的加载与合并
- **配置快照**: 为发布模块提供配置快照（**新增**）
- **Git 同步**: 版本历史同步到 Gitea

> **注意**: 配置的"发布"操作（生成代码、构建部署）已移交给 [PublishModule](../05-publish/overview.md)。
> ConfigModule 仅负责配置本身的状态管理（草稿→已发布），不涉及代码生成和部署。

### 1.2 与存储层的关系

配置服务基于存储层设计实现，核心数据流：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  ConfigService │ ──▶ │    TiDB      │ ──▶ │    Redis     │
│  (业务逻辑)    │     │  (主存储)     │     │   (缓存)     │
└──────────────┘     └──────────────┘     └──────────────┘
        │
        │ 发布时异步
        ▼
┌──────────────┐
│    Gitea     │
│  (版本历史)   │
└──────────────┘
```

---

## 2. 数据模型

### 2.1 配置实体

```typescript
interface ConfigEntity {
  id: string;                    // 主键

  // 配置标识
  configCode: string;            // 配置代码
  configName: string;            // 配置名称
  configType: ConfigType;        // 配置类型

  // 配置层级（三层结构）
  scope: ConfigScope;            // 作用域
  tenant?: string;               // 租户代码（仅 TENANT 层级需要）

  // 配置内容
  configData: object;            // JSON 配置数据

  // 版本控制
  versionNum: number;            // 业务版本号
  status: ConfigStatus;          // 状态

  // Git 同步
  gitCommitId?: string;          // 最后同步的 commit ID
  gitSyncedAt?: Date;            // 最后同步时间

  // 继承配置
  inherit: boolean;              // 是否继承上层配置

  // 审计字段（继承自 HasPrimaryFullEntity）
  // ...
}

enum ConfigType {
  PAGE = 'page',                 // 页面配置
  COMPONENT = 'component',       // 组件配置
  TEMPLATE = 'template',         // 模板配置
  LAYOUT = 'layout',             // 布局配置
  THEME = 'theme',               // 主题配置
}

enum ConfigScope {
  SYSTEM = 'system',             // 系统级（只读，平台预置）
  GLOBAL = 'global',             // 全局级（产品默认配置）
  TENANT = 'tenant',             // 租户级（租户定制）
}

enum ConfigStatus {
  DRAFT = 'draft',               // 草稿
  PUBLISHED = 'published',       // 已发布
}
```

### 2.2 配置历史实体

```typescript
interface ConfigHistoryEntity {
  id: string;
  configId: string;              // 关联的配置ID
  configCode: string;            // 配置代码

  // 历史版本信息
  versionNum: number;            // 版本号
  configData: object;            // 该版本的配置内容
  changeType: ChangeType;        // 变更类型
  changeNote?: string;           // 变更说明

  // Git 信息
  gitCommitId?: string;

  // 审计
  createdAt: Date;
  creatorId: string;
  creatorName: string;
}

enum ChangeType {
  CREATE = 'create',
  UPDATE = 'update',
  PUBLISH = 'publish',
  ROLLBACK = 'rollback',
}
```

---

## 3. 服务设计

### 3.1 服务列表

| 服务 | 职责 | 变化 |
|-----|------|------|
| ConfigService | 配置的 CRUD | 不变 |
| ConfigVersionService | 配置版本管理 | 原 ConfigPublishService，重命名 |
| ConfigCacheService | 配置缓存管理 | 不变 |
| ConfigMergeService | 配置继承与合并 | 不变 |
| ConfigSnapshotService | 配置快照服务 | **新增**，为 PublishModule 提供快照 |
| ConfigGitSyncService | Git 同步服务 | 不变 |

### 3.2 ConfigService

```typescript
@Injectable()
export class ConfigService {
  constructor(
    @InjectRepository({ entity: ConfigEntity, repository: ConfigRepository })
    private readonly configRepository: ConfigRepository,
    private readonly contextService: ContextService,
    private readonly configCacheService: ConfigCacheService,
  ) {}

  // 创建配置
  async create(dto: CreateConfigDto): Promise<ConfigEntity>;

  // 更新配置（草稿）
  async update(configCode: string, dto: UpdateConfigDto): Promise<ConfigEntity>;

  // 获取原始配置（不合并）
  async findRaw(configCode: string, scope?: ConfigScope): Promise<ConfigEntity | null>;

  // 获取配置列表
  async findAll(type?: ConfigType): Promise<ConfigEntity[]>;

  // 删除配置
  async delete(configCode: string): Promise<void>;

  // 复制配置到其他层级
  async copyToScope(configCode: string, targetScope: ConfigScope, targetTenant?: string): Promise<ConfigEntity>;
}
```

### 3.3 ConfigVersionService

> 原 ConfigPublishService，重命名以明确职责：管理配置版本，不涉及代码生成和部署。

```typescript
@Injectable()
export class ConfigVersionService {
  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly historyRepository: ConfigHistoryRepository,
    private readonly configCacheService: ConfigCacheService,
    private readonly configGitSyncService: ConfigGitSyncService,
  ) {}

  // 标记配置为已发布状态（仅状态变更，不触发代码生成）
  async markPublished(configCode: string, note?: string): Promise<ConfigEntity>;

  // 回滚到指定版本
  async rollback(configCode: string, targetVersion: number): Promise<ConfigEntity>;

  // 获取版本历史
  async getHistory(configCode: string): Promise<ConfigHistoryEntity[]>;

  // 对比两个版本
  async diffVersions(configCode: string, v1: number, v2: number): Promise<DiffResult>;
}
```

**版本管理流程**（不涉及代码生成）:

```
标记配置为已发布
    │
    ▼
┌─────────────────────┐
│ 1. 校验配置有效性    │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 2. 更新状态为 published │
│    versionNum++      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 3. 记录版本历史      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 4. 更新 Redis 缓存   │
└────────┬────────────┘
         │
         ▼ 异步
┌─────────────────────┐
│ 5. 同步到 Gitea      │
└─────────────────────┘
```

> **注意**: 代码生成和部署由 [PublishModule](../05-publish/overview.md) 负责，
> PublishModule 会调用 ConfigSnapshotService 获取配置快照后进行代码生成。

### 3.4 ConfigSnapshotService

> **新增服务**：为 PublishModule 提供配置快照，确保发布时配置的一致性。

```typescript
@Injectable()
export class ConfigSnapshotService {
  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly configMergeService: ConfigMergeService,
    private readonly metaCacheService: MetaCacheService,
  ) {}

  /**
   * 创建产品配置快照
   * 用于发布时锁定配置版本，避免发布过程中配置变更
   */
  async createProductSnapshot(productId: string): Promise<ProductSnapshot> {
    // 1. 获取产品下所有模块
    const modules = await this.getProductModules(productId);

    // 2. 获取每个模块的配置（已合并）
    const moduleSnapshots = await Promise.all(
      modules.map(m => this.createModuleSnapshot(m.moduleCode))
    );

    // 3. 获取元数据
    const metaSnapshot = await this.createMetaSnapshot(modules);

    return {
      productId,
      snapshotId: generateId(),
      createdAt: new Date(),
      modules: moduleSnapshots,
      meta: metaSnapshot,
    };
  }

  /**
   * 创建模块配置快照
   */
  async createModuleSnapshot(moduleCode: string): Promise<ModuleSnapshot> {
    // 获取模块下所有页面配置
    const pageConfigs = await this.getModulePageConfigs(moduleCode);

    // 合并配置
    const mergedConfigs = await Promise.all(
      pageConfigs.map(pc => this.configMergeService.getMergedConfig(pc.configCode, this.getContext()))
    );

    return {
      moduleCode,
      pages: mergedConfigs,
      version: this.calculateModuleVersion(pageConfigs),
    };
  }

  /**
   * 创建元数据快照
   */
  async createMetaSnapshot(modules: ModuleConfig[]): Promise<MetaSnapshot> {
    const modelCodes = modules.flatMap(m => m.models || []);

    const models = await Promise.all(
      modelCodes.map(code => this.metaCacheService.getModel(code))
    );

    const fields = await Promise.all(
      modelCodes.map(code => this.metaCacheService.getFieldsByModelCode(code))
    );

    return {
      models,
      fields: fields.flat(),
    };
  }
}

interface ProductSnapshot {
  productId: string;
  snapshotId: string;
  createdAt: Date;
  modules: ModuleSnapshot[];
  meta: MetaSnapshot;
}

interface ModuleSnapshot {
  moduleCode: string;
  pages: object[];
  version: string;
}

interface MetaSnapshot {
  models: ModelDefinitionEntity[];
  fields: FieldDefinitionEntity[];
}
```

### 3.5 ConfigMergeService

```typescript
@Injectable()
export class ConfigMergeService {
  constructor(
    private readonly configCacheService: ConfigCacheService,
  ) {}

  // 获取合并后的配置（核心方法）
  async getMergedConfig(configCode: string, ctx: TenantContext): Promise<object>;

  // 合并两个配置对象
  mergeConfigs(base: object, override: object): object;

  // 检查配置是否启用继承
  isInheritEnabled(config: ConfigEntity): boolean;
}
```

**配置加载与合并逻辑**（三层结构）:

```typescript
async getMergedConfig(configCode: string, ctx: TenantContext): Promise<object> {
  // 1. 尝试获取租户配置
  const tenantConfig = await this.configCacheService.getConfig(configCode, ConfigScope.TENANT, ctx.tenant);
  if (tenantConfig && !tenantConfig.inherit) {
    // 租户配置不继承上层，直接返回
    return tenantConfig.configData;
  }

  // 2. 获取全局配置
  let mergedData = {};
  const globalConfig = await this.configCacheService.getConfig(configCode, ConfigScope.GLOBAL);
  if (globalConfig) {
    mergedData = globalConfig.configData;
    if (!globalConfig.inherit) {
      // 全局配置不继承系统配置
      return tenantConfig ? this.mergeConfigs(mergedData, tenantConfig.configData) : mergedData;
    }
  }

  // 3. 获取系统配置（基础层，始终存在）
  const systemConfig = await this.configCacheService.getConfig(configCode, ConfigScope.SYSTEM);
  if (systemConfig) {
    mergedData = this.mergeConfigs(systemConfig.configData, mergedData);
  }

  // 4. 合并租户配置的覆盖部分
  if (tenantConfig) {
    mergedData = this.mergeConfigs(mergedData, tenantConfig.configData);
  }

  return mergedData;
}
```

**合并流程图**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          三层配置合并流程                                      │
└─────────────────────────────────────────────────────────────────────────────┘

   SYSTEM（系统配置）         GLOBAL（全局配置）         TENANT（租户配置）
   ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
   │ 平台预置      │          │ 产品默认      │          │ 租户定制      │
   │ 只读         │    ───▶  │ 可自定义      │    ───▶  │ 最高优先级    │
   │ 基础配置      │          │ inherit: true │          │ inherit: true │
   └──────────────┘          └──────────────┘          └──────────────┘
         │                         │                         │
         │         深度合并         │         深度合并         │
         └─────────────────────────┴─────────────────────────┘
                                   │
                                   ▼
                          ┌──────────────┐
                          │  最终配置     │
                          └──────────────┘
```

**合并规则**:

| 数据类型 | 合并策略 |
|---------|---------|
| 基本类型 | 覆盖 |
| 对象 | 深度合并 |
| 数组 | 覆盖（不合并） |
| null | 显式设置为 null |
| undefined | 忽略，使用上层值 |

### 3.6 ConfigCacheService

```typescript
@Injectable()
export class ConfigCacheService {
  constructor(
    private readonly redisService: RedisService,
    private readonly configRepository: ConfigRepository,
  ) {}

  // 获取配置（优先缓存）
  async getConfig(configCode: string, scope: ConfigScope, scopeValue?: string): Promise<ConfigEntity | null>;

  // 设置配置缓存
  async setCache(config: ConfigEntity): Promise<void>;

  // 清除配置缓存
  async invalidate(configCode: string, scope: ConfigScope, scopeValue?: string): Promise<void>;

  // 清除租户所有配置缓存
  async invalidateTenantAll(tenant: string): Promise<void>;
}
```

**缓存 Key 设计**:

```
# 系统配置
assembox:config:_system:{configCode}

# 全局配置
assembox:config:_global:{configCode}

# 租户配置
assembox:config:_tenants:{tenant}:{configCode}

# 合并后的配置（可选，避免重复计算）
assembox:config:merged:{tenant}:{configCode}
```

### 3.7 ConfigGitSyncService

```typescript
@Injectable()
export class ConfigGitSyncService {
  constructor(
    private readonly httpService: HttpService,  // 调用 Gitea API
    private readonly configRepository: ConfigRepository,
  ) {}

  // 同步配置到 Git
  async syncToGit(config: ConfigEntity): Promise<string>;  // 返回 commit ID

  // 从 Git 恢复配置
  async restoreFromGit(configCode: string, commitId: string): Promise<object>;

  // 获取 Git 历史
  async getGitHistory(configCode: string, scope: ConfigScope): Promise<GitCommit[]>;
}
```

**Gitea API 调用**:

```typescript
// 创建或更新文件
async syncToGit(config: ConfigEntity): Promise<string> {
  const filePath = this.getGitFilePath(config);
  const content = JSON.stringify(config.configData, null, 2);
  const base64Content = Buffer.from(content).toString('base64');

  const commitMessage = `[${config.scope}] publish: ${config.configCode} (v${config.versionNum})`;

  // 调用 Gitea API
  const response = await this.httpService.put(
    `${this.giteaUrl}/api/v1/repos/${this.owner}/${this.repo}/contents/${filePath}`,
    {
      message: commitMessage,
      content: base64Content,
      sha: await this.getFileSha(filePath),  // 更新时需要提供
    },
    {
      headers: { Authorization: `token ${this.giteaToken}` }
    }
  );

  return response.data.commit.sha;
}
```

---

## 4. API 设计

### 4.1 配置 API

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/config/:configCode | 获取配置（自动合并） |
| GET | /api/v1/config/:configCode/raw | 获取原始配置（不合并） |
| POST | /api/v1/config | 创建配置 |
| PUT | /api/v1/config/:configCode | 更新配置 |
| DELETE | /api/v1/config/:configCode | 删除配置 |
| POST | /api/v1/config/:configCode/publish | 发布配置 |
| POST | /api/v1/config/:configCode/rollback | 回滚配置 |
| GET | /api/v1/config/:configCode/history | 获取版本历史 |
| POST | /api/v1/config/:configCode/copy | 复制配置到其他层级 |

### 4.2 请求/响应示例

**创建配置**:

```http
POST /api/v1/config
Content-Type: application/json

{
  "configCode": "page-user-list",
  "configName": "用户列表页",
  "configType": "page",
  "scope": "global",
  "configData": {
    "title": "用户管理",
    "components": [
      {
        "__nodeId": "table-1",
        "__nodeName": "CsTable",
        "__nodeOptions": {
          "modelCode": "user",
          "columns": ["name", "email", "createdAt"]
        }
      }
    ]
  }
}
```

**获取合并后的配置**:

```http
GET /api/v1/config/page-user-list
X-Tenant-Code: tenant_001
```

**响应**:

```json
{
  "code": 200,
  "status": "success",
  "result": {
    "configCode": "page-user-list",
    "configName": "用户列表页",
    "scope": "tenant",
    "versionNum": 3,
    "configData": {
      "title": "用户管理",
      "pageSize": 50,
      "components": [...]
    },
    "mergedFrom": ["system", "global", "tenant"]
  }
}
```

**发布配置**:

```http
POST /api/v1/config/page-user-list/publish
Content-Type: application/json

{
  "note": "修复了分页显示问题"
}
```

**回滚配置**:

```http
POST /api/v1/config/page-user-list/rollback
Content-Type: application/json

{
  "targetVersion": 2
}
```

---

## 5. 配置继承示例

### 5.1 三层配置结构

| 层级 | 说明 | 典型场景 |
|-----|------|---------|
| SYSTEM | 平台预置配置，只读 | 基础布局、默认样式、核心组件配置 |
| GLOBAL | 产品级默认配置 | 产品的标准页面配置、业务规则 |
| TENANT | 租户定制配置 | 租户特有的个性化需求 |

### 5.2 场景说明

**需求**: 用户列表页在不同层级有不同配置

| 层级 | 配置内容 |
|-----|---------|
| SYSTEM | 基础布局、默认分页 20 |
| GLOBAL | 添加搜索栏、自定义列 |
| TENANT (tenant_001) | 分页改为 50、隐藏某些列 |

### 5.3 各层级配置

**系统配置** (`_system/pages/page-user-list.json`):

```json
{
  "configCode": "page-user-list",
  "scope": "system",
  "inherit": false,
  "configData": {
    "layout": "default",
    "pageSize": 20,
    "components": [
      { "__nodeId": "table-1", "__nodeName": "CsTable" }
    ]
  }
}
```

**全局配置** (`_global/pages/page-user-list.json`):

```json
{
  "configCode": "page-user-list",
  "scope": "global",
  "inherit": true,
  "configData": {
    "showSearch": true,
    "searchFields": ["name", "email"],
    "components": [
      { "__nodeId": "search-1", "__nodeName": "CsSearchBar" },
      { "__nodeId": "table-1", "__nodeName": "CsTable", "__nodeOptions": { "columns": ["name", "email", "phone", "createdAt"] } }
    ]
  }
}
```

**租户配置** (`_tenants/tenant_001/pages/page-user-list.json`):

```json
{
  "configCode": "page-user-list",
  "scope": "tenant",
  "tenant": "tenant_001",
  "inherit": true,
  "configData": {
    "pageSize": 50,
    "components": [
      { "__nodeId": "table-1", "__nodeOptions": { "columns": ["name", "email", "createdAt"] } }
    ]
  }
}
```

### 5.4 合并结果

```json
{
  "layout": "default",
  "pageSize": 50,
  "showSearch": true,
  "searchFields": ["name", "email"],
  "components": [
    { "__nodeId": "search-1", "__nodeName": "CsSearchBar" },
    { "__nodeId": "table-1", "__nodeName": "CsTable", "__nodeOptions": { "columns": ["name", "email", "createdAt"] } }
  ]
}
```

---

## 6. Git 同步策略

### 6.1 同步时机

| 事件 | 是否同步 | 说明 |
|-----|---------|------|
| 保存草稿 | 否 | 仅存入 TiDB |
| 发布配置 | **是** | 异步同步到 Gitea |
| 回滚配置 | **是** | 记录回滚操作 |

### 6.2 文件路径映射

```
configCode: page-user-list
scope: global
→ Git 路径: _global/pages/page-user-list.json

configCode: page-user-list
scope: tenant
tenant: tenant_001
→ Git 路径: _tenants/tenant_001/pages/page-user-list.json
```

### 6.3 提交消息格式

```
[<scope>] <action>: <configCode> (v<version>)

示例:
[global] publish: page-user-list (v3)
[tenant:tenant_001] publish: page-user-list (v2)
[tenant:tenant_001] rollback: page-user-list (v2 -> v1)
```

---

## 8. 与 PublishModule 的交互

### 8.1 发布流程中的角色

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        配置服务与发布模块的协作                                │
└─────────────────────────────────────────────────────────────────────────────┘

用户触发发布
    │
    ▼
┌─────────────────────────────────────┐
│        PublishModule                 │
│  PublishOrchestratorService          │
└──────────────┬──────────────────────┘
               │
               │ 1. 请求配置快照
               ▼
┌─────────────────────────────────────┐
│        ConfigModule                  │
│  ConfigSnapshotService               │
│  - 锁定当前配置版本                   │
│  - 合并多层配置                       │
│  - 返回完整快照                       │
└──────────────┬──────────────────────┘
               │
               │ 2. 返回快照
               ▼
┌─────────────────────────────────────┐
│        PublishModule                 │
│  CodeGeneratorService                │
│  - 根据快照生成代码                   │
│  - 触发构建                          │
│  - 管理部署                          │
└─────────────────────────────────────┘
```

### 8.2 调用示例

```typescript
// PublishModule 中调用 ConfigSnapshotService
@Injectable()
export class PublishOrchestratorService {
  constructor(
    private readonly configSnapshotService: ConfigSnapshotService,
    private readonly codeGeneratorService: CodeGeneratorService,
  ) {}

  async publish(productId: string): Promise<PublishResult> {
    // 1. 创建配置快照
    const snapshot = await this.configSnapshotService.createProductSnapshot(productId);

    // 2. 使用快照生成代码
    const generatedCode = await this.codeGeneratorService.generate(snapshot);

    // 3. 后续构建、部署...
  }
}
```

---

## 9. 相关文档

- [服务层概述](./overview.md)
- [发布流程设计](../05-publish/overview.md)
- [代码生成设计](../05-publish/code-generation.md)
- [存储层 - 配置存储](../01-storage/config-storage.md)
