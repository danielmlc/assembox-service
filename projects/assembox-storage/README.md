# Assembox Storage Service

Assembox 低代码平台存储层服务

## 目录结构

```
assembox-storage/
├── src/
│   ├── entities/               # 实体类
│   │   ├── module.entity.ts           # 模块表 (ab_module)
│   │   ├── module-version.entity.ts   # 版本表 (ab_module_version)
│   │   ├── component.entity.ts        # 组件注册表 (ab_component)
│   │   ├── config.entity.ts           # 配置索引表 (ab_config)
│   │   └── config-history.entity.ts   # 配置发布历史表 (ab_config_history)
│   │
│   ├── repositories/           # 仓储层
│   │   ├── module.repository.ts
│   │   ├── module-version.repository.ts
│   │   ├── component.repository.ts
│   │   ├── config.repository.ts
│   │   └── config-history.repository.ts
│   │
│   ├── services/               # 服务层
│   │   ├── oss.service.ts             # OSS存储服务
│   │   ├── cache.service.ts           # Redis缓存服务
│   │   ├── config-resolver.service.ts # 配置继承查找服务
│   │   ├── config.service.ts          # 配置管理服务（核心）
│   │   ├── module.service.ts          # 模块管理服务
│   │   ├── component.service.ts       # 组件管理服务
│   │   └── version.service.ts         # 版本管理服务
│   │
│   ├── controllers/            # 控制器层
│   │   ├── config.controller.ts
│   │   ├── module.controller.ts
│   │   └── component.controller.ts
│   │
│   ├── dto/                    # 数据传输对象
│   │   ├── module.dto.ts
│   │   ├── component.dto.ts
│   │   └── config.dto.ts
│   │
│   ├── interfaces/             # 接口定义
│   │   ├── config.interface.ts
│   │   └── oss.interface.ts
│   │
│   ├── constants/              # 常量定义
│   │   └── config.constants.ts
│   │
│   ├── share.module.ts         # 共享模块（注册数据库、Redis、OSS）✨
│   ├── app.module.ts           # 根模块
│   └── main.ts                 # 入口文件（使用 @cs/nest-cloud bootstrap）✨
│
├── scripts/                    # 脚本
│   └── init-database.sql      # 数据库初始化脚本
│
├── config.yaml                 # 配置文件（本地/Nacos）✨
├── nest-cli.json               # NestJS CLI 配置 ✨
├── package.json
├── tsconfig.json
└── README.md
```

## 核心功能

### 1. 配置继承机制
- 支持三层配置: system → global → tenant
- 组件级继承，由 `is_inheritable` 属性控制
- 运行时按优先级查找: tenant > global > system

### 2. 缓存策略
- L1: 租户配置缓存 (TTL: 1h)
- L2: 原始配置缓存 (TTL: 30min)
- L3: 组件列表缓存 (TTL: 10min)
- 由 `is_cacheable` 属性控制是否启用缓存

### 3. OSS 存储
- 草稿路径: `assembox/draft/...`
- 发布路径: `assembox/published/...`
- 运行时只读取已发布配置

### 4. 版本管理
- Git 分支策略: `{module_code}/{version_code}`
- 版本生命周期: draft → published → deprecated
- 配置发布历史记录

## API 接口

### 配置管理
- `GET /api/assembox/configs/load` - 加载配置（运行时）
- `POST /api/assembox/configs/batch-load` - 批量加载配置
- `POST /api/assembox/configs/draft` - 保存配置草稿
- `GET /api/assembox/configs/:componentId/draft` - 查询配置草稿
- `DELETE /api/assembox/configs/draft/:configId` - 删除配置草稿
- `POST /api/assembox/configs/publish` - 发布配置
- `POST /api/assembox/configs/batch-publish` - 批量发布配置
- `POST /api/assembox/configs/:configId/rollback` - 回滚配置
- `GET /api/assembox/configs/:configId/history` - 查询发布历史

### 模块管理
- `POST /api/assembox/modules` - 创建模块
- `PUT /api/assembox/modules/:id` - 更新模块
- `GET /api/assembox/modules/:id` - 查询模块
- `GET /api/assembox/modules` - 查询所有模块
- `DELETE /api/assembox/modules/:id` - 删除模块
- `POST /api/assembox/modules/:id/activate-version` - 激活版本
- `GET /api/assembox/modules/:id/versions` - 查询模块的所有版本
- `POST /api/assembox/modules/:id/versions` - 创建版本
- `POST /api/assembox/modules/:moduleId/versions/:versionId/publish` - 发布版本

### 组件管理
- `POST /api/assembox/components` - 创建组件
- `PUT /api/assembox/components/:id` - 更新组件
- `GET /api/assembox/components/:id` - 查询组件
- `GET /api/assembox/components/version/:versionId` - 查询版本下所有组件
- `GET /api/assembox/components/version/:versionId/category/:category` - 查询指定分类的组件
- `DELETE /api/assembox/components/:id` - 删除组件

## 技术栈

- **框架**: NestJS 10.x
- **语言**: TypeScript 5.x
- **数据库**: TiDB (通过 @cs/nest-typeorm)
- **缓存**: Redis (通过 @cs/nest-redis)
- **存储**: OSS (通过 @cs/nest-files)
- **配置**: Nacos (通过 @cs/nest-config)
- **RPC**: RpcClient (通过 @cs/nest-cloud)
- **日志**: LoggerService (通过 @cs/nest-common)

## 架构设计

### 模块结构

