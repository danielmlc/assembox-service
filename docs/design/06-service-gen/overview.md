# 服务层代码生成设计

> **状态**: 设计中
> **更新日期**: 2025-01-30
> **设计目标**: 基于配置数据和代码模板生成标准 NestJS 服务代码

---

## 1. 概述

### 1.1 设计背景

Assembox 平台采用 **"代码生成 + 构建发布"** 模式，而非传统低代码平台的"运行时解释"模式。服务层代码通过以下流程产生：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          服务层代码生成流程                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│   │  存储层配置  │ ──▶ │ 代码生成引擎 │ ──▶ │ 标准NestJS  │                  │
│   │  (JSON)     │     │ (ts-morph)  │     │   代码      │                  │
│   └─────────────┘     └─────────────┘     └─────────────┘                  │
│         │                   │                   │                          │
│         │                   │                   ▼                          │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│   │ model 配置  │     │ 服务模板    │     │ 编译校验    │                  │
│   │ api 配置    │     │ (template)  │     │ 打包部署    │                  │
│   │ logic 配置  │     └─────────────┘     └─────────────┘                  │
│   └─────────────┘                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心优势

| 特性 | 代码生成模式 | 运行时解释模式 |
|-----|-------------|---------------|
| 性能 | ✅ 原生代码执行效率 | ❌ 解释执行开销 |
| 调试 | ✅ 可直接调试生成的代码 | ❌ 需要专用调试工具 |
| 扩展 | ✅ 可在生成代码基础上扩展 | ❌ 受限于解释器能力 |
| 类型安全 | ✅ TypeScript 完整类型检查 | ❌ 运行时类型检查 |
| AI友好 | ✅ 标准代码，AI 可理解和修改 | ❌ 配置难以被 AI 理解 |

### 1.3 设计原则

1. **配置即代码** - 配置是唯一真实来源，生成的代码禁止手动修改
2. **模板驱动** - 基于标准模板生成，保证代码风格一致性
3. **产品级生成** - 一个产品的所有模块打包成一个 NestJS 服务
4. **可追溯** - 生成代码标注来源配置，便于问题定位

---

## 2. 服务配置体系

### 2.1 与存储层组件体系的关系

服务层配置复用存储层的组件类型体系（`ab_component` 表），在 `service` 分类下扩展服务特定的组件类型：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            组件分类体系                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  model (数据模型)                                                    │   │
│  │  ├── model        数据模型配置（实体定义 → Entity 生成）              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  service (服务端) 【本文档扩展】                                      │   │
│  │  ├── logic        逻辑编排配置 → Service 方法生成                     │   │
│  │  ├── api          API 接口配置 → Controller 方法生成                  │   │
│  │  ├── module       模块配置 → Module 文件生成（NEW）                   │   │
│  │  ├── dto          DTO 配置 → DTO 类生成（NEW）                       │   │
│  │  └── repository   仓储配置 → Repository 类生成（NEW）                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  frontend (前端)                                                     │   │
│  │  ├── page/table/form/filter/detail/export...                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 服务层组件类型定义

#### 2.2.1 module - 模块配置

```typescript
const MODULE_COMPONENT_TYPE: ComponentTypeDefinition = {
    typeCode: 'module',
    typeName: '服务模块',
    category: 'service',
    description: '定义 NestJS 模块的组织结构，包含控制器、服务、实体注册',
    schemaVersion: 'assembox/module/v1',
    schemaPath: 'schemas/module.schema.json',
    enabled: true,
    sortOrder: 150,
    dependsOn: ['model'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: false,   // 模块配置不继承
    defaultCacheable: false,     // 构建时配置
    defaultRuntime: false,       // 关联快照
    options: {
        requiresModel: true,
        previewable: false,
        maxContentSize: 256 * 1024,
        validatorClass: 'ModuleValidator'
    }
};
```

#### 2.2.2 dto - DTO 配置

```typescript
const DTO_COMPONENT_TYPE: ComponentTypeDefinition = {
    typeCode: 'dto',
    typeName: 'DTO配置',
    category: 'service',
    description: '定义数据传输对象的结构、校验规则',
    schemaVersion: 'assembox/dto/v1',
    schemaPath: 'schemas/dto.schema.json',
    enabled: true,
    sortOrder: 160,
    dependsOn: ['model'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,
    defaultCacheable: false,
    defaultRuntime: false,
    options: {
        requiresModel: true,
        previewable: false,
        maxContentSize: 128 * 1024,
        validatorClass: 'DtoValidator'
    }
};
```

