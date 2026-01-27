# 插件系统设计

> **状态**: 已完成
> **更新日期**: 2025-01-24

---

## 1. 概述

### 1.1 架构演进

在"代码生成 + 构建发布"架构下，插件系统从**运行时钩子**演进为**编译时插桩**：

| 对比项 | 运行时钩子（旧） | 编译时插桩（新） |
|-------|---------------|---------------|
| 执行时机 | 运行时动态查找并执行 | 构建时注入到生成代码中 |
| 性能 | 每次操作都有钩子查找开销 | 零运行时开销 |
| 调试 | 难以追踪执行流程 | 代码可读、可调试 |
| 灵活性 | 运行时可动态启用/禁用 | 需要重新发布生效 |
| 复杂度 | 需要钩子调度引擎 | 直接生成函数调用 |

### 1.2 职责定义

插件系统（PluginModule）在本服务中的职责：

- **插件元数据管理**: 定义插件的配置、代码块、注入点
- **插件代码块存储**: 管理可复用的业务逻辑代码片段
- **为代码生成提供快照**: 将插件配置转换为代码生成器可消费的格式

> **架构说明**: 在统一代码生成架构下，预览和生产环境都使用相同的代码生成逻辑。插件逻辑在代码生成时被编译到 Service 代码中，预览环境通过热重载实现快速更新。

### 1.3 核心概念

```
┌─────────────────────────────────────────────────────────────┐
│                    PluginDefinition                          │
│  代码: audit-log                                             │
│  名称: 操作日志插件                                           │
├─────────────────────────────────────────────────────────────┤
│  CodeBlocks (代码块)                                         │
│  ├── afterCreate: "await this.logService.log(...)"          │
│  ├── afterUpdate: "await this.logService.log(...)"          │
│  └── afterDelete: "await this.logService.log(...)"          │
├─────────────────────────────────────────────────────────────┤
│  Dependencies (依赖)                                         │
│  └── LogService: '@app/services/log.service'                │
├─────────────────────────────────────────────────────────────┤
│  Bindings (绑定)                                             │
│  ├── order.create → afterCreate                             │
│  ├── order.update → afterUpdate                             │
│  └── user.* → afterCreate, afterUpdate, afterDelete         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 数据模型

### 2.1 插件定义 (PluginDefinition)

```typescript
interface PluginDefinition {
  id: string;                       // 主键
  code: string;                     // 插件代码（唯一标识）
  name: string;                     // 插件名称
  description?: string;             // 描述
  version: string;                  // 版本号

  // 代码块定义
  codeBlocks: CodeBlockDefinition[];

  // 依赖声明
  dependencies: DependencyDefinition[];

  // 插件配置
  config?: PluginConfig;

  status: PluginStatus;             // 状态
  tenant: string;
}

enum PluginStatus {
  DRAFT = 'draft',                  // 草稿
  PUBLISHED = 'published',          // 已发布
  DEPRECATED = 'deprecated',        // 已废弃
}

interface PluginConfig {
  priority?: number;                // 优先级（同阶段多插件时的执行顺序）
  scope?: PluginScope;              // 作用域
  options?: Record<string, any>;    // 自定义配置
}

enum PluginScope {
  GLOBAL = 'global',                // 全局插件
  MODULE = 'module',                // 模块级
  MODEL = 'model',                  // 模型级
}
```

### 2.2 代码块定义 (CodeBlockDefinition)

```typescript
interface CodeBlockDefinition {
  id: string;
  pluginId: string;                 // 所属插件
  hook: HookStage;                  // 钩子阶段
  code: string;                     // TypeScript 代码片段

  // 代码块配置
  isAsync: boolean;                 // 是否异步
  abortOnError: boolean;            // 出错时是否中止操作
  condition?: string;               // 执行条件表达式

  // 代码元数据
  parameters?: ParameterDefinition[]; // 可配置参数
}

enum HookStage {
  BEFORE_CREATE = 'beforeCreate',
  AFTER_CREATE = 'afterCreate',
  BEFORE_UPDATE = 'beforeUpdate',
  AFTER_UPDATE = 'afterUpdate',
  BEFORE_DELETE = 'beforeDelete',
  AFTER_DELETE = 'afterDelete',
  BEFORE_QUERY = 'beforeQuery',
  AFTER_QUERY = 'afterQuery',
}

