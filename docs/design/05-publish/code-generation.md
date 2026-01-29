# 代码生成设计

> **状态**: 已完成
> **更新日期**: 2025-01-24

---

## 目录

1. [概述](#1-概述)
2. [生成器架构](#2-生成器架构)
3. [后端代码生成](#3-后端代码生成)
4. [配置文件生成](#4-配置文件生成)
5. [生成规则与约定](#5-生成规则与约定)
6. [自定义代码块设计](#6-自定义代码块设计)
7. [设计决策记录](#7-设计决策记录)

---

## 1. 概述

### 1.1 设计目标

代码生成器是 Assembox 发布流程的核心组件，负责将元数据配置转换为标准的 NestJS 后端代码。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        代码生成器定位                                        │
└─────────────────────────────────────────────────────────────────────────────┘

           元数据配置 (JSON)                    标准源代码
        ┌─────────────────┐               ┌─────────────────┐
        │  ModuleConfig   │               │  *.entity.ts    │
        │  ModelConfig    │               │  *.controller.ts│
        │  ApiConfig      │    编译器      │  *.service.ts   │
        │  LogicConfig    │ ═══════════▶  │  *.dto.ts       │
        │  PluginConfig   │               │  *.module.ts    │
        │  ...            │               │  ...            │
        └─────────────────┘               └─────────────────┘
                │                                  │
                │                                  │
            设计时产物                            编译产物
          （可视化配置）                       （可调试代码）
```

### 1.2 核心原则

| 原则 | 说明 |
|-----|------|
| **可读性优先** | 生成的代码应该像人写的一样清晰，便于理解和调试 |
| **类型安全** | 充分利用 TypeScript 类型系统，编译时发现错误 |
| **框架标准** | 遵循 NestJS 官方最佳实践，不发明新模式 |
| **幂等生成** | 相同输入总是产生相同输出，便于对比和版本控制 |
| **最小代码** | 只生成必要代码，避免冗余和过度抽象 |

### 1.3 技术选型

| 技术 | 用途 | 说明 |
|-----|------|------|
| **ts-morph** | AST 代码生成 | TypeScript 代码生成和操作的首选库 |
| **EJS** | 模板引擎 | 用于配置文件等模板场景 |
| **Prettier** | 代码格式化 | 统一代码风格 |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        技术组合                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ts-morph (AST)                  EJS (模板)                                │
│   ┌─────────────┐                 ┌─────────────┐                          │
│   │ - Entity    │                 │ - 配置文件   │                          │
│   │ - DTO       │                 │ - Dockerfile│                          │
│   │ - Service   │                 │ - YAML      │                          │
│   │ - Controller│                 │             │                          │
│   │ - Module    │                 │             │                          │
│   └──────┬──────┘                 └──────┬──────┘                          │
│          │                               │                                  │
│          └───────────────┬───────────────┘                                  │
│                          │                                                  │
│                          ▼                                                  │
│                   ┌─────────────┐                                           │
│                   │  Prettier   │                                           │
│                   │  格式化     │                                           │
│                   └─────────────┘                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 生成器架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        代码生成器架构                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         CodeGenerator (代码生成器)                           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      GeneratorOrchestrator                             │ │
│  │                          生成编排器                                     │ │
│  └────────────────────────────────┬──────────────────────────────────────┘ │
│                                   │                                         │
│                  ┌────────────────┴────────────────┐                       │
│                  │                                 │                       │
│                  ▼                                 ▼                       │
│          ┌─────────────┐                   ┌─────────────┐                │
│          │ Backend     │                   │ Config      │                │
│          │ Generator   │                   │ Generator   │                │
│          │ 后端生成器   │                   │ 配置生成器   │                │
│          └──────┬──────┘                   └──────┬──────┘                │
│                 │                                 │                        │
│    ┌────────────┼────────────┐        ┌──────────┼──────────┐            │
│    │            │            │        │          │          │            │
│    ▼            ▼            ▼        ▼          ▼          ▼            │
│ ┌──────┐  ┌──────┐  ┌──────┐   ┌──────┐  ┌──────┐  ┌──────┐            │
│ │Entity│  │Service│  │Control│   │Package│  │Docker│  │K8s   │            │
│ │Gen   │  │Gen   │  │Gen    │   │Gen   │  │Gen   │  │Gen   │            │
│ └──────┘  └──────┘  └──────┘   └──────┘  └──────┘  └──────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │    Generated Code   │
                        │    生成的源代码      │
                        └─────────────────────┘
```

### 2.2 核心接口定义

```typescript
/**
 * 代码生成器配置
 */
interface GeneratorConfig {
  // 产品信息
  product: {
    productId: string;
    productCode: string;
    productName: string;
  };

  // 输出目录
  outputDir: string;

  // 生成选项
  options: GeneratorOptions;
}

interface GeneratorOptions {
  // 是否生成后端代码
  generateBackend: boolean;

  // 是否生成前端代码
  generateFrontend: boolean;

  // 后端框架版本
  nestVersion: string;

  // 前端框架版本
  vueVersion: string;

  // 代码风格配置
  codeStyle: CodeStyleConfig;
}

/**
 * 代码生成上下文
 */
interface GeneratorContext {
  // 产品配置
  product: ProductConfig;

  // 所有模块配置
  modules: ModuleConfig[];

  // 输出目录
  outputDir: string;

  // 生成器选项
  options: GeneratorOptions;

  // AST 项目实例 (ts-morph)
  project: Project;

  // 辅助方法
  helpers: GeneratorHelpers;
}

/**
 * 生成器辅助方法
 */
interface GeneratorHelpers {
  // 命名转换
  toPascalCase(str: string): string;
  toCamelCase(str: string): string;
  toKebabCase(str: string): string;
  toSnakeCase(str: string): string;

  // 类型映射
  mapFieldType(fieldType: string): string;
  mapValidators(field: FieldConfig): string[];

  // 代码片段
  generateImports(imports: ImportSpec[]): string;
  generateDecorators(decorators: DecoratorSpec[]): string;
}

/**
 * 文件生成结果
 */
interface GeneratedFile {
  // 文件路径（相对于输出目录）
  path: string;

  // 文件内容
  content: string;

  // 文件类型
  type: 'typescript' | 'vue' | 'json' | 'yaml' | 'dockerfile';
}

/**
 * 生成结果
 */
interface GenerationResult {
  // 是否成功
  success: boolean;

  // 生成的文件列表
  files: GeneratedFile[];

  // 错误信息
  errors?: GenerationError[];

  // 统计信息
  stats: {
    totalFiles: number;
    backendFiles: number;
    frontendFiles: number;
    configFiles: number;
    generationTime: number;
  };
}
```

### 2.3 生成器编排流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        生成流程                                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │    开始生成任务      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  1. 加载元数据配置   │
                    │  - 读取产品配置      │
                    │  - 读取模块配置      │
                    │  - 校验配置完整性    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  2. 初始化生成上下文 │
                    │  - 创建 ts-morph     │
                    │  - 准备输出目录      │
                    │  - 加载模板         │
                    └──────────┬──────────┘
                               │
                               ▼
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ 3. 后端代码生成 │   │ 4. 前端代码生成 │   │ 5. 配置文件生成 │
│                │   │                │   │                │
│ - Entity       │   │ - Pages        │   │ - package.json │
│ - DTO          │   │ - Components   │   │ - tsconfig     │
│ - Controller   │   │ - Router       │   │ - Dockerfile   │
│ - Service      │   │ - API Client   │   │ - docker-compose│
│ - Module       │   │ - Store        │   │                │
└────────┬───────┘   └────────┬───────┘   └────────┬───────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  6. 代码格式化       │
                    │  - Prettier 格式化   │
                    │  - ESLint 检查      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  7. 输出到文件系统   │
                    │  - 写入文件         │
                    │  - 生成文件清单     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    生成完成         │
                    └─────────────────────┘
```

---

## 3. 后端代码生成

### 3.1 生成文件结构

```
backend/
├── src/
│   ├── app.module.ts              # 应用主模块
│   ├── main.ts                    # 入口文件
│   │
│   ├── modules/                   # 业务模块目录
│   │   ├── order/                 # 订单模块示例
│   │   │   ├── order.module.ts
│   │   │   ├── order.controller.ts
│   │   │   ├── order.service.ts
│   │   │   ├── entities/
│   │   │   │   └── order.entity.ts
│   │   │   └── dto/
│   │   │       ├── create-order.dto.ts
│   │   │       ├── update-order.dto.ts
│   │   │       └── query-order.dto.ts
│   │   │
│   │   └── product/               # 商品模块示例
│   │       ├── product.module.ts
│   │       ├── product.controller.ts
│   │       ├── product.service.ts
│   │       ├── entities/
│   │       │   └── product.entity.ts
│   │       └── dto/
│   │           └── ...
│   │
│   └── common/                    # 公共模块
│       ├── decorators/
│       ├── filters/
│       ├── guards/
│       ├── interceptors/
│       └── pipes/
│
├── package.json
├── tsconfig.json
├── nest-cli.json
└── Dockerfile
```

### 3.2 Entity 生成

#### 3.2.1 生成规则

```typescript
/**
 * Entity 生成器
 */
class EntityGenerator {
  /**
   * 从模型配置生成 Entity
   */
  generate(model: ModelConfig, context: GeneratorContext): GeneratedFile {
    const sourceFile = context.project.createSourceFile(
      `${model.modelCode}.entity.ts`,
      '',
      { overwrite: true }
    );

    // 1. 添加导入
    this.addImports(sourceFile, model);

    // 2. 创建实体类
    const entityClass = sourceFile.addClass({
      name: this.helpers.toPascalCase(model.modelCode) + 'Entity',
      isExported: true,
      decorators: [{ name: 'Entity', arguments: [`'${model.tableName}'`] }],
    });

    // 3. 添加字段
    for (const field of model.fields) {
      this.addField(entityClass, field);
    }

    return {
      path: `src/modules/${model.moduleCode}/entities/${model.modelCode}.entity.ts`,
      content: sourceFile.getFullText(),
      type: 'typescript',
    };
  }

  private addImports(sourceFile: SourceFile, model: ModelConfig): void {
    // TypeORM 导入
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'typeorm',
      namedImports: [
        'Entity',
        'Column',
        'PrimaryColumn',
        'CreateDateColumn',
        'UpdateDateColumn',
      ],
    });

    // 如果有关联，添加关联导入
    if (model.relations?.length > 0) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: 'typeorm',
        namedImports: ['ManyToOne', 'OneToMany', 'JoinColumn'],
      });
    }
  }

  private addField(classDecl: ClassDeclaration, field: FieldConfig): void {
    const decorators = this.buildFieldDecorators(field);
    const typeAnnotation = this.mapToTsType(field.fieldType);

    classDecl.addProperty({
      name: this.helpers.toCamelCase(field.fieldCode),
      type: typeAnnotation,
      decorators,
    });
  }

  private buildFieldDecorators(field: FieldConfig): DecoratorStructure[] {
    const decorators: DecoratorStructure[] = [];

    // 主键
    if (field.isPrimaryKey) {
      decorators.push({
        name: 'PrimaryColumn',
        arguments: [`{ type: 'bigint', comment: '${field.fieldName}' }`],
      });
    }
    // 普通列
    else {
      const columnOptions = this.buildColumnOptions(field);
      decorators.push({
        name: 'Column',
        arguments: [columnOptions],
      });
    }

    return decorators;
  }

  private buildColumnOptions(field: FieldConfig): string {
    const options: string[] = [];

    // 类型映射
    options.push(`type: '${this.mapToDbType(field.fieldType)}'`);

    // 字段名
    options.push(`name: '${field.fieldCode}'`);

    // 注释
    if (field.fieldName) {
      options.push(`comment: '${field.fieldName}'`);
    }

    // 长度
    if (field.length) {
      options.push(`length: ${field.length}`);
    }

    // 可空
    options.push(`nullable: ${!field.required}`);

    // 默认值
    if (field.defaultValue !== undefined) {
      options.push(`default: ${JSON.stringify(field.defaultValue)}`);
    }

    return `{ ${options.join(', ')} }`;
  }

  private mapToTsType(fieldType: string): string {
    const typeMap: Record<string, string> = {
      string: 'string',
      text: 'string',
      integer: 'number',
      bigint: 'string', // bigint 用 string 避免精度丢失
      decimal: 'number',
      boolean: 'boolean',
      date: 'Date',
      datetime: 'Date',
      json: 'Record<string, any>',
    };
    return typeMap[fieldType] || 'any';
  }

  private mapToDbType(fieldType: string): string {
    const typeMap: Record<string, string> = {
      string: 'varchar',
      text: 'text',
      integer: 'int',
      bigint: 'bigint',
      decimal: 'decimal',
      boolean: 'tinyint',
      date: 'date',
      datetime: 'datetime',
      json: 'json',
    };
    return typeMap[fieldType] || 'varchar';
  }
}
```

#### 3.2.2 生成示例

**输入配置：**

```json
{
  "modelCode": "order",
  "modelName": "订单",
  "tableName": "ab_order",
  "moduleCode": "order",
  "fields": [
    {
      "fieldCode": "id",
      "fieldName": "主键",
      "fieldType": "bigint",
      "isPrimaryKey": true,
      "required": true
    },
    {
      "fieldCode": "order_no",
      "fieldName": "订单号",
      "fieldType": "string",
      "length": 50,
      "required": true
    },
    {
      "fieldCode": "total_amount",
      "fieldName": "订单金额",
      "fieldType": "decimal",
      "precision": 10,
      "scale": 2,
      "required": true
    },
    {
      "fieldCode": "status",
      "fieldName": "订单状态",
      "fieldType": "integer",
      "defaultValue": 0
    },
    {
      "fieldCode": "created_at",
      "fieldName": "创建时间",
      "fieldType": "datetime"
    }
  ]
}
```

**生成代码：**

```typescript
// src/modules/order/entities/order.entity.ts

import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('ab_order')
export class OrderEntity {
  @PrimaryColumn({ type: 'bigint', comment: '主键' })
  id: string;

  @Column({ type: 'varchar', name: 'order_no', comment: '订单号', length: 50, nullable: false })
  orderNo: string;

  @Column({ type: 'decimal', name: 'total_amount', comment: '订单金额', precision: 10, scale: 2, nullable: false })
  totalAmount: number;

  @Column({ type: 'int', name: 'status', comment: '订单状态', nullable: true, default: 0 })
  status: number;

  @CreateDateColumn({ type: 'datetime', name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}
```

### 3.3 DTO 生成

#### 3.3.1 生成规则

```typescript
/**
 * DTO 生成器
 */
class DtoGenerator {
  /**
   * 生成 Create DTO
   */
  generateCreateDto(model: ModelConfig, context: GeneratorContext): GeneratedFile {
    const sourceFile = context.project.createSourceFile(
      `create-${model.modelCode}.dto.ts`,
      '',
      { overwrite: true }
    );

    // 添加 class-validator 导入
    const validators = this.collectValidators(model.fields);
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'class-validator',
      namedImports: validators,
    });

    // 创建 DTO 类
    const dtoClass = sourceFile.addClass({
      name: `Create${this.helpers.toPascalCase(model.modelCode)}Dto`,
      isExported: true,
    });

    // 添加可创建字段（排除主键、审计字段）
    const creatableFields = model.fields.filter(
      (f) => !f.isPrimaryKey && !this.isAuditField(f.fieldCode)
    );

    for (const field of creatableFields) {
      this.addDtoField(dtoClass, field);
    }

    return {
      path: `src/modules/${model.moduleCode}/dto/create-${model.modelCode}.dto.ts`,
      content: sourceFile.getFullText(),
      type: 'typescript',
    };
  }

  /**
   * 生成 Update DTO
   */
  generateUpdateDto(model: ModelConfig, context: GeneratorContext): GeneratedFile {
    const sourceFile = context.project.createSourceFile(
      `update-${model.modelCode}.dto.ts`,
      '',
      { overwrite: true }
    );

    // 导入 PartialType 和 CreateDto
    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/mapped-types',
      namedImports: ['PartialType'],
    });
    sourceFile.addImportDeclaration({
      moduleSpecifier: `./create-${model.modelCode}.dto`,
      namedImports: [`Create${this.helpers.toPascalCase(model.modelCode)}Dto`],
    });

    // 创建 Update DTO（继承 PartialType）
    sourceFile.addClass({
      name: `Update${this.helpers.toPascalCase(model.modelCode)}Dto`,
      isExported: true,
      extends: `PartialType(Create${this.helpers.toPascalCase(model.modelCode)}Dto)`,
    });

    return {
      path: `src/modules/${model.moduleCode}/dto/update-${model.modelCode}.dto.ts`,
      content: sourceFile.getFullText(),
      type: 'typescript',
    };
  }

  /**
   * 生成 Query DTO
   */
  generateQueryDto(model: ModelConfig, context: GeneratorContext): GeneratedFile {
    const sourceFile = context.project.createSourceFile(
      `query-${model.modelCode}.dto.ts`,
      '',
      { overwrite: true }
    );

    sourceFile.addImportDeclaration({
      moduleSpecifier: 'class-validator',
      namedImports: ['IsOptional', 'IsInt', 'Min'],
    });
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'class-transformer',
      namedImports: ['Type'],
    });

    const dtoClass = sourceFile.addClass({
      name: `Query${this.helpers.toPascalCase(model.modelCode)}Dto`,
      isExported: true,
    });

    // 分页参数
    dtoClass.addProperty({
      name: 'page',
      type: 'number',
      hasQuestionToken: true,
      decorators: [
        { name: 'IsOptional', arguments: [] },
        { name: 'Type', arguments: ['() => Number'] },
        { name: 'IsInt', arguments: [] },
        { name: 'Min', arguments: ['1'] },
      ],
    });

    dtoClass.addProperty({
      name: 'pageSize',
      type: 'number',
      hasQuestionToken: true,
      decorators: [
        { name: 'IsOptional', arguments: [] },
        { name: 'Type', arguments: ['() => Number'] },
        { name: 'IsInt', arguments: [] },
        { name: 'Min', arguments: ['1'] },
      ],
    });

    // 添加可查询字段
    const queryableFields = model.fields.filter((f) => f.queryable);
    for (const field of queryableFields) {
      this.addQueryField(dtoClass, field);
    }

    return {
      path: `src/modules/${model.moduleCode}/dto/query-${model.modelCode}.dto.ts`,
      content: sourceFile.getFullText(),
      type: 'typescript',
    };
  }

  private addDtoField(classDecl: ClassDeclaration, field: FieldConfig): void {
    const decorators = this.buildValidatorDecorators(field);
    const typeAnnotation = this.mapToTsType(field.fieldType);

    classDecl.addProperty({
      name: this.helpers.toCamelCase(field.fieldCode),
      type: typeAnnotation,
      hasQuestionToken: !field.required,
      decorators,
    });
  }

  private buildValidatorDecorators(field: FieldConfig): DecoratorStructure[] {
    const decorators: DecoratorStructure[] = [];

    // 非必填
    if (!field.required) {
      decorators.push({ name: 'IsOptional', arguments: [] });
    }

    // 类型校验
    switch (field.fieldType) {
      case 'string':
      case 'text':
        decorators.push({ name: 'IsString', arguments: [] });
        if (field.length) {
          decorators.push({
            name: 'MaxLength',
            arguments: [field.length.toString()],
          });
        }
        break;
      case 'integer':
      case 'bigint':
        decorators.push({ name: 'IsInt', arguments: [] });
        break;
      case 'decimal':
        decorators.push({ name: 'IsNumber', arguments: [] });
        break;
      case 'boolean':
        decorators.push({ name: 'IsBoolean', arguments: [] });
        break;
      case 'date':
      case 'datetime':
        decorators.push({ name: 'IsDateString', arguments: [] });
        break;
    }

    // 必填校验
    if (field.required) {
      decorators.push({ name: 'IsNotEmpty', arguments: [] });
    }

    return decorators;
  }
}
```

#### 3.3.2 生成示例

**生成的 Create DTO：**

```typescript
// src/modules/order/dto/create-order.dto.ts

