# 组件类型扩展规范

> **状态**: 设计中
> **更新日期**: 2025-01-22

---

## 1. 概述

### 1.1 组件定义

在 Assembox 架构中，**组件（Component）** 是配置管理的最小单元，所有业务配置都以组件形式存在和继承。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          组件 (Component)                                    │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   唯一标识      │  │   类型归属      │  │   配置内容      │             │
│  │   componentCode │  │   componentType │  │   JSON Schema   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  特点:                                                                      │
│  - 以组件为单位进行层级继承 (system → global → tenant)                       │
│  - 以组件为单位进行版本管理                                                  │
│  - 以组件为单位进行缓存和同步                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 设计目标

| 目标 | 说明 |
|-----|------|
| 统一管理 | 所有配置类型统一注册、统一查询、统一继承 |
| 类型安全 | 不同组件类型有明确的 Schema 定义 |
| 可扩展 | 支持按需添加新的组件类型 |
| 约束清晰 | 组件类型有明确的分类和行为规范 |

### 1.3 核心原则

1. **一处定义，多处使用** - 组件类型在注册表统一管理
2. **类型决定行为** - 不同类型有不同的校验规则和处理逻辑
3. **分类便于管理** - 类型按业务场景分为 model / service / frontend
4. **约定大于配置** - 通过命名和分类约定减少配置复杂度

---

## 2. 组件分类体系

### 2.1 三大类别

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            组件分类体系                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  model (数据模型)                                                    │   │
│  │  ├── model        数据模型配置（包含多个实体定义）                     │   │
│  │  特点: 定义数据骨架，被其他组件引用                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  service (服务端)                                                    │   │
│  │  ├── logic        逻辑编排配置                                       │   │
│  │  ├── api          API 接口配置                                       │   │
│  │  ├── workflow     工作流配置                                         │   │
│  │  ├── rule         业务规则配置                                       │   │
│  │  └── ...          可扩展                                             │   │
│  │  特点: 定义服务端行为，处理业务逻辑                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  frontend (前端)                                                     │   │
│  │  ├── page         主页面配置                                         │   │
│  │  ├── table        表格配置                                           │   │
│  │  ├── form         表单配置                                           │   │
│  │  ├── filter       过滤器配置                                         │   │
│  │  ├── detail       详情页配置                                         │   │
│  │  ├── export       打印导出配置                                       │   │
│  │  ├── chart        图表配置                                           │   │
│  │  └── ...          可扩展                                             │   │
│  │  特点: 定义前端展示，控制用户界面                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 分类映射表

| category | component_type | 说明 | 引用关系 |
|----------|---------------|------|---------|
| model | `model` | 数据模型（实体集合） | 被其他组件引用 |
| service | `logic` | 逻辑编排 | 引用 model |
| service | `api` | API 接口 | 引用 model, logic |
| service | `workflow` | 工作流 | 引用 model, api |
| service | `rule` | 业务规则 | 引用 model |
| frontend | `page` | 主页面 | 引用 model, api |
| frontend | `table` | 表格 | 引用 model |
| frontend | `form` | 表单 | 引用 model |
| frontend | `filter` | 过滤器 | 引用 model |
| frontend | `detail` | 详情页 | 引用 model |
| frontend | `export` | 打印导出 | 引用 model, table |
| frontend | `chart` | 图表 | 引用 model, api |

---

## 3. 组件类型定义

### 3.1 类型元数据结构

```typescript
/**
 * 组件类型定义
 */
interface ComponentTypeDefinition {
    /** 类型代码，全局唯一 */
    typeCode: string;

    /** 类型名称 */
    typeName: string;

    /** 所属分类 */
    category: 'model' | 'service' | 'frontend';

    /** 类型描述 */
    description: string;

    /** JSON Schema 版本（用于配置校验） */
    schemaVersion: string;

    /** Schema 定义路径 */
    schemaPath: string;

    /** 是否启用 */
    enabled: boolean;

    /** 排序序号 */
    sortOrder: number;

    /** 依赖的组件类型 */
    dependsOn: string[];

    /** 支持的继承层级 */
    supportedScopes: ('system' | 'global' | 'tenant')[];

    /** 是否支持多实例（同一类型在同一版本下可创建多个） */
    allowMultiple: boolean;

    /**
     * 默认是否支持继承（创建组件时的默认值）
     * - true: 支持三层继承 (system → global → tenant)
     * - false: 仅允许 system 层配置
     * 具体组件可在 ab_component.is_inheritable 中覆盖此默认值
     */
    defaultInheritable: boolean;

    /**
     * 默认是否启用缓存（创建组件时的默认值）
     * - true: 运行时读取走 Redis 缓存
     * - false: 直接从数据库读取，适用于审批流等实时性要求高的配置
     * 具体组件可在 ab_component.is_cacheable 中覆盖此默认值
     */
    defaultCacheable: boolean;

    /** 扩展配置 */
    options: {
        /** 是否需要关联数据模型 */
        requiresModel: boolean;
        /** 是否支持预览 */
        previewable: boolean;
        /** 最大配置大小（字节） */
        maxContentSize: number;
        /** 自定义校验器类名 */
        validatorClass?: string;
    };
}
```

