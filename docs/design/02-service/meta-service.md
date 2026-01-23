# 元数据服务设计

> **状态**: 设计中
> **更新日期**: 2025-01-20

---

## 1. 概述

### 1.1 职责定义

元数据服务（MetaModule）负责管理 Assembox 平台的核心元数据，包括：

- **模型定义**: 业务实体的结构描述
- **字段定义**: 模型属性的类型、约束、验证规则
- **关联定义**: 模型之间的关系
- **操作定义**: 模型支持的 CRUD 及自定义操作

### 1.2 核心概念

```
┌─────────────────────────────────────────────────────────────┐
│                      ModelDefinition                        │
│  代码: user                                                 │
│  名称: 用户                                                 │
│  表名: t_user                                               │
├─────────────────────────────────────────────────────────────┤
│  FieldDefinitions                                           │
│  ├── id (string, 主键)                                      │
│  ├── name (string, 必填)                                    │
│  ├── email (string, 唯一)                                   │
│  ├── age (integer)                                          │
│  └── deptId (relation -> department)                        │
├─────────────────────────────────────────────────────────────┤
│  RelationDefinitions                                        │
│  └── department (many-to-one -> department)                 │
├─────────────────────────────────────────────────────────────┤
│  ActionDefinitions                                          │
│  ├── create (内置)                                          │
│  ├── update (内置)                                          │
│  ├── delete (软删除)                                        │
│  └── query (分页查询)                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 数据模型

### 2.1 模型定义 (ModelDefinition)

```typescript
interface ModelDefinition {
  id: string;                    // 主键
  code: string;                  // 模型代码（唯一标识）
  name: string;                  // 模型名称
  description?: string;          // 描述
  tableName: string;             // 物理表名
  databaseName?: string;         // 数据库名（跨库场景）

  config: ModelConfig;           // 模型配置
  indexes?: IndexDefinition[];   // 索引定义

  status: ModelStatus;           // 状态: draft/published/deprecated
  versionNum: number;            // 版本号
  publishedAt?: Date;            // 发布时间

  tenant: string;                // 租户代码
  // ... 审计字段（继承自 HasPrimaryFullEntity）
}

interface ModelConfig {
  enableSoftDelete: boolean;     // 启用软删除
  enableVersion: boolean;        // 启用乐观锁
  enableAudit: boolean;          // 启用审计字段
  enableTenant: boolean;         // 启用租户隔离
  cacheStrategy: CacheStrategy;  // 缓存策略
  cacheTTL?: number;             // 缓存过期时间（秒）
}

enum ModelStatus {
  DRAFT = 'draft',               // 草稿
  PUBLISHED = 'published',       // 已发布
  DEPRECATED = 'deprecated',     // 已废弃
}

enum CacheStrategy {
  NONE = 'none',                 // 不缓存
  READ = 'read',                 // 读缓存
  WRITE_THROUGH = 'write-through', // 写透缓存
}
```

### 2.2 字段定义 (FieldDefinition)

```typescript
interface FieldDefinition {
  id: string;
  modelId: string;               // 关联的模型ID
  code: string;                  // 字段代码
  name: string;                  // 字段名称
  description?: string;

  type: FieldType;               // 字段类型
  dbType: string;                // 数据库类型

  constraints: FieldConstraints; // 约束
  validations?: ValidationRule[];// 验证规则
  ui?: FieldUIConfig;            // UI 配置
  computed?: ComputedFieldConfig;// 计算字段配置

  sortOrder: number;             // 排序
  tenant: string;
}

enum FieldType {
  STRING = 'string',
  TEXT = 'text',
  NUMBER = 'number',
  INTEGER = 'integer',
  DECIMAL = 'decimal',
  BOOLEAN = 'boolean',
  DATE = 'date',
  DATETIME = 'datetime',
  TIMESTAMP = 'timestamp',
  JSON = 'json',
  ARRAY = 'array',
  ENUM = 'enum',
  RELATION = 'relation',
  FILE = 'file',
  IMAGE = 'image',
}

interface FieldConstraints {
  required: boolean;             // 必填
  unique: boolean;               // 唯一
  primaryKey: boolean;           // 主键
  autoIncrement?: boolean;       // 自增
  default?: any;                 // 默认值
  length?: number;               // 长度
  precision?: number;            // 精度
  scale?: number;                // 小数位数
  enum?: any[];                  // 枚举值列表
}