import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @MaxLength(50)
  @IsNotEmpty()
  orderNo: string;

  @IsNumber()
  @IsNotEmpty()
  totalAmount: number;

  @IsOptional()
  @IsInt()
  status?: number;
}
```

**生成的 Update DTO：**

```typescript
// src/modules/order/dto/update-order.dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}
```

### 3.4 Controller 生成

#### 3.4.1 生成规则

```typescript
/**
 * Controller 生成器
 */
class ControllerGenerator {
  generate(model: ModelConfig, apis: ApiConfig[], context: GeneratorContext): GeneratedFile {
    const sourceFile = context.project.createSourceFile(
      `${model.modelCode}.controller.ts`,
      '',
      { overwrite: true }
    );

    const className = this.helpers.toPascalCase(model.modelCode);

    // 添加导入
    this.addImports(sourceFile, model, apis);

    // 创建 Controller 类
    const controllerClass = sourceFile.addClass({
      name: `${className}Controller`,
      isExported: true,
      decorators: [
        {
          name: 'Controller',
          arguments: [`'${model.moduleCode}/${model.modelCode}'`],
        },
      ],
    });

    // 添加构造函数注入
    controllerClass.addConstructor({
      parameters: [
        {
          name: `${this.helpers.toCamelCase(model.modelCode)}Service`,
          type: `${className}Service`,
          isReadonly: true,
          scope: Scope.Private,
        },
      ],
    });

    // 生成 API 方法
    for (const api of apis) {
      this.addApiMethod(controllerClass, api, model);
    }

    return {
      path: `src/modules/${model.moduleCode}/${model.modelCode}.controller.ts`,
      content: sourceFile.getFullText(),
      type: 'typescript',
    };
  }

