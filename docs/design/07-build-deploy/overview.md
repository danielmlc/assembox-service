# 构建发布部署设计

> **状态**: 设计中
> **更新日期**: 2025-01-30
> **设计目标**: 实现从配置到可运行服务的完整构建发布流程

---

## 1. 概述

### 1.1 设计背景

构建发布部署是低代码平台"代码生成 + 构建发布"模式的后半段，负责将生成的代码编译、打包、测试并部署为可运行的服务。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          完整的发布流程                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │ 配置获取  │ → │ 代码生成  │ → │ 编译校验  │ → │ 打包镜像  │ → │ 部署上线  │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
│       │              │              │              │              │        │
│       ▼              ▼              ▼              ▼              ▼        │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │ 快照服务  │   │ 生成引擎  │   │ TypeScript│   │ Docker    │   │ K8s/容器  │ │
│  │          │   │ ts-morph │   │ ESLint   │   │ 镜像仓库  │   │ 平台     │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       健康检查 & 回滚机制                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心流程阶段

| 阶段 | 输入 | 输出 | 工具/技术 |
|-----|------|------|----------|
| 配置获取 | 产品ID、版本号 | 配置快照 | 快照服务 API |
| 代码生成 | 配置快照 | NestJS 项目代码 | ts-morph |
| 编译校验 | 项目代码 | 编译产物、校验报告 | tsc、ESLint |
| 打包镜像 | 编译产物 | Docker 镜像 | Docker、esbuild |
| 部署上线 | Docker 镜像 | 运行实例 | K8s / Docker Compose |

### 1.3 设计原则

1. **流水线化** - 所有步骤可自动化执行，支持 CI/CD
2. **可追溯** - 每次发布关联快照版本、代码版本、镜像版本
3. **可回滚** - 保留历史版本，支持快速回滚
4. **健康优先** - 部署前后进行健康检查，失败自动回滚

---

## 2. 发布服务架构

### 2.1 服务定位

发布服务（assembox-publish-service）是独立部署的微服务，负责整个构建发布流程的编排：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          发布服务架构                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    assembox-publish-service                          │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │   │
│  │  │ PublishModule │  │ BuildModule   │  │ DeployModule  │           │   │
│  │  │ 发布任务管理   │  │ 构建编译打包  │  │ 部署管理      │           │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘           │   │
│  │                                                                     │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │   │
│  │  │ HealthModule  │  │ RollbackModule│  │ NotifyModule  │           │   │
│  │  │ 健康检查      │  │ 回滚管理      │  │ 通知告警      │           │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│          ┌──────────────────────────┼──────────────────────────┐           │
│          ▼                          ▼                          ▼           │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐    │
│  │ 存储服务       │         │ 代码生成引擎  │         │ Docker/K8s    │    │
│  │ (快照API)     │         │ (本地或远程)  │         │ (部署目标)    │    │
│  └───────────────┘         └───────────────┘         └───────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块

```typescript
/**
 * 发布服务模块
 */
@Module({
    imports: [
        PublishModule,     // 发布任务管理
        BuildModule,       // 构建编译打包
        DeployModule,      // 部署管理
        HealthModule,      // 健康检查
        RollbackModule,    // 回滚管理
        NotifyModule,      // 通知告警
    ],
})
export class PublishServiceModule {}
```

---

## 3. 发布任务管理

