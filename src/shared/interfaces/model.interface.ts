import { ModelStatus, CacheStrategy } from '../constants/aseembox.constants';
import { IFieldDefinition, CreateFieldDto } from './field.interface';
import { IRelationDefinition, CreateRelationDto } from './relation.interface';
import { IActionDefinition, CreateActionDto } from './action.interface';

/**
 * 索引定义接口
 */
export interface IndexDefinition {
  name: string;
  columns: string[];
  unique: boolean;
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
  enableSoftDelete: boolean;
  enableVersion: boolean;
  enableAudit: boolean;
  enableTenant: boolean;
  cacheStrategy: CacheStrategy;
  cacheTTL?: number;
}

/**
 * 模型元信息接口
 */
export interface ModelMeta {
  tenantCode: string;
  status: ModelStatus;
  version: number;
  publishedAt?: Date;
}

/**
 * 模型定义接口（完整）
 */
export interface IModelDefinition {
  id: string;
  code: string;
  name: string;
  description?: string;
  tableName: string;
  databaseName?: string;

  config: ModelConfig;
  indexes?: IndexDefinition[];
  meta: ModelMeta;

  fields?: IFieldDefinition[];
  relations?: IRelationDefinition[];
  actions?: IActionDefinition[];

  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建模型 DTO
 */
export interface CreateModelDto {
  code: string;
  name: string;
  description?: string;
  tableName: string;
  databaseName?: string;
  config?: Partial<ModelConfig>;
  indexes?: IndexDefinition[];
  fields?: CreateFieldDto[];
  relations?: CreateRelationDto[];
  actions?: CreateActionDto[];
}

/**
 * 更新模型 DTO
 */
export interface UpdateModelDto {
  name?: string;
  description?: string;
  tableName?: string;
  databaseName?: string;
  config?: Partial<ModelConfig>;
  indexes?: IndexDefinition[];
}

/**
 * 发布模型 DTO
 */
export interface PublishModelDto {
  modelCode: string;
}

/**
 * 绑定表 DTO
 */
export interface BindTableDto {
  modelCode: string;
  tableName: string;
  databaseName?: string;
}

/**
 * 运行时模型定义（缓存使用）
 * 使用泛型以支持 Entity 和 Interface 类型的字段
 */
export interface RuntimeModelDefinition<
  M = any,
  F = any,
  R = any,
  A = any,
> {
  model: M;
  fields: F[];
  relations: R[];
  actions: A[];
}