  private addApiMethod(
    classDecl: ClassDeclaration,
    api: ApiConfig,
    model: ModelConfig
  ): void {
    const methodDecorator = this.getHttpMethodDecorator(api.method);
    const decorators: DecoratorStructure[] = [
      { name: methodDecorator, arguments: api.path ? [`'${api.path}'`] : [] },
    ];

    // 添加方法
    const method = classDecl.addMethod({
      name: api.apiCode,
      isAsync: true,
      decorators,
      parameters: this.buildMethodParameters(api),
      returnType: `Promise<${this.getReturnType(api)}>`,
    });

    // 方法体
    method.setBodyText(this.generateMethodBody(api, model));
  }

  private buildMethodParameters(api: ApiConfig): ParameterDeclarationStructure[] {
    const params: ParameterDeclarationStructure[] = [];

    // 路径参数
    if (api.pathParams?.length > 0) {
      for (const param of api.pathParams) {
        params.push({
          name: param.name,
          type: param.type,
          decorators: [{ name: 'Param', arguments: [`'${param.name}'`] }],
        });
      }
    }

    // Query 参数
    if (api.method === 'GET' && api.hasQuery) {
      params.push({
        name: 'query',
        type: `Query${this.helpers.toPascalCase(api.modelCode)}Dto`,
        decorators: [{ name: 'Query', arguments: [] }],
      });
    }

    // Body 参数
    if (['POST', 'PUT', 'PATCH'].includes(api.method)) {
      const dtoType = api.method === 'POST' ? 'Create' : 'Update';
      params.push({
        name: 'dto',
        type: `${dtoType}${this.helpers.toPascalCase(api.modelCode)}Dto`,
        decorators: [{ name: 'Body', arguments: [] }],
      });
    }

    return params;
  }

