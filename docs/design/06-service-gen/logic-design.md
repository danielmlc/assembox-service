# 服务逻辑编排详细设计

> **状态**: 设计中
> **更新日期**: 2025-01-31
> **设计目标**: 定义服务逻辑编排配置体系，实现从配置到 Service 代码的自动生成

---

## 1. 概述

### 1.1 设计背景

服务逻辑（logic）是低代码平台中最复杂的配置类型，它需要将业务人员的逻辑意图转化为可执行的服务代码。核心挑战在于：

1. **表达能力** - 配置需要能表达常见的业务逻辑模式
2. **类型安全** - 生成的代码需要类型正确
3. **可扩展** - 支持自定义逻辑扩展
4. **可调试** - 生成的代码要易于理解和调试

### 1.2 逻辑编排架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          服务逻辑编排架构                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Logic 配置                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │  方法定义    │  │  参数定义    │  │  步骤列表    │                 │   │
│  │  │ methodName  │  │ parameters  │  │   steps     │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      步骤类型 (Step Types)                           │   │
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐      │   │
│  │  │ query │ │ save  │ │update │ │delete │ │validate│ │transform│    │   │
│  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘      │   │
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐               │   │
│  │  │condition│ │ loop │ │ call  │ │return │ │ throw │               │   │
│  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     表达式系统 (Expression)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │  变量引用    │  │  字段访问    │  │  函数调用    │                 │   │
│  │  │ ${param}    │  │ ${entity.x} │  │ ${fn:xxx}   │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Service 代码生成器                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ 方法签名生成 │  │ 步骤代码生成 │  │ 导入语句生成 │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Logic 配置 Schema

### 2.1 完整 Schema 定义

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/logic/v1",
    "title": "Logic Component Schema",
    "description": "服务逻辑编排配置",
    "type": "object",
    "required": ["componentCode", "componentName", "moduleRef", "methods"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/logic/v1"
        },
        "componentCode": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]*$",
            "maxLength": 100,
            "description": "组件代码"
        },
        "componentName": {
            "type": "string",
            "maxLength": 200,
            "description": "组件名称"
        },
        "description": {
            "type": "string",
            "maxLength": 500
        },
        "moduleRef": {
            "type": "string",
            "description": "所属模块代码"
        },
        "modelRef": {
            "type": "string",
            "description": "关联的数据模型代码"
        },
        "entityRef": {
            "type": "string",
            "description": "主实体代码"
        },
        "dependencies": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/Dependency"
            },
            "description": "依赖的其他服务"
        },
        "variables": {
            "type": "object",
            "additionalProperties": {
                "$ref": "#/definitions/Variable"
            },
            "description": "服务级变量定义"
        },
        "methods": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/ServiceMethod"
            },
            "minItems": 1,
            "description": "服务方法列表"
        }
    },
    "definitions": {
        "Dependency": {
            "type": "object",
            "required": ["name", "type"],
            "properties": {
                "name": {
                    "type": "string",
                    "description": "注入名称，如 userService"
                },
                "type": {
                    "type": "string",
                    "description": "服务类型，如 UserService"
                },
                "moduleRef": {
                    "type": "string",
                    "description": "来源模块"
                }
            }
        },
        "Variable": {
            "type": "object",
            "required": ["type"],
            "properties": {
                "type": {
                    "type": "string",
                    "description": "变量类型"
                },
                "defaultValue": {
                    "description": "默认值"
                },
                "description": {
                    "type": "string"
                }
            }
        },
        "ServiceMethod": {
            "type": "object",
            "required": ["methodName", "steps"],
            "properties": {
                "methodName": {
                    "type": "string",
                    "pattern": "^[a-z][a-zA-Z0-9]*$",
                    "description": "方法名"
                },
                "description": {
                    "type": "string",
                    "description": "方法描述"
                },
                "async": {
                    "type": "boolean",
                    "default": true,
                    "description": "是否异步"
                },
                "parameters": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/MethodParameter"
                    },
                    "description": "方法参数"
                },
                "returnType": {
                    "type": "string",
                    "description": "返回类型"
                },
                "returnDescription": {
                    "type": "string",
                    "description": "返回值描述"
                },
                "throws": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "可能抛出的异常"
                },
                "steps": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/LogicStep"
                    },
                    "minItems": 1,
                    "description": "执行步骤"
                }
            }
        },
        "MethodParameter": {
            "type": "object",
            "required": ["name", "type"],
            "properties": {
                "name": {
                    "type": "string",
                    "description": "参数名"
                },
                "type": {
                    "type": "string",
                    "description": "参数类型"
                },
                "optional": {
                    "type": "boolean",
                    "default": false,
                    "description": "是否可选"
                },
                "defaultValue": {
                    "description": "默认值"
                },
                "description": {
                    "type": "string"
                }
            }
        },
        "LogicStep": {
            "type": "object",
            "required": ["type"],
            "properties": {
                "id": {
                    "type": "string",
                    "description": "步骤ID，用于调试追踪"
                },
                "type": {
                    "type": "string",
                    "enum": [
                        "declare",
                        "assign",
                        "query",
                        "queryOne",
                        "count",
                        "exists",
                        "save",
                        "saveMany",
                        "update",
                        "updateMany",
                        "delete",
                        "deleteMany",
                        "validate",
                        "transform",
                        "condition",
                        "loop",
                        "call",
                        "return",
                        "throw",
                        "log",
                        "transaction"
                    ],
                    "description": "步骤类型"
                },
                "config": {
                    "type": "object",
                    "description": "步骤配置，根据 type 不同结构不同"
                },
                "comment": {
                    "type": "string",
                    "description": "步骤注释，生成为代码注释"
                }
            }
        }
    }
}
```

---

## 3. 步骤类型详细设计

### 3.1 步骤类型总览

| 类别 | 步骤类型 | 说明 | 生成代码示例 |
|-----|---------|------|-------------|
| 变量 | declare | 声明变量 | `let result: Type;` |
| 变量 | assign | 赋值 | `result = value;` |
| 查询 | query | 查询列表 | `repository.find(...)` |
| 查询 | queryOne | 查询单条 | `repository.findOne(...)` |
| 查询 | count | 计数 | `repository.count(...)` |
| 查询 | exists | 存在性检查 | `repository.exists(...)` |
| 写入 | save | 保存单条 | `repository.save(...)` |
| 写入 | saveMany | 批量保存 | `repository.save([...])` |
| 写入 | update | 更新单条 | `repository.update(...)` |
| 写入 | updateMany | 批量更新 | `repository.update(...)` |
| 写入 | delete | 删除单条 | `repository.delete(...)` |
| 写入 | deleteMany | 批量删除 | `repository.delete(...)` |
| 逻辑 | validate | 数据校验 | `if (!condition) throw ...` |
| 逻辑 | transform | 数据转换 | `result = transform(...)` |
| 控制 | condition | 条件分支 | `if (...) { } else { }` |
| 控制 | loop | 循环 | `for (...) { }` |
| 控制 | call | 调用服务 | `this.xxxService.method()` |
| 控制 | return | 返回 | `return result;` |
| 控制 | throw | 抛出异常 | `throw new Error(...)` |
| 辅助 | log | 日志 | `this.logger.info(...)` |
| 事务 | transaction | 事务包裹 | `queryRunner.startTransaction()` |

### 3.2 变量操作步骤

#### 3.2.1 declare - 声明变量

```typescript
// 步骤配置
interface DeclareStepConfig {
    /** 变量名 */
    name: string;
    /** 变量类型 */
    type: string;
    /** 初始值表达式 */
    initialValue?: Expression;
    /** 是否为常量 */
    const?: boolean;
}