### 3.1 发布任务状态机

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          发布任务状态流转                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                          ┌───────────┐                                      │
│                          │  PENDING  │ 等待中                               │
│                          └─────┬─────┘                                      │
│                                │ 开始执行                                    │
│                                ▼                                            │
│                          ┌───────────┐                                      │
│                          │ PREPARING │ 准备中（获取配置）                    │
│                          └─────┬─────┘                                      │
│                                │                                            │
│              ┌─────────────────┼─────────────────┐                         │
│              │ 成功            │                 │ 失败                     │
│              ▼                 │                 ▼                          │
│        ┌───────────┐           │           ┌───────────┐                   │
│        │ GENERATING│ 生成中    │           │  FAILED   │                   │
│        └─────┬─────┘           │           └───────────┘                   │
│              │                 │                 ▲                          │
│              ▼                 │                 │                          │
│        ┌───────────┐           │                 │                          │
│        │ BUILDING  │ 构建中    │                 │                          │
│        └─────┬─────┘           │                 │                          │
│              │                 │                 │                          │
│              ▼                 │                 │                          │
│        ┌───────────┐           │                 │                          │
│        │ TESTING   │ 测试中    ├─────────────────┤                          │
│        └─────┬─────┘           │                 │                          │
│              │                 │                 │                          │
│              ▼                 │                 │                          │
│        ┌───────────┐           │                 │                          │
│        │ DEPLOYING │ 部署中    │                 │                          │
│        └─────┬─────┘           │                 │                          │
│              │                 │                 │                          │
│              ▼                 │                 │                          │
│        ┌───────────┐           │                 │                          │
│        │ VERIFYING │ 验证中    │                 │                          │
│        └─────┬─────┘           │                 │                          │
│              │                 │                 │                          │
│              ▼                 │                 │                          │
│        ┌───────────┐           │                 │                          │
│        │ COMPLETED │ 完成      │                 │                          │
│        └───────────┘           │                 │                          │
│                                │                 │                          │
│                          回滚  ▼                 │                          │
│                          ┌───────────┐           │                          │
│                          │ ROLLBACK  │ ──────────┘                          │
│                          └───────────┘                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 发布任务数据模型

```sql
-- 发布任务表
CREATE TABLE ab_publish_task (
    id                  BIGINT NOT NULL COMMENT '主键',
    task_code           VARCHAR(100) NOT NULL COMMENT '任务编码',
    product_id          BIGINT NOT NULL COMMENT '产品ID',
    product_code        VARCHAR(100) NOT NULL COMMENT '产品代码',
    snapshot_id         BIGINT NOT NULL COMMENT '快照ID',
    snapshot_version    VARCHAR(50) NOT NULL COMMENT '快照版本',

    -- 状态
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态',
    current_stage       VARCHAR(50) COMMENT '当前阶段',
    progress            INT DEFAULT 0 COMMENT '进度百分比',
    error_message       TEXT COMMENT '错误信息',

    -- 构建产物
    generated_path      VARCHAR(500) COMMENT '生成代码路径',
    build_log_path      VARCHAR(500) COMMENT '构建日志路径',
    image_tag           VARCHAR(200) COMMENT 'Docker镜像标签',
    image_digest        VARCHAR(200) COMMENT '镜像摘要',

    -- 部署信息
    deploy_env          VARCHAR(50) COMMENT '部署环境: dev/test/prod',
    deploy_namespace    VARCHAR(100) COMMENT 'K8s命名空间',
    deploy_replicas     INT DEFAULT 1 COMMENT '副本数',
    service_url         VARCHAR(500) COMMENT '服务访问地址',

    -- 时间
    started_at          DATETIME COMMENT '开始时间',
    completed_at        DATETIME COMMENT '完成时间',

    -- 审计
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_id          BIGINT,
    creator_name        VARCHAR(50),

    PRIMARY KEY (id),
    INDEX idx_product (product_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
) COMMENT '发布任务表';

-- 发布阶段日志表
CREATE TABLE ab_publish_stage_log (
    id                  BIGINT NOT NULL COMMENT '主键',
    task_id             BIGINT NOT NULL COMMENT '任务ID',
    stage               VARCHAR(50) NOT NULL COMMENT '阶段名称',
    status              VARCHAR(20) NOT NULL COMMENT '状态: RUNNING/SUCCESS/FAILED',
    started_at          DATETIME NOT NULL COMMENT '开始时间',
    completed_at        DATETIME COMMENT '完成时间',
    duration_ms         INT COMMENT '耗时毫秒',
    log_content         TEXT COMMENT '日志内容',
    error_detail        TEXT COMMENT '错误详情',

    PRIMARY KEY (id),
    INDEX idx_task (task_id)
) COMMENT '发布阶段日志表';
```

### 3.3 发布任务 API