  private generateMethodBody(api: ApiConfig, model: ModelConfig): string {
    const serviceName = `this.${this.helpers.toCamelCase(model.modelCode)}Service`;

    switch (api.apiType) {
      case 'create':
        return `return ${serviceName}.create(dto);`;
      case 'update':
        return `return ${serviceName}.update(id, dto);`;
      case 'delete':
        return `return ${serviceName}.remove(id);`;
      case 'detail':
        return `return ${serviceName}.findOne(id);`;
      case 'list':
        return `return ${serviceName}.findAll(query);`;
      case 'custom':
        return this.generateCustomMethodBody(api);
      default:
        return '// TODO: Implement';
    }
  }
}
```

#### 3.4.2 生成示例

```typescript
// src/modules/order/order.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

@Controller('order/order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  async create(@Body() dto: CreateOrderDto) {
    return this.orderService.create(dto);
  }

  @Get()
  async findAll(@Query() query: QueryOrderDto) {
    return this.orderService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.orderService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.orderService.remove(id);
  }
}
```

### 3.5 Service 生成

#### 3.5.1 生成示例

```typescript
// src/modules/order/order.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
  ) {}

  async create(dto: CreateOrderDto): Promise<OrderEntity> {
    const entity = this.orderRepository.create(dto);
    return this.orderRepository.save(entity);
  }

  async findAll(query: QueryOrderDto) {
    const { page = 1, pageSize = 10, ...filters } = query;
    const [data, total] = await this.orderRepository.findAndCount({
      where: filters,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<OrderEntity> {
    const entity = await this.orderRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Order #${id} not found`);
    }
    return entity;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderEntity> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.orderRepository.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.orderRepository.remove(entity);
  }
}
```

### 3.6 Module 生成

```typescript
// src/modules/order/order.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderEntity } from './entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
```

---

## 4. 配置文件生成

### 4.1 package.json 生成

```json
{
  "name": "product-service",
  "version": "1.0.0",
  "description": "Generated by Assembox CodeGenerator",
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "nest start",
    "start:prod": "node dist/main",
    "test": "jest",
    "test:cov": "jest --coverage"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/typeorm": "^10.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.0",
    "mysql2": "^3.6.0",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.17"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@nestjs/testing": "^10.0.0",
    "@types/express": "^4.17.17",
    "@types/jest": "^29.5.2",
    "@types/node": "^20.3.1",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.1",
    "typescript": "^5.1.3"
  }
}
```

### 4.2 Dockerfile 生成

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci

# 构建
COPY . .
RUN npm run build

# 生产镜像
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 只复制必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### 4.3 docker-compose.yml 生成

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=${DB_HOST}
      - DB_PORT=${DB_PORT}
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_DATABASE=${DB_DATABASE}
    depends_on:
      - mysql
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_PASSWORD}
      - MYSQL_DATABASE=${DB_DATABASE}
    volumes:
      - mysql_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  mysql_data:
```

