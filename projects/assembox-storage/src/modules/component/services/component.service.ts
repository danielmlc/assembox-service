import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';
import { ComponentRepository } from '../repositories';
import { AbComponent, ComponentCategory } from '../entities';
import { CreateComponentDto, UpdateComponentDto } from '../dto';
import { CacheService } from '../../../common/services';

/**
 * 组件管理服务
 */
@Injectable()
export class ComponentService {
  private readonly logger = new Logger(ComponentService.name);

  constructor(
    private readonly componentRepository: ComponentRepository,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 创建组件
   */
  async create(dto: CreateComponentDto): Promise<AbComponent> {
    // 检查组件代码是否已存在
    const existing = await this.componentRepository.findByVersionAndCode(
      dto.versionId,
      dto.componentCode,
    );
    if (existing) {
      throw new BadRequestException('组件代码已存在');
    }

    const component = await this.componentRepository.saveOne(dto as DeepPartial<AbComponent>);

    // 清除组件列表缓存
    await this.cacheService.clearComponentsCache(
      dto.moduleCode,
      dto.versionCode,
    );

    this.logger.log(`创建组件: ${dto.componentCode}`);
    return component;
  }

  /**
   * 更新组件
   */
  async update(id: string, dto: UpdateComponentDto): Promise<AbComponent> {
    const component = await this.componentRepository.findOne({ id });
    if (!component) {
      throw new BadRequestException('组件不存在');
    }

    Object.assign(component, dto);
    const updated = await this.componentRepository.saveOne(component);

    // 清除组件列表缓存
    await this.cacheService.clearComponentsCache(
      component.moduleCode,
      component.versionCode,
    );

    this.logger.log(`更新组件: ${id}`);
    return updated;
  }

  /**
   * 查询组件
   */
  async findById(id: string): Promise<AbComponent> {
    return this.componentRepository.findOne({ id });
  }

  /**
   * 根据完整键查询组件
   */
  async findByFullKey(
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
  ): Promise<AbComponent> {
    return this.componentRepository.findByFullKey(
      moduleCode,
      versionCode,
      componentType,
      componentCode,
    );
  }

  /**
   * 查询版本下所有组件
   */
  async findByVersion(versionId: string): Promise<AbComponent[]> {
    return this.componentRepository.findByVersion(versionId);
  }

  /**
   * 查询版本下指定分类的组件
   */
  async findByVersionAndCategory(
    versionId: string,
    category: ComponentCategory,
  ): Promise<AbComponent[]> {
    // 尝试从缓存获取
    const moduleCode = await this.getModuleCode(versionId);
    const versionCode = await this.getVersionCode(versionId);

    if (moduleCode && versionCode) {
      const cached = await this.cacheService.getComponents(
        moduleCode,
        versionCode,
        category,
      );
      if (cached) {
        return cached;
      }
    }

    // 从数据库查询
    const components = await this.componentRepository.findByVersionAndCategory(
      versionId,
      category,
    );

    // 写入缓存
    if (moduleCode && versionCode) {
      await this.cacheService.setComponents(
        moduleCode,
        versionCode,
        components,
        category,
      );
    }

    return components;
  }

  /**
   * 查询版本下指定类型的组件
   */
  async findByVersionAndType(
    versionId: string,
    componentType: string,
  ): Promise<AbComponent[]> {
    return this.componentRepository.findByVersionAndType(versionId, componentType);
  }

  /**
   * 删除组件
   */
  async delete(id: string): Promise<void> {
    const component = await this.componentRepository.findOne({ id });
    if (!component) {
      throw new BadRequestException('组件不存在');
    }

    await this.componentRepository.softDeletion({ id });

    // 清除组件列表缓存
    await this.cacheService.clearComponentsCache(
      component.moduleCode,
      component.versionCode,
    );

    this.logger.log(`删除组件: ${id}`);
  }

  /**
   * 辅助方法：获取模块代码
   */
  private async getModuleCode(versionId: string): Promise<string | null> {
    const component = await this.componentRepository.findOne({ versionId });
    return component?.moduleCode || null;
  }

  /**
   * 辅助方法：获取版本代码
   */
  private async getVersionCode(versionId: string): Promise<string | null> {
    const component = await this.componentRepository.findOne({ versionId });
    return component?.versionCode || null;
  }
}