```typescript
/**
 * 发布任务控制器
 */
@Controller('publish')
@ApiTags('发布管理')
export class PublishController {

    /**
     * 创建发布任务
     */
    @Post('tasks')
    @ApiOperation({ summary: '创建发布任务' })
    async createTask(@Body() dto: CreatePublishTaskDto): Promise<PublishTask> {
        return this.publishService.createTask(dto);
    }

    /**
     * 执行发布任务
     */
    @Post('tasks/:taskId/execute')
    @ApiOperation({ summary: '执行发布任务' })
    async executeTask(@Param('taskId') taskId: string): Promise<PublishTask> {
        return this.publishService.executeTask(taskId);
    }

    /**
     * 查询任务状态
     */
    @Get('tasks/:taskId')
    @ApiOperation({ summary: '查询任务状态' })
    async getTaskStatus(@Param('taskId') taskId: string): Promise<PublishTaskStatus> {
        return this.publishService.getTaskStatus(taskId);
    }

    /**
     * 查询任务日志
     */
    @Get('tasks/:taskId/logs')
    @ApiOperation({ summary: '查询任务日志' })
    async getTaskLogs(@Param('taskId') taskId: string): Promise<StageLog[]> {
        return this.publishService.getTaskLogs(taskId);
    }

    /**
     * 取消任务
     */
    @Post('tasks/:taskId/cancel')
    @ApiOperation({ summary: '取消任务' })
    async cancelTask(@Param('taskId') taskId: string): Promise<void> {
        return this.publishService.cancelTask(taskId);
    }

    /**
     * 回滚到指定版本
     */
    @Post('tasks/:taskId/rollback')
    @ApiOperation({ summary: '回滚发布' })
    async rollbackTask(
        @Param('taskId') taskId: string,
        @Body() dto: RollbackDto
    ): Promise<PublishTask> {
        return this.publishService.rollbackTask(taskId, dto);
    }
}
```

---

## 4. 构建流程

### 4.1 构建流水线

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          构建流水线                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Stage 1: PREPARE 准备阶段                                           │   │
│  │  ├── 1.1 获取配置快照                                                │   │
│  │  ├── 1.2 校验快照完整性                                              │   │
│  │  ├── 1.3 创建工作目录                                                │   │
│  │  └── 1.4 复制服务模板                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Stage 2: GENERATE 生成阶段                                          │   │
│  │  ├── 2.1 生成 Entity 文件                                            │   │
│  │  ├── 2.2 生成 DTO 文件                                               │   │
│  │  ├── 2.3 生成 Controller 文件                                        │   │
│  │  ├── 2.4 生成 Service 文件                                           │   │
│  │  ├── 2.5 生成 Module 文件                                            │   │
│  │  ├── 2.6 更新 app.module.ts                                         │   │
│  │  └── 2.7 生成 manifest.json                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Stage 3: COMPILE 编译阶段                                           │   │
│  │  ├── 3.1 安装依赖 (npm ci)                                           │   │
│  │  ├── 3.2 ESLint 检查                                                 │   │
│  │  ├── 3.3 TypeScript 编译 (tsc)                                       │   │
│  │  └── 3.4 esbuild 打包 (生成单文件)                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Stage 4: TEST 测试阶段                                              │   │
│  │  ├── 4.1 单元测试 (可选)                                             │   │
│  │  ├── 4.2 启动服务 (本地)                                             │   │
│  │  ├── 4.3 API 冒烟测试                                                │   │
│  │  └── 4.4 健康检查端点验证                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Stage 5: PACKAGE 打包阶段                                           │   │
│  │  ├── 5.1 生成 Dockerfile                                             │   │
│  │  ├── 5.2 构建 Docker 镜像                                            │   │
│  │  ├── 5.3 推送到镜像仓库                                              │   │
│  │  └── 5.4 记录镜像摘要                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 构建服务实现