### 3.2 内置组件类型定义

#### 3.2.1 model - 数据模型

```typescript
const MODEL_TYPE: ComponentTypeDefinition = {
    typeCode: 'model',
    typeName: '数据模型',
    category: 'model',
    description: '定义模块的数据结构，包含多个实体定义，作为属性骨架被其他组件引用',
    schemaVersion: 'assembox/model/v1',
    schemaPath: 'schemas/model.schema.json',
    enabled: true,
    sortOrder: 100,
    dependsOn: [],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 数据模型支持继承，允许租户扩展字段
    defaultCacheable: true,     // 数据模型可缓存
    options: {
        requiresModel: false,
        previewable: false,
        maxContentSize: 1024 * 1024,  // 1MB
        validatorClass: 'ModelValidator'
    }
};
```

#### 3.2.2 logic - 逻辑编排

```typescript
const LOGIC_TYPE: ComponentTypeDefinition = {
    typeCode: 'logic',
    typeName: '逻辑编排',
    category: 'service',
    description: '定义业务逻辑的编排配置，包含流程节点、条件分支等',
    schemaVersion: 'assembox/logic/v1',
    schemaPath: 'schemas/logic.schema.json',
    enabled: true,
    sortOrder: 200,
    dependsOn: ['model'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 逻辑编排支持继承
    defaultCacheable: true,     // 逻辑编排可缓存
    options: {
        requiresModel: true,
        previewable: true,
        maxContentSize: 512 * 1024,  // 512KB
        validatorClass: 'LogicValidator'
    }
};
```

#### 3.2.3 api - API 接口

```typescript
const API_TYPE: ComponentTypeDefinition = {
    typeCode: 'api',
    typeName: 'API接口',
    category: 'service',
    description: '定义对外暴露的 API 接口，包含路由、参数、权限等',
    schemaVersion: 'assembox/api/v1',
    schemaPath: 'schemas/api.schema.json',
    enabled: true,
    sortOrder: 210,
    dependsOn: ['model', 'logic'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // API 接口支持继承
    defaultCacheable: true,     // API 接口可缓存
    options: {
        requiresModel: true,
        previewable: false,
        maxContentSize: 256 * 1024,  // 256KB
        validatorClass: 'ApiValidator'
    }
};
```

#### 3.2.4 page - 主页面

```typescript
const PAGE_TYPE: ComponentTypeDefinition = {
    typeCode: 'page',
    typeName: '主页面',
    category: 'frontend',
    description: '定义完整页面的布局和行为，是前端配置的入口',
    schemaVersion: 'assembox/page/v1',
    schemaPath: 'schemas/page.schema.json',
    enabled: true,
    sortOrder: 300,
    dependsOn: ['model', 'api'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 页面配置支持继承
    defaultCacheable: true,     // 页面配置可缓存
    options: {
        requiresModel: true,
        previewable: true,
        maxContentSize: 512 * 1024,  // 512KB
        validatorClass: 'PageValidator'
    }
};
```

#### 3.2.5 table - 表格

```typescript
const TABLE_TYPE: ComponentTypeDefinition = {
    typeCode: 'table',
    typeName: '表格配置',
    category: 'frontend',
    description: '定义数据表格的列、操作、分页等配置',
    schemaVersion: 'assembox/table/v1',
    schemaPath: 'schemas/table.schema.json',
    enabled: true,
    sortOrder: 310,
    dependsOn: ['model'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 表格配置支持继承
    defaultCacheable: true,     // 表格配置可缓存
    options: {
        requiresModel: true,
        previewable: true,
        maxContentSize: 256 * 1024,  // 256KB
        validatorClass: 'TableValidator'
    }
};
```

#### 3.2.6 form - 表单

```typescript
const FORM_TYPE: ComponentTypeDefinition = {
    typeCode: 'form',
    typeName: '表单配置',
    category: 'frontend',
    description: '定义数据录入表单的字段、布局、校验规则',
    schemaVersion: 'assembox/form/v1',
    schemaPath: 'schemas/form.schema.json',
    enabled: true,
    sortOrder: 320,
    dependsOn: ['model'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 表单配置支持继承
    defaultCacheable: true,     // 表单配置可缓存
    options: {
        requiresModel: true,
        previewable: true,
        maxContentSize: 256 * 1024,  // 256KB
        validatorClass: 'FormValidator'
    }
};
```

#### 3.2.7 filter - 过滤器

```typescript
const FILTER_TYPE: ComponentTypeDefinition = {
    typeCode: 'filter',
    typeName: '过滤器配置',
    category: 'frontend',
    description: '定义数据筛选条件的字段和布局',
    schemaVersion: 'assembox/filter/v1',
    schemaPath: 'schemas/filter.schema.json',
    enabled: true,
    sortOrder: 330,
    dependsOn: ['model'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 过滤器配置支持继承
    defaultCacheable: true,     // 过滤器配置可缓存
    options: {
        requiresModel: true,
        previewable: true,
        maxContentSize: 128 * 1024,  // 128KB
        validatorClass: 'FilterValidator'
    }
};
```