// 配置示例
{
    "type": "declare",
    "config": {
        "name": "existingUser",
        "type": "User | null",
        "initialValue": null
    }
}

// 生成代码
let existingUser: User | null = null;
```

#### 3.2.2 assign - 赋值

```typescript
// 步骤配置
interface AssignStepConfig {
    /** 目标变量或字段 */
    target: string;
    /** 值表达式 */
    value: Expression;
}

// 配置示例
{
    "type": "assign",
    "config": {
        "target": "user.updatedAt",
        "value": { "expr": "${fn:now}" }
    }
}

// 生成代码
user.updatedAt = new Date();
```

### 3.3 查询操作步骤

#### 3.3.1 query - 查询列表

```typescript
// 步骤配置
interface QueryStepConfig {
    /** 结果存储变量 */
    result: string;
    /** 实体引用 */
    entityRef: string;
    /** 查询条件 */
    where?: WhereCondition[];
    /** 排序 */
    orderBy?: OrderByClause[];
    /** 分页 */
    pagination?: {
        page: Expression;
        pageSize: Expression;
    };
    /** 选择字段 */
    select?: string[];
    /** 关联加载 */
    relations?: string[];
}

interface WhereCondition {
    /** 字段 */
    field: string;
    /** 操作符 */
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'notIn' | 'isNull' | 'isNotNull' | 'between';
    /** 值表达式 */
    value: Expression;
    /** 条件组合方式 */
    logic?: 'and' | 'or';
}

interface OrderByClause {
    field: string;
    direction: 'ASC' | 'DESC';
}

// 配置示例
{
    "type": "query",
    "config": {
        "result": "users",
        "entityRef": "user",
        "where": [
            {
                "field": "isEnable",
                "operator": "eq",
                "value": { "literal": 1 }
            },
            {
                "field": "orgId",
                "operator": "eq",
                "value": { "expr": "${param:orgId}" }
            },
            {
                "field": "name",
                "operator": "like",
                "value": { "expr": "${param:keyword}" },
                "logic": "and"
            }
        ],
        "orderBy": [
            { "field": "createdAt", "direction": "DESC" }
        ],
        "pagination": {
            "page": { "expr": "${param:page}" },
            "pageSize": { "expr": "${param:pageSize}" }
        }
    }
}

// 生成代码
const users = await this.userRepository.find({
    where: {
        isEnable: 1,
        orgId: orgId,
        ...(keyword && { name: Like(`%${keyword}%`) }),
    },
    order: {
        createdAt: 'DESC',
    },
    skip: (page - 1) * pageSize,
    take: pageSize,
});
```

#### 3.3.2 queryOne - 查询单条

```typescript
// 步骤配置
interface QueryOneStepConfig {
    /** 结果存储变量 */
    result: string;
    /** 实体引用 */
    entityRef: string;
    /** 查询条件 */
    where: WhereCondition[];
    /** 关联加载 */
    relations?: string[];
    /** 未找到时的行为 */
    notFoundBehavior?: 'returnNull' | 'throw';
    /** 抛出异常的错误消息 */
    notFoundMessage?: string;
}

// 配置示例
{
    "type": "queryOne",
    "config": {
        "result": "user",
        "entityRef": "user",
        "where": [
            {
                "field": "id",
                "operator": "eq",
                "value": { "expr": "${param:id}" }
            }
        ],
        "notFoundBehavior": "throw",
        "notFoundMessage": "用户不存在"
    }
}

// 生成代码
const user = await this.userRepository.findOne({
    where: { id: id },
});
if (!user) {
    throw new NotFoundException('用户不存在');
}
```

#### 3.3.3 count - 计数

```typescript
// 步骤配置
interface CountStepConfig {
    result: string;
    entityRef: string;
    where?: WhereCondition[];
}

// 配置示例
{
    "type": "count",
    "config": {
        "result": "total",
        "entityRef": "order",
        "where": [
            {
                "field": "status",
                "operator": "eq",
                "value": { "literal": "PENDING" }
            }
        ]
    }
}

// 生成代码
const total = await this.orderRepository.count({
    where: { status: 'PENDING' },
});
```

#### 3.3.4 exists - 存在性检查

```typescript
// 步骤配置
interface ExistsStepConfig {
    result: string;
    entityRef: string;
    where: WhereCondition[];
}

// 配置示例
{
    "type": "exists",
    "config": {
        "result": "codeExists",
        "entityRef": "user",
        "where": [
            {
                "field": "code",
                "operator": "eq",
                "value": { "expr": "${param:code}" }
            },
            {
                "field": "id",
                "operator": "ne",
                "value": { "expr": "${param:id}" }
            }
        ]
    }
}

// 生成代码
const codeExists = await this.userRepository.exists({
    where: {
        code: code,
        id: Not(id),
    },
});
```

### 3.4 写入操作步骤

#### 3.4.1 save - 保存单条

```typescript
// 步骤配置
interface SaveStepConfig {
    /** 结果存储变量 */
    result?: string;
    /** 实体引用 */
    entityRef: string;
    /** 数据来源 */
    data: DataSource;
}

interface DataSource {
    /** 来源类型 */
    type: 'param' | 'variable' | 'build';
    /** 参数名或变量名 */
    name?: string;
    /** 构建字段映射 */
    fields?: FieldMapping[];
}

interface FieldMapping {
    /** 目标字段 */
    field: string;
    /** 值表达式 */
    value: Expression;
}

// 配置示例 1: 从参数保存
{
    "type": "save",
    "config": {
        "result": "savedUser",
        "entityRef": "user",
        "data": {
            "type": "param",
            "name": "createDto"
        }
    }
}

// 生成代码 1
const entity = this.userRepository.create(createDto);
const savedUser = await this.userRepository.save(entity);

// 配置示例 2: 构建数据保存
{
    "type": "save",
    "config": {
        "result": "savedUser",
        "entityRef": "user",
        "data": {
            "type": "build",
            "fields": [
                { "field": "name", "value": { "expr": "${param:dto.name}" } },
                { "field": "code", "value": { "expr": "${param:dto.code}" } },
                { "field": "createdAt", "value": { "expr": "${fn:now}" } },
                { "field": "creatorId", "value": { "expr": "${ctx:userId}" } }
            ]
        }
    }
}

// 生成代码 2
const entity = this.userRepository.create({
    name: dto.name,
    code: dto.code,
    createdAt: new Date(),
    creatorId: this.contextService.getUserId(),
});
const savedUser = await this.userRepository.save(entity);
```

#### 3.4.2 update - 更新

```typescript
// 步骤配置
interface UpdateStepConfig {
    /** 更新结果 */
    result?: string;
    /** 实体引用 */
    entityRef: string;
    /** 更新条件 */
    where: WhereCondition[];
    /** 更新数据 */
    data: DataSource;
    /** 是否返回更新后的实体 */
    returning?: boolean;
}

// 配置示例
{
    "type": "update",
    "config": {
        "entityRef": "user",
        "where": [
            {
                "field": "id",
                "operator": "eq",
                "value": { "expr": "${param:id}" }
            }
        ],
        "data": {
            "type": "build",
            "fields": [
                { "field": "name", "value": { "expr": "${param:dto.name}" } },
                { "field": "modifierAt", "value": { "expr": "${fn:now}" } },
                { "field": "modifierId", "value": { "expr": "${ctx:userId}" } }
            ]
        }
    }
}