```typescript
/**
 * 构建服务
 */
@Injectable()
export class BuildService {
    constructor(
        private readonly codeGenerator: CodeGenerationService,
        private readonly dockerService: DockerService,
        private readonly logger: LoggerService,
    ) {}

    /**
     * 执行完整构建
     */
    async build(task: PublishTask, context: BuildContext): Promise<BuildResult> {
        const stages: StageResult[] = [];

        try {
            // Stage 1: 准备
            stages.push(await this.stagePreapre(task, context));

            // Stage 2: 生成
            stages.push(await this.stageGenerate(task, context));

            // Stage 3: 编译
            stages.push(await this.stageCompile(task, context));

            // Stage 4: 测试
            stages.push(await this.stageTest(task, context));

            // Stage 5: 打包
            stages.push(await this.stagePackage(task, context));

            return {
                success: true,
                stages,
                imageTag: context.imageTag,
                imageDigest: context.imageDigest,
            };
        } catch (error) {
            return {
                success: false,
                stages,
                error: error.message,
            };
        }
    }

    /**
     * Stage 1: 准备阶段
     */
    private async stagePreapre(task: PublishTask, context: BuildContext): Promise<StageResult> {
        const stage = this.startStage('PREPARE');

        try {
            // 1.1 获取配置快照
            const snapshot = await this.configService.getSnapshot(task.snapshotId);
            context.snapshot = snapshot;

            // 1.2 校验快照完整性
            await this.validateSnapshot(snapshot);

            // 1.3 创建工作目录
            context.workDir = await this.createWorkDir(task.taskCode);

            // 1.4 复制服务模板
            await this.copyTemplate(context.workDir);

            return this.completeStage(stage, 'SUCCESS');
        } catch (error) {
            return this.completeStage(stage, 'FAILED', error);
        }
    }

    /**
     * Stage 2: 生成阶段
     */
    private async stageGenerate(task: PublishTask, context: BuildContext): Promise<StageResult> {
        const stage = this.startStage('GENERATE');

        try {
            const result = await this.codeGenerator.generateProduct(
                task.productId,
                {
                    outputBase: context.workDir,
                    snapshot: context.snapshot,
                }
            );

            context.generatedFiles = result.files;
            return this.completeStage(stage, 'SUCCESS');
        } catch (error) {
            return this.completeStage(stage, 'FAILED', error);
        }
    }

    /**
     * Stage 3: 编译阶段
     */
    private async stageCompile(task: PublishTask, context: BuildContext): Promise<StageResult> {
        const stage = this.startStage('COMPILE');

        try {
            // 3.1 安装依赖
            await this.exec('npm ci', { cwd: context.workDir });

            // 3.2 ESLint 检查
            const lintResult = await this.exec('npm run lint', { cwd: context.workDir });
            if (lintResult.exitCode !== 0) {
                throw new Error('ESLint 检查失败');
            }

            // 3.3 TypeScript 编译
            await this.exec('npm run build', { cwd: context.workDir });

            // 3.4 esbuild 打包
            await this.bundleWithEsbuild(context.workDir);

            return this.completeStage(stage, 'SUCCESS');
        } catch (error) {
            return this.completeStage(stage, 'FAILED', error);
        }
    }

    /**
     * Stage 4: 测试阶段
     */
    private async stageTest(task: PublishTask, context: BuildContext): Promise<StageResult> {
        const stage = this.startStage('TEST');

        try {
            // 4.1 启动服务
            const process = await this.startService(context.workDir);

            // 4.2 等待服务就绪
            await this.waitForReady(process, 30000);

            // 4.3 健康检查
            const healthResult = await this.checkHealth('http://localhost:3000/health');
            if (!healthResult.ok) {
                throw new Error('健康检查失败');
            }

            // 4.4 API 冒烟测试
            await this.smokeTest(context);

            // 关闭测试服务
            await this.stopService(process);

            return this.completeStage(stage, 'SUCCESS');
        } catch (error) {
            return this.completeStage(stage, 'FAILED', error);
        }
    }

    /**
     * Stage 5: 打包阶段
     */
    private async stagePackage(task: PublishTask, context: BuildContext): Promise<StageResult> {
        const stage = this.startStage('PACKAGE');

        try {
            // 5.1 生成 Dockerfile
            await this.generateDockerfile(context.workDir);

            // 5.2 构建镜像
            const imageTag = this.buildImageTag(task);
            await this.dockerService.build(context.workDir, imageTag);

            // 5.3 推送镜像
            const digest = await this.dockerService.push(imageTag);

            context.imageTag = imageTag;
            context.imageDigest = digest;

            return this.completeStage(stage, 'SUCCESS');
        } catch (error) {
            return this.completeStage(stage, 'FAILED', error);
        }
    }

    /**
     * 生成 Dockerfile
     */
    private async generateDockerfile(workDir: string): Promise<void> {
        const dockerfile = `
FROM node:20-alpine AS base
WORKDIR /app

# 生产环境依赖
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# 运行时镜像
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY dist/ ./dist/
COPY config.yaml ./

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
`;
        await fs.writeFile(path.join(workDir, 'Dockerfile'), dockerfile);
    }
}
```

