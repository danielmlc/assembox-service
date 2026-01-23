# 服务层设计

> **状态**: 设计中
> **更新日期**: 2025-01-20

---

## 1. 概述

### 1.1 职责定义

服务层是 Assembox 平台的核心业务逻辑层，负责：

- **元数据管理**: 模型、字段、关联、操作的定义与维护
- **配置管理**: 页面配置的 CRUD、发布、版本控制
- **动态 API**: 基于元数据动态生成数据操作接口
- **插件系统**: 提供钩子机制扩展业务逻辑

### 1.2 技术选型

| 组件 | 技术 | 说明 |
|-----|------|------|
| 框架 | NestJS | 云阙平台标准框架 |
| ORM | TypeORM | 通过 @cs/nest-typeorm 集成 |
| 缓存 | Redis | 通过云阙平台 Redis 模块 |
| 验证 | class-validator | DTO 验证 |

### 1.3 设计原则

1. **模块化**: 按职责划分模块，低耦合高内聚
2. **元数据驱动**: 所有业务逻辑基于元数据配置
3. **可扩展**: 通过插件机制支持业务定制
4. **多租户**: 所有操作自动注入租户上下文

---

## 2. 模块架构

### 2.1 模块划分

```
assembox-service/
├── src/
│   ├── assembox.module.ts        # 主模块（入口）
│   │
│   ├── shared/                   # 共享模块
│   │   ├── shared.module.ts
│   │   ├── constants/            # 常量定义
│   │   ├── decorators/           # 装饰器
│   │   ├── filters/              # 异常过滤器
│   │   ├── guards/               # 守卫
│   │   └── interceptors/         # 拦截器
│   │
│   ├── meta/                     # 元数据模块
│   │   ├── meta.module.ts
│   │   ├── controllers/          # 元数据 API
│   │   ├── services/             # 元数据服务
│   │   ├── entities/             # 元数据实体
│   │   └── dto/                  # 数据传输对象
│   │
│   ├── config/                   # 配置模块 (新增)
│   │   ├── config.module.ts
│   │   ├── controllers/          # 配置 API
│   │   ├── services/             # 配置服务
│   │   ├── entities/             # 配置实体
│   │   └── dto/
│   │
│   ├── runtime/                  # 运行时模块
│   │   ├── runtime.module.ts
│   │   ├── controllers/          # 动态 API
│   │   ├── services/             # 查询/变更服务
│   │   ├── interceptors/         # 租户拦截器
│   │   └── dto/
│   │
│   ├── schema/                   # 数据库结构模块
│   │   ├── schema.module.ts
│   │   └── services/             # DDL 生成、表绑定
│   │
│   └── plugin/                   # 插件模块
│       ├── plugin.module.ts
│       ├── services/             # 插件注册、执行
│       ├── interfaces/           # 插件接口定义
│       └── plugins/              # 内置插件
```

### 2.2 模块依赖关系

```
                    ┌─────────────────┐
                    │  SharedModule   │
                    │  (公共依赖)      │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  MetaModule   │   │ ConfigModule  │   │ PluginModule  │
│  (元数据管理)  │   │  (配置管理)   │   │  (插件系统)   │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                   ┌───────────────┐
                   │ RuntimeModule │
                   │  (动态 API)   │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ SchemaModule  │
                   │  (DDL 生成)   │
                   └───────────────┘
```

---

## 3. 核心模块设计

### 3.1 SharedModule（共享模块）

**职责**: 提供全局共享的服务和工具

**主要内容**:

| 类型 | 名称 | 说明 |
|-----|------|------|
| 常量 | FieldType | 字段类型枚举 |
| 常量 | ActionType | 操作类型枚举 |
| 常量 | SYSTEM_FIELDS | 系统字段列表 |
| 装饰器 | @Tenant() | 获取当前租户 |
| 装饰器 | @CurrentUser() | 获取当前用户 |
| 过滤器 | BusinessExceptionFilter | 业务异常处理 |
| 守卫 | TenantGuard | 租户权限守卫 |

### 3.2 MetaModule（元数据模块）

**职责**: 管理模型、字段、关联、操作的定义

**详见**: [meta-service.md](./meta-service.md)

**核心服务**:

