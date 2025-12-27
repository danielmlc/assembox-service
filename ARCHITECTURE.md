# AseemBox 低代码平台 - 架构图

## 系统整体架构

```mermaid
graph TB
    subgraph "客户端层"
        Client[前端应用<br/>Web/Mobile]
    end

    subgraph "API网关层"
        API[API Gateway<br/>RESTful API]
    end

    subgraph "应用服务层 - AseemBox Service"
        subgraph "核心模块"
            MetaModule[Meta Module<br/>元数据管理]
            RuntimeModule[Runtime Module<br/>运行时执行]
            SchemaModule[Schema Module<br/>表结构管理]
            PluginModule[Plugin Module<br/>插件系统]
            SharedModule[Shared Module<br/>共享组件]
        end
    end

    subgraph "数据层"
        MySQL[(MySQL/TiDB<br/>业务数据)]
        Redis[(Redis<br/>缓存)]
        MQ[消息队列<br/>事件发布]
    end

    Client -->|HTTP Request| API
    API -->|X-Tenant-Code| RuntimeModule
    RuntimeModule -->|读取元数据| MetaModule
    RuntimeModule -->|表管理| SchemaModule
    RuntimeModule -->|执行钩子| PluginModule
    RuntimeModule -->|使用工具| SharedModule
    MetaModule -->|存储元数据| MySQL
    MetaModule -->|缓存| Redis
    RuntimeModule -->|CRUD操作| MySQL
    PluginModule -->|发布事件| MQ
    SchemaModule -->|DDL操作| MySQL

    style Client fill:#e1f5ff
    style API fill:#fff4e1
    style MetaModule fill:#e8f5e9
    style RuntimeModule fill:#fff3e0
    style SchemaModule fill:#f3e5f5
    style PluginModule fill:#fce4ec
    style SharedModule fill:#e0f2f1
    style MySQL fill:#ffebee
    style Redis fill:#fff8e1
    style MQ fill:#e8eaf6
```

## Meta Module（元数据管理模块）详细架构

```mermaid
graph TB
    subgraph "Meta Module - 元数据管理"
        MetaController[MetaController<br/>元数据管理API]

        subgraph "服务层"
            ModelService[ModelService<br/>模型管理]
            FieldService[FieldService<br/>字段管理]
            RelationService[RelationService<br/>关联管理]
            ActionService[ActionService<br/>操作管理]
            MetaCacheService[MetaCacheService<br/>元数据缓存]
        end

        subgraph "实体层"
            ModelEntity[ModelDefinition<br/>模型定义]
            FieldEntity[FieldDefinition<br/>字段定义]
            RelationEntity[RelationDefinition<br/>关联定义]
            ActionEntity[ActionDefinition<br/>操作定义]
        end

        subgraph "数据访问层"
            ModelRepo[ModelRepository]
            FieldRepo[FieldRepository]
            RelationRepo[RelationRepository]
            ActionRepo[ActionRepository]
        end
    end

    MetaController --> ModelService
    MetaController --> FieldService
    MetaController --> RelationService
    MetaController --> ActionService

    ModelService --> MetaCacheService
    FieldService --> MetaCacheService
    RelationService --> MetaCacheService
    ActionService --> MetaCacheService

    ModelService --> ModelRepo
    FieldService --> FieldRepo
    RelationService --> RelationRepo
    ActionService --> ActionRepo

    ModelRepo --> ModelEntity
    FieldRepo --> FieldEntity
    RelationRepo --> RelationEntity
    ActionRepo --> ActionEntity

    ModelEntity -.关联.-> FieldEntity
    ModelEntity -.关联.-> RelationEntity
    ModelEntity -.关联.-> ActionEntity

    style MetaController fill:#4caf50,color:#fff
    style ModelService fill:#66bb6a
    style FieldService fill:#66bb6a
    style RelationService fill:#66bb6a
    style ActionService fill:#66bb6a
    style MetaCacheService fill:#ffb74d
```

## Runtime Module（运行时模块）详细架构

```mermaid
graph TB
    subgraph "Runtime Module - 运行时执行"
        DynamicAPI[DynamicApiController<br/>统一动态API入口]
        TenantInterceptor[TenantInterceptor<br/>租户拦截器]

        subgraph "核心服务层"
            QueryService[DynamicQueryService<br/>动态查询]
            MutationService[DynamicMutationService<br/>动态变更]
            ValidatorService[DynamicValidatorService<br/>动态验证]
        end

        subgraph "SQL构建层"
            SqlBuilder[SqlBuilderService<br/>SQL构建器]
            JoinBuilder[JoinBuilderService<br/>JOIN构建器]
        end

        subgraph "DTO层"
            QueryDTO[QueryDto<br/>查询参数]
            MutationDTO[MutationDto<br/>变更参数]
        end
    end

    DynamicAPI -->|拦截请求| TenantInterceptor
    DynamicAPI -->|查询操作| QueryService
    DynamicAPI -->|变更操作| MutationService
    DynamicAPI -->|数据验证| ValidatorService

    QueryService --> SqlBuilder
    QueryService --> JoinBuilder
    MutationService --> SqlBuilder
    MutationService --> ValidatorService

    QueryService -.使用.-> QueryDTO
    MutationService -.使用.-> MutationDTO

    style DynamicAPI fill:#ff9800,color:#fff
    style TenantInterceptor fill:#ffa726
    style QueryService fill:#ffb74d
    style MutationService fill:#ffb74d
    style ValidatorService fill:#ffb74d
    style SqlBuilder fill:#ffcc80
    style JoinBuilder fill:#ffcc80
```

