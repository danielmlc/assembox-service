import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@cs/nest-typeorm';
import { AbConfigHistory } from '../entities';

/**
 * 配置历史仓储
 */
@Injectable()
export class ConfigHistoryRepository extends BaseRepository<AbConfigHistory> {
  /**
   * 查询配置的所有历史记录
   */
  async findByConfig(configId: string): Promise<AbConfigHistory[]> {
    return this.find({
      where: {
        configId,
        isRemoved: false,
      },
      order: {
        publishVersion: 'DESC',
      },
    });
  }

  /**
   * 查询配置的指定版本历史
   */
  async findByConfigAndVersion(
    configId: string,
    publishVersion: number,
  ): Promise<AbConfigHistory> {
    return this.findOne({
      configId,
      publishVersion,
      isRemoved: false,
    } as Partial<AbConfigHistory>);
  }

  /**
   * 查询组件的所有历史记录
   */
  async findByComponent(componentId: string): Promise<AbConfigHistory[]> {
    return this.find({
      where: {
        componentId,
        isRemoved: false,
      },
      order: {
        publishedAt: 'DESC',
      },
    });
  }
}
