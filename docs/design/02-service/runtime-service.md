# 运行时服务设计

> **状态**: 设计中
> **更新日期**: 2025-01-20

---

## 1. 概述

### 1.1 职责定义

运行时服务（RuntimeModule）负责提供基于元数据的动态数据操作 API，包括：

- **动态查询**: 分页查询、关联查询、聚合查询
- **动态变更**: 创建、更新、删除（软删除/物理删除）
- **数据验证**: 基于元数据的字段类型和约束验证
- **SQL 构建**: 动态生成 SQL 语句

### 1.2 核心特点

```
┌─────────────────────────────────────────────────────────────┐
│                     动态 API 请求                           │
│  GET /api/v1/data/user?name__like=张&include=department     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. 解析请求参数                                            │
│     - modelCode: user                                       │
│     - 查询条件: name LIKE '%张%'                            │
│     - 关联: department                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 加载元数据（从缓存）                                     │
│     - 模型定义: user → t_user                               │
│     - 字段定义: name, email, deptId...                      │
│     - 关联定义: department (many-to-one)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 构建 SQL                                                │
│     SELECT t.*, d.name as department_name                   │
│     FROM t_user t                                           │
│     LEFT JOIN t_department d ON t.dept_id = d.id            │
│     WHERE t.tenant = ? AND t.name LIKE ? AND t.is_removed = 0│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 执行查询并返回结果                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 服务设计

### 2.1 服务列表

| 服务 | 职责 |
|-----|------|
| DynamicQueryService | 动态查询（分页、关联、聚合） |
| DynamicMutationService | 动态变更（增删改） |
| DynamicValidatorService | 数据验证与清理 |
| SqlBuilderService | SQL 构建器 |
| JoinBuilderService | JOIN 构建器 |

### 2.2 DynamicQueryService

```typescript
@Injectable()
export class DynamicQueryService {
  constructor(
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
    private readonly metaCacheService: MetaCacheService,
    private readonly sqlBuilderService: SqlBuilderService,
    private readonly joinBuilderService: JoinBuilderService,
    private readonly contextService: ContextService,
  ) {}

  // 分页查询
  async query(modelCode: string, options: QueryOptions): Promise<PagedResult>;

  // 简单查询（不带关联）
  async querySimple(modelCode: string, options: QueryOptions): Promise<Record<string, any>[]>;

  // 带关联的查询
  async queryWithRelations(modelCode: string, options: QueryOptions, relations: string[]): Promise<Record<string, any>[]>;

  // 根据 ID 查询
  async findById(modelCode: string, id: string, relations?: string[]): Promise<Record<string, any> | null>;

  // 根据 ID 查询（不存在则抛异常）
  async findByIdOrFail(modelCode: string, id: string, relations?: string[]): Promise<Record<string, any>>;

  // 根据条件查询单条
  async findOne(modelCode: string, options: QueryOptions, relations?: string[]): Promise<Record<string, any> | null>;

  // 查询所有（不分页）
  async findAll(modelCode: string, options: QueryOptions, relations?: string[]): Promise<Record<string, any>[]>;

  // 聚合查询
  async aggregate(modelCode: string, options: AggregateOptions): Promise<Record<string, any>[]>;

  // 检查记录是否存在
  async exists(modelCode: string, options: QueryOptions): Promise<boolean>;

  // 检查指定 ID 是否存在
  async existsById(modelCode: string, id: string): Promise<boolean>;

  // 加载一对多关联数据
  async loadOneToMany(parentModelCode: string, parentIds: string[], relationCode: string): Promise<Map<string, Record<string, any>[]>>;
}
```

### 2.3 DynamicMutationService

```typescript
@Injectable()
export class DynamicMutationService {
  constructor(
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
    private readonly metaCacheService: MetaCacheService,
    private readonly sqlBuilderService: SqlBuilderService,
    private readonly contextService: ContextService,
    private readonly rpcClient: RpcClient,
    private readonly pluginExecutorService: PluginExecutorService,
  ) {}

