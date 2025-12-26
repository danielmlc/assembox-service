import { Injectable, Logger } from '@nestjs/common';
import { ContextService } from '@cs/nest-common';
import { MetaCacheService } from '../../meta/services';
import { ModelDefinitionEntity, RelationDefinitionEntity, FieldDefinitionEntity } from '../../meta/entities';
import { QueryOptions, QueryCondition, SortConfig } from '../dto';
import { JoinType, SYSTEM_FIELDS } from '../../shared/constants/aseembox.constants';
import { SqlBuildResult } from './sql-builder.service';

/**
 * JOIN 构建服务
 * 负责构建带关联查询的 SQL
 */
@Injectable()
export class JoinBuilderService {
  private readonly logger = new Logger(JoinBuilderService.name);

  constructor(
    private readonly metaCacheService: MetaCacheService,
    private readonly contextService: ContextService,
  ) {}

  /**
   * 转义标识符
   */
  private escapeIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  /**
   * 构建带关联的查询 SQL
   */
  async buildQueryWithRelations(
    modelCode: string,
    options: QueryOptions,
    includeRelations: string[],
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
    const allRelations = await this.metaCacheService.getRelationsByModelCode(modelCode);

    const mainAlias = 'm';
    const tableName = this.escapeIdentifier(model.tableName);

    // 构建主表 SELECT 字段
    let selectFields = this.buildMainSelectFields(fields, options.select, mainAlias);

    // 收集 JOIN 子句
    const joinClauses: string[] = [];
    const relationAliases: Map<string, string> = new Map();

    // 处理每个关联
    for (const relationCode of includeRelations) {
      const relation = allRelations.find((r) => r.code === relationCode);
      if (!relation) {
        this.logger.warn(`Relation not found: ${relationCode}`);
        continue;
      }

      const alias = `r_${relationCode}`;
      relationAliases.set(relationCode, alias);

      // 获取目标模型
      const targetModel = await this.metaCacheService.getModel(relation.targetModelCode);
      const targetFields = await this.metaCacheService.getFieldsByModelCode(relation.targetModelCode);

      // 构建 JOIN 子句
      const joinClause = this.buildJoinClause(relation, targetModel, mainAlias, alias);
      joinClauses.push(joinClause);

      // 添加关联字段到 SELECT
      const relationSelectFields = this.buildRelationSelectFields(
        relation,
        targetFields,
        alias,
      );
      if (relationSelectFields) {
        selectFields += `, ${relationSelectFields}`;
      }
    }

    // 构建 WHERE 子句
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(
      fields,
      options.where,
      mainAlias,
    );

    // 构建 ORDER BY 子句
    const orderClause = this.buildOrderClause(options.orderBy, mainAlias);

    // 构建 LIMIT 子句
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(
      options.page,
      options.pageSize,
    );

    // 组装 SQL
    const joinClausesStr = joinClauses.length > 0 ? `\n${joinClauses.join('\n')}` : '';
    const sql = `SELECT ${selectFields}
FROM ${tableName} AS ${mainAlias}${joinClausesStr}${whereClause}${orderClause}${limitClause}`;

    return {
      sql: sql.trim(),
      params: [...whereParams, ...limitParams],
    };
  }

  /**
   * 构建带关联的 COUNT 查询
   */
  async buildCountWithRelations(
    modelCode: string,
    options: QueryOptions,
    includeRelations: string[],
  ): Promise<SqlBuildResult> {
    const model = await this.metaCacheService.getModel(modelCode);
    const fields = await this.metaCacheService.getFieldsByModelCode(modelCode);
    const allRelations = await this.metaCacheService.getRelationsByModelCode(modelCode);

    const mainAlias = 'm';
    const tableName = this.escapeIdentifier(model.tableName);

    // 收集 JOIN 子句
    const joinClauses: string[] = [];

    for (const relationCode of includeRelations) {
      const relation = allRelations.find((r) => r.code === relationCode);
      if (!relation) continue;

      const alias = `r_${relationCode}`;
      const targetModel = await this.metaCacheService.getModel(relation.targetModelCode);

      const joinClause = this.buildJoinClause(relation, targetModel, mainAlias, alias);
      joinClauses.push(joinClause);
    }

    // 构建 WHERE 子句
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(
      fields,
      options.where,
      mainAlias,
    );

    const joinClausesStr = joinClauses.length > 0 ? `\n${joinClauses.join('\n')}` : '';
    const sql = `SELECT COUNT(DISTINCT ${mainAlias}.${this.escapeIdentifier('id')}) AS total
FROM ${tableName} AS ${mainAlias}${joinClausesStr}${whereClause}`;

    return {
      sql: sql.trim(),
      params: whereParams,
    };
  }