---

## 5. 生成规则与约定

### 5.1 命名约定

| 类型 | 规则 | 示例 |
|-----|------|------|
| **Entity 类名** | PascalCase + Entity 后缀 | `OrderEntity` |
| **DTO 类名** | 前缀 + PascalCase + Dto 后缀 | `CreateOrderDto` |
| **Service 类名** | PascalCase + Service 后缀 | `OrderService` |
| **Controller 类名** | PascalCase + Controller 后缀 | `OrderController` |
| **Module 类名** | PascalCase + Module 后缀 | `OrderModule` |
| **数据库字段** | snake_case | `order_no` |
| **TypeScript 属性** | camelCase | `orderNo` |

### 5.2 类型映射

| 元数据类型 | TypeScript 类型 | 数据库类型 | 验证器 |
|-----------|----------------|-----------|--------|
| string | string | VARCHAR | IsString, MaxLength |
| text | string | TEXT | IsString |
| integer | number | INT | IsInt |
| bigint | string | BIGINT | IsString |
| decimal | number | DECIMAL | IsNumber |
| boolean | boolean | TINYINT(1) | IsBoolean |
| date | Date | DATE | IsDateString |
| datetime | Date | DATETIME | IsDateString |
| json | Record<string, any> | JSON | IsObject |

### 5.3 代码组织规则

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        代码组织原则                                          │
└─────────────────────────────────────────────────────────────────────────────┘