  // 创建记录
  async create(modelCode: string, data: Record<string, any>): Promise<Record<string, any>>;

  // 批量创建
  async createMany(modelCode: string, dataList: Record<string, any>[]): Promise<Record<string, any>[]>;

  // 更新记录
  async update(modelCode: string, id: string, data: Record<string, any>): Promise<Record<string, any>>;

  // 批量更新
  async updateMany(modelCode: string, ids: string[], data: Record<string, any>): Promise<number>;

  // 根据条件更新
  async updateByCondition(modelCode: string, conditions: QueryCondition[], data: Record<string, any>): Promise<number>;

  // 删除记录
  async delete(modelCode: string, id: string, actionType: ActionType): Promise<void>;

  // 软删除
  async softDelete(modelCode: string, id: string): Promise<void>;

  // 批量软删除
  async softDeleteMany(modelCode: string, ids: string[]): Promise<number>;

  // 物理删除
  async hardDelete(modelCode: string, id: string): Promise<void>;

  // 批量物理删除
  async hardDeleteMany(modelCode: string, ids: string[]): Promise<number>;
}
```

**创建流程**:

```typescript
async create(modelCode: string, data: Record<string, any>): Promise<Record<string, any>> {
  const tenant = this.contextService.getContext<string>('tenantCode');
  const userId = this.contextService.getContext<string>('userId');
  const userName = this.contextService.getContext<string>('realName');

  // 1. 执行前置钩子
  const hookContext: HookContext = {
    modelCode,
    actionCode: 'create',
    stage: HookStage.BEFORE_CREATE,
    data,
    tenantCode: tenant,
    userId,
    userName,
  };
  const hookResult = await this.pluginExecutorService.executeHooks(hookContext);
  if (hookResult.abort) {
    throw new BusinessException(hookResult.abortReason);
  }
  const finalData = hookResult.data || data;

  // 2. 获取分布式 ID
  const id = await this.rpcClient.getNewId();

  // 3. 填充系统字段
  const record = {
    id,
    ...finalData,
    tenant,
    creatorId: userId,
    creatorName: userName,
    modifierId: userId,
    modifierName: userName,
    createdAt: new Date(),
    modifierAt: new Date(),
    isRemoved: false,
    version: Date.now(),
  };

  // 4. 构建并执行 INSERT SQL
  const { sql, params } = await this.sqlBuilderService.buildInsertQuery(modelCode, record);
  await this.dataSourceManager.getDataSource().query(sql, params);

  // 5. 执行后置钩子
  hookContext.stage = HookStage.AFTER_CREATE;
  hookContext.result = record;
  await this.pluginExecutorService.executeHooks(hookContext);

  return record;
}
```

### 2.4 DynamicValidatorService

```typescript
@Injectable()
export class DynamicValidatorService {
  constructor(
    private readonly metaCacheService: MetaCacheService,
  ) {}

  // 验证数据（通过则返回，否则抛异常）
  async validateOrFail(modelCode: string, data: Record<string, any>, isUpdate: boolean): Promise<void>;

  // 验证数据（返回验证结果）
  async validate(modelCode: string, data: Record<string, any>, isUpdate: boolean): Promise<ValidationResult>;

  // 数据清理（移除无效字段、类型转换）
  async sanitize(modelCode: string, data: Record<string, any>): Promise<Record<string, any>>;