## Plugin Module（插件系统）详细架构

```mermaid
graph TB
    subgraph "Plugin Module - 插件系统"
        subgraph "插件服务"
            PluginRegistry[PluginRegistryService<br/>插件注册中心]
            PluginExecutor[PluginExecutorService<br/>插件执行器]
        end

        subgraph "内置插件"
            IDPlugin[IdGeneratorPlugin<br/>雪花ID生成器]
            AuditPlugin[AuditFieldsPlugin<br/>审计字段填充]
            EventPlugin[DataEventPlugin<br/>数据事件发布]
        end

        subgraph "插件接口"
            PluginInterface[IPlugin<br/>插件接口定义]
            PluginContext[PluginContext<br/>插件上下文]
        end
    end

    PluginRegistry -->|注册| IDPlugin
    PluginRegistry -->|注册| AuditPlugin
    PluginRegistry -->|注册| EventPlugin

    PluginExecutor -->|查找插件| PluginRegistry
    PluginExecutor -->|执行| IDPlugin
    PluginExecutor -->|执行| AuditPlugin
    PluginExecutor -->|执行| EventPlugin

    IDPlugin -.实现.-> PluginInterface
    AuditPlugin -.实现.-> PluginInterface
    EventPlugin -.实现.-> PluginInterface

    PluginExecutor -.传递.-> PluginContext

    style PluginRegistry fill:#e91e63,color:#fff
    style PluginExecutor fill:#ec407a
    style IDPlugin fill:#f06292
    style AuditPlugin fill:#f06292
    style EventPlugin fill:#f06292
```

## Schema Module（表结构管理）详细架构

```mermaid
graph TB
    subgraph "Schema Module - 表结构管理"
        TableInspector[TableInspectorService<br/>表结构检查]
        TableBinding[TableBindingService<br/>表绑定服务]
        DDLGenerator[DDLGeneratorService<br/>DDL生成器]
    end

    TableInspector -->|检查表| MySQL[(MySQL/TiDB)]
    TableBinding -->|绑定元数据| TableInspector
    DDLGenerator -->|生成DDL| MySQL
    TableBinding -->|使用| DDLGenerator

    style TableInspector fill:#9c27b0,color:#fff
    style TableBinding fill:#ab47bc
    style DDLGenerator fill:#ba68c8
```

## 完整数据流架构

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant API as DynamicApiController
    participant Tenant as TenantInterceptor
    participant Cache as MetaCacheService
    participant Validator as ValidatorService
    participant Query as QueryService/MutationService
    participant SQL as SqlBuilderService
    participant Plugin as PluginExecutor
    participant DB as MySQL数据库
    participant MQ as 消息队列

    Client->>API: HTTP Request (X-Tenant-Code)
    API->>Tenant: 拦截请求
    Tenant->>Tenant: 设置租户上下文
    API->>Cache: 获取模型元数据
    Cache-->>API: 返回元数据

    alt 数据变更操作 (Create/Update)
        API->>Validator: 验证数据
        Validator-->>API: 验证通过
        API->>Query: 执行变更
        Query->>Plugin: beforeExecute钩子
        Plugin->>Plugin: id-generator生成ID
        Plugin->>Plugin: audit-fields填充审计字段
        Query->>SQL: 构建SQL
        SQL->>DB: 执行INSERT/UPDATE
        DB-->>SQL: 返回结果
        Query->>Plugin: afterExecute钩子
        Plugin->>MQ: 发布数据变更事件
        Query-->>API: 返回结果
    else 查询操作 (Query)
        API->>Query: 执行查询
        Query->>SQL: 构建SELECT SQL
        alt 关联查询
            Query->>SQL: 构建JOIN SQL
        end
        SQL->>DB: 执行查询
        DB-->>SQL: 返回数据
        SQL-->>Query: 返回结果
        Query-->>API: 返回结果
    end

    API-->>Client: HTTP Response

