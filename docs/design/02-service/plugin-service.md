# 插件系统设计

> **状态**: 设计中
> **更新日期**: 2025-01-20

---

## 1. 概述

### 1.1 职责定义

插件系统（PluginModule）提供扩展机制，允许在数据操作的关键节点注入自定义业务逻辑：

- **钩子机制**: 在数据操作前后执行自定义逻辑
- **插件注册**: 管理插件的注册、启用、禁用
- **优先级控制**: 按优先级顺序执行多个插件

### 1.2 应用场景

| 场景 | 钩子阶段 | 说明 |
|-----|---------|------|
| 数据校验 | beforeCreate/beforeUpdate | 业务规则验证 |
| 默认值填充 | beforeCreate | 自动填充业务字段 |
| 数据脱敏 | afterQuery | 敏感数据脱敏处理 |
| 操作日志 | afterCreate/afterUpdate/afterDelete | 记录操作日志 |
| 级联操作 | afterDelete | 清理关联数据 |
| 消息通知 | afterCreate | 发送通知 |
| 数据同步 | afterCreate/afterUpdate | 同步到其他系统 |

---

## 2. 核心接口

### 2.1 钩子阶段

```typescript
enum HookStage {
  BEFORE_CREATE = 'beforeCreate',   // 创建前
  AFTER_CREATE = 'afterCreate',     // 创建后
  BEFORE_UPDATE = 'beforeUpdate',   // 更新前
  AFTER_UPDATE = 'afterUpdate',     // 更新后
  BEFORE_DELETE = 'beforeDelete',   // 删除前
  AFTER_DELETE = 'afterDelete',     // 删除后
  BEFORE_QUERY = 'beforeQuery',     // 查询前
  AFTER_QUERY = 'afterQuery',       // 查询后
  ON_ERROR = 'onError',             // 发生错误时
}
```

### 2.2 钩子上下文

```typescript
interface HookContext {
  // 模型信息
  modelCode: string;              // 模型代码
  modelId: string;                // 模型ID

  // 操作信息
  actionCode: string;             // 操作代码
  stage: HookStage;               // 当前钩子阶段

  // 数据
  data?: Record<string, any>;     // 操作数据（创建/更新时）
  result?: any;                   // 操作结果（after* 钩子）
  error?: Error;                  // 错误信息（onError 钩子）

  // 请求上下文
  tenantCode: string;             // 租户代码
  userId?: string;                // 当前用户ID
  userName?: string;              // 当前用户姓名

  // 元数据（插件间传递数据）
  metadata?: Record<string, any>;
}
```

### 2.3 钩子执行结果

```typescript
interface HookResult {
  // 是否中止后续操作
  abort?: boolean;
  // 中止原因
  abortReason?: string;
  // 修改后的数据（会传递给下一个钩子）
  data?: Record<string, any>;
  // 附加元数据
  metadata?: Record<string, any>;
}
```

### 2.4 插件接口

```typescript
interface IPlugin {
  // 唯一标识
  code: string;
  // 插件名称
  name: string;
  // 描述
  description?: string;
  // 版本
  version: string;
  // 是否启用
  enabled: boolean;
  // 优先级（数字越小优先级越高）
  priority?: number;

  // 生命周期方法
  onInit?(): Promise<void>;
  onDestroy?(): Promise<void>;

  // 获取钩子处理器
  getHook(stage: HookStage): HookHandler | undefined;
  getAllHooks(): Map<HookStage, HookHandler>;
}

type HookHandler = (context: HookContext) => Promise<HookResult | void>;
```

---

## 3. 服务设计

### 3.1 PluginRegistryService

```typescript
@Injectable()
export class PluginRegistryService {
  private plugins: Map<string, PluginRegistration> = new Map();

  // 注册插件
  register(plugin: IPlugin, config?: PluginConfig): void;

  // 注销插件
  unregister(pluginCode: string): void;

  // 获取插件
  getPlugin(pluginCode: string): IPlugin | undefined;

  // 获取所有启用的插件
  getEnabledPlugins(): IPlugin[];

  // 获取指定阶段的插件（按优先级排序）
  getPluginsForStage(stage: HookStage): IPlugin[];

  // 启用/禁用插件
  setPluginEnabled(pluginCode: string, enabled: boolean): void;

  // 更新插件优先级
  setPluginPriority(pluginCode: string, priority: number): void;

  // 获取插件列表
  listPlugins(): PluginInfo[];
}

interface PluginRegistration {
  plugin: IPlugin;
  config: PluginConfig;
  registeredAt: Date;
}

interface PluginConfig {
  code: string;
  enabled: boolean;
  priority?: number;
  options?: Record<string, any>;
}

interface PluginInfo {
  code: string;
  name: string;
  version: string;
  enabled: boolean;
  priority: number;
  supportedStages: HookStage[];
}
```

### 3.2 PluginExecutorService