#### 3.2.8 detail - 详情页

```typescript
const DETAIL_TYPE: ComponentTypeDefinition = {
    typeCode: 'detail',
    typeName: '详情页配置',
    category: 'frontend',
    description: '定义数据详情展示页面的布局和字段',
    schemaVersion: 'assembox/detail/v1',
    schemaPath: 'schemas/detail.schema.json',
    enabled: true,
    sortOrder: 340,
    dependsOn: ['model'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 详情页配置支持继承
    defaultCacheable: true,     // 详情页配置可缓存
    options: {
        requiresModel: true,
        previewable: true,
        maxContentSize: 256 * 1024,  // 256KB
        validatorClass: 'DetailValidator'
    }
};
```

#### 3.2.9 export - 打印导出

```typescript
const EXPORT_TYPE: ComponentTypeDefinition = {
    typeCode: 'export',
    typeName: '打印导出配置',
    category: 'frontend',
    description: '定义数据打印和导出的模板配置',
    schemaVersion: 'assembox/export/v1',
    schemaPath: 'schemas/export.schema.json',
    enabled: true,
    sortOrder: 350,
    dependsOn: ['model', 'table'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 打印导出配置支持继承
    defaultCacheable: true,     // 打印导出配置可缓存
    options: {
        requiresModel: true,
        previewable: true,
        maxContentSize: 512 * 1024,  // 512KB
        validatorClass: 'ExportValidator'
    }
};
```

### 3.3 类型注册表

```typescript
/**
 * 组件类型注册表
 * 所有内置类型统一管理
 */
const COMPONENT_TYPE_REGISTRY: Map<string, ComponentTypeDefinition> = new Map([
    // model 分类
    ['model', MODEL_TYPE],
    
    // service 分类
    ['logic', LOGIC_TYPE],
    ['api', API_TYPE],
    
    // frontend 分类
    ['page', PAGE_TYPE],
    ['table', TABLE_TYPE],
    ['form', FORM_TYPE],
    ['filter', FILTER_TYPE],
    ['detail', DETAIL_TYPE],
    ['export', EXPORT_TYPE]
]);
```

---

## 4. 组件类型扩展机制

### 4.1 扩展流程

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           组件类型扩展流程                                      │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
   ┌───────────┐             ┌───────────┐             ┌───────────┐
   │  Step 1   │             │  Step 2   │             │  Step 3   │
   │  定义类型  │   ────▶    │  注册类型  │   ────▶    │  实现校验  │
   └───────────┘             └───────────┘             └───────────┘
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ 确定类型代码     │        │ 添加到注册表     │        │ 编写 Validator  │
│ 确定所属分类     │        │ 配置依赖关系     │        │ 编写 JSON Schema│
│ 定义 Schema     │        │ 设置类型选项     │        │ 集成到框架      │
└─────────────────┘        └─────────────────┘        └─────────────────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     ▼
                            ┌───────────────┐
                            │    Step 4     │
                            │   测试验证     │
                            └───────────────┘
                                     │
                                     ▼
                            ┌───────────────┐
                            │    Step 5     │
                            │   文档更新     │
                            └───────────────┘
