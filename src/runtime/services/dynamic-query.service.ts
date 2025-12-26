import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { DataSourceManagerImpl, DATA_SOURCE_MANAGER } from '@cs/nest-typeorm';
import { ContextService } from '@cs/nest-common';
import { MetaCacheService } from '../../meta/services';
import { SqlBuilderService } from './sql-builder.service';
import { JoinBuilderService } from './join-builder.service';
import { QueryOptions, PagedResult, AggregateOptions } from '../dto';
import { DEFAULT_PAGE_CONFIG } from '../../shared/constants/aseembox.constants';

/**
 * 动态查询服务
 * 负责执行基于元数据的动态查询
 */
@Injectable()
export class DynamicQueryService {
  private readonly logger = new Logger(DynamicQueryService.name);

  constructor(
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
    private readonly metaCacheService: MetaCacheService,
    private readonly sqlBuilderService: SqlBuilderService,
    private readonly joinBuilderService: JoinBuilderService,
    private readonly contextService: ContextService,
  ) {}

  /**
   * 获取数据源
   */
  private getDataSource() {
    return this.dataSourceManager.getDataSource();
  }

  /**
   * 分页查询
   */
  async query(
    modelCode: string,
    options: QueryOptions = {},
  ): Promise<PagedResult<Record<string, any>>> {
    // 获取模型的查询操作配置
    const action = await this.metaCacheService.getAction(modelCode, 'query');
    const queryConfig = action?.queryConfig;

    // 应用默认分页配置
    const page = options.page || 1;
    let pageSize = options.pageSize || queryConfig?.defaultPageSize || DEFAULT_PAGE_CONFIG.DEFAULT_PAGE_SIZE;
    const maxPageSize = queryConfig?.maxPageSize || DEFAULT_PAGE_CONFIG.MAX_PAGE_SIZE;

    // 限制最大分页大小
    if (pageSize > maxPageSize) {
      pageSize = maxPageSize;
    }

    const queryOptions: QueryOptions = {
      ...options,
      page,
      pageSize,
    };

    // 判断是否需要关联查询
    const includeRelations = options.include || [];

    let items: Record<string, any>[];
    let total: number;

    if (includeRelations.length > 0) {
      // 带关联的查询
      const [dataResult, countResult] = await Promise.all([
        this.queryWithRelations(modelCode, queryOptions, includeRelations),
        this.countWithRelations(modelCode, queryOptions, includeRelations),
      ]);
      items = dataResult;
      total = countResult;
    } else {
      // 简单查询
      const [dataResult, countResult] = await Promise.all([
        this.querySimple(modelCode, queryOptions),
        this.countSimple(modelCode, queryOptions),
      ]);
      items = dataResult;
      total = countResult;
    }

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 简单查询（不带关联）
   */
  async querySimple(
    modelCode: string,
    options: QueryOptions = {},
  ): Promise<Record<string, any>[]> {
    const { sql, params } = await this.sqlBuilderService.buildSelectQuery(
      modelCode,
      options,
    );

    this.logger.debug(`Executing query: ${sql}`);
    this.logger.debug(`Params: ${JSON.stringify(params)}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return result;
  }

  /**
   * 带关联的查询
   */
  async queryWithRelations(
    modelCode: string,
    options: QueryOptions = {},
    includeRelations: string[],
  ): Promise<Record<string, any>[]> {
    const { sql, params } = await this.joinBuilderService.buildQueryWithRelations(
      modelCode,
      options,
      includeRelations,
    );

    this.logger.debug(`Executing query with relations: ${sql}`);
    this.logger.debug(`Params: ${JSON.stringify(params)}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return result;
  }

  /**
   * 简单计数
   */
  async countSimple(
    modelCode: string,
    options: QueryOptions = {},
  ): Promise<number> {
    const { sql, params } = await this.sqlBuilderService.buildCountQuery(
      modelCode,
      options,
    );

    this.logger.debug(`Executing count: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return parseInt(result[0]?.total || '0', 10);
  }

  /**
   * 带关联的计数
   */
  async countWithRelations(
    modelCode: string,
    options: QueryOptions = {},
    includeRelations: string[],
  ): Promise<number> {
    const { sql, params } = await this.joinBuilderService.buildCountWithRelations(
      modelCode,
      options,
      includeRelations,
    );

    this.logger.debug(`Executing count with relations: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return parseInt(result[0]?.total || '0', 10);
  }

  /**
   * 根据 ID 查询单条记录
   */
  async findById(
    modelCode: string,
    id: string,
    includeRelations?: string[],
  ): Promise<Record<string, any> | null> {
    const options: QueryOptions = {
      where: [{ field: 'id', operator: 'eq', value: id }],
      pageSize: 1,
    };

    let items: Record<string, any>[];

    if (includeRelations?.length) {
      items = await this.queryWithRelations(modelCode, options, includeRelations);
    } else {
      items = await this.querySimple(modelCode, options);
    }

    return items[0] || null;
  }

  /**
   * 根据 ID 查询单条记录（如果不存在则抛出异常）
   */
  async findByIdOrFail(
    modelCode: string,
    id: string,
    includeRelations?: string[],
  ): Promise<Record<string, any>> {
    const result = await this.findById(modelCode, id, includeRelations);
    if (!result) {
      throw new NotFoundException(`${modelCode} 记录 ${id} 不存在`);
    }
    return result;
  }

  /**
   * 根据条件查询单条记录
   */
  async findOne(
    modelCode: string,
    options: QueryOptions = {},
    includeRelations?: string[],
  ): Promise<Record<string, any> | null> {
    const queryOptions: QueryOptions = {
      ...options,
      pageSize: 1,
    };

    let items: Record<string, any>[];

    if (includeRelations?.length) {
      items = await this.queryWithRelations(modelCode, queryOptions, includeRelations);
    } else {
      items = await this.querySimple(modelCode, queryOptions);
    }

    return items[0] || null;
  }

  /**
   * 查询所有记录（不分页）
   */
  async findAll(
    modelCode: string,
    options: QueryOptions = {},
    includeRelations?: string[],
  ): Promise<Record<string, any>[]> {
    // 移除分页参数
    const queryOptions: QueryOptions = {
      ...options,
      page: undefined,
      pageSize: undefined,
    };

    if (includeRelations?.length) {
      return this.queryWithRelations(modelCode, queryOptions, includeRelations);
    } else {
      return this.querySimple(modelCode, queryOptions);
    }
  }

  /**
   * 聚合查询
   */
  async aggregate(
    modelCode: string,
    options: AggregateOptions,
  ): Promise<Record<string, any>[]> {
    const { sql, params } = await this.sqlBuilderService.buildAggregateQuery(
      modelCode,
      options,
    );

    this.logger.debug(`Executing aggregate: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return result;
  }

  /**
   * 检查记录是否存在
   */
  async exists(
    modelCode: string,
    options: QueryOptions = {},
  ): Promise<boolean> {
    const count = await this.countSimple(modelCode, options);
    return count > 0;
  }

  /**
   * 检查指定 ID 的记录是否存在
   */
  async existsById(
    modelCode: string,
    id: string,
  ): Promise<boolean> {
    return this.exists(modelCode, {
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  /**
   * 加载一对多关联数据
   */
  async loadOneToMany(
    parentModelCode: string,
    parentIds: string[],
    relationCode: string,
  ): Promise<Map<string, Record<string, any>[]>> {
    if (parentIds.length === 0) {
      return new Map();
    }

    const { sql, params } = await this.joinBuilderService.buildNestedQuery(
      parentModelCode,
      parentIds,
      relationCode,
    );

    this.logger.debug(`Loading one-to-many: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    // 按外键分组
    const grouped = new Map<string, Record<string, any>[]>();
    for (const row of result) {
      const fk = row.__fk__;
      delete row.__fk__;

      if (!grouped.has(fk)) {
        grouped.set(fk, []);
      }
      grouped.get(fk)!.push(row);
    }

    return grouped;
  }

  /**
   * 执行原始 SQL 查询（谨慎使用）
   */
  async rawQuery(
    sql: string,
    params?: any[],
  ): Promise<Record<string, any>[]> {
    this.logger.warn('Executing raw query - ensure SQL is safe');
    this.logger.debug(`Raw SQL: ${sql}`);

    const dataSource = this.getDataSource();
    return dataSource.query(sql, params);
  }
}