  /**
   * 构建嵌套关联查询（一对多）
   */
  async buildNestedQuery(
    parentModelCode: string,
    parentIds: string[],
    relationCode: string,
  ): Promise<SqlBuildResult> {
    const allRelations = await this.metaCacheService.getRelationsByModelCode(parentModelCode);
    const relation = allRelations.find((r) => r.code === relationCode);

    if (!relation) {
      throw new Error(`Relation not found: ${relationCode}`);
    }

    const targetModel = await this.metaCacheService.getModel(relation.targetModelCode);
    const targetFields = await this.metaCacheService.getFieldsByModelCode(relation.targetModelCode);

    const tableName = this.escapeIdentifier(targetModel.tableName);
    const alias = 't';

    // 获取要包含的字段
    const selectFields = this.buildMainSelectFields(targetFields, undefined, alias);

    // 添加外键字段用于后续映射
    const foreignKeyField = `${alias}.${this.escapeIdentifier(relation.joinConfig.targetField)}`;

    // 构建 WHERE 子句
    const placeholders = parentIds.map(() => '?').join(', ');

    const sql = `SELECT ${selectFields}, ${foreignKeyField} AS __fk__
FROM ${tableName} AS ${alias}
WHERE ${alias}.${this.escapeIdentifier(relation.joinConfig.targetField)} IN (${placeholders})
  AND ${alias}.${this.escapeIdentifier('isRemoved')} = ?`;

    return {
      sql: sql.trim(),
      params: [...parentIds, false],
    };
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 构建主表 SELECT 字段
   */
  private buildMainSelectFields(
    fields: FieldDefinitionEntity[],
    select: string[] | undefined,
    alias: string,
  ): string {
    if (!select || select.length === 0) {
      return `${alias}.*`;
    }

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
   * 构建关联字段 SELECT
   */
  private buildRelationSelectFields(
    relation: RelationDefinitionEntity,
    targetFields: FieldDefinitionEntity[],
    alias: string,
  ): string {
    const includeFields = relation.includeFields || [];

    if (includeFields.length === 0) {
      return '';
    }

    const fieldCodes = new Set(targetFields.map((f) => f.code));
    const fieldAliases = relation.fieldAliases || {};

    const parts: string[] = [];
    for (const field of includeFields) {
      // 验证字段存在
      if (!fieldCodes.has(field) && !SYSTEM_FIELDS.includes(field)) {
        this.logger.warn(`Field not found in target model: ${field}`);
        continue;
      }

      const fieldRef = `${alias}.${this.escapeIdentifier(field)}`;
      const fieldAlias = fieldAliases[field] || `${relation.code}_${field}`;
      parts.push(`${fieldRef} AS ${this.escapeIdentifier(fieldAlias)}`);
    }

    return parts.join(', ');
  }

  /**
   * 构建 JOIN 子句
   */
  private buildJoinClause(
    relation: RelationDefinitionEntity,
    targetModel: ModelDefinitionEntity,
    mainAlias: string,
    relationAlias: string,
  ): string {
    const joinType = relation.joinConfig.joinType || JoinType.LEFT;
    const targetTable = this.escapeIdentifier(targetModel.tableName);
    const sourceField = `${mainAlias}.${this.escapeIdentifier(relation.joinConfig.sourceField)}`;
    const targetField = `${relationAlias}.${this.escapeIdentifier(relation.joinConfig.targetField)}`;

    // 添加目标表的 isRemoved 条件
    const isRemovedCondition = `${relationAlias}.${this.escapeIdentifier('isRemoved')} = 0`;

    return `${joinType} JOIN ${targetTable} AS ${relationAlias} ON ${sourceField} = ${targetField} AND ${isRemovedCondition}`;
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

    const fieldCodes = new Set(fields.map((f) => f.code));

    for (const condition of conditions) {
      // 验证字段
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
}
