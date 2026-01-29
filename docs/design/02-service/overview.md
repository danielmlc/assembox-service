# 服务层设计

> **状态**: 已完成
> **更新日期**: 2025-01-24

---

## 目录

1. [概述](#1-概述)
2. [模块架构](#2-模块架构)
3. [核心模块设计](#3-核心模块设计)
4. [横切关注点](#4-横切关注点)
5. [云阙平台基础能力](#5-云阙平台基础能力)
6. [相关文档](#6-相关文档)

---

## 1. 概述

### 1.1 职责定义

服务层是 Assembox 平台的核心业务逻辑层，主要负责：

| 职责 | 说明 | 主要场景 |
|-----|------|---------|
| **元数据管理** | 模型、字段、关联、操作的定义与维护 | 设计时 |
| **配置管理** | 页面配置的 CRUD、版本控制 | 设计时 |
| **预览引擎** | 设计器实时预览（代码生成 + 热重载） | 设计时 |
| **插件系统** | 插件配置管理，为代码生成提供插件数据 | 设计时 |

> **架构特点**: 预览和生产使用**统一的代码生成逻辑**，确保"所见即所得"。发布服务负责生产环境的完整构建和部署，详见 [发布流程设计](../05-publish/overview.md)。

### 1.2 执行模式

Assembox 平台采用**统一代码生成**架构，预览和生产使用相同的代码生成逻辑，确保规则一致性：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      统一代码生成架构（预览 = 生产）                           │
└─────────────────────────────────────────────────────────────────────────────┘

设计原则：预览环境和生产环境执行完全相同的生成代码，消除"预览正常发布出错"的风险

预览模式（设计时）── 本服务 + 发布服务协作:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   设计器修改 ──▶ 增量代码生成 ──▶ 热重载编译 ──▶ 预览容器 ──▶ 实时预览       │
│                       │                │                                    │
│             ┌─────────┴─────────┐  ┌───┴───────────────┐                   │
│             │ 与生产相同的生成器 │  │ esbuild 增量编译   │                   │
│             │ - Entity.ts       │  │ NestJS 热重载      │                   │
│             │ - Service.ts      │  └───────────────────┘                   │
│             │ - Controller.ts   │                                          │
│             └───────────────────┘                                          │
│                                                                             │
│   特点: 3-10秒生效，所见即所得，与生产行为完全一致                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

生产模式（发布后）── 由独立发布服务负责:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   发布 ──▶ 完整代码生成 ──▶ 构建打包 ──▶ 部署 ──▶ 直接执行                   │
│                │                                       │                   │
│      ┌─────────┴─────────┐              ┌──────────────┴──────────────┐    │
│      │ 与预览相同的生成器 │              │ Docker 镜像、K8s 部署        │    │
│      │ - 全量生成        │              │ 性能最优、可水平扩展          │    │
│      │ - 优化压缩        │              │                             │    │
│      └───────────────────┘              └─────────────────────────────┘    │
│                                                                             │
│   特点: 分钟级生效，生产级性能                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

核心优势：
┌─────────────────┬─────────────────────────────────────────────────────────┐
│ 规则一致性       │ 预览和生产使用同一套代码生成器，行为完全相同              │
│ 所见即所得       │ 预览效果 = 最终效果，无需担心发布后出现差异              │
│ 简化维护         │ 只需维护一套代码生成逻辑，降低复杂度                     │
│ 调试友好         │ 预览时也是真实代码，可断点调试                           │
└─────────────────┴─────────────────────────────────────────────────────────┘
```

### 1.3 技术选型

| 组件 | 技术 | 说明 |
|-----|------|------|
| 框架 | NestJS | 云阙平台标准框架 |
| ORM | TypeORM | 通过 @cs/nest-typeorm 集成 |
| 缓存 | Redis | 通过云阙平台 Redis 模块 |
| 验证 | class-validator | DTO 验证 |
| 代码生成 | ts-morph | TypeScript AST 操作 |

### 1.4 设计原则

1. **模块化**: 按职责划分模块，低耦合高内聚
2. **元数据驱动**: 所有业务逻辑基于元数据配置
3. **编译优先**: 生产环境使用生成代码，预览环境使用解释执行
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
│   ├── config/                   # 配置模块
│   │   ├── config.module.ts
│   │   ├── controllers/          # 配置 API
│   │   ├── services/             # 配置服务
│   │   ├── entities/             # 配置实体
│   │   └── dto/
│   │
│   ├── preview/                  # 预览模块
│   │   ├── preview.module.ts
│   │   ├── controllers/          # 预览 API
│   │   ├── services/             # 预览服务
│   │   │   ├── preview-query.service.ts
│   │   │   ├── preview-render.service.ts
│   │   │   └── preview-executor.service.ts
│   │   └── dto/
│   │
│   ├── schema/                   # 数据库结构模块
│   │   ├── schema.module.ts
│   │   └── services/             # DDL 生成、表绑定
│   │
│   ├── plugin/                   # 插件模块
│   │   ├── plugin.module.ts
│   │   ├── services/
│   │   │   ├── plugin-registry.service.ts    # 插件注册
│   │   │   └── plugin-snapshot.service.ts    # 插件快照
│   │   ├── interfaces/           # 插件接口定义
│   │   └── plugins/              # 内置插件
│   │
│   └── flow/                     # 服务编排模块
│       ├── flow.module.ts
│       ├── controllers/          # 流程 API
│       ├── services/
│       │   ├── flow-registry.service.ts      # 流程注册
│       │   ├── flow-validator.service.ts     # 流程验证
│       │   └── flow-snapshot.service.ts      # 流程快照
│       ├── entities/             # 流程实体
│       └── dto/
```

> **发布服务（assembox-publish-service）** 是独立部署的服务，负责代码生成、构建和部署。详见 [发布流程设计](../05-publish/overview.md)。

### 2.2 模块依赖关系

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           模块依赖关系                                        │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │  SharedModule   │
                         │  (公共依赖)      │
                         └────────┬────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│  MetaModule   │        │ ConfigModule  │        │ PluginModule  │
│  (元数据管理)  │        │  (配置管理)   │        │  (插件配置)   │
└───────┬───────┘        └───────┬───────┘        └───────┬───────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│  FlowModule   │        │ PreviewModule │        │ SchemaModule  │
│  (服务编排)   │        │  (预览引擎)   │        │  (DDL 生成)   │
└───────────────┘        └───────────────┘        └───────────────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                       ╔═════════╧═════════╗
                       ║  发布服务（独立）   ║
                       ║ Publish Service   ║
                       ╚═════════╤═════════╝
                                 │
                   ┌─────────────┴─────────────┐
                   │ 通过 RPC 获取：           │
                   │ - MetaSnapshot           │
                   │ - ConfigSnapshot         │
                   │ - PluginConfig           │
                   │ - FlowSnapshot           │
                   └───────────────────────────┘
```

> **说明**: 发布服务是独立部署的微服务，通过 RPC 调用本服务获取元数据快照、配置快照、插件配置和流程配置，然后进行代码生成、构建和部署。

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
| MetaSnapshotProvider | 为代码生成器提供元数据快照 |

**API 路由**:

```
GET    /api/v1/meta/models              # 获取模型列表
GET    /api/v1/meta/models/:code        # 获取模型详情（含字段、关联、操作）
POST   /api/v1/meta/models              # 创建模型
PUT    /api/v1/meta/models/:code        # 更新模型
DELETE /api/v1/meta/models/:code        # 删除模型
```

### 3.3 ConfigModule（配置模块）

**职责**: 管理页面配置、组件配置、模板配置

**详见**: [config-service.md](./config-service.md)

**核心服务**:

| 服务 | 职责 |
|-----|------|
| ConfigService | 配置的 CRUD |
| ConfigVersionService | 配置版本管理 |
| ConfigCacheService | 配置缓存管理 |
| ConfigSnapshotService | 为发布提供配置快照 |

**API 路由**:

```
GET    /api/v1/config/:configCode           # 获取配置
POST   /api/v1/config                       # 创建配置
PUT    /api/v1/config/:configCode           # 更新配置
DELETE /api/v1/config/:configCode           # 删除配置
GET    /api/v1/config/:configCode/versions  # 获取版本列表
POST   /api/v1/config/:configCode/snapshot  # 创建配置快照（供发布使用）
```

### 3.4 PreviewModule（预览模块）

**职责**: 为设计器提供实时预览能力（代码生成 + 热重载）

**详见**: [runtime-service.md](./runtime-service.md)

**设计理念**:

预览模块采用与生产环境相同的代码生成逻辑，通过热重载技术实现快速预览：

```
配置变更 ──▶ 增量代码生成 ──▶ esbuild 编译 ──▶ 热重载 ──▶ 预览更新
                │                                           │
                └── 与发布服务使用相同的代码生成器 ──────────────┘
```

**核心服务**:

| 服务 | 职责 |
|-----|------|
| PreviewOrchestratorService | 编排预览流程（生成→编译→重载）|
| IncrementalGeneratorService | 增量代码生成（仅生成变更部分）|
| HotReloadService | 管理预览容器的热重载 |
| PreviewContainerService | 管理预览环境容器池 |

**预览延迟预估**:

| 变更类型 | 预估时间 | 说明 |
|---------|---------|------|
| 模型字段修改 | 3-5秒 | 后端热重载，更新 Entity/DTO |
| 新增模型 | 5-10秒 | 需编译新模块 |
| Service 逻辑修改 | 3-5秒 | 后端热重载 |

**API 路由**:

```
# 预览管理
POST   /api/v1/preview/start                   # 启动预览环境
POST   /api/v1/preview/refresh                 # 刷新预览（触发增量生成）
GET    /api/v1/preview/status                  # 预览环境状态
DELETE /api/v1/preview/stop                    # 停止预览环境

# 预览访问（代理到预览容器）
GET    /api/v1/preview/proxy/*                 # 代理到预览后端服务
```

### 3.5 与发布服务的交互

**发布服务**是独立部署的微服务，负责代码生成、构建编排、部署管理。

**详见**: [发布流程设计](../05-publish/overview.md)

**本服务为发布服务提供的接口**:

| 接口 | 说明 |
|-----|------|
| `GET /api/v1/meta/snapshot/:productId` | 获取元数据快照 |
| `GET /api/v1/config/snapshot/:productId` | 获取配置快照 |
| `GET /api/v1/plugin/snapshot/:productId` | 获取插件配置快照 |

**快照服务**:

| 服务 | 职责 |
|-----|------|
| MetaSnapshotProvider | 提供元数据快照（模型、字段、关联、操作） |
| ConfigSnapshotService | 提供配置快照（页面配置、组件配置） |
| PluginSnapshotService | 提供插件配置快照 |

**交互流程**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     发布服务与本服务的交互                                     │
└─────────────────────────────────────────────────────────────────────────────┘

     发布服务（独立部署）                    本服务（assembox-service）
    ┌──────────────────┐                  ┌──────────────────────────┐
    │ PublishService   │                  │ MetaModule               │
    │                  │   1. 请求快照     │   └─ MetaSnapshotProvider│
    │ ┌──────────────┐ │ ───────────────▶ │                          │
    │ │CodeGenerator │ │                  │ ConfigModule             │
    │ └──────────────┘ │ ◀─────────────── │   └─ ConfigSnapshotService│
    │                  │   2. 返回快照     │                          │
    │ ┌──────────────┐ │                  │ PluginModule             │
    │ │BuildTrigger  │ │                  │   └─ PluginSnapshotService│
    │ └──────────────┘ │                  └──────────────────────────┘
    └──────────────────┘
```

### 3.6 PluginModule（插件模块）

**职责**: 插件配置管理，为代码生成提供插件数据

**详见**: [plugin-service.md](./plugin-service.md)

**设计理念**:

在统一代码生成架构下，插件逻辑在预览和生产环境都是通过代码生成实现的：

```typescript
// 生成的 order.service.ts（预览和生产使用相同代码）
async create(dto) {
  // beforeCreate 钩子代码（编译时插入）
  await this.auditPlugin.beforeCreate(dto);
  await this.validationPlugin.beforeCreate(dto);

  const result = await this.repository.save(dto);

  // afterCreate 钩子代码（编译时插入）
  await this.notificationPlugin.afterCreate(result);

  return result;
}
```

**核心服务**:

| 服务 | 职责 |
|-----|------|
| PluginRegistryService | 插件注册与管理 |
| PluginSnapshotService | 为代码生成提供插件配置快照 |

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

### 3.7 SchemaModule（数据库结构模块）

**职责**: DDL 生成、表结构检查、模型与表绑定

**核心服务**:

| 服务 | 职责 |
|-----|------|
| DDLGeneratorService | 生成 DDL 语句 |
| TableInspectorService | 检查表结构与模型差异 |
| TableBindingService | 模型与物理表绑定 |

### 3.8 FlowModule（服务编排模块）

**职责**: 复杂业务流程的元数据管理

**详见**: [service-orchestration.md](./service-orchestration.md)

**设计理念**:

服务编排用于定义超越单模型 CRUD 的复杂业务流程，支持：

| 能力 | 说明 |
|-----|------|
| 多步骤流程 | 按顺序执行多个操作，支持事务管理 |
| 条件分支 | 根据条件执行不同的逻辑路径 |
| 跨模型操作 | 一次请求操作多个模型，保证数据一致性 |
| 异步任务 | 同步返回后，后台异步执行耗时操作 |
| 并行执行 | 多个独立操作并行执行，提升性能 |

**核心服务**:

| 服务 | 职责 |
|-----|------|
| FlowRegistryService | 流程注册与管理 |
| FlowValidatorService | 流程配置验证 |
| FlowSnapshotService | 为代码生成提供流程快照 |

**API 路由**:

```
# 流程管理
GET    /api/v1/flows                    # 获取流程列表
GET    /api/v1/flows/:flowCode          # 获取流程详情
POST   /api/v1/flows                    # 创建流程
PUT    /api/v1/flows/:flowCode          # 更新流程
DELETE /api/v1/flows/:flowCode          # 删除流程
POST   /api/v1/flows/:flowCode/validate # 验证流程配置
POST   /api/v1/flows/:flowCode/snapshot # 创建流程快照（供发布使用）
```

---

## 4. 横切关注点

### 4.1 租户隔离

**实现方式**: 拦截器 + 装饰器

```typescript
// TenantInterceptor 自动注入租户上下文
@UseInterceptors(TenantInterceptor)
export class PreviewController {

  @Get(':modelCode')
  async query(@Tenant() tenant: string) {
    // tenant 自动从请求头/JWT 中解析
  }
}
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

### 5.2 @cs/nest-common - 公共能力

**ContextService（上下文服务）**:

```typescript
import { ContextService } from '@cs/nest-common';

@Injectable()
export class SomeService {
  constructor(private readonly contextService: ContextService) {}

  async someMethod() {
    const userId = this.contextService.getContext<string>('userId');
    const tenant = this.contextService.getContext<string>('tenant');
  }
}
```

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
}
```

### 5.4 @cs/nest-cloud - 微服务能力

**RpcClient（服务间调用）**:

```typescript
import { RpcClient } from '@cs/nest-cloud';

@Injectable()
export class IdService {
  constructor(private readonly rpcClient: RpcClient) {}

  async getNewId(): Promise<string> {
    return this.rpcClient.getNewId();
  }
}
```

---

## 6. 相关文档

### 6.1 本服务文档

| 序号 | 文档 | 状态 | 主要内容 |
|:---:|-----|:----:|---------|
| 1 | [元数据服务设计](./meta-service.md) | ✅ | 模型、字段、关联管理，快照服务 |
| 2 | [配置服务设计](./config-service.md) | ✅ | 配置 CRUD、版本管理、快照服务 |
| 3 | [预览服务设计](./runtime-service.md) | ✅ | 代码生成 + 热重载预览 |
| 4 | [插件系统设计](./plugin-service.md) | ✅ | 插件配置管理 |
| 5 | [服务编排设计](./service-orchestration.md) | ✅ | 多步骤流程、条件分支、跨模型操作 |

### 6.2 关联服务文档

| 序号 | 文档 | 说明 |
|:---:|-----|------|
| 1 | [发布流程设计](../05-publish/overview.md) | 独立发布服务的设计文档 |
| 2 | [代码生成设计](../05-publish/code-generation.md) | 发布服务的代码生成器设计 |

> 图例: ✅ 已完成

---
