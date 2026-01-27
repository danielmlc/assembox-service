# 预览服务设计

> **状态**: 已完成
> **更新日期**: 2025-01-26
> **架构特点**: 统一代码生成，预览 = 生产

---

## 目录

1. [概述](#1-概述)
2. [统一代码生成架构](#2-统一代码生成架构)
3. [预览环境管理](#3-预览环境管理)
4. [增量代码生成](#4-增量代码生成)
5. [热重载机制](#5-热重载机制)
6. [服务设计](#6-服务设计)
7. [API 设计](#7-api-设计)
8. [相关文档](#8-相关文档)

---

## 1. 概述

### 1.1 设计理念

预览服务采用**统一代码生成架构**，确保预览环境和生产环境执行完全相同的代码：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     核心理念：预览 = 生产                                     │
└─────────────────────────────────────────────────────────────────────────────┘

    预览环境                                生产环境
    ━━━━━━━━                              ━━━━━━━━

    代码生成 + 热重载                       代码生成 + 完整构建
           │                                      │
           ▼                                      ▼
    快速迭代（1-5秒）                       性能最优（分钟级）
    所见即所得                              可水平扩展
```

### 1.2 职责定义

预览服务（PreviewModule）负责：

| 职责 | 说明 |
|-----|------|
| **预览环境管理** | 启动、停止、监控预览容器 |
| **增量代码生成** | 检测配置变更，仅生成变更部分 |
| **热重载协调** | 触发前端 HMR 和后端热重载 |
| **预览代理** | 将请求代理到预览容器 |

### 1.3 核心优势

| 优势 | 说明 |
|-----|------|
| **规则一致** | 预览和生产使用完全相同的代码生成器 |
| **所见即所得** | 预览效果 = 最终效果 |
| **调试友好** | 预览时也是真实代码，可断点调试 |
| **简化维护** | 只需维护一套代码生成逻辑 |

---

## 2. 统一代码生成架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        统一代码生成架构                                        │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────────┐
                         │    元数据/配置变更    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   CodeGenerator     │◀── 预览和生产共用
                         │   (代码生成器)       │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
           ┌─────────────────┐             ┌─────────────────┐
           │  预览环境         │             │  生产环境        │
           │  ┌─────────────┐ │             │  ┌─────────────┐ │
           │  │增量生成      │ │             │  │完整生成      │ │
           │  │esbuild 编译 │ │             │  │构建打包      │ │
           │  │热重载       │ │             │  │Docker 部署  │ │
           │  └─────────────┘ │             │  └─────────────┘ │
           │                   │             │                   │
           │  响应时间: 1-5秒  │             │  响应时间: 分钟级  │
           └─────────────────┘             └─────────────────┘
```

### 2.2 预览延迟预估

| 变更类型 | 预估时间 | 处理方式 |
|---------|---------|---------|
| 页面配置修改 | 1-2秒 | 前端 HMR，仅更新 Vue 组件 |
| 组件属性调整 | 1-2秒 | 前端 HMR |
| 模型字段修改 | 3-5秒 | 后端热重载，更新 Entity/DTO/Service |
| 新增模型 | 5-10秒 | 需编译新模块并注册 |
| 插件配置变更 | 3-5秒 | 重新生成 Service 代码 |

### 2.3 技术选型

| 组件 | 技术 | 说明 |
|-----|------|------|
| 前端热重载 | Vite HMR | 毫秒级 Vue 组件更新 |
| 后端热重载 | NestJS Hot Reload | 模块级热重载 |
| 快速编译 | esbuild | TypeScript 增量编译 |
| 预览容器 | Docker / 本地进程 | 隔离的预览环境 |

---

## 3. 预览环境管理

### 3.1 预览容器架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        预览容器架构                                           │
└─────────────────────────────────────────────────────────────────────────────┘

    设计器                 预览服务                    预览容器池
    ┌──────┐             ┌──────────────┐           ┌─────────────────────┐
    │ IDE  │ ──请求──▶  │ PreviewModule │ ──管理──▶ │ Container 1 (user1) │
    │      │             │              │           │ Container 2 (user2) │
    │      │ ◀──代理──  │              │           │ Container 3 (空闲)   │
    └──────┘             └──────────────┘           └─────────────────────┘
                                │
                                │ 触发
                                ▼
                         ┌──────────────┐
                         │ 增量代码生成  │
                         │ 热重载       │
                         └──────────────┘
```

### 3.2 容器生命周期

```typescript
enum ContainerStatus {
  CREATING = 'creating',    // 创建中
  READY = 'ready',          // 就绪
  BUSY = 'busy',            // 正在处理更新
  STOPPING = 'stopping',    // 停止中
  STOPPED = 'stopped',      // 已停止
}

interface PreviewContainer {
  id: string;
  userId: string;
  productId: string;
  status: ContainerStatus;

  // 容器信息
  backendPort: number;
  frontendPort: number;

  // 时间信息
  createdAt: Date;
  lastActiveAt: Date;

  // 代码版本
  codeVersion: string;
}
```

### 3.3 容器池管理策略

| 策略 | 说明 |
|-----|------|
| **预热** | 空闲时预先启动容器，减少首次预览延迟 |
| **复用** | 同一用户同一产品复用容器 |
| **超时回收** | 长时间无活动自动停止（默认 30 分钟）|
| **资源限制** | 每容器 CPU/内存限制，防止资源滥用 |

---

## 4. 增量代码生成

### 4.1 变更检测

```typescript
interface ConfigChange {
  type: 'model' | 'field' | 'page' | 'component' | 'plugin';
  action: 'create' | 'update' | 'delete';
  target: string;          // 变更目标的 code
  affectedFiles: string[]; // 受影响的生成文件
}

@Injectable()
export class ChangeDetectorService {
  /**
   * 检测配置变更
   */
  async detectChanges(
    productId: string,
    oldVersion: string,
    newVersion: string,
  ): Promise<ConfigChange[]> {
    const changes: ConfigChange[] = [];

    // 对比元数据快照
    const oldMeta = await this.getMetaSnapshot(productId, oldVersion);
    const newMeta = await this.getMetaSnapshot(productId, newVersion);

    // 检测模型变更
    changes.push(...this.diffModels(oldMeta.models, newMeta.models));

    // 检测字段变更
    changes.push(...this.diffFields(oldMeta.fields, newMeta.fields));

    // 检测页面配置变更
    const oldConfig = await this.getConfigSnapshot(productId, oldVersion);
    const newConfig = await this.getConfigSnapshot(productId, newVersion);
    changes.push(...this.diffConfigs(oldConfig, newConfig));

    return changes;
  }

  /**
   * 计算受影响的文件
   */
  getAffectedFiles(change: ConfigChange): string[] {
    switch (change.type) {
      case 'model':
        return [
          `entities/${change.target}.entity.ts`,
          `dto/${change.target}-create.dto.ts`,
          `dto/${change.target}-update.dto.ts`,
          `services/${change.target}.service.ts`,
          `controllers/${change.target}.controller.ts`,
        ];
      case 'field':
        const modelCode = this.getModelCodeFromField(change.target);
        return [
          `entities/${modelCode}.entity.ts`,
          `dto/${modelCode}-create.dto.ts`,
          `dto/${modelCode}-update.dto.ts`,
        ];
      case 'page':
        return [`pages/${change.target}.vue`];
      case 'component':
        return [`components/${change.target}.vue`];
      case 'plugin':
        // 插件变更影响所有绑定的 Service
        return this.getPluginAffectedServices(change.target);
      default:
        return [];
    }
  }
}
```

### 4.2 增量生成流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        增量代码生成流程                                        │
└─────────────────────────────────────────────────────────────────────────────┘

    配置变更
        │
        ▼
┌─────────────────┐
│ 变更检测         │
│ (ChangeDetector)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│ 计算受影响文件   │ ───▶ │ 仅重新生成这些文件│
└────────┬────────┘      └────────┬────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│ 生成代码        │      │ esbuild 增量编译 │
│ (CodeGenerator) │      │ (毫秒级)        │
└────────┬────────┘      └────────┬────────┘
         │                        │
         └───────────┬────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ 热重载更新       │
            └─────────────────┘
```

---

## 5. 热重载机制

### 5.1 前端热重载（Vite HMR）

```typescript
@Injectable()
export class FrontendHotReloadService {
  /**
   * 触发前端热重载
   */
  async triggerHMR(containerId: string, changedFiles: string[]): Promise<void> {
    const container = await this.containerService.get(containerId);

    // 通知 Vite dev server
    const ws = new WebSocket(`ws://localhost:${container.frontendPort}/__vite_hmr`);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'custom',
        event: 'assembox:config-change',
        data: { changedFiles },
      }));
    });
  }
}
```

### 5.2 后端热重载

```typescript
@Injectable()
export class BackendHotReloadService {
  /**
   * 触发后端热重载
   */
  async triggerReload(containerId: string, changedFiles: string[]): Promise<void> {
    const container = await this.containerService.get(containerId);

    // 判断重载级别
    const needsFullRestart = this.needsFullRestart(changedFiles);

    if (needsFullRestart) {
      // 新增模块需要完整重启
      await this.restartBackend(container);
    } else {
      // 模块内变更使用热重载
      await this.hotReloadModules(container, changedFiles);
    }
  }

  private needsFullRestart(files: string[]): boolean {
    // 新增模块或删除模块需要完整重启
    return files.some(f =>
      f.endsWith('.module.ts') ||
      f.includes('/new-module/')
    );
  }

  private async hotReloadModules(
    container: PreviewContainer,
    files: string[],
  ): Promise<void> {
    // 使用 NestJS 热重载 API
    await this.rpcClient.call(container.backendPort, 'hot-reload', { files });
  }
}
```

### 5.3 热重载时序图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        热重载时序                                            │
└─────────────────────────────────────────────────────────────────────────────┘

设计器          PreviewModule       CodeGenerator       预览容器
  │                  │                   │                 │
  │  保存配置        │                   │                 │
  │ ───────────────▶│                   │                 │
  │                  │                   │                 │
  │                  │  检测变更         │                 │
  │                  │ ─────────────────▶│                 │
  │                  │                   │                 │
  │                  │  增量生成         │                 │
  │                  │ ◀─────────────────│                 │
  │                  │                   │                 │
  │                  │  触发热重载                         │
  │                  │ ─────────────────────────────────▶│
  │                  │                                    │
  │                  │  重载完成                           │
  │                  │ ◀─────────────────────────────────│
  │                  │                   │                 │
  │  预览更新        │                   │                 │
  │ ◀───────────────│                   │                 │
  │                  │                   │                 │

总延迟: 1-5 秒（取决于变更类型）
```

---

## 6. 服务设计

### 6.1 服务列表

| 服务 | 职责 |
|-----|------|
| PreviewOrchestratorService | 编排预览流程 |
| PreviewContainerService | 管理预览容器 |
| ChangeDetectorService | 检测配置变更 |
| IncrementalGeneratorService | 增量代码生成 |
| FrontendHotReloadService | 前端热重载 |
| BackendHotReloadService | 后端热重载 |
| PreviewProxyService | 请求代理 |

### 6.2 PreviewOrchestratorService

```typescript
@Injectable()
export class PreviewOrchestratorService {
  constructor(
    private readonly containerService: PreviewContainerService,
    private readonly changeDetector: ChangeDetectorService,
    private readonly generator: IncrementalGeneratorService,
    private readonly frontendReload: FrontendHotReloadService,
    private readonly backendReload: BackendHotReloadService,
  ) {}

  /**
   * 启动预览环境
   */
  async startPreview(userId: string, productId: string): Promise<PreviewSession> {
    // 1. 获取或创建容器
    let container = await this.containerService.findByUserAndProduct(userId, productId);

    if (!container) {
      container = await this.containerService.create(userId, productId);
    }

    // 2. 全量生成代码
    const code = await this.generator.generateFull(productId);

    // 3. 部署到容器
    await this.containerService.deploy(container.id, code);

    // 4. 启动服务
    await this.containerService.start(container.id);

    return {
      sessionId: container.id,
      backendUrl: `http://localhost:${container.backendPort}`,
      frontendUrl: `http://localhost:${container.frontendPort}`,
      status: 'ready',
    };
  }

  /**
   * 刷新预览（配置变更后）
   */
  async refreshPreview(sessionId: string): Promise<RefreshResult> {
    const container = await this.containerService.get(sessionId);

    // 1. 检测变更
    const changes = await this.changeDetector.detectChanges(
      container.productId,
      container.codeVersion,
      'latest',
    );

    if (changes.length === 0) {
      return { updated: false, message: '无变更' };
    }

    // 2. 增量生成
    const affectedFiles = changes.flatMap(c => c.affectedFiles);
    const generatedCode = await this.generator.generateIncremental(
      container.productId,
      affectedFiles,
    );

    // 3. 更新容器中的文件
    await this.containerService.updateFiles(container.id, generatedCode);

    // 4. 触发热重载
    const frontendFiles = affectedFiles.filter(f => f.endsWith('.vue'));
    const backendFiles = affectedFiles.filter(f => f.endsWith('.ts'));

    await Promise.all([
      frontendFiles.length > 0 && this.frontendReload.triggerHMR(container.id, frontendFiles),
      backendFiles.length > 0 && this.backendReload.triggerReload(container.id, backendFiles),
    ]);

    // 5. 更新版本
    await this.containerService.updateVersion(container.id, 'latest');

    return {
      updated: true,
      changes: changes.length,
      affectedFiles: affectedFiles.length,
    };
  }

  /**
   * 停止预览环境
   */
  async stopPreview(sessionId: string): Promise<void> {
    await this.containerService.stop(sessionId);
  }
}