```

### 4.2 扩展示例：添加 chart 图表类型

#### Step 1: 定义类型

```typescript
const CHART_TYPE: ComponentTypeDefinition = {
    typeCode: 'chart',
    typeName: '图表配置',
    category: 'frontend',
    description: '定义数据可视化图表的配置，支持多种图表类型',
    schemaVersion: 'assembox/chart/v1',
    schemaPath: 'schemas/chart.schema.json',
    enabled: true,
    sortOrder: 360,
    dependsOn: ['model', 'api'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,   // 图表配置支持继承
    defaultCacheable: true,     // 图表配置可缓存
    options: {
        requiresModel: true,
        previewable: true,
        maxContentSize: 256 * 1024,
        validatorClass: 'ChartValidator'
    }
};
```

#### Step 2: 定义 JSON Schema

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/chart/v1",
    "title": "Chart Component Schema",
    "type": "object",
    "required": ["componentCode", "componentName", "modelRef", "chartType"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/chart/v1"
        },
        "componentCode": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]*$",
            "maxLength": 100,
            "description": "组件代码"
        },
        "componentName": {
            "type": "string",
            "maxLength": 200,
            "description": "组件名称"
        },
        "modelRef": {
            "type": "string",
            "description": "引用的数据模型代码"
        },
        "entityRef": {
            "type": "string",
            "description": "引用的实体代码"
        },
        "chartType": {
            "type": "string",
            "enum": ["line", "bar", "pie", "scatter", "area", "radar"],
            "description": "图表类型"
        },
        "dataSource": {
            "type": "object",
            "properties": {
                "apiRef": {
                    "type": "string",
                    "description": "数据来源 API"
                },
                "refreshInterval": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "自动刷新间隔（秒），0 表示不自动刷新"
                }
            }
        },
        "dimensions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["field"],
                "properties": {
                    "field": { "type": "string" },
                    "label": { "type": "string" }
                }
            },
            "description": "维度字段配置"
        },
        "metrics": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["field", "aggregation"],
                "properties": {
                    "field": { "type": "string" },
                    "label": { "type": "string" },
                    "aggregation": {
                        "type": "string",
                        "enum": ["sum", "avg", "count", "max", "min"]
                    }
                }
            },
            "description": "指标字段配置"
        },
        "options": {
            "type": "object",
            "properties": {
                "title": { "type": "string" },
                "legend": { "type": "boolean", "default": true },
                "tooltip": { "type": "boolean", "default": true }
            },
            "description": "图表选项"
        }
    }
}
```

#### Step 3: 实现校验器

```typescript
import Ajv from 'ajv';
import chartSchema from './schemas/chart.schema.json';

export class ChartValidator implements ComponentValidator {
    private ajv: Ajv;
    private validate: ValidateFunction;

    constructor() {
        this.ajv = new Ajv({ allErrors: true });
        this.validate = this.ajv.compile(chartSchema);
    }

    async validateConfig(
        config: unknown,
        context: ValidationContext
    ): Promise<ValidationResult> {
        const errors: ValidationError[] = [];

        // 1. Schema 校验
        const valid = this.validate(config);
        if (!valid && this.validate.errors) {
            for (const error of this.validate.errors) {
                errors.push({
                    path: error.instancePath,
                    message: error.message || 'Schema validation failed',
                    code: 'SCHEMA_INVALID'
                });
            }
        }

        // 2. 业务规则校验
        if (isChartConfig(config)) {
            // 校验模型引用是否存在
            const modelExists = await this.checkModelExists(
                config.modelRef,
                context
            );
            if (!modelExists) {
                errors.push({
                    path: '/modelRef',
                    message: `Referenced model '${config.modelRef}' does not exist`,
                    code: 'MODEL_NOT_FOUND'
                });
            }

            // 校验字段引用是否有效
            if (modelExists && config.entityRef) {
                const fieldErrors = await this.validateFieldRefs(
                    config,
                    context
                );
                errors.push(...fieldErrors);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    private async checkModelExists(
        modelCode: string,
        context: ValidationContext
    ): Promise<boolean> {
        const component = await context.componentService.findByCode(
            context.moduleCode,
            context.versionCode,
            'model',
            modelCode
        );
        return component !== null;
    }

    private async validateFieldRefs(
        config: ChartConfig,
        context: ValidationContext
    ): Promise<ValidationError[]> {
        const errors: ValidationError[] = [];
        
        // 获取模型中的实体定义
        const model = await context.configService.loadConfig({
            tenant: '_system',
            moduleCode: context.moduleCode,
            versionCode: context.versionCode,
            componentType: 'model',
            componentCode: config.modelRef
        });

        const entity = model?.entities?.[config.entityRef];
        if (!entity) {
            errors.push({
                path: '/entityRef',
                message: `Entity '${config.entityRef}' not found in model`,
                code: 'ENTITY_NOT_FOUND'
            });
            return errors;
        }

        const validFields = new Set(entity.fields.map((f: any) => f.fieldCode));

        // 校验维度字段
        config.dimensions?.forEach((dim, index) => {
            if (!validFields.has(dim.field)) {
                errors.push({
                    path: `/dimensions/${index}/field`,
                    message: `Field '${dim.field}' not found in entity`,
                    code: 'FIELD_NOT_FOUND'
                });
            }
        });

        // 校验指标字段
        config.metrics?.forEach((metric, index) => {
            if (!validFields.has(metric.field)) {
                errors.push({
                    path: `/metrics/${index}/field`,
                    message: `Field '${metric.field}' not found in entity`,
                    code: 'FIELD_NOT_FOUND'
                });
            }
        });

        return errors;
    }
}
```

#### Step 4: 注册到框架

```typescript
// 在应用初始化时注册
import { ComponentTypeRegistry } from './registry';
import { ChartValidator } from './validators/chart.validator';

// 注册类型定义
ComponentTypeRegistry.register(CHART_TYPE);

// 注册校验器
ValidatorRegistry.register('ChartValidator', ChartValidator);

// 加载 Schema
SchemaRegistry.load('assembox/chart/v1', chartSchema);
```

---

## 5. 组件类型服务

### 5.1 类型注册服务

```typescript
export class ComponentTypeService {
    private typeRegistry: Map<string, ComponentTypeDefinition> = new Map();
    private validatorRegistry: Map<string, ComponentValidator> = new Map();
    private schemaRegistry: Map<string, object> = new Map();

    /**
     * 注册组件类型
     */
    register(definition: ComponentTypeDefinition): void {
        // 验证类型定义
        this.validateDefinition(definition);

        // 检查类型代码唯一性
        if (this.typeRegistry.has(definition.typeCode)) {
            throw new Error(`Component type '${definition.typeCode}' already registered`);
        }

        // 注册类型
        this.typeRegistry.set(definition.typeCode, definition);
        
        logger.info('Component type registered', {
            typeCode: definition.typeCode,
            category: definition.category
        });
    }

    /**
     * 获取类型定义
     */
    getType(typeCode: string): ComponentTypeDefinition | undefined {
        return this.typeRegistry.get(typeCode);
    }

    /**
     * 获取分类下的所有类型
     */
    getTypesByCategory(category: string): ComponentTypeDefinition[] {
        return Array.from(this.typeRegistry.values())
            .filter(t => t.category === category && t.enabled)
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }

    /**
     * 获取所有已启用的类型
     */
    getAllEnabledTypes(): ComponentTypeDefinition[] {
        return Array.from(this.typeRegistry.values())
            .filter(t => t.enabled)
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }

    /**
     * 检查类型是否存在且启用
     */
    isValidType(typeCode: string): boolean {
        const type = this.typeRegistry.get(typeCode);
        return type !== undefined && type.enabled;
    }

    /**
     * 获取类型的校验器
     */
    getValidator(typeCode: string): ComponentValidator | undefined {
        const type = this.typeRegistry.get(typeCode);
        if (!type || !type.options.validatorClass) {
            return undefined;
        }
        return this.validatorRegistry.get(type.options.validatorClass);
    }

    /**
     * 获取类型的 Schema
     */
    getSchema(typeCode: string): object | undefined {
        const type = this.typeRegistry.get(typeCode);
        if (!type) {
            return undefined;
        }
        return this.schemaRegistry.get(type.schemaVersion);
    }

    /**
     * 验证类型定义
     */
    private validateDefinition(definition: ComponentTypeDefinition): void {
        // 类型代码格式校验
        if (!/^[a-z][a-z0-9_]*$/.test(definition.typeCode)) {
            throw new Error(
                `Invalid type code format: '${definition.typeCode}'. ` +
                `Must start with lowercase letter and contain only lowercase letters, numbers, underscores.`
            );
        }

        // 分类校验
        if (!['model', 'service', 'frontend'].includes(definition.category)) {
            throw new Error(
                `Invalid category: '${definition.category}'. ` +
                `Must be one of: model, service, frontend.`
            );
        }

        // 依赖校验
        for (const dep of definition.dependsOn) {
            if (!this.typeRegistry.has(dep)) {
                throw new Error(
                    `Dependency type '${dep}' not registered. ` +
                    `Please register dependencies first.`
                );
            }
        }

        // Schema 版本格式校验
        if (!/^assembox\/[a-z]+\/v\d+$/.test(definition.schemaVersion)) {
            throw new Error(
                `Invalid schema version format: '${definition.schemaVersion}'. ` +
                `Expected format: assembox/{type}/v{version}.`
            );
        }
    }
}
```

### 5.2 类型查询 API

```typescript
/**
 * 组件类型查询接口
 */
interface ComponentTypeQueryApi {
    /**
     * 获取所有组件类型
     * GET /api/component-types
     */
    listAllTypes(): Promise<ComponentTypeInfo[]>;

    /**
     * 获取指定分类的组件类型
     * GET /api/component-types?category={category}
     */
    listTypesByCategory(category: string): Promise<ComponentTypeInfo[]>;

    /**
     * 获取组件类型详情
     * GET /api/component-types/{typeCode}
     */
    getTypeDetail(typeCode: string): Promise<ComponentTypeDetail>;

    /**
     * 获取组件类型的 Schema
     * GET /api/component-types/{typeCode}/schema
     */
    getTypeSchema(typeCode: string): Promise<object>;
}

// 响应类型
interface ComponentTypeInfo {
    typeCode: string;
    typeName: string;
    category: string;
    description: string;
    sortOrder: number;
}

interface ComponentTypeDetail extends ComponentTypeInfo {
    schemaVersion: string;
    dependsOn: string[];
    supportedScopes: string[];
    allowMultiple: boolean;
    options: {
        requiresModel: boolean;
        previewable: boolean;
        maxContentSize: number;
    };
}
```

---

## 6. 组件类型校验

### 6.1 校验器接口

```typescript
/**
 * 组件校验器接口
 */
interface ComponentValidator {
    /**
     * 校验配置内容
     */
    validateConfig(
        config: unknown,
        context: ValidationContext
    ): Promise<ValidationResult>;
}

/**
 * 校验上下文
 */
interface ValidationContext {
    /** 模块代码 */
    moduleCode: string;
    /** 版本代码 */
    versionCode: string;
    /** 配置层级 */
    scope: 'system' | 'global' | 'tenant';
    /** 租户代码 */
    tenant?: string;
    /** 组件服务（用于查询依赖） */
    componentService: ComponentService;
    /** 配置服务（用于加载依赖配置） */
    configService: ConfigService;
}

/**
 * 校验结果
 */
interface ValidationResult {
    /** 是否通过校验 */
    valid: boolean;
    /** 错误列表 */
    errors: ValidationError[];
    /** 警告列表 */
    warnings?: ValidationWarning[];
}

/**
 * 校验错误
 */
interface ValidationError {
    /** JSON Path */
    path: string;
    /** 错误信息 */
    message: string;
    /** 错误代码 */
    code: string;
}

/**
 * 校验警告
 */
interface ValidationWarning {
    /** JSON Path */
    path: string;
    /** 警告信息 */
    message: string;
    /** 警告代码 */
    code: string;
}
```

### 6.2 基础校验器

```typescript
/**
 * 基础组件校验器
 * 所有类型校验器的基类
 */
export abstract class BaseComponentValidator implements ComponentValidator {
    protected ajv: Ajv;
    protected schemaValidate: ValidateFunction;

    constructor(schema: object) {
        this.ajv = new Ajv({
            allErrors: true,
            verbose: true,
            strictSchema: false
        });
        this.schemaValidate = this.ajv.compile(schema);
    }

    async validateConfig(
        config: unknown,
        context: ValidationContext
    ): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // 1. 基础类型检查
        if (typeof config !== 'object' || config === null) {
            errors.push({
                path: '/',
                message: 'Config must be a non-null object',
                code: 'INVALID_TYPE'
            });
            return { valid: false, errors, warnings };
        }

        // 2. Schema 校验
        const schemaErrors = this.validateSchema(config);
        errors.push(...schemaErrors);

        // 如果 Schema 校验失败，跳过后续校验
        if (schemaErrors.length > 0) {
            return { valid: false, errors, warnings };
        }

        // 3. 公共字段校验
        const commonErrors = this.validateCommonFields(config as Record<string, unknown>);
        errors.push(...commonErrors);

        // 4. 类型特定校验（子类实现）
        const specificResult = await this.validateSpecific(config, context);
        errors.push(...specificResult.errors);
        if (specificResult.warnings) {
            warnings.push(...specificResult.warnings);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Schema 校验
     */
    protected validateSchema(config: unknown): ValidationError[] {
        const errors: ValidationError[] = [];
        
        const valid = this.schemaValidate(config);
        if (!valid && this.schemaValidate.errors) {
            for (const error of this.schemaValidate.errors) {
                errors.push({
                    path: error.instancePath || '/',
                    message: this.formatSchemaError(error),
                    code: 'SCHEMA_' + (error.keyword?.toUpperCase() || 'INVALID')
                });
            }
        }

        return errors;
    }

    /**
     * 公共字段校验
     */
    protected validateCommonFields(config: Record<string, unknown>): ValidationError[] {
        const errors: ValidationError[] = [];

        // componentCode 格式校验
        if (config.componentCode) {
            const code = config.componentCode as string;
            if (!/^[a-z][a-z0-9_]*$/.test(code)) {
                errors.push({
                    path: '/componentCode',
                    message: 'Component code must start with lowercase letter and contain only lowercase letters, numbers, underscores',
                    code: 'INVALID_CODE_FORMAT'
                });
            }
            if (code.length > 100) {
                errors.push({
                    path: '/componentCode',
                    message: 'Component code must not exceed 100 characters',
                    code: 'CODE_TOO_LONG'
                });
            }
        }

        // componentName 长度校验
        if (config.componentName) {
            const name = config.componentName as string;
            if (name.length > 200) {
                errors.push({
                    path: '/componentName',
                    message: 'Component name must not exceed 200 characters',
                    code: 'NAME_TOO_LONG'
                });
            }
        }

        return errors;
    }

    /**
     * 格式化 Schema 错误信息
     */
    protected formatSchemaError(error: ErrorObject): string {
        switch (error.keyword) {
            case 'required':
                return `Missing required property: ${error.params.missingProperty}`;
            case 'type':
                return `Expected ${error.params.type}, got ${typeof error.data}`;
            case 'enum':
                return `Must be one of: ${error.params.allowedValues.join(', ')}`;
            case 'pattern':
                return `Does not match pattern: ${error.params.pattern}`;
            case 'maxLength':
                return `Must not exceed ${error.params.limit} characters`;
            case 'minLength':
                return `Must be at least ${error.params.limit} characters`;
            default:
                return error.message || 'Validation failed';
        }
    }

    /**
     * 类型特定校验（子类实现）
     */
    protected abstract validateSpecific(
        config: unknown,
        context: ValidationContext
    ): Promise<ValidationResult>;
}
```

---

## 7. 配置内容 Schema 示例

### 7.1 model Schema

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/model/v1",
    "title": "Model Component Schema",
    "type": "object",
    "required": ["componentCode", "componentName", "entities"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/model/v1"
        },
        "componentCode": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]*$",
            "maxLength": 100
        },
        "componentName": {
            "type": "string",
            "maxLength": 200
        },
        "description": {
            "type": "string",
            "maxLength": 500
        },
        "entities": {
            "type": "object",
            "additionalProperties": {
                "$ref": "#/definitions/Entity"
            },
            "minProperties": 1
        }
    },
    "definitions": {
        "Entity": {
            "type": "object",
            "required": ["entityName", "tableName", "fields"],
            "properties": {
                "entityName": { "type": "string" },
                "tableName": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
                "role": { "type": "string", "enum": ["main", "detail", "ref"] },
                "parentEntity": { "type": "string" },
                "fields": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/Field" },
                    "minItems": 1
                }
            }
        },
        "Field": {
            "type": "object",
            "required": ["fieldCode", "fieldName", "fieldType"],
            "properties": {
                "fieldCode": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
                "fieldName": { "type": "string" },
                "fieldType": {
                    "type": "string",
                    "enum": ["string", "int", "bigint", "decimal", "boolean", "date", "datetime", "text", "json"]
                },
                "length": { "type": "integer", "minimum": 1 },
                "precision": { "type": "integer", "minimum": 1 },
                "scale": { "type": "integer", "minimum": 0 },
                "primaryKey": { "type": "boolean" },
                "required": { "type": "boolean" },
                "foreignKey": { "type": "string" },
                "defaultValue": {}
            }
        }
    }
}
```

### 7.2 table Schema

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/table/v1",
    "title": "Table Component Schema",
    "type": "object",
    "required": ["componentCode", "componentName", "modelRef", "entityRef", "columns"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/table/v1"
        },
        "componentCode": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]*$",
            "maxLength": 100
        },
        "componentName": {
            "type": "string",
            "maxLength": 200
        },
        "modelRef": {
            "type": "string",
            "description": "引用的数据模型代码"
        },
        "entityRef": {
            "type": "string",
            "description": "引用的实体代码"
        },
        "columns": {
            "type": "array",
            "items": { "$ref": "#/definitions/Column" },
            "minItems": 1
        },
        "pagination": {
            "$ref": "#/definitions/Pagination"
        },
        "actions": {
            "type": "array",
            "items": { "$ref": "#/definitions/Action" }
        },
        "rowSelection": {
            "type": "object",
            "properties": {
                "type": { "type": "string", "enum": ["checkbox", "radio", "none"] },
                "columnWidth": { "type": "integer" }
            }
        }
    },
    "definitions": {
        "Column": {
            "type": "object",
            "required": ["field", "label"],
            "properties": {
                "field": { "type": "string" },
                "label": { "type": "string" },
                "width": { "type": "integer", "minimum": 50 },
                "minWidth": { "type": "integer", "minimum": 50 },
                "fixed": { "type": "string", "enum": ["left", "right"] },
                "sortable": { "type": "boolean" },
                "filterable": { "type": "boolean" },
                "formatter": { "type": "string" },
                "align": { "type": "string", "enum": ["left", "center", "right"] },
                "visible": { "type": "boolean", "default": true }
            }
        },
        "Pagination": {
            "type": "object",
            "properties": {
                "pageSize": { "type": "integer", "minimum": 1, "maximum": 500, "default": 20 },
                "pageSizes": {
                    "type": "array",
                    "items": { "type": "integer" },
                    "default": [10, 20, 50, 100]
                },
                "showTotal": { "type": "boolean", "default": true }
            }
        },
        "Action": {
            "type": "object",
            "required": ["code", "label"],
            "properties": {
                "code": { "type": "string" },
                "label": { "type": "string" },
                "type": { "type": "string", "enum": ["primary", "default", "danger", "link"] },
                "position": { "type": "string", "enum": ["toolbar", "row", "both"] },
                "confirm": { "type": "string" },
                "permission": { "type": "string" }
            }
        }
    }
}
```

