# Assembox Monorepo - 后端服务

基于 pnpm workspace 的后端服务 monorepo，包含云平台基础设施包和业务服务。

## 📁 目录结构

```
assembox-service/
├── lib/                          # 云平台基础设施包 (@cs/*)
│   ├── nest-common/              # 通用工具和装饰器
│   ├── nest-config/              # 配置管理（Nacos集成）
│   ├── nest-redis/               # Redis 客户端封装
│   ├── nest-typeorm/             # TypeORM + TiDB 封装
│   ├── nest-files/               # OSS 文件存储服务
│   ├── nest-cloud/               # RPC 客户端和 ID 生成器
│   ├── nest-cas-client/          # CAS 单点登录客户端
│   └── sql-parser/               # SQL 解析工具
│
├── projects/                      # 后端业务服务 🎯
│   └── assembox-storage/         # 存储层服务
│       ├── src/
│       │   ├── entities/         # 数据库实体
│       │   ├── repositories/     # 数据仓储层
│       │   ├── services/         # 业务逻辑层
│       │   ├── controllers/      # HTTP 控制器
│       │   ├── dto/              # 数据传输对象
│       │   └── interfaces/       # 接口定义
│       ├── scripts/              # SQL 初始化脚本
│       └── package.json
│
├── packages/                     # 前端项目（已有）
├── docs/                         # 文档
│
├── pnpm-workspace.yaml           # pnpm 工作区配置
├── package.json                  # 根配置和全局脚本
├── tsconfig.backend.json         # 后端 TS 共享配置
├── .eslintrc.backend.json        # ESLint 配置
├── .prettierrc                   # Prettier 配置
└── .npmrc                        # npm/pnpm 配置
```

## 🔗 依赖关系

### ⚠️ 重要说明：lib/ 目录的用途

**lib/ 目录仅供代码阅读参考，不作为 workspace 依赖使用。**

- ✅ **推荐做法**：直接安装发布到 npm 的 `@cs/*` 包
- ❌ **不推荐**：使用 `workspace:^` 协议引用 lib/ 下的本地包

### 正确的依赖方式

在 `projects/` 下的服务中，直接使用 npm 发布的版本：

```json
{
  "dependencies": {
    "@cs/nest-common": "^3.0.1",
    "@cs/nest-config": "^3.0.3",
    "@cs/nest-redis": "^2.0.0",
    "@cs/nest-typeorm": "^1.1.2",
    "@cs/nest-files": "^1.0.2",
    "@cs/nest-cloud": "^2.0.2"
  }
}
```

安装方式：

```bash
# 在服务目录下安装云平台基础设施包
cd projects/assembox-storage
pnpm add @cs/nest-common@^3.0.1
pnpm add @cs/nest-config@^3.0.3
# ...
```

### 为什么这样设计？

1. **版本管理**：lib/ 下的包有独立的发布周期，使用 npm 版本更稳定
2. **代码参考**：lib/ 源码方便查看实现细节和调试
3. **隔离性**：避免本地开发的基础设施包影响业务服务
4. **团队协作**：团队成员可以直接安装依赖，无需构建 lib 包

### 依赖图

```
assembox-storage (业务服务)
  │
  ├── @cs/nest-common     ← 通用工具
  ├── @cs/nest-config     ← Nacos 配置中心
  ├── @cs/nest-redis      ← Redis 缓存
  ├── @cs/nest-typeorm    ← TiDB 数据库
  ├── @cs/nest-files      ← OSS 存储
  └── @cs/nest-cloud      ← RPC + ID生成
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# 确保使用 pnpm
pnpm bootstrap
```

### 2. 启动开发服务

```bash
# 启动存储层服务（开发模式）
pnpm dev:storage
```

访问：http://localhost:3000

### 3. 构建生产版本

```bash
# 构建存储层服务
pnpm build:storage

# 启动生产服务
pnpm start:storage
```

## 📝 常用命令

### 项目管理

```bash
# 安装依赖
pnpm bootstrap

# 清理所有构建产物和 node_modules
pnpm clean

# 仅清理构建产物
pnpm clean:dist

# 列出所有工作区包
pnpm ws:list
```

### 后端服务（project 目录）

```bash
# 开发模式（热重载）
pnpm dev:storage

# 构建
pnpm build:storage

# 生产运行
pnpm start:storage

# 构建所有后端服务
pnpm build:services
```

### 云平台基础设施包（lib 目录）

**注意：lib/ 目录仅供代码参考，不需要构建。**

如需查看源码实现：

```bash
# 查看 nest-common 源码
code lib/nest-common/src

# 查看包版本
cat lib/nest-common/package.json | grep version
```

### 代码质量