```

## 核心概念模型

```mermaid
erDiagram
    MODEL ||--o{ FIELD : contains
    MODEL ||--o{ RELATION : contains
    MODEL ||--o{ ACTION : contains
    ACTION ||--o{ HOOK : contains

    MODEL {
        string code "模型编码"
        string name "模型名称"
        string tableName "数据库表名"
        json config "配置信息"
        string status "状态(draft/published)"
    }

    FIELD {
        string code "字段编码"
        string name "字段名称"
        string type "字段类型"
        string dbType "数据库类型"
        json constraints "约束条件"
        json validations "验证规则"
        json ui "UI配置"
    }

    RELATION {
        string code "关联编码"
        string name "关联名称"
        string type "关联类型(oneToOne/oneToMany/manyToMany)"
        string targetModel "目标模型"
        json joinConfig "JOIN配置"
        json includeFields "包含字段"
    }

    ACTION {
        string code "操作编码"
        string name "操作名称"
        string type "操作类型(query/create/update/delete)"
        json hooks "钩子配置"
    }

    HOOK {
        string pluginCode "插件编码"
        string method "方法名"
        string timing "时机(beforeExecute/afterExecute)"
        boolean async "是否异步"
        int order "执行顺序"
    }
```

## 多租户隔离机制

```mermaid
graph LR
    Request[HTTP请求<br/>X-Tenant-Code: demo]
    -->|1.拦截| TenantInterceptor[TenantInterceptor<br/>租户拦截器]
    -->|2.设置上下文| ContextService[ContextService<br/>上下文服务]
    -->|3.自动注入WHERE条件| MysqlDriver[MysqlDriverInterceptor<br/>数据库驱动拦截器]
    -->|4.执行SQL| SQL[SELECT * FROM table<br/>WHERE tenant = 'demo']

    style Request fill:#e3f2fd
    style TenantInterceptor fill:#bbdefb
    style ContextService fill:#90caf9
    style MysqlDriver fill:#64b5f6
    style SQL fill:#42a5f5,color:#fff
```

## 技术栈

### 核心框架
- **NestJS** - Node.js 企业级框架
- **TypeScript** - 类型安全
- **TypeORM** - ORM框架（定制版）

### 数据存储
- **MySQL/TiDB** - 关系型数据库
- **Redis** - 缓存和会话存储

### 消息队列
- **MQ** - 异步事件处理

### 内部依赖
- `@cs/nest-common` - 通用组件
- `@cs/nest-typeorm` - TypeORM集成
- `@cs/nest-cloud` - 云服务集成
- `@cs/nest-config` - 配置管理
- `@cs/nest-redis` - Redis集成
- `@cs/nest-mq` - 消息队列集成

## 核心特性

### 1. 元数据驱动
- 通过元数据定义模型，无需编写代码即可实现CRUD
- 支持模型、字段、关联、操作的动态定义
- 元数据变更实时生效

### 2. 多租户隔离
- 基于请求头 `X-Tenant-Code` 自动隔离租户数据
- 所有SQL自动添加租户过滤条件
- 零侵入的租户隔离实现

### 3. 插件系统
- 支持钩子机制扩展业务逻辑
- 内置ID生成器、审计字段、数据事件三大插件
- 支持自定义插件开发

### 4. 关联查询
- 支持一对一、一对多、多对多关联
- 自动构建JOIN SQL
- 灵活的字段别名配置

### 5. 动态验证
- 基于元数据的数据验证
- 支持必填、长度、正则、自定义验证器
- 自动数据清理和类型转换

### 6. 缓存优化
- 元数据缓存，减少数据库查询
- 支持多种缓存策略
- 可配置的TTL

## API设计

### 统一的RESTful API

```
GET    /api/v1/data/:modelCode          # 分页查询
GET    /api/v1/data/:modelCode/:id      # 根据ID查询
POST   /api/v1/data/:modelCode          # 创建记录
PUT    /api/v1/data/:modelCode/:id      # 更新记录
DELETE /api/v1/data/:modelCode/:id      # 删除记录
POST   /api/v1/data/:modelCode/batch    # 批量创建
PUT    /api/v1/data/:modelCode/batch    # 批量更新
DELETE /api/v1/data/:modelCode/batch    # 批量删除
POST   /api/v1/data/:modelCode/aggregate # 聚合查询
```

### 元数据管理API

```
GET    /api/v1/meta/models              # 查询所有模型
GET    /api/v1/meta/models/:modelCode   # 查询单个模型
POST   /api/v1/meta/models              # 创建模型
PUT    /api/v1/meta/models/:modelCode   # 更新模型
DELETE /api/v1/meta/models/:modelCode   # 删除模型
POST   /api/v1/meta/models/:modelCode/publish # 发布模型
```

## 总结

AseemBox 是一个功能强大的企业级低代码平台后端服务，通过元数据驱动的方式实现了：

1. **零代码CRUD** - 通过配置元数据即可实现完整的数据操作
2. **高度可扩展** - 插件系统支持灵活的业务逻辑扩展
3. **多租户SaaS** - 原生支持多租户数据隔离
4. **关联查询** - 支持复杂的多表关联查询
5. **类型安全** - TypeScript提供完整的类型支持
6. **性能优化** - 内置缓存机制，支持高并发场景

该架构设计清晰，模块职责明确，适合快速构建企业级SaaS应用。
