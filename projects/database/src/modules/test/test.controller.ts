import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { TestService } from './test.service';
import {
  CreateTestRecordDto,
  UpdateTestRecordDto,
  QueryTestRecordDto,
  BatchOperationDto,
  BatchUpdateStatusDto,
  BatchCreateTestRecordDto,
  SqlTestDto,
  TestRecordResponseDto,
  StatisticsResponseDto,
} from './test.dto';
import { PageResult, QueryConditionInput } from '@cs/nest-common';

/**
 * 测试控制器 - 提供验证数据库工具标准方法的API接口
 */
@ApiTags('数据库工具测试')
@Controller('test')
export class TestController {
  private readonly logger = new Logger(TestController.name);
  constructor(private readonly testService: TestService) {}

  // ==================== 基础CRUD测试接口 ====================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '测试 saveOne 方法',
    description: '验证BaseRepository的saveOne方法，包括上下文信息自动填充',
  })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    type: TestRecordResponseDto,
  })
  @ApiBody({ type: CreateTestRecordDto })
  async testCreateOne(
    @Body(new ValidationPipe({ transform: true }))
    createDto: CreateTestRecordDto,
  ): Promise<{
    code: number;
    message: string;
    data: TestRecordResponseDto;
  }> {
    this.logger.log('测试 saveOne 方法');
    const result = await this.testService.testCreateOne(createDto);
    return {
      code: 200,
      message: 'saveOne 方法测试成功',
      data: result,
    };
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '测试 saveMany 方法',
    description: '验证BaseRepository的saveMany方法，批量创建记录',
  })
  @ApiResponse({ status: 201, description: '批量创建成功' })
  @ApiBody({ type: BatchCreateTestRecordDto })
  async testCreateMany(
    @Body()
    batchCreateDto: BatchCreateTestRecordDto,
  ): Promise<{
    code: number;
    message: string;
    data: TestRecordResponseDto[];
  }> {
    this.logger.log(
      `测试 saveMany 方法，批量创建 ${batchCreateDto.records.length} 条记录`,
    );
    const result = await this.testService.testCreateMany(batchCreateDto);
    return {
      code: 200,
      message: `saveMany 方法测试成功，创建了 ${result.length} 条记录`,
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: '测试 findOne 方法',
    description: '验证BaseRepository的findOne方法，根据ID查询单条记录',
  })
  @ApiParam({ name: 'id', description: '记录ID' })
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: TestRecordResponseDto,
  })
  async testFindById(@Param('id') id: string): Promise<{
    code: number;
    message: string;
    data: TestRecordResponseDto;
  }> {
    this.logger.log(`测试 findOne 方法，ID: ${id}`);
    const result = await this.testService.testFindById(id);
    return {
      code: 200,
      message: 'findOne 方法测试成功',
      data: result,
    };
  }

  @Post('findMany')
  @ApiOperation({
    summary: '测试 findMany 方法',
    description: '验证BaseRepository的findMany方法，支持条件查询和分页',
  })
  @ApiBody({ type: Object, required: false, description: '筛选条件' })
  async testFindMany(
    @Body() body: { dto?: object; take?: number; skip?: number } = {},
  ): Promise<{
    code: number;
    message: string;
    data: TestRecordResponseDto[];
  }> {
    const { dto, take, skip } = body;
    const result = await this.testService.testFindMany(dto || {}, take, skip);
    return {
      code: 200,
      message: 'findMany 方法测试成功',
      data: result,
    };
  }

  @Put(':id')
  @ApiOperation({
    summary: '测试 updateByCondition 方法',
    description:
      '验证BaseRepository的updateByCondition方法，包括修改人信息自动填充',
  })
  @ApiParam({ name: 'id', description: '记录ID' })
  @ApiBody({ type: UpdateTestRecordDto })
  @ApiResponse({
    status: 200,
    description: '更新成功',
    type: TestRecordResponseDto,
  })
  async testUpdate(
    @Param('id') id: string,
    @Body()
    updateDto: UpdateTestRecordDto,
  ): Promise<{
    code: number;
    message: string;
    data: TestRecordResponseDto;
  }> {
    this.logger.log(`测试 updateByCondition 方法，ID: ${id}`);
    const result = await this.testService.testUpdate(id, updateDto);
    return {
      code: 200,
      message: 'updateByCondition 方法测试成功',
      data: result,
    };
  }

  @Delete(':id/soft')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '测试 softDeletion 方法',
    description: '验证BaseRepository的softDeletion方法，软删除记录',
  })
  @ApiParam({ name: 'id', description: '记录ID' })
  @ApiResponse({ status: 204, description: '软删除成功' })
  async testSoftDelete(@Param('id') id: string): Promise<{
    code: number;
    message: string;
  }> {
    await this.testService.testSoftDelete(id);
    return {
      code: 200,
      message: 'softDeletion 方法测试成功',
    };
  }

  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '测试 hardDelete 方法',
    description: '验证BaseRepository的hardDelete方法，物理删除记录',
  })
  @ApiParam({ name: 'id', description: '记录ID' })
  @ApiResponse({ status: 204, description: '硬删除成功' })
  async testHardDelete(@Param('id') id: string): Promise<{
    code: number;
    message: string;
  }> {
    this.logger.log(`测试 hardDelete 方法，ID: ${id}`);
    await this.testService.testHardDelete(id);
    return {
      code: 200,
      message: 'hardDelete 方法测试成功',
    };
  }

  // ==================== 高级查询测试接口 ====================

  @Post('advanced-query')
  @ApiOperation({
    summary: '测试 findManyBase 方法',
    description: '验证BaseRepository的findManyBase方法，支持复杂查询条件和分页',
  })
  @ApiBody({ type: Object, description: 'QueryConditionInput查询条件对象' })
  async testAdvancedQuery(
    @Body() queryConditionInput: QueryConditionInput,
  ): Promise<any[] | PageResult<any[]>> {
    this.logger.log('测试 findManyBase 方法（高级查询）');
    const result =
      await this.testService.testAdvancedQuery(queryConditionInput);
    return result;
  }

  // ==================== 批量操作测试接口 ====================

  @Delete('batch-soft')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '测试批量软删除',
    description: '验证批量软删除功能',
  })
  @ApiBody({ type: BatchOperationDto })
  async testBatchSoftDelete(@Body() batchDto: BatchOperationDto): Promise<{
    code: number;
    message: string;
  }> {
    this.logger.log(`测试批量软删除，IDs: ${batchDto}`);
    await this.testService.testBatchSoftDelete(batchDto);
    return {
      code: 200,
      message: `批量软删除测试成功，删除了 ${batchDto.ids.length} 条记录`,
    };
  }

  @Put('batch/status')
  @ApiOperation({
    summary: '测试批量更新状态',
    description: '验证批量更新操作',
  })
  @ApiBody({ type: BatchUpdateStatusDto })
  async testBatchUpdateStatus(
    @Body()
    batchUpdateDto: BatchUpdateStatusDto,
  ): Promise<{
    code: number;
    message: string;
  }> {
    this.logger.log(
      `测试批量更新状态，IDs: ${batchUpdateDto.ids.join(', ')}, 新状态: ${batchUpdateDto.status}`,
    );
    await this.testService.testBatchUpdateStatus(batchUpdateDto);
    return {
      code: 200,
      message: `批量更新状态测试成功，更新了 ${batchUpdateDto.ids.length} 条记录`,
    };
  }

  // ==================== SQL执行测试接口 ====================

  @Post('sql')
  @ApiOperation({
    summary: '测试 executeSql 方法',
    description: '验证BaseRepository的executeSql方法，包括参数化查询和防注入',
  })
  @ApiBody({ type: SqlTestDto })
  async testExecuteSql(@Body() sqlTestDto: SqlTestDto): Promise<{
    code: number;
    message: string;
    data: any;
  }> {
    this.logger.log(`测试 executeSql 方法，测试类型: ${sqlTestDto.testType}`);
    const result = await this.testService.testExecuteSql(sqlTestDto);
    return {
      code: 200,
      message: 'executeSql 方法测试成功',
      data: result,
    };
  }

  // ==================== 事务测试接口 ====================

  @Post('transaction')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '测试事务操作',
    description: '验证在同一事务中进行数据添加、修改、软删除操作的原子性',
  })
  @ApiResponse({
    status: 201,
    description: '事务操作测试成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: '事务操作测试成功' },
        data: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  step: { type: 'string' },
                  action: { type: 'string' },
                  recordId: { type: 'string' },
                  success: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  })
  async testTransactionOperations(): Promise<{
    code: number;
    message: string;
    data: {
      message: string;
      operations: Array<{
        step: string;
        action: string;
        recordId?: string;
        success: boolean;
      }>;
    };
  }> {
    this.logger.log('测试事务操作');

    try {
      const result = await this.testService.testTransactionOperations();

      return {
        code: 200,
        message: '事务操作测试成功',
        data: result,
      };
    } catch (error) {
      this.logger.error('事务操作测试失败', error);

      // 如果是业务异常，返回详细信息
      if (error instanceof BadRequestException) {
        const errorResponse = error.getResponse() as any;
        return {
          code: 400,
          message: '事务操作测试失败',
          data: {
            message: errorResponse.message || '事务操作失败',
            operations: errorResponse.operations || [],
          },
        };
      }

      throw error;
    }
  }

  @Post('transaction/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '测试事务回滚操作',
    description: '演示当事务中某个操作失败时，所有操作都会被回滚的机制',
  })
  @ApiQuery({
    name: 'forceError',
    required: false,
    type: Boolean,
    description: '是否强制触发业务错误（默认会触发数据库约束错误）',
  })
  @ApiResponse({
    status: 200,
    description: '事务回滚测试完成',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: '事务回滚测试成功' },
        data: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            isRolledBack: { type: 'boolean' },
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  step: { type: 'string' },
                  action: { type: 'string' },
                  recordId: { type: 'string' },
                  success: { type: 'boolean' },
                  error: { type: 'string' },
                },
              },
            },
            recordsBeforeTransaction: { type: 'number' },
            recordsAfterTransaction: { type: 'number' },
          },
        },
      },
    },
  })
  async testTransactionRollback(
    @Query('forceError') forceError = 'false',
  ): Promise<{
    code: number;
    message: string;
    data: {
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
    };
  }> {
    this.logger.log(`测试事务回滚操作，强制错误: ${forceError}`);

    const shouldForceError = forceError === 'true' || forceError === '1';

    try {
      const result =
        await this.testService.testTransactionRollback(shouldForceError);

      // 根据是否回滚来确定响应码和消息
      const responseCode = result.isRolledBack ? 200 : 200;
      const responseMessage = result.isRolledBack
        ? '事务回滚测试成功：操作失败，事务已回滚'
        : '事务回滚测试异常：预期失败但实际成功';

      return {
        code: responseCode,
        message: responseMessage,
        data: result,
      };
    } catch (error) {
      this.logger.error('事务回滚测试过程中发生未处理异常', error);

      // 这种情况不应该发生，因为service方法应该处理所有异常
      return {
        code: 500,
        message: '事务回滚测试过程中发生未处理异常',
        data: {
          message: '测试过程中发生系统错误',
          isRolledBack: false,
          operations: [],
          recordsBeforeTransaction: 0,
          recordsAfterTransaction: 0,
        },
      };
    }
  }
}