```bash
# ESLint 检查并修复
pnpm lint:backend

# Prettier 格式化
pnpm format

# TypeScript 类型检查（不输出文件）
pnpm typecheck
```

### 全局构建

```bash
# 构建所有包（lib + services）
pnpm build:all
```

## 🛠️ 技术栈

### 核心框架
- **NestJS** - 企业级 Node.js 框架
- **TypeScript** - 类型安全
- **TypeORM** - ORM 框架

### 基础设施
- **TiDB** - 分布式数据库
- **Redis** - 缓存和会话
- **OSS** - 对象存储
- **Nacos** - 配置中心

### 工具链
- **pnpm** - 快速、节省磁盘的包管理器
- **ESLint** - 代码检查
- **Prettier** - 代码格式化

## 📦 添加新的后端服务

### 1. 创建服务目录

```bash
mkdir -p projects/your-service-name/src
cd projects/your-service-name
```

### 2. 创建 package.json

```json
{
  "name": "your-service-name",
  "version": "1.0.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "start:dev": "ts-node src/main.ts",
    "watch": "tsc --watch"
  },
  "dependencies": {
    "@cs/nest-common": "^3.0.1",
    "@cs/nest-config": "^3.0.3",
    "@nestjs/common": "^10.4.8",
    "@nestjs/core": "^10.4.8",
    "@nestjs/platform-express": "^10.4.8",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  }
}
```

### 3. 创建 tsconfig.json

```json
{
  "extends": "../../tsconfig.backend.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

### 4. 创建 NestJS 应用

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### 5. 添加根命令

在根 `package.json` 的 `scripts` 中添加：

```json
{
  "scripts": {
    "dev:your-service": "pnpm --filter your-service-name run start:dev",
    "build:your-service": "pnpm --filter your-service-name run build",
    "start:your-service": "pnpm --filter your-service-name run start"
  }
}
```

### 6. 安装依赖并启动

```bash
cd ../..
pnpm bootstrap
pnpm dev:your-service
```

## 🔧 开发工作流

### 日常开发

1. **启动开发服务**
   ```bash
   pnpm dev:storage
   ```

2. **修改代码**（自动热重载）

3. **代码检查**
   ```bash
   pnpm lint:backend
   pnpm typecheck
   ```

4. **提交前格式化**
   ```bash
   pnpm format
   ```

### 升级基础设施包版本

当云平台基础设施包有新版本发布时：

```bash
# 查看 lib/ 目录下的最新版本
cat lib/nest-common/package.json | grep version

# 在服务中升级到新版本
cd projects/assembox-storage
pnpm update @cs/nest-common@^3.0.2

# 或者重新安装指定版本
pnpm add @cs/nest-common@^3.0.2
```

## ⚙️ 配置说明

### pnpm-workspace.yaml

定义工作区包的位置：

```yaml
packages:
  - 'packages/*'   # 前端包
  - 'docs/*'       # 文档
  - 'projects/*'    # 后端服务

# 注意: lib/ 不在工作区中，仅供代码参考
```

**重要**：lib/ 目录不包含在工作区中，避免作为 workspace 依赖使用。

### .npmrc

pnpm 行为配置：

```
shamefully-hoist=true           # 依赖提升到根 node_modules
strict-peer-dependencies=false  # 不严格检查 peer 依赖
scripts-prepend-node-path=false # 不修改 PATH
```

### tsconfig.backend.json

后端服务共享的 TypeScript 配置：

- 模块系统：CommonJS
- 目标版本：ES2021
- 启用装饰器
- 严格空值检查

## 🐛 故障排除

### 依赖找不到

```bash
# 清理并重新安装
pnpm clean
pnpm bootstrap
```

### TypeScript 编译错误

```bash
# 检查 tsconfig 继承链
# 确保基础设施包已构建
pnpm build:lib

# 类型检查
pnpm typecheck
```

### pnpm 工作区未识别包

```bash
# 检查 pnpm-workspace.yaml
# 确保包目录匹配 glob 模式
pnpm ws:list
```

### 热重载不工作

```bash
# 确保使用 ts-node
pnpm dev:storage

# 或手动启动
cd projects/assembox-storage
pnpm run start:dev
```

## 📚 相关文档

- [NestJS 文档](https://docs.nestjs.com/)
- [TypeORM 文档](https://typeorm.io/)
- [pnpm 工作区](https://pnpm.io/workspaces)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)

## 🤝 贡献指南

1. 遵循项目的 ESLint 和 Prettier 规范
2. 提交前运行 `pnpm typecheck` 和 `pnpm lint:backend`
3. 所有公共 API 必须添加 JSDoc 注释
4. 数据库 schema 变更需同步更新 SQL 脚本

## 📄 License

ISC
