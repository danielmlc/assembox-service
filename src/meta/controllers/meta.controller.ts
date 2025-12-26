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
} from '@nestjs/common';
import {
  ModelService,
  FieldService,
  RelationService,
  ActionService,
  MetaCacheService,
} from '../services';
import {
  CreateModelDto,
  UpdateModelDto,
  CreateFieldDto,
  UpdateFieldDto,
  CreateRelationDto,
  UpdateRelationDto,
  CreateActionDto,
  UpdateActionDto,
} from '../../shared/interfaces';
import { ModelStatus } from '../../shared/constants/aseembox.constants';

/**
 * 元数据管理控制器
 * 提供模型、字段、关联、操作的 CRUD API
 */
@Controller('api/v1/meta')
export class MetaController {
  constructor(
    private readonly modelService: ModelService,
    private readonly fieldService: FieldService,
    private readonly relationService: RelationService,
    private readonly actionService: ActionService,
    private readonly metaCacheService: MetaCacheService,
  ) {}

  // ==================== 模型管理 ====================

  /**
   * 创建模型
   */
  @Post('models')
  async createModel(@Body() dto: CreateModelDto) {
    const model = await this.modelService.create(dto);
    return {
      code: 200,
      status: 'success',
      message: '模型创建成功',
      result: model,
    };
  }