// 生成代码
await this.userRepository.update(
    { id: id },
    {
        name: dto.name,
        modifierAt: new Date(),
        modifierId: this.contextService.getUserId(),
    }
);
```

#### 3.4.3 delete - 删除

```typescript
// 步骤配置
interface DeleteStepConfig {
    /** 实体引用 */
    entityRef: string;
    /** 删除条件 */
    where: WhereCondition[];
    /** 是否软删除 */
    soft?: boolean;
}

// 配置示例
{
    "type": "delete",
    "config": {
        "entityRef": "user",
        "where": [
            {
                "field": "id",
                "operator": "eq",
                "value": { "expr": "${param:id}" }
            }
        ],
        "soft": true
    }
}

// 生成代码（软删除）
await this.userRepository.update(
    { id: id },
    {
        isRemoved: 1,
        modifierAt: new Date(),
        modifierId: this.contextService.getUserId(),
    }
);

// 生成代码（硬删除）
await this.userRepository.delete({ id: id });
```

### 3.5 逻辑操作步骤

#### 3.5.1 validate - 数据校验

```typescript
// 步骤配置
interface ValidateStepConfig {
    /** 校验规则列表 */
    rules: ValidationRule[];
}

interface ValidationRule {
    /** 校验条件表达式（条件为 false 时抛出异常） */
    condition: Expression;
    /** 错误消息 */
    message: string;
    /** 错误代码 */
    errorCode?: string;
    /** 异常类型 */
    exceptionType?: 'BadRequest' | 'NotFound' | 'Conflict' | 'Forbidden' | 'Business';
}

// 配置示例
{
    "type": "validate",
    "config": {
        "rules": [
            {
                "condition": { "expr": "${var:user}" },
                "message": "用户不存在",
                "exceptionType": "NotFound"
            },
            {
                "condition": { "expr": "!${var:codeExists}" },
                "message": "编码已存在",
                "errorCode": "USER_CODE_EXISTS",
                "exceptionType": "Conflict"
            },
            {
                "condition": { "expr": "${param:dto.age} >= 18" },
                "message": "年龄必须大于等于18岁",
                "exceptionType": "BadRequest"
            }
        ]
    }
}

// 生成代码
if (!user) {
    throw new NotFoundException('用户不存在');
}
if (codeExists) {
    throw new ConflictException('编码已存在');
}
if (!(dto.age >= 18)) {
    throw new BadRequestException('年龄必须大于等于18岁');
}
```

#### 3.5.2 transform - 数据转换

```typescript
// 步骤配置
interface TransformStepConfig {
    /** 结果变量 */
    result: string;
    /** 结果类型 */
    resultType?: string;
    /** 来源数据 */
    source: Expression;
    /** 转换类型 */
    transformType: 'map' | 'filter' | 'reduce' | 'pick' | 'omit' | 'merge' | 'custom';
    /** 转换配置 */
    transformConfig: TransformConfig;
}

// map 转换配置
interface MapTransformConfig {
    /** 字段映射 */
    mappings: FieldMapping[];
}

// pick 转换配置
interface PickTransformConfig {
    /** 要选取的字段 */
    fields: string[];
}

// merge 转换配置
interface MergeTransformConfig {
    /** 要合并的数据源 */
    sources: Expression[];
}

// 配置示例 1: 对象映射转换
{
    "type": "transform",
    "config": {
        "result": "userVo",
        "resultType": "UserVO",
        "source": { "expr": "${var:user}" },
        "transformType": "map",
        "transformConfig": {
            "mappings": [
                { "field": "id", "value": { "expr": "${source}.id" } },
                { "field": "name", "value": { "expr": "${source}.name" } },
                { "field": "fullName", "value": { "expr": "${source}.firstName + ' ' + ${source}.lastName" } },
                { "field": "statusText", "value": { "expr": "${fn:dictLabel('USER_STATUS', ${source}.status)}" } }
            ]
        }
    }
}

// 生成代码 1
const userVo: UserVO = {
    id: user.id,
    name: user.name,
    fullName: user.firstName + ' ' + user.lastName,
    statusText: this.dictService.getLabel('USER_STATUS', user.status),
};

// 配置示例 2: 数组映射
{
    "type": "transform",
    "config": {
        "result": "userVos",
        "resultType": "UserVO[]",
        "source": { "expr": "${var:users}" },
        "transformType": "map",
        "transformConfig": {
            "mappings": [
                { "field": "id", "value": { "expr": "${item}.id" } },
                { "field": "name", "value": { "expr": "${item}.name" } }
            ]
        }
    }
}

// 生成代码 2
const userVos: UserVO[] = users.map(item => ({
    id: item.id,
    name: item.name,
}));

// 配置示例 3: 合并数据
{
    "type": "transform",
    "config": {
        "result": "result",
        "transformType": "merge",
        "transformConfig": {
            "sources": [
                { "expr": "${var:user}" },
                { "expr": "${param:updateDto}" },
                { "literal": { "modifierAt": "${fn:now}" } }
            ]
        }
    }
}

// 生成代码 3
const result = {
    ...user,
    ...updateDto,
    modifierAt: new Date(),
};
```

### 3.6 控制流步骤

#### 3.6.1 condition - 条件分支

```typescript
// 步骤配置
interface ConditionStepConfig {
    /** 条件表达式 */
    condition: Expression;
    /** 条件为真时执行的步骤 */
    thenSteps: LogicStep[];
    /** 条件为假时执行的步骤 */
    elseSteps?: LogicStep[];
    /** else if 分支 */
    elseIfBranches?: ElseIfBranch[];
}

interface ElseIfBranch {
    condition: Expression;
    steps: LogicStep[];
}

// 配置示例
{
    "type": "condition",
    "config": {
        "condition": { "expr": "${var:user.role} === 'ADMIN'" },
        "thenSteps": [
            {
                "type": "query",
                "config": {
                    "result": "users",
                    "entityRef": "user",
                    "where": []
                }
            }
        ],
        "elseIfBranches": [
            {
                "condition": { "expr": "${var:user.role} === 'MANAGER'" },
                "steps": [
                    {
                        "type": "query",
                        "config": {
                            "result": "users",
                            "entityRef": "user",
                            "where": [
                                {
                                    "field": "orgId",
                                    "operator": "eq",
                                    "value": { "expr": "${var:user.orgId}" }
                                }
                            ]
                        }
                    }
                ]
            }
        ],
        "elseSteps": [
            {
                "type": "assign",
                "config": {
                    "target": "users",
                    "value": { "literal": [] }
                }
            }
        ]
    }
}

// 生成代码
let users: User[];
if (user.role === 'ADMIN') {
    users = await this.userRepository.find();
} else if (user.role === 'MANAGER') {
    users = await this.userRepository.find({
        where: { orgId: user.orgId },
    });
} else {
    users = [];
}
```

#### 3.6.2 loop - 循环

```typescript
// 步骤配置
interface LoopStepConfig {
    /** 循环类型 */
    loopType: 'forEach' | 'for' | 'while';
    /** forEach 配置 */
    forEach?: {
        /** 迭代变量名 */
        itemName: string;
        /** 索引变量名 */
        indexName?: string;
        /** 数据源表达式 */
        source: Expression;
    };
    /** for 配置 */
    for?: {
        /** 初始化表达式 */
        init: string;
        /** 条件表达式 */
        condition: Expression;
        /** 迭代表达式 */
        update: string;
    };
    /** while 配置 */
    while?: {
        /** 条件表达式 */
        condition: Expression;
    };
    /** 循环体步骤 */
    steps: LogicStep[];
}

