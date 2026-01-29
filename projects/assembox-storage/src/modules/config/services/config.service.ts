import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';

import { CacheService, OssService } from '../../../common/services';
import { ComponentRepository } from '../../component/repositories';
import { SaveConfigDraftDto, PublishConfigDto } from '../dto';
import { AbConfig, AbConfigHistory, ConfigScope, ConfigStatus } from '../entities';
import {
  ConfigRepository,
  ConfigHistoryRepository,
} from '../repositories';

/**
 * 配置管理服务
 * 处理配置的保存、发布、回滚等操作
 */
@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly configHistoryRepository: ConfigHistoryRepository,
    private readonly componentRepository: ComponentRepository,
    private readonly ossService: OssService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 保存配置草稿
   * 流程: TiDB(status=draft) + OSS(草稿路径)
   */
  async saveDraft(dto: SaveConfigDraftDto): Promise<AbConfig> {
    // 1. 验证组件是否存在
    const component = await this.componentRepository.findByFullKey(
      dto.moduleCode,
      dto.versionCode,
      dto.componentType,
      dto.componentCode,
    );

    if (!component) {
      throw new BadRequestException('组件不存在');
    }

    // 2. 检查配置是否已存在
    let config = await this.configRepository.findByComponentAndScope(
      dto.componentId,
      dto.scope,
      dto.tenant,
    );

    // 3. 上传内容到 OSS 草稿路径
    const draftOssKey = this.ossService.generateDraftKey(
      dto.moduleCode,
      dto.versionCode,
      dto.componentType,
      dto.componentCode,
      dto.scope,
      dto.tenant,
    );

    const content = JSON.stringify(dto.content, null, 2);
    const contentHash = this.ossService.calculateHash(content);
    const contentSize = Buffer.byteLength(content, 'utf-8');

    await this.ossService.upload({
      key: draftOssKey,
      content,
      contentType: 'application/json',
    });

    // 4. 保存或更新索引
    if (config) {
      // 更新现有配置
      config.ossKey = draftOssKey;
      config.contentHash = contentHash;
      config.contentSize = contentSize;
      config.status = ConfigStatus.DRAFT;
      await this.configRepository.saveOne(config);
    } else {
      // 创建新配置
      config = await this.configRepository.saveOne({
        componentId: dto.componentId,
        versionId: component.versionId,
        moduleCode: dto.moduleCode,
        versionCode: dto.versionCode,
        componentCode: dto.componentCode,
        componentType: dto.componentType,
        scope: dto.scope,
        tenant: dto.tenant,
        ossKey: draftOssKey,
        contentHash,
        contentSize,
        status: ConfigStatus.DRAFT,
        publishVersion: 0,
      } as DeepPartial<AbConfig>);
    }

    this.logger.log(`保存配置草稿: ${draftOssKey}`);
    return config;
  }

  /**
   * 发布配置
   * 流程: OSS(draft→published) → TiDB(status=published) → Redis(清除) → [Gitea异步备份]
   */
  async publishConfig(dto: PublishConfigDto): Promise<AbConfig> {
    // 1. 查询配置
    const config = await this.configRepository.findOne({ id: dto.configId });
    if (!config) {
      throw new BadRequestException('配置不存在');
    }

    // 2. 生成发布路径的 OSS Key
    const publishedOssKey = this.ossService.generatePublishedKey(
      config.moduleCode,
      config.versionCode,
      config.componentType,
      config.componentCode,
      config.scope,
      config.tenant,
    );

    // 3. 复制草稿内容到发布路径
    await this.ossService.copy(config.ossKey, publishedOssKey);

    // 4. 更新配置状态
    const newPublishVersion = config.publishVersion + 1;
    config.status = ConfigStatus.PUBLISHED;
    config.publishVersion = newPublishVersion;
    config.ossKey = publishedOssKey;
    config.publishedAt = new Date();

    await this.configRepository.saveOne(config);

    // 5. 记录发布历史
    await this.configHistoryRepository.saveOne({
      configId: config.id,
      componentId: config.componentId,
      publishVersion: newPublishVersion,
      ossKey: publishedOssKey,
      contentHash: config.contentHash,
      publishedAt: new Date(),
      // publisherId 和 publisherName 会由 BaseRepository 自动填充
    } as DeepPartial<AbConfigHistory>);

    // 6. 清除缓存
    await this.cacheService.clearConfigCache(
      config.moduleCode,
      config.versionCode,
      config.componentType,
      config.componentCode,
      config.scope,
      config.tenant,
    );

    // TODO: 7. 异步同步到 Gitea (预留)
    // await this.syncToGitea(config, newPublishVersion);

    this.logger.log(
      `发布配置: ${config.moduleCode}/${config.versionCode}/${config.componentType}/${config.componentCode} [${config.scope}] v${newPublishVersion}`,
    );

    return config;
  }

  /**
   * 批量发布配置
   * 用于一次性发布多个配置
   */
  async batchPublish(configIds: string[]): Promise<AbConfig[]> {
    const results: AbConfig[] = [];

    for (const configId of configIds) {
      try {
        const result = await this.publishConfig({ configId });
        results.push(result);
      } catch (error) {
        this.logger.error(`批量发布配置失败: ${configId}`, error.stack);
        // 继续发布其他配置
      }
    }

    return results;
  }

  /**
   * 查询配置草稿
   */
  async getDraft(
    componentId: string,
    scope: ConfigScope,
    tenant?: string,
  ): Promise<any> {
    const config = await this.configRepository.findByComponentAndScope(
      componentId,
      scope,
      tenant,
    );

    if (!config) {
      return null;
    }

    // 从 OSS 读取草稿内容
    const content = await this.ossService.downloadJson({ key: config.ossKey });
    return {
      config,
      content,
    };
  }

  /**
   * 删除配置草稿
   */
  async deleteDraft(configId: string): Promise<void> {
    const config = await this.configRepository.findOne({ id: configId });
    if (!config) {
      throw new BadRequestException('配置不存在');
    }

    if (config.status === ConfigStatus.PUBLISHED) {
      throw new BadRequestException('已发布的配置不能删除草稿');
    }

    // 软删除配置索引
    await this.configRepository.softDeletion({ id: configId });

    // 删除 OSS 文件
    await this.ossService.delete(config.ossKey);

    this.logger.log(`删除配置草稿: ${configId}`);
  }

  /**
   * 回滚配置到指定版本
   * 流程: Gitea(历史) → OSS(恢复到发布路径) → TiDB(状态) → Redis(清除)
   */
  async rollback(configId: string, targetVersion: number): Promise<AbConfig> {
    // 1. 查询配置和历史版本
    const config = await this.configRepository.findOne({ id: configId });
    if (!config) {
      throw new BadRequestException('配置不存在');
    }

    const history = await this.configHistoryRepository.findByConfigAndVersion(
      configId,
      targetVersion,
    );
    if (!history) {
      throw new BadRequestException('目标版本不存在');
    }

    // 2. 从历史版本的 OSS Key 读取内容
    const content = await this.ossService.downloadJson({ key: history.ossKey });
    if (!content) {
      throw new BadRequestException('历史版本内容不存在');
    }

    // 3. 上传到当前发布路径
    const publishedOssKey = this.ossService.generatePublishedKey(
      config.moduleCode,
      config.versionCode,
      config.componentType,
      config.componentCode,
      config.scope,
      config.tenant,
    );

    await this.ossService.upload({
      key: publishedOssKey,
      content: JSON.stringify(content, null, 2),
      contentType: 'application/json',
    });

    // 4. 更新配置索引
    const newPublishVersion = config.publishVersion + 1;
    config.publishVersion = newPublishVersion;
    config.ossKey = publishedOssKey;
    config.contentHash = history.contentHash;
    config.publishedAt = new Date();

    await this.configRepository.saveOne(config);

    // 5. 记录回滚历史
    await this.configHistoryRepository.saveOne({
      configId: config.id,
      componentId: config.componentId,
      publishVersion: newPublishVersion,
      ossKey: publishedOssKey,
      contentHash: history.contentHash,
      publishedAt: new Date(),
      gitCommitId: `rollback_from_v${targetVersion}`,
    } as DeepPartial<AbConfigHistory>);

    // 6. 清除缓存
    await this.cacheService.clearConfigCache(
      config.moduleCode,
      config.versionCode,
      config.componentType,
      config.componentCode,
      config.scope,
      config.tenant,
    );

    this.logger.log(
      `回滚配置: ${configId} v${config.publishVersion} -> v${targetVersion}`,
    );

    return config;
  }

  /**
   * 查询配置发布历史
   */
  async getHistory(configId: string): Promise<any[]> {
    return this.configHistoryRepository.findByConfig(configId);
  }

  /**
   * TODO: 同步到 Gitea (预留)
   */
  private async syncToGitea(
    config: AbConfig,
    publishVersion: number,
  ): Promise<void> {
    // 预留接口，下个版本实现
    this.logger.debug(`同步到Gitea: ${config.id} v${publishVersion}`);
  }
}
