import { Injectable, Logger } from '@nestjs/common';
import { ContextService } from '@cs/nest-common';
import { MetaCacheService } from '../../meta/services';
import { ModelDefinitionEntity, FieldDefinitionEntity } from '../../meta/entities';
import { QueryOptions, QueryCondition, SortConfig, AggregateOptions } from '../dto';
import { SYSTEM_FIELDS } from '../../shared/constants/aseembox.constants';

/**
 * SQL 构建结果
 */
export interface SqlBuildResult {
  sql: string;
  params: any[];
}

/**
 * SQL 构建服务
 * 负责根据元数据动态构建 SQL 语句
 */
@Injectable()
export class SqlBuilderService {
  private readonly logger = new Logger(SqlBuilderService.name);

  constructor(
    private readonly metaCacheService: MetaCacheService,
    private readonly contextService: ContextService,
  ) {}

  /**
   * 获取当前租户
   */
  private getTenantCode(): string {
    const tenantCode = this.contextService.getContext<string>('tenantCode');
    if (!tenantCode) {
      throw new Error('租户信息缺失');
    }
    return tenantCode;
  }

  /**
   * 转义标识符（表名、字段名）
   */
  private escapeIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  /**
   * 构建 SELECT 查询
   */
  async buildSelectQuery(
    modelCode: string,
    options: QueryOptions = {},
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const tableName = this.escapeIdentifier(model.tableName);
    const alias = 'm';

    // 构建 SELECT 字段
    const selectFields = this.buildSelectFields(fields, options.select, alias);

    // 构建 WHERE 子句
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(
      fields,
      options.where,
      alias,
    );

    // 构建 ORDER BY 子句
    const orderClause = this.buildOrderClause(options.orderBy, alias);

    // 构建分页
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(
      options.page,
      options.pageSize,
    );

    // 组装 SQL
    const sql = `SELECT ${selectFields} FROM ${tableName} AS ${alias}${whereClause}${orderClause}${limitClause}`;

    return {
      sql: sql.trim(),
      params: [...whereParams, ...limitParams],
    };
  }

  /**
   * 构建 COUNT 查询
   */
  async buildCountQuery(
    modelCode: string,
    options: QueryOptions = {},
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const tableName = this.escapeIdentifier(model.tableName);
    const alias = 'm';

    // 构建 WHERE 子句
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(
      fields,
      options.where,
      alias,
    );

    const sql = `SELECT COUNT(*) AS total FROM ${tableName} AS ${alias}${whereClause}`;

    return {
      sql: sql.trim(),
      params: whereParams,
    };
  }

  /**
   * 构建 INSERT 查询
   */
  async buildInsertQuery(
    modelCode: string,
    data: Record<string, any>,
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const tableName = this.escapeIdentifier(model.tableName);

    // 过滤有效字段
    const validData = this.filterValidFields(fields, data);

    // 添加审计字段
    const enrichedData = this.enrichCreateAuditFields(validData);

    const columns = Object.keys(enrichedData).map((k) => this.escapeIdentifier(k));
    const placeholders = columns.map(() => '?');
    const values = Object.values(enrichedData);

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;

    return {
      sql,
      params: values,
    };
  }