1. 一个模块一个目录
   modules/
   ├── order/         # 订单模块
   ├── product/       # 商品模块
   └── user/          # 用户模块

2. 模块内部结构统一
   order/
   ├── order.module.ts
   ├── order.controller.ts
   ├── order.service.ts
   ├── entities/
   │   └── order.entity.ts
   └── dto/
       ├── create-order.dto.ts
       ├── update-order.dto.ts
       └── query-order.dto.ts

3. 公共代码提取到 common
   common/
   ├── decorators/    # 公共装饰器
   ├── filters/       # 异常过滤器
   ├── guards/        # 守卫
   ├── interceptors/  # 拦截器
   └── pipes/         # 管道
```

---

## 6. 自定义代码块设计

> **设计理念**: 虽然 Assembox 的核心原则是"元数据是唯一真实来源"，但企业级场景中总有 1% 的需求是低代码配置无法满足的。自定义代码块提供可控的"逃生舱"，允许开发者在特定位置注入手写代码，且在重新生成时不会被覆盖。

### 6.1 设计目标

| 目标 | 说明 |
|-----|------|
| **可控扩展** | 仅在预定义的插槽位置允许自定义，不破坏整体架构 |
| **类型安全** | 自定义代码可访问生成代码的类型定义，IDE 有完整提示 |
| **版本追踪** | 自定义代码纳入元数据版本管理，可回溯 |
| **重生成安全** | 重新生成代码时保留自定义代码块，不覆盖 |

### 6.2 架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        自定义代码块架构                                       │
└─────────────────────────────────────────────────────────────────────────────┘

        元数据配置                                     生成的代码
    ┌──────────────────┐                        ┌──────────────────────┐
    │  ServiceConfig   │                        │  order.service.ts    │
    │  ┌────────────┐  │                        │  ┌────────────────┐  │
    │  │ customBlocks│ │     代码生成器          │  │ 标准 CRUD 方法  │  │
    │  │  - beforeCreate │  ═══════════════▶   │  │                │  │
    │  │  - afterCreate  │                      │  │ // @custom:beforeCreate │
    │  │  - methods[]    │                      │  │ { 自定义代码 } │  │
    │  └────────────┘  │                        │  │                │  │
    └──────────────────┘                        │  │ // @custom:end │  │
                                                │  └────────────────┘  │
                                                └──────────────────────┘
```

### 6.3 元数据配置扩展