---

## 5. 部署流程

### 5.1 部署目标

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          部署目标支持                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Kubernetes (推荐)                                                   │   │
│  │  ├── Deployment 管理                                                 │   │
│  │  ├── Service 暴露                                                    │   │
│  │  ├── ConfigMap/Secret 配置                                           │   │
│  │  ├── HPA 自动扩缩容                                                  │   │
│  │  └── Ingress 路由                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Docker Compose (开发/测试)                                          │   │
│  │  ├── 简单部署                                                        │   │
│  │  ├── 本地开发                                                        │   │
│  │  └── 单机测试                                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  云平台托管 (扩展)                                                    │   │
│  │  ├── 阿里云 ACK                                                      │   │
│  │  ├── 腾讯云 TKE                                                      │   │
│  │  └── AWS EKS                                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Kubernetes 部署清单

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${PRODUCT_CODE}-service
  namespace: ${NAMESPACE}
  labels:
    app: ${PRODUCT_CODE}
    version: ${VERSION}
spec:
  replicas: ${REPLICAS}
  selector:
    matchLabels:
      app: ${PRODUCT_CODE}
  template:
    metadata:
      labels:
        app: ${PRODUCT_CODE}
        version: ${VERSION}
    spec:
      containers:
        - name: ${PRODUCT_CODE}
          image: ${IMAGE_TAG}
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: CONFIG_PATH
              value: "/app/config/config.yaml"
          envFrom:
            - configMapRef:
                name: ${PRODUCT_CODE}-config
            - secretRef:
                name: ${PRODUCT_CODE}-secrets
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          volumeMounts:
            - name: config
              mountPath: /app/config
      volumes:
        - name: config
          configMap:
            name: ${PRODUCT_CODE}-config

---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ${PRODUCT_CODE}-service
  namespace: ${NAMESPACE}
spec:
  selector:
    app: ${PRODUCT_CODE}
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${PRODUCT_CODE}-ingress
  namespace: ${NAMESPACE}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: ${SERVICE_HOST}
      http:
        paths:
          - path: /api/${PRODUCT_CODE}
            pathType: Prefix
            backend:
              service:
                name: ${PRODUCT_CODE}-service
                port:
                  number: 80
```

### 5.3 部署服务实现

```typescript
/**
 * 部署服务
 */
@Injectable()
export class DeployService {
    constructor(
        private readonly k8sClient: KubernetesClient,
        private readonly healthChecker: HealthChecker,
        private readonly logger: LoggerService,
    ) {}

    /**
     * 部署到 Kubernetes
     */
    async deployToK8s(task: PublishTask, config: DeployConfig): Promise<DeployResult> {
        const { namespace, replicas, env } = config;

        try {
            // 1. 渲染部署清单
            const manifests = await this.renderManifests(task, config);

            // 2. 应用部署清单
            await this.applyManifests(manifests);

            // 3. 等待部署就绪
            await this.waitForRollout(task.productCode, namespace, 300000);

            // 4. 健康检查
            const serviceUrl = await this.getServiceUrl(task.productCode, namespace);
            const healthResult = await this.healthChecker.check(serviceUrl);

            if (!healthResult.healthy) {
                throw new Error(`健康检查失败: ${healthResult.message}`);
            }

            return {
                success: true,
                serviceUrl,
                replicas,
                namespace,
            };
        } catch (error) {
            // 部署失败，触发回滚
            await this.rollback(task.productCode, namespace);
            throw error;
        }
    }

    /**
     * 渲染部署清单
     */
    private async renderManifests(task: PublishTask, config: DeployConfig): Promise<string[]> {
        const templateVars = {
            PRODUCT_CODE: task.productCode,
            VERSION: task.snapshotVersion,
            NAMESPACE: config.namespace,
            REPLICAS: config.replicas,
            IMAGE_TAG: task.imageTag,
            SERVICE_HOST: config.serviceHost,
        };

        const templates = ['deployment.yaml', 'service.yaml', 'ingress.yaml'];
        const manifests: string[] = [];

        for (const template of templates) {
            const content = await this.loadTemplate(template);
            const rendered = this.renderTemplate(content, templateVars);
            manifests.push(rendered);
        }

        return manifests;
    }