interface ValidationRule {
  type: ValidationType;          // 验证类型
  value?: any;                   // 验证值
  message?: string;              // 错误消息
  pattern?: string;              // 正则表达式
  min?: number;
  max?: number;
  values?: any[];                // 枚举值
}

enum ValidationType {
  REGEX = 'regex',
  RANGE = 'range',
  LENGTH = 'length',
  ENUM = 'enum',
  CUSTOM = 'custom',
}
```

### 2.3 关联定义 (RelationDefinition)

```typescript
interface RelationDefinition {
  id: string;
  code: string;                  // 关联代码
  name: string;                  // 关联名称
  description?: string;

  sourceModelId: string;         // 源模型ID
  sourceModelCode: string;       // 源模型代码
  targetModelId: string;         // 目标模型ID
  targetModelCode: string;       // 目标模型代码

  relationType: RelationType;    // 关联类型
  joinConfig: JoinConfig;        // JOIN 配置

  includeFields?: string[];      // 包含的目标字段
  fieldAliases?: Record<string, string>; // 字段别名映射

  tenant: string;
}

enum RelationType {
  MANY_TO_ONE = 'many-to-one',   // 多对一
  ONE_TO_MANY = 'one-to-many',   // 一对多
  ONE_TO_ONE = 'one-to-one',     // 一对一
  MANY_TO_MANY = 'many-to-many', // 多对多
}

interface JoinConfig {
  joinType: JoinType;            // JOIN 类型
  sourceField: string;           // 源字段
  targetField: string;           // 目标字段
  junctionTable?: string;        // 中间表（多对多）
  junctionSourceField?: string;
  junctionTargetField?: string;
}

enum JoinType {
  LEFT = 'LEFT',
  INNER = 'INNER',
  RIGHT = 'RIGHT',
}
```

### 2.4 操作定义 (ActionDefinition)

```typescript
interface ActionDefinition {
  id: string;
  modelId: string;               // 关联的模型ID
  code: string;                  // 操作代码
  name: string;                  // 操作名称
  description?: string;

  actionType: ActionType;        // 操作类型
  permissions?: string[];        // 所需权限

  hooks?: HookConfig;            // 钩子配置
  queryConfig?: QueryConfig;     // 查询配置
  mutationConfig?: MutationConfig; // 变更配置
  customConfig?: CustomActionConfig; // 自定义配置

  isEnabled: boolean;
  tenant: string;
}

enum ActionType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  SOFT_DELETE = 'softDelete',
  QUERY = 'query',
  AGGREGATE = 'aggregate',
  IMPORT = 'import',
  EXPORT = 'export',
  CUSTOM = 'custom',
}

interface HookConfig {
  before?: string[];             // 前置钩子（插件代码列表）
  after?: string[];              // 后置钩子
}

interface CustomActionConfig {
  handlerType: CustomHandlerType;
  rpcConfig?: RpcConfig;         // RPC 调用配置
  scriptConfig?: ScriptConfig;   // 脚本配置
}

enum CustomHandlerType {
  RPC = 'rpc',
  MQ = 'mq',
  SCRIPT = 'script',
}
```

---

## 3. 服务设计

### 3.1 服务列表

| 服务 | 职责 |
|-----|------|
| ModelService | 模型定义的 CRUD、发布、废弃 |
| FieldService | 字段定义的 CRUD |
| RelationService | 关联定义的 CRUD |
| ActionService | 操作定义的 CRUD |
| MetaCacheService | 元数据缓存管理 |

### 3.2 ModelService

```typescript
@Injectable()
export class ModelService {
  constructor(
    @InjectRepository({ entity: ModelDefinitionEntity, repository: ModelRepository })
    private readonly modelRepository: ModelRepository,
    private readonly contextService: ContextService,
    private readonly metaCacheService: MetaCacheService,
  ) {}

  // 创建模型
  async create(dto: CreateModelDto): Promise<ModelDefinitionEntity>;

  // 更新模型
  async update(id: string, dto: UpdateModelDto): Promise<ModelDefinitionEntity>;

  // 根据 ID 查询
  async findById(id: string): Promise<ModelDefinitionEntity | null>;

  // 根据代码查询
  async findByCode(code: string): Promise<ModelDefinitionEntity | null>;

  // 查询已发布的模型
  async findPublishedByCode(code: string): Promise<ModelDefinitionEntity | null>;

  // 获取模型列表
  async findAll(status?: ModelStatus): Promise<ModelDefinitionEntity[]>;

  // 发布模型
  async publish(id: string): Promise<ModelDefinitionEntity>;

