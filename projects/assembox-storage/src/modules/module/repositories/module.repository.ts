import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@cs/nest-typeorm';
import { AbModule } from '../entities';

/**
 * 模块仓储
 */
@Injectable()
export class ModuleRepository extends BaseRepository<AbModule> {
  /**
   * 根据模块代码查找模块
   */
  async findByCode(moduleCode: string): Promise<AbModule> {
    return this.findOne({
      moduleCode,
      isRemoved: false,
    } as Partial<AbModule>);
  }

  /**
   * 查询所有启用的模块
   */
  async findAllEnabled(): Promise<AbModule[]> {
    return this.findMany({
      isEnable: true,
      isRemoved: false,
    } as Partial<AbModule>);
  }
}