interface ParameterDefinition {
  name: string;                     // 参数名
  type: string;                     // 参数类型
  defaultValue?: any;               // 默认值
  description?: string;             // 描述
}
```

### 2.3 依赖定义 (DependencyDefinition)

```typescript
interface DependencyDefinition {
  name: string;                     // 依赖名称（在代码块中使用）
  type: DependencyType;             // 依赖类型
  importPath: string;               // 导入路径
  importName?: string;              // 导入名称（默认同 name）
}

enum DependencyType {
  SERVICE = 'service',              // 服务依赖（通过 DI 注入）
  UTILITY = 'utility',              // 工具函数（静态导入）
  TYPE = 'type',                    // 类型定义
}
```

### 2.4 插件绑定 (PluginBinding)

```typescript
interface PluginBinding {
  id: string;
  pluginId: string;                 // 插件ID
  codeBlockId: string;              // 代码块ID

  // 绑定目标
  targetType: BindingTargetType;    // 绑定类型
  targetPattern: string;            // 目标模式（支持通配符）

  // 绑定配置
  enabled: boolean;                 // 是否启用
  priority?: number;                // 覆盖插件默认优先级
  parameterValues?: Record<string, any>; // 参数值
}

enum BindingTargetType {
  MODEL = 'model',                  // 绑定到模型（如 "user"）
  ACTION = 'action',                // 绑定到操作（如 "user.create"）
  MODULE = 'module',                // 绑定到模块（如 "crm.*"）
}
```

---

## 3. 服务设计

### 3.1 服务列表

| 服务 | 职责 |
|-----|------|
| PluginService | 插件定义的 CRUD、发布 |
| CodeBlockService | 代码块的 CRUD |
| PluginBindingService | 插件绑定的 CRUD |
| PluginSnapshotProvider | 为代码生成器提供插件快照 |

### 3.2 PluginService

```typescript
@Injectable()
export class PluginService {
  constructor(
    @InjectRepository({ entity: PluginDefinitionEntity })
    private readonly pluginRepository: PluginRepository,
  ) {}

  // 创建插件
  async create(dto: CreatePluginDto): Promise<PluginDefinitionEntity>;

  // 更新插件
  async update(id: string, dto: UpdatePluginDto): Promise<PluginDefinitionEntity>;

  // 根据代码查询
  async findByCode(code: string): Promise<PluginDefinitionEntity | null>;

  // 获取已发布的插件列表
  async findPublished(): Promise<PluginDefinitionEntity[]>;

  // 发布插件
  async publish(id: string): Promise<PluginDefinitionEntity>;

  // 废弃插件
  async deprecate(id: string): Promise<void>;
}
```

### 3.3 CodeBlockService

```typescript
@Injectable()
export class CodeBlockService {
  // 创建代码块
  async create(pluginId: string, dto: CreateCodeBlockDto): Promise<CodeBlockEntity>;

  // 更新代码块
  async update(id: string, dto: UpdateCodeBlockDto): Promise<CodeBlockEntity>;

  // 获取插件的所有代码块
  async findByPluginId(pluginId: string): Promise<CodeBlockEntity[]>;

  // 验证代码块语法
  async validateSyntax(code: string): Promise<ValidationResult>;

  // 删除代码块
  async delete(id: string): Promise<void>;
}

interface ValidationResult {
  valid: boolean;
  errors?: Array<{ line: number; message: string }>;
}
```

### 3.4 PluginBindingService

```typescript
@Injectable()
export class PluginBindingService {
  // 创建绑定
  async create(dto: CreateBindingDto): Promise<PluginBindingEntity>;

  // 获取模型的所有绑定
  async findByModel(modelCode: string): Promise<PluginBindingEntity[]>;

  // 获取操作的所有绑定（包括模型级和模块级继承）
  async findByAction(modelCode: string, actionCode: string): Promise<ResolvedBinding[]>;

  // 批量更新绑定
  async batchUpdate(bindings: UpdateBindingDto[]): Promise<void>;

