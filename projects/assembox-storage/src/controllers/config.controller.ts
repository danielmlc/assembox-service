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
  ConfigService,
  ConfigResolverService,
  ComponentService,
} from '../services';
import { SaveConfigDraftDto, PublishConfigDto, LoadConfigDto } from '../dto';
import { ConfigScope } from '../entities';

/**
 * 配置管理控制器
 * 提供配置的增删改查、发布、回滚等API
 */
@Controller('api/assembox/configs')
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly configResolverService: ConfigResolverService,
    private readonly componentService: ComponentService,
  ) {}

  /**
   * 加载配置（运行时读取）
   * GET /api/assembox/configs/load
   */
  @Get('load')
  async loadConfig(@Query() query: LoadConfigDto) {
    return this.configResolverService.loadConfig({
      moduleCode: query.moduleCode,
      versionCode: query.versionCode,
      componentType: query.componentType,
      componentCode: query.componentCode,
      tenant: query.tenant,
    });
  }

  /**
   * 批量加载配置
   * POST /api/assembox/configs/batch-load
   */
  @Post('batch-load')
  async batchLoadConfigs(
    @Body()
    body: {
      tenant: string;
      moduleCode: string;
      versionCode: string;
      components: Array<{ type: string; code: string }>;
    },
  ) {
    const results = await this.configResolverService.batchLoadConfigs(
      body.tenant,
      body.moduleCode,
      body.versionCode,
      body.components,
    );

    // 将 Map 转换为对象返回
    return Object.fromEntries(results);
  }

  /**
   * 保存配置草稿
   * POST /api/assembox/configs/draft
   */
  @Post('draft')
  @HttpCode(HttpStatus.CREATED)
  async saveDraft(@Body() dto: SaveConfigDraftDto) {
    return this.configService.saveDraft(dto);
  }

  /**
   * 查询配置草稿
   * GET /api/assembox/configs/:componentId/draft
   */
  @Get(':componentId/draft')
  async getDraft(
    @Param('componentId') componentId: string,
    @Query('scope') scope: ConfigScope,
    @Query('tenant') tenant?: string,
  ) {
    return this.configService.getDraft(componentId, scope, tenant);
  }

  /**
   * 删除配置草稿
   * DELETE /api/assembox/configs/draft/:configId
   */
  @Delete('draft/:configId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDraft(@Param('configId') configId: string) {
    await this.configService.deleteDraft(configId);
  }

  /**
   * 发布配置
   * POST /api/assembox/configs/publish
   */
  @Post('publish')
  async publishConfig(@Body() dto: PublishConfigDto) {
    return this.configService.publishConfig(dto);
  }

  /**
   * 批量发布配置
   * POST /api/assembox/configs/batch-publish
   */
  @Post('batch-publish')
  async batchPublish(@Body() body: { configIds: string[] }) {
    return this.configService.batchPublish(body.configIds);
  }

  /**
   * 回滚配置
   * POST /api/assembox/configs/:configId/rollback
   */
  @Post(':configId/rollback')
  async rollback(
    @Param('configId') configId: string,
    @Body() body: { targetVersion: number },
  ) {
    return this.configService.rollback(configId, body.targetVersion);
  }

  /**
   * 查询配置发布历史
   * GET /api/assembox/configs/:configId/history
   */
  @Get(':configId/history')
  async getHistory(@Param('configId') configId: string) {
    return this.configService.getHistory(configId);
  }
}