| 服务 | 职责 |
|-----|------|
| ModelService | 模型定义的 CRUD |
| FieldService | 字段定义的 CRUD |
| RelationService | 关联定义的 CRUD |
| ActionService | 操作定义的 CRUD |
| MetaCacheService | 元数据缓存管理 |

**API 路由**:

```
GET    /api/v1/meta/models              # 获取模型列表
GET    /api/v1/meta/models/:code        # 获取模型详情（含字段、关联、操作）
POST   /api/v1/meta/models              # 创建模型
PUT    /api/v1/meta/models/:code        # 更新模型
DELETE /api/v1/meta/models/:code        # 删除模型
POST   /api/v1/meta/models/:code/publish # 发布模型
```

### 3.3 ConfigModule（配置模块）

**职责**: 管理页面配置、组件配置、模板配置

**详见**: [config-service.md](./config-service.md)

**核心服务**:

| 服务 | 职责 |
|-----|------|
| ConfigService | 配置的 CRUD |
| ConfigPublishService | 配置发布与版本管理 |
| ConfigCacheService | 配置缓存管理 |
| ConfigGitSyncService | Git 同步服务 |
| ConfigMergeService | 配置继承与合并 |

**API 路由**:

```
GET    /api/v1/config/:configCode           # 获取配置（自动按层级合并）
GET    /api/v1/config/:configCode/raw       # 获取原始配置（不合并）
POST   /api/v1/config                       # 创建配置
PUT    /api/v1/config/:configCode           # 更新配置
DELETE /api/v1/config/:configCode           # 删除配置
POST   /api/v1/config/:configCode/publish   # 发布配置
POST   /api/v1/config/:configCode/rollback  # 回滚配置
GET    /api/v1/config/:configCode/history   # 获取版本历史
```

### 3.4 RuntimeModule（运行时模块）

**职责**: 提供基于元数据的动态数据操作 API

**详见**: [runtime-service.md](./runtime-service.md)

**核心服务**:

| 服务 | 职责 |
|-----|------|
| DynamicQueryService | 动态查询（支持关联、聚合） |
| DynamicMutationService | 动态变更（增删改） |
| DynamicValidatorService | 数据验证与清理 |
| SqlBuilderService | SQL 构建器 |
| JoinBuilderService | JOIN 构建器 |

**API 路由**:

```
GET    /api/v1/data/:modelCode              # 分页查询
GET    /api/v1/data/:modelCode/:id          # 单条查询
POST   /api/v1/data/:modelCode              # 创建
PUT    /api/v1/data/:modelCode/:id          # 更新
DELETE /api/v1/data/:modelCode/:id          # 删除
POST   /api/v1/data/:modelCode/batch        # 批量创建
PUT    /api/v1/data/:modelCode/batch        # 批量更新
DELETE /api/v1/data/:modelCode/batch        # 批量删除
POST   /api/v1/data/:modelCode/aggregate    # 聚合查询
```

### 3.5 PluginModule（插件模块）

**职责**: 提供钩子机制，支持业务逻辑扩展

**详见**: [plugin-service.md](./plugin-service.md)

**核心服务**:

| 服务 | 职责 |
|-----|------|
| PluginRegistryService | 插件注册与管理 |
| PluginExecutorService | 钩子执行引擎 |

**钩子阶段**:

| 阶段 | 触发时机 |
|-----|---------|
| beforeCreate | 创建前 |
| afterCreate | 创建后 |
| beforeUpdate | 更新前 |
| afterUpdate | 更新后 |
| beforeDelete | 删除前 |
| afterDelete | 删除后 |
| beforeQuery | 查询前 |
| afterQuery | 查询后 |
| onError | 发生错误时 |

### 3.6 SchemaModule（数据库结构模块）

**职责**: DDL 生成、表结构检查、模型与表绑定

**详见**: [schema-service.md](./schema-service.md)

**核心服务**:

| 服务 | 职责 |
|-----|------|
| DDLGeneratorService | 生成 DDL 语句 |
| TableInspectorService | 检查表结构与模型差异 |
| TableBindingService | 模型与物理表绑定 |

---

## 4. 横切关注点

### 4.1 租户隔离

**实现方式**: 拦截器 + 装饰器

```typescript
// TenantInterceptor 自动注入租户上下文
@UseInterceptors(TenantInterceptor)
export class DynamicApiController {

  @Get(':modelCode')
  async query(@Tenant() tenant: string) {
    // tenant 自动从请求头/JWT 中解析
  }
}
```

