import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ModuleService, VersionService } from '../services';
import { CreateModuleDto, UpdateModuleDto } from '../dto';

/**
 * 模块管理控制器
 */
@Controller('api/assembox/modules')
export class ModuleController {
  constructor(
    private readonly moduleService: ModuleService,
    private readonly versionService: VersionService,
  ) {}

  /**
   * 创建模块
   * POST /api/assembox/modules
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateModuleDto) {
    return this.moduleService.create(dto);
  }

  /**
   * 更新模块
   * PUT /api/assembox/modules/:id
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateModuleDto) {
    return this.moduleService.update(id, dto);
  }

  /**
   * 查询模块
   * GET /api/assembox/modules/:id
   */
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.moduleService.findById(id);
  }

  /**
   * 根据模块代码查询
   * GET /api/assembox/modules/code/:code
   */
  @Get('code/:code')
  async findByCode(@Param('code') code: string) {
    return this.moduleService.findByCode(code);
  }

  /**
   * 查询所有启用的模块
   * GET /api/assembox/modules
   */
  @Get()
  async findAll() {
    return this.moduleService.findAllEnabled();
  }

  /**
   * 删除模块
   * DELETE /api/assembox/modules/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.moduleService.delete(id);
  }

  /**
   * 激活版本
   * POST /api/assembox/modules/:id/activate-version
   */
  @Post(':id/activate-version')
  async activateVersion(
    @Param('id') id: string,
    @Body() body: { versionId: string; versionCode: string },
  ) {
    return this.moduleService.activateVersion(id, body.versionId, body.versionCode);
  }

  /**
   * 查询模块的所有版本
   * GET /api/assembox/modules/:id/versions
   */
  @Get(':id/versions')
  async getVersions(@Param('id') id: string) {
    return this.versionService.findByModule(id);
  }

  /**
   * 查询模块的已发布版本
   * GET /api/assembox/modules/:id/versions/published
   */
  @Get(':id/versions/published')
  async getPublishedVersions(@Param('id') id: string) {
    return this.versionService.findPublishedVersions(id);
  }

  /**
   * 创建版本
   * POST /api/assembox/modules/:id/versions
   */
  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  async createVersion(
    @Param('id') id: string,
    @Body()
    body: {
      moduleCode: string;
      versionCode: string;
      versionName?: string;
      description?: string;
    },
  ) {
    return this.versionService.create(
      id,
      body.moduleCode,
      body.versionCode,
      body.versionName,
      body.description,
    );
  }

  /**
   * 发布版本
   * POST /api/assembox/modules/:moduleId/versions/:versionId/publish
   */
  @Post(':moduleId/versions/:versionId/publish')
  async publishVersion(@Param('versionId') versionId: string) {
    return this.versionService.publish(versionId);
  }

  /**
   * 废弃版本
   * POST /api/assembox/modules/:moduleId/versions/:versionId/deprecate
   */
  @Post(':moduleId/versions/:versionId/deprecate')
  async deprecateVersion(@Param('versionId') versionId: string) {
    return this.versionService.deprecate(versionId);
  }
}