```typescript
@Injectable()
export class PluginExecutorService {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}

  // 执行指定阶段的所有钩子
  async executeHooks(stage: HookStage, context: HookContext, config?: HookExecutionConfig): Promise<HookExecutionResult>;

  // 快捷方法
  async executeBeforeCreate(context: HookContext): Promise<HookExecutionResult>;
  async executeAfterCreate(context: HookContext): Promise<HookExecutionResult>;
  async executeBeforeUpdate(context: HookContext): Promise<HookExecutionResult>;
  async executeAfterUpdate(context: HookContext): Promise<HookExecutionResult>;
  async executeBeforeDelete(context: HookContext): Promise<HookExecutionResult>;
  async executeAfterDelete(context: HookContext): Promise<HookExecutionResult>;
  async executeBeforeQuery(context: HookContext): Promise<HookExecutionResult>;
  async executeAfterQuery(context: HookContext): Promise<HookExecutionResult>;
  async executeOnError(context: HookContext): Promise<HookExecutionResult>;
}

interface HookExecutionConfig {
  timeout?: number;           // 超时时间（毫秒），默认 30000
  continueOnError?: boolean;  // 错误时是否继续执行
  async?: boolean;            // 是否异步执行（不等待结果）
}

interface HookExecutionResult {
  success: boolean;           // 是否成功
  aborted: boolean;           // 是否被中止
  abortReason?: string;       // 中止原因
  modifiedData?: Record<string, any>; // 修改后的数据
  errors: Array<{ pluginCode: string; error: string }>;
  executedPlugins: string[];  // 已执行的插件
}
```

---

## 4. 执行流程

### 4.1 钩子执行顺序

```
┌─────────────────────────────────────────────────────────────────┐
│                        插件执行流程                              │
└─────────────────────────────────────────────────────────────────┘

1. 获取该阶段启用的插件列表
2. 按优先级排序（priority 小的先执行）
3. 依次执行每个插件的钩子

┌─────────────────────────────────────────────────────────────────┐
│  Plugin A (priority: 1)                                        │
│  ┌─────────────┐                                               │
│  │ beforeCreate│ ──▶ 修改数据 / 返回 abort                      │
│  └─────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ 传递修改后的数据
┌─────────────────────────────────────────────────────────────────┐
│  Plugin B (priority: 10)                                       │
│  ┌─────────────┐                                               │
│  │ beforeCreate│ ──▶ 继续处理 / 验证数据                        │
│  └─────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  执行数据库操作（如果没有被 abort）                               │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 数据传递

```typescript
// Plugin A 的钩子
async beforeCreate(context: HookContext): Promise<HookResult> {
  // 修改数据
  return {
    data: {
      ...context.data,
      processedBy: 'PluginA',
    },
    metadata: {
      pluginAExecuted: true,
    },
  };
}

// Plugin B 的钩子（接收 Plugin A 修改后的数据）
async beforeCreate(context: HookContext): Promise<HookResult> {
  console.log(context.data.processedBy); // 'PluginA'
  console.log(context.metadata.pluginAExecuted); // true

  return {
    data: {
      ...context.data,
      processedBy: 'PluginB',
    },
  };
}
```

### 4.3 中止操作

```typescript
// 验证插件：如果数据不符合要求，中止操作
async beforeCreate(context: HookContext): Promise<HookResult> {
  if (context.data.amount > 10000) {
    return {
      abort: true,
      abortReason: '金额超过限制，需要审批',
    };
  }
  return {};
}
```

### 4.4 错误处理

```typescript
// 默认行为：单个插件出错时中止后续插件执行
// 可配置 continueOnError: true 继续执行

// onError 钩子用于处理操作过程中的错误
async onError(context: HookContext): Promise<HookResult> {
  // 记录错误日志
  await this.logService.error({
    modelCode: context.modelCode,
    action: context.actionCode,
    error: context.error.message,
    userId: context.userId,
  });
  return {};
}
```

---

## 5. 插件实现示例

### 5.1 基础插件类

```typescript
export abstract class BasePlugin implements IPlugin {
  abstract code: string;
  abstract name: string;
  description?: string;
  version: string = '1.0.0';
  enabled: boolean = true;
  priority: number = 100;

  protected hooks: Map<HookStage, HookHandler> = new Map();

  async onInit(): Promise<void> {}
  async onDestroy(): Promise<void> {}

  getHook(stage: HookStage): HookHandler | undefined {
    return this.hooks.get(stage);
  }

  getAllHooks(): Map<HookStage, HookHandler> {
    return this.hooks;
  }

  protected registerHook(stage: HookStage, handler: HookHandler): void {
    this.hooks.set(stage, handler.bind(this));
  }
}
```

### 5.2 操作日志插件

```typescript
@Injectable()
export class AuditLogPlugin extends BasePlugin {
  code = 'audit-log';
  name = '操作日志插件';
  description = '记录数据变更操作日志';
  priority = 1000; // 低优先级，在其他插件之后执行

  constructor(private readonly logService: LogService) {
    super();
    this.registerHook(HookStage.AFTER_CREATE, this.afterCreate);
    this.registerHook(HookStage.AFTER_UPDATE, this.afterUpdate);
    this.registerHook(HookStage.AFTER_DELETE, this.afterDelete);
  }