  // 废弃模型
  async deprecate(id: string): Promise<ModelDefinitionEntity>;

  // 删除模型（软删除）
  async delete(id: string): Promise<void>;
}
```

**业务规则**:

1. 模型代码在同一租户内唯一
2. 已发布的模型不能修改 `code` 和 `tableName`
3. 发布时版本号自增，记录发布时间
4. 删除模型时级联删除字段、关联、操作定义

### 3.3 FieldService

```typescript
@Injectable()
export class FieldService {
  // 批量创建字段
  async createMany(modelId: string, fields: CreateFieldDto[]): Promise<FieldDefinitionEntity[]>;

  // 更新字段
  async update(id: string, dto: UpdateFieldDto): Promise<FieldDefinitionEntity>;

  // 获取模型的所有字段
  async findByModelId(modelId: string): Promise<FieldDefinitionEntity[]>;

  // 获取模型的字段（按代码）
  async findByModelCode(modelCode: string): Promise<FieldDefinitionEntity[]>;

  // 删除字段
  async delete(id: string): Promise<void>;

  // 调整字段顺序
  async reorder(modelId: string, fieldIds: string[]): Promise<void>;
}
```

**业务规则**:

1. 字段代码在同一模型内唯一
2. 系统字段（id, tenant, 审计字段）不允许用户创建/修改
3. 已发布模型的字段修改需要记录变更

### 3.4 MetaCacheService

```typescript
@Injectable()
export class MetaCacheService {
  constructor(
    private readonly redisService: RedisService,
    private readonly modelService: ModelService,
    private readonly fieldService: FieldService,
    private readonly relationService: RelationService,
    private readonly actionService: ActionService,
  ) {}

  // 获取模型（优先从缓存）
  async getModel(modelCode: string): Promise<ModelDefinitionEntity>;

  // 获取模型的字段（优先从缓存）
  async getFieldsByModelCode(modelCode: string): Promise<FieldDefinitionEntity[]>;

  // 获取模型的关联（优先从缓存）
  async getRelationsByModelCode(modelCode: string): Promise<RelationDefinitionEntity[]>;

  // 获取模型的操作（优先从缓存）
  async getAction(modelCode: string, actionCode: string): Promise<ActionDefinitionEntity | null>;

  // 清除模型缓存
  async invalidateModel(modelCode: string): Promise<void>;

  // 清除租户所有缓存
  async invalidateTenant(tenantCode: string): Promise<void>;
}
```

**缓存 Key 设计**:

```
# 模型缓存
assembox:meta:{tenant}:model:{modelCode}

# 字段缓存
assembox:meta:{tenant}:fields:{modelCode}

# 关联缓存
assembox:meta:{tenant}:relations:{modelCode}

# 操作缓存
assembox:meta:{tenant}:action:{modelCode}:{actionCode}
```

**缓存策略**:

| 数据类型 | TTL | 更新策略 |
|---------|-----|---------|
| 模型定义 | 1h | 发布/更新时主动失效 |
| 字段定义 | 1h | 更新时主动失效 |
| 关联定义 | 1h | 更新时主动失效 |
| 操作定义 | 1h | 更新时主动失效 |

---

## 4. API 设计

### 4.1 模型 API

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/meta/models | 获取模型列表 |
| GET | /api/v1/meta/models/:code | 获取模型详情（含字段、关联、操作） |
| POST | /api/v1/meta/models | 创建模型 |
| PUT | /api/v1/meta/models/:code | 更新模型 |
| DELETE | /api/v1/meta/models/:code | 删除模型 |
| POST | /api/v1/meta/models/:code/publish | 发布模型 |
| POST | /api/v1/meta/models/:code/deprecate | 废弃模型 |

### 4.2 字段 API

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/meta/models/:code/fields | 获取字段列表 |
| POST | /api/v1/meta/models/:code/fields | 批量创建字段 |
| PUT | /api/v1/meta/models/:code/fields/:fieldCode | 更新字段 |
| DELETE | /api/v1/meta/models/:code/fields/:fieldCode | 删除字段 |
| POST | /api/v1/meta/models/:code/fields/reorder | 调整字段顺序 |

### 4.3 关联 API

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/meta/models/:code/relations | 获取关联列表 |
| POST | /api/v1/meta/models/:code/relations | 创建关联 |
| PUT | /api/v1/meta/models/:code/relations/:relationCode | 更新关联 |
| DELETE | /api/v1/meta/models/:code/relations/:relationCode | 删除关联 |

### 4.4 操作 API

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/meta/models/:code/actions | 获取操作列表 |
| POST | /api/v1/meta/models/:code/actions | 创建操作 |
| PUT | /api/v1/meta/models/:code/actions/:actionCode | 更新操作 |
| DELETE | /api/v1/meta/models/:code/actions/:actionCode | 删除操作 |

### 4.5 请求/响应示例

**创建模型**:

```http
POST /api/v1/meta/models
Content-Type: application/json

