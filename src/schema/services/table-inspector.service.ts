import { Injectable, Logger, Inject } from '@nestjs/common';
import { DataSourceManagerImpl, DATA_SOURCE_MANAGER } from '@cs/nest-typeorm';

/**
 * 列信息
 */
export interface ColumnSchema {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  defaultValue?: any;
  isPrimary: boolean;
  isAutoIncrement: boolean;
  comment?: string;
}

/**
 * 索引信息
 */
export interface IndexSchema {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

/**
 * 表结构信息
 */
export interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
  comment?: string;
}

/**
 * 表检查服务
 * 负责读取数据库表结构信息
 */
@Injectable()
export class TableInspectorService {
  private readonly logger = new Logger(TableInspectorService.name);

  constructor(
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
  ) {}

  /**
   * 获取数据源
   */
  private getDataSource() {
    return this.dataSourceManager.getDataSource();
  }

  /**
   * 检查表是否存在
   */
  async tableExists(tableName: string): Promise<boolean> {
    const dataSource = this.getDataSource();

    const result = await dataSource.query(`
      SELECT COUNT(*) AS count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `, [tableName]);

    return parseInt(result[0]?.count || '0', 10) > 0;
  }

  /**
   * 获取表结构信息
   */
  async getTableSchema(tableName: string): Promise<TableSchema> {
    const dataSource = this.getDataSource();

    // 获取列信息
    const columnsResult = await dataSource.query(`
      SELECT
        COLUMN_NAME AS name,
        DATA_TYPE AS type,
        CHARACTER_MAXIMUM_LENGTH AS length,
        NUMERIC_PRECISION AS \`precision\`,
        NUMERIC_SCALE AS scale,
        IS_NULLABLE AS nullable,
        COLUMN_DEFAULT AS defaultValue,
        COLUMN_KEY AS columnKey,
        EXTRA AS extra,
        COLUMN_COMMENT AS comment
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [tableName]);

    const columns: ColumnSchema[] = columnsResult.map((col: any) => ({
      name: col.name,
      type: col.type,
      length: col.length ? parseInt(col.length, 10) : undefined,
      precision: col.precision ? parseInt(col.precision, 10) : undefined,
      scale: col.scale ? parseInt(col.scale, 10) : undefined,
      nullable: col.nullable === 'YES',
      defaultValue: col.defaultValue,
      isPrimary: col.columnKey === 'PRI',
      isAutoIncrement: col.extra?.includes('auto_increment') || false,
      comment: col.comment || undefined,
    }));

    // 获取索引信息
    const indexesResult = await dataSource.query(`
      SELECT
        INDEX_NAME AS indexName,
        COLUMN_NAME AS columnName,
        NON_UNIQUE AS nonUnique
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `, [tableName]);

    // 组装索引信息
    const indexMap = new Map<string, IndexSchema>();
    for (const row of indexesResult) {
      const name = row.indexName;
      if (!indexMap.has(name)) {
        indexMap.set(name, {
          name,
          columns: [],
          isUnique: row.nonUnique === 0,
          isPrimary: name === 'PRIMARY',
        });
      }
      indexMap.get(name)!.columns.push(row.columnName);
    }

    // 获取表注释
    const tableResult = await dataSource.query(`
      SELECT TABLE_COMMENT AS comment
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `, [tableName]);

    return {
      tableName,
      columns,
      indexes: Array.from(indexMap.values()),
      comment: tableResult[0]?.comment || undefined,
    };
  }

  /**
   * 获取数据库中的所有表
   */
  async listTables(): Promise<string[]> {
    const dataSource = this.getDataSource();

    const result = await dataSource.query(`
      SELECT TABLE_NAME AS tableName
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    return result.map((row: any) => row.tableName);
  }

  /**
   * 检查表是否包含必要字段
   */
  async checkRequiredFields(
    tableName: string,
    requiredFields: string[],
  ): Promise<{ valid: boolean; missingFields: string[] }> {
    const schema = await this.getTableSchema(tableName);
    const existingFields = new Set(schema.columns.map(c => c.name));
    const missingFields = requiredFields.filter(f => !existingFields.has(f));

    return {
      valid: missingFields.length === 0,
      missingFields,
    };
  }

  /**
   * 比较两个表结构的差异
   */
  compareSchemas(
    expected: TableSchema,
    actual: TableSchema,
  ): {
    missingColumns: string[];
    extraColumns: string[];
    typeMismatches: Array<{ column: string; expected: string; actual: string }>;
  } {
    const expectedColumns = new Map(expected.columns.map(c => [c.name, c]));
    const actualColumns = new Map(actual.columns.map(c => [c.name, c]));

    const missingColumns: string[] = [];
    const extraColumns: string[] = [];
    const typeMismatches: Array<{ column: string; expected: string; actual: string }> = [];

    // 检查缺失的列
    for (const [name, col] of expectedColumns) {
      if (!actualColumns.has(name)) {
        missingColumns.push(name);
      } else {
        const actualCol = actualColumns.get(name)!;
        if (col.type !== actualCol.type) {
          typeMismatches.push({
            column: name,
            expected: col.type,
            actual: actualCol.type,
          });
        }
      }
    }

    // 检查多余的列
    for (const name of actualColumns.keys()) {
      if (!expectedColumns.has(name)) {
        extraColumns.push(name);
      }
    }

    return {
      missingColumns,
      extraColumns,
      typeMismatches,
    };
  }
}