#### 2.2.3 repository - 仓储配置

```typescript
const REPOSITORY_COMPONENT_TYPE: ComponentTypeDefinition = {
    typeCode: 'repository',
    typeName: '仓储配置',
    category: 'service',
    description: '定义数据仓储的自定义方法和查询逻辑',
    schemaVersion: 'assembox/repository/v1',
    schemaPath: 'schemas/repository.schema.json',
    enabled: true,
    sortOrder: 170,
    dependsOn: ['model'],
    supportedScopes: ['system', 'global', 'tenant'],
    allowMultiple: true,
    defaultInheritable: true,
    defaultCacheable: false,
    defaultRuntime: false,
    options: {
        requiresModel: true,
        previewable: false,
        maxContentSize: 256 * 1024,
        validatorClass: 'RepositoryValidator'
    }
};
```

---

## 3. 配置 Schema 定义

### 3.1 module 模块配置 Schema

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/module/v1",
    "title": "Module Component Schema",
    "type": "object",
    "required": ["componentCode", "componentName", "modelRef", "entities"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/module/v1"
        },
        "componentCode": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9-]*$",
            "maxLength": 100,
            "description": "模块代码，如 common-fields"
        },
        "componentName": {
            "type": "string",
            "maxLength": 200,
            "description": "模块名称"
        },
        "description": {
            "type": "string",
            "maxLength": 500
        },
        "modelRef": {
            "type": "string",
            "description": "引用的数据模型组件代码"
        },
        "entities": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/EntityConfig"
            },
            "minItems": 1,
            "description": "模块包含的实体配置"
        },
        "database": {
            "type": "object",
            "properties": {
                "connectionName": {
                    "type": "string",
                    "default": "default",
                    "description": "数据库连接名称"
                }
            }
        },
        "exports": {
            "type": "array",
            "items": { "type": "string" },
            "description": "导出的服务列表"
        }
    },
    "definitions": {
        "EntityConfig": {
            "type": "object",
            "required": ["entityRef"],
            "properties": {
                "entityRef": {
                    "type": "string",
                    "description": "引用模型中的实体代码"
                },
                "generateController": {
                    "type": "boolean",
                    "default": true,
                    "description": "是否生成控制器"
                },
                "generateService": {
                    "type": "boolean",
                    "default": true,
                    "description": "是否生成服务"
                },
                "generateRepository": {
                    "type": "boolean",
                    "default": false,
                    "description": "是否生成自定义仓储"
                },
                "apiPrefix": {
                    "type": "string",
                    "description": "API 路由前缀，默认使用实体代码的 kebab-case"
                }
            }
        }
    }
}
```

### 3.2 api 接口配置 Schema

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/api/v1",
    "title": "API Component Schema",
    "type": "object",
    "required": ["componentCode", "componentName", "moduleRef", "endpoints"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/api/v1"
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
        "moduleRef": {
            "type": "string",
            "description": "所属模块代码"
        },
        "entityRef": {
            "type": "string",
            "description": "关联的实体代码"
        },
        "basePath": {
            "type": "string",
            "description": "API 基础路径"
        },
        "endpoints": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/Endpoint"
            }
        },
        "swagger": {
            "type": "object",
            "properties": {
                "tags": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "description": { "type": "string" }
            }
        }
    },
    "definitions": {
        "Endpoint": {
            "type": "object",
            "required": ["method", "path", "operationId"],
            "properties": {
                "method": {
                    "type": "string",
                    "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]
                },
                "path": {
                    "type": "string",
                    "description": "相对路径，如 /:id"
                },
                "operationId": {
                    "type": "string",
                    "description": "操作标识，生成的方法名"
                },
                "summary": {
                    "type": "string"
                },
                "description": {
                    "type": "string"
                },
                "parameters": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/Parameter"
                    }
                },
                "requestBody": {
                    "$ref": "#/definitions/RequestBody"
                },
                "responses": {
                    "type": "object",
                    "additionalProperties": {
                        "$ref": "#/definitions/Response"
                    }
                },
                "logicRef": {
                    "type": "string",
                    "description": "关联的逻辑编排代码"
                },
                "permission": {
                    "type": "string",
                    "description": "权限代码"
                }
            }
        },
        "Parameter": {
            "type": "object",
            "required": ["name", "in"],
            "properties": {
                "name": { "type": "string" },
                "in": {
                    "type": "string",
                    "enum": ["path", "query", "header"]
                },
                "required": { "type": "boolean" },
                "type": { "type": "string" },
                "description": { "type": "string" }
            }
        },
        "RequestBody": {
            "type": "object",
            "properties": {
                "dtoRef": {
                    "type": "string",
                    "description": "引用的 DTO 组件代码"
                },
                "required": { "type": "boolean" }
            }
        },
        "Response": {
            "type": "object",
            "properties": {
                "description": { "type": "string" },
                "dtoRef": { "type": "string" }
            }
        }
    }
}
```

