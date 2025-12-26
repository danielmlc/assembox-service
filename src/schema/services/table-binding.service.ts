import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { TableInspectorService, TableSchema, ColumnSchema } from './table-inspector.service';
import { MetaCacheService, ModelService, FieldService } from '../../meta/services';
import { FieldType, REQUIRED_TABLE_FIELDS, SYSTEM_FIELDS } from '../../shared/constants/aseembox.constants';
import { CreateFieldDto } from '../../shared/interfaces';

/**
 * 绑定结果
 */
export interface BindingResult {
  modelId: string;
  modelCode: string;
  tableName: string;
  fields: CreateFieldDto[];
  boundAt: Date;
}

/**
 * 表绑定服务
 * 负责将已存在的数据库表绑定到模型
 * 表预埋模式：表由 DBA 预先创建，平台只做元数据绑定
 */
@Injectable()
export class TableBindingService {
  private readonly logger = new Logger(TableBindingService.name);

  constructor(
    private readonly tableInspector: TableInspectorService,
    private readonly modelService: ModelService,
    private readonly fieldService: FieldService,
    private readonly metaCacheService: MetaCacheService,
  ) {}

  /**
   * 绑定已存在的表到模型
   */
  async bindTable(
    modelId: string,
    tableName: string,
    autoCreateFields: boolean = true,
  ): Promise<BindingResult> {
    // 1. 检查模型是否存在
    const model = await this.metaCacheService.getModelById(modelId);

    // 2. 检查表是否存在
    const tableExists = await this.tableInspector.tableExists(tableName);
    if (!tableExists) {
      throw new NotFoundException(`表 ${tableName} 不存在，请先由 DBA 创建`);
    }

    // 3. 获取表结构
    const tableSchema = await this.tableInspector.getTableSchema(tableName);

    // 4. 验证必要字段
    const { valid, missingFields } = await this.tableInspector.checkRequiredFields(
      tableName,
      REQUIRED_TABLE_FIELDS,
    );

    if (!valid) {
      throw new BadRequestException(
        `表 ${tableName} 缺少必要字段: ${missingFields.join(', ')}`,
      );
    }

    // 5. 更新模型的表名
    await this.modelService.update(modelId, { tableName });

    // 6. 自动生成字段元数据
    const fields = this.generateFieldDefinitions(tableSchema);

    // 7. 如果需要自动创建字段
    if (autoCreateFields && fields.length > 0) {
      await this.fieldService.createMany(modelId, fields);
    }

    // 8. 清除缓存
    await this.metaCacheService.invalidateModelFull(modelId, model.code);

    return {
      modelId,
      modelCode: model.code,
      tableName,
      fields,
      boundAt: new Date(),
    };
  }

  /**
   * 同步表结构到模型字段
   * 用于表结构变更后更新元数据
   */
  async syncTableSchema(modelCode: string): Promise<{
    added: string[];
    removed: string[];
    unchanged: string[];
  }> {
    const model = await this.metaCacheService.getModel(modelCode);
    const existingFields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    // 获取最新的表结构
    const tableSchema = await this.tableInspector.getTableSchema(model.tableName);

    // 比较差异
    const existingFieldCodes = new Set(existingFields.map(f => f.code));
    const tableColumns = new Set(tableSchema.columns.map(c => c.name));

    const added: string[] = [];
    const removed: string[] = [];
    const unchanged: string[] = [];

    // 找出新增的列
    for (const column of tableSchema.columns) {
      if (!existingFieldCodes.has(column.name)) {
        // 跳过系统字段
        if (!SYSTEM_FIELDS.includes(column.name)) {
          added.push(column.name);

          // 创建字段
          const fieldDto = this.columnToFieldDto(column);
          await this.fieldService.create(model.id, fieldDto);
        }
      } else {
        unchanged.push(column.name);
      }
    }

    // 找出删除的列（字段在元数据中存在但表中不存在）
    for (const field of existingFields) {
      if (!tableColumns.has(field.code) && !SYSTEM_FIELDS.includes(field.code)) {
        removed.push(field.code);

        // 软删除字段
        await this.fieldService.delete(field.id);
      }
    }

    // 清除缓存
    await this.metaCacheService.invalidateFields(model.id);

    return { added, removed, unchanged };
  }

  /**
   * 验证模型与表的兼容性
   */
  async validateCompatibility(modelCode: string): Promise<{
    compatible: boolean;
    issues: string[];
  }> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
    const issues: string[] = [];

    // 检查表是否存在
    const tableExists = await this.tableInspector.tableExists(model.tableName);
    if (!tableExists) {
      return {
        compatible: false,
        issues: [`表 ${model.tableName} 不存在`],
      };
    }

    // 获取表结构
    const tableSchema = await this.tableInspector.getTableSchema(model.tableName);
    const tableColumns = new Map(tableSchema.columns.map(c => [c.name, c]));