  // 验证单个字段
  async validateField(field: FieldDefinitionEntity, value: any): Promise<FieldValidationResult>;
}
```

**验证流程**:

```typescript
async validateOrFail(modelCode: string, data: Record<string, any>, isUpdate: boolean): Promise<void> {
  const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
  const errors: ValidationError[] = [];

  for (const field of fields) {
    // 跳过系统字段
    if (SYSTEM_FIELDS.includes(field.code)) continue;

    const value = data[field.code];

    // 1. 必填校验（创建时检查，更新时仅检查已提供的字段）
    if (!isUpdate && field.constraints.required && (value === undefined || value === null)) {
      errors.push({ field: field.code, message: `${field.name}不能为空` });
      continue;
    }

    // 跳过未提供的字段
    if (value === undefined) continue;

    // 2. 类型校验
    const typeError = this.validateType(field.type, value);
    if (typeError) {
      errors.push({ field: field.code, message: typeError });
      continue;
    }

    // 3. 约束校验
    const constraintErrors = this.validateConstraints(field, value);
    errors.push(...constraintErrors);

    // 4. 自定义验证规则
    if (field.validations) {
      const validationErrors = this.validateRules(field, value);
      errors.push(...validationErrors);
    }
  }

  if (errors.length > 0) {
    throw new ValidationException('数据验证失败', errors);
  }
}
```

### 2.5 SqlBuilderService

```typescript
@Injectable()
export class SqlBuilderService {
  constructor(
    private readonly metaCacheService: MetaCacheService,
    private readonly contextService: ContextService,
  ) {}

  // 构建 SELECT 查询
  async buildSelectQuery(modelCode: string, options: QueryOptions): Promise<SqlResult>;

  // 构建 COUNT 查询
  async buildCountQuery(modelCode: string, options: QueryOptions): Promise<SqlResult>;

  // 构建 INSERT 查询
  async buildInsertQuery(modelCode: string, data: Record<string, any>): Promise<SqlResult>;

  // 构建批量 INSERT 查询
  async buildBatchInsertQuery(modelCode: string, dataList: Record<string, any>[]): Promise<SqlResult>;

  // 构建 UPDATE 查询
  async buildUpdateQuery(modelCode: string, id: string, data: Record<string, any>): Promise<SqlResult>;

  // 构建条件 UPDATE 查询
  async buildUpdateByConditionQuery(modelCode: string, conditions: QueryCondition[], data: Record<string, any>): Promise<SqlResult>;

  // 构建 DELETE 查询
  async buildDeleteQuery(modelCode: string, id: string): Promise<SqlResult>;

  // 构建聚合查询
  async buildAggregateQuery(modelCode: string, options: AggregateOptions): Promise<SqlResult>;

  // 构建 WHERE 子句
  buildWhereClause(conditions: QueryCondition[], params: any[]): string;

  // 构建 ORDER BY 子句
  buildOrderByClause(sorts: SortConfig[]): string;
}

interface SqlResult {
  sql: string;
  params: any[];
}
```

**SELECT 查询构建示例**:

```typescript
async buildSelectQuery(modelCode: string, options: QueryOptions): Promise<SqlResult> {
  const model = await this.metaCacheService.getModel(modelCode);
  const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
  const tenant = this.contextService.getContext<string>('tenantCode');

  const params: any[] = [];
  const tableName = model.tableName;
  const alias = 't';

  // 构建 SELECT 字段
  const selectFields = options.select
    ? options.select.map(f => `${alias}.${this.toSnakeCase(f)}`)
    : fields.map(f => `${alias}.${this.toSnakeCase(f.code)}`);

  // 构建 WHERE 子句
  const whereClauses: string[] = [
    `${alias}.tenant = ?`,
    `${alias}.is_removed = 0`,
  ];
  params.push(tenant);

  if (options.where) {
    const { clause, whereParams } = this.buildWhereClause(options.where, alias);
    whereClauses.push(clause);
    params.push(...whereParams);
  }

  // 构建 ORDER BY
  let orderByClause = '';
  if (options.orderBy?.length) {
    orderByClause = 'ORDER BY ' + options.orderBy
      .map(s => `${alias}.${this.toSnakeCase(s.field)} ${s.direction}`)
      .join(', ');
  }

  // 构建分页
  let limitClause = '';
  if (options.page && options.pageSize) {
    const offset = (options.page - 1) * options.pageSize;
    limitClause = `LIMIT ${options.pageSize} OFFSET ${offset}`;
  }

  const sql = `
    SELECT ${selectFields.join(', ')}
    FROM ${tableName} ${alias}
    WHERE ${whereClauses.join(' AND ')}
    ${orderByClause}
    ${limitClause}
  `.trim();

  return { sql, params };
}
```

### 2.6 JoinBuilderService

```typescript
@Injectable()
export class JoinBuilderService {
  constructor(
    private readonly metaCacheService: MetaCacheService,
    private readonly sqlBuilderService: SqlBuilderService,
  ) {}

