import { Injectable, Logger } from '@nestjs/common';
import { MetaCacheService } from '../../meta/services';
import { FieldDefinitionEntity, ModelDefinitionEntity } from '../../meta/entities';
import { FieldType, SYSTEM_FIELDS } from '../../shared/constants/aseembox.constants';

/**
 * DDL 生成服务
 * 负责根据模型元数据生成 DDL 语句供 DBA 参考
 * 注意：生成的 DDL 不会自动执行，需要人工审核后执行
 */
@Injectable()
export class DDLGeneratorService {
  private readonly logger = new Logger(DDLGeneratorService.name);

  constructor(private readonly metaCacheService: MetaCacheService) {}

  /**
   * 生成创建表的 DDL
   */
  async generateCreateTable(modelCode: string): Promise<string> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const tableName = model.tableName || `t_${modelCode}`;
    const columns: string[] = [];
    const indexes: string[] = [];

    // 添加系统字段
    columns.push(...this.getSystemFieldDefinitions());

    // 添加业务字段
    for (const field of fields) {
      const columnDef = this.fieldToColumnDefinition(field);
      if (columnDef) {
        columns.push(columnDef);
      }

      // 检查唯一约束
      if (field.constraints?.unique) {
        indexes.push(`UNIQUE KEY \`uk_${field.code}\` (\`${field.code}\`)`);
      }
    }

    // 添加主键
    columns.push('PRIMARY KEY (`id`)');

    // 添加常用索引
    indexes.push('INDEX `idx_tenant` (`tenant`)');
    indexes.push('INDEX `idx_created_at` (`createdAt`)');
    indexes.push('INDEX `idx_is_removed` (`isRemoved`)');

    // 组装 DDL
    const allDefinitions = [...columns, ...indexes];
    const comment = model.name || modelCode;

