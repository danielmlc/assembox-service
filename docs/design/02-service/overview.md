# 服务层设计

> **状态**: 已完成
> **更新日期**: 2025-01-24
> **架构说明**: 基于"代码生成 + 构建发布"模式，服务层分为设计时（预览）和发布时（代码生成）两种执行模式

---

## 目录

1. [概述](#1-概述)
2. [架构转型](#2-架构转型)
3. [模块架构](#3-模块架构)
4. [核心模块设计](#4-核心模块设计)
5. [横切关注点](#5-横切关注点)
6. [云阙平台基础能力](#6-云阙平台基础能力)
7. [相关文档](#7-相关文档)

---

## 1. 概述

### 1.1 职责定义

服务层是 Assembox 平台的核心业务逻辑层，在新架构下主要负责：

| 职责 | 说明 | 主要场景 |
|-----|------|---------|
| **元数据管理** | 模型、字段、关联、操作的定义与维护 | 设计时 |
| **配置管理** | 页面配置的 CRUD、版本控制 | 设计时 |
| **预览引擎** | 设计器实时预览（运行时解释） | 设计时 |
| **发布编排** | 代码生成、CI/CD 触发、部署管理 | 发布时 |
| **插件系统** | 编译时插桩，生成定制化代码 | 发布时 |

### 1.2 技术选型

| 组件 | 技术 | 说明 |
|-----|------|------|
| 框架 | NestJS | 云阙平台标准框架 |
| ORM | TypeORM | 通过 @cs/nest-typeorm 集成 |
| 缓存 | Redis | 通过云阙平台 Redis 模块 |
| 验证 | class-validator | DTO 验证 |
| 代码生成 | ts-morph | TypeScript AST 操作 |
| 模板引擎 | EJS | Vue SFC 等模板生成 |

### 1.3 设计原则

1. **模块化**: 按职责划分模块，低耦合高内聚
2. **元数据驱动**: 所有业务逻辑基于元数据配置
3. **编译优先**: 生产环境使用生成代码，预览环境使用解释执行
4. **多租户**: 所有操作自动注入租户上下文

---

## 2. 架构转型

### 2.1 架构对比

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        架构转型说明                                          │
└─────────────────────────────────────────────────────────────────────────────┘

原架构（运行时解释）:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   元数据配置 ──▶ RuntimeModule ──▶ 动态解析执行 ──▶ 返回结果                 │
│                      │                                                      │
│                      │  每次请求都要：                                       │
│                      │  1. 读取配置                                          │
│                      │  2. 解析元数据                                        │
│                      │  3. 动态构建 SQL/组件                                  │
│                      │  4. 执行并返回                                        │
│                      ▼                                                      │
│              性能开销大，调试困难                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

新架构（代码生成 + 构建发布）:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                   设计时                        发布时                       │
│   ┌─────────────────────────────────┐    ┌─────────────────────────────┐   │
│   │                                 │    │                             │   │
│   │  元数据配置 ──▶ PreviewModule   │    │  元数据 ──▶ CodeGenerator   │   │
│   │                 (运行时解释)    │    │            ──▶ 标准代码     │   │
│   │                     │           │    │            ──▶ 构建部署     │   │
│   │                     ▼           │    │                             │   │
│   │              秒级预览           │    │              性能最优        │   │
│   │                                 │    │                             │   │
│   └─────────────────────────────────┘    └─────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 模块职责变化

| 模块 | 原职责 | 新职责 | 变化说明 |
|-----|--------|--------|---------|
| **MetaModule** | 元数据管理 | 元数据管理（不变） | 核心模块，保持不变 |
| **ConfigModule** | 配置 CRUD + 发布 | 配置 CRUD + 版本快照 | 发布流程移交 PublishModule |
| **RuntimeModule** | 核心动态 API | **预览引擎**（降级） | 仅用于设计器预览 |
| **PluginModule** | 运行时钩子 | **编译时插桩** | 钩子代码编译到生成代码中 |
| **SchemaModule** | DDL 生成 | DDL 生成（不变） | 仅设计时使用 |
| **PublishModule** | - | **代码生成 + 构建编排**（新增） | 核心发布流程 |

### 2.3 两种执行模式

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        执行模式对比                                          │
└─────────────────────────────────────────────────────────────────────────────┘

预览模式（设计时）:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   设计器 ──▶ 保存配置 ──▶ OSS(草稿) ──▶ PreviewModule ──▶ 实时预览          │
│                                              │                              │
│                                    ┌─────────┴─────────┐                   │
│                                    │ 运行时解释执行     │                   │
│                                    │ - 读取 OSS 配置    │                   │
│                                    │ - 动态渲染组件    │                   │
│                                    │ - 动态构建 SQL    │                   │
│                                    └───────────────────┘                   │
│                                                                             │
│   特点: 秒级生效，性能一般，用于快速迭代                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

生产模式（发布后）:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   发布 ──▶ CodeGenerator ──▶ 源代码 ──▶ 构建 ──▶ 部署 ──▶ 直接执行          │
│                  │                                           │             │
│        ┌─────────┴─────────┐                    ┌────────────┴─────────┐   │
│        │ 编译时代码生成     │                    │ 编译后直接执行        │   │
│        │ - Entity.ts       │                    │ - 无解析开销          │   │
│        │ - Controller.ts   │                    │ - 可断点调试          │   │
│        │ - Service.ts      │                    │ - 类型安全            │   │
│        │ - Vue 组件        │                    │                       │   │
│        └───────────────────┘                    └───────────────────────┘   │
│                                                                             │
│   特点: 分钟级生效，性能最优，用于生产环境                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 模块架构

### 3.1 模块划分

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
│   ├── preview/                  # 预览模块（原 runtime，降级重命名）
│   │   ├── preview.module.ts
│   │   ├── controllers/          # 预览 API
│   │   ├── services/             # 预览服务
│   │   │   ├── preview-query.service.ts
│   │   │   ├── preview-render.service.ts
│   │   │   └── preview-executor.service.ts
│   │   └── dto/
│   │
│   ├── publish/                  # 发布模块（新增核心模块）
│   │   ├── publish.module.ts
│   │   ├── controllers/          # 发布 API
│   │   ├── services/
│   │   │   ├── publish-orchestrator.service.ts   # 发布编排
│   │   │   ├── version-manager.service.ts        # 版本管理
│   │   │   ├── code-generator.service.ts         # 代码生成
│   │   │   ├── build-trigger.service.ts          # 构建触发
│   │   │   └── deployment-manager.service.ts     # 部署管理
│   │   ├── generators/           # 代码生成器
│   │   │   ├── backend/          # 后端代码生成
│   │   │   │   ├── entity.generator.ts
│   │   │   │   ├── dto.generator.ts
│   │   │   │   ├── controller.generator.ts
│   │   │   │   ├── service.generator.ts
│   │   │   │   └── module.generator.ts
│   │   │   ├── frontend/         # 前端代码生成
│   │   │   │   ├── page.generator.ts
│   │   │   │   ├── component.generator.ts
│   │   │   │   ├── router.generator.ts
│   │   │   │   └── api.generator.ts
│   │   │   └── config/           # 配置文件生成
│   │   │       ├── package.generator.ts
│   │   │       └── docker.generator.ts
│   │   ├── entities/
│   │   └── dto/
│   │
│   ├── schema/                   # 数据库结构模块
│   │   ├── schema.module.ts
│   │   └── services/             # DDL 生成、表绑定
│   │
│   └── plugin/                   # 插件模块（重构为编译时）
│       ├── plugin.module.ts
│       ├── services/
│       │   ├── plugin-registry.service.ts    # 插件注册
│       │   ├── plugin-compiler.service.ts    # 插件编译器（新）
│       │   └── plugin-executor.service.ts    # 预览时执行（保留）
│       ├── interfaces/           # 插件接口定义
│       └── plugins/              # 内置插件
```

### 3.2 模块依赖关系

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        模块依赖关系（新架构）                                 │
└─────────────────────────────────────────────────────────────────────────────┘

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
        ├───────────────────┼───────────────────┤
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│                    PublishModule                        │
│                    (发布编排) ★ 核心                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │CodeGenerator│  │BuildTrigger │  │DeployManager│    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
        │
        │ 设计时预览（可选路径）
        ▼
┌───────────────┐
│ PreviewModule │
│ (预览引擎)    │
│ ◎ 仅设计时    │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ SchemaModule  │
│  (DDL 生成)   │
└───────────────┘
```

---

## 4. 核心模块设计

### 4.1 SharedModule（共享模块）

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

### 4.2 MetaModule（元数据模块）

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
```

### 4.3 ConfigModule（配置模块）

**职责**: 管理页面配置、组件配置、模板配置

**详见**: [config-service.md](./config-service.md)

**核心服务**:

| 服务 | 职责 | 变化 |
|-----|------|------|
| ConfigService | 配置的 CRUD | 不变 |
| ConfigVersionService | 配置版本管理 | 从 ConfigPublishService 重命名 |
| ConfigCacheService | 配置缓存管理 | 不变 |
| ConfigSnapshotService | 配置快照服务 | **新增**，为发布提供配置快照 |

**API 路由**:

```
GET    /api/v1/config/:configCode           # 获取配置
POST   /api/v1/config                       # 创建配置
PUT    /api/v1/config/:configCode           # 更新配置
DELETE /api/v1/config/:configCode           # 删除配置
GET    /api/v1/config/:configCode/versions  # 获取版本列表
POST   /api/v1/config/:configCode/snapshot  # 创建配置快照（供发布使用）
```

### 4.4 PreviewModule（预览模块）★ 降级

**职责**: 为设计器提供实时预览能力（运行时解释执行）

**详见**: [runtime-service.md](./runtime-service.md)（更新）

**使用场景**:
- 设计器实时预览
- 配置修改即时生效验证
- **不用于生产环境**

**核心服务**:

| 服务 | 职责 |
|-----|------|
| PreviewQueryService | 预览时的动态查询 |
| PreviewRenderService | 预览时的组件渲染 |
| PreviewExecutorService | 预览时的逻辑执行 |

**API 路由**:

```
# 预览专用接口，带 /preview 前缀
GET    /api/v1/preview/data/:modelCode         # 预览数据查询
GET    /api/v1/preview/page/:pageCode          # 预览页面渲染
POST   /api/v1/preview/action/:actionCode      # 预览操作执行
```

### 4.5 PublishModule（发布模块）★ 新增核心

**职责**: 代码生成、构建编排、部署管理

**详见**: [../05-publish/overview.md](../05-publish/overview.md)

**核心服务**:

| 服务 | 职责 |
|-----|------|
| PublishOrchestratorService | 编排整个发布流程 |
| VersionManagerService | 管理产品版本 |
| CodeGeneratorService | 生成源代码 |
| BuildTriggerService | 触发 CI/CD |
| DeploymentManagerService | 管理部署状态 |

**代码生成器**:

| 生成器 | 输出 |
|--------|------|
| EntityGenerator | `*.entity.ts` |
| DtoGenerator | `*-create.dto.ts`, `*-update.dto.ts` |
| ControllerGenerator | `*.controller.ts` |
| ServiceGenerator | `*.service.ts` |
| ModuleGenerator | `*.module.ts` |
| PageGenerator | `*.vue` |
| RouterGenerator | `router/index.ts` |
| ApiGenerator | `api/*.ts` |

**API 路由**:

```
# 发布管理
POST   /api/v1/publish                         # 发起发布
GET    /api/v1/publish/:jobId/status           # 查询发布状态
POST   /api/v1/publish/:releaseId/rollback     # 回滚发布

# 产品管理
GET    /api/v1/products                        # 获取产品列表
POST   /api/v1/products                        # 创建产品
GET    /api/v1/products/:productId/releases    # 获取产品发布历史

# 构建回调（Jenkins 调用）
POST   /api/v1/publish/callback                # 构建完成回调
```

### 4.6 PluginModule（插件模块）★ 重构

**职责**: 编译时插桩，将插件逻辑编译到生成代码中

**详见**: [plugin-service.md](./plugin-service.md)（更新）

**架构变化**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        插件系统架构变化                                      │
└─────────────────────────────────────────────────────────────────────────────┘

原架构（运行时钩子）:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   请求 ──▶ RuntimeModule ──▶ beforeCreate 钩子 ──▶ 执行 ──▶ afterCreate 钩子│
│                                    │                           │           │
│                           动态查找并执行插件            动态查找并执行插件    │
│                                                                             │
│   问题: 每次请求都要查找和执行插件，有运行时开销                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

新架构（编译时插桩）:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   发布时:                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ 元数据 + 插件配置 ──▶ PluginCompiler ──▶ 生成包含钩子代码的 Service    │  │
│   │                                                                      │  │
│   │ // 生成的 order.service.ts                                           │  │
│   │ async create(dto) {                                                  │  │
│   │   // beforeCreate 钩子代码（编译时插入）                               │  │
│   │   await this.auditPlugin.beforeCreate(dto);                          │  │
│   │   await this.validationPlugin.beforeCreate(dto);                     │  │
│   │                                                                      │  │
│   │   const result = await this.repository.save(dto);                    │  │
│   │                                                                      │  │
│   │   // afterCreate 钩子代码（编译时插入）                                │  │
│   │   await this.notificationPlugin.afterCreate(result);                 │  │
│   │                                                                      │  │
│   │   return result;                                                     │  │
│   │ }                                                                    │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   运行时:                                                                   │
│   请求 ──▶ 直接执行编译后的代码 ──▶ 无额外开销                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**核心服务**:

| 服务 | 职责 | 变化 |
|-----|------|------|
| PluginRegistryService | 插件注册与管理 | 不变 |
| PluginCompilerService | 编译时插桩 | **新增** |
| PluginExecutorService | 预览时执行 | 仅预览时使用 |

**钩子阶段**（保持不变）:

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

### 4.7 SchemaModule（数据库结构模块）

**职责**: DDL 生成、表结构检查、模型与表绑定

**核心服务**:

| 服务 | 职责 |
|-----|------|
| DDLGeneratorService | 生成 DDL 语句 |
| TableInspectorService | 检查表结构与模型差异 |
| TableBindingService | 模型与物理表绑定 |

---

## 5. 横切关注点

### 5.1 租户隔离

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

### 5.2 数据验证

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

### 5.3 异常处理

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

### 5.4 日志与审计

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

## 6. 云阙平台基础能力

### 6.1 @cs/nest-typeorm - 数据库能力

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

### 6.2 @cs/nest-common - 公共能力

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

### 6.3 @cs/nest-redis - 缓存能力

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

### 6.4 @cs/nest-cloud - 微服务能力

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

## 7. 相关文档

| 序号 | 文档 | 状态 | 主要内容 |
|:---:|-----|:----:|---------|
| 1 | [元数据服务设计](./meta-service.md) | ✅ | 模型、字段、关联管理，代码生成器数据源 |
| 2 | [配置服务设计](./config-service.md) | ✅ | 配置 CRUD、版本管理、快照服务 |
| 3 | [预览服务设计](./runtime-service.md) | ✅ | 双模式预览（快速/精确） |
| 4 | [插件系统设计](./plugin-service.md) | ✅ | 编译时插桩 + 预览时执行 |
| 5 | [发布流程设计](../05-publish/overview.md) | ✅ | 代码生成、构建、部署 |

> 图例: ✅ 已完成

---

## 设计决策记录

| 问题 | 决策 | 说明 |
|-----|------|------|
| RuntimeModule 定位 | 降级为预览引擎 | 生产环境使用生成代码 |
| 插件执行方式 | 编译时插桩 | 避免运行时开销 |
| 发布模块位置 | 新增 PublishModule | 核心发布流程独立模块 |
| 预览与生产代码 | 分离 | 预览用解释执行，生产用编译代码 |
| 配置发布流程 | 移交 PublishModule | ConfigModule 专注配置 CRUD |

---
