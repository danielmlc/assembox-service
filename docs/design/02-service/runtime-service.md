# 预览服务设计

> **状态**: 已完成
> **更新日期**: 2025-01-24
> **重要说明**: 原"运行时服务"已降级为"预览服务"，仅用于设计器实时预览

---

## 目录

1. [概述](#1-概述)
2. [双模式预览架构](#2-双模式预览架构)
3. [快速预览模式](#3-快速预览模式)
4. [精确预览模式](#4-精确预览模式)
5. [服务设计](#5-服务设计)
6. [API 设计](#6-api-设计)
7. [预览与生产的一致性保障](#7-预览与生产的一致性保障)
8. [相关文档](#8-相关文档)

---

## 1. 概述

### 1.1 架构转型说明

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        架构转型：运行时服务 → 预览服务                         │
└─────────────────────────────────────────────────────────────────────────────┘

    旧架构（运行时解释）                      新架构（代码生成 + 构建发布）
    ━━━━━━━━━━━━━━━━━━━                      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    ┌─────────────────┐                      ┌─────────────────┐
    │   设计器         │                      │   设计器         │
    └────────┬────────┘                      └────────┬────────┘
             │                                        │
             ▼                                        ▼
    ┌─────────────────┐                      ┌─────────────────┐
    │  RuntimeModule   │◀── 生产环境也用      │  PreviewModule   │◀── 仅预览
    │  运行时解释执行   │                      │  预览专用        │
    └────────┬────────┘                      └────────┬────────┘
             │                                        │
             ▼                                        │
    ┌─────────────────┐                      ┌────────┴────────┐
    │    数据库        │                      │    发布时        │
    └─────────────────┘                      └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │  PublishModule   │
                                             │  代码生成        │
                                             └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │  生成的标准代码   │◀── 生产环境
                                             │  NestJS + Vue 3  │
                                             └─────────────────┘
```

### 1.2 职责定义

预览服务（PreviewModule）**仅用于设计器实时预览**，提供：

| 功能 | 说明 | 使用场景 |
|-----|------|---------|
| **快速预览** | 解释执行，秒级生效 | 拖拽编辑时的实时反馈 |
| **精确预览** | 动态编译执行，100% 一致 | 保存前验证、发布前检查 |
| **数据模拟** | 模拟数据和真实数据切换 | 开发调试 |

### 1.3 设计原则

| 原则 | 说明 |
|-----|------|
| **预览专用** | 生产环境使用生成的代码，预览服务不参与 |
| **快速响应** | 优先保证设计器的交互体验 |
| **一致性可验证** | 提供"精确预览"模式确保与生产代码一致 |
| **资源隔离** | 预览环境与生产环境完全隔离 |

---

## 2. 双模式预览架构

### 2.1 模式对比

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        双模式预览架构                                         │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────┐    ┌──────────────────────────────┐
    │       快速预览模式             │    │       精确预览模式             │
    │       (Fast Preview)          │    │       (Accurate Preview)      │
    ├──────────────────────────────┤    ├──────────────────────────────┤
    │                              │    │                              │
    │  元数据 ─▶ 解释器 ─▶ 结果    │    │  元数据 ─▶ 生成器 ─▶ 代码    │
    │                              │    │              │               │
    │  延迟: ~100ms                │    │              ▼               │
    │  一致性: 99%                 │    │         esbuild 编译         │
    │  场景: 拖拽编辑              │    │              │               │
    │                              │    │              ▼               │
    │                              │    │         动态执行             │
    │                              │    │                              │
    │                              │    │  延迟: ~2s                   │
    │                              │    │  一致性: 100%                │
    │                              │    │  场景: 保存验证、发布前检查   │
    │                              │    │                              │
    └──────────────────────────────┘    └──────────────────────────────┘
```

### 2.2 详细对比表

| 维度 | 快速预览 | 精确预览 |
|-----|---------|---------|
| **执行方式** | 运行时解释 | 动态编译执行 |
| **响应延迟** | ~100ms | ~2s |
| **与生产一致性** | 99%（可能有细微差异） | 100%（使用相同生成器） |
| **资源消耗** | 低 | 中（需编译） |
| **缓存策略** | 元数据变更失效 | 模块级缓存 |
| **适用场景** | 拖拽、属性调整 | 保存、发布前验证 |
| **错误提示** | 简化错误 | 完整编译错误 |

### 2.3 模式切换策略

```typescript
interface PreviewRequest {
  /**
   * 预览模式
   * - 'fast': 快速预览（默认）
   * - 'accurate': 精确预览
   * - 'auto': 自动选择（根据操作类型）
   */
  mode: 'fast' | 'accurate' | 'auto';

  /**
   * 元数据配置
   */
  config: PageConfig | ServiceConfig;

  /**
   * 预览上下文
   */
  context?: PreviewContext;
}
```

**自动模式规则：**

| 触发操作 | 选择模式 | 原因 |
|---------|---------|------|
| 拖拽组件 | fast | 需要实时反馈 |
| 修改属性 | fast | 频繁操作 |
| 保存配置 | accurate | 验证配置正确性 |
| 发布前检查 | accurate | 确保一致性 |
| API 调试 | accurate | 需要真实行为 |

---

## 3. 快速预览模式

### 3.1 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        快速预览模式架构                                       │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   设计器请求         │
                    │   GET /preview/data │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  解析请求参数        │
                    │  - modelCode        │
                    │  - 查询条件         │
                    │  - 关联关系         │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  加载元数据（缓存）   │
                    │  - 模型定义         │
                    │  - 字段定义         │
                    │  - 关联定义         │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  动态构建 SQL        │
                    │  - WHERE 子句       │
                    │  - JOIN 子句        │
                    │  - 分页             │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  执行查询返回结果     │
                    └─────────────────────┘
```

### 3.2 核心服务

```typescript
@Injectable()
export class FastPreviewService {
  constructor(
    private readonly metaCacheService: MetaCacheService,
    private readonly sqlBuilderService: SqlBuilderService,
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
  ) {}

  /**
   * 快速预览查询
   */
  async query(modelCode: string, options: PreviewQueryOptions): Promise<PagedResult> {
    // 1. 从缓存加载元数据
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    // 2. 构建 SQL
    const { sql, params } = await this.sqlBuilderService.buildSelectQuery(
      modelCode,
      options,
    );

    // 3. 执行查询
    const [data, countResult] = await Promise.all([
      this.dataSourceManager.getDataSource().query(sql, params),
      this.getCount(modelCode, options),
    ]);

    // 4. 转换结果（驼峰命名）
    const items = data.map(row => this.transformRow(row, fields));

    return {
      items,
      total: countResult,
      page: options.page || 1,
      pageSize: options.pageSize || 10,
    };
  }

  /**
   * 快速预览变更（创建/更新/删除）
   */
  async mutate(
    modelCode: string,
    action: 'create' | 'update' | 'delete',
    data: Record<string, any>,
    id?: string,
  ): Promise<Record<string, any>> {
    // 1. 验证数据
    await this.validateData(modelCode, data, action);

    // 2. 构建并执行 SQL
    switch (action) {
      case 'create':
        return this.executeCreate(modelCode, data);
      case 'update':
        return this.executeUpdate(modelCode, id!, data);
      case 'delete':
        return this.executeDelete(modelCode, id!);
    }
  }

  private transformRow(
    row: Record<string, any>,
    fields: FieldDefinitionEntity[],
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const field of fields) {
      const snakeCase = this.toSnakeCase(field.code);
      result[field.code] = row[snakeCase];
    }
    return result;
  }
}
```

### 3.3 快速预览的局限性

| 差异点 | 快速预览行为 | 生产代码行为 |
|-------|------------|------------|
| **类型转换** | JavaScript 隐式转换 | TypeScript 严格类型 |
| **验证逻辑** | 简化的运行时验证 | class-validator 完整验证 |
| **关联加载** | 简单 JOIN | 可能有复杂的加载策略 |
| **事务处理** | 无事务 | 根据配置可能有事务 |
| **错误格式** | 简化错误 | NestJS 标准异常格式 |

---

## 4. 精确预览模式

### 4.1 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        精确预览模式架构                                       │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   设计器请求         │
                    │   POST /preview/accurate │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  1. 检查编译缓存     │
                    │  (模块级缓存)        │
                    └──────────┬──────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
          缓存命中                          缓存未命中
               │                               │
               ▼                               ▼
        ┌────────────┐              ┌─────────────────────┐
        │ 使用缓存模块│              │  2. 调用代码生成器   │
        └──────┬─────┘              │  生成 TS 代码        │
               │                    └──────────┬──────────┘
               │                               │
               │                               ▼
               │                    ┌─────────────────────┐
               │                    │  3. esbuild 快速编译 │
               │                    │  TS → JS (内存中)    │
               │                    └──────────┬──────────┘
               │                               │
               │                               ▼
               │                    ┌─────────────────────┐
               │                    │  4. 缓存编译结果     │
               │                    └──────────┬──────────┘
               │                               │
               └───────────────┬───────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  5. 动态加载执行     │
                    │  (vm.runInContext)  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  6. 返回执行结果     │
                    └─────────────────────┘
```

### 4.2 核心服务

```typescript
@Injectable()
export class AccuratePreviewService {
  private readonly moduleCache = new Map<string, CompiledModule>();

  constructor(
    private readonly codeGeneratorService: CodeGeneratorService,
    private readonly metaCacheService: MetaCacheService,
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
  ) {}

  /**
   * 精确预览执行
   */
  async execute(request: AccuratePreviewRequest): Promise<any> {
    const { modelCode, action, data, id } = request;
    const cacheKey = this.getCacheKey(modelCode);

    // 1. 检查缓存
    let compiledModule = this.moduleCache.get(cacheKey);

    if (!compiledModule || await this.isStale(modelCode, compiledModule)) {
      // 2. 生成代码
      const generatedCode = await this.generateServiceCode(modelCode);

      // 3. 快速编译
      compiledModule = await this.compileWithEsbuild(generatedCode);

      // 4. 缓存
      this.moduleCache.set(cacheKey, compiledModule);
    }

    // 5. 执行
    return this.executeInSandbox(compiledModule, action, data, id);
  }

  /**
   * 使用 esbuild 快速编译
   */
  private async compileWithEsbuild(code: GeneratedCode): Promise<CompiledModule> {
    const result = await esbuild.build({
      stdin: {
        contents: code.serviceCode,
        loader: 'ts',
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node18',
      write: false,
      external: [
        '@nestjs/common',
        '@nestjs/typeorm',
        'typeorm',
        'class-validator',
        'class-transformer',
      ],
    });

    const compiledJs = result.outputFiles[0].text;

    return {
      code: compiledJs,
      compiledAt: new Date(),
      configVersion: code.configVersion,
    };
  }

  /**
   * 在沙箱中执行编译后的代码
   */
  private async executeInSandbox(
    module: CompiledModule,
    action: string,
    data: Record<string, any>,
    id?: string,
  ): Promise<any> {
    // 创建沙箱上下文
    const sandbox = {
      require: this.createSafeRequire(),
      console,
      process: { env: {} },
      Buffer,
      // 注入数据源
      __dataSource: this.dataSourceManager.getDataSource(),
    };

    const context = vm.createContext(sandbox);

    // 执行模块
    const script = new vm.Script(`
      const module = { exports: {} };
      ${module.code}
      module.exports;
    `);

    const ServiceClass = script.runInContext(context);

    // 创建服务实例并执行
    const serviceInstance = new ServiceClass(sandbox.__dataSource);

    switch (action) {
      case 'create':
        return serviceInstance.create(data);
      case 'findAll':
        return serviceInstance.findAll(data);
      case 'findOne':
        return serviceInstance.findOne(id);
      case 'update':
        return serviceInstance.update(id, data);
      case 'remove':
        return serviceInstance.remove(id);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * 检查缓存是否过期
   */
  private async isStale(modelCode: string, cached: CompiledModule): Promise<boolean> {
    const currentVersion = await this.metaCacheService.getConfigVersion(modelCode);
    return cached.configVersion !== currentVersion;
  }

  /**
   * 使缓存失效
   */
  invalidateCache(modelCode: string): void {
    const cacheKey = this.getCacheKey(modelCode);
    this.moduleCache.delete(cacheKey);
  }
}

interface CompiledModule {
  code: string;
  compiledAt: Date;
  configVersion: string;
}

interface GeneratedCode {
  serviceCode: string;
  entityCode: string;
  dtoCode: string;
  configVersion: string;
}
```

### 4.3 编译优化策略

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        编译优化策略                                          │
└─────────────────────────────────────────────────────────────────────────────┘

    1. 增量生成
    ━━━━━━━━━━━
    ┌─────────────────┐         ┌─────────────────┐
    │ 配置变更检测     │ ──────▶ │ 只重新生成变更部分│
    │ (字段级 diff)   │         │ (非全量)        │
    └─────────────────┘         └─────────────────┘

    2. 预编译常用模块
    ━━━━━━━━━━━━━━━━━
    ┌─────────────────┐         ┌─────────────────┐
    │ 热门模块预热     │ ──────▶ │ 首次请求无需等待 │
    └─────────────────┘         └─────────────────┘

    3. 编译结果缓存
    ━━━━━━━━━━━━━━
    ┌─────────────────┐         ┌─────────────────┐
    │ 模块级缓存       │         │ 内存 + Redis 双层│
    │ (LRU 策略)      │ ──────▶ │ 跨实例共享      │
    └─────────────────┘         └─────────────────┘

    4. 并行编译
    ━━━━━━━━━━
    ┌─────────────────┐         ┌─────────────────┐
    │ 多模块同时请求   │ ──────▶ │ Worker 线程并行编译│
    └─────────────────┘         └─────────────────┘
```

---

## 5. 服务设计

### 5.1 服务列表

| 服务 | 职责 | 预览模式 |
|-----|------|---------|
| PreviewQueryService | 预览查询（分页、关联） | 快速 |
| PreviewMutationService | 预览变更（增删改） | 快速 |
| PreviewValidatorService | 预览时数据验证 | 快速 |
| AccuratePreviewService | 精确预览执行 | 精确 |
| PreviewCacheService | 预览缓存管理 | 两者 |

### 5.2 PreviewQueryService

```typescript
@Injectable()
export class PreviewQueryService {
  constructor(
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
    private readonly metaCacheService: MetaCacheService,
    private readonly sqlBuilderService: SqlBuilderService,
  ) {}

  /**
   * 分页查询
   */
  async query(modelCode: string, options: QueryOptions): Promise<PagedResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const { sql, params } = await this.sqlBuilderService.buildSelectQuery(
      modelCode,
      options,
    );

    const data = await this.dataSourceManager.getDataSource().query(sql, params);
    const total = await this.getCount(modelCode, options);

    return {
      items: this.transformResults(data, fields),
      total,
      page: options.page || 1,
      pageSize: options.pageSize || 10,
    };
  }

  /**
   * 根据 ID 查询
   */
  async findById(
    modelCode: string,
    id: string,
    relations?: string[],
  ): Promise<Record<string, any> | null> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    let sql = `SELECT * FROM ${model.tableName} WHERE id = ? AND is_removed = 0`;
    const params = [id];

    if (relations?.length) {
      // 构建 JOIN
      const joinResult = await this.buildJoins(modelCode, relations);
      sql = joinResult.sql;
      params.push(...joinResult.params);
    }

    const [result] = await this.dataSourceManager.getDataSource().query(sql, params);
    return result ? this.transformRow(result, fields) : null;
  }

  private transformResults(
    rows: Record<string, any>[],
    fields: FieldDefinitionEntity[],
  ): Record<string, any>[] {
    return rows.map(row => this.transformRow(row, fields));
  }

  private transformRow(
    row: Record<string, any>,
    fields: FieldDefinitionEntity[],
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const field of fields) {
      const snakeKey = this.toSnakeCase(field.code);
      if (row.hasOwnProperty(snakeKey)) {
        result[field.code] = row[snakeKey];
      }
    }
    return result;
  }
}
```

### 5.3 PreviewMutationService

```typescript
@Injectable()
export class PreviewMutationService {
  constructor(
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
    private readonly metaCacheService: MetaCacheService,
    private readonly sqlBuilderService: SqlBuilderService,
    private readonly previewValidatorService: PreviewValidatorService,
    private readonly contextService: ContextService,
  ) {}

  /**
   * 创建记录
   */
  async create(modelCode: string, data: Record<string, any>): Promise<Record<string, any>> {
    // 1. 验证数据
    await this.previewValidatorService.validateOrFail(modelCode, data, false);

    // 2. 生成 ID
    const id = this.generateId();

    // 3. 填充系统字段
    const record = {
      id,
      ...data,
      createdAt: new Date(),
      modifierAt: new Date(),
      isRemoved: false,
    };

    // 4. 构建并执行 INSERT
    const { sql, params } = await this.sqlBuilderService.buildInsertQuery(
      modelCode,
      record,
    );
    await this.dataSourceManager.getDataSource().query(sql, params);

    return record;
  }

  /**
   * 更新记录
   */
  async update(
    modelCode: string,
    id: string,
    data: Record<string, any>,
  ): Promise<Record<string, any>> {
    // 1. 验证数据
    await this.previewValidatorService.validateOrFail(modelCode, data, true);

    // 2. 填充修改字段
    const updateData = {
      ...data,
      modifierAt: new Date(),
    };

    // 3. 构建并执行 UPDATE
    const { sql, params } = await this.sqlBuilderService.buildUpdateQuery(
      modelCode,
      id,
      updateData,
    );
    await this.dataSourceManager.getDataSource().query(sql, params);

    // 4. 返回更新后的记录
    return this.findById(modelCode, id);
  }

  /**
   * 软删除
   */
  async softDelete(modelCode: string, id: string): Promise<void> {
    const { sql, params } = await this.sqlBuilderService.buildUpdateQuery(
      modelCode,
      id,
      { isRemoved: true, modifierAt: new Date() },
    );
    await this.dataSourceManager.getDataSource().query(sql, params);
  }
}
```

---

## 6. API 设计

### 6.1 路由定义

| 方法 | 路径 | 说明 | 模式 |
|-----|------|------|-----|
| GET | /api/v1/preview/:modelCode | 分页查询 | fast |
| GET | /api/v1/preview/:modelCode/:id | 单条查询 | fast |
| POST | /api/v1/preview/:modelCode | 创建记录 | fast |
| PUT | /api/v1/preview/:modelCode/:id | 更新记录 | fast |
| DELETE | /api/v1/preview/:modelCode/:id | 删除记录 | fast |
| POST | /api/v1/preview/accurate | 精确预览 | accurate |
| POST | /api/v1/preview/validate | 配置验证 | accurate |

### 6.2 请求/响应示例

**快速预览查询：**

```http
GET /api/v1/preview/order?page=1&pageSize=10&status=1
X-Preview-Mode: fast
```

**响应：**

```json
{
  "code": 200,
  "status": "success",
  "result": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 10
  },
  "meta": {
    "mode": "fast",
    "latency": 85
  }
}
```

**精确预览请求：**

```http
POST /api/v1/preview/accurate
Content-Type: application/json

{
  "modelCode": "order",
  "action": "create",
  "data": {
    "orderNo": "ORD202501001",
    "totalAmount": 100.00,
    "status": 0
  }
}
```

**响应：**

```json
{
  "code": 200,
  "status": "success",
  "result": {
    "id": "123456789",
    "orderNo": "ORD202501001",
    "totalAmount": 100.00,
    "status": 0,
    "createdAt": "2025-01-24T10:00:00Z"
  },
  "meta": {
    "mode": "accurate",
    "latency": 1850,
    "compiled": true,
    "cacheHit": false
  }
}
```

---

## 7. 预览与生产的一致性保障

### 7.1 一致性策略

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        一致性保障策略                                         │
└─────────────────────────────────────────────────────────────────────────────┘

    1. 共用代码生成器
    ━━━━━━━━━━━━━━━━━
    ┌─────────────────┐
    │  CodeGenerator   │ ◀──── 精确预览和发布使用同一个生成器
    │  (单一来源)      │
    └────────┬────────┘
             │
        ┌────┴────┐
        │         │
        ▼         ▼
    ┌──────┐  ┌──────┐
    │ 预览  │  │ 发布  │
    │(动态编译)│  │(构建) │
    └──────┘  └──────┘

    2. 类型定义共享
    ━━━━━━━━━━━━━━
    ┌─────────────────┐
    │  生成的类型定义   │ ◀──── DTO、Entity 类型在预览和生产中完全一致
    └─────────────────┘

    3. 验证规则同源
    ━━━━━━━━━━━━━━
    ┌─────────────────┐
    │  元数据约束定义   │ ◀──── 同一份约束生成同样的 class-validator 装饰器
    └─────────────────┘
```

### 7.2 差异检测

```typescript
@Injectable()
export class ConsistencyCheckService {
  /**
   * 对比快速预览和精确预览的结果差异
   */
  async compareResults(
    modelCode: string,
    action: string,
    data: Record<string, any>,
  ): Promise<ConsistencyReport> {
    // 分别执行两种预览
    const [fastResult, accurateResult] = await Promise.all([
      this.fastPreviewService.execute(modelCode, action, data),
      this.accuratePreviewService.execute(modelCode, action, data),
    ]);

    // 对比结果
    const differences = this.findDifferences(fastResult, accurateResult);

    return {
      consistent: differences.length === 0,
      differences,
      fastResult,
      accurateResult,
    };
  }

  private findDifferences(
    fast: any,
    accurate: any,
    path: string = '',
  ): Difference[] {
    const differences: Difference[] = [];

    // 深度对比...

    return differences;
  }
}

interface ConsistencyReport {
  consistent: boolean;
  differences: Difference[];
  fastResult: any;
  accurateResult: any;
}

interface Difference {
  path: string;
  fastValue: any;
  accurateValue: any;
  type: 'type_mismatch' | 'value_mismatch' | 'missing_field' | 'extra_field';
}
```

### 7.3 预览环境隔离

| 隔离维度 | 说明 |
|---------|------|
| **数据库** | 预览使用独立的 schema 或表前缀 |
| **缓存** | 预览缓存与生产缓存隔离 |
| **配置** | 预览环境可使用不同的配置 |
| **资源** | 预览计算资源有限制（防止滥用） |

---

## 8. 相关文档

- [服务层概述](./overview.md)
- [代码生成设计](../05-publish/code-generation.md)
- [元数据服务设计](./meta-service.md)
- [插件系统设计](./plugin-service.md)
