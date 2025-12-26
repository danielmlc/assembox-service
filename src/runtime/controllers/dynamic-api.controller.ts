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
  UseInterceptors,
} from '@nestjs/common';
import { TenantInterceptor } from '../interceptors';
import { DynamicQueryService, DynamicMutationService, DynamicValidatorService } from '../services';
import { MetaCacheService } from '../../meta/services';
import { QueryDto, QueryCondition, SortConfig } from '../dto';
import { ActionType } from '../../shared/constants/aseembox.constants';

/**
 * 动态 API 控制器
 * 提供统一的数据操作入口
 *
 * 路由格式：
 * - GET    /api/v1/data/:modelCode          - 分页查询
 * - GET    /api/v1/data/:modelCode/:id      - 根据 ID 查询
 * - POST   /api/v1/data/:modelCode          - 创建记录
 * - PUT    /api/v1/data/:modelCode/:id      - 更新记录
 * - DELETE /api/v1/data/:modelCode/:id      - 删除记录
 * - POST   /api/v1/data/:modelCode/batch    - 批量创建
 * - PUT    /api/v1/data/:modelCode/batch    - 批量更新
 * - DELETE /api/v1/data/:modelCode/batch    - 批量删除
 */
@Controller('api/v1/data')
@UseInterceptors(TenantInterceptor)
export class DynamicApiController {
  constructor(
    private readonly queryService: DynamicQueryService,
    private readonly mutationService: DynamicMutationService,
    private readonly validatorService: DynamicValidatorService,
    private readonly metaCacheService: MetaCacheService,
  ) {}

