# 服务编排设计

> **状态**: 设计中
> **更新日期**: 2025-01-26

---

## 目录

1. [概述](#1-概述)
2. [元数据结构](#2-元数据结构)
3. [节点类型](#3-节点类型)
4. [代码生成](#4-代码生成)
5. [完整示例](#5-完整示例)
6. [API 设计](#6-api-设计)
7. [相关文档](#7-相关文档)

---

## 1. 概述

### 1.1 设计目标

服务编排（ServiceOrchestration）用于定义复杂的业务流程，支持：

| 能力 | 说明 |
|-----|------|
| **多步骤流程** | 按顺序执行多个操作，支持事务管理 |
| **条件分支** | 根据条件执行不同的逻辑路径 |
| **跨模型操作** | 一次请求操作多个模型，保证数据一致性 |
| **异步任务** | 同步返回后，后台异步执行耗时操作 |
| **并行执行** | 多个独立操作并行执行，提升性能 |
| **循环处理** | 批量数据的循环处理 |

### 1.2 核心概念

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        服务编排核心概念                                        │
└─────────────────────────────────────────────────────────────────────────────┘

    ServiceFlow（服务流程）
    ┌─────────────────────────────────────────────────────────────────────────┐
    │  flowCode: "order-create-flow"                                          │
    │  name: "订单创建流程"                                                    │
    │                                                                         │
    │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐             │
    │  │ 验证库存 │ ──▶│ 创建订单 │ ──▶│ 扣减库存 │ ──▶│ 发送通知 │             │
    │  │(operation)│   │(operation)│   │(operation)│   │ (async) │             │
    │  └─────────┘    └─────────┘    └─────────┘    └─────────┘             │
    │       │                                                                 │
    │       ▼                                                                 │
    │  ┌─────────┐                                                           │
    │  │ 库存不足 │ ──▶ 抛出异常                                               │
    │  │(condition)│                                                          │
    │  └─────────┘                                                           │
    └─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 与现有概念的关系

| 概念 | 定位 | 关系 |
|-----|------|------|
| **Model** | 数据模型 | ServiceFlow 操作 Model |
| **Action** | 模型操作 | ServiceFlow 编排多个 Action |
| **Plugin** | 钩子扩展 | Plugin 在 Action 执行前后触发 |
| **ServiceFlow** | 流程编排 | 编排多个 Action + 条件 + 异步 |

```
层次关系:
┌─────────────────────────────────────────────────────────────────────────────┐
│  ServiceFlow（业务流程）                                                      │
│    └── 编排多个步骤                                                          │
│          ├── Action 1（模型操作）                                            │
│          │     ├── Plugin: beforeCreate                                    │
│          │     ├── 核心逻辑                                                  │
│          │     └── Plugin: afterCreate                                     │
│          ├── Condition（条件判断）                                           │
│          ├── Action 2（模型操作）                                            │
│          └── Async（异步任务）                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 元数据结构

### 2.1 ServiceFlow 定义

```typescript
/**
 * 服务流程定义
 */
interface ServiceFlow {
  /** 流程代码（唯一标识）*/
  flowCode: string;

  /** 流程名称 */
  flowName: string;

  /** 所属模块 */
  moduleCode: string;

  /** 流程描述 */
  description?: string;

  /** 入参定义 */
  input: FlowInput;

  /** 出参定义 */
  output: FlowOutput;

  /** 流程节点（按执行顺序） */
  nodes: FlowNode[];

  /** 事务配置 */
  transaction?: TransactionConfig;

  /** 错误处理 */
  errorHandling?: ErrorHandlingConfig;
}

/**
 * 入参定义
 */
interface FlowInput {
  /** 参数列表 */
  params: FlowParam[];
}

interface FlowParam {
  /** 参数名 */
  name: string;

  /** 参数类型 */
  type: ParamType;

  /** 是否必填 */
  required: boolean;

  /** 默认值 */
  defaultValue?: any;

  /** 参数描述 */
  description?: string;

  /** 验证规则 */
  validations?: ValidationRule[];
}

type ParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'object'
  | 'array'
  | { ref: string }; // 引用其他模型的类型

/**
 * 出参定义
 */
interface FlowOutput {
  /** 输出类型 */
  type: ParamType;

  /** 输出映射（从哪个节点的输出取值） */
  mapping?: OutputMapping;
}

interface OutputMapping {
  /** 源节点 */
  nodeId: string;

  /** 字段路径（支持嵌套，如 "result.id"） */
  path?: string;
}

/**
 * 事务配置
 */
interface TransactionConfig {
  /** 是否启用事务 */
  enabled: boolean;

  /** 隔离级别 */
  isolationLevel?: 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 错误处理配置
 */
interface ErrorHandlingConfig {
  /** 默认错误处理方式 */
  defaultStrategy: 'throw' | 'continue' | 'rollback';

  /** 重试配置 */
  retry?: {
    maxAttempts: number;
    delay: number;
    backoffMultiplier?: number;
  };
}
```

### 2.2 FlowNode 定义

```typescript
/**
 * 流程节点（联合类型）
 */
type FlowNode =
  | OperationNode      // 操作节点
  | ConditionNode      // 条件节点
  | ParallelNode       // 并行节点
  | AsyncNode          // 异步节点
  | LoopNode           // 循环节点
  | TransformNode      // 数据转换节点
  | AggregateNode;     // 聚合节点

/**
 * 节点基础属性
 */
interface BaseNode {
  /** 节点 ID（流程内唯一） */
  nodeId: string;

  /** 节点名称 */
  nodeName: string;

  /** 节点类型 */
  nodeType: NodeType;

  /** 节点描述 */
  description?: string;

  /** 是否启用 */
  enabled?: boolean;
}

type NodeType =
  | 'operation'
  | 'condition'
  | 'parallel'
  | 'async'
  | 'loop'
  | 'transform'
  | 'aggregate';
```

---

## 3. 节点类型

### 3.1 OperationNode（操作节点）

调用模型的标准操作（CRUD）或自定义 Action。

```typescript
interface OperationNode extends BaseNode {
  nodeType: 'operation';

  /** 目标模型 */
  modelCode: string;

  /** 操作类型 */
  action: 'create' | 'update' | 'delete' | 'findOne' | 'findMany' | string;

  /** 输入映射 */
  inputMapping: InputMapping;

  /** 输出变量名（供后续节点引用） */
  outputVariable?: string;
}

/**
 * 输入映射
 */
interface InputMapping {
  /** 映射规则 */
  rules: MappingRule[];
}

interface MappingRule {
  /** 目标字段 */
  target: string;

  /** 数据来源 */
  source: DataSource;
}

type DataSource =
  | { type: 'input'; path: string }           // 从流程入参取值
  | { type: 'node'; nodeId: string; path: string }  // 从其他节点输出取值
  | { type: 'literal'; value: any }           // 字面量
  | { type: 'expression'; expr: string }      // 表达式
  | { type: 'context'; key: string };         // 上下文（如当前用户）
```

**示例 - 创建订单：**

```json
{
  "nodeId": "create-order",
  "nodeName": "创建订单",
  "nodeType": "operation",
  "modelCode": "order",
  "action": "create",
  "inputMapping": {
    "rules": [
      { "target": "userId", "source": { "type": "context", "key": "currentUser.id" } },
      { "target": "items", "source": { "type": "input", "path": "orderItems" } },
      { "target": "totalAmount", "source": { "type": "node", "nodeId": "calc-total", "path": "result" } }
    ]
  },
  "outputVariable": "createdOrder"
}
```

### 3.2 ConditionNode（条件节点）

根据条件执行不同分支。

```typescript
interface ConditionNode extends BaseNode {
  nodeType: 'condition';

  /** 条件表达式 */
  condition: ConditionExpression;

  /** 条件为 true 时执行的节点 */
  thenNodes: FlowNode[];

  /** 条件为 false 时执行的节点（可选） */
  elseNodes?: FlowNode[];
}

/**
 * 条件表达式
 */
type ConditionExpression =
  | SimpleCondition
  | CompositeCondition;

interface SimpleCondition {
  type: 'simple';
  left: DataSource;
  operator: CompareOperator;
  right: DataSource;
}

interface CompositeCondition {
  type: 'and' | 'or';
  conditions: ConditionExpression[];
}

type CompareOperator =
  | 'eq' | 'ne'      // 等于、不等于
  | 'gt' | 'gte'     // 大于、大于等于
  | 'lt' | 'lte'     // 小于、小于等于
  | 'in' | 'notIn'   // 包含、不包含
  | 'isNull' | 'isNotNull'
  | 'contains' | 'startsWith' | 'endsWith';
```

**示例 - 金额判断：**

```json
{
  "nodeId": "check-amount",
  "nodeName": "检查金额",
  "nodeType": "condition",
  "condition": {
    "type": "simple",
    "left": { "type": "node", "nodeId": "create-order", "path": "totalAmount" },
    "operator": "gt",
    "right": { "type": "literal", "value": 10000 }
  },
  "thenNodes": [
    {
      "nodeId": "create-approval",
      "nodeName": "创建审批",
      "nodeType": "operation",
      "modelCode": "approval",
      "action": "create",
      "inputMapping": {
        "rules": [
          { "target": "orderId", "source": { "type": "node", "nodeId": "create-order", "path": "id" } },
          { "target": "type", "source": { "type": "literal", "value": "large-order" } }
        ]
      }
    }
  ],
  "elseNodes": []
}
```

### 3.3 ParallelNode（并行节点）

并行执行多个独立操作。

```typescript
interface ParallelNode extends BaseNode {
  nodeType: 'parallel';

  /** 并行执行的分支 */
  branches: ParallelBranch[];

  /** 等待策略 */
  waitStrategy: 'all' | 'any' | 'none';

  /** 失败策略 */
  failStrategy: 'failFast' | 'continueOnError';
}

interface ParallelBranch {
  /** 分支 ID */
  branchId: string;

  /** 分支名称 */
  branchName: string;

  /** 分支内的节点 */
  nodes: FlowNode[];
}
```

**示例 - 并行更新库存和积分：**

```json
{
  "nodeId": "parallel-update",
  "nodeName": "并行更新",
  "nodeType": "parallel",
  "waitStrategy": "all",
  "failStrategy": "failFast",
  "branches": [
    {
      "branchId": "inventory",
      "branchName": "扣减库存",
      "nodes": [
        {
          "nodeId": "deduct-inventory",
          "nodeType": "operation",
          "modelCode": "inventory",
          "action": "deduct"
        }
      ]
    },
    {
      "branchId": "points",
      "branchName": "增加积分",
      "nodes": [
        {
          "nodeId": "add-points",
          "nodeType": "operation",
          "modelCode": "userPoints",
          "action": "add"
        }
      ]
    }
  ]
}
```

### 3.4 AsyncNode（异步节点）

异步执行，不阻塞主流程。

```typescript
interface AsyncNode extends BaseNode {
  nodeType: 'async';

  /** 异步执行的节点 */
  asyncNodes: FlowNode[];

  /** 队列名称（用于任务调度） */
  queueName?: string;

  /** 延迟执行（毫秒） */
  delay?: number;

  /** 重试配置 */
  retry?: {
    maxAttempts: number;
    delay: number;
  };
}
```

**示例 - 异步发送通知：**

```json
{
  "nodeId": "async-notify",
  "nodeName": "异步通知",
  "nodeType": "async",
  "queueName": "notification",
  "asyncNodes": [
    {
      "nodeId": "send-email",
      "nodeType": "operation",
      "modelCode": "notification",
      "action": "sendEmail",
      "inputMapping": {
        "rules": [
          { "target": "userId", "source": { "type": "node", "nodeId": "create-order", "path": "userId" } },
          { "target": "template", "source": { "type": "literal", "value": "order-created" } },
          { "target": "data", "source": { "type": "node", "nodeId": "create-order", "path": "" } }
        ]
      }
    },
    {
      "nodeId": "send-sms",
      "nodeType": "operation",
      "modelCode": "notification",
      "action": "sendSms"
    }
  ]
}
```

### 3.5 LoopNode（循环节点）

遍历数组执行操作。

```typescript
interface LoopNode extends BaseNode {
  nodeType: 'loop';

  /** 遍历的数据源 */
  iterateOver: DataSource;

  /** 当前项变量名 */
  itemVariable: string;

  /** 当前索引变量名 */
  indexVariable?: string;

  /** 循环体内的节点 */
  bodyNodes: FlowNode[];

  /** 是否并行执行 */
  parallel?: boolean;

  /** 并行时的并发数 */
  concurrency?: number;
}
```

**示例 - 批量创建订单项：**

```json
{
  "nodeId": "create-items",
  "nodeName": "创建订单项",
  "nodeType": "loop",
  "iterateOver": { "type": "input", "path": "orderItems" },
  "itemVariable": "item",
  "indexVariable": "index",
  "parallel": true,
  "concurrency": 5,
  "bodyNodes": [
    {
      "nodeId": "create-item",
      "nodeType": "operation",
      "modelCode": "orderItem",
      "action": "create",
      "inputMapping": {
        "rules": [
          { "target": "orderId", "source": { "type": "node", "nodeId": "create-order", "path": "id" } },
          { "target": "productId", "source": { "type": "expression", "expr": "item.productId" } },
          { "target": "quantity", "source": { "type": "expression", "expr": "item.quantity" } },
          { "target": "price", "source": { "type": "expression", "expr": "item.price" } }
        ]
      }
    }
  ]
}
```

### 3.6 TransformNode（转换节点）

数据转换和计算。

```typescript
interface TransformNode extends BaseNode {
  nodeType: 'transform';

  /** 转换规则 */
  transformations: Transformation[];

  /** 输出变量名 */
  outputVariable: string;
}

interface Transformation {
  /** 输出字段 */
  field: string;

  /** 数据来源 */
  source: DataSource;

  /** 转换函数（可选） */
  transform?: TransformFunction;
}

type TransformFunction =
  | { fn: 'sum'; field: string }
  | { fn: 'count' }
  | { fn: 'avg'; field: string }
  | { fn: 'max'; field: string }
  | { fn: 'min'; field: string }
  | { fn: 'map'; expr: string }
  | { fn: 'filter'; condition: ConditionExpression }
  | { fn: 'custom'; code: string };
```

**示例 - 计算订单总额：**

```json
{
  "nodeId": "calc-total",
  "nodeName": "计算总额",
  "nodeType": "transform",
  "outputVariable": "orderSummary",
  "transformations": [
    {
      "field": "totalAmount",
      "source": { "type": "input", "path": "orderItems" },
      "transform": { "fn": "sum", "field": "price * quantity" }
    },
    {
      "field": "itemCount",
      "source": { "type": "input", "path": "orderItems" },
      "transform": { "fn": "count" }
    },
    {
      "field": "discountAmount",
      "source": { "type": "expression", "expr": "totalAmount * 0.1" }
    }
  ]
}
```

### 3.7 AggregateNode（聚合节点）

跨模型聚合查询。

```typescript
interface AggregateNode extends BaseNode {
  nodeType: 'aggregate';

  /** 聚合查询列表 */
  queries: AggregateQuery[];

  /** 输出变量名 */
  outputVariable: string;
}

interface AggregateQuery {
  /** 查询别名 */
  alias: string;

  /** 目标模型 */
  modelCode: string;

  /** 查询条件 */
  where?: WhereCondition[];

  /** 关联查询 */
  relations?: string[];

  /** 选择字段 */
  select?: string[];

  /** 排序 */
  orderBy?: OrderByClause[];

  /** 分页 */
  pagination?: { page: number; pageSize: number };
}
```

**示例 - 聚合订单详情：**

```json
{
  "nodeId": "aggregate-order",
  "nodeName": "聚合订单信息",
  "nodeType": "aggregate",
  "outputVariable": "orderDetail",
  "queries": [
    {
      "alias": "order",
      "modelCode": "order",
      "where": [
        { "field": "id", "operator": "eq", "value": { "type": "input", "path": "orderId" } }
      ],
      "relations": ["user", "items"]
    },
    {
      "alias": "payments",
      "modelCode": "payment",
      "where": [
        { "field": "orderId", "operator": "eq", "value": { "type": "input", "path": "orderId" } }
      ],
      "orderBy": [{ "field": "createdAt", "direction": "desc" }]
    }
  ]
}
```

---

## 4. 代码生成

### 4.1 生成策略

ServiceFlow 生成独立的 Service 类，包含完整的流程执行逻辑。

```
元数据配置                              生成代码
┌─────────────────┐                ┌──────────────────────────┐
│ ServiceFlow     │                │ order-create.flow.ts     │
│ ┌─────────────┐ │                │ ┌──────────────────────┐ │
│ │ nodes[]     │ │  代码生成器     │ │ @Injectable()        │ │
│ │ - operation │ │ ═══════════▶  │ │ class OrderCreateFlow │ │
│ │ - condition │ │                │ │   execute(input)      │ │
│ │ - parallel  │ │                │ │   - step1()           │ │
│ │ - async     │ │                │ │   - step2()           │ │
│ └─────────────┘ │                │ └──────────────────────┘ │
└─────────────────┘                └──────────────────────────┘
```

### 4.2 生成的代码结构

```typescript
// src/modules/order/flows/order-create.flow.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity } from '../entities/order-item.entity';
import { InventoryService } from '../../inventory/inventory.service';
import { NotificationService } from '../../notification/notification.service';
import { FlowContext, FlowResult } from '@assembox/flow-runtime';

/**
 * 订单创建流程
 * @generated by Assembox CodeGenerator
 */
@Injectable()
export class OrderCreateFlow {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(OrderItemEntity)
    private readonly orderItemRepository: Repository<OrderItemEntity>,
    private readonly inventoryService: InventoryService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * 执行流程
   */
  async execute(input: OrderCreateInput): Promise<FlowResult<OrderEntity>> {
    const ctx = new FlowContext();

    // 开启事务
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: 验证库存
      const inventoryCheck = await this.checkInventory(ctx, input);
      ctx.set('inventoryCheck', inventoryCheck);

      // Step 2: 条件判断 - 库存是否充足
      if (!inventoryCheck.sufficient) {
        throw new BusinessException('库存不足', 'INVENTORY_INSUFFICIENT');
      }

      // Step 3: 计算总额
      const orderSummary = this.calculateTotal(ctx, input);
      ctx.set('orderSummary', orderSummary);

      // Step 4: 创建订单
      const order = await this.createOrder(ctx, input, queryRunner);
      ctx.set('order', order);

      // Step 5: 批量创建订单项
      await this.createOrderItems(ctx, input, order, queryRunner);

      // Step 6: 并行执行 - 扣减库存和增加积分
      await Promise.all([
        this.deductInventory(ctx, input),
        this.addUserPoints(ctx, order),
      ]);

      // 提交事务
      await queryRunner.commitTransaction();

      // Step 7: 异步通知（事务提交后）
      this.asyncNotify(ctx, order);

      return FlowResult.success(order);
    } catch (error) {
      // 回滚事务
      await queryRunner.rollbackTransaction();
      return FlowResult.error(error);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Step 1: 验证库存
   */
  private async checkInventory(
    ctx: FlowContext,
    input: OrderCreateInput,
  ): Promise<InventoryCheckResult> {
    const results = await Promise.all(
      input.orderItems.map(item =>
        this.inventoryService.checkStock(item.productId, item.quantity)
      )
    );
    return {
      sufficient: results.every(r => r.available),
      details: results,
    };
  }

  /**
   * Step 3: 计算总额
   */
  private calculateTotal(
    ctx: FlowContext,
    input: OrderCreateInput,
  ): OrderSummary {
    const totalAmount = input.orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const itemCount = input.orderItems.length;
    const discountAmount = totalAmount * 0.1;

    return { totalAmount, itemCount, discountAmount };
  }

  /**
   * Step 4: 创建订单
   */
  private async createOrder(
    ctx: FlowContext,
    input: OrderCreateInput,
    queryRunner: QueryRunner,
  ): Promise<OrderEntity> {
    const orderSummary = ctx.get<OrderSummary>('orderSummary');

    const order = this.orderRepository.create({
      userId: ctx.currentUser.id,
      totalAmount: orderSummary.totalAmount,
      discountAmount: orderSummary.discountAmount,
      status: 'pending',
    });

    return queryRunner.manager.save(order);
  }

  /**
   * Step 5: 批量创建订单项
   */
  private async createOrderItems(
    ctx: FlowContext,
    input: OrderCreateInput,
    order: OrderEntity,
    queryRunner: QueryRunner,
  ): Promise<void> {
    const items = input.orderItems.map((item, index) =>
      this.orderItemRepository.create({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        sortOrder: index,
      })
    );

    await queryRunner.manager.save(items);
  }

  /**
   * Step 6a: 扣减库存
   */
  private async deductInventory(
    ctx: FlowContext,
    input: OrderCreateInput,
  ): Promise<void> {
    await Promise.all(
      input.orderItems.map(item =>
        this.inventoryService.deduct(item.productId, item.quantity)
      )
    );
  }

  /**
   * Step 6b: 增加积分
   */
  private async addUserPoints(
    ctx: FlowContext,
    order: OrderEntity,
  ): Promise<void> {
    const points = Math.floor(order.totalAmount / 100);
    await this.userPointsService.add(order.userId, points);
  }

  /**
   * Step 7: 异步通知（不阻塞主流程）
   */
  private asyncNotify(ctx: FlowContext, order: OrderEntity): void {
    // 使用消息队列异步执行
    setImmediate(async () => {
      try {
        await this.notificationService.sendEmail({
          userId: order.userId,
          template: 'order-created',
          data: order,
        });
        await this.notificationService.sendSms({
          userId: order.userId,
          template: 'order-created-sms',
          data: { orderId: order.id },
        });
      } catch (error) {
        // 异步任务失败不影响主流程，记录日志
        this.logger.error('Notification failed', error);
      }
    });
  }
}

/**
 * 流程入参类型
 */
export interface OrderCreateInput {
  orderItems: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  remark?: string;
}
```

### 4.3 Controller 集成

```typescript
// src/modules/order/order.controller.ts

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderCreateFlow: OrderCreateFlow,  // 注入流程
  ) {}

  /**
   * 创建订单（使用服务流程）
   */
  @Post()
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: UserContext) {
    const result = await this.orderCreateFlow.execute({
      orderItems: dto.items,
      remark: dto.remark,
    });

    if (!result.success) {
      throw new BusinessException(result.error.message, result.error.code);
    }

    return result.data;
  }
}
```

---

## 5. 完整示例

### 5.1 订单创建流程（JSON 配置）

```json
{
  "flowCode": "order-create-flow",
  "flowName": "订单创建流程",
  "moduleCode": "order",
  "description": "完整的订单创建业务流程，包含库存校验、订单创建、异步通知",

  "input": {
    "params": [
      {
        "name": "orderItems",
        "type": "array",
        "required": true,
        "description": "订单项列表",
        "validations": [{ "type": "minLength", "value": 1 }]
      },
      {
        "name": "remark",
        "type": "string",
        "required": false
      }
    ]
  },

  "output": {
    "type": { "ref": "order" },
    "mapping": { "nodeId": "create-order" }
  },

  "transaction": {
    "enabled": true,
    "isolationLevel": "READ_COMMITTED",
    "timeout": 30000
  },

  "nodes": [
    {
      "nodeId": "check-inventory",
      "nodeName": "验证库存",
      "nodeType": "loop",
      "iterateOver": { "type": "input", "path": "orderItems" },
      "itemVariable": "item",
      "parallel": true,
      "concurrency": 10,
      "bodyNodes": [
        {
          "nodeId": "check-single",
          "nodeType": "operation",
          "modelCode": "inventory",
          "action": "checkStock",
          "inputMapping": {
            "rules": [
              { "target": "productId", "source": { "type": "expression", "expr": "item.productId" } },
              { "target": "quantity", "source": { "type": "expression", "expr": "item.quantity" } }
            ]
          }
        }
      ],
      "outputVariable": "inventoryResults"
    },

    {
      "nodeId": "validate-inventory",
      "nodeName": "校验库存结果",
      "nodeType": "condition",
      "condition": {
        "type": "simple",
        "left": { "type": "expression", "expr": "inventoryResults.every(r => r.available)" },
        "operator": "eq",
        "right": { "type": "literal", "value": false }
      },
      "thenNodes": [
        {
          "nodeId": "throw-insufficient",
          "nodeType": "transform",
          "outputVariable": "_error",
          "transformations": [
            {
              "field": "error",
              "source": { "type": "literal", "value": { "code": "INVENTORY_INSUFFICIENT", "message": "库存不足" } }
            }
          ]
        }
      ]
    },

    {
      "nodeId": "calc-total",
      "nodeName": "计算订单总额",
      "nodeType": "transform",
      "outputVariable": "orderSummary",
      "transformations": [
        {
          "field": "totalAmount",
          "source": { "type": "input", "path": "orderItems" },
          "transform": { "fn": "custom", "code": "items.reduce((sum, item) => sum + item.price * item.quantity, 0)" }
        },
        {
          "field": "itemCount",
          "source": { "type": "input", "path": "orderItems" },
          "transform": { "fn": "count" }
        }
      ]
    },

    {
      "nodeId": "create-order",
      "nodeName": "创建订单",
      "nodeType": "operation",
      "modelCode": "order",
      "action": "create",
      "inputMapping": {
        "rules": [
          { "target": "userId", "source": { "type": "context", "key": "currentUser.id" } },
          { "target": "totalAmount", "source": { "type": "node", "nodeId": "calc-total", "path": "totalAmount" } },
          { "target": "status", "source": { "type": "literal", "value": "pending" } },
          { "target": "remark", "source": { "type": "input", "path": "remark" } }
        ]
      },
      "outputVariable": "createdOrder"
    },

    {
      "nodeId": "create-items",
      "nodeName": "创建订单项",
      "nodeType": "loop",
      "iterateOver": { "type": "input", "path": "orderItems" },
      "itemVariable": "item",
      "indexVariable": "index",
      "bodyNodes": [
        {
          "nodeId": "create-item",
          "nodeType": "operation",
          "modelCode": "orderItem",
          "action": "create",
          "inputMapping": {
            "rules": [
              { "target": "orderId", "source": { "type": "node", "nodeId": "create-order", "path": "id" } },
              { "target": "productId", "source": { "type": "expression", "expr": "item.productId" } },
              { "target": "quantity", "source": { "type": "expression", "expr": "item.quantity" } },
              { "target": "price", "source": { "type": "expression", "expr": "item.price" } },
              { "target": "sortOrder", "source": { "type": "expression", "expr": "index" } }
            ]
          }
        }
      ]
    },

    {
      "nodeId": "parallel-side-effects",
      "nodeName": "并行处理副作用",
      "nodeType": "parallel",
      "waitStrategy": "all",
      "failStrategy": "failFast",
      "branches": [
        {
          "branchId": "inventory",
          "branchName": "扣减库存",
          "nodes": [
            {
              "nodeId": "deduct-inventory",
              "nodeType": "loop",
              "iterateOver": { "type": "input", "path": "orderItems" },
              "itemVariable": "item",
              "parallel": true,
              "bodyNodes": [
                {
                  "nodeId": "deduct-single",
                  "nodeType": "operation",
                  "modelCode": "inventory",
                  "action": "deduct",
                  "inputMapping": {
                    "rules": [
                      { "target": "productId", "source": { "type": "expression", "expr": "item.productId" } },
                      { "target": "quantity", "source": { "type": "expression", "expr": "item.quantity" } }
                    ]
                  }
                }
              ]
            }
          ]
        },
        {
          "branchId": "points",
          "branchName": "增加积分",
          "nodes": [
            {
              "nodeId": "add-points",
              "nodeType": "operation",
              "modelCode": "userPoints",
              "action": "add",
              "inputMapping": {
                "rules": [
                  { "target": "userId", "source": { "type": "node", "nodeId": "create-order", "path": "userId" } },
                  { "target": "points", "source": { "type": "expression", "expr": "Math.floor(createdOrder.totalAmount / 100)" } },
                  { "target": "source", "source": { "type": "literal", "value": "order" } },
                  { "target": "sourceId", "source": { "type": "node", "nodeId": "create-order", "path": "id" } }
                ]
              }
            }
          ]
        }
      ]
    },

    {
      "nodeId": "check-large-order",
      "nodeName": "大额订单判断",
      "nodeType": "condition",
      "condition": {
        "type": "simple",
        "left": { "type": "node", "nodeId": "create-order", "path": "totalAmount" },
        "operator": "gt",
        "right": { "type": "literal", "value": 10000 }
      },
      "thenNodes": [
        {
          "nodeId": "create-approval",
          "nodeName": "创建审批",
          "nodeType": "operation",
          "modelCode": "approval",
          "action": "create",
          "inputMapping": {
            "rules": [
              { "target": "type", "source": { "type": "literal", "value": "large-order" } },
              { "target": "targetId", "source": { "type": "node", "nodeId": "create-order", "path": "id" } },
              { "target": "amount", "source": { "type": "node", "nodeId": "create-order", "path": "totalAmount" } }
            ]
          }
        }
      ]
    },

    {
      "nodeId": "async-notify",
      "nodeName": "异步通知",
      "nodeType": "async",
      "queueName": "notification",
      "asyncNodes": [
        {
          "nodeId": "send-email",
          "nodeType": "operation",
          "modelCode": "notification",
          "action": "sendEmail",
          "inputMapping": {
            "rules": [
              { "target": "userId", "source": { "type": "node", "nodeId": "create-order", "path": "userId" } },
              { "target": "template", "source": { "type": "literal", "value": "order-created" } },
              { "target": "data", "source": { "type": "node", "nodeId": "create-order", "path": "" } }
            ]
          }
        },
        {
          "nodeId": "send-sms",
          "nodeType": "operation",
          "modelCode": "notification",
          "action": "sendSms",
          "inputMapping": {
            "rules": [
              { "target": "userId", "source": { "type": "node", "nodeId": "create-order", "path": "userId" } },
              { "target": "template", "source": { "type": "literal", "value": "order-created-sms" } }
            ]
          }
        }
      ]
    }
  ]
}
```

---

## 6. API 设计

### 6.1 管理接口

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/flows | 获取流程列表 |
| GET | /api/v1/flows/:flowCode | 获取流程详情 |
| POST | /api/v1/flows | 创建流程 |
| PUT | /api/v1/flows/:flowCode | 更新流程 |
| DELETE | /api/v1/flows/:flowCode | 删除流程 |
| POST | /api/v1/flows/:flowCode/validate | 验证流程配置 |
| POST | /api/v1/flows/:flowCode/test | 测试执行流程 |

### 6.2 执行接口

流程生成后，自动注册到对应模块的 Controller：

```
POST /api/v1/{moduleCode}/flows/{flowCode}/execute
```

---

## 7. 相关文档

- [服务层概述](./overview.md)
- [代码生成设计](../05-publish/code-generation.md)
- [元数据服务设计](./meta-service.md)
- [插件系统设计](./plugin-service.md)