```typescript
/**
 * 服务配置（扩展自定义代码块）
 */
interface ServiceConfig {
  modelCode: string;
  operations: OperationConfig[];

  /**
   * 自定义代码块配置
   */
  customBlocks?: CustomBlockConfig;
}

interface CustomBlockConfig {
  /**
   * 生命周期钩子 - 在特定操作前后执行
   */
  hooks?: {
    beforeCreate?: CustomCodeBlock;
    afterCreate?: CustomCodeBlock;
    beforeUpdate?: CustomCodeBlock;
    afterUpdate?: CustomCodeBlock;
    beforeDelete?: CustomCodeBlock;
    afterDelete?: CustomCodeBlock;
    beforeQuery?: CustomCodeBlock;
    afterQuery?: CustomCodeBlock;
  };

  /**
   * 完全自定义的方法
   */
  methods?: CustomMethod[];

  /**
   * 额外的导入语句
   */
  imports?: CustomImport[];
}

interface CustomCodeBlock {
  /**
   * 代码内容（TypeScript）
   */
  code: string;

  /**
   * 代码说明
   */
  description?: string;

  /**
   * 创建时间
   */
  createdAt: Date;

  /**
   * 修改时间
   */
  updatedAt: Date;

  /**
   * 修改人
   */
  modifier?: string;
}

interface CustomMethod {
  /**
   * 方法名
   */
  name: string;

  /**
   * 方法签名
   */
  signature: string;

  /**
   * 方法体
   */
  body: string;

  /**
   * 装饰器（可选）
   */
  decorators?: string[];

  /**
   * 是否异步
   */
  isAsync: boolean;

  /**
   * 方法说明
   */
  description?: string;
}

interface CustomImport {
  /**
   * 模块路径
   */
  moduleSpecifier: string;

  /**
   * 命名导入
   */
  namedImports?: string[];

  /**
   * 默认导入
   */
  defaultImport?: string;
}
```

### 6.4 代码生成器处理

#### 6.4.1 生成流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     自定义代码块生成流程                                      │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   加载服务配置       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  检查是否有 customBlocks │
                    └──────────┬──────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
               ▼                               ▼
        ┌────────────┐                  ┌────────────┐
        │ 有自定义代码 │                  │ 无自定义代码 │
        └──────┬─────┘                  └──────┬─────┘
               │                               │
               ▼                               │
        ┌────────────────┐                     │
        │ 解析钩子位置    │                     │
        │ 注入自定义代码  │                     │
        │ 添加自定义方法  │                     │
        │ 合并额外导入   │                     │
        └──────┬─────────┘                     │
               │                               │
               └───────────────┬───────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   输出最终代码       │
                    └─────────────────────┘
```

#### 6.4.2 Service 生成器扩展

```typescript
class ServiceGenerator {
  generate(model: ModelConfig, service: ServiceConfig, context: GeneratorContext): GeneratedFile {
    const sourceFile = context.project.createSourceFile(
      `${model.modelCode}.service.ts`,
      '',
      { overwrite: true }
    );

    const className = context.helpers.toPascalCase(model.modelCode);

    // 1. 添加标准导入
    this.addStandardImports(sourceFile, model);

    // 2. 添加自定义导入（如果有）
    if (service.customBlocks?.imports) {
      this.addCustomImports(sourceFile, service.customBlocks.imports);
    }

    // 3. 创建 Service 类
    const serviceClass = sourceFile.addClass({
      name: `${className}Service`,
      isExported: true,
      decorators: [{ name: 'Injectable', arguments: [] }],
    });

    // 4. 添加构造函数
    this.addConstructor(serviceClass, model);

    // 5. 添加标准 CRUD 方法（带钩子插槽）
    this.addCrudMethods(serviceClass, model, service.customBlocks?.hooks);

    // 6. 添加自定义方法（如果有）
    if (service.customBlocks?.methods) {
      this.addCustomMethods(serviceClass, service.customBlocks.methods);
    }

    return {
      path: `src/modules/${model.moduleCode}/${model.modelCode}.service.ts`,
      content: sourceFile.getFullText(),
      type: 'typescript',
    };
  }

  /**
   * 生成带钩子插槽的 create 方法
   */
  private generateCreateMethod(
    classDecl: ClassDeclaration,
    model: ModelConfig,
    hooks?: CustomBlockConfig['hooks']
  ): void {
    const method = classDecl.addMethod({
      name: 'create',
      isAsync: true,
      parameters: [{ name: 'dto', type: `Create${model.modelCode}Dto` }],
      returnType: `Promise<${model.modelCode}Entity>`,
    });

    // 构建方法体
    let body = '';

    // beforeCreate 钩子
    if (hooks?.beforeCreate) {
      body += `
    // @custom:beforeCreate - ${hooks.beforeCreate.description || '自定义前置逻辑'}
    ${hooks.beforeCreate.code}
    // @custom:end

`;
    }

    // 标准创建逻辑
    body += `
    const entity = this.repository.create(dto);
    const result = await this.repository.save(entity);
`;

    // afterCreate 钩子
    if (hooks?.afterCreate) {
      body += `
    // @custom:afterCreate - ${hooks.afterCreate.description || '自定义后置逻辑'}
    ${hooks.afterCreate.code}
    // @custom:end

`;
    }

    body += `
    return result;`;

    method.setBodyText(body.trim());
  }