### 7.3 form Schema

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/form/v1",
    "title": "Form Component Schema",
    "type": "object",
    "required": ["componentCode", "componentName", "modelRef", "entityRef", "fields"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/form/v1"
        },
        "componentCode": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]*$",
            "maxLength": 100
        },
        "componentName": {
            "type": "string",
            "maxLength": 200
        },
        "modelRef": {
            "type": "string"
        },
        "entityRef": {
            "type": "string"
        },
        "layout": {
            "type": "object",
            "properties": {
                "type": { "type": "string", "enum": ["horizontal", "vertical", "inline"] },
                "labelWidth": { "type": "integer" },
                "columns": { "type": "integer", "minimum": 1, "maximum": 4 }
            }
        },
        "fields": {
            "type": "array",
            "items": { "$ref": "#/definitions/FormField" },
            "minItems": 1
        },
        "actions": {
            "type": "array",
            "items": { "$ref": "#/definitions/FormAction" }
        }
    },
    "definitions": {
        "FormField": {
            "type": "object",
            "required": ["field", "label", "component"],
            "properties": {
                "field": { "type": "string" },
                "label": { "type": "string" },
                "component": {
                    "type": "string",
                    "enum": ["input", "textarea", "number", "select", "radio", "checkbox", "switch", "date", "datetime", "upload", "custom"]
                },
                "required": { "type": "boolean" },
                "disabled": { "type": "boolean" },
                "readonly": { "type": "boolean" },
                "placeholder": { "type": "string" },
                "span": { "type": "integer", "minimum": 1 },
                "rules": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/ValidationRule" }
                },
                "props": { "type": "object" }
            }
        },
        "ValidationRule": {
            "type": "object",
            "properties": {
                "type": { "type": "string", "enum": ["required", "email", "url", "pattern", "min", "max", "range", "custom"] },
                "message": { "type": "string" },
                "pattern": { "type": "string" },
                "min": { "type": "number" },
                "max": { "type": "number" },
                "validator": { "type": "string" }
            }
        },
        "FormAction": {
            "type": "object",
            "required": ["code", "label"],
            "properties": {
                "code": { "type": "string" },
                "label": { "type": "string" },
                "type": { "type": "string", "enum": ["submit", "reset", "cancel", "custom"] },
                "buttonType": { "type": "string", "enum": ["primary", "default", "danger"] }
            }
        }
    }
}
```

---

## 8. 组件类型与数据库约束

### 8.1 组件类型枚举

在 `ab_component` 表中，`component_type` 字段存储组件类型代码。为确保数据一致性，需在应用层做约束：

```typescript
/**
 * 保存组件时校验类型
 */