  /**
   * 分页查询
   * GET /api/v1/data/:modelCode?page=1&pageSize=20&include=relation1,relation2
   */
  @Get(':modelCode')
  async query(
    @Param('modelCode') modelCode: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('select') select?: string,
    @Query('orderBy') orderBy?: string,
    @Query('include') include?: string,
    @Query() query?: Record<string, any>,
  ) {
    // 验证模型存在
    await this.metaCacheService.getModel(modelCode);

    // 构建查询选项
    const options: QueryDto = {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      select: select ? select.split(',').map(s => s.trim()) : undefined,
      orderBy: orderBy ? this.parseOrderBy(orderBy) : undefined,
      include: include ? include.split(',').map(s => s.trim()) : undefined,
      where: this.parseWhereFromQuery(query),
    };

    const result = await this.queryService.query(modelCode, options);

    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result,
    };
  }

  /**
   * 根据 ID 查询单条记录
   * GET /api/v1/data/:modelCode/:id
   */
  @Get(':modelCode/:id')
  async findById(
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @Query('include') include?: string,
  ) {
    await this.metaCacheService.getModel(modelCode);

    const includeRelations = include ? include.split(',').map(s => s.trim()) : undefined;
    const result = await this.queryService.findByIdOrFail(modelCode, id, includeRelations);

    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result,
    };
  }

  /**
   * 创建记录
   * POST /api/v1/data/:modelCode
   */
  @Post(':modelCode')
  async create(
    @Param('modelCode') modelCode: string,
    @Body() data: Record<string, any>,
  ) {
    await this.metaCacheService.getModel(modelCode);

    // 数据验证
    await this.validatorService.validateOrFail(modelCode, data, false);

    // 数据清理
    const sanitizedData = await this.validatorService.sanitize(modelCode, data);

    const result = await this.mutationService.create(modelCode, sanitizedData);

    return {
      code: 200,
      status: 'success',
      message: '创建成功',
      result,
    };
  }

  /**
   * 批量创建记录
   * POST /api/v1/data/:modelCode/batch
   */
  @Post(':modelCode/batch')
  async createBatch(
    @Param('modelCode') modelCode: string,
    @Body() dataList: Record<string, any>[],
  ) {
    await this.metaCacheService.getModel(modelCode);

    // 批量验证和清理
    const sanitizedDataList: Record<string, any>[] = [];
    for (const data of dataList) {
      await this.validatorService.validateOrFail(modelCode, data, false);
      const sanitized = await this.validatorService.sanitize(modelCode, data);
      sanitizedDataList.push(sanitized);
    }

    const result = await this.mutationService.createMany(modelCode, sanitizedDataList);

    return {
      code: 200,
      status: 'success',
      message: '批量创建成功',
      result,
    };
  }

  /**
   * 更新记录
   * PUT /api/v1/data/:modelCode/:id
   */
  @Put(':modelCode/:id')
  async update(
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @Body() data: Record<string, any>,
  ) {
    await this.metaCacheService.getModel(modelCode);

    // 数据验证（更新模式）
    await this.validatorService.validateOrFail(modelCode, data, true);

    // 数据清理
    const sanitizedData = await this.validatorService.sanitize(modelCode, data);

    const result = await this.mutationService.update(modelCode, id, sanitizedData);

    return {
      code: 200,
      status: 'success',
      message: '更新成功',
      result,
    };
  }

  /**
   * 批量更新记录
   * PUT /api/v1/data/:modelCode/batch
   */
  @Put(':modelCode/batch')
  async updateBatch(
    @Param('modelCode') modelCode: string,
    @Body() body: { ids: string[]; data: Record<string, any> },
  ) {
    await this.metaCacheService.getModel(modelCode);

    const { ids, data } = body;

    // 数据验证
    await this.validatorService.validateOrFail(modelCode, data, true);

    // 数据清理
    const sanitizedData = await this.validatorService.sanitize(modelCode, data);

    const result = await this.mutationService.updateMany(modelCode, ids, sanitizedData);

    return {
      code: 200,
      status: 'success',
      message: '批量更新成功',
      result,
    };
  }

  /**
   * 删除记录（软删除）
   * DELETE /api/v1/data/:modelCode/:id
   */
  @Delete(':modelCode/:id')
  async delete(
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
  ) {
    await this.metaCacheService.getModel(modelCode);

    // 获取删除操作的类型
    const action = await this.metaCacheService.getAction(modelCode, 'delete');
    const actionType = action?.type || ActionType.SOFT_DELETE;

    const result = await this.mutationService.delete(modelCode, id, actionType as ActionType);

    return {
      code: 200,
      status: 'success',
      message: '删除成功',
      result,
    };
  }

  /**
   * 批量删除记录
   * DELETE /api/v1/data/:modelCode/batch
   */
  @Delete(':modelCode/batch')
  @HttpCode(HttpStatus.OK)
  async deleteBatch(
    @Param('modelCode') modelCode: string,
    @Body() body: { ids: string[] },
  ) {
    await this.metaCacheService.getModel(modelCode);

    const { ids } = body;
    const result = await this.mutationService.softDeleteMany(modelCode, ids);

    return {
      code: 200,
      status: 'success',
      message: '批量删除成功',
      result,
    };
  }

  /**
   * 执行聚合查询
   * POST /api/v1/data/:modelCode/aggregate
   */
  @Post(':modelCode/aggregate')
  @HttpCode(HttpStatus.OK)
  async aggregate(
    @Param('modelCode') modelCode: string,
    @Body() body: {
      groupBy?: string[];
      aggregates: Array<{
        function: 'count' | 'sum' | 'avg' | 'min' | 'max';
        field: string;
        alias: string;
      }>;
      where?: QueryCondition[];
    },
  ) {
    await this.metaCacheService.getModel(modelCode);

    const result = await this.queryService.aggregate(modelCode, {
      groupBy: body.groupBy,
      aggregates: body.aggregates,
      where: body.where,
    });

    return {
      code: 200,
      status: 'success',
      message: '聚合查询成功',
      result,
    };
  }

  /**
   * 检查记录是否存在
   * GET /api/v1/data/:modelCode/:id/exists
   */
  @Get(':modelCode/:id/exists')
  async exists(
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
  ) {
    await this.metaCacheService.getModel(modelCode);

    const exists = await this.queryService.existsById(modelCode, id);

    return {
      code: 200,
      status: 'success',
      message: '检查完成',
      result: { exists },
    };
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 解析排序参数
   * 格式：field1:asc,field2:desc
   */
  private parseOrderBy(orderBy: string): SortConfig[] {
    return orderBy.split(',').map(item => {
      const [field, direction] = item.trim().split(':');
      return {
        field: field.trim(),
        direction: (direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC',
      };
    });
  }

  /**
   * 从查询参数中解析 WHERE 条件
   * 格式：
   * - field=value           -> eq
   * - field__gt=value       -> gt
   * - field__gte=value      -> gte
   * - field__lt=value       -> lt
   * - field__lte=value      -> lte
   * - field__like=value     -> like
   * - field__in=v1,v2,v3    -> in
   */
  private parseWhereFromQuery(query?: Record<string, any>): QueryCondition[] | undefined {
    if (!query) {
      return undefined;
    }

    const conditions: QueryCondition[] = [];
    const excludeKeys = ['page', 'pageSize', 'select', 'orderBy', 'include'];

    for (const [key, value] of Object.entries(query)) {
      if (excludeKeys.includes(key) || value === undefined || value === '') {
        continue;
      }

      const condition = this.parseConditionFromKey(key, value);
      if (condition) {
        conditions.push(condition);
      }
    }

    return conditions.length > 0 ? conditions : undefined;
  }

  /**
   * 解析单个查询条件
   */
  private parseConditionFromKey(key: string, value: any): QueryCondition | null {
    // 检查是否包含操作符后缀
    const operatorMap: Record<string, QueryCondition['operator']> = {
      '__eq': 'eq',
      '__ne': 'ne',
      '__gt': 'gt',
      '__gte': 'gte',
      '__lt': 'lt',
      '__lte': 'lte',
      '__like': 'like',
      '__notLike': 'notLike',
      '__in': 'in',
      '__notIn': 'notIn',
      '__isNull': 'isNull',
      '__isNotNull': 'isNotNull',
    };

    for (const [suffix, operator] of Object.entries(operatorMap)) {
      if (key.endsWith(suffix)) {
        const field = key.slice(0, -suffix.length);

        // 处理特殊操作符
        if (operator === 'in' || operator === 'notIn') {
          const values = String(value).split(',').map(v => v.trim());
          return { field, operator, value: values };
        }

        if (operator === 'isNull' || operator === 'isNotNull') {
          return { field, operator };
        }

        return { field, operator, value };
      }
    }

    // 默认使用 eq 操作符
    return { field: key, operator: 'eq', value };
  }
}