    /**
     * 等待部署完成
     */
    private async waitForRollout(
        productCode: string,
        namespace: string,
        timeout: number
    ): Promise<void> {
        const deploymentName = `${productCode}-service`;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const status = await this.k8sClient.getDeploymentStatus(
                deploymentName,
                namespace
            );

            if (status.ready && status.available === status.replicas) {
                this.logger.info(`部署完成: ${deploymentName}`);
                return;
            }

            this.logger.debug(`等待部署: ${status.available}/${status.replicas}`);
            await this.sleep(5000);
        }

        throw new Error(`部署超时: ${deploymentName}`);
    }

    /**
     * 回滚部署
     */
    async rollback(productCode: string, namespace: string): Promise<void> {
        const deploymentName = `${productCode}-service`;

        this.logger.warn(`开始回滚: ${deploymentName}`);

        await this.k8sClient.rollbackDeployment(deploymentName, namespace);

        await this.waitForRollout(productCode, namespace, 180000);

        this.logger.info(`回滚完成: ${deploymentName}`);
    }
}
```

---

## 6. 健康检查

### 6.1 健康检查端点

生成的服务需要包含标准的健康检查端点：

```typescript
/**
 * 健康检查控制器（自动生成）
 */
@Controller('health')
export class HealthController {
    constructor(
        private readonly healthService: HealthService,
    ) {}