{
  "code": "user",
  "name": "用户",
  "description": "用户管理模型",
  "tableName": "t_user",
  "config": {
    "enableSoftDelete": true,
    "enableAudit": true,
    "cacheStrategy": "read"
  },
  "fields": [
    {
      "code": "name",
      "name": "姓名",
      "type": "string",
      "dbType": "VARCHAR(100)",
      "constraints": { "required": true, "unique": false, "primaryKey": false }
    },
    {
      "code": "email",
      "name": "邮箱",
      "type": "string",
      "dbType": "VARCHAR(200)",
      "constraints": { "required": true, "unique": true, "primaryKey": false },
      "validations": [
        { "type": "regex", "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", "message": "邮箱格式不正确" }
      ]
    }
  ]
}
```

**响应**:

```json
{
  "code": 200,
  "status": "success",
  "message": "创建成功",
  "result": {
    "id": "1234567890",
    "code": "user",
    "name": "用户",
    "tableName": "t_user",
    "status": "draft",
    "versionNum": 1,
    "createdAt": "2025-01-20T10:00:00Z"
  }
}
```

**获取模型详情**:

```http
GET /api/v1/meta/models/user
```

**响应**:

```json
{
  "code": 200,
  "status": "success",
  "result": {
    "model": {
      "id": "1234567890",
      "code": "user",
      "name": "用户",
      "tableName": "t_user",
      "status": "published",
      "versionNum": 2
    },
    "fields": [
      { "code": "name", "name": "姓名", "type": "string", "sortOrder": 1 },
      { "code": "email", "name": "邮箱", "type": "string", "sortOrder": 2 }
    ],
    "relations": [
      { "code": "department", "name": "所属部门", "relationType": "many-to-one", "targetModelCode": "department" }
    ],
    "actions": [
      { "code": "create", "name": "创建", "actionType": "create", "isEnabled": true },
      { "code": "query", "name": "查询", "actionType": "query", "isEnabled": true }
    ]
  }
}
```

---

## 5. 系统字段

### 5.1 系统字段列表

以下字段由系统自动管理，不允许用户创建/修改：

| 字段代码 | 字段名称 | 类型 | 说明 |
|---------|---------|------|------|
| id | 主键 | string | 分布式 ID |
| tenant | 租户代码 | string | 多租户隔离 |
| createdAt | 创建时间 | datetime | 自动填充 |
| creatorId | 创建人ID | string | 自动填充 |
| creatorName | 创建人姓名 | string | 自动填充 |
| modifierAt | 修改时间 | datetime | 自动填充 |
| modifierId | 修改人ID | string | 自动填充 |
| modifierName | 修改人姓名 | string | 自动填充 |
| isRemoved | 删除标识 | boolean | 软删除标记 |
| version | 版本号 | number | 乐观锁 |

### 5.2 系统字段配置

通过模型配置控制系统字段行为：

```typescript
{
  "config": {
    "enableSoftDelete": true,   // 启用 isRemoved 字段
    "enableVersion": true,      // 启用 version 字段
    "enableAudit": true,        // 启用审计字段 (creator*, modifier*)
    "enableTenant": true        // 启用 tenant 字段
  }
}
```

---

## 6. 元数据版本控制

### 6.1 版本策略

| 场景 | 版本号变化 | 说明 |
|-----|-----------|------|
| 创建模型 | versionNum = 1 | 初始版本 |
| 更新草稿 | 不变 | 草稿状态可任意修改 |
| 发布模型 | versionNum++ | 每次发布递增 |
| 废弃模型 | 不变 | 状态变更，版本不变 |

### 6.2 变更限制

| 模型状态 | 允许的操作 |
|---------|-----------|
| draft | 修改所有属性、添加/删除字段、发布 |
| published | 修改名称/描述、添加字段（不删除）、废弃 |
| deprecated | 仅允许重新发布或删除 |

---

## 7. 相关文档

- [服务层概述](./overview.md)
- [存储层 - 元数据存储](../01-storage/meta-storage.md)
- [运行时服务设计](./runtime-service.md)