  private async afterCreate(context: HookContext): Promise<HookResult> {
    await this.logService.create({
      action: 'CREATE',
      modelCode: context.modelCode,
      recordId: context.result?.id,
      data: context.data,
      userId: context.userId,
      userName: context.userName,
      tenantCode: context.tenantCode,
    });
    return {};
  }

  private async afterUpdate(context: HookContext): Promise<HookResult> {
    await this.logService.create({
      action: 'UPDATE',
      modelCode: context.modelCode,
      recordId: context.data?.id,
      data: context.data,
      userId: context.userId,
      userName: context.userName,
      tenantCode: context.tenantCode,
    });
    return {};
  }

  private async afterDelete(context: HookContext): Promise<HookResult> {
    await this.logService.create({
      action: 'DELETE',
      modelCode: context.modelCode,
      recordId: context.data?.id,
      userId: context.userId,
      userName: context.userName,
      tenantCode: context.tenantCode,
    });
    return {};
  }
}
```

### 5.3 数据脱敏插件

```typescript
@Injectable()
export class DataMaskingPlugin extends BasePlugin {
  code = 'data-masking';
  name = '数据脱敏插件';
  priority = 50;

  // 敏感字段配置
  private sensitiveFields = {
    phone: (v: string) => v.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
    idCard: (v: string) => v.replace(/(\d{4})\d{10}(\d{4})/, '$1**********$2'),
    email: (v: string) => v.replace(/(.{2}).*(@.*)/, '$1***$2'),
  };

  constructor() {
    super();
    this.registerHook(HookStage.AFTER_QUERY, this.afterQuery);
  }

  private async afterQuery(context: HookContext): Promise<HookResult> {
    if (!context.result) return {};

    const masked = Array.isArray(context.result)
      ? context.result.map(item => this.maskRecord(item))
      : this.maskRecord(context.result);

    return { data: masked };
  }

  private maskRecord(record: Record<string, any>): Record<string, any> {
    const masked = { ...record };
    for (const [field, maskFn] of Object.entries(this.sensitiveFields)) {
      if (masked[field]) {
        masked[field] = maskFn(masked[field]);
      }
    }
    return masked;
  }
}
```

### 5.4 业务验证插件

```typescript
@Injectable()
export class OrderValidationPlugin extends BasePlugin {
  code = 'order-validation';
  name = '订单验证插件';
  priority = 10;

  constructor(private readonly inventoryService: InventoryService) {
    super();
    this.registerHook(HookStage.BEFORE_CREATE, this.beforeCreate);
  }

  private async beforeCreate(context: HookContext): Promise<HookResult> {
    // 仅处理订单模型
    if (context.modelCode !== 'order') return {};

    const { productId, quantity } = context.data;

    // 检查库存
    const stock = await this.inventoryService.getStock(productId);
    if (stock < quantity) {
      return {
        abort: true,
        abortReason: `库存不足，当前库存: ${stock}`,
      };
    }

    // 预扣库存
    await this.inventoryService.reserve(productId, quantity);

    return {
      metadata: {
        stockReserved: true,
        reservedQuantity: quantity,
      },
    };
  }
}
```

---

## 6. 插件配置

### 6.1 模型级别配置

通过操作定义（ActionDefinition）配置钩子：

```typescript
// 模型的操作定义
{
  "code": "create",
  "name": "创建订单",
  "actionType": "create",
  "hooks": {
    "before": ["order-validation", "inventory-check"],
    "after": ["audit-log", "notification"]
  }
}
```

### 6.2 全局插件配置

```typescript
// 插件模块配置
@Module({
  providers: [
    PluginRegistryService,
    PluginExecutorService,
    // 注册内置插件
    AuditLogPlugin,
    DataMaskingPlugin,
    {
      provide: 'PLUGIN_INITIALIZER',
      useFactory: (registry: PluginRegistryService, ...plugins: IPlugin[]) => {
        plugins.forEach(plugin => registry.register(plugin));
      },
      inject: [PluginRegistryService, AuditLogPlugin, DataMaskingPlugin],
    },
  ],
})
export class PluginModule {}
```

---

## 7. 执行配置

### 7.1 超时控制

```typescript
// 默认超时 30 秒
await pluginExecutor.executeHooks(HookStage.BEFORE_CREATE, context, {
  timeout: 5000, // 5 秒超时
});
```

### 7.2 错误处理策略

```typescript
// 默认：出错即停止
await pluginExecutor.executeHooks(HookStage.BEFORE_CREATE, context);

// 继续执行：即使某个插件出错也继续
await pluginExecutor.executeHooks(HookStage.AFTER_CREATE, context, {
  continueOnError: true,
});
```

### 7.3 异步执行

```typescript
// 不等待结果（适用于日志、通知等非关键操作）
await pluginExecutor.executeHooks(HookStage.AFTER_CREATE, context, {
  async: true,
});
```

---

## 8. 相关文档

- [服务层概述](./overview.md)
- [运行时服务设计](./runtime-service.md)
- [元数据服务设计](./meta-service.md)
