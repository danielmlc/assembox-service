import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import {
  InjectRepository,
  DATA_SOURCE_MANAGER,
  DataSourceManager,
} from '@cs/nest-typeorm';
import {
  PageResult,
  LoggerService,
  QueryConditionInput,
} from '@cs/nest-common';
import { TestRepository } from './test.repository';
import { TestRecord } from './test.entity';
import {
  CreateTestRecordDto,
  UpdateTestRecordDto,
  QueryTestRecordDto,
  BatchOperationDto,
  BatchUpdateStatusDto,
  BatchCreateTestRecordDto,
  SqlTestDto,
  TestRecordResponseDto,
} from './test.dto';

/**
 * 测试服务 - 用于验证数据库工具的所有标准方法
 */
@Injectable()
export class TestService {
  constructor(
    @InjectRepository({
      entity: TestRecord,
      repository: TestRepository,
    })
    private readonly testRepository: TestRepository,
    private readonly logger: LoggerService,
    @Inject(DATA_SOURCE_MANAGER)
    private readonly dataSourceManager: DataSourceManager,
  ) {}

  /**
   * 验证 BaseRepository.saveOne 方法
   */
  async testCreateOne(
    createDto: CreateTestRecordDto,
  ): Promise<TestRecordResponseDto> {
    this.logger.debug('测试 saveOne 方法');

    const testData = {
      ...createDto,
      status: createDto.status || 'active',
      priority: createDto.priority || 1,
      viewCount: createDto.viewCount || 0,
      isFeatured: createDto.isFeatured || false,
      isEnable: createDto.isEnable !== false, // 默认启用
      sortCode: createDto.sortCode || 0,
      dueDate: createDto.dueDate ? new Date(createDto.dueDate) : undefined,
      id: createDto.id || '',
    };

    const savedRecord = await this.testRepository.testSaveOne(testData);
    return this.toResponseDto(savedRecord);
  }

  /**
   * 验证 BaseRepository.saveMany 方法
   */
  async testCreateMany(
    batchCreateDto: BatchCreateTestRecordDto,
  ): Promise<TestRecordResponseDto[]> {
    this.logger.debug(
      `测试 saveMany 方法，批量创建 ${batchCreateDto.records.length} 条记录`,
    );

    const testDataList = batchCreateDto.records.map((record) => ({
      ...record,
      status: record.status || 'active',
      priority: record.priority || 1,
      viewCount: record.viewCount || 0,
      isFeatured: record.isFeatured || false,
      isEnable: record.isEnable !== false,
      sortCode: record.sortCode || 0,
      dueDate: record.dueDate ? new Date(record.dueDate) : undefined,
    }));

    const savedRecords = await this.testRepository.testSaveMany(testDataList);
    return savedRecords.map((record) => this.toResponseDto(record));
  }

  /**
   * 验证 BaseRepository.findOne 方法
   */
  async testFindById(id: string): Promise<TestRecordResponseDto> {
    this.logger.debug(`测试 findOne 方法，查找ID: ${id}`);

    const record = await this.testRepository.testFindOne(id);
    if (!record) {
      throw new NotFoundException(`记录不存在，ID: ${id}`);
    }
    return this.toResponseDto(record);
  }

  /**
   * 验证 BaseRepository.findMany 方法
   */
  async testFindMany(
    dto: Partial<CreateTestRecordDto>,
    take?: number,
    skip?: number,
  ): Promise<TestRecordResponseDto[]> {
    this.logger.debug(
      `测试 findMany 方法， ${dto}, 获取: ${take}, 跳过: ${skip}`,
    );
    const records = await this.testRepository.testFindMany(dto, take, skip);
    return records.map((record) => this.toResponseDto(record));
  }

