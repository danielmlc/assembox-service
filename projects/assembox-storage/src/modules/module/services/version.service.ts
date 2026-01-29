import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';

import { AbModuleVersion, VersionStatus } from '../entities';
import { ModuleVersionRepository } from '../repositories';

/**
 * 版本管理服务
 */
@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);

  constructor(
    private readonly versionRepository: ModuleVersionRepository,
  ) { }

  /**
   * 创建版本
   */
  async create (
    moduleId: string,
    moduleCode: string,
    versionCode: string,
    versionName?: string,
    description?: string,
  ): Promise<AbModuleVersion> {
    // 检查版本号是否已存在
    const existing = await this.versionRepository.findByModuleAndVersion(
      moduleId,
      versionCode,
    );
    if (existing) {
      throw new BadRequestException('版本号已存在');
    }

    // 生成 Git 分支名称
    const gitBranch = `${moduleCode}/${versionCode}`;

    const version = await this.versionRepository.saveOne({
      moduleId,
      moduleCode,
      versionCode,
      versionName,
      description,
      status: VersionStatus.DRAFT,
      gitBranch,
    } as DeepPartial<AbModuleVersion>);

    this.logger.log(`创建版本: ${moduleCode}/${versionCode}`);
    return version;
  }

  /**
   * 更新版本
   */
  async update (
    id: string,
    updates: Partial<AbModuleVersion>,
  ): Promise<AbModuleVersion> {
    const version = await this.versionRepository.findOne({ id });
    if (!version) {
      throw new BadRequestException('版本不存在');
    }

    Object.assign(version, updates);
    const updated = await this.versionRepository.saveOne(version);
    this.logger.log(`更新版本: ${id}`);
    return updated;
  }

  /**
   * 发布版本
   */
  async publish (id: string): Promise<AbModuleVersion> {
    const version = await this.versionRepository.findOne({ id });
    if (!version) {
      throw new BadRequestException('版本不存在');
    }

    if (version.status === VersionStatus.PUBLISHED) {
      throw new BadRequestException('版本已发布');
    }

    version.status = VersionStatus.PUBLISHED;
    version.publishedAt = new Date();

    const updated = await this.versionRepository.saveOne(version);
    this.logger.log(`发布版本: ${version.moduleCode}/${version.versionCode}`);
    return updated;
  }

  /**
   * 废弃版本
   */
  async deprecate (id: string): Promise<AbModuleVersion> {
    const version = await this.versionRepository.findOne({ id });
    if (!version) {
      throw new BadRequestException('版本不存在');
    }

    version.status = VersionStatus.DEPRECATED;
    const updated = await this.versionRepository.saveOne(version);
    this.logger.log(`废弃版本: ${version.moduleCode}/${version.versionCode}`);
    return updated;
  }

  /**
   * 查询版本
   */
  async findById (id: string): Promise<AbModuleVersion> {
    return this.versionRepository.findOne({ id });
  }

  /**
   * 查询模块的所有版本
   */
  async findByModule (moduleId: string): Promise<AbModuleVersion[]> {
    return this.versionRepository.findByModule(moduleId);
  }

  /**
   * 查询模块的所有已发布版本
   */
  async findPublishedVersions (moduleId: string): Promise<AbModuleVersion[]> {
    return this.versionRepository.findPublishedVersions(moduleId);
  }

  /**
   * 根据模块和版本号查询
   */
  async findByModuleAndVersion (
    moduleId: string,
    versionCode: string,
  ): Promise<AbModuleVersion> {
    return this.versionRepository.findByModuleAndVersion(moduleId, versionCode);
  }

  /**
   * 删除版本
   */
  async delete (id: string): Promise<void> {
    await this.versionRepository.softDeletion({ id });
    this.logger.log(`删除版本: ${id}`);
  }
}