  // 启用/禁用绑定
  async setEnabled(id: string, enabled: boolean): Promise<void>;
}

interface ResolvedBinding {
  binding: PluginBindingEntity;
  plugin: PluginDefinitionEntity;
  codeBlock: CodeBlockEntity;
  priority: number;                 // 解析后的优先级
}
```

### 3.5 PluginSnapshotProvider

```typescript
@Injectable()
export class PluginSnapshotProvider {
  constructor(
    private readonly pluginService: PluginService,
    private readonly codeBlockService: CodeBlockService,
    private readonly bindingService: PluginBindingService,
  ) {}

  /**
   * 获取模型操作的插件代码块
   * 供代码生成器在生成 Service 时使用
   */
  async getActionPlugins(
    modelCode: string,
    actionCode: string,
  ): Promise<ActionPluginSnapshot> {
    const bindings = await this.bindingService.findByAction(modelCode, actionCode);

    // 按钩子阶段分组，按优先级排序
    const hookGroups = new Map<HookStage, ResolvedCodeBlock[]>();

    for (const { plugin, codeBlock, priority } of bindings) {
      const stage = codeBlock.hook;
      if (!hookGroups.has(stage)) {
        hookGroups.set(stage, []);
      }
      hookGroups.get(stage)!.push({
        pluginCode: plugin.code,
        code: codeBlock.code,
        isAsync: codeBlock.isAsync,
        abortOnError: codeBlock.abortOnError,
        condition: codeBlock.condition,
        priority,
      });
    }

    // 每个阶段按优先级排序
    for (const [stage, blocks] of hookGroups) {
      blocks.sort((a, b) => a.priority - b.priority);
    }

    return {
      modelCode,
      actionCode,
      hooks: hookGroups,
      dependencies: this.collectDependencies(bindings),
    };
  }

  /**
   * 收集所有插件的依赖
   */
  private collectDependencies(bindings: ResolvedBinding[]): DependencyDefinition[] {
    const deps = new Map<string, DependencyDefinition>();
    for (const { plugin } of bindings) {
      for (const dep of plugin.dependencies) {
        deps.set(dep.name, dep);
      }
    }
    return Array.from(deps.values());
  }
}

interface ActionPluginSnapshot {
  modelCode: string;
  actionCode: string;
  hooks: Map<HookStage, ResolvedCodeBlock[]>;
  dependencies: DependencyDefinition[];
}

interface ResolvedCodeBlock {
  pluginCode: string;
  code: string;
  isAsync: boolean;
  abortOnError: boolean;
  condition?: string;
  priority: number;
}
```

---

## 4. 与发布服务的交互

> 本节描述发布服务如何消费本服务提供的插件快照进行代码生成。

### 4.1 交互流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   发布服务（独立部署）                    本服务（assembox-service）          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  CodeGenerator  │     │ PluginSnapshot  │     │   PluginModule  │
│  （发布服务）     │     │   Provider      │     │   (数据库)       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. 请求 user.create  │                       │
         │      的插件配置       │                       │
         │──────────────────────>│                       │
         │       (RPC 调用)      │  2. 查询绑定          │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │  3. 返回绑定数据      │
         │                       │<──────────────────────│
         │                       │                       │
         │  4. 返回插件快照      │                       │
         │      (按阶段分组)     │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  5. 生成 Service 代码 │                       │
         │     (内联插件调用)    │                       │
```

### 4.2 发布服务生成的代码结构

发布服务根据插件快照生成包含插件调用的 Service 代码。

**原始（无插件）**：

```typescript
@Injectable()
export class UserService {
  async create(dto: CreateUserDto): Promise<UserEntity> {
    const entity = this.repository.create(dto);
    return await this.repository.save(entity);
  }
}
```

**生成后（包含插件）**：