  /**
   * 构建批量 INSERT 查询
   */
  async buildBatchInsertQuery(
    modelCode: string,
    dataList: Record<string, any>[],
  ): Promise<SqlBuildResult> {
    if (dataList.length === 0) {
      throw new Error('批量插入数据不能为空');
    }

    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const tableName = this.escapeIdentifier(model.tableName);

    // 处理所有数据，获取统一的列
    const enrichedDataList = dataList.map((data) => {
      const validData = this.filterValidFields(fields, data);
      return this.enrichCreateAuditFields(validData);
    });

    // 使用第一条数据的键作为列
    const columns = Object.keys(enrichedDataList[0]).map((k) =>
      this.escapeIdentifier(k),
    );
    const placeholders = columns.map(() => '?').join(', ');
    const valueGroups = enrichedDataList.map(() => `(${placeholders})`);
    const values = enrichedDataList.flatMap((data) => Object.values(data));

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${valueGroups.join(', ')}`;

    return {
      sql,
      params: values,
    };
  }

  /**
   * 构建 UPDATE 查询
   */
  async buildUpdateQuery(
    modelCode: string,
    id: string,
    data: Record<string, any>,
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const tableName = this.escapeIdentifier(model.tableName);

    // 过滤有效字段（排除系统字段）
    const validData = this.filterValidFields(fields, data, true);

    // 添加更新审计字段
    const enrichedData = this.enrichUpdateAuditFields(validData);

    const setClauses = Object.keys(enrichedData).map(
      (k) => `${this.escapeIdentifier(k)} = ?`,
    );
    const values = Object.values(enrichedData);

    // 添加 WHERE 条件
    values.push(id);

    const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${this.escapeIdentifier('id')} = ?`;

    return {
      sql,
      params: values,
    };
  }

  /**
   * 构建批量 UPDATE 查询
   */
  async buildBatchUpdateQuery(
    modelCode: string,
    ids: string[],
    data: Record<string, any>,
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const tableName = this.escapeIdentifier(model.tableName);

    // 过滤有效字段
    const validData = this.filterValidFields(fields, data, true);
    const enrichedData = this.enrichUpdateAuditFields(validData);

    const setClauses = Object.keys(enrichedData).map(
      (k) => `${this.escapeIdentifier(k)} = ?`,
    );
    const values = Object.values(enrichedData);

    // 添加 WHERE 条件
    const placeholders = ids.map(() => '?').join(', ');
    values.push(...ids);

    const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${this.escapeIdentifier('id')} IN (${placeholders})`;

    return {
      sql,
      params: values,
    };
  }

  /**
   * 构建软删除查询
   */
  async buildSoftDeleteQuery(
    modelCode: string,
    id: string,
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const tableName = this.escapeIdentifier(model.tableName);

    const updateData = this.enrichUpdateAuditFields({ isRemoved: true });
    const setClauses = Object.keys(updateData).map(
      (k) => `${this.escapeIdentifier(k)} = ?`,
    );
    const values = Object.values(updateData);
    values.push(id);

    const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${this.escapeIdentifier('id')} = ?`;

    return {
      sql,
      params: values,
    };
  }