// 配置示例 1: forEach
{
    "type": "loop",
    "config": {
        "loopType": "forEach",
        "forEach": {
            "itemName": "order",
            "indexName": "index",
            "source": { "expr": "${var:orders}" }
        },
        "steps": [
            {
                "type": "assign",
                "config": {
                    "target": "order.totalAmount",
                    "value": { "expr": "${fn:calculateTotal(${var:order})}" }
                }
            },
            {
                "type": "save",
                "config": {
                    "entityRef": "order",
                    "data": {
                        "type": "variable",
                        "name": "order"
                    }
                }
            }
        ]
    }
}

// 生成代码 1
for (let index = 0; index < orders.length; index++) {
    const order = orders[index];
    order.totalAmount = this.calculateTotal(order);
    await this.orderRepository.save(order);
}

// 配置示例 2: while（带跳出条件）
{
    "type": "loop",
    "config": {
        "loopType": "while",
        "while": {
            "condition": { "expr": "${var:hasMore}" }
        },
        "steps": [
            {
                "type": "call",
                "config": {
                    "result": "batch",
                    "service": "externalApi",
                    "method": "fetchBatch",
                    "args": [
                        { "expr": "${var:cursor}" }
                    ]
                }
            },
            {
                "type": "assign",
                "config": {
                    "target": "cursor",
                    "value": { "expr": "${var:batch.nextCursor}" }
                }
            },
            {
                "type": "assign",
                "config": {
                    "target": "hasMore",
                    "value": { "expr": "${var:batch.hasMore}" }
                }
            }
        ]
    }
}

// 生成代码 2
while (hasMore) {
    const batch = await this.externalApi.fetchBatch(cursor);
    cursor = batch.nextCursor;
    hasMore = batch.hasMore;
}
```

#### 3.6.3 call - 调用服务

```typescript
// 步骤配置
interface CallStepConfig {
    /** 结果存储变量 */
    result?: string;
    /** 服务名称 */
    service: string;
    /** 方法名称 */
    method: string;
    /** 参数列表 */
    args?: Expression[];
    /** 是否等待 */
    await?: boolean;
}

// 配置示例 1: 调用注入的服务
{
    "type": "call",
    "config": {
        "result": "sendResult",
        "service": "emailService",
        "method": "sendEmail",
        "args": [
            { "expr": "${var:user.email}" },
            { "literal": "欢迎注册" },
            { "expr": "${var:emailContent}" }
        ]
    }
}

// 生成代码 1
const sendResult = await this.emailService.sendEmail(
    user.email,
    '欢迎注册',
    emailContent
);

// 配置示例 2: 调用自身方法
{
    "type": "call",
    "config": {
        "result": "validated",
        "service": "self",
        "method": "validateUserData",
        "args": [
            { "expr": "${param:dto}" }
        ]
    }
}

// 生成代码 2
const validated = await this.validateUserData(dto);
```

#### 3.6.4 return - 返回

```typescript
// 步骤配置
interface ReturnStepConfig {
    /** 返回值表达式 */
    value?: Expression;
}

// 配置示例 1: 返回变量
{
    "type": "return",
    "config": {
        "value": { "expr": "${var:user}" }
    }
}

// 生成代码 1
return user;

// 配置示例 2: 返回构建的对象
{
    "type": "return",
    "config": {
        "value": {
            "literal": {
                "list": "${var:users}",
                "total": "${var:total}",
                "page": "${param:page}",
                "pageSize": "${param:pageSize}"
            }
        }
    }
}

// 生成代码 2
return {
    list: users,
    total: total,
    page: page,
    pageSize: pageSize,
};
```

#### 3.6.5 throw - 抛出异常

```typescript
// 步骤配置
interface ThrowStepConfig {
    /** 异常类型 */
    exceptionType: 'BadRequest' | 'NotFound' | 'Conflict' | 'Forbidden' | 'Internal' | 'Business';
    /** 错误消息 */
    message: Expression;
    /** 错误代码 */
    errorCode?: string;
}

// 配置示例
{
    "type": "throw",
    "config": {
        "exceptionType": "Business",
        "message": { "literal": "库存不足，无法完成订单" },
        "errorCode": "ORDER_STOCK_NOT_ENOUGH"
    }
}

// 生成代码
throw new BusinessException('库存不足，无法完成订单', 'ORDER_STOCK_NOT_ENOUGH');
```

### 3.7 事务步骤

#### 3.7.1 transaction - 事务包裹

```typescript
// 步骤配置
interface TransactionStepConfig {
    /** 事务隔离级别 */
    isolation?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
    /** 事务内步骤 */
    steps: LogicStep[];
}

// 配置示例
{
    "type": "transaction",
    "config": {
        "isolation": "READ_COMMITTED",
        "steps": [
            {
                "type": "update",
                "comment": "扣减库存",
                "config": {
                    "entityRef": "product",
                    "where": [
                        { "field": "id", "operator": "eq", "value": { "expr": "${param:productId}" } }
                    ],
                    "data": {
                        "type": "build",
                        "fields": [
                            { "field": "stock", "value": { "expr": "${var:product.stock} - ${param:quantity}" } }
                        ]
                    }
                }
            },
            {
                "type": "save",
                "comment": "创建订单",
                "config": {
                    "result": "order",
                    "entityRef": "order",
                    "data": {
                        "type": "param",
                        "name": "orderDto"
                    }
                }
            }
        ]
    }
}

// 生成代码
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction('READ COMMITTED');

try {
    // 扣减库存
    await queryRunner.manager.update(Product,
        { id: productId },
        { stock: product.stock - quantity }
    );

    // 创建订单
    const orderEntity = queryRunner.manager.create(Order, orderDto);
    const order = await queryRunner.manager.save(orderEntity);

    await queryRunner.commitTransaction();
    return order;
} catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
} finally {
    await queryRunner.release();
}
```

---

## 4. 表达式系统

### 4.1 表达式语法

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          表达式语法                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  基础语法：                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ${namespace:path}                                                   │   │
│  │                                                                     │   │
│  │  namespace:                                                         │   │
│  │  - param    方法参数        ${param:id}, ${param:dto.name}          │   │
│  │  - var      局部变量        ${var:user}, ${var:result}              │   │
│  │  - ctx      上下文信息      ${ctx:userId}, ${ctx:tenantId}          │   │
│  │  - fn       内置函数        ${fn:now}, ${fn:uuid}                   │   │
│  │  - item     循环迭代项      ${item}, ${item.id}                     │   │
│  │  - index    循环索引        ${index}                                │   │
│  │  - source   转换源数据      ${source}, ${source.name}               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  字面量：                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  { "literal": value }                                               │   │
│  │  - 字符串: { "literal": "hello" }                                   │   │
│  │  - 数字:   { "literal": 123 }                                       │   │
│  │  - 布尔:   { "literal": true }                                      │   │
│  │  - null:   { "literal": null }                                      │   │
│  │  - 数组:   { "literal": [1, 2, 3] }                                 │   │
│  │  - 对象:   { "literal": { "key": "value" } }                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  复杂表达式：                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  { "expr": "JavaScript 表达式" }                                    │   │
│  │  - 算术:   { "expr": "${param:price} * ${param:quantity}" }        │   │
│  │  - 比较:   { "expr": "${var:age} >= 18" }                          │   │
│  │  - 逻辑:   { "expr": "${var:a} && ${var:b}" }                      │   │
│  │  - 三元:   { "expr": "${var:x} ? 'yes' : 'no'" }                   │   │
│  │  - 模板:   { "expr": "`Hello, ${var:name}`" }                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 内置函数

| 函数 | 说明 | 示例 | 生成代码 |
|-----|------|------|---------|
| `fn:now` | 当前时间 | `${fn:now}` | `new Date()` |
| `fn:uuid` | UUID | `${fn:uuid}` | `uuidv4()` |
| `fn:snowflake` | 雪花ID | `${fn:snowflake}` | `this.idGenerator.nextId()` |
| `fn:isEmpty` | 空值判断 | `${fn:isEmpty(${var:x})}` | `isEmpty(x)` |
| `fn:isNotEmpty` | 非空判断 | `${fn:isNotEmpty(${var:x})}` | `!isEmpty(x)` |
| `fn:toNumber` | 转数字 | `${fn:toNumber(${param:str})}` | `Number(str)` |
| `fn:toString` | 转字符串 | `${fn:toString(${var:num})}` | `String(num)` |
| `fn:toJson` | 转JSON | `${fn:toJson(${var:obj})}` | `JSON.stringify(obj)` |
| `fn:parseJson` | 解析JSON | `${fn:parseJson(${param:str})}` | `JSON.parse(str)` |
| `fn:dictLabel` | 字典标签 | `${fn:dictLabel('STATUS', ${var:code})}` | `this.dictService.getLabel('STATUS', code)` |
| `fn:formatDate` | 格式化日期 | `${fn:formatDate(${var:date}, 'YYYY-MM-DD')}` | `dayjs(date).format('YYYY-MM-DD')` |

### 4.3 上下文变量

| 变量 | 说明 | 生成代码 |
|-----|------|---------|
| `ctx:userId` | 当前用户ID | `this.contextService.getUserId()` |
| `ctx:userName` | 当前用户名 | `this.contextService.getUserName()` |
| `ctx:tenantId` | 租户ID | `this.contextService.getTenantId()` |
| `ctx:orgId` | 组织ID | `this.contextService.getOrgId()` |
| `ctx:roles` | 用户角色 | `this.contextService.getRoles()` |
| `ctx:permissions` | 用户权限 | `this.contextService.getPermissions()` |

### 4.4 表达式解析器

```typescript
/**
 * 表达式解析器
 */