    // 检查每个字段
    for (const field of fields) {
      const column = tableColumns.get(field.code);

      if (!column) {
        issues.push(`字段 ${field.code} 在表中不存在`);
        continue;
      }

      // 检查类型兼容性
      const expectedDbType = this.fieldTypeToDbType(field.type as FieldType);
      if (!this.isTypeCompatible(expectedDbType, column.type)) {
        issues.push(
          `字段 ${field.code} 类型不兼容: 期望 ${expectedDbType}，实际 ${column.type}`,
        );
      }
    }

    return {
      compatible: issues.length === 0,
      issues,
    };
  }

  /**
   * 从表结构生成字段定义
   */
  private generateFieldDefinitions(tableSchema: TableSchema): CreateFieldDto[] {
    const fields: CreateFieldDto[] = [];

    for (const column of tableSchema.columns) {
      // 跳过系统字段
      if (SYSTEM_FIELDS.includes(column.name)) {
        continue;
      }

      fields.push(this.columnToFieldDto(column));
    }

    return fields;
  }

  /**
   * 将列定义转换为字段 DTO
   */
  private columnToFieldDto(column: ColumnSchema): CreateFieldDto {
    const fieldType = this.dbTypeToFieldType(column.type);

    return {
      code: column.name,
      name: column.comment || column.name,
      type: fieldType,
      dbType: this.formatDbType(column),
      constraints: {
        required: !column.nullable && !column.defaultValue,
        unique: false, // 需要从索引信息中获取
        primaryKey: column.isPrimary,
        default: column.defaultValue,
        length: column.length,
      },
    };
  }

  /**
   * 数据库类型转换为字段类型
   */
  private dbTypeToFieldType(dbType: string): FieldType {
    const typeMap: Record<string, FieldType> = {
      // 字符串类型
      varchar: FieldType.STRING,
      char: FieldType.STRING,
      text: FieldType.TEXT,
      tinytext: FieldType.TEXT,
      mediumtext: FieldType.TEXT,
      longtext: FieldType.TEXT,

      // 数字类型
      int: FieldType.INTEGER,
      tinyint: FieldType.INTEGER,
      smallint: FieldType.INTEGER,
      mediumint: FieldType.INTEGER,
      bigint: FieldType.INTEGER,
      float: FieldType.DECIMAL,
      double: FieldType.DECIMAL,
      decimal: FieldType.DECIMAL,

      // 日期时间类型
      date: FieldType.DATE,
      datetime: FieldType.DATETIME,
      timestamp: FieldType.TIMESTAMP,
      time: FieldType.STRING,
      year: FieldType.INTEGER,

      // JSON 类型
      json: FieldType.JSON,

      // 布尔类型（MySQL 用 tinyint(1)）
      bit: FieldType.BOOLEAN,

      // 枚举类型
      enum: FieldType.ENUM,
      set: FieldType.ARRAY,

      // 二进制类型
      blob: FieldType.STRING,
      binary: FieldType.STRING,
      varbinary: FieldType.STRING,
    };

    return typeMap[dbType.toLowerCase()] || FieldType.STRING;
  }

  /**
   * 字段类型转换为数据库类型
   */
  private fieldTypeToDbType(fieldType: FieldType): string {
    const typeMap: Record<FieldType, string> = {
      [FieldType.STRING]: 'varchar',
      [FieldType.TEXT]: 'text',
      [FieldType.NUMBER]: 'double',
      [FieldType.INTEGER]: 'bigint',
      [FieldType.DECIMAL]: 'decimal',
      [FieldType.BOOLEAN]: 'tinyint',
      [FieldType.DATE]: 'date',
      [FieldType.DATETIME]: 'datetime',
      [FieldType.TIMESTAMP]: 'timestamp',
      [FieldType.JSON]: 'json',
      [FieldType.ARRAY]: 'json',
      [FieldType.ENUM]: 'enum',
      [FieldType.RELATION]: 'varchar',
      [FieldType.FILE]: 'varchar',
      [FieldType.IMAGE]: 'varchar',
    };

    return typeMap[fieldType] || 'varchar';
  }

  /**
   * 格式化数据库类型
   */
  private formatDbType(column: ColumnSchema): string {
    let dbType = column.type;

    if (column.length) {
      dbType += `(${column.length})`;
    } else if (column.precision !== undefined) {
      if (column.scale !== undefined) {
        dbType += `(${column.precision},${column.scale})`;
      } else {
        dbType += `(${column.precision})`;
      }
    }

    return dbType;
  }

  /**
   * 检查类型兼容性
   */
  private isTypeCompatible(expected: string, actual: string): boolean {
    // 简化的类型兼容性检查
    const normalizedExpected = expected.toLowerCase();
    const normalizedActual = actual.toLowerCase();

    // 完全匹配
    if (normalizedExpected === normalizedActual) {
      return true;
    }

    // 兼容性映射
    const compatibilityGroups = [
      ['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'],
      ['int', 'tinyint', 'smallint', 'mediumint', 'bigint'],
      ['float', 'double', 'decimal'],
      ['datetime', 'timestamp'],
    ];

    for (const group of compatibilityGroups) {
      if (group.includes(normalizedExpected) && group.includes(normalizedActual)) {
        return true;
      }
    }

    return false;
  }
}