async function saveComponent(component: ComponentInput): Promise<void> {
    // 校验类型是否有效
    if (!componentTypeService.isValidType(component.componentType)) {
        throw new BusinessError(
            'INVALID_COMPONENT_TYPE',
            `Unknown component type: ${component.componentType}`
        );
    }

    // 校验分类是否匹配
    const typeDefinition = componentTypeService.getType(component.componentType);
    if (typeDefinition && typeDefinition.category !== component.category) {
        throw new BusinessError(
            'CATEGORY_MISMATCH',
            `Component type '${component.componentType}' belongs to category '${typeDefinition.category}', not '${component.category}'`
        );
    }

    // 继续保存逻辑...
}
```

### 8.2 组件唯一性约束

```sql
-- 同一版本下，同一类型的组件代码唯一
ALTER TABLE ab_component ADD UNIQUE INDEX uk_component_code (
    version_id,
    component_type,
    component_code
);
```

---

## 9. 组件特性默认值应用

### 9.1 创建组件时应用默认值

```typescript
/**
 * 创建组件时，从类型定义获取默认特性值
 */
async function createComponent(input: CreateComponentInput): Promise<Component> {
    const typeDefinition = componentTypeService.getType(input.componentType);
    if (!typeDefinition) {
        throw new BusinessError('INVALID_COMPONENT_TYPE', `Unknown type: ${input.componentType}`);
    }

    // 应用类型的默认特性值（可被输入覆盖）
    const component = await db.insert('ab_component', {
        ...input,
        is_inheritable: input.is_inheritable ?? typeDefinition.defaultInheritable,
        is_cacheable: input.is_cacheable ?? typeDefinition.defaultCacheable
    });

    return component;
}
```

### 9.2 特殊组件类型示例

对于某些特殊场景的组件类型，可以设置不同的默认值：

```typescript
// 审批流配置 - 不缓存（需要实时读取最新配置）
const WORKFLOW_TYPE: ComponentTypeDefinition = {
    typeCode: 'workflow',
    typeName: '工作流配置',
    category: 'service',
    // ...
    defaultInheritable: true,
    defaultCacheable: false,    // 审批流不走缓存，确保实时性
    // ...
};