export class ExpressionParser {

    /**
     * 解析表达式为代码字符串
     */
    parse(expression: Expression, context: ParseContext): string {
        if (expression === null || expression === undefined) {
            return 'null';
        }

        // 字面量
        if ('literal' in expression) {
            return this.parseLiteral(expression.literal, context);
        }

        // 复杂表达式
        if ('expr' in expression) {
            return this.parseExpr(expression.expr, context);
        }

        // 简单值
        return this.parseLiteral(expression, context);
    }

    /**
     * 解析字面量
     */
    private parseLiteral(value: any, context: ParseContext): string {
        if (typeof value === 'string') {
            // 检查是否包含表达式
            if (value.includes('${')) {
                return this.parseExpr(value, context);
            }
            return JSON.stringify(value);
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        if (value === null) {
            return 'null';
        }
        if (Array.isArray(value)) {
            const items = value.map(v => this.parseLiteral(v, context));
            return `[${items.join(', ')}]`;
        }
        if (typeof value === 'object') {
            const entries = Object.entries(value).map(([k, v]) => {
                const parsedValue = this.parseLiteral(v, context);
                return `${k}: ${parsedValue}`;
            });
            return `{ ${entries.join(', ')} }`;
        }
        return String(value);
    }

    /**
     * 解析表达式字符串
     */
    private parseExpr(expr: string, context: ParseContext): string {
        // 替换所有 ${namespace:path} 模式
        return expr.replace(/\$\{([^}]+)\}/g, (match, content) => {
            const [namespace, ...pathParts] = content.split(':');
            const path = pathParts.join(':');

            switch (namespace) {
                case 'param':
                    return path || content;
                case 'var':
                    return path || content;
                case 'ctx':
                    return this.parseContextVar(path);
                case 'fn':
                    return this.parseFunction(path, context);
                case 'item':
                    return path ? `${context.itemName}.${path}` : context.itemName || 'item';
                case 'index':
                    return context.indexName || 'index';
                case 'source':
                    return path ? `${context.sourceName}.${path}` : context.sourceName || 'source';
                default:
                    // 无命名空间，视为变量
                    return content;
            }
        });
    }

    /**
     * 解析上下文变量
     */
    private parseContextVar(path: string): string {
        const contextMap: Record<string, string> = {
            'userId': 'this.contextService.getUserId()',
            'userName': 'this.contextService.getUserName()',
            'tenantId': 'this.contextService.getTenantId()',
            'orgId': 'this.contextService.getOrgId()',
            'roles': 'this.contextService.getRoles()',
            'permissions': 'this.contextService.getPermissions()',
        };
        return contextMap[path] || `this.contextService.get('${path}')`;
    }

    /**
     * 解析内置函数
     */
    private parseFunction(funcCall: string, context: ParseContext): string {
        // 简单函数（无参数）
        const simpleFunctions: Record<string, string> = {
            'now': 'new Date()',
            'uuid': 'uuidv4()',
            'snowflake': 'this.idGenerator.nextId()',
        };

        if (simpleFunctions[funcCall]) {
            return simpleFunctions[funcCall];
        }

        // 带参数的函数
        const funcMatch = funcCall.match(/^(\w+)\((.+)\)$/);
        if (funcMatch) {
            const [, funcName, argsStr] = funcMatch;
            const args = this.parseArgs(argsStr, context);

            const functionMap: Record<string, (args: string[]) => string> = {
                'isEmpty': (a) => `isEmpty(${a[0]})`,
                'isNotEmpty': (a) => `!isEmpty(${a[0]})`,
                'toNumber': (a) => `Number(${a[0]})`,
                'toString': (a) => `String(${a[0]})`,
                'toJson': (a) => `JSON.stringify(${a[0]})`,
                'parseJson': (a) => `JSON.parse(${a[0]})`,
                'dictLabel': (a) => `this.dictService.getLabel(${a[0]}, ${a[1]})`,
                'formatDate': (a) => `dayjs(${a[0]}).format(${a[1]})`,
                'calculateTotal': (a) => `this.calculateTotal(${a[0]})`,
            };

            if (functionMap[funcName]) {
                return functionMap[funcName](args);
            }

            // 未知函数，生成为方法调用
            return `this.${funcName}(${args.join(', ')})`;
        }

        return funcCall;
    }

    /**
     * 解析参数列表
     */
    private parseArgs(argsStr: string, context: ParseContext): string[] {
        // 简单实现：按逗号分割（不处理嵌套括号）
        return argsStr.split(',').map(arg => {
            const trimmed = arg.trim();
            // 递归解析表达式
            if (trimmed.includes('${')) {
                return this.parseExpr(trimmed, context);
            }
            return trimmed;
        });
    }
}
```

---

## 5. Service 代码生成器

### 5.1 生成器架构

```typescript
/**
 * Service 代码生成器
 */
export class ServiceGenerator implements CodeGenerator<LogicConfig, GenerationContext> {
    readonly name = 'ServiceGenerator';
    readonly supportedTypes = ['logic'];

    constructor(
        private readonly expressionParser: ExpressionParser,
        private readonly stepGenerators: Map<string, StepCodeGenerator>,
    ) {
        // 注册步骤生成器
        this.registerStepGenerators();
    }

