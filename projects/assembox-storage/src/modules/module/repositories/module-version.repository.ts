import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@cs/nest-typeorm';
import { AbModuleVersion, VersionStatus } from '../entities';

/**
 * 模块版本仓储
 */
@Injectable()
export class ModuleVersionRepository extends BaseRepository<AbModuleVersion> {
  /**
   * 根据模块ID和版本号查找版本
   */
  async findByModuleAndVersion(
    moduleId: string,
    versionCode: string,
  ): Promise<AbModuleVersion> {
    return this.findOne({
      moduleId,
      versionCode,
      isRemoved: false,
    } as Partial<AbModuleVersion>);
  }

  /**
   * 查询模块的所有版本
   */
  async findByModule(moduleId: string): Promise<AbModuleVersion[]> {
    return this.findMany({
      moduleId,
      isRemoved: false,
    } as Partial<AbModuleVersion>);
  }

  /**
   * 查询模块的所有已发布版本
   */
  async findPublishedVersions(moduleId: string): Promise<AbModuleVersion[]> {
    return this.findMany({
      moduleId,
      status: VersionStatus.PUBLISHED,
      isRemoved: false,
    } as Partial<AbModuleVersion>);
  }
}
