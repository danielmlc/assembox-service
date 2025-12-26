# AseemBox 低代码平台服务端

企业级 SaaS 低代码平台服务端，基于元数据驱动的动态 CRUD 服务。

## 目录

- [快速开始](#快速开始)
- [架构概述](#架构概述)
- [API 文档](#api-文档)
- [元数据管理](#元数据管理)
- [示例场景](#示例场景)

---

## 快速开始

### 1. 环境要求

- Node.js >= 18
- MySQL >= 5.7 或 TiDB
- Redis（可选，用于缓存）

### 2. 数据库初始化

依次执行以下 SQL 脚本：

```bash
# 1. 创建元数据表（必需）
mysql -h your-host -u root -p your_database < sql/01-init-tables.sql

# 2. 创建示例业务表（可选，用于演示）
mysql -h your-host -u root -p your_database < sql/02-sample-business-tables.sql

# 3. 插入示例元数据（可选，用于演示）
mysql -h your-host -u root -p your_database < sql/03-sample-metadata.sql

# 4. 插入示例业务数据（可选，用于演示）
mysql -h your-host -u root -p your_database < sql/04-sample-data.sql
```

### 3. 配置文件

编辑 `config.yaml`，配置数据库连接：

```yaml
profiles.local:
  mysql:
    default:
      host: '192.168.5.187'
      port: 4000
      username: 'root'
      password: 'your-password'
      database: 'dev_tnt_mb'
  redis:
    default:
      host: '127.0.0.1'
      port: 6379
```

### 4. 启动服务

```bash
# 安装依赖
pnpm install

# 开发模式
npm run start:dev

# 生产模式
npm run build && npm run start:prod
```

服务启动后访问：`http://localhost:3030`

---

## 架构概述

### 核心模块

```
aseembox-service/
├── src/
│   ├── meta/           # 元数据管理模块
│   │   ├── entities/   # 元数据实体（模型、字段、关联、操作）
│   │   ├── services/   # 元数据服务
│   │   └── controllers/# 元数据管理API
│   │
│   ├── runtime/        # 运行时模块
│   │   ├── services/   # SQL构建、动态查询、动态变更
│   │   └── controllers/# 动态数据API
│   │
│   ├── schema/         # Schema管理模块
│   │   └── services/   # 表绑定、表检查、DDL生成
│   │
│   ├── plugin/         # 插件系统模块
│   │   ├── services/   # 插件注册、执行
│   │   └── builtin/    # 内置插件
│   │
│   └── shared/         # 共享模块
│       ├── interfaces/ # 接口定义
│       └── constants/  # 常量定义
```

### 核心概念

| 概念 | 说明 |
|------|------|
| Model | 模型定义，对应一张业务表 |
| Field | 字段定义，包含类型、约束、验证、UI配置 |
| Relation | 关联定义，支持多表 JOIN 查询 |
| Action | 操作定义，支持钩子扩展 |
| Plugin | 插件，用于扩展业务逻辑 |

### 多租户隔离

系统自动为每个请求注入租户条件：

```
请求头: X-Tenant-Code: demo
↓
ContextService 设置 tenantCode
↓
MysqlDriverInterceptor 自动添加 WHERE tenant = 'demo'
```

---

## API 文档

### 动态数据 API

所有数据操作通过统一的 RESTful API 进行。

#### 基础 URL

```
http://localhost:3030/api/v1/data/{modelCode}
```

#### 通用请求头

```http
X-Tenant-Code: demo
Content-Type: application/json
```

### 查询数据

#### GET /{modelCode}

查询列表数据，支持分页、过滤、排序。

**请求参数**（Query String）：

| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码，默认 1 |
| pageSize | number | 每页条数，默认 20 |
| where | object | 过滤条件（JSON） |
| orderBy | object | 排序（JSON） |
| select | string[] | 返回字段 |
| include | string[] | 关联查询 |

**示例**：

```bash
# 查询客户列表
curl -X GET "http://localhost:3030/api/v1/data/customer?page=1&pageSize=10" \
  -H "X-Tenant-Code: demo"

# 带过滤条件
curl -X GET "http://localhost:3030/api/v1/data/customer" \
  -H "X-Tenant-Code: demo" \
  -G --data-urlencode 'where={"status":"active"}'

# 带排序
curl -X GET "http://localhost:3030/api/v1/data/customer" \
  -H "X-Tenant-Code: demo" \
  -G --data-urlencode 'orderBy={"name":"ASC"}'

# 关联查询（订单关联客户）
curl -X GET "http://localhost:3030/api/v1/data/order" \
  -H "X-Tenant-Code: demo" \
  -G --data-urlencode 'include=["orderCustomer"]'
```

**响应示例**：

```json
{
  "code": 200,
  "status": "success",
  "message": "查询成功",
  "result": {
    "items": [
      {
        "id": "10001",
        "code": "C001",
        "name": "北京科技有限公司",
        "contactPerson": "张三",
        "phone": "13800138001",
        "status": "active"
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 10,
    "totalPages": 1
  }
}
```

#### GET /{modelCode}/{id}

查询单条记录。

```bash
curl -X GET "http://localhost:3030/api/v1/data/customer/10001" \
  -H "X-Tenant-Code: demo"
```

### 创建数据

#### POST /{modelCode}

创建新记录。

```bash
curl -X POST "http://localhost:3030/api/v1/data/customer" \
  -H "X-Tenant-Code: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "C006",
    "name": "成都科技公司",
    "contactPerson": "陈八",
    "phone": "13800138006",
    "email": "chenba@example.com",
    "address": "成都市高新区天府大道",
    "status": "active"
  }'
```

**响应**：

```json
{
  "code": 200,
  "status": "success",
  "message": "创建成功",
  "result": {
    "id": "123456789012345678"
  }
}
```

### 更新数据

#### PUT /{modelCode}/{id}

更新指定记录。

```bash
curl -X PUT "http://localhost:3030/api/v1/data/customer/10001" \
  -H "X-Tenant-Code: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "contactPerson": "张三丰",
    "phone": "13900139001"
  }'
```

### 删除数据

#### DELETE /{modelCode}/{id}

删除指定记录（软删除）。

```bash
curl -X DELETE "http://localhost:3030/api/v1/data/customer/10005" \
  -H "X-Tenant-Code: demo"
```

### 批量操作

#### POST /{modelCode}/batch

批量创建记录。

```bash
curl -X POST "http://localhost:3030/api/v1/data/customer/batch" \
  -H "X-Tenant-Code: demo" \
  -H "Content-Type: application/json" \
  -d '[
    {"code": "C007", "name": "公司A", "status": "active"},
    {"code": "C008", "name": "公司B", "status": "active"}
  ]'
```

### 聚合查询

#### POST /{modelCode}/aggregate

执行聚合查询。

```bash
curl -X POST "http://localhost:3030/api/v1/data/order/aggregate" \
  -H "X-Tenant-Code: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "groupBy": ["status"],
    "aggregations": [
      {"field": "finalAmount", "function": "SUM", "alias": "totalAmount"},
      {"field": "id", "function": "COUNT", "alias": "orderCount"}
    ],
    "where": {"status": {"$ne": "cancelled"}}
  }'
```

---

## 元数据管理

### 元数据 API

#### 模型管理

```bash
# 查询所有模型
GET /api/v1/meta/models

# 查询单个模型（包含字段和关联）
GET /api/v1/meta/models/{modelCode}

# 创建模型
POST /api/v1/meta/models

# 更新模型
PUT /api/v1/meta/models/{modelCode}

# 发布模型
POST /api/v1/meta/models/{modelCode}/publish

# 删除模型
DELETE /api/v1/meta/models/{modelCode}
```

#### 字段管理

```bash
# 查询模型字段
GET /api/v1/meta/models/{modelCode}/fields

# 创建字段
POST /api/v1/meta/models/{modelCode}/fields

# 更新字段
PUT /api/v1/meta/models/{modelCode}/fields/{fieldCode}

# 删除字段
DELETE /api/v1/meta/models/{modelCode}/fields/{fieldCode}
```

### 创建新模型示例

```bash
# 1. 创建模型
curl -X POST "http://localhost:3030/api/v1/meta/models" \
  -H "X-Tenant-Code: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "employee",
    "name": "员工",
    "description": "员工信息管理",
    "tableName": "t_employee",
    "config": {
      "enableSoftDelete": true,
      "enableVersion": true,
      "enableAudit": true,
      "enableTenant": true,
      "cacheStrategy": "read",
      "cacheTTL": 3600
    }
  }'

# 2. 添加字段
curl -X POST "http://localhost:3030/api/v1/meta/models/employee/fields" \
  -H "X-Tenant-Code: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "name",
    "name": "姓名",
    "type": "string",
    "dbType": "varchar(100)",
    "constraints": {
      "required": true,
      "unique": false,
      "primaryKey": false,
      "length": 100
    },
    "validations": [
      {"type": "required", "message": "姓名不能为空"}
    ],
    "ui": {
      "component": "input",
      "visible": true,
      "editable": true,
      "sortable": true,
      "filterable": true
    },
    "sortOrder": 1
  }'

# 3. 发布模型
curl -X POST "http://localhost:3030/api/v1/meta/models/employee/publish" \
  -H "X-Tenant-Code: demo"
```

---

## 示例场景

### 场景1：订单管理

查询订单列表，同时关联客户信息：

```bash
curl -X GET "http://localhost:3030/api/v1/data/order" \
  -H "X-Tenant-Code: demo" \
  -G \
  --data-urlencode 'include=["orderCustomer"]' \
  --data-urlencode 'where={"status":"confirmed"}' \
  --data-urlencode 'orderBy={"orderDate":"DESC"}'
```

返回结果中会包含客户的 `customerName`、`customerPhone`、`customerContact` 字段。

### 场景2：订单明细查询

查询某个订单的所有明细，同时关联产品信息：

```bash
curl -X GET "http://localhost:3030/api/v1/data/orderItem" \
  -H "X-Tenant-Code: demo" \
  -G \
  --data-urlencode 'where={"orderId":"30001"}' \
  --data-urlencode 'include=["orderItemProduct"]'
```

### 场景3：统计分析

按状态统计订单金额：

```bash
curl -X POST "http://localhost:3030/api/v1/data/order/aggregate" \
  -H "X-Tenant-Code: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "groupBy": ["status"],
    "aggregations": [
      {"field": "finalAmount", "function": "SUM", "alias": "totalAmount"},
      {"field": "id", "function": "COUNT", "alias": "count"}
    ]
  }'
```

---

## 内置插件

### id-generator

自动生成分布式雪花ID。

配置在 Action 的 hooks 中：
```json
{
  "beforeExecute": [
    {"pluginCode": "id-generator", "method": "generateId", "async": false, "order": 1}
  ]
}
```

### audit-fields

自动填充审计字段（创建人、创建时间、修改人、修改时间）。

```json
{
  "afterExecute": [
    {"pluginCode": "audit-fields", "method": "setCreateFields", "async": false, "order": 1}
  ]
}
```

### data-event

数据变更事件发布到 MQ。

```json
{
  "afterExecute": [
    {"pluginCode": "data-event", "method": "publishCreate", "async": true, "order": 2}
  ]
}
```

---

## 常见问题

### Q: 如何添加新的业务表？

1. DBA 创建物理表（参考 `sql/02-sample-business-tables.sql`）
2. 通过元数据 API 创建模型并绑定表
3. 添加字段定义
4. 发布模型

### Q: 如何实现自定义业务逻辑？

1. 创建自定义插件（参考 `src/plugin/builtin/`）
2. 在 PluginModule 中注册插件
3. 在 Action 的 hooks 中配置调用

### Q: 如何处理复杂的关联查询？

1. 在元数据中定义 Relation
2. 配置 joinConfig（sourceField, targetField, joinType）
3. 配置 includeFields 和 fieldAliases
4. 查询时通过 `include` 参数指定要关联的 relation

### Q: 租户数据如何隔离？

系统通过 `MysqlDriverInterceptor` 自动为所有 SQL 添加租户条件，无需手动处理。只需在请求头中携带 `X-Tenant-Code`。

---

## 更新日志

### v1.0.0 (2024-12)

- 初始版本
- 支持元数据驱动的动态 CRUD
- 支持多租户隔离
- 支持关联查询
- 内置三个插件：id-generator、audit-fields、data-event