  /**
   * 添加自定义方法
   */
  private addCustomMethods(
    classDecl: ClassDeclaration,
    methods: CustomMethod[]
  ): void {
    for (const customMethod of methods) {
      const decorators = customMethod.decorators?.map(d => ({
        name: d,
        arguments: [],
      })) || [];

      classDecl.addMethod({
        name: customMethod.name,
        isAsync: customMethod.isAsync,
        decorators,
        // 从签名解析参数和返回类型
        ...this.parseMethodSignature(customMethod.signature),
      }).setBodyText(`
    // @custom:method - ${customMethod.description || '自定义方法'}
    ${customMethod.body}
    // @custom:end
      `.trim());
    }
  }
}
```

### 6.5 生成示例

#### 6.5.1 元数据配置示例

```json
{
  "modelCode": "order",
  "operations": ["create", "read", "update", "delete"],
  "customBlocks": {
    "hooks": {
      "beforeCreate": {
        "code": "dto.orderNo = await this.generateOrderNo();",
        "description": "自动生成订单号"
      },
      "afterCreate": {
        "code": "await this.notificationService.sendOrderCreatedEmail(result);",
        "description": "发送订单创建通知"
      }
    },
    "methods": [
      {
        "name": "generateOrderNo",
        "signature": "(): Promise<string>",
        "body": "const date = new Date();\nconst prefix = `ORD${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;\nconst seq = await this.getNextSequence('order');\nreturn `${prefix}${String(seq).padStart(6, '0')}`;",
        "isAsync": true,
        "description": "生成订单号"
      },
      {
        "name": "calculateTotalWithDiscount",
        "signature": "(orderId: string, discountRate: number): Promise<number>",
        "body": "const order = await this.findOne(orderId);\nreturn order.totalAmount * (1 - discountRate);",
        "isAsync": true,
        "description": "计算折扣后金额"
      }
    ],
    "imports": [
      {
        "moduleSpecifier": "../notification/notification.service",
        "namedImports": ["NotificationService"]
      }
    ]
  }
}
```

#### 6.5.2 生成的代码

```typescript
// src/modules/order/order.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
// 自定义导入
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repository: Repository<OrderEntity>,
    // 自定义依赖注入
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateOrderDto): Promise<OrderEntity> {
    // @custom:beforeCreate - 自动生成订单号
    dto.orderNo = await this.generateOrderNo();
    // @custom:end

    const entity = this.repository.create(dto);
    const result = await this.repository.save(entity);

    // @custom:afterCreate - 发送订单创建通知
    await this.notificationService.sendOrderCreatedEmail(result);
    // @custom:end

    return result;
  }

  async findAll(query: QueryOrderDto) {
    const { page = 1, pageSize = 10, ...filters } = query;
    const [data, total] = await this.repository.findAndCount({
      where: filters,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<OrderEntity> {
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Order #${id} not found`);
    }
    return entity;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderEntity> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repository.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repository.remove(entity);
  }

  // @custom:method - 生成订单号
  async generateOrderNo(): Promise<string> {
    const date = new Date();
    const prefix = `ORD${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const seq = await this.getNextSequence('order');
    return `${prefix}${String(seq).padStart(6, '0')}`;
  }
  // @custom:end

  // @custom:method - 计算折扣后金额
  async calculateTotalWithDiscount(orderId: string, discountRate: number): Promise<number> {
    const order = await this.findOne(orderId);
    return order.totalAmount * (1 - discountRate);
  }
  // @custom:end
}
```

### 6.6 约束与限制

| 约束 | 说明 |
|-----|------|
| **插槽位置固定** | 只能在预定义的钩子点注入代码，不能修改标准逻辑 |
| **类型检查** | 自定义代码在生成后由 TypeScript 编译器检查，语法错误会在构建时发现 |
| **依赖管理** | 自定义导入的模块必须是项目中已存在的，不会自动安装新依赖 |
| **命名冲突** | 自定义方法名不能与标准 CRUD 方法名冲突 |
| **访问范围** | 自定义代码只能访问 Service 类的成员和注入的依赖 |

### 6.7 版本管理

自定义代码块作为元数据的一部分，享受完整的版本管理：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        自定义代码块版本追踪                                   │
└─────────────────────────────────────────────────────────────────────────────┘

    服务配置 v1.0                服务配置 v1.1                服务配置 v1.2
    ┌────────────┐              ┌────────────┐              ┌────────────┐
    │ customBlocks │  ──────▶   │ customBlocks │  ──────▶   │ customBlocks │
    │ - beforeCreate│            │ - beforeCreate│            │ - beforeCreate│
    │   (初版)      │            │   (修改)      │            │   (优化)      │
    └────────────┘              └────────────┘              └────────────┘
           │                           │                           │
           ▼                           ▼                           ▼
    ┌────────────┐              ┌────────────┐              ┌────────────┐
    │ 生成代码 v1.0│              │ 生成代码 v1.1│              │ 生成代码 v1.2│
    └────────────┘              └────────────┘              └────────────┘
```

---

## 7. 设计决策记录

| 问题 | 决策 | 说明 |
|-----|------|------|
| 代码生成技术 | ts-morph + EJS | ts-morph 用于 TS 代码，EJS 用于配置文件 |
| bigint 类型映射 | 映射为 string | 避免 JavaScript 精度丢失问题 |
| DTO 生成策略 | 独立 Create/Update/Query | 职责清晰，便于校验 |
| 验证器选择 | class-validator | NestJS 官方推荐，与框架深度集成 |
| **自定义代码块** | **钩子 + 自定义方法** | **提供可控的扩展能力，不破坏代码生成的一致性** |

---