  /**
   * 获取模型列表
   */
  @Get('models')
  async listModels(@Query('status') status?: ModelStatus) {
    const models = await this.modelService.findAll(status);
    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result: models,
    };
  }

  /**
   * 根据代码获取模型
   */
  @Get('models/code/:code')
  async getModelByCode(@Param('code') code: string) {
    const model = await this.metaCacheService.getModel(code);
    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result: model,
    };
  }

  /**
   * 根据 ID 获取模型
   */
  @Get('models/:id')
  async getModelById(@Param('id') id: string) {
    const model = await this.metaCacheService.getModelById(id);
    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result: model,
    };
  }

  /**
   * 获取完整的运行时模型（包含字段、关联、操作）
   */
  @Get('models/code/:code/full')
  async getRuntimeModel(@Param('code') code: string) {
    const runtimeModel = await this.metaCacheService.getRuntimeModel(code);
    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result: runtimeModel,
    };
  }

  /**
   * 更新模型
   */
  @Put('models/:id')
  async updateModel(@Param('id') id: string, @Body() dto: UpdateModelDto) {
    const model = await this.modelService.update(id, dto);
    // 清除缓存
    await this.metaCacheService.invalidateModel(model.code);
    return {
      code: 200,
      status: 'success',
      message: '模型更新成功',
      result: model,
    };
  }

  /**
   * 发布模型
   */
  @Post('models/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publishModel(@Param('id') id: string) {
    const model = await this.modelService.publish(id);
    await this.metaCacheService.invalidateModel(model.code);
    return {
      code: 200,
      status: 'success',
      message: '模型发布成功',
      result: model,
    };
  }

  /**
   * 废弃模型
   */
  @Post('models/:id/deprecate')
  @HttpCode(HttpStatus.OK)
  async deprecateModel(@Param('id') id: string) {
    const model = await this.modelService.deprecate(id);
    await this.metaCacheService.invalidateModel(model.code);
    return {
      code: 200,
      status: 'success',
      message: '模型已废弃',
      result: model,
    };
  }

  /**
   * 删除模型
   */
  @Delete('models/:id')
  async deleteModel(@Param('id') id: string) {
    // 先获取模型信息用于清除缓存
    const model = await this.modelService.findById(id);
    if (model) {
      await this.modelService.delete(id);
      await this.metaCacheService.invalidateModelFull(id, model.code);
    }
    return {
      code: 200,
      status: 'success',
      message: '模型删除成功',
    };
  }

  // ==================== 字段管理 ====================

  /**
   * 为模型创建字段
   */
  @Post('models/:modelId/fields')
  async createField(@Param('modelId') modelId: string, @Body() dto: CreateFieldDto) {
    const field = await this.fieldService.create(modelId, dto);
    await this.metaCacheService.invalidateFields(modelId);
    return {
      code: 200,
      status: 'success',
      message: '字段创建成功',
      result: field,
    };
  }

  /**
   * 批量创建字段
   */
  @Post('models/:modelId/fields/batch')
  async createFields(@Param('modelId') modelId: string, @Body() dtos: CreateFieldDto[]) {
    const fields = await this.fieldService.createMany(modelId, dtos);
    await this.metaCacheService.invalidateFields(modelId);
    return {
      code: 200,
      status: 'success',
      message: '字段批量创建成功',
      result: fields,
    };
  }

  /**
   * 获取模型的所有字段
   */
  @Get('models/:modelId/fields')
  async getFields(@Param('modelId') modelId: string) {
    const fields = await this.metaCacheService.getFields(modelId);
    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result: fields,
    };
  }

  /**
   * 更新字段
   */
  @Put('fields/:id')
  async updateField(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    const field = await this.fieldService.update(id, dto);
    await this.metaCacheService.invalidateFields(field.modelId);
    return {
      code: 200,
      status: 'success',
      message: '字段更新成功',
      result: field,
    };
  }

  /**
   * 删除字段
   */
  @Delete('fields/:id')
  async deleteField(@Param('id') id: string) {
    const field = await this.fieldService.findById(id);
    if (field) {
      await this.fieldService.delete(id);
      await this.metaCacheService.invalidateFields(field.modelId);
    }
    return {
      code: 200,
      status: 'success',
      message: '字段删除成功',
    };
  }

  // ==================== 关联管理 ====================

  /**
   * 创建关联
   */
  @Post('models/:modelId/relations')
  async createRelation(
    @Param('modelId') modelId: string,
    @Body() dto: CreateRelationDto,
  ) {
    const relation = await this.relationService.create(modelId, dto);
    await this.metaCacheService.invalidateRelations(relation.sourceModelId);
    return {
      code: 200,
      status: 'success',
      message: '关联创建成功',
      result: relation,
    };
  }

  /**
   * 获取模型的所有关联
   */
  @Get('models/:modelId/relations')
  async getRelations(@Param('modelId') modelId: string) {
    const relations = await this.metaCacheService.getRelations(modelId);
    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result: relations,
    };
  }

  /**
   * 根据模型代码获取关联
   */
  @Get('models/code/:code/relations')
  async getRelationsByModelCode(@Param('code') code: string) {
    const relations = await this.metaCacheService.getRelationsByModelCode(code);
    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result: relations,
    };
  }

  /**
   * 更新关联
   */
  @Put('relations/:id')
  async updateRelation(@Param('id') id: string, @Body() dto: UpdateRelationDto) {
    const relation = await this.relationService.update(id, dto);
    await this.metaCacheService.invalidateRelations(relation.sourceModelId);
    return {
      code: 200,
      status: 'success',
      message: '关联更新成功',
      result: relation,
    };
  }

  /**
   * 删除关联
   */
  @Delete('relations/:id')
  async deleteRelation(@Param('id') id: string) {
    const relation = await this.relationService.findById(id);
    if (relation) {
      await this.relationService.delete(id);
      await this.metaCacheService.invalidateRelations(relation.sourceModelId);
    }
    return {
      code: 200,
      status: 'success',
      message: '关联删除成功',
    };
  }

  // ==================== 操作管理 ====================

  /**
   * 为模型创建操作
   */
  @Post('models/:modelId/actions')
  async createAction(@Param('modelId') modelId: string, @Body() dto: CreateActionDto) {
    const action = await this.actionService.create(modelId, dto);
    await this.metaCacheService.invalidateActions(modelId);
    return {
      code: 200,
      status: 'success',
      message: '操作创建成功',
      result: action,
    };
  }

  /**
   * 为模型创建默认操作（CRUD）
   */
  @Post('models/:modelId/actions/defaults')
  async createDefaultActions(@Param('modelId') modelId: string) {
    const actions = await this.actionService.createDefaultActions(modelId);
    await this.metaCacheService.invalidateActions(modelId);
    return {
      code: 200,
      status: 'success',
      message: '默认操作创建成功',
      result: actions,
    };
  }

  /**
   * 获取模型的所有操作
   */
  @Get('models/:modelId/actions')
  async getActions(@Param('modelId') modelId: string) {
    const actions = await this.metaCacheService.getActions(modelId);
    return {
      code: 200,
      status: 'success',
      message: '查询成功',
      result: actions,
    };
  }

  /**
   * 更新操作
   */
  @Put('actions/:id')
  async updateAction(@Param('id') id: string, @Body() dto: UpdateActionDto) {
    const action = await this.actionService.update(id, dto);
    await this.metaCacheService.invalidateActions(action.modelId);
    return {
      code: 200,
      status: 'success',
      message: '操作更新成功',
      result: action,
    };
  }

  /**
   * 启用/禁用操作
   */
  @Post('actions/:id/toggle')
  @HttpCode(HttpStatus.OK)
  async toggleAction(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    const action = await this.actionService.setEnabled(id, enabled);
    await this.metaCacheService.invalidateActions(action.modelId);
    return {
      code: 200,
      status: 'success',
      message: enabled ? '操作已启用' : '操作已禁用',
      result: action,
    };
  }

  /**
   * 删除操作
   */
  @Delete('actions/:id')
  async deleteAction(@Param('id') id: string) {
    const action = await this.actionService.findById(id);
    if (action) {
      await this.actionService.delete(id);
      await this.metaCacheService.invalidateActions(action.modelId);
    }
    return {
      code: 200,
      status: 'success',
      message: '操作删除成功',
    };
  }

  // ==================== 缓存管理 ====================

  /**
   * 清除所有元数据缓存
   */
  @Post('cache/invalidate')
  @HttpCode(HttpStatus.OK)
  async invalidateAllCache() {
    await this.metaCacheService.invalidateAll();
    return {
      code: 200,
      status: 'success',
      message: '缓存已清除',
    };
  }

  /**
   * 清除指定模型的缓存
   */
  @Post('cache/invalidate/model/:code')
  @HttpCode(HttpStatus.OK)
  async invalidateModelCache(@Param('code') code: string) {
    await this.metaCacheService.invalidateModel(code);
    return {
      code: 200,
      status: 'success',
      message: `模型 ${code} 缓存已清除`,
    };
  }
}
