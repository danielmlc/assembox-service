# 构建流程设计

> **状态**: 设计中
> **更新日期**: 2025-01-24

---

## 目录

1. [概述](#1-概述)
2. [CI/CD 架构](#2-cicd-架构)
3. [构建流水线](#3-构建流水线)
4. [质量门禁](#4-质量门禁)
5. [镜像构建](#5-镜像构建)
6. [构建缓存](#6-构建缓存)
7. [设计决策记录](#7-设计决策记录)

---

## 1. 概述

### 1.1 设计目标

构建流程负责将代码生成器产出的源代码编译、打包为可部署的 Docker 镜像，并推送到镜像仓库。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        构建流程定位                                          │
└─────────────────────────────────────────────────────────────────────────────┘

  代码生成器输出                构建流程                    部署输入
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│                 │       │                 │       │                 │
│  源代码文件      │       │  编译 & 打包    │       │  Docker 镜像    │
│  *.ts, *.vue    │ ────▶ │  测试 & 检查    │ ────▶ │  推送到 Registry│
│  package.json   │       │  镜像构建       │       │                 │
│                 │       │                 │       │                 │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### 1.2 技术选型

| 组件 | 技术 | 说明 |
|-----|------|------|
| **源码托管** | Gitea | 自托管 Git 服务，轻量 |
| **CI/CD 引擎** | Jenkins | 成熟稳定，插件丰富 |
| **镜像仓库** | Harbor | 企业级镜像仓库，支持扫描 |
| **构建工具** | Docker BuildKit | 高效镜像构建，支持缓存 |

### 1.3 核心原则

| 原则 | 说明 |
|-----|------|
| **可重复构建** | 相同代码、相同配置总是产生相同镜像 |
| **快速反馈** | 构建失败尽早发现，减少等待时间 |
| **安全扫描** | 构建过程包含安全检查，阻止高危漏洞 |
| **构建缓存** | 利用缓存加速构建，减少重复工作 |

---

## 2. CI/CD 架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CI/CD 架构                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           发布服务 (Assembox)                                │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     PublishOrchestrator                              │  │
│   └────────────────────────────────┬────────────────────────────────────┘  │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ ① 推送代码
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Gitea                                          │
│                                                                             │
│   ┌──────────────┐                          ┌──────────────────────────┐   │
│   │ 产品代码仓库  │ ─────── Webhook ────────▶ │ 触发 Jenkins 构建        │   │
│   │ /product-xxx │                          │                          │   │
│   └──────────────┘                          └──────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │ ② Webhook 触发
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Jenkins                                        │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      Pipeline Stages                                 │  │
│   │                                                                      │  │
│   │   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌───────┐│  │
│   │   │ Checkout│──▶│  Build  │──▶│  Test   │──▶│  Scan   │──▶│ Push  ││  │
│   │   │         │   │         │   │         │   │         │   │       ││  │
│   │   └─────────┘   └─────────┘   └─────────┘   └─────────┘   └───────┘│  │
│   │                                                                      │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │ ③ 推送镜像
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Harbor                                         │
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │  harbor.example.com/assembox/product-xxx:v1.0.0                      │ │
│   │  harbor.example.com/assembox/product-xxx:latest                      │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │ ④ 通知结果
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           发布服务 (Assembox)                                │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  更新发布状态：BUILDING → DEPLOYED / FAILED                          │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 触发机制

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        构建触发流程                                          │
└─────────────────────────────────────────────────────────────────────────────┘

方式一：发布服务触发（推荐）
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 发布服务    │     │   Gitea     │     │  Webhook    │     │  Jenkins    │
│            │ ──▶ │  git push   │ ──▶ │  触发       │ ──▶ │  构建       │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                   │
                                                                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 发布服务    │ ◀── │ Webhook回调 │ ◀── │  构建完成   │ ◀── │   Harbor    │
│ 更新状态   │     │            │     │            │     │  镜像推送   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘


方式二：API 直接触发
┌─────────────┐                                              ┌─────────────┐
│ 发布服务    │ ──────────── Jenkins API ───────────────────▶ │  Jenkins    │
│            │                                               │  构建       │
└─────────────┘                                              └─────────────┘
```

### 2.3 构建服务接口

```typescript
/**
 * 构建触发服务接口
 */
interface BuildTriggerService {
  /**
   * 触发构建
   */
  triggerBuild(request: BuildRequest): Promise<BuildJob>;

  /**
   * 查询构建状态
   */
  getBuildStatus(jobId: string): Promise<BuildStatus>;

  /**
   * 取消构建
   */
  cancelBuild(jobId: string): Promise<void>;

  /**
   * 获取构建日志
   */
  getBuildLogs(jobId: string): Promise<BuildLogs>;
}

/**
 * 构建请求
 */
interface BuildRequest {
  // 产品信息
  productId: string;
  productCode: string;

  // 版本信息
  versionCode: string;
  releaseId: string;

  // Git 信息
  gitRepoUrl: string;
  gitBranch: string;
  gitCommitId: string;

  // 构建选项
  options: BuildOptions;

  // 回调地址
  callbackUrl: string;
}

interface BuildOptions {
  // 是否跳过测试
  skipTests: boolean;

  // 是否跳过安全扫描
  skipScan: boolean;

  // 目标平台
  platforms: ('linux/amd64' | 'linux/arm64')[];

  // 额外构建参数
  buildArgs: Record<string, string>;
}

/**
 * 构建任务
 */
interface BuildJob {
  // 任务ID
  jobId: string;

  // Jenkins 构建号
  buildNumber: number;

  // 构建 URL
  buildUrl: string;

  // 状态
  status: BuildJobStatus;

  // 创建时间
  createdAt: Date;
}

type BuildJobStatus =
  | 'queued'      // 排队中
  | 'running'     // 执行中
  | 'success'     // 成功
  | 'failure'     // 失败
  | 'cancelled';  // 已取消

/**
 * 构建回调
 */
interface BuildCallback {
  // 任务ID
  jobId: string;

  // 发布ID
  releaseId: string;

  // 构建结果
  result: 'success' | 'failure';

  // 镜像信息（成功时）
  images?: DockerImage[];

  // 错误信息（失败时）
  error?: BuildError;

  // 构建耗时
  duration: number;
}

interface DockerImage {
  // 镜像地址
  repository: string;

  // 镜像标签
  tag: string;

  // 镜像 digest
  digest: string;

  // 镜像大小
  size: number;
}
```

---

## 3. 构建流水线

### 3.1 Pipeline 定义

```groovy
// Jenkinsfile

pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: node
    image: node:18-alpine
    command: ['cat']
    tty: true
  - name: docker
    image: docker:24-dind
    securityContext:
      privileged: true
    volumeMounts:
    - name: docker-socket
      mountPath: /var/run/docker.sock
  volumes:
  - name: docker-socket
    hostPath:
      path: /var/run/docker.sock
'''
        }
    }

    environment {
        HARBOR_REGISTRY = 'harbor.example.com'
        HARBOR_PROJECT = 'assembox'
        HARBOR_CREDENTIALS = credentials('harbor-credentials')
        PRODUCT_CODE = "${params.PRODUCT_CODE}"
        VERSION_CODE = "${params.VERSION_CODE}"
        CALLBACK_URL = "${params.CALLBACK_URL}"
    }

    parameters {
        string(name: 'PRODUCT_CODE', description: '产品代码')
        string(name: 'VERSION_CODE', description: '版本号')
        string(name: 'RELEASE_ID', description: '发布ID')
        string(name: 'CALLBACK_URL', description: '回调地址')
        booleanParam(name: 'SKIP_TESTS', defaultValue: false, description: '跳过测试')
        booleanParam(name: 'SKIP_SCAN', defaultValue: false, description: '跳过安全扫描')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                }
            }
        }

        stage('Install Dependencies') {
            parallel {
                stage('Backend Dependencies') {
                    steps {
                        container('node') {
                            dir('backend') {
                                sh 'npm ci'
                            }
                        }
                    }
                }
                stage('Frontend Dependencies') {
                    steps {
                        container('node') {
                            dir('frontend') {
                                sh 'npm ci'
                            }
                        }
                    }
                }
            }
        }

        stage('Build') {
            parallel {
                stage('Build Backend') {
                    steps {
                        container('node') {
                            dir('backend') {
                                sh 'npm run build'
                            }
                        }
                    }
                }
                stage('Build Frontend') {
                    steps {
                        container('node') {
                            dir('frontend') {
                                sh 'npm run build'
                            }
                        }
                    }
                }
            }
        }

        stage('Test') {
            when {
                expression { !params.SKIP_TESTS }
            }
            parallel {
                stage('Backend Tests') {
                    steps {
                        container('node') {
                            dir('backend') {
                                sh 'npm run test:cov'
                            }
                        }
                    }
                    post {
                        always {
                            publishHTML([
                                reportDir: 'backend/coverage/lcov-report',
                                reportFiles: 'index.html',
                                reportName: 'Backend Coverage Report'
                            ])
                        }
                    }
                }
                stage('Frontend Tests') {
                    steps {
                        container('node') {
                            dir('frontend') {
                                sh 'npm run test:unit'
                            }
                        }
                    }
                }
            }
        }

        stage('Code Quality') {
            parallel {
                stage('ESLint') {
                    steps {
                        container('node') {
                            sh 'npm run lint'
                        }
                    }
                }
                stage('TypeCheck') {
                    steps {
                        container('node') {
                            sh 'npm run typecheck'
                        }
                    }
                }
            }
        }

        stage('Build Docker Images') {
            steps {
                container('docker') {
                    script {
                        def backendImage = "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${PRODUCT_CODE}-backend:${VERSION_CODE}"
                        def frontendImage = "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${PRODUCT_CODE}-frontend:${VERSION_CODE}"

                        // 构建后端镜像
                        sh """
                            docker build \
                                -t ${backendImage} \
                                -t ${backendImage}-${GIT_COMMIT_SHORT} \
                                -f backend/Dockerfile \
                                --build-arg VERSION=${VERSION_CODE} \
                                ./backend
                        """

                        // 构建前端镜像
                        sh """
                            docker build \
                                -t ${frontendImage} \
                                -t ${frontendImage}-${GIT_COMMIT_SHORT} \
                                -f frontend/Dockerfile \
                                --build-arg VERSION=${VERSION_CODE} \
                                ./frontend
                        """

                        env.BACKEND_IMAGE = backendImage
                        env.FRONTEND_IMAGE = frontendImage
                    }
                }
            }
        }

        stage('Security Scan') {
            when {
                expression { !params.SKIP_SCAN }
            }
            steps {
                container('docker') {
                    script {
                        // 使用 Trivy 进行安全扫描
                        sh """
                            docker run --rm \
                                -v /var/run/docker.sock:/var/run/docker.sock \
                                aquasec/trivy:latest image \
                                --exit-code 1 \
                                --severity HIGH,CRITICAL \
                                ${env.BACKEND_IMAGE}
                        """
                        sh """
                            docker run --rm \
                                -v /var/run/docker.sock:/var/run/docker.sock \
                                aquasec/trivy:latest image \
                                --exit-code 1 \
                                --severity HIGH,CRITICAL \
                                ${env.FRONTEND_IMAGE}
                        """
                    }
                }
            }
        }

        stage('Push Images') {
            steps {
                container('docker') {
                    script {
                        // 登录 Harbor
                        sh """
                            echo ${HARBOR_CREDENTIALS_PSW} | docker login ${HARBOR_REGISTRY} \
                                -u ${HARBOR_CREDENTIALS_USR} --password-stdin
                        """

                        // 推送镜像
                        sh "docker push ${env.BACKEND_IMAGE}"
                        sh "docker push ${env.BACKEND_IMAGE}-${GIT_COMMIT_SHORT}"
                        sh "docker push ${env.FRONTEND_IMAGE}"
                        sh "docker push ${env.FRONTEND_IMAGE}-${GIT_COMMIT_SHORT}"
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                // 回调通知 Assembox
                def callbackPayload = [
                    jobId: env.BUILD_NUMBER,
                    releaseId: params.RELEASE_ID,
                    result: currentBuild.currentResult == 'SUCCESS' ? 'success' : 'failure',
                    images: currentBuild.currentResult == 'SUCCESS' ? [
                        [repository: env.BACKEND_IMAGE, tag: params.VERSION_CODE],
                        [repository: env.FRONTEND_IMAGE, tag: params.VERSION_CODE]
                    ] : null,
                    duration: currentBuild.duration
                ]

                httpRequest(
                    url: params.CALLBACK_URL,
                    httpMode: 'POST',
                    contentType: 'APPLICATION_JSON',
                    requestBody: groovy.json.JsonOutput.toJson(callbackPayload)
                )
            }
        }
        success {
            echo 'Build succeeded!'
        }
        failure {
            echo 'Build failed!'
        }
        cleanup {
            cleanWs()
        }
    }
}
```

### 3.2 构建阶段说明

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        构建阶段流程                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Stage 1: Checkout                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ - 拉取源代码                                                          │  │
│  │ - 获取 Git commit ID                                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Stage 2: Install Dependencies (并行)                                       │
│  ┌─────────────────────────┐     ┌─────────────────────────┐              │
│  │ Backend: npm ci         │     │ Frontend: npm ci        │              │
│  └─────────────────────────┘     └─────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Stage 3: Build (并行)                                                      │
│  ┌─────────────────────────┐     ┌─────────────────────────┐              │
│  │ Backend: npm run build  │     │ Frontend: npm run build │              │
│  │ 输出: dist/             │     │ 输出: dist/             │              │
│  └─────────────────────────┘     └─────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Stage 4: Test (可跳过，并行)                                                │
│  ┌─────────────────────────┐     ┌─────────────────────────┐              │
│  │ Backend: npm run test   │     │ Frontend: npm run test  │              │
│  │ 覆盖率报告               │     │ 单元测试                │              │
│  └─────────────────────────┘     └─────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Stage 5: Code Quality (并行)                                               │
│  ┌─────────────────────────┐     ┌─────────────────────────┐              │
│  │ ESLint 检查             │     │ TypeScript 类型检查     │              │
│  └─────────────────────────┘     └─────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Stage 6: Build Docker Images                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ - 构建后端镜像: product-xxx-backend:v1.0.0                            │  │
│  │ - 构建前端镜像: product-xxx-frontend:v1.0.0                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Stage 7: Security Scan (可跳过)                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ - Trivy 漏洞扫描                                                      │  │
│  │ - 阻止 HIGH/CRITICAL 漏洞                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Stage 8: Push Images                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ - 推送到 Harbor 镜像仓库                                               │  │
│  │ - 带版本号标签和 commit 标签                                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Post: Callback                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ - 通知 Assembox 构建结果                                               │  │
│  │ - 更新发布状态                                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 质量门禁

### 4.1 门禁规则

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        质量门禁规则                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  门禁类型           │ 规则                    │ 失败处理                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  编译检查           │ TypeScript 无编译错误   │ 阻断构建                     │
│  类型检查           │ 无类型错误              │ 阻断构建                     │
│  代码规范           │ ESLint 无 error         │ 阻断构建                     │
│  单元测试           │ 所有测试通过            │ 阻断构建                     │
│  测试覆盖率         │ 覆盖率 >= 60%           │ 警告（可配置阻断）           │
│  安全扫描           │ 无 HIGH/CRITICAL 漏洞   │ 阻断构建                     │
│  镜像大小           │ 后端 < 500MB            │ 警告                         │
│                    │ 前端 < 100MB            │                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 门禁配置

```typescript
/**
 * 质量门禁配置
 */
interface QualityGateConfig {
  // 编译检查
  compilation: {
    enabled: true;
    blocking: true;
  };

  // 代码规范
  linting: {
    enabled: true;
    blocking: true;
    maxWarnings: 50;  // 最多允许 50 个警告
  };

  // 单元测试
  unitTests: {
    enabled: true;
    blocking: true;
    coverageThreshold: {
      statements: 60;
      branches: 50;
      functions: 60;
      lines: 60;
    };
    blockOnCoverageFailure: false;  // 覆盖率不达标是否阻断
  };

  // 安全扫描
  securityScan: {
    enabled: true;
    blocking: true;
    severityThreshold: 'HIGH';  // HIGH 及以上阻断
    ignoreUnfixed: true;        // 忽略无修复方案的漏洞
  };

  // 镜像大小
  imageSize: {
    enabled: true;
    blocking: false;
    limits: {
      backend: 500 * 1024 * 1024;   // 500MB
      frontend: 100 * 1024 * 1024;  // 100MB
    };
  };
}
```

### 4.3 安全扫描详情

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        安全扫描流程                                          │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   Docker 镜像       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Trivy 扫描       │
                    │  - OS 包漏洞        │
                    │  - 应用依赖漏洞      │
                    │  - 配置问题          │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
       │  CRITICAL   │  │    HIGH     │  │   MEDIUM    │
       │  严重漏洞    │  │  高危漏洞   │  │   中危漏洞   │
       └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
              │                │                │
              │                │                │
              ▼                ▼                ▼
       ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
       │  阻断构建    │  │  阻断构建   │  │  记录警告   │
       │  必须修复    │  │  必须修复   │  │  建议修复   │
       └─────────────┘  └─────────────┘  └─────────────┘
```

---

## 5. 镜像构建

### 5.1 后端 Dockerfile

```dockerfile
# backend/Dockerfile

# ==================== 构建阶段 ====================
FROM node:18-alpine AS builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 复制依赖文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies）
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN npm run build

# 只安装生产依赖
RUN npm ci --only=production

# ==================== 生产阶段 ====================
FROM node:18-alpine AS runner

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# 只复制必要的文件
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

# 切换到非 root 用户
USER nestjs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# 启动命令
CMD ["node", "dist/main.js"]
```

### 5.2 前端 Dockerfile

```dockerfile
# frontend/Dockerfile

# ==================== 构建阶段 ====================
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建
ARG VERSION=latest
ENV VITE_APP_VERSION=${VERSION}
RUN npm run build

# ==================== 生产阶段 ====================
FROM nginx:alpine AS runner

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 创建非 root 用户
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# 切换到非 root 用户
USER nginx

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# 启动命令
CMD ["nginx", "-g", "daemon off;"]
```

### 5.3 前端 Nginx 配置

```nginx
# frontend/nginx.conf

worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    keepalive_timeout 65;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript
               application/xml application/xml+rss text/javascript;

    server {
        listen 80;
        server_name localhost;
        root /usr/share/nginx/html;
        index index.html;

        # 健康检查端点
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # 静态资源缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # API 代理（如果需要）
        location /api {
            proxy_pass http://backend:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        # SPA 路由 - 所有路由返回 index.html
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

### 5.4 镜像标签策略

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        镜像标签策略                                          │
└─────────────────────────────────────────────────────────────────────────────┘

镜像命名: harbor.example.com/assembox/{product-code}-{service}:{tag}

示例:
  harbor.example.com/assembox/order-system-backend:v1.2.0
  harbor.example.com/assembox/order-system-frontend:v1.2.0

标签类型:
┌──────────────────┬───────────────────┬────────────────────────────────────┐
│ 标签类型          │ 格式              │ 说明                               │
├──────────────────┼───────────────────┼────────────────────────────────────┤
│ 版本号标签        │ v1.2.0            │ 语义化版本号，生产环境使用          │
│ Commit 标签       │ v1.2.0-abc1234    │ 版本号 + commit，便于追溯           │
│ Latest 标签       │ latest            │ 最新构建版本，仅开发环境使用        │
│ 分支标签          │ main, develop     │ 分支名，CI 自动构建使用            │
└──────────────────┴───────────────────┴────────────────────────────────────┘

保留策略:
- 保留最近 10 个版本号标签
- 保留最近 20 个 commit 标签
- latest 标签始终保留
- 分支标签保留最近 5 个
```

---

## 6. 构建缓存

### 6.1 NPM 缓存

```yaml
# Jenkins Pipeline 中的 NPM 缓存配置
pipeline {
    agent {
        kubernetes {
            yaml '''
spec:
  containers:
  - name: node
    image: node:18-alpine
    volumeMounts:
    - name: npm-cache
      mountPath: /root/.npm
  volumes:
  - name: npm-cache
    persistentVolumeClaim:
      claimName: jenkins-npm-cache
'''
        }
    }
}
```

### 6.2 Docker Layer 缓存

```dockerfile
# 利用 Docker 构建缓存的最佳实践

# 1. 先复制依赖文件，再复制源代码
COPY package*.json ./
RUN npm ci
COPY . .

# 2. 使用 BuildKit 缓存挂载
# syntax=docker/dockerfile:1.4
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# 3. 多阶段构建，减少最终镜像大小
FROM node:18-alpine AS builder
# ... 构建 ...

FROM node:18-alpine AS runner
# 只复制必要文件
```

### 6.3 缓存效果统计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        缓存效果对比                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────┬────────────────┬────────────────┬────────────────────┐
│ 场景               │ 无缓存          │ 有缓存          │ 节省时间            │
├────────────────────┼────────────────┼────────────────┼────────────────────┤
│ npm install        │ ~2分钟         │ ~10秒          │ ~90%               │
│ TypeScript 编译    │ ~1分钟         │ ~20秒          │ ~66%               │
│ Docker 构建        │ ~3分钟         │ ~30秒          │ ~83%               │
│ 总构建时间         │ ~8分钟         │ ~2分钟         │ ~75%               │
└────────────────────┴────────────────┴────────────────┴────────────────────┘
```

---

## 7. 设计决策记录

| 问题 | 决策 | 说明 |
|-----|------|------|
| CI/CD 引擎 | Jenkins | 成熟稳定，插件生态丰富 |
| 触发机制 | Webhook | 解耦设计，标准方式 |
| 镜像仓库 | Harbor | 企业级功能，支持安全扫描 |
| 安全扫描工具 | Trivy | 开源免费，扫描速度快 |
| 构建环境 | Kubernetes Pod | 动态扩缩容，资源隔离 |
| 质量门禁 | 编译+测试+扫描 | 多维度保障代码质量 |
| 缓存策略 | npm + Docker layer | 显著提升构建速度 |

---