  /**
   * 构建批量软删除查询
   */
  async buildBatchSoftDeleteQuery(
    modelCode: string,
    ids: string[],
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const tableName = this.escapeIdentifier(model.tableName);

    const updateData = this.enrichUpdateAuditFields({ isRemoved: true });
    const setClauses = Object.keys(updateData).map(
      (k) => `${this.escapeIdentifier(k)} = ?`,
    );
    const values = Object.values(updateData);

    const placeholders = ids.map(() => '?').join(', ');
    values.push(...ids);

    const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${this.escapeIdentifier('id')} IN (${placeholders})`;

    return {
      sql,
      params: values,
    };
  }

  /**
   * 构建硬删除查询
   */
  async buildHardDeleteQuery(
    modelCode: string,
    id: string,
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const tableName = this.escapeIdentifier(model.tableName);

    const sql = `DELETE FROM ${tableName} WHERE ${this.escapeIdentifier('id')} = ?`;

    return {
      sql,
      params: [id],
    };
  }

  /**
   * 构建聚合查询
   */
  async buildAggregateQuery(
    modelCode: string,
    options: AggregateOptions,
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);

    const tableName = this.escapeIdentifier(model.tableName);
    const alias = 'm';

    // 构建 SELECT 聚合字段
    const selectParts: string[] = [];

    // 分组字段
    if (options.groupBy?.length) {
      for (const field of options.groupBy) {
        selectParts.push(`${alias}.${this.escapeIdentifier(field)}`);
      }
    }

    // 聚合函数
    for (const agg of options.aggregates) {
      const fieldRef =
        agg.field === '*' ? '*' : `${alias}.${this.escapeIdentifier(agg.field)}`;
      selectParts.push(`${agg.function.toUpperCase()}(${fieldRef}) AS ${this.escapeIdentifier(agg.alias)}`);
    }

    // 构建 WHERE 子句
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(
      fields,
      options.where,
      alias,
    );

    // 构建 GROUP BY 子句
    let groupByClause = '';
    if (options.groupBy?.length) {
      const groupFields = options.groupBy.map(
        (f) => `${alias}.${this.escapeIdentifier(f)}`,
      );
      groupByClause = ` GROUP BY ${groupFields.join(', ')}`;
    }

    // 构建 HAVING 子句
    const { clause: havingClause, params: havingParams } = this.buildHavingClause(
      options.having,
    );

    const sql = `SELECT ${selectParts.join(', ')} FROM ${tableName} AS ${alias}${whereClause}${groupByClause}${havingClause}`;

    return {
      sql: sql.trim(),
      params: [...whereParams, ...havingParams],
    };
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 构建 SELECT 字段列表
   */
  private buildSelectFields(
    fields: FieldDefinitionEntity[],
    select: string[] | undefined,
    alias: string,
  ): string {
    if (!select || select.length === 0) {
      return `${alias}.*`;
    }

    // 验证字段是否存在
    const fieldCodes = new Set(fields.map((f) => f.code));
    const validFields = select.filter(
      (f) => fieldCodes.has(f) || SYSTEM_FIELDS.includes(f),
    );

    if (validFields.length === 0) {
      return `${alias}.*`;
    }

    return validFields
      .map((f) => `${alias}.${this.escapeIdentifier(f)}`)
      .join(', ');
  }

  /**
   * 构建 WHERE 子句
   */
  private buildWhereClause(
    fields: FieldDefinitionEntity[],
    conditions: QueryCondition[] | undefined,
    alias: string,
  ): { clause: string; params: any[] } {
    const params: any[] = [];

    // 默认添加 isRemoved = false 条件
    const clauses: string[] = [`${alias}.${this.escapeIdentifier('isRemoved')} = ?`];
    params.push(false);

    if (!conditions || conditions.length === 0) {
      return { clause: ` WHERE ${clauses.join(' AND ')}`, params };
    }

    // 验证字段并构建条件
    const fieldCodes = new Set(fields.map((f) => f.code));

    for (const condition of conditions) {
      // 验证字段是否存在
      if (!fieldCodes.has(condition.field) && !SYSTEM_FIELDS.includes(condition.field)) {
        this.logger.warn(`Unknown field in condition: ${condition.field}`);
        continue;
      }

      const fieldRef = `${alias}.${this.escapeIdentifier(condition.field)}`;
      const { clause, values } = this.buildCondition(fieldRef, condition);

      if (clause) {
        clauses.push(clause);
        params.push(...values);
      }
    }

    return { clause: ` WHERE ${clauses.join(' AND ')}`, params };
  }

  /**
   * 构建单个条件
   */
  private buildCondition(
    fieldRef: string,
    condition: QueryCondition,
  ): { clause: string; values: any[] } {
    const { operator, value } = condition;

    switch (operator) {
      case 'eq':
        return { clause: `${fieldRef} = ?`, values: [value] };
      case 'ne':
        return { clause: `${fieldRef} != ?`, values: [value] };
      case 'gt':
        return { clause: `${fieldRef} > ?`, values: [value] };
      case 'gte':
        return { clause: `${fieldRef} >= ?`, values: [value] };
      case 'lt':
        return { clause: `${fieldRef} < ?`, values: [value] };
      case 'lte':
        return { clause: `${fieldRef} <= ?`, values: [value] };
      case 'like':
        return { clause: `${fieldRef} LIKE ?`, values: [`%${value}%`] };
      case 'notLike':
        return { clause: `${fieldRef} NOT LIKE ?`, values: [`%${value}%`] };
      case 'in':
        if (!Array.isArray(value) || value.length === 0) {
          return { clause: '', values: [] };
        }
        const inPlaceholders = value.map(() => '?').join(', ');
        return { clause: `${fieldRef} IN (${inPlaceholders})`, values: value };
      case 'notIn':
        if (!Array.isArray(value) || value.length === 0) {
          return { clause: '', values: [] };
        }
        const notInPlaceholders = value.map(() => '?').join(', ');
        return { clause: `${fieldRef} NOT IN (${notInPlaceholders})`, values: value };
      case 'isNull':
        return { clause: `${fieldRef} IS NULL`, values: [] };
      case 'isNotNull':
        return { clause: `${fieldRef} IS NOT NULL`, values: [] };
      case 'between':
        if (!Array.isArray(value) || value.length !== 2) {
          return { clause: '', values: [] };
        }
        return { clause: `${fieldRef} BETWEEN ? AND ?`, values: value };
      default:
        this.logger.warn(`Unknown operator: ${operator}`);
        return { clause: '', values: [] };
    }
  }

  /**
   * 构建 ORDER BY 子句
   */
  private buildOrderClause(
    orderBy: SortConfig[] | undefined,
    alias: string,
  ): string {
    if (!orderBy || orderBy.length === 0) {
      return '';
    }

    const orderParts = orderBy.map((sort) => {
      const fieldRef = `${alias}.${this.escapeIdentifier(sort.field)}`;
      const direction = sort.direction === 'DESC' ? 'DESC' : 'ASC';
      return `${fieldRef} ${direction}`;
    });

    return ` ORDER BY ${orderParts.join(', ')}`;
  }

  /**
   * 构建 LIMIT 子句
   */
  private buildLimitClause(
    page: number | undefined,
    pageSize: number | undefined,
  ): { clause: string; params: any[] } {
    if (!pageSize) {
      return { clause: '', params: [] };
    }

    const offset = ((page || 1) - 1) * pageSize;
    return { clause: ` LIMIT ? OFFSET ?`, params: [pageSize, offset] };
  }

  /**
   * 构建 HAVING 子句
   */
  private buildHavingClause(
    conditions: QueryCondition[] | undefined,
  ): { clause: string; params: any[] } {
    if (!conditions || conditions.length === 0) {
      return { clause: '', params: [] };
    }

    const clauses: string[] = [];
    const params: any[] = [];

    for (const condition of conditions) {
      const { clause, values } = this.buildCondition(
        this.escapeIdentifier(condition.field),
        condition,
      );
      if (clause) {
        clauses.push(clause);
        params.push(...values);
      }
    }

    if (clauses.length === 0) {
      return { clause: '', params: [] };
    }

    return { clause: ` HAVING ${clauses.join(' AND ')}`, params };
  }

  /**
   * 过滤有效字段
   */
  private filterValidFields(
    fields: FieldDefinitionEntity[],
    data: Record<string, any>,
    excludeSystemFields: boolean = false,
  ): Record<string, any> {
    const fieldCodes = new Set(fields.map((f) => f.code));
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      // 排除系统字段（在更新时）
      if (excludeSystemFields && SYSTEM_FIELDS.includes(key)) {
        continue;
      }

      // 只保留定义过的字段或特定的系统字段
      if (fieldCodes.has(key) || ['id', 'tenant'].includes(key)) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 添加创建审计字段
   */
  private enrichCreateAuditFields(data: Record<string, any>): Record<string, any> {
    const context = this.contextService.getAllContext();
    const now = new Date();

    return {
      ...data,
      tenant: data.tenant || context.tenantCode,
      createdAt: now,
      creatorId: context.userId || null,
      creatorName: context.userName || null,
      modifierAt: now,
      modifierId: context.userId || null,
      modifierName: context.userName || null,
      isRemoved: false,
      version: 1,
    };
  }

  /**
   * 添加更新审计字段
   */
  private enrichUpdateAuditFields(data: Record<string, any>): Record<string, any> {
    const context = this.contextService.getAllContext();
    const now = new Date();

    return {
      ...data,
      modifierAt: now,
      modifierId: context.userId || null,
      modifierName: context.userName || null,
    };
  }
}