    async generate(config: LogicConfig, context: GenerationContext): Promise<GeneratedFile[]> {
        const project = new Project();

        // 生成 Service 类文件
        const sourceFile = project.createSourceFile(
            `${config.entityRef}.service.ts`,
            '',
            { overwrite: true }
        );

        // 1. 生成导入语句
        this.generateImports(sourceFile, config, context);

        // 2. 生成 Service 类
        const serviceClass = this.generateServiceClass(sourceFile, config);

        // 3. 生成构造函数
        this.generateConstructor(serviceClass, config);

        // 4. 生成方法
        for (const method of config.methods) {
            this.generateMethod(serviceClass, method, config, context);
        }

        return [{
            path: `src/modules/${config.moduleRef}/${config.entityRef}.service.ts`,
            content: sourceFile.getFullText(),
            sourceComponent: {
                type: 'logic',
                code: config.componentCode
            },
            overwrite: true
        }];
    }

    /**
     * 生成导入语句
     */
    private generateImports(sourceFile: SourceFile, config: LogicConfig, context: GenerationContext): void {
        // NestJS 核心导入
        sourceFile.addImportDeclaration({
            namedImports: ['Injectable', 'NotFoundException', 'BadRequestException', 'ConflictException'],
            moduleSpecifier: '@nestjs/common'
        });

        // TypeORM 导入
        sourceFile.addImportDeclaration({
            namedImports: ['Repository', 'DataSource', 'Like', 'Not', 'In', 'Between'],
            moduleSpecifier: 'typeorm'
        });

        // 自定义导入
        sourceFile.addImportDeclaration({
            namedImports: ['InjectRepository'],
            moduleSpecifier: '@cs/nest-typeorm'
        });

        sourceFile.addImportDeclaration({
            namedImports: ['LoggerService'],
            moduleSpecifier: '@cs/nest-common'
        });

        // 实体导入
        const model = context.referenceResolver.resolveModel(config.modelRef);
        if (model && config.entityRef) {
            const entityName = this.toPascalCase(config.entityRef);
            sourceFile.addImportDeclaration({
                namedImports: [entityName],
                moduleSpecifier: `./${config.entityRef}.entity`
            });
        }

        // DTO 导入
        const dtoConfig = context.referenceResolver.resolveDto(config.moduleRef, config.entityRef);
        if (dtoConfig) {
            const dtoImports = Object.keys(dtoConfig.dtos).map(k =>
                this.toPascalCase(k)
            );
            sourceFile.addImportDeclaration({
                namedImports: dtoImports,
                moduleSpecifier: `./${config.entityRef}.dto`
            });
        }

        // 依赖服务导入
        if (config.dependencies) {
            for (const dep of config.dependencies) {
                sourceFile.addImportDeclaration({
                    namedImports: [dep.type],
                    moduleSpecifier: dep.moduleRef
                        ? `../${dep.moduleRef}/${dep.name.replace('Service', '')}.service`
                        : `./${dep.name.replace('Service', '')}.service`
                });
            }
        }
    }

    /**
     * 生成 Service 类
     */
    private generateServiceClass(sourceFile: SourceFile, config: LogicConfig): ClassDeclaration {
        const className = this.toPascalCase(config.entityRef) + 'Service';

        return sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: [] }],
            docs: [{
                description: config.componentName || `${config.entityRef} 服务`
            }]
        });
    }

    /**
     * 生成构造函数
     */
    private generateConstructor(serviceClass: ClassDeclaration, config: LogicConfig): void {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];

        // Repository 注入
        const entityName = this.toPascalCase(config.entityRef);
        params.push({
            name: `${config.entityRef}Repository`,
            type: `Repository<${entityName}>`,
            decorators: [{
                name: 'InjectRepository',
                arguments: [`{ entity: ${entityName} }`]
            }],
            scope: Scope.Private,
            isReadonly: true
        });

        // Logger 注入
        params.push({
            name: 'logger',
            type: 'LoggerService',
            scope: Scope.Private,
            isReadonly: true
        });

        // DataSource 注入（如果使用事务）
        if (this.usesTransaction(config)) {
            params.push({
                name: 'dataSource',
                type: 'DataSource',
                scope: Scope.Private,
                isReadonly: true
            });
        }

        // 依赖服务注入
        if (config.dependencies) {
            for (const dep of config.dependencies) {
                params.push({
                    name: dep.name,
                    type: dep.type,
                    scope: Scope.Private,
                    isReadonly: true
                });
            }
        }

        serviceClass.addConstructor({
            parameters: params
        });
    }

    /**
     * 生成方法
     */
    private generateMethod(
        serviceClass: ClassDeclaration,
        method: ServiceMethod,
        config: LogicConfig,
        context: GenerationContext
    ): void {
        const methodDeclaration = serviceClass.addMethod({
            name: method.methodName,
            isAsync: method.async !== false,
            parameters: method.parameters?.map(p => ({
                name: p.name,
                type: p.type,
                hasQuestionToken: p.optional,
                initializer: p.defaultValue !== undefined ? String(p.defaultValue) : undefined
            })) || [],
            returnType: method.async !== false
                ? `Promise<${method.returnType || 'void'}>`
                : method.returnType || 'void',
            docs: [{
                description: method.description || '',
                tags: [
                    ...(method.parameters?.map(p => ({
                        tagName: 'param',
                        text: `${p.name} ${p.description || ''}`
                    })) || []),
                    ...(method.returnDescription ? [{
                        tagName: 'returns',
                        text: method.returnDescription
                    }] : []),
                    ...(method.throws?.map(t => ({
                        tagName: 'throws',
                        text: t
                    })) || [])
                ]
            }]
        });

        // 生成方法体
        const bodyStatements = this.generateMethodBody(method.steps, config, context);
        methodDeclaration.setBodyText(bodyStatements.join('\n'));
    }

    /**
     * 生成方法体
     */
    private generateMethodBody(
        steps: LogicStep[],
        config: LogicConfig,
        context: GenerationContext
    ): string[] {
        const statements: string[] = [];

        for (const step of steps) {
            // 添加注释
            if (step.comment) {
                statements.push(`// ${step.comment}`);
            }

            // 获取步骤生成器
            const generator = this.stepGenerators.get(step.type);
            if (!generator) {
                statements.push(`// TODO: Unknown step type: ${step.type}`);
                continue;
            }

            // 生成步骤代码
            const stepCode = generator.generate(step.config, {
                config,
                context,
                expressionParser: this.expressionParser
            });

            statements.push(...stepCode);
            statements.push(''); // 空行分隔
        }

        return statements;
    }

    /**
     * 注册步骤生成器
     */
    private registerStepGenerators(): void {
        this.stepGenerators.set('declare', new DeclareStepGenerator());
        this.stepGenerators.set('assign', new AssignStepGenerator());
        this.stepGenerators.set('query', new QueryStepGenerator());
        this.stepGenerators.set('queryOne', new QueryOneStepGenerator());
        this.stepGenerators.set('count', new CountStepGenerator());
        this.stepGenerators.set('exists', new ExistsStepGenerator());
        this.stepGenerators.set('save', new SaveStepGenerator());
        this.stepGenerators.set('update', new UpdateStepGenerator());
        this.stepGenerators.set('delete', new DeleteStepGenerator());
        this.stepGenerators.set('validate', new ValidateStepGenerator());
        this.stepGenerators.set('transform', new TransformStepGenerator());
        this.stepGenerators.set('condition', new ConditionStepGenerator());
        this.stepGenerators.set('loop', new LoopStepGenerator());
        this.stepGenerators.set('call', new CallStepGenerator());
        this.stepGenerators.set('return', new ReturnStepGenerator());
        this.stepGenerators.set('throw', new ThrowStepGenerator());
        this.stepGenerators.set('log', new LogStepGenerator());
        this.stepGenerators.set('transaction', new TransactionStepGenerator());
    }

    private usesTransaction(config: LogicConfig): boolean {
        return config.methods.some(m =>
            m.steps.some(s => s.type === 'transaction')
        );
    }

    private toPascalCase(str: string): string {
        return str.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
    }
}
```

### 5.2 步骤生成器示例

```typescript
/**
 * 步骤代码生成器接口
 */
