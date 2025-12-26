import { Injectable, Logger, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { DataSourceManagerImpl, DATA_SOURCE_MANAGER } from '@cs/nest-typeorm';
import { RpcClient } from '@cs/nest-cloud';
import { ContextService } from '@cs/nest-common';
import { MetaCacheService } from '../../meta/services';
import { SqlBuilderService } from './sql-builder.service';
import { DynamicQueryService } from './dynamic-query.service';
import { MutationResult } from '../dto';
import { ActionType } from '../../shared/constants/aseembox.constants';

/**
 * 动态变更服务
 * 负责执行基于元数据的动态创建、更新、删除操作
 */
@Injectable()
export class DynamicMutationService {
  private readonly logger = new Logger(DynamicMutationService.name);

  constructor(
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManagerImpl,
    private readonly metaCacheService: MetaCacheService,
    private readonly sqlBuilderService: SqlBuilderService,
    private readonly dynamicQueryService: DynamicQueryService,
    private readonly contextService: ContextService,
    private readonly rpcClient: RpcClient,
  ) {}

  /**
   * 获取数据源
   */
  private getDataSource() {
    return this.dataSourceManager.getDataSource();
  }

  /**
   * 获取新 ID
   */
  private async getNewId(): Promise<string> {
    return this.rpcClient.getNewId();
  }

  /**
   * 批量获取新 ID
   */
  private async getNewIds(count: number): Promise<string[]> {
    return this.rpcClient.getNewId(count);
  }

  /**
   * 创建单条记录
   */
  async create(
    modelCode: string,
    data: Record<string, any>,
  ): Promise<MutationResult> {
    // 生成 ID
    const id = data.id || await this.getNewId();
    const dataWithId = { ...data, id };

    const { sql, params } = await this.sqlBuilderService.buildInsertQuery(
      modelCode,
      dataWithId,
    );

    this.logger.debug(`Executing insert: ${sql}`);

    const dataSource = this.getDataSource();

    try {
      await dataSource.query(sql, params);

      // 查询插入的记录
      const inserted = await this.dynamicQueryService.findById(modelCode, id);

      return {
        success: true,
        affected: 1,
        id,
        data: inserted,
      };
    } catch (error) {
      // 检查是否是唯一约束冲突
      if ((error as any).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('记录已存在，违反唯一约束');
      }
      throw error;
    }
  }

  /**
   * 批量创建记录
   */
  async createMany(
    modelCode: string,
    dataList: Record<string, any>[],
  ): Promise<MutationResult> {
    if (dataList.length === 0) {
      return {
        success: true,
        affected: 0,
        ids: [],
      };
    }

    // 批量生成 ID
    const newIds = await this.getNewIds(dataList.length);
    const dataWithIds = dataList.map((data, index) => ({
      ...data,
      id: data.id || newIds[index],
    }));

    const { sql, params } = await this.sqlBuilderService.buildBatchInsertQuery(
      modelCode,
      dataWithIds,
    );

    this.logger.debug(`Executing batch insert: ${sql}`);

    const dataSource = this.getDataSource();

    try {
      const result = await dataSource.query(sql, params);

      return {
        success: true,
        affected: result.affectedRows || dataList.length,
        ids: dataWithIds.map((d) => d.id),
      };
    } catch (error) {
      if ((error as any).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('批量创建失败，存在重复记录');
      }
      throw error;
    }
  }

  /**
   * 更新单条记录
   */
  async update(
    modelCode: string,
    id: string,
    data: Record<string, any>,
  ): Promise<MutationResult> {
    // 检查记录是否存在
    const exists = await this.dynamicQueryService.existsById(modelCode, id);
    if (!exists) {
      throw new NotFoundException(`记录 ${id} 不存在`);
    }

    const { sql, params } = await this.sqlBuilderService.buildUpdateQuery(
      modelCode,
      id,
      data,
    );

    this.logger.debug(`Executing update: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    // 查询更新后的记录
    const updated = await this.dynamicQueryService.findById(modelCode, id);

    return {
      success: true,
      affected: result.affectedRows || 1,
      id,
      data: updated,
    };
  }

  /**
   * 批量更新记录
   */
  async updateMany(
    modelCode: string,
    ids: string[],
    data: Record<string, any>,
  ): Promise<MutationResult> {
    if (ids.length === 0) {
      return {
        success: true,
        affected: 0,
        ids: [],
      };
    }

    const { sql, params } = await this.sqlBuilderService.buildBatchUpdateQuery(
      modelCode,
      ids,
      data,
    );

    this.logger.debug(`Executing batch update: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return {
      success: true,
      affected: result.affectedRows || 0,
      ids,
    };
  }

  /**
   * 删除单条记录（软删除）
   */
  async softDelete(
    modelCode: string,
    id: string,
  ): Promise<MutationResult> {
    // 检查记录是否存在
    const exists = await this.dynamicQueryService.existsById(modelCode, id);
    if (!exists) {
      throw new NotFoundException(`记录 ${id} 不存在`);
    }

    const { sql, params } = await this.sqlBuilderService.buildSoftDeleteQuery(
      modelCode,
      id,
    );

    this.logger.debug(`Executing soft delete: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return {
      success: true,
      affected: result.affectedRows || 1,
      id,
    };
  }

  /**
   * 批量软删除记录
   */
  async softDeleteMany(
    modelCode: string,
    ids: string[],
  ): Promise<MutationResult> {
    if (ids.length === 0) {
      return {
        success: true,
        affected: 0,
        ids: [],
      };
    }

    const { sql, params } = await this.sqlBuilderService.buildBatchSoftDeleteQuery(
      modelCode,
      ids,
    );

    this.logger.debug(`Executing batch soft delete: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return {
      success: true,
      affected: result.affectedRows || 0,
      ids,
    };
  }

  /**
   * 硬删除单条记录（物理删除，谨慎使用）
   */
  async hardDelete(
    modelCode: string,
    id: string,
  ): Promise<MutationResult> {
    const { sql, params } = await this.sqlBuilderService.buildHardDeleteQuery(
      modelCode,
      id,
    );

    this.logger.warn(`Executing hard delete: ${sql}`);

    const dataSource = this.getDataSource();
    const result = await dataSource.query(sql, params);

    return {
      success: result.affectedRows > 0,
      affected: result.affectedRows || 0,
      id,
    };
  }

  /**
   * 根据操作类型执行删除
   */
  async delete(
    modelCode: string,
    id: string,
    actionType: ActionType = ActionType.SOFT_DELETE,
  ): Promise<MutationResult> {
    if (actionType === ActionType.DELETE) {
      return this.hardDelete(modelCode, id);
    }
    return this.softDelete(modelCode, id);
  }

  /**
   * 保存记录（存在则更新，不存在则创建）
   */
  async save(
    modelCode: string,
    data: Record<string, any>,
  ): Promise<MutationResult> {
    const id = data.id;

    if (id) {
      // 检查是否存在
      const exists = await this.dynamicQueryService.existsById(modelCode, id);
      if (exists) {
        return this.update(modelCode, id, data);
      }
    }

    return this.create(modelCode, data);
  }

  /**
   * 批量保存记录
   */
  async saveMany(
    modelCode: string,
    dataList: Record<string, any>[],
  ): Promise<MutationResult> {
    const toCreate: Record<string, any>[] = [];
    const toUpdate: Array<{ id: string; data: Record<string, any> }> = [];

    // 分离需要创建和更新的记录
    for (const data of dataList) {
      if (data.id) {
        const exists = await this.dynamicQueryService.existsById(modelCode, data.id);
        if (exists) {
          toUpdate.push({ id: data.id, data });
        } else {
          toCreate.push(data);
        }
      } else {
        toCreate.push(data);
      }
    }

    let totalAffected = 0;
    const allIds: string[] = [];

    // 批量创建
    if (toCreate.length > 0) {
      const createResult = await this.createMany(modelCode, toCreate);
      totalAffected += createResult.affected;
      allIds.push(...(createResult.ids || []));
    }

    // 逐条更新（暂不支持批量更新不同数据）
    for (const { id, data } of toUpdate) {
      const updateResult = await this.update(modelCode, id, data);
      totalAffected += updateResult.affected;
      allIds.push(id);
    }

    return {
      success: true,
      affected: totalAffected,
      ids: allIds,
    };
  }

  /**
   * 在事务中执行操作
   */
  async executeInTransaction<T>(
    callback: () => Promise<T>,
  ): Promise<T> {
    const dataSource = this.getDataSource();
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await callback();
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
