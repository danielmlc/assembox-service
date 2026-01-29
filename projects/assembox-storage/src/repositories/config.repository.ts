import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@cs/nest-typeorm';
import { AbConfig, ConfigScope, ConfigStatus } from '../entities';

/**
 * 配置仓储
 */
@Injectable()
export class ConfigRepository extends BaseRepository<AbConfig> {
  /**
   * 根据组件ID和层级查找配置
   */
  async findByComponentAndScope(
    componentId: string,
    scope: ConfigScope,
    tenant?: string,
  ): Promise<AbConfig> {
    const condition: Partial<AbConfig> = {
      componentId,
      scope,
      isRemoved: false,
    };

    if (scope === ConfigScope.TENANT && tenant) {
      condition.tenant = tenant;
    }

    return this.findOne(condition);
  }

  /**
   * 查找已发布的配置（运行时读取）
   */
  async findPublishedByComponentAndScope(
    componentId: string,
    scope: ConfigScope,
    tenant?: string,
  ): Promise<AbConfig> {
    const condition: Partial<AbConfig> = {
      componentId,
      scope,
      status: ConfigStatus.PUBLISHED,
      isRemoved: false,
    };

    if (scope === ConfigScope.TENANT && tenant) {
      condition.tenant = tenant;
    }

    return this.findOne(condition);
  }

  /**
   * 查询组件的所有配置（包括各层级）
   */
  async findByComponent(componentId: string): Promise<AbConfig[]> {
    return this.findMany({
      componentId,
      isRemoved: false,
    } as Partial<AbConfig>);
  }

  /**
   * 查询组件的所有已发布配置
   */
  async findPublishedByComponent(componentId: string): Promise<AbConfig[]> {
    return this.findMany({
      componentId,
      status: ConfigStatus.PUBLISHED,
      isRemoved: false,
    } as Partial<AbConfig>);
  }

  /**
   * 根据完整的查询条件查找已发布的配置
   */
  async findPublishedByFullKey(
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    scope: ConfigScope,
    tenant?: string,
  ): Promise<AbConfig> {
    const condition: Partial<AbConfig> = {
      moduleCode,
      versionCode,
      componentType,
      componentCode,
      scope,
      status: ConfigStatus.PUBLISHED,
      isRemoved: false,
    };

    if (scope === ConfigScope.TENANT && tenant) {
      condition.tenant = tenant;
    }

    return this.findOne(condition);
  }
}