    /**
     * 存活探针
     * GET /health
     */
    @Get()
    async liveness(): Promise<HealthStatus> {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * 就绪探针
     * GET /health/ready
     */
    @Get('ready')
    async readiness(): Promise<ReadinessStatus> {
        const checks = await this.healthService.checkAll();

        return {
            status: checks.every(c => c.healthy) ? 'ready' : 'not_ready',
            checks,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * 详细状态
     * GET /health/detail
     */
    @Get('detail')
    async detail(): Promise<DetailedHealthStatus> {
        return this.healthService.getDetailedStatus();
    }
}

/**
 * 健康检查服务
 */
@Injectable()
export class HealthService {
    async checkAll(): Promise<HealthCheck[]> {
        return [
            await this.checkDatabase(),
            await this.checkRedis(),
            await this.checkDiskSpace(),
            await this.checkMemory(),
        ];
    }

    private async checkDatabase(): Promise<HealthCheck> {
        try {
            await this.dataSource.query('SELECT 1');
            return { name: 'database', healthy: true };
        } catch (error) {
            return { name: 'database', healthy: false, error: error.message };
        }
    }

    private async checkRedis(): Promise<HealthCheck> {
        try {
            await this.redis.ping();
            return { name: 'redis', healthy: true };
        } catch (error) {
            return { name: 'redis', healthy: false, error: error.message };
        }
    }
}
```

### 6.2 发布后健康验证

```typescript
/**
 * 发布后健康验证
 */
export class PostDeployHealthVerifier {
    /**
     * 验证服务健康
     */
    async verify(serviceUrl: string, options: VerifyOptions): Promise<VerifyResult> {
        const { timeout = 60000, retries = 3, interval = 5000 } = options;
        const startTime = Date.now();

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // 1. 检查存活
                const liveness = await this.checkLiveness(serviceUrl);
                if (!liveness.ok) {
                    throw new Error(`存活检查失败: ${liveness.message}`);
                }

                // 2. 检查就绪
                const readiness = await this.checkReadiness(serviceUrl);
                if (!readiness.ok) {
                    throw new Error(`就绪检查失败: ${readiness.message}`);
                }

                // 3. API 冒烟测试
                const smoke = await this.smokeTest(serviceUrl);
                if (!smoke.ok) {
                    throw new Error(`冒烟测试失败: ${smoke.message}`);
                }

                return {
                    success: true,
                    duration: Date.now() - startTime,
                    checks: { liveness, readiness, smoke },
                };
            } catch (error) {
                this.logger.warn(`健康验证失败 (尝试 ${attempt}/${retries}): ${error.message}`);

                if (attempt < retries) {
                    await this.sleep(interval);
                }
            }
        }

        return {
            success: false,
            duration: Date.now() - startTime,
            error: '健康验证失败，已达最大重试次数',
        };
    }
}
```

---

## 7. 版本管理

### 7.1 版本号规则

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          版本号组成                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  镜像标签格式:                                                               │
│  registry.example.com/{product-code}:{snapshot-version}-{build-number}     │
│                                                                             │
│  示例:                                                                       │
│  registry.example.com/order-service:v1.2.3-20250130-001                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  registry.example.com  镜像仓库地址                                  │   │
│  │  order-service         产品代码                                      │   │
│  │  v1.2.3               快照版本号                                     │   │
│  │  20250130             构建日期                                       │   │
│  │  001                  当日构建序号                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 版本历史记录

```sql
-- 发布版本历史表
CREATE TABLE ab_publish_version (
    id                  BIGINT NOT NULL COMMENT '主键',
    product_id          BIGINT NOT NULL COMMENT '产品ID',
    product_code        VARCHAR(100) NOT NULL COMMENT '产品代码',
    version             VARCHAR(50) NOT NULL COMMENT '版本号',
    snapshot_id         BIGINT NOT NULL COMMENT '快照ID',
    task_id             BIGINT NOT NULL COMMENT '发布任务ID',
    image_tag           VARCHAR(200) NOT NULL COMMENT '镜像标签',
    image_digest        VARCHAR(200) NOT NULL COMMENT '镜像摘要',

    -- 部署状态
    deploy_env          VARCHAR(50) NOT NULL COMMENT '部署环境',
    is_current          TINYINT(1) DEFAULT 0 COMMENT '是否当前版本',
    deployed_at         DATETIME COMMENT '部署时间',

    -- 回滚标记
    is_rollback         TINYINT(1) DEFAULT 0 COMMENT '是否回滚版本',
    rollback_from       VARCHAR(50) COMMENT '回滚自哪个版本',

    -- 审计
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator_id          BIGINT,

    PRIMARY KEY (id),
    INDEX idx_product_env (product_id, deploy_env),
    INDEX idx_current (is_current)
) COMMENT '发布版本历史表';
```

---

## 8. 通知告警

### 8.1 通知场景

| 场景 | 通知级别 | 通知渠道 |
|-----|---------|---------|
| 发布开始 | INFO | 钉钉/企微 |
| 发布成功 | INFO | 钉钉/企微 |
| 发布失败 | ERROR | 钉钉/企微 + 短信 |
| 健康检查失败 | WARN | 钉钉/企微 |
| 自动回滚 | WARN | 钉钉/企微 + 短信 |

### 8.2 通知模板

```typescript
/**
 * 发布通知模板
 */
const PUBLISH_TEMPLATES = {
    start: `
## 🚀 发布开始
- **产品**: {{productName}}
- **版本**: {{version}}
- **环境**: {{env}}
- **操作人**: {{operator}}
- **时间**: {{time}}
`,
    success: `
## ✅ 发布成功
- **产品**: {{productName}}
- **版本**: {{version}}
- **环境**: {{env}}
- **服务地址**: {{serviceUrl}}
- **耗时**: {{duration}}
`,
    failed: `
## ❌ 发布失败
- **产品**: {{productName}}
- **版本**: {{version}}
- **环境**: {{env}}
- **失败阶段**: {{stage}}
- **错误信息**: {{error}}
- **操作人**: {{operator}}
`,
    rollback: `
## ⚠️ 自动回滚
- **产品**: {{productName}}
- **原版本**: {{fromVersion}}
- **回滚到**: {{toVersion}}
- **原因**: {{reason}}
`,
};
```

---

## 9. 设计决策

| 决策点 | 选择 | 原因 |
|-------|------|------|
| 构建环境 | 容器化构建 | 隔离环境，可重复构建 |
| 打包方式 | esbuild | 快速打包，单文件输出 |
| 部署目标 | K8s 优先 | 云原生标准，便于扩缩容 |
| 健康检查 | 三级探针 | liveness/readiness/startup |
| 回滚策略 | 自动回滚 | 健康检查失败自动回滚 |
| 版本管理 | 镜像摘要 | 不可变部署，可追溯 |

---

## 10. 相关文档

| 文档 | 说明 |
|-----|------|
| [服务层代码生成](../06-service-gen/overview.md) | 代码生成设计 |
| [存储层快照管理](../01-storage/snapshot-management.md) | 快照机制设计 |
| [组件类型扩展](../01-storage/component-types.md) | 组件类型定义 |