**租户上下文传递**:

```
请求头 X-Tenant-Code
       │
       ▼
┌──────────────────┐
│ TenantInterceptor │ ─── 解析租户代码
└────────┬─────────┘
         │
         ▼ 注入到请求上下文
┌──────────────────┐
│  @Tenant() 装饰器 │ ─── 获取租户代码
└────────┬─────────┘
         │
         ▼ SQL 自动添加 tenant 条件
┌──────────────────┐
│   SqlBuilder     │ ─── WHERE tenant = ?
└──────────────────┘
```

### 4.2 数据验证

**验证流程**:

```
请求数据
   │
   ▼
┌─────────────────────┐
│ 1. DTO 基础验证     │ ─── class-validator
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 2. 字段类型验证     │ ─── 根据元数据 fieldType
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 3. 约束验证         │ ─── required, unique, min, max 等
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 4. 自定义验证       │ ─── 元数据中的 validations 配置
└────────┬────────────┘
         │
         ▼
验证通过 / 抛出异常
```

### 4.3 异常处理

**统一响应格式**:

```typescript
// 成功响应
{
  "code": 200,
  "status": "success",
  "message": "操作成功",
  "result": { ... }
}

// 错误响应
{
  "code": 400,
  "status": "error",
  "message": "字段 name 不能为空",
  "errors": [
    { "field": "name", "message": "不能为空" }
  ]
}
```

### 4.4 日志与审计

**日志级别**:

| 级别 | 场景 |
|-----|------|
| DEBUG | SQL 语句、详细调试信息 |
| INFO | 业务操作日志 |
| WARN | 性能警告、配置问题 |
| ERROR | 业务异常、系统错误 |

**审计字段**:

所有数据变更自动记录：
- `creator_id`, `creator_name`, `created_at` - 创建信息
- `modifier_id`, `modifier_name`, `modifier_at` - 修改信息

---

## 5. 云阙平台基础能力

Assembox 服务层基于云阙平台（packages/lib）的工具包开发，以下是核心依赖的平台能力：

### 5.1 @cs/nest-typeorm - 数据库能力

**基础实体继承**:

```typescript
import { HasPrimaryFullEntity } from '@cs/nest-typeorm';

@Entity('ab_model_definition')
export class ModelDefinitionEntity extends HasPrimaryFullEntity {
  // 自动继承: id, createdAt, creatorId, creatorName,
  //          modifierAt, modifierId, modifierName, isRemoved, version
  //          sortCode, isEnable

  @Column() code: string;
  @Column() name: string;
  // ...业务字段
}
```

**BaseRepository 能力**:

| 方法 | 说明 |
|-----|------|
| `findOne(dto)` | 根据条件查询单条 |
| `findMany(dto, take?, skip?)` | 根据条件查询多条 |
| `findManyBase(query)` | 高级分页查询（支持 select, where, orderBy） |
| `saveOne(entity)` | 保存单条（自动填充审计字段、生成ID） |
| `saveMany(entities)` | 批量保存 |
| `updateByCondition(data, conditions)` | 条件更新 |
| `softDeletion(conditions)` | 软删除（设置 isRemoved=true） |
| `hardDelete(conditions)` | 物理删除 |
| `executeSql(sql, params)` | 执行原生 SQL |

**实体注册方式**:

```typescript
import { EntityRegistModule } from '@cs/nest-typeorm';

@Module({
  imports: [
    EntityRegistModule.forRepos([
      { entity: ModelDefinitionEntity, repository: ModelRepository, connectionName: 'default' },
    ]),
  ],
})
export class MetaModule {}
```

### 5.2 @cs/nest-common - 公共能力

**ContextService（上下文服务）**:

基于 AsyncLocalStorage 实现请求级上下文传递：

```typescript
import { ContextService } from '@cs/nest-common';

@Injectable()
export class SomeService {
  constructor(private readonly contextService: ContextService) {}

  async someMethod() {
    // 获取上下文
    const userId = this.contextService.getContext<string>('userId');
    const tenant = this.contextService.getContext<string>('tenant');

    // 设置上下文
    this.contextService.setContext('customKey', 'value');

    // 在新上下文中执行
    this.contextService.runWithContext({ userId: '123' }, () => {
      // ...
    });
  }
}
```

