import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';
import { ModuleRepository } from '../repositories';
import { AbModule } from '../entities';
import { CreateModuleDto, UpdateModuleDto } from '../dto';

/**
 * 模块管理服务
 */
@Injectable()
export class ModuleService {
  private readonly logger = new Logger(ModuleService.name);

  constructor(private readonly moduleRepository: ModuleRepository) {}

  /**
   * 创建模块
   */
  async create(dto: CreateModuleDto): Promise<AbModule> {
    // 检查模块代码是否已存在
    const existing = await this.moduleRepository.findByCode(dto.moduleCode);
    if (existing) {
      throw new BadRequestException('模块代码已存在');
    }

    const module = await this.moduleRepository.saveOne(dto as DeepPartial<AbModule>);
    this.logger.log(`创建模块: ${dto.moduleCode}`);
    return module;
  }

  /**
   * 更新模块
   */
  async update(id: string, dto: UpdateModuleDto): Promise<AbModule> {
    const module = await this.moduleRepository.findOne({ id });
    if (!module) {
      throw new BadRequestException('模块不存在');
    }

    Object.assign(module, dto);
    const updated = await this.moduleRepository.saveOne(module);
    this.logger.log(`更新模块: ${id}`);
    return updated;
  }

  /**
   * 查询模块
   */
  async findById(id: string): Promise<AbModule> {
    return this.moduleRepository.findOne({ id });
  }

  /**
   * 根据模块代码查询
   */
  async findByCode(moduleCode: string): Promise<AbModule> {
    return this.moduleRepository.findByCode(moduleCode);
  }

  /**
   * 查询所有启用的模块
   */
  async findAllEnabled(): Promise<AbModule[]> {
    return this.moduleRepository.findAllEnabled();
  }

  /**
   * 删除模块
   */
  async delete(id: string): Promise<void> {
    await this.moduleRepository.softDeletion({ id });
    this.logger.log(`删除模块: ${id}`);
  }

  /**
   * 激活版本
   */
  async activateVersion(
    moduleId: string,
    versionId: string,
    versionCode: string,
  ): Promise<AbModule> {
    const module = await this.moduleRepository.findOne({ id: moduleId });
    if (!module) {
      throw new BadRequestException('模块不存在');
    }

    module.activeVersionId = versionId;
    module.activeVersionCode = versionCode;

    const updated = await this.moduleRepository.saveOne(module);
    this.logger.log(`激活版本: ${moduleId} -> ${versionCode}`);
    return updated;
  }
}
