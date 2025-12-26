import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MetaCacheService } from '../../meta/services';
import { FieldDefinitionEntity } from '../../meta/entities';
import { FieldType, ValidationType, SYSTEM_FIELDS } from '../../shared/constants/aseembox.constants';
import { ValidationRule } from '../../shared/interfaces';

/**
 * 验证错误
 */
export interface ValidationError {
  field: string;
  message: string;
  rule?: string;
  value?: any;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * 动态验证服务
 * 负责根据字段元数据验证数据
 */
@Injectable()
export class DynamicValidatorService {
  private readonly logger = new Logger(DynamicValidatorService.name);

  constructor(private readonly metaCacheService: MetaCacheService) {}

  /**
   * 验证数据
   */
  async validate(
    modelCode: string,
    data: Record<string, any>,
    isUpdate: boolean = false,
  ): Promise<ValidationResult> {
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
    const errors: ValidationError[] = [];

    // 创建字段映射
    const fieldMap = new Map<string, FieldDefinitionEntity>();
    for (const field of fields) {
      fieldMap.set(field.code, field);
    }

    // 验证必填字段（仅创建时）
    if (!isUpdate) {
      for (const field of fields) {
        if (field.constraints?.required && !SYSTEM_FIELDS.includes(field.code)) {
          if (data[field.code] === undefined || data[field.code] === null || data[field.code] === '') {
            errors.push({
              field: field.code,
              message: `${field.name || field.code} 是必填字段`,
              rule: 'required',
            });
          }
        }
      }
    }

    // 验证每个提供的字段
    for (const [key, value] of Object.entries(data)) {
      // 跳过系统字段
      if (SYSTEM_FIELDS.includes(key)) {
        continue;
      }

      const field = fieldMap.get(key);
      if (!field) {
        // 未知字段，跳过（或者可以选择报错）
        this.logger.warn(`Unknown field: ${key}`);
        continue;
      }

      // 跳过空值（如果不是必填）
      if (value === undefined || value === null || value === '') {
        continue;
      }

      // 类型验证
      const typeError = this.validateType(field, value);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      // 约束验证
      const constraintErrors = this.validateConstraints(field, value);
      errors.push(...constraintErrors);

      // 自定义规则验证
      const ruleErrors = this.validateRules(field, value);
      errors.push(...ruleErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证并抛出异常
   */
  async validateOrFail(
    modelCode: string,
    data: Record<string, any>,
    isUpdate: boolean = false,
  ): Promise<void> {
    const result = await this.validate(modelCode, data, isUpdate);
    if (!result.valid) {
      const messages = result.errors.map(e => `${e.field}: ${e.message}`);
      throw new BadRequestException({
        message: '数据验证失败',
        errors: result.errors,
        details: messages,
      });
    }
  }

  /**
   * 验证字段类型
   */
  private validateType(field: FieldDefinitionEntity, value: any): ValidationError | null {
    const { type, code, name } = field;
    const fieldName = name || code;

    switch (type) {
      case FieldType.STRING:
      case FieldType.TEXT:
        if (typeof value !== 'string') {
          return {
            field: code,
            message: `${fieldName} 必须是字符串类型`,
            rule: 'type',
            value,
          };
        }
        break;

      case FieldType.NUMBER:
      case FieldType.DECIMAL:
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            field: code,
            message: `${fieldName} 必须是数字类型`,
            rule: 'type',
            value,
          };
        }
        break;

      case FieldType.INTEGER:
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return {
            field: code,
            message: `${fieldName} 必须是整数类型`,
            rule: 'type',
            value,
          };
        }
        break;

      case FieldType.BOOLEAN:
        if (typeof value !== 'boolean') {
          return {
            field: code,
            message: `${fieldName} 必须是布尔类型`,
            rule: 'type',
            value,
          };
        }
        break;

      case FieldType.DATE:
      case FieldType.DATETIME:
      case FieldType.TIMESTAMP:
        if (!(value instanceof Date) && isNaN(Date.parse(value))) {
          return {
            field: code,
            message: `${fieldName} 必须是有效的日期格式`,
            rule: 'type',
            value,
          };
        }
        break;

      case FieldType.JSON:
        if (typeof value !== 'object') {
          return {
            field: code,
            message: `${fieldName} 必须是 JSON 对象`,
            rule: 'type',
            value,
          };
        }
        break;

      case FieldType.ARRAY:
        if (!Array.isArray(value)) {
          return {
            field: code,
            message: `${fieldName} 必须是数组类型`,
            rule: 'type',
            value,
          };
        }
        break;

      case FieldType.ENUM:
        // 枚举类型在 validateConstraints 中处理
        break;
    }

    return null;
  }