  /**
   * 验证 BaseRepository.findManyBase 方法（高级查询）
   */
  async testAdvancedQuery(
    queryConditionInput: QueryConditionInput,
  ): Promise<any[] | PageResult<any[]>> {
    this.logger.debug('测试 findManyBase 方法（高级查询）');
    this.logger.debug(
      '查询参数:',
      JSON.stringify(queryConditionInput, null, 2),
    );

    const result =
      await this.testRepository.findManyBase<QueryTestRecordDto>(
        queryConditionInput,
      );

    this.logger.debug('原始查询结果:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * 验证 BaseRepository.updateByCondition 方法
   */
  async testUpdate(
    id: string,
    updateDto: UpdateTestRecordDto,
  ): Promise<TestRecordResponseDto> {
    this.logger.debug(`测试 updateByCondition 方法，更新ID: ${id}`);

    // 先检查记录是否存在
    const existingRecord = await this.testRepository.testFindOne(id);
    if (!existingRecord) {
      throw new NotFoundException(`记录不存在，ID: ${id}`);
    }

    const updateData = {
      ...updateDto,
      dueDate: updateDto.dueDate ? new Date(updateDto.dueDate) : undefined,
    };

    // 删除undefined值
    Object.keys(updateData).forEach((key) => {
      if ((updateData as any)[key] === undefined) {
        delete (updateData as any)[key];
      }
    });

    await this.testRepository.testUpdateByCondition(updateData, { id });

    // 返回更新后的记录
    const updatedRecord = await this.testRepository.testFindOne(id);
    if (!updatedRecord) {
      throw new Error('更新后的记录未找到');
    }
    return this.toResponseDto(updatedRecord);
  }

  /**
   * 验证 BaseRepository.softDeletion 方法
   */
  async testSoftDelete(id: string): Promise<void> {
    this.logger.debug(`测试 softDeletion 方法，软删除ID: ${id}`);

    const record = await this.testRepository.testFindOne(id);
    if (!record) {
      throw new NotFoundException(`记录不存在，ID: ${id}`);
    }

    await this.testRepository.testSoftDeletion({ id });
  }

  /**
   * 验证 BaseRepository.hardDelete 方法
   */
  async testHardDelete(id: string): Promise<void> {
    this.logger.debug(`测试 hardDelete 方法，硬删除ID: ${id}`);

    const record = await this.testRepository.findOne({ id }); // 查找包括已软删除的记录
    if (!record) {
      throw new NotFoundException(`记录不存在，ID: ${id}`);
    }

    await this.testRepository.testHardDelete({ id });
  }

  /**
   * 验证批量软删除
   */
  async testBatchSoftDelete(batchDto: BatchOperationDto): Promise<void> {
    this.logger.debug(`测试批量软删除，IDs: ${batchDto.ids.join(',')}`);
    if (!batchDto.ids || batchDto.ids.length === 0) {
      throw new BadRequestException('请选择要删除的记录');
    }

    for (const id of batchDto.ids) {
      const record = await this.testRepository.testFindOne(id);
      if (!record) {
        throw new NotFoundException(`记录不存在，ID: ${id}`);
      }
      await this.testRepository.testSoftDeletion({ id });
    }
  }

  /**
   * 验证批量状态更新
   */
  async testBatchUpdateStatus(
    batchUpdateDto: BatchUpdateStatusDto,
  ): Promise<void> {
    this.logger.debug(
      `测试批量更新状态，IDs: ${batchUpdateDto.ids.join(', ')}, 新状态: ${batchUpdateDto.status}`,
    );

    if (!batchUpdateDto.ids || batchUpdateDto.ids.length === 0) {
      throw new BadRequestException('请选择要更新的记录');
    }

    await this.testRepository.batchUpdateStatus(
      batchUpdateDto.ids,
      batchUpdateDto.status,
    );
  }

  /**
   * 验证 BaseRepository.executeSql 方法
   */
  async testExecuteSql(sqlTestDto: SqlTestDto): Promise<any> {
    this.logger.debug('测试 executeSql 方法');

    const { testType = 'basic', sql, parameters } = sqlTestDto;
    console.log(sqlTestDto);
    switch (testType) {
      case 'custom':
        if (!sql) {
          throw new BadRequestException('自定义测试需要提供SQL语句');
        }
        console.log(sql, parameters);
        return this.testRepository.executeSql(sql, parameters || {});

      default:
        throw new BadRequestException('无效的测试类型');
    }
  }

  /**
   * 验证事务操作 - 演示在同一事务中进行添加、修改、软删除
   */
  async testTransactionOperations(): Promise<{
    message: string;
    operations: Array<{
      step: string;
      action: string;
      recordId?: string;
      success: boolean;
    }>;
  }> {
    this.logger.debug('测试事务操作：添加、修改、软删除');

    const operations: Array<{
      step: string;
      action: string;
      recordId?: string;
      success: boolean;
    }> = [];

    try {
      const result = await this.testRepository.manager.transaction(
        async (entityManager) => {
          // 步骤1：创建第一条测试记录
          const testRecord1 = new TestRecord();
          testRecord1.id = Date.now().toString();
          testRecord1.title = '[事务测试] 记录1';
          testRecord1.content = '这是事务测试中创建的第一条记录';
          testRecord1.status = 'active';
          testRecord1.priority = 1;
          testRecord1.viewCount = 0;
          testRecord1.isFeatured = false;
          testRecord1.isRemoved = false;
          testRecord1.isEnable = true;
          testRecord1.version = Date.now();
          testRecord1.createdAt = new Date();

          await entityManager.save(TestRecord, testRecord1);
          operations.push({
            step: '1',
            action: '创建记录1',
            recordId: testRecord1.id,
            success: true,
          });

          // 步骤2：创建第二条测试记录
          const testRecord2 = new TestRecord();
          testRecord2.id = (Date.now() + 1).toString();
          testRecord2.title = '[事务测试] 记录2';
          testRecord2.content = '这是事务测试中创建的第二条记录';
          testRecord2.status = 'pending';
          testRecord2.priority = 2;
          testRecord2.viewCount = 0;
          testRecord2.isFeatured = false;
          testRecord2.isRemoved = false;
          testRecord2.isEnable = true;
          testRecord2.version = Date.now();
          testRecord2.createdAt = new Date();

          await entityManager.save(TestRecord, testRecord2);
          operations.push({
            step: '2',
            action: '创建记录2',
            recordId: testRecord2.id,
            success: true,
          });

          // 步骤3：修改第一条记录
          await entityManager.update(
            TestRecord,
            { id: testRecord1.id },
            {
              title: '[事务测试] 记录1 - 已修改',
              content: '这条记录在事务中被修改了',
              status: 'inactive',
              priority: 3,
              version: Date.now(),
              modifierAt: new Date(),
            },
          );
          operations.push({
            step: '3',
            action: '修改记录1',
            recordId: testRecord1.id,
            success: true,
          });

          // 步骤4：软删除第二条记录
          await entityManager.update(
            TestRecord,
            { id: testRecord2.id },
            {
              isRemoved: true,
              version: Date.now(),
              modifierAt: new Date(),
            },
          );
          operations.push({
            step: '4',
            action: '软删除记录2',
            recordId: testRecord2.id,
            success: true,
          });

          // 步骤5：创建第三条记录（用于验证事务的原子性）
          const testRecord3 = new TestRecord();
          testRecord3.id = (Date.now() + 2).toString();
          testRecord3.title = '[事务测试] 记录3';
          testRecord3.content = '这是事务测试中创建的第三条记录';
          testRecord3.status = 'active';
          testRecord3.priority = 1;
          testRecord3.viewCount = 100;
          testRecord3.isFeatured = true;
          testRecord3.isRemoved = false;
          testRecord3.isEnable = true;
          testRecord3.version = Date.now();
          testRecord3.createdAt = new Date();

          await entityManager.save(TestRecord, testRecord3);
          operations.push({
            step: '5',
            action: '创建记录3',
            recordId: testRecord3.id,
            success: true,
          });

          return operations;
        },
      );

      this.logger.debug('事务操作成功提交');

      return {
        message: '事务操作成功：在同一事务中完成了创建、修改、软删除操作',
        operations,
      };
    } catch (error) {
      this.logger.error('事务操作失败，已回滚', error);

      // 更新操作状态为失败
      operations.forEach((op) => (op.success = false));

      throw new BadRequestException({
        message: '事务操作失败，所有操作已回滚',
        operations,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 验证事务回滚操作 - 模拟操作失败导致事务回滚
   */
  async testTransactionRollback(forceError = false): Promise<{
    message: string;
    isRolledBack: boolean;
    operations: Array<{
      step: string;
      action: string;
      recordId?: string;
      success: boolean;
      error?: string;
    }>;
    recordsBeforeTransaction: number;
    recordsAfterTransaction: number;
  }> {
    this.logger.debug('测试事务回滚操作：模拟失败场景');

    const operations: Array<{
      step: string;
      action: string;
      recordId?: string;
      success: boolean;
      error?: string;
    }> = [];

    // 获取事务前的记录数量
    const recordsBeforeTransaction = await this.testRepository.count({
      where: { isRemoved: false },
    });

    let isRolledBack = false;

    try {
      await this.testRepository.manager.transaction(async (entityManager) => {
        // 步骤1：创建第一条记录（成功）
        const testRecord1 = new TestRecord();
        testRecord1.id = Date.now().toString();
        testRecord1.title = '[回滚测试] 记录1';
        testRecord1.content = '这条记录将在事务回滚时被撤销';
        testRecord1.status = 'active';
        testRecord1.priority = 1;
        testRecord1.viewCount = 0;
        testRecord1.isFeatured = false;
        testRecord1.isRemoved = false;
        testRecord1.isEnable = true;
        testRecord1.version = Date.now();
        testRecord1.createdAt = new Date();

        await entityManager.save(TestRecord, testRecord1);
        operations.push({
          step: '1',
          action: '创建记录1',
          recordId: testRecord1.id,
          success: true,
        });

        // 步骤2：创建第二条记录（成功）
        const testRecord2 = new TestRecord();
        testRecord2.id = (Date.now() + 1).toString();
        testRecord2.title = '[回滚测试] 记录2';
        testRecord2.content = '这条记录也将在事务回滚时被撤销';
        testRecord2.status = 'pending';
        testRecord2.priority = 2;
        testRecord2.viewCount = 10;
        testRecord2.isFeatured = true;
        testRecord2.isRemoved = false;
        testRecord2.isEnable = true;
        testRecord2.version = Date.now();
        testRecord2.createdAt = new Date();

        await entityManager.save(TestRecord, testRecord2);
        operations.push({
          step: '2',
          action: '创建记录2',
          recordId: testRecord2.id,
          success: true,
        });

        // 步骤3：修改第一条记录（成功）
        await entityManager.update(
          TestRecord,
          { id: testRecord1.id },
          {
            title: '[回滚测试] 记录1 - 已修改',
            content: '这个修改将在事务回滚时被撤销',
            status: 'inactive',
            priority: 3,
            viewCount: 100,
            version: Date.now(),
            modifierAt: new Date(),
          },
        );
        operations.push({
          step: '3',
          action: '修改记录1',
          recordId: testRecord1.id,
          success: true,
        });

        // 步骤4：模拟业务验证或复杂操作
        // 这里我们检查是否需要强制触发错误
        if (forceError) {
          operations.push({
            step: '4',
            action: '业务验证',
            success: false,
            error: '模拟业务规则验证失败：不允许创建超过限制数量的记录',
          });
          throw new Error('模拟业务规则验证失败：不允许创建超过限制数量的记录');
        }

        // 步骤4（正常情况）：创建第三条记录
        const testRecord3 = new TestRecord();
        testRecord3.id = (Date.now() + 2).toString();
        testRecord3.title = '[回滚测试] 记录3';
        testRecord3.content = '最后一条测试记录';
        testRecord3.status = 'active';
        testRecord3.priority = 1;
        testRecord3.viewCount = 0;
        testRecord3.isFeatured = false;
        testRecord3.isRemoved = false;
        testRecord3.isEnable = true;
        testRecord3.version = Date.now();
        testRecord3.createdAt = new Date();

        await entityManager.save(TestRecord, testRecord3);
        operations.push({
          step: '4',
          action: '创建记录3',
          recordId: testRecord3.id,
          success: true,
        });

        // 步骤5：尝试插入一个违反约束的记录（故意失败）
        // 这里我们尝试插入一个标题超长的记录来触发数据库约束错误
        const invalidRecord = new TestRecord();
        invalidRecord.id = (Date.now() + 3).toString();
        // 创建一个超过数据库字段长度限制的标题（超过200字符）
        invalidRecord.title = '[回滚测试] ' + 'A'.repeat(300); // 超过title字段的varchar(200)限制
        invalidRecord.content = '这条记录会因为标题太长而失败';
        invalidRecord.status = 'active';
        invalidRecord.priority = 1;
        invalidRecord.viewCount = 0;
        invalidRecord.isFeatured = false;
        invalidRecord.isRemoved = false;
        invalidRecord.isEnable = true;
        invalidRecord.version = Date.now();
        invalidRecord.createdAt = new Date();

        // 这里会抛出字段长度约束违反异常
        await entityManager.save(TestRecord, invalidRecord);

        operations.push({
          step: '5',
          action: '插入超长标题记录',
          recordId: invalidRecord.id,
          success: true,
        });
      });

      this.logger.debug('事务意外成功提交（这种情况不应该发生在回滚测试中）');
    } catch (error) {
      isRolledBack = true;

      this.logger.debug('事务已回滚，所有操作被撤销', error);

      // 记录失败的操作
      const lastOperation = operations[operations.length - 1];
      if (lastOperation && lastOperation.success) {
        // 更新最后一个操作为失败状态
        operations[operations.length - 1] = {
          ...lastOperation,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } else if (!lastOperation || lastOperation.step !== '5') {
        // 如果没有记录失败的操作，添加一个
        operations.push({
          step: '5',
          action: '插入超长标题记录',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 获取事务后的记录数量
    const recordsAfterTransaction = await this.testRepository.count({
      where: { isRemoved: false },
    });

    const message = isRolledBack
      ? '事务回滚测试成功：检测到错误，所有操作已回滚，数据库状态保持一致'
      : '事务回滚测试意外成功：所有操作都成功执行了（这不是预期的回滚场景）';

    return {
      message,
      isRolledBack,
      operations,
      recordsBeforeTransaction,
      recordsAfterTransaction,
    };
  }

  /**
   * 将实体转换为响应DTO
   */
  private toResponseDto(record: TestRecord): TestRecordResponseDto {
    return {
      id: record.id,
      title: record.title,
      content: record.content,
      status: record.status,
      priority: record.priority,
      score: record.score,
      tags: record.tags,
      metadata: record.metadata,
      dueDate: record.dueDate,
      viewCount: record.viewCount,
      isFeatured: record.isFeatured,
      sortCode: record.sortCode,
      isEnable: record.isEnable,
      createdAt: record.createdAt,
      creatorId: record.creatorId,
      creatorName: record.creatorName,
      modifierAt: record.modifierAt,
      modifierId: record.modifierId,
      modifierName: record.modifierName,
      version: record.version,
    };
  }
}
