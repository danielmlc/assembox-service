# 部署方案设计

> **状态**: 设计中
> **更新日期**: 2025-01-24

---

## 目录

1. [概述](#1-概述)
2. [部署架构](#2-部署架构)
3. [Kubernetes 资源配置](#3-kubernetes-资源配置)
4. [发布策略](#4-发布策略)
5. [服务发现与负载均衡](#5-服务发现与负载均衡)
6. [监控与告警](#6-监控与告警)
7. [设计决策记录](#7-设计决策记录)

---

## 1. 概述

### 1.1 设计目标

部署方案负责将构建产物（Docker 镜像）部署到 Kubernetes 集群，实现应用的高可用运行、弹性伸缩和灰度发布。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        部署流程定位                                          │
└─────────────────────────────────────────────────────────────────────────────┘

  构建产物                    部署流程                    运行环境
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│                 │       │                 │       │                 │
│  Docker 镜像    │       │  K8s 编排       │       │  运行中的 Pod   │
│  Harbor 存储    │ ────▶ │  发布策略       │ ────▶ │  Service 暴露   │
│                 │       │  健康检查       │       │  Ingress 路由   │
│                 │       │                 │       │                 │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### 1.2 核心能力

| 能力 | 说明 |
|-----|------|
| **高可用部署** | 多副本、跨可用区部署，无单点故障 |
| **滚动更新** | 零停机发布，逐步替换旧版本 |
| **灰度发布** | 按比例分配流量，验证新版本 |
| **快速回滚** | 一键回滚到任意历史版本 |
| **弹性伸缩** | 根据负载自动调整副本数 |
| **健康检查** | 自动剔除异常实例，保障服务可用性 |

### 1.3 技术选型

| 组件 | 技术 | 说明 |
|-----|------|------|
| **容器编排** | Kubernetes | 业界标准，功能完善 |
| **流量管理** | Istio | 服务网格，支持灰度发布 |
| **Ingress** | Nginx Ingress | 成熟稳定，配置简单 |
| **监控** | Prometheus + Grafana | 开源标准，生态丰富 |
| **日志** | ELK Stack | 日志收集与分析 |
| **告警** | AlertManager | 与 Prometheus 深度集成 |

---

## 2. 部署架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Kubernetes 部署架构                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                               ┌─────────────────┐
                               │   用户请求       │
                               └────────┬────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Ingress Controller                                 │
│                        (Nginx Ingress / Istio Gateway)                      │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  product-a      │         │  product-b      │         │  product-c      │
│  Namespace      │         │  Namespace      │         │  Namespace      │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│                 │         │                 │         │                 │
│ ┌─────────────┐ │         │ ┌─────────────┐ │         │ ┌─────────────┐ │
│ │  Frontend   │ │         │ │  Frontend   │ │         │ │  Frontend   │ │
│ │  Service    │ │         │ │  Service    │ │         │ │  Service    │ │
│ │  (Nginx)    │ │         │ │  (Nginx)    │ │         │ │  (Nginx)    │ │
│ └──────┬──────┘ │         │ └──────┬──────┘ │         │ └──────┬──────┘ │
│        │        │         │        │        │         │        │        │
│ ┌──────┴──────┐ │         │ ┌──────┴──────┐ │         │ ┌──────┴──────┐ │
│ │  Backend    │ │         │ │  Backend    │ │         │ │  Backend    │ │
│ │  Service    │ │         │ │  Service    │ │         │ │  Service    │ │
│ │  (NestJS)   │ │         │ │  (NestJS)   │ │         │ │  (NestJS)   │ │
│ └─────────────┘ │         │ └─────────────┘ │         │ └─────────────┘ │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           共享基础设施                                       │
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│   │   TiDB      │    │   Redis     │    │   MinIO     │    │ Prometheus  │ │
│   │   数据库    │    │   缓存      │    │   对象存储   │    │   监控      │ │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 产品部署单元

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        单个产品部署结构                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Namespace: product-xxx
│
├── Deployments
│   ├── product-xxx-backend
│   │   └── Pods (replicas: 2-5)
│   │       ├── Container: backend (NestJS)
│   │       └── Container: istio-proxy (Sidecar)
│   │
│   └── product-xxx-frontend
│       └── Pods (replicas: 2-3)
│           ├── Container: frontend (Nginx)
│           └── Container: istio-proxy (Sidecar)
│
├── Services
│   ├── product-xxx-backend-svc (ClusterIP)
│   └── product-xxx-frontend-svc (ClusterIP)
│
├── HorizontalPodAutoscaler
│   ├── product-xxx-backend-hpa
│   └── product-xxx-frontend-hpa
│
├── ConfigMaps
│   ├── product-xxx-backend-config
│   └── product-xxx-frontend-config
│
├── Secrets
│   └── product-xxx-secrets (DB 密码等)
│
└── Ingress / VirtualService
    └── product-xxx-ingress
```

---

## 3. Kubernetes 资源配置

### 3.1 Deployment 配置

```yaml
# backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.productCode }}-backend
  namespace: {{ .Values.productCode }}
  labels:
    app: {{ .Values.productCode }}-backend
    version: {{ .Values.version }}
spec:
  replicas: {{ .Values.backend.replicas }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: {{ .Values.productCode }}-backend
  template:
    metadata:
      labels:
        app: {{ .Values.productCode }}-backend
        version: {{ .Values.version }}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      # 反亲和性：避免同一节点运行多个 Pod
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: {{ .Values.productCode }}-backend
              topologyKey: kubernetes.io/hostname

      containers:
      - name: backend
        image: {{ .Values.harbor.registry }}/{{ .Values.harbor.project }}/{{ .Values.productCode }}-backend:{{ .Values.version }}
        imagePullPolicy: Always

        ports:
        - containerPort: 3000
          name: http

        # 环境变量
        env:
        - name: NODE_ENV
          value: production
        - name: PORT
          value: "3000"
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: {{ .Values.productCode }}-backend-config
              key: db_host
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: {{ .Values.productCode }}-secrets
              key: db_password

        # 资源限制
        resources:
          requests:
            cpu: {{ .Values.backend.resources.requests.cpu }}
            memory: {{ .Values.backend.resources.requests.memory }}
          limits:
            cpu: {{ .Values.backend.resources.limits.cpu }}
            memory: {{ .Values.backend.resources.limits.memory }}

        # 存活探针
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3

        # 就绪探针
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3

        # 启动探针（慢启动应用）
        startupProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 30

      # 优雅终止
      terminationGracePeriodSeconds: 30

      # 镜像拉取凭证
      imagePullSecrets:
      - name: harbor-credentials
```

### 3.2 Service 配置

```yaml
# backend-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Values.productCode }}-backend-svc
  namespace: {{ .Values.productCode }}
  labels:
    app: {{ .Values.productCode }}-backend
spec:
  type: ClusterIP
  ports:
  - name: http
    port: 80
    targetPort: 3000
    protocol: TCP
  selector:
    app: {{ .Values.productCode }}-backend
```

### 3.3 HPA 配置

```yaml
# backend-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ .Values.productCode }}-backend-hpa
  namespace: {{ .Values.productCode }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ .Values.productCode }}-backend
  minReplicas: {{ .Values.backend.hpa.minReplicas }}
  maxReplicas: {{ .Values.backend.hpa.maxReplicas }}
  metrics:
  # CPU 使用率
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  # 内存使用率
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 4
        periodSeconds: 15
      selectPolicy: Max
```

### 3.4 Ingress 配置

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Values.productCode }}-ingress
  namespace: {{ .Values.productCode }}
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - {{ .Values.productCode }}.{{ .Values.domain }}
    secretName: {{ .Values.productCode }}-tls
  rules:
  - host: {{ .Values.productCode }}.{{ .Values.domain }}
    http:
      paths:
      # API 路由到后端
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: {{ .Values.productCode }}-backend-svc
            port:
              number: 80
      # 其他路由到前端
      - path: /
        pathType: Prefix
        backend:
          service:
            name: {{ .Values.productCode }}-frontend-svc
            port:
              number: 80
```

### 3.5 ConfigMap 配置

```yaml
# backend-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Values.productCode }}-backend-config
  namespace: {{ .Values.productCode }}
data:
  db_host: {{ .Values.database.host }}
  db_port: "{{ .Values.database.port }}"
  db_name: {{ .Values.database.name }}
  redis_host: {{ .Values.redis.host }}
  redis_port: "{{ .Values.redis.port }}"
  log_level: {{ .Values.logLevel }}
```

### 3.6 Helm Values 模板

```yaml
# values.yaml
productCode: order-system
version: v1.0.0
domain: assembox.example.com

harbor:
  registry: harbor.example.com
  project: assembox

backend:
  replicas: 2
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
  hpa:
    minReplicas: 2
    maxReplicas: 10

frontend:
  replicas: 2
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi
  hpa:
    minReplicas: 2
    maxReplicas: 5

database:
  host: tidb.database.svc.cluster.local
  port: 4000
  name: product_order_system

redis:
  host: redis.cache.svc.cluster.local
  port: 6379

logLevel: info
```

---

## 4. 发布策略

### 4.1 滚动更新（默认策略）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        滚动更新流程                                          │
└─────────────────────────────────────────────────────────────────────────────┘

初始状态（3 个 v1 Pod）:
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Pod-1     │  │   Pod-2     │  │   Pod-3     │
│   v1.0.0    │  │   v1.0.0    │  │   v1.0.0    │
│   Ready ✓   │  │   Ready ✓   │  │   Ready ✓   │
└─────────────┘  └─────────────┘  └─────────────┘
      ↑                ↑                ↑
      └────────────────┼────────────────┘
                       │
                 ┌─────────────┐
                 │   Service   │
                 └─────────────┘

步骤 1：创建新 Pod
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Pod-1     │  │   Pod-2     │  │   Pod-3     │  │   Pod-4     │
│   v1.0.0    │  │   v1.0.0    │  │   v1.0.0    │  │   v1.1.0    │
│   Ready ✓   │  │   Ready ✓   │  │   Ready ✓   │  │ Starting... │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

步骤 2：新 Pod 就绪，终止旧 Pod
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Pod-1     │  │   Pod-2     │  │   Pod-3     │  │   Pod-4     │
│   v1.0.0    │  │   v1.0.0    │  │   v1.0.0    │  │   v1.1.0    │
│ Terminating │  │   Ready ✓   │  │   Ready ✓   │  │   Ready ✓   │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

步骤 3-4：继续替换...

最终状态（3 个 v1.1.0 Pod）:
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Pod-4     │  │   Pod-5     │  │   Pod-6     │
│   v1.1.0    │  │   v1.1.0    │  │   v1.1.0    │
│   Ready ✓   │  │   Ready ✓   │  │   Ready ✓   │
└─────────────┘  └─────────────┘  └─────────────┘

特点：
- maxSurge: 1      → 最多多出 1 个 Pod
- maxUnavailable: 0 → 至少保持 3 个可用
- 零停机发布
```

### 4.2 灰度发布（Istio）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        灰度发布流程                                          │
└─────────────────────────────────────────────────────────────────────────────┘

阶段 1：10% 流量到新版本
                              ┌─────────────────┐
                              │   用户请求       │
                              └────────┬────────┘
                                       │
                              ┌────────┴────────┐
                              │ Istio Gateway   │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │        VirtualService               │
                    │  weight: v1=90%, v2=10%             │
                    └──────────────────┬──────────────────┘
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 │                                           │
          90% ───┤                                    10% ───┤
                 ▼                                           ▼
        ┌─────────────────┐                        ┌─────────────────┐
        │ Subset: stable  │                        │ Subset: canary  │
        │ version: v1.0.0 │                        │ version: v1.1.0 │
        │ replicas: 3     │                        │ replicas: 1     │
        └─────────────────┘                        └─────────────────┘

阶段 2：观察指标，逐步增加流量
  - 10% → 30% → 50% → 80% → 100%
  - 每个阶段观察错误率、延迟、成功率

阶段 3：全量发布，清理旧版本
        ┌─────────────────┐
        │ Subset: stable  │
        │ version: v1.1.0 │
        │ replicas: 3     │
        └─────────────────┘
```

### 4.3 Istio 灰度配置

```yaml
# destination-rule.yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: {{ .Values.productCode }}-backend
  namespace: {{ .Values.productCode }}
spec:
  host: {{ .Values.productCode }}-backend-svc
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: UPGRADE
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
  subsets:
  - name: stable
    labels:
      version: {{ .Values.stableVersion }}
  - name: canary
    labels:
      version: {{ .Values.canaryVersion }}
```

```yaml
# virtual-service.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: {{ .Values.productCode }}-backend
  namespace: {{ .Values.productCode }}
spec:
  hosts:
  - {{ .Values.productCode }}-backend-svc
  http:
  - match:
    - headers:
        x-canary:
          exact: "true"
    route:
    - destination:
        host: {{ .Values.productCode }}-backend-svc
        subset: canary
      weight: 100
  - route:
    - destination:
        host: {{ .Values.productCode }}-backend-svc
        subset: stable
      weight: {{ .Values.stableWeight }}
    - destination:
        host: {{ .Values.productCode }}-backend-svc
        subset: canary
      weight: {{ .Values.canaryWeight }}
```

### 4.4 自动灰度规则

```typescript
/**
 * 灰度发布配置
 */
interface CanaryConfig {
  // 是否启用灰度
  enabled: boolean;

  // 灰度步骤
  steps: CanaryStep[];

  // 分析配置
  analysis: CanaryAnalysis;
}

interface CanaryStep {
  // 灰度比例
  weight: number;

  // 暂停时间（分钟）
  pauseDuration: number;
}

interface CanaryAnalysis {
  // 分析间隔
  interval: string;  // "1m"

  // 成功阈值
  successThreshold: number;

  // 失败阈值
  failureThreshold: number;

  // 分析指标
  metrics: CanaryMetric[];
}

interface CanaryMetric {
  // 指标名称
  name: string;

  // 阈值
  threshold: number;

  // 比较操作符
  operator: '<' | '>' | '<=' | '>=' | '=';

  // PromQL 查询
  query: string;
}

/**
 * 默认灰度配置
 */
const defaultCanaryConfig: CanaryConfig = {
  enabled: true,
  steps: [
    { weight: 10, pauseDuration: 5 },
    { weight: 30, pauseDuration: 10 },
    { weight: 50, pauseDuration: 15 },
    { weight: 80, pauseDuration: 10 },
    { weight: 100, pauseDuration: 0 },
  ],
  analysis: {
    interval: '1m',
    successThreshold: 3,
    failureThreshold: 2,
    metrics: [
      {
        name: 'error-rate',
        threshold: 5,
        operator: '<',
        query: 'sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m])) * 100',
      },
      {
        name: 'latency-p99',
        threshold: 500,
        operator: '<',
        query: 'histogram_quantile(0.99, sum(rate(http_request_duration_ms_bucket[1m])) by (le))',
      },
    ],
  },
};
```

### 4.5 回滚操作

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        回滚方式                                              │
└─────────────────────────────────────────────────────────────────────────────┘

方式一：Kubernetes 原生回滚（推荐）
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  kubectl rollout undo deployment/product-xxx-backend -n product-xxx      │
│                                                                          │
│  特点：                                                                   │
│  - 立即回滚到上一个版本                                                    │
│  - 使用之前的 ReplicaSet                                                  │
│  - 秒级完成                                                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

方式二：指定版本回滚
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  # 查看历史版本                                                           │
│  kubectl rollout history deployment/product-xxx-backend -n product-xxx   │
│                                                                          │
│  # 回滚到指定版本                                                         │
│  kubectl rollout undo deployment/product-xxx-backend -n product-xxx \    │
│    --to-revision=2                                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

方式三：重新部署历史镜像
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  # 通过 Assembox 发布服务                                                 │
│  POST /api/releases/{releaseId}/rollback                                 │
│  {                                                                       │
│    "targetVersion": "v1.0.0",                                            │
│    "strategy": "quick"                                                   │
│  }                                                                       │
│                                                                          │
│  特点：                                                                   │
│  - 可回滚到任意历史版本                                                    │
│  - 有完整的审计记录                                                       │
│  - 支持回滚前确认                                                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 服务发现与负载均衡

### 5.1 服务发现

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Kubernetes 服务发现                                   │
└─────────────────────────────────────────────────────────────────────────────┘

DNS 解析:
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Service Name: product-xxx-backend-svc                                   │
│                                                                          │
│  DNS 记录:                                                                │
│  - 短名: product-xxx-backend-svc                                         │
│  - 完整: product-xxx-backend-svc.product-xxx.svc.cluster.local          │
│                                                                          │
│  解析示例:                                                                │
│  frontend → product-xxx-backend-svc:80                                   │
│          → 10.96.xx.xx (ClusterIP)                                       │
│          → Pod 1, Pod 2, Pod 3 (负载均衡)                                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 负载均衡策略

```yaml
# Istio 负载均衡配置
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: {{ .Values.productCode }}-backend
spec:
  host: {{ .Values.productCode }}-backend-svc
  trafficPolicy:
    loadBalancer:
      simple: ROUND_ROBIN  # 轮询（默认）
      # 其他选项:
      # - LEAST_CONN: 最少连接
      # - RANDOM: 随机
      # - PASSTHROUGH: 直通
    connectionPool:
      tcp:
        maxConnections: 100
        connectTimeout: 30s
      http:
        h2UpgradePolicy: UPGRADE
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
        maxRequestsPerConnection: 100
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
```

---

## 6. 监控与告警

### 6.1 监控架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        监控架构                                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────────┐
                    │                     Grafana                          │
                    │                     可视化面板                        │
                    └────────────────────────┬────────────────────────────┘
                                             │
                    ┌────────────────────────┴────────────────────────────┐
                    │                                                      │
                    ▼                                                      ▼
         ┌─────────────────────┐                            ┌─────────────────────┐
         │     Prometheus      │                            │    AlertManager     │
         │     指标收集         │ ─────── 告警规则 ────────▶ │     告警管理         │
         └──────────┬──────────┘                            └──────────┬──────────┘
                    │                                                  │
                    │ scrape                                           │ 通知
                    │                                                  │
         ┌──────────┴──────────┐                            ┌──────────┴──────────┐
         │                     │                            │                     │
         ▼                     ▼                            ▼                     ▼
┌─────────────────┐   ┌─────────────────┐          ┌─────────────┐   ┌─────────────┐
│  Pod Metrics    │   │ Service Mesh    │          │   钉钉      │   │   邮件      │
│  /metrics       │   │ Istio Telemetry │          │             │   │             │
└─────────────────┘   └─────────────────┘          └─────────────┘   └─────────────┘
```

### 6.2 核心监控指标

```yaml
# 应用层指标
- name: http_requests_total
  type: counter
  labels: [method, path, status]
  description: HTTP 请求总数

- name: http_request_duration_ms
  type: histogram
  labels: [method, path]
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
  description: HTTP 请求延迟分布

- name: http_request_size_bytes
  type: histogram
  description: HTTP 请求体大小

- name: http_response_size_bytes
  type: histogram
  description: HTTP 响应体大小

# 业务指标
- name: business_orders_created_total
  type: counter
  description: 创建订单数

- name: business_active_users
  type: gauge
  description: 活跃用户数

# 系统指标（自动采集）
- name: process_cpu_usage
  type: gauge
  description: CPU 使用率

- name: process_resident_memory_bytes
  type: gauge
  description: 内存使用量

- name: nodejs_active_handles
  type: gauge
  description: Node.js 活跃句柄数
```

### 6.3 告警规则

```yaml
# prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: product-alerts
  namespace: monitoring
spec:
  groups:
  - name: product-availability
    rules:
    # 服务不可用告警
    - alert: ServiceDown
      expr: up{job=~"product-.*"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "服务不可用: {{ $labels.job }}"
        description: "服务 {{ $labels.job }} 已离线超过 1 分钟"

    # 高错误率告警
    - alert: HighErrorRate
      expr: |
        sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
        / sum(rate(http_requests_total[5m])) by (job) > 0.05
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "高错误率: {{ $labels.job }}"
        description: "服务 {{ $labels.job }} 5xx 错误率超过 5%"

    # 高延迟告警
    - alert: HighLatency
      expr: |
        histogram_quantile(0.99, sum(rate(http_request_duration_ms_bucket[5m])) by (le, job)) > 1000
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "高延迟: {{ $labels.job }}"
        description: "服务 {{ $labels.job }} P99 延迟超过 1 秒"

  - name: product-resources
    rules:
    # CPU 使用率过高
    - alert: HighCPUUsage
      expr: |
        sum(rate(container_cpu_usage_seconds_total{namespace=~"product-.*"}[5m])) by (pod)
        / sum(kube_pod_container_resource_limits{resource="cpu", namespace=~"product-.*"}) by (pod) > 0.9
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "CPU 使用率过高: {{ $labels.pod }}"
        description: "Pod {{ $labels.pod }} CPU 使用率超过 90%"

    # 内存使用率过高
    - alert: HighMemoryUsage
      expr: |
        sum(container_memory_working_set_bytes{namespace=~"product-.*"}) by (pod)
        / sum(kube_pod_container_resource_limits{resource="memory", namespace=~"product-.*"}) by (pod) > 0.9
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "内存使用率过高: {{ $labels.pod }}"
        description: "Pod {{ $labels.pod }} 内存使用率超过 90%"

    # Pod 重启过多
    - alert: PodRestartingTooMuch
      expr: |
        increase(kube_pod_container_status_restarts_total{namespace=~"product-.*"}[1h]) > 5
      labels:
        severity: warning
      annotations:
        summary: "Pod 频繁重启: {{ $labels.pod }}"
        description: "Pod {{ $labels.pod }} 在过去 1 小时内重启超过 5 次"
```

### 6.4 Grafana 仪表盘

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        产品监控仪表盘                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐      │
│  │    请求速率        │  │    错误率         │  │    P99 延迟       │      │
│  │   ▄▄▄▄▄▄▄▄▄▄      │  │   ─────────       │  │   ▄▄▄▄▄▄▄▄▄▄      │      │
│  │   1.2K req/s      │  │   0.5%            │  │   235ms          │      │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      请求趋势图                                      │  │
│  │                                                                      │  │
│  │  2000 ┤                                    ▄▄▄▄▄                     │  │
│  │  1500 ┤              ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄     ▄▄▄▄▄                │  │
│  │  1000 ┤▄▄▄▄▄▄▄▄▄▄▄▄▄                                ▄▄▄▄▄            │  │
│  │   500 ┤                                                              │  │
│  │     0 ┼──────────────────────────────────────────────────────────── │  │
│  │       00:00        06:00        12:00        18:00        24:00     │  │
│  │                                                                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │         CPU 使用率               │  │         内存使用率               │ │
│  │                                 │  │                                 │ │
│  │  Pod-1: ████████░░ 80%          │  │  Pod-1: ██████░░░░ 60%          │ │
│  │  Pod-2: ███████░░░ 70%          │  │  Pod-2: █████████░ 90%          │ │
│  │  Pod-3: █████░░░░░ 50%          │  │  Pod-3: ███████░░░ 70%          │ │
│  │                                 │  │                                 │ │
│  └─────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. 设计决策记录

| 问题 | 决策 | 说明 |
|-----|------|------|
| 部署单元 | 产品级 Namespace | 资源隔离，便于管理 |
| 默认发布策略 | 滚动更新 | 零停机，简单可靠 |
| 灰度发布 | Istio VirtualService | 细粒度流量控制 |
| 弹性伸缩 | HPA (CPU + Memory) | 自动应对流量波动 |
| 服务网格 | Istio | 流量管理、可观测性、安全 |
| 监控系统 | Prometheus + Grafana | 开源标准，生态丰富 |
| 告警通知 | AlertManager + 钉钉 | 多渠道通知，快速响应 |

---
