import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@cs/nest-typeorm';
import { TestRecord } from './test.entity';
import { CreateTestRecordDto } from './test.dto';

/**
 * 测试仓储 - 用于验证BaseRepository的标准方法
 */
@Injectable()
export class TestRepository extends BaseRepository<TestRecord> {
  /**
   * 测试基础查询方法 - findOne
   */
  async testFindOne(id: string): Promise<TestRecord | null> {
    return this.findOne({ id, isRemoved: false });
  }

  /**
   * 测试基础查询方法 - findMany
   */
  async testFindMany(
    dto: Partial<CreateTestRecordDto>,
    take?: number,
    skip?: number,
  ): Promise<TestRecord[]> {
    const conditions: any = { isRemoved: false, ...dto };
    // 转换dueDate字符串为Date对象
    if (dto.dueDate && typeof dto.dueDate === 'string') {
      conditions.dueDate = new Date(dto.dueDate);
    }
    return this.findMany(conditions, take, skip);
  }

  /**
   * 测试高级查询方法 - findManyBase
   * 验证QueryConditionInput的使用
   */
  async testFindManyBase(
    status?: string,
    priority?: number,
    page?: number,
    pageSize?: number,
  ): Promise<any> {
    const conditions: any = {};
    let whereClause = 'test.isRemoved = :isRemoved';
    conditions.isRemoved = false;

    if (status) {
      whereClause += ' AND test.status = :status';
      conditions.status = status;
    }

    if (priority) {
      whereClause += ' AND test.priority = :priority';
      conditions.priority = priority;
    }

    const queryConditionInput: any = {
      tableName: 'test',
      select: [
        'test.id',
        'test.title',
        'test.content',
        'test.status',
        'test.priority',
        'test.score',
        'test.createdAt',
        'test.creatorName',
      ],
      conditionLambda: whereClause,
      conditionValue: conditions,
      orderBy: { 'test.createdAt': 'DESC' as const },
    };

    // 如果有分页参数
    if (page && pageSize) {
      queryConditionInput.take = pageSize;
      queryConditionInput.skip = (page - 1) * pageSize;
    }

    return this.findManyBase(queryConditionInput);
  }

  /**
   * 测试单条保存方法 - saveOne
   */
  async testSaveOne(testData: Partial<TestRecord>): Promise<TestRecord> {
    return this.saveOne(testData);
  }

  /**
   * 测试批量保存方法 - saveMany
   */
  async testSaveMany(
    testDataList: Partial<TestRecord>[],
  ): Promise<TestRecord[]> {
    return this.saveMany(testDataList);
  }

  /**
   * 测试条件更新方法 - updateByCondition
   */
  async testUpdateByCondition(
    updateData: Partial<TestRecord>,
    conditions: Partial<TestRecord>,
  ): Promise<any> {
    return this.updateByCondition(updateData, conditions);
  }

  /**
   * 测试软删除方法 - softDeletion
   */
  async testSoftDeletion(conditions: Partial<TestRecord>): Promise<any> {
    return this.softDeletion(conditions);
  }

  /**
   * 测试硬删除方法 - hardDelete
   */
  async testHardDelete(conditions: Partial<TestRecord>): Promise<any> {
    return this.hardDelete(conditions);
  }

  /**
   * 测试执行SQL方法 - executeSql
   * 包括命名参数和防注入测试
   */
  async testExecuteSql(): Promise<any> {
    // 测试基本查询
    const basicQuery = `
      SELECT 
        id, title, status, priority, created_at, creator_name 
      FROM test_records 
      WHERE is_removed = :isRemoved 
      ORDER BY created_at DESC 
      LIMIT 10
    `;

    return this.executeSql(basicQuery, { isRemoved: false });
  }

  /**
   * 测试复杂SQL查询
   */
  async testComplexSql(status: string, minPriority: number): Promise<any> {
    const complexQuery = `
      SELECT 
        status,
        priority,
        COUNT(*) as count,
        AVG(score) as avg_score,
        MAX(view_count) as max_views
      FROM test_records 
      WHERE is_removed = :isRemoved 
        AND status = :status 
        AND priority >= :minPriority
      GROUP BY status, priority
      ORDER BY priority DESC
    `;

    return this.executeSql(complexQuery, {
      isRemoved: false,
      status,
      minPriority,
    });
  }

  /**
   * 测试批量更新操作
   */
  async batchUpdateStatus(ids: string[], newStatus: string): Promise<any> {
    return this.createQueryBuilder('test')
      .update(TestRecord)
      .set({
        status: newStatus,
        modifierId: this.contextService?.getContext('userId'),
        modifierName: this.contextService?.getContext('realName'),
      })
      .where('id IN (:...ids)', { ids })
      .andWhere('isRemoved = :isRemoved', { isRemoved: false })
      .execute();
  }
}