  /**
   * 验证字段约束
   */
  private validateConstraints(field: FieldDefinitionEntity, value: any): ValidationError[] {
    const errors: ValidationError[] = [];
    const { constraints, code, name } = field;
    const fieldName = name || code;

    if (!constraints) {
      return errors;
    }

    // 长度约束
    if (constraints.length !== undefined) {
      if (typeof value === 'string' && value.length > constraints.length) {
        errors.push({
          field: code,
          message: `${fieldName} 长度不能超过 ${constraints.length} 个字符`,
          rule: 'length',
          value,
        });
      }
    }

    // 枚举约束
    if (field.type === FieldType.ENUM && constraints.enum) {
      if (!constraints.enum.includes(value)) {
        errors.push({
          field: code,
          message: `${fieldName} 必须是以下值之一: ${constraints.enum.join(', ')}`,
          rule: 'enum',
          value,
        });
      }
    }

    return errors;
  }

  /**
   * 验证自定义规则
   */
  private validateRules(field: FieldDefinitionEntity, value: any): ValidationError[] {
    const errors: ValidationError[] = [];
    const { validations, code, name } = field;
    const fieldName = name || code;

    if (!validations || validations.length === 0) {
      return errors;
    }

    for (const rule of validations) {
      const error = this.validateRule(rule, code, fieldName, value);
      if (error) {
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * 验证单条规则
   */
  private validateRule(
    rule: ValidationRule,
    fieldCode: string,
    fieldName: string,
    value: any,
  ): ValidationError | null {
    switch (rule.type) {
      case ValidationType.REGEX:
        if (rule.pattern) {
          const regex = new RegExp(rule.pattern);
          if (!regex.test(String(value))) {
            return {
              field: fieldCode,
              message: rule.message || `${fieldName} 格式不正确`,
              rule: 'regex',
              value,
            };
          }
        }
        break;

      case ValidationType.RANGE:
        if (typeof value === 'number') {
          if (rule.min !== undefined && value < rule.min) {
            return {
              field: fieldCode,
              message: rule.message || `${fieldName} 不能小于 ${rule.min}`,
              rule: 'range',
              value,
            };
          }
          if (rule.max !== undefined && value > rule.max) {
            return {
              field: fieldCode,
              message: rule.message || `${fieldName} 不能大于 ${rule.max}`,
              rule: 'range',
              value,
            };
          }
        }
        break;

      case ValidationType.LENGTH:
        if (typeof value === 'string') {
          if (rule.min !== undefined && value.length < rule.min) {
            return {
              field: fieldCode,
              message: rule.message || `${fieldName} 长度不能少于 ${rule.min} 个字符`,
              rule: 'length',
              value,
            };
          }
          if (rule.max !== undefined && value.length > rule.max) {
            return {
              field: fieldCode,
              message: rule.message || `${fieldName} 长度不能超过 ${rule.max} 个字符`,
              rule: 'length',
              value,
            };
          }
        }
        break;

      case ValidationType.ENUM:
        if (rule.values && !rule.values.includes(value)) {
          return {
            field: fieldCode,
            message: rule.message || `${fieldName} 必须是允许的值之一`,
            rule: 'enum',
            value,
          };
        }
        break;

      case ValidationType.CUSTOM:
        // 自定义验证暂不实现，可以通过插件扩展
        break;
    }

    return null;
  }

  /**
   * 清理数据（移除无效字段，转换类型）
   */
  async sanitize(
    modelCode: string,
    data: Record<string, any>,
  ): Promise<Record<string, any>> {
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
    const fieldMap = new Map<string, FieldDefinitionEntity>();
    for (const field of fields) {
      fieldMap.set(field.code, field);
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      // 保留系统字段
      if (SYSTEM_FIELDS.includes(key)) {
        sanitized[key] = value;
        continue;
      }

      const field = fieldMap.get(key);
      if (!field) {
        // 跳过未定义的字段
        continue;
      }

      // 跳过空值
      if (value === undefined || value === null) {
        continue;
      }

      // 类型转换
      sanitized[key] = this.convertType(field, value);
    }

    return sanitized;
  }

  /**
   * 类型转换
   */
  private convertType(field: FieldDefinitionEntity, value: any): any {
    const { type } = field;

    try {
      switch (type) {
        case FieldType.STRING:
        case FieldType.TEXT:
          return String(value);

        case FieldType.NUMBER:
        case FieldType.DECIMAL:
          return Number(value);

        case FieldType.INTEGER:
          return parseInt(String(value), 10);

        case FieldType.BOOLEAN:
          if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
          }
          return Boolean(value);

        case FieldType.DATE:
        case FieldType.DATETIME:
        case FieldType.TIMESTAMP:
          if (value instanceof Date) {
            return value;
          }
          return new Date(value);

        case FieldType.JSON:
          if (typeof value === 'string') {
            return JSON.parse(value);
          }
          return value;

        case FieldType.ARRAY:
          if (typeof value === 'string') {
            return JSON.parse(value);
          }
          return Array.isArray(value) ? value : [value];

        default:
          return value;
      }
    } catch {
      // 转换失败，返回原值
      return value;
    }
  }
}
