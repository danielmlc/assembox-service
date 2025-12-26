import { FieldType, ValidationType } from '../constants/aseembox.constants';

/**
 * 验证规则接口
 */
export interface ValidationRule {
  type: ValidationType;
  value?: any;
  message?: string;
  pattern?: string;
  min?: number;
  max?: number;
  values?: any[];
}

/**
 * 字段约束接口
 */
export interface FieldConstraints {
  required: boolean;
  unique: boolean;
  primaryKey: boolean;
  autoIncrement?: boolean;
  default?: any;
  length?: number;
  precision?: number;
  scale?: number;
  enum?: any[];
}

/**
 * 字段 UI 配置接口
 */
export interface FieldUIConfig {
  component: string;
  props?: Record<string, any>;
  visible: boolean;
  editable: boolean;
  sortable: boolean;
  filterable: boolean;
}

/**
 * 计算字段配置接口
 */
export interface ComputedFieldConfig {
  expression: string;
  trigger: 'read' | 'write';
}

/**
 * 字段定义接口
 */
export interface IFieldDefinition {
  id: string;
  code: string;
  name: string;
  description?: string;
  modelId: string;

  type: FieldType;
  dbType: string;

  constraints: FieldConstraints;
  validations?: ValidationRule[];
  ui?: FieldUIConfig;
  computed?: ComputedFieldConfig;

  sortOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建字段 DTO
 */
export interface CreateFieldDto {
  code: string;
  name: string;
  description?: string;
  type: FieldType;
  dbType: string;
  constraints: FieldConstraints;
  validations?: ValidationRule[];
  ui?: FieldUIConfig;
  computed?: ComputedFieldConfig;
  sortOrder?: number;
}

/**
 * 更新字段 DTO
 */
export interface UpdateFieldDto extends Partial<CreateFieldDto> {}