### 3.3 dto 配置 Schema

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/dto/v1",
    "title": "DTO Component Schema",
    "type": "object",
    "required": ["componentCode", "componentName", "modelRef", "dtos"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/dto/v1"
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
        "dtos": {
            "type": "object",
            "additionalProperties": {
                "$ref": "#/definitions/DtoDefinition"
            },
            "description": "DTO 定义，key 为 DTO 名称"
        }
    },
    "definitions": {
        "DtoDefinition": {
            "type": "object",
            "required": ["dtoName", "fields"],
            "properties": {
                "dtoName": {
                    "type": "string",
                    "description": "DTO 类名"
                },
                "description": {
                    "type": "string"
                },
                "baseDto": {
                    "type": "string",
                    "enum": ["create", "update", "query", "none"],
                    "default": "none",
                    "description": "基于哪种类型生成"
                },
                "fields": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/DtoField"
                    }
                }
            }
        },
        "DtoField": {
            "type": "object",
            "required": ["fieldRef"],
            "properties": {
                "fieldRef": {
                    "type": "string",
                    "description": "引用实体字段代码"
                },
                "override": {
                    "type": "object",
                    "properties": {
                        "required": { "type": "boolean" },
                        "type": { "type": "string" },
                        "description": { "type": "string" }
                    },
                    "description": "覆盖字段属性"
                },
                "validators": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/Validator"
                    }
                }
            }
        },
        "Validator": {
            "type": "object",
            "required": ["type"],
            "properties": {
                "type": {
                    "type": "string",
                    "enum": [
                        "IsNotEmpty", "IsString", "IsNumber", "IsInt",
                        "IsBoolean", "IsDate", "IsEmail", "IsUrl",
                        "MinLength", "MaxLength", "Min", "Max",
                        "Matches", "IsOptional", "IsArray"
                    ]
                },
                "options": {
                    "type": "object",
                    "description": "校验器参数"
                },
                "message": {
                    "type": "string",
                    "description": "自定义错误消息"
                }
            }
        }
    }
}
```

### 3.4 logic 逻辑编排配置 Schema

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "assembox/logic/v1",
    "title": "Logic Component Schema",
    "type": "object",
    "required": ["componentCode", "componentName", "moduleRef", "methods"],
    "properties": {
        "$schema": {
            "type": "string",
            "const": "assembox/logic/v1"
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
        "moduleRef": {
            "type": "string",
            "description": "所属模块代码"
        },
        "methods": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/ServiceMethod"
            },
            "description": "服务方法定义"
        }
    },
    "definitions": {
        "ServiceMethod": {
            "type": "object",
            "required": ["methodName", "steps"],
            "properties": {
                "methodName": {
                    "type": "string",
                    "pattern": "^[a-z][a-zA-Z0-9]*$",
                    "description": "方法名，如 findByCode"
                },
                "description": {
                    "type": "string"
                },
                "async": {
                    "type": "boolean",
                    "default": true
                },
                "parameters": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/MethodParameter"
                    }
                },
                "returnType": {
                    "type": "string",
                    "description": "返回类型"
                },
                "steps": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/LogicStep"
                    },
                    "description": "执行步骤"
                }
            }
        },
        "MethodParameter": {
            "type": "object",
            "required": ["name", "type"],
            "properties": {
                "name": { "type": "string" },
                "type": { "type": "string" },
                "optional": { "type": "boolean" }
            }
        },
        "LogicStep": {
            "type": "object",
            "required": ["type"],
            "properties": {
                "type": {
                    "type": "string",
                    "enum": [
                        "query",      // 数据库查询
                        "save",       // 保存数据
                        "update",     // 更新数据
                        "delete",     // 删除数据
                        "validate",   // 数据校验
                        "transform",  // 数据转换
                        "condition",  // 条件分支
                        "loop",       // 循环
                        "call",       // 调用其他服务
                        "return"      // 返回结果
                    ]
                },
                "config": {
                    "type": "object",
                    "description": "步骤配置，根据 type 不同结构不同"
                }
            }
        }
    }
}
```

