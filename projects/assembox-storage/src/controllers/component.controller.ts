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
import { ComponentService } from '../services';
import { CreateComponentDto, UpdateComponentDto } from '../dto';
import { ComponentCategory } from '../entities';

/**
 * 组件管理控制器
 */
@Controller('api/assembox/components')
export class ComponentController {
  constructor(private readonly componentService: ComponentService) {}

  /**
   * 创建组件
   * POST /api/assembox/components
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateComponentDto) {
    return this.componentService.create(dto);
  }

  /**
   * 更新组件
   * PUT /api/assembox/components/:id
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateComponentDto) {
    return this.componentService.update(id, dto);
  }

  /**
   * 查询组件
   * GET /api/assembox/components/:id
   */
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.componentService.findById(id);
  }

  /**
   * 查询版本下所有组件
   * GET /api/assembox/components/version/:versionId
   */
  @Get('version/:versionId')
  async findByVersion(@Param('versionId') versionId: string) {
    return this.componentService.findByVersion(versionId);
  }

  /**
   * 查询版本下指定分类的组件
   * GET /api/assembox/components/version/:versionId/category/:category
   */
  @Get('version/:versionId/category/:category')
  async findByVersionAndCategory(
    @Param('versionId') versionId: string,
    @Param('category') category: ComponentCategory,
  ) {
    return this.componentService.findByVersionAndCategory(versionId, category);
  }

  /**
   * 查询版本下指定类型的组件
   * GET /api/assembox/components/version/:versionId/type/:type
   */
  @Get('version/:versionId/type/:type')
  async findByVersionAndType(
    @Param('versionId') versionId: string,
    @Param('type') type: string,
  ) {
    return this.componentService.findByVersionAndType(versionId, type);
  }

  /**
   * 根据完整键查询组件
   * GET /api/assembox/components/find
   */
  @Get('find')
  async findByFullKey(
    @Query('moduleCode') moduleCode: string,
    @Query('versionCode') versionCode: string,
    @Query('componentType') componentType: string,
    @Query('componentCode') componentCode: string,
  ) {
    return this.componentService.findByFullKey(
      moduleCode,
      versionCode,
      componentType,
      componentCode,
    );
  }

  /**
   * 删除组件
   * DELETE /api/assembox/components/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.componentService.delete(id);
  }
}