**上下文字段约定**:

| 字段 | 说明 |
|-----|------|
| `userId` | 当前用户ID |
| `realName` | 当前用户姓名 |
| `tenant` | 租户代码 |
| `tenantGroup` | 租户组代码 |
| `trackingId` | 请求追踪ID |

### 5.3 @cs/nest-redis - 缓存能力

```typescript
import { RedisService } from '@cs/nest-redis';

@Injectable()
export class CacheService {
  constructor(private readonly redisService: RedisService) {}

  async cacheConfig(key: string, data: any, ttl: number) {
    const redis = this.redisService.getRedis();
    await redis.setex(key, ttl, JSON.stringify(data));
  }

  async getConfig(key: string) {
    const redis = this.redisService.getRedis();
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }
}
```

### 5.4 @cs/nest-cloud - 微服务能力

**RpcClient（服务间调用）**:

```typescript
import { RpcClient } from '@cs/nest-cloud';

@Injectable()
export class IdService {
  constructor(private readonly rpcClient: RpcClient) {}

  // 获取分布式 ID（通过 ID 生成服务）
  async getNewId(): Promise<string> {
    return this.rpcClient.getNewId();
  }

  async getNewIds(count: number): Promise<string[]> {
    return this.rpcClient.getNewId(count);
  }

  // 调用其他服务
  async callOtherService() {
    return this.rpcClient.callWithExtract({
      rpcConfig: {
        serviceName: 'other-service',
        servicePath: 'someController',
      },
      payload: {
        method: 'someMethod',
        params: { foo: 'bar' },
      },
    });
  }
}
```

**服务注册与发现**:
- 基于 Nacos 实现服务注册发现
- RPC 调用自动传递上下文（通过 CONTEXT_HEADER）
- 支持健康实例选择

### 5.5 平台能力使用示例

**完整的 Repository 使用示例**:

```typescript
import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@cs/nest-typeorm';
import { ModelDefinitionEntity } from '../entities';

@Injectable()
export class ModelRepository extends BaseRepository<ModelDefinitionEntity> {

  // 查询租户的所有模型
  async findByTenant(tenant: string): Promise<ModelDefinitionEntity[]> {
    return this.findMany({ tenant, isRemoved: false });
  }

  // 分页查询
  async findWithPaging(tenant: string, page: number, pageSize: number) {
    return this.findManyBase({
      conditionLambda: 'tenant = :tenant AND is_removed = :isRemoved',
      conditionValue: { tenant, isRemoved: false },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { created_at: 'DESC' },
    });
  }

  // 保存时自动填充审计字段
  async createModel(data: Partial<ModelDefinitionEntity>) {
    // saveOne 会自动:
    // 1. 通过 RpcClient 获取分布式 ID
    // 2. 从 ContextService 获取 userId, realName 填充审计字段
    // 3. 设置 version = Date.now()
    return this.saveOne(data);
  }
}
```

**上下文自动注入流程**:

```
HTTP 请求
    │
    ▼
┌───────────────────────────────┐
│ 云阙平台拦截器                 │
│ 解析请求头，初始化 Context     │
│ - userId, realName (from JWT) │
│ - tenant (from header)        │
│ - trackingId (生成)           │
└───────────────┬───────────────┘
                │
                ▼ AsyncLocalStorage
┌───────────────────────────────┐
│ Controller / Service          │
│ ContextService.getContext()   │
└───────────────┬───────────────┘
                │
                ▼ RPC 调用时自动传递
┌───────────────────────────────┐
│ RpcClient                     │
│ 将上下文编码到请求头          │
└───────────────────────────────┘
```

---

## 6. 相关文档

- [元数据服务设计](./meta-service.md)
- [配置服务设计](./config-service.md)
- [运行时服务设计](./runtime-service.md)
- [插件系统设计](./plugin-service.md)
- [数据库结构服务设计](./schema-service.md)

---

## 设计决策记录

| 问题 | 决策 | 说明 |
|-----|------|------|
| 配置模块是否独立 | 是 | 从 MetaModule 拆分，职责更清晰 |
| 动态 API 路由风格 | RESTful | 保持与现有实现一致 |
| 插件执行顺序 | 按 priority 排序 | 数字越小优先级越高 |