---

## 4. 代码生成引擎

### 4.1 生成器架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          代码生成引擎架构                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     CodeGenerationEngine                             │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  ConfigLoader           加载配置快照                           │  │   │
│  │  │  ├── loadProductSnapshot(productId)                           │  │   │
│  │  │  └── resolveReferences()  解析组件间引用                       │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  GeneratorRegistry      生成器注册表                           │  │   │
│  │  │  ├── EntityGenerator     实体类生成器                          │  │   │
│  │  │  ├── DtoGenerator        DTO 类生成器                          │  │   │
│  │  │  ├── ControllerGenerator 控制器生成器                          │  │   │
│  │  │  ├── ServiceGenerator    服务类生成器                          │  │   │
│  │  │  ├── RepositoryGenerator 仓储类生成器                          │  │   │
│  │  │  ├── ModuleGenerator     模块文件生成器                         │  │   │
│  │  │  └── ProjectGenerator    项目结构生成器                         │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  CodeEmitter            代码输出                               │  │   │
│  │  │  ├── ts-morph           TypeScript AST 操作                    │  │   │
│  │  │  ├── prettier           代码格式化                             │  │   │
│  │  │  └── FileWriter         文件写入                               │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 生成器接口

```typescript
/**
 * 代码生成器接口
 */
interface CodeGenerator<TConfig, TContext> {
    /** 生成器名称 */
    readonly name: string;

    /** 支持的组件类型 */
    readonly supportedTypes: string[];

    /**
     * 生成代码
     * @param config 组件配置
     * @param context 生成上下文
     * @returns 生成的文件列表
     */
    generate(config: TConfig, context: GenerationContext): Promise<GeneratedFile[]>;
}

/**
 * 生成上下文
 */
interface GenerationContext {
    /** 产品代码 */
    productCode: string;
    /** 输出目录 */
    outputDir: string;
    /** 配置快照 */
    snapshot: ProductSnapshot;
    /** 已生成的文件（用于依赖追踪） */
    generatedFiles: Map<string, GeneratedFile>;
    /** 引用解析器 */
    referenceResolver: ReferenceResolver;
}

/**
 * 生成的文件
 */
interface GeneratedFile {
    /** 文件路径（相对于输出目录） */
    path: string;
    /** 文件内容 */
    content: string;
    /** 来源组件 */
    sourceComponent: {
        type: string;
        code: string;
    };
    /** 是否覆盖 */
    overwrite: boolean;
}
```

### 4.3 Entity 生成器示例