  // 构建带关联的查询
  async buildQueryWithRelations(modelCode: string, options: QueryOptions, relations: string[]): Promise<SqlResult>;

  // 构建带关联的计数查询
  async buildCountWithRelations(modelCode: string, options: QueryOptions, relations: string[]): Promise<SqlResult>;

  // 构建嵌套查询（一对多）
  async buildNestedQuery(parentModelCode: string, parentIds: string[], relationCode: string): Promise<SqlResult>;

  // 构建 JOIN 子句
  async buildJoinClause(relation: RelationDefinitionEntity, mainAlias: string, joinAlias: string): Promise<string>;
}
```

---

## 3. API 设计

### 3.1 路由定义

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/v1/data/:modelCode | 分页查询 |
| GET | /api/v1/data/:modelCode/:id | 单条查询 |
| POST | /api/v1/data/:modelCode | 创建记录 |
| PUT | /api/v1/data/:modelCode/:id | 更新记录 |
| DELETE | /api/v1/data/:modelCode/:id | 删除记录 |
| POST | /api/v1/data/:modelCode/batch | 批量创建 |
| PUT | /api/v1/data/:modelCode/batch | 批量更新 |
| DELETE | /api/v1/data/:modelCode/batch | 批量删除 |
| POST | /api/v1/data/:modelCode/aggregate | 聚合查询 |
| GET | /api/v1/data/:modelCode/:id/exists | 检查是否存在 |

### 3.2 查询参数

| 参数 | 类型 | 说明 | 示例 |
|-----|------|------|------|
| page | number | 页码（从1开始） | page=1 |
| pageSize | number | 每页数量 | pageSize=20 |
| select | string | 返回字段（逗号分隔） | select=name,email |
| orderBy | string | 排序（字段:方向） | orderBy=createdAt:desc |
| include | string | 关联查询（逗号分隔） | include=department,roles |
| {field} | any | 等值查询 | status=active |
| {field}__gt | any | 大于 | age__gt=18 |
| {field}__gte | any | 大于等于 | age__gte=18 |
| {field}__lt | any | 小于 | age__lt=60 |
| {field}__lte | any | 小于等于 | age__lte=60 |
| {field}__like | string | 模糊查询 | name__like=张 |
| {field}__in | string | IN 查询（逗号分隔） | status__in=active,pending |
| {field}__isNull | boolean | NULL 检查 | deletedAt__isNull=true |

### 3.3 请求/响应示例

**分页查询**:

```http
GET /api/v1/data/user?page=1&pageSize=10&name__like=张&include=department
X-Tenant-Code: tenant_001
```

**响应**:

```json
{
  "code": 200,
  "status": "success",
  "message": "查询成功",
  "result": {
    "items": [
      {
        "id": "123456",
        "name": "张三",
        "email": "zhangsan@example.com",
        "deptId": "dept_001",
        "department": {
          "id": "dept_001",
          "name": "技术部"
        },
        "createdAt": "2025-01-20T10:00:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 10,
    "totalPages": 10
  }
}
```

**创建记录**:

```http
POST /api/v1/data/user
Content-Type: application/json
X-Tenant-Code: tenant_001

{
  "name": "张三",
  "email": "zhangsan@example.com",
  "deptId": "dept_001"
}
```

**响应**:

```json
{
  "code": 200,
  "status": "success",
  "message": "创建成功",
  "result": {
    "id": "123456789",
    "name": "张三",
    "email": "zhangsan@example.com",
    "deptId": "dept_001",
    "createdAt": "2025-01-20T10:00:00Z",
    "creatorName": "管理员"
  }
}
```

**聚合查询**:

```http
POST /api/v1/data/user/aggregate
Content-Type: application/json

{
  "groupBy": ["deptId"],
  "aggregates": [
    { "function": "count", "field": "id", "alias": "userCount" },
    { "function": "avg", "field": "age", "alias": "avgAge" }
  ],
  "where": [
    { "field": "status", "operator": "eq", "value": "active" }
  ]
}
```

**响应**:

```json
{
  "code": 200,
  "status": "success",
  "result": [
    { "deptId": "dept_001", "userCount": 15, "avgAge": 28.5 },
    { "deptId": "dept_002", "userCount": 20, "avgAge": 32.1 }
  ]
}
```

---

## 4. 数据类型定义

### 4.1 查询选项

```typescript
interface QueryOptions {
  page?: number;                 // 页码
  pageSize?: number;             // 每页数量
  select?: string[];             // 返回字段
  where?: QueryCondition[];      // 查询条件
  orderBy?: SortConfig[];        // 排序
  include?: string[];            // 关联查询
}

interface QueryCondition {
  field: string;                 // 字段名
  operator: QueryOperator;       // 操作符
  value?: any;                   // 值
}

type QueryOperator =
  | 'eq'       // =
  | 'ne'       // !=
  | 'gt'       // >
  | 'gte'      // >=
  | 'lt'       // <
  | 'lte'      // <=
  | 'like'     // LIKE %value%
  | 'notLike'  // NOT LIKE
  | 'in'       // IN
  | 'notIn'    // NOT IN
  | 'isNull'   // IS NULL
  | 'isNotNull'; // IS NOT NULL

interface SortConfig {
  field: string;
  direction: 'ASC' | 'DESC';
}
```

### 4.2 聚合选项

```typescript
interface AggregateOptions {
  groupBy?: string[];            // 分组字段
  aggregates: AggregateField[];  // 聚合字段
  where?: QueryCondition[];      // 过滤条件
  having?: QueryCondition[];     // HAVING 条件
}

interface AggregateField {
  function: AggregateFunction;   // 聚合函数
  field: string;                 // 字段名
  alias: string;                 // 别名
}

type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max';
```

### 4.3 分页结果

```typescript
interface PagedResult<T = Record<string, any>> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

---

## 5. 租户隔离

### 5.1 TenantInterceptor

```typescript
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly contextService: ContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // 从请求头获取租户代码
    const tenantCode = request.headers['x-tenant-code'];
    if (!tenantCode) {
      throw new BadRequestException('缺少租户信息');
    }

    // 从 JWT 获取用户信息
    const user = request.user;

    // 设置上下文
    this.contextService.setContext('tenantCode', tenantCode);
    this.contextService.setContext('userId', user?.id);
    this.contextService.setContext('realName', user?.name);

    return next.handle();
  }
}
```

### 5.2 SQL 自动注入租户条件

所有查询自动添加 `tenant = ?` 条件：

```sql
-- 原始查询
SELECT * FROM t_user WHERE name LIKE '%张%'

-- 自动添加租户条件
SELECT * FROM t_user WHERE tenant = 'tenant_001' AND name LIKE '%张%' AND is_removed = 0
```

---

## 6. 插件集成

运行时服务在数据操作的关键节点调用插件钩子：

```
┌──────────┐     ┌──────────────┐     ┌──────────┐
│ 请求数据  │ ──▶ │ beforeCreate │ ──▶ │ 插件处理  │
└──────────┘     └──────────────┘     └────┬─────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  执行 INSERT │
                                    └──────┬───────┘
                                           │
                                           ▼
┌──────────┐     ┌──────────────┐     ┌──────────┐
│ 返回结果  │ ◀── │ afterCreate  │ ◀── │ 插件处理  │
└──────────┘     └──────────────┘     └──────────┘
```

详见 [插件系统设计](./plugin-service.md)

---

## 7. 相关文档

- [服务层概述](./overview.md)
- [元数据服务设计](./meta-service.md)
- [插件系统设计](./plugin-service.md)