// 系统参数 - 不继承（仅 system 层配置）
const SYSTEM_PARAM_TYPE: ComponentTypeDefinition = {
    typeCode: 'system_param',
    typeName: '系统参数',
    category: 'service',
    // ...
    defaultInheritable: false,  // 系统参数不继承，仅 system 层
    defaultCacheable: true,
    // ...
};
```

---

## 10. 设计决策记录

| 问题 | 决策 | 说明 |
|-----|------|------|
| 类型代码命名 | 小写字母+下划线 | 与代码规范一致，如 `order_table` |
| 类型分类 | 三大类别 | model / service / frontend |
| Schema 版本 | URI 格式 | `assembox/{type}/v{version}` |
| 校验机制 | 分层校验 | Schema 校验 + 业务规则校验 |
| 扩展方式 | 注册表模式 | 新类型通过注册接入 |
| 依赖检查 | 启动时校验 | 确保依赖类型先注册 |
| 继承特性 | 类型级默认值 | `defaultInheritable` 定义默认值，具体组件可覆盖 |
| 缓存特性 | 类型级默认值 | `defaultCacheable` 定义默认值，具体组件可覆盖 |

---

## 11. 相关文档

| 文档 | 说明 |
|-----|------|
| [存储层总体设计](./overview.md) | 存储层架构总览 |
| [配置详细设计](./config-detail.md) | 配置结构和继承规则 |
| [OSS操作规范](./oss-operations.md) | OSS 存储和读写规范 |
| [缓存策略详细设计](./cache-strategy.md) | 缓存层次和失效策略 |