interface StepCodeGenerator {
    generate(config: any, context: StepGeneratorContext): string[];
}

interface StepGeneratorContext {
    config: LogicConfig;
    context: GenerationContext;
    expressionParser: ExpressionParser;
}

/**
 * Query 步骤生成器
 */
class QueryStepGenerator implements StepCodeGenerator {
    generate(stepConfig: QueryStepConfig, ctx: StepGeneratorContext): string[] {
        const { result, entityRef, where, orderBy, pagination, select, relations } = stepConfig;
        const statements: string[] = [];
        const repoName = `this.${entityRef}Repository`;

        // 构建查询选项
        const optionParts: string[] = [];

        // where 条件
        if (where && where.length > 0) {
            const whereCode = this.generateWhereClause(where, ctx);
            optionParts.push(`where: ${whereCode}`);
        }

        // select 字段
        if (select && select.length > 0) {
            optionParts.push(`select: [${select.map(s => `'${s}'`).join(', ')}]`);
        }

        // relations 关联
        if (relations && relations.length > 0) {
            optionParts.push(`relations: [${relations.map(r => `'${r}'`).join(', ')}]`);
        }

        // orderBy 排序
        if (orderBy && orderBy.length > 0) {
            const orderCode = orderBy.map(o => `${o.field}: '${o.direction}'`).join(', ');
            optionParts.push(`order: { ${orderCode} }`);
        }

        // pagination 分页
        if (pagination) {
            const page = ctx.expressionParser.parse(pagination.page, {});
            const pageSize = ctx.expressionParser.parse(pagination.pageSize, {});
            optionParts.push(`skip: (${page} - 1) * ${pageSize}`);
            optionParts.push(`take: ${pageSize}`);
        }

        // 生成代码
        if (optionParts.length > 0) {
            statements.push(`const ${result} = await ${repoName}.find({`);
            for (let i = 0; i < optionParts.length; i++) {
                const comma = i < optionParts.length - 1 ? ',' : '';
                statements.push(`    ${optionParts[i]}${comma}`);
            }
            statements.push(`});`);
        } else {
            statements.push(`const ${result} = await ${repoName}.find();`);
        }

        return statements;
    }

    private generateWhereClause(conditions: WhereCondition[], ctx: StepGeneratorContext): string {
        const parts: string[] = [];

        for (const cond of conditions) {
            const value = ctx.expressionParser.parse(cond.value, {});
            const fieldCode = this.generateCondition(cond.field, cond.operator, value);
            parts.push(fieldCode);
        }

        return `{ ${parts.join(', ')} }`;
    }

    private generateCondition(field: string, operator: string, value: string): string {
        switch (operator) {
            case 'eq':
                return `${field}: ${value}`;
            case 'ne':
                return `${field}: Not(${value})`;
            case 'gt':
                return `${field}: MoreThan(${value})`;
            case 'gte':
                return `${field}: MoreThanOrEqual(${value})`;
            case 'lt':
                return `${field}: LessThan(${value})`;
            case 'lte':
                return `${field}: LessThanOrEqual(${value})`;
            case 'like':
                return `${field}: Like(\`%\${${value}}%\`)`;
            case 'in':
                return `${field}: In(${value})`;
            case 'notIn':
                return `${field}: Not(In(${value}))`;
            case 'isNull':
                return `${field}: IsNull()`;
            case 'isNotNull':
                return `${field}: Not(IsNull())`;
            case 'between':
                return `${field}: Between(${value}[0], ${value}[1])`;
            default:
                return `${field}: ${value}`;
        }
    }
}

/**
 * Validate 步骤生成器
 */
class ValidateStepGenerator implements StepCodeGenerator {
    generate(stepConfig: ValidateStepConfig, ctx: StepGeneratorContext): string[] {
        const statements: string[] = [];

        for (const rule of stepConfig.rules) {
            const condition = ctx.expressionParser.parse(rule.condition, {});
            const message = typeof rule.message === 'string'
                ? `'${rule.message}'`
                : ctx.expressionParser.parse(rule.message, {});

            const exceptionClass = this.getExceptionClass(rule.exceptionType);

            statements.push(`if (!(${condition})) {`);
            statements.push(`    throw new ${exceptionClass}(${message});`);
            statements.push(`}`);
        }

        return statements;
    }

    private getExceptionClass(type?: string): string {
        switch (type) {
            case 'NotFound': return 'NotFoundException';
            case 'BadRequest': return 'BadRequestException';
            case 'Conflict': return 'ConflictException';
            case 'Forbidden': return 'ForbiddenException';
            case 'Business': return 'BusinessException';
            default: return 'BadRequestException';
        }
    }
}

/**
 * Condition 步骤生成器
 */
class ConditionStepGenerator implements StepCodeGenerator {
    generate(stepConfig: ConditionStepConfig, ctx: StepGeneratorContext): string[] {
        const statements: string[] = [];
        const condition = ctx.expressionParser.parse(stepConfig.condition, {});

        // if 分支
        statements.push(`if (${condition}) {`);
        const thenStatements = this.generateNestedSteps(stepConfig.thenSteps, ctx);
        statements.push(...thenStatements.map(s => `    ${s}`));
        statements.push(`}`);

        // else if 分支
        if (stepConfig.elseIfBranches) {
            for (const branch of stepConfig.elseIfBranches) {
                const branchCondition = ctx.expressionParser.parse(branch.condition, {});
                statements.push(` else if (${branchCondition}) {`);
                const branchStatements = this.generateNestedSteps(branch.steps, ctx);
                statements.push(...branchStatements.map(s => `    ${s}`));
                statements.push(`}`);
            }
        }

        // else 分支
        if (stepConfig.elseSteps && stepConfig.elseSteps.length > 0) {
            statements.push(` else {`);
            const elseStatements = this.generateNestedSteps(stepConfig.elseSteps, ctx);
            statements.push(...elseStatements.map(s => `    ${s}`));
            statements.push(`}`);
        }

        return statements;
    }