interface PreviewSession {
  sessionId: string;
  backendUrl: string;
  frontendUrl: string;
  status: 'ready' | 'starting' | 'error';
}

interface RefreshResult {
  updated: boolean;
  changes?: number;
  affectedFiles?: number;
  message?: string;
}
```

### 6.3 PreviewProxyService

```typescript
@Injectable()
export class PreviewProxyService {
  constructor(
    private readonly containerService: PreviewContainerService,
  ) {}

  /**
   * 代理请求到预览容器
   */
  async proxy(
    sessionId: string,
    target: 'backend' | 'frontend',
    request: Request,
  ): Promise<Response> {
    const container = await this.containerService.get(sessionId);

    if (container.status !== ContainerStatus.READY) {
      throw new ServiceUnavailableException('预览环境未就绪');
    }

    const port = target === 'backend' ? container.backendPort : container.frontendPort;
    const targetUrl = `http://localhost:${port}${request.url}`;

    // 代理请求
    return this.httpService.axiosRef({
      method: request.method,
      url: targetUrl,
      headers: request.headers,
      data: request.body,
    });
  }
}
```

---

## 7. API 设计

### 7.1 路由定义

| 方法 | 路径 | 说明 |
|-----|------|------|
| POST | /api/v1/preview/start | 启动预览环境 |
| POST | /api/v1/preview/refresh | 刷新预览（触发增量生成）|
| GET | /api/v1/preview/status | 获取预览环境状态 |
| DELETE | /api/v1/preview/stop | 停止预览环境 |
| ALL | /api/v1/preview/proxy/backend/* | 代理到预览后端 |
| ALL | /api/v1/preview/proxy/frontend/* | 代理到预览前端 |

### 7.2 请求/响应示例

**启动预览：**

```http
POST /api/v1/preview/start
Content-Type: application/json

{
  "productId": "product-001"
}
```

**响应：**

```json
{
  "code": 200,
  "result": {
    "sessionId": "preview-abc123",
    "backendUrl": "http://localhost:3001",
    "frontendUrl": "http://localhost:5173",
    "status": "ready"
  }
}
```

**刷新预览：**

```http
POST /api/v1/preview/refresh
Content-Type: application/json

{
  "sessionId": "preview-abc123"
}
```

**响应：**

```json
{
  "code": 200,
  "result": {
    "updated": true,
    "changes": 2,
    "affectedFiles": 5,
    "latency": 2350
  }
}
```

---

## 8. 相关文档

- [服务层概述](./overview.md)
- [代码生成设计](../05-publish/code-generation.md)
- [元数据服务设计](./meta-service.md)
- [插件系统设计](./plugin-service.md)