```typescript
@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepository,
    // 插件依赖自动注入
    private readonly logService: LogService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserEntity> {
    // ═══════════════════════════════════════
    // beforeCreate hooks
    // ═══════════════════════════════════════

    // [Plugin: validation] priority: 10
    {
      if (dto.email && !this.isValidEmail(dto.email)) {
        throw new BadRequestException('邮箱格式不正确');
      }
    }

    // [Plugin: default-values] priority: 20
    {
      dto.status = dto.status ?? 'active';
      dto.createdAt = new Date();
    }

    // ═══════════════════════════════════════
    // Core Operation
    // ═══════════════════════════════════════
    const entity = this.repository.create(dto);
    const result = await this.repository.save(entity);

    // ═══════════════════════════════════════
    // afterCreate hooks
    // ═══════════════════════════════════════

    // [Plugin: audit-log] priority: 100
    {
      await this.logService.log({
        action: 'CREATE',
        model: 'user',
        recordId: result.id,
        data: dto,
        userId: this.contextService.getUserId(),
      });
    }

    // [Plugin: notification] priority: 200 (async, non-blocking)
    this.notificationService.sendWelcomeEmail(result.email).catch(e => {
      console.error('Notification failed:', e);
    });

    return result;
  }
}
```

### 4.3 条件执行

```typescript
// 代码块定义
{
  hook: 'afterCreate',
  code: 'await this.notificationService.sendWelcomeEmail(result.email);',
  condition: "dto.sendWelcomeEmail === true"
}

// 生成的代码
if (dto.sendWelcomeEmail === true) {
  await this.notificationService.sendWelcomeEmail(result.email);
}
```

### 4.4 错误处理

```typescript
// abortOnError: true（默认）- 错误时中止操作
{
  if (dto.amount > 10000) {
    throw new BadRequestException('金额超过限制');
  }
}

// abortOnError: false - 错误时继续执行
try {
  await this.logService.log({ ... });
} catch (e) {
  console.error('[audit-log] Hook failed:', e);
}
```

---

## 5. 插件定义示例

### 5.1 审计日志插件

```json
{
  "code": "audit-log",
  "name": "审计日志插件",
  "version": "1.0.0",
  "dependencies": [
    {
      "name": "logService",
      "type": "service",
      "importPath": "@app/services/log.service",
      "importName": "LogService"
    }
  ],
  "codeBlocks": [
    {
      "hook": "afterCreate",
      "isAsync": true,
      "abortOnError": false,
      "code": "await this.logService.log({ action: 'CREATE', model: '${modelCode}', recordId: result.id, data: dto, userId: this.contextService.getUserId() });"
    },
    {
      "hook": "afterUpdate",
      "isAsync": true,
      "abortOnError": false,
      "code": "await this.logService.log({ action: 'UPDATE', model: '${modelCode}', recordId: dto.id, data: dto, userId: this.contextService.getUserId() });"
    },
    {
      "hook": "afterDelete",
      "isAsync": true,
      "abortOnError": false,
      "code": "await this.logService.log({ action: 'DELETE', model: '${modelCode}', recordId: id, userId: this.contextService.getUserId() });"
    }
  ],
  "config": {
    "priority": 100,
    "scope": "global"
  }
}
```

### 5.2 数据脱敏插件

```json
{
  "code": "data-masking",
  "name": "数据脱敏插件",
  "version": "1.0.0",
  "dependencies": [
    {
      "name": "maskUtils",
      "type": "utility",
      "importPath": "@app/utils/mask",
      "importName": "MaskUtils"
    }
  ],
  "codeBlocks": [
    {
      "hook": "afterQuery",
      "isAsync": false,
      "abortOnError": false,
      "code": "result = Array.isArray(result) ? result.map(r => maskUtils.maskSensitiveFields(r, ['phone', 'idCard', 'email'])) : maskUtils.maskSensitiveFields(result, ['phone', 'idCard', 'email']);",
      "parameters": [
        {
          "name": "sensitiveFields",
          "type": "string[]",
          "defaultValue": ["phone", "idCard", "email"],
          "description": "需要脱敏的字段列表"
        }
      ]
    }
  ],
  "config": {
    "priority": 50,
    "scope": "model"
  }
}
```

### 5.3 业务验证插件（模型专用）