```typescript
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';

export class EntityGenerator implements CodeGenerator<ModelConfig, GenerationContext> {
    readonly name = 'EntityGenerator';
    readonly supportedTypes = ['model'];

    async generate(config: ModelConfig, context: GenerationContext): Promise<GeneratedFile[]> {
        const files: GeneratedFile[] = [];
        const project = new Project();

        for (const [entityCode, entity] of Object.entries(config.entities)) {
            const sourceFile = project.createSourceFile(
                `${entityCode}.entity.ts`,
                '',
                { overwrite: true }
            );

            // 添加导入
            this.addImports(sourceFile, entity);

            // 生成 Entity 类
            const entityClass = this.generateEntityClass(sourceFile, entity);

            // 生成字段
            this.generateFields(entityClass, entity.fields);

            // 注册实体
            this.addEntityRegistration(sourceFile, entity);

            files.push({
                path: `src/modules/${config.componentCode}/${entityCode}.entity.ts`,
                content: sourceFile.getFullText(),
                sourceComponent: {
                    type: 'model',
                    code: config.componentCode
                },
                overwrite: true
            });
        }

        return files;
    }

    private addImports(sourceFile: SourceFile, entity: EntityDefinition): void {
        sourceFile.addImportDeclaration({
            namedImports: ['Entity', 'Column', 'PrimaryColumn'],
            moduleSpecifier: 'typeorm'
        });
        sourceFile.addImportDeclaration({
            namedImports: ['registerEntity'],
            moduleSpecifier: '@cs/nest-typeorm'
        });
    }

    private generateEntityClass(sourceFile: SourceFile, entity: EntityDefinition): ClassDeclaration {
        return sourceFile.addClass({
            name: this.toPascalCase(entity.entityCode),
            isExported: true,
            decorators: [{
                name: 'Entity',
                arguments: [`'${entity.tableName}'`]
            }],
            docs: [{
                description: entity.entityName
            }]
        });
    }

    private generateFields(entityClass: ClassDeclaration, fields: FieldDefinition[]): void {
        for (const field of fields) {
            const decorators = this.getFieldDecorators(field);

            entityClass.addProperty({
                name: this.toCamelCase(field.fieldCode),
                type: this.mapFieldType(field.fieldType),
                hasExclamationToken: field.required,
                hasQuestionToken: !field.required,
                decorators
            });
        }
    }

    private getFieldDecorators(field: FieldDefinition): any[] {
        const decorators = [];

        if (field.primaryKey) {
            decorators.push({
                name: 'PrimaryColumn',
                arguments: [this.getColumnOptions(field)]
            });
        } else {
            decorators.push({
                name: 'Column',
                arguments: [this.getColumnOptions(field)]
            });
        }

        return decorators;
    }

    private getColumnOptions(field: FieldDefinition): string {
        const options: Record<string, any> = {
            name: field.fieldCode,
            type: this.mapToDbType(field.fieldType),
            comment: field.fieldName
        };

        if (field.length) options.length = field.length;
        if (!field.required) options.nullable = true;
        if (field.defaultValue !== undefined) options.default = field.defaultValue;

        return JSON.stringify(options);
    }

    private mapFieldType(type: string): string {
        const typeMap: Record<string, string> = {
            'string': 'string',
            'int': 'number',
            'bigint': 'string',  // BigInt 在 JS 中用 string 表示
            'decimal': 'number',
            'boolean': 'boolean',
            'date': 'Date',
            'datetime': 'Date',
            'text': 'string',
            'json': 'any'
        };
        return typeMap[type] || 'any';
    }

    private mapToDbType(type: string): string {
        const typeMap: Record<string, string> = {
            'string': 'varchar',
            'int': 'int',
            'bigint': 'bigint',
            'decimal': 'decimal',
            'boolean': 'tinyint',
            'date': 'date',
            'datetime': 'datetime',
            'text': 'text',
            'json': 'json'
        };
        return typeMap[type] || 'varchar';
    }

    private toPascalCase(str: string): string {
        return str.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
    }

    private toCamelCase(str: string): string {
        return str.replace(/_(\w)/g, (_, c) => c.toUpperCase());
    }
}
```

### 4.4 生成目录结构

```
generated/{product-code}/
├── package.json                    # 项目配置
├── tsconfig.json                   # TypeScript 配置
├── nest-cli.json                   # NestJS CLI 配置
├── config.yaml                     # 运行时配置
├── src/
│   ├── main.ts                     # 入口文件
│   ├── app.module.ts               # 根模块
│   ├── share.module.ts             # 共享模块
│   ├── common/                     # 公共代码
│   │   └── ...
│   └── modules/                    # 业务模块
│       ├── {module-a}/
│       │   ├── {entity-a}.entity.ts
│       │   ├── {entity-a}.dto.ts
│       │   ├── {entity-a}.controller.ts
│       │   ├── {entity-a}.service.ts
│       │   ├── {entity-a}.repository.ts  # 可选
│       │   └── {module-a}.module.ts
│       └── {module-b}/
│           └── ...
└── .generated                      # 生成元数据
    └── manifest.json               # 记录生成来源
```

---

## 5. 代码生成流程