本服务采用云平台标准架构模式：

```
AppModule (根模块)
  │
  └── ShareModule (共享模块，使用 @CSModule 装饰器)
        │
        ├── ConfigModule (配置中心，自动加载 config.yaml)
        ├── LoggerModule (日志服务，异步配置)
        ├── ContextModule (上下文管理)
        ├── RpcModule (RPC 客户端，异步配置)
        ├── DatabaseModule (数据库，异步配置) ✨
        ├── RedisModule (Redis，异步配置) ✨
        └── FileStorageModule (OSS，异步配置) ✨
```

### 配置加载机制

服务启动时按以下顺序加载配置：

1. **本地配置**: 读取 `config.yaml` 文件
2. **Nacos 配置**: 根据 `configFrom: 'nacos'` 从 Nacos 配置中心拉取
3. **Profile 合并**: 根据 `profiles.active` 合并多个配置 profile
4. **异步初始化**: 各模块使用 `forRootAsync` 异步加载配置

### config.yaml 配置说明

```yaml
application:
  name: 'assembox-storage'        # 服务名称
  port: 3100                      # 监听端口
  serverPath: 'api/assembox'      # API 路径前缀
  profiles.active: 'dev,local'    # 激活的配置 profile

profiles.local:                   # 本地开发配置
  logger:
    level: 'verbose'              # 日志级别

  mysql:                          # TiDB 配置
    type: 'mysql'
    host: 'localhost'
    port: 4000
    database: 'assembox_storage'
    # ...

  redis:                          # Redis 配置
    host: 'localhost'
    port: 6379
    # ...

  oss:                            # OSS 配置
    accessKeyId: ''
    accessKeySecret: ''
    # ...
```

### ShareModule 说明

`share.module.ts` 使用 `@CSModule` 装饰器自动集成云平台基础设施：

- ✅ 自动注册 ConfigModule、LoggerModule、ContextModule、RpcModule
- ✅ 异步配置 DatabaseModule、RedisModule、FileStorageModule
- ✅ 全局导出，所有业务模块可直接使用
- ✅ 实体和仓储在 ShareModule 中统一注册

### Bootstrap 启动流程

`main.ts` 使用 `@cs/nest-cloud` 的 `bootstrap` 函数启动：

1. 创建 NestJS 应用实例
2. 加载配置（config.yaml + Nacos）
3. 自动设置日志、异常过滤器、拦截器、管道
4. 自动生成 Swagger 文档
5. 监听端口并启动服务
6. 执行启动回调函数

## 开发指南

### 1. 环境准备

确保以下服务已安装并运行：

- **TiDB**: 端口 4000 (或 MySQL 5.7+)
- **Redis**: 端口 6379
- **OSS**: 阿里云 OSS 或兼容的对象存储
- **Nacos** (可选): 配置中心，用于生产环境

### 2. 配置文件

编辑 `config.yaml` 文件，配置数据库、Redis、OSS 连接信息：

```yaml
profiles.local:
  mysql:
    host: 'localhost'      # 修改为你的 TiDB 地址
    port: 4000
    username: 'root'
    password: ''
    database: 'assembox_storage'

  redis:
    host: 'localhost'      # 修改为你的 Redis 地址
    port: 6379
    password: ''

  oss:
    accessKeyId: 'your-key'          # 修改为你的 OSS Key
    accessKeySecret: 'your-secret'   # 修改为你的 OSS Secret
    bucket: 'assembox'
```

### 3. 数据库初始化

执行初始化脚本创建数据表：

```bash
# 连接到 TiDB
mysql -h localhost -P 4000 -u root -p

# 创建数据库
CREATE DATABASE IF NOT EXISTS assembox_storage CHARACTER SET utf8mb4;

# 执行初始化脚本
source scripts/init-database.sql
```

### 4. 安装依赖

在项目根目录或服务目录下安装依赖：

```bash
# 在 monorepo 根目录
cd ../../
pnpm bootstrap

# 或在服务目录
cd projects/assembox-storage
pnpm install
```

### 5. 启动开发服务

```bash
# 在 monorepo 根目录
pnpm dev:storage

# 或在服务目录
pnpm run start:dev
```

服务启动成功后访问：
- **API**: http://localhost:3100/api/assembox
- **Swagger 文档**: http://localhost:3100/api/docs (如果配置了)

### 6. 构建生产版本

```bash
# 构建
pnpm run build

# 生产运行
pnpm run start:prod
```

### 7. 常用命令

```bash
# 开发模式（热重载）
pnpm run start:dev

# 调试模式
pnpm run start:debug

# 构建
pnpm run build

# 生产运行
pnpm run start

# 复制配置文件到 dist
pnpm run cp:config
```

## 设计文档

详细设计文档请参考: `/docs/design/01-storage/overview.md`

## 注意事项

1. **草稿与发布隔离**: 草稿存储在 `draft/` 目录，发布后复制到 `published/` 目录，运行时只读取 `published/` 路径
2. **状态过滤**: 运行时只查询 `status='published'` 的配置
3. **缓存控制**: 通过 `is_cacheable` 属性控制组件是否启用缓存
4. **继承控制**: 通过 `is_inheritable` 属性控制组件是否支持三层继承
5. **Git集成**: 当前版本预留接口，下个版本实现

## 后续优化

1. 实现 Gitea 集成，自动同步配置变更到 Git 仓库
2. 添加配置版本比对功能
3. 实现配置变更通知机制
4. 添加配置审计日志
5. 支持配置导入导出