    private generateNestedSteps(steps: LogicStep[], ctx: StepGeneratorContext): string[] {
        // 递归调用生成器（实际实现中需要注入 ServiceGenerator）
        const statements: string[] = [];
        for (const step of steps) {
            statements.push(`// Nested step: ${step.type}`);
        }
        return statements;
    }
}
```

---

## 6. 完整配置示例

### 6.1 用户服务配置示例

```json
{
    "$schema": "assembox/logic/v1",
    "componentCode": "user_service",
    "componentName": "用户服务",
    "moduleRef": "user",
    "modelRef": "user_model",
    "entityRef": "user",
    "dependencies": [
        {
            "name": "emailService",
            "type": "EmailService",
            "moduleRef": "common"
        }
    ],
    "methods": [
        {
            "methodName": "findById",
            "description": "根据ID查询用户",
            "parameters": [
                {
                    "name": "id",
                    "type": "string",
                    "description": "用户ID"
                }
            ],
            "returnType": "User",
            "steps": [
                {
                    "type": "queryOne",
                    "comment": "查询用户",
                    "config": {
                        "result": "user",
                        "entityRef": "user",
                        "where": [
                            {
                                "field": "id",
                                "operator": "eq",
                                "value": { "expr": "${param:id}" }
                            }
                        ],
                        "notFoundBehavior": "throw",
                        "notFoundMessage": "用户不存在"
                    }
                },
                {
                    "type": "return",
                    "config": {
                        "value": { "expr": "${var:user}" }
                    }
                }
            ]
        },
        {
            "methodName": "create",
            "description": "创建用户",
            "parameters": [
                {
                    "name": "dto",
                    "type": "CreateUserDto",
                    "description": "创建用户DTO"
                }
            ],
            "returnType": "User",
            "throws": ["ConflictException"],
            "steps": [
                {
                    "type": "exists",
                    "comment": "检查编码是否已存在",
                    "config": {
                        "result": "codeExists",
                        "entityRef": "user",
                        "where": [
                            {
                                "field": "code",
                                "operator": "eq",
                                "value": { "expr": "${param:dto.code}" }
                            }
                        ]
                    }
                },
                {
                    "type": "validate",
                    "comment": "校验编码唯一性",
                    "config": {
                        "rules": [
                            {
                                "condition": { "expr": "!${var:codeExists}" },
                                "message": "用户编码已存在",
                                "exceptionType": "Conflict"
                            }
                        ]
                    }
                },
                {
                    "type": "save",
                    "comment": "保存用户",
                    "config": {
                        "result": "savedUser",
                        "entityRef": "user",
                        "data": {
                            "type": "build",
                            "fields": [
                                { "field": "code", "value": { "expr": "${param:dto.code}" } },
                                { "field": "name", "value": { "expr": "${param:dto.name}" } },
                                { "field": "email", "value": { "expr": "${param:dto.email}" } },
                                { "field": "createdAt", "value": { "expr": "${fn:now}" } },
                                { "field": "creatorId", "value": { "expr": "${ctx:userId}" } }
                            ]
                        }
                    }
                },
                {
                    "type": "call",
                    "comment": "发送欢迎邮件",
                    "config": {
                        "service": "emailService",
                        "method": "sendWelcomeEmail",
                        "args": [
                            { "expr": "${var:savedUser.email}" },
                            { "expr": "${var:savedUser.name}" }
                        ]
                    }
                },
                {
                    "type": "return",
                    "config": {
                        "value": { "expr": "${var:savedUser}" }
                    }
                }
            ]
        },
        {
            "methodName": "findPage",
            "description": "分页查询用户",
            "parameters": [
                { "name": "page", "type": "number", "defaultValue": 1 },
                { "name": "pageSize", "type": "number", "defaultValue": 20 },
                { "name": "keyword", "type": "string", "optional": true }
            ],
            "returnType": "{ list: User[]; total: number; page: number; pageSize: number }",
            "steps": [
                {
                    "type": "declare",
                    "config": {
                        "name": "whereConditions",
                        "type": "any",
                        "initialValue": { "literal": { "isRemoved": 0 } }
                    }
                },
                {
                    "type": "condition",
                    "comment": "如果有关键字，添加模糊查询条件",
                    "config": {
                        "condition": { "expr": "${param:keyword}" },
                        "thenSteps": [
                            {
                                "type": "assign",
                                "config": {
                                    "target": "whereConditions.name",
                                    "value": { "expr": "Like(`%${param:keyword}%`)" }
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "query",
                    "comment": "查询用户列表",
                    "config": {
                        "result": "users",
                        "entityRef": "user",
                        "where": [
                            { "field": "isRemoved", "operator": "eq", "value": { "literal": 0 } }
                        ],
                        "orderBy": [
                            { "field": "createdAt", "direction": "DESC" }
                        ],
                        "pagination": {
                            "page": { "expr": "${param:page}" },
                            "pageSize": { "expr": "${param:pageSize}" }
                        }
                    }
                },
                {
                    "type": "count",
                    "comment": "统计总数",
                    "config": {
                        "result": "total",
                        "entityRef": "user",
                        "where": [
                            { "field": "isRemoved", "operator": "eq", "value": { "literal": 0 } }
                        ]
                    }
                },
                {
                    "type": "return",
                    "config": {
                        "value": {
                            "literal": {
                                "list": "${var:users}",
                                "total": "${var:total}",
                                "page": "${param:page}",
                                "pageSize": "${param:pageSize}"
                            }
                        }
                    }
                }
            ]
        }
    ]
}
```

### 6.2 生成的 Service 代码

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Repository, DataSource, Like } from 'typeorm';
import { InjectRepository } from '@cs/nest-typeorm';
import { LoggerService } from '@cs/nest-common';
import { User } from './user.entity';
import { CreateUserDto } from './user.dto';
import { EmailService } from '../common/email.service';

/**
 * 用户服务
 */
@Injectable()
export class UserService {
    constructor(
        @InjectRepository({ entity: User })
        private readonly userRepository: Repository<User>,
        private readonly logger: LoggerService,
        private readonly emailService: EmailService,
    ) {}

    /**
     * 根据ID查询用户
     * @param id 用户ID
     * @returns User
     */
    async findById(id: string): Promise<User> {
        // 查询用户
        const user = await this.userRepository.findOne({
            where: { id: id },
        });
        if (!user) {
            throw new NotFoundException('用户不存在');
        }

        return user;
    }

    /**
     * 创建用户
     * @param dto 创建用户DTO
     * @returns User
     * @throws ConflictException
     */
    async create(dto: CreateUserDto): Promise<User> {
        // 检查编码是否已存在
        const codeExists = await this.userRepository.exists({
            where: { code: dto.code },
        });

        // 校验编码唯一性
        if (codeExists) {
            throw new ConflictException('用户编码已存在');
        }

        // 保存用户
        const entity = this.userRepository.create({
            code: dto.code,
            name: dto.name,
            email: dto.email,
            createdAt: new Date(),
            creatorId: this.contextService.getUserId(),
        });
        const savedUser = await this.userRepository.save(entity);

        // 发送欢迎邮件
        await this.emailService.sendWelcomeEmail(savedUser.email, savedUser.name);

        return savedUser;
    }

    /**
     * 分页查询用户
     * @param page
     * @param pageSize
     * @param keyword
     * @returns { list: User[]; total: number; page: number; pageSize: number }
     */
    async findPage(
        page: number = 1,
        pageSize: number = 20,
        keyword?: string
    ): Promise<{ list: User[]; total: number; page: number; pageSize: number }> {
        let whereConditions: any = { isRemoved: 0 };

        // 如果有关键字，添加模糊查询条件
        if (keyword) {
            whereConditions.name = Like(`%${keyword}%`);
        }

        // 查询用户列表
        const users = await this.userRepository.find({
            where: whereConditions,
            order: { createdAt: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });

        // 统计总数
        const total = await this.userRepository.count({
            where: whereConditions,
        });

        return {
            list: users,
            total: total,
            page: page,
            pageSize: pageSize,
        };
    }
}
```

---

## 7. 设计决策

| 决策点 | 选择 | 原因 |
|-------|------|------|
| 表达式语法 | `${namespace:path}` | 清晰区分变量来源，易于解析 |
| 步骤类型 | 细粒度步骤 | 每个步骤职责单一，便于组合和复用 |
| 代码生成方式 | ts-morph | 类型安全的 AST 操作，生成代码可读性好 |
| 异常处理 | 类型化异常 | 与 NestJS 异常体系一致 |
| 事务处理 | 显式事务步骤 | 明确事务边界，避免隐式行为 |

---

## 8. 相关文档

| 文档 | 说明 |
|-----|------|
| [服务层代码生成总览](./overview.md) | 整体架构设计 |
| [组件类型扩展规范](../01-storage/component-types.md) | 组件类型定义 |
| [构建发布部署](../07-build-deploy/overview.md) | 构建和部署流程 |