    return `-- 由 AseemBox 低代码平台生成
-- 模型: ${modelCode}
-- 生成时间: ${new Date().toISOString()}
-- 注意: 请由 DBA 审核后执行

CREATE TABLE IF NOT EXISTS \`${tableName}\` (
  ${allDefinitions.join(',\n  ')}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='${comment}';
`;
  }

  /**
   * 生成添加字段的 DDL
   */
  async generateAddColumn(
    modelCode: string,
    fieldCode: string,
  ): Promise<string> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
    const field = fields.find(f => f.code === fieldCode);

    if (!field) {
      throw new Error(`字段 ${fieldCode} 不存在`);
    }

    const tableName = model.tableName;
    const columnDef = this.fieldToColumnDefinition(field);

    return `-- 添加字段
-- 模型: ${modelCode}
-- 字段: ${fieldCode}
-- 生成时间: ${new Date().toISOString()}

ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDef};
`;
  }

  /**
   * 生成修改字段的 DDL
   */
  async generateModifyColumn(
    modelCode: string,
    fieldCode: string,
  ): Promise<string> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
    const field = fields.find(f => f.code === fieldCode);

    if (!field) {
      throw new Error(`字段 ${fieldCode} 不存在`);
    }

    const tableName = model.tableName;
    const columnDef = this.fieldToColumnDefinition(field);

    return `-- 修改字段
-- 模型: ${modelCode}
-- 字段: ${fieldCode}
-- 生成时间: ${new Date().toISOString()}
-- 警告: 修改字段类型可能导致数据丢失，请谨慎操作

ALTER TABLE \`${tableName}\` MODIFY COLUMN ${columnDef};
`;
  }

  /**
   * 生成删除字段的 DDL
   */
  generateDropColumn(tableName: string, fieldCode: string): string {
    return `-- 删除字段
-- 表: ${tableName}
-- 字段: ${fieldCode}
-- 生成时间: ${new Date().toISOString()}
-- 警告: 删除字段将永久丢失数据，请确保已备份

ALTER TABLE \`${tableName}\` DROP COLUMN \`${fieldCode}\`;
`;
  }

  /**
   * 生成添加索引的 DDL
   */
  generateAddIndex(
    tableName: string,
    indexName: string,
    columns: string[],
    isUnique: boolean = false,
  ): string {
    const indexType = isUnique ? 'UNIQUE INDEX' : 'INDEX';
    const columnList = columns.map(c => `\`${c}\``).join(', ');

    return `-- 添加索引
-- 表: ${tableName}
-- 索引: ${indexName}
-- 生成时间: ${new Date().toISOString()}

ALTER TABLE \`${tableName}\` ADD ${indexType} \`${indexName}\` (${columnList});
`;
  }

  /**
   * 生成删除索引的 DDL
   */
  generateDropIndex(tableName: string, indexName: string): string {
    return `-- 删除索引
-- 表: ${tableName}
-- 索引: ${indexName}
-- 生成时间: ${new Date().toISOString()}

ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\`;
`;
  }

  /**
   * 生成完整的迁移脚本
   */
  async generateMigration(modelCode: string): Promise<{
    up: string;
    down: string;
  }> {
    const model = await this.metaCacheService.getModel(modelCode);
    const tableName = model.tableName;

    const up = await this.generateCreateTable(modelCode);
    const down = `-- 回滚脚本
-- 模型: ${modelCode}
-- 生成时间: ${new Date().toISOString()}
-- 警告: 删除表将永久丢失数据，请确保已备份

DROP TABLE IF EXISTS \`${tableName}\`;
`;

    return { up, down };
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 获取系统字段定义
   */
  private getSystemFieldDefinitions(): string[] {
    return [
      '`id` VARCHAR(32) NOT NULL COMMENT \'主键ID\'',
      '`tenant` VARCHAR(64) NOT NULL COMMENT \'租户代码\'',
      '`createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT \'创建时间\'',
      '`creatorId` VARCHAR(32) NULL COMMENT \'创建人ID\'',
      '`creatorName` VARCHAR(100) NULL COMMENT \'创建人姓名\'',
      '`modifierAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT \'修改时间\'',
      '`modifierId` VARCHAR(32) NULL COMMENT \'修改人ID\'',
      '`modifierName` VARCHAR(100) NULL COMMENT \'修改人姓名\'',
      '`isRemoved` TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'是否删除\'',
      '`version` INT NOT NULL DEFAULT 1 COMMENT \'版本号\'',
    ];
  }

  /**
   * 将字段定义转换为列定义
   */
  private fieldToColumnDefinition(field: FieldDefinitionEntity): string | null {
    // 跳过系统字段
    if (SYSTEM_FIELDS.includes(field.code)) {
      return null;
    }

    const dbType = field.dbType || this.fieldTypeToDbType(field.type as FieldType, field.constraints);
    const nullable = field.constraints?.required ? 'NOT NULL' : 'NULL';
    const defaultValue = this.getDefaultValueClause(field);
    const comment = field.name || field.code;

    return `\`${field.code}\` ${dbType} ${nullable}${defaultValue} COMMENT '${comment}'`;
  }

  /**
   * 字段类型转换为数据库类型
   */
  private fieldTypeToDbType(
    fieldType: FieldType,
    constraints?: { length?: number },
  ): string {
    const length = constraints?.length;

    switch (fieldType) {
      case FieldType.STRING:
        return `VARCHAR(${length || 255})`;
      case FieldType.TEXT:
        return 'TEXT';
      case FieldType.NUMBER:
        return 'DOUBLE';
      case FieldType.INTEGER:
        return 'BIGINT';
      case FieldType.DECIMAL:
        return 'DECIMAL(18,4)';
      case FieldType.BOOLEAN:
        return 'TINYINT(1)';
      case FieldType.DATE:
        return 'DATE';
      case FieldType.DATETIME:
        return 'DATETIME';
      case FieldType.TIMESTAMP:
        return 'TIMESTAMP';
      case FieldType.JSON:
      case FieldType.ARRAY:
        return 'JSON';
      case FieldType.ENUM:
        return `VARCHAR(${length || 50})`;
      case FieldType.RELATION:
        return 'VARCHAR(32)';
      case FieldType.FILE:
      case FieldType.IMAGE:
        return 'VARCHAR(500)';
      default:
        return `VARCHAR(${length || 255})`;
    }
  }

  /**
   * 获取默认值子句
   */
  private getDefaultValueClause(field: FieldDefinitionEntity): string {
    const defaultValue = field.constraints?.default;

    if (defaultValue === undefined || defaultValue === null) {
      return '';
    }

    // 根据类型处理默认值
    const fieldType = field.type as FieldType;

    switch (fieldType) {
      case FieldType.STRING:
      case FieldType.TEXT:
      case FieldType.ENUM:
        return ` DEFAULT '${defaultValue}'`;
      case FieldType.NUMBER:
      case FieldType.INTEGER:
      case FieldType.DECIMAL:
        return ` DEFAULT ${defaultValue}`;
      case FieldType.BOOLEAN:
        return ` DEFAULT ${defaultValue ? 1 : 0}`;
      case FieldType.JSON:
      case FieldType.ARRAY:
        return ` DEFAULT '${JSON.stringify(defaultValue)}'`;
      default:
        return '';
    }
  }
}
