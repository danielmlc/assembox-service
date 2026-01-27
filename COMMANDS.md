# 命令速查表

## 📦 安装与清理

```bash
# 安装所有依赖
pnpm bootstrap

# 清理所有 node_modules 和 dist
pnpm clean

# 只清理 dist 目录
pnpm clean:dist
```

## 🚀 后端服务命令

### assembox-storage (存储层服务)

```bash
# 开发模式（热重载）
pnpm dev:storage

# 构建
pnpm build:storage

# 生产运行
pnpm start:storage
```

### 批量操作

```bash
# 构建所有后端服务
pnpm build:services

# 在所有后端服务中执行命令
pnpm -r --filter './projects/*' exec <command>
```

## 🔧 云平台基础设施包

**注意：lib/ 目录仅供代码参考，不需要构建**

```bash
# 查看包源码
code lib/nest-common/src

# 查看包版本
cat lib/nest-common/package.json | grep version

# 升级依赖的基础设施包版本
cd projects/assembox-storage
pnpm update @cs/nest-common@latest
```

## 🔍 代码质量

```bash
# ESLint 检查并自动修复
pnpm lint:backend

# Prettier 格式化
pnpm format

# TypeScript 类型检查（不输出文件）
pnpm typecheck
```

## 📋 工作区管理

```bash
# 列出所有工作区包
pnpm ws:list

# 完整列表（包含依赖树）
pnpm list -r

# 查看特定包的依赖
pnpm list --filter assembox-storage

# 在所有包中执行命令
pnpm -r exec <command>

# 在特定包中执行命令
pnpm --filter <package-name> <command>
```

## 🔨 实用技巧

### 只安装特定服务的依赖

```bash
pnpm --filter assembox-storage install
```

### 给特定包添加依赖

```bash
# 添加到 assembox-storage
pnpm --filter assembox-storage add <package-name>

# 添加开发依赖
pnpm --filter assembox-storage add -D <package-name>
```

### 升级依赖

```bash
# 升级所有包的依赖
pnpm -r update

# 升级特定包的依赖
pnpm --filter assembox-storage update
```

### 并行执行命令

```bash
# 并行构建所有服务
pnpm -r --parallel run build

# 并行运行测试
pnpm -r --parallel test
```

### 查看包信息

```bash
# 查看包的详细信息
pnpm info <package-name>

# 查看包的版本
pnpm view <package-name> version

# 查看哪些包依赖了某个包
pnpm why <package-name>
```

## 🐛 调试命令

```bash
# 检查 workspace 配置
cat pnpm-workspace.yaml

# 查看 pnpm 配置
cat .npmrc

# 检查 TypeScript 配置
cat tsconfig.backend.json

# 查看编译后的文件
ls -la projects/assembox-storage/dist/

# 查看包的链接情况
pnpm list --depth 0
```

## 🔄 Git 工作流

```bash
# 提交前检查
pnpm typecheck && pnpm lint:backend && pnpm format

# 构建验证
pnpm build:all

# 清理后重新验证
pnpm clean && pnpm bootstrap && pnpm build:all
```

## 📊 性能分析

```bash
# 查看包大小
pnpm exec du -sh projects/*/dist

# 分析依赖关系
pnpm list --depth 1

# 查看重复依赖
pnpm dedupe --check
```

## 🆕 新服务创建流程

```bash
# 1. 创建目录
mkdir -p projects/new-service/src

# 2. 创建 package.json 和 tsconfig.json
# （参考 MONOREPO.md）

# 3. 安装依赖
pnpm bootstrap

# 4. 添加到根 package.json scripts
# "dev:new-service": "pnpm --filter new-service run start:dev"

# 5. 启动开发
pnpm dev:new-service
```

## 💡 常见问题

### 依赖找不到？

```bash
pnpm clean
pnpm bootstrap
```

### 类型错误？

```bash
pnpm build:lib
pnpm typecheck
```

### 热重载不工作？

```bash
# 确保使用正确的命令
pnpm dev:storage

# 或直接进入目录
cd projects/assembox-storage
pnpm run start:dev
```

### pnpm 工作区未识别包？

```bash
# 检查 pnpm-workspace.yaml
cat pnpm-workspace.yaml

# 验证包是否被识别
pnpm ws:list
```