### 5.1 完整流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          代码生成完整流程                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 触发生成                                                                 │
│     │                                                                       │
│     ├── 用户点击"发布"按钮                                                   │
│     └── API 调用: POST /api/v1/publish/generate                             │
│                                                                             │
│  2. 加载配置快照                                                             │
│     │                                                                       │
│     ├── 获取产品的所有模块                                                   │
│     ├── 获取模块下的所有组件（model, api, dto, logic, module）               │
│     └── 解析组件间的引用关系                                                 │
│                                                                             │
│  3. 初始化生成环境                                                           │
│     │                                                                       │
│     ├── 创建临时输出目录                                                     │
│     ├── 复制服务模板（projects/template）                                    │
│     └── 初始化 ts-morph Project                                             │
│                                                                             │
│  4. 按依赖顺序生成代码                                                       │
│     │                                                                       │
│     ├── 4.1 生成 Entity 文件（依赖 model 配置）                              │
│     ├── 4.2 生成 DTO 文件（依赖 model + dto 配置）                           │
│     ├── 4.3 生成 Repository 文件（依赖 model + repository 配置）             │
│     ├── 4.4 生成 Service 文件（依赖 model + logic 配置）                     │
│     ├── 4.5 生成 Controller 文件（依赖 api + dto 配置）                      │
│     └── 4.6 生成 Module 文件（依赖 module 配置 + 上述文件）                   │
│                                                                             │
│  5. 更新项目配置                                                             │
│     │                                                                       │
│     ├── 更新 app.module.ts（导入所有模块）                                   │
│     ├── 更新 package.json（依赖版本）                                        │
│     └── 生成 manifest.json（记录生成元数据）                                 │
│                                                                             │
│  6. 代码格式化                                                               │
│     │                                                                       │
│     └── prettier 格式化所有生成的 .ts 文件                                   │
│                                                                             │
│  7. 输出结果                                                                 │
│     │                                                                       │
│     ├── 返回生成目录路径                                                     │
│     └── 返回生成文件清单                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 生成服务接口

```typescript
/**
 * 代码生成服务
 */
export class CodeGenerationService {
    constructor(
        private readonly configLoader: ConfigLoader,
        private readonly generatorRegistry: GeneratorRegistry,
        private readonly templateService: TemplateService,
    ) {}

    /**
     * 生成产品代码
     */
    async generateProduct(productId: string, options: GenerateOptions): Promise<GenerationResult> {
        // 1. 加载配置快照
        const snapshot = await this.configLoader.loadProductSnapshot(productId);

        // 2. 初始化生成环境
        const outputDir = await this.templateService.prepareOutputDir(
            snapshot.productCode,
            options.outputBase
        );

        const context: GenerationContext = {
            productCode: snapshot.productCode,
            outputDir,
            snapshot,
            generatedFiles: new Map(),
            referenceResolver: new ReferenceResolver(snapshot)
        };

        // 3. 按依赖顺序生成
        const generationOrder = ['model', 'dto', 'repository', 'logic', 'api', 'module'];
        const allFiles: GeneratedFile[] = [];

        for (const componentType of generationOrder) {
            const components = snapshot.components.filter(c => c.type === componentType);
            const generator = this.generatorRegistry.getGenerator(componentType);

            if (generator && components.length > 0) {
                for (const component of components) {
                    const files = await generator.generate(component.config, context);
                    allFiles.push(...files);

                    // 更新已生成文件映射
                    for (const file of files) {
                        context.generatedFiles.set(file.path, file);
                    }
                }
            }
        }

        // 4. 生成项目配置文件
        const projectFiles = await this.generateProjectFiles(context);
        allFiles.push(...projectFiles);

        // 5. 写入文件
        await this.writeFiles(outputDir, allFiles);

        // 6. 格式化代码
        await this.formatCode(outputDir);

        // 7. 生成 manifest
        await this.generateManifest(outputDir, snapshot, allFiles);

        return {
            success: true,
            outputDir,
            files: allFiles.map(f => f.path),
            snapshot: {
                id: snapshot.id,
                version: snapshot.version
            }
        };
    }
}
```

---

## 6. 设计决策

| 决策点 | 选择 | 原因 |
|-------|------|------|
| 配置存储 | 复用 ab_component 表 | 统一配置管理，复用版本、缓存机制 |
| 代码生成工具 | ts-morph | TypeScript AST 操作，类型安全 |
| 生成粒度 | 产品级 | 一个产品一个服务，简化部署 |
| 模板管理 | 文件系统 | 简单直观，易于维护 |
| 代码格式化 | prettier | 业界标准，风格一致 |

---

## 7. 相关文档

| 文档 | 说明 |
|-----|------|
| [组件类型扩展规范](../01-storage/component-types.md) | 组件类型定义 |
| [配置详细设计](../01-storage/config-detail.md) | 配置存储结构 |
| [构建部署流程](../07-build-deploy/overview.md) | 构建和部署设计 |