```json
{
  "code": "order-validation",
  "name": "订单验证插件",
  "version": "1.0.0",
  "dependencies": [
    {
      "name": "inventoryService",
      "type": "service",
      "importPath": "@app/modules/inventory/inventory.service",
      "importName": "InventoryService"
    }
  ],
  "codeBlocks": [
    {
      "hook": "beforeCreate",
      "isAsync": true,
      "abortOnError": true,
      "code": "const stock = await this.inventoryService.getStock(dto.productId); if (stock < dto.quantity) { throw new BadRequestException(`库存不足，当前库存: ${stock}`); } await this.inventoryService.reserve(dto.productId, dto.quantity);"
    }
  ],
  "config": {
    "priority": 10,
    "scope": "model"
  }
}
```

---

## 6. 绑定配置

### 6.1 绑定模式

```typescript
// 绑定到单个模型的所有操作
{
  targetType: 'model',
  targetPattern: 'user',        // 匹配 user 模型
}

// 绑定到模型的特定操作
{
  targetType: 'action',
  targetPattern: 'user.create', // 匹配 user 模型的 create 操作
}

// 绑定到模块（通配符）
{
  targetType: 'module',
  targetPattern: 'crm.*',       // 匹配 crm 模块下所有模型
}

// 全局绑定
{
  targetType: 'module',
  targetPattern: '*',           // 匹配所有模型
}
```

### 6.2 优先级规则

当多个插件绑定到同一个操作的同一个钩子阶段时，按以下规则确定执行顺序：

1. 绑定级优先级（如果指定）
2. 插件级优先级
3. 默认优先级（100）

数字越小，优先级越高，越先执行。

---

## 7. API 设计

### 7.1 插件管理 API

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/plugins | 获取插件列表 |
| GET | /api/v1/plugins/:code | 获取插件详情（含代码块） |
| POST | /api/v1/plugins | 创建插件 |
| PUT | /api/v1/plugins/:code | 更新插件 |
| DELETE | /api/v1/plugins/:code | 删除插件 |
| POST | /api/v1/plugins/:code/publish | 发布插件 |
| POST | /api/v1/plugins/:code/deprecate | 废弃插件 |

### 7.2 代码块 API

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/plugins/:code/blocks | 获取代码块列表 |
| POST | /api/v1/plugins/:code/blocks | 创建代码块 |
| PUT | /api/v1/plugins/:code/blocks/:blockId | 更新代码块 |
| DELETE | /api/v1/plugins/:code/blocks/:blockId | 删除代码块 |
| POST | /api/v1/plugins/:code/blocks/validate | 验证代码块语法 |

### 7.3 绑定 API

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/plugin-bindings | 获取绑定列表 |
| GET | /api/v1/plugin-bindings/model/:modelCode | 获取模型的绑定 |
| POST | /api/v1/plugin-bindings | 创建绑定 |
| PUT | /api/v1/plugin-bindings/:id | 更新绑定 |
| DELETE | /api/v1/plugin-bindings/:id | 删除绑定 |
| POST | /api/v1/plugin-bindings/batch | 批量更新绑定 |

---

## 8. 统一代码生成架构

在统一代码生成架构下，预览和生产环境使用相同的代码生成逻辑：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     插件在统一架构中的处理流程                                 │
└─────────────────────────────────────────────────────────────────────────────┘

     插件配置变更                     代码生成                    预览/生产
    ┌──────────────┐              ┌──────────────┐           ┌──────────────┐
    │ PluginModule │  ──快照──▶  │ CodeGenerator │  ──生成──▶│ Service 代码 │
    │              │              │ (相同逻辑)    │           │ (包含插件)   │
    └──────────────┘              └──────────────┘           └──────────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          │                             │
                          ▼                             ▼
                   ┌──────────────┐              ┌──────────────┐
                   │ 预览环境      │              │ 生产环境      │
                   │ (热重载更新)  │              │ (完整构建)    │
                   └──────────────┘              └──────────────┘
```

**优势**:

| 特性 | 说明 |
|-----|------|
| 规则一致 | 预览和生产的插件行为完全相同 |
| 所见即所得 | 预览时即可验证插件效果 |
| 调试友好 | 预览时也是真实代码，可断点调试 |

---

## 9. 相关文档

### 9.1 本服务文档

- [服务层概述](./overview.md)
- [元数据服务设计](./meta-service.md)
- [预览服务设计](./runtime-service.md)

### 9.2 发布服务文档

- [代码生成设计](../05-publish/code-generation.md) - 发布服务如何消费插件快照进行代码生成
